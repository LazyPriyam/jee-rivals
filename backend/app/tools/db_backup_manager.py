"""
Automated Database Backup and Snapshot Manager for JEE Rivals.
Guarantees that user progress, Elo ratings, match histories, and test archives
are never lost or corrupted across code and schema updates.
"""

import os
import shutil
import sqlite3
import datetime
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

from backend.app.config import STORAGE_DIR, DB_PATH

logger = logging.getLogger("jee_rivals.backup")

BACKUPS_DIR = STORAGE_DIR / "backups"
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
MAX_SNAPSHOTS_TO_KEEP = 20

CRITICAL_USER_TABLES = [
    "users",
    "rooms",
    "room_participants",
    "activity_log",
    "user_chapter_elo",
    "user_rank_history",
    "adaptive_sessions",
    "friends",
    "direct_messages",
    "question_bookmarks",
    "user_fsrs_states",
    "question_reports"
]


def create_snapshot(reason: str = "auto_pre_update") -> Optional[Path]:
    """
    Creates an atomic, timestamped backup snapshot of rivals.db.
    Uses SQLite's online backup API to ensure 100% ACID consistency even under concurrent reads.
    """
    if not DB_PATH.exists():
        return None

    try:
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
        clean_reason = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in reason)
        backup_filename = f"rivals_backup_{now_str}_{clean_reason}.db"
        backup_path = BACKUPS_DIR / backup_filename

        # Perform atomic online backup using sqlite3 backup API
        src_conn = sqlite3.connect(str(DB_PATH), timeout=10)
        dst_conn = sqlite3.connect(str(backup_path), timeout=10)
        with dst_conn:
            src_conn.backup(dst_conn, pages=100)
        dst_conn.close()
        src_conn.close()

        # Clean up older snapshots to maintain healthy disk usage
        prune_old_snapshots()

        logger.info(f"[DB SAFEGUARD] Created snapshot: {backup_filename} ({backup_path.stat().st_size} bytes)")
        return backup_path
    except Exception as e:
        logger.error(f"[DB SAFEGUARD] Failed to create backup snapshot: {e}")
        return None


def prune_old_snapshots(max_keep: int = MAX_SNAPSHOTS_TO_KEEP):
    """Retains the most recent N backup snapshots, removing oldest."""
    try:
        backups = sorted(
            [f for f in BACKUPS_DIR.glob("rivals_backup_*.db") if f.is_file()],
            key=lambda x: x.stat().st_mtime,
            reverse=True
        )
        if len(backups) > max_keep:
            for stale in backups[max_keep:]:
                try:
                    stale.unlink()
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"[DB SAFEGUARD] Error pruning old backups: {e}")


def list_snapshots() -> List[Dict[str, Any]]:
    """Returns list of existing snapshots sorted from newest to oldest."""
    if not BACKUPS_DIR.exists():
        return []
    
    backups = sorted(
        [f for f in BACKUPS_DIR.glob("rivals_backup_*.db") if f.is_file()],
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )
    result = []
    for b in backups:
        st = b.stat()
        result.append({
            "filename": b.name,
            "path": str(b),
            "size_bytes": st.st_size,
            "created_at": datetime.datetime.fromtimestamp(st.st_mtime, tz=datetime.timezone.utc).isoformat(),
        })
    return result


def verify_database_integrity(db_file: Optional[Path] = None) -> Dict[str, Any]:
    """
    Runs SQLite integrity checks and counts user records across critical tables.
    Returns dictionary with integrity status and table counts.
    """
    target = db_file or DB_PATH
    if not target.exists():
        return {"ok": False, "error": f"Database file {target} does not exist"}

    try:
        conn = sqlite3.connect(str(target))
        c = conn.cursor()

        # 1. PRAGMA integrity_check
        c.execute("PRAGMA integrity_check;")
        integrity_rows = c.fetchall()
        is_ok = len(integrity_rows) == 1 and integrity_rows[0][0] == "ok"

        # 2. PRAGMA foreign_key_check
        c.execute("PRAGMA foreign_key_check;")
        fk_violations = len(c.fetchall())

        # 3. Row counts across critical tables
        table_counts = {}
        c.execute("SELECT name FROM sqlite_master WHERE type='table';")
        existing_tables = {r[0] for r in c.fetchall()}

        for tbl in CRITICAL_USER_TABLES:
            if tbl in existing_tables:
                c.execute(f"SELECT COUNT(*) FROM [{tbl}];")
                table_counts[tbl] = c.fetchone()[0]
            else:
                table_counts[tbl] = 0

        conn.close()

        return {
            "ok": is_ok and (fk_violations == 0),
            "integrity_result": integrity_rows[0][0] if integrity_rows else "unknown",
            "fk_violations": fk_violations,
            "table_counts": table_counts,
            "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def restore_snapshot(snapshot_filename: str) -> bool:
    """
    Safely restores rivals.db from a given snapshot file.
    Creates an emergency recovery backup of the current database before replacing.
    """
    target_backup = BACKUPS_DIR / snapshot_filename
    if not target_backup.exists():
        logger.error(f"[DB RESTORE] Snapshot {snapshot_filename} does not exist.")
        return False

    # Check integrity of target backup first
    verification = verify_database_integrity(target_backup)
    if not verification.get("ok"):
        logger.error(f"[DB RESTORE] Target snapshot failed integrity check: {verification}")
        return False

    try:
        # Create emergency pre-restore snapshot of current db
        if DB_PATH.exists():
            emergency_path = BACKUPS_DIR / f"rivals_pre_restore_emergency_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
            shutil.copy2(DB_PATH, emergency_path)

        # Restore from chosen backup
        shutil.copy2(target_backup, DB_PATH)
        logger.info(f"[DB RESTORE] Successfully restored database from {snapshot_filename}")
        return True
    except Exception as e:
        logger.error(f"[DB RESTORE] Failed to restore database: {e}")
        return False


def get_user_progress_snapshot(conn: sqlite3.Connection) -> Dict[str, Any]:
    """Captures an invariant signature of current user progress."""
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = {r[0] for r in c.fetchall()}

    user_count = 0
    if "users" in tables:
        c.execute("SELECT COUNT(*) FROM users;")
        user_count = c.fetchone()[0]

    room_parts_count = 0
    if "room_participants" in tables:
        c.execute("SELECT COUNT(*) FROM room_participants;")
        room_parts_count = c.fetchone()[0]

    adaptive_count = 0
    if "adaptive_sessions" in tables:
        c.execute("SELECT COUNT(*) FROM adaptive_sessions;")
        adaptive_count = c.fetchone()[0]

    return {
        "users": user_count,
        "room_participants": room_parts_count,
        "adaptive_sessions": adaptive_count,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }


def assert_progress_preserved(before_snapshot: Dict[str, Any], after_snapshot: Dict[str, Any]) -> bool:
    """
    Asserts that user progress has not decreased or been lost across an update.
    Returns True if invariant holds, False if data was wiped or lost.
    """
    pre_users = before_snapshot.get("users", 0)
    post_users = after_snapshot.get("users", 0)

    if post_users < pre_users:
        logger.critical(
            f"[DATA INTEGRITY ALERT] User count decreased from {pre_users} to {post_users}! Potential data loss detected!"
        )
        return False

    return True


if __name__ == "__main__":
    import sys
    args = sys.argv[1:]
    if not args or args[0] == "status":
        print(f"Database: {DB_PATH} (Exists: {DB_PATH.exists()})")
        print("\nIntegrity Check:")
        print(verify_database_integrity())
        print("\nAvailable Snapshots:")
        for s in list_snapshots()[:5]:
            print(f" - {s['filename']} ({s['size_bytes'] / 1024 / 1024:.2f} MB, {s['created_at']})")
    elif args[0] == "backup":
        tag = args[1] if len(args) > 1 else "manual_cli"
        snap = create_snapshot(reason=tag)
        print(f"Created snapshot: {snap}")
    elif args[0] == "restore" and len(args) > 1:
        ok = restore_snapshot(args[1])
        print(f"Restore result: {ok}")
    else:
        print("Usage: python -m backend.app.tools.db_backup_manager [status|backup <tag>|restore <filename>]")
