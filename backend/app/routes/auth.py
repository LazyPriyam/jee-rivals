import uuid
import datetime
import json
from fastapi import APIRouter, HTTPException, Depends, status

import re
from backend.app.models import (
    UserRegisterRequest, UserLoginRequest, AuthResponse, UserProfile,
    ChangeUsernameRequest, ChangePinRequest, ChatSettingsUpdateRequest
)
from backend.app.database import get_connection, get_user_by_username, get_user_by_id
from backend.app.auth import hash_pin, verify_pin, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def format_user_profile(user: dict, cursor=None) -> UserProfile:
    solved = user.get("total_solved", 0)
    correct = user.get("total_correct", 0)
    acc = round((correct / solved * 100), 1) if solved > 0 else 0.0

    conn = None
    close_conn = False
    if cursor is None:
        conn = get_connection()
        cursor = conn.cursor()
        close_conn = True

    try:
        from backend.app.tools.elo_engine import get_user_syllabus_coverage, compute_two_factor_air_bracket
        cov = get_user_syllabus_coverage(cursor, user["id"])
        active_count = cov["active_count"]
        coverage_pct = cov["coverage_percent"]
        active_subjs_count = cov["active_subjects_count"]
    except Exception:
        active_count = 0
        coverage_pct = 0.0
        active_subjs_count = 0
    finally:
        if close_conn and conn:
            conn.close()

    elo = user.get("overall_elo", 1200.0)
    from backend.app.tools.elo_engine import compute_two_factor_air_bracket
    air, air_gate, speed_p = compute_two_factor_air_bracket(elo, active_count, active_subjs_count)

    ch_raw = user.get("chapter_stats") or "{}"
    try:
        ch_stats = json.loads(ch_raw) if isinstance(ch_raw, str) else ch_raw
    except Exception:
        ch_stats = {}

    pinned_raw = user.get("pinned_badges") or '["elo_bronze", "first_blood"]'
    try:
        pinned = json.loads(pinned_raw) if isinstance(pinned_raw, str) else pinned_raw
        if not isinstance(pinned, list):
            pinned = ["elo_bronze", "first_blood"]
    except Exception:
        pinned = ["elo_bronze", "first_blood"]

    learnt_raw = user.get("learnt_chapters") or "[]"
    try:
        learnt = json.loads(learnt_raw) if isinstance(learnt_raw, str) else learnt_raw
        if not isinstance(learnt, list):
            learnt = []
    except Exception:
        learnt = []

    chat_raw = user.get("chat_settings") or "{}"
    try:
        chat_set = json.loads(chat_raw) if isinstance(chat_raw, str) else chat_raw
        if not isinstance(chat_set, dict):
            chat_set = {}
    except Exception:
        chat_set = {}

    target_exam = user.get("target_exam") or "MIXED"

    return UserProfile(
        id=user["id"],
        username=user["username"],
        avatar_id=user.get("avatar_id", "default"),
        title=user.get("title", "JEE Aspirant"),
        overall_elo=round(user.get("overall_elo", 1200.0), 1),
        physics_elo=round(user.get("physics_elo", 1200.0), 1),
        chemistry_elo=round(user.get("chemistry_elo", 1200.0), 1),
        math_elo=round(user.get("math_elo", 1200.0), 1),
        current_division=user.get("current_division", "BRONZE"),
        weekly_rp=user.get("weekly_rp", 0),
        total_solved=solved,
        total_correct=correct,
        gold_medals=user.get("gold_medals", 0),
        silver_medals=user.get("silver_medals", 0),
        bronze_medals=user.get("bronze_medals", 0),
        accuracy_percentage=acc,
        predicted_air_bracket=air,
        speed_percentile=speed_p,
        chapter_stats=ch_stats,
        target_college=user.get("target_college") or "IIT Bombay (Computer Science)",
        target_exam_date=user.get("target_exam_date") or "JEE Main Jan 2026",
        bio=user.get("bio") or "Aiming for Top 500 AIR. PvP Aspirant.",
        banner_theme=user.get("banner_theme") or "orange_cyber",
        pinned_badges=pinned,
        syllabus_coverage_percent=coverage_pct,
        active_chapters_count=active_count,
        total_syllabus_chapters=59,
        air_gate_reason=air_gate,
        learnt_chapters=learnt,
        target_exam=target_exam,
        chat_settings=chat_set
    )


