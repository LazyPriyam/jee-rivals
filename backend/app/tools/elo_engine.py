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
MAX_QUESTION_ELO = 3000.0

PLAYER_SOLO_K_FACTOR = 24.0  # K-factor for solo mock/practice matches


def get_min_engagement_seconds(question_type: str) -> int:
    """Returns the minimum seconds needed for a valid attempt on this question type."""
    q_type = (question_type or "").upper()
    return MIN_GENUINE_ENGAGEMENT_SECONDS.get(q_type, MIN_GENUINE_ENGAGEMENT_SECONDS["DEFAULT"])


def compute_seed_elo(q_id: str, exam: Optional[str], diff: Optional[str], q_type: Optional[str]) -> int:
    """
    Computes an organic, continuous initial Elo rating:
    - JEE Main: 1200 - 1800
    - JEE Advanced: 1800 - 2400
    - Olympiad (INPhO, Pathfinder, Irodov): 2400 - 3000
    - Mixed: 1600 - 2200
    """
    exam_str = (exam or "JEE_MAIN").upper()
    diff_str = (diff or "MEDIUM").upper()
    type_str = (q_type or "SINGLE_CHOICE").upper()

    if exam_str == "OLYMPIAD":
        if diff_str == "HARD":
            if type_str in ("MULTIPLE_CHOICE", "MATRIX_MATCH", "COMPREHENSION"):
                base = 2860
            elif type_str in ("NUMERICAL", "SUBJECTIVE"):
                base = 2780
            else:
                base = 2720
        elif diff_str == "MEDIUM":
            if type_str in ("MULTIPLE_CHOICE", "MATRIX_MATCH"):
                base = 2640
            elif type_str in ("NUMERICAL", "COMPREHENSION", "SUBJECTIVE"):
                base = 2580
            else:
                base = 2520
        else:  # EASY
            base = 2420
    elif exam_str == "JEE_ADVANCED":
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
    elif exam_str == "MIXED":
        if diff_str == "HARD":
            base = 2050
        elif diff_str == "MEDIUM":
            base = 1780
        else:
            base = 1550
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


def get_user_syllabus_coverage(cursor: sqlite3.Cursor, user_id: str, user_dict: Optional[dict] = None) -> dict:
    """
    Computes exact syllabus exploration and breadth metrics across the official 92 canonical chapters.
    Aggregates chapter exploration from:
    1. activity_log & user_chapter_elo (combined via fast single UNION query)
    2. users.chapter_stats (where attempts > 0)
    """
    import json
    from backend.app.tools.jee_syllabus import normalize_chapter_name, ALL_CANONICAL_CHAPTERS, JEE_SYLLABUS

    total_canonical = len(ALL_CANONICAL_CHAPTERS)
    active_chaps: Set[str] = set()
    active_subjs: Set[str] = set()

    def record_chap(ch_name: Optional[str], s_name: Optional[str] = None):
        if not ch_name:
            return
        norm = normalize_chapter_name(str(ch_name).strip())
        if norm:
            active_chaps.add(norm)
            subj = (s_name or "").strip()
            if not subj:
                for s_key, units in JEE_SYLLABUS.items():
                    for u in units:
                        if norm in u["chapters"]:
                            subj = s_key
                            break
                    if subj:
                        break
            if subj:
                s_low = subj.lower()
                if "phys" in s_low:
                    active_subjs.add("Physics")
                elif "chem" in s_low:
                    active_subjs.add("Chemistry")
                elif "math" in s_low:
                    active_subjs.add("Mathematics")

    # 1. Combined single UNION query for attempts across activity_log and user_chapter_elo
    try:
        cursor.execute("""
            SELECT DISTINCT chapter, subject FROM activity_log WHERE user_id = ?
            UNION
            SELECT DISTINCT chapter, subject FROM user_chapter_elo WHERE user_id = ? AND attempts > 0
        """, (user_id, user_id))
        for r in cursor.fetchall():
            record_chap(r["chapter"], r["subject"])
    except Exception:
        pass

    # 2. Extract chapter_stats (reuse user_dict if passed to save a DB round trip)
    try:
        raw_cstats = None
        if user_dict is not None:
            raw_cstats = user_dict.get("chapter_stats")
        else:
            cursor.execute("SELECT chapter_stats FROM users WHERE id = ?", (user_id,))
            u_row = cursor.fetchone()
            if u_row:
                raw_cstats = u_row["chapter_stats"]

        if raw_cstats:
            cstats = json.loads(raw_cstats) if isinstance(raw_cstats, str) else raw_cstats
            if isinstance(cstats, dict):
                for ch_k, ch_v in cstats.items():
                    if isinstance(ch_v, dict) and ch_v.get("attempts", 0) > 0:
                        record_chap(ch_k, ch_v.get("subject"))
                    elif isinstance(ch_v, (int, float)) and ch_v > 0:
                        record_chap(ch_k)
    except Exception:
        pass

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


