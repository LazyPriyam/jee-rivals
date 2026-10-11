"""
Growth Triad Engine for JEE Rivals.
Evaluates the core three pillars of an aspirant's development:
1. Chapter Knowledge (0 - 100): Syllabus breadth across 92 chapters & depth of mastery.
2. Speed (0 - 100): Pacing, decision velocity & subject-specific time allocation.
3. Accuracy (0 - 100): Precision & avoidance of the costly -1 negative marking penalty.
"""

import json
import logging
import time
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("jee_rivals.growth_triad")

# Canonical 92 chapters standard in JEE Main/Advanced
TOTAL_SYLLABUS_CHAPTERS = 92

# Subject target pacing benchmarks in seconds per question
IDEAL_PACE_SECONDS = {
    "Chemistry": 70,      # Rapid recall, nomenclature, direct theory
    "Physics": 120,       # Conceptual application, diagrams, formula execution
    "Mathematics": 170    # Multi-step algebra, geometry, lengthy numerical solving
}

# Cache for triad calculations to prevent remote DB query overhead: user_id -> (timestamp, result)
_TRIAD_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}


def calculate_growth_triad(
    user: dict,
    cursor=None
) -> Dict[str, Any]:
    """
    Computes the Aspirant Growth Triad scores (0-100) and actionable coaching directives.
    Returns:
        {
            "chapter_knowledge": float,
            "speed": float,
            "accuracy": float,
            "composite": float,
            "active_chapters": int,
            "total_chapters": int,
            "breadth_percent": float,
            "mastered_chapters": int,
            "avg_pacing_seconds": int,
            "rolling_accuracy_percent": float,
            "negative_mark_drain": float,
            "directive": str,
            "triad_achievements": List[Dict[str, Any]]
        }
    """
    user_id = user.get("id", "")
    now_t = time.time()
    cached = _TRIAD_CACHE.get(user_id)
    if cached and (now_t - cached[0] < 30.0):
        return cached[1]

    # -------------------------------------------------------------
    # 1. CHAPTER KNOWLEDGE CALCULATION (0 - 100) FROM ACTUAL MASTERY
    # -------------------------------------------------------------
    from backend.app.tools.jee_syllabus import normalize_chapter_name

    ch_raw = user.get("chapter_stats") or "{}"
    try:
        ch_stats = json.loads(ch_raw) if isinstance(ch_raw, str) else ch_raw
        if not isinstance(ch_stats, dict):
            ch_stats = {}
    except Exception:
        ch_stats = {}

    chapter_mastery: Dict[str, Dict[str, Any]] = {}

    # A. Official persistent 92-chapter mastery records from user_chapter_elo
    if cursor and user_id:
        try:
            cursor.execute("""
                SELECT chapter, elo, attempts, correct
                FROM user_chapter_elo
                WHERE user_id = ? AND attempts > 0
            """, (user_id,))
            for r in cursor.fetchall():
                ch_norm = normalize_chapter_name(r["chapter"])
                if ch_norm:
                    chapter_mastery[ch_norm] = {
                        "elo": float(r["elo"] or 1200.0),
                        "attempts": int(r["attempts"] or 0),
                        "correct": int(r["correct"] or 0)
                    }
        except Exception as e:
            logger.warning(f"Error querying user_chapter_elo in triad: {e}")

    # B. Query activity_log for any attempted questions across duels, mocks, or practice
    if cursor and user_id:
        try:
            cursor.execute("""
                SELECT chapter, COUNT(*) as att, SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as corr
                FROM activity_log
                WHERE user_id = ?
                GROUP BY chapter
            """, (user_id,))
            for r in cursor.fetchall():
                ch_norm = normalize_chapter_name(r[0])
                if ch_norm and ch_norm not in chapter_mastery:
                    chapter_mastery[ch_norm] = {
                        "elo": 1200.0,
                        "attempts": int(r[1] or 0),
                        "correct": int(r[2] or 0)
                    }
        except Exception:
            pass

    # C. Query user chapter_stats for legacy attempts
    for ch_raw_name, stat in ch_stats.items():
        if isinstance(stat, dict) and stat.get("attempts", 0) > 0:
            ch_norm = normalize_chapter_name(ch_raw_name)
            if ch_norm and ch_norm not in chapter_mastery:
                chapter_mastery[ch_norm] = {
                    "elo": float(stat.get("elo") or 1200.0),
                    "attempts": int(stat.get("attempts", 0)),
                    "correct": int(stat.get("correct", 0))
                }

    # Evaluate breadth and mastery depth strictly from tested chapters
    active_set = set()
    mastered_count = 0     # 1800+ Elo
    proficient_count = 0   # 1500-1799 Elo
    emerging_count = 0     # 1300-1499 Elo
    critical_count = 0     # <1300 Elo

    for ch_name, data in chapter_mastery.items():
        if data["attempts"] > 0:
            active_set.add(ch_name)
            elo = data["elo"]
            if elo >= 1800.0:
                mastered_count += 1
            elif elo >= 1500.0:
                proficient_count += 1
            elif elo >= 1300.0:
                emerging_count += 1
            else:
                critical_count += 1

    active_chapters_count = len(active_set)
    breadth_pct = round((active_chapters_count / float(TOTAL_SYLLABUS_CHAPTERS)) * 100.0, 1)

    # Depth & quality of mastery across the syllabus
    # 25 mastered/proficient chapters represents top 1% national JEE readiness
    depth_score = min(
        100.0,
        ((mastered_count * 1.0 + proficient_count * 0.75 + emerging_count * 0.45 + critical_count * 0.15) / 25.0) * 100.0
    )

    # Chapter Knowledge: 55% Syllabus Breadth + 45% Tested Mastery Depth
    knowledge_score = min(
        100.0,
        round((breadth_pct * 0.55) + (depth_score * 0.45), 1)
    )

    # -------------------------------------------------------------
    # 2. SPEED CALCULATION (0 - 100)
    # -------------------------------------------------------------
    speed_samples = []
    if cursor and user_id:
        try:
            cursor.execute("""
                SELECT subject, time_spent_seconds, is_correct
                FROM activity_log
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT 60
            """, (user_id,))
            rows = cursor.fetchall()
            for r in rows:
                speed_samples.append({
                    "subject": r[0],
                    "time": max(1, int(r[1] or 60)),
                    "correct": bool(r[2])
                })
        except Exception:
            pass

    overall_elo = float(user.get("overall_elo", 1200.0))
    if speed_samples:
        efficiency_factors = []
        total_time_sum = 0
        for sample in speed_samples:
            subj = sample["subject"]
            t = sample["time"]
            total_time_sum += t
            ideal = IDEAL_PACE_SECONDS.get(subj, 110)

            # Ratio of ideal to actual time
            # Ratio of 1.0 means exactly target pace -> yields score ~85
            # Faster (< ideal) up to 1.6 ratio gives bonus if correct, or penalizes if guess
            ratio = ideal / float(t)
            if t < 15 and not sample["correct"]:
                # Reckless guess penalty
                factor = 0.2
            elif ratio > 1.8:
                # Capped upper reward to prevent blind click inflation
                factor = 1.3 if sample["correct"] else 0.4
            else:
                factor = min(1.25, max(0.2, ratio))
            efficiency_factors.append(factor)

        avg_efficiency = sum(efficiency_factors) / len(efficiency_factors)
        avg_pace = round(total_time_sum / len(speed_samples))
        # Map average efficiency (0.4 - 1.2) to (35 - 98)
        speed_score = min(99.0, max(25.0, round(avg_efficiency * 75.0, 1)))
    else:
        # Calibrated baseline from Elo
        base_speed = 52.0 + min(43.0, max(0.0, (overall_elo - 1200.0) / 22.0))
        speed_score = round(base_speed, 1)
        avg_pace = 105

    # -------------------------------------------------------------
    # 3. ACCURACY CALCULATION (0 - 100)
    # -------------------------------------------------------------
    total_solved = int(user.get("total_solved", 0))
    total_correct = int(user.get("total_correct", 0))
    incorrect_count = max(0, total_solved - total_correct)

    if total_solved > 0:
        raw_acc = (total_correct / float(total_solved)) * 100.0
        # True JEE Net Efficiency: (Correct * 4 - Incorrect * 1) / (Attempted * 4)
        net_score = max(0.0, (total_correct * 4.0 - incorrect_count * 1.0) / (total_solved * 4.0)) * 100.0
        # Blend 70% Net efficiency + 30% Raw accuracy
        accuracy_score = min(100.0, max(0.0, round(net_score * 0.7 + raw_acc * 0.3, 1)))
    else:
        accuracy_score = 65.0
        raw_acc = 65.0

    # -------------------------------------------------------------
    # 4. CHAPTER-WISE ACCURACY & SPEED BREAKDOWN
    # -------------------------------------------------------------
    chapter_breakdown = []
    if cursor and user_id:
        try:
            cursor.execute("""
                SELECT chapter, subject,
                       COUNT(*) as att,
                       SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as corr,
                       AVG(time_spent_seconds) as avg_t
                FROM activity_log
                WHERE user_id = ? AND time_spent_seconds > 0
                GROUP BY chapter
            """, (user_id,))
            rows = cursor.fetchall()
            for r in rows:
                c_att = int(r[2] or 0)
                c_corr = int(r[3] or 0)
                c_avg_t = round(float(r[4] or 60))
                c_acc = round((c_corr / float(c_att)) * 100.0, 1) if c_att > 0 else 0.0
                ideal_p = IDEAL_PACE_SECONDS.get(r[1], 110)
                sp_tag = "OPTIMAL"
                if c_avg_t < ideal_p * 0.8:
                    sp_tag = "FAST"
                elif c_avg_t > ideal_p * 1.25:
                    sp_tag = "SLOW"

                chapter_breakdown.append({
                    "chapter": r[0],
                    "subject": r[1],
                    "attempted": c_att,
                    "correct": c_corr,
                    "accuracy": c_acc,
                    "avg_time_seconds": c_avg_t,
                    "ideal_time_seconds": ideal_p,
                    "speed_rating": sp_tag
                })
        except Exception:
            pass

    logged_chaps = {c["chapter"] for c in chapter_breakdown}
    for ch_name, stat in ch_stats.items():
        if ch_name not in logged_chaps and isinstance(stat, dict) and stat.get("attempts", 0) > 0:
            c_att = stat.get("attempts", 0)
            c_corr = stat.get("correct", 0)
            c_acc = round((c_corr / float(c_att)) * 100.0, 1) if c_att > 0 else 0.0
            subj = stat.get("subject", "Physics")
            ideal_p = IDEAL_PACE_SECONDS.get(subj, 110)
            chapter_breakdown.append({
                "chapter": ch_name,
                "subject": subj,
                "attempted": c_att,
                "correct": c_corr,
                "accuracy": c_acc,
                "avg_time_seconds": ideal_p,
                "ideal_time_seconds": ideal_p,
                "speed_rating": "OPTIMAL"
            })

    # -------------------------------------------------------------
    # 5. COMPOSITE INDEX & DIRECTIVE
    # -------------------------------------------------------------
    composite = round((knowledge_score * 0.35 + speed_score * 0.30 + accuracy_score * 0.35), 1)

    # Actionable 1-liner prescription based on the weakest pillar
    lowest = min(
        ("KNOWLEDGE", knowledge_score),
        ("SPEED", speed_score),
        ("ACCURACY", accuracy_score),
        key=lambda x: x[1]
    )[0]

    if lowest == "KNOWLEDGE":
        directive = (
            f"Syllabus breadth ({active_chapters_count}/92 chapters) is your primary constraint. "
            "Branch out into untouched high-yield chapters to unlock easy exam marks."
        )
    elif lowest == "SPEED":
        directive = (
            f"Your current pacing (~{avg_pace}s/q) limits paper completion. "
            "Practice rapid Chemistry sprints (target <65s) to preserve valuable minutes for Math."
        )
    else:
        directive = (
            f"Negative marks are eroding your percentile ({round(accuracy_score)}% accuracy). "
            "Implement a strict triage rule: skip uncertain problems rather than gifting away 5 marks."
        )

    # -------------------------------------------------------------
    # 6. UNLOCKABLE TRIAD ACHIEVEMENTS
    # -------------------------------------------------------------
    triad_achievements = [
        # Knowledge Milestones
        {
            "id": "triad_scout_25",
            "title": "Syllabus Scout",
            "description": "Activate 25 or more chapters in your competitive study path.",
            "category": "TRIAD",
            "icon": "🧭",
            "target": 25,
            "current": active_chapters_count,
            "is_unlocked": active_chapters_count >= 25,
            "progress_percent": min(100.0, round((active_chapters_count / 25.0) * 100.0, 1))
        },
        {
            "id": "triad_halfway_50",
            "title": "Halfway Titan",
            "description": "Cover 50 out of 92 canonical JEE chapters.",
            "category": "TRIAD",
            "icon": "🗺️",
            "target": 50,
            "current": active_chapters_count,
            "is_unlocked": active_chapters_count >= 50,
            "progress_percent": min(100.0, round((active_chapters_count / 50.0) * 100.0, 1))
        },
        {
            "id": "triad_polymath_80",
            "title": "All-India Polymath",
            "description": "Unlock 80+ chapters across Physics, Chemistry, and Mathematics.",
            "category": "TRIAD",
            "icon": "🌌",
            "target": 80,
            "current": active_chapters_count,
            "is_unlocked": active_chapters_count >= 80,
            "progress_percent": min(100.0, round((active_chapters_count / 80.0) * 100.0, 1))
        },
        # Speed Milestones
        {
            "id": "triad_speed_75",
            "title": "Pacing Virtuoso",
            "description": "Achieve a Speed score of 75+ with calibrated subject pacing.",
            "category": "TRIAD",
            "icon": "⚡",
            "target": 75,
            "current": speed_score,
            "is_unlocked": speed_score >= 75.0,
            "progress_percent": min(100.0, round((speed_score / 75.0) * 100.0, 1))
        },
        {
            "id": "triad_speed_88",
            "title": "Supersonic Solver",
            "description": "Attain a Speed score of 88+ in high-stakes duels and test sessions.",
            "category": "TRIAD",
            "icon": "🚀",
            "target": 88,
            "current": speed_score,
            "is_unlocked": speed_score >= 88.0,
            "progress_percent": min(100.0, round((speed_score / 88.0) * 100.0, 1))
        },
        # Accuracy Milestones
        {
            "id": "triad_accuracy_80",
            "title": "Precision Sniper",
            "description": "Maintain an Accuracy score of 80%+ under full exam pressure.",
            "category": "TRIAD",
            "icon": "🎯",
            "target": 80,
            "current": accuracy_score,
            "is_unlocked": accuracy_score >= 80.0,
            "progress_percent": min(100.0, round((accuracy_score / 80.0) * 100.0, 1))
        },
        {
            "id": "triad_accuracy_90",
            "title": "Flawless Execution",
            "description": "Reach a legendary Accuracy score of 90%+ with near-zero negative marking.",
            "category": "TRIAD",
            "icon": "💎",
            "target": 90,
            "current": accuracy_score,
            "is_unlocked": accuracy_score >= 90.0,
            "progress_percent": min(100.0, round((accuracy_score / 90.0) * 100.0, 1))
        },
        # Harmonious Composite
        {
            "id": "triad_apex_85",
            "title": "Balanced JEE Titan",
            "description": "Achieve a Triad Composite score of 85+ across all three dimensions.",
            "category": "TRIAD",
            "icon": "👑",
            "target": 85,
            "current": composite,
            "is_unlocked": composite >= 85.0,
            "progress_percent": min(100.0, round((composite / 85.0) * 100.0, 1))
        }
    ]

    result = {
        "chapter_knowledge": knowledge_score,
        "speed": speed_score,
        "accuracy": accuracy_score,
        "composite": composite,
        "active_chapters": active_chapters_count,
        "total_chapters": TOTAL_SYLLABUS_CHAPTERS,
        "breadth_percent": breadth_pct,
        "mastered_chapters": mastered_count,
        "avg_pacing_seconds": avg_pace,
        "rolling_accuracy_percent": round(raw_acc, 1),
        "negative_mark_drain": round(incorrect_count * 1.0, 1),
        "directive": directive,
        "triad_achievements": triad_achievements,
        "chapter_metrics": chapter_breakdown
    }

    _TRIAD_CACHE[user_id] = (now_t, result)
    return result


def invalidate_user_triad_cache(user_id: str):
    """Clears cached triad calculation for a user upon new test or duel completion."""
    _TRIAD_CACHE.pop(str(user_id), None)
