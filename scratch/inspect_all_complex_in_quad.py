import sqlite3
import re
import json

conn = sqlite3.connect(r'C:\Users\Priyashree Sarkar\Desktop\JEE Rivals\backend\storage\rivals.db')
c = conn.cursor()
c.execute("SELECT id, text, options, solution_text FROM questions WHERE chapter = 'Quadratic Equations'")
rows = c.fetchall()

def is_actually_complex(text, opts, sol):
    full = f"{text or ''} {opts or ''} {sol or ''}"
    
    # Explicit indicators of complex numbers
    complex_pats = [
        r'\b(-?i)\b',
        r'[\s\(\[\{]i[\s\+\-\*\/\^\)\]\}]',
        r'\\sqrt\{\s*-\s*1\s*\}',
        r'\\sqrt\{\s*-\s*[0-9a-zA-Z]',
        r'\biota\b',
        r'\bcomplex\b',
        r'argand',
        r'imaginary',
        r'de\s+moivre',
        r'cube\s+roots?\s+of\s+unity',
        r'roots?\s+of\s+unity',
        r'\\omega',
        r'\bz\b',
        r'\|z\|',
        r'\\bar\{z\}',
        r'\\arg\(',
        r'purely\s+real',
        r'purely\s+imaginary',
        r'cis\s*\(',
        r'e\^\{\s*i'
    ]
    
    # Quadratic indicators
    quad_pats = [
        r'quadratic\s+equation',
        r'quadratic\s+expression',
        r'quadratic\s+formula',
        r'b\^2\s*-\s*4ac',
        r'discriminant',
        r'common\s+root',
        r'location\s+of\s+roots',
        r'sum\s+of\s+(the\s+)?roots',
        r'product\s+of\s+(the\s+)?roots',
        r'difference\s+of\s+(the\s+)?roots',
        r'real\s+and\s+(distinct|equal|unequal)\s+roots',
        r'number\s+of\s+real\s+roots',
        r'both\s+roots\s+are',
        r'\\alpha\s*[\+\*]\s*\\beta',
        r'\\alpha\^2\s*\+\s*\\beta\^2',
        r'ax\^2\s*\+\s*bx\s*\+\s*c'
    ]
    
    c_hits = sum(1 for p in complex_pats if re.search(p, full, re.I))
    q_hits = sum(1 for p in quad_pats if re.search(p, full, re.I))
    
    return c_hits, q_hits

to_review = []
for r in rows:
    c_hits, q_hits = is_actually_complex(r[1], r[2], r[3])
    if c_hits > 0 and q_hits == 0:
        to_review.append(r)
    elif c_hits > q_hits and c_hits >= 2:
        to_review.append(r)

print(f"Questions to review: {len(to_review)}")
for r in to_review:
    print(f"ID: {r[0]}")
    print(f"Text: {r[1][:120]}")
    print(f"Opts: {(r[2] or '')[:80]}")
    print("-" * 50)

conn.close()
