import json
import datetime
import random
import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Depends

from backend.app.models import QuestionOut, QuestionSolutionOut, QuestionOptionModel, QuestionReportRequest
from backend.app.database import get_connection
from backend.app.auth import get_current_user, get_optional_user

import re

LATEX_N_CMDS = {
    'eq', 'e', 'abla', 'atural', 'earrow', 'eg', 'otin', 'ot', 'u', 'warrow', 'ewline', 'orm',
    'ull', 'exists', 'subseteq', 'supseteq', 'parallel', 'less', 'gtr', 'leq', 'geq', 'sim', 'cong'
}

def clean_escapes(text: str) -> str:
    if not text:
        return text
    text = text.replace('\\r\\n', '\n').replace('\r\n', '\n')
    def repl_n(m):
        full = m.group(0)
        after = m.group(1)
        if after.lower() in LATEX_N_CMDS:
            return full
        return '\n' + after
    text = re.sub(r'\\{1,2}n([a-zA-Z]*)', repl_n, text)
    text = re.sub(r"\\{1,2}'", "'", text)
    text = re.sub(r'\\{1,2}"', '"', text)
    return text

router = APIRouter(prefix="/api/questions", tags=["Questions"])

def row_to_question_out(row: dict) -> QuestionOut:
    raw_opts = row.get("options")
    try:
        opts_data = json.loads(raw_opts) if isinstance(raw_opts, str) else (raw_opts or [])
    except Exception:
        opts_data = []

    options = [QuestionOptionModel(key=o.get("key", ""), text=clean_escapes(o.get("text", ""))) for o in opts_data]

    raw_urls = row.get("diagram_urls")
    try:
        urls = json.loads(raw_urls) if isinstance(raw_urls, str) else (raw_urls or [])
    except Exception:
        urls = []

    from pathlib import Path
    clean_urls = []
    for u in urls:
        if u:
            u_str = str(u)
            if u_str.startswith("/diagrams/") or u_str.startswith("http://") or u_str.startswith("https://"):
                clean_urls.append(u_str)
            else:
                fn = Path(u_str.replace("\\", "/")).name
                clean_urls.append(f"/diagrams/{fn}")

    passage_text_clean = clean_escapes(row.get("passage_text")) if row.get("passage_text") else None
    is_comp = bool(passage_text_clean or row.get("passage_id") or (row.get("question_type") and row.get("question_type").upper() == "COMPREHENSION"))

    return QuestionOut(
        id=row["id"],
        subject=row["subject"],
        unit=row["unit"],
        chapter=row["chapter"],
        question_type=row["question_type"],
        text=clean_escapes(row["text"]),
        options=options,
        has_diagram=bool(row.get("has_diagram")),
        diagram_urls=clean_urls,
        difficulty_tier=row.get("difficulty_tier", "MEDIUM"),
        elo_rating=row.get("elo_rating", 1500),
        passage_id=row.get("passage_id"),
        passage_title=row.get("passage_title") or ("Comprehension Passage" if is_comp else None),
        passage_text=passage_text_clean,
        subquestion_index=row.get("subquestion_index"),
        subquestion_total=row.get("subquestion_total"),
        is_comprehension=is_comp
    )


@router.get("/chapters")
def get_chapters():
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT subject, unit, chapter, COUNT(*) as count 
        FROM questions 
        GROUP BY subject, unit, chapter 
        ORDER BY subject, unit, count DESC
    """)
    rows = c.fetchall()
    conn.close()

    grouped = {}
    for r in rows:
        subj = r["subject"]
        if subj not in grouped:
            grouped[subj] = []
        grouped[subj].append({
            "chapter": r["chapter"],
            "unit": r["unit"] or "General",
            "count": r["count"]
        })
    return grouped


@router.get("/syllabus/master")
def get_master_syllabus():
    """
    Returns the full canonical syllabus tree (Subject -> Units -> Chapters)
    augmented with live question counts from the question bank.
    """
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT chapter, COUNT(*) as count 
        FROM questions 
        WHERE validation_status IS NULL OR validation_status != 'QUARANTINED'
        GROUP BY chapter
    """)
    counts = {r["chapter"]: r["count"] for r in c.fetchall()}
    conn.close()

    from backend.app.tools.jee_syllabus import JEE_SYLLABUS

    result = {}
    for subj, units in JEE_SYLLABUS.items():
        result[subj] = []
        for u in units:
            u_obj = {
                "unit": u["unit"],
                "chapters": [
                    {
                        "name": ch,
                        "question_count": counts.get(ch, 0)
                    }
                    for ch in u["chapters"]
                ]
            }
            result[subj].append(u_obj)

    return result


from backend.app.tools.question_verifier import audit_and_heal_question


