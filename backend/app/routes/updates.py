import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends

from backend.app.auth import get_current_user
from backend.app.tools.system_updates_engine import (
    get_user_system_updates,
    get_unread_system_updates,
    post_system_update,
    mark_update_read,
    mark_all_updates_read
)
from backend.app.websockets.room_hub import room_hub

router = APIRouter(prefix="/api/updates", tags=["System Updates"])


class SystemUpdatePublishRequest(BaseModel):
    title: str
    summary: str
    category: str = "PLATFORM"  # PLATFORM, QUESTION_BANK, SYLLABUS, MODERATION, ANNOUNCEMENT
    version: Optional[str] = "v2.4.1"
    details: Optional[str] = ""
    highlights: Optional[List[str]] = []
    author: Optional[str] = None


@router.get("")
def list_system_updates(user: dict = Depends(get_current_user)):
    """Returns all system updates annotated with user's read status."""
    updates = get_user_system_updates(user_id=user["id"], limit=30)
    unread_count = sum(1 for u in updates if not u.get("is_read"))
    return {
        "updates": updates,
        "unread_count": unread_count
    }


@router.get("/latest")
def get_latest_unread_update(user: dict = Depends(get_current_user)):
    """Returns the most recent unread system update for popups/toasts."""
    unread = get_unread_system_updates(user_id=user["id"])
    return {
        "latest_unread": unread[0] if unread else None,
        "total_unread": len(unread)
    }


@router.post("/{update_id}/read")
def mark_single_update_read(update_id: str, user: dict = Depends(get_current_user)):
    """Marks a single update as read for the authenticated user."""
    mark_update_read(user_id=user["id"], update_id=update_id)
    return {"success": True, "update_id": update_id}


@router.post("/mark-all-read")
def mark_all_user_updates_read(user: dict = Depends(get_current_user)):
    """Marks all updates as read for the authenticated user."""
    count = mark_all_updates_read(user_id=user["id"])
    return {"success": True, "marked_count": count}


@router.post("/publish")
async def publish_update(payload: SystemUpdatePublishRequest, user: dict = Depends(get_current_user)):
    """
    Publishes a new system update announcement to all users.
    Instantly pushes an alert to all active WebSocket connections.
    """
    author = payload.author or user.get("username") or "Admin"
    upd_id = post_system_update(
        title=payload.title,
        summary=payload.summary,
        category=payload.category,
        version=payload.version,
        details=payload.details or "",
        highlights=payload.highlights or [],
        author=author
    )

    # Broadcast real-time push to all active connections
    broadcast_data = {
        "id": upd_id,
        "title": payload.title,
        "summary": payload.summary,
        "category": payload.category,
        "version": payload.version,
        "author": author,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    await room_hub.broadcast_to_all("system_update_published", broadcast_data)

    return {
        "success": True,
        "update_id": upd_id,
        "broadcast": broadcast_data
    }
