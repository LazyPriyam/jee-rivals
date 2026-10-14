import datetime
import json
import sqlite3
import logging
from typing import List, Dict, Optional, Any, Set

logger = logging.getLogger("jee_rivals.cumulative_engine")

from backend.app.tools.jee_syllabus import (
    JEE_SYLLABUS,
    ALL_CANONICAL_CHAPTERS,
    normalize_chapter_name,
    get_chapter_subject,
    get_chapter_weightage
)

def classify_user_chapters_cumulative(
    cursor: sqlite3.Cursor,
    user_id: str,
    chapters: Optional[List[str]] = None,
    subjects: Optional[List[str]] = None,
    pinned_recent_chapters: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Classifies a user's target chapters into 3 cumulative retention buckets:
      - Recent Focus (Bucket A • ~60% Weight): Current focus chapters (or practiced in last 14 days).
      - Consolidation Review (Bucket B • ~25% Weight): Practiced 15-45 days ago (or recent revision drills).
      - Fortress Audit (Bucket C • ~15% Weight): Practiced >45 days ago or unattempted.
    
    If pinned_recent_chapters is provided (e.g. current week's topics), those chapters are
    strictly locked into Bucket A. Any warm-up drills on older chapters are classified as
    Revision Drills in Bucket B, permanently preventing old chapters from usurping Bucket A.
    """
    pinned_set: Set[str] = {
        normalize_chapter_name(str(c)).lower()
        for c in (pinned_recent_chapters or [])
        if c and str(c).strip()
    }

    # 1. Determine canonical target chapters
    target_chapters: List[str] = []
    seen_norm: Set[str] = set()

    # Always include pinned recent chapters in target chapters
    if pinned_recent_chapters:
        for ch in pinned_recent_chapters:
            if not ch or ch.lower() in ("all", "any", "mixed"):
                continue
            norm = normalize_chapter_name(ch)
            if norm and norm not in seen_norm:
                seen_norm.add(norm)
                target_chapters.append(norm)

    if chapters and len(chapters) > 0:
        for ch in chapters:
            if not ch or ch.lower() in ("all", "any", "mixed"):
                continue
            norm = normalize_chapter_name(ch)
            if norm and norm not in seen_norm:
                seen_norm.add(norm)
                target_chapters.append(norm)

    if not target_chapters:
        # Check if subject filter is provided
        if subjects and len(subjects) > 0:
            for s in subjects:
                for s_key, units in JEE_SYLLABUS.items():
                    if s_key.lower() == s.lower():
                        for u in units:
                            for ch in u.get("chapters", []):
                                norm = normalize_chapter_name(ch)
                                if norm and norm not in seen_norm:
                                    seen_norm.add(norm)
                                    target_chapters.append(norm)

    if not target_chapters:
        # Default to user's learnt chapters or full syllabus
        cursor.execute("SELECT learnt_chapters FROM users WHERE id = ?", (user_id,))
        u_row = cursor.fetchone()
        raw_learnt = u_row["learnt_chapters"] if u_row else "[]"
        try:
            learnt_list = json.loads(raw_learnt) if isinstance(raw_learnt, str) else (raw_learnt or [])
        except Exception:
            learnt_list = []

        if learnt_list:
            for ch in learnt_list:
                norm = normalize_chapter_name(ch)
                if norm and norm not in seen_norm:
                    seen_norm.add(norm)
                    target_chapters.append(norm)
        else:
            target_chapters = list(ALL_CANONICAL_CHAPTERS)

    # 2. Fetch history from activity_log and user_chapter_elo
    cursor.execute("""
        SELECT chapter, MAX(created_at) as last_attempt, COUNT(*) as cnt
        FROM activity_log
        WHERE user_id = ?
        GROUP BY chapter
    """, (user_id,))
    act_map = {normalize_chapter_name(r["chapter"]): dict(r) for r in cursor.fetchall() if r["chapter"]}

    cursor.execute("""
        SELECT chapter, last_updated, attempts
        FROM user_chapter_elo
        WHERE user_id = ?
    """, (user_id,))
    elo_map = {normalize_chapter_name(r["chapter"]): dict(r) for r in cursor.fetchall() if r["chapter"]}

    cursor.execute("SELECT learnt_chapters FROM users WHERE id = ?", (user_id,))
    u_row = cursor.fetchone()
    raw_learnt = u_row["learnt_chapters"] if u_row else "[]"
    try:
        user_learnt_set = set(json.loads(raw_learnt)) if isinstance(raw_learnt, str) else set(raw_learnt or [])
    except Exception:
        user_learnt_set = set()

    now_utc = datetime.datetime.utcnow()

    # 3. Analyze each chapter's recency
    chapter_items = []
    for ch in target_chapters:
        act_info = act_map.get(ch)
        elo_info = elo_map.get(ch)

        last_iso = None
        if act_info and act_info.get("last_attempt"):
            last_iso = act_info["last_attempt"]
        elif elo_info and elo_info.get("last_updated"):
            last_iso = elo_info["last_updated"]

        attempts = (act_info.get("cnt") if act_info else 0) or (elo_info.get("attempts") if elo_info else 0) or 0
        days_ago = None

        if last_iso:
            try:
                # Clean up ISO format
                cleaned = str(last_iso).replace("Z", "+00:00").split("+")[0]
                dt = datetime.datetime.fromisoformat(cleaned)
                days_ago = max(0, (now_utc - dt).days)
            except Exception:
                days_ago = None

        subj = get_chapter_subject(ch) or "Physics"
        weight = get_chapter_weightage(ch)
        is_pinned = normalize_chapter_name(ch).lower() in pinned_set

        # Generate status label
        if is_pinned:
            if days_ago is not None:
                label = f"🎯 Current Focus ({'Practiced today' if days_ago == 0 else f'{days_ago}d ago'})"
            else:
                label = "🎯 Current Focus • New Topic"
        elif days_ago is not None:
            if days_ago == 0:
                label = "Practiced today"
            elif days_ago == 1:
                label = "Practiced yesterday"
            elif days_ago < 7:
                label = f"Practiced {days_ago}d ago"
            elif days_ago < 30:
                label = f"Practiced {max(1, days_ago // 7)}w ago"
            else:
                label = f"Practiced {days_ago // 30}mo ago"
        else:
            if ch in user_learnt_set:
                label = "Marked learnt • Ready for audit"
            else:
                label = "No recent practice"

        chapter_items.append({
            "chapter": ch,
            "subject": subj,
            "weightage": weight,
            "days_ago": days_ago if days_ago is not None else 9999,
            "has_history": days_ago is not None,
            "attempts": attempts,
            "is_pinned": is_pinned,
            "label": label
        })

    # 4. Partition into 3 Buckets
    bucket_recent: List[dict] = []
    bucket_consolidation: List[dict] = []
    bucket_fortress: List[dict] = []
    total_selected = len(chapter_items)

    if pinned_set:
        # If user explicitly pinned Current Chapters, lock them in Bucket A
        for item in chapter_items:
            if item["is_pinned"]:
                bucket_recent.append(item)
            else:
                # Non-pinned chapters: warm-ups (<=14d) or older (15-45d) go into Consolidation
                if item["has_history"] and item["days_ago"] <= 45:
                    if item["days_ago"] <= 14:
                        item["label"] = f"Revision Drill ({'Today' if item['days_ago'] == 0 else f'{item['days_ago']}d ago'})"
                    bucket_consolidation.append(item)
                else:
                    bucket_fortress.append(item)
    else:
        # Standard Timeline Partitioning
        for item in chapter_items:
            if item["has_history"]:
                if item["days_ago"] <= 14:
                    bucket_recent.append(item)
                elif item["days_ago"] <= 45:
                    bucket_consolidation.append(item)
                else:
                    bucket_fortress.append(item)
            else:
                bucket_fortress.append(item)

        # Smart Relative Rebalance if non-pinned multi-chapter selection ended up in only 1 bucket
        if total_selected >= 3:
            empty_count = sum(1 for b in (bucket_recent, bucket_consolidation, bucket_fortress) if len(b) == 0)
            if empty_count >= 1:
                sorted_items = sorted(
                    chapter_items,
                    key=lambda x: (0 if x["has_history"] else 1, x["days_ago"], -x["attempts"])
                )
                n_recent = max(1, round(total_selected * 0.60))
                rem = total_selected - n_recent
                n_consol = max(1, round(rem * 0.65)) if rem > 1 else (1 if rem == 1 else 0)
                
                bucket_recent = sorted_items[:n_recent]
                bucket_consolidation = sorted_items[n_recent:n_recent + n_consol]
                bucket_fortress = sorted_items[n_recent + n_consol:]

    return {
        "buckets": {
            "recent": bucket_recent,
            "consolidation": bucket_consolidation,
            "fortress": bucket_fortress
        },
        "counts": {
            "recent": len(bucket_recent),
            "consolidation": len(bucket_consolidation),
            "fortress": len(bucket_fortress),
            "total": total_selected
        },
        "distribution": {
            "recent_pct": 60,
            "consolidation_pct": 25,
            "fortress_pct": 15
        }
    }
