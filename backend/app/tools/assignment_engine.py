"""
Daily Assignments Engine for JEE Rivals (LazyPriyam Exclusive).
Manages Daily Elite Capsules (3-5 problems) and Weekend Titan Sheets (10-12 problems),
sampling strictly from the aspirant's active learnt chapters.
Supports dual-track pipeline (Elite Subjective + Verified Objective),
cognitive scratchpad auto-saving, and 4-tag struggle reflection analytics.
"""

import sqlite3
import json
import uuid
import datetime
import random
from typing import Optional, List, Dict, Any, Tuple

from backend.app.tools.jee_syllabus import normalize_chapter_name, get_chapter_subject

CANONICAL_SUBJECTS = ("Physics", "Chemistry", "Mathematics")

# Canonical struggle reflection tags
VALID_REFLECTION_TAGS = {
    "BREAKTHROUGH",       # ⚡ Clean Breakthrough (<10m)
    "DEEP_DERIVATION",    # ⏳ Deep Derivation (15-25m)
    "HINT_CONSULTED",     # 🔍 Consulted Book Hint / Formula
    "CONCEPT_TRAP",       # 🛑 Stuck / Concept Trap
}

# Canonical subjective self-evaluation ratings
VALID_SELF_RATINGS = {
    "CLEAN",              # Solved cleanly without consulting solution
    "PARTIAL",            # Solved partially or with intermediate verification
    "SOLUTION_NEEDED",    # Needed full book solution / couldn't crack
}


