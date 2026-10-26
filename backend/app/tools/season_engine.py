"""
season_engine.py - Automated Weekly League & Season Rollover Engine for JEE Rivals.

Cadence:
- Every Monday at 05:29:59 AM IST (Sunday 23:59:59 UTC).
- Evaluates the concluding week's cohort.
- Awards permanent Gold, Silver, and Bronze Medals to Top 3 podium finishers.
- Evaluates Dual-Gate promotion/relegation and updates users.current_division.
- Dispatches personalized In-App notifications.
- Archives the season dossier in season_history.
- Resets all users' weekly_rp to 0 for the fresh sprint.
"""

import uuid
import datetime
import json
import logging
from typing import Dict, Any, Optional, List

from backend.app.database import get_connection
from backend.app.tools.division_engine import evaluate_user_division

logger = logging.getLogger("jee_rivals.season")

_LAST_CHECK_TIMESTAMP = 0.0


def get_current_season_meta() -> Dict[str, Any]:
    """
    Returns the active and last completed season codes and timestamps according to IST.
    """
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    ist_now = now_utc + datetime.timedelta(hours=5, minutes=30)
    year, week, weekday = ist_now.isocalendar()

    active_season_code = f"{year}-W{week:02d}"
    prev_week = week - 1 if week > 1 else 52
    prev_year = year if week > 1 else year - 1
    completed_season_code = f"{prev_year}-W{prev_week:02d}"

    # Current week ends next Sunday 23:59:59 UTC (Monday 05:30:00 AM IST)
    days_until_sunday = (7 - weekday) % 7
    next_reset_dt = (now_utc + datetime.timedelta(days=days_until_sunday)).replace(
        hour=23, minute=59, second=59, microsecond=0
    )
    if next_reset_dt <= now_utc:
        next_reset_dt += datetime.timedelta(days=7)

    return {
        "active_season_code": active_season_code,
        "completed_season_code": completed_season_code,
        "ist_now": ist_now.isoformat(),
        "next_reset_utc": next_reset_dt.isoformat() + "Z",
        "iso_weekday": weekday
    }


