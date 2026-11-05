import sqlite3

conn = sqlite3.connect(r'C:\Users\Priyashree Sarkar\Desktop\JEE Test Taker\jee.db')
c = conn.cursor()
c.execute("PRAGMA table_info(questions)")
cols = [row[1] for row in c.fetchall()]
print("Columns in JEE Test Taker questions table:", cols)

if "linked_chapters" in cols:
    c.execute("SELECT count(*) FROM questions WHERE linked_chapters IS NOT NULL AND linked_chapters != '' AND linked_chapters != '[]'")
    cnt = c.fetchone()[0]
    print(f"Questions with non-empty linked_chapters in jee.db: {cnt}")
    
    c.execute("SELECT id, chapter, linked_chapters FROM questions WHERE linked_chapters IS NOT NULL AND linked_chapters != '' AND linked_chapters != '[]' LIMIT 5")
    for r in c.fetchall():
        print("Sample:", r)

conn.close()
