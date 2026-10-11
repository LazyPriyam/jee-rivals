import json
import math
import random
import datetime
import time
from typing import Optional, List, Dict, Any, Tuple, Set

_WEAK_CHAPTERS_CACHE: Dict[Tuple[str, str], Tuple[float, List[str]]] = {}
_REVENGE_QIDS_CACHE: Dict[Tuple[str, str, str], Tuple[float, Set[str]]] = {}
_USER_CHAPTER_ELOS_CACHE: Dict[str, Tuple[float, Dict[str, float]]] = {}


def invalidate_adaptive_chapter_elo_cache(user_id: Optional[str] = None):
    global _USER_CHAPTER_ELOS_CACHE
    if user_id:
        _USER_CHAPTER_ELOS_CACHE.pop(str(user_id), None)
    else:
        _USER_CHAPTER_ELOS_CACHE.clear()


def get_user_chapter_elo_map(cursor, user_id: str) -> Dict[str, float]:
    """
    Returns a normalized map of {chapter_name: chapter_elo} from user_chapter_elo,
    cached in RAM for 60s (and updated immediately in-memory on adaptive submit).
    """
    uid = str(user_id)
    now_t = time.time()
    cached = _USER_CHAPTER_ELOS_CACHE.get(uid)
    if cached and (now_t - cached[0]) < 60.0:
        return cached[1]

    from backend.app.tools.jee_syllabus import normalize_chapter_name
    chap_map: Dict[str, float] = {}
    try:
        cursor.execute("""
            SELECT chapter, elo FROM user_chapter_elo
            WHERE user_id = ?
        """, (uid,))
        for r in cursor.fetchall():
            ch_raw = r["chapter"]
            elo_val = float(r["elo"] or 1200.0)
            if ch_raw:
                chap_map[ch_raw] = elo_val
                norm_c = normalize_chapter_name(ch_raw)
                if norm_c:
                    chap_map[norm_c] = elo_val
    except Exception:
        pass

    _USER_CHAPTER_ELOS_CACHE[uid] = (now_t, chap_map)
    return chap_map


def get_user_chapter_elo(cursor, user_id: str, chapter: Optional[str], fallback_elo: float = 1200.0) -> float:
    """Returns the user's Chapter Elo for the specified chapter (defaulting to 1200.0 for untouched chapters)."""
    if not chapter:
        return fallback_elo
    from backend.app.tools.jee_syllabus import normalize_chapter_name
    chap_map = get_user_chapter_elo_map(cursor, user_id)
    norm_c = normalize_chapter_name(chapter)
    if norm_c in chap_map:
        return float(chap_map[norm_c])
    if chapter in chap_map:
        return float(chap_map[chapter])
    return 1200.0


def update_cached_chapter_elo(user_id: str, chapter: Optional[str], new_elo: float):
    """Updates the in-memory chapter Elo cache immediately so the next adaptive question uses the fresh Chapter Elo in 0ms."""
    if not chapter:
        return
    uid = str(user_id)
    cached = _USER_CHAPTER_ELOS_CACHE.get(uid)
    if not cached:
        return
    from backend.app.tools.jee_syllabus import normalize_chapter_name
    chap_map = cached[1]
    norm_c = normalize_chapter_name(chapter)
    chap_map[chapter] = round(float(new_elo), 1)
    if norm_c:
        chap_map[norm_c] = round(float(new_elo), 1)
    _USER_CHAPTER_ELOS_CACHE[uid] = (time.time(), chap_map)


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


def get_initial_adaptive_elo(
    cursor,
    user: dict,
    subject: str,
    target_chapter: Optional[str] = None,
    allowed_chapters: Optional[List[str]] = None
) -> float:
    """
    Seeds the initial adaptive Elo from the user's Chapter Elo(s) in user_chapter_elo:
    - Single chapter: exact Chapter Elo of that chapter (1200.0 if untouched).
    - Multiple allowed/learnt chapters: average Chapter Elo across those chapters.
    - Full syllabus / subject: average Chapter Elo of attempted chapters in that subject (or 1200.0 baseline).
    """
    user_id = str(user["id"])
    if target_chapter:
        return round(get_user_chapter_elo(cursor, user_id, target_chapter, 1200.0), 1)

    chap_map = get_user_chapter_elo_map(cursor, user_id)
    from backend.app.tools.jee_syllabus import normalize_chapter_name, JEE_SYLLABUS

    if allowed_chapters and len(allowed_chapters) > 0:
        norm_set = {normalize_chapter_name(c) for c in allowed_chapters if c}
        if norm_set:
            vals = [chap_map.get(c, 1200.0) for c in norm_set]
            return round(sum(vals) / len(vals), 1)

    # Filter canonical chapters by subject if a single subject was selected
    subj_chaps = []
    for s_name, units in JEE_SYLLABUS.items():
        if subject and subject != "Full Syllabus" and s_name.lower() != subject.strip().lower():
            continue
        for u in units:
            for ch in u["chapters"]:
                norm_c = normalize_chapter_name(ch)
                if norm_c in chap_map:
                    subj_chaps.append(chap_map[norm_c])

    if subj_chaps:
        return round(sum(subj_chaps) / len(subj_chaps), 1)
    return 1200.0


