"""
System & Content Updates Engine:
Manages platform release notes, question bank additions, moderation updates,
and broadcast announcements. Tracks user read receipts and powers live notifications.
"""
import sqlite3
import json
import uuid
import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

def _get_db_connection() -> sqlite3.Connection:
    from backend.app.database import get_connection
    return get_connection()


def seed_default_updates_if_needed(cursor: sqlite3.Cursor):
    """Initializes release notes and system update history if empty."""
    cursor.execute("SELECT COUNT(*) FROM system_updates")
    count = cursor.fetchone()[0]
    if count > 0:
        return

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    default_updates = [
        {
            "id": "upd-v240-syllabus",
            "version": "v2.4.0",
            "title": "92 Canonical Chapters & Live Adaptive Syllabus Sync",
            "category": "SYLLABUS",
            "summary": "The web skill tree has been fully synchronized with the 92 authoritative CLI syllabus chapters, with real-time question bank counters and pinpoint adaptive question plucking.",
            "details": "Previously, students marking umbrella chapters could encounter zero-question states in adaptive drills. All 92 canonical chapters across 13 units are now active, fully mapped to the live 1,462+ question bank.",
            "highlights": [
                "Full 92 canonical syllabus chapters active in skill tree and test maker",
                "Live question count badges displayed on every chapter card",
                "Adaptive drill engine strictly plucks questions from your marked learnt chapters",
                "Legacy user profiles automatically expanded to canonical equivalents"
            ],
            "author": "System Engineering",
            "created_at": now
        },
        {
            "id": "upd-v235-moderation",
            "version": "v2.3.5",
            "title": "Automated Question Moderation & Fair-Play Marks Reconciliation",
            "category": "MODERATION",
            "summary": "Human assessment hub connected with automated test score upgrades (+4 dropped question rule), activity-aware Elo compensation, and in-app alerts.",
            "details": "When an admin inspects and approves reported questions via CLI or GUI, affected test scorecards are instantly re-graded and students receive compensatory Elo with transparent notifications.",
            "highlights": [
                "NTA Dropped Question Rule (+4 bonus, -1 penalty removed) applied automatically",
                "Time-decay resilient Elo compensations with RP Question Bounties",
                "Personalized in-app notifications whenever moderation updates your score"
            ],
            "author": "Assessment Council",
            "created_at": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).isoformat()
        },
        {
            "id": "upd-v230-adaptive",
            "version": "v2.3.0",
            "title": "Multi-Factor Adaptive AI Practice Engine",
            "category": "PLATFORM",
            "summary": "Real-time dynamic difficulty calibration, flow-state streak multipliers, and instant concept remediation loops.",
            "details": "Adaptive Practice dynamically tracks your performance curve, offering immediate remediation when stumbling on questions, and pushing high-tier challenges during winning streaks.",
            "highlights": [
                "Dynamic Elo ladder calibration adapting to every submit",
                "Automatic concept remediation targeting your weak topics",
                "Personalized AIR rank forecasting dashboard"
            ],
            "author": "Core AI Team",
            "created_at": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=3)).isoformat()
        }
    ]

    for u in default_updates:
        cursor.execute("""
            INSERT OR IGNORE INTO system_updates (
                id, version, title, category, summary, details, highlights, author, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            u["id"],
            u["version"],
            u["title"],
            u["category"],
            u["summary"],
            u["details"],
            json.dumps(u["highlights"]),
            u["author"],
            u["created_at"]
        ))


def post_system_update(
    title: str,
    summary: str,
    category: str = "PLATFORM",
    version: Optional[str] = None,
    details: str = "",
    highlights: Optional[List[str]] = None,
    author: str = "System",
    update_id: Optional[str] = None,
    db_conn: Optional[sqlite3.Connection] = None
) -> str:
    """
    Publishes a new system or content update broadcast.
    Immediately makes the update visible to all users with unread status.
    """
    uid = update_id or f"upd-{uuid.uuid4().hex[:8]}"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    high_json = json.dumps(highlights or [])

    conn = db_conn or _get_db_connection()
    close_conn = db_conn is None
    c = conn.cursor()

    c.execute("""
        INSERT INTO system_updates (
            id, version, title, category, summary, details, highlights, author, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        uid,
        version or "v2.4",
        title.strip(),
        category.upper(),
        summary.strip(),
        details.strip(),
        high_json,
        author,
        now
    ))
    conn.commit()

    if close_conn:
        conn.close()

    return uid


def get_user_system_updates(user_id: str, limit: int = 30) -> List[Dict[str, Any]]:
    """
    Returns system updates ordered by recency, annotated with `is_read` for this specific user.
    Updates created before the user registered are automatically treated as read.
    """
    conn = _get_db_connection()
    c = conn.cursor()

    c.execute("SELECT created_at FROM users WHERE id = ?", (user_id,))
    u_row = c.fetchone()
    user_created_at = u_row[0] if u_row and u_row[0] else None

    c.execute("""
        SELECT su.*, 
               CASE 
                   WHEN r.read_at IS NOT NULL THEN 1 
                   WHEN ? IS NOT NULL AND su.created_at <= ? THEN 1
                   ELSE 0 
               END as is_read
        FROM system_updates su
        LEFT JOIN user_update_reads r ON su.id = r.update_id AND r.user_id = ?
        ORDER BY su.created_at DESC
        LIMIT ?
    """, (user_created_at, user_created_at, user_id, limit))

    rows = c.fetchall()
    updates = []
    for r in rows:
        d = dict(r)
        try:
            d["highlights"] = json.loads(d.get("highlights") or "[]")
        except Exception:
            d["highlights"] = []
        d["is_read"] = bool(d.get("is_read"))
        updates.append(d)

    conn.close()
    return updates


def get_unread_system_updates(user_id: str) -> List[Dict[str, Any]]:
    """Returns only genuine unread system updates posted after user registered."""
    conn = _get_db_connection()
    c = conn.cursor()

    c.execute("SELECT created_at FROM users WHERE id = ?", (user_id,))
    u_row = c.fetchone()
    user_created_at = u_row[0] if u_row and u_row[0] else None

    if user_created_at:
        c.execute("""
            SELECT su.*, 0 as is_read
            FROM system_updates su
            LEFT JOIN user_update_reads r ON su.id = r.update_id AND r.user_id = ?
            WHERE r.read_at IS NULL AND su.created_at > ?
            ORDER BY su.created_at DESC
        """, (user_id, user_created_at))
    else:
        c.execute("""
            SELECT su.*, 0 as is_read
            FROM system_updates su
            LEFT JOIN user_update_reads r ON su.id = r.update_id AND r.user_id = ?
            WHERE r.read_at IS NULL
            ORDER BY su.created_at DESC
        """, (user_id,))

    rows = c.fetchall()
    updates = []
    for r in rows:
        d = dict(r)
        try:
            d["highlights"] = json.loads(d.get("highlights") or "[]")
        except Exception:
            d["highlights"] = []
        d["is_read"] = False
        updates.append(d)

    conn.close()
    return updates


def mark_update_read(user_id: str, update_id: str) -> bool:
    """Marks a single system update as read for this user."""
    conn = _get_db_connection()
    c = conn.cursor()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    c.execute("""
        INSERT OR REPLACE INTO user_update_reads (user_id, update_id, read_at)
        VALUES (?, ?, ?)
    """, (user_id, update_id, now))
    conn.commit()
    conn.close()
    return True


def mark_all_updates_read(user_id: str) -> int:
    """Marks all current system updates as read for this user."""
    conn = _get_db_connection()
    c = conn.cursor()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    c.execute("SELECT id FROM system_updates")
    all_ids = [r[0] for r in c.fetchall()]

    for uid in all_ids:
        c.execute("""
            INSERT OR IGNORE INTO user_update_reads (user_id, update_id, read_at)
            VALUES (?, ?, ?)
        """, (user_id, uid, now))

    conn.commit()
    conn.close()
    return len(all_ids)
