import json
import uuid
import datetime
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from pydantic import BaseModel

from backend.app.database import get_connection
from backend.app.auth import get_current_user
from backend.app.models import QuestionOut, QuestionOptionModel
from backend.app.routes.questions import row_to_question_out
from backend.app.tools.adaptive_engine import (
    get_user_subject_elo,
    get_user_chapter_elo,
    get_initial_adaptive_elo,
    update_cached_chapter_elo,
    get_user_weak_chapters,
    get_user_revenge_question_ids,
    select_next_adaptive_question,
    calculate_adaptive_elo_delta,
    apply_adaptive_result_to_profile
)

router = APIRouter(prefix="/api/adaptive", tags=["Adaptive Practice Engine"])


def normalize_answer_token(ans: Any) -> str:
    """Normalizes option strings across formats: '1' -> 'A', '2' -> 'B', '3' -> 'C', '4' -> 'D', '(B)' -> 'B'."""
    if ans is None:
        return ""
    s = str(ans).strip().upper().strip("()., []'\"")
    mapping = {"1": "A", "2": "B", "3": "C", "4": "D"}
    return mapping.get(s, s)


def evaluate_answer(user_ans: Any, correct_ans: Any, question_type: str = "SINGLE_CHOICE") -> bool:
    """Evaluates student answer with 1-4 <-> A-D option equivalence, multi-correct sets, and float tolerance."""
    if user_ans is None or correct_ans is None:
        return False

    u_norm = normalize_answer_token(user_ans)
    c_norm = normalize_answer_token(correct_ans)
    if u_norm == c_norm:
        return True

    u_str = str(user_ans).strip()
    c_str = str(correct_ans).strip()

    if u_str.upper() == c_str.upper():
        return True

    # Multi-correct handling (e.g. "A, B" vs "A,B" or "1, 2" vs "A, B")
    if "," in c_str or question_type in ("MULTIPLE_CHOICE", "MULTI_CORRECT"):
        c_set = {normalize_answer_token(x) for x in c_str.split(",") if x.strip()}
        u_set = {normalize_answer_token(x) for x in u_str.split(",") if x.strip()}
        if c_set == u_set:
            return True

    # Numerical float tolerance check
    try:
        u_val = float(u_str)
        c_val = float(c_str)
        return abs(u_val - c_val) <= 0.05
    except Exception:
        pass

    return False



class AdaptiveStartRequest(BaseModel):
    mode: str = "TARGET_SPRINT"  # "ENDLESS" or "TARGET_SPRINT"
    target_questions: Optional[int] = 20  # 10, 20, 30 for TARGET_SPRINT, None for ENDLESS
    subject: str = "Full Syllabus"  # "Full Syllabus", "Physics", "Chemistry", "Mathematics"
    chapter: Optional[str] = None
    chapters: Optional[List[str]] = None  # Multi-chapter selection
    target_exam: str = "MIXED"  # "MAIN", "ADVANCED", "MIXED"
    allowed_chapters: Optional[List[str]] = None
    only_learnt: bool = False


class AdaptiveSubmitRequest(BaseModel):
    question_id: str
    submitted_answer: str
    time_spent_seconds: int = 60


def parse_formulas_and_pitfalls(q_row: dict) -> Tuple[List[str], str]:
    raw_formulas = q_row.get("key_formulas") or "[]"
    try:
        formulas = json.loads(raw_formulas) if isinstance(raw_formulas, str) else raw_formulas
    except Exception:
        formulas = [raw_formulas] if isinstance(raw_formulas, str) and raw_formulas else []

    pitfall = q_row.get("common_pitfall") or ""
    return formulas, pitfall


