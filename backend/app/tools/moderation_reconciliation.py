"""
Moderation Reconciliation Engine:
Handles automatic marks re-grading, test scorecard adjustment,
activity-aware Elo refund / compensation, and student in-app notifications
when question reports are approved (Quarantined or Key Fixed).
"""
import sqlite3
import json
import uuid
import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

def _parse_iso(ts_str: Optional[str]) -> Optional[datetime.datetime]:
    if not ts_str:
        return None
    try:
        # Handle trailing Z or offsets
        clean = ts_str.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt
    except Exception:
        return None


def reconcile_quarantined_question(
    question_id: str,
    rivals_conn: Optional[sqlite3.Connection] = None,
    jee_conn: Optional[sqlite3.Connection] = None,
    resolver: str = "Admin"
) -> Dict[str, Any]:
    """
    Applies the full reconciliation pipeline when a defective question is Quarantined:
    1. Test Marks (JEE Main NTA Dropped Question rule):
       - Drops question penalty (-1 -> 0) and awards full bonus (+4 marks) on affected test sheets.
       - Recalculates total score and accuracy in both jee.db and rivals.db.
    2. Elo Rating Compensation (Time/Activity-Aware):
       - If reviewed within 7 days or <= 30 subsequent questions: Full refund of lost Elo delta (+14 Elo).
       - If reviewed weeks later (> 30 subsequent questions): Activity-dampened compensation + 50 RP Question Bounty.
    3. In-App Notification:
       - Sends student a notification explaining the score upgrade and Elo reimbursement.
    """
    summary = {
        "question_id": question_id,
        "action": "QUARANTINE",
        "jee_tests_updated": 0,
        "rivals_rooms_updated": 0,
        "users_compensated": 0,
        "total_elo_refunded": 0.0,
        "notifications_sent": 0
    }
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    now_str = now_dt.isoformat()

    # -------------------------------------------------------------
    # 1. RIVALS.DB RECONCILIATION
    # -------------------------------------------------------------
    close_rconn = False
    if rivals_conn is None:
        try:
            from backend.app.database import get_connection
            rivals_conn = get_connection()
            close_rconn = True
        except Exception:
            rivals_db_path = Path(__file__).resolve().parent.parent.parent / "storage" / "rivals.db"
            if rivals_db_path.exists():
                rivals_conn = sqlite3.connect(str(rivals_db_path))
                close_rconn = True

    if rivals_conn and isinstance(rivals_conn, sqlite3.Connection):
        rivals_conn.row_factory = sqlite3.Row

    if rivals_conn:
        rc = rivals_conn.cursor()
        rc.execute("""
            CREATE TABLE IF NOT EXISTS user_notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT DEFAULT '{}',
                is_read INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            );
        """)

        # Fetch question metadata
        rc.execute("SELECT id, subject, chapter, text, correct_answer FROM questions WHERE id = ?", (question_id,))
        q_row = rc.fetchone()
        subject = q_row["subject"] if q_row else "General"
        chapter = q_row["chapter"] if q_row else "General"

        # A. Room / Mock Test Marks Reconciliation
        rc.execute("SELECT id, code, question_ids, negative_marking, base_correct_score FROM rooms WHERE question_ids LIKE ?", (f"%{question_id}%",))
        affected_rooms = [dict(r) for r in rc.fetchall()]
        for rm in affected_rooms:
            try:
                raw_qids = json.loads(rm["question_ids"]) if isinstance(rm["question_ids"], str) else (rm["question_ids"] or [])
            except Exception:
                raw_qids = []

            if question_id not in raw_qids:
                continue

            q_idx = raw_qids.index(question_id)
            neg_mark = abs(float(rm.get("negative_marking") or 1.0))
            base_score = float(rm.get("base_correct_score") or 4.0)

            # Check participants
            rc.execute("SELECT user_id, answers, score, marks FROM room_participants WHERE room_id = ?", (rm["id"],))
            for p in rc.fetchall():
                p_uid = p["user_id"]
                raw_ans = p["answers"] or "{}"
                try:
                    p_answers = json.loads(raw_ans) if isinstance(raw_ans, str) else (raw_ans or {})
                except Exception:
                    p_answers = {}

                # Student's submitted answer for this question
                user_ans = p_answers.get(str(q_idx)) or p_answers.get(question_id)
                # If they didn't get it right (either wrong answer or skipped):
                # NTA Dropped question rule: full marks (+4) awarded, -1 penalty removed.
                score_boost = base_score + (neg_mark if user_ans else 0.0)
                if isinstance(user_ans, dict):
                    user_ans["correct"] = True
                    user_ans["is_dropped"] = True
                    user_ans["delta_marks"] = 4.0
                    p_answers[question_id] = user_ans
                else:
                    p_answers[question_id] = {
                        "selected": user_ans if user_ans else "SKIPPED",
                        "correct": True,
                        "is_dropped": True,
                        "delta_marks": 4.0
                    }
                auth_marks = 0.0
                for a_v in p_answers.values():
                    if isinstance(a_v, dict):
                        dm = a_v.get("delta_marks")
                        if dm is not None:
                            auth_marks += float(dm)
                        elif a_v.get("correct") or a_v.get("is_dropped"):
                            auth_marks += 4.0
                        elif a_v.get("selected") not in ("NONE", "SKIPPED", "", None):
                            auth_marks -= 1.0

                rc.execute("""
                    UPDATE room_participants
                    SET score = score + ?, marks = ?, answers = ?
                    WHERE room_id = ? AND user_id = ?
                """, (int(score_boost), auth_marks, json.dumps(p_answers), rm["id"], p_uid))
                summary["rivals_rooms_updated"] += 1

        # B. Elo Rating Compensation & Notifications
        # Identify users who attempted this question or reported it
        rc.execute("SELECT DISTINCT user_id, elo_delta, is_correct, created_at FROM activity_log WHERE question_id = ?", (question_id,))
        attempt_logs = [dict(r) for r in rc.fetchall()]

        # Also get reporters from question_reports
        rc.execute("SELECT DISTINCT reporter_id, created_at FROM question_reports WHERE question_id = ? AND reporter_id IS NOT NULL", (question_id,))
        reporters = [dict(r) for r in rc.fetchall()]

        user_attempt_map = {}
        for att in attempt_logs:
            uid = att["user_id"]
            if uid and not uid.startswith("bot_"):
                user_attempt_map[uid] = att

        for rep in reporters:
            uid = rep["reporter_id"]
            if uid and uid not in user_attempt_map:
                user_attempt_map[uid] = {
                    "user_id": uid,
                    "elo_delta": 0.0,
                    "is_correct": 0,
                    "created_at": rep["created_at"]
                }

        for uid, att_info in user_attempt_map.items():
            # Calculate questions solved since this attempt
            att_time = _parse_iso(att_info.get("created_at"))
            questions_since = 0
            days_elapsed = 0
            if att_time:
                days_elapsed = (now_dt - att_time).total_seconds() / 86400.0
                rc.execute("SELECT COUNT(*) as cnt FROM activity_log WHERE user_id = ? AND created_at > ?", (uid, att_info.get("created_at")))
                cnt_row = rc.fetchone()
                questions_since = cnt_row["cnt"] if cnt_row else 0

            # Determine Elo refund & RP bounty
            lost_elo = abs(float(att_info.get("elo_delta") or 0.0))
            if lost_elo == 0.0:
                lost_elo = 12.0  # standard baseline for flawed question

            if questions_since <= 30 or days_elapsed <= 7.0:
                # RECENT REVIEW: 100% full rating restitution
                refund_elo = round(lost_elo, 1)
                bonus_rp = 25
                comp_type = "Full Rating Compensation"
            else:
                # WEEKS LATER: Elo naturally self-corrected over volume.
                # Award activity-dampened compensation + higher Contributor Bounty
                refund_elo = max(4.0, round(lost_elo * 0.5, 1))
                bonus_rp = 50
                comp_type = "Activity-Adjusted Compensation + Bounty"

            # Check if this user was a reporter who already received provisional Elo refund
            rc.execute("""
                SELECT provisional_elo_refunded FROM question_reports
                WHERE question_id = ? AND reporter_id = ? AND provisional_elo_refunded > 0
            """, (question_id, uid))
            rep_prov_row = rc.fetchone()
            prov_already_given = float(rep_prov_row["provisional_elo_refunded"] or 0.0) if rep_prov_row else 0.0

            # Only refund remaining difference if refund_elo > prov_already_given to avoid double credit
            net_refund_elo = max(0.0, round(refund_elo - prov_already_given, 1))

            # Apply to user profile
            subj_col = None
            if subject.lower() == "physics":
                subj_col = "physics_elo"
            elif subject.lower() == "chemistry":
                subj_col = "chemistry_elo"
            elif subject.lower() in ("mathematics", "maths"):
                subj_col = "math_elo"

            if subj_col:
                rc.execute(f"""
                    UPDATE users
                    SET overall_elo = max(100.0, overall_elo + ?),
                        {subj_col} = max(100.0, {subj_col} + ?),
                        weekly_rp = weekly_rp + ?
                    WHERE id = ?
                """, (net_refund_elo, net_refund_elo, bonus_rp, uid))
            else:
                rc.execute("""
                    UPDATE users
                    SET overall_elo = max(100.0, overall_elo + ?),
                        weekly_rp = weekly_rp + ?
                    WHERE id = ?
                """, (net_refund_elo, bonus_rp, uid))

            # Send In-App Notification
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            if prov_already_given > 0:
                notif_title = f"🏆 Report Verified: {chapter}"
                extra_elo_str = f" (+{net_refund_elo:.1f} additional Elo)" if net_refund_elo > 0 else ""
                notif_msg = (
                    f"Question #{question_id[:8]} defect was confirmed & quarantined! "
                    f"Your provisional credit (+{prov_already_given:.1f} Elo) is now locked in permanently{extra_elo_str}, "
                    f"plus +{bonus_rp} RP Question Bounty awarded to your profile. Thank you for protecting the question bank!"
                )
            else:
                notif_title = f"🚩 Report Verified: {chapter}"
                notif_msg = (
                    f"Question {question_id[:8]} was confirmed defective & quarantined. "
                    f"Full bonus marks awarded on test sheets, and +{refund_elo} Elo & +{bonus_rp} RP "
                    f"credited to your profile ({comp_type}). Thank you for keeping our question bank accurate!"
                )
            notif_details = json.dumps({
                "question_id": question_id,
                "chapter": chapter,
                "refund_elo": refund_elo,
                "provisional_locked": prov_already_given,
                "net_refund_elo": net_refund_elo,
                "bonus_rp": bonus_rp,
                "action": "QUARANTINE"
            })
            try:
                rc.execute("""
                    INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                    VALUES (?, ?, 'REPORT_RESOLVED', ?, ?, ?, 0, ?)
                """, (notif_id, uid, notif_title, notif_msg, notif_details, now_str))
                summary["notifications_sent"] += 1
            except Exception:
                pass

            summary["users_compensated"] += 1
            summary["total_elo_refunded"] += refund_elo

        rivals_conn.commit()
        if close_rconn:
            rivals_conn.close()

    # -------------------------------------------------------------
    # 2. JEE.DB RECONCILIATION
    # -------------------------------------------------------------
    close_jconn = False
    if jee_conn is None:
        try:
            from jee.models.database import get_connection
            jee_conn = get_connection()
            close_jconn = True
        except Exception:
            jee_conn = None

    if jee_conn:
        jc = jee_conn.cursor()

        # Update test attempts: grant full bonus marks and remove penalty
        jc.execute("""
            SELECT test_id, question_number, user_answer, is_correct, marks_obtained, student_note
            FROM attempts
            WHERE question_id = ?
        """, (question_id,))
        attempts = jc.fetchall()
        affected_test_ids = set()

        for att in attempts:
            t_id = att[0]
            marks_curr = float(att[4] or 0.0)
            if marks_curr < 4.0 or att[3] == 0:
                bonus_note = "[Moderation: Question Quarantined & Dropped - Full Bonus (+4) Awarded]"
                curr_note = att[5] or ""
                new_note = f"{curr_note} {bonus_note}".strip()
                jc.execute("""
                    UPDATE attempts
                    SET is_correct = 1, marks_obtained = 4.0, student_note = ?
                    WHERE test_id = ? AND question_id = ?
                """, (new_note, t_id, question_id))
                affected_test_ids.add(t_id)

        # Recalculate test totals
        for t_id in affected_test_ids:
            jc.execute("""
                SELECT SUM(marks_obtained), SUM(is_correct), COUNT(*)
                FROM attempts
                WHERE test_id = ?
            """, (t_id,))
            tot_row = jc.fetchone()
            if tot_row:
                new_score = float(tot_row[0] or 0.0)
                num_correct = int(tot_row[1] or 0)
                num_q = max(1, int(tot_row[2] or 1))
                new_acc = round((num_correct / num_q) * 100.0, 1)
                jc.execute("""
                    UPDATE tests
                    SET score = ?, accuracy = ?
                    WHERE id = ?
                """, (new_score, new_acc, t_id))
                summary["jee_tests_updated"] += 1

        # Practice attempts Elo reimbursement
        jc.execute("""
            SELECT subject, chapter, elo_delta
            FROM practice_attempts
            WHERE question_id = ? AND elo_delta < 0
        """, (question_id,))
        for p_att in jc.fetchall():
            lost_delta = abs(float(p_att[2] or 0.0))
            ch = p_att[1]
            if lost_delta > 0:
                try:
                    jc.execute("""
                        UPDATE user_ratings
                        SET current_elo = current_elo + ?
                        WHERE rating_type = 'chapter' AND identifier = ?
                    """, (lost_delta, ch))
                    jc.execute("""
                        UPDATE user_ratings
                        SET current_elo = current_elo + ?
                        WHERE rating_type = 'overall' AND identifier = 'student'
                    """, (lost_delta,))
                except Exception:
                    pass

        jee_conn.commit()
        if close_jconn:
            jee_conn.close()

    return summary