@router.post("/register", response_model=AuthResponse)
def register(req: UserRegisterRequest):
    username = req.username.strip()
    existing = get_user_by_username(username)
    if existing:
        if verify_pin(req.pin, existing["pin_hash"]):
            token = create_access_token(existing["id"], existing["username"], existing["pin_hash"])
            return AuthResponse(token=token, user=format_user_profile(existing))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{username}' is already taken. Please choose another nickname."
        )

    user_id = str(uuid.uuid4())
    pin_hashed = hash_pin(req.pin)
    now = datetime.datetime.utcnow().isoformat()

    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO users (
            id, username, pin_hash, avatar_id, title,
            overall_elo, physics_elo, chemistry_elo, math_elo,
            current_division, weekly_rp, total_solved, total_correct,
            gold_medals, silver_medals, bronze_medals,
            chapter_stats, created_at, last_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, username, pin_hashed, req.avatar_id or "default", "JEE Aspirant",
        1200.0, 1200.0, 1200.0, 1200.0,
        "BRONZE", 0, 0, 0,
        0, 0, 0,
        "{}", now, now
    ))
    conn.commit()
    conn.close()

    user = get_user_by_id(user_id)
    token = create_access_token(user_id, username, pin_hashed)
    return AuthResponse(token=token, user=format_user_profile(user))


