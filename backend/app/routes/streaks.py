import json
from fastapi import APIRouter, HTTPException, Depends, status
from backend.app.database import get_connection
from backend.app.auth import get_current_user, invalidate_user_cache
from backend.app.tools.streaks_engine import get_user_streak_meta, record_daily_activity, buy_streak_freeze

router = APIRouter(prefix="/api/streaks", tags=["Streaks & Daily Momentum"])


@router.get("/me")
def get_my_streak(current_user: dict = Depends(get_current_user)):
    """
    Returns the player's full streak dossier, rolling 7-day calendar,
    freeze shield count, and milestone progression.
    """
    return get_user_streak_meta(current_user)


@router.post("/check-in")
def daily_streak_checkin(current_user: dict = Depends(get_current_user)):
    """
    Records daily study activity for the user, advancing their streak,
    applying freeze shields if needed, and granting streak bonuses.
    """
    conn = get_connection()
    c = conn.cursor()
    try:
        result = record_daily_activity(current_user["id"], c)
        conn.commit()

        # Re-fetch full streak meta
        c.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],))
        updated_user = dict(c.fetchone())
        meta = get_user_streak_meta(updated_user)
        result["streak_meta"] = meta
        invalidate_user_cache(current_user["id"])
        return result
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/buy-freeze")
def purchase_streak_freeze(current_user: dict = Depends(get_current_user)):
    """
    Allows user to spend 100 RP to purchase a Freeze Shield (max 3).
    """
    conn = get_connection()
    c = conn.cursor()
    try:
        result = buy_streak_freeze(current_user["id"], c)
        conn.commit()
        invalidate_user_cache(current_user["id"])
        return result
    except ValueError as ve:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
