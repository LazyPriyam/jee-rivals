"""
Security, Access Control, and Moderation Engine for JEE Rivals.
Handles IP-level blackholing, user account bans, and token session revocations.
All blocked requests return an authentic 404 (Not Found) indicating the application does not exist.
"""

import time
import datetime
import logging
from typing import Optional, Set, List, Dict, Any
from fastapi import Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi import status

from backend.app.database import get_connection

logger = logging.getLogger("jee_rivals.security")

GHOST_404_DETAIL = "The requested application does not exist anymore."

GHOST_404_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 Not Found</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #0b0f19;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
    }
    .card {
      max-width: 480px;
      padding: 40px 32px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    h1 {
      font-size: 72px;
      font-weight: 800;
      color: #ef4444;
      margin: 0 0 12px 0;
      letter-spacing: -2px;
    }
    h2 {
      font-size: 20px;
      font-weight: 700;
      color: #f1f5f9;
      margin: 0 0 12px 0;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>404</h1>
    <h2>Application Not Found</h2>
    <p>The requested application does not exist anymore.</p>
  </div>
</body>
</html>
"""

# In-memory cache for banned IPs: (timestamp, set_of_ips)
_BANNED_IPS_CACHE: tuple = (0.0, set())
_CACHE_TTL = 30.0  # seconds


def get_client_ip(request: Request) -> str:
    """
    Extracts the real client IP address from request headers,
    handling reverse proxy forwarders (Render, Cloudflare, Nginx).
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # Take the first client IP in comma-separated chain
        client_ip = xff.split(",")[0].strip()
        if client_ip:
            return client_ip

    x_real = request.headers.get("x-real-ip")
    if x_real and x_real.strip():
        return x_real.strip()

    if request.client and request.client.host:
        return request.client.host.strip()

    return "127.0.0.1"


def invalidate_banned_ips_cache():
    """Forces immediate reload of banned IPs cache."""
    global _BANNED_IPS_CACHE
    _BANNED_IPS_CACHE = (0.0, set())


def get_banned_ips_set() -> Set[str]:
    """Retrieves the set of banned IPs with fast 0ms in-memory cache."""
    global _BANNED_IPS_CACHE
    now = time.time()
    last_t, cached_set = _BANNED_IPS_CACHE
    if last_t > 0 and (now - last_t) < _CACHE_TTL:
        return cached_set

    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute("CREATE TABLE IF NOT EXISTS banned_ips (ip TEXT PRIMARY KEY, reason TEXT, banned_at TEXT);")
        c.execute("SELECT ip FROM banned_ips")
        ips = {str(r[0]).strip() for r in c.fetchall() if r[0]}
        conn.close()
        _BANNED_IPS_CACHE = (now, ips)
        return ips
    except Exception as e:
        logger.error(f"[SECURITY] Failed to load banned IPs: {e}")
        return cached_set


def is_ip_banned(ip: str) -> bool:
    """Checks whether the specified IP is banned."""
    if not ip:
        return False
    return str(ip).strip() in get_banned_ips_set()


def create_ghost_404_response(request: Optional[Request] = None):
    """Generates the 404 response stating the application does not exist."""
    if request:
        accept = request.headers.get("accept", "")
        if "text/html" in accept:
            return HTMLResponse(content=GHOST_404_HTML, status_code=status.HTTP_404_NOT_FOUND)

    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": GHOST_404_DETAIL}
    )


# ==============================================================================
# IP Management Operations
# ==============================================================================

def ban_ip(ip: str, reason: str = "administrative_ban") -> Dict[str, Any]:
    """Bans an IP address permanently from accessing the application."""
    clean_ip = str(ip).strip()
    if not clean_ip:
        raise ValueError("IP address cannot be empty.")

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS banned_ips (
            ip TEXT PRIMARY KEY,
            reason TEXT DEFAULT 'administrative_ban',
            banned_at TEXT NOT NULL
        );
    """)
    c.execute("""
        INSERT INTO banned_ips (ip, reason, banned_at)
        VALUES (?, ?, ?)
        ON CONFLICT(ip) DO UPDATE SET
            reason = excluded.reason,
            banned_at = excluded.banned_at;
    """, (clean_ip, reason.strip() if reason else "administrative_ban", now_iso))
    conn.commit()
    conn.close()

    invalidate_banned_ips_cache()
    logger.info(f"[SECURITY] IP '{clean_ip}' banned: {reason}")
    return {"success": True, "ip": clean_ip, "reason": reason, "banned_at": now_iso}


def unban_ip(ip: str) -> Dict[str, Any]:
    """Unbans an IP address, restoring their access."""
    clean_ip = str(ip).strip()
    conn = get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM banned_ips WHERE ip = ?", (clean_ip,))
    deleted = c.rowcount > 0
    conn.commit()
    conn.close()

    invalidate_banned_ips_cache()
    logger.info(f"[SECURITY] IP '{clean_ip}' unbanned (existed={deleted})")
    return {"success": True, "ip": clean_ip, "unbanned": deleted}


def list_banned_ips() -> List[Dict[str, Any]]:
    """Lists all currently banned IP addresses."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS banned_ips (ip TEXT PRIMARY KEY, reason TEXT, banned_at TEXT);")
    c.execute("SELECT ip, reason, banned_at FROM banned_ips ORDER BY banned_at DESC;")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


