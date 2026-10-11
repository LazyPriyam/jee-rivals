import json
import uuid
import datetime
import time
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from backend.app.database import get_connection
from backend.app.auth import get_current_user
from backend.app.tools.jee_syllabus import JEE_SYLLABUS, normalize_chapter_name
from backend.app.routes.questions import row_to_question_out
from backend.app.routes.rooms import create_room
from backend.app.models import RoomCreateRequest

router = APIRouter(prefix="/api/mastery", tags=["Chapter Mastery & Graveyard"])

HIGH_YIELD_CHAPTERS = {
    # Physics
    "Rotational Dynamics", "Work, Energy and Power", "Newton's Laws of Motion & Friction",
    "Electrostatics", "Current Electricity", "Magnetic Effects of Current",
    "Electromagnetic Induction", "Geometrical Optics", "Wave Optics",
    "Dual Nature of Radiation and Matter", "Atomic Physics", "Nuclear Physics",
    "Kinetic Theory of Gases & Thermodynamics", "Simple Harmonic Motion", "Gravitation",

    # Chemistry
    "Chemical Bonding and Molecular Structure", "Coordination Compounds",
    "Chemical Thermodynamics & Thermochemistry", "Solutions and Colligative Properties",
    "Chemical Kinetics", "General Organic Chemistry & IUPAC Nomenclature",
    "Aldehydes, Ketones and Carboxylic Acids", "Hydrocarbons (Alkanes, Alkenes, Alkynes)",
    "Some Basic Concepts of Chemistry (Mole Concept)", "Electrochemistry",
    "d and f-Block Elements", "p-Block Elements (Group 13 & 14)",

    # Mathematics
    "Definite Integration and Area Under Curves", "Indefinite Integration",
    "Limits, Continuity and Differentiability", "Differentiation and Applications of Derivatives",
    "Vector Algebra", "Three Dimensional Geometry",
    "Matrices and Determinants", "Complex Numbers and Quadratic Equations",
    "Straight Lines and Pair of Straight Lines", "Circles", "Parabola", "Ellipse",
    "Probability", "Sequences and Series", "Mathematical Induction & Binomial Theorem"
}

MEDIUM_YIELD_CHAPTERS = {
    # Physics
    "Kinematics 1D & 2D", "Fluid Mechanics", "Center of Mass and Collisions",
    "Alternating Current", "Semiconductor Electronics", "Heat Transfer",
    "Units and Dimensions", "Elasticity and Viscosity", "Electromagnetic Waves",

    # Chemistry
    "Structure of Atom", "Chemical Equilibrium", "Ionic Equilibrium",
    "Haloalkanes and Haloarenes", "Alcohols, Phenols and Ethers",
    "Amines and Nitrogen Containing Compounds", "Biomolecules",
    "Classification of Elements & Periodicity", "Redox Reactions",

    # Mathematics
    "Permutations and Combinations", "Hyperbola", "Differential Equations",
    "Sets, Relations and Functions", "Inverse Trigonometric Functions",
    "Statistics", "Trigonometric Equations"
}


def get_chapter_weightage(chapter_name: str) -> str:
    norm = normalize_chapter_name(chapter_name)
    if norm in HIGH_YIELD_CHAPTERS:
        return "HIGH"
    elif norm in MEDIUM_YIELD_CHAPTERS:
        return "MEDIUM"
    return "LOW"


def get_mastery_tier(elo: float) -> str:
    if elo >= 1800.0:
        return "MASTERED"
    elif elo >= 1500.0:
        return "PROFICIENT"
    elif elo >= 1300.0:
        return "EMERGING"
    return "CRITICAL"


class BookmarkRequest(BaseModel):
    question_id: str
    notes: Optional[str] = ""


class ReDuelRequest(BaseModel):
    question_ids: Optional[List[str]] = None
    subject: Optional[str] = None
    count: int = 5


_CHAPTER_Q_CACHE: tuple = (0.0, {})
_MASTERY_USER_CACHE: dict = {}

def invalidate_mastery_cache(user_id: Optional[str] = None):
    global _MASTERY_USER_CACHE
    if user_id:
        uid = str(user_id)
        for k in list(_MASTERY_USER_CACHE.keys()):
            if k[0] == uid:
                _MASTERY_USER_CACHE.pop(k, None)
    else:
        _MASTERY_USER_CACHE.clear()

def get_cached_chapter_q_counts(cursor) -> dict:
    global _CHAPTER_Q_CACHE
    now = time.time()
    last_time, counts = _CHAPTER_Q_CACHE
    if (now - last_time < 600.0) and counts:
        return counts
    try:
        from backend.app.tools.question_cache import get_all_questions_cached
        new_counts = {}
        for q in get_all_questions_cached(cursor=cursor):
            ch = q.get("chapter")
            if ch:
                new_counts[ch] = new_counts.get(ch, 0) + 1
        _CHAPTER_Q_CACHE = (now, new_counts)
        return new_counts
    except Exception:
        return counts


@router.get("/chapters")
def get_chapters_mastery(user: dict = Depends(get_current_user)):
    """
    Returns the comprehensive 92-chapter mastery matrix with independent Elo,
    attempt counts, accuracy, weightage, and mastery tier.
    """
    user_id = str(user["id"])
    now = time.time()
    state_sig = (user.get("total_solved"), user.get("overall_elo"))
    cache_key = (user_id, "chapters")
    cached = _MASTERY_USER_CACHE.get(cache_key)
    if cached and (now - cached[0] < 20.0) and cached[1] == state_sig:
        return cached[2]

    conn = get_connection()
    c = conn.cursor()

    # Fetch recorded chapter Elos
    c.execute("""
        SELECT subject, chapter, elo, attempts, correct, last_updated
        FROM user_chapter_elo
        WHERE user_id = ?
    """, (user_id,))
    records = {r["chapter"]: dict(r) for r in c.fetchall()}
    _MASTERY_USER_CACHE[(user_id, "elo_rows")] = (now, state_sig, records)

    # Also query activity_log for real pacing & speed metrics per chapter
    c.execute("""
        SELECT chapter, AVG(time_spent_seconds) as avg_time, COUNT(*) as cnt
        FROM activity_log
        WHERE user_id = ? AND time_spent_seconds > 0
        GROUP BY chapter
    """, (user_id,))
    speed_records = {r["chapter"]: dict(r) for r in c.fetchall()}

    # Also check questions database to see available questions count per chapter (cached)
    db_counts = get_cached_chapter_q_counts(c)
    conn.close()

    # Ideal benchmarks per subject
    IDEAL_PACE_MAP = {
        "Chemistry": 70,
        "Physics": 120,
        "Mathematics": 170
    }

    # Build matrix from authoritative syllabus
    chapters_out = []
    tier_counts = {"MASTERED": 0, "PROFICIENT": 0, "EMERGING": 0, "CRITICAL": 0}

    raw_stats = user.get("chapter_stats") or "{}"
    try:
        user_ch_stats = json.loads(raw_stats) if isinstance(raw_stats, str) else raw_stats
        if not isinstance(user_ch_stats, dict):
            user_ch_stats = {}
    except Exception:
        user_ch_stats = {}

    for subject, units in JEE_SYLLABUS.items():
        for unit_item in units:
            unit_name = unit_item["unit"]
            for ch in unit_item["chapters"]:
                norm_ch = normalize_chapter_name(ch)
                user_rec = records.get(norm_ch) or records.get(ch)

                if user_rec:
                    elo = float(user_rec.get("elo") or 1200.0)
                    attempts = int(user_rec.get("attempts") or 0)
                    correct = int(user_rec.get("correct") or 0)
                    last_updated = user_rec.get("last_updated")
                else:
                    legacy = user_ch_stats.get(norm_ch) or user_ch_stats.get(ch) or {}
                    elo = float(legacy.get("elo") or 1200.0)
                    attempts = int(legacy.get("attempts") or 0)
                    correct = int(legacy.get("correct") or 0)
                    last_updated = None

                acc = round((correct / attempts * 100), 1) if attempts > 0 else 0.0
                tier = get_mastery_tier(elo)
                tier_counts[tier] += 1
                weightage = get_chapter_weightage(norm_ch)

                q_available = db_counts.get(norm_ch) or db_counts.get(ch) or 0

                # Speed & Pacing calculation
                ideal_t = IDEAL_PACE_MAP.get(subject, 110)
                sp_rec = speed_records.get(norm_ch) or speed_records.get(ch)
                if sp_rec and sp_rec.get("avg_time"):
                    avg_t = round(float(sp_rec["avg_time"]))
                    if avg_t < ideal_t * 0.8:
                        sp_rating = "FAST"
                    elif avg_t <= ideal_t * 1.25:
                        sp_rating = "OPTIMAL"
                    else:
                        sp_rating = "SLOW"
                else:
                    avg_t = None
                    sp_rating = "UNTESTED"

                chapters_out.append({
                    "subject": subject,
                    "unit": unit_name,
                    "chapter": norm_ch,
                    "elo": round(elo, 1),
                    "attempts": attempts,
                    "correct": correct,
                    "accuracy": acc,
                    "avg_time_seconds": avg_t,
                    "ideal_time_seconds": ideal_t,
                    "speed_rating": sp_rating,
                    "weightage": weightage,
                    "mastery_tier": tier,
                    "questions_available": q_available,
                    "last_updated": last_updated
                })


    res = {
        "total_chapters": len(chapters_out),
        "tier_summary": tier_counts,
        "overall_elo": round(user.get("overall_elo", 1200.0), 1),
        "chapters": chapters_out
    }
    _MASTERY_USER_CACHE[cache_key] = (now, state_sig, res)
    return res


@router.get("/radar")
def get_weak_spots_radar(user: dict = Depends(get_current_user)):
    """
    Ranks the aspirant's weakest chapters using the Risk Factor algorithm:
    Risk = Weightage Multiplier * (2000 - Elo) + (100 - Accuracy) * Attempts Penalty
    High-yield chapters with low user rating generate the highest critical risk warnings.
    """
    user_id = str(user["id"])
    now = time.time()
    state_sig = (user.get("total_solved"), user.get("overall_elo"))
    cache_key = (user_id, "radar")
    cached = _MASTERY_USER_CACHE.get(cache_key)
    if cached and (now - cached[0] < 20.0) and cached[1] == state_sig:
        return cached[2]

    cached_rows = _MASTERY_USER_CACHE.get((user_id, "elo_rows"))
    if cached_rows and (now - cached_rows[0] < 20.0) and cached_rows[1] == state_sig:
        records = cached_rows[2]
    else:
        conn = get_connection()
        c = conn.cursor()
        c.execute("""
            SELECT subject, chapter, elo, attempts, correct
            FROM user_chapter_elo
            WHERE user_id = ?
        """, (user_id,))
        records = {r["chapter"]: dict(r) for r in c.fetchall()}
        conn.close()
        _MASTERY_USER_CACHE[(user_id, "elo_rows")] = (now, state_sig, records)

    weak_list = []

    for subject, units in JEE_SYLLABUS.items():
        for unit_item in units:
            unit_name = unit_item["unit"]
            for ch in unit_item["chapters"]:
                norm_ch = normalize_chapter_name(ch)
                user_rec = records.get(norm_ch) or records.get(ch)
                elo = float(user_rec.get("elo") or 1200.0) if user_rec else 1200.0
                attempts = int(user_rec.get("attempts") or 0) if user_rec else 0
                correct = int(user_rec.get("correct") or 0) if user_rec else 0
                acc = round((correct / attempts * 100), 1) if attempts > 0 else 0.0
                weightage = get_chapter_weightage(norm_ch)

                # Risk score formulation (0 - 100)
                wt_mult = 1.4 if weightage == "HIGH" else (1.0 if weightage == "MEDIUM" else 0.7)
                elo_deficit = max(0.0, (1800.0 - elo) / 800.0)  # 0 to 1
                acc_deficit = max(0.0, (100.0 - acc) / 100.0) if attempts > 0 else 0.5

                raw_risk = (elo_deficit * 0.6 + acc_deficit * 0.4) * wt_mult * 100.0
                risk_score = min(99, max(15, int(raw_risk)))

                if risk_score >= 80:
                    risk_level = "CRITICAL"
                    diagnosis = f"High-yield {subject} core with critical rating deficit. High risk of -1 to -4 negative marks."
                    action = "Immediate 5-Question Rescue Drill"
                elif risk_score >= 60:
                    risk_level = "HIGH"
                    diagnosis = f"Significant conceptual or speed trap in {norm_ch}. Requires reinforcement."
                    action = "Adaptive Target Sprint"
                elif risk_score >= 40:
                    risk_level = "MODERATE"
                    diagnosis = f"Developing chapter. Regular practice needed to transition to Proficient."
                    action = "Standard Speed Duel"
                else:
                    risk_level = "LOW"
                    diagnosis = f"Stable performance in {norm_ch}."
                    action = "Periodic Spaced Maintenance"

                weak_list.append({
                    "subject": subject,
                    "unit": unit_name,
                    "chapter": norm_ch,
                    "elo": round(elo, 1),
                    "attempts": attempts,
                    "correct": correct,
                    "accuracy": acc,
                    "weightage": weightage,
                    "risk_score": risk_score,
                    "risk_level": risk_level,
                    "diagnosis": diagnosis,
                    "recommended_action": action
                })

    # Sort descending by risk score
    weak_list.sort(key=lambda x: (x["risk_score"], -x["elo"]), reverse=True)

    res = {
        "critical_count": sum(1 for w in weak_list if w["risk_level"] == "CRITICAL"),
        "high_count": sum(1 for w in weak_list if w["risk_level"] == "HIGH"),
        "top_weak_spots": weak_list[:12]
    }
    _MASTERY_USER_CACHE[cache_key] = (now, state_sig, res)
    return res