def check_and_execute_season_rollover(force: bool = False, conn=None) -> Dict[str, Any]:
    """
    Checks if the preceding weekly season is pending rollover.
    If pending (or if force=True), executes the full promotion, medal awarding,
    season archiving, and weekly_rp reset pipeline.
    Thread-safe and idempotent: will only execute once per season_code.
    """
    global _LAST_CHECK_TIMESTAMP
    now_epoch = datetime.datetime.now().timestamp()
    if not force and (now_epoch - _LAST_CHECK_TIMESTAMP < 45.0):
        return {"status": "SKIPPED_THROTTLED"}
    _LAST_CHECK_TIMESTAMP = now_epoch

    meta = get_current_season_meta()
    target_code = meta["completed_season_code"]

    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    try:
        c = conn.cursor()

        # 1. Ensure required tables exist
        c.execute("""
            CREATE TABLE IF NOT EXISTS season_history (
                id TEXT PRIMARY KEY,
                season_code TEXT UNIQUE NOT NULL,
                winner_id TEXT,
                winner_username TEXT,
                runner_up_id TEXT,
                runner_up_username TEXT,
                third_id TEXT,
                third_username TEXT,
                total_participants INTEGER DEFAULT 0,
                top_rp INTEGER DEFAULT 0,
                ended_at TEXT NOT NULL
            );
        """)

        c.execute("""
            CREATE TABLE IF NOT EXISTS user_notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT DEFAULT '{}',
                is_read INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            );
        """)

        # 2. Check if target completed season has already rolled over
        c.execute("SELECT id FROM season_history WHERE season_code = ?", (target_code,))
        existing = c.fetchone()
        if existing and not force:
            return {
                "status": "UP_TO_DATE",
                "active_season": meta["active_season_code"],
                "last_completed_season": target_code
            }

        logger.info(f"[SEASON] Executing weekly season rollover for {target_code}...")
        now_iso = datetime.datetime.utcnow().isoformat()

        # 3. Fetch all users ordered by weekly_rp DESC, overall_elo DESC
        c.execute("""
            SELECT id, username, weekly_rp, overall_elo, physics_elo, chemistry_elo, math_elo,
                   total_solved, total_correct, gold_medals, silver_medals, bronze_medals, current_division
            FROM users
            ORDER BY weekly_rp DESC, overall_elo DESC
        """)
        users = [dict(r) for r in c.fetchall()]
        total_aspirants = len(users)

        active_users = [u for u in users if (u.get("weekly_rp") or 0) > 0]
        podium_1 = active_users[0] if len(active_users) >= 1 else None
        podium_2 = active_users[1] if len(active_users) >= 2 else None
        podium_3 = active_users[2] if len(active_users) >= 3 else None

        # 4. Award Podium Medals & Notifications
        if podium_1:
            c.execute("UPDATE users SET gold_medals = COALESCE(gold_medals, 0) + 1 WHERE id = ?", (podium_1["id"],))
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            notif_title = f"🥇 Season Champion — Gold Medal!"
            notif_msg = (
                f"Outstanding work! You finished 1st in the Weekly League ({target_code}) "
                f"with {podium_1['weekly_rp']} RP! A permanent Gold Medal has been awarded to your profile."
            )
            c.execute("""
                INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                VALUES (?, ?, 'SEASON_PODIUM', ?, ?, ?, 0, ?)
            """, (notif_id, podium_1["id"], notif_title, notif_msg, json.dumps({"medal": "GOLD", "season": target_code, "rank": 1}), now_iso))

        if podium_2:
            c.execute("UPDATE users SET silver_medals = COALESCE(silver_medals, 0) + 1 WHERE id = ?", (podium_2["id"],))
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            notif_title = f"🥈 Season Runner-Up — Silver Medal!"
            notif_msg = (
                f"Incredible grind! You finished 2nd in the Weekly League ({target_code}) "
                f"with {podium_2['weekly_rp']} RP! A permanent Silver Medal has been awarded to your profile."
            )
            c.execute("""
                INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                VALUES (?, ?, 'SEASON_PODIUM', ?, ?, ?, 0, ?)
            """, (notif_id, podium_2["id"], notif_title, notif_msg, json.dumps({"medal": "SILVER", "season": target_code, "rank": 2}), now_iso))

        if podium_3:
            c.execute("UPDATE users SET bronze_medals = COALESCE(bronze_medals, 0) + 1 WHERE id = ?", (podium_3["id"],))
            notif_id = f"notif_{uuid.uuid4().hex[:12]}"
            notif_title = f"🥉 3rd Place Podium — Bronze Medal!"
            notif_msg = (
                f"Great finish! You placed 3rd in the Weekly League ({target_code}) "
                f"with {podium_3['weekly_rp']} RP! A permanent Bronze Medal has been awarded to your profile."
            )
            c.execute("""
                INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                VALUES (?, ?, 'SEASON_PODIUM', ?, ?, ?, 0, ?)
            """, (notif_id, podium_3["id"], notif_title, notif_msg, json.dumps({"medal": "BRONZE", "season": target_code, "rank": 3}), now_iso))

        # 5. Evaluate Division Promotions & Wrap Notifications
        promotions_count = 0
        for rank, u in enumerate(users, start=1):
            uid = u["id"]
            u_rp = u.get("weekly_rp") or 0
            div_meta = evaluate_user_division(
                weekly_rp=u_rp,
                overall_elo=float(u.get("overall_elo") or 1200.0),
                total_solved=int(u.get("total_solved") or 0),
                total_correct=int(u.get("total_correct") or 0),
                rank=rank,
                total_users=total_aspirants,
                physics_elo=float(u.get("physics_elo") or 1200.0),
                chemistry_elo=float(u.get("chemistry_elo") or 1200.0),
                math_elo=float(u.get("math_elo") or 1200.0)
            )

            new_div = div_meta["full_name"]
            c.execute("UPDATE users SET current_division = ? WHERE id = ?", (new_div, uid))

            # Dispatch notification
            if div_meta["zone"] == "PROMOTION" and u_rp > 0:
                promotions_count += 1
                notif_id = f"notif_{uuid.uuid4().hex[:12]}"
                n_title = f"🟢 Promoted to {new_div}!"
                n_msg = (
                    f"Weekly Season {target_code} concluded: You finished in the Promotion Zone "
                    f"with {u_rp} RP! Your official division standing has been advanced to {new_div}."
                )
                c.execute("""
                    INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                    VALUES (?, ?, 'SEASON_PROMOTION', ?, ?, ?, 0, ?)
                """, (notif_id, uid, n_title, n_msg, json.dumps({"season": target_code, "division": new_div, "rp": u_rp}), now_iso))
            elif u_rp > 0 and uid not in (podium_1["id"] if podium_1 else None, podium_2["id"] if podium_2 else None, podium_3["id"] if podium_3 else None):
                notif_id = f"notif_{uuid.uuid4().hex[:12]}"
                n_title = f"📅 Season {target_code} Concluded"
                n_msg = (
                    f"Weekly Season {target_code} has ended. You earned {u_rp} RP and maintained "
                    f"your standing in {new_div}. All weekly points have reset to 0 for the fresh sprint!"
                )
                c.execute("""
                    INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
                    VALUES (?, ?, 'SEASON_WRAP', ?, ?, ?, 0, ?)
                """, (notif_id, uid, n_title, n_msg, json.dumps({"season": target_code, "division": new_div, "rp": u_rp}), now_iso))

        # 6. Record Season in season_history
        season_history_id = f"sh_{uuid.uuid4().hex[:12]}"
        c.execute("""
            INSERT OR REPLACE INTO season_history (
                id, season_code, winner_id, winner_username,
                runner_up_id, runner_up_username, third_id, third_username,
                total_participants, top_rp, ended_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            season_history_id,
            target_code,
            podium_1["id"] if podium_1 else None,
            podium_1["username"] if podium_1 else None,
            podium_2["id"] if podium_2 else None,
            podium_2["username"] if podium_2 else None,
            podium_3["id"] if podium_3 else None,
            podium_3["username"] if podium_3 else None,
            len(active_users),
            podium_1["weekly_rp"] if podium_1 else 0,
            now_iso
        ))

        # 7. Reset weekly_rp for all users to 0
        c.execute("UPDATE users SET weekly_rp = 0")
        conn.commit()

        # 8. Invalidate Leaderboard and User Caches
        try:
            from backend.app.routes.leaderboards import invalidate_leaderboard_caches
            invalidate_leaderboard_caches()
        except Exception:
            pass

        try:
            from backend.app.database import backup_all_users
            backup_all_users()
        except Exception:
            pass

        logger.info(f"[SEASON] Successfully completed season rollover for {target_code}. {len(active_users)} participants reset.")

        return {
            "status": "SUCCESS",
            "season_code": target_code,
            "active_participants": len(active_users),
            "top_rp": podium_1["weekly_rp"] if podium_1 else 0,
            "winner": podium_1["username"] if podium_1 else None,
            "promotions_count": promotions_count
        }

    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass
