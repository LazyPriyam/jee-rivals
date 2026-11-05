import sqlite3
import re

conn = sqlite3.connect(r'C:\Users\Priyashree Sarkar\Desktop\JEE Rivals\backend\storage\rivals.db')
c = conn.cursor()

c.execute("SELECT id, text, options, solution_text FROM questions WHERE chapter = 'Complex Numbers'")
rows = c.fetchall()

def should_be_quad(text, opts, sol):
    full = f"{text or ''} {opts or ''} {sol or ''}"
    # Checks if it has quadratic equation features and no complex/z features
    if re.search(r'complex|argand|\\omega|\\operatorname\{Re\}|\\operatorname\{Im\}|\\arg|\\bar|\|z\||\bi\b|iota|unity', full, re.I):
        return False, ""
    if re.search(r'quadratic\s+(equation|expression)|ax\^2\s*\+\s*bx\s*\+\s*c|b\^2\s*-\s*4ac|discriminant|common\s+root|location\s+of\s+roots', full, re.I):
        return True, "pure quadratic indicators"
    return False, ""

suspect_quad = []
for r in rows:
    is_q, reason = should_be_quad(r[1], r[2], r[3])
    if is_q:
        suspect_quad.append((r[0], reason, r[1].replace('\n', ' ')[:75]))

print(f"Suspect Quadratic in Complex Numbers: {len(suspect_quad)}")
for qid, reason, txt in suspect_quad:
    print(f"- {qid}: {txt}")

conn.close()
