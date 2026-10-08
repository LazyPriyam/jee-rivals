"""
comprehension_engine.py - Complete Engine for JEE Comprehension & Paragraph Questions.

In actual JEE Main & JEE Advanced examinations:
1. Comprehension questions present a background passage / paragraph / experimental write-up.
2. The next 2 to 4 consecutive questions in the exam are based directly off this passage.
3. Instead of showing all questions at once in a single cluttered block, each subquestion
   is presented sequentially with the shared passage context visible, allowing independent
   answer selection, evaluation, and time allocation.
"""

import re
import json
import sqlite3
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path


def parse_single_comprehension(
    qid: str,
    subj: str,
    unit: str,
    chap: str,
    text: str,
    default_ans: Any,
    options_json: Optional[List[Dict[str, str]]],
    sol_text: str = "",
    elo: int = 1500,
    diff: str = "MEDIUM"
) -> List[Dict[str, Any]]:
    """
    Parses a combined comprehension text block into a list of individual question dicts.
    Each subquestion has its own question text, options, answer, and references the shared passage.
    """
    # Identify subquestions split points: "\n1.", "\n2.", "\n35.", "\n(1)", "1. ", "45. "
    q_split_pattern = re.compile(
        r'(?:\n+|^)\s*(?:(?:Question\s*)?(\d{1,2})\.|\((\d{1,2})\))\s+',
        re.MULTILINE
    )

    matches = list(q_split_pattern.finditer(text))
    if not matches:
        # No numbered subquestions found - return single question as-is
        return [{
            "id": qid,
            "subject": subj,
            "unit": unit or "General",
            "chapter": chap,
            "question_type": "COMPREHENSION",
            "text": text,
            "options": options_json or [],
            "correct_answer": str(default_ans or "A").strip().upper(),
            "solution_text": sol_text or "",
            "passage_id": qid,
            "passage_title": "Comprehension Passage",
            "passage_text": text,
            "subquestion_index": 1,
            "subquestion_total": 1,
            "elo_rating": elo or 1500,
            "difficulty_tier": diff or "MEDIUM"
        }]

    # Passage is everything before first question
    first_m = matches[0]
    passage_text = text[:first_m.start()].strip()

    # Clean passage title
    passage_title = "Comprehension Passage"
    title_match = re.match(r'^(PASSAGE\s+\d+|Paragraph\s+\d+|COMPREHENSION\s+\d+)', passage_text, re.IGNORECASE)
    if title_match:
        passage_title = title_match.group(1).upper()
        passage_text = passage_text[len(passage_title):].strip()

    # Extract subquestion raw chunks
    sub_chunks = []
    for i in range(len(matches)):
        m = matches[i]
        q_num = m.group(1) or m.group(2)
        start_pos = m.end()
        end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start_pos:end_pos].strip()
        sub_chunks.append((q_num, chunk))

    # Parse JSON answers if dict
    ans_map = {}
    if isinstance(default_ans, str) and default_ans.strip().startswith("{"):
        try:
            ans_map = json.loads(default_ans)
        except Exception:
            pass

    results = []
    total_subs = len(sub_chunks)

    for idx, (q_num, chunk) in enumerate(sub_chunks):
        sub_id = f"{qid}_q{idx + 1}"

        # Locate option markers (a), (b), (c), (d) or (A), (B), (C), (D) or (1), (2), (3), (4)
        opt_pattern = re.compile(
            r'(?:^|[\s\t\n]+)(?:\(([a-dA-D1-4])\)|([a-dA-D])\.)\s+'
        )
        opt_matches = list(opt_pattern.finditer(chunk))

        if len(opt_matches) >= 2:
            q_stem = chunk[:opt_matches[0].start()].strip()
            parsed_opts = []
            for j in range(len(opt_matches)):
                opt_m = opt_matches[j]
                key_raw = (opt_m.group(1) or opt_m.group(2)).upper()
                num_map = {'1': 'A', '2': 'B', '3': 'C', '4': 'D'}
                key = num_map.get(key_raw, key_raw)

                opt_start = opt_m.end()
                opt_end = opt_matches[j + 1].start() if j + 1 < len(opt_matches) else len(chunk)
                opt_text = chunk[opt_start:opt_end].strip()
                opt_text = re.sub(r'\s+', ' ', opt_text)
                parsed_opts.append({"key": key, "text": opt_text})
        else:
            q_stem = chunk
            parsed_opts = options_json or []

        # Determine correct answer for this subquestion
        sub_ans = "A"
        if str(q_num) in ans_map:
            sub_ans = str(ans_map[str(q_num)]).upper()
        elif str(idx + 1) in ans_map:
            sub_ans = str(ans_map[str(idx + 1)]).upper()
        elif isinstance(default_ans, str) and not default_ans.startswith("{") and len(default_ans.strip()) <= 3:
            sub_ans = default_ans.strip().upper()

        results.append({
            "id": sub_id,
            "subject": subj,
            "unit": unit or "General",
            "chapter": chap,
            "question_type": "COMPREHENSION",
            "text": q_stem,
            "options": parsed_opts,
            "correct_answer": sub_ans,
            "solution_text": sol_text or f"Detailed step-by-step reasoning for Sub-question {idx + 1}.",
            "passage_id": qid,
            "passage_title": passage_title,
            "passage_text": passage_text,
            "subquestion_index": idx + 1,
            "subquestion_total": total_subs,
            "elo_rating": elo or 1500,
            "difficulty_tier": diff or "MEDIUM"
        })

    return results


