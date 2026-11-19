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
    if user_id:
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
                corr = sum(1 for a in ans_data.values() if a.get("is_correct"))
                tot = len(ans_data)
                acc_pct = round((corr / tot) * 100, 1) if tot > 0 else 0.0
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

        # Calculate accuracy and correct count
        correct_cnt = 0
        total_ans = 0
        try:
            ans_map = json.loads(a["answers"]) if isinstance(a["answers"], str) else a["answers"]
            correct_cnt = sum(1 for item in ans_map.values() if item.get("is_correct"))
            total_ans = len(ans_map)
        except Exception:
            pass

        acc_pct = round((correct_cnt / total_ans) * 100, 1) if total_ans > 0 else 0.0

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
            "attempted_count": total_ans,
            "finished_at": a["finished_at"],
            "is_late": bool(a["is_late"])
        }

        if not a["is_late"]:
            item["rank"] = len(official_list) + 1
            official_list.append(item)
        else:
            item["rank"] = len(late_list) + 1
            late_list.append(item)

    return {
        "test": {
            "id": t["id"],
            "title": t["title"],
            "room_code": t["room_code"],
            "exam_type": t["exam_type"],
            "total_questions": t["total_questions"],
            "total_marks": t["total_marks"],
            "scheduled_start_time": t["scheduled_start_time"],
            "deadline_time": t["deadline_time"]
        },
        "official_standings": official_list,
        "late_standings": late_list,
        "total_official": len(official_list),
        "total_late": len(late_list)
    }
