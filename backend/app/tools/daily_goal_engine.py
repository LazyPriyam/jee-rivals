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
4. Historical & Mid-day Auto-Reconciliation:
   - Accurately captures problems already solved today from activity logs, room participants, and adaptive sessions.
5. Milestone Progression:
   - 0% (Ready), 25% (Pacing), 50% (Halfway), 75% (Turbo Sprint), 100% (Goal Smashed).
6. Celebratory Notifications:
   - Dispatches in-app notification when daily goal is reached.
"""

import uuid
import json
import datetime
import logging
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger("jee_rivals.daily_goal")


def get_ist_today_boundaries() -> Tuple[str, str]:
    """
    Returns (today_date_str, start_utc_iso) aligned with IST (UTC+5:30).
    Today starts at 00:00:00 IST (which is previous day 18:30:00 UTC).
    """
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    ist_now = now_utc + datetime.timedelta(hours=5, minutes=30)
    ist_today_str = ist_now.date().isoformat()

    # Midnight IST in UTC
    ist_midnight = datetime.datetime(ist_now.year, ist_now.month, ist_now.day, 0, 0, 0)
    start_utc = ist_midnight - datetime.timedelta(hours=5, minutes=30)
    start_utc_iso = start_utc.isoformat()
    return ist_today_str, start_utc_iso


def get_ist_today() -> str:
    """Returns today's date formatted as YYYY-MM-DD aligned with IST (UTC+5:30)."""
    today_str, _ = get_ist_today_boundaries()
    return today_str


def compute_today_solved_count(user_id: str, cursor) -> int:
    """
    Accurately calculates total questions attempted/solved today (since 00:00:00 IST)
    by inspecting activity_log, room_participants, and adaptive_sessions.
    """
    today_str, start_utc_iso = get_ist_today_boundaries()

    # 1. Activity Log (captures individual duel and adaptive questions)
    count_activity = 0
    try:
        cursor.execute("""
            SELECT COUNT(*) FROM activity_log
            WHERE user_id = ?
              AND (created_at >= ? OR created_at LIKE ?)
              AND mode NOT IN ('MOCK_TEST_SKIPPED', 'PROVISIONAL_REPORT_REFUND', 'CLAWBACK')
        """, (user_id, start_utc_iso, f"{today_str}%"))
        r = cursor.fetchone()
        if r:
            count_activity = int(r[0] or 0)
    except Exception as e:
        logger.warning(f"[DAILY_GOAL] activity_log query note: {e}")

    # 2. Room Participants (captures answered questions in duels and mock tests)
    count_rooms = 0
    try:
        cursor.execute("""
            SELECT rp.answers, rp.current_question_index, r.mode
            FROM room_participants rp
            LEFT JOIN rooms r ON rp.room_id = r.id
            WHERE rp.user_id = ? AND (rp.finished_at >= ? OR rp.finished_at LIKE ?)
        """, (user_id, start_utc_iso, f"{today_str}%"))
        for row in cursor.fetchall():
            row_dict = dict(row)
            raw_answers = row_dict.get("answers")
            valid_attempts = 0
            if raw_answers:
                try:
                    ans = json.loads(raw_answers) if isinstance(raw_answers, str) else raw_answers
                    if isinstance(ans, dict):
                        for k, v in ans.items():
                            if k.startswith("__"):
                                continue
                            sel = None
                            if isinstance(v, dict):
                                sel = v.get("selected")
                            elif isinstance(v, (str, int)):
                                sel = v
                            if sel is not None and str(sel).strip().upper() not in ("NONE", "SKIPPED", ""):
                                valid_attempts += 1
                except Exception:
                    pass

            # Only fallback to current_question_index for SPEED_DUEL where questions are sequentially answered
            if valid_attempts == 0 and row_dict.get("mode") == "SPEED_DUEL":
                valid_attempts = int(row_dict.get("current_question_index") or 0)

            count_rooms += valid_attempts
    except Exception as e:
        logger.warning(f"[DAILY_GOAL] room_participants query note: {e}")

    # 3. Adaptive Sessions (captures adaptive questions completed today)
    count_adaptive = 0
    try:
        cursor.execute("""
            SELECT total_attempted, history FROM adaptive_sessions
            WHERE user_id = ? AND (created_at >= ? OR completed_at >= ? OR created_at LIKE ? OR completed_at LIKE ?)
        """, (user_id, start_utc_iso, start_utc_iso, f"{today_str}%", f"{today_str}%"))
        for row in cursor.fetchall():
            row_dict = dict(row)
            att = int(row_dict.get("total_attempted") or 0)
            if att > 0:
                count_adaptive += att
            else:
                hist_raw = row_dict.get("history")
                if hist_raw:
                    try:
                        hist = json.loads(hist_raw) if isinstance(hist_raw, str) else hist_raw
                        if isinstance(hist, list):
                            count_adaptive += len(hist)
                    except Exception:
                        pass
    except Exception as e:
        logger.warning(f"[DAILY_GOAL] adaptive_sessions query note: {e}")

    return max(count_activity, count_rooms + count_adaptive)


