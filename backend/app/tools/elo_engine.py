import math
import hashlib
import sqlite3
import datetime
from typing import List, Dict, Optional, Tuple, Set

# Minimum engagement times (in seconds) required for an attempt to be deemed genuine
# Submissions faster than these thresholds on wrong answers are treated as rapid guesses,
# misclicks, or spammed attempts, and are completely filtered out from question Elo updates.
MIN_GENUINE_ENGAGEMENT_SECONDS = {
    "SINGLE_CHOICE": 6,
    "MULTIPLE_CHOICE": 10,
    "MATRIX_MATCH": 12,
    "NUMERICAL": 10,
    "COMPREHENSION": 15,
    "SUBJECTIVE": 10,
    "DEFAULT": 7,
}

QUESTION_K_FACTOR = 2.0  # Ultra-gentle K-factor ensures questions act as stable rating anchors
MAX_QUESTION_DELTA_PER_ATTEMPT = 1.5  # Hard ceiling on single-attempt question movement
MIN_QUESTION_ELO = 1000.0
MAX_QUESTION_ELO = 2450.0

PLAYER_SOLO_K_FACTOR = 24.0  # K-factor for solo mock/practice matches


def get_min_engagement_seconds(question_type: str) -> int:
    """Returns the minimum seconds needed for a valid attempt on this question type."""
    q_type = (question_type or "").upper()
    return MIN_GENUINE_ENGAGEMENT_SECONDS.get(q_type, MIN_GENUINE_ENGAGEMENT_SECONDS["DEFAULT"])


def compute_seed_elo(q_id: str, exam: Optional[str], diff: Optional[str], q_type: Optional[str]) -> int:
    """
    Computes an organic, continuous initial Elo rating (1150 - 2350)
    reflecting actual JEE Main vs Advanced standards and question formats.
    """
    exam_str = (exam or "JEE_MAIN").upper()
    diff_str = (diff or "MEDIUM").upper()
    type_str = (q_type or "SINGLE_CHOICE").upper()

    if exam_str == "JEE_ADVANCED":
        if diff_str == "HARD":
            if type_str in ("MULTIPLE_CHOICE", "MATRIX_MATCH"):
                base = 2220
            elif type_str in ("NUMERICAL", "COMPREHENSION", "SUBJECTIVE"):
                base = 2080
            else:
                base = 1980
        elif diff_str == "MEDIUM":
            if type_str in ("MULTIPLE_CHOICE", "MATRIX_MATCH"):
                base = 1950
            elif type_str in ("NUMERICAL", "COMPREHENSION", "SUBJECTIVE"):
                base = 1820
            else:
                base = 1720
        else:  # EASY
            if type_str in ("MULTIPLE_CHOICE", "MATRIX_MATCH"):
                base = 1620
            else:
                base = 1520
    else:  # JEE_MAIN
        if diff_str == "HARD":
            if type_str in ("NUMERICAL", "SUBJECTIVE", "MATRIX_MATCH"):
                base = 1800
            else:
                base = 1720
        elif diff_str == "MEDIUM":
            if type_str in ("NUMERICAL", "MATRIX_MATCH", "COMPREHENSION"):
                base = 1550
            else:
                base = 1480
        else:  # EASY
            base = 1250

    # Deterministic jitter [-24, +25] so questions within the same tier form a continuous bell curve
    h = int(hashlib.md5((q_id or "default").encode("utf-8")).hexdigest()[:6], 16)
    jitter = (h % 50) - 24
    return int(base + jitter)


