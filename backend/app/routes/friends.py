import uuid
import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from backend.app.database import get_connection, get_user_by_id, get_user_by_username
from backend.app.auth import get_current_user
from backend.app.routes.auth import format_user_profile
from backend.app.routes.rooms import generate_room_code, get_room_state

router = APIRouter(prefix="/api/friends", tags=["Friends & Social Hub"])


class FriendRequestModel(BaseModel):
    username: str


class ChallengeFriendModel(BaseModel):
    preset_name: Optional[str] = "1-on-1 Friend Duel"
    mode: Optional[str] = "SPEED_DUEL"
    question_count: Optional[int] = 5
    time_per_question: Optional[int] = 60
    subjects: Optional[List[str]] = ["Physics", "Chemistry", "Mathematics"]


class RespondChallengeModel(BaseModel):
    accept: bool


def is_user_online(last_active_str: Optional[str], chat_settings_raw: Optional[str] = None) -> bool:
    if not last_active_str:
        return False
    if chat_settings_raw:
        try:
            cs = json.loads(chat_settings_raw) if isinstance(chat_settings_raw, str) else chat_settings_raw
            if cs.get("presence_status") == "INVISIBLE":
                return False
        except Exception:
            pass
    try:
        last_dt = datetime.datetime.fromisoformat(last_active_str)
        diff = (datetime.datetime.utcnow() - last_dt).total_seconds()
        return diff < 600  # active within 10 minutes
    except Exception:
        return False


@router.get("")
def get_friends(user: dict = Depends(get_current_user)):
    """Returns list of accepted friends with their live stats and online status."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT u.id, u.username, u.avatar_id, u.title, u.overall_elo, u.current_division,
               u.weekly_rp, u.total_solved, u.total_correct, u.gold_medals, u.silver_medals,
               u.bronze_medals, u.last_active, u.chat_settings, f.created_at as friendship_date
        FROM friends f
        JOIN users u ON (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END) = u.id
        WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'ACCEPTED'
        ORDER BY u.overall_elo DESC
    """, (user["id"], user["id"], user["id"]))

    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    result = []
    for r in rows:
        solved = r.get("total_solved", 0)
        correct = r.get("total_correct", 0)
        acc = round((correct / solved * 100), 1) if solved > 0 else 0.0

        result.append({
            "id": r["id"],
            "username": r["username"],
            "avatar_id": r.get("avatar_id") or "default",
            "title": r.get("title") or "JEE Aspirant",
            "overall_elo": round(r.get("overall_elo", 1200.0), 1),
            "current_division": r.get("current_division") or "BRONZE",
            "weekly_rp": r.get("weekly_rp", 0),
            "total_solved": solved,
            "total_correct": correct,
            "accuracy_percentage": acc,
            "gold_medals": r.get("gold_medals", 0),
            "is_online": is_user_online(r.get("last_active"), r.get("chat_settings")),
            "last_active": r.get("last_active"),
            "friendship_date": r.get("friendship_date")
        })

    return result


