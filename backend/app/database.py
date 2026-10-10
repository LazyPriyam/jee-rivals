import sqlite3
import json
import datetime
import os
import threading
import logging
from typing import Optional, List, Dict, Any, Tuple, Union
from pathlib import Path
from backend.app.config import DB_PATH, STORAGE_DIR, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN

logger = logging.getLogger("jee_rivals.database")

BACKUP_JSON_PATH = STORAGE_DIR / "backups" / "users_backup.json"
MASTER_VAULT_PATH = STORAGE_DIR / "backups" / "aspirants_master_vault.json"

# ==============================================================================
# TURSO CLOUD SQLITE ADAPTER (libSQL)
# ==============================================================================

class TursoRow:
    """
    Drop-in replacement for sqlite3.Row that supports:
    - positional indexing: row[0]
    - column name lookup: row['username'] (case-insensitive)
    - dict conversion: dict(row)
    - iteration and dictionary methods (.keys(), .values(), .items(), .get())
    """
    def __init__(self, cols: Tuple[str, ...], vals: Tuple[Any, ...]):
        self._cols = tuple(cols)
        self._vals = tuple(vals)
        self._map = dict(zip(self._cols, self._vals))
        self._lower_map = {c.lower(): v for c, v in zip(self._cols, self._vals)}

    def __getitem__(self, key: Union[int, str]):
        if isinstance(key, int):
            return self._vals[key]
        if key in self._map:
            return self._map[key]
        if isinstance(key, str) and key.lower() in self._lower_map:
            return self._lower_map[key.lower()]
        raise KeyError(key)

    def keys(self):
        return self._cols

    def values(self):
        return self._vals

    def items(self):
        return self._map.items()

    def get(self, key: str, default: Any = None):
        if key in self._map:
            return self._map[key]
        if isinstance(key, str) and key.lower() in self._lower_map:
            return self._lower_map[key.lower()]
        return default

    def __len__(self):
        return len(self._vals)

    def __iter__(self):
        return iter(self._cols)

    def __repr__(self):
        return f"<TursoRow {self._map}>"


class TursoCursor:
    """
    Cursor adapter that wraps libsql_client results to match sqlite3.Cursor.
    """
    def __init__(self, conn: "TursoConnection"):
        self.conn = conn
        self._result_rows: List[TursoRow] = []
        self._row_idx: int = 0
        self.lastrowid: Optional[int] = None
        self.rowcount: int = -1
        self.description: Optional[Tuple] = None

    def execute(self, sql: str, parameters: Any = None):
        args = []
        if parameters is not None:
            if isinstance(parameters, (list, tuple)):
                args = list(parameters)
            elif isinstance(parameters, dict):
                args = parameters
            else:
                args = [parameters]

        res = self.conn._execute_raw(sql, args)
        if res is not None:
            cols = tuple(res.columns) if hasattr(res, "columns") else ()
            self.description = tuple((col, None, None, None, None, None, None) for col in cols) if cols else None
            self.lastrowid = getattr(res, "last_insert_rowid", None)
            self.rowcount = getattr(res, "rows_affected", -1)
            raw_rows = getattr(res, "rows", [])
            self._result_rows = [TursoRow(cols, tuple(r)) for r in raw_rows]
            self._row_idx = 0
        else:
            self._result_rows = []
            self._row_idx = 0
            self.lastrowid = None
            self.rowcount = -1
            self.description = None
        return self

    def executemany(self, sql: str, seq_of_parameters: Any):
        batch_items = []
        for params in seq_of_parameters:
            args = list(params) if isinstance(params, (list, tuple)) else params
            batch_items.append((sql, args))
        if batch_items:
            res_list = self.conn._batch_raw(batch_items)
            self.rowcount = sum(getattr(r, "rows_affected", 0) for r in res_list)
        else:
            self.rowcount = 0
        return self

    def executescript(self, sql_script: str):
        stmts = [s.strip() for s in sql_script.split(";") if s.strip()]
        if stmts:
            self.conn._batch_raw([(s, []) for s in stmts])
        return self

    def fetchone(self) -> Optional[TursoRow]:
        if self._row_idx < len(self._result_rows):
            row = self._result_rows[self._row_idx]
            self._row_idx += 1
            return row
        return None

    def fetchall(self) -> List[TursoRow]:
        remaining = self._result_rows[self._row_idx:]
        self._row_idx = len(self._result_rows)
        return remaining

    def fetchmany(self, size: Optional[int] = None) -> List[TursoRow]:
        if size is None:
            size = 1
        end = min(self._row_idx + size, len(self._result_rows))
        chunk = self._result_rows[self._row_idx:end]
        self._row_idx = end
        return chunk

    def __iter__(self):
        while self._row_idx < len(self._result_rows):
            yield self.fetchone()

    def close(self):
        self._result_rows = []
        self._row_idx = 0


