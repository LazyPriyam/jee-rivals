import base64
import json
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException, Header, status
from pydantic import BaseModel

from backend.app.config import ADMIN_SYNC_TOKEN, DIAGRAMS_DIR
from backend.app.database import get_connection

router = APIRouter(prefix="/api/admin", tags=["Admin & Cloud Sync"])

class SyncPayload(BaseModel):
    questions: List[Dict[str, Any]]
    diagrams: Optional[Dict[str, str]] = {}  # filename -> base64 string


@router.post("/sync")
def sync_data(payload: SyncPayload, x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    # 1. Unpack diagram images
    saved_diagrams = 0
    if payload.diagrams:
        for filename, b64_str in payload.diagrams.items():
            try:
                # Remove header prefix if present (e.g. data:image/png;base64,...)
                if "," in b64_str:
                    b64_str = b64_str.split(",", 1)[1]
                data = base64.b64decode(b64_str)
                target_path = DIAGRAMS_DIR / filename
                with open(target_path, "wb") as f:
                    f.write(data)
                saved_diagrams += 1
            except Exception as e:
                print(f"[SYNC] Error unpacking diagram {filename}: {e}")

    # 2. Upsert questions into database
    conn = get_connection()
    c = conn.cursor()
    saved_questions = 0

    for q in payload.questions:
        try:
            q_id = q["id"]
            subject = q.get("subject", "Physics")
            unit = q.get("unit", "")
            chapter = q.get("chapter", "General")
            q_type = q.get("question_type", "MCQ")
            text = q.get("text", "")

            # Ensure options are stringified JSON
            raw_options = q.get("options", [])
            options_str = raw_options if isinstance(raw_options, str) else json.dumps(raw_options)

            has_diag = 1 if q.get("has_diagram") else 0
            raw_urls = q.get("diagram_urls", [])
            urls_str = raw_urls if isinstance(raw_urls, str) else json.dumps(raw_urls)

            correct_ans = str(q.get("correct_answer", "")).strip()
            sol_text = q.get("solution_text", "")

            # Sanitize derivation and reconcile key if derivation concluded differently
            if sol_text:
                from app.tools.sync_solution_keys import clean_derivation_text, extract_derived_key, normalize_to_options
                sol_text = clean_derivation_text(sol_text)
                derived_key = extract_derived_key(sol_text, q_type, options_str)
                if derived_key:
                    der_norm = normalize_to_options(derived_key.upper(), options_str)
                    cur_norm = normalize_to_options(correct_ans.upper(), options_str)
                    if der_norm and der_norm != cur_norm:
                        correct_ans = der_norm

            raw_formulas = q.get("key_formulas", [])
            formulas_str = raw_formulas if isinstance(raw_formulas, str) else json.dumps(raw_formulas)

            common_pitfall = q.get("common_pitfall", "")
            diff = q.get("difficulty_tier", "MEDIUM")
            target_exam = q.get("target_exam", "JEE_MAIN")
            raw_elo = q.get("elo_rating")
            if raw_elo and int(raw_elo) not in (1350, 1500, 1850):
                elo = int(raw_elo)
            else:
                from backend.app.tools.elo_engine import compute_seed_elo
                elo = compute_seed_elo(q_id, target_exam, diff, q_type)

            c.execute("""
                INSERT INTO questions (
                    id, subject, unit, chapter, question_type, text, options,
                    has_diagram, diagram_urls, correct_answer, solution_text,
                    key_formulas, common_pitfall, difficulty_tier, elo_rating
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    subject = excluded.subject,
                    unit = excluded.unit,
                    chapter = excluded.chapter,
                    question_type = excluded.question_type,
                    text = excluded.text,
                    options = excluded.options,
                    has_diagram = excluded.has_diagram,
                    diagram_urls = excluded.diagram_urls,
                    correct_answer = excluded.correct_answer,
                    solution_text = excluded.solution_text,
                    key_formulas = excluded.key_formulas,
                    common_pitfall = excluded.common_pitfall,
                    difficulty_tier = excluded.difficulty_tier,
                    elo_rating = excluded.elo_rating
            """, (
                q_id, subject, unit, chapter, q_type, text, options_str,
                has_diag, urls_str, correct_ans, sol_text,
                formulas_str, common_pitfall, diff, elo
            ))
            saved_questions += 1
        except Exception as e:
            print(f"[SYNC] Error upserting question {q.get('id')}: {e}")

    conn.commit()
    conn.close()

    return {
        "success": True,
        "synced_questions": saved_questions,
        "synced_diagrams": saved_diagrams
    }
