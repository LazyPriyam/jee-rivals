"""
question_verifier.py
────────────────────
Real-time structural defect auditor, healer, and quarantine engine for JEE Rivals.
Ensures that all questions served in Adaptive Practice, Daily Challenges,
Multiplayer Arena Matches, and Tournaments are 100% complete, verified, and well-formed.
"""

import re
import json
import sqlite3
import datetime
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

from backend.app.config import DIAGRAMS_DIR, DB_PATH

# ── Regex Patterns for Defect Detection ──
DANGLING_WORD_PATTERNS = [
    re.compile(r'\b(?:is|are|was|were)\s*$', re.IGNORECASE),
    re.compile(r'\b(?:of|to|with|in|at|for|from|by|on)\s*$', re.IGNORECASE),
    re.compile(r'\b(?:and|or|but|where|that|when|if|then)\s*$', re.IGNORECASE),
    re.compile(r'\b(?:the|a|an)\s*$', re.IGNORECASE),
    re.compile(r'\b(?:equal to|given by|proportional to|ratio of|value of|magnitude of)\s*$', re.IGNORECASE),
    re.compile(r'\b(?:which of the following|which of these|statement is|statements are)\s*$', re.IGNORECASE),
]

DANGLING_PUNCT_PATTERN = re.compile(r'[,;\-\(\[\{/]\s*$')
DANGLING_OPERATOR_PATTERN = re.compile(r'[=\+\-\*/]\s*$')

FIGURE_REF_PATTERN = re.compile(
    r'\b(?:fig(?:ure)?\.?\s*\d*|shown in (?:the )?figure|in the given figure|given circuit|circuit diagram|as shown below|shown in diagram|given graph|graph below|shown in the diagram)\b',
    re.IGNORECASE
)

EXAM_METADATA_PATTERN = re.compile(
    r'[\s,–-]*(?:\[|\()?(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}(?:\s*\(?[A-Za-z0-9\s]+\)?)?|JEE\s*(?:Main|Adv(?:anced)?)\s*\d{4}(?:\s*\(?[A-Za-z0-9\s]+\)?)?)(?:\]|\))?\s*$',
    re.IGNORECASE
)

NUMERICAL_PROMPT_PATTERN = re.compile(
    r'\b(?:(?:nearest\s+integer|round(?:ed)?\s+off\s+to\s+(?:the\s+)?nearest|is\s*_{2,}|value\s+of\s+[a-zA-Z]\s+is\s*_{1,}|is\s*_{1,}\s*(?:J|K|m|s|kg|V|A|N|mol|cal|atm|pm|nm|cm|mm|%)?\.?\s*\(nearest\s+integer\)|is\s*_{1,}\s*\.\s*\(nearest\s+integer\)|equal\s+to\s*_{2,}))\b',
    re.IGNORECASE
)

GARBLED_LATEX_PATTERN = re.compile(
    r'\b(?:[a-zA-Z]\s*=\s*[a-zA-Z\\]+\s*\d+\s*\d+\s*[a-zA-Z]\s*\d+\s*\d+)\b'
)


def strip_exam_metadata_tag(text: str) -> str:
    """Removes trailing exam session tags like '11 Apr 2023 (M)', '[JEE Main 2022]', etc."""
    if not text:
        return ""
    return EXAM_METADATA_PATTERN.sub("", text.strip()).strip()


