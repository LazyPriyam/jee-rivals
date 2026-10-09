import sqlite3
import json
import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path
from backend.app.config import DB_PATH

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

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
