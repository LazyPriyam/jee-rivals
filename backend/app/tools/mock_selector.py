"""
Authentic JEE (Main & Advanced) Mock Test and Battle Room Question Selector.
Enforces:
  1. Equal number of questions across all included subjects (Physics, Chemistry, Mathematics).
  2. Chapter-level question allocation proportional to official JEE Chapter Weightage (DEFAULT_CHAPTER_WEIGHTAGE).
  3. Authentic JEE Main Paper Structure (Section A: 80% Single Choice MCQ + Section B: 20% Numerical Value).
  4. Authentic JEE Advanced Paper Structure (Section 1: Multi-Correct, Section 2: Numerical,
     Section 3: Comprehension Passages, Section 4: Matrix Match, with chapter-weighted Advanced backfill).
  5. 0ms In-Memory selection from hot question cache with real-time structural verification.
"""

import json
import logging
import random
from typing import List, Dict, Optional, Set, Any, Tuple

logger = logging.getLogger("jee_rivals.mock_selector")

from backend.app.tools.jee_syllabus import (
    JEE_SYLLABUS,
    normalize_chapter_name,
    get_chapter_weightage,
    get_chapter_subject,
    distribute_counts,
    distribute_weighted_counts,
)
from backend.app.tools.question_cache import get_all_questions_cached
from backend.app.tools.question_verifier import audit_and_heal_question

CANONICAL_SUBJECTS = ["Physics", "Chemistry", "Mathematics"]


def _normalize_subject(subj: Optional[str]) -> Optional[str]:
    if not subj:
        return None
    s = subj.strip().lower()
    if "phys" in s or s == "p":
        return "Physics"
    if "chem" in s or s == "c":
        return "Chemistry"
    if "math" in s or s == "m":
        return "Mathematics"
    return None


def _normalize_qtype(qt: Optional[str]) -> str:
    qtu = (qt or "SINGLE_CHOICE").strip().upper()
    if qtu in ("MCQ", "SINGLE_CHOICE", "SCQ"):
        return "SINGLE_CHOICE"
    if qtu in ("NUMERICAL", "INTEGER", "NVQ"):
        return "NUMERICAL"
    if qtu in ("MULTIPLE_CHOICE", "MULTI_CORRECT", "MULTIPLE", "MCQ_MULTI"):
        return "MULTIPLE_CHOICE"
    if qtu in ("COMPREHENSION", "PARAGRAPH", "PASSAGE"):
        return "COMPREHENSION"
    if qtu in ("MATRIX_MATCH", "MATCHING", "MATRIX"):
        return "MATRIX_MATCH"
    if qtu == "SUBJECTIVE":
        return "SUBJECTIVE"
    return qtu


def _get_verified_pool(all_qs: List[dict]) -> List[dict]:
    """Filters and heals candidate pool using fast in-memory verification."""
    verified = []
    for q in all_qs:
        is_ok, healed, _ = audit_and_heal_question(q)
        if is_ok and healed:
            verified.append(healed)
    return verified


def _build_passage_groups(pool: List[dict]) -> Dict[str, List[dict]]:
    """Groups comprehension questions by passage_id in contiguous subquestion_index order."""
    groups: Dict[str, List[dict]] = {}
    for q in pool:
        pid = q.get("passage_id")
        if pid:
            groups.setdefault(pid, []).append(q)
    for pid, members in groups.items():
        members.sort(key=lambda x: (x.get("subquestion_index") or 0, x.get("id") or ""))
    return groups