def detect_question_defects(q: dict) -> List[str]:
    """
    Rigorously detects structural, mathematical, and option defects in a question.
    Returns a list of defect description strings. Empty list means the question is pristine.
    """
    defects = []
    text = (q.get("text") or "").strip()
    clean_text = strip_exam_metadata_tag(text)

    # 1. Truncated or excessively short text
    if len(clean_text) < 15:
        defects.append("TRUNCATED_TEXT: Question prompt is excessively short (< 15 characters)")

    # 2. Awkward Endings / Dangling words and punctuation
    for pat in DANGLING_WORD_PATTERNS:
        if pat.search(clean_text):
            defects.append(f"AWKWARD_ENDING: Prompt terminates abruptly with dangling phrase ('{clean_text[-35:]}')")
            break

    if DANGLING_PUNCT_PATTERN.search(clean_text):
        defects.append(f"AWKWARD_ENDING: Prompt ends with dangling punctuation ('{clean_text[-10:]}')")
    elif DANGLING_OPERATOR_PATTERN.search(clean_text):
        defects.append(f"AWKWARD_ENDING: Prompt ends with dangling mathematical operator ('{clean_text[-10:]}')")

    # 3. Math balance check: unclosed dollar signs
    if clean_text.count("$") % 2 != 0:
        defects.append("UNBALANCED_MATH: Odd number of LaTeX inline math delimiters ($)")

    # 4. Options and Question Type Checks
    raw_opts = q.get("options")
    try:
        opts = json.loads(raw_opts) if isinstance(raw_opts, str) else (raw_opts or [])
    except Exception:
        opts = []

    q_type = str(q.get("question_type") or "SINGLE_CHOICE").upper()
    is_mcq = q_type in ("SINGLE_CHOICE", "MULTIPLE_CHOICE")
    is_numerical = q_type in ("NUMERICAL", "INTEGER")

    # Catch Fill-in-the-Blank / Numerical prompt disguised as MCQ with mismatched options
    if is_mcq and NUMERICAL_PROMPT_PATTERN.search(clean_text):
        # Check if options are NOT simple numbers
        non_numeric_opts = []
        for o in opts:
            otext = (o.get("text") if isinstance(o, dict) else str(o)).strip()
            # If option text contains words or formulas rather than pure numbers
            cleaned_otext = re.sub(r'[\$\s]', '', otext)
            try:
                float(cleaned_otext)
            except ValueError:
                non_numeric_opts.append(otext)

        if len(non_numeric_opts) >= 2:
            defects.append("NUMERICAL_DISGUISED_AS_MCQ: Prompt requests a numerical/integer answer ('Nearest Integer' or '_____') but has non-numerical MCQ options")

    # Catch Semantic Option Mismatches (e.g. asking for atomic number / value but options are textual property names)
    if is_mcq and re.search(r'\b(?:atomic\s+number\s+of\s+[A-Za-z]+\s+is\s*_{1,})\b', clean_text, re.IGNORECASE):
        # Options should be numbers or element symbols, not property names like "enthalpy"
        property_keywords = ["enthalpy", "electronegativity", "radius", "property", "energy"]
        has_property_opts = any(
            any(pk in (o.get("text", "") if isinstance(o, dict) else str(o)).lower() for pk in property_keywords)
            for o in opts
        )
        if has_property_opts:
            defects.append("OPTION_MISMATCH: Atomic number prompt paired with periodic property options")

    # Catch Garbled LaTeX in options
    for o in opts:
        otext = o.get("text", "") if isinstance(o, dict) else str(o)
        if GARBLED_LATEX_PATTERN.search(otext):
            defects.append(f"GARBLED_LATEX: Option contains concatenated unspaced math without operators ('{otext}')")
            break

    # Options Count for MCQs
    if is_mcq and "NUMERICAL_DISGUISED_AS_MCQ" not in "".join(defects):
        if len(opts) < 3:
            defects.append(f"MISSING_OPTIONS: Multiple choice question has only {len(opts)} option(s) (expected 4)")
        elif any(not (o.get("text") if isinstance(o, dict) else str(o)).strip() for o in opts):
            defects.append("EMPTY_OPTION: Contains one or more options with empty text")

    # 5. Missing Diagram References
    has_diag = bool(q.get("has_diagram"))
    raw_urls = q.get("diagram_urls")
    try:
        urls = json.loads(raw_urls) if isinstance(raw_urls, str) else (raw_urls or [])
    except Exception:
        urls = []

    if FIGURE_REF_PATTERN.search(clean_text) and (not has_diag or not urls):
        defects.append("MISSING_DIAGRAM: Prompt references a figure, circuit, or diagram but none is attached")

    # 6. Broken Diagram File on Disk Check
    if has_diag and urls:
        for u in urls:
            fn = Path(str(u).replace("\\", "/")).name
            p_static = DIAGRAMS_DIR / fn
            # Fallback to JEE Test Taker storage
            p_storage = Path("C:/Users/Priyashree Sarkar/Desktop/JEE Test Taker/storage/diagrams") / fn
            if not p_static.exists() and not p_storage.exists():
                defects.append(f"BROKEN_DIAGRAM_FILE: Referenced diagram '{fn}' does not exist on disk")
                break

    # 7. Incomplete Comprehension Context
    if q_type == "COMPREHENSION" and len(clean_text) < 45:
        defects.append("INCOMPLETE_COMPREHENSION: Subquestion lacks necessary passage or background context")

    return defects


def heal_question(q: dict) -> Optional[dict]:
    """
    Attempts to heal common fixable defects in a question:
    1. Converts numerical prompts erroneously typed as SINGLE_CHOICE into clean NUMERICAL questions.
    2. Punctuates dangling sentence endings if valid options are present.
    3. Auto-balances single unclosed inline math dollar signs ($).
    4. Cleans and normalizes diagram URLs and copies missing diagrams to static directory.
    Returns the updated question dict if healed and defect-free, else None.
    """
    healed = dict(q)
    healed_any = False
    clean_text = strip_exam_metadata_tag(healed.get("text") or "")

    # 1. Heal Numerical prompt disguised as MCQ
    if NUMERICAL_PROMPT_PATTERN.search(clean_text):
        q_type = str(healed.get("question_type") or "SINGLE_CHOICE").upper()
        if q_type != "NUMERICAL":
            # Check if solution_text or correct_answer provides a numeric value
            sol = healed.get("solution_text") or ""
            ans = str(healed.get("correct_answer") or "").strip()

            numeric_ans = None
            try:
                float(ans)
                numeric_ans = ans
            except ValueError:
                # Try finding derived conclusion in solution e.g. "x \approx 710", "is 710", "= 710"
                m_sol = re.search(r'(?:x\s*(?:\\approx|=)\s*(\d+(?:\.\d+)?)|(?:is|answer\s+is)\s*(\d+(?:\.\d+)?))', sol, re.IGNORECASE)
                if m_sol:
                    numeric_ans = m_sol.group(1) or m_sol.group(2)

            if numeric_ans:
                healed["question_type"] = "NUMERICAL"
                healed["options"] = "[]"
                healed["correct_answer"] = numeric_ans
                healed_any = True

    # 2. Heal dangling punctuation or sentence ends with valid options
    raw_opts = healed.get("options")
    try:
        opts = json.loads(raw_opts) if isinstance(raw_opts, str) else (raw_opts or [])
    except Exception:
        opts = []

    if opts and len(opts) >= 3:
        txt = healed.get("text") or ""
        clean_txt = strip_exam_metadata_tag(txt)
        if any(clean_txt.endswith(x) for x in ("same as that of", "equal to", "given by", "is", "are", "which of the following")):
            healed["text"] = clean_txt.rstrip() + ":"
            healed_any = True

    # 3. Heal unclosed dollar signs
    txt = healed.get("text") or ""
    if txt.count("$") % 2 != 0:
        healed["text"] = txt + "$"
        healed_any = True

    # 4. Heal diagram URLs & sync missing image files
    raw_urls = healed.get("diagram_urls")
    try:
        urls = json.loads(raw_urls) if isinstance(raw_urls, str) else (raw_urls or [])
    except Exception:
        urls = []

    if urls:
        clean_urls = []
        for u in urls:
            u_str = str(u)
            fn = Path(u_str.replace("\\", "/")).name
            # If not in static/diagrams, try copying from storage/diagrams
            target = DIAGRAMS_DIR / fn
            if not target.exists():
                storage_src = Path("C:/Users/Priyashree Sarkar/Desktop/JEE Test Taker/storage/diagrams") / fn
                if storage_src.exists():
                    shutil.copy2(storage_src, target)
            clean_urls.append(f"/diagrams/{fn}")

        if clean_urls != urls:
            healed["diagram_urls"] = json.dumps(clean_urls)
            healed_any = True

    # Re-evaluate defects after healing
    rem_defects = detect_question_defects(healed)
    if not rem_defects:
        # Save healed question to database
        try:
            save_healed_question(healed)
        except Exception:
            pass
        return healed

    return None


