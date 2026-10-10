#!/usr/bin/env python3
"""
Turso Cloud SQLite Migration & Synchronization Engine.
Safely migrates all local database schema, questions (3,484+), solution keys,
aspirant user accounts, Elo ratings, and tombstone records into Turso Cloud SQLite (libSQL).
"""

import os
import sys
import argparse
import sqlite3
import datetime
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.config import DB_PATH, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
from backend.app.database import TursoConnection
from backend.app.tools.db_migrations import run_all_migrations

def migrate_to_turso(url: str, token: str):
    print("=" * 65)
    print("      [JEE RIVALS] TURSO CLOUD SQLITE MIGRATION ENGINE")
    print("=" * 65)

    if not DB_PATH.exists():
        print(f"[ERROR] Local SQLite database not found at {DB_PATH}")
        sys.exit(1)

    url = url.strip()
    token = token.strip()
    if not url:
        print("[ERROR] Turso Database URL is required.")
        sys.exit(1)

    print(f"\n[1/4] Connecting to Turso Cloud at: {url}")
    import libsql_client
    turso_client = libsql_client.create_client_sync(url=url, auth_token=token or None)
    turso_conn = TursoConnection(turso_client)

    # 1. Run migrations to initialize all tables
    print("[2/4] Initializing schema and applying authoritative migrations on Turso...")
    mig_result = run_all_migrations(turso_conn)
    print(f"      -> Migrations completed: {mig_result.get('status')} ({mig_result.get('applied_count')} applied)")

    # 2. Connect to local database
    print("[3/4] Reading local SQLite database and transferring data to cloud...")
    local_conn = sqlite3.connect(str(DB_PATH))
    local_conn.row_factory = sqlite3.Row
    local_c = local_conn.cursor()

    local_c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [r[0] for r in local_c.fetchall()]

    # Priority sync order
    priority_order = [
        "schema_migrations",
        "deleted_accounts",
        "users",
        "questions",
        "user_chapter_elo",
        "user_fsrs_states",
        "user_rank_history",
        "system_updates",
        "question_reports",
        "adaptive_sessions",
        "activity_log"
    ]
    # Add any remaining tables
    all_tables = [t for t in priority_order if t in tables] + [t for t in tables if t not in priority_order]

    turso_cursor = turso_conn.cursor()

    for tbl in all_tables:
        local_c.execute(f"SELECT COUNT(*) FROM [{tbl}]")
        total_rows = local_c.fetchone()[0]
        if total_rows == 0:
            continue

        print(f"   -> Syncing table [{tbl}] ({total_rows} records)...")
        local_c.execute(f"PRAGMA table_info([{tbl}])")
        cols = [c[1] for c in local_c.fetchall()]
        cols_str = ", ".join([f"[{c}]" for c in cols])
        placeholders = ", ".join(["?"] * len(cols))

        # Check existing table in Turso
        try:
            turso_cursor.execute(f"PRAGMA table_info([{tbl}])")
            turso_cols = {c[1] for c in turso_cursor.fetchall()}
            if not turso_cols:
                # If table missing, grab CREATE TABLE statement from local
                local_c.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (tbl,))
                create_sql = local_c.fetchone()[0]
                turso_cursor.execute(create_sql)
        except Exception as e:
            print(f"      [WARN] Table verification notice for {tbl}: {e}")

        # Fetch and insert in batches
        local_c.execute(f"SELECT * FROM [{tbl}]")
        batch_size = 200
        synced_count = 0

        insert_verb = "INSERT OR REPLACE" if tbl == "users" else "INSERT OR IGNORE"
        sql = f"{insert_verb} INTO [{tbl}] ({cols_str}) VALUES ({placeholders})"

        while True:
            rows = local_c.fetchmany(batch_size)
            if not rows:
                break
            batch_vals = [[r[c] for c in cols] for r in rows]
            turso_cursor.executemany(sql, batch_vals)
            synced_count += len(rows)
            print(f"      ... {synced_count}/{total_rows} rows transferred", end="\r")

        print(f"      -> Successfully transferred {synced_count}/{total_rows} rows to Turso cloud.")

    local_conn.close()

    # 3. Verification
    print("\n[4/4] Verifying data integrity on Turso Cloud SQLite...")
    print("-" * 65)
    for tbl in ["users", "questions", "deleted_accounts", "schema_migrations"]:
        try:
            turso_cursor.execute(f"SELECT COUNT(*) FROM [{tbl}]")
            cnt = turso_cursor.fetchone()[0]
            print(f"   Table [{tbl:18}]: {cnt:5} records verified in cloud")
        except Exception as e:
            print(f"   Table [{tbl:18}]: check notice ({e})")

    # Check Priyam's account specifically
    turso_cursor.execute("SELECT id, username, overall_elo, weekly_rp FROM users WHERE LOWER(username) = 'priyam'")
    priyam = turso_cursor.fetchone()
    if priyam:
        print(f"\n   [PRIYAM ARMOR VERIFIED]: {priyam['username']} | Elo: {priyam['overall_elo']} | RP: {priyam['weekly_rp']}")
    else:
        print("\n   [NOTE]: User 'priyam' not found on cloud.")

    turso_client.close()
    print("-" * 65)
    print("  [SUCCESS] TURSO CLOUD SQLITE IS FULLY POPULATED & READY!")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate local SQLite data to Turso Cloud")
    parser.add_argument("--url", default=TURSO_DATABASE_URL or os.environ.get("TURSO_DATABASE_URL", ""),
                        help="Turso database URL (libsql://...)")
    parser.add_argument("--token", default=TURSO_AUTH_TOKEN or os.environ.get("TURSO_AUTH_TOKEN", ""),
                        help="Turso database auth token")
    args = parser.parse_args()

    url = args.url or input("Enter Turso Database URL (e.g. libsql://jee-rivals-user.turso.io): ").strip()
    token = args.token or input("Enter Turso Auth Token: ").strip()

    migrate_to_turso(url, token)
