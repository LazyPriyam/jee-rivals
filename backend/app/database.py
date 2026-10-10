import sqlite3
import json
import datetime
import os
from typing import Optional, List, Dict, Any
from pathlib import Path
from backend.app.config import DB_PATH, STORAGE_DIR

BACKUP_JSON_PATH = STORAGE_DIR / "backups" / "users_backup.json"
MASTER_VAULT_PATH = STORAGE_DIR / "backups" / "aspirants_master_vault.json"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def backup_all_users(conn: Optional[sqlite3.Connection] = None) -> int:
    """
    Exports all active users and core progress tables to persistent JSON vaults.
    Guarantees that user progress, profiles, credentials, chapter mastery, and
    active sessions survive container restarts and ephemeral storage cycles.
    """
    close_when_done = False
    if conn is None:
        conn = get_connection()
        close_when_done = True
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM users")
        user_rows = [dict(r) for r in c.fetchall()]
        if user_rows:
            BACKUP_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(BACKUP_JSON_PATH, "w", encoding="utf-8") as f:
                json.dump(user_rows, f, indent=2, ensure_ascii=False)

        # Master Vault: full multi-table snapshot
        vault = {
            "users": user_rows,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "version": 2
        }

        # Check existing auxiliary progress tables
        c.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {r[0] for r in c.fetchall()}

        for tbl in ["user_chapter_elo", "user_fsrs_states", "user_rank_history", "adaptive_sessions"]:
            if tbl in tables:
                c.execute(f"SELECT * FROM [{tbl}]")
                vault[tbl] = [dict(r) for r in c.fetchall()]
            else:
                vault[tbl] = []

        with open(MASTER_VAULT_PATH, "w", encoding="utf-8") as f:
            json.dump(vault, f, indent=2, ensure_ascii=False)

        return len(user_rows)
    except Exception as e:
        print(f"[BACKUP] Error backing up aspirant vault: {e}")
        return 0
    finally:
        if close_when_done:
            conn.close()