@router.get("/daily", response_model=List[QuestionOut])
def get_daily_challenge():
    """Generates 5 synchronized daily challenge questions based on today's UTC date seed."""
    today_seed = datetime.datetime.utcnow().strftime("%Y%m%d")
    rnd = random.Random(today_seed)

    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT * FROM questions 
        WHERE solution_text IS NOT NULL AND solution_text != ''
          AND (validation_status IS NULL OR validation_status NOT IN ('QUARANTINED', 'SUPERSEDED_BY_SUBQUESTIONS'))
    """)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    if not rows:
        return []

    # Deterministically shuffle all rows with today's seed
    rnd.shuffle(rows)

    verified_questions = []
    for r in rows:
        is_valid, healed_q, _ = audit_and_heal_question(r)
        if is_valid and healed_q:
            verified_questions.append(row_to_question_out(healed_q))
            if len(verified_questions) >= 5:
                break

    return verified_questions


@router.get("/random", response_model=List[QuestionOut])
def get_random_questions(
    subject: Optional[str] = Query(None),
    chapter: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    count: int = Query(5, ge=1, le=50)
):
    conn = get_connection()
    c = conn.cursor()

    query = """
        SELECT * FROM questions 
        WHERE solution_text IS NOT NULL AND solution_text != ''
          AND (validation_status IS NULL OR validation_status NOT IN ('QUARANTINED', 'SUPERSEDED_BY_SUBQUESTIONS'))
    """
    params = []

    if subject and subject.lower() not in ("all", "any"):
        query += " AND LOWER(subject) = LOWER(?)"
        params.append(subject)

    if chapter and chapter.lower() not in ("all", "any"):
        query += " AND LOWER(chapter) = LOWER(?)"
        params.append(chapter)

    if difficulty and difficulty.upper() not in ("ALL", "MIXED"):
        query += " AND UPPER(difficulty_tier) = UPPER(?)"
        params.append(difficulty)

    # Oversample to allow filtering/healing of defective candidates
    query += " ORDER BY RANDOM() LIMIT ?"
    fetch_limit = min(max(count * 3, 15), 150)
    params.append(fetch_limit)

    c.execute(query, params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    verified_questions = []
    for r in rows:
        is_valid, healed_q, _ = audit_and_heal_question(r)
        if is_valid and healed_q:
            verified_questions.append(row_to_question_out(healed_q))
            if len(verified_questions) >= count:
                break

    return verified_questions


@router.get("/{question_id}", response_model=QuestionOut)
def get_question(question_id: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Question not found.")

    r = dict(row)
    if r.get("validation_status") == "QUARANTINED":
        raise HTTPException(status_code=404, detail="Question is currently quarantined due to defects.")

    is_valid, healed_q, _ = audit_and_heal_question(r)
    if not is_valid or not healed_q:
        raise HTTPException(status_code=404, detail="Question failed structural verification and was quarantined.")

    return row_to_question_out(healed_q)


@router.get("/{question_id}/solution", response_model=QuestionSolutionOut)
def get_question_solution(question_id: str, user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, correct_answer, solution_text, key_formulas, common_pitfall FROM questions WHERE id = ?", (question_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Question not found.")

    r = dict(row)
    raw_formulas = r.get("key_formulas")
    try:
        formulas = json.loads(raw_formulas) if isinstance(raw_formulas, str) else (raw_formulas or [])
    except Exception:
        formulas = []

    return QuestionSolutionOut(
        id=r["id"],
        correct_answer=r["correct_answer"],
        solution_text=clean_escapes(r.get("solution_text")),
        key_formulas=formulas,
        common_pitfall=clean_escapes(r.get("common_pitfall"))
    )


@router.post("/{question_id}/report")
def report_question(question_id: str, report_data: QuestionReportRequest, user: Optional[dict] = Depends(get_optional_user)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM questions WHERE id = ?", (question_id,))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found.")

    report_id = f"rep_{uuid.uuid4().hex[:12]}"
    now = datetime.datetime.utcnow().isoformat()
    reporter_id = user["id"] if user else "guest"
    reporter_name = user.get("username", "Guest Aspirant") if user else "Guest Aspirant"

    c.execute("""
        INSERT INTO question_reports (id, question_id, reporter_id, reporter_username, reason, notes, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
    """, (report_id, question_id, reporter_id, reporter_name, report_data.reason, report_data.notes or "", now))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Report submitted successfully.", "report_id": report_id}


@router.get("/reports/all")
def get_all_reports(status: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()

    query = """
        SELECT 
            qr.id as report_id,
            qr.question_id,
            qr.reporter_id,
            qr.reporter_username,
            qr.reason,
            qr.notes,
            qr.status as report_status,
            qr.created_at as reported_at,
            qr.resolved_at,
            qr.resolved_by,
            q.subject,
            q.unit,
            q.chapter,
            q.question_type,
            q.text as question_text,
            q.options,
            q.correct_answer,
            q.solution_text,
            q.has_diagram,
            q.diagram_urls,
            q.difficulty_tier,
            q.validation_status
        FROM question_reports qr
        JOIN questions q ON qr.question_id = q.id
    """
    params = []
    if status and status.upper() != "ALL":
        query += " WHERE qr.status = ?"
        params.append(status.upper())

    query += " ORDER BY qr.created_at DESC"
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()

    reports = []
    for r in rows:
        item = dict(r)
        try:
            item["options"] = json.loads(item["options"]) if isinstance(item["options"], str) else (item["options"] or [])
        except Exception:
            item["options"] = []
        try:
            urls = json.loads(item["diagram_urls"]) if isinstance(item["diagram_urls"], str) else (item["diagram_urls"] or [])
            from pathlib import Path
            clean_urls = []
            for u in urls:
                if u:
                    u_str = str(u)
                    if u_str.startswith("/diagrams/") or u_str.startswith("http://") or u_str.startswith("https://"):
                        clean_urls.append(u_str)
                    else:
                        fn = Path(u_str.replace("\\", "/")).name
                        clean_urls.append(f"/diagrams/{fn}")
            item["diagram_urls"] = clean_urls
        except Exception:
            item["diagram_urls"] = []

        reports.append(item)

    return reports


@router.get("/quarantined/all")
def get_quarantined_questions(user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, subject, unit, chapter, question_type, text as question_text, options, correct_answer, solution_text, has_diagram, diagram_urls, difficulty_tier, validation_status
        FROM questions
        WHERE validation_status = 'QUARANTINED'
        ORDER BY id DESC
        LIMIT 100
    """)
    rows = c.fetchall()
    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        try:
            item["options"] = json.loads(item["options"]) if isinstance(item["options"], str) else (item["options"] or [])
        except Exception:
            item["options"] = []
        try:
            urls = json.loads(item["diagram_urls"]) if isinstance(item["diagram_urls"], str) else (item["diagram_urls"] or [])
            from pathlib import Path
            clean_urls = []
            for u in urls:
                if u:
                    u_str = str(u)
                    if u_str.startswith("/diagrams/") or u_str.startswith("http://") or u_str.startswith("https://"):
                        clean_urls.append(u_str)
                    else:
                        fn = Path(u_str.replace("\\", "/")).name
                        clean_urls.append(f"/diagrams/{fn}")
            item["diagram_urls"] = clean_urls
        except Exception:
            item["diagram_urls"] = []
        result.append(item)
    return result