def get_user_daily_goal_status(user: dict, cursor=None) -> Dict[str, Any]:
    """
    Computes today's daily question goal metadata, current solved count,
    percentage completed, and milestone stage for the given user.
    Auto-reconciles/restores questions solved earlier today and auto-heals any
    erroneous inflation from unattempted mock tests.
    """
    today_str, _ = get_ist_today_boundaries()
    goal = int(user.get("daily_question_goal") or 60)
    if goal <= 0:
        goal = 60

    saved_date = user.get("daily_goal_date")
    solved = int(user.get("daily_goal_solved") or 0) if saved_date == today_str else 0

    # Auto-reconcile / Auto-heal questions solved today:
    # Restores solved count if 0/expired, and auto-heals down if solved in DB was inflated by unattempted mock tests.
    user_id = user.get("id")
    if user_id:
        should_close = False
        conn = None
        work_cursor = cursor
        if work_cursor is None:
            try:
                from backend.app.database import get_connection
                conn = get_connection()
                work_cursor = conn.cursor()
                should_close = True
            except Exception:
                work_cursor = None

        if work_cursor is not None:
            try:
                detected_today = compute_today_solved_count(user_id, work_cursor)
                if saved_date != today_str or solved != detected_today:
                    solved = detected_today
                    work_cursor.execute("""
                        UPDATE users
                        SET daily_goal_solved = ?,
                            daily_goal_date = ?
                        WHERE id = ?
                    """, (solved, today_str, user_id))
                    if should_close and conn:
                        conn.commit()
            except Exception as e:
                logger.warning(f"[DAILY_GOAL] Auto-reconciliation note: {e}")
            finally:
                if should_close and conn:
                    try:
                        conn.close()
                    except Exception:
                        pass

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

    today_str, _ = get_ist_today_boundaries()

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


def reconcile_all_users_daily_goal(conn=None) -> Dict[str, Any]:
    """
    Iterates through all users in the system and computes their questions solved today (IST).
    If higher than their current daily_goal_solved, updates the database.
    """
    should_close = False
    if conn is None:
        from backend.app.database import get_connection
        conn = get_connection()
        should_close = True

    try:
        c = conn.cursor()
        today_str, _ = get_ist_today_boundaries()
        c.execute("SELECT id, username, daily_question_goal, daily_goal_solved, daily_goal_date FROM users")
        users = [dict(r) for r in c.fetchall()]

        updated_users = []
        for u in users:
            uid = u["id"]
            curr_solved = int(u.get("daily_goal_solved") or 0) if u.get("daily_goal_date") == today_str else 0
            detected = compute_today_solved_count(uid, c)
            if detected != curr_solved:
                c.execute("""
                    UPDATE users
                    SET daily_goal_solved = ?,
                        daily_goal_date = ?
                    WHERE id = ?
                """, (detected, today_str, uid))
                updated_users.append({
                    "username": u["username"],
                    "previous_solved": curr_solved,
                    "reconciled_solved": detected,
                    "goal": u.get("daily_question_goal") or 60
                })

        conn.commit()

        # Invalidate in-memory user caches so clients see updated counts immediately
        try:
            from backend.app.auth import invalidate_user_cache
            invalidate_user_cache()
        except Exception:
            pass

        return {
            "status": "SUCCESS",
            "date": today_str,
            "reconciled_count": len(updated_users),
            "updated_users": updated_users
        }
    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass
