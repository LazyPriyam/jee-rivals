"""
sync_solution_keys.py - Solution Derivation Key Extractor & Sanitizer

Extracts conclusive answer keys directly from step-by-step mathematical derivations,
reconciles them with the official/stored answer keys, and sanitizes derivations by
eradicating internal AI monologues ("Wait!...", "Hold on...", and preliminary key debates).
"""

import os
import sys
import shutil
import sqlite3
import argparse
import datetime
import json
import re
from typing import Optional, Dict, Any, Tuple, List

# Ensure UTF-8 output on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def normalize_to_options(raw_ans: str, options_json: Optional[str]) -> str:
    """
    Normalizes an extracted answer (e.g. '1', 'B', '(3)') to match the
    option labeling scheme ('A'-'D' vs '1'-'4') of the question options.
    """
    if not raw_ans:
        return raw_ans

    clean = str(raw_ans).strip().strip("().,[]\"'*$ ")
    digit_to_letter = {"1": "A", "2": "B", "3": "C", "4": "D"}
    letter_to_digit = {"A": "1", "B": "2", "C": "3", "D": "4"}

    if options_json:
        try:
            opts = json.loads(options_json)
            opt_keys = [str(o.get("key", "")).strip().upper() for o in opts if o.get("key")]
            if opt_keys:
                clean_upper = clean.upper()
                if clean_upper in opt_keys:
                    return clean_upper
                # If clean is a digit (e.g. '2') but options are letters ('A','B','C','D')
                if clean_upper in digit_to_letter and digit_to_letter[clean_upper] in opt_keys:
                    return digit_to_letter[clean_upper]
                # If clean is a letter (e.g. 'B') but options are digits ('1','2','3','4')
                if clean_upper in letter_to_digit and letter_to_digit[clean_upper] in opt_keys:
                    return letter_to_digit[clean_upper]
        except Exception:
            pass

    return clean


def extract_derived_key(
    solution_text: str,
    question_type: str = "SINGLE_CHOICE",
    options_json: Optional[str] = None
) -> Optional[str]:
    """
    Extracts the conclusive derived answer from the end of the solution derivation.
    Supports Single Choice, Multiple Choice, and Numerical formats.
    """
    if not solution_text:
        return None

    sol = solution_text.replace("\\n", "\n").strip()

    # 1. Primary Single Choice explicit conclusion patterns
    opt_pats = [
        # "Thus, the correct answer is option (B)" / "Thus, the correct answer is (B)" / \textbf{B} / \boxed{B}
        r"(?:Thus|Hence|Therefore|So|Accordingly)\s*,?\s*(?:the\s+)?(?:correct\s+)?(?:answer|choice|option)\s*(?:is\s*)?:?\s*(?:option\s*)?[\\*\[\(\s]*(?:textbf\{|boxed\{)?([A-D1-4])(?:\}|[\\*\]\)\.,\s]|$)",
        # "The appropriate choice is option (3)"
        r"(?:appropriate|correct|valid|right)\s+(?:choice|option|answer)\s+is\s+(?:option\s*)?[\\*\[\(\s]*(?:textbf\{|boxed\{)?([A-D1-4])(?:\}|[\\*\]\)\.,\s]|$)",
        # "Option (2) is the correct answer"
        r"options?\s*[\(\[]?([A-D1-4])[\)\]]?\s*is\s*(?:the\s+)?(?:correct|appropriate|right|the\s+answer)",
        # "Final Answer: B" or "Ans: (3)"
        r"(?:Final\s+Answer|Ans|Correct\s+Answer)\s*:?\s*[\\*\[\(\s]*(?:textbf\{|boxed\{)?([A-D1-4])(?:\}|[\\*\]\)\.,\s]|$)",
        # "\boxed{A}"
        r"\\boxed\{\s*(?:\\text\{)?([A-D1-4])\s*\}",
    ]

    for pat in opt_pats:
        matches = list(re.finditer(pat, sol, re.IGNORECASE))
        if matches:
            raw_key = matches[-1].group(1).upper()
            return normalize_to_options(raw_key, options_json)

    # 1b. Fallback: Check tail for explicit option reference e.g. "Thus, the correct answer is 7 (option 1)."
    tail = sol[-250:] if len(sol) > 250 else sol
    fallback_m = list(re.finditer(r"\(\s*option\s*([A-D1-4])\s*\)", tail, re.IGNORECASE))
    if fallback_m:
        raw_key = fallback_m[-1].group(1).upper()
        return normalize_to_options(raw_key, options_json)

    # 2. Numerical / Integer questions
    if question_type in ("NUMERICAL", "INTEGER") or not options_json:
        num_pats = [
            r"(?:Thus|Hence|Therefore|So)\s*,?\s*(?:the\s+)?(?:correct\s+)?(?:answer|value)\s*(?:is|=)\s*:?\s*[\$]?\\?(?:boxed\{)?([+-]?\d+(?:\.\d+)?)\}?",
            r"(?:value\s+of\s+[a-zA-Z]\s+is|required\s+value\s+is|rounded\s+off\s+to\s+the\s+nearest\s+integer\s+is)\s*:?\s*[\$]?\\?(?:boxed\{)?([+-]?\d+(?:\.\d+)?)\}?",
            r"\\boxed\{\s*([+-]?\d+(?:\.\d+)?)\s*\}",
            r"(?:Final\s+Answer|Ans)\s*:?\s*[\$]?\\?(?:boxed\{)?([+-]?\d+(?:\.\d+)?)\}?",
        ]
        for pat in num_pats:
            matches = list(re.finditer(pat, sol, re.IGNORECASE))
            if matches:
                return matches[-1].group(1)

    return None