@router.post("/{question_id}/quarantine")
def quarantine_question(question_id: str, user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM questions WHERE id = ?", (question_id,))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found.")

    now = datetime.datetime.utcnow().isoformat()
    resolver = user.get("username", "Admin")

    c.execute("UPDATE questions SET validation_status = 'QUARANTINED' WHERE id = ?", (question_id,))
    c.execute("""
        UPDATE question_reports 
        SET status = 'QUARANTINED', resolved_at = ?, resolved_by = ? 
        WHERE question_id = ? AND status = 'PENDING'
    """, (now, resolver, question_id))
    conn.commit()
    conn.close()

    # Automatic Marks Re-scoring, Elo Compensation & Student Notification
    from backend.app.tools.moderation_reconciliation import reconcile_quarantined_question
    rec_res = reconcile_quarantined_question(question_id, resolver=resolver)

    return {
        "success": True,
        "message": f"Question {question_id} has been quarantined and purged from active test pools.",
        "reconciliation": rec_res
    }


@router.post("/{question_id}/dismiss")
def dismiss_reports(question_id: str, user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()
    now = datetime.datetime.utcnow().isoformat()
    resolver = user.get("username", "Admin")

    c.execute("""
        UPDATE question_reports 
        SET status = 'DISMISSED', resolved_at = ?, resolved_by = ? 
        WHERE question_id = ? AND status = 'PENDING'
    """, (now, resolver, question_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Reports for question {question_id} dismissed."}


@router.post("/{question_id}/restore")
def restore_question(question_id: str, user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()
    now = datetime.datetime.utcnow().isoformat()
    resolver = user.get("username", "Admin")

    c.execute("UPDATE questions SET validation_status = 'VALID' WHERE id = ?", (question_id,))
    c.execute("""
        UPDATE question_reports 
        SET status = 'RESTORED', resolved_at = ?, resolved_by = ? 
        WHERE question_id = ?
    """, (now, resolver, question_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Question {question_id} restored to active test pools."}