def get_participants_seen_question_map(
    cursor,
    user_ids: Optional[List[str]],
    exclude_room_id: Optional[str] = None,
) -> Dict[str, int]:
    """
    Returns a mapping of {question_id: seen_count} where seen_count is the number
    of participants in user_ids who have previously encountered or attempted the question.
    A question is considered seen by a user if:
      1. It appears in `activity_log` for that user.
      2. It was answered in `room_participants.answers` for any room that the user
         participated in (excluding `exclude_room_id`) where the user actually selected
         an answer (selected not in ("NONE", "SKIPPED", "", None)).
      Unattempted / skipped questions in generated mock tests are NEVER marked as seen.
    """
    if not cursor or not user_ids:
        return {}

    valid_uids = list({str(u).strip() for u in user_ids if u and str(u).strip()})
    if not valid_uids:
        return {}

    user_seen: Dict[str, Set[str]] = {uid: set() for uid in valid_uids}
    placeholders = ",".join("?" for _ in valid_uids)

    # 1. Fetch attempted questions from activity_log
    try:
        cursor.execute(
            f"SELECT user_id, question_id FROM activity_log WHERE user_id IN ({placeholders})",
            valid_uids,
        )
        for row in cursor.fetchall():
            try:
                uid = row["user_id"]
            except Exception:
                uid = row[0] if hasattr(row, "__getitem__") else None
            try:
                qid = row["question_id"]
            except Exception:
                qid = row[1] if hasattr(row, "__getitem__") else None

            if uid in user_seen and qid:
                user_seen[uid].add(str(qid).strip())
    except Exception as e:
        logger.warning(f"Error querying activity_log for seen questions: {e}")

    # 2. Fetch actually attempted questions from room_participants answers
    try:
        sql = f"""
            SELECT rp.user_id, rp.answers
            FROM room_participants rp
            JOIN rooms r ON rp.room_id = r.id
            WHERE rp.user_id IN ({placeholders})
        """
        params: List[Any] = list(valid_uids)
        if exclude_room_id:
            sql += " AND r.id != ?"
            params.append(exclude_room_id)

        cursor.execute(sql, params)
        for row in cursor.fetchall():
            try:
                uid = row["user_id"]
            except Exception:
                uid = row[0] if hasattr(row, "__getitem__") else None
            try:
                answers_raw = row["answers"]
            except Exception:
                answers_raw = row[1] if hasattr(row, "__getitem__") else None

            if uid not in user_seen or not answers_raw:
                continue

            # Parse answers dict from room_participants: ONLY count questions the user actually attempted/answered
            try:
                ans_map = json.loads(answers_raw) if isinstance(answers_raw, str) else answers_raw
                if isinstance(ans_map, dict):
                    for qid, ans_val in ans_map.items():
                        if not qid or str(qid).startswith("__"):
                            continue
                        selected = None
                        if isinstance(ans_val, dict):
                            selected = ans_val.get("selected")
                        elif isinstance(ans_val, (str, int)):
                            selected = ans_val

                        if selected is not None and str(selected).strip().upper() not in ("NONE", "SKIPPED", ""):
                            user_seen[uid].add(str(qid).strip())
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Error querying room_participants for seen questions: {e}")

    # Aggregate seen_counts: question_id -> count of participants who have seen it
    seen_counts: Dict[str, int] = {}
    for uid, qids in user_seen.items():
        for qid in qids:
            seen_counts[qid] = seen_counts.get(qid, 0) + 1

    return seen_counts