def calculate_subject_asymmetry_factor(
    physics_elo: float,
    chemistry_elo: float,
    math_elo: float,
    subjects: Optional[List[str]] = None,
    raw_delta: float = 0.0
) -> Tuple[float, str]:
    """
    Computes the JEE Lagging Subject Gate multiplier (0.0 to 1.0) for Overall Elo:
    In JEE (Main & Advanced), Physics, Chemistry, and Mathematics have equal weightage
    and mandatory individual subject performance expectations.

    If an aspirant is gaining Elo (raw_delta > 0) in only 1 or 2 subjects while
    neglecting lagging subject(s):
    - Let E_active = highest Elo among practiced subjects.
    - Let E_min = min(physics_elo, chemistry_elo, math_elo).
    - Subject gap: Delta_gap = E_active - E_min.

    1. Delta_gap <= 150:
       - 1.0 (100% full Overall Elo gains). Natural subject variance is normal.
    2. 150 < Delta_gap <= 350:
       - Linear decay: max(0.0, 1.0 - (Delta_gap - 150.0) / 200.0).
       - Diminishes Overall Elo gains as the gap widens to prevent single-subject runaway.
    3. Delta_gap > 350:
       - Factor is strictly 0.0! Overall Elo gains are completely LOCKED.
       - The aspirant CANNOT farm Overall Elo or Grandmaster on a single subject.

    Crucial invariants:
    - Single-subject Elo (physics_elo, etc.) is NEVER capped, allowing pure domain
      mastery and subject leaderboards to remain completely authentic.
    - If raw_delta <= 0 (mistakes/losses), factor is 1.0 (losses are not shielded).
    - If the match tests all 3 subjects (tri-subject / full syllabus test), factor is 1.0.
    """
    if raw_delta <= 0:
        return 1.0, "Downward adjustment preserved"

    # Identify practiced subjects
    subjs = [s.strip().lower() for s in (subjects or []) if s and s.strip() and s.strip().lower() not in ("mixed", "full syllabus")]

    p = float(physics_elo or 1200.0)
    c = float(chemistry_elo or 1200.0)
    m = float(math_elo or 1200.0)

    p_active = any("phys" in s for s in subjs) if subjs else True
    c_active = any("chem" in s for s in subjs) if subjs else True
    m_active = any("math" in s for s in subjs) if subjs else True

    # If all 3 subjects are practiced in this evaluation (e.g. Full Syllabus Mock), full credit
    if p_active and c_active and m_active:
        return 1.0, "Tri-subject / Full Syllabus evaluation (100% Elo gain)"

    # Identify active subject ratings
    active_ratings = []
    active_names = []
    if p_active:
        active_ratings.append(p)
        active_names.append("Physics")
    if c_active:
        active_ratings.append(c)
        active_names.append("Chemistry")
    if m_active:
        active_ratings.append(m)
        active_names.append("Mathematics")

    if not active_ratings:
        active_ratings = [max(p, c, m)]
        active_names = ["Active Subject"]

    max_active_elo = max(active_ratings)
    active_str = "/".join(active_names)

    # Find minimum rating and lagging subject name
    min_elo = min(p, c, m)
    if min_elo == p:
        lagging_name = "Physics"
    elif min_elo == c:
        lagging_name = "Chemistry"
    else:
        lagging_name = "Mathematics"

    gap = max(0.0, round(max_active_elo - min_elo, 1))

    if gap <= 150.0:
        return 1.0, f"Balanced PCM standing (Gap: {gap:.0f} pts <= 150)"
    elif gap <= 350.0:
        asym_factor = round(max(0.0, 1.0 - (gap - 150.0) / 200.0), 2)
        pct = int(asym_factor * 100)
        return asym_factor, f"Overall Elo damped ({pct}%): {active_str} is {gap:.0f} pts ahead of {lagging_name}. Practice {lagging_name} to restore 100% gains."
    else:
        return 0.0, f"Overall Elo locked (+0.0): {active_str} ({round(max_active_elo):.0f}) is >350 pts ahead of {lagging_name} ({round(min_elo):.0f}). Practice {lagging_name} to unlock Overall Elo."


def compute_two_factor_air_bracket(
    overall_elo: float,
    active_chapters_count: int,
    active_subjects_count: int,
    total_chapters: int = 92,
    physics_elo: float = 1200.0,
    chemistry_elo: float = 1200.0,
    math_elo: float = 1200.0,
    total_solved: int = 0,
    total_correct: int = 0
) -> Tuple[str, Optional[str], int]:
    """
    Computes authentic Two-Factor Predicted AIR via data-driven air_engine:
    Returns: (predicted_air_bracket, air_gate_reason, speed_percentile)
    """
    from backend.app.tools.air_engine import calculate_advanced_air
    data = calculate_advanced_air(
        overall_elo=overall_elo,
        physics_elo=physics_elo,
        chemistry_elo=chemistry_elo,
        math_elo=math_elo,
        active_chapters_count=active_chapters_count,
        active_subjects_count=active_subjects_count,
        total_solved=total_solved,
        total_correct=total_correct
    )
    elo = float(overall_elo)
    if elo >= 2100: speed_p = 99
    elif elo >= 1900: speed_p = 98
    elif elo >= 1750: speed_p = 95
    elif elo >= 1600: speed_p = 88
    elif elo >= 1450: speed_p = 76
    elif elo >= 1300: speed_p = 60
    else: speed_p = 45

    return data["predicted_air_bracket"], data["air_gate_reason"], speed_p



def apply_match_elo_to_user(
    cursor: sqlite3.Cursor,
    user_id: str,
    raw_delta: float,
    subjects: Optional[List[str]] = None,
    chapters: Optional[List[str]] = None
) -> Tuple[float, float, str]:
    """
    Applies Elo change from a match to user profile:
    - Subject Elo(s) get raw_delta (or split among subjects if multiple). Domain mastery is unrestricted!
    - Overall Elo gets raw_delta * diminishing_factor * subject_asymmetry_factor.
      Gains are damped or locked (+0.0) if a single subject is farmed while lagging subjects are neglected.
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
    p_elo = float(u_row["physics_elo"] or 1200.0)
    c_elo = float(u_row["chemistry_elo"] or 1200.0)
    m_elo = float(u_row["math_elo"] or 1200.0)

    # 1. Calculate chapter diminishing factor
    chap_factor, chap_reason = calculate_chapter_diminishing_factor(cursor, user_id, chapters, subjects)

    # 2. Calculate JEE lagging subject asymmetry factor
    asym_factor, asym_reason = calculate_subject_asymmetry_factor(p_elo, c_elo, m_elo, subjects, raw_delta)

    if raw_delta > 0:
        combined_factor = round(chap_factor * asym_factor, 2)
        overall_delta = round(raw_delta * combined_factor, 1)
        if asym_factor == 0.0:
            reason = asym_reason
        elif asym_factor < 1.0:
            reason = f"{chap_reason} | {asym_reason}"
        else:
            reason = chap_reason

        # Hard ceiling on overall_elo based on lagging subject:
        min_subj_elo = min(p_elo, c_elo, m_elo)
        max_allowed_overall = min_subj_elo + 350.0
        if (cur_overall + overall_delta) > max_allowed_overall:
            overall_delta = max(0.0, round(max_allowed_overall - cur_overall, 1))
            if overall_delta == 0.0:
                reason = f"Overall Elo locked: Lagging subject is at {round(min_subj_elo):.0f}. Practice your lagging subject to unlock Overall Elo."
    else:
        overall_delta = round(raw_delta * chap_factor, 1)
        reason = chap_reason

    # Determine subject delta (unrestricted domain mastery)
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
        new_overall, cov["active_count"], cov["active_subjects_count"], cov["total_chapters"],
        physics_elo=p_elo + (raw_delta if any("phys" in s.lower() for s in (subjs or [])) else 0),
        chemistry_elo=c_elo + (raw_delta if any("chem" in s.lower() for s in (subjs or [])) else 0),
        math_elo=m_elo + (raw_delta if any("math" in s.lower() for s in (subjs or [])) else 0)
    )

    cursor.execute("""
        INSERT INTO user_rank_history (user_id, overall_elo, predicted_air_bracket, created_at)
        VALUES (?, ?, ?, ?)
    """, (user_id, round(new_overall, 1), air_bracket, now_iso[:10]))

    return overall_delta, raw_delta, reason


def record_chapter_attempt(
    cursor: sqlite3.Cursor,
    user_id: str,
    subject: str,
    chapter: str,
    is_correct: bool,
    elo_delta: Optional[float] = None
) -> float:
    """
    Updates the 92-chapter independent Elo rating, attempts count, and accuracy
    in the `user_chapter_elo` table for the specified user and chapter.
    """
    from backend.app.tools.jee_syllabus import normalize_chapter_name
    canonical_chapter = normalize_chapter_name(chapter)
    now_iso = datetime.datetime.utcnow().isoformat()

    cursor.execute("""
        SELECT elo, attempts, correct FROM user_chapter_elo
        WHERE user_id = ? AND chapter = ?
    """, (user_id, canonical_chapter))
    row = cursor.fetchone()

    if row:
        cur_elo = float(row["elo"] or 1200.0)
        attempts = int(row["attempts"] or 0) + 1
        correct = int(row["correct"] or 0) + (1 if is_correct else 0)
    else:
        cur_elo = 1200.0
        attempts = 1
        correct = 1 if is_correct else 0

    if elo_delta is not None:
        delta = elo_delta
    else:
        delta = 16.0 if is_correct else -12.0

    new_elo = max(600.0, min(3000.0, cur_elo + delta))

    cursor.execute("""
        INSERT INTO user_chapter_elo (user_id, subject, chapter, elo, attempts, correct, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, chapter) DO UPDATE SET
            elo = excluded.elo,
            attempts = excluded.attempts,
            correct = excluded.correct,
            last_updated = excluded.last_updated
    """, (user_id, subject, canonical_chapter, round(new_elo, 1), attempts, correct, now_iso))

    return new_elo

