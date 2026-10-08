"""
streaks_engine.py - Daily Study & Duel Streak Progression Engine for JEE Rivals.

Features:
1. Daily Study Streaks:
   - Tracks consecutive days of problem-solving and arena duels.
   - Preserves streaks across Speed Duels, Mock Tests, and Adaptive Practice.
2. Streak Freeze Shields:
   - Auto-consumes 1 shield if an aspirant misses a day, preventing painful resets.
   - Aspirants can hold up to 3 freeze shields.
3. Streak Milestone Rewards:
   - 3 Days: 🔥 Spark (+50 RP)
   - 7 Days: ⚡ Week of Fire (+150 RP & +1 Freeze Shield)
   - 14 Days: 🌋 Two-Week Grinder (+300 RP)
   - 30 Days: 👑 Monthly Titan (+750 RP, +1 Freeze Shield, Title: "Unbroken Aspirant")
   - 60 Days: 💎 Diamond Discipline (+1,500 RP)
   - 100 Days: 🏆 Centennial Immortal (+3,000 RP, +2 Freeze Shields)
4. Active Streak RP Multiplier:
   - +2% bonus RP per consecutive active day (up to +20% passive RP bonus).
5. Rolling 7-Day & Monthly Calendar matrix for visual display.
"""

import json
import datetime
from typing import Dict, Any, List, Optional

STREAK_MILESTONES = [
    {
        "days": 3,
        "title": "Spark of Fire",
        "icon": "🔥",
        "bonus_rp": 50,
        "bonus_freezes": 0,
        "title_unlock": None,
        "description": "Consistent 3-day study momentum established."
    },
    {
        "days": 7,
        "title": "Week of Fire",
        "icon": "⚡",
        "bonus_rp": 150,
        "bonus_freezes": 1,
        "title_unlock": "Firebrand Aspirant",
        "description": "A full 7-day unbroken cycle of problem solving."
    },
    {
        "days": 14,
        "title": "Two-Week Grinder",
        "icon": "🌋",
        "bonus_rp": 300,
        "bonus_freezes": 0,
        "title_unlock": None,
        "description": "Two weeks of relentless discipline."
    },
    {
        "days": 30,
        "title": "Monthly Titan",
        "icon": "👑",
        "bonus_rp": 750,
        "bonus_freezes": 1,
        "title_unlock": "Unbroken Aspirant",
        "description": "30 days of daily JEE preparation."
    },
    {
        "days": 60,
        "title": "Diamond Discipline",
        "icon": "💎",
        "bonus_rp": 1500,
        "bonus_freezes": 1,
        "title_unlock": "Iron Will",
        "description": "60 days of unbreakable consistency."
    },
    {
        "days": 100,
        "title": "Centennial Immortal",
        "icon": "🏆",
        "bonus_rp": 3000,
        "bonus_freezes": 2,
        "title_unlock": "Centennial Legend",
        "description": "100 consecutive days of mastering JEE concepts."
    }
]

FREEZE_COST_RP = 100
MAX_FREEZES = 3