def _get_user_learnt_chapters(conn: sqlite3.Connection, user_id: str) -> List[str]:
    """Retrieves and normalizes the user's active learnt chapters from users table."""
    c = conn.cursor()
    c.execute("SELECT learnt_chapters FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    if not row or not row[0]:
        return []
    try:
        raw_list = json.loads(row[0]) if isinstance(row[0], str) else row[0]
        if not isinstance(raw_list, list):
            return []
        norm = []
        for ch in raw_list:
            if ch and str(ch).strip():
                nc = normalize_chapter_name(str(ch).strip())
                if nc and nc not in norm:
                    norm.append(nc)
        return norm
    except Exception:
        return []


def _mask_question_for_session(q: dict, reflection: Optional[dict] = None) -> dict:
    """
    Returns a client-safe projection of a question for active solving.
    Subjective questions never expose answers.
    Objective questions reveal official key/solution only after reflection is logged.
    """
    q_type = str(q.get("question_type") or "SINGLE_CHOICE").upper()
    is_subjective = q_type == "SUBJECTIVE"
    has_reflected = reflection is not None and bool(reflection.get("reflection_tag") or reflection.get("self_rating"))

    safe_q = {
        "id": q.get("id"),
        "subject": q.get("subject"),
        "unit": q.get("unit"),
        "chapter": q.get("chapter"),
        "question_type": q_type,
        "text": q.get("text"),
        "options": q.get("options"),
        "has_diagram": q.get("has_diagram", 0),
        "diagram_urls": q.get("diagram_urls"),
        "difficulty_tier": q.get("difficulty_tier", "HARD"),
        "elo_rating": q.get("elo_rating", 1600),
        "source_book": q.get("source_book"),
        "source_page": q.get("source_page"),
        "source_qnum": q.get("source_qnum"),
        "source_section": q.get("source_section"),
        "is_subjective": is_subjective,
    }

    # Answer and solution masking
    if is_subjective:
        safe_q["correct_answer"] = None
        # Only expose solution text if user has reflected and solution exists
        safe_q["solution_text"] = q.get("solution_text") if has_reflected else None
    else:
        # Objective question: reveal official answer and solution if reflected
        safe_q["correct_answer"] = q.get("correct_answer") if has_reflected else None
        safe_q["solution_text"] = q.get("solution_text") if has_reflected else None

    # Attach any existing reflection
    safe_q["reflection"] = reflection
    return safe_q


def generate_daily_assignment(
    conn: sqlite3.Connection,
    user: dict,
    batch_type: str = "DAILY",
    force_new: bool = False
) -> Dict[str, Any]:
    """
    Generates a new Daily Elite Capsule or Weekend Titan Sheet,
    sampling strictly from the user's active learnt chapters.
    """
    user_id = user["id"]
    batch_type = batch_type.upper().strip()
    if batch_type not in ("DAILY", "WEEKEND"):
        batch_type = "DAILY"

    today_str = datetime.date.today().isoformat()
    c = conn.cursor()

    # 1. Check for existing active assignment today unless force_new is requested
    if not force_new:
        c.execute("""
            SELECT id, user_id, assignment_date, batch_type, title, status,
                   total_questions, completed_questions, questions_data, created_at, completed_at
            FROM daily_assignments
            WHERE user_id = ? AND assignment_date = ? AND batch_type = ? AND status = 'IN_PROGRESS'
            ORDER BY created_at DESC LIMIT 1
        """, (user_id, today_str, batch_type))
        existing_row = c.fetchone()
        if existing_row:
            return get_assignment_by_id(conn, user_id, existing_row[0])

    # 2. Retrieve user's learnt chapters
    learnt_chapters = _get_user_learnt_chapters(conn, user_id)
    if not learnt_chapters:
        return {
            "success": False,
            "code": "NO_LEARNT_CHAPTERS",
            "message": "No chapters marked as learnt yet. Mark completed chapters in the Skill Tree to unlock Daily Assignments.",
            "assignment": None
        }

    # Group learnt chapters by canonical subject
    subj_chapters: Dict[str, List[str]] = {s: [] for s in CANONICAL_SUBJECTS}
    for ch in learnt_chapters:
        subj = get_chapter_subject(ch)
        if subj in subj_chapters:
            subj_chapters[subj].append(ch)

    active_subjects = [s for s in CANONICAL_SUBJECTS if len(subj_chapters[s]) > 0]
    if not active_subjects:
        active_subjects = list(CANONICAL_SUBJECTS)

    # 3. Determine target counts
    # Daily Capsule: 3 to 5 questions (default 4)
    # Weekend Titan: 10 to 12 questions (default 10)
    if batch_type == "DAILY":
        target_count = 4
    else:
        target_count = 10

    # Distribute quotas across subjects evenly
    quotas: Dict[str, int] = {}
    base = target_count // len(active_subjects)
    rem = target_count % len(active_subjects)
    for i, s in enumerate(active_subjects):
        quotas[s] = base + (1 if i < rem else 0)

    # 4. Fetch questions previously assigned in the last 7 days to maximize variety
    seven_days_ago = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
    c.execute("""
        SELECT question_id FROM assignment_reflections
        WHERE user_id = ? AND created_at >= ?
    """, (user_id, seven_days_ago))
    recent_assigned_ids = {row[0] for row in c.fetchall()}

    selected_questions: List[dict] = []
    selected_ids = set()

    for subj in active_subjects:
        ch_list = subj_chapters.get(subj, [])
        if not ch_list:
            continue
        subj_quota = quotas.get(subj, 0)
        if subj_quota <= 0:
            continue

        placeholders = ",".join("?" for _ in ch_list)

        # A. Fetch candidate Subjective questions for this subject & learnt chapters
        c.execute(f"""
            SELECT id, subject, unit, chapter, question_type, text, options,
                   has_diagram, diagram_urls, correct_answer, solution_text,
                   difficulty_tier, elo_rating, source_book, source_page,
                   source_qnum, source_section
            FROM questions
            WHERE subject = ? AND chapter IN ({placeholders}) AND question_type = 'SUBJECTIVE'
        """, [subj] + ch_list)
        subjective_rows = c.fetchall()

        # Convert to dicts
        col_names = [
            "id", "subject", "unit", "chapter", "question_type", "text", "options",
            "has_diagram", "diagram_urls", "correct_answer", "solution_text",
            "difficulty_tier", "elo_rating", "source_book", "source_page",
            "source_qnum", "source_section"
        ]
        subj_candidates = [dict(zip(col_names, row)) for row in subjective_rows]

        # Prioritize unassigned subjective questions
        unseen_subj = [q for q in subj_candidates if q["id"] not in recent_assigned_ids and q["id"] not in selected_ids]
        if not unseen_subj and subj_candidates:
            unseen_subj = [q for q in subj_candidates if q["id"] not in selected_ids]

        # Pick at least 1 subjective problem if available (or up to 2 for weekend)
        max_subj_to_pick = 2 if batch_type == "WEEKEND" else 1
        picked_subj_count = 0
        if unseen_subj:
            random.shuffle(unseen_subj)
            for q in unseen_subj[:max_subj_to_pick]:
                selected_questions.append(q)
                selected_ids.add(q["id"])
                picked_subj_count += 1

        # B. Fill remaining quota with high-caliber Objective questions (Numerical, Multi-Choice, Single-Choice)
        needed_obj = subj_quota - picked_subj_count
        if needed_obj > 0:
            c.execute(f"""
                SELECT id, subject, unit, chapter, question_type, text, options,
                       has_diagram, diagram_urls, correct_answer, solution_text,
                       difficulty_tier, elo_rating, source_book, source_page,
                       source_qnum, source_section
                FROM questions
                WHERE subject = ? AND chapter IN ({placeholders}) AND question_type != 'SUBJECTIVE'
                  AND validation_status = 'VALIDATED'
                ORDER BY elo_rating DESC
                LIMIT 150
            """, [subj] + ch_list)
            obj_rows = c.fetchall()
            obj_candidates = [dict(zip(col_names, row)) for row in obj_rows]

            unseen_obj = [q for q in obj_candidates if q["id"] not in recent_assigned_ids and q["id"] not in selected_ids]
            if len(unseen_obj) < needed_obj:
                unseen_obj = [q for q in obj_candidates if q["id"] not in selected_ids]

            random.shuffle(unseen_obj)
            for q in unseen_obj[:needed_obj]:
                selected_questions.append(q)
                selected_ids.add(q["id"])

    # Shuffle the sheet slightly so questions are interleaved across subjects
    random.shuffle(selected_questions)

    # 5. Insert new assignment record
    assignment_id = f"asgn_{uuid.uuid4().hex[:12]}"
    formatted_date = datetime.date.today().strftime("%b %d, %Y")
    title = f"Daily Elite Capsule - {formatted_date}" if batch_type == "DAILY" else f"Weekend Titan Sheet - {formatted_date}"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    c.execute("""
        INSERT INTO daily_assignments (
            id, user_id, assignment_date, batch_type, title, status,
            total_questions, completed_questions, questions_data, created_at
        ) VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, 0, ?, ?)
    """, (
        assignment_id,
        user_id,
        today_str,
        batch_type,
        title,
        len(selected_questions),
        json.dumps(selected_questions),
        now_iso
    ))
    conn.commit()

    return get_assignment_by_id(conn, user_id, assignment_id)


def get_assignment_by_id(conn: sqlite3.Connection, user_id: str, assignment_id: str) -> Optional[Dict[str, Any]]:
    """Fetches an assignment by ID, validates ownership, and attaches user reflections."""
    c = conn.cursor()
    c.execute("""
        SELECT id, user_id, assignment_date, batch_type, title, status,
               total_questions, completed_questions, questions_data, created_at, completed_at
        FROM daily_assignments
        WHERE id = ? AND user_id = ?
    """, (assignment_id, user_id))
    row = c.fetchone()
    if not row:
        return None

    raw_qs = []
    if row[8]:
        try:
            raw_qs = json.loads(row[8]) if isinstance(row[8], str) else row[8]
        except Exception:
            raw_qs = []

    # Fetch reflections for this assignment
    c.execute("""
        SELECT question_id, reflection_tag, self_rating, user_answer,
               scratchpad_notes, time_spent_seconds, is_correct, created_at, updated_at
        FROM assignment_reflections
        WHERE assignment_id = ? AND user_id = ?
    """, (assignment_id, user_id))
    reflections_map = {}
    for r in c.fetchall():
        reflections_map[r[0]] = {
            "question_id": r[0],
            "reflection_tag": r[1],
            "self_rating": r[2],
            "user_answer": r[3],
            "scratchpad_notes": r[4] or "",
            "time_spent_seconds": r[5] or 0,
            "is_correct": r[6],
            "created_at": r[7],
            "updated_at": r[8],
        }

    # Project masked questions for client
    projected_qs = []
    for q in raw_qs:
        ref = reflections_map.get(q.get("id"))
        projected_qs.append(_mask_question_for_session(q, ref))

    completed_count = len(reflections_map)

    return {
        "success": True,
        "assignment": {
            "id": row[0],
            "user_id": row[1],
            "assignment_date": row[2],
            "batch_type": row[3],
            "title": row[4],
            "status": row[5],
            "total_questions": row[6],
            "completed_questions": completed_count,
            "questions": projected_qs,
            "created_at": row[9],
            "completed_at": row[10],
            "is_all_reflected": completed_count >= len(projected_qs) and len(projected_qs) > 0,
        }
    }


def get_active_or_latest_assignment(conn: sqlite3.Connection, user_id: str) -> Optional[Dict[str, Any]]:
    """Returns today's active in-progress assignment or the most recent one for user."""
    today_str = datetime.date.today().isoformat()
    c = conn.cursor()

    # Look for active assignment today
    c.execute("""
        SELECT id FROM daily_assignments
        WHERE user_id = ? AND assignment_date = ? AND status = 'IN_PROGRESS'
        ORDER BY created_at DESC LIMIT 1
    """, (user_id, today_str))
    row = c.fetchone()
    if row:
        return get_assignment_by_id(conn, user_id, row[0])

    # Fallback to latest assignment ever
    c.execute("""
        SELECT id FROM daily_assignments
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 1
    """, (user_id,))
    row = c.fetchone()
    if row:
        return get_assignment_by_id(conn, user_id, row[0])

    return None


def submit_question_reflection(
    conn: sqlite3.Connection,
    user_id: str,
    assignment_id: str,
    question_id: str,
    payload: dict
) -> Dict[str, Any]:
    """
    Submits or updates a question's struggle reflection, self-evaluation, and scratchpad notes.
    """
    c = conn.cursor()

    # 1. Verify assignment belongs to user
    c.execute("SELECT status, questions_data FROM daily_assignments WHERE id = ? AND user_id = ?", (assignment_id, user_id))
    asgn_row = c.fetchone()
    if not asgn_row:
        return {"success": False, "error": "Assignment not found or unauthorized"}

    asgn_status = asgn_row[0]
    questions_data = json.loads(asgn_row[1]) if asgn_row[1] else []
    target_q = next((q for q in questions_data if q.get("id") == question_id), None)
    if not target_q:
        return {"success": False, "error": "Question not found in assignment"}

    # Extract reflection fields
    reflection_tag = payload.get("reflection_tag")
    if reflection_tag and reflection_tag not in VALID_REFLECTION_TAGS:
        reflection_tag = None

    self_rating = payload.get("self_rating")
    if self_rating and self_rating not in VALID_SELF_RATINGS:
        self_rating = None

    user_answer = payload.get("user_answer")
    scratchpad_notes = payload.get("scratchpad_notes", "")
    time_spent_seconds = max(0, int(payload.get("time_spent_seconds", 0)))

    # Determine correctness
    q_type = str(target_q.get("question_type") or "SINGLE_CHOICE").upper()
    is_correct = None
    if q_type == "SUBJECTIVE":
        if self_rating == "CLEAN":
            is_correct = 1
        elif self_rating == "SOLUTION_NEEDED":
            is_correct = 0
    else:
        # Objective check
        corr = str(target_q.get("correct_answer") or "").strip().upper()
        if user_answer and corr:
            is_correct = 1 if str(user_answer).strip().upper() == corr else 0

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    reflection_id = f"refl_{uuid.uuid4().hex[:12]}"

    # Upsert reflection
    c.execute("""
        INSERT INTO assignment_reflections (
            id, assignment_id, user_id, question_id, subject, chapter,
            question_type, reflection_tag, self_rating, user_answer,
            scratchpad_notes, time_spent_seconds, is_correct, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(assignment_id, question_id) DO UPDATE SET
            reflection_tag = excluded.reflection_tag,
            self_rating = excluded.self_rating,
            user_answer = excluded.user_answer,
            scratchpad_notes = excluded.scratchpad_notes,
            time_spent_seconds = excluded.time_spent_seconds,
            is_correct = excluded.is_correct,
            updated_at = excluded.updated_at
    """, (
        reflection_id,
        assignment_id,
        user_id,
        question_id,
        target_q.get("subject", "Physics"),
        target_q.get("chapter", "General"),
        q_type,
        reflection_tag,
        self_rating,
        user_answer,
        scratchpad_notes,
        time_spent_seconds,
        is_correct,
        now_iso,
        now_iso
    ))

    # Update completed_questions count
    c.execute("SELECT COUNT(*) FROM assignment_reflections WHERE assignment_id = ?", (assignment_id,))
    total_reflected = c.fetchone()[0]

    c.execute("""
        UPDATE daily_assignments
        SET completed_questions = ?
        WHERE id = ?
    """, (total_reflected, assignment_id))
    conn.commit()

    return {
        "success": True,
        "reflection": {
            "assignment_id": assignment_id,
            "question_id": question_id,
            "reflection_tag": reflection_tag,
            "self_rating": self_rating,
            "user_answer": user_answer,
            "scratchpad_notes": scratchpad_notes,
            "time_spent_seconds": time_spent_seconds,
            "is_correct": is_correct,
            "updated_at": now_iso
        },
        "solution_text": target_q.get("solution_text"),
        "correct_answer": target_q.get("correct_answer") if q_type != "SUBJECTIVE" else None,
        "completed_questions": total_reflected,
        "total_questions": len(questions_data)
    }


def complete_assignment(conn: sqlite3.Connection, user_id: str, assignment_id: str) -> Dict[str, Any]:
    """Marks assignment as completed and returns summary struggle statistics."""
    c = conn.cursor()
    c.execute("SELECT id, status, total_questions FROM daily_assignments WHERE id = ? AND user_id = ?", (assignment_id, user_id))
    row = c.fetchone()
    if not row:
        return {"success": False, "error": "Assignment not found"}

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    c.execute("""
        UPDATE daily_assignments
        SET status = 'COMPLETED', completed_at = ?
        WHERE id = ?
    """, (now_iso, assignment_id))
    conn.commit()

    # Calculate summary reflections
    c.execute("""
        SELECT reflection_tag, time_spent_seconds, is_correct
        FROM assignment_reflections
        WHERE assignment_id = ?
    """, (assignment_id,))
    rows = c.fetchall()

    tag_counts = {"BREAKTHROUGH": 0, "DEEP_DERIVATION": 0, "HINT_CONSULTED": 0, "CONCEPT_TRAP": 0}
    total_time = 0
    correct_count = 0
    for r in rows:
        tag = r[0]
        if tag in tag_counts:
            tag_counts[tag] += 1
        total_time += (r[1] or 0)
        if r[2] == 1:
            correct_count += 1

    total_reflected = len(rows)
    breakthrough_rate = round((tag_counts["BREAKTHROUGH"] / total_reflected * 100), 1) if total_reflected > 0 else 0.0

    return {
        "success": True,
        "assignment_id": assignment_id,
        "status": "COMPLETED",
        "completed_at": now_iso,
        "stats": {
            "total_questions": row[2],
            "reflected_questions": total_reflected,
            "correct_count": correct_count,
            "total_time_seconds": total_time,
            "breakthrough_rate": breakthrough_rate,
            "tag_counts": tag_counts
        }
    }


def get_assignment_history(conn: sqlite3.Connection, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Returns past assignments with struggle overview."""
    c = conn.cursor()
    c.execute("""
        SELECT id, assignment_date, batch_type, title, status,
               total_questions, completed_questions, created_at, completed_at
        FROM daily_assignments
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    """, (user_id, limit))
    rows = c.fetchall()

    history = []
    for r in rows:
        history.append({
            "id": r[0],
            "assignment_date": r[1],
            "batch_type": r[2],
            "title": r[3],
            "status": r[4],
            "total_questions": r[5],
            "completed_questions": r[6],
            "created_at": r[7],
            "completed_at": r[8],
        })
    return history


def get_assignment_insights(conn: sqlite3.Connection, user_id: str) -> Dict[str, Any]:
    """
    Computes struggle analytics:
    - Breakthrough rate
    - Average deep derivation time
    - Vulnerability Radar (chapters where hints/traps occurred most)
    - Self-eval distribution for subjective problems
    """
    c = conn.cursor()
    c.execute("""
        SELECT reflection_tag, self_rating, time_spent_seconds, subject, chapter, question_type
        FROM assignment_reflections
        WHERE user_id = ?
    """, (user_id,))
    rows = c.fetchall()

    if not rows:
        return {
            "total_reflected": 0,
            "breakthrough_rate": 0.0,
            "average_derivation_seconds": 0,
            "tag_counts": {"BREAKTHROUGH": 0, "DEEP_DERIVATION": 0, "HINT_CONSULTED": 0, "CONCEPT_TRAP": 0},
            "self_rating_counts": {"CLEAN": 0, "PARTIAL": 0, "SOLUTION_NEEDED": 0},
            "vulnerable_chapters": [],
        }

    tag_counts = {"BREAKTHROUGH": 0, "DEEP_DERIVATION": 0, "HINT_CONSULTED": 0, "CONCEPT_TRAP": 0}
    self_rating_counts = {"CLEAN": 0, "PARTIAL": 0, "SOLUTION_NEEDED": 0}
    deep_derivation_times = []
    trap_chapters: Dict[str, Dict[str, Any]] = {}

    for r in rows:
        tag, rating, t_spent, subj, chap, q_type = r[0], r[1], r[2] or 0, r[3], r[4], r[5]
        if tag in tag_counts:
            tag_counts[tag] += 1
        if rating in self_rating_counts:
            self_rating_counts[rating] += 1

        if tag == "DEEP_DERIVATION" and t_spent > 0:
            deep_derivation_times.append(t_spent)

        # Flag chapters where student needed a hint or got trapped
        if tag in ("HINT_CONSULTED", "CONCEPT_TRAP") or rating == "SOLUTION_NEEDED":
            if chap not in trap_chapters:
                trap_chapters[chap] = {"chapter": chap, "subject": subj, "friction_count": 0, "traps": 0, "hints": 0}
            trap_chapters[chap]["friction_count"] += 1
            if tag == "CONCEPT_TRAP":
                trap_chapters[chap]["traps"] += 1
            elif tag == "HINT_CONSULTED":
                trap_chapters[chap]["hints"] += 1

    total_reflected = len(rows)
    breakthrough_rate = round((tag_counts["BREAKTHROUGH"] / total_reflected * 100), 1) if total_reflected > 0 else 0.0
    avg_derivation_sec = int(sum(deep_derivation_times) / len(deep_derivation_times)) if deep_derivation_times else 0

    sorted_traps = sorted(trap_chapters.values(), key=lambda x: x["friction_count"], reverse=True)

    return {
        "total_reflected": total_reflected,
        "breakthrough_rate": breakthrough_rate,
        "average_derivation_seconds": avg_derivation_sec,
        "tag_counts": tag_counts,
        "self_rating_counts": self_rating_counts,
        "vulnerable_chapters": sorted_traps[:6],
    }
