import sqlite3

conn = sqlite3.connect(r'C:\Users\Priyashree Sarkar\Desktop\JEE Test Taker\storage\jee.db')
c = conn.cursor()
c.execute("PRAGMA table_info(questions)")
cols = [row[1] for row in c.fetchall()]
print("Columns in storage/jee.db questions table:", cols)

if "linked_chapters" in cols:
    c.execute("SELECT count(*) FROM questions WHERE linked_chapters IS NOT NULL AND linked_chapters != '' AND linked_chapters != '[]'")
    cnt = c.fetchone()[0]
    print(f"Questions with non-empty linked_chapters in storage/jee.db: {cnt}")
conn.close()
