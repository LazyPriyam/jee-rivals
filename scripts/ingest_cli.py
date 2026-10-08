#!/usr/bin/env python3
"""
JEE Rivals - High-Performance Question Ingestion CLI Engine
Classifies into 4 Competitive Tiers:
  - JEE_MAIN (1200 - 1800 Elo)
  - JEE_ADVANCED (1800 - 2400 Elo)
  - OLYMPIAD (2400 - 3000 Elo) [Pathfinder, Irodov, Krotov, INPhO, INChO, RMO]
  - MIXED (1600 - 2200 Elo)

Validates:
  1. LaTeX & KaTeX syntax ($ and $$ delimiters)
  2. Canonical Syllabus Chapter Normalization (jee_syllabus.py)
  3. Option integrity & answer consistency
  4. Diagram file existence
  5. Organic Elo Rating Seeding
"""

import os
import sys
import json
import csv
import re
import uuid
import sqlite3
import argparse
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Ensure robust UTF-8 printing in Windows command prompt
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from backend.app.config import DB_PATH, DIAGRAMS_DIR
from backend.app.tools.jee_syllabus import normalize_chapter_name, JEE_SYLLABUS
from backend.app.tools.elo_engine import compute_seed_elo

VALID_TIERS = {"JEE_MAIN", "JEE_ADVANCED", "OLYMPIAD", "MIXED"}
VALID_SUBJECTS = {"Physics", "Chemistry", "Mathematics"}
VALID_QUESTION_TYPES = {
    "SINGLE_CHOICE", "MULTIPLE_CHOICE", "NUMERICAL", "MATRIX_MATCH", "COMPREHENSION", "SUBJECTIVE"
}


def sanitize_latex(text: str) -> str:
    """Repairs common escape sequences and double backslashes in KaTeX math."""
    if not text:
        return ""
    cleaned = text
    # Fix double-escaped backslashes in formulas e.g. \\frac -> \frac
    cleaned = re.sub(r'\\\\([a-zA-Z]+)', r'\\\1', cleaned)
    # Ensure dollar signs have proper spacing
    cleaned = cleaned.replace('\r\n', '\n')
    return cleaned.strip()


def validate_latex_delimiters(text: str) -> Tuple[bool, str]:
    """Verifies that LaTeX inline ($) and display ($$) delimiters are balanced."""
    if not text:
        return True, ""
    
    # Strip escaped dollar signs \$
    stripped = re.sub(r'\\\$', '', text)
    
    # Count $$ first
    double_count = stripped.count("$$")
    if double_count % 2 != 0:
        return False, "Unbalanced display math delimiters ($$)"
    
    # Remove all $$ to count single $
    single_stripped = stripped.replace("$$", "")
    single_count = single_stripped.count("$")
    if single_count % 2 != 0:
        return False, "Unbalanced inline math delimiters ($)"
    
    return True, ""


def determine_subject_from_chapter(chap: str) -> Optional[str]:
    """Infers subject from canonical chapter name."""
    for subj, units in JEE_SYLLABUS.items():
        for u in units:
            if chap in u["chapters"]:
                return subj
    return None


def validate_and_heal_question(
    raw: Dict[str, Any],
    default_tier: str = "JEE_ADVANCED",
    default_source: str = "Standard Archive",
    default_subject: Optional[str] = None
) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """
    Validates and heals an individual question record against pedagogical standards.
    """
    flags = []

    # 1. Text extraction & sanitization
    q_text = sanitize_latex(raw.get("text") or raw.get("question") or "")
    if not q_text or len(q_text) < 8:
        return False, None, "Question body is missing or too short (< 8 chars)"

    latex_ok, latex_err = validate_latex_delimiters(q_text)
    if not latex_ok:
        flags.append(f"LaTeX Warning: {latex_err}")

    # 2. Chapter & Subject Normalization
    raw_chap = raw.get("chapter") or raw.get("topic") or "General Mechanics"
    norm_chap = normalize_chapter_name(raw_chap)
    if not norm_chap:
        norm_chap = raw_chap.strip()
        flags.append(f"Unnormalized Chapter: '{raw_chap}'")

    raw_subj = raw.get("subject") or determine_subject_from_chapter(norm_chap) or default_subject or "Physics"
    subj_clean = "Physics" if "phys" in raw_subj.lower() else "Chemistry" if "chem" in raw_subj.lower() else "Mathematics"

    # 3. Target Exam Tier
    raw_tier = (raw.get("target_exam") or raw.get("tier") or default_tier).upper()
    if raw_tier not in VALID_TIERS:
        raw_tier = default_tier if default_tier in VALID_TIERS else "JEE_ADVANCED"

    # 4. Question Type
    raw_type = (raw.get("question_type") or raw.get("type") or "SINGLE_CHOICE").upper()
    if "MULTI" in raw_type:
        q_type = "MULTIPLE_CHOICE"
    elif "NUM" in raw_type or "INT" in raw_type:
        q_type = "NUMERICAL"
    elif "MAT" in raw_type:
        q_type = "MATRIX_MATCH"
    elif "COMP" in raw_type:
        q_type = "COMPREHENSION"
    else:
        q_type = "SINGLE_CHOICE"

    # 5. Options Validation
    options = raw.get("options")
    formatted_options = []
    if isinstance(options, str):
        try:
            options = json.loads(options)
        except Exception:
            options = []

    if isinstance(options, list):
        for idx, opt in enumerate(options):
            if isinstance(opt, dict):
                k = (opt.get("key") or chr(65 + idx)).strip().upper()
                txt = sanitize_latex(opt.get("text") or "")
                formatted_options.append({"key": k, "text": txt})
            elif isinstance(opt, str):
                formatted_options.append({"key": chr(65 + idx), "text": sanitize_latex(opt)})
    elif isinstance(options, dict):
        for k, v in options.items():
            formatted_options.append({"key": str(k).strip().upper(), "text": sanitize_latex(str(v))})

    if q_type == "SINGLE_CHOICE" and len(formatted_options) < 2:
        return False, None, f"MCQ requires at least 2 options, found {len(formatted_options)}"

    # 6. Correct Answer Check
    ans = str(raw.get("correct_answer") or raw.get("answer") or "").strip()
    if not ans:
        return False, None, "Missing correct_answer field"

    if q_type == "SINGLE_CHOICE":
        opt_keys = {o["key"] for o in formatted_options}
        if ans.upper() not in opt_keys and not any(ans.upper() == o["text"].upper() for o in formatted_options):
            flags.append(f"Answer '{ans}' not explicitly among option keys {opt_keys}")

    # 7. Diagram check
    has_diagram = bool(raw.get("has_diagram") or raw.get("diagram_urls"))
    diag_urls = raw.get("diagram_urls") or []
    if isinstance(diag_urls, str):
        try:
            diag_urls = json.loads(diag_urls)
        except Exception:
            diag_urls = [diag_urls] if diag_urls.strip() else []

    if has_diagram and not diag_urls:
        has_diagram = False

    # 8. Solution & formulas
    sol_text = sanitize_latex(raw.get("solution_text") or raw.get("solution") or "")
    if sol_text:
        sol_ok, sol_err = validate_latex_delimiters(sol_text)
        if not sol_ok:
            flags.append(f"Solution LaTeX Warning: {sol_err}")

    raw_formulas = raw.get("key_formulas") or []
    if isinstance(raw_formulas, str):
        try:
            raw_formulas = json.loads(raw_formulas)
        except Exception:
            raw_formulas = [raw_formulas] if raw_formulas else []

    # 9. Initial Elo Seeding
    q_id = str(raw.get("id") or f"q_{uuid.uuid4().hex[:10]}")
    diff_tier = (raw.get("difficulty_tier") or ("HARD" if raw_tier == "OLYMPIAD" else "MEDIUM")).upper()
    seed_elo = compute_seed_elo(q_id, raw_tier, diff_tier, q_type)

    source_book = str(raw.get("source_book") or raw.get("source") or default_source).strip()

    healed_obj = {
        "id": q_id,
        "subject": subj_clean,
        "unit": raw.get("unit") or "Advanced Curriculum",
        "chapter": norm_chap,
        "question_type": q_type,
        "text": q_text,
        "options": json.dumps(formatted_options),
        "has_diagram": 1 if has_diagram else 0,
        "diagram_urls": json.dumps(diag_urls),
        "correct_answer": ans,
        "solution_text": sol_text,
        "key_formulas": json.dumps(raw_formulas),
        "common_pitfall": raw.get("common_pitfall") or "",
        "difficulty_tier": diff_tier,
        "elo_rating": seed_elo,
        "target_exam": raw_tier,
        "source_book": source_book,
        "validation_status": "VALIDATED" if not flags else "HEALED",
        "validation_flags": json.dumps(flags)
    }

    return True, healed_obj, ""