def get_user_streak_meta(user: dict, cursor=None) -> Dict[str, Any]:
    """
    Computes real-time streak metadata, rolling 7-day calendar,
    next milestones, and protection status.
    """
    today_dt = datetime.date.today()
    today_str = today_dt.isoformat()

    current_streak = user.get("current_streak") or 0
    longest_streak = user.get("longest_streak") or 0
    last_active_date = user.get("last_active_date")
    freezes = user.get("streak_freezes")
    if freezes is None:
        freezes = 1

    raw_history = user.get("streak_history") or "[]"
    try:
        history_dates = json.loads(raw_history) if isinstance(raw_history, str) else raw_history
        if not isinstance(history_dates, list):
            history_dates = []
    except Exception:
        history_dates = []

    history_set = set(history_dates)

    # 1. Evaluate Current Streak Status
    is_active_today = (last_active_date == today_str)
    status = "COMPLETED" if is_active_today else "AT_RISK"

    if not is_active_today and last_active_date:
        try:
            last_dt = datetime.date.fromisoformat(last_active_date)
            diff_days = (today_dt - last_dt).days
            if diff_days == 1:
                status = "AT_RISK"  # Yesterday was done, today needs 1 action
            elif diff_days == 2:
                if freezes > 0:
                    status = "PROTECTED_BY_FREEZE"  # Missed yesterday, but shield is ready
                else:
                    status = "EXPIRED"
            elif diff_days > 2:
                status = "EXPIRED"
        except Exception:
            pass
    elif not last_active_date and current_streak == 0:
        status = "NOT_STARTED"

    # 2. Rolling 7-Day Window (Past 6 days + Today)
    weekly_calendar = []
    day_abbrs = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for i in range(6, -1, -1):
        target_day = today_dt - datetime.timedelta(days=i)
        target_str = target_day.isoformat()
        is_today = (target_day == today_dt)
        was_active = target_str in history_set or (is_today and is_active_today)

        weekly_calendar.append({
            "date": target_str,
            "day_name": day_abbrs[target_day.weekday()],
            "day_num": target_day.day,
            "is_today": is_today,
            "is_active": was_active
        })

    # 3. Next Milestone Calculation
    next_milestone = None
    for m in STREAK_MILESTONES:
        if m["days"] > current_streak:
            next_milestone = {
                "days": m["days"],
                "days_left": m["days"] - current_streak,
                "title": m["title"],
                "icon": m["icon"],
                "bonus_rp": m["bonus_rp"],
                "bonus_freezes": m["bonus_freezes"],
                "title_unlock": m["title_unlock"],
                "description": m["description"]
            }
            break

    # 4. Passive Streak RP Multiplier
    # +2% per day of streak up to max +20%
    streak_multiplier_pct = min(20, current_streak * 2)
    streak_multiplier = round(1.0 + (streak_multiplier_pct / 100.0), 2)

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "last_active_date": last_active_date,
        "is_active_today": is_active_today,
        "status": status,
        "streak_freezes": freezes,
        "max_freezes": MAX_FREEZES,
        "freeze_cost_rp": FREEZE_COST_RP,
        "can_buy_freeze": freezes < MAX_FREEZES and (user.get("weekly_rp", 0) >= FREEZE_COST_RP),
        "weekly_calendar": weekly_calendar,
        "next_milestone": next_milestone,
        "all_milestones": STREAK_MILESTONES,
        "streak_multiplier_pct": streak_multiplier_pct,
        "streak_multiplier": streak_multiplier,
        "history_count": len(history_dates)
    }


