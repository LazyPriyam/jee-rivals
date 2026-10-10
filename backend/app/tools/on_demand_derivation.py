import os
import json
import requests
from pathlib import Path
from typing import Optional, Dict, Any

from backend.app.database import get_connection

# Load .env if present
try:
    from dotenv import load_dotenv
    # Check current directory and parent directory
    load_dotenv()
    if not os.getenv("GEMINI_API_KEY"):
        parent_env = Path(__file__).resolve().parent.parent.parent.parent / "JEE Test Taker" / ".env"
        if parent_env.exists():
            load_dotenv(parent_env)
except Exception:
    pass

GEMINI_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
]

def clean_escapes(val: Optional[str]) -> Optional[str]:
    if not val:
        return val
    # Normalize common backslash artifacts
    return val.replace('\\\\$', '$').replace('\\\\(', '(').replace('\\\\)', ')')

def derive_question_on_demand(question_id: str, force: bool = False) -> Dict[str, Any]:
    """
    Generates a high-precision, step-by-step mathematical derivation for a specific question on demand.
    Anchors strictly to the question's verified official answer key to eliminate hallucinated contradictions.
    Caches the resulting derivation into the database for instant retrieval.
    """
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Question '{question_id}' not found.")

    q = dict(row)
    official_key = str(q.get("correct_answer") or "").strip()
    existing_sol = q.get("solution_text")

    # If cached derivation exists and force is False, return cached result immediately
    if not force and existing_sol and existing_sol.strip():
        raw_formulas = q.get("key_formulas")
        try:
            formulas = json.loads(raw_formulas) if isinstance(raw_formulas, str) else (raw_formulas or [])
        except Exception:
            formulas = []
        conn.close()
        return {
            "id": question_id,
            "correct_answer": official_key,
            "solution_text": clean_escapes(existing_sol),
            "key_formulas": formulas,
            "common_pitfall": clean_escapes(q.get("common_pitfall")),
            "derived_on_demand": True,
            "provider": "cached"
        }

    q_text = q.get("text") or ""
    subj = q.get("subject") or "General"
    chap = q.get("chapter") or "General"
    q_type = q.get("question_type") or "SINGLE_CHOICE"

    # Parse options if any
    raw_options = q.get("options")
    options_list = []
    try:
        options_list = json.loads(raw_options) if isinstance(raw_options, str) else (raw_options or [])
    except Exception:
        options_list = []

    formatted_options = ""
    if options_list:
        lines = []
        for opt in options_list:
            if isinstance(opt, dict):
                lines.append(f"({opt.get('key', '')}) {opt.get('text', '')}")
            else:
                lines.append(str(opt))
        formatted_options = "\n".join(lines)

    candidate_keys = [k for k in [os.getenv("GEMINI_API_KEY_2"), os.getenv("GEMINI_API_KEY")] if k]

    # Construct prompt anchored to official ground truth key
    system_prompt = (
        "You are an elite IIT JEE Senior Faculty member and problem solver. "
        "Your task is to provide a comprehensive, 100% rigorous, step-by-step mathematical and conceptual derivation for this JEE problem.\n\n"
        f"QUESTION SPECIFICATION:\n"
        f"Subject: {subj}\n"
        f"Chapter: {chap}\n"
        f"Question Type: {q_type}\n"
        f"Verified Official Answer Key: {official_key}\n\n"
        f"Question Statement:\n{q_text}\n"
    )
    if formatted_options:
        system_prompt += f"\nOptions:\n{formatted_options}\n"

    system_prompt += (
        "\nCRITICAL REASONING & ACCURACY INSTRUCTIONS:\n"
        f"1. The verified official answer key is '{official_key}'. Your derivation MUST rigorously explain and prove this exact answer.\n"
        "2. Break your derivation down into:\n"
        "   - **Core Governing Laws & Principles**: State the fundamental physics/chemistry/math principles, theorems, or formulas applied.\n"
        "   - **Step-by-Step Derivation & Calculations**: Show every intermediate step, algebraic manipulation, substitution of values, and units clearly in LaTeX format ($...$ for inline, $$...$$ for display blocks).\n"
        f"   - **Conclusion**: Explain why option/value '{official_key}' is correct (and why common alternative distractors are incorrect if applicable). Conclude clearly: **Thus, the correct answer is {official_key}.**\n"
        "3. Extract 1 to 3 'key_formulas' in LaTeX (e.g. ['$\\\\Delta U = n C_v \\\\Delta T$']).\n"
        "4. Provide a 1-sentence 'common_pitfall' identifying where aspirants commonly make careless calculation mistakes, sign errors, or flawed assumptions.\n\n"
        "Respond strictly with valid JSON with this exact schema:\n"
        "{\n"
        "  \"solution_text\": \"<Full LaTeX Markdown derivation>\",\n"
        "  \"key_formulas\": [\"<formula1>\", \"<formula2>\"],\n"
        "  \"common_pitfall\": \"<1 sentence trap explanation>\"\n"
        "}"
    )

    payload = {
        "contents": [{"parts": [{"text": system_prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json"
        }
    }

    candidate_keys = [k for k in [os.getenv("GEMINI_API_KEY_2"), os.getenv("GEMINI_API_KEY")] if k]
    if not candidate_keys:
        conn.close()
        fallback_sol = (
            f"**Official Verified Key:** `{official_key}`\n\n"
            f"*On-Demand AI Derivation service is currently awaiting API key configuration.* "
            f"Please verify your `GEMINI_API_KEY` in settings."
        )
        return {
            "id": question_id,
            "correct_answer": official_key,
            "solution_text": fallback_sol,
            "key_formulas": [],
            "common_pitfall": "Always verify units and coordinate signs before substituting.",
            "derived_on_demand": True,
            "provider": "offline_fallback"
        }

    derived_solution = None
    derived_formulas = []
    derived_pitfall = None
    provider_used = "gemini"

    for current_key in candidate_keys:
        if derived_solution:
            break
        for model in GEMINI_MODELS:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={current_key}"
                resp = requests.post(url, json=payload, timeout=25)
                if resp.status_code == 200:
                    data = resp.json()
                    cand = data.get("candidates", [{}])[0]
                    text_out = cand.get("content", {}).get("parts", [{}])[0].get("text", "")
                    if text_out:
                        parsed = json.loads(text_out)
                        derived_solution = parsed.get("solution_text")
                        derived_formulas = parsed.get("key_formulas") or []
                        derived_pitfall = parsed.get("common_pitfall")
                        provider_used = f"gemini/{model}"
                        break
            except Exception:
                continue

    if not derived_solution:
        conn.close()
        return {
            "id": question_id,
            "correct_answer": official_key,
            "solution_text": f"**Official Verified Answer:** `{official_key}`\n\n*(Derivation generation timed out. Please try again in a few moments.)*",
            "key_formulas": [],
            "common_pitfall": "Double check algebra and unit conversions.",
            "derived_on_demand": True,
            "provider": "timeout_fallback"
        }

    # Save to database cache
    try:
        formulas_json = json.dumps(derived_formulas)
        c.execute(
            "UPDATE questions SET solution_text = ?, key_formulas = ?, common_pitfall = ? WHERE id = ?",
            (derived_solution, formulas_json, derived_pitfall, question_id)
        )
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()

    return {
        "id": question_id,
        "correct_answer": official_key,
        "solution_text": clean_escapes(derived_solution),
        "key_formulas": derived_formulas,
        "common_pitfall": clean_escapes(derived_pitfall),
        "derived_on_demand": True,
        "provider": provider_used
    }