def restore_users_from_backup(conn: Optional[sqlite3.Connection] = None) -> int:
    """
    Safely restores and reconciles users from persistent JSON vaults:
    1. For existing users: Applies High-Watermark Protection (Elo, RP, problems solved,
       and learnt chapters NEVER decrease).
    2. For missing users: Inserts them completely.
    3. Restores auxiliary progress (chapter mastery, FSRS cards, adaptive sessions).
    """
    backup_users = []
    vault_data = {}

    if MASTER_VAULT_PATH.exists():
        try:
            with open(MASTER_VAULT_PATH, "r", encoding="utf-8") as f:
                vault_data = json.load(f)
                if isinstance(vault_data, dict) and "users" in vault_data:
                    backup_users = vault_data["users"]
        except Exception:
            pass

    if not backup_users and BACKUP_JSON_PATH.exists():
        try:
            with open(BACKUP_JSON_PATH, "r", encoding="utf-8") as f:
                backup_users = json.load(f)
        except Exception:
            pass

    if not backup_users:
        return 0

    close_when_done = False
    if conn is None:
        conn = get_connection()
        close_when_done = True
    try:
        c = conn.cursor()
        c.execute("SELECT * FROM users")
        existing_users = {row["id"]: dict(row) for row in c.fetchall()}

        c.execute("PRAGMA table_info(users)")
        valid_cols = {row["name"] for row in c.fetchall()}

        reconciled_count = 0
        restored_new_count = 0

        for u in backup_users:
            u_id = u.get("id")
            if not u_id or not u.get("username") or not u.get("pin_hash"):
                continue

            if u_id in existing_users:
                # Existing user -> High-Watermark Reconciliation
                curr = existing_users[u_id]

                curr_elo = float(curr.get("overall_elo") or 1200.0)
                bak_elo = float(u.get("overall_elo") or 1200.0)
                high_elo = max(curr_elo, bak_elo)

                curr_p_elo = max(float(curr.get("physics_elo") or 1200.0), float(u.get("physics_elo") or 1200.0))
                curr_c_elo = max(float(curr.get("chemistry_elo") or 1200.0), float(u.get("chemistry_elo") or 1200.0))
                curr_m_elo = max(float(curr.get("math_elo") or 1200.0), float(u.get("math_elo") or 1200.0))

                curr_rp = max(int(curr.get("weekly_rp") or 0), int(u.get("weekly_rp") or 0))
                curr_solved = max(int(curr.get("total_solved") or 0), int(u.get("total_solved") or 0))
                curr_correct = max(int(curr.get("total_correct") or 0), int(u.get("total_correct") or 0))
                curr_longest_streak = max(int(curr.get("longest_streak") or 0), int(u.get("longest_streak") or 0))
                curr_streak_freezes = max(int(curr.get("streak_freezes") or 0), int(u.get("streak_freezes") or 0))

                # Union merge of learnt chapters
                curr_learnt = set()
                try:
                    curr_learnt = set(json.loads(curr.get("learnt_chapters") or "[]"))
                except Exception:
                    pass
                bak_learnt = set()
                try:
                    bak_learnt = set(json.loads(u.get("learnt_chapters") or "[]"))
                except Exception:
                    pass
                merged_learnt = list(curr_learnt | bak_learnt)

                if (high_elo > curr_elo or curr_solved > int(curr.get("total_solved") or 0) or
                    curr_rp > int(curr.get("weekly_rp") or 0) or len(merged_learnt) > len(curr_learnt)):
                    c.execute("""
                        UPDATE users SET
                            overall_elo = ?,
                            physics_elo = ?,
                            chemistry_elo = ?,
                            math_elo = ?,
                            weekly_rp = ?,
                            total_solved = ?,
                            total_correct = ?,
                            longest_streak = ?,
                            streak_freezes = ?,
                            learnt_chapters = ?
                        WHERE id = ?
                    """, (
                        high_elo, curr_p_elo, curr_c_elo, curr_m_elo,
                        curr_rp, curr_solved, curr_correct,
                        curr_longest_streak, curr_streak_freezes,
                        json.dumps(merged_learnt), u_id
                    ))
                    reconciled_count += 1
            else:
                # Missing user -> Clean insert
                record = {k: v for k, v in u.items() if k in valid_cols}
                cols = list(record.keys())
                placeholders = ", ".join(["?"] * len(cols))
                sql = f"INSERT OR IGNORE INTO users ({', '.join(cols)}) VALUES ({placeholders})"
                c.execute(sql, list(record.values()))
                restored_new_count += 1

        # Restore auxiliary tables from master vault
        if isinstance(vault_data, dict):
            c.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {r[0] for r in c.fetchall()}
            for tbl in ["user_chapter_elo", "user_fsrs_states", "user_rank_history", "adaptive_sessions"]:
                if tbl in tables and tbl in vault_data and isinstance(vault_data[tbl], list):
                    c.execute(f"PRAGMA table_info([{tbl}])")
                    tbl_cols = {row["name"] for row in c.fetchall()}
                    for row_dict in vault_data[tbl]:
                        clean_row = {k: v for k, v in row_dict.items() if k in tbl_cols}
                        if clean_row:
                            cols = list(clean_row.keys())
                            placeholders = ", ".join(["?"] * len(cols))
                            c.execute(
                                f"INSERT OR IGNORE INTO [{tbl}] ({', '.join(cols)}) VALUES ({placeholders})",
                                list(clean_row.values())
                            )

        if restored_new_count > 0 or reconciled_count > 0:
            conn.commit()
            print(f"[RESTORE] Aspirant vault active: {restored_new_count} users inserted, {reconciled_count} high-watermark reconciled.")
        return restored_new_count + reconciled_count
    except Exception as e:
        print(f"[RESTORE] Error restoring aspirant vault: {e}")
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