def _pick_from_chapters_weighted(
    candidates: List[dict],
    quota: int,
    ch_quotas: Dict[str, int],
    weights_map: Dict[str, float],
    seen_ids: Set[str],
    seen_passages: Set[str],
    passage_groups: Dict[str, List[dict]],
    prefer_advanced: bool = False,
    seen_counts: Optional[Dict[str, int]] = None,
) -> List[dict]:
    """
    Selects up to `quota` questions from `candidates`, guided by `ch_quotas` and `weights_map`.
    Decrements `ch_quotas[ch]` as questions are picked so total chapter allocation stays true to weightage.
    Preserves comprehension passage groups atomically.
    Soft-forces unseen questions (seen_count == 0 across participants) before smoothly falling back
    to questions seen by the fewest participants if unseen bank supply is exhausted.
    """
    if quota <= 0 or not candidates:
        return []

    picked: List[dict] = []

    def _get_q_seen(q: dict) -> int:
        if not seen_counts:
            return 0
        pid = q.get("passage_id")
        if pid and pid in passage_groups:
            # Maximum seen count among all siblings of this passage
            return max(seen_counts.get(s["id"], 0) for s in passage_groups[pid])
        return seen_counts.get(q["id"], 0)

    # Group candidates by normalized chapter
    by_chapter: Dict[str, List[dict]] = {}
    for q in candidates:
        if q["id"] in seen_ids:
            continue
        ch_norm = normalize_chapter_name(q.get("chapter") or "")
        by_chapter.setdefault(ch_norm, []).append(q)

    def _sort_chapter_cands(c_list: List[dict]) -> List[dict]:
        shuffled = list(c_list)
        random.shuffle(shuffled)
        if prefer_advanced:
            diff_rank = {"HARD": 0, "MEDIUM": 1, "EASY": 2}
            exam_rank = {"JEE_ADVANCED": 0, "ADVANCED": 0, "MIXED": 1, "JEE_MAIN": 2, "MAIN": 2}
            shuffled.sort(
                key=lambda x: (
                    _get_q_seen(x),
                    exam_rank.get((x.get("target_exam") or "").upper(), 2),
                    diff_rank.get((x.get("difficulty_tier") or "MEDIUM").upper(), 1),
                )
            )
        else:
            shuffled.sort(key=lambda x: _get_q_seen(x))
        return shuffled

    for ch_k in by_chapter:
        by_chapter[ch_k] = _sort_chapter_cands(by_chapter[ch_k])

    def _try_add_question(q: dict, max_total: int) -> int:
        if q["id"] in seen_ids:
            return 0
        pid = q.get("passage_id")
        if pid and pid in passage_groups:
            if pid in seen_passages:
                return 0
            siblings = [s for s in passage_groups[pid] if s["id"] not in seen_ids]
            if not siblings:
                return 0
            if len(picked) + len(siblings) > max_total and len(siblings) > 1:
                return 0
            seen_passages.add(pid)
            for s in siblings:
                seen_ids.add(s["id"])
                picked.append(s)
            return len(siblings)
        else:
            if len(picked) + 1 > max_total:
                return 0
            seen_ids.add(q["id"])
            picked.append(q)
            return 1

    # Pass 1A: Draw UNSEEN questions (_get_q_seen == 0) from chapters that have positive quota (ch_quotas[ch] > 0)
    ordered_chapters = sorted(
        by_chapter.keys(),
        key=lambda c: (
            ch_quotas.get(c, 0) > 0,
            any(_get_q_seen(q) == 0 for q in by_chapter[c] if q["id"] not in seen_ids),
            weights_map.get(c, 2.0) + random.uniform(0, 0.3),
        ),
        reverse=True,
    )

    for ch in ordered_chapters:
        if len(picked) >= quota:
            break
        ch_rem = ch_quotas.get(ch, 0)
        if ch_rem <= 0:
            continue
        added_in_ch = 0
        for q in by_chapter[ch]:
            if len(picked) >= quota or added_in_ch >= ch_rem:
                break
            # In Pass 1A, only draw questions unseen by all participants
            if _get_q_seen(q) > 0:
                continue
            added = _try_add_question(q, quota)
            if added > 0:
                added_in_ch += added
                ch_quotas[ch] = max(0, ch_quotas.get(ch, 0) - added)

    # Pass 1B: If quota still not met, draw remaining UNSEEN questions from other chapters ordered by weightage
    if len(picked) < quota:
        unseen_chapters = sorted(
            [c for c in by_chapter.keys() if any(_get_q_seen(q) == 0 for q in by_chapter[c] if q["id"] not in seen_ids)],
            key=lambda c: weights_map.get(c, 2.0) + random.uniform(0, 0.5),
            reverse=True,
        )
        for ch in unseen_chapters:
            if len(picked) >= quota:
                break
            for q in by_chapter[ch]:
                if len(picked) >= quota:
                    break
                if _get_q_seen(q) > 0:
                    continue
                added = _try_add_question(q, quota)
                if added > 0:
                    ch_quotas[ch] = max(0, ch_quotas.get(ch, 0) - added)

    # Pass 2: Soft force fallback when bank supply of unseen questions is exhausted.
    # Draw from remaining candidates (which are sorted by least seen count first).
    if len(picked) < quota:
        fallback_chapters = sorted(
            by_chapter.keys(),
            key=lambda c: (
                ch_quotas.get(c, 0) > 0,
                weights_map.get(c, 2.0) + random.uniform(0, 0.5),
            ),
            reverse=True,
        )
        for ch in fallback_chapters:
            if len(picked) >= quota:
                break
            for q in by_chapter[ch]:
                if len(picked) >= quota:
                    break
                added = _try_add_question(q, quota)
                if added > 0:
                    ch_quotas[ch] = max(0, ch_quotas.get(ch, 0) - added)

    return picked