@router.get("/graveyard")
def get_failure_graveyard(user: dict = Depends(get_current_user)):
    r"""
    Returns the student's question graveyard:
    - Questions with $\ge 1$ incorrect attempts in activity logs
    - Explicitly bookmarked questions
    - Joined with complete question text, options, formulas, and solution.
    """
    user_id = str(user["id"])
    now = time.time()
    state_sig = (user.get("total_solved"), user.get("total_correct"))
    cache_key = (user_id, "graveyard")
    cached = _MASTERY_USER_CACHE.get(cache_key)
    if cached and (now - cached[0] < 20.0) and cached[1] == state_sig:
        return cached[2]

    conn = get_connection()
    c = conn.cursor()

    # 1. Fetch bookmarked questions
    c.execute("SELECT question_id, notes, created_at FROM question_bookmarks WHERE user_id = ?", (user_id,))
    bookmarks = {r["question_id"]: {"notes": r["notes"] or "", "created_at": r["created_at"]} for r in c.fetchall()}

    # 2. Fetch failed attempts aggregated from activity_log
    c.execute("""
        SELECT question_id,
               COUNT(*) as total_attempts,
               SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) as fail_count,
               MAX(created_at) as last_attempted
        FROM activity_log
        WHERE user_id = ?
        GROUP BY question_id
        HAVING fail_count >= 1
    """, (user_id,))
    failed_attempts = {r["question_id"]: dict(r) for r in c.fetchall()}

    # Target question IDs: bookmarked questions + questions with failures
    target_qids = list(set(list(bookmarks.keys()) + list(failed_attempts.keys())))

    if not target_qids:
        conn.close()
        res = {"total_count": 0, "questions": []}
        _MASTERY_USER_CACHE[cache_key] = (now, state_sig, res)
        return res

    from backend.app.tools.question_cache import get_question_cached
    q_rows = []
    for qid in target_qids:
        qd = get_question_cached(qid, cursor=c)
        if qd:
            q_rows.append(qd)
    conn.close()

    graveyard_list = []
    for q in q_rows:
        qid = q["id"]
        q_out = row_to_question_out(q)
        bm_info = bookmarks.get(qid)
        fail_info = failed_attempts.get(qid) or {}

        fail_cnt = int(fail_info.get("fail_count") or (1 if not bm_info else 0))
        last_failed = fail_info.get("last_attempted") or bm_info.get("created_at") if bm_info else None

        graveyard_list.append({
            "question": q_out,
            "failure_count": fail_cnt,
            "last_failed_at": last_failed,
            "is_bookmarked": qid in bookmarks,
            "bookmark_notes": bm_info.get("notes", "") if bm_info else "",
            "solution_text": q.get("solution_text", ""),
            "common_pitfall": q.get("common_pitfall", ""),
            "key_formulas": json.loads(q.get("key_formulas") or "[]") if isinstance(q.get("key_formulas"), str) else (q.get("key_formulas") or [])
        })

    # Sort: Bookmarked first, then highest failure count, then most recent
    graveyard_list.sort(key=lambda x: (x["is_bookmarked"], x["failure_count"], x["last_failed_at"] or ""), reverse=True)

    res = {
        "total_count": len(graveyard_list),
        "bookmarked_count": len(bookmarks),
        "questions": graveyard_list
    }
    _MASTERY_USER_CACHE[cache_key] = (now, state_sig, res)
    return res


