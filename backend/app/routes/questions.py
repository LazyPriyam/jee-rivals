import json
import datetime
import random
import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Depends, Header, status

from backend.app.models import QuestionOut, QuestionSolutionOut, QuestionOptionModel, QuestionReportRequest, FixQuestionKeyRequest, QuestionReportVoteRequest
from backend.app.database import get_connection
from backend.app.auth import get_current_user, get_optional_user
from backend.app.config import ADMIN_SYNC_TOKEN

def verify_admin_sync(x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden. Admin privileges required. Manage reports and moderation via 'jee gui'."
        )
    return True

import re

LATEX_N_CMDS = {
    'eq', 'e', 'abla', 'atural', 'earrow', 'eg', 'otin', 'ot', 'u', 'warrow', 'ewline', 'orm',
    'ull', 'exists', 'subseteq', 'supseteq', 'parallel', 'less', 'gtr', 'leq', 'geq', 'sim', 'cong'
}

def clean_escapes(text: str) -> str:
    if not text:
        return text
    text = text.replace('\\r\\n', '\n').replace('\r\n', '\n')
    def repl_n(m):
        full = m.group(0)
        after = m.group(1)
        if after.lower() in LATEX_N_CMDS:
            return full
        return '\n' + after
    text = re.sub(r'\\{1,2}n([a-zA-Z]*)', repl_n, text)
    text = re.sub(r"\\{1,2}'", "'", text)
    text = re.sub(r'\\{1,2}"', '"', text)
    return text

router = APIRouter(prefix="/api/questions", tags=["Questions"])

def row_to_question_out(row: dict) -> QuestionOut:
    raw_opts = row.get("options")
    try:
        opts_data = json.loads(raw_opts) if isinstance(raw_opts, str) else (raw_opts or [])
    except Exception:
        opts_data = []

    if not isinstance(opts_data, list):
        opts_data = []

    options = []
    for idx, o in enumerate(opts_data):
        if isinstance(o, dict):
            key = str(o.get("key") or chr(ord('A') + idx))
            text = clean_escapes(str(o.get("text") or ""))
            options.append(QuestionOptionModel(key=key, text=text))
        elif isinstance(o, str):
            key = chr(ord('A') + idx) if idx < 26 else str(idx + 1)
            options.append(QuestionOptionModel(key=key, text=clean_escapes(o)))

    raw_urls = row.get("diagram_urls")
    try:
        urls = json.loads(raw_urls) if isinstance(raw_urls, str) else (raw_urls or [])
    except Exception:
        urls = []

    from pathlib import Path
    clean_urls = []
    for u in urls:
        if u:
            u_str = str(u)
            if u_str.startswith("/diagrams/") or u_str.startswith("http://") or u_str.startswith("https://"):
                clean_urls.append(u_str)
            else:
                fn = Path(u_str.replace("\\", "/")).name
                clean_urls.append(f"/diagrams/{fn}")

    passage_text_clean = clean_escapes(row.get("passage_text")) if row.get("passage_text") else None
    is_comp = bool(passage_text_clean or row.get("passage_id") or (row.get("question_type") and str(row.get("question_type")).upper() == "COMPREHENSION"))

    raw_text = clean_escapes(str(row.get("text") or ""))

    return QuestionOut(
        id=str(row.get("id") or ""),
        subject=str(row.get("subject") or "Mixed"),
        unit=str(row.get("unit") or "General"),
        chapter=str(row.get("chapter") or "General"),
        question_type=str(row.get("question_type") or "SINGLE_CHOICE"),
        text=raw_text,
        options=options,
        has_diagram=bool(row.get("has_diagram")),
        diagram_urls=clean_urls,
        difficulty_tier=str(row.get("difficulty_tier") or "MEDIUM"),
        elo_rating=int(row.get("elo_rating") if row.get("elo_rating") is not None else 1500),
        passage_id=str(row.get("passage_id")) if row.get("passage_id") else None,
        passage_title=row.get("passage_title") or ("Comprehension Passage" if is_comp else None),
        passage_text=passage_text_clean,
        subquestion_index=row.get("subquestion_index"),
        subquestion_total=row.get("subquestion_total"),
        is_comprehension=is_comp
    )


_DAILY_CHALLENGE_CACHE: dict = {}

@router.get("/chapters")
def get_chapters():
    from backend.app.tools.question_cache import get_all_questions_cached
    all_qs = get_all_questions_cached()
    agg = {}
    for r in all_qs:
        subj = r.get("subject") or "Unknown"
        unit = r.get("unit") or "General"
        chap = r.get("chapter") or "General"
        key = (subj, unit, chap)
        agg[key] = agg.get(key, 0) + 1

    sorted_items = sorted(agg.items(), key=lambda x: (x[0][0], x[0][1], -x[1]))
    grouped = {}
    for (subj, unit, chap), cnt in sorted_items:
        if subj not in grouped:
            grouped[subj] = []
        grouped[subj].append({
            "chapter": chap,
            "unit": unit,
            "count": cnt
        })
    return grouped