def clean_derivation_text(text: str) -> str:
    """
    Re-decorates and sanitizes a solution derivation:
    - Normalizes literal \\n escapes to real newlines.
    - Purges prompt leakage (e.g. 'Official / Preliminary Key Printed on Document: ...').
    - Removes internal AI reasoning monologues ('Wait!...', 'Hold on...', debates over document keys).
    - Removes conversational mid-sentence interruptions (' - wait, atomic radius increases...').
    - Consolidates duplicated or repetitive concluding sentences into a crisp mathematical conclusion.
    """
    if not text:
        return text

    # Step 1: Normalize literal newline escapes
    text = text.replace("\\n", "\n")

    # Step 2: Strip prompt injection artifacts & leaked metadata
    text = re.sub(r"Official\s*/\s*Preliminary\s*Key\s*Printed\s*on\s*Document\s*:\s*[^\n\.]+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"Let\'?s\s*set\s*derived_answer\s*to\s*[\"'][^\"']*[\"']\.?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"In\s+competitive\s+exam\s+portals,\s+we\s+must\s+output\s+the\s+official\s+key[^\.\n]*\.?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"In\s+JEE\s+official\s+papers,\s+printing\s+errors\s+in\s+preliminary\s+keys\s+do\s+occur[^\.\n]*\.?", "", text, flags=re.IGNORECASE)

    # Step 3: Remove parenthetical and bracketed conversational remarks
    text = re.sub(r"\(\s*(?:Wait|wait|Hold on|hold on)[^\)]*?\)", "", text)
    text = re.sub(r"\[\s*(?:Wait|wait|Hold on|hold on)[^\]]*?\]", "", text)

    # Step 4: Process line by line and sentence by sentence
    paragraphs = text.split("\n")
    cleaned_paras: List[str] = []

    for para in paragraphs:
        if not para.strip():
            cleaned_paras.append("")
            continue

        sentences = re.split(r"(?<=[.!?])\s+", para)
        kept_sentences: List[str] = []

        for s in sentences:
            s_stripped = s.strip()
            s_lower = s_stripped.lower()

            # Discard sentences debating or second-guessing the official/preliminary key
            if any(term in s_lower for term in [
                "official key", "preliminary key", "printed key",
                "authoritative key", "document key", "official answer key"
            ]):
                # If it's a conclusion sentence, simplify it directly
                m_concl = re.search(r"(?:thus|hence|therefore|so)\s*,?.*?(?:option\s*)?[\(\[]?([A-D1-4])[\)\]]?", s_stripped, re.IGNORECASE)
                if m_concl and ("correct" in s_lower or "answer" in s_lower):
                    s_stripped = f"Thus, the correct answer is ({m_concl.group(1)})."
                else:
                    # Pure debate sentence, discard
                    continue

            # Discard internal monologue sentences opening with "Wait, let's re-verify..."
            if re.match(r"^(?:Wait|Hold on)\s*,?\s*(?:let[\'’]?s|let us)?\s*(?:re-?read|re-?verify|re-?check|re-?evaluate|re-examine|re-count|check|see if)\b", s_stripped, re.IGNORECASE):
                if any(x in s_lower for x in ["official key", "question prompt", "options and", "misprint", "typo in", "textbook formula", "options carefully"]):
                    continue
                else:
                    # Strip the leading conversational marker, keep the mathematical examination
                    s_stripped = re.sub(r"^(?:Wait|Hold on)\s*,?\s*", "", s_stripped, flags=re.IGNORECASE)
                    if s_stripped:
                        s_stripped = s_stripped[:1].upper() + s_stripped[1:]

            # Discard rhetorical self-questions
            if re.match(r"^(?:Wait,?\s*)?(?:why would|could the question|is there any case|let us check another combination)\b", s_stripped, re.IGNORECASE):
                continue

            # Strip leading "Wait, " / "Wait! " / "Hold on, "
            s_stripped = re.sub(r"^(?:Wait|Hold on)\s*[,!]\s*", "", s_stripped, flags=re.IGNORECASE)
            s_stripped = re.sub(r"^Yes,\s*", "", s_stripped, flags=re.IGNORECASE)
            if s_stripped:
                s_stripped = s_stripped[:1].upper() + s_stripped[1:]

            # Remove mid-sentence conversational dashes and interjections
            s_stripped = re.sub(r"\s*-\s*wait,?\s+[^,;\.\n]+", "", s_stripped, flags=re.IGNORECASE)
            s_stripped = re.sub(r",\s*wait,?\s+[^,;\.\n]+", "", s_stripped, flags=re.IGNORECASE)
            s_stripped = re.sub(r"\bwait,?\s*", "", s_stripped, flags=re.IGNORECASE)

            if s_stripped.strip():
                kept_sentences.append(s_stripped.strip())

        cleaned_paras.append(" ".join(kept_sentences))

    text = "\n".join(cleaned_paras)

    # Step 5: Clean duplicate or redundant trailing conclusions
    concl_pats = list(re.finditer(
        r"(?:Thus|Hence|Therefore|So)\s*,?\s*(?:the\s+)?(?:correct\s+)?(?:answer|choice|option)\s*(?:is\s*)?:?\s*(?:option\s*)?[\(\[]?([A-D1-4])[\)\]]?(?:\.|\s|$)",
        text,
        re.IGNORECASE
    ))
    if len(concl_pats) > 1:
        last_m = concl_pats[-1]
        for m in reversed(concl_pats[:-1]):
            text = text[:m.start()] + text[m.end():]

    # Step 6: Punctuation and whitespace polish
    text = re.sub(r"\.{2,}", ".", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    text = re.sub(r"\s+\.", ".", text)

    return text.strip()


def backup_database(db_path: str) -> str:
    """Creates a timestamped copy of the database before making modifications."""
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{db_path}.{timestamp}.bak"
    shutil.copy2(db_path, backup_path)
    return backup_path


def sync_database_keys(
    db_path: str,
    dry_run: bool = False,
    clean_derivations: bool = True,
    sync_keys: bool = True
) -> Dict[str, Any]:
    """
    Scans a SQLite question database, extracts conclusive derived keys,
    sanitizes derivation text, and writes updates.
    """
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database not found at: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # Determine available columns
    c.execute("PRAGMA table_info(questions)")
    columns = {r["name"] for r in c.fetchall()}

    has_options = "options" in columns
    has_solution = "solution_text" in columns
    has_flags = "validation_flags" in columns

    if not has_solution:
        conn.close()
        raise ValueError(f"Table 'questions' in {db_path} does not have 'solution_text' column.")

    select_cols = ["id", "question_type", "correct_answer", "solution_text"]
    if has_options:
        select_cols.append("options")
    if has_flags:
        select_cols.append("validation_flags")

    c.execute(f"SELECT {', '.join(select_cols)} FROM questions WHERE solution_text IS NOT NULL AND length(solution_text) > 10")
    rows = c.fetchall()

    metrics = {
        "total_analyzed": len(rows),
        "keys_extracted": 0,
        "keys_updated": 0,
        "discrepancies_corrected": 0,
        "initial_wait_occurrences": 0,
        "derivations_cleaned": 0,
        "remaining_wait_occurrences": 0,
        "sample_updates": []
    }

    updates = []

    for r in rows:
        qid = r["id"]
        qtype = r["question_type"]
        cur_ans = str(r["correct_answer"] or "").strip()
        sol_text = r["solution_text"] or ""
        opts_json = r["options"] if has_options else None
        cur_flags = r["validation_flags"] if has_flags else None

        if "wait" in sol_text.lower():
            metrics["initial_wait_occurrences"] += 1

        # 1. Clean derivation
        new_sol = clean_derivation_text(sol_text) if clean_derivations else sol_text
        if new_sol != sol_text:
            metrics["derivations_cleaned"] += 1

        if "wait" in new_sol.lower():
            metrics["remaining_wait_occurrences"] += 1

        # 2. Extract derived key
        derived_key = extract_derived_key(new_sol, qtype, opts_json)
        new_ans = cur_ans

        if derived_key:
            metrics["keys_extracted"] += 1
            cur_norm = normalize_to_options(cur_ans.upper(), opts_json)
            der_norm = normalize_to_options(derived_key.upper(), opts_json)

            if sync_keys and der_norm and der_norm != cur_norm:
                metrics["discrepancies_corrected"] += 1
                new_ans = der_norm
                if len(metrics["sample_updates"]) < 10:
                    metrics["sample_updates"].append({
                        "id": qid[:8],
                        "type": qtype,
                        "old_answer": cur_ans,
                        "new_answer": new_ans,
                        "snippet": new_sol[-150:].replace("\n", " ")
                    })

        # Check if database update is required
        needs_update = (new_sol != sol_text) or (new_ans != cur_ans)
        if needs_update:
            if has_flags:
                # Update flags if discrepancy corrected
                flag_list = []
                if cur_flags:
                    try:
                        flag_list = json.loads(cur_flags) if cur_flags.startswith("[") else [cur_flags]
                    except Exception:
                        flag_list = [cur_flags]
                if new_ans != cur_ans:
                    flag_list.append("key_synced_from_derivation")
                flag_str = json.dumps(list(dict.fromkeys(flag_list)))
                updates.append((new_ans, new_sol, flag_str, qid))
            else:
                updates.append((new_ans, new_sol, qid))

    metrics["keys_updated"] = len(updates)

    if not dry_run and updates:
        # Create automatic backup before writing
        backup_file = backup_database(db_path)
        metrics["backup_file"] = backup_file

        if has_flags:
            c.executemany("UPDATE questions SET correct_answer = ?, solution_text = ?, validation_flags = ? WHERE id = ?", updates)
        else:
            c.executemany("UPDATE questions SET correct_answer = ?, solution_text = ? WHERE id = ?", updates)

        conn.commit()

    conn.close()
    return metrics


def main():
    parser = argparse.ArgumentParser(
        description="Extract and synchronize official keys from solution derivations and sanitize derivations."
    )
    parser.add_argument(
        "--db",
        type=str,
        default=os.path.join(os.path.dirname(__file__), "..", "..", "storage", "rivals.db"),
        help="Path to SQLite database file (default: backend/storage/rivals.db)"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist changes to SQLite database with automatic backup (default is dry-run mode)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate changes without modifying the database file"
    )
    parser.add_argument(
        "--clean-only",
        action="store_true",
        help="Only clean derivation texts without modifying correct_answer keys"
    )
    parser.add_argument(
        "--sync-only",
        action="store_true",
        help="Only synchronize correct_answer keys without re-decorating derivations"
    )

    args = parser.parse_args()
    db_path = os.path.abspath(args.db)

    # Determine execution mode
    is_dry_run = not args.apply or args.dry_run
    do_clean = not args.sync_only
    do_sync = not args.clean_only

    print("=" * 70)
    print("  JEE RIVALS - SOLUTION KEY SYNCHRONIZER & DERIVATION SANITIZER")
    print("=" * 70)
    print(f"Target Database : {db_path}")
    print(f"Execution Mode  : {'DRY RUN (Preview Only)' if is_dry_run else 'APPLY (Writing changes with backup)'}")
    print(f"Actions         : Clean Derivations = {do_clean} | Sync Keys = {do_sync}")
    print("-" * 70)

    try:
        metrics = sync_database_keys(
            db_path=db_path,
            dry_run=is_dry_run,
            clean_derivations=do_clean,
            sync_keys=do_sync
        )

        print(f"Total Questions Analyzed    : {metrics['total_analyzed']}")
        print(f"Derived Keys Extracted      : {metrics['keys_extracted']} ({metrics['keys_extracted']/max(1, metrics['total_analyzed'])*100:.1f}%)")
        print(f"Key Discrepancies Corrected : {metrics['discrepancies_corrected']}")
        print(f"Derivations Sanitized       : {metrics['derivations_cleaned']}")
        print(f"Initial 'Wait!' Monologues  : {metrics['initial_wait_occurrences']}")
        print(f"Remaining 'Wait!' Tokens    : {metrics['remaining_wait_occurrences']}")
        print(f"Total Database Rows Updated : {metrics['keys_updated']}")

        if not is_dry_run and "backup_file" in metrics:
            print(f"Backup Created At           : {metrics['backup_file']}")

        if metrics["sample_updates"]:
            print("\nSample Key Corrections:")
            for item in metrics["sample_updates"][:5]:
                print(f"  • Q#{item['id']} ({item['type']}): '{item['old_answer']}' -> '{item['new_answer']}'")
                print(f"    Tail: {item['snippet']}")

        print("=" * 70)
        if is_dry_run:
            print("[INFO] Dry run complete. To persist these changes to the database, run with --apply")
        else:
            print("[SUCCESS] All changes successfully applied and persisted!")
        print("=" * 70)

    except Exception as e:
        print(f"[ERROR] Failed to synchronize keys: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
