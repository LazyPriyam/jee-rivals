import json
import math
import random
import datetime
from typing import Optional, List, Dict, Any, Tuple, Set

def get_user_subject_elo(user: dict, subject: str) -> float:
    """Returns the user's specific subject Elo rating or overall Elo as fallback."""
    subj_norm = (subject or "").strip().lower()
    if "phys" in subj_norm:
        return float(user.get("physics_elo") or user.get("overall_elo") or 1200.0)
    elif "chem" in subj_norm:
        return float(user.get("chemistry_elo") or user.get("overall_elo") or 1200.0)
    elif "math" in subj_norm:
        return float(user.get("math_elo") or user.get("overall_elo") or 1200.0)
    return float(user.get("overall_elo") or 1200.0)


def get_user_weak_chapters(cursor, user_id: str, subject: Optional[str] = None) -> List[str]:
    """
    Identifies chapters where the user's historical accuracy is under 60%
    or where they have incurred recent mistakes in activity_log.
    """
    query = """
        SELECT chapter,
               COUNT(*) as total,
               SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
        FROM activity_log
        WHERE user_id = ?
    """
    params = [user_id]
    if subject and subject != "Full Syllabus":
        query += " AND subject = ?"
        params.append(subject)

    query += " GROUP BY chapter HAVING total >= 2"
    cursor.execute(query, params)
    rows = cursor.fetchall()

    weak = []
    for r in rows:
        tot = r["total"]
        cor = r["correct"] or 0
        acc = cor / tot if tot > 0 else 0
        if acc < 0.60:
            weak.append(r["chapter"])
    return weak


def get_user_revenge_question_ids(cursor, user_id: str, subject: Optional[str] = None, chapter: Optional[str] = None) -> Set[str]:
    """
    Finds question IDs that the user previously failed in Duels, Mocks, or Practice,
    which have not yet been answered correctly since.
    """
    query = """
        SELECT question_id, is_correct, created_at
        FROM activity_log
        WHERE user_id = ?
    """
    params = [user_id]
    if subject and subject != "Full Syllabus":
        query += " AND subject = ?"
        params.append(subject)
    if chapter:
        query += " AND chapter = ?"
        params.append(chapter)

    query += " ORDER BY created_at ASC"
    cursor.execute(query, params)
    rows = cursor.fetchall()

    status_map = {}
    for r in rows:
        status_map[r["question_id"]] = bool(r["is_correct"])

    # Revenge questions are those whose most recent attempt was incorrect
    revenge_ids = {qid for qid, is_cor in status_map.items() if not is_cor}
    return revenge_ids