@router.post("/bookmark")
def toggle_bookmark(req: BookmarkRequest, user: dict = Depends(get_current_user)):
    """
    Toggles or updates notes on a bookmarked question in the Graveyard.
    """
    conn = get_connection()
    c = conn.cursor()
    user_id = user["id"]
    now = datetime.datetime.utcnow().isoformat()

    c.execute("SELECT * FROM question_bookmarks WHERE user_id = ? AND question_id = ?", (user_id, req.question_id))
    existing = c.fetchone()

    if existing:
        if req.notes == "__DELETE__":
            c.execute("DELETE FROM question_bookmarks WHERE user_id = ? AND question_id = ?", (user_id, req.question_id))
            action = "removed"
        else:
            c.execute("UPDATE question_bookmarks SET notes = ? WHERE user_id = ? AND question_id = ?", (req.notes or "", user_id, req.question_id))
            action = "updated"
    else:
        c.execute("""
            INSERT INTO question_bookmarks (user_id, question_id, notes, created_at)
            VALUES (?, ?, ?, ?)
        """, (user_id, req.question_id, req.notes or "", now))
        action = "added"

    conn.commit()
    conn.close()
    invalidate_mastery_cache(user_id)

    return {"message": f"Question successfully {action} in bookmarks.", "action": action}


@router.delete("/graveyard/{question_id}")
def remove_from_graveyard(question_id: str, user: dict = Depends(get_current_user)):
    """
    Removes question from bookmarks and suppresses it from the active failure graveyard.
    """
    conn = get_connection()
    c = conn.cursor()
    user_id = user["id"]

    c.execute("DELETE FROM question_bookmarks WHERE user_id = ? AND question_id = ?", (user_id, question_id))
    # Mark activity logs as resolved
    c.execute("UPDATE activity_log SET is_correct = 1 WHERE user_id = ? AND question_id = ?", (user_id, question_id))
    conn.commit()
    conn.close()
    invalidate_mastery_cache(user_id)

    return {"message": "Question redeemed and dismissed from graveyard."}


@router.post("/re-duel")
def create_revenge_duel(req: ReDuelRequest, user: dict = Depends(get_current_user)):
    """
    Instantly launches a 1v1 Revenge Duel or Solo Drill populated by the exact
    questions the aspirant previously failed on, allowing direct cognitive redemption.
    """
    conn = get_connection()
    c = conn.cursor()
    user_id = user["id"]

    q_ids = req.question_ids or []
    if not q_ids:
        # Pick top failed questions from graveyard
        c.execute("""
            SELECT question_id, COUNT(*) as fail_count
            FROM activity_log
            WHERE user_id = ? AND is_correct = 0
            GROUP BY question_id
            ORDER BY fail_count DESC
            LIMIT ?
        """, (user_id, max(3, req.count)))
        q_ids = [r["question_id"] for r in c.fetchall()]

    if not q_ids:
        # Fallback to bookmarks
        c.execute("SELECT question_id FROM question_bookmarks WHERE user_id = ? LIMIT ?", (user_id, max(3, req.count)))
        q_ids = [r["question_id"] for r in c.fetchall()]

    conn.close()

    if not q_ids:
        raise HTTPException(
            status_code=400,
            detail="Your Graveyard is empty! You have no recorded question failures to re-duel."
        )

    # Initialize room using question_ids
    room_req = RoomCreateRequest(
        mode="SPEED_DUEL",
        preset_name="Graveyard Revenge Duel",
        question_ids=q_ids[:7],
        question_count=len(q_ids[:7]),
        time_per_question=90,
        is_public=True
    )

    room_state = create_room(room_req, user)
    return {
        "message": "Revenge duel created! Conquer your past errors.",
        "room": room_state,
        "code": room_state.code
    }
