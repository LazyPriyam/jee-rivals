"""
Implicit Cognitive FSRS (Free Spaced Repetition Scheduler) Engine.
Derives memory stability, concept difficulty, retrievability, and error archetypes
without explicit user flashcard buttons.
"""

import math
import datetime
from typing import Dict, Any, Optional, Tuple, List

# Benchmark target times per question type (in seconds)
BENCHMARK_TIMES = {
    "SINGLE_CHOICE": 90,
    "MCQ": 90,
    "MULTIPLE_CHOICE": 140,
    "MULTI_CORRECT": 140,
    "NUMERICAL": 120,
    "INTEGER": 120,
    "MATRIX_MATCH": 150,
    "COMPREHENSION": 150,
    "DEFAULT": 90
}


def derive_implicit_grade(
    is_correct: bool,
    time_spent: int,
    question_type: str = "SINGLE_CHOICE"
) -> int:
    """
    Derives standard 1-4 grade implicitly:
    1 = Again (failed, conceptual breakdown or memory lapse)
    2 = Hard (correct but strained, took > 1.4x benchmark time)
    3 = Good (correct in standard time window)
    4 = Easy (correct in rapid < 0.5x benchmark time)
    """
    bench = BENCHMARK_TIMES.get((question_type or "").upper(), BENCHMARK_TIMES["DEFAULT"])
    ratio = time_spent / max(1.0, float(bench))

    if not is_correct:
        return 1

    if ratio > 1.4:
        return 2
    elif ratio < 0.5:
        return 4
    else:
        return 3


def classify_error_archetype(
    question: dict,
    user_choice: Any,
    time_spent: int
) -> str:
    """
    Classifies student error into 4 cognitive archetypes:
    - TIME_RUSH: answered too quickly (< 15s) without genuine contemplation
    - CALCULATION_TRAP: attempted adequately, numerical/algebraic error near correct value
    - CONCEPTUAL_GAP: attempted adequately, fell into common pitfall or wrong physics principle
    - SYNTHESIS_BREAKDOWN: multi-step or comprehension failure
    """
    q_type = (question.get("question_type") or "SINGLE_CHOICE").upper()
    pitfall = question.get("common_pitfall") or ""
    correct = str(question.get("correct_answer") or "").strip()
    user_str = str(user_choice or "").strip()

    if time_spent < 18:
        return "TIME_RUSH"

    if q_type in ("NUMERICAL", "INTEGER", "SUBJECTIVE"):
        try:
            u_val = float(user_str)
            c_val = float(correct)
            # Close by factor of 10 or small margin
            if c_val != 0 and (abs(u_val / c_val - 10) < 0.1 or abs(u_val / c_val - 0.1) < 0.05 or abs(u_val + c_val) < 0.05):
                return "CALCULATION_TRAP"
            if abs(u_val - c_val) <= max(2.0, abs(c_val) * 0.2):
                return "CALCULATION_TRAP"
        except Exception:
            pass

    if q_type in ("COMPREHENSION", "MATRIX_MATCH", "MULTIPLE_CHOICE"):
        if time_spent >= 60:
            return "SYNTHESIS_BREAKDOWN"

    if pitfall and len(pitfall) > 10:
        return "CONCEPTUAL_GAP"

    return "CONCEPTUAL_GAP"


def calculate_retrievability(stability: float, elapsed_days: float) -> float:
    """
    R(t) = (1 + t / (9 * S))^(-1)
    Calculates current retrievability probability (0.0 to 1.0).
    """
    if stability <= 0:
        return 0.0
    return round((1.0 + (elapsed_days / (9.0 * stability))) ** (-1), 4)


def update_fsrs_memory(
    prev_stability: float,
    prev_difficulty: float,
    grade: int,
    elapsed_days: float
) -> Tuple[float, float, float]:
    """
    Updates Stability (S), Difficulty (D), and computes new Retrievability.
    Formulas aligned with continuous FSRS principles:
    - D ranges from 1.0 (easy) to 10.0 (brutal)
    - S represents days until R drops to 90%
    """
    # 1. Update Difficulty
    # Grade 1 increases D, Grade 4 decreases D
    d_delta = -0.8 * (grade - 3)
    new_d = max(1.0, min(10.0, prev_difficulty + d_delta))

    # 2. Update Stability
    if grade == 1:
        # Lapse / failure: stability reset to a fraction of previous
        new_s = max(0.5, prev_stability * 0.25)
    else:
        # Success: S grows exponentially scaled by difficulty and retrievability
        cur_r = calculate_retrievability(prev_stability, elapsed_days)
        # Factor rewarding retrieval when retrievability was low (desirable difficulty)
        hard_reward = 1.0 + max(0.0, 1.0 - cur_r)
        growth_factor = math.exp(0.1 * (11.0 - new_d)) * hard_reward

        if grade == 2:
            growth_factor *= 0.8
        elif grade == 4:
            growth_factor *= 1.3

        new_s = max(prev_stability + 0.5, prev_stability * (1.0 + growth_factor * 0.4))

    new_s = round(min(365.0, new_s), 2)
    new_d = round(new_d, 2)
    next_due_days = max(1, int(new_s * 0.9))

    return new_s, new_d, next_due_days