def update_question_elo_from_attempt(
    cursor: sqlite3.Cursor,
    user_id: str,
    question_id: str,
    is_correct: bool,
    time_spent_seconds: int,
    user_elo: float,
    now_iso: str
) -> Tuple[float, bool]:
    """
    Updates a question's Elo rating dynamically with strict Anti-Guess & Anti-Spam guardrails:
    1. Anti-Spam: If user previously attempted this question within 24h, question Elo does NOT change.
    2. Anti-Guess: If user answered WRONG in less than min required seconds, question Elo does NOT increase.
    3. Asymmetric Damping: Wrong answers are weighted by engagement time spent.
    4. Sample-size damping & hard clamp: Max delta is capped at +-1.5 Elo per attempt.

    Returns: (question_elo_delta, was_genuine_attempt)
    """
    # 1. Anti-Spam Check: Ignore repeat attempts by the same user within 24h
    cursor.execute("""
        SELECT 1 FROM activity_log
        WHERE user_id = ? AND question_id = ? AND created_at >= datetime(?, '-1 day')
        LIMIT 1
    """, (user_id, question_id, now_iso))
    is_repeat_attempt = bool(cursor.fetchone())

    # Fetch current question stats
    cursor.execute("SELECT elo_rating, question_type, times_attempted, times_correct FROM questions WHERE id = ?", (question_id,))
    q_row = cursor.fetchone()
    if not q_row:
        return 0.0, False

    current_q_elo = float(q_row["elo_rating"] or 1500.0)
    q_type = q_row["question_type"] or "SINGLE_CHOICE"
    attempts_so_far = int(q_row["times_attempted"] or 0)
    correct_so_far = int(q_row["times_correct"] or 0)

    min_seconds = get_min_engagement_seconds(q_type)

    # 2. Anti-Guess Guardrail:
    # If the student got it wrong and spent less than the minimum required seconds,
    # it was a blind guess, misclick, or rage-quit spam. Question Elo must NOT jump.
    if not is_correct and time_spent_seconds < min_seconds:
        # Update raw counters but zero out Elo change
        cursor.execute("""
            UPDATE questions
            SET times_attempted = times_attempted + 1
            WHERE id = ?
        """, (question_id,))
        return 0.0, False

    # If it's a repeat attempt by the same user, do not alter question Elo
    if is_repeat_attempt:
        cursor.execute("""
            UPDATE questions
            SET times_attempted = times_attempted + 1,
                times_correct = times_correct + ?
            WHERE id = ?
        """, (1 if is_correct else 0, question_id))
        return 0.0, False

    # 3. Calculate genuine engagement weight
    if not is_correct:
        # Engagement weight scales with time spent up to a healthy problem-solving window (e.g. 35s)
        time_weight = min(1.0, max(0.2, time_spent_seconds / 35.0))
    else:
        # If answered correctly in less than min_seconds, could be a lucky 1-in-4 guess; damp impact
        time_weight = 0.3 if time_spent_seconds < min_seconds else 1.0

    # 4. Inertia damping based on total historical attempts
    # As question accumulates verified attempts, it becomes more stable
    sample_damping = 1.0 / math.sqrt(1.0 + (attempts_so_far / 25.0))

    # 5. Question Expected Outcome vs User
    # Eq = probability that question "wins" (user gets it wrong)
    exponent = (float(user_elo) - current_q_elo) / 400.0
    # Clamping exponent to avoid overflow in extreme cases
    exponent = max(-5.0, min(5.0, exponent))
    expected_q_win = 1.0 / (1.0 + (10.0 ** exponent))

    actual_q_win = 0.0 if is_correct else 1.0

    raw_delta = QUESTION_K_FACTOR * (actual_q_win - expected_q_win) * time_weight * sample_damping

    # 6. Clamp delta to [-MAX_QUESTION_DELTA_PER_ATTEMPT, +MAX_QUESTION_DELTA_PER_ATTEMPT]
    clamped_delta = max(-MAX_QUESTION_DELTA_PER_ATTEMPT, min(MAX_QUESTION_DELTA_PER_ATTEMPT, raw_delta))

    new_elo = max(MIN_QUESTION_ELO, min(MAX_QUESTION_ELO, current_q_elo + clamped_delta))
    actual_applied_delta = round(new_elo - current_q_elo, 2)

    cursor.execute("""
        UPDATE questions
        SET elo_rating = ?,
            times_attempted = times_attempted + 1,
            times_correct = times_correct + ?
        WHERE id = ?
    """, (round(new_elo), 1 if is_correct else 0, question_id))

    return actual_applied_delta, True


def calculate_solo_match_elo_delta(
    user_elo: float,
    question_elos: List[float],
    correct_count: int,
    total_count: int
) -> float:
    """
    Computes fair, balanced Elo delta for solo tests, mock exams, or practice rounds.
    Compares the player's actual accuracy against expected accuracy given the test's average question difficulty.
    """
    if total_count <= 0 or not question_elos:
        return 0.0

    avg_q_elo = sum(question_elos) / len(question_elos)
    actual_score = float(correct_count) / float(total_count)

    # Expected accuracy of this user against questions of avg_q_elo
    diff = (avg_q_elo - float(user_elo)) / 400.0
    diff = max(-5.0, min(5.0, diff))
    expected_score = 1.0 / (1.0 + (10.0 ** diff))

    # Scale K-factor gently based on test length (short 5-question sprint vs 30-question mock)
    k_scaled = PLAYER_SOLO_K_FACTOR * min(1.5, max(0.5, total_count / 15.0))
    raw_delta = k_scaled * (actual_score - expected_score)

    # Clamp delta so a single test doesn't swing rating by more than +-28
    return round(max(-28.0, min(28.0, raw_delta)), 1)


def reseed_questions_gradient(cursor: sqlite3.Cursor) -> int:
    """
    Upgrades all questions in the database from the old 3-bucket fixed values (1350/1500/1850)
    to the full continuous 1150-2350 gradient based on target exam and question type.
    """
    cursor.execute("SELECT id, target_exam, difficulty_tier, question_type, elo_rating FROM questions")
    rows = cursor.fetchall()
    updated_count = 0

    for r in rows:
        q_id = r["id"]
        current_elo = r["elo_rating"]
        # If question is at one of the old default values or null, reseed it
        if current_elo in (1350, 1500, 1850, None) or current_elo == 0:
            new_seed = compute_seed_elo(q_id, r["target_exam"], r["difficulty_tier"], r["question_type"])
            cursor.execute("UPDATE questions SET elo_rating = ? WHERE id = ?", (new_seed, q_id))
            updated_count += 1

    return updated_count


def get_user_syllabus_coverage(cursor: sqlite3.Cursor, user_id: str) -> dict:
    """
    Computes exact syllabus exploration and breadth metrics across the official 59 canonical chapters.
    """
    from backend.app.tools.jee_syllabus import normalize_chapter_name

    cursor.execute("""
        SELECT DISTINCT chapter, subject FROM activity_log WHERE user_id = ?
    """, (user_id,))
    rows = cursor.fetchall()

    active_chaps: Set[str] = set()
    active_subjs: Set[str] = set()

    for r in rows:
        norm = normalize_chapter_name(r["chapter"])
        if norm:
            active_chaps.add(norm)
            subj = (r["subject"] or "").strip()
            if "phys" in subj.lower():
                active_subjs.add("Physics")
            elif "chem" in subj.lower():
                active_subjs.add("Chemistry")
            elif "math" in subj.lower():
                active_subjs.add("Mathematics")

    total_canonical = 59
    active_count = len(active_chaps)
    cov_ratio = (active_count / total_canonical) if total_canonical > 0 else 0.0

    return {
        "active_chapters": list(active_chaps),
        "active_count": active_count,
        "total_chapters": total_canonical,
        "coverage_ratio": round(cov_ratio, 3),
        "coverage_percent": round(cov_ratio * 100, 1),
        "active_subjects_count": len(active_subjs),
        "active_subjects": list(active_subjs)
    }


