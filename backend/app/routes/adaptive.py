import json
import uuid
import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from backend.app.database import get_connection
from backend.app.auth import get_current_user
from backend.app.models import QuestionOut, QuestionOptionModel
from backend.app.routes.questions import row_to_question_out
from backend.app.tools.adaptive_engine import (
    get_user_subject_elo,
    get_user_weak_chapters,
    get_user_revenge_question_ids,
    select_next_adaptive_question,
    calculate_adaptive_elo_delta,
    apply_adaptive_result_to_profile
)

router = APIRouter(prefix="/api/adaptive", tags=["Adaptive Practice Engine"])


def evaluate_answer(user_ans: Any, correct_ans: Any, question_type: str = "SINGLE_CHOICE") -> bool:
    """Evaluates student answer with numerical float tolerance and case/space normalization."""
    if user_ans is None or correct_ans is None:
        return False

    u_str = str(user_ans).strip()
    c_str = str(correct_ans).strip()

    if u_str.upper() == c_str.upper():
        return True

    # Multi-correct handling (e.g. "A, B" vs "A,B" vs "B,A")
    if "," in c_str or question_type in ("MULTIPLE_CHOICE", "MULTI_CORRECT"):
        c_set = {x.strip().upper() for x in c_str.split(",") if x.strip()}
        u_set = {x.strip().upper() for x in u_str.split(",") if x.strip()}
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
    - Seeds starting Elo from the user's live profile rating for the requested subject.
    - Probes question bank and selects optimal starting question.
    - If restricted to learnt chapters, only plucks questions from chapters marked as learnt by the user.
    """
    conn = get_connection()
    c = conn.cursor()

    user_id = user["id"]
    now = datetime.datetime.utcnow().isoformat()
    session_id = f"adp_{uuid.uuid4().hex[:12]}"

    # Seed initial Elo from user's actual rating
    initial_elo = get_user_subject_elo(user, req.subject)

    # Determine allowed chapters if restricted to learnt
    effective_allowed = None
    if req.allowed_chapters:
        effective_allowed = req.allowed_chapters
    elif req.only_learnt:
        raw_learnt = user.get("learnt_chapters") or "[]"
        try:
            effective_allowed = json.loads(raw_learnt) if isinstance(raw_learnt, str) else raw_learnt
        except Exception:
            effective_allowed = []

    if effective_allowed:
        from backend.app.tools.jee_syllabus import expand_allowed_chapters
        effective_allowed = expand_allowed_chapters(effective_allowed)

    # Select first question
    first_q, meta = select_next_adaptive_question(
        cursor=c,
        user_id=user_id,
        subject=req.subject,
        chapter=req.chapter,
        target_exam=req.target_exam,
        current_session_elo=initial_elo,
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

    allowed_json = json.dumps(effective_allowed) if effective_allowed is not None else None

    c.execute("""
        INSERT INTO adaptive_sessions (
            id, user_id, mode, target_questions, subject, chapter,
            target_exam, current_index, current_elo, initial_elo,
            total_correct, total_attempted, current_streak, best_streak,
            current_question_id, history, status, created_at, allowed_chapters
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, 0, 0, 0, ?, '[]', 'IN_PROGRESS', ?, ?)
    """, (
        session_id, user_id, req.mode, req.target_questions if req.mode == "TARGET_SPRINT" else None,
        req.subject, req.chapter, req.target_exam, initial_elo, initial_elo,
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
            "target_elo": meta.get("target_elo"),
            "tier_label": meta.get("tier_label"),
            "is_revenge": meta.get("is_revenge", False),
            "is_remediation": meta.get("is_remediation", False)
        }
    }


@router.post("/{session_id}/submit")
def submit_adaptive_answer(
    session_id: str,
    req: AdaptiveSubmitRequest,
    user: dict = Depends(get_current_user)
):
    """
    Evaluates student answer, updates Elo ladder, profiles weaknesses,
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

    # Fetch question submitted
    c.execute("SELECT * FROM questions WHERE id = ?", (req.question_id,))
    q_row = c.fetchone()
    if not q_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found.")

    q = dict(q_row)
    q_elo = float(q.get("elo_rating") or 1500)
    current_session_elo = float(sess["current_elo"])
    curr_streak = int(sess["current_streak"])

    # 1. Evaluate correctness
    is_correct = evaluate_answer(req.submitted_answer, q["correct_answer"], q.get("question_type", "SINGLE_CHOICE"))

    # 2. Update streak
    new_streak = curr_streak + 1 if is_correct else 0
    best_streak = max(int(sess["best_streak"]), new_streak)

    # 3. Calculate Elo delta
    elo_delta = calculate_adaptive_elo_delta(current_session_elo, q_elo, is_correct, curr_streak)
    new_session_elo = max(1000.0, min(2600.0, current_session_elo + elo_delta))

    # 4. Apply permanent user profile updates
    apply_adaptive_result_to_profile(
        cursor=c,
        user_id=user["id"],
        question=q,
        is_correct=is_correct,
        time_spent=req.time_spent_seconds,
        elo_delta=elo_delta
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
        "session_elo_after": round(new_session_elo, 1)
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

        next_q, meta = select_next_adaptive_question(
            cursor=c,
            user_id=user["id"],
            subject=sess["subject"],
            chapter=sess.get("chapter"),
            target_exam=sess.get("target_exam", "MIXED"),
            current_session_elo=new_session_elo,
            is_last_correct=is_correct,
            streak=new_streak,
            seen_question_ids=seen_ids,
            remediation_chapter=remed_chapter,
            allowed_chapters=session_allowed
        )
        if next_q:
            nq_out = row_to_question_out(next_q)
            next_q_data = {
                **nq_out.dict(),
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
                new_index, new_session_elo, new_correct, new_attempted,
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
            now, new_session_elo, new_correct, new_attempted,
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
        "session_elo_before": round(current_session_elo, 1),
        "session_elo_after": round(new_session_elo, 1),
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