def process_question_fsrs(
    cursor,
    user_id: str,
    question: dict,
    is_correct: bool,
    user_choice: Any,
    time_spent: int
) -> Dict[str, Any]:
    """
    Full automated FSRS pipeline:
    1. Derives implicit grade and error archetype
    2. Updates stability, difficulty, retrievability in `user_fsrs_states`
    3. Schedules next cognitive due date
    """
    from backend.app.tools.jee_syllabus import normalize_chapter_name
    q_id = question.get("id")
    raw_chap = question.get("chapter", "General")
    canonical_chapter = normalize_chapter_name(raw_chap)
    now = datetime.datetime.utcnow()
    now_iso = now.isoformat()

    grade = derive_implicit_grade(is_correct, time_spent, question.get("question_type", "SINGLE_CHOICE"))
    archetype = classify_error_archetype(question, user_choice, time_spent) if not is_correct else None

    # Fetch existing state
    cursor.execute("""
        SELECT stability, difficulty, retrievability, reps, lapses, last_reviewed
        FROM user_fsrs_states
        WHERE user_id = ? AND question_id = ?
    """, (user_id, q_id))
    row = cursor.fetchone()

    if row:
        prev_s = float(row["stability"] or 2.0)
        prev_d = float(row["difficulty"] or 5.0)
        reps = int(row["reps"] or 0) + 1
        lapses = int(row["lapses"] or 0) + (1 if not is_correct else 0)

        last_rev = row["last_reviewed"]
        if last_rev:
            try:
                prev_time = datetime.datetime.fromisoformat(last_rev)
                elapsed = max(0.01, (now - prev_time).total_seconds() / 86400.0)
            except Exception:
                elapsed = 1.0
        else:
            elapsed = 1.0
    else:
        prev_s = 2.0 if is_correct else 0.8
        prev_d = 5.0
        reps = 1
        lapses = 0 if is_correct else 1
        elapsed = 0.5

    new_s, new_d, due_days = update_fsrs_memory(prev_s, prev_d, grade, elapsed)
    due_date = (now + datetime.timedelta(days=due_days)).isoformat()[:10]
    retrievability = calculate_retrievability(new_s, 0.0)  # Just reviewed, retrievability = 1.0

    cursor.execute("""
        INSERT INTO user_fsrs_states (
            user_id, question_id, chapter, stability, difficulty,
            retrievability, reps, lapses, last_grade, error_archetype,
            last_reviewed, due_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, question_id) DO UPDATE SET
            stability = excluded.stability,
            difficulty = excluded.difficulty,
            retrievability = excluded.retrievability,
            reps = excluded.reps,
            lapses = excluded.lapses,
            last_grade = excluded.last_grade,
            error_archetype = excluded.error_archetype,
            last_reviewed = excluded.last_reviewed,
            due_date = excluded.due_date
    """, (
        user_id, q_id, canonical_chapter, new_s, new_d,
        retrievability, reps, lapses, grade, archetype,
        now_iso, due_date
    ))

    return {
        "question_id": q_id,
        "chapter": canonical_chapter,
        "grade": grade,
        "stability_days": new_s,
        "difficulty": new_d,
        "due_date": due_date,
        "error_archetype": archetype
    }


def find_due_fsrs_question(
    cursor,
    user_id: str,
    subject: Optional[str] = None,
    allowed_chapters: Optional[List[str]] = None
) -> Optional[dict]:
    """
    Finds a due question where Retrievability has dropped below 0.90
    or due_date <= today, to seamlessly interleave into adaptive practice.
    """
    today_iso = datetime.datetime.utcnow().isoformat()[:10]

    query = """
        SELECT q.*, f.stability, f.difficulty, f.reps, f.lapses, f.error_archetype
        FROM user_fsrs_states f
        JOIN questions q ON f.question_id = q.id
        WHERE f.user_id = ?
          AND f.due_date <= ?
          AND (q.validation_status IS NULL OR q.validation_status != 'QUARANTINED')
    """
    params = [user_id, today_iso]

    if subject and subject != "Full Syllabus":
        query += " AND q.subject = ?"
        params.append(subject)

    if allowed_chapters:
        placeholders = ",".join("?" for _ in allowed_chapters)
        query += f" AND q.chapter IN ({placeholders})"
        params.extend(allowed_chapters)

    query += " ORDER BY f.stability ASC, RANDOM() LIMIT 1"

    cursor.execute(query, params)
    row = cursor.fetchone()
    return dict(row) if row else None