def calculate_chapter_diminishing_factor(
    cursor: sqlite3.Cursor,
    user_id: str,
    chapters: Optional[List[str]] = None,
    subjects: Optional[List[str]] = None
) -> Tuple[float, str]:
    """
    Computes a fair anti-farming multiplier for Overall Elo:
    - Broad evaluation (Full Syllabus / >= 3 chapters): 100% full weight.
    - Single-chapter practice (or <= 2 chapters):
      Diminishes as user accumulates repeated attempts in those same chapters:
      omega = max(0.20, 1.0 / sqrt(1.0 + prior_attempts / 12.0))
      Ensures users cannot climb to elite Overall ranks without expanding syllabus breadth.
    """
    chaps = [c.strip() for c in (chapters or []) if c and c.strip()]
    subjs = [s.strip() for s in (subjects or []) if s and s.strip() and s.strip().lower() not in ("mixed", "full syllabus")]

    if not chaps or len(chaps) >= 3 or not subjs:
        return 1.0, "Full Syllabus / Multi-Chapter evaluation (100% Elo weight)"

    from backend.app.tools.jee_syllabus import normalize_chapter_name
    norm_chaps = [normalize_chapter_name(c) for c in chaps if normalize_chapter_name(c)]

    placeholders = ','.join(['?'] * (len(norm_chaps) + len(chaps)))
    query_params = [user_id] + norm_chaps + chaps

    cursor.execute(f"""
        SELECT COUNT(*) as cnt FROM activity_log
        WHERE user_id = ? AND (chapter IN ({placeholders}))
    """, tuple(query_params))
    row = cursor.fetchone()
    prior_attempts = row["cnt"] if row else 0

    repetition_damp = max(0.20, 1.0 / math.sqrt(1.0 + (prior_attempts / 12.0)))

    # Subject Breadth Dampener:
    cov = get_user_syllabus_coverage(cursor, user_id)
    if cov["active_subjects_count"] <= 1 and cov["active_count"] >= 5:
        subject_damp = 0.8
    else:
        subject_damp = 1.0

    factor = round(repetition_damp * subject_damp, 2)
    reason = f"Chapter '{chaps[0]}' practice ({prior_attempts} prior attempts -> {int(factor * 100)}% Overall Elo weight)"
    return factor, reason