def order_subject_questions_jee_main(subj_qs: List[dict]) -> List[dict]:
    """
    Orders a single subject's questions in authentic NTA JEE Main sequence:
      - Section A: Single Choice Questions (SINGLE_CHOICE), shuffled across chapters
      - Section B: Numerical Value Questions (NUMERICAL / INTEGER), shuffled across chapters
    """
    sec_a = []
    sec_b = []
    for q in subj_qs:
        if _normalize_qtype(q.get("question_type")) == "NUMERICAL":
            sec_b.append(q)
        else:
            sec_a.append(q)

    # Shuffle within each section so questions from the same chapter are not clustered together
    random.shuffle(sec_a)
    random.shuffle(sec_b)

    return sec_a + sec_b


def order_subject_questions_jee_advanced(subj_qs: List[dict]) -> List[dict]:
    """
    Orders a single subject's questions in authentic JEE Advanced section sequence:
      - Section 1: Multiple Choice (One or More Than One Correct)
      - Section 2: Single Choice Advanced (if present)
      - Section 3: Numerical Value Questions
      - Section 4: Comprehension / Paragraph Passages (contiguous by passage_id & subquestion_index)
      - Section 5: Matrix Match / Matching Lists
    """
    sec_multi = []
    sec_single = []
    sec_num = []
    sec_comp = []
    sec_mat = []
    sec_other = []

    for q in subj_qs:
        qt = _normalize_qtype(q.get("question_type"))
        if qt == "MULTIPLE_CHOICE":
            sec_multi.append(q)
        elif qt == "SINGLE_CHOICE":
            sec_single.append(q)
        elif qt == "NUMERICAL":
            sec_num.append(q)
        elif qt == "COMPREHENSION" or q.get("passage_id"):
            sec_comp.append(q)
        elif qt == "MATRIX_MATCH":
            sec_mat.append(q)
        else:
            sec_other.append(q)

    # Shuffle non-passage sections so chapters are not clustered
    random.shuffle(sec_multi)
    random.shuffle(sec_single)
    random.shuffle(sec_num)
    random.shuffle(sec_mat)
    random.shuffle(sec_other)

    # Ensure comprehension passages stay strictly contiguous by passage_id and subquestion_index
    sec_comp.sort(key=lambda x: (x.get("passage_id") or x.get("id") or "", x.get("subquestion_index") or 0))

    return sec_multi + sec_single + sec_num + sec_comp + sec_mat + sec_other


