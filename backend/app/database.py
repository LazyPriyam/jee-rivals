import sqlite3
import json
import datetime
import os
from typing import Optional, List, Dict, Any
from pathlib import Path
from backend.app.config import DB_PATH, STORAGE_DIR

BACKUP_JSON_PATH = STORAGE_DIR / "backups" / "users_backup.json"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def backup_all_users(conn: Optional[sqlite3.Connection] = None) -> int:
    """
    Exports all active users to a persistent JSON backup file.
    Guarantees that user progress, profiles, and credentials survive
    container restarts and ephemeral storage cycles.
    """
    close_when_done = False
    if conn is None:
        conn = get_connection()
        close_when_done = True
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM users")
        rows = [dict(r) for r in c.fetchall()]
        if rows:
            BACKUP_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(BACKUP_JSON_PATH, "w", encoding="utf-8") as f:
                json.dump(rows, f, indent=2, ensure_ascii=False)
        return len(rows)
    except Exception as e:
        print(f"[BACKUP] Error backing up users: {e}")
        return 0
    finally:
        if close_when_done:
            conn.close()


def restore_users_from_backup(conn: Optional[sqlite3.Connection] = None) -> int:
    """
    Safely restores users from persistent JSON backup if they are missing
    from the current database (e.g. after fresh Docker build or ephemeral wipe).
    Never overwrites newer data.
    """
    if not BACKUP_JSON_PATH.exists():
        return 0

    close_when_done = False
    if conn is None:
        conn = get_connection()
        close_when_done = True
    try:
        with open(BACKUP_JSON_PATH, "r", encoding="utf-8") as f:
            backup_users = json.load(f)

        if not isinstance(backup_users, list) or not backup_users:
            return 0

        c = conn.cursor()
        # Find existing user IDs
        c.execute("SELECT id FROM users")
        existing_ids = {row[0] for row in c.fetchall()}

        # Get all valid columns in current users table
        c.execute("PRAGMA table_info(users)")
        valid_cols = {row["name"] for row in c.fetchall()}

        restored_count = 0
        for u in backup_users:
            if u.get("id") not in existing_ids:
                record = {k: v for k, v in u.items() if k in valid_cols}
                if "id" in record and "username" in record and "pin_hash" in record:
                    cols = list(record.keys())
                    placeholders = ", ".join(["?"] * len(cols))
                    sql = f"INSERT OR IGNORE INTO users ({', '.join(cols)}) VALUES ({placeholders})"
                    c.execute(sql, list(record.values()))
                    restored_count += 1

        if restored_count > 0:
            conn.commit()
            print(f"[RESTORE] Successfully restored {restored_count} users from persistent backup!")
        return restored_count
    except Exception as e:
        print(f"[RESTORE] Error restoring users from backup: {e}")
        return 0
    finally:
        if close_when_done:
            conn.close()


def init_db():
    conn = get_connection()
    try:
        from backend.app.tools.db_migrations import run_all_migrations
        run_all_migrations(conn)

        cursor = conn.cursor()
        try:
            from backend.app.tools.system_updates_engine import seed_default_updates_if_needed
            seed_default_updates_if_needed(cursor)
        except Exception:
            pass

        try:
            from backend.app.tools.comprehension_engine import migrate_comprehension_questions
            migrate_comprehension_questions(cursor)
        except Exception:
            pass

        # Self-healing persistent accounts protection
        try:
            restore_users_from_backup(conn)
            backup_all_users(conn)
        except Exception as e:
            print(f"[INIT_DB] Backup sync note: {e}")

        conn.commit()
    finally:
        conn.close()


def get_user_by_username(username: str) -> Optional[dict]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username.strip(),))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[dict]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None