def save_healed_question(q: dict):
    """Persists healed question state into rivals.db and jee.db."""
    qid = q["id"]
    now = datetime.datetime.utcnow().isoformat()
    opts_str = json.dumps(q.get("options") if isinstance(q.get("options"), list) else json.loads(q.get("options") or "[]"))
    urls_str = json.dumps(q.get("diagram_urls") if isinstance(q.get("diagram_urls"), list) else json.loads(q.get("diagram_urls") or "[]"))

    # 1. Update rivals.db
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    c.execute("""
        UPDATE questions
        SET question_type = ?, text = ?, options = ?, has_diagram = ?, diagram_urls = ?,
            correct_answer = ?, validation_status = 'VALIDATED', validation_flags = '[]'
        WHERE id = ?
    """, (
        q.get("question_type", "SINGLE_CHOICE"),
        q.get("text", ""),
        opts_str,
        1 if q.get("has_diagram") else 0,
        urls_str,
        str(q.get("correct_answer") or ""),
        qid
    ))
    conn.commit()
    conn.close()

    # 2. Update storage/jee.db if available
    jee_db_path = Path("C:/Users/Priyashree Sarkar/Desktop/JEE Test Taker/storage/jee.db")
    if jee_db_path.exists():
        try:
            jconn = sqlite3.connect(str(jee_db_path))
            jc = jconn.cursor()
            jc.execute("""
                UPDATE questions
                SET question_type = ?, text = ?, options = ?, has_diagram = ?,
                    correct_answer = ?, validation_status = 'VALIDATED', validation_flags = '[]'
                WHERE id = ?
            """, (
                q.get("question_type", "SINGLE_CHOICE"),
                q.get("text", ""),
                opts_str,
                1 if q.get("has_diagram") else 0,
                str(q.get("correct_answer") or ""),
                qid
            ))
            jconn.commit()
            jconn.close()
        except Exception:
            pass


def quarantine_question(qid: str, reasons: List[str]):
    """
    Quarantines an unhealable defective question in rivals.db and jee.db,
    recording the defect reasons and excluding it from future tests and matches.
    """
    now = datetime.datetime.utcnow().isoformat()
    reasons_json = json.dumps(reasons)
    reason_str = "; ".join(reasons)

    # 1. Update rivals.db
    try:
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        c.execute("""
            UPDATE questions
            SET validation_status = 'QUARANTINED', validation_flags = ?
            WHERE id = ?
        """, (reasons_json, qid))

        # Insert into quarantine log table
        c.execute("""
            INSERT OR REPLACE INTO quarantine (id, question_data, reason, created_at)
            VALUES (?, ?, ?, ?)
        """, (qid, json.dumps({"id": qid, "reasons": reasons}), reason_str, now))

        conn.commit()
        conn.close()
    except Exception:
        pass

    # 2. Update storage/jee.db if accessible
    jee_db_path = Path("C:/Users/Priyashree Sarkar/Desktop/JEE Test Taker/storage/jee.db")
    if jee_db_path.exists():
        try:
            jconn = sqlite3.connect(str(jee_db_path))
            jc = jconn.cursor()
            jc.execute("""
                UPDATE questions
                SET validation_status = 'QUARANTINED', validation_flags = ?
                WHERE id = ?
            """, (reasons_json, qid))

            jc.execute("""
                INSERT OR REPLACE INTO quarantine (id, question_data, reason, created_at)
                VALUES (?, ?, ?, ?)
            """, (qid, json.dumps({"id": qid, "reasons": reasons}), reason_str, now))

            jconn.commit()
            jconn.close()
        except Exception:
            pass


def audit_and_heal_question(q: dict) -> Tuple[bool, Optional[dict], List[str]]:
    """
    Full audit & heal pipeline for a single question dict:
    - If pristine: returns (True, q, [])
    - If defective but healable: heals, saves, and returns (True, healed_q, [])
    - If unhealable: quarantines in DB and returns (False, None, defects)
    """
    defects = detect_question_defects(q)
    if not defects:
        return True, q, []

    # Attempt healing
    healed = heal_question(q)
    if healed:
        return True, healed, []

    # Unhealable -> quarantine immediately
    quarantine_question(q["id"], defects)
    return False, None, defects
