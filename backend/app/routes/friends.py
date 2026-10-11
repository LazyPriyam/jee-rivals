import uuid
import datetime
import json
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from backend.app.database import get_connection, get_user_by_id, get_user_by_username
from backend.app.auth import get_current_user
from backend.app.routes.auth import format_user_profile
from backend.app.routes.rooms import generate_room_code, get_room_state

from backend.app.websockets.room_hub import room_hub

router = APIRouter(prefix="/api/friends", tags=["Friends & Social Hub"])


class FriendRequestModel(BaseModel):
    username: str


class ChallengeFriendModel(BaseModel):
    preset_name: Optional[str] = "1-on-1 Friend Duel"
    mode: Optional[str] = "SPEED_DUEL"
    question_count: Optional[int] = 5
    time_per_question: Optional[int] = 60
    subjects: Optional[List[str]] = ["Physics", "Chemistry", "Mathematics"]


class SendChatMessageModel(BaseModel):
    message: str
    message_type: Optional[str] = "TEXT"
    metadata: Optional[Dict[str, Any]] = None


class ChatChallengeModel(BaseModel):
    preset_name: Optional[str] = "1-on-1 Friend Duel"
    question_count: Optional[int] = 5
    time_per_question: Optional[int] = 60
    subjects: Optional[List[str]] = ["Physics", "Chemistry", "Mathematics"]


class RespondChallengeModel(BaseModel):
    accept: bool


def is_user_online(user_id: Optional[str], last_active_str: Optional[str], chat_settings_raw: Optional[str] = None) -> bool:
    if chat_settings_raw:
        try:
            cs = json.loads(chat_settings_raw) if isinstance(chat_settings_raw, str) else chat_settings_raw
            if cs.get("presence_status") == "INVISIBLE":
                return False
        except Exception:
            pass
    return room_hub.is_user_online(user_id or "", last_active_str)