def select_next_adaptive_question(
    cursor,
    user_id: str,
    subject: str,
    chapter: Optional[str] = None,
    target_exam: str = "MIXED",
    current_session_elo: float = 1500.0,
    is_last_correct: Optional[bool] = None,
    streak: int = 0,
    seen_question_ids: Optional[Set[str]] = None,
    remediation_chapter: Optional[str] = None,
    allowed_chapters: Optional[List[str]] = None
) -> Tuple[Optional[dict], dict]:
    """
    Intelligent multi-factor question selector:
    - Calculates target difficulty curve based on last performance and streak.
    - If user failed previous question, initiates Concept Remediation on same chapter.
    - Auto-weights detected weak syllabus topics and pending revenge problems.
    - Clamps to healthy difficulty bounds and avoids repeats.
    - Strictly restricts questions to allowed_chapters if provided (user's learnt chapters).
    """
    seen = seen_question_ids or set()
    weak_chapters = set(get_user_weak_chapters(cursor, user_id, subject))
    revenge_qids = get_user_revenge_question_ids(cursor, user_id, subject, chapter)

    # 1. Calculate Target Elo Ladder
    if is_last_correct is True:
        # User succeeded! Step upward.
        if streak >= 3:
            # Flow state multiplier: Push into high-tier challenge
            elo_jump = random.uniform(85, 120)
        else:
            elo_jump = random.uniform(60, 90)
        target_elo = current_session_elo + elo_jump
        is_remediation = False
    elif is_last_correct is False:
        # User missed: Dip downward to diagnose fundamentals and trigger remediation
        elo_drop = random.uniform(50, 80)
        target_elo = max(1100.0, current_session_elo - elo_drop)
        is_remediation = True
    else:
        # Initial probe question
        target_elo = current_session_elo
        is_remediation = False

    target_elo = max(1000.0, min(2500.0, target_elo))

    # 2. Query Candidate Questions
    base_query = """
        SELECT * FROM questions 
        WHERE solution_text IS NOT NULL AND solution_text != ''
          AND (validation_status IS NULL OR validation_status NOT IN ('QUARANTINED', 'SUPERSEDED_BY_SUBQUESTIONS'))
    """
    params = []

    # If in remediation and we have a specific remediation chapter, try targeting it first
    target_chapter = chapter or (remediation_chapter if is_remediation else None)

    from backend.app.tools.jee_syllabus import expand_allowed_chapters, normalize_chapter_name
    effective_allowed = expand_allowed_chapters(allowed_chapters) if allowed_chapters else None

    # Check for Due Spaced Repetition questions (interleaving spaced retrieval)
    if len(seen) > 0 and len(seen) % 3 == 0:
        try:
            from backend.app.tools.fsrs_engine import find_due_fsrs_question
            due_q = find_due_fsrs_question(cursor, user_id, subject, effective_allowed)
            if due_q and due_q.get("id") not in seen:
                metadata = {
                    "target_elo": round(float(due_q.get("elo_rating") or 1500), 1),
                    "question_elo": float(due_q.get("elo_rating") or 1500),
                    "is_revenge": False,
                    "is_remediation": False,
                    "is_fsrs_due": True,
                    "tier_label": "SPACED_MEMORY_REINFORCEMENT"
                }
                return due_q, metadata
        except Exception:
            pass

    if subject and subject != "Full Syllabus":
        base_query += " AND subject = ?"
        params.append(subject)
    if target_chapter:
        norm_ch = normalize_chapter_name(target_chapter)
        base_query += " AND (chapter = ? OR chapter = ?)"
        params.extend([target_chapter, norm_ch])
    elif effective_allowed:
        placeholders = ",".join("?" for _ in effective_allowed)
        base_query += f" AND chapter IN ({placeholders})"
        params.extend(effective_allowed)
    if target_exam and target_exam != "MIXED":
        base_query += " AND target_exam = ?"
        params.append(target_exam)

    cursor.execute(base_query, params)
    candidates = [dict(r) for r in cursor.fetchall()]

    # Filter out already seen in this session
    unseen_candidates = [c for c in candidates if c["id"] not in seen]

    # Fallback 1: If remediation chapter exhausted unseen questions, widen to same subject (strictly respecting allowed_chapters)
    if not unseen_candidates and target_chapter and subject:
        fallback_query = """
            SELECT * FROM questions 
            WHERE solution_text IS NOT NULL AND solution_text != ''
              AND (validation_status IS NULL OR validation_status NOT IN ('QUARANTINED', 'SUPERSEDED_BY_SUBQUESTIONS'))
        """
        fb_params = []
        if subject != "Full Syllabus":
            fallback_query += " AND subject = ?"
            fb_params.append(subject)
        if effective_allowed:
            placeholders = ",".join("?" for _ in effective_allowed)
            fallback_query += f" AND chapter IN ({placeholders})"
            fb_params.extend(effective_allowed)
        cursor.execute(fallback_query, fb_params)
        candidates = [dict(r) for r in cursor.fetchall()]
        unseen_candidates = [c for c in candidates if c["id"] not in seen]
        is_remediation = False

    # Fallback 2: If entire bank exhausted for current filter, reuse candidates
    pool = unseen_candidates if unseen_candidates else candidates
    if not pool:
        # Ultimate fallback: Any unquarantined question in allowed syllabus
        fb_ult = """
            SELECT * FROM questions 
            WHERE (validation_status IS NULL OR validation_status NOT IN ('QUARANTINED', 'SUPERSEDED_BY_SUBQUESTIONS'))
        """
        ult_params = []
        if effective_allowed:
            placeholders = ",".join("?" for _ in effective_allowed)
            fb_ult += f" AND chapter IN ({placeholders})"
            ult_params.extend(effective_allowed)
        fb_ult += " ORDER BY RANDOM() LIMIT 25"
        cursor.execute(fb_ult, ult_params)
        pool = [dict(r) for r in cursor.fetchall()]

    if not pool:
        return None, {}

    # 3. Multi-Factor Scoring
    scored = []
    for q in pool:
        q_elo = float(q.get("elo_rating") or 1500)
        # Elo Proximity bell curve (standard dev = 220)
        diff = abs(q_elo - target_elo)
        elo_score = math.exp(-((diff / 220.0) ** 2))

        weight = elo_score

        # Multi-Factor Modifiers
        is_revenge = q["id"] in revenge_qids
        if is_revenge:
            weight *= 2.8  # Strong bonus to avenge previously failed questions

        is_weak = q.get("chapter") in weak_chapters
        if is_weak:
            weight *= 2.2  # Heavy focus on identified conceptual weak chapters

        if q["id"] not in seen:
            weight *= 1.5  # Freshness preference

        # Gentle randomness to avoid robotic predictability
        jitter = random.uniform(0.85, 1.15)
        final_score = weight * jitter
        scored.append((final_score, q, is_revenge, is_remediation or is_weak))

    scored.sort(key=lambda x: x[0], reverse=True)

    # 4. Real-time Defect Audit, Healing, and Quarantine
    from backend.app.tools.question_verifier import audit_and_heal_question

    best_q = None
    is_q_revenge = False
    is_q_remed = False

    for score, cand_q, rev, rem in scored:
        is_valid, healed_q, defects = audit_and_heal_question(cand_q)
        if is_valid and healed_q:
            best_q = healed_q
            is_q_revenge = rev
            is_q_remed = rem
            break

    if not best_q:
        return None, {}

    q_elo = float(best_q.get("elo_rating") or 1500)
    if q_elo >= 1950:
        tier_label = "OLYMPIAD_APEX"
    elif q_elo >= 1700:
        tier_label = "JEE_ADVANCED_HARD"
    elif q_elo >= 1400:
        tier_label = "JEE_MAIN_STANDARD"
    else:
        tier_label = "FOUNDATION_DIAGNOSTIC"

    metadata = {
        "target_elo": round(target_elo, 1),
        "question_elo": q_elo,
        "is_revenge": is_q_revenge,
        "is_remediation": is_q_remed,
        "tier_label": tier_label
    }

    return best_q, metadata