@router.post("/start")
def start_adaptive_session(req: AdaptiveStartRequest, user: dict = Depends(get_current_user)):
    """
    Initializes a new personalized adaptive session:
    - Seeds starting Elo from the user's live Chapter Elo for the requested chapter(s).
    - Probes question bank and selects optimal starting question calibrated to Chapter Elo.
    - If restricted to learnt chapters or multiple specified chapters, only plucks questions from those chapters.
    """
    conn = get_connection()
    c = conn.cursor()

    user_id = user["id"]
    now = datetime.datetime.utcnow().isoformat()
    session_id = f"adp_{uuid.uuid4().hex[:12]}"

    # Determine allowed chapters if restricted to multiple chapters or learnt
    effective_allowed = None
    if req.chapters and len(req.chapters) > 0:
        effective_allowed = [str(ch).strip() for ch in req.chapters if ch and str(ch).strip()]
    elif req.allowed_chapters and len(req.allowed_chapters) > 0:
        effective_allowed = [str(ch).strip() for ch in req.allowed_chapters if ch and str(ch).strip()]
    elif req.chapter and str(req.chapter).strip():
        effective_allowed = [str(req.chapter).strip()]
    elif req.only_learnt:
        raw_learnt = user.get("learnt_chapters") or "[]"
        try:
            effective_allowed = json.loads(raw_learnt) if isinstance(raw_learnt, str) else raw_learnt
        except Exception:
            effective_allowed = []

    if effective_allowed:
        from backend.app.tools.jee_syllabus import expand_allowed_chapters
        effective_allowed = expand_allowed_chapters(effective_allowed)

    target_ch = req.chapter if (not effective_allowed or len(effective_allowed) <= 1) else None
    if req.chapters and len(req.chapters) > 1:
        target_ch = None

    # Seed initial Elo from user's Chapter Elo across active chapters
    seed_elo = get_initial_adaptive_elo(c, user, req.subject, target_ch, effective_allowed)

    # Select first question calibrated to each candidate question's Chapter Elo
    first_q, meta = select_next_adaptive_question(
        cursor=c,
        user_id=user_id,
        subject=req.subject,
        chapter=target_ch,
        target_exam=req.target_exam,
        current_session_elo=seed_elo,
        is_last_correct=None,
        streak=0,
        seen_question_ids=set(),
        remediation_chapter=None,
        allowed_chapters=effective_allowed
    )

    if not first_q:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="No suitable questions found for your selected active chapters. Try marking more chapters as learnt or select Full Syllabus."
        )

    initial_elo = float(meta.get("chapter_elo") or seed_elo)
    allowed_json = json.dumps(effective_allowed) if effective_allowed is not None else None

    # Auto-abandon any previously running in-progress session for this user to enforce 1 active session per user
    c.execute("UPDATE adaptive_sessions SET status = 'ABANDONED' WHERE user_id = ? AND status = 'IN_PROGRESS'", (user_id,))

    stored_ch = req.chapter
    if req.chapters and len(req.chapters) > 1:
        stored_ch = ", ".join(req.chapters[:2]) + (f" (+{len(req.chapters)-2} more)" if len(req.chapters) > 2 else "")

    c.execute("""
        INSERT INTO adaptive_sessions (
            id, user_id, mode, target_questions, subject, chapter,
            target_exam, current_index, current_elo, initial_elo,
            total_correct, total_attempted, current_streak, best_streak,
            current_question_id, history, status, created_at, allowed_chapters
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, 0, 0, 0, ?, '[]', 'IN_PROGRESS', ?, ?)
    """, (
        session_id, user_id, req.mode, req.target_questions if req.mode == "TARGET_SPRINT" else None,
        req.subject, stored_ch, req.target_exam, initial_elo, initial_elo,
        first_q["id"], now, allowed_json
    ))

    conn.commit()
    conn.close()

    q_out = row_to_question_out(first_q)
    return {
        "session_id": session_id,
        "mode": req.mode,
        "target_questions": req.target_questions if req.mode == "TARGET_SPRINT" else None,
        "current_index": 1,
        "current_elo": round(initial_elo, 1),
        "initial_elo": round(initial_elo, 1),
        "streak": 0,
        "subject": req.subject,
        "chapter": req.chapter,
        "target_exam": req.target_exam,
        "first_question": {
            **q_out.dict(),
            "chapter_elo": meta.get("chapter_elo") or round(initial_elo, 1),
            "target_elo": meta.get("target_elo"),
            "tier_label": meta.get("tier_label"),
            "is_revenge": meta.get("is_revenge", False),
            "is_remediation": meta.get("is_remediation", False)
        }
    }


