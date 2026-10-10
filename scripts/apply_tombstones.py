import sqlite3
import datetime
import sys
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app.database import get_connection, init_db, backup_all_users

def run():
    print("Initializing DB to apply schema migrations...")
    init_db()

    conn = get_connection()
    c = conn.cursor()

    now = datetime.datetime.utcnow().isoformat()
    tombstones = [
        ("9b1b2159-9507-45a0-9a2b-b7f27b3f3ff1", "ChatUserA_a49585", now, "dev_purge"),
        ("c91f12cc-6aef-4414-a316-823bc2a1ead7", "ChatUserB_45a037", now, "dev_purge"),
        ("7b873df3-acb1-447e-8b3c-68a32606faaa", "PuranlovesMaths@123", now, "user_purge"),
        ("test_u", "Tester", now, "test_purge")
    ]
    c.executemany("INSERT OR IGNORE INTO deleted_accounts (id, username, deleted_at, reason) VALUES (?, ?, ?, ?)", tombstones)

    # 1. Purge ghost rooms
    c.execute("DELETE FROM rooms WHERE host_id NOT IN (SELECT id FROM users)")
    deleted_rooms = c.rowcount
    print(f"Purged {deleted_rooms} orphaned ghost rooms.")

    # 2. Anonymize question report reporter names for deleted users
    c.execute("UPDATE question_reports SET reporter_username = 'Anonymous Aspirant' WHERE reporter_id NOT IN (SELECT id FROM users)")
    updated_reports = c.rowcount
    print(f"Anonymized {updated_reports} historical question reports.")

    conn.commit()
    conn.close()

    backup_all_users()
    print("Tombstones and cleanup applied successfully.")

if __name__ == "__main__":
    run()