def calculate_adaptive_elo_delta(
    user_elo: float,
    question_elo: float,
    is_correct: bool,
    streak: int = 0
) -> float:
    """
    Computes Elo shift with soft landing on high-difficulty questions
    and momentum bonus on winning streaks.
    """
    expected = 1.0 / (1.0 + 10.0 ** ((question_elo - user_elo) / 400.0))
    actual = 1.0 if is_correct else 0.0

    # Dynamic K-factor
    if is_correct:
        k = 28.0 + min(12.0, streak * 2.0)
    else:
        k = 24.0

    raw_delta = k * (actual - expected)

    # Soft landing: if question is much harder than user, limit negative penalty
    if not is_correct and question_elo > user_elo + 150:
        raw_delta = max(-8.0, raw_delta)

    return round(raw_delta, 1)


def apply_adaptive_result_to_profile(
    cursor,
    user_id: str,
    question: dict,
    is_correct: bool,
    time_spent: int,
    elo_delta: float
):
    """
    Updates the student's permanent profile:
    - Subject Elo & Overall Elo
    - Chapter stats JSON
    - Activity log for radar analysis
    - Weekly RP
    """
    now = datetime.datetime.utcnow().isoformat()
    subj = question.get("subject", "Physics")
    chap = question.get("chapter", "General")
    q_id = question.get("id")

    subj_col = "physics_elo"
    if "chem" in subj.lower():
        subj_col = "chemistry_elo"
    elif "math" in subj.lower():
        subj_col = "math_elo"

    from backend.app.tools.elo_engine import calculate_chapter_diminishing_factor, get_user_syllabus_coverage, compute_two_factor_air_bracket
    factor, _ = calculate_chapter_diminishing_factor(cursor, user_id, [chap], [subj])
    overall_delta = round(elo_delta * factor, 1)

    # 1. Update user Elos and totals
    rp_gain = 15 if is_correct else 5
    correct_inc = 1 if is_correct else 0

    cursor.execute(f"""
        UPDATE users
        SET overall_elo = MAX(100.0, overall_elo + ?),
            {subj_col} = MAX(100.0, {subj_col} + ?),
            total_solved = total_solved + 1,
            total_correct = total_correct + ?,
            weekly_rp = weekly_rp + ?,
            last_active = ?
        WHERE id = ?
    """, (overall_delta, elo_delta, correct_inc, rp_gain, now, user_id))

    # 2. Update chapter_stats JSON
    cursor.execute("SELECT chapter_stats FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    stats = {}
    if row and row["chapter_stats"]:
        try:
            stats = json.loads(row["chapter_stats"])
        except Exception:
            stats = {}

    if chap not in stats:
        stats[chap] = {"attempts": 0, "correct": 0, "subject": subj}
    stats[chap]["attempts"] = stats[chap].get("attempts", 0) + 1
    if is_correct:
        stats[chap]["correct"] = stats[chap].get("correct", 0) + 1

    cursor.execute("UPDATE users SET chapter_stats = ? WHERE id = ?", (json.dumps(stats), user_id))

    # 3. Log to activity_log
    cursor.execute("""
        INSERT INTO activity_log (
            user_id, question_id, subject, chapter, is_correct,
            time_spent_seconds, elo_delta, mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ADAPTIVE', ?)
    """, (user_id, q_id, subj, chap, 1 if is_correct else 0, time_spent, elo_delta, now))

    from backend.app.tools.elo_engine import record_chapter_attempt
    record_chapter_attempt(cursor, user_id, subj, chap, is_correct, elo_delta)

    # 4. Update Implicit Cognitive FSRS Spaced Memory
    try:
        from backend.app.tools.fsrs_engine import process_question_fsrs
        process_question_fsrs(
            cursor=cursor,
            user_id=user_id,
            question=question,
            is_correct=is_correct,
            user_choice=question.get("user_choice"),
            time_spent=time_spent
        )
    except Exception:
        pass

    # 5. Log progression to user_rank_history
    cursor.execute("SELECT overall_elo FROM users WHERE id = ?", (user_id,))
    u_row = cursor.fetchone()
    if u_row:
        new_ov = float(u_row["overall_elo"] or 1200.0)
        cov = get_user_syllabus_coverage(cursor, user_id)
        air_b, _, _ = compute_two_factor_air_bracket(new_ov, cov["active_count"], cov["active_subjects_count"])
        cursor.execute("""
            INSERT INTO user_rank_history (user_id, overall_elo, predicted_air_bracket, created_at)
            VALUES (?, ?, ?, ?)
        """, (user_id, round(new_ov, 1), air_b, now[:10]))

    # 6. Record Daily Study Streak Activity
    try:
        from backend.app.tools.streaks_engine import record_daily_activity
        record_daily_activity(user_id, cursor)
    except Exception:
        pass