@router.get("/active")
def get_active_adaptive_session(user: dict = Depends(get_current_user)):
    """
    Returns the user's currently active IN_PROGRESS adaptive practice session and its current question.
    Provides authoritative server-side session control across devices, logins, and tabs.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT * FROM adaptive_sessions
        WHERE user_id = ? AND status = 'IN_PROGRESS'
        ORDER BY created_at DESC
        LIMIT 1
    """, (user["id"],))
    s_row = c.fetchone()
    if not s_row:
        conn.close()
        return {"active": False}

    sess = dict(s_row)
    from backend.app.tools.question_cache import get_question_cached
    q = get_question_cached(sess.get("current_question_id"), cursor=c)
    if not q:
        c.execute("SELECT * FROM questions WHERE id = ?", (sess.get("current_question_id"),))
        q_row = c.fetchone()
        if not q_row:
            conn.close()
            return {"active": False}
        q = dict(q_row)

    live_ch_elo = round(get_user_chapter_elo(c, user["id"], q.get("chapter"), float(sess.get("current_elo", 1200.0))), 1)
    conn.close()

    q_out = row_to_question_out(q)

    allowed_list = None
    if sess.get("allowed_chapters"):
        try:
            allowed_list = json.loads(sess["allowed_chapters"]) if isinstance(sess["allowed_chapters"], str) else sess["allowed_chapters"]
        except Exception:
            pass

    return {
        "active": True,
        "session": {
            "session_id": sess["id"],
            "mode": sess["mode"],
            "target_questions": sess.get("target_questions"),
            "current_index": sess.get("current_index", 1),
            "current_elo": live_ch_elo,
            "initial_elo": round(float(sess.get("initial_elo", 1200.0)), 1),
            "streak": sess.get("current_streak", 0),
            "subject": sess.get("subject", "Full Syllabus"),
            "chapter": sess.get("chapter"),
            "target_exam": sess.get("target_exam", "MIXED"),
            "total_correct": sess.get("total_correct", 0),
            "total_attempted": sess.get("total_attempted", 0),
            "allowed_chapters": allowed_list
        },
        "question": {
            **q_out.dict(),
            "chapter_elo": live_ch_elo,
            "target_elo": live_ch_elo,
            "tier_label": q.get("difficulty_tier") or "JEE_MAIN_STANDARD"
        }
    }


@router.post("/cancel-active")
def cancel_active_session(user: dict = Depends(get_current_user)):
    """Cancels any running IN_PROGRESS adaptive sessions for the current user."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE adaptive_sessions SET status = 'ABANDONED' WHERE user_id = ? AND status = 'IN_PROGRESS'", (user["id"],))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Active adaptive practice cancelled."}


@router.get("/{session_id}")
def get_adaptive_session(session_id: str, user: dict = Depends(get_current_user)):
    """Fetches a specific adaptive session for the user."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM adaptive_sessions WHERE id = ? AND user_id = ?", (session_id, user["id"]))
    s_row = c.fetchone()
    if not s_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Adaptive session not found.")
    sess = dict(s_row)
    c.execute("SELECT * FROM questions WHERE id = ?", (sess.get("current_question_id"),))
    q_row = c.fetchone()
    conn.close()
    q_out = row_to_question_out(dict(q_row)) if q_row else None
    return {
        "session": sess,
        "question": q_out.dict() if q_out else None
    }


