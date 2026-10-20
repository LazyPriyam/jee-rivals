"""
streaks_engine.py - Daily Study & Duel Streak Progression Engine for JEE Rivals.

Features:
1. Pure Daily Study Streaks:
   - Tracks consecutive days of problem-solving and arena duels in IST (Indian Standard Time, UTC+5:30).
   - Preserves streaks across Speed Duels, Mock Tests, Custom Blueprints, and Adaptive Practice.
   - Clean, honest rules: Practice daily to advance. If yesterday was missed, the streak resets to 0.
2. Self-Healing & Passive Expiration:
   - Evaluates active streaks in real-time according to IST boundaries.
   - If questions were solved today, self-heals and credits the streak immediately.
   - Accurately reports expiration if a day was missed without leaving stale numbers.
3. Streak Milestone Rewards:
   - 3 Days: 🔥 Spark of Fire (+50 RP)
   - 7 Days: ⚡ Week of Fire (+150 RP, Title: "Firebrand Aspirant")
   - 14 Days: 🌋 Two-Week Grinder (+300 RP)
   - 30 Days: 👑 Monthly Titan (+750 RP, Title: "Unbroken Aspirant")
   - 60 Days: 💎 Diamond Discipline (+1,500 RP, Title: "Iron Will")
   - 100 Days: 🏆 Centennial Immortal (+3,000 RP, Title: "Centennial Legend")
4. Active Streak RP Multiplier:
   - +2% bonus RP per consecutive active day (up to +20% passive RP bonus).
5. Rolling 7-Day & Monthly Calendar matrix for visual display.
"""

import json
import datetime
from typing import Dict, Any, List, Optional


def get_ist_now() -> datetime.datetime:
    """Returns current datetime in Indian Standard Time (UTC+5:30)."""
    return datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=5, minutes=30)


def get_ist_today_date() -> datetime.date:
    """Returns today's date in Indian Standard Time."""
    return get_ist_now().date()


def get_ist_today_str() -> str:
    """Returns today's date formatted as YYYY-MM-DD in IST."""
    return get_ist_today_date().isoformat()


STREAK_MILESTONES = [
    {
        "days": 3,
        "title": "Spark of Fire",
        "icon": "🔥",
        "bonus_rp": 50,
        "title_unlock": None,
        "description": "Consistent 3-day study momentum established."
    },
    {
        "days": 7,
        "title": "Week of Fire",
        "icon": "⚡",
        "bonus_rp": 150,
        "title_unlock": "Firebrand Aspirant",
        "description": "A full 7-day unbroken cycle of problem solving."
    },
    {
        "days": 14,
        "title": "Two-Week Grinder",
        "icon": "🌋",
        "bonus_rp": 300,
        "title_unlock": None,
        "description": "Two weeks of relentless daily discipline."
    },
    {
        "days": 30,
        "title": "Monthly Titan",
        "icon": "👑",
        "bonus_rp": 750,
        "title_unlock": "Unbroken Aspirant",
        "description": "30 days of daily JEE preparation."
    },
    {
        "days": 60,
        "title": "Diamond Discipline",
        "icon": "💎",
        "bonus_rp": 1500,
        "title_unlock": "Iron Will",
        "description": "60 days of unbreakable consistency."
    },
    {
        "days": 100,
        "title": "Centennial Immortal",
        "icon": "🏆",
        "bonus_rp": 3000,
        "title_unlock": "Centennial Legend",
        "description": "100 consecutive days of mastering JEE concepts."
    }
]


def get_user_streak_meta(user: dict, cursor=None) -> Dict[str, Any]:
    """
    Computes real-time streak metadata, rolling 7-day calendar,
    next milestones, and consistency status aligned strictly with IST.
    """
    today_dt = get_ist_today_date()
    today_str = today_dt.isoformat()

    current_streak = int(user.get("current_streak") or 0)
    longest_streak = int(user.get("longest_streak") or 0)
    last_active_date = user.get("last_active_date")

    raw_history = user.get("streak_history") or "[]"
    try:
        history_dates = json.loads(raw_history) if isinstance(raw_history, str) else raw_history
        if not isinstance(history_dates, list):
            history_dates = []
    except Exception:
        history_dates = []

    # 1. Self-Healing: If user solved questions today but last_active_date != today_str,
    # auto-record their activity so they never lose a streak they earned today.
    user_id = user.get("id")
    if cursor and user_id and last_active_date != today_str:
        try:
            # Midnight IST in UTC
            ist_midnight_utc = (
                datetime.datetime(today_dt.year, today_dt.month, today_dt.day, 0, 0, 0)
                - datetime.timedelta(hours=5, minutes=30)
            ).isoformat()
            cursor.execute("""
                SELECT 1 FROM activity_log
                WHERE user_id = ? AND (created_at >= ? OR created_at LIKE ?)
                LIMIT 1
            """, (user_id, ist_midnight_utc, f"{today_str}%"))
            if cursor.fetchone():
                record_daily_activity(user_id, cursor)
                cursor.execute(
                    "SELECT current_streak, longest_streak, last_active_date, streak_history FROM users WHERE id = ?",
                    (user_id,)
                )
                upd_row = cursor.fetchone()
                if upd_row:
                    upd = dict(upd_row)
                    current_streak = int(upd.get("current_streak") or 0)
                    longest_streak = int(upd.get("longest_streak") or 0)
                    last_active_date = upd.get("last_active_date")
                    raw_history = upd.get("streak_history") or "[]"
                    try:
                        history_dates = json.loads(raw_history) if isinstance(raw_history, str) else raw_history
                    except Exception:
                        history_dates = []
        except Exception:
            pass

    history_set = set(history_dates)

    # 2. Evaluate Current Streak Status
    is_active_today = (last_active_date == today_str)

    if is_active_today:
        current_streak = max(1, current_streak)
        status = "COMPLETED"
    elif last_active_date:
        try:
            last_dt = datetime.date.fromisoformat(last_active_date)
            diff_days = (today_dt - last_dt).days
        except Exception:
            diff_days = 999

        if diff_days == 1:
            # Yesterday was active; today is still pending
            status = "AT_RISK"
        elif diff_days > 1:
            # Missed at least yesterday -> streak has expired
            current_streak = 0
            status = "EXPIRED"
            if cursor and user_id and int(user.get("current_streak") or 0) > 0:
                try:
                    cursor.execute("UPDATE users SET current_streak = 0 WHERE id = ?", (user_id,))
                except Exception:
                    pass
        else:
            # Same day / clock edge case
            is_active_today = True
            current_streak = max(1, current_streak)
            status = "COMPLETED"
    else:
        current_streak = 0
        status = "NOT_STARTED"

    longest_streak = max(longest_streak, current_streak)

    # 3. Rolling 7-Day Window in IST (Past 6 days + Today)
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

    # 4. Next Milestone Calculation
    next_milestone = None
    for m in STREAK_MILESTONES:
        if m["days"] > current_streak:
            next_milestone = {
                "days": m["days"],
                "days_left": m["days"] - current_streak,
                "title": m["title"],
                "icon": m["icon"],
                "bonus_rp": m["bonus_rp"],
                "title_unlock": m["title_unlock"],
                "description": m["description"]
            }
            break

    # 5. Passive Streak RP Multiplier (+2% per consecutive day up to +20%)
    streak_multiplier_pct = min(20, current_streak * 2)
    streak_multiplier = round(1.0 + (streak_multiplier_pct / 100.0), 2)

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "last_active_date": last_active_date,
        "is_active_today": is_active_today,
        "status": status,
        "weekly_calendar": weekly_calendar,
        "next_milestone": next_milestone,
        "all_milestones": STREAK_MILESTONES,
        "streak_multiplier_pct": streak_multiplier_pct,
        "streak_multiplier": streak_multiplier,
        "history_count": len(history_dates),
        "streak_freezes": 0
    }


def record_daily_activity(user_id: str, cursor) -> Dict[str, Any]:
    """
    Called whenever a user solves an arena duel question, completes a mock test,
    or does adaptive practice. Increments streak if consecutive, resets if a day was missed,
    and grants milestone rewards.
    """
    cursor.execute("""
        SELECT id, username, weekly_rp, current_streak, longest_streak,
               last_active_date, streak_history
        FROM users WHERE id = ?
    """, (user_id,))
    row = cursor.fetchone()
    if not row:
        return {"extended_today": False, "error": "User not found"}

    user = dict(row)
    today_dt = get_ist_today_date()
    today_str = today_dt.isoformat()

    current_streak = int(user.get("current_streak") or 0)
    longest_streak = int(user.get("longest_streak") or 0)
    last_active_date = user.get("last_active_date")

    raw_history = user.get("streak_history") or "[]"
    try:
        history_dates = json.loads(raw_history) if isinstance(raw_history, str) else raw_history
        if not isinstance(history_dates, list):
            history_dates = []
    except Exception:
        history_dates = []

    # 1. Already Active Today (in IST)
    if last_active_date == today_str:
        return {
            "extended_today": False,
            "already_done_today": True,
            "current_streak": max(1, current_streak),
            "longest_streak": longest_streak,
            "bonus_rp": 0,
            "milestone": None,
            "streak_reset": False,
            "streak_freezes": 0
        }

    # 2. Evaluate Date Distance in IST
    bonus_rp = 10  # Base daily streak practice bonus
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
            bonus_rp = 15 * min(new_streak, 10)
        elif diff_days > 1:
            # Missed at least yesterday -> streak broke, restart at 1 today!
            new_streak = 1
            streak_reset = True
            bonus_rp = 10
        else:
            # Same day edge case
            new_streak = max(1, current_streak)
            bonus_rp = 0

    longest_streak = max(longest_streak, new_streak)

    # 3. Check Milestone Rewards
    for m in STREAK_MILESTONES:
        if m["days"] == new_streak:
            bonus_rp += m["bonus_rp"]
            milestone_hit = m
            if m.get("title_unlock"):
                title_unlocked = m["title_unlock"]
            break

    # 4. Append date to history
    if today_str not in history_dates:
        history_dates.append(today_str)
        if len(history_dates) > 365:
            history_dates = history_dates[-365:]

    # 5. Persist to SQLite
    cursor.execute("""
        UPDATE users
        SET current_streak = ?,
            longest_streak = ?,
            last_active_date = ?,
            streak_freezes = 0,
            streak_history = ?,
            weekly_rp = weekly_rp + ?
        WHERE id = ?
    """, (
        new_streak,
        longest_streak,
        today_str,
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

    # 6. Add In-App Notification if significant milestone hit
    try:
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
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
    except Exception:
        pass

    return {
        "extended_today": True,
        "already_done_today": False,
        "current_streak": new_streak,
        "longest_streak": longest_streak,
        "bonus_rp": bonus_rp,
        "milestone": milestone_hit,
        "streak_reset": streak_reset,
        "streak_freezes": 0
    }


def buy_streak_freeze(user_id: str, cursor) -> Dict[str, Any]:
    """Deprecated: Streak freeze shields have been retired."""
    return {
        "success": False,
        "streak_freezes": 0,
        "message": "Freeze shields have been retired. Practice daily to maintain your momentum!"
    }