@router.post("/login", response_model=AuthResponse)
def login(req: UserLoginRequest):
    username = req.username.strip()
    user = get_user_by_username(username)
    if not user:
        # Self-healing provision for container cold restarts / ephemeral wipes
        user_id = str(uuid.uuid4())
        pin_hashed = hash_pin(req.pin)
        now = datetime.datetime.utcnow().isoformat()
        conn = get_connection()
        c = conn.cursor()
        c.execute("""
            INSERT INTO users (
                id, username, pin_hash, avatar_id, title,
                overall_elo, physics_elo, chemistry_elo, math_elo,
                current_division, weekly_rp, total_solved, total_correct,
                gold_medals, silver_medals, bronze_medals,
                chapter_stats, created_at, last_active
            ) VALUES (?, ?, ?, 'flame', 'JEE Aspirant', 1200.0, 1200.0, 1200.0, 1200.0, 'BRONZE', 0, 0, 0, 0, 0, 0, '{}', ?, ?)
        """, (user_id, username, pin_hashed, now, now))
        conn.commit()
        conn.close()
        user = get_user_by_id(user_id)
    elif not verify_pin(req.pin, user["pin_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or PIN."
        )

    # Update last_active
    now = datetime.datetime.utcnow().isoformat()
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET last_active = ? WHERE id = ?", (now, user["id"]))
    conn.commit()
    conn.close()

    token = create_access_token(user["id"], user["username"], user["pin_hash"])
    return AuthResponse(token=token, user=format_user_profile(user))


@router.get("/me", response_model=UserProfile)
def get_me(user: dict = Depends(get_current_user)):
    return format_user_profile(user)


@router.post("/profile", response_model=UserProfile)
def update_profile(data: dict, user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()

    fields = []
    values = []

    if "avatar_id" in data and data["avatar_id"]:
        fields.append("avatar_id = ?")
        values.append(data["avatar_id"])
    if "title" in data and data["title"]:
        fields.append("title = ?")
        values.append(data["title"])
    if "target_college" in data and data["target_college"] is not None:
        fields.append("target_college = ?")
        values.append(data["target_college"])
    if "target_exam_date" in data and data["target_exam_date"] is not None:
        fields.append("target_exam_date = ?")
        values.append(data["target_exam_date"])
    if "target_exam" in data and data["target_exam"] is not None:
        fields.append("target_exam = ?")
        values.append(data["target_exam"])
    if "bio" in data and data["bio"] is not None:
        fields.append("bio = ?")
        values.append(data["bio"])
    if "banner_theme" in data and data["banner_theme"] is not None:
        fields.append("banner_theme = ?")
        values.append(data["banner_theme"])
    if "pinned_badges" in data and data["pinned_badges"] is not None:
        fields.append("pinned_badges = ?")
        values.append(json.dumps(data["pinned_badges"]))
    if "learnt_chapters" in data and data["learnt_chapters"] is not None:
        fields.append("learnt_chapters = ?")
        values.append(json.dumps(data["learnt_chapters"]))
    if "chat_settings" in data and data["chat_settings"] is not None:
        fields.append("chat_settings = ?")
        values.append(json.dumps(data["chat_settings"]))

    if fields:
        values.append(user["id"])
        c.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", tuple(values))
        conn.commit()
    conn.close()

    updated = get_user_by_id(user["id"])
    return format_user_profile(updated)


@router.put("/learnt-chapters", response_model=UserProfile)
def update_learnt_chapters(data: dict, user: dict = Depends(get_current_user)):
    """
    Updates the list of syllabus chapters the student has actively learned,
    allowing adaptive practice and drills to pluck questions strictly from their active syllabus.
    """
    chapters = data.get("chapters", [])
    if not isinstance(chapters, list):
        chapters = []

    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET learnt_chapters = ? WHERE id = ?", (json.dumps(chapters), user["id"]))
    conn.commit()
    conn.close()

    updated = get_user_by_id(user["id"])
    return format_user_profile(updated)


@router.post("/change-username")
def change_username(req: ChangeUsernameRequest, user: dict = Depends(get_current_user)):
    new_username = req.new_username.strip()
    if len(new_username) < 3 or len(new_username) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be between 3 and 20 characters."
        )

    if not re.match(r"^[a-zA-Z0-9_-]+$", new_username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username can only contain letters, numbers, underscores, and hyphens."
        )

    existing = get_user_by_username(new_username)
    if existing and existing["id"] != user["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Callsign '{new_username}' is already in use by another aspirant."
        )

    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET username = ? WHERE id = ?", (new_username, user["id"]))
    conn.commit()
    conn.close()

    updated = get_user_by_id(user["id"])
    new_token = create_access_token(user["id"], new_username, user.get("pin_hash"))
    return {
        "message": f"Callsign updated to {new_username}",
        "token": new_token,
        "user": format_user_profile(updated)
    }


@router.post("/change-pin")
def change_pin(req: ChangePinRequest, user: dict = Depends(get_current_user)):
    current_pin = req.current_pin.strip()
    new_pin = req.new_pin.strip()

    if not verify_pin(current_pin, user["pin_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current PIN is incorrect. Verification failed."
        )

    if len(new_pin) < 4 or len(new_pin) > 32:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New PIN must be 4 to 32 characters."
        )

    pin_hashed = hash_pin(new_pin)
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET pin_hash = ? WHERE id = ?", (pin_hashed, user["id"]))
    conn.commit()
    conn.close()

    updated = get_user_by_id(user["id"])
    new_token = create_access_token(user["id"], user["username"], pin_hashed)
    return {
        "message": "Security PIN successfully updated.",
        "token": new_token,
        "user": format_user_profile(updated)
    }


@router.post("/chat-settings", response_model=UserProfile)
def update_chat_settings(req: ChatSettingsUpdateRequest, user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET chat_settings = ? WHERE id = ?", (json.dumps(req.chat_settings), user["id"]))
    conn.commit()
    conn.close()

    updated = get_user_by_id(user["id"])
    return format_user_profile(updated)


@router.post("/reset-data")
def reset_user_data(user: dict = Depends(get_current_user)):
    """
    Resets user's practice logs, session history, and chapter statistics,
    while preserving account credentials, target goals, and friendships.
    """
    user_id = user["id"]
    conn = get_connection()
    c = conn.cursor()

    c.execute("DELETE FROM activity_log WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM adaptive_sessions WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM user_rank_history WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM room_participants WHERE user_id = ?", (user_id,))
    c.execute("""
        UPDATE users SET 
            total_solved = 0,
            total_correct = 0,
            weekly_rp = 0,
            gold_medals = 0,
            silver_medals = 0,
            bronze_medals = 0,
            chapter_stats = '{}'
        WHERE id = ?
    """, (user_id,))

    conn.commit()
    conn.close()

    updated = get_user_by_id(user_id)
    return {
        "message": "Practice and drill stats successfully reset to baseline.",
        "user": format_user_profile(updated)
    }