@router.post("/{session_id}/cancel")
def cancel_specific_session(session_id: str, user: dict = Depends(get_current_user)):
    """Cancels/abandons a specific adaptive session for the current user."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE adaptive_sessions SET status = 'ABANDONED' WHERE id = ? AND user_id = ?", (session_id, user["id"]))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Session {session_id} abandoned."}


@router.post("/{session_id}/skip")
def skip_adaptive_question(session_id: str, user: dict = Depends(get_current_user)):
    """
    Skips the current question (e.g. reported defective by student) and replaces it with a fresh calibrated question.
    Preserves streak, applies 0 Elo penalty, and logs the skip.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM adaptive_sessions WHERE id = ? AND user_id = ?", (session_id, user["id"]))
    s_row = c.fetchone()
    if not s_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Adaptive session not found.")

    sess = dict(s_row)
    if sess["status"] != "IN_PROGRESS":
        conn.close()
        raise HTTPException(status_code=400, detail="Adaptive session is already completed.")

    current_q_id = sess.get("current_question_id")
    raw_hist = sess.get("history") or "[]"
    try:
        history = json.loads(raw_hist) if isinstance(raw_hist, str) else raw_hist
    except Exception:
        history = []

    # Record skip in session history without penalizing accuracy or Elo
    if current_q_id:
        from backend.app.tools.question_cache import get_question_cached
        q = get_question_cached(current_q_id, cursor=c) or {}
        history.append({
            "question_id": current_q_id,
            "subject": q.get("subject"),
            "chapter": q.get("chapter"),
            "is_skipped": True,
            "reason": "REPORTED_DEFECT",
            "time_spent_seconds": 0
        })

    seen_ids = {h["question_id"] for h in history if h.get("question_id")}
    raw_allowed = sess.get("allowed_chapters")
    session_allowed = None
    if raw_allowed:
        try:
            session_allowed = json.loads(raw_allowed) if isinstance(raw_allowed, str) else raw_allowed
        except Exception:
            session_allowed = None

    current_session_elo = float(sess["current_elo"])
    curr_streak = int(sess["current_streak"])

    target_ch = sess.get("chapter") if (not session_allowed or len(session_allowed) <= 1) else None

    # Draw replacement question calibrated to Chapter Elo
    next_q, meta = select_next_adaptive_question(
        cursor=c,
        user_id=user["id"],
        subject=sess["subject"],
        chapter=target_ch,
        target_exam=sess.get("target_exam", "MIXED"),
        current_session_elo=current_session_elo,
        is_last_correct=None,
        streak=curr_streak,
        seen_question_ids=seen_ids,
        remediation_chapter=None,
        allowed_chapters=session_allowed
    )

    if not next_q:
        conn.close()
        raise HTTPException(status_code=404, detail="No replacement question available for this session.")

    next_ch_elo = float(meta.get("chapter_elo") or current_session_elo)
    nq_out = row_to_question_out(next_q)
    next_q_data = {
        **nq_out.dict(),
        "chapter_elo": round(next_ch_elo, 1),
        "target_elo": meta.get("target_elo"),
        "tier_label": meta.get("tier_label"),
        "is_revenge": meta.get("is_revenge", False),
        "is_remediation": meta.get("is_remediation", False)
    }

    c.execute("""
        UPDATE adaptive_sessions
        SET current_question_id = ?, current_elo = ?, history = ?
        WHERE id = ?
    """, (next_q["id"], next_ch_elo, json.dumps(history), session_id))

    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "skipped_question_id": current_q_id,
        "next_question": next_q_data,
        "current_streak": curr_streak,
        "current_elo": round(next_ch_elo, 1)
    }


@router.post("/{session_id}/submit")
def submit_adaptive_answer(
    session_id: str,
    req: AdaptiveSubmitRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user)
):
    """
    Evaluates student answer against the user's Chapter Elo for the question's chapter,
    updates Chapter Elo ladder in-memory and in background DB, profiles weaknesses,
    and returns immediate solutions, formulas, common pitfalls, and the next adapted question.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM adaptive_sessions WHERE id = ? AND user_id = ?", (session_id, user["id"]))
    s_row = c.fetchone()
    if not s_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Adaptive session not found.")

    sess = dict(s_row)
    if sess["status"] != "IN_PROGRESS":
        conn.close()
        raise HTTPException(status_code=400, detail="Adaptive session is already completed.")

    # Fetch question submitted - first check fast in-memory hot cache
    from backend.app.tools.question_cache import get_question_cached
    q = get_question_cached(req.question_id, cursor=c)
    if not q:
        c.execute("SELECT * FROM questions WHERE id = ?", (req.question_id,))
        q_row = c.fetchone()
        if not q_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Question not found.")
        q = dict(q_row)

    q_elo = float(q.get("elo_rating") or 1500)
    current_chapter_elo = get_user_chapter_elo(c, user["id"], q.get("chapter"), float(sess["current_elo"]))
    curr_streak = int(sess["current_streak"])

    # 1. Evaluate correctness
    is_correct = evaluate_answer(req.submitted_answer, q["correct_answer"], q.get("question_type", "SINGLE_CHOICE"))

    # 2. Update streak
    new_streak = curr_streak + 1 if is_correct else 0
    best_streak = max(int(sess["best_streak"]), new_streak)

    # 3. Calculate Elo delta against the question's Chapter Elo
    elo_delta = calculate_adaptive_elo_delta(current_chapter_elo, q_elo, is_correct, curr_streak)
    new_chapter_elo = max(600.0, min(3000.0, current_chapter_elo + elo_delta))

    # Synchronously update the in-memory Chapter Elo cache so the very next question
    # selection immediately reflects the updated Chapter Elo in 0ms
    update_cached_chapter_elo(user["id"], q.get("chapter"), new_chapter_elo)

    # 4. Offload permanent user profile and telemetry updates to background task
    q_copy = dict(q)
    q_copy["user_choice"] = req.submitted_answer

    def _bg_apply_profile_updates(u_id, q_data, is_corr, t_spent, e_delta):
        bg_conn = get_connection()
        try:
            bg_c = bg_conn.cursor()
            apply_adaptive_result_to_profile(
                cursor=bg_c,
                user_id=u_id,
                question=q_data,
                is_correct=is_corr,
                time_spent=t_spent,
                elo_delta=e_delta
            )
            bg_conn.commit()
        except Exception as e:
            print(f"[ADAPTIVE_BG] Background telemetry sync note: {e}")
        finally:
            try:
                bg_conn.close()
            except Exception:
                pass

    background_tasks.add_task(
        _bg_apply_profile_updates,
        user["id"],
        q_copy,
        is_correct,
        req.time_spent_seconds,
        elo_delta
    )

    # 5. Record in session history
    raw_hist = sess.get("history") or "[]"
    try:
        history = json.loads(raw_hist) if isinstance(raw_hist, str) else raw_hist
    except Exception:
        history = []

    history_item = {
        "question_id": q["id"],
        "subject": q.get("subject"),
        "chapter": q.get("chapter"),
        "question_type": q.get("question_type"),
        "text": q.get("text"),
        "submitted_answer": req.submitted_answer,
        "correct_answer": q.get("correct_answer"),
        "is_correct": is_correct,
        "time_spent_seconds": req.time_spent_seconds,
        "question_elo": q_elo,
        "elo_delta": elo_delta,
        "session_elo_after": round(new_chapter_elo, 1)
    }
    history.append(history_item)

    new_attempted = sess["total_attempted"] + 1
    new_correct = sess["total_correct"] + (1 if is_correct else 0)
    new_index = sess["current_index"] + 1

    # Check if target sprint is finished
    is_session_finished = False
    if sess["mode"] == "TARGET_SPRINT" and sess.get("target_questions"):
        if new_attempted >= sess["target_questions"]:
            is_session_finished = True

    # 6. Select next question if not finished
    next_q_data = None
    seen_ids = {h["question_id"] for h in history}
    if not is_session_finished:
        remed_chapter = q.get("chapter") if not is_correct else None

        # Respect user's active learnt chapters during adaptive progression
        raw_allowed = sess.get("allowed_chapters")
        session_allowed = None
        if raw_allowed:
            try:
                session_allowed = json.loads(raw_allowed) if isinstance(raw_allowed, str) else raw_allowed
            except Exception:
                session_allowed = None

        target_ch = sess.get("chapter") if (not session_allowed or len(session_allowed) <= 1) else None

        next_q, meta = select_next_adaptive_question(
            cursor=c,
            user_id=user["id"],
            subject=sess["subject"],
            chapter=target_ch,
            target_exam=sess.get("target_exam", "MIXED"),
            current_session_elo=new_chapter_elo,
            is_last_correct=is_correct,
            streak=new_streak,
            seen_question_ids=seen_ids,
            remediation_chapter=remed_chapter,
            allowed_chapters=session_allowed
        )
        if next_q:
            next_ch_elo = float(meta.get("chapter_elo") or new_chapter_elo)
            nq_out = row_to_question_out(next_q)
            next_q_data = {
                **nq_out.dict(),
                "chapter_elo": round(next_ch_elo, 1),
                "target_elo": meta.get("target_elo"),
                "tier_label": meta.get("tier_label"),
                "is_revenge": meta.get("is_revenge", False),
                "is_remediation": meta.get("is_remediation", False)
            }
            c.execute("""
                UPDATE adaptive_sessions
                SET current_index = ?, current_elo = ?, total_correct = ?, total_attempted = ?,
                    current_streak = ?, best_streak = ?, current_question_id = ?, history = ?
                WHERE id = ?
            """, (
                new_index, new_chapter_elo, new_correct, new_attempted,
                new_streak, best_streak, next_q["id"], json.dumps(history),
                session_id
            ))
        else:
            is_session_finished = True

    if is_session_finished:
        now = datetime.datetime.utcnow().isoformat()
        c.execute("""
            UPDATE adaptive_sessions
            SET status = 'COMPLETED', completed_at = ?, current_elo = ?,
                total_correct = ?, total_attempted = ?, current_streak = ?,
                best_streak = ?, history = ?
            WHERE id = ?
        """, (
            now, new_chapter_elo, new_correct, new_attempted,
            new_streak, best_streak, json.dumps(history), session_id
        ))

    conn.commit()
    conn.close()

    formulas, pitfall = parse_formulas_and_pitfalls(q)

    return {
        "is_correct": is_correct,
        "correct_answer": q.get("correct_answer"),
        "solution_text": q.get("solution_text") or "Solution steps: Verified through standard JEE principles.",
        "key_formulas": formulas,
        "common_pitfall": pitfall,
        "elo_delta": elo_delta,
        "session_elo_before": round(current_chapter_elo, 1),
        "session_elo_after": round(new_chapter_elo, 1),
        "current_streak": new_streak,
        "flow_state": new_streak >= 3,
        "total_attempted": new_attempted,
        "total_correct": new_correct,
        "is_session_finished": is_session_finished,
        "next_question": next_q_data
    }


@router.post("/{session_id}/finish")
def finish_adaptive_session(session_id: str, user: dict = Depends(get_current_user)):
    """
    Manually concludes an adaptive session (e.g. Endless mode)
    and computes the comprehensive mastery summary report.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM adaptive_sessions WHERE id = ? AND user_id = ?", (session_id, user["id"]))
    s_row = c.fetchone()
    if not s_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Adaptive session not found.")

    sess = dict(s_row)
    now = datetime.datetime.utcnow().isoformat()

    c.execute("UPDATE adaptive_sessions SET status = 'COMPLETED', completed_at = ? WHERE id = ?", (now, session_id))
    conn.commit()
    conn.close()

    raw_hist = sess.get("history") or "[]"
    try:
        history = json.loads(raw_hist) if isinstance(raw_hist, str) else raw_hist
    except Exception:
        history = []

    total_attempted = len(history)
    total_correct = sum(1 for h in history if h.get("is_correct"))
    acc_pct = round((total_correct / total_attempted * 100), 1) if total_attempted > 0 else 0.0

    total_time = sum(h.get("time_spent_seconds", 0) for h in history)
    avg_time = round(total_time / total_attempted, 1) if total_attempted > 0 else 0

    init_elo = float(sess.get("initial_elo", 1500.0))
    final_elo = float(sess.get("current_elo", 1500.0))
    net_elo_delta = round(final_elo - init_elo, 1)

    # Chapter breakdown
    chapter_map = {}
    for h in history:
        ch = h.get("chapter", "General")
        if ch not in chapter_map:
            chapter_map[ch] = {"attempts": 0, "correct": 0}
        chapter_map[ch]["attempts"] += 1
        if h.get("is_correct"):
            chapter_map[ch]["correct"] += 1

    weak_spots = [ch for ch, s in chapter_map.items() if (s["correct"] / s["attempts"]) < 0.60]
    strengths = [ch for ch, s in chapter_map.items() if (s["correct"] / s["attempts"]) >= 0.75]

    return {
        "session_id": session_id,
        "mode": sess["mode"],
        "subject": sess["subject"],
        "total_attempted": total_attempted,
        "total_correct": total_correct,
        "accuracy_percentage": acc_pct,
        "initial_elo": round(init_elo, 1),
        "final_elo": round(final_elo, 1),
        "net_elo_delta": net_elo_delta,
        "best_streak": sess["best_streak"],
        "average_time_seconds": avg_time,
        "weak_spots": weak_spots,
        "strengths": strengths,
        "chapter_breakdown": chapter_map,
        "history": history
    }