# ==============================================================================
# Account Management Operations (Ban, Unban, Session Revocation)
# ==============================================================================

def ban_user(user_id_or_username: str, reason: str = "administrative_ban") -> Dict[str, Any]:
    """
    Bans an account: sets is_banned = 1, bumps token_version to invalidate all existing tokens,
    and invalidates user cache. Banned users receive a 404 error on all actions.
    """
    target = str(user_id_or_username).strip()
    if not target:
        raise ValueError("User identifier cannot be empty.")

    conn = get_connection()
    c = conn.cursor()

    # Find matching user
    c.execute("SELECT id, username, token_version FROM users WHERE id = ? OR LOWER(username) = LOWER(?);", (target, target))
    user_row = c.fetchone()
    if not user_row:
        conn.close()
        raise ValueError(f"User '{target}' not found.")

    uid = user_row["id"]
    uname = user_row["username"]
    new_v = (user_row["token_version"] or 1) + 1

    c.execute("""
        UPDATE users
        SET is_banned = 1,
            ban_reason = ?,
            token_version = ?
        WHERE id = ?;
    """, (reason.strip() if reason else "administrative_ban", new_v, uid))
    conn.commit()
    conn.close()

    # Invalidate in-memory user caches
    try:
        from backend.app.auth import invalidate_user_cache
        invalidate_user_cache(user_id=uid, username=uname)
    except Exception:
        pass

    logger.info(f"[SECURITY] User '{uname}' ({uid}) banned and all active sessions revoked.")
    return {
        "success": True,
        "user_id": uid,
        "username": uname,
        "is_banned": True,
        "reason": reason,
        "token_version": new_v
    }


def unban_user(user_id_or_username: str) -> Dict[str, Any]:
    """Unbans an account, restoring their ability to log in and use the application."""
    target = str(user_id_or_username).strip()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT id, username FROM users WHERE id = ? OR LOWER(username) = LOWER(?);", (target, target))
    user_row = c.fetchone()
    if not user_row:
        conn.close()
        raise ValueError(f"User '{target}' not found.")

    uid = user_row["id"]
    uname = user_row["username"]

    c.execute("""
        UPDATE users
        SET is_banned = 0,
            ban_reason = NULL
        WHERE id = ?;
    """, (uid,))
    conn.commit()
    conn.close()

    try:
        from backend.app.auth import invalidate_user_cache
        invalidate_user_cache(user_id=uid, username=uname)
    except Exception:
        pass

    logger.info(f"[SECURITY] User '{uname}' ({uid}) unbanned.")
    return {"success": True, "user_id": uid, "username": uname, "is_banned": False}


def revoke_user_sessions(user_id_or_username: str) -> Dict[str, Any]:
    """
    Unauthorizes all active JWT tokens for a user by incrementing token_version.
    The user is immediately kicked to a 404 / login screen on every device.
    """
    target = str(user_id_or_username).strip()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT id, username, token_version FROM users WHERE id = ? OR LOWER(username) = LOWER(?);", (target, target))
    user_row = c.fetchone()
    if not user_row:
        conn.close()
        raise ValueError(f"User '{target}' not found.")

    uid = user_row["id"]
    uname = user_row["username"]
    new_v = (user_row["token_version"] or 1) + 1

    c.execute("UPDATE users SET token_version = ? WHERE id = ?;", (new_v, uid))
    conn.commit()
    conn.close()

    try:
        from backend.app.auth import invalidate_user_cache
        invalidate_user_cache(user_id=uid, username=uname)
    except Exception:
        pass

    logger.info(f"[SECURITY] All active sessions revoked for user '{uname}' (new token_version={new_v}).")
    return {"success": True, "user_id": uid, "username": uname, "token_version": new_v}


def list_banned_users() -> List[Dict[str, Any]]:
    """Lists all currently banned user accounts."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, username, title, overall_elo, is_banned, ban_reason, created_at, last_active
        FROM users
        WHERE is_banned = 1;
    """)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows
