import sqlite3
import re
import json

conn = sqlite3.connect(r'C:\Users\Priyashree Sarkar\Desktop\JEE Rivals\backend\storage\rivals.db')
c = conn.cursor()

# Find all questions currently under Quadratic Equations
c.execute("SELECT id, text, options, solution_text FROM questions WHERE chapter = 'Quadratic Equations'")
rows = c.fetchall()

def should_be_complex(text, opts, sol):
    full = f"{text or ''} {opts or ''} {sol or ''}"
    
    # 1. Pure imaginary unit manipulation or powers of i
    if re.search(r'\\sqrt\{\s*a\s*\}\s*\\sqrt\{\s*b\s*\}', full) and re.search(r'a\s*<\s*0', full):
        return True, "sqrt(a)*sqrt(b) negative definition"
    if re.search(r'\(-i\)\^\{\s*1/3\s*\}|\\sqrt\[3\]\{\s*-\s*1\s*\}', full):
        return True, "cube roots of -1 or -i"
    if re.search(r'\\left\(\s*\\frac\{\s*1\s*\+\s*i\s*\}\{\s*1\s*-\s*i\s*\}\s*\\right\)', full):
        return True, "(1+i)/(1-i) unimodular power"
    if re.search(r'\\left\(\s*\\frac\{\s*-1\s*\+\s*i\\sqrt\{3\}\s*\}\{\s*1-i\s*\}\s*\\right\)', full):
        return True, "De Moivre power calculation"
    if re.search(r'1\s*\+\s*\\sin.*i\s*\\cos', full):
        return True, "trig form of complex number"
    if re.search(r'\\frac\{\s*3\s*\+\s*i\\sin|\\frac\{.*i\\sin.*\}\{.*i\\cos.*\}', full):
        return True, "purely real/imaginary fractional form"
    if re.search(r'z\s*=\s*f\(x\)\s*\+\s*i\s*g\(x\)', full):
        return True, "z = f(x) + i g(x)"
    if re.search(r'11z\^\{\s*10\s*\}\s*\+\s*10iz\^9', full):
        return True, "polynomial in z on |z|=1"
    if re.search(r'\|z\|\s*=\s*[0-9]', full) and not re.search(r'x\^2\s*\+\s*bx', full):
        return True, "locus with |z|"
    if re.search(r'\|z\+2\|\s*=\s*z\s*\+\s*4\(1\s*\+\s*i\)', full):
        return True, "z = alpha + i beta equation"
    if re.search(r'\(\\sqrt\{3\}\s*\+\s*i\)\^\{\s*100\s*\}', full):
        return True, "polar form of complex power"
    if re.search(r'\\alpha\s*=\s*\\frac\{\s*-1\s*\+\s*i\\sqrt\{3\}\s*\}\{\s*2\s*\}', full) and re.search(r'\(2\s*\+\s*\\alpha\)\^4', full):
        return True, "omega cube root of unity"
    if re.search(r'4ix\s*\+\s*\(1\s*\+\s*i\)y\s*=\s*0', full):
        return True, "complex linear system"
    if re.search(r'\\sqrt\{-1\s*-\s*\\sqrt\{-1', full):
        return True, "infinite complex radical"
    if re.search(r'\bi\s*=\s*\\sqrt\{\s*-\s*1\s*\}', full) and not re.search(r'ax\^2|b\^2\s*-\s*4ac|quadratic', full, re.I):
        return True, "i = sqrt(-1) without quadratic"
    return False, ""

reclass = []
for r in rows:
    is_c, reason = should_be_complex(r[1], r[2], r[3])
    if is_c:
        reclass.append((r[0], reason, r[1].replace('\n', ' ')[:75]))

print(f"Total definitely Complex Numbers: {len(reclass)}")
for qid, reason, txt in reclass:
    print(f"- {qid} [{reason}]: {txt}")

conn.close()