@router.get("/stats")
def get_adaptive_stats(user: dict = Depends(get_current_user)):
    """
    Returns student's personalized adaptive stats, current subject Elos,
    detected weak chapters, and pending revenge questions.
    """
    conn = get_connection()
    c = conn.cursor()

    uid = user["id"]
    weak_physics = get_user_weak_chapters(c, uid, "Physics")
    weak_chem = get_user_weak_chapters(c, uid, "Chemistry")
    weak_math = get_user_weak_chapters(c, uid, "Mathematics")
    revenge_ids = list(get_user_revenge_question_ids(c, uid))

    # Recent sessions
    c.execute("""
        SELECT id, mode, subject, total_attempted, total_correct, current_elo, initial_elo, created_at, status
        FROM adaptive_sessions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 5
    """, (uid,))
    recent_sessions = [dict(r) for r in c.fetchall()]

    conn.close()

    return {
        "overall_elo": round(float(user.get("overall_elo", 1200.0)), 1),
        "physics_elo": round(float(user.get("physics_elo", 1200.0)), 1),
        "chemistry_elo": round(float(user.get("chemistry_elo", 1200.0)), 1),
        "math_elo": round(float(user.get("math_elo", 1200.0)), 1),
        "weak_chapters": {
            "Physics": weak_physics,
            "Chemistry": weak_chem,
            "Mathematics": weak_math
        },
        "revenge_questions_count": len(revenge_ids),
        "recent_sessions": recent_sessions
    }