def migrate_comprehension_questions(cursor: sqlite3.Cursor) -> int:
    """
    Scans the questions database, finds legacy lumped COMPREHENSION questions,
    unpacks them into individual contiguous subquestions, and updates SQLite.
    Returns the count of new subquestions created.
    """
    # 1. Check/Add required columns
    cursor.execute("PRAGMA table_info(questions)")
    cols = [r[1] for r in cursor.fetchall()]
    if "passage_id" not in cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN passage_id TEXT")
    if "passage_title" not in cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN passage_title TEXT")
    if "passage_text" not in cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN passage_text TEXT")
    if "subquestion_index" not in cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN subquestion_index INTEGER DEFAULT 1")
    if "subquestion_total" not in cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN subquestion_total INTEGER DEFAULT 1")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_questions_passage_id ON questions(passage_id)")

    # 2. Select legacy unparsed comprehension questions
    cursor.execute("""
        SELECT id, subject, unit, chapter, text, options, correct_answer, solution_text,
               elo_rating, difficulty_tier, has_diagram, diagram_urls, key_formulas, common_pitfall
        FROM questions
        WHERE question_type = 'COMPREHENSION'
          AND (passage_id IS NULL OR passage_id = '')
    """)
    legacy_rows = cursor.fetchall()
    if not legacy_rows:
        return 0

    created_count = 0

    for r in legacy_rows:
        (qid, subj, unit, chap, text, opts, ans, sol,
         elo, diff, has_diag, diag_urls, key_forms, pitfall) = r

        raw_opts = []
        if opts and opts != '[]':
            try:
                raw_opts = json.loads(opts) if isinstance(opts, str) else opts
            except Exception:
                pass

        unpacked = parse_single_comprehension(
            qid, subj, unit, chap, text, ans, raw_opts, sol, elo, diff
        )

        if not unpacked:
            continue

        # If it unpacked into multiple subquestions, insert each subquestion
        for sub_q in unpacked:
            cursor.execute("""
                INSERT OR REPLACE INTO questions (
                    id, subject, unit, chapter, question_type, text, options,
                    has_diagram, diagram_urls, correct_answer, solution_text,
                    key_formulas, common_pitfall, difficulty_tier, elo_rating,
                    passage_id, passage_title, passage_text, subquestion_index, subquestion_total,
                    validation_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDATED')
            """, (
                sub_q["id"],
                sub_q["subject"],
                sub_q["unit"],
                sub_q["chapter"],
                "COMPREHENSION",
                sub_q["text"],
                json.dumps(sub_q["options"]),
                has_diag or 0,
                diag_urls or "[]",
                sub_q["correct_answer"],
                sub_q["solution_text"],
                key_forms or "[]",
                pitfall or "",
                sub_q["difficulty_tier"],
                sub_q["elo_rating"],
                sub_q["passage_id"],
                sub_q["passage_title"],
                sub_q["passage_text"],
                sub_q["subquestion_index"],
                sub_q["subquestion_total"]
            ))
            created_count += 1

        # Mark parent legacy row as SUPERSEDED so it is never served as a lumped block
        cursor.execute("""
            UPDATE questions
            SET validation_status = 'SUPERSEDED_BY_SUBQUESTIONS'
            WHERE id = ?
        """, (qid,))

    return created_count


def get_passage_siblings(cursor: sqlite3.Cursor, passage_id: str) -> List[Dict[str, Any]]:
    """
    Returns all subquestions belonging to a specific passage, ordered by subquestion_index.
    """
    cursor.execute("""
        SELECT * FROM questions
        WHERE passage_id = ?
          AND (validation_status IS NULL OR validation_status != 'QUARANTINED')
          AND validation_status != 'SUPERSEDED_BY_SUBQUESTIONS'
        ORDER BY subquestion_index ASC
    """, (passage_id,))
    return [dict(r) for r in cursor.fetchall()]
