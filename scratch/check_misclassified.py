import sqlite3
import re
import json

conn = sqlite3.connect(r'C:\Users\Priyashree Sarkar\Desktop\JEE Rivals\backend\storage\rivals.db')
c = conn.cursor()
c.execute("SELECT id, text, options, solution_text FROM questions WHERE chapter = 'Quadratic Equations'")
rows = c.fetchall()

suspect = []
for r in rows:
    qid, text, opts, sol = r
    full = f"{text or ''} {opts or ''} {sol or ''}"
    
    # Check for iota, complex, or square root of negatives
    has_complex_ind = bool(re.search(r'\bi\b|\\sqrt\{\s*-\s*[0-9a-zA-Z]|\biota\b|imaginary|complex|\barg\b|\\bar|modulus', full, re.I))
    has_quad_ind = bool(re.search(r'quadratic|equation|polynomial|ax\^2|b\^2\s*-\s*4ac|discriminant|roots?\s+of\s+(the\s+)?equation|common\s+root|real\s+roots?', full, re.I))
    
    if has_complex_ind and not has_quad_ind:
        suspect.append((qid, text.replace('\n', ' ')[:70], (opts or '')[:60]))

print(f"Total suspects: {len(suspect)}")
for s in suspect:
    print(s[0], "-->", s[1], "-->", s[2])

conn.close()