@router.get("/leaderboard")
def get_friends_leaderboard(sort_by: str = "elo", user: dict = Depends(get_current_user)):
    """
    Chess.com-style Friends Leaderboard:
    Shows ranks, ratings, and stats for ONLY you and your accepted friends.
    """
    conn = get_connection()
    c = conn.cursor()

    # Get all friend IDs + current user ID
    c.execute("""
        SELECT CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END as fid
        FROM friends f
        WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'ACCEPTED'
    """, (user["id"], user["id"], user["id"]))
    friend_ids = [r["fid"] for r in c.fetchall()]
    all_group_ids = list(set([user["id"]] + friend_ids))

    placeholders = ",".join("?" for _ in all_group_ids)
    
    order_clause = "overall_elo DESC"
    if sort_by == "rp":
        order_clause = "weekly_rp DESC"
    elif sort_by == "solved":
        order_clause = "total_solved DESC"

    c.execute(f"""
        SELECT id, username, avatar_id, title, overall_elo, current_division,
               weekly_rp, total_solved, total_correct, gold_medals, silver_medals,
               bronze_medals, last_active
        FROM users
        WHERE id IN ({placeholders})
        ORDER BY {order_clause}
    """, all_group_ids)

    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    leaderboard = []
    for rank, r in enumerate(rows, start=1):
        solved = r.get("total_solved", 0)
        correct = r.get("total_correct", 0)
        acc = round((correct / solved * 100), 1) if solved > 0 else 0.0

        leaderboard.append({
            "rank": rank,
            "is_you": r["id"] == user["id"],
            "id": r["id"],
            "username": r["username"],
            "avatar_id": r.get("avatar_id") or "default",
            "title": r.get("title") or "JEE Aspirant",
            "overall_elo": round(r.get("overall_elo", 1200.0), 1),
            "current_division": r.get("current_division") or "BRONZE",
            "weekly_rp": r.get("weekly_rp", 0),
            "total_solved": solved,
            "total_correct": correct,
            "accuracy_percentage": acc,
            "gold_medals": r.get("gold_medals", 0),
            "is_online": is_user_online(r.get("last_active"))
        })

    return leaderboard


@router.post("/request")
def add_friend(req: FriendRequestModel, user: dict = Depends(get_current_user)):
    """Sends a friend request to an aspirant by their username."""
    target_uname = req.username.strip()
    target_user = get_user_by_username(target_uname)

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{target_uname}' not found on JEE Rivals."
        )

    if target_user["id"] == user["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot send a friend request to yourself."
        )

    conn = get_connection()
    c = conn.cursor()

    # Check existing relationship
    c.execute("""
        SELECT * FROM friends
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    """, (user["id"], target_user["id"], target_user["id"], user["id"]))
    existing = c.fetchone()
    now = datetime.datetime.utcnow().isoformat()

    if existing:
        ex = dict(existing)
        if ex["status"] == "ACCEPTED":
            conn.close()
            return {"success": True, "status": "ACCEPTED", "message": f"You are already friends with {target_uname}."}
        elif ex["user_id"] == user["id"] and ex["status"] == "PENDING":
            conn.close()
            return {"success": True, "status": "PENDING", "message": f"Friend request to {target_uname} is already pending."}
        elif ex["friend_id"] == user["id"] and ex["status"] == "PENDING":
            # Target had already sent a request to current user -> mutual accept!
            c.execute("""
                UPDATE friends SET status = 'ACCEPTED'
                WHERE user_id = ? AND friend_id = ?
            """, (target_user["id"], user["id"]))
            conn.commit()
            conn.close()
            return {
                "success": True,
                "status": "ACCEPTED",
                "message": f"Mutual match! You and {target_uname} are now study squad friends."
            }
        else:
            # Re-request if previously declined
            c.execute("""
                UPDATE friends SET user_id = ?, friend_id = ?, status = 'PENDING', created_at = ?
                WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
            """, (user["id"], target_user["id"], now, user["id"], target_user["id"], target_user["id"], user["id"]))
            conn.commit()
            conn.close()
            return {
                "success": True,
                "status": "PENDING",
                "message": f"Friend request sent to {target_uname}!"
            }

    # Insert fresh pending request
    c.execute("""
        INSERT INTO friends (user_id, friend_id, status, created_at)
        VALUES (?, ?, 'PENDING', ?)
    """, (user["id"], target_user["id"], now))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "status": "PENDING",
        "message": f"Friend request sent to {target_uname}!"
    }


@router.get("/requests")
def get_incoming_friend_requests(user: dict = Depends(get_current_user)):
    """Fetches all pending incoming friend requests for the current user."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT f.user_id as sender_id, f.created_at,
               u.username as sender_username, u.avatar_id as sender_avatar,
               u.title as sender_title, u.overall_elo as sender_elo, u.current_division as sender_division
        FROM friends f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'PENDING'
        ORDER BY f.created_at DESC
    """, (user["id"],))

    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


@router.post("/requests/{sender_id}/respond")
def respond_friend_request(sender_id: str, req: RespondChallengeModel, user: dict = Depends(get_current_user)):
    """Accept or decline an incoming pending friend request."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT * FROM friends
        WHERE user_id = ? AND friend_id = ? AND status = 'PENDING'
    """, (sender_id, user["id"]))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Pending friend request not found.")

    if req.accept:
        c.execute("""
            UPDATE friends SET status = 'ACCEPTED'
            WHERE user_id = ? AND friend_id = ?
        """, (sender_id, user["id"]))
        conn.commit()
        conn.close()
        return {"success": True, "accepted": True, "message": "Friend request accepted! Added to study squad."}
    else:
        c.execute("""
            DELETE FROM friends
            WHERE user_id = ? AND friend_id = ?
        """, (sender_id, user["id"]))
        conn.commit()
        conn.close()
        return {"success": True, "accepted": False, "message": "Friend request declined."}


@router.delete("/requests/{target_id}/cancel")
def cancel_friend_request(target_id: str, user: dict = Depends(get_current_user)):
    """Cancels a pending friend request sent by current user."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        DELETE FROM friends
        WHERE user_id = ? AND friend_id = ? AND status = 'PENDING'
    """, (user["id"], target_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Pending request cancelled."}


@router.get("/notifications")
def get_user_notifications(user: dict = Depends(get_current_user)):
    """
    Unified notification center feed:
    Returns both incoming friend requests and 1-on-1 direct duel challenges.
    """
    conn = get_connection()
    c = conn.cursor()

    # 1. Incoming friend requests
    c.execute("""
        SELECT f.user_id as sender_id, f.created_at,
               u.username as sender_username, u.avatar_id as sender_avatar,
               u.title as sender_title, u.overall_elo as sender_elo, u.current_division as sender_division
        FROM friends f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'PENDING'
        ORDER BY f.created_at DESC
    """, (user["id"],))
    friend_requests = [dict(r) for r in c.fetchall()]

    # 2. Incoming duel challenges
    c.execute("""
        SELECT dc.*, u.username as sender_username, u.avatar_id as sender_avatar, u.overall_elo as sender_elo
        FROM direct_challenges dc
        JOIN users u ON dc.sender_id = u.id
        WHERE dc.receiver_id = ? AND dc.status = 'PENDING'
        ORDER BY dc.created_at DESC
    """, (user["id"],))
    challenges = [dict(r) for r in c.fetchall()]

    # 3. Moderation & Compensation Updates
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
    c.execute("""
        SELECT * FROM user_notifications
        WHERE user_id = ? AND is_read = 0
        ORDER BY created_at DESC
        LIMIT 10
    """, (user["id"],))
    moderation_updates = [dict(r) for r in c.fetchall()]

    conn.close()

    # 4. System & Content Updates (Fetch recent updates annotated with is_read)
    from backend.app.tools.system_updates_engine import get_user_system_updates
    all_system_updates = get_user_system_updates(user["id"], limit=30)
    unread_system_updates = [u for u in all_system_updates if not u.get("is_read")]

    return {
        "friend_requests": friend_requests,
        "challenges": challenges,
        "moderation_updates": moderation_updates,
        "system_updates": all_system_updates,
        "unread_system_updates_count": len(unread_system_updates),
        "total_count": len(friend_requests) + len(challenges) + len(moderation_updates) + len(unread_system_updates)
    }


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?", (notification_id, user["id"]))
    conn.commit()
    conn.close()

    # If it's a system update id, mark it in user_update_reads as well
    try:
        from backend.app.tools.system_updates_engine import mark_update_read
        mark_update_read(user["id"], notification_id)
    except Exception:
        pass

    return {"success": True}


@router.post("/notifications/read-all")
def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE user_notifications SET is_read = 1 WHERE user_id = ?", (user["id"],))
    conn.commit()
    conn.close()

    try:
        from backend.app.tools.system_updates_engine import mark_all_updates_read
        mark_all_updates_read(user["id"])
    except Exception:
        pass

    return {"success": True}


@router.delete("/{friend_id}")
def remove_friend(friend_id: str, user: dict = Depends(get_current_user)):
    """Removes a friend from your squad."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        DELETE FROM friends
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    """, (user["id"], friend_id, friend_id, user["id"]))

    conn.commit()
    conn.close()
    return {"success": True, "message": "Friend removed from study squad."}


