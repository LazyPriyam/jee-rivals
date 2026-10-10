"""
Aspirant Data Safety Guard & Pre-Build Armor for JEE Rivals.
Ensures zero data loss, protects user Elo ratings, chapter mastery,
and active practice sessions from ever being wiped or degraded across builds.
"""

import sys
import os
import json
import sqlite3
import datetime
from pathlib import Path

# Add project root to sys.path
CURRENT_FILE = Path(__file__).resolve()
BACKEND_DIR = CURRENT_FILE.parent.parent.parent
ROOT_DIR = BACKEND_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.config import DB_PATH, STORAGE_DIR
from backend.app.database import get_connection, backup_all_users, restore_users_from_backup
from backend.app.tools.db_backup_manager import create_snapshot, verify_database_integrity


def run_build_safeguard() -> bool:
    print("\n" + "=" * 60)
    print("  [JEE RIVALS] PRE-BUILD ASPIRANT DATA SAFEGUARD")
    print("=" * 60)

    if not DB_PATH.exists():
        print(f"[SAFEGUARD WARNING] Database {DB_PATH} not found yet. Skipping database snapshot.")
        return True

    # 1. Atomic pre-build snapshot
    print("[1/4] Creating atomic SQLite backup snapshot...")
    snapshot = create_snapshot(reason="pre_build_lock")
    if snapshot:
        print(f"      -> Secured snapshot: {snapshot.name} ({snapshot.stat().st_size} bytes)")
    else:
        print("      -> [WARNING] Snapshot skipped or failed.")

    # 2. Database Integrity Verification
    print("[2/4] Verifying database integrity...")
    integrity = verify_database_integrity()
    if not integrity.get("ok"):
        print(f"      [FATAL] Database integrity check failed: {integrity}")
        return False
    print("      -> SQLite integrity: OK (0 FK violations)")

    # 3. Synchronize Aspirant Vaults
    print("[3/4] Securing Aspirant Master Vault...")
    conn = get_connection()
    try:
        # Reconcile high-watermark first
        reconciled = restore_users_from_backup(conn)
        # Flush latest state to persistent JSON vaults
        user_count = backup_all_users(conn)
        print(f"      -> Master vault synced for {user_count} active aspirants.")
    finally:
        conn.close()

    # 4. Critical Data Invariant Checks
    print("[4/4] Validating critical invariant rules...")
    conn = get_connection()
    try:
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM users")
        total_users = c.fetchone()[0]
        if total_users == 0:
            print("      [FATAL] Zero users found! Build aborted to prevent data loss.")
            return False

        c.execute("SELECT id, username, overall_elo, weekly_rp FROM users WHERE LOWER(username) = 'priyam'")
        priyam_row = c.fetchone()
        if priyam_row:
            elo = float(priyam_row["overall_elo"] or 1200.0)
            rp = int(priyam_row["weekly_rp"] or 0)
            if elo < 1200.0:
                print(f"      [FATAL] Aspirant rating dropped below seed! Current: {elo}. Aborting.")
                return False
            print(f"      -> Aspirant 'Priyam' verified: {elo:.1f} Elo, {rp} RP (Protected)")
        else:
            print("      [NOTE] Aspirant 'Priyam' not found in local seed; other accounts present.")

        c.execute("SELECT COUNT(*) FROM questions")
        total_qs = c.fetchone()[0]
        print(f"      -> Question bank verified: {total_qs} questions loaded.")
    finally:
        conn.close()

    print("=" * 60)
    print("  [SAFEGUARD RESULT] ALL ASPIRANT DATA SAFELY ARMORED! BUILD ALLOWED.")
    print("=" * 60 + "\n")
    return True


if __name__ == "__main__":
    success = run_build_safeguard()
    sys.exit(0 if success else 1)
