import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('backend/storage/rivals.db')
c = conn.cursor()

def show_table(name):
    print(f"\n--- {name} SCHEMA ---")
    c.execute(f"PRAGMA table_info({name})")
    for col in c.fetchall():
        print(f"  {col[1]} ({col[2]})")
    print(f"--- {name} ROWS ---")
    c.execute(f"SELECT * FROM {name}")
    rows = c.fetchall()
    for r in rows:
        print(" ", r)

show_table("tournaments")
show_table("rooms")
show_table("system_updates")

conn.close()