class TursoConnection:
    """
    Connection adapter that wraps a shared libsql_client.ClientSync connection.
    Provides complete sqlite3.Connection API compatibility.
    """
    def __init__(self, client):
        self._client = client
        self.row_factory = None

    def _execute_raw(self, sql: str, args: Any):
        try:
            return self._client.execute(sql, args)
        except Exception as e:
            err_str = str(e).upper()
            if "WEBSOCKET" in err_str or "CONNECTION" in err_str or "CLOSED" in err_str:
                logger.warning(f"[TURSO] Reconnecting dropped client connection: {e}")
                global _TURSO_CLIENT
                with _TURSO_LOCK:
                    _TURSO_CLIENT = None
                    self._client = get_turso_client()
                return self._client.execute(sql, args)
            raise e

    def _batch_raw(self, batch_items: List[Tuple[str, Any]]):
        try:
            return self._client.batch(batch_items)
        except Exception as e:
            err_str = str(e).upper()
            if "WEBSOCKET" in err_str or "CONNECTION" in err_str or "CLOSED" in err_str:
                logger.warning(f"[TURSO] Reconnecting dropped client connection: {e}")
                global _TURSO_CLIENT
                with _TURSO_LOCK:
                    _TURSO_CLIENT = None
                    self._client = get_turso_client()
                return self._client.batch(batch_items)
            raise e

    def cursor(self) -> TursoCursor:
        return TursoCursor(self)

    def execute(self, sql: str, parameters: Any = None) -> TursoCursor:
        c = self.cursor()
        c.execute(sql, parameters)
        return c

    def executemany(self, sql: str, seq_of_parameters: Any) -> TursoCursor:
        c = self.cursor()
        c.executemany(sql, seq_of_parameters)
        return c

    def executescript(self, sql_script: str) -> TursoCursor:
        c = self.cursor()
        c.executescript(sql_script)
        return c

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        else:
            self.commit()


_TURSO_CLIENT = None
_TURSO_LOCK = threading.Lock()


def is_turso_enabled() -> bool:
    """Returns True if Turso Cloud SQLite environment credentials are configured."""
    return bool(TURSO_DATABASE_URL and TURSO_DATABASE_URL.strip())


def get_turso_client():
    """Returns a thread-safe persistent Turso client connection."""
    global _TURSO_CLIENT
    if _TURSO_CLIENT is None or getattr(_TURSO_CLIENT, "closed", False):
        with _TURSO_LOCK:
            if _TURSO_CLIENT is None or getattr(_TURSO_CLIENT, "closed", False):
                import libsql_client
                logger.info(f"[TURSO] Connecting to Turso Cloud SQLite: {TURSO_DATABASE_URL}")
                _TURSO_CLIENT = libsql_client.create_client_sync(
                    url=TURSO_DATABASE_URL,
                    auth_token=TURSO_AUTH_TOKEN or None
                )
    return _TURSO_CLIENT


def get_connection():
    """
    Returns an active database connection:
    - If TURSO_DATABASE_URL is set: connects to Turso Cloud SQLite (libsql)
    - Otherwise: falls back seamlessly to local SQLite (rivals.db)
    """
    if is_turso_enabled():
        return TursoConnection(get_turso_client())

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

        # Load tombstones so deleted accounts are NEVER auto-resurrected
        deleted_ids = set()
        deleted_names = set()
        try:
            c.execute("SELECT id, username FROM deleted_accounts")
            for r in c.fetchall():
                if r[0]: deleted_ids.add(r[0])
                if r[1]: deleted_names.add(r[1].lower())
        except Exception:
            pass

        c.execute("PRAGMA table_info(users)")
        valid_cols = {row["name"] for row in c.fetchall()}

        reconciled_count = 0
        restored_new_count = 0

        for u in backup_users:
            u_id = u.get("id")
            u_name = (u.get("username") or "").lower()
            if not u_id or not u.get("username") or not u.get("pin_hash"):
                continue

            # Tombstone check: strictly ignore deleted accounts
            if u_id in deleted_ids or u_name in deleted_names:
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


def purge_user_from_vaults(user_id: str, username: str):
    """
    Permanently purges a deleted user from persistent JSON backup files.
    """
    clean_uname = username.strip().lower()
    if BACKUP_JSON_PATH.exists():
        try:
            with open(BACKUP_JSON_PATH, "r", encoding="utf-8") as f:
                backup_users = json.load(f)
            if isinstance(backup_users, list):
                filtered = [u for u in backup_users if u.get("id") != user_id and (u.get("username") or "").strip().lower() != clean_uname]
                with open(BACKUP_JSON_PATH, "w", encoding="utf-8") as f:
                    json.dump(filtered, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[PURGE] Error updating users_backup.json: {e}")

    if MASTER_VAULT_PATH.exists():
        try:
            with open(MASTER_VAULT_PATH, "r", encoding="utf-8") as f:
                vault_data = json.load(f)
            if isinstance(vault_data, dict):
                if "users" in vault_data and isinstance(vault_data["users"], list):
                    vault_data["users"] = [u for u in vault_data["users"] if u.get("id") != user_id and (u.get("username") or "").strip().lower() != clean_uname]
                with open(MASTER_VAULT_PATH, "w", encoding="utf-8") as f:
                    json.dump(vault_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[PURGE] Error updating master vault: {e}")


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