def get_user_weak_chapters(cursor, user_id: str, subject: Optional[str] = None) -> List[str]:
    """
    Identifies chapters where the user's historical accuracy is under 60%
    or where they have incurred recent mistakes in activity_log.
    """
    cache_key = (str(user_id), str(subject or "ALL"))
    now_t = time.time()
    if cache_key in _WEAK_CHAPTERS_CACHE and (now_t - _WEAK_CHAPTERS_CACHE[cache_key][0]) < 60:
        return _WEAK_CHAPTERS_CACHE[cache_key][1]

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
    _WEAK_CHAPTERS_CACHE[cache_key] = (now_t, weak)
    return weak


def get_user_revenge_question_ids(cursor, user_id: str, subject: Optional[str] = None, chapter: Optional[str] = None) -> Set[str]:
    """
    Finds question IDs that the user previously failed in Duels, Mocks, or Practice,
    which have not yet been answered correctly since.
    """
    cache_key = (str(user_id), str(subject or "ALL"), str(chapter or "ALL"))
    now_t = time.time()
    if cache_key in _REVENGE_QIDS_CACHE and (now_t - _REVENGE_QIDS_CACHE[cache_key][0]) < 60:
        return _REVENGE_QIDS_CACHE[cache_key][1]

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
    _REVENGE_QIDS_CACHE[cache_key] = (now_t, revenge_ids)
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
    Intelligent Chapter-Elo-driven multi-factor question selector:
    - Evaluates each candidate question against the user's Chapter Elo for that question's chapter
      (from user_chapter_elo), modulated by in-session momentum and streak.
    - If user failed previous question, initiates Concept Remediation on the same chapter.
    - Auto-weights detected weak syllabus chapters and pending revenge problems.
    - Clamps to healthy difficulty bounds and avoids repeats.
    - Strictly restricts questions to allowed_chapters if provided (user's learnt chapters).
    """
    seen = seen_question_ids or set()
    weak_chapters = set(get_user_weak_chapters(cursor, user_id, subject))
    revenge_qids = get_user_revenge_question_ids(cursor, user_id, subject, chapter)
    chapter_elo_map = get_user_chapter_elo_map(cursor, user_id)

    # 1. Calculate In-Session Momentum / Step Offset relative to each chapter's Elo
    if is_last_correct is True:
        # User succeeded! Push above the chapter's baseline Elo, scaling with flow-state streak.
        if streak >= 3:
            step_offset = random.uniform(85, 120) + min(120.0, (streak - 2) * 25.0)
        else:
            step_offset = random.uniform(45, 75) + max(0, streak - 1) * 20.0
        is_remediation = False
    elif is_last_correct is False:
        # User missed: Dip downward below chapter Elo to diagnose fundamentals and trigger remediation
        step_offset = -random.uniform(50, 80)
        is_remediation = True
    else:
        # Initial probe or skip replacement: match exact Chapter Elo
        step_offset = 0.0
        is_remediation = False

    # 2. Select Candidate Questions via Fast Hot-Cache
    target_chapter = chapter or (remediation_chapter if is_remediation else None)
    from backend.app.tools.jee_syllabus import expand_allowed_chapters, normalize_chapter_name
    from backend.app.tools.question_cache import get_all_questions_cached
    effective_allowed = set(expand_allowed_chapters(allowed_chapters)) if allowed_chapters else None
    norm_ch = normalize_chapter_name(target_chapter) if target_chapter else None

    # Check for Due Spaced Repetition questions (interleaving spaced retrieval)
    if len(seen) > 0 and len(seen) % 3 == 0:
        try:
            from backend.app.tools.fsrs_engine import find_due_fsrs_question
            due_q = find_due_fsrs_question(cursor, user_id, subject, list(effective_allowed) if effective_allowed else None)
            if due_q and due_q.get("id") not in seen:
                due_ch_elo = get_user_chapter_elo(cursor, user_id, due_q.get("chapter"), 1200.0)
                metadata = {
                    "target_elo": round(float(due_q.get("elo_rating") or 1500), 1),
                    "chapter_elo": round(due_ch_elo, 1),
                    "question_elo": float(due_q.get("elo_rating") or 1500),
                    "is_revenge": False,
                    "is_remediation": False,
                    "is_fsrs_due": True,
                    "tier_label": "SPACED_MEMORY_REINFORCEMENT"
                }
                return due_q, metadata
        except Exception:
            pass

    cached_bank = get_all_questions_cached(cursor)

    def _matches_adaptive_filters(q, subj, ch_target, ch_norm, eff_allowed, t_exam):
        if subj and subj != "Full Syllabus" and q.get("subject") != subj:
            return False
        if ch_target:
            c_val = q.get("chapter")
            if c_val != ch_target and c_val != ch_norm:
                return False
        elif eff_allowed:
            if q.get("chapter") not in eff_allowed:
                return False
        if t_exam and str(t_exam).upper() not in ("MIXED", "ALL"):
            te_upper = str(t_exam).upper()
            q_exam = str(q.get("target_exam") or "").upper()
            q_type = str(q.get("question_type") or "SINGLE_CHOICE").upper()
            if "MAIN" in te_upper:
                if q_exam not in ("JEE_MAIN", "MAIN", ""):
                    return False
                if q_type not in ("SINGLE_CHOICE", "MCQ", "NUMERICAL", "INTEGER"):
                    return False
            elif "ADVANCED" in te_upper:
                if q_exam not in ("JEE_ADVANCED", "ADVANCED"):
                    return False
            elif "OLYMPIAD" in te_upper:
                if q_exam != "OLYMPIAD":
                    return False
            else:
                if q_exam and q_exam != te_upper:
                    return False
        return True

    candidates = [q for q in cached_bank if _matches_adaptive_filters(q, subject, target_chapter, norm_ch, effective_allowed, target_exam)]
    unseen_candidates = [c for c in candidates if c["id"] not in seen]

    # Fallback 1: If remediation chapter exhausted unseen questions, widen to same subject (strictly respecting allowed_chapters)
    if not unseen_candidates and target_chapter and subject:
        candidates = [q for q in cached_bank if _matches_adaptive_filters(q, subject, None, None, effective_allowed, target_exam)]
        unseen_candidates = [c for c in candidates if c["id"] not in seen]
        is_remediation = False

    # Fallback 2: If entire bank exhausted for current filter, reuse candidates
    pool = unseen_candidates if unseen_candidates else candidates
    if not pool:
        pool = [q for q in cached_bank if (not effective_allowed or q.get("chapter") in effective_allowed)]
        if not pool and cached_bank:
            pool = cached_bank[:30]

    if not pool:
        return None, {}

    # 3. Chapter-Elo Multi-Factor Scoring
    scored = []
    for q in pool:
        q_elo = float(q.get("elo_rating") or 1500)
        q_ch_raw = q.get("chapter") or ""
        q_ch_norm = normalize_chapter_name(q_ch_raw) if q_ch_raw else ""
        user_ch_elo = float(chapter_elo_map.get(q_ch_norm, chapter_elo_map.get(q_ch_raw, 1200.0)))

        # Chapter-specific target Elo = User's Chapter Elo + In-Session Momentum Step
        q_target_elo = max(1000.0, min(2500.0, user_ch_elo + step_offset))

        # Elo Proximity bell curve (standard dev = 220) relative to THIS chapter's target Elo
        diff = abs(q_elo - q_target_elo)
        elo_score = math.exp(-((diff / 220.0) ** 2))

        weight = elo_score

        # Multi-Factor Modifiers
        is_revenge = q["id"] in revenge_qids
        if is_revenge:
            weight *= 2.8  # Strong bonus to avenge previously failed questions

        is_low_ch_elo = (q_ch_norm in chapter_elo_map and user_ch_elo < 1350.0)
        is_weak = (q_ch_raw in weak_chapters) or (q_ch_norm in weak_chapters) or is_low_ch_elo
        if is_weak:
            weight *= 2.2  # Heavy focus on identified conceptual weak or low-Elo chapters

        if q["id"] not in seen:
            weight *= 1.5  # Freshness preference

        # Gentle randomness to avoid robotic predictability
        jitter = random.uniform(0.85, 1.15)
        final_score = weight * jitter
        scored.append((final_score, q, is_revenge, is_remediation or is_weak, user_ch_elo, q_target_elo))

    scored.sort(key=lambda x: x[0], reverse=True)

    # 4. Real-time Defect Audit, Healing, and Quarantine
    from backend.app.tools.question_verifier import audit_and_heal_question

    best_q = None
    is_q_revenge = False
    is_q_remed = False
    best_ch_elo = 1200.0
    best_target_elo = current_session_elo

    for score, cand_q, rev, rem, ch_elo_val, q_targ_val in scored:
        is_valid, healed_q, defects = audit_and_heal_question(cand_q)
        if is_valid and healed_q:
            best_q = healed_q
            is_q_revenge = rev
            is_q_remed = rem
            best_ch_elo = ch_elo_val
            best_target_elo = q_targ_val
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
        "target_elo": round(best_target_elo, 1),
        "chapter_elo": round(best_ch_elo, 1),
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

    from backend.app.tools.elo_engine import (
        calculate_chapter_diminishing_factor,
        calculate_subject_asymmetry_factor,
        get_user_syllabus_coverage,
        compute_two_factor_air_bracket
    )

    cursor.execute("SELECT overall_elo, physics_elo, chemistry_elo, math_elo, chapter_stats FROM users WHERE id = ?", (user_id,))
    u_row = cursor.fetchone()
    cur_overall = float(u_row["overall_elo"] or 1200.0) if u_row else 1200.0
    p_elo = float(u_row["physics_elo"] or 1200.0) if u_row else 1200.0
    c_elo = float(u_row["chemistry_elo"] or 1200.0) if u_row else 1200.0
    m_elo = float(u_row["math_elo"] or 1200.0) if u_row else 1200.0
    raw_stats = u_row["chapter_stats"] if u_row else None

    chap_factor, _ = calculate_chapter_diminishing_factor(cursor, user_id, [chap], [subj])
    asym_factor, _ = calculate_subject_asymmetry_factor(p_elo, c_elo, m_elo, [subj], elo_delta)

    if elo_delta > 0:
        combined_factor = round(chap_factor * asym_factor, 2)
        overall_delta = round(elo_delta * combined_factor, 1)
        min_subj_elo = min(p_elo, c_elo, m_elo)
        max_allowed_overall = min_subj_elo + 350.0
        if (cur_overall + overall_delta) > max_allowed_overall:
            overall_delta = max(0.0, round(max_allowed_overall - cur_overall, 1))
    else:
        overall_delta = round(elo_delta * chap_factor, 1)

    # 1. Update chapter_stats
    stats = {}
    if raw_stats:
        try:
            stats = json.loads(raw_stats) if isinstance(raw_stats, str) else raw_stats
        except Exception:
            stats = {}
    if not isinstance(stats, dict):
        stats = {}

    if chap not in stats:
        stats[chap] = {"attempts": 0, "correct": 0, "subject": subj}
    stats[chap]["attempts"] = stats[chap].get("attempts", 0) + 1
    if is_correct:
        stats[chap]["correct"] = stats[chap].get("correct", 0) + 1

    # 2. Consolidated user profile update (single query)
    rp_gain = 15 if is_correct else 5
    correct_inc = 1 if is_correct else 0
    new_ov = max(100.0, cur_overall + overall_delta)
    new_p = max(100.0, p_elo + (elo_delta if subj_col == "physics_elo" else 0.0))
    new_c = max(100.0, c_elo + (elo_delta if subj_col == "chemistry_elo" else 0.0))
    new_m = max(100.0, m_elo + (elo_delta if subj_col == "math_elo" else 0.0))

    cursor.execute(f"""
        UPDATE users
        SET overall_elo = ?,
            {subj_col} = ?,
            total_solved = total_solved + 1,
            total_correct = total_correct + ?,
            weekly_rp = weekly_rp + ?,
            chapter_stats = ?,
            last_active = ?
        WHERE id = ?
    """, (new_ov, max(100.0, (p_elo if subj_col == "physics_elo" else c_elo if subj_col == "chemistry_elo" else m_elo) + elo_delta),
          correct_inc, rp_gain, json.dumps(stats), now, user_id))

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
    try:
        cov = get_user_syllabus_coverage(cursor, user_id)
        air_b, _, _ = compute_two_factor_air_bracket(
            new_ov, cov["active_count"], cov["active_subjects_count"],
            physics_elo=new_p, chemistry_elo=new_c, math_elo=new_m
        )
        cursor.execute("""
            INSERT INTO user_rank_history (user_id, overall_elo, predicted_air_bracket, created_at)
            VALUES (?, ?, ?, ?)
        """, (user_id, round(new_ov, 1), air_b, now[:10]))
    except Exception:
        pass

    from backend.app.auth import invalidate_user_cache
    invalidate_user_cache(user_id)

    # 6. Record Daily Study Streak Activity
    try:
        from backend.app.tools.streaks_engine import record_daily_activity
        record_daily_activity(user_id, cursor)
    except Exception:
        pass