def reconcile_fixed_question(
    question_id: str,
    new_correct_answer: str,
    rivals_conn: Optional[sqlite3.Connection] = None,
    jee_conn: Optional[sqlite3.Connection] = None,
    resolver: str = "Admin"
) -> Dict[str, Any]:
    """
    Applies the full reconciliation pipeline when a Question Answer Key is Fixed:
    1. Re-grades test sheets against the verified key.
       - If the student picked the new correct key, upgrades -1 (or 0) -> +4 (+5 mark swing).
       - Recalculates test score and accuracy in both databases.
    2. Recalibrates Elo Ratings:
       - Awards positive Elo delta to students who gave the correct answer.
    3. In-App Notification:
       - Alerts the student that their score has been upgraded to match the revised key.
    """
    clean_key = new_correct_answer.strip().upper()
    summary = {
        "question_id": question_id,
        "action": "FIX_KEY",
        "new_correct_answer": clean_key,
        "jee_tests_updated": 0,
        "rivals_rooms_updated": 0,
        "users_compensated": 0,
        "total_elo_awarded": 0.0,
        "notifications_sent": 0
    }
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    now_str = now_dt.isoformat()

    # 1. RIVALS.DB RECONCILIATION
    close_rconn = False
    if rivals_conn is None:
        try:
            from backend.app.database import get_connection
            rivals_conn = get_connection()
            close_rconn = True
        except Exception:
            rivals_db_path = Path(__file__).resolve().parent.parent.parent / "storage" / "rivals.db"
            if rivals_db_path.exists():
                rivals_conn = sqlite3.connect(str(rivals_db_path))
                close_rconn = True

    if rivals_conn and isinstance(rivals_conn, sqlite3.Connection):
        rivals_conn.row_factory = sqlite3.Row

    if rivals_conn:
        rc = rivals_conn.cursor()
        rc.execute("""
            CREATE TABLE IF NOT EXISTS user_notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT DEFAULT '{}',
                is_read INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            );
        """)
        rc.execute("SELECT id, subject, chapter FROM questions WHERE id = ?", (question_id,))
        q_row = rc.fetchone()
        subject = q_row["subject"] if q_row else "General"
        chapter = q_row["chapter"] if q_row else "General"

        # Rooms scoring & participant reconciliation
        rc.execute("SELECT id, code, question_ids, negative_marking, base_correct_score FROM rooms WHERE question_ids LIKE ?", (f"%{question_id}%",))
        room_affected_users = set()
        for rm in rc.fetchall():
            try:
                raw_qids = json.loads(rm["question_ids"]) if isinstance(rm["question_ids"], str) else (rm["question_ids"] or [])
            except Exception:
                raw_qids = []

            if question_id not in raw_qids:
                continue

            q_idx = raw_qids.index(question_id)
            neg_mark = abs(float(rm.get("negative_marking") or 1.0))
            base_score = float(rm.get("base_correct_score") or 4.0)
            rm_code = rm.get("code") or rm.get("id")

            rc.execute("SELECT user_id, answers FROM room_participants WHERE room_id = ?", (rm["id"],))
            for p in rc.fetchall():
                p_uid = p["user_id"]
                raw_ans = p["answers"] or "{}"
                try:
                    p_answers = json.loads(raw_ans) if isinstance(raw_ans, str) else (raw_ans or {})
                except Exception:
                    p_answers = {}

                raw_val = p_answers.get(str(q_idx)) or p_answers.get(question_id)
                if isinstance(raw_val, dict):
                    user_ans = str(raw_val.get("selected") or "").strip().upper()
                else:
                    user_ans = str(raw_val or "").strip().upper()

                if user_ans == clean_key:
                    # Student had the correct key all along!
                    upgrade_delta = base_score + neg_mark
                    if isinstance(raw_val, dict):
                        raw_val["correct"] = True
                        raw_val["delta_marks"] = base_score
                        raw_val["delta_score"] = int(base_score)
                        p_answers[question_id] = raw_val

                    auth_marks = 0.0
                    for a_v in p_answers.values():
                        if isinstance(a_v, dict):
                            dm = a_v.get("delta_marks")
                            if dm is not None:
                                auth_marks += float(dm)
                            elif a_v.get("correct") or a_v.get("is_dropped"):
                                auth_marks += 4.0
                            elif a_v.get("selected") not in ("NONE", "SKIPPED", "", None):
                                auth_marks -= 1.0

                    rc.execute("""
                        UPDATE room_participants
                        SET score = score + ?, marks = ?, answers = ?
                        WHERE room_id = ? AND user_id = ?
                    """, (int(upgrade_delta), auth_marks, json.dumps(p_answers), rm["id"], p_uid))
                    summary["rivals_rooms_updated"] += 1
                    if p_uid and not str(p_uid).startswith("bot_"):
                        room_affected_users.add((p_uid, rm_code, upgrade_delta))

        # B. User Identification for Rating / RP Bounty / Notifications
        # 1. Fetch reporters from question_reports (CRITICAL: reporters must ALWAYS be compensated & notified!)
        rc.execute("""
            SELECT DISTINCT id, reporter_id, reporter_username, provisional_elo_refunded, provisional_subject, created_at
            FROM question_reports
            WHERE question_id = ? AND reporter_id IS NOT NULL
        """, (question_id,))
        reporters = [dict(r) for r in rc.fetchall()]

        # 2. Fetch users from activity_log
        rc.execute("""
            SELECT DISTINCT user_id, created_at, elo_delta, is_correct
            FROM activity_log
            WHERE question_id = ?
        """, (question_id,))
        attempt_logs = [dict(r) for r in rc.fetchall()]

        # Unified user map to prevent double-awarding: uid -> user_info
        target_users = {}
        for rep in reporters:
            uid = rep["reporter_id"]
            if uid and not str(uid).startswith("bot_"):
                target_users[uid] = {
                    "is_reporter": True,
                    "provisional_elo": float(rep.get("provisional_elo_refunded") or 0.0),
                    "created_at": rep.get("created_at") or now_str
                }

        for att in attempt_logs:
            uid = att["user_id"]
            if uid and not str(uid).startswith("bot_"):
                if uid not in target_users:
                    target_users[uid] = {
                        "is_reporter": False,
                        "provisional_elo": 0.0,
                        "created_at": att.get("created_at") or now_str
                    }

        for p_uid, rm_code, up_marks in room_affected_users:
            if p_uid not in target_users:
                target_users[p_uid] = {
                    "is_reporter": False,
                    "provisional_elo": 0.0,
                    "created_at": now_str,
                    "room_code": rm_code,
                    "up_marks": up_marks
                }
            else:
                target_users[p_uid]["room_code"] = rm_code
                target_users[p_uid]["up_marks"] = up_marks

        for uid, uinfo in target_users.items():
            # Check if notification already delivered for this resolution to avoid duplicate awarding
            rc.execute("""
                SELECT id FROM user_notifications
                WHERE user_id = ? AND type = 'REPORT_RESOLVED' AND details LIKE ?
            """, (uid, f"%{question_id}%"))
            if rc.fetchone():
                continue

            prov_already_given = uinfo.get("provisional_elo", 0.0)
            earned_elo = 16.0
            bonus_rp = 35
            net_earned_elo = max(0.0, round(earned_elo - prov_already_given, 1))

            subj_col = None
            if subject:
                s_low = subject.lower()
                if "chem" in s_low:
                    subj_col = "chemistry_elo"
                elif "math" in s_low:
                    subj_col = "math_elo"
                elif "phys" in s_low:
                    subj_col = "physics_elo"

            # Award net Elo and RP bounty
            if subj_col and net_earned_elo > 0:
                rc.execute(f"""
                    UPDATE users
                    SET overall_elo = max(100.0, overall_elo + ?),
                        {subj_col} = max(100.0, {subj_col} + ?),
                        weekly_rp = weekly_rp + ?
                    WHERE id = ?
                """, (net_earned_elo, net_earned_elo, bonus_rp, uid))
            elif net_earned_elo > 0:
                rc.execute("""
                    UPDATE users
                    SET overall_elo = max(100.0, overall_elo + ?),
                        weekly_rp = weekly_rp + ?
                    WHERE id = ?
                """, (net_earned_elo, bonus_rp, uid))
            else:
                rc.execute("""
                    UPDATE users
                    SET weekly_rp = weekly_rp + ?
                    WHERE id = ?
                """, (bonus_rp, uid))

            # In-App Notification
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            if prov_already_given > 0:
                notif_title = f"🏆 Answer Key Corrected: {chapter}"
                extra_elo_str = f" (+{net_earned_elo:.1f} additional Elo)" if net_earned_elo > 0 else ""
                notif_msg = (
                    f"Question #{question_id[:8]} official answer key was corrected to '{clean_key}'! "
                    f"Your report was verified: your provisional credit (+{prov_already_given:.1f} Elo) is permanently locked in{extra_elo_str}, "
                    f"plus +{bonus_rp} RP Question Bounty awarded. Thank you for your sharp eye!"
                )
            elif uinfo.get("is_reporter"):
                notif_title = f"🏆 Report Verified: {chapter}"
                notif_msg = (
                    f"Question #{question_id[:8]} official answer key was corrected to '{clean_key}' following your report! "
                    f"+{earned_elo:.1f} Elo and +{bonus_rp} RP Question Bounty have been credited to your profile. "
                    f"Thank you for keeping questions accurate!"
                )
            else:
                notif_title = f"✓ Answer Key Corrected: {chapter}"
                rm_info = f" in Room #{uinfo['room_code']}" if uinfo.get("room_code") else ""
                notif_msg = (
                    f"Question #{question_id[:8]} official answer key was corrected to '{clean_key}'. "
                    f"Your attempt{rm_info} was upgraded to Correct (+4 marks), and +{earned_elo:.1f} Elo + {bonus_rp} RP "
                    f"Question Bounty awarded to your profile."
                )

            notif_details = json.dumps({
                "question_id": question_id,
                "chapter": chapter,
                "subject": subject,
                "new_key": clean_key,
                "earned_elo": earned_elo,
                "net_earned_elo": net_earned_elo,
                "provisional_locked": prov_already_given,
                "bonus_rp": bonus_rp,
                "action": "FIX_KEY"
            })

            try:
                rc.execute("""
                    INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                    VALUES (?, ?, 'REPORT_RESOLVED', ?, ?, ?, 0, ?)
                """, (notif_id, uid, notif_title, notif_msg, notif_details, now_str))
                summary["notifications_sent"] += 1
            except Exception as ne:
                print(f"[RECONCILIATION] Error inserting notification for {uid}: {ne}")

            summary["users_compensated"] += 1
            summary["total_elo_awarded"] += (earned_elo if prov_already_given == 0 else net_earned_elo)

        rivals_conn.commit()
        if close_rconn:
            try:
                rivals_conn.close()
            except Exception:
                pass

    # 2. JEE.DB RECONCILIATION
    close_jconn = False
    if jee_conn is None:
        try:
            from jee.models.database import get_connection
            jee_conn = get_connection()
            close_jconn = True
        except Exception:
            jee_conn = None

    if jee_conn:
        jc = jee_conn.cursor()
        jc.execute("""
            SELECT test_id, user_answer, is_correct, marks_obtained, student_note
            FROM attempts
            WHERE question_id = ?
        """, (question_id,))
        attempts = jc.fetchall()
        affected_tests = set()

        for att in attempts:
            t_id = att[0]
            u_ans = str(att[1] or "").strip().upper()
            if u_ans == clean_key:
                note = f"[Moderation: Key updated to {clean_key} - Marks Awarded]"
                curr_note = att[4] or ""
                new_note = f"{curr_note} {note}".strip()
                jc.execute("""
                    UPDATE attempts
                    SET is_correct = 1, marks_obtained = 4.0, student_note = ?
                    WHERE test_id = ? AND question_id = ?
                """, (new_note, t_id, question_id))
                affected_tests.add(t_id)

        for t_id in affected_tests:
            jc.execute("""
                SELECT SUM(marks_obtained), SUM(is_correct), COUNT(*)
                FROM attempts
                WHERE test_id = ?
            """, (t_id,))
            tot_row = jc.fetchone()
            if tot_row:
                new_score = float(tot_row[0] or 0.0)
                num_corr = int(tot_row[1] or 0)
                num_q = max(1, int(tot_row[2] or 1))
                new_acc = round((num_corr / num_q) * 100.0, 1)
                jc.execute("""
                    UPDATE tests
                    SET score = ?, accuracy = ?
                    WHERE id = ?
                """, (new_score, new_acc, t_id))
                summary["jee_tests_updated"] += 1

        jee_conn.commit()
        if close_jconn:
            jee_conn.close()

    return summary
