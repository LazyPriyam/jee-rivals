import datetime
import json
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Depends

from backend.app.database import get_connection, get_user_by_username
from backend.app.models import UserProfile, ProfileUpdateRequest
from backend.app.auth import get_current_user
from backend.app.routes.auth import format_user_profile
from backend.app.tools.jee_syllabus import build_user_skill_tree
from backend.app.tools.achievements_engine import evaluate_user_achievements
from backend.app.tools.division_engine import evaluate_user_division, DIVISION_TIERS_CONFIG

router = APIRouter(prefix="/api/leaderboards", tags=["Leaderboards & Ranks"])

def calculate_division(rank: int, total_users: int) -> str:
    # Retained as fast fallback; full evaluation is now performed by division_engine
    if rank <= 3:
        return "GRANDMASTER"
    elif rank <= 10:
        return "MASTER"
    elif rank <= 25:
        return "DIAMOND"
    elif rank <= 50:
        return "PLATINUM"
    elif rank <= 100:
        return "GOLD"
    elif rank <= 250:
        return "SILVER"
    return "BRONZE"

def get_next_sunday_utc() -> str:
    now = datetime.datetime.utcnow()
    # 6 is Sunday in weekday() (Monday is 0)
    days_ahead = 6 - now.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    target = (now + datetime.timedelta(days=days_ahead)).replace(hour=23, minute=59, second=59, microsecond=0)
    return target.isoformat() + "Z"


@router.get("/division/me")
def get_my_division_details(current_user: dict = Depends(get_current_user)):
    """
    Returns the calling player's rich division status, sub-tier progress,
    promotion/relegation zone, and all divisional tier milestones.
    """
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) as higher FROM users WHERE weekly_rp > ?", (current_user.get("weekly_rp", 0),))
    higher_count = c.fetchone()["higher"]
    my_rank = higher_count + 1

    c.execute("SELECT COUNT(*) as total FROM users")
    total_users = c.fetchone()["total"]
    conn.close()

    solved = current_user.get("total_solved", 0)
    correct = current_user.get("total_correct", 0)
    div_meta = evaluate_user_division(
        weekly_rp=current_user.get("weekly_rp", 0),
        overall_elo=current_user.get("overall_elo", 1200.0),
        total_solved=solved,
        total_correct=correct,
        rank=my_rank,
        total_users=total_users,
        physics_elo=current_user.get("physics_elo", 1200.0),
        chemistry_elo=current_user.get("chemistry_elo", 1200.0),
        math_elo=current_user.get("math_elo", 1200.0)
    )

    return {
        "rank": my_rank,
        "total_aspirants": total_users,
        "division": div_meta,
        "all_tiers": DIVISION_TIERS_CONFIG,
        "reset_at": get_next_sunday_utc()
    }


