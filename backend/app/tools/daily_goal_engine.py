"""
daily_goal_engine.py - Daily Question Solving Goal Engine for JEE Rivals.

Features:
1. Daily Question Targets:
   - Students can configure their target daily problems (default: 60 Qs).
   - Preserves streak momentum and drives disciplined daily practice.
2. Multi-Mode Tracking:
   - Tracks questions solved across Speed Duels, Mock Tests, Custom Blueprints, and Adaptive Practice.
3. IST Day-Boundary Roll:
   - Automatically rolls over at 00:00:00 IST (UTC+5:30) for each new daily sprint.
4. Milestone Progression:
   - 0% (Ready), 25% (Pacing), 50% (Halfway), 75% (Turbo Sprint), 100% (Goal Smashed).
5. Celebratory Notifications:
   - Dispatches in-app notification when daily goal is reached.
"""

import uuid
import json
import datetime
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("jee_rivals.daily_goal")


def get_ist_today() -> str:
    """Returns today's date formatted as YYYY-MM-DD aligned with IST (UTC+5:30)."""
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    ist_now = now_utc + datetime.timedelta(hours=5, minutes=30)
    return ist_now.date().isoformat()


def get_user_daily_goal_status(user: dict) -> Dict[str, Any]:
    """
    Computes today's daily question goal metadata, current solved count,
    percentage completed, and milestone stage for the given user.
    """
    today_str = get_ist_today()
    goal = int(user.get("daily_question_goal") or 60)
    if goal <= 0:
        goal = 60

    saved_date = user.get("daily_goal_date")
    if saved_date == today_str:
        solved = int(user.get("daily_goal_solved") or 0)
    else:
        solved = 0

    pct = min(100.0, round((solved / goal * 100.0), 1)) if goal > 0 else 0.0

    # Milestone stages: 0=Ready(0%), 1=Walk(25%), 2=Run(50%), 3=Sprint(75%), 4=Finish(100%)
    if pct >= 100.0:
        stage = 4
        stage_name = "FINISHED"
    elif pct >= 75.0:
        stage = 3
        stage_name = "SPRINTING"
    elif pct >= 50.0:
        stage = 2
        stage_name = "RUNNING"
    elif pct >= 25.0:
        stage = 1
        stage_name = "WALKING"
    else:
        stage = 0
        stage_name = "READY"

    return {
        "daily_question_goal": goal,
        "daily_goal_solved": solved,
        "daily_goal_percent": pct,
        "daily_goal_reached": solved >= goal,
        "daily_goal_date": today_str,
        "milestone_stage": stage,
        "milestone_stage_name": stage_name,
        "remaining_questions": max(0, goal - solved)
    }


def record_daily_question_solved(user_id: str, cursor, count: int = 1) -> Dict[str, Any]:
    """
    Called whenever a user solves questions in Speed Duels, Mock Tests, or Adaptive Practice.
    Increments today's solved count (rolling over if day has changed) and dispatches a
    celebration notification if the target is newly achieved.
    """
    if count <= 0:
        return {}

    today_str = get_ist_today()

    cursor.execute("SELECT daily_question_goal, daily_goal_solved, daily_goal_date FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        return {}

    user_dict = dict(row)
    goal = int(user_dict.get("daily_question_goal") or 60)
    if goal <= 0:
        goal = 60

    saved_date = user_dict.get("daily_goal_date")
    curr_solved = int(user_dict.get("daily_goal_solved") or 0) if saved_date == today_str else 0
    new_solved = curr_solved + count

    cursor.execute("""
        UPDATE users
        SET daily_goal_solved = ?,
            daily_goal_date = ?
        WHERE id = ?
    """, (new_solved, today_str, user_id))

    # Detect if goal was newly achieved with this submission
    goal_newly_achieved = (curr_solved < goal and new_solved >= goal)
    if goal_newly_achieved:
        try:
            now_iso = datetime.datetime.utcnow().isoformat()
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            notif_title = f"🎯 Daily Goal Smashed! ({goal}/{goal} Qs)"
            notif_msg = (
                f"Outstanding discipline! You conquered today's daily target of {goal} questions. "
                f"Your relentless consistency is paving the road to top rank AIR!"
            )
            cursor.execute("""
                INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                VALUES (?, ?, 'DAILY_GOAL_ACHIEVED', ?, ?, ?, 0, ?)
            """, (
                notif_id,
                user_id,
                notif_title,
                notif_msg,
                json.dumps({"goal": goal, "solved": new_solved, "date": today_str}),
                now_iso
            ))
        except Exception as e:
            logger.warning(f"[DAILY_GOAL] Could not dispatch notification: {e}")

    pct = min(100.0, round((new_solved / goal * 100.0), 1)) if goal > 0 else 0.0

    return {
        "daily_question_goal": goal,
        "daily_goal_solved": new_solved,
        "daily_goal_percent": pct,
        "daily_goal_reached": new_solved >= goal,
        "goal_newly_achieved": goal_newly_achieved
    }