def compute_two_factor_air_bracket(
    overall_elo: float,
    active_chapters_count: int,
    active_subjects_count: int,
    total_chapters: int = 59
) -> Tuple[str, Optional[str], int]:
    """
    Computes authentic Two-Factor Predicted AIR based on both:
    1. Problem-solving skill (Elo)
    2. Syllabus Breadth (Chapters attempted across Physics, Chemistry, Math)

    Returns: (predicted_air_bracket, air_gate_reason, speed_percentile)
    """
    coverage_ratio = (active_chapters_count / total_chapters) if total_chapters > 0 else 0.0
    coverage_pct = round(coverage_ratio * 100, 1)
    elo = float(overall_elo)

    # Base speed percentile
    if elo >= 2100: speed_p = 99
    elif elo >= 1900: speed_p = 98
    elif elo >= 1750: speed_p = 95
    elif elo >= 1600: speed_p = 88
    elif elo >= 1450: speed_p = 76
    elif elo >= 1300: speed_p = 60
    else: speed_p = 45

    # Case 1: Under 3 chapters
    if active_chapters_count < 3:
        bracket = f"Foundation Aspirant ({coverage_pct}% Syllabus • Skill {int(elo)})"
        gate = "Attempt at least 3 distinct chapters to establish initial All India Rank forecast."
        return bracket, gate, speed_p

    # Case 2: Early Specialist (< 20% coverage, under 12 chapters)
    if coverage_ratio < 0.20:
        bracket = f"Chapter Specialist ({coverage_pct}% Syllabus • Skill {int(elo)})"
        gate = f"Explore at least 12 chapters (20% syllabus) to qualify for JEE Main Cutoff rank."
        return bracket, gate, speed_p

    # Case 3: 20% to 38% coverage (12 to 22 chapters)
    if coverage_ratio < 0.38:
        if elo >= 1300:
            bracket = f"AIR 25,000 - 50,000 (Mains Cutoff • {coverage_pct}% Syllabus)"
            gate = "Expand syllabus to 38%+ (23+ chapters) across PCM to unlock Top NITs rank prediction."
        else:
            bracket = f"Aspirant (Building Foundation • {coverage_pct}% Syllabus)"
            gate = "Raise competitive Elo to 1300+ and cover 23+ chapters."
        return bracket, gate, speed_p

    # Case 4: 38% to 58% coverage (23 to 34 chapters)
    if coverage_ratio < 0.58:
        if elo >= 1450:
            bracket = f"AIR 5,000 - 15,000 (Top NITs / IIITs • {coverage_pct}% Syllabus)"
            gate = "Cover 35+ chapters (58%+ syllabus) across all 3 subjects to unlock IIT Core rank."
        elif elo >= 1300:
            bracket = f"AIR 15,000 - 35,000 (JEE Mains Qualified • {coverage_pct}% Syllabus)"
            gate = "Raise Elo to 1450+ or expand syllabus to 35+ chapters."
        else:
            bracket = f"Aspirant ({coverage_pct}% Syllabus)"
            gate = "Raise overall Elo to 1300+."
        return bracket, gate, speed_p

    # Case 5: 58% to 75% coverage (35 to 44 chapters)
    if coverage_ratio < 0.75:
        if elo >= 1650:
            if active_subjects_count >= 2:
                bracket = f"AIR 1,500 - 5,000 (IIT Core Branches • {coverage_pct}% Syllabus)"
                gate = "Cover 45+ chapters (75%+ syllabus) across all 3 subjects to unlock Top IITian rank (< 1500)."
            else:
                bracket = f"Single-Subject Specialist (Skill {int(elo)} • {coverage_pct}% Syllabus)"
                gate = "Attempt chapters in all 3 subjects (Physics, Chemistry, Math) to unlock IIT Core prediction."
        elif elo >= 1450:
            bracket = f"AIR 5,000 - 15,000 (Top NITs / IIITs • {coverage_pct}% Syllabus)"
            gate = "Raise overall Elo to 1650+ to unlock IIT Core rank."
        else:
            bracket = f"JEE Mains Qualified ({coverage_pct}% Syllabus)"
            gate = "Raise overall Elo to 1450+."
        return bracket, gate, speed_p

    # Case 6: 75% to 88% coverage (45 to 51 chapters)
    if coverage_ratio < 0.88:
        if active_subjects_count < 3:
            bracket = f"AIR 1,500 - 5,000 (Syllabus Imbalance • {coverage_pct}%)"
            gate = "Study all 3 PCM subjects to unlock Top Tier IITian status."
        elif elo >= 1800:
            bracket = f"AIR 250 - 1,500 (Top Tier IITian • {coverage_pct}% Syllabus)"
            gate = "Cover 52+ chapters (88%+ syllabus) and 1950+ Elo for Super 30 Elite (< 250)."
        elif elo >= 1650:
            bracket = f"AIR 1,500 - 5,000 (IIT Core Branches • {coverage_pct}% Syllabus)"
            gate = "Raise Elo to 1800+ for Top Tier IITian (< 1500)."
        else:
            bracket = f"AIR 5,000 - 15,000 (Top NITs • {coverage_pct}% Syllabus)"
            gate = "Raise Elo to 1650+."
        return bracket, gate, speed_p

    # Case 7: High Coverage (>= 88% coverage, 52+ chapters across PCM)
    if active_subjects_count < 3:
        bracket = f"AIR 250 - 1,500 (Unbalanced PCM • {coverage_pct}%)"
        gate = "Engage all 3 subjects for AIR < 250."
    elif elo >= 2100:
        bracket = "AIR 1 - 50 (Presidential Gold / IIT Bombay CS)"
        gate = "Apex All India Rank achieved! Defend your ladder standing."
    elif elo >= 1950:
        bracket = f"AIR 50 - 250 (Super 30 / Top IITs CS • {coverage_pct}% Syllabus)"
        gate = "Push overall Elo above 2100 for Presidential Gold (AIR 1 - 50)."
    elif elo >= 1800:
        bracket = f"AIR 250 - 1,500 (Top Tier IITian • {coverage_pct}% Syllabus)"
        gate = "Reach 1950+ Elo for Super 30 (AIR < 250)."
    elif elo >= 1650:
        bracket = f"AIR 1,500 - 5,000 (IIT Core Branches • {coverage_pct}% Syllabus)"
        gate = "Reach 1800+ Elo for Top Tier IITian."
    else:
        bracket = f"AIR 5,000 - 15,000 (Top NITs • {coverage_pct}% Syllabus)"
        gate = "Reach 1650+ Elo for IIT Core Branches."

    return bracket, gate, speed_p