@router.get("/weekly")
def get_weekly_leaderboard(limit: int = Query(50, ge=1, le=100)):
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT id, username, avatar_id, title, weekly_rp, total_solved, total_correct, overall_elo,
               physics_elo, chemistry_elo, math_elo, gold_medals, silver_medals, bronze_medals, current_streak
        FROM users
        ORDER BY weekly_rp DESC, overall_elo DESC
        LIMIT ?
    """, (limit,))
    rows = [dict(r) for r in c.fetchall()]

    c.execute("SELECT COUNT(*) as total FROM users")
    total_users = c.fetchone()["total"]
    conn.close()

    leaderboard = []
    for rank, u in enumerate(rows, start=1):
        solved = u.get("total_solved", 0)
        correct = u.get("total_correct", 0)
        acc = round((correct / solved * 100), 1) if solved > 0 else 0.0

        div_meta = evaluate_user_division(
            weekly_rp=u.get("weekly_rp", 0),
            overall_elo=u.get("overall_elo", 1200.0),
            total_solved=solved,
            total_correct=correct,
            rank=rank,
            total_users=total_users,
            physics_elo=u.get("physics_elo", 1200.0),
            chemistry_elo=u.get("chemistry_elo", 1200.0),
            math_elo=u.get("math_elo", 1200.0)
        )

        leaderboard.append({
            "rank": rank,
            "user_id": u["id"],
            "username": u["username"],
            "avatar_id": u.get("avatar_id") or "default",
            "title": u.get("title") or "JEE Aspirant",
            "weekly_rp": u.get("weekly_rp", 0),
            "streak": u.get("current_streak") or 0,
            "division": div_meta["full_name"],
            "division_id": div_meta["tier_id"],
            "division_sub": div_meta["subdivision"],
            "division_zone": div_meta["zone"],
            "division_zone_label": div_meta["zone_label"],
            "division_progress": div_meta["progress_percent"],
            "division_icon": div_meta["icon"],
            "division_color": div_meta["color"],
            "division_multiplier": div_meta["multiplier"],
            "division_air": div_meta["air_bracket"],
            "overall_elo": round(u.get("overall_elo", 1200.0), 1),
            "accuracy": acc,
            "medals": {
                "gold": u.get("gold_medals", 0),
                "silver": u.get("silver_medals", 0),
                "bronze": u.get("bronze_medals", 0)
            }
        })

    return {
        "reset_at": get_next_sunday_utc(),
        "total_active_aspirants": total_users,
        "leaderboard": leaderboard,
        "all_tiers": DIVISION_TIERS_CONFIG
    }


@router.get("/elo")
def get_elo_leaderboard(subject: str = Query("overall"), limit: int = Query(50, ge=1, le=100)):
    subj = subject.strip().lower()
    elo_col = "overall_elo"
    if subj == "physics":
        elo_col = "physics_elo"
    elif subj == "chemistry":
        elo_col = "chemistry_elo"
    elif subj in ("math", "mathematics"):
        elo_col = "math_elo"

    conn = get_connection()
    c = conn.cursor()

    c.execute(f"""
        SELECT id, username, avatar_id, title, {elo_col} as elo, overall_elo, physics_elo, chemistry_elo, math_elo,
               total_solved, total_correct, gold_medals, silver_medals, bronze_medals
        FROM users
        ORDER BY {elo_col} DESC
        LIMIT ?
    """, (limit,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    ladder = []
    for rank, u in enumerate(rows, start=1):
        ladder.append({
            "rank": rank,
            "user_id": u["id"],
            "username": u["username"],
            "avatar_id": u.get("avatar_id") or "default",
            "title": u.get("title") or "JEE Aspirant",
            "rating": round(u.get("elo", 1200.0), 1),
            "ratings": {
                "overall": round(u.get("overall_elo", 1200.0), 1),
                "physics": round(u.get("physics_elo", 1200.0), 1),
                "chemistry": round(u.get("chemistry_elo", 1200.0), 1),
                "math": round(u.get("math_elo", 1200.0), 1)
            },
            "medals": {
                "gold": u.get("gold_medals", 0),
                "silver": u.get("silver_medals", 0),
                "bronze": u.get("bronze_medals", 0)
            }
        })

    return {
        "subject": subj,
        "ladder": ladder
    }


@router.put("/profile/me", response_model=UserProfile)
def update_current_user_profile(
    req: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    conn = get_connection()
    c = conn.cursor()

    updates = []
    params = []
    if req.target_college is not None:
        updates.append("target_college = ?")
        params.append(req.target_college.strip())
    if req.target_exam_date is not None:
        updates.append("target_exam_date = ?")
        params.append(req.target_exam_date.strip())
    if req.bio is not None:
        updates.append("bio = ?")
        params.append(req.bio.strip())
    if req.banner_theme is not None:
        updates.append("banner_theme = ?")
        params.append(req.banner_theme.strip())
    if req.pinned_badges is not None:
        updates.append("pinned_badges = ?")
        params.append(json.dumps(req.pinned_badges))
    if req.title is not None:
        updates.append("title = ?")
        params.append(req.title.strip())
    if req.avatar_id is not None:
        updates.append("avatar_id = ?")
        params.append(req.avatar_id.strip())

    if updates:
        params.append(current_user["id"])
        c.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(params))
        conn.commit()

    c.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],))
    updated_user = dict(c.fetchone())
    conn.close()

    return format_user_profile(updated_user)


@router.get("/profile/{username}")
def get_public_profile(username: str):
    user = get_user_by_username(username.strip())
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found.")

    conn = get_connection()
    c = conn.cursor()

    # 1. Rank History for AIR Trajectory Curve
    c.execute("""
        SELECT overall_elo, predicted_air_bracket, created_at
        FROM user_rank_history
        WHERE user_id = ?
        ORDER BY id ASC
    """, (user["id"],))
    rank_history = [dict(r) for r in c.fetchall()]

    if not rank_history:
        from backend.app.tools.elo_engine import get_user_syllabus_coverage, compute_two_factor_air_bracket
        cov = get_user_syllabus_coverage(c, user["id"])
        cur_elo = round(user.get("overall_elo", 1200.0), 1)
        base_elo = max(1050.0, cur_elo - 150.0)
        p1 = round(base_elo, 1)
        p2 = round(base_elo + (cur_elo - base_elo) * 0.35, 1)
        p3 = round(base_elo + (cur_elo - base_elo) * 0.65, 1)
        p4 = round(base_elo + (cur_elo - base_elo) * 0.85, 1)
        p5 = cur_elo

        def bracket_for(e, ratio):
            ch_cnt = max(1, int(cov["active_count"] * ratio)) if cov["active_count"] > 0 else 1
            b, _, _ = compute_two_factor_air_bracket(e, ch_cnt, cov["active_subjects_count"])
            return b

        now_dt = datetime.datetime.utcnow()
        seeds = [
            (p1, bracket_for(p1, 0.4), (now_dt - datetime.timedelta(days=28)).strftime("%Y-%m-%d")),
            (p2, bracket_for(p2, 0.6), (now_dt - datetime.timedelta(days=21)).strftime("%Y-%m-%d")),
            (p3, bracket_for(p3, 0.8), (now_dt - datetime.timedelta(days=14)).strftime("%Y-%m-%d")),
            (p4, bracket_for(p4, 0.9), (now_dt - datetime.timedelta(days=7)).strftime("%Y-%m-%d")),
            (p5, bracket_for(p5, 1.0), now_dt.strftime("%Y-%m-%d")),
        ]
        for s_elo, s_b, s_date in seeds:
            c.execute("INSERT INTO user_rank_history (user_id, overall_elo, predicted_air_bracket, created_at) VALUES (?, ?, ?, ?)",
                      (user["id"], s_elo, s_b, s_date))
        conn.commit()
        rank_history = [{"overall_elo": s[0], "predicted_air_bracket": s[1], "created_at": s[2]} for s in seeds]

    # 2. Syllabus Skill Tree (Chapter-based, strictly NO topics)
    c.execute("""
        SELECT subject, chapter, is_correct, time_spent_seconds
        FROM activity_log
        WHERE user_id = ?
    """, (user["id"],))
    activity_rows = [dict(r) for r in c.fetchall()]

    c.execute("""
        SELECT chapter, COUNT(*) as cnt
        FROM questions
        WHERE validation_status IS NULL OR validation_status != 'QUARANTINED'
        GROUP BY chapter
    """)
    q_counts = {r["chapter"]: r["cnt"] for r in c.fetchall()}
    skill_tree_data = build_user_skill_tree(activity_rows, q_counts)

    # 3. Achievements & Trophy Shelf
    c.execute("""
        SELECT COUNT(*) as duel_wins
        FROM room_participants rp
        WHERE rp.user_id = ? AND rp.score > 0
    """, (user["id"],))
    duel_wins_row = c.fetchone()
    duel_wins = duel_wins_row["duel_wins"] if duel_wins_row else 0

    c.execute("""
        SELECT MAX(best_streak) as max_streak
        FROM adaptive_sessions
        WHERE user_id = ?
    """, (user["id"],))
    st_row = c.fetchone()
    best_streak = (st_row["max_streak"] if st_row and st_row["max_streak"] is not None else 0)

    extra_stats = {
        "duel_wins": duel_wins,
        "best_streak": max(best_streak, 1 if user.get("total_correct", 0) > 0 else 0)
    }
    achievements_data = evaluate_user_achievements(user, extra_stats)

    # 4. Chess.com Style Battle Log / Match History
    c.execute("""
        SELECT r.id as room_id, r.code, r.target_exam, r.status, r.created_at, r.completed_at,
               rp.score as my_score, rp.marks as my_marks
        FROM room_participants rp
        JOIN rooms r ON rp.room_id = r.id
        WHERE rp.user_id = ? AND (r.status = 'COMPLETED' OR rp.is_finished = 1)
        ORDER BY r.created_at DESC
        LIMIT 15
    """, (user["id"],))
    recent_matches_raw = [dict(r) for r in c.fetchall()]

    match_history = []
    for m in recent_matches_raw:
        c.execute("""
            SELECT rp.score, rp.marks, u.id, u.username, u.avatar_id, u.overall_elo
            FROM room_participants rp
            JOIN users u ON rp.user_id = u.id
            WHERE rp.room_id = ? AND rp.user_id != ?
            LIMIT 1
        """, (m["room_id"], user["id"]))
        opp = c.fetchone()

        my_score = m["my_score"] or 0
        opp_score = opp["score"] if opp else 0
        opp_name = opp["username"] if opp else "Practice Arena Bot"
        opp_avatar = opp["avatar_id"] if opp else "robot"
        opp_elo = round(opp["overall_elo"], 1) if opp and opp["overall_elo"] else 1200.0

        if my_score > opp_score:
            res = "WIN"
            delta = "+16"
        elif my_score < opp_score:
            res = "LOSS"
            delta = "-12"
        else:
            res = "DRAW"
            delta = "+2"

        match_history.append({
            "room_id": m["room_id"],
            "room_code": m["code"],
            "target_exam": m["target_exam"] or "MIXED",
            "date": (m["completed_at"] or m["created_at"] or "")[:10],
            "result": res,
            "elo_delta": delta,
            "my_score": my_score,
            "opponent": {
                "username": opp_name,
                "avatar_id": opp_avatar,
                "elo": opp_elo,
                "score": opp_score
            }
        })

    # 5. Recent Activity Attempts
    c.execute("""
        SELECT subject, chapter, is_correct, time_spent_seconds, mode, created_at
        FROM activity_log
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 10
    """, (user["id"],))
    recent_acts = [dict(r) for r in c.fetchall()]

    # 6. Chapter Breakdown for Stats
    c.execute("""
        SELECT chapter, subject, COUNT(*) as total, SUM(is_correct) as correct, AVG(time_spent_seconds) as avg_time
        FROM activity_log
        WHERE user_id = ?
        GROUP BY chapter, subject
        ORDER BY total DESC
        LIMIT 8
    """, (user["id"],))
    chap_perf = []
    for r in c.fetchall():
        tot = r["total"]
        cor = r["correct"] or 0
        chap_perf.append({
            "chapter": r["chapter"],
            "subject": r["subject"],
            "attempts": tot,
            "accuracy": round((cor / tot) * 100, 1) if tot > 0 else 0,
            "avg_time": round(r["avg_time"] or 0, 1)
        })

    # 7. Completed Mock Tests & Practice Examination Papers
    from backend.app.routes.rooms import get_user_test_history
    try:
        test_history = get_user_test_history(user=user)
    except Exception:
        test_history = []

    profile = format_user_profile(user, cursor=c)
    conn.close()

    return {
        "profile": profile.dict(),
        "rank_history": rank_history,
        "skill_tree": skill_tree_data,
        "achievements": achievements_data,
        "match_history": match_history,
        "test_history": test_history,
        "recent_activity": recent_acts,
        "chapter_breakdown": chap_perf
    }