def record_daily_activity(user_id: str, cursor) -> Dict[str, Any]:
    """
    Called whenever a user solves an arena duel question, completes a mock test,
    or does adaptive practice. Increments streak if consecutive, applies freezes
    if needed, and grants milestone rewards.
    """
    cursor.execute("""
        SELECT id, username, weekly_rp, current_streak, longest_streak,
               last_active_date, streak_freezes, streak_history
        FROM users WHERE id = ?
    """, (user_id,))
    row = cursor.fetchone()
    if not row:
        return {"extended_today": False, "error": "User not found"}

    user = dict(row)
    today_dt = datetime.date.today()
    today_str = today_dt.isoformat()

    current_streak = user.get("current_streak") or 0
    longest_streak = user.get("longest_streak") or 0
    last_active_date = user.get("last_active_date")
    freezes = user.get("streak_freezes")
    if freezes is None:
        freezes = 1

    raw_history = user.get("streak_history") or "[]"
    try:
        history_dates = json.loads(raw_history) if isinstance(raw_history, str) else raw_history
        if not isinstance(history_dates, list):
            history_dates = []
    except Exception:
        history_dates = []

    # 1. Already Active Today
    if last_active_date == today_str:
        return {
            "extended_today": False,
            "already_done_today": True,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "bonus_rp": 0,
            "milestone": None,
            "saved_by_freeze": False
        }

    # 2. Evaluate Date Distance
    bonus_rp = 10  # Base daily streak practice bonus
    saved_by_freeze = False
    streak_reset = False
    milestone_hit = None
    title_unlocked = None

    if not last_active_date:
        # First day ever!
        new_streak = 1
        bonus_rp = 25  # Welcome streak starter
    else:
        try:
            last_dt = datetime.date.fromisoformat(last_active_date)
            diff_days = (today_dt - last_dt).days
        except Exception:
            diff_days = 999

        if diff_days == 1:
            # Consecutive day!
            new_streak = current_streak + 1
            bonus_rp = 10 * min(new_streak, 10)
        elif diff_days == 2:
            # Missed exactly yesterday: Check Freeze Shield
            if freezes > 0:
                freezes -= 1
                new_streak = current_streak + 1
                saved_by_freeze = True
                bonus_rp = 10
            else:
                new_streak = 1
                streak_reset = True
                bonus_rp = 10
        else:
            # Missed multiple days
            new_streak = 1
            streak_reset = True
            bonus_rp = 10

    longest_streak = max(longest_streak, new_streak)

    # 3. Check Milestone Rewards
    for m in STREAK_MILESTONES:
        if m["days"] == new_streak:
            bonus_rp += m["bonus_rp"]
            if m["bonus_freezes"] > 0:
                freezes = min(MAX_FREEZES, freezes + m["bonus_freezes"])
            milestone_hit = m
            if m.get("title_unlock"):
                title_unlocked = m["title_unlock"]
            break

    # 4. Append date to history
    if today_str not in history_dates:
        history_dates.append(today_str)
        # Keep up to 365 days of history
        if len(history_dates) > 365:
            history_dates = history_dates[-365:]

    # 5. Persist to SQLite
    cursor.execute("""
        UPDATE users
        SET current_streak = ?,
            longest_streak = ?,
            last_active_date = ?,
            streak_freezes = ?,
            streak_history = ?,
            weekly_rp = weekly_rp + ?
        WHERE id = ?
    """, (
        new_streak,
        longest_streak,
        today_str,
        freezes,
        json.dumps(history_dates),
        bonus_rp,
        user_id
    ))

    # Optional: unlock title if milestone provided one
    if title_unlocked:
        try:
            cursor.execute("UPDATE users SET title = ? WHERE id = ?", (title_unlocked, user_id))
        except Exception:
            pass

    # 6. Add In-App Notification if significant event occurred
    try:
        now_iso = datetime.datetime.utcnow().isoformat() + "Z"
        if milestone_hit:
            cursor.execute("""
                INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            """, (
                f"streak_{user_id}_{today_str}_{new_streak}",
                user_id,
                "STREAK_MILESTONE",
                f"🔥 {milestone_hit['title']} Unlocked!",
                f"You've maintained a {new_streak}-day study streak! Claimed +{milestone_hit['bonus_rp']} bonus RP.",
                json.dumps(milestone_hit),
                now_iso
            ))
        elif saved_by_freeze:
            cursor.execute("""
                INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            """, (
                f"freeze_{user_id}_{today_str}",
                user_id,
                "STREAK_FREEZE_USED",
                "🛡️ Streak Freeze Shield Consumed",
                f"A Freeze Shield saved your {new_streak}-day streak after missing yesterday. Keep practicing!",
                json.dumps({"freezes_remaining": freezes}),
                now_iso
            ))
    except Exception:
        pass

    return {
        "extended_today": True,
        "already_done_today": False,
        "current_streak": new_streak,
        "longest_streak": longest_streak,
        "bonus_rp": bonus_rp,
        "milestone": milestone_hit,
        "saved_by_freeze": saved_by_freeze,
        "streak_reset": streak_reset,
        "streak_freezes": freezes
    }


def buy_streak_freeze(user_id: str, cursor) -> Dict[str, Any]:
    """
    Allows user to purchase a Freeze Shield with 100 RP.
    """
    cursor.execute("SELECT weekly_rp, streak_freezes FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        raise ValueError("User not found")

    rp = row["weekly_rp"]
    freezes = row["streak_freezes"] if row["streak_freezes"] is not None else 1

    if freezes >= MAX_FREEZES:
        raise ValueError(f"You already hold the maximum number of Freeze Shields ({MAX_FREEZES}).")

    if rp < FREEZE_COST_RP:
        raise ValueError(f"Insufficient RP. You need {FREEZE_COST_RP} RP to purchase a Freeze Shield.")

    new_freezes = freezes + 1
    new_rp = rp - FREEZE_COST_RP

    cursor.execute("""
        UPDATE users
        SET weekly_rp = ?, streak_freezes = ?
        WHERE id = ?
    """, (new_rp, new_freezes, user_id))

    return {
        "success": True,
        "streak_freezes": new_freezes,
        "weekly_rp": new_rp,
        "message": f"Successfully purchased a Freeze Shield! ({new_freezes}/{MAX_FREEZES} shields held)"
    }
