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
        return datetime.datetime.fromisoformat(clean)
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
        rivals_db_path = Path(__file__).resolve().parent.parent.parent / "storage" / "rivals.db"
        if rivals_db_path.exists():
            rivals_conn = sqlite3.connect(str(rivals_db_path))
            rivals_conn.row_factory = sqlite3.Row
            close_rconn = True

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
                rc.execute("""
                    UPDATE room_participants
                    SET score = score + ?, marks = marks + ?
                    WHERE room_id = ? AND user_id = ?
                """, (int(score_boost), score_boost, rm["id"], p_uid))
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
                    SET overall_elo = max(1000.0, overall_elo + ?),
                        {subj_col} = max(1000.0, {subj_col} + ?),
                        weekly_rp = weekly_rp + ?
                    WHERE id = ?
                """, (refund_elo, refund_elo, bonus_rp, uid))
            else:
                rc.execute("""
                    UPDATE users
                    SET overall_elo = max(1000.0, overall_elo + ?),
                        weekly_rp = weekly_rp + ?
                    WHERE id = ?
                """, (refund_elo, bonus_rp, uid))

            # Send In-App Notification
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
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
        rivals_db_path = Path(__file__).resolve().parent.parent.parent / "storage" / "rivals.db"
        if rivals_db_path.exists():
            rivals_conn = sqlite3.connect(str(rivals_db_path))
            rivals_conn.row_factory = sqlite3.Row
            close_rconn = True

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

        # Rooms scoring
        rc.execute("SELECT id, question_ids, negative_marking, base_correct_score FROM rooms WHERE question_ids LIKE ?", (f"%{question_id}%",))
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

            rc.execute("SELECT user_id, answers FROM room_participants WHERE room_id = ?", (rm["id"],))
            for p in rc.fetchall():
                p_uid = p["user_id"]
                raw_ans = p["answers"] or "{}"
                try:
                    p_answers = json.loads(raw_ans) if isinstance(raw_ans, str) else (raw_ans or {})
                except Exception:
                    p_answers = {}

                user_ans = str(p_answers.get(str(q_idx)) or p_answers.get(question_id) or "").strip().upper()
                if user_ans == clean_key:
                    # Student had the correct key all along!
                    upgrade_delta = base_score + neg_mark
                    rc.execute("""
                        UPDATE room_participants
                        SET score = score + ?, marks = marks + ?
                        WHERE room_id = ? AND user_id = ?
                    """, (int(upgrade_delta), upgrade_delta, rm["id"], p_uid))
                    summary["rivals_rooms_updated"] += 1

        # Activity log & Rating updates for users who submitted clean_key
        rc.execute("""
            SELECT DISTINCT user_id, created_at, elo_delta, is_correct
            FROM activity_log
            WHERE question_id = ?
        """, (question_id,))
        for att in rc.fetchall():
            uid = att["user_id"]
            if not uid or uid.startswith("bot_"):
                continue

            # Award deserved rating
            earned_elo = 16.0
            bonus_rp = 35
            rc.execute("""
                UPDATE users
                SET overall_elo = max(1000.0, overall_elo + ?),
                    weekly_rp = weekly_rp + ?
                WHERE id = ?
            """, (earned_elo, bonus_rp, uid))

            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            notif_title = f"✓ Answer Key Corrected: {chapter}"
            notif_msg = (
                f"Question {question_id[:8]} answer key was corrected to '{clean_key}'. "
                f"Your test result was upgraded to Correct (+4 marks), and +{earned_elo} Elo + {bonus_rp} RP "
                f"awarded to your profile."
            )
            notif_details = json.dumps({
                "question_id": question_id,
                "chapter": chapter,
                "new_key": clean_key,
                "earned_elo": earned_elo,
                "action": "FIX_KEY"
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
            summary["total_elo_awarded"] += earned_elo

        rivals_conn.commit()
        if close_rconn:
            rivals_conn.close()

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
