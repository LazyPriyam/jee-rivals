"""
Administrative Security, IP Blackholing, and Account Moderation API Routes.
Requires authentic ADMIN_SYNC_TOKEN in the X-Sync-Token request header.
"""

from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Header, status, Depends
from pydantic import BaseModel

from backend.app.config import ADMIN_SYNC_TOKEN
from backend.app.tools.security_engine import (
    ban_ip,
    unban_ip,
    list_banned_ips,
    ban_user,
    unban_user,
    revoke_user_sessions,
    list_banned_users,
    is_ip_banned
)


def verify_admin(x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )


router = APIRouter(
    prefix="/api/admin/security",
    tags=["Admin Security & Moderation"],
    dependencies=[Depends(verify_admin)]
)


class BanIpRequest(BaseModel):
    ip: str
    reason: Optional[str] = "administrative_ban"


class UnbanIpRequest(BaseModel):
    ip: str


class BanUserRequest(BaseModel):
    user: str  # username or user_id
    reason: Optional[str] = "administrative_ban"


class UserActionRequest(BaseModel):
    user: str  # username or user_id


@router.post("/ban-ip")
def api_ban_ip(req: BanIpRequest):
    try:
        return ban_ip(req.ip, req.reason or "administrative_ban")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/unban-ip")
def api_unban_ip(req: UnbanIpRequest):
    try:
        return unban_ip(req.ip)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ban-user")
def api_ban_user(req: BanUserRequest):
    try:
        return ban_user(req.user, req.reason or "administrative_ban")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/unban-user")
def api_unban_user(req: UserActionRequest):
    try:
        return unban_user(req.user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/revoke-sessions")
def api_revoke_sessions(req: UserActionRequest):
    try:
        return revoke_user_sessions(req.user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/banned")
def api_list_banned():
    return {
        "banned_ips": list_banned_ips(),
        "banned_users": list_banned_users()
    }


@router.get("/check-ip/{ip}")
def api_check_ip(ip: str):
    return {
        "ip": ip,
        "is_banned": is_ip_banned(ip)
    }