@router.get("/syllabus/master")
def get_master_syllabus():
    """
    Returns the full canonical syllabus tree (Subject -> Units -> Chapters)
    augmented with live question counts from the in-memory question bank cache.
    """
    from backend.app.tools.question_cache import get_all_questions_cached
    counts = {}
    for q in get_all_questions_cached():
        ch = q.get("chapter")
        if ch:
            counts[ch] = counts.get(ch, 0) + 1

    from backend.app.tools.jee_syllabus import JEE_SYLLABUS

    result = {}
    for subj, units in JEE_SYLLABUS.items():
        result[subj] = []
        for u in units:
            u_obj = {
                "unit": u["unit"],
                "chapters": [
                    {
                        "name": ch,
                        "question_count": counts.get(ch, 0)
                    }
                    for ch in u["chapters"]
                ]
            }
            result[subj].append(u_obj)

    return result


from backend.app.tools.question_verifier import audit_and_heal_question


@router.get("/daily", response_model=List[QuestionOut])
def get_daily_challenge():
    """Generates 5 synchronized daily challenge questions based on today's UTC date seed."""
    today_seed = datetime.datetime.utcnow().strftime("%Y%m%d")
    cached_daily = _DAILY_CHALLENGE_CACHE.get(today_seed)
    if cached_daily:
        return cached_daily

    rnd = random.Random(today_seed)
    from backend.app.tools.question_cache import get_all_questions_cached
    rows = list(get_all_questions_cached())
    if not rows:
        return []

    # Deterministically shuffle all rows with today's seed
    rnd.shuffle(rows)

    verified_questions = []
    for r in rows:
        is_valid, healed_q, _ = audit_and_heal_question(r)
        if is_valid and healed_q:
            verified_questions.append(row_to_question_out(healed_q))
            if len(verified_questions) >= 5:
                break

    _DAILY_CHALLENGE_CACHE.clear()
    _DAILY_CHALLENGE_CACHE[today_seed] = verified_questions
    return verified_questions


@router.get("/random", response_model=List[QuestionOut])
def get_random_questions(
    subject: Optional[str] = Query(None),
    chapter: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    count: int = Query(5, ge=1, le=50)
):
    from backend.app.tools.question_cache import get_all_questions_cached
    all_qs = get_all_questions_cached()

    subj_f = subject.strip().lower() if subject and subject.lower() not in ("all", "any") else None
    chap_f = chapter.strip().lower() if chapter and chapter.lower() not in ("all", "any") else None
    diff_f = difficulty.strip().upper() if difficulty and difficulty.upper() not in ("ALL", "MIXED") else None

    candidates = [
        q for q in all_qs
        if (not subj_f or (q.get("subject") or "").strip().lower() == subj_f)
        and (not chap_f or (q.get("chapter") or "").strip().lower() == chap_f)
        and (not diff_f or (q.get("difficulty_tier") or "MEDIUM").strip().upper() == diff_f)
    ]

    fetch_limit = min(len(candidates), min(max(count * 3, 15), 150))
    rows = random.sample(candidates, fetch_limit) if fetch_limit > 0 else []

    verified_questions = []
    for r in rows:
        is_valid, healed_q, _ = audit_and_heal_question(r)
        if is_valid and healed_q:
            verified_questions.append(row_to_question_out(healed_q))
            if len(verified_questions) >= count:
                break

    return verified_questions


@router.get("/{question_id}", response_model=QuestionOut)
def get_question(question_id: str):
    from backend.app.tools.question_cache import get_question_cached
    r = get_question_cached(question_id)
    if not r:
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
        row = c.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Question not found.")
        r = dict(row)

    if r.get("validation_status") == "QUARANTINED":
        raise HTTPException(status_code=404, detail="Question is currently quarantined due to defects.")

    is_valid, healed_q, _ = audit_and_heal_question(r)
    if not is_valid or not healed_q:
        raise HTTPException(status_code=404, detail="Question failed structural verification and was quarantined.")

    return row_to_question_out(healed_q)


@router.get("/{question_id}/solution", response_model=QuestionSolutionOut)
def get_question_solution(question_id: str, user: dict = Depends(get_current_user)):
    from backend.app.tools.question_cache import get_question_cached
    r = get_question_cached(question_id)
    if not r:
        conn = get_connection()
        c = conn.cursor()
        c.execute("SELECT id, correct_answer, solution_text, key_formulas, common_pitfall FROM questions WHERE id = ?", (question_id,))
        row = c.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Question not found.")
        r = dict(row)

    raw_formulas = r.get("key_formulas")
    try:
        formulas = json.loads(raw_formulas) if isinstance(raw_formulas, str) else (raw_formulas or [])
    except Exception:
        formulas = []

    sol_text = r.get("solution_text")
    return QuestionSolutionOut(
        id=r["id"],
        correct_answer=r["correct_answer"],
        solution_text=clean_escapes(sol_text) if sol_text else None,
        key_formulas=formulas,
        common_pitfall=clean_escapes(r.get("common_pitfall")),
        derived_on_demand=bool(sol_text and sol_text.strip())
    )