def apply_match_elo_to_user(
    cursor: sqlite3.Cursor,
    user_id: str,
    raw_delta: float,
    subjects: Optional[List[str]] = None,
    chapters: Optional[List[str]] = None
) -> Tuple[float, float, str]:
    """
    Applies Elo change from a match to user profile:
    - Subject Elo(s) get raw_delta (or split among subjects if multiple).
    - Overall Elo gets raw_delta * diminishing_factor to prevent single-chapter farming.
    - Updates user_rank_history with the new trajectory point.

    Returns: (applied_overall_delta, raw_delta, reason)
    """
    if str(user_id).startswith("bot_"):
        return 0.0, 0.0, "Bot account"

    cursor.execute("SELECT overall_elo, physics_elo, chemistry_elo, math_elo FROM users WHERE id = ?", (user_id,))
    u_row = cursor.fetchone()
    if not u_row:
        return 0.0, 0.0, "User not found"

    cur_overall = float(u_row["overall_elo"] or 1200.0)

    # Calculate diminishing factor
    factor, reason = calculate_chapter_diminishing_factor(cursor, user_id, chapters, subjects)
    overall_delta = round(raw_delta * factor, 1)

    # Determine subject delta
    subjs = [s.strip() for s in (subjects or []) if s and s.strip() and s.strip().lower() not in ("mixed", "full syllabus")]
    subj_updates = []
    now_iso = datetime.datetime.utcnow().isoformat()

    if subjs:
        s_delta = round(raw_delta / len(subjs), 1)
        for s in subjs:
            s_low = s.lower()
            if "phys" in s_low:
                subj_updates.append(("physics_elo", s_delta))
            elif "chem" in s_low:
                subj_updates.append(("chemistry_elo", s_delta))
            elif "math" in s_low:
                subj_updates.append(("math_elo", s_delta))
    else:
        third = round(raw_delta / 3.0, 1)
        subj_updates.append(("physics_elo", third))
        subj_updates.append(("chemistry_elo", third))
        subj_updates.append(("math_elo", third))

    set_clauses = ["overall_elo = MAX(100.0, overall_elo + ?)"]
    params = [overall_delta]
    for col, d in subj_updates:
        set_clauses.append(f"{col} = MAX(100.0, {col} + ?)")
        params.append(d)

    params.append(now_iso)
    params.append(user_id)
    cursor.execute(f"""
        UPDATE users
        SET {', '.join(set_clauses)}, last_active = ?
        WHERE id = ?
    """, tuple(params))

    # Compute new AIR and log into user_rank_history
    new_overall = max(100.0, cur_overall + overall_delta)
    cov = get_user_syllabus_coverage(cursor, user_id)
    air_bracket, gate, _ = compute_two_factor_air_bracket(
        new_overall, cov["active_count"], cov["active_subjects_count"], cov["total_chapters"]
    )

    cursor.execute("""
        INSERT INTO user_rank_history (user_id, overall_elo, predicted_air_bracket, created_at)
        VALUES (?, ?, ?, ?)
    """, (user_id, round(new_overall, 1), air_bracket, now_iso[:10]))

    return overall_delta, raw_delta, reason