@router.get("/search")
def search_users(q: str, user: dict = Depends(get_current_user)):
    """Searches JEE Rivals aspirants by username to add as study buddies."""
    query = (q or "").strip()
    if not query or len(query) < 2:
        return []

    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT id, username, avatar_id, title, overall_elo, current_division, last_active
        FROM users
        WHERE LOWER(username) LIKE ? AND id != ?
        LIMIT 10
    """, (f"%{query.lower()}%", user["id"]))
    rows = [dict(r) for r in c.fetchall()]

    # Fetch relationships
    c.execute("""
        SELECT user_id, friend_id, status
        FROM friends
        WHERE user_id = ? OR friend_id = ?
    """, (user["id"], user["id"]))
    rel_rows = [dict(r) for r in c.fetchall()]
    conn.close()

    accepted_friends = set()
    requests_sent = set()
    requests_received = set()

    for r in rel_rows:
        if r["status"] == "ACCEPTED":
            other = r["friend_id"] if r["user_id"] == user["id"] else r["user_id"]
            accepted_friends.add(other)
        elif r["status"] == "PENDING":
            if r["user_id"] == user["id"]:
                requests_sent.add(r["friend_id"])
            elif r["friend_id"] == user["id"]:
                requests_received.add(r["user_id"])

    results = []
    for r in rows:
        uid = r["id"]
        results.append({
            "id": uid,
            "username": r["username"],
            "avatar_id": r.get("avatar_id") or "default",
            "title": r.get("title") or "JEE Aspirant",
            "overall_elo": round(r.get("overall_elo", 1200.0), 1),
            "current_division": r.get("current_division") or "BRONZE",
            "is_friend": uid in accepted_friends,
            "request_sent": uid in requests_sent,
            "request_received": uid in requests_received,
            "is_online": is_user_online(r.get("last_active"))
        })

    return results



@router.post("/{friend_id}/challenge")
def challenge_friend(friend_id: str, req: ChallengeFriendModel, user: dict = Depends(get_current_user)):
    """
    Chess.com-style 1-on-1 direct challenge:
    Creates a private room and issues an instant challenge to a friend.
    """
    target_friend = get_user_by_id(friend_id)
    if not target_friend:
        raise HTTPException(status_code=404, detail="Challenger friend not found.")

    # Check recipient's challenge privacy & presence
    target_chat_raw = target_friend.get("chat_settings") or "{}"
    try:
        target_chat = json.loads(target_chat_raw) if isinstance(target_chat_raw, str) else target_chat_raw
    except Exception:
        target_chat = {}

    privacy = target_chat.get("challenge_privacy", "EVERYONE")
    presence = target_chat.get("presence_status", "ONLINE")

    if presence == "DND":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{target_friend['username']} is currently in Deep Study (DND) mode."
        )
    if privacy == "NONE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{target_friend['username']} has disabled direct 1v1 duel challenges in their settings."
        )
    elif privacy == "FRIENDS_ONLY":
        conn_check = get_connection()
        cc = conn_check.cursor()
        cc.execute("""
            SELECT status FROM friends
            WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
              AND status = 'ACCEPTED'
        """, (user["id"], friend_id, friend_id, user["id"]))
        is_mutual = cc.fetchone()
        conn_check.close()
        if not is_mutual:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{target_friend['username']} only accepts duel challenges from friends."
            )

    conn = get_connection()
    c = conn.cursor()

    # Pick 5 questions for fast 1-on-1 duel
    q_query = """
        SELECT id FROM questions
        WHERE solution_text IS NOT NULL AND solution_text != ''
        ORDER BY RANDOM() LIMIT ?
    """
    c.execute(q_query, (req.question_count or 5,))
    q_rows = c.fetchall()
    question_ids = [r[0] for r in q_rows]

    code = generate_room_code()
    room_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    title = f"{user['username']} vs {target_friend['username']}"

    # Create private room
    c.execute("""
        INSERT INTO rooms (
            id, code, host_id, mode, preset_name, subject, subjects, chapter, chapters,
            difficulty_tier, target_exam, question_type_filter, question_ids, total_questions,
            time_per_question, total_duration_minutes, timing_type, is_public, passcode,
            speed_bonus_enabled, negative_marking, base_correct_score, status, created_at
        ) VALUES (?, ?, ?, 'SPEED_DUEL', ?, 'Mixed', '["Physics","Chemistry","Mathematics"]',
                  'Mixed', '[]', 'MIXED', 'MAIN', 'ALL', ?, ?, ?, 60, 'SYNCHRONIZED', 0, NULL, 1, -25.0, 100.0, 'LOBBY', ?)
    """, (
        room_id, code, user["id"], title,
        str(question_ids).replace("'", '"'), len(question_ids),
        req.time_per_question or 60, now
    ))

    # Add host as participant
    c.execute("""
        INSERT INTO room_participants (room_id, user_id, current_question_index, score, marks, answers, is_finished)
        VALUES (?, ?, 0, 0, 0.0, '{}', 0)
    """, (room_id, user["id"]))

    # Insert direct challenge record
    challenge_id = str(uuid.uuid4())
    c.execute("""
        INSERT INTO direct_challenges (id, sender_id, receiver_id, room_code, challenge_message, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
    """, (challenge_id, user["id"], friend_id, code, f"{user['username']} challenged you to a Speed Duel!", now))

    conn.commit()
    conn.close()

    room_state = get_room_state(code, user)
    return {
        "success": True,
        "challenge_id": challenge_id,
        "room_code": code,
        "room": room_state
    }


@router.get("/challenges")
def get_incoming_challenges(user: dict = Depends(get_current_user)):
    """Fetches any pending direct challenges from friends."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT dc.*, u.username as sender_username, u.avatar_id as sender_avatar, u.overall_elo as sender_elo
        FROM direct_challenges dc
        JOIN users u ON dc.sender_id = u.id
        WHERE dc.receiver_id = ? AND dc.status = 'PENDING'
        ORDER BY dc.created_at DESC
        LIMIT 5
    """, (user["id"],))

    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


@router.post("/challenges/{challenge_id}/respond")
def respond_to_challenge(challenge_id: str, req: RespondChallengeModel, user: dict = Depends(get_current_user)):
    """Accept or decline an incoming 1-on-1 friend challenge."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM direct_challenges WHERE id = ? AND receiver_id = ?", (challenge_id, user["id"]))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Challenge invitation not found.")

    challenge = dict(row)
    code = challenge["room_code"]

    if not req.accept:
        c.execute("UPDATE direct_challenges SET status = 'DECLINED' WHERE id = ?", (challenge_id,))
        conn.commit()
        conn.close()
        return {"success": True, "accepted": False}

    c.execute("UPDATE direct_challenges SET status = 'ACCEPTED' WHERE id = ?", (challenge_id,))

    # Add recipient to room
    c.execute("SELECT id FROM rooms WHERE code = ?", (code,))
    r_row = c.fetchone()
    if not r_row:
        conn.close()
        raise HTTPException(status_code=404, detail="The duel room has expired or closed.")

    room_id = r_row["id"]
    c.execute("""
        INSERT OR IGNORE INTO room_participants (room_id, user_id, current_question_index, score, marks, answers, is_finished)
        VALUES (?, ?, 0, 0, 0.0, '{}', 0)
    """, (room_id, user["id"]))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "accepted": True,
        "room_code": code
    }