@router.post("/{question_id}/derive", response_model=QuestionSolutionOut)
def derive_question_solution(
    question_id: str,
    force: bool = Query(False),
    user: dict = Depends(get_current_user)
):
    try:
        from backend.app.tools.on_demand_derivation import derive_question_on_demand
        result = derive_question_on_demand(question_id, force=force)
        return QuestionSolutionOut(
            id=result["id"],
            correct_answer=result["correct_answer"],
            solution_text=result.get("solution_text"),
            key_formulas=result.get("key_formulas") or [],
            common_pitfall=result.get("common_pitfall"),
            derived_on_demand=True,
            provider=result.get("provider")
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to derive solution on demand: {str(e)}")


@router.post("/{question_id}/report")
def report_question(question_id: str, report_data: QuestionReportRequest, user: Optional[dict] = Depends(get_optional_user)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, subject, chapter FROM questions WHERE id = ?", (question_id,))
    q_row = c.fetchone()
    if not q_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found.")

    report_id = f"rep_{uuid.uuid4().hex[:12]}"
    now = datetime.datetime.utcnow().isoformat()
    reporter_id = user["id"] if user else "guest"
    reporter_name = user.get("username", "Guest Aspirant") if user else "Guest Aspirant"

    provisional_elo = 0.0
    rep_subject = q_row["subject"] if q_row else "General"
    rep_chapter = q_row["chapter"] if q_row else "General"

    # Only authenticated registered users receive rating adjustments and personal notifications
    if user and user.get("id") and user["id"] != "guest":
        uid = user["id"]

        # Ensure notifications table exists
        c.execute("""
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

        # 1. Check if user already has an active pending report for this question that received provisional Elo
        c.execute("""
            SELECT id, provisional_elo_refunded FROM question_reports
            WHERE question_id = ? AND reporter_id = ? AND status = 'PENDING' AND provisional_elo_refunded > 0
        """, (question_id, uid))
        prior_prov = c.fetchone()

        if not prior_prov:
            # 2. Check activity log for user's most recent attempt on this question
            c.execute("""
                SELECT elo_delta, is_correct, subject, chapter, mode FROM activity_log
                WHERE user_id = ? AND question_id = ?
                ORDER BY created_at DESC LIMIT 1
            """, (uid, question_id))
            att_row = c.fetchone()
            att = dict(att_row) if att_row else None

            if att:
                if att.get("subject"):
                    rep_subject = att["subject"]
                if att.get("chapter"):
                    rep_chapter = att["chapter"]

                # If question was marked wrong or user suffered an Elo penalty
                if att.get("is_correct") == 0 or float(att.get("elo_delta") or 0.0) < 0:
                    lost_val = abs(float(att.get("elo_delta") or 0.0))
                    # In ADAPTIVE mode, elo_delta is the user rating drop (e.g. -14.5).
                    # In MOCK_TEST, ROOM, or general test modes, elo_delta in activity_log
                    # is question difficulty adjustment, so any incorrect test attempt receives
                    # standard full +15.0 provisional Elo restitution.
                    if att.get("mode") == "ADAPTIVE" and lost_val >= 5.0:
                        provisional_elo = round(lost_val, 1)
                    else:
                        provisional_elo = 15.0
            else:
                # 3. Check active adaptive session history
                c.execute("""
                    SELECT history, subject FROM adaptive_sessions
                    WHERE user_id = ? AND status = 'IN_PROGRESS'
                    ORDER BY id DESC LIMIT 1
                """, (uid,))
                as_row = c.fetchone()
                found_in_session = False
                if as_row:
                    as_dict = dict(as_row)
                    if as_dict.get("subject"):
                        rep_subject = as_dict["subject"]
                    try:
                        raw_h = as_dict.get("history")
                        h_list = json.loads(raw_h) if isinstance(raw_h, str) else (raw_h or [])
                        for item in reversed(h_list):
                            if item.get("question_id") == question_id:
                                if item.get("chapter"):
                                    rep_chapter = item.get("chapter")
                                if not item.get("is_correct") or float(item.get("elo_delta") or 0.0) < 0:
                                    lost_val = abs(float(item.get("elo_delta") or 0.0))
                                    provisional_elo = round(lost_val if lost_val >= 5.0 else 15.0, 1)
                                found_in_session = True
                                break
                    except Exception:
                        pass

                if not found_in_session:
                    # 4. Check room participants if attempted in an arena, mock test, or test room
                    c.execute("""
                        SELECT rp.answers, r.id FROM room_participants rp
                        JOIN rooms r ON rp.room_id = r.id
                        WHERE rp.user_id = ? AND r.question_ids LIKE ?
                        ORDER BY rp.rowid DESC LIMIT 1
                    """, (uid, f"%{question_id}%"))
                    rp_row = c.fetchone()
                    if rp_row:
                        rp_dict = dict(rp_row)
                        raw_ans = rp_dict.get("answers") or "{}"
                        try:
                            p_answers = json.loads(raw_ans) if isinstance(raw_ans, str) else raw_ans
                        except Exception:
                            p_answers = {}
                        q_ans = p_answers.get(question_id)
                        if q_ans:
                            if isinstance(q_ans, dict):
                                is_corr = bool(q_ans.get("correct"))
                                user_sel = q_ans.get("selected")
                            else:
                                is_corr = False
                                user_sel = str(q_ans)
                            if user_sel and user_sel not in ("NONE", "SKIPPED", "") and not is_corr:
                                provisional_elo = 15.0
                        else:
                            # Question was part of this test
                            provisional_elo = 15.0
                    elif report_data.reason == "WRONG_ANSWER":
                        # General fallback for questions reported as wrong key
                        provisional_elo = 15.0

            # Apply provisional restoration if elo lost
            if provisional_elo > 0:
                subj_col = None
                if "chem" in rep_subject.lower():
                    subj_col = "chemistry_elo"
                elif "math" in rep_subject.lower():
                    subj_col = "math_elo"
                elif "phys" in rep_subject.lower():
                    subj_col = "physics_elo"

                if subj_col:
                    c.execute(f"""
                        UPDATE users
                        SET overall_elo = max(100.0, overall_elo + ?),
                            {subj_col} = max(100.0, {subj_col} + ?)
                        WHERE id = ?
                    """, (provisional_elo, provisional_elo, uid))
                else:
                    c.execute("""
                        UPDATE users
                        SET overall_elo = max(100.0, overall_elo + ?)
                        WHERE id = ?
                    """, (provisional_elo, uid))

                # Update user_chapter_elo if chapter is known
                if rep_chapter and rep_chapter != "General":
                    try:
                        c.execute("""
                            UPDATE user_chapter_elo
                            SET elo = max(100.0, elo + ?)
                            WHERE user_id = ? AND chapter = ?
                        """, (provisional_elo, uid, rep_chapter))
                    except Exception:
                        pass

                # Log activity refund
                c.execute("""
                    INSERT INTO activity_log (
                        user_id, question_id, subject, chapter, is_correct,
                        time_spent_seconds, elo_delta, mode, created_at
                    ) VALUES (?, ?, ?, ?, 1, 0, ?, 'PROVISIONAL_REPORT_REFUND', ?)
                """, (uid, question_id, rep_subject, rep_chapter, provisional_elo, now))

                # In-App Notification
                notif_id = f"notif_{uuid.uuid4().hex[:12]}"
                notif_title = f"🛡️ Provisional Elo Restored (+{provisional_elo:.1f} Elo)"
                notif_msg = (
                    f"You flagged Question #{question_id[:8]} ({rep_chapter}) for {report_data.reason}. "
                    f"As a provisional safeguard, +{provisional_elo:.1f} Elo has been credited to your rating pending human review. "
                    f"If the defect is confirmed, your rating is locked in permanently with a bounty. "
                    f"If the report is dismissed, this provisional credit will be reverted."
                )
                details_json = json.dumps({
                    "question_id": question_id,
                    "chapter": rep_chapter,
                    "subject": rep_subject,
                    "provisional_elo": provisional_elo,
                    "action": "PROVISIONAL_REFUND"
                })
                c.execute("""
                    INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                    VALUES (?, ?, 'PROVISIONAL_ELO_RESTORED', ?, ?, ?, 0, ?)
                """, (notif_id, uid, notif_title, notif_msg, details_json, now))

    # Check if this report is from a multiplayer test room
    room_code = report_data.room_code.strip().upper() if report_data.room_code else None
    participant_ids: List[str] = []
    is_multiplayer = False

    if room_code:
        c.execute("SELECT id FROM rooms WHERE code = ?", (room_code,))
        r_row = c.fetchone()
        if r_row:
            r_id = r_row[0] if isinstance(r_row, (list, tuple)) else r_row["id"]
            c.execute("SELECT user_id FROM room_participants WHERE room_id = ?", (r_id,))
            p_rows = c.fetchall()
            participant_ids = [
                row[0] if isinstance(row, (list, tuple)) else (row.get("user_id") if hasattr(row, "get") else row["user_id"])
                for row in p_rows
            ]
            if len(participant_ids) > 1:
                is_multiplayer = True

    votes = {}
    consensus_status = "PENDING"
    if is_multiplayer:
        # Reporter's vote is recorded as AGREE
        votes[reporter_id] = {
            "vote": "AGREE",
            "username": reporter_name,
            "voted_at": now
        }
        consensus_status = "VOTING_IN_PROGRESS"

        # Dispatch vote request notification to all other contenders
        for other_uid in participant_ids:
            if other_uid != reporter_id:
                notif_id = f"notif_{uuid.uuid4().hex[:12]}"
                notif_title = f"🗳️ Question Dispute Vote: Room #{room_code}"
                notif_msg = (
                    f"{reporter_name} reported Question #{question_id[:8]} ({report_data.reason}) in Room #{room_code}. "
                    f"As a fellow contender, your vote is required in Test Analysis to confirm or dispute this report."
                )
                details_json = json.dumps({
                    "report_id": report_id,
                    "question_id": question_id,
                    "room_code": room_code,
                    "action": "ROOM_REPORT_VOTE"
                })
                c.execute("""
                    INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                    VALUES (?, ?, 'ROOM_REPORT_VOTE_REQUEST', ?, ?, ?, 0, ?)
                """, (notif_id, other_uid, notif_title, notif_msg, details_json, now))

    # Insert question report record
    c.execute("""
        INSERT INTO question_reports (
            id, question_id, reporter_id, reporter_username, reason, notes,
            status, created_at, provisional_elo_refunded, provisional_subject,
            room_code, votes, participant_ids, consensus_status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)
    """, (
        report_id, question_id, reporter_id, reporter_name,
        report_data.reason, report_data.notes or "", now,
        provisional_elo, rep_subject,
        room_code, json.dumps(votes), json.dumps(participant_ids), consensus_status
    ))
    conn.commit()
    conn.close()

    if is_multiplayer:
        success_msg = f"Report submitted for Contender Review in Room #{room_code}. Other test participants have been requested to cast their vote."
    elif provisional_elo > 0:
        success_msg = f"Report submitted. +{provisional_elo:.1f} Elo provisionally restored pending review."
    else:
        success_msg = "Report submitted successfully."

    return {
        "success": True,
        "message": success_msg,
        "report_id": report_id,
        "provisional_elo_refunded": provisional_elo,
        "is_multiplayer": is_multiplayer,
        "room_code": room_code,
        "consensus_status": consensus_status
    }


@router.post("/reports/{report_id}/vote")
def vote_on_report(
    report_id: str,
    payload: QuestionReportVoteRequest,
    user: dict = Depends(get_current_user)
):
    """
    Submits a contender vote (AGREE / DISAGREE) on a question reported in a multiplayer test.
    When consensus is reached among contenders, updates consensus_status and notifies participants.
    """
    vote_val = payload.vote.strip().upper()
    if vote_val not in ("AGREE", "DISAGREE"):
        raise HTTPException(status_code=400, detail="Vote must be 'AGREE' or 'DISAGREE'.")

    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM question_reports WHERE id = ?", (report_id,))
    rep_row = c.fetchone()
    if not rep_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Question report not found.")

    rep = dict(rep_row)
    now = datetime.datetime.utcnow().isoformat()
    uid = user["id"]
    username = user.get("username", "Contender")

    raw_parts = rep.get("participant_ids") or "[]"
    try:
        parts = json.loads(raw_parts) if isinstance(raw_parts, str) else raw_parts
    except Exception:
        parts = []

    if parts and uid not in parts:
        conn.close()
        raise HTTPException(status_code=403, detail="Only contenders who took this test can vote on this report.")

    raw_votes = rep.get("votes") or "{}"
    try:
        votes = json.loads(raw_votes) if isinstance(raw_votes, str) else raw_votes
    except Exception:
        votes = {}

    votes[uid] = {
        "vote": vote_val,
        "username": username,
        "voted_at": now
    }

    total_participants = len(parts) if parts else max(2, len(votes))
    agree_votes = sum(1 for v in votes.values() if (v.get("vote") if isinstance(v, dict) else v) == "AGREE")
    disagree_votes = sum(1 for v in votes.values() if (v.get("vote") if isinstance(v, dict) else v) == "DISAGREE")

    # Determine consensus:
    # 2 participants: both must agree for defect to be confirmed. If 1 disagrees, rejected.
    # >2 participants: majority threshold (> 50%) decides consensus.
    old_consensus = rep.get("consensus_status") or "VOTING_IN_PROGRESS"
    if total_participants == 2:
        if agree_votes == 2:
            consensus_status = "CONSENSUS_AGREED"
        elif disagree_votes >= 1:
            consensus_status = "CONSENSUS_REJECTED"
        else:
            consensus_status = "VOTING_IN_PROGRESS"
    else:
        majority_threshold = (total_participants // 2) + 1
        if agree_votes >= majority_threshold:
            consensus_status = "CONSENSUS_AGREED"
        elif disagree_votes >= majority_threshold or (agree_votes + disagree_votes == total_participants and agree_votes <= disagree_votes):
            consensus_status = "CONSENSUS_REJECTED"
        else:
            consensus_status = "VOTING_IN_PROGRESS"

    c.execute("""
        UPDATE question_reports
        SET votes = ?, consensus_status = ?
        WHERE id = ?
    """, (json.dumps(votes), consensus_status, report_id))

    # Dispatch notification to all participants if consensus was just achieved
    if consensus_status == "CONSENSUS_AGREED" and old_consensus != "CONSENSUS_AGREED":
        for p_uid in parts:
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            notif_title = f"✅ Report Verified by Contenders: Question #{rep['question_id'][:8]}"
            notif_msg = (
                f"Contenders in Room #{rep.get('room_code', '')} voted to confirm the defect for Question #{rep['question_id'][:8]}. "
                f"Consensus reached ({agree_votes}/{total_participants} agreed)."
            )
            details_json = json.dumps({
                "report_id": report_id,
                "question_id": rep["question_id"],
                "room_code": rep.get("room_code"),
                "status": "CONSENSUS_AGREED"
            })
            c.execute("""
                INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                VALUES (?, ?, 'REPORT_CONSENSUS_REACHED', ?, ?, ?, 0, ?)
            """, (notif_id, p_uid, notif_title, notif_msg, details_json, now))
    elif consensus_status == "CONSENSUS_REJECTED" and old_consensus != "CONSENSUS_REJECTED":
        # Notify reporter that contenders rejected the dispute
        notif_id = f"notif_{uuid.uuid4().hex[:12]}"
        notif_title = f"⚖️ Report Rejected by Contenders: Question #{rep['question_id'][:8]}"
        notif_msg = (
            f"Fellow contenders in Room #{rep.get('room_code', '')} reviewed Question #{rep['question_id'][:8]} "
            f"and voted that the question and answer key are correct ({disagree_votes}/{total_participants} voted correct)."
        )
        details_json = json.dumps({
            "report_id": report_id,
            "question_id": rep["question_id"],
            "room_code": rep.get("room_code"),
            "status": "CONSENSUS_REJECTED"
        })
        c.execute("""
            INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
            VALUES (?, ?, 'REPORT_CONSENSUS_REJECTED', ?, ?, ?, 0, ?)
        """, (notif_id, rep["reporter_id"], notif_title, notif_msg, details_json, now))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "report_id": report_id,
        "vote": vote_val,
        "votes": votes,
        "agree_votes": agree_votes,
        "disagree_votes": disagree_votes,
        "total_participants": total_participants,
        "consensus_status": consensus_status
    }


@router.get("/reports/room/{room_code}")
def get_room_reports(room_code: str, user: Optional[dict] = Depends(get_optional_user)):
    """
    Returns all reports and contender voting statuses for questions in a specific room.
    """
    code = room_code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT * FROM question_reports
        WHERE room_code = ?
        ORDER BY created_at ASC
    """, (code,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    result = {}
    for r in rows:
        qid = r["question_id"]
        raw_votes = r.get("votes") or "{}"
        try:
            votes = json.loads(raw_votes) if isinstance(raw_votes, str) else raw_votes
        except Exception:
            votes = {}

        raw_parts = r.get("participant_ids") or "[]"
        try:
            parts = json.loads(raw_parts) if isinstance(raw_parts, str) else raw_parts
        except Exception:
            parts = []

        agree_cnt = sum(1 for v in votes.values() if (v.get("vote") if isinstance(v, dict) else v) == "AGREE")
        disagree_cnt = sum(1 for v in votes.values() if (v.get("vote") if isinstance(v, dict) else v) == "DISAGREE")

        user_vote = None
        if user and user.get("id"):
            u_entry = votes.get(user["id"])
            if u_entry:
                user_vote = u_entry.get("vote") if isinstance(u_entry, dict) else u_entry

        result[qid] = {
            "id": r["id"],
            "question_id": qid,
            "reporter_id": r.get("reporter_id"),
            "reporter_username": r.get("reporter_username"),
            "reason": r.get("reason"),
            "notes": r.get("notes"),
            "status": r.get("status"),
            "consensus_status": r.get("consensus_status") or "PENDING",
            "votes": votes,
            "agree_count": agree_cnt,
            "disagree_count": disagree_cnt,
            "total_participants": len(parts) if parts else max(2, len(votes)),
            "user_vote": user_vote,
            "created_at": r.get("created_at")
        }

    return {"room_code": code, "reports": result}


@router.get("/reports/summary")
def get_reports_summary(admin: bool = Depends(verify_admin_sync)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'QUARANTINED' THEN 1 ELSE 0 END) as quarantined,
            SUM(CASE WHEN status = 'DISMISSED' THEN 1 ELSE 0 END) as dismissed,
            SUM(CASE WHEN status = 'FIXED' THEN 1 ELSE 0 END) as fixed
        FROM question_reports
    """)
    row = c.fetchone()
    conn.close()
    if not row:
        return {"total": 0, "pending": 0, "quarantined": 0, "dismissed": 0, "fixed": 0}
    return {
        "total": row["total"] or 0,
        "pending": row["pending"] or 0,
        "quarantined": row["quarantined"] or 0,
        "dismissed": row["dismissed"] or 0,
        "fixed": row["fixed"] or 0
    }


@router.get("/reports/all")
def get_all_reports(
    status: Optional[str] = Query(None),
    reporter_id: Optional[str] = Query(None),
    limit: int = Query(150, ge=1, le=500),
    admin: bool = Depends(verify_admin_sync)
):

    conn = get_connection()
    c = conn.cursor()

    query = """
        SELECT 
            qr.id as report_id,
            qr.question_id,
            qr.reporter_id,
            qr.reporter_username,
            qr.reason,
            qr.notes,
            qr.status as report_status,
            qr.created_at as reported_at,
            qr.resolved_at,
            qr.resolved_by,
            COALESCE(q.subject, 'Unknown') as subject,
            COALESCE(q.unit, '') as unit,
            COALESCE(q.chapter, 'General') as chapter,
            COALESCE(q.question_type, 'MCQ') as question_type,
            COALESCE(q.text, 'Question text unavailable') as question_text,
            q.options,
            COALESCE(q.correct_answer, 'N/A') as correct_answer,
            COALESCE(q.solution_text, '') as solution_text,
            COALESCE(q.has_diagram, 0) as has_diagram,
            q.diagram_urls,
            COALESCE(q.difficulty_tier, 'MEDIUM') as difficulty_tier,
            COALESCE(q.validation_status, 'UNKNOWN') as validation_status,
            COALESCE(qr.provisional_elo_refunded, 0.0) as provisional_elo_refunded,
            COALESCE(qr.provisional_subject, '') as provisional_subject
        FROM question_reports qr
        LEFT JOIN questions q ON qr.question_id = q.id
    """
    params = []
    where_clauses = []
    if status and status.upper() != "ALL":
        where_clauses.append("qr.status = ?")
        params.append(status.upper())

    if reporter_id and reporter_id.strip():
        where_clauses.append("qr.reporter_id = ?")
        params.append(reporter_id.strip())

    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)

    query += " ORDER BY qr.created_at DESC LIMIT ?"
    params.append(limit)
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()

    reports = []
    for r in rows:
        item = dict(r)
        try:
            item["options"] = json.loads(item["options"]) if isinstance(item["options"], str) else (item["options"] or [])
        except Exception:
            item["options"] = []
        try:
            urls = json.loads(item["diagram_urls"]) if isinstance(item["diagram_urls"], str) else (item["diagram_urls"] or [])
            from pathlib import Path
            clean_urls = []
            for u in urls:
                if u:
                    u_str = str(u)
                    if u_str.startswith("/diagrams/") or u_str.startswith("http://") or u_str.startswith("https://"):
                        clean_urls.append(u_str)
                    else:
                        fn = Path(u_str.replace("\\", "/")).name
                        clean_urls.append(f"/diagrams/{fn}")
            item["diagram_urls"] = clean_urls
        except Exception:
            item["diagram_urls"] = []

        reports.append(item)

    return reports



@router.get("/quarantined/all")
def get_quarantined_questions(admin: bool = Depends(verify_admin_sync)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, subject, unit, chapter, question_type, text as question_text, options, correct_answer, solution_text, has_diagram, diagram_urls, difficulty_tier, validation_status
        FROM questions
        WHERE validation_status = 'QUARANTINED'
        ORDER BY id DESC
        LIMIT 100
    """)
    rows = c.fetchall()
    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        try:
            item["options"] = json.loads(item["options"]) if isinstance(item["options"], str) else (item["options"] or [])
        except Exception:
            item["options"] = []
        try:
            urls = json.loads(item["diagram_urls"]) if isinstance(item["diagram_urls"], str) else (item["diagram_urls"] or [])
            from pathlib import Path
            clean_urls = []
            for u in urls:
                if u:
                    u_str = str(u)
                    if u_str.startswith("/diagrams/") or u_str.startswith("http://") or u_str.startswith("https://"):
                        clean_urls.append(u_str)
                    else:
                        fn = Path(u_str.replace("\\", "/")).name
                        clean_urls.append(f"/diagrams/{fn}")
            item["diagram_urls"] = clean_urls
        except Exception:
            item["diagram_urls"] = []
        result.append(item)
    return result


@router.post("/{question_id}/quarantine")
def quarantine_question(question_id: str, admin: bool = Depends(verify_admin_sync)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM questions WHERE id = ?", (question_id,))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found.")

    now = datetime.datetime.utcnow().isoformat()
    resolver = "Admin (GUI)"

    c.execute("UPDATE questions SET validation_status = 'QUARANTINED' WHERE id = ?", (question_id,))
    c.execute("""
        UPDATE question_reports 
        SET status = 'QUARANTINED', resolved_at = ?, resolved_by = ? 
        WHERE question_id = ? AND status = 'PENDING'
    """, (now, resolver, question_id))
    conn.commit()

    # Automatic Marks Re-scoring, Elo Compensation & Student Notification
    from backend.app.tools.moderation_reconciliation import reconcile_quarantined_question
    rec_res = reconcile_quarantined_question(question_id, rivals_conn=conn, resolver=resolver)
    conn.close()

    return {
        "success": True,
        "message": f"Question {question_id} has been quarantined and purged from active test pools.",
        "reconciliation": rec_res
    }


@router.post("/{question_id}/dismiss")
def dismiss_reports(question_id: str, admin: bool = Depends(verify_admin_sync)):
    conn = get_connection()
    c = conn.cursor()
    now = datetime.datetime.utcnow().isoformat()
    resolver = "Admin (GUI)"

    # Find pending reports for this question that had provisional Elo restored
    c.execute("""
        SELECT id, reporter_id, reporter_username, provisional_elo_refunded, provisional_subject
        FROM question_reports
        WHERE question_id = ? AND status = 'PENDING' AND provisional_elo_refunded > 0
    """, (question_id,))
    refunded_reports = [dict(r) for r in c.fetchall()]

    for rep in refunded_reports:
        uid = rep["reporter_id"]
        val = float(rep["provisional_elo_refunded"] or 0.0)
        subj = rep.get("provisional_subject") or "General"
        if uid and uid != "guest" and val > 0:
            subj_col = None
            if "chem" in subj.lower():
                subj_col = "chemistry_elo"
            elif "math" in subj.lower():
                subj_col = "math_elo"
            elif "phys" in subj.lower():
                subj_col = "physics_elo"

            if subj_col:
                c.execute(f"""
                    UPDATE users
                    SET overall_elo = max(100.0, overall_elo - ?),
                        {subj_col} = max(100.0, {subj_col} - ?)
                    WHERE id = ?
                """, (val, val, uid))
            else:
                c.execute("""
                    UPDATE users
                    SET overall_elo = max(100.0, overall_elo - ?)
                    WHERE id = ?
                """, (val, uid))

            # Record clawback in activity_log
            c.execute("""
                INSERT INTO activity_log (
                    user_id, question_id, subject, chapter, is_correct,
                    time_spent_seconds, elo_delta, mode, created_at
                ) VALUES (?, ?, ?, 'General', 0, 0, ?, 'REPORT_DISMISSED_REVERSION', ?)
            """, (uid, question_id, subj, -val, now))

            # Dispatch In-App Notification alerting the student of the reversion
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            notif_title = f"⚖️ Report Dismissed: Question #{question_id[:8]}"
            notif_msg = (
                f"Your report for Question #{question_id[:8]} was reviewed by moderators and dismissed "
                f"(the official answer key and problem formulation were verified as correct). "
                f"The provisional safeguard credit of {val:.1f} Elo has been reverted."
            )
            details_json = json.dumps({
                "question_id": question_id,
                "reverted_elo": val,
                "action": "DISMISSED"
            })
            c.execute("""
                INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                VALUES (?, ?, 'REPORT_DISMISSED', ?, ?, ?, 0, ?)
            """, (notif_id, uid, notif_title, notif_msg, details_json, now))

    c.execute("""
        UPDATE question_reports 
        SET status = 'DISMISSED', resolved_at = ?, resolved_by = ? 
        WHERE question_id = ? AND status = 'PENDING'
    """, (now, resolver, question_id))
    conn.commit()
    conn.close()
    return {
        "success": True,
        "message": f"Reports for question {question_id} dismissed. {len(refunded_reports)} provisional refunds reverted.",
        "reverted_count": len(refunded_reports)
    }


@router.post("/{question_id}/restore")
def restore_question(question_id: str, admin: bool = Depends(verify_admin_sync)):
    conn = get_connection()
    c = conn.cursor()
    now = datetime.datetime.utcnow().isoformat()
    resolver = "Admin (GUI)"

    c.execute("UPDATE questions SET validation_status = 'VALID' WHERE id = ?", (question_id,))
    c.execute("""
        UPDATE question_reports 
        SET status = 'RESTORED', resolved_at = ?, resolved_by = ? 
        WHERE question_id = ?
    """, (now, resolver, question_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Question {question_id} restored to active test pools."}


@router.post("/{question_id}/fix-key")
def fix_question_key(question_id: str, payload: FixQuestionKeyRequest, admin: bool = Depends(verify_admin_sync)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM questions WHERE id = ?", (question_id,))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found.")

    now = datetime.datetime.utcnow().isoformat()
    resolver = "Admin (GUI)"
    clean_key = payload.correct_answer.strip().upper()

    update_clauses = ["correct_answer = ?"]
    params = [clean_key]

    if payload.solution_text is not None and payload.solution_text.strip():
        update_clauses.append("solution_text = ?")
        params.append(clean_key if payload.solution_text.strip() == "" else payload.solution_text.strip())

    if payload.question_text is not None and payload.question_text.strip():
        update_clauses.append("text = ?")
        params.append(payload.question_text.strip())

    if payload.options is not None:
        opts_val = json.dumps(payload.options) if not isinstance(payload.options, str) else payload.options
        update_clauses.append("options = ?")
        params.append(opts_val)

    params.append(question_id)
    c.execute(f"UPDATE questions SET {', '.join(update_clauses)} WHERE id = ?", tuple(params))

    c.execute("""
        UPDATE question_reports 
        SET status = 'FIXED', resolved_at = ?, resolved_by = ? 
        WHERE question_id = ? AND status = 'PENDING'
    """, (now, resolver, question_id))
    conn.commit()

    from backend.app.tools.moderation_reconciliation import reconcile_fixed_question
    rec_res = reconcile_fixed_question(question_id, clean_key, rivals_conn=conn, resolver=resolver)
    conn.close()

    return {
        "success": True,
        "message": f"Answer key for question {question_id} updated to {clean_key}.",
        "reconciliation": rec_res
    }



