"""
Scheduled Tests and Contests Engine for JEE Rivals.
Handles:
  1. Creation of scheduled tests (cohort-assigned, pre-generated question papers, locked start dates & deadlines).
  2. Test catalog with filters (Upcoming, Active Now, Pending for User, Completed by User).
  3. Start / resume session launching into authentic NTA CBT MockTestView.
  4. Two-Tier Leaderboard (Official On-Time Submissions vs Late Attempts).
  5. Aspirants roster for targeted student selection.
"""

import json
import uuid
import datetime
import logging
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.app.auth import get_current_user, get_optional_user
from backend.app.database import get_connection
from backend.app.routes.rooms import generate_room_code, get_room_state
from backend.app.tools.mock_selector import select_mock_and_room_questions

logger = logging.getLogger("jee_rivals.scheduled_tests")

router = APIRouter(
    prefix="/api/scheduled-tests",
    tags=["Scheduled Tests & Contests"]
)


class CreateScheduledTestRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=120)
    description: Optional[str] = ""
    exam_type: str = Field(default="MAIN")  # "MAIN" or "ADVANCED"
    difficulty: Optional[str] = Field(default="STRICT")  # Strictly calibrated to NTA/IIT standard
    duration_minutes: int = Field(default=60, ge=5, le=360)
    total_questions: int = Field(default=25, ge=3, le=90)
    subjects: List[str] = Field(default=["Physics", "Chemistry", "Mathematics"])
    chapters: Optional[List[str]] = Field(default=[])
    scheduled_start_time: str  # ISO timestamp
    deadline_time: str         # ISO timestamp
    assigned_user_ids: List[str] = Field(default=["*"])  # list of user IDs or ["*"] for all


def _parse_iso(iso_str: str) -> datetime.datetime:
    """Parses ISO string to UTC datetime."""
    clean = str(iso_str).strip().replace("Z", "+00:00")
    dt = datetime.datetime.fromisoformat(clean)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt


@router.get("/aspirants")
def get_aspirants_roster(user: dict = Depends(get_current_user)):
    """Returns list of registered aspirants for target assignment."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, username, avatar_id, current_division, overall_elo, title
        FROM users
        ORDER BY overall_elo DESC, username ASC
    """)
    rows = c.fetchall()
    roster = []
    for r in rows:
        d = dict(r) if hasattr(r, "keys") else {
            "id": r[0], "username": r[1], "avatar_id": r[2],
            "current_division": r[3], "overall_elo": r[4], "title": r[5]
        }
        roster.append(d)
    conn.close()
    return roster