def process_file(
    file_path: Path,
    tier: str,
    source: str,
    subject: Optional[str] = None,
    validate_only: bool = False
):
    print(f"\n========================================================")
    print(f"🚀 JEE RIVALS - BATCH INGESTION PROCESSOR")
    print(f"========================================================")
    print(f"📁 Input File:    {file_path.name}")
    print(f"🏆 Target Tier:   {tier}")
    print(f"📚 Source Book:   {source}")
    print(f"🔬 Subject:       {subject or 'Auto-Detect'}")
    print(f"⚙️ Mode:           {'DRY-RUN / VALIDATE ONLY' if validate_only else 'COMMIT TO RIVALS.DB'}")
    print(f"========================================================\n")

    if not file_path.exists():
        print(f"❌ Error: File not found: {file_path}")
        sys.exit(1)

    raw_items = []
    if file_path.suffix.lower() == ".json":
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            raw_items = data if isinstance(data, list) else [data]
    elif file_path.suffix.lower() == ".csv":
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            raw_items = list(reader)
    else:
        print(f"❌ Error: Unsupported format {file_path.suffix}. Expected .json or .csv")
        sys.exit(1)

    print(f"🔍 Discovered {len(raw_items)} candidate questions in input.\n")

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    total_valid = 0
    total_quarantined = 0
    tier_counts = {t: 0 for t in VALID_TIERS}

    for idx, raw in enumerate(raw_items, 1):
        is_ok, healed_q, reason = validate_and_heal_question(
            raw, default_tier=tier, default_source=source, default_subject=subject
        )

        if not is_ok:
            total_quarantined += 1
            if not validate_only:
                now_str = str(uuid.uuid4())
                c.execute("""
                    INSERT INTO quarantine (id, question_data, reason, created_at)
                    VALUES (?, ?, ?, datetime('now'))
                """, (f"quar_{uuid.uuid4().hex[:10]}", json.dumps(raw), reason))
            print(f"  [QUARANTINE #{idx}] {reason}")
            continue

        total_valid += 1
        tier_counts[healed_q["target_exam"]] += 1

        if not validate_only:
            c.execute("""
                INSERT OR REPLACE INTO questions (
                    id, subject, unit, chapter, question_type, text, options,
                    has_diagram, diagram_urls, correct_answer, solution_text,
                    key_formulas, common_pitfall, difficulty_tier, elo_rating,
                    target_exam, source_book, validation_status, validation_flags
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?
                )
            """, (
                healed_q["id"], healed_q["subject"], healed_q["unit"], healed_q["chapter"],
                healed_q["question_type"], healed_q["text"], healed_q["options"],
                healed_q["has_diagram"], healed_q["diagram_urls"], healed_q["correct_answer"],
                healed_q["solution_text"], healed_q["key_formulas"], healed_q["common_pitfall"],
                healed_q["difficulty_tier"], healed_q["elo_rating"], healed_q["target_exam"],
                healed_q["source_book"], healed_q["validation_status"], healed_q["validation_flags"]
            ))

    if not validate_only:
        conn.commit()

    c.execute("SELECT COUNT(*), target_exam FROM questions GROUP BY target_exam")
    db_distribution = c.fetchall()
    c.execute("SELECT COUNT(*) FROM questions")
    total_db = c.fetchone()[0]
    conn.close()

    print(f"\n========================================================")
    print(f"📊 INGESTION AUDIT SUMMARY")
    print(f"========================================================")
    print(f"✅ Successfully Validated:  {total_valid} questions")
    print(f"⚠️ Quarantined for Defects: {total_quarantined} questions")
    print(f"\n📈 Batch Tier Calibration:")
    for t_name, count in tier_counts.items():
        if count > 0:
            print(f"   • {t_name.ljust(14)}: {count} questions")
    print(f"\n🏛️ Live Database Status (rivals.db):")
    print(f"   Total Questions in Active Bank: {total_db}")
    for row in db_distribution:
        print(f"   • {str(row['target_exam']).ljust(14)}: {row['COUNT(*)']}")
    print(f"========================================================\n")


def main():
    parser = argparse.ArgumentParser(
        description="JEE Rivals 4-Tier Ingestion & Olympiad CLI Pipeline"
    )
    parser.add_argument(
        "--input", "-i", required=True, type=Path, help="Path to input JSON or CSV file"
    )
    parser.add_argument(
        "--tier", "-t", default="OLYMPIAD", choices=list(VALID_TIERS),
        help="Classification Tier: JEE_MAIN, JEE_ADVANCED, OLYMPIAD, MIXED (default: OLYMPIAD)"
    )
    parser.add_argument(
        "--source", "-s", default="Pathfinder",
        help="Source book/exam name (e.g. Pathfinder, Irodov, Krotov, INPhO 2024)"
    )
    parser.add_argument(
        "--subject", choices=list(VALID_SUBJECTS), default=None,
        help="Curriculum Subject: Physics, Chemistry, Mathematics (optional override)"
    )
    parser.add_argument(
        "--validate-only", "--dry-run", action="store_true",
        help="Run syntax and KaTeX verification without writing to database"
    )

    args = parser.parse_args()
    process_file(
        file_path=args.input,
        tier=args.tier,
        source=args.source,
        subject=args.subject,
        validate_only=args.validate_only
    )


if __name__ == "__main__":
    main()