def select_mock_and_room_questions(
    cursor,
    target_count: int,
    filter_subjects: Optional[List[str]] = None,
    filter_chapters: Optional[List[str]] = None,
    target_exam: str = "MAIN",
    difficulty_tier: Optional[str] = "MIXED",
    question_types: Optional[List[str]] = None,
    question_type_filter: Optional[str] = "ALL",
    mode: str = "MOCK_TEST",
    user_ids: Optional[List[str]] = None,
    exclude_room_id: Optional[str] = None,
    cumulative_mode: Optional[bool] = False,
    cumulative_buckets: Optional[Dict[str, List[str]]] = None,
) -> List[dict]:
    """
    Master question selector for Mock Tests and Battle Rooms:
      1. Splits `target_count` equally across all active subjects (Physics -> Chemistry -> Mathematics).
      2. Within each subject, distributes question quotas across chapters proportionally to
         their canonical JEE Chapter Weightages (`DEFAULT_CHAPTER_WEIGHTAGE`).
      3. Enforces JEE Main Format (80% Single Choice Section A + 20% Numerical Section B)
         or JEE Advanced Format (Multi-Correct, Numerical, Comprehension Passages, Matrix Match,
         with intelligent chapter-weighted Advanced backfill).
      4. Soft-forces unseen questions so that solo tests and multiplayer rooms prioritize questions
         that none of the participants have previously seen, falling back seamlessly if bank is exhausted.
    """
    all_cached = get_all_questions_cached(cursor=cursor)
    if not all_cached:
        return []

    # Build participant seen counts map for soft-force prioritization
    seen_counts = get_participants_seen_question_map(
        cursor=cursor,
        user_ids=user_ids,
        exclude_room_id=exclude_room_id,
    )

    # 1. Resolve active subjects in canonical order (Physics -> Chemistry -> Mathematics)
    norm_chapters: List[str] = []
    if filter_chapters:
        for ch in filter_chapters:
            if ch and str(ch).strip():
                nc = normalize_chapter_name(str(ch).strip())
                if nc and nc not in norm_chapters:
                    norm_chapters.append(nc)

    norm_subjects: List[str] = []
    if filter_subjects:
        for s in filter_subjects:
            ns = _normalize_subject(s)
            if ns and ns not in norm_subjects:
                norm_subjects.append(ns)

    if norm_chapters:
        # Only include subjects that actually have selected chapters (or match norm_subjects)
        ch_subjs = []
        for ch in norm_chapters:
            cs = get_chapter_subject(ch)
            if cs and cs not in ch_subjs:
                ch_subjs.append(cs)
        if ch_subjs:
            active_subjects = [s for s in CANONICAL_SUBJECTS if s in ch_subjs]
        else:
            active_subjects = [s for s in CANONICAL_SUBJECTS if s in norm_subjects] or list(CANONICAL_SUBJECTS)
    elif norm_subjects:
        active_subjects = [s for s in CANONICAL_SUBJECTS if s in norm_subjects]
    else:
        active_subjects = list(CANONICAL_SUBJECTS)

    if not active_subjects:
        active_subjects = list(CANONICAL_SUBJECTS)

    # Equal number of questions per subject
    subj_targets = distribute_counts(target_count, active_subjects)

    # Determine exam mode
    te = (target_exam or "").upper().strip()
    is_jee_advanced = te in ("ADVANCED", "JEE_ADVANCED", "ADV")
    is_jee_main = not is_jee_advanced

    # Determine explicit user type filters if any
    explicit_types: Set[str] = set()
    if question_types and len(question_types) > 0 and "ALL" not in [qt.upper() for qt in question_types]:
        for qt in question_types:
            explicit_types.add(_normalize_qtype(qt))
    elif question_type_filter and question_type_filter.upper() not in ("ALL", "MIXED"):
        explicit_types.add(_normalize_qtype(question_type_filter))

    # Difficulty filter
    diff_f = (difficulty_tier or "MIXED").strip().upper()
    has_diff_filter = diff_f not in ("ALL", "MIXED", "")

    # Pre-group all non-quarantined questions by subject
    by_subject_raw: Dict[str, List[dict]] = {s: [] for s in active_subjects}
    norm_chapters_set = {c.lower() for c in norm_chapters}

    for q in all_cached:
        q_subj = _normalize_subject(q.get("subject"))
        if q_subj not in by_subject_raw:
            continue
        if norm_chapters_set:
            q_ch_norm = normalize_chapter_name(q.get("chapter") or "").lower()
            q_ch_raw = (q.get("chapter") or "").strip().lower()
            if q_ch_norm not in norm_chapters_set and q_ch_raw not in norm_chapters_set:
                continue
        by_subject_raw[q_subj].append(q)

    passage_groups = _build_passage_groups(all_cached)
    seen_ids: Set[str] = set()
    seen_passages: Set[str] = set()
    final_questions: List[dict] = []

    # Resolve cumulative retention buckets if cumulative_mode is active
    bucket_recent_set: Set[str] = set()
    bucket_consol_set: Set[str] = set()
    bucket_fortress_set: Set[str] = set()

    if cumulative_mode:
        if cumulative_buckets and isinstance(cumulative_buckets, dict):
            bucket_recent_set = {normalize_chapter_name(str(c)).lower() for c in (cumulative_buckets.get("recent") or []) if c}
            bucket_consol_set = {normalize_chapter_name(str(c)).lower() for c in (cumulative_buckets.get("consolidation") or []) if c}
            bucket_fortress_set = {normalize_chapter_name(str(c)).lower() for c in (cumulative_buckets.get("fortress") or []) if c}

        if not (bucket_recent_set or bucket_consol_set or bucket_fortress_set) and user_ids and cursor:
            from backend.app.tools.cumulative_engine import classify_user_chapters_cumulative
            cls = classify_user_chapters_cumulative(cursor, user_ids[0], chapters=norm_chapters, subjects=norm_subjects)
            b = cls.get("buckets", {})
            bucket_recent_set = {normalize_chapter_name(it["chapter"]).lower() for it in b.get("recent", [])}
            bucket_consol_set = {normalize_chapter_name(it["chapter"]).lower() for it in b.get("consolidation", [])}
            bucket_fortress_set = {normalize_chapter_name(it["chapter"]).lower() for it in b.get("fortress", [])}

    for s in active_subjects:
        s_target = subj_targets.get(s, 0)
        if s_target <= 0:
            continue

        s_pool_raw = by_subject_raw.get(s, [])
        s_pool = _get_verified_pool(s_pool_raw)

        # If chapter filter was too restrictive and yielded < s_target in this subject, expand to full subject pool as fallback
        if len(s_pool) < s_target and norm_chapters_set:
            full_subj_raw = [q for q in all_cached if _normalize_subject(q.get("subject")) == s]
            s_pool_fallback = _get_verified_pool(full_subj_raw)
        else:
            s_pool_fallback = []

        # Discover active chapters in this subject pool and compute their official JEE weightages
        avail_chapters = sorted({normalize_chapter_name(q.get("chapter") or "") for q in s_pool if q.get("chapter")})
        if not avail_chapters and s_pool_fallback:
            avail_chapters = sorted({normalize_chapter_name(q.get("chapter") or "") for q in s_pool_fallback if q.get("chapter")})

        weights_map = {ch: get_chapter_weightage(ch) for ch in avail_chapters}
        if cumulative_mode and (bucket_recent_set or bucket_consol_set or bucket_fortress_set):
            for ch in avail_chapters:
                norm_c = normalize_chapter_name(ch).lower()
                b_mult = 1.0
                if norm_c in bucket_recent_set:
                    b_mult = 4.0  # ~60% weight
                elif norm_c in bucket_consol_set:
                    b_mult = 1.7  # ~25% weight
                elif norm_c in bucket_fortress_set:
                    b_mult = 1.0  # ~15% weight
                weights_map[ch] = max(0.1, weights_map[ch] * b_mult)

        ch_quotas = distribute_weighted_counts(s_target, weights_map)

        # Apply optional difficulty preference
        if has_diff_filter:
            diff_matched_pool = [q for q in s_pool if (q.get("difficulty_tier") or "MEDIUM").upper() == diff_f]
            other_pool = [q for q in s_pool if (q.get("difficulty_tier") or "MEDIUM").upper() != diff_f]
            if is_jee_advanced or len(diff_matched_pool) < s_target:
                # Keep difficulty-matched first, plus remaining as fallback so per-type quotas (e.g. Numerical) are met
                working_pool = diff_matched_pool + other_pool
            else:
                working_pool = diff_matched_pool
        else:
            working_pool = s_pool

        subj_selected: List[dict] = []

        if is_jee_main:
            # ─────────────────────────────────────────────────────────────
            # JEE MAIN FORMAT:
            # Strictly Single Choice (Section A: 80%) + Numerical (Section B: 20%)
            # ─────────────────────────────────────────────────────────────
            scq_pool = [q for q in working_pool if _normalize_qtype(q.get("question_type")) == "SINGLE_CHOICE"]
            nvq_pool = [q for q in working_pool if _normalize_qtype(q.get("question_type")) == "NUMERICAL"]

            if explicit_types == {"SINGLE_CHOICE"}:
                target_nvq = 0
                target_scq = s_target
            elif explicit_types == {"NUMERICAL"}:
                target_nvq = s_target
                target_scq = 0
            else:
                if s_target == 25:
                    target_nvq = 5
                    target_scq = 20
                elif s_target >= 4:
                    target_nvq = max(1, round(s_target * 0.20))
                    target_scq = s_target - target_nvq
                elif s_target == 3:
                    target_nvq = 1
                    target_scq = 2
                else:
                    target_nvq = 0
                    target_scq = s_target

            # 1. Pick Section B (Numerical Value Questions) across weighted chapters
            picked_nvq = _pick_from_chapters_weighted(
                candidates=nvq_pool,
                quota=target_nvq,
                ch_quotas=ch_quotas,
                weights_map=weights_map,
                seen_ids=seen_ids,
                seen_passages=seen_passages,
                passage_groups=passage_groups,
                prefer_advanced=False,
                seen_counts=seen_counts,
            )

            # Backfill any NVQ shortfall into Section A (Single Choice)
            nvq_shortfall = max(0, target_nvq - len(picked_nvq))
            eff_target_scq = target_scq + nvq_shortfall

            # 2. Pick Section A (Single Choice Questions) fulfilling remaining chapter weightage quotas
            picked_scq = _pick_from_chapters_weighted(
                candidates=scq_pool,
                quota=eff_target_scq,
                ch_quotas=ch_quotas,
                weights_map=weights_map,
                seen_ids=seen_ids,
                seen_passages=seen_passages,
                passage_groups=passage_groups,
                prefer_advanced=False,
                seen_counts=seen_counts,
            )

            subj_selected.extend(picked_scq)
            subj_selected.extend(picked_nvq)

            # 3. If still short (e.g. single small chapter selected), backfill from scq_pool / nvq_pool or subject fallback
            if len(subj_selected) < s_target:
                rem = s_target - len(subj_selected)
                extra_pool = [q for q in (working_pool + s_pool_fallback) if _normalize_qtype(q.get("question_type")) in ("SINGLE_CHOICE", "NUMERICAL")]
                extra = _pick_from_chapters_weighted(
                    candidates=extra_pool,
                    quota=rem,
                    ch_quotas=ch_quotas,
                    weights_map=weights_map,
                    seen_ids=seen_ids,
                    seen_passages=seen_passages,
                    passage_groups=passage_groups,
                    prefer_advanced=False,
                    seen_counts=seen_counts,
                )
                subj_selected.extend(extra)

            subj_selected = order_subject_questions_jee_main(subj_selected)

        else:
            # ─────────────────────────────────────────────────────────────
            # JEE ADVANCED FORMAT:
            # Section 1: Multiple Choice (One or More Than One Correct) (~33%)
            # Section 2: Numerical Value (~33%)
            # Section 3: Comprehension Passages (~22%)
            # Section 4: Matrix Match (~12%)
            # With chapter-weighted Advanced backfill so all 3 subjects have equal count
            # ─────────────────────────────────────────────────────────────
            multi_pool = [q for q in working_pool if _normalize_qtype(q.get("question_type")) == "MULTIPLE_CHOICE"]
            num_pool = [q for q in working_pool if _normalize_qtype(q.get("question_type")) == "NUMERICAL"]
            comp_pool = [q for q in working_pool if _normalize_qtype(q.get("question_type")) == "COMPREHENSION" or q.get("passage_id")]
            mat_pool = [q for q in working_pool if _normalize_qtype(q.get("question_type")) == "MATRIX_MATCH"]
            scq_adv_pool = [q for q in working_pool if _normalize_qtype(q.get("question_type")) == "SINGLE_CHOICE"]

            if explicit_types and len(explicit_types) < 5:
                # Respect explicit question type selection in Custom Generator while weighting by chapter
                filtered_adv = [q for q in working_pool if _normalize_qtype(q.get("question_type")) in explicit_types]
                picked_custom = _pick_from_chapters_weighted(
                    candidates=filtered_adv,
                    quota=s_target,
                    ch_quotas=ch_quotas,
                    weights_map=weights_map,
                    seen_ids=seen_ids,
                    seen_passages=seen_passages,
                    passage_groups=passage_groups,
                    prefer_advanced=True,
                    seen_counts=seen_counts,
                )
                subj_selected.extend(picked_custom)
            else:
                if s_target == 18:
                    t_multi, t_num, t_comp, t_mat = 6, 6, 4, 2
                else:
                    t_multi = max(1, round(s_target * 0.33)) if s_target >= 3 else 1
                    t_num = max(1, round(s_target * 0.33)) if s_target >= 3 else (1 if s_target >= 2 else 0)
                    t_comp = max(2, round(s_target * 0.22)) if s_target >= 6 else 0
                    t_mat = max(1, s_target - (t_multi + t_num + t_comp)) if s_target >= 5 else 0
                    diff_sum = s_target - (t_multi + t_num + t_comp + t_mat)
                    if diff_sum > 0:
                        t_num += diff_sum

                # 1. Comprehension passages first (since passages come in pairs/triplets)
                picked_comp = _pick_from_chapters_weighted(
                    candidates=comp_pool,
                    quota=t_comp,
                    ch_quotas=ch_quotas,
                    weights_map=weights_map,
                    seen_ids=seen_ids,
                    seen_passages=seen_passages,
                    passage_groups=passage_groups,
                    prefer_advanced=True,
                    seen_counts=seen_counts,
                )
                subj_selected.extend(picked_comp)

                # 2. Multiple Choice (One or More Than One Correct)
                picked_multi = _pick_from_chapters_weighted(
                    candidates=multi_pool,
                    quota=t_multi,
                    ch_quotas=ch_quotas,
                    weights_map=weights_map,
                    seen_ids=seen_ids,
                    seen_passages=seen_passages,
                    passage_groups=passage_groups,
                    prefer_advanced=True,
                    seen_counts=seen_counts,
                )
                subj_selected.extend(picked_multi)

                # 3. Matrix Match
                picked_mat = _pick_from_chapters_weighted(
                    candidates=mat_pool,
                    quota=t_mat,
                    ch_quotas=ch_quotas,
                    weights_map=weights_map,
                    seen_ids=seen_ids,
                    seen_passages=seen_passages,
                    passage_groups=passage_groups,
                    prefer_advanced=True,
                    seen_counts=seen_counts,
                )
                subj_selected.extend(picked_mat)

                # 4. Numerical Value (absorbs any shortfall from Multi/Comp/Matrix first)
                rem_for_num = max(t_num, s_target - len(subj_selected))
                # Cap numericals at ~45% of subject unless needed as final fallback so we don't flood with only numericals
                max_num_desired = max(t_num, round(s_target * 0.45))
                picked_num = _pick_from_chapters_weighted(
                    candidates=num_pool,
                    quota=min(rem_for_num, max_num_desired),
                    ch_quotas=ch_quotas,
                    weights_map=weights_map,
                    seen_ids=seen_ids,
                    seen_passages=seen_passages,
                    passage_groups=passage_groups,
                    prefer_advanced=True,
                    seen_counts=seen_counts,
                )
                subj_selected.extend(picked_num)

            # 5. Chapter-Weighted Backfill to guarantee exact `s_target` per subject
            if len(subj_selected) < s_target:
                rem = s_target - len(subj_selected)
                # First try any remaining genuine non-numerical Advanced types (Multi, Matrix, Comp)
                adv_rem_pool = multi_pool + mat_pool + comp_pool
                picked_adv_rem = _pick_from_chapters_weighted(
                    candidates=adv_rem_pool,
                    quota=rem,
                    ch_quotas=ch_quotas,
                    weights_map=weights_map,
                    seen_ids=seen_ids,
                    seen_passages=seen_passages,
                    passage_groups=passage_groups,
                    prefer_advanced=True,
                    seen_counts=seen_counts,
                )
                subj_selected.extend(picked_adv_rem)

            if len(subj_selected) < s_target:
                rem = s_target - len(subj_selected)
                # Next backfill with Hard/Medium Single Choice from the same subject following chapter weightages
                picked_scq_adv = _pick_from_chapters_weighted(
                    candidates=scq_adv_pool,
                    quota=rem,
                    ch_quotas=ch_quotas,
                    weights_map=weights_map,
                    seen_ids=seen_ids,
                    seen_passages=seen_passages,
                    passage_groups=passage_groups,
                    prefer_advanced=True,
                    seen_counts=seen_counts,
                )
                subj_selected.extend(picked_scq_adv)

            if len(subj_selected) < s_target and s_pool_fallback:
                rem = s_target - len(subj_selected)
                picked_fb = _pick_from_chapters_weighted(
                    candidates=s_pool_fallback,
                    quota=rem,
                    ch_quotas=ch_quotas,
                    weights_map=weights_map,
                    seen_ids=seen_ids,
                    seen_passages=seen_passages,
                    passage_groups=passage_groups,
                    prefer_advanced=True,
                    seen_counts=seen_counts,
                )
                subj_selected.extend(picked_fb)

            subj_selected = order_subject_questions_jee_advanced(subj_selected)

        final_questions.extend(subj_selected[:s_target])

    return final_questions