@router.post("/create")
def create_scheduled_test(
    req: CreateScheduledTestRequest,
    user: dict = Depends(get_current_user)
):
    """
    Creates a pre-generated scheduled test paper, assigns target students,
    locks start time and deadline, and publishes to the contest catalog.
    """
    # Validate start time & deadline
    try:
        start_dt = _parse_iso(req.scheduled_start_time)
        deadline_dt = _parse_iso(req.deadline_time)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid date/time format: {e}")

    if deadline_dt <= start_dt:
        raise HTTPException(status_code=400, detail="Deadline must be strictly after the scheduled start time.")

    conn = get_connection()
    c = conn.cursor()

    # Strict Standardized Difficulty: strictly calibrated to authentic NTA / IIT standards
    strict_difficulty = "BALANCED"

    # Determine user IDs to factor into anti-repetition / seen-questions filter
    target_user_ids = []
    if req.assigned_user_ids and req.assigned_user_ids != ["*"]:
        target_user_ids = [uid for uid in req.assigned_user_ids if uid and uid != "*"]
    if not target_user_ids and user and user.get("id"):
        target_user_ids = [user["id"]]

    # Pre-generate frozen question paper using authentic JEE mock selector
    try:
        sampled_qs = select_mock_and_room_questions(
            cursor=c,
            target_count=req.total_questions,
            filter_subjects=req.subjects,
            filter_chapters=req.chapters if req.chapters else None,
            target_exam=req.exam_type,
            difficulty_tier=strict_difficulty,
            mode="MOCK_TEST",
            user_ids=target_user_ids
        )
    except Exception as e:
        logger.error(f"Error sampling questions for scheduled test: {e}")
        sampled_qs = []

    if not sampled_qs or len(sampled_qs) == 0:
        # Fallback to random approved questions from DB if mock selector is constrained
        params = list(req.subjects)
        subj_placeholders = ",".join(["?"] * len(req.subjects))
        chap_filter = ""
        if req.chapters and len(req.chapters) > 0:
            chap_placeholders = ",".join(["?"] * len(req.chapters))
            chap_filter = f" AND chapter IN ({chap_placeholders})"
            params.extend(req.chapters)
        params.append(req.total_questions)

        c.execute(f"""
            SELECT id FROM questions
            WHERE subject IN ({subj_placeholders})
            {chap_filter}
            AND validation_status = 'VALIDATED'
            AND (has_diagram = 0 OR (diagram_paths IS NOT NULL AND diagram_paths != '[]'))
            ORDER BY RANDOM()
            LIMIT ?
        """, tuple(params))
        fb_rows = c.fetchall()
        sampled_qs = [{"id": r[0]} for r in fb_rows]

    if not sampled_qs:
        conn.close()
        raise HTTPException(status_code=400, detail="Insufficient validated questions in question bank to assemble this paper.")

    question_ids = [q["id"] for q in sampled_qs]
    actual_q_count = len(question_ids)

    # Marking schemes: Main (+4/-1), Advanced (+4/-2)
    base_marks = 4.0
    neg_marks = -1.0 if req.exam_type == "MAIN" else -2.0
    total_marks = int(actual_q_count * base_marks)

    test_id = str(uuid.uuid4())
    room_id = str(uuid.uuid4())
    room_code = generate_room_code()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Create associated Mock Room
    c.execute("""
        INSERT INTO rooms (
            id, code, host_id, mode, preset_name, subject, chapter, difficulty_tier,
            question_ids, total_questions, total_duration_minutes, timing_type,
            status, created_at, subjects, chapters, target_exam,
            is_public, passcode, speed_bonus_enabled, negative_marking, base_correct_score,
            is_scheduled, scheduled_test_id, started_at
        ) VALUES (
            ?, ?, ?, 'MOCK_TEST', ?, ?, ?, ?,
            ?, ?, ?, 'TOTAL',
            'IN_PROGRESS', ?, ?, ?, ?,
            0, NULL, 0, ?, ?,
            1, ?, ?
        )
    """, (
        room_id, room_code, user["id"], req.title,
        ", ".join(req.subjects), ", ".join(req.chapters or []), strict_difficulty,
        json.dumps(question_ids), actual_q_count, req.duration_minutes,
        now_iso, json.dumps(req.subjects), json.dumps(req.chapters or []), req.exam_type,
        neg_marks, base_marks, test_id, now_iso
    ))

    # Insert into scheduled_tests
    c.execute("""
        INSERT INTO scheduled_tests (
            id, room_id, title, description, exam_type, difficulty,
            duration_minutes, total_questions, total_marks, question_ids,
            subjects, chapters, scheduled_start_time, deadline_time,
            assigned_user_ids, created_by_user_id, status, created_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, 'ACTIVE', ?
        )
    """, (
        test_id, room_id, req.title, req.description, req.exam_type, strict_difficulty,
        req.duration_minutes, actual_q_count, total_marks, json.dumps(question_ids),
        json.dumps(req.subjects), json.dumps(req.chapters or []),
        start_dt.isoformat(), deadline_dt.isoformat(),
        json.dumps(req.assigned_user_ids), user["id"], now_iso
    ))

    # Dispatch Notifications to Target Aspirants
    target_ids = req.assigned_user_ids
    if target_ids == ["*"]:
        c.execute("SELECT id FROM users")
        target_ids = [r[0] for r in c.fetchall()]

    for tid in target_ids:
        notif_id = str(uuid.uuid4())
        notif_msg = f"🎯 You have been assigned to scheduled exam '{req.title}'. Scheduled to unlock on {start_dt.strftime('%b %d, %Y %I:%M %p UTC')}."
        try:
            c.execute("""
                INSERT INTO user_notifications (id, user_id, message, link, type, is_read, created_at)
                VALUES (?, ?, ?, ?, 'SCHEDULED_TEST', 0, ?)
            """, (notif_id, tid, notif_msg, f"/tests?id={test_id}", now_iso))
        except Exception:
            pass

    conn.commit()
    conn.close()

    return {
        "status": "ok",
        "test_id": test_id,
        "room_id": room_id,
        "room_code": room_code,
        "title": req.title,
        "total_questions": actual_q_count,
        "total_marks": total_marks,
        "scheduled_start_time": start_dt.isoformat(),
        "deadline_time": deadline_dt.isoformat(),
        "assigned_count": len(target_ids)
    }


@router.get("/catalog")
def get_scheduled_tests_catalog(user: Optional[dict] = Depends(get_optional_user)):
    """
    Returns categorized scheduled tests catalog for current user:
    - Upcoming (scheduled_start_time > now)
    - Active (scheduled_start_time <= now <= deadline_time)
    - Pending (assigned to current user, not completed yet)
    - Completed (completed by current user with score details)
    - All (complete chronological listing)
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT st.*, r.code as room_code
        FROM scheduled_tests st
        JOIN rooms r ON st.room_id = r.id
        WHERE st.status != 'DELETED'
        ORDER BY st.scheduled_start_time DESC
    """)
    rows = c.fetchall()

    user_id = user.get("id") if user else None
    now_dt = datetime.datetime.now(datetime.timezone.utc)

    # Fetch attempts made by the current user across all rooms
    user_attempts_map = {}
    deleted_test_ids = set()
    if user_id:
        try:
            c.execute("SELECT test_id, room_id FROM user_deleted_tests WHERE user_id = ?", (user_id,))
            for dr in c.fetchall():
                t_id = dr["test_id"] if hasattr(dr, "__getitem__") else dr[0]
                r_id = dr["room_id"] if hasattr(dr, "__getitem__") else dr[1]
                if t_id:
                    deleted_test_ids.add(str(t_id))
                if r_id:
                    deleted_test_ids.add(str(r_id))
        except Exception:
            pass

        c.execute("""
            SELECT rp.room_id, rp.marks, rp.score, rp.is_finished, rp.finished_at, rp.is_late,
                   rp.current_question_index, rp.answers
            FROM room_participants rp
            WHERE rp.user_id = ?
        """, (user_id,))
        for ar in c.fetchall():
            ad = dict(ar) if hasattr(ar, "keys") else {
                "room_id": ar[0], "marks": ar[1], "score": ar[2],
                "is_finished": ar[3], "finished_at": ar[4], "is_late": ar[5],
                "current_question_index": ar[6], "answers": ar[7]
            }
            user_attempts_map[ad["room_id"]] = ad

    # Count total attempts per room
    c.execute("""
        SELECT room_id, count(*) as cnt, sum(case when is_late = 0 then 1 else 0 end) as on_time_cnt
        FROM room_participants
        WHERE is_finished = 1
        GROUP BY room_id
    """)
    counts_map = {}
    for cr in c.fetchall():
        r_id = cr[0]
        cnt = cr[1]
        on_time = cr[2]
        counts_map[r_id] = {"total": cnt, "on_time": on_time, "late": cnt - on_time}

    all_tests = []
    upcoming = []
    active = []
    pending = []
    completed = []

    for r in rows:
        t = dict(r) if hasattr(r, "keys") else {
            "id": r[0], "room_id": r[1], "title": r[2], "description": r[3],
            "exam_type": r[4], "difficulty": r[5], "duration_minutes": r[6],
            "total_questions": r[7], "total_marks": r[8], "question_ids": r[9],
            "subjects": r[10], "chapters": r[11], "scheduled_start_time": r[12],
            "deadline_time": r[13], "assigned_user_ids": r[14], "created_by_user_id": r[15],
            "status": r[16], "created_at": r[17], "room_code": r[18]
        }

        # If deleted/hidden for this user account, do not include in tests catalog
        if str(t["id"]) in deleted_test_ids or str(t["room_id"]) in deleted_test_ids:
            continue

        # Parse assigned users
        try:
            assigned_ids = json.loads(t["assigned_user_ids"]) if isinstance(t["assigned_user_ids"], str) else t["assigned_user_ids"]
        except Exception:
            assigned_ids = ["*"]

        is_assigned = True
        if assigned_ids != ["*"] and user_id:
            is_assigned = (user_id in assigned_ids)
        elif assigned_ids != ["*"] and not user_id:
            is_assigned = False

        start_dt = _parse_iso(t["scheduled_start_time"])
        deadline_dt = _parse_iso(t["deadline_time"])

        is_upcoming = (now_dt < start_dt)
        is_active_window = (now_dt >= start_dt and now_dt <= deadline_dt)
        is_past_deadline = (now_dt > deadline_dt)

        user_attempt = user_attempts_map.get(t["room_id"])
        is_completed = bool(user_attempt and user_attempt.get("is_finished"))

        # Calculate accuracy if completed
        acc_pct = 0.0
        if is_completed and user_attempt.get("answers"):
            try:
                ans_data = json.loads(user_attempt["answers"]) if isinstance(user_attempt["answers"], str) else user_attempt["answers"]
                if isinstance(ans_data, dict):
                    att_items = [
                        v for k, v in ans_data.items()
                        if not str(k).startswith("__")
                        and isinstance(v, dict)
                        and v.get("selected") not in ("NONE", "SKIPPED", "", None)
                        and v.get("attempted") is not False
                    ]
                    corr = sum(1 for a in att_items if bool(a.get("correct") or a.get("is_correct") or a.get("is_dropped")))
                    acc_pct = round((corr / len(att_items)) * 100, 1) if att_items else 0.0
            except Exception:
                acc_pct = 0.0

        p_stats = counts_map.get(t["room_id"], {"total": 0, "on_time": 0, "late": 0})

        parsed_subjects = []
        try:
            parsed_subjects = json.loads(t["subjects"]) if isinstance(t["subjects"], str) else t["subjects"]
        except Exception:
            parsed_subjects = ["Physics", "Chemistry", "Mathematics"]

        parsed_chapters = []
        try:
            parsed_chapters = json.loads(t["chapters"]) if isinstance(t["chapters"], str) else (t["chapters"] or [])
        except Exception:
            parsed_chapters = []

        test_item = {
            "id": t["id"],
            "room_id": t["room_id"],
            "room_code": t["room_code"],
            "title": t["title"],
            "description": t["description"] or "",
            "exam_type": t["exam_type"],
            "difficulty": t["difficulty"],
            "duration_minutes": t["duration_minutes"],
            "total_questions": t["total_questions"],
            "total_marks": t["total_marks"],
            "subjects": parsed_subjects,
            "chapters": parsed_chapters,
            "scheduled_start_time": t["scheduled_start_time"],
            "deadline_time": t["deadline_time"],
            "assigned_user_ids": assigned_ids,
            "is_assigned": is_assigned,
            "is_upcoming": is_upcoming,
            "is_active_window": is_active_window,
            "is_past_deadline": is_past_deadline,
            "is_completed": is_completed,
            "participants_count": p_stats["total"],
            "on_time_count": p_stats["on_time"],
            "late_count": p_stats["late"],
            "created_at": t["created_at"],
            "created_by_user_id": t["created_by_user_id"]
        }

        if is_completed:
            test_item["user_attempt"] = {
                "score": user_attempt.get("score", 0),
                "marks": user_attempt.get("marks", 0.0),
                "accuracy": acc_pct,
                "is_late": bool(user_attempt.get("is_late")),
                "finished_at": user_attempt.get("finished_at")
            }

        all_tests.append(test_item)

        if is_upcoming:
            upcoming.append(test_item)
        elif is_active_window and not is_completed:
            active.append(test_item)

        if is_assigned and not is_completed and not is_upcoming:
            pending.append(test_item)

        if is_completed:
            completed.append(test_item)

    conn.close()

    return {
        "all": all_tests,
        "upcoming": upcoming,
        "active": active,
        "pending": pending,
        "completed": completed
    }


@router.post("/{test_id}/start")
def start_scheduled_test(
    test_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Starts or resumes an assigned scheduled test session for the current candidate.
    Enforces that start_time has arrived. Automatically assigns candidate to the room.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT st.*, r.code as room_code, r.id as room_id
        FROM scheduled_tests st
        JOIN rooms r ON st.room_id = r.id
        WHERE st.id = ? AND st.status != 'DELETED'
    """, (test_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Scheduled test not found.")

    test = dict(row) if hasattr(row, "keys") else {
        "id": row[0], "room_id": row[1], "title": row[2], "scheduled_start_time": row[12],
        "deadline_time": row[13], "assigned_user_ids": row[14], "room_code": row[18]
    }

    # Verify scheduled start time
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    start_dt = _parse_iso(test["scheduled_start_time"])
    if now_dt < start_dt:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"Test is locked. Unlocks at {start_dt.strftime('%b %d, %Y %I:%M %p UTC')}."
        )

    # Verify deadline time: CBT mode is closed once the examination reaches its deadline
    deadline_dt = _parse_iso(test["deadline_time"])
    if now_dt > deadline_dt:
        # Check if candidate had already finished before the deadline
        c.execute("SELECT is_finished FROM room_participants WHERE room_id = ? AND user_id = ?", (test["room_id"], user["id"]))
        p_row = c.fetchone()
        is_finished = bool(p_row[0]) if p_row else False
        if not is_finished:
            conn.close()
            raise HTTPException(
                status_code=403,
                detail="The deadline for this examination has passed. Computer Based Test (CBT) mode is closed for this examination. You can download the question paper PDF to practice offline."
            )

    # Check assignment
    try:
        assigned = json.loads(test["assigned_user_ids"]) if isinstance(test["assigned_user_ids"], str) else test["assigned_user_ids"]
    except Exception:
        assigned = ["*"]

    if assigned != ["*"] and user["id"] not in assigned:
        conn.close()
        raise HTTPException(status_code=403, detail="You are not assigned to this scheduled exam.")

    room_id = test["room_id"]
    room_code = test["room_code"]

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Ensure associated room status is IN_PROGRESS
    c.execute("""
        UPDATE rooms
        SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?)
        WHERE id = ? AND status != 'IN_PROGRESS'
    """, (now_iso, room_id))

    # Check if participant row exists, if not, create it
    c.execute("SELECT * FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, user["id"]))
    p_row = c.fetchone()

    if not p_row:
        c.execute("""
            INSERT INTO room_participants (
                room_id, user_id, current_question_index, score, marks, answers,
                is_finished, finished_at, question_started_at, is_late
            ) VALUES (
                ?, ?, 0, 0, 0.0, '{}',
                0, NULL, ?, 0
            )
        """, (room_id, user["id"], now_iso))
        conn.commit()
    else:
        # If participant exists and question_started_at is not set, set it now
        p_dict = dict(p_row) if hasattr(p_row, "keys") else {}
        if not p_dict.get("question_started_at"):
            c.execute("""
                UPDATE room_participants
                SET question_started_at = ?
                WHERE room_id = ? AND user_id = ? AND question_started_at IS NULL
            """, (now_iso, room_id, user["id"]))
            conn.commit()

    conn.close()

    # Retrieve full room state to launch directly into MockTestView
    room_state = get_room_state(room_code, user)
    room_dict = room_state.dict() if hasattr(room_state, "dict") else dict(room_state)
    room_dict["is_scheduled"] = True
    room_dict["scheduled_test_id"] = test_id

    return {
        "status": "ok",
        "room_code": room_code,
        "test_id": test_id,
        "title": test["title"],
        "room": room_dict
    }


@router.get("/{test_id}/paper")
def get_scheduled_test_paper(
    test_id: str,
    user: Optional[dict] = Depends(get_optional_user)
):
    """
    Returns the complete question paper and solution answer key for an unlocked scheduled test.
    Used for offline practice and printable PDF export when CBT mode is finished or expired.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT st.*, r.code as room_code
        FROM scheduled_tests st
        JOIN rooms r ON st.room_id = r.id
        WHERE st.id = ? AND st.status != 'DELETED'
    """, (test_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Scheduled test not found.")

    test = dict(row) if hasattr(row, "keys") else {
        "id": row[0], "room_id": row[1], "title": row[2], "description": row[3],
        "exam_type": row[4], "difficulty": row[5], "duration_minutes": row[6],
        "total_questions": row[7], "total_marks": row[8], "question_ids": row[9],
        "subjects": row[10], "chapters": row[11], "scheduled_start_time": row[12],
        "deadline_time": row[13], "assigned_user_ids": row[14], "created_by_user_id": row[15],
        "status": row[16], "created_at": row[17], "room_code": row[18]
    }

    # Verify timing: paper cannot be accessed before scheduled examination deadline has passed
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    start_dt = _parse_iso(test["scheduled_start_time"])
    deadline_dt = _parse_iso(test["deadline_time"])
    if now_dt < start_dt:
        conn.close()
        raise HTTPException(
            status_code=403,
            detail=f"Question paper is sealed. Examination unlocks on {start_dt.strftime('%b %d, %Y %I:%M %p UTC')}."
        )
    if now_dt < deadline_dt:
        conn.close()
        raise HTTPException(
            status_code=403,
            detail=f"Question paper PDF is sealed until the examination deadline has passed ({deadline_dt.strftime('%b %d, %Y %I:%M %p UTC')}). During the active window, the test must be taken in CBT mode."
        )

    # Check assignment
    try:
        assigned = json.loads(test["assigned_user_ids"]) if isinstance(test["assigned_user_ids"], str) else test["assigned_user_ids"]
    except Exception:
        assigned = ["*"]

    user_id = user.get("id") if user else None
    if assigned != ["*"] and user_id and user_id not in assigned:
        conn.close()
        raise HTTPException(status_code=403, detail="You are not assigned to this examination.")

    # Parse questions
    try:
        q_ids = json.loads(test["question_ids"]) if isinstance(test["question_ids"], str) else test["question_ids"]
    except Exception:
        q_ids = []

    from backend.app.tools.question_cache import get_questions_cached_batch
    from backend.app.routes.questions import row_to_question_out
    q_batch_map = get_questions_cached_batch(q_ids, cursor=c)

    raw_list = []
    for q_id in q_ids:
        qd = q_batch_map.get(str(q_id))
        if qd:
            raw_list.append(qd)

    subj_sort = {"physics": 1, "chemistry": 2, "mathematics": 3, "maths": 3}
    raw_list.sort(key=lambda q: (subj_sort.get((q.get("subject") or "").lower(), 99), str(q.get("id"))))

    exam_type = str(test.get("exam_type", "MAIN")).upper()
    correct_mark = 4
    incorrect_mark = -1 if exam_type == "MAIN" else -2

    questions_out = []
    answer_key = []

    for idx, qd in enumerate(raw_list, start=1):
        q_out = row_to_question_out(qd)
        q_dict = q_out.dict() if hasattr(q_out, "dict") else dict(q_out)
        q_dict["qnum"] = idx
        q_dict["correct_mark"] = correct_mark
        q_dict["incorrect_mark"] = 0 if q_dict.get("question_type") == "NUMERICAL" else incorrect_mark
        questions_out.append(q_dict)

        corr_ans = str(qd.get("correct_answer") or "").strip()
        answer_key.append({
            "qnum": idx,
            "subject": q_dict.get("subject"),
            "question_type": q_dict.get("question_type"),
            "correct_answer": corr_ans,
            "solution_text": qd.get("solution_text") or ""
        })

    conn.close()

    parsed_subjects = []
    try:
        parsed_subjects = json.loads(test["subjects"]) if isinstance(test["subjects"], str) else test["subjects"]
    except Exception:
        parsed_subjects = ["Physics", "Chemistry", "Mathematics"]

    parsed_chapters = []
    try:
        parsed_chapters = json.loads(test["chapters"]) if isinstance(test["chapters"], str) else (test["chapters"] or [])
    except Exception:
        parsed_chapters = []

    return {
        "status": "ok",
        "test_id": test_id,
        "room_code": test["room_code"],
        "title": test["title"],
        "description": test["description"] or "",
        "exam_type": test["exam_type"],
        "duration_minutes": test["duration_minutes"],
        "total_questions": len(questions_out),
        "total_marks": test["total_marks"],
        "subjects": parsed_subjects,
        "chapters": parsed_chapters,
        "scheduled_start_time": test["scheduled_start_time"],
        "deadline_time": test["deadline_time"],
        "marking_scheme": {
            "correct": correct_mark,
            "incorrect": incorrect_mark,
            "numerical_incorrect": 0
        },
        "questions": questions_out,
        "answer_key": answer_key
    }


@router.get("/{test_id}/leaderboard")
def get_scheduled_test_leaderboard(
    test_id: str,
    user: Optional[dict] = Depends(get_optional_user)
):
    """
    Returns Two-Tier Leaderboard:
    1. Official Standings (On-time submissions completed before deadline)
    2. Late Standings (Submissions completed after deadline)
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT st.*, r.code as room_code
        FROM scheduled_tests st
        JOIN rooms r ON st.room_id = r.id
        WHERE st.id = ?
    """, (test_id,))
    test_row = c.fetchone()
    if not test_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Scheduled test not found.")

    t = dict(test_row) if hasattr(test_row, "keys") else {
        "id": test_row[0], "room_id": test_row[1], "title": test_row[2],
        "exam_type": test_row[4], "total_questions": test_row[7], "total_marks": test_row[8],
        "scheduled_start_time": test_row[12], "deadline_time": test_row[13],
        "room_code": test_row[18]
    }

    # Fetch all finished participant records
    c.execute("""
        SELECT rp.user_id, rp.marks, rp.score, rp.answers, rp.finished_at, rp.is_late,
               u.username, u.avatar_id, u.current_division, u.overall_elo, u.title as user_title
        FROM room_participants rp
        JOIN users u ON rp.user_id = u.id
        WHERE rp.room_id = ? AND rp.is_finished = 1
        ORDER BY rp.marks DESC, rp.finished_at ASC
    """, (t["room_id"],))
    attempts = c.fetchall()
    conn.close()

    official_list = []
    late_list = []

    for idx, att in enumerate(attempts):
        a = dict(att) if hasattr(att, "keys") else {
            "user_id": att[0], "marks": att[1], "score": att[2], "answers": att[3],
            "finished_at": att[4], "is_late": att[5], "username": att[6],
            "avatar_id": att[7], "current_division": att[8], "overall_elo": att[9],
            "user_title": att[10]
        }

        # Calculate accuracy, correct count, and attempted count
        correct_cnt = 0
        attempted_cnt = 0
        try:
            ans_map = json.loads(a["answers"]) if isinstance(a["answers"], str) else a["answers"]
            if isinstance(ans_map, dict):
                att_items = [
                    v for k, v in ans_map.items()
                    if not str(k).startswith("__")
                    and isinstance(v, dict)
                    and v.get("selected") not in ("NONE", "SKIPPED", "", None)
                    and v.get("attempted") is not False
                ]
                attempted_cnt = len(att_items)
                correct_cnt = sum(1 for v in att_items if bool(v.get("correct") or v.get("is_correct") or v.get("is_dropped")))
        except Exception:
            pass

        acc_pct = round((correct_cnt / attempted_cnt) * 100, 1) if attempted_cnt > 0 else 0.0

        item = {
            "user_id": a["user_id"],
            "username": a["username"],
            "avatar_id": a["avatar_id"] or "default",
            "current_division": a["current_division"] or "BRONZE",
            "overall_elo": round(a["overall_elo"] or 1500),
            "user_title": a["user_title"] or "Aspirant",
            "marks": a["marks"],
            "accuracy": acc_pct,
            "correct_count": correct_cnt,
            "attempted_count": attempted_cnt,
            "finished_at": a["finished_at"],
            "is_late": bool(a["is_late"])
        }

        if not a["is_late"]:
            item["rank"] = len(official_list) + 1
            official_list.append(item)
        else:
            item["rank"] = len(late_list) + 1
            late_list.append(item)

    now_dt = datetime.datetime.now(datetime.timezone.utc)
    deadline_dt = _parse_iso(t["deadline_time"])

    return {
        "test": {
            "id": t["id"],
            "title": t["title"],
            "room_code": t["room_code"],
            "exam_type": t["exam_type"],
            "total_questions": t["total_questions"],
            "total_marks": t["total_marks"],
            "scheduled_start_time": t["scheduled_start_time"],
            "deadline_time": t["deadline_time"],
            "is_past_deadline": (now_dt > deadline_dt)
        },
        "official_standings": official_list,
        "late_standings": late_list,
        "total_official": len(official_list),
        "total_late": len(late_list)
    }


@router.delete("/{test_id}")
def delete_or_unschedule_test(
    test_id: str,
    user: dict = Depends(get_current_user)
):
    """
    1. If the calling user is the CREATOR:
       Allows unscheduling and permanently deleting the test before release (or if unattempted).
       Marks scheduled_test as DELETED, marks room as DELETED, wipes unreleased room.
    2. If the calling user is an ASSIGNED ASPIRANT:
       Removes the test for this account (hiding it from their tests catalog and wiping any participant history).
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM scheduled_tests WHERE id = ?", (test_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Scheduled test not found.")

    test = dict(row) if hasattr(row, "keys") else {
        "id": row[0], "room_id": row[1], "title": row[2], "scheduled_start_time": row[12],
        "created_by_user_id": row[15], "status": row[16]
    }
    room_id = test["room_id"]
    user_id = str(user["id"])
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    is_creator = str(test.get("created_by_user_id")) == user_id
    now_iso = now_dt.isoformat()

    if is_creator:
        # Creator unscheduling / deleting before it releases or managing their test
        c.execute("UPDATE scheduled_tests SET status = 'DELETED' WHERE id = ?", (test_id,))
        c.execute("UPDATE rooms SET status = 'DELETED' WHERE id = ?", (room_id,))
        c.execute("DELETE FROM room_participants WHERE room_id = ? AND is_finished = 0", (room_id,))
        try:
            c.execute("DELETE FROM user_notifications WHERE link LIKE ?", (f"%{test_id}%",))
        except Exception:
            pass
        c.execute("""
            INSERT OR REPLACE INTO user_deleted_tests (user_id, test_id, room_id, deleted_at)
            VALUES (?, ?, ?, ?)
        """, (user_id, test_id, room_id, now_iso))
        conn.commit()
        conn.close()
        return {
            "status": "success",
            "action": "unscheduled",
            "message": f"Scheduled test '{test['title']}' has been unscheduled and deleted."
        }
    else:
        # Assigned aspirant removing the test for their account
        c.execute("""
            INSERT OR REPLACE INTO user_deleted_tests (user_id, test_id, room_id, deleted_at)
            VALUES (?, ?, ?, ?)
        """, (user_id, test_id, room_id, now_iso))
        c.execute("DELETE FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, user_id))
        conn.commit()
        conn.close()
        return {
            "status": "success",
            "action": "removed_for_account",
            "message": f"Test '{test['title']}' has been removed from your tests and history."
        }