@router.get("")
def get_friends(user: dict = Depends(get_current_user)):
    """Returns list of accepted friends with their live stats and online status."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT u.id, u.username, u.avatar_id, u.avatar_image_url, u.title, u.overall_elo, u.current_division,
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
            "avatar_image_url": r.get("avatar_image_url"),
            "title": r.get("title") or "JEE Aspirant",
            "overall_elo": round(r.get("overall_elo", 1200.0), 1),
            "current_division": r.get("current_division") or "BRONZE",
            "weekly_rp": r.get("weekly_rp", 0),
            "total_solved": solved,
            "total_correct": correct,
            "accuracy_percentage": acc,
            "gold_medals": r.get("gold_medals", 0),
            "is_online": is_user_online(r["id"], r.get("last_active"), r.get("chat_settings")),
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
        SELECT id, username, avatar_id, avatar_image_url, title, overall_elo, current_division,
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
            "avatar_image_url": r.get("avatar_image_url"),
            "title": r.get("title") or "JEE Aspirant",
            "overall_elo": round(r.get("overall_elo", 1200.0), 1),
            "current_division": r.get("current_division") or "BRONZE",
            "weekly_rp": r.get("weekly_rp", 0),
            "total_solved": solved,
            "total_correct": correct,
            "accuracy_percentage": acc,
            "gold_medals": r.get("gold_medals", 0),
            "is_online": is_user_online(r["id"], r.get("last_active")),
            "last_active": r.get("last_active")
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
               u.username as sender_username, u.avatar_id as sender_avatar, u.avatar_image_url as sender_avatar_url,
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
    Returns both incoming friend requests, 1-on-1 direct duel challenges, and unread direct messages.
    """
    conn = get_connection()
    c = conn.cursor()

    # 1. Incoming friend requests
    c.execute("""
        SELECT f.user_id as sender_id, f.created_at,
               u.username as sender_username, u.avatar_id as sender_avatar, u.avatar_image_url as sender_avatar_url,
               u.title as sender_title, u.overall_elo as sender_elo, u.current_division as sender_division
        FROM friends f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'PENDING'
        ORDER BY f.created_at DESC
    """, (user["id"],))
    friend_requests = [dict(r) for r in c.fetchall()]

    # 2. Incoming duel challenges
    c.execute("""
        SELECT dc.*, u.username as sender_username, u.avatar_id as sender_avatar, u.avatar_image_url as sender_avatar_url, u.overall_elo as sender_elo
        FROM direct_challenges dc
        JOIN users u ON dc.sender_id = u.id
        WHERE dc.receiver_id = ? AND dc.status = 'PENDING'
        ORDER BY dc.created_at DESC
    """, (user["id"],))
    challenges = [dict(r) for r in c.fetchall()]

    # 3. Moderation & Compensation Updates
    c.execute("""
        SELECT * FROM user_notifications
        WHERE user_id = ? AND is_read = 0
        ORDER BY created_at DESC
        LIMIT 10
    """, (user["id"],))
    moderation_updates = [dict(r) for r in c.fetchall()]

    # 4. Unread Direct Messages Count
    c.execute("""
        SELECT COUNT(*) FROM direct_messages
        WHERE receiver_id = ? AND is_read = 0
    """, (user["id"],))
    dm_unread_row = c.fetchone()
    unread_messages_count = dm_unread_row[0] if dm_unread_row else 0

    # 5. System & Content Updates (Fetch recent updates annotated with is_read on the same connection)
    from backend.app.tools.system_updates_engine import get_user_system_updates
    all_system_updates = get_user_system_updates(
        user["id"],
        limit=30,
        cursor=c,
        user_created_at=user.get("created_at")
    )
    conn.close()

    unread_system_updates = [u for u in all_system_updates if not u.get("is_read")]

    return {
        "friend_requests": friend_requests,
        "challenges": challenges,
        "moderation_updates": moderation_updates,
        "system_updates": all_system_updates,
        "unread_system_updates_count": len(unread_system_updates),
        "unread_messages_count": unread_messages_count,
        "total_count": len(friend_requests) + len(challenges) + len(moderation_updates) + len(unread_system_updates) + unread_messages_count
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
    c.execute("UPDATE direct_messages SET is_read = 1 WHERE receiver_id = ?", (user["id"],))
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
        SELECT id, username, avatar_id, avatar_image_url, title, overall_elo, current_division, last_active
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
            "avatar_image_url": r.get("avatar_image_url"),
            "title": r.get("title") or "JEE Aspirant",
            "overall_elo": round(r.get("overall_elo", 1200.0), 1),
            "current_division": r.get("current_division") or "BRONZE",
            "is_friend": uid in accepted_friends,
            "request_sent": uid in requests_sent,
            "request_received": uid in requests_received,
            "is_online": is_user_online(uid, r.get("last_active")),
            "last_active": r.get("last_active")
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
        WHERE (validation_status IS NULL OR validation_status NOT IN ('QUARANTINED', 'SUPERSEDED_BY_SUBQUESTIONS'))
          AND text IS NOT NULL AND text != ''
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


# ============================================================================
# CHESS.COM-STYLE INTEGRATED FRIENDS DIRECT CHAT & DUEL CHALLENGES
# ============================================================================

@router.get("/conversations")
def get_conversations(user: dict = Depends(get_current_user)):
    """
    Returns list of friend conversations with last message preview and unread counts.
    Chess.com style integrated messages feed.
    """
    conn = get_connection()
    c = conn.cursor()

    # 1. Get all accepted friends
    c.execute("""
        SELECT u.id, u.username, u.avatar_id, u.title, u.overall_elo, u.current_division, u.last_active, u.chat_settings
        FROM friends f
        JOIN users u ON (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END) = u.id
        WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'ACCEPTED'
    """, (user["id"], user["id"], user["id"]))
    friend_rows = [dict(r) for r in c.fetchall()]

    # 2. Get distinct users who have exchanged messages with user (even if not currently friends)
    c.execute("""
        SELECT DISTINCT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_id
        FROM direct_messages
        WHERE sender_id = ? OR receiver_id = ?
    """, (user["id"], user["id"], user["id"]))
    dm_user_ids = [r["other_id"] for r in c.fetchall()]

    all_partner_ids = list(set([f["id"] for f in friend_rows] + dm_user_ids))
    if not all_partner_ids:
        conn.close()
        return []

    # Map user profiles
    profiles_by_id = {f["id"]: f for f in friend_rows}
    missing_ids = [pid for pid in all_partner_ids if pid not in profiles_by_id]
    if missing_ids:
        placeholders = ",".join("?" for _ in missing_ids)
        c.execute(f"""
            SELECT id, username, avatar_id, title, overall_elo, current_division, last_active, chat_settings
            FROM users WHERE id IN ({placeholders})
        """, missing_ids)
        for r in c.fetchall():
            profiles_by_id[r["id"]] = dict(r)

    conversations = []
    for pid in all_partner_ids:
        prof = profiles_by_id.get(pid)
        if not prof:
            continue

        # Latest message
        c.execute("""
            SELECT id, sender_id, receiver_id, message, message_type, metadata, is_read, created_at
            FROM direct_messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at DESC
            LIMIT 1
        """, (user["id"], pid, pid, user["id"]))
        latest_msg_row = c.fetchone()
        latest_msg = dict(latest_msg_row) if latest_msg_row else None

        # Unread count
        c.execute("""
            SELECT COUNT(*) FROM direct_messages
            WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
        """, (pid, user["id"]))
        unread_count = c.fetchone()[0]

        conversations.append({
            "friend_id": prof["id"],
            "friend_username": prof["username"],
            "friend_avatar": prof.get("avatar_id") or "default",
            "friend_title": prof.get("title") or "JEE Aspirant",
            "friend_elo": round(prof.get("overall_elo", 1200.0), 1),
            "friend_division": prof.get("current_division") or "BRONZE",
            "is_online": is_user_online(prof["id"], prof.get("last_active"), prof.get("chat_settings")),
            "last_active": prof.get("last_active"),
            "latest_message": latest_msg["message"] if latest_msg else "No messages yet. Say hello!",
            "latest_message_type": latest_msg["message_type"] if latest_msg else "TEXT",
            "latest_message_time": latest_msg["created_at"] if latest_msg else None,
            "latest_is_mine": (latest_msg["sender_id"] == user["id"]) if latest_msg else False,
            "unread_count": unread_count
        })

    conn.close()

    # Sort conversations: recent messages first
    def sort_key(conv):
        return conv["latest_message_time"] or "1970-01-01T00:00:00"

    conversations.sort(key=sort_key, reverse=True)
    return conversations


@router.get("/chat/{friend_id}")
def get_chat_history(friend_id: str, user: dict = Depends(get_current_user)):
    """
    Returns chat history between current user and friend.
    Marks incoming messages from this friend as read.
    """
    target = get_user_by_id(friend_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    conn = get_connection()
    c = conn.cursor()

    # Mark incoming unread messages as read
    c.execute("""
        UPDATE direct_messages
        SET is_read = 1
        WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
    """, (friend_id, user["id"]))

    # Also mark any related notifications for this friend as read
    c.execute("""
        UPDATE user_notifications
        SET is_read = 1
        WHERE user_id = ? AND type = 'DIRECT_MESSAGE' AND details LIKE ?
    """, (user["id"], f"%{friend_id}%"))
    conn.commit()

    # Fetch last 150 messages
    c.execute("""
        SELECT id, sender_id, receiver_id, message, message_type, metadata, is_read, created_at
        FROM direct_messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
        LIMIT 150
    """, (user["id"], friend_id, friend_id, user["id"]))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    formatted_messages = []
    for r in rows:
        meta = {}
        if r.get("metadata"):
            try:
                meta = json.loads(r["metadata"]) if isinstance(r["metadata"], str) else r["metadata"]
            except Exception:
                meta = {}
        formatted_messages.append({
            "id": r["id"],
            "sender_id": r["sender_id"],
            "receiver_id": r["receiver_id"],
            "is_mine": r["sender_id"] == user["id"],
            "message": r["message"],
            "message_type": r["message_type"] or "TEXT",
            "metadata": meta,
            "is_read": bool(r["is_read"]),
            "created_at": r["created_at"]
        })

    return {
        "friend": {
            "id": target["id"],
            "username": target["username"],
            "avatar_id": target.get("avatar_id") or "default",
            "title": target.get("title") or "JEE Aspirant",
            "overall_elo": round(target.get("overall_elo", 1200.0), 1),
            "current_division": target.get("current_division") or "BRONZE",
            "is_online": is_user_online(target["id"], target.get("last_active"), target.get("chat_settings")),
            "last_active": target.get("last_active")
        },
        "messages": formatted_messages
    }


@router.post("/chat/{friend_id}")
def send_chat_message(friend_id: str, req: SendChatMessageModel, user: dict = Depends(get_current_user)):
    """
    Sends a direct message to a friend and alerts them.
    """
    msg_text = req.message.strip()
    if not msg_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    target = get_user_by_id(friend_id)
    if not target:
        raise HTTPException(status_code=404, detail="Recipient user not found.")

    conn = get_connection()
    c = conn.cursor()

    msg_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    meta_json = json.dumps(req.metadata or {})

    c.execute("""
        INSERT INTO direct_messages (id, sender_id, receiver_id, message, message_type, metadata, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    """, (msg_id, user["id"], friend_id, msg_text, req.message_type or "TEXT", meta_json, now))

    # Add notification for receiver
    notif_id = str(uuid.uuid4())
    preview = (msg_text[:45] + "...") if len(msg_text) > 45 else msg_text
    details_json = json.dumps({"sender_id": user["id"], "sender_username": user["username"], "message_id": msg_id})
    c.execute("""
        INSERT INTO user_notifications (id, user_id, type, title, message, details, is_read, created_at)
        VALUES (?, ?, 'DIRECT_MESSAGE', ?, ?, ?, 0, ?)
    """, (notif_id, friend_id, f"Message from {user['username']}", preview, details_json, now))

    conn.commit()
    conn.close()

    return {
        "id": msg_id,
        "sender_id": user["id"],
        "receiver_id": friend_id,
        "is_mine": True,
        "message": msg_text,
        "message_type": req.message_type or "TEXT",
        "metadata": req.metadata or {},
        "is_read": False,
        "created_at": now
    }


@router.post("/chat/{friend_id}/challenge")
def send_chat_challenge(friend_id: str, req: ChatChallengeModel, user: dict = Depends(get_current_user)):
    """
    Creates a direct duel challenge and embeds it as an interactive card in the chat.
    """
    target_friend = get_user_by_id(friend_id)
    if not target_friend:
        raise HTTPException(status_code=404, detail="Challenger friend not found.")

    conn = get_connection()
    c = conn.cursor()

    # Pick 5 questions for fast 1-on-1 duel
    q_query = """
        SELECT id FROM questions
        WHERE (validation_status IS NULL OR validation_status NOT IN ('QUARANTINED', 'SUPERSEDED_BY_SUBQUESTIONS'))
          AND text IS NOT NULL AND text != ''
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

    # Insert direct message with CHALLENGE type
    msg_id = str(uuid.uuid4())
    meta = {
        "challenge_id": challenge_id,
        "room_code": code,
        "question_count": req.question_count or 5,
        "time_per_question": req.time_per_question or 60,
        "preset_name": req.preset_name or "1-on-1 Speed Duel",
        "status": "PENDING",
        "sender_username": user["username"],
        "sender_id": user["id"]
    }
    chat_msg_text = f"⚔️ 1-on-1 Speed Duel Challenge in Room #{code} ({req.question_count or 5} Questions, {req.time_per_question or 60}s/Q)"
    c.execute("""
        INSERT INTO direct_messages (id, sender_id, receiver_id, message, message_type, metadata, is_read, created_at)
        VALUES (?, ?, ?, ?, 'CHALLENGE', ?, 0, ?)
    """, (msg_id, user["id"], friend_id, chat_msg_text, json.dumps(meta), now))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "challenge_id": challenge_id,
        "room_code": code,
        "message": {
            "id": msg_id,
            "sender_id": user["id"],
            "receiver_id": friend_id,
            "is_mine": True,
            "message": chat_msg_text,
            "message_type": "CHALLENGE",
            "metadata": meta,
            "is_read": False,
            "created_at": now
        }
    }


@router.post("/chat/challenge/{challenge_id}/respond")
def respond_chat_challenge(challenge_id: str, req: RespondChallengeModel, user: dict = Depends(get_current_user)):
    """
    Accepts or declines a duel challenge from inside the chat.
    Updates the direct challenge status and updates the chat metadata.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM direct_challenges WHERE id = ?", (challenge_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Challenge not found.")

    challenge = dict(row)
    code = challenge["room_code"]
    new_status = "ACCEPTED" if req.accept else "DECLINED"

    c.execute("UPDATE direct_challenges SET status = ? WHERE id = ?", (new_status, challenge_id))

    # Update metadata in direct_messages
    c.execute("SELECT id, metadata FROM direct_messages WHERE message_type = 'CHALLENGE' AND metadata LIKE ?", (f"%{challenge_id}%",))
    dm_rows = c.fetchall()
    for dm in dm_rows:
        try:
            m = json.loads(dm["metadata"])
            m["status"] = new_status
            c.execute("UPDATE direct_messages SET metadata = ? WHERE id = ?", (json.dumps(m), dm["id"]))
        except Exception:
            pass

    if not req.accept:
        conn.commit()
        conn.close()
        return {"success": True, "accepted": False, "status": "DECLINED"}

    # Accept & join room
    c.execute("SELECT id FROM rooms WHERE code = ?", (code,))
    r_row = c.fetchone()
    if not r_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Duel room expired or closed.")

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
        "status": "ACCEPTED",
        "room_code": code
    }

