import json
import uuid
import datetime
import random
import string
import asyncio
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from backend.app.models import (
    RoomCreateRequest,
    RoomJoinRequest,
    RemovePlayerRequest,
    AnswerSubmissionRequest,
    RoomState,
    ParticipantScore,
    QuestionOut,
    QuestionOptionModel,
    QuestionSolutionOut
)
from backend.app.database import get_connection, get_user_by_id
from backend.app.auth import get_current_user, get_user_by_username
from backend.app.websockets.room_hub import room_hub
from backend.app.routes.questions import row_to_question_out
from backend.app.tools.question_verifier import audit_and_heal_question

router = APIRouter(prefix="/api/rooms", tags=["Rooms & Multiplayer"])

def generate_room_code() -> str:
    """Generates a clean, 5-letter uppercase room code excluding confusing characters like 0, O, 1, I."""
    charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(charset, k=5))

def normalize_answer(ans: Any) -> str:
    """
    Normalizes option strings across formats:
    '1' -> 'A', '2' -> 'B', '3' -> 'C', '4' -> 'D'
    '(B)' -> 'B', ' B ' -> 'B'
    """
    if ans is None:
        return ""
    s = str(ans).strip().upper()
    s = s.strip("()., ")
    mapping = {"1": "A", "2": "B", "3": "C", "4": "D"}
    return mapping.get(s, s)

def is_answer_correct(user_ans: str, correct_ans: str, q_type: str = "MCQ") -> bool:
    """Robust answer equivalence checker supporting MCQ options, multi-correct sets, and Numerical types."""
    if user_ans is None or correct_ans is None:
        return False

    u_norm = normalize_answer(user_ans)
    c_norm = normalize_answer(correct_ans)
    if u_norm == c_norm:
        return True

    # Multi-correct sets (e.g., "A, B" vs "B, A" or "1, 2" vs "A, B")
    u_str = str(user_ans).strip()
    c_str = str(correct_ans).strip()
    if "," in u_str or "," in c_str or ";" in u_str or ";" in c_str or q_type in ("MULTIPLE_CHOICE", "MULTI_CORRECT"):
        import re
        u_parts = {normalize_answer(p) for p in re.split(r'[,;\s]+', u_str) if p}
        c_parts = {normalize_answer(p) for p in re.split(r'[,;\s]+', c_str) if p}
        if u_parts and u_parts == c_parts:
            return True

    # If numerical, check float tolerance
    if q_type in ("NUMERICAL", "INTEGER", "SUBJECTIVE") or (user_ans and user_ans.replace('.', '', 1).isdigit()):
        try:
            u_val = float(str(user_ans).strip())
            c_val = float(str(correct_ans).strip())
            return abs(u_val - c_val) <= 0.05
        except Exception:
            pass

    return False

def calculate_elo_updates(
    participants: List[dict],
    user_answers: Dict[str, dict],
    question_elos: Optional[List[float]] = None
) -> Dict[str, float]:
    """
    Computes multiplayer or solo Elo delta:
    - If solo match (n = 1): computes balanced delta based on user performance vs question difficulty.
    - If multiplayer (n >= 2): computes pairwise Elo delta among participants.
    """
    n = len(participants)
    if n < 1:
        return {}

    if n == 1:
        uid = participants[0]["user_id"]
        r_user = float(participants[0].get("overall_elo", 1200.0))
        u_ans = user_answers.get(uid, {})
        correct_count = 0
        total_count = len(question_elos) if question_elos else 0
        if isinstance(u_ans, dict):
            for k, v in u_ans.items():
                if isinstance(v, dict) and v.get("correct"):
                    correct_count += 1
                elif isinstance(v, bool) and v:
                    correct_count += 1

        if not question_elos:
            score = participants[0].get("score", 0)
            return {uid: 5.0 if score > 0 else 0.0}

        from backend.app.tools.elo_engine import calculate_solo_match_elo_delta
        delta = calculate_solo_match_elo_delta(r_user, question_elos, correct_count, total_count)
        return {uid: delta}

    deltas = {p["user_id"]: 0.0 for p in participants}
    K = 32.0 / (n - 1)  # scaled K-factor for multi-participant rooms

    for i in range(n):
        for j in range(i + 1, n):
            pA = participants[i]
            pB = participants[j]
            rA = float(pA.get("overall_elo", 1200.0))
            rB = float(pB.get("overall_elo", 1200.0))

            expected_A = 1.0 / (1.0 + 10.0 ** ((rB - rA) / 400.0))
            expected_B = 1.0 - expected_A

            sA = pA.get("score", 0)
            sB = pB.get("score", 0)
            if sA > sB:
                actual_A, actual_B = 1.0, 0.0
            elif sA < sB:
                actual_A, actual_B = 0.0, 1.0
            else:
                actual_A, actual_B = 0.5, 0.5

            delta_A = K * (actual_A - expected_A)
            delta_B = K * (actual_B - expected_B)

            deltas[pA["user_id"]] += delta_A
            deltas[pB["user_id"]] += delta_B

    return {uid: round(d, 1) for uid, d in deltas.items()}


@router.get("/public/open")
def get_open_rooms():
    """Lists currently open public matches in LOBBY status that anyone can join."""
    clean_abandoned_rooms()
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        SELECT r.*, u.username as host_username,
               (SELECT COUNT(*) FROM room_participants p WHERE p.room_id = r.id) as participant_count
        FROM rooms r
        JOIN users u ON r.host_id = u.id
        WHERE r.status = 'LOBBY' AND (r.is_public = 1 OR r.is_public IS NULL)
        ORDER BY r.created_at DESC
        LIMIT 20
    """)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    result = []
    for r in rows:
        subjects_list = []
        if r.get("subjects"):
            try:
                subjects_list = json.loads(r["subjects"])
            except Exception:
                subjects_list = [r["subjects"]]
        elif r.get("subject"):
            subjects_list = [r["subject"]]

        chapters_list = []
        if r.get("chapters"):
            try:
                chapters_list = json.loads(r["chapters"])
            except Exception:
                chapters_list = [r["chapters"]]
        elif r.get("chapter"):
            chapters_list = [r["chapter"]]

        result.append({
            "code": r["code"],
            "host_username": r["host_username"],
            "mode": r["mode"],
            "preset_name": r.get("preset_name"),
            "subjects": subjects_list,
            "chapters": chapters_list,
            "difficulty_tier": r.get("difficulty_tier", "MIXED"),
            "total_questions": r["total_questions"],
            "time_per_question": r["time_per_question"],
            "timing_type": r.get("timing_type", "SYNCHRONIZED"),
            "participant_count": r.get("participant_count", 1),
            "created_at": r["created_at"]
        })

    return result


@router.get("/my/history")
def get_user_test_history(user: dict = Depends(get_current_user)):
    """Returns past completed mock tests, generated blueprints, and battle rooms with scores and analysis availability."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT r.id, r.code, r.mode, r.preset_name, r.subject, r.subjects,
               r.chapter, r.chapters, r.target_exam, r.total_questions,
               r.total_duration_minutes, r.status, r.created_at, r.completed_at,
               p.score, p.marks, p.answers, p.is_finished, p.finished_at,
               (SELECT COUNT(*) FROM room_participants WHERE room_id = r.id) as participant_count
        FROM rooms r
        JOIN room_participants p ON r.id = p.room_id
        WHERE p.user_id = ?
          AND (r.status IN ('IN_PROGRESS', 'COMPLETED') OR p.is_finished = 1)
        ORDER BY COALESCE(r.completed_at, p.finished_at, r.created_at) DESC
        LIMIT 60
    """, (user["id"],))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    history = []
    for r in rows:
        raw_ans = r.get("answers") or "{}"
        try:
            ans_map = json.loads(raw_ans) if isinstance(raw_ans, str) else raw_ans
        except Exception:
            ans_map = {}

        # Accurate attempt filtering:
        # A question is attempted if user selected an option other than NONE/SKIPPED/empty
        attempted_items = []
        for v in ans_map.values():
            if isinstance(v, dict):
                sel = v.get("selected")
                if sel not in ("NONE", "SKIPPED", "", None) and v.get("attempted") is not False:
                    attempted_items.append(v)
            elif isinstance(v, str):
                if v not in ("NONE", "SKIPPED", ""):
                    attempted_items.append({"selected": v, "correct": False})

        total_attempted = len(attempted_items)
        correct_count = sum(1 for v in attempted_items if v.get("correct"))
        incorrect_count = total_attempted - correct_count
        total_questions = max(1, r.get("total_questions") or len(ans_map) or 1)
        unattempted_count = max(0, total_questions - total_attempted)
        accuracy = round((correct_count / total_attempted) * 100, 1) if total_attempted > 0 else 0.0

        # Calculate accurate marks: for MOCK_TEST, (+4/-1 JEE standard)
        max_marks = float(total_questions * 4)
        if r["mode"] == "MOCK_TEST":
            calculated_marks = float(correct_count * 4.0 - incorrect_count * 1.0)
            final_marks = float(r["marks"]) if (r.get("marks") is not None and r["marks"] != 0.0) else calculated_marks
        else:
            final_marks = float(r.get("marks") or (correct_count * 4.0 - incorrect_count * 1.0))

        marks_percentage = round((final_marks / max_marks) * 100, 1) if max_marks > 0 else 0.0

        participant_count = r.get("participant_count") or 1
        is_group = participant_count > 1

        history.append({
            "room_id": r["id"],
            "code": r["code"],
            "mode": r["mode"],
            "preset_name": r["preset_name"] or f"Test #{r['code']}",
            "subject": r["subject"],
            "target_exam": r.get("target_exam", "MIXED"),
            "total_questions": total_questions,
            "duration_minutes": r["total_duration_minutes"],
            "status": r["status"],
            "created_at": r["created_at"],
            "completed_at": r["completed_at"] or r.get("finished_at"),
            "score": r["score"],
            "marks": final_marks,
            "max_marks": max_marks,
            "marks_percentage": marks_percentage,
            "total_attempted": total_attempted,
            "correct_count": correct_count,
            "incorrect_count": incorrect_count,
            "unattempted_count": unattempted_count,
            "accuracy": accuracy,
            "is_finished": bool(r["is_finished"]),
            "participant_count": participant_count,
            "is_group": is_group
        })

    return history


@router.get("/user/{username}/history")
def get_user_test_history_by_username(username: str):
    """Returns past completed mock tests, papers, and battle rooms for any specified candidate."""
    u = get_user_by_username(username.strip())
    if not u:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found.")
    return get_user_test_history(user=u)



@router.post("/create", response_model=RoomState)
def create_room(req: RoomCreateRequest, user: dict = Depends(get_current_user)):
    conn = get_connection()
    c = conn.cursor()

    # Explicit question IDs specified (e.g. Graveyard Re-Duel or Curated Sets)
    if req.question_ids and len(req.question_ids) > 0:
        placeholders = ",".join("?" for _ in req.question_ids)
        c.execute(f"SELECT * FROM questions WHERE id IN ({placeholders})", req.question_ids)
        candidate_rows = [dict(r) for r in c.fetchall()]
        verified_rows = []
        for cand in candidate_rows:
            is_valid, healed_q, _ = audit_and_heal_question(cand)
            if is_valid and healed_q:
                verified_rows.append(healed_q)
            else:
                verified_rows.append(cand)
        selected_rows = verified_rows
    else:
        # Determine multi-subject & multi-chapter filters
        filter_subjects = req.subjects or ([req.subject] if req.subject and req.subject.lower() not in ("all", "any") else [])
        filter_chapters = req.chapters or ([req.chapter] if req.chapter and req.chapter.lower() not in ("all", "any") else [])

        base_where = "solution_text IS NOT NULL AND solution_text != '' AND (validation_status IS NULL OR validation_status NOT IN ('QUARANTINED', 'SUPERSEDED_BY_SUBQUESTIONS'))"
        q_query = f"SELECT * FROM questions WHERE {base_where}"
        params = []

    if filter_subjects:
        placeholders = ",".join("?" for _ in filter_subjects)
        q_query += f" AND LOWER(subject) IN ({placeholders})"
        params.extend([s.lower() for s in filter_subjects])

    if filter_chapters:
        placeholders = ",".join("?" for _ in filter_chapters)
        q_query += f" AND LOWER(chapter) IN ({placeholders})"
        params.extend([ch.lower() for ch in filter_chapters])

    te = (req.target_exam or "").upper().strip()
    is_jee_main = te in ("MAIN", "JEE_MAIN") or (req.mode == "MOCK_TEST" and te not in ("ADVANCED", "JEE_ADVANCED", "OLYMPIAD"))
    is_jee_advanced = te in ("ADVANCED", "JEE_ADVANCED")

    if is_jee_main:
        q_query += " AND (target_exam IN ('JEE_MAIN', 'MAIN') OR target_exam IS NULL)"
    elif is_jee_advanced:
        q_query += " AND target_exam IN ('JEE_ADVANCED', 'ADVANCED')"
    elif te == "OLYMPIAD":
        q_query += " AND target_exam = 'OLYMPIAD'"

    if req.difficulty_tier and req.difficulty_tier.upper() not in ("ALL", "MIXED"):
        q_query += " AND UPPER(difficulty_tier) = UPPER(?)"
        params.append(req.difficulty_tier)

    # Proper format of JEE NTA paper:
    # In JEE Main (NTA Paper Format), ONLY Single Choice (MCQ) and Numericals are allowed!
    # Multi-correct, Matrix Match, Comprehension, Subjective are ONLY for JEE Advanced.
    ALLOWED_NTA_TYPES = {"MCQ", "SINGLE_CHOICE", "NUMERICAL", "INTEGER", "NVQ"}

    if is_jee_main:
        if req.question_types and len(req.question_types) > 0 and "ALL" not in [qt.upper() for qt in req.question_types]:
            nta_types = [qt for qt in req.question_types if qt.upper() in ALLOWED_NTA_TYPES]
            if not nta_types:
                nta_types = ["SINGLE_CHOICE", "NUMERICAL"]
            type_clauses = []
            for qt in nta_types:
                qtu = qt.upper()
                if qtu in ("MCQ", "SINGLE_CHOICE"):
                    type_clauses.extend(["MCQ", "SINGLE_CHOICE"])
                elif qtu in ("NUMERICAL", "INTEGER", "NVQ"):
                    type_clauses.extend(["NUMERICAL", "INTEGER"])
            placeholders = ",".join("?" for _ in set(type_clauses))
            q_query += f" AND UPPER(COALESCE(question_type, 'SINGLE_CHOICE')) IN ({placeholders})"
            params.extend(list(set(type_clauses)))
        elif req.question_type_filter and req.question_type_filter.upper() not in ("ALL", "MIXED"):
            qtf = req.question_type_filter.upper()
            if qtf in ("MCQ", "SINGLE_CHOICE"):
                q_query += " AND UPPER(COALESCE(question_type, 'SINGLE_CHOICE')) IN ('MCQ', 'SINGLE_CHOICE')"
            elif qtf in ("NUMERICAL", "INTEGER", "NVQ"):
                q_query += " AND UPPER(COALESCE(question_type, 'SINGLE_CHOICE')) IN ('NUMERICAL', 'INTEGER')"
            else:
                q_query += " AND UPPER(COALESCE(question_type, 'SINGLE_CHOICE')) IN ('MCQ', 'SINGLE_CHOICE', 'NUMERICAL', 'INTEGER')"
        else:
            # Default NTA format: Strictly Single Choice and Numericals only!
            q_query += " AND UPPER(COALESCE(question_type, 'SINGLE_CHOICE')) IN ('MCQ', 'SINGLE_CHOICE', 'NUMERICAL', 'INTEGER')"
    else:
        # JEE Advanced / Mixed: Allow all authentic Advanced types including MULTIPLE_CHOICE, MATRIX_MATCH, COMPREHENSION
        if req.question_types and len(req.question_types) > 0 and "ALL" not in [qt.upper() for qt in req.question_types]:
            type_clauses = []
            for qt in req.question_types:
                qtu = qt.upper()
                if qtu in ("MCQ", "SINGLE_CHOICE"):
                    type_clauses.extend(["MCQ", "SINGLE_CHOICE"])
                elif qtu in ("NUMERICAL", "INTEGER", "NVQ", "SUBJECTIVE"):
                    type_clauses.extend(["NUMERICAL", "INTEGER", "SUBJECTIVE"])
                elif qtu in ("MULTIPLE_CHOICE", "MULTI_CORRECT", "MULTIPLE"):
                    type_clauses.extend(["MULTIPLE_CHOICE", "MULTI_CORRECT"])
                elif qtu in ("MATRIX_MATCH", "MATCHING", "MATRIX"):
                    type_clauses.append("MATRIX_MATCH")
                elif qtu in ("COMPREHENSION", "PARAGRAPH", "PASSAGE"):
                    type_clauses.append("COMPREHENSION")
                else:
                    type_clauses.append(qtu)
            if type_clauses:
                uniq_types = list(set(type_clauses))
                placeholders = ",".join("?" for _ in uniq_types)
                q_query += f" AND UPPER(question_type) IN ({placeholders})"
                params.extend(uniq_types)
        elif req.question_type_filter and req.question_type_filter.upper() not in ("ALL", "MIXED"):
            qtype_filter = req.question_type_filter.upper()
            if qtype_filter in ("MCQ", "SINGLE_CHOICE"):
                q_query += " AND UPPER(question_type) IN ('MCQ', 'SINGLE_CHOICE')"
            elif qtype_filter in ("NUMERICAL", "INTEGER", "NVQ", "SUBJECTIVE"):
                q_query += " AND UPPER(question_type) IN ('NUMERICAL', 'INTEGER', 'SUBJECTIVE')"
            elif qtype_filter in ("MULTIPLE_CHOICE", "MULTI_CORRECT", "MULTIPLE"):
                q_query += " AND UPPER(question_type) IN ('MULTIPLE_CHOICE', 'MULTI_CORRECT')"
            elif qtype_filter in ("MATRIX_MATCH", "MATCHING", "MATRIX"):
                q_query += " AND UPPER(question_type) = 'MATRIX_MATCH'"
            elif qtype_filter in ("COMPREHENSION", "PARAGRAPH", "PASSAGE"):
                q_query += " AND UPPER(question_type) = 'COMPREHENSION'"
            else:
                q_query += " AND UPPER(question_type) = UPPER(?)"
                params.append(req.question_type_filter)

    if req.question_ids and len(req.question_ids) > 0:
        verified_rows = selected_rows
    else:
        target_count = max(3, min(req.question_count, 75))
        oversample_limit = min(target_count * 3, 200)

        q_query += " ORDER BY RANDOM() LIMIT ?"
        params.append(oversample_limit)

        c.execute(q_query, params)
        candidate_rows = [dict(r) for r in c.fetchall()]

        verified_rows = []
        seen_passages = set()
        from backend.app.tools.comprehension_engine import get_passage_siblings

        for cand in candidate_rows:
            if any(cand["id"] == vr["id"] for vr in verified_rows):
                continue
            passage_id = cand.get("passage_id")
            if passage_id:
                if passage_id in seen_passages:
                    continue
                seen_passages.add(passage_id)
                siblings = get_passage_siblings(c, passage_id)
                if siblings:
                    for sib in siblings:
                        is_valid, healed_q, _ = audit_and_heal_question(sib)
                        if is_valid and healed_q and not any(healed_q["id"] == vr["id"] for vr in verified_rows):
                            verified_rows.append(healed_q)
                    if len(verified_rows) >= target_count:
                        break
                    continue

            is_valid, healed_q, _ = audit_and_heal_question(cand)
            if is_valid and healed_q:
                verified_rows.append(healed_q)
                if len(verified_rows) >= target_count:
                    break

        # Fallback pool if filter results are sparse
        if len(verified_rows) < 3:
            fallback_query = f"SELECT * FROM questions WHERE {base_where}"
            fb_params = []
            if filter_subjects:
                placeholders = ",".join("?" for _ in filter_subjects)
                fallback_query += f" AND LOWER(subject) IN ({placeholders})"
                fb_params.extend([s.lower() for s in filter_subjects])
            if filter_chapters:
                placeholders = ",".join("?" for _ in filter_chapters)
                fallback_query += f" AND LOWER(chapter) IN ({placeholders})"
                fb_params.extend([ch.lower() for ch in filter_chapters])
            fallback_query += " ORDER BY RANDOM() LIMIT ?"
            fb_params.append(oversample_limit)

            c.execute(fallback_query, fb_params)
            candidate_rows = [dict(r) for r in c.fetchall()]
            for cand in candidate_rows:
                if any(cand["id"] == vr["id"] for vr in verified_rows):
                    continue
                passage_id = cand.get("passage_id")
                if passage_id:
                    if passage_id in seen_passages:
                        continue
                    seen_passages.add(passage_id)
                    siblings = get_passage_siblings(c, passage_id)
                    if siblings:
                        for sib in siblings:
                            is_valid, healed_q, _ = audit_and_heal_question(sib)
                            if is_valid and healed_q and not any(healed_q["id"] == vr["id"] for vr in verified_rows):
                                verified_rows.append(healed_q)
                        if len(verified_rows) >= target_count:
                            break
                        continue

                is_valid, healed_q, _ = audit_and_heal_question(cand)
                if is_valid and healed_q:
                    verified_rows.append(healed_q)
                    if len(verified_rows) >= target_count:
                        break

        if len(verified_rows) < 3:
            c.execute(f"SELECT * FROM questions WHERE {base_where} ORDER BY RANDOM() LIMIT ?", (oversample_limit,))
            candidate_rows = [dict(r) for r in c.fetchall()]
            for cand in candidate_rows:
                if any(cand["id"] == vr["id"] for vr in verified_rows):
                    continue
                passage_id = cand.get("passage_id")
                if passage_id:
                    if passage_id in seen_passages:
                        continue
                    seen_passages.add(passage_id)
                    siblings = get_passage_siblings(c, passage_id)
                    if siblings:
                        for sib in siblings:
                            is_valid, healed_q, _ = audit_and_heal_question(sib)
                            if is_valid and healed_q and not any(healed_q["id"] == vr["id"] for vr in verified_rows):
                                verified_rows.append(healed_q)
                        if len(verified_rows) >= target_count:
                            break
                        continue

                is_valid, healed_q, _ = audit_and_heal_question(cand)
                if is_valid and healed_q:
                    verified_rows.append(healed_q)
                    if len(verified_rows) >= target_count:
                        break

    q_rows = verified_rows

    if not q_rows:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No questions available matching your filters. Please adjust chapter selection or run 'jee cloud push'."
        )

    # Sort questions by subject (Physics -> Chemistry -> Mathematics) while keeping comprehension passages contiguous!
    subj_sort = {"physics": 1, "chemistry": 2, "mathematics": 3, "maths": 3}
    q_rows.sort(key=lambda r: (
        subj_sort.get((r.get("subject") or "").lower(), 99),
        r.get("passage_id") or r.get("id"),
        r.get("subquestion_index") or 0,
        r.get("id")
    ))

    question_ids = [r["id"] for r in q_rows]
    room_id = str(uuid.uuid4())
    
    # Generate unique 5-character code
    for _ in range(15):
        code = generate_room_code()
        c.execute("SELECT id FROM rooms WHERE code = ?", (code,))
        if not c.fetchone():
            break
    else:
        code = str(uuid.uuid4())[:5].upper()

    now = datetime.datetime.utcnow().isoformat()
    subjects_json = json.dumps(filter_subjects)
    chapters_json = json.dumps(filter_chapters)

    c.execute("""
        INSERT INTO rooms (
            id, code, host_id, mode, preset_name, subject, subjects, chapter, chapters,
            difficulty_tier, target_exam, question_type_filter, question_ids, total_questions,
            time_per_question, total_duration_minutes, timing_type, is_public, passcode,
            speed_bonus_enabled, negative_marking, base_correct_score, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LOBBY', ?)
    """, (
        room_id, code, user["id"], req.mode, req.preset_name,
        filter_subjects[0] if len(filter_subjects) == 1 else "Mixed",
        subjects_json,
        filter_chapters[0] if len(filter_chapters) == 1 else "Mixed",
        chapters_json,
        req.difficulty_tier or "MIXED",
        req.target_exam or "MIXED",
        req.question_type_filter or "ALL",
        json.dumps(question_ids), len(question_ids),
        req.time_per_question, req.total_duration_minutes, req.timing_type,
        1 if req.is_public else 0,
        req.passcode.strip() if req.passcode else None,
        1 if req.speed_bonus_enabled else 0,
        req.negative_marking,
        req.base_correct_score,
        now
    ))

    # Add host as first participant
    c.execute("""
        INSERT INTO room_participants (room_id, user_id, current_question_index, score, marks, answers, is_finished)
        VALUES (?, ?, 0, 0, 0.0, '{}', 0)
    """, (room_id, user["id"]))

    conn.commit()
    conn.close()

    return get_room_state(code, user)


@router.post("/join", response_model=RoomState)
async def join_room(req: RoomJoinRequest, user: dict = Depends(get_current_user)):
    code = req.code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Battle room with code '{code}' not found.")

    room = dict(room_row)
    room_id = room["id"]

    # Verify Passcode if room is private
    if room.get("passcode"):
        user_passcode = (req.passcode or "").strip()
        if user_passcode != room["passcode"]:
            conn.close()
            raise HTTPException(status_code=403, detail="Incorrect room passcode.")

    # Check if participant already in room
    c.execute("SELECT * FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, user["id"]))
    existing = c.fetchone()

    if not existing:
        if room["status"] not in ("LOBBY", "IN_PROGRESS"):
            conn.close()
            raise HTTPException(status_code=400, detail="This match has already completed.")

        c.execute("""
            INSERT INTO room_participants (room_id, user_id, current_question_index, score, marks, answers, is_finished)
            VALUES (?, ?, 0, 0, 0.0, '{}', 0)
        """, (room_id, user["id"]))
        conn.commit()

    conn.close()

    state = get_room_state(code, user)
    await room_hub.broadcast_to_room(code, "PLAYER_JOINED", {
        "user_id": user["id"],
        "username": user["username"],
        "avatar_id": user.get("avatar_id", "default"),
        "participants_count": len(state.participants)
    })

    return state


@router.post("/{code}/remove_player", response_model=RoomState)
async def remove_player_from_room(code: str, req: RemovePlayerRequest, user: dict = Depends(get_current_user)):
    """Allows the room host to remove/kick any participant from the lobby."""
    code = code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")

    room = dict(room_row)
    room_id = room["id"]

    # Only room host has kick permissions
    if room["host_id"] != user["id"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Only the room host can remove players.")

    target_user_id = req.user_id.strip()
    if target_user_id == user["id"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot remove yourself as host. Transfer host or leave instead.")

    # Remove target participant
    c.execute("DELETE FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, target_user_id))
    conn.commit()
    conn.close()


    state = get_room_state(code, user)
    # Broadcast kicked event to room participants
    await room_hub.broadcast_to_room(code, "PLAYER_KICKED", {
        "user_id": target_user_id,
        "kicked_by": user["username"],
        "participants_count": len(state.participants)
    })
    return state


@router.get("/{code}", response_model=RoomState)
def get_room_details(code: str, user: dict = Depends(get_current_user)):
    return get_room_state(code.strip().upper(), user)


def get_room_state(code: str, user: dict) -> RoomState:
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")

    room = dict(room_row)
    room_id = room["id"]

    # Fetch participants
    c.execute("""
        SELECT p.*, u.username, u.avatar_id, u.title, u.overall_elo
        FROM room_participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.room_id = ?
        ORDER BY p.score DESC, p.marks DESC
    """, (room_id,))
    part_rows = [dict(r) for r in c.fetchall()]

    participants = []
    is_mock = room["mode"] == "MOCK_TEST"
    in_progress = room["status"] == "IN_PROGRESS"

    for idx, p in enumerate(part_rows, start=1):
        # In mock test while in progress, blind scores to preserve exam authenticity
        display_score = 0 if (is_mock and in_progress) else p["score"]
        display_marks = 0.0 if (is_mock and in_progress) else p["marks"]

        participants.append(ParticipantScore(
            user_id=p["user_id"],
            username=p["username"],
            avatar_id=p.get("avatar_id") or "default",
            title=p.get("title") or "JEE Aspirant",
            score=display_score,
            marks=display_marks,
            current_question_index=p["current_question_index"],
            is_finished=bool(p["is_finished"]),
            rank=idx,
            question_started_at=p.get("question_started_at")
        ))

    # Fetch questions
    q_ids = json.loads(room["question_ids"])
    current_q = None
    all_qs = []

    if is_mock or in_progress or room["status"] == "COMPLETED":
        # Load questions
        for q_id in q_ids:
            c.execute("SELECT * FROM questions WHERE id = ?", (q_id,))
            q_row = c.fetchone()
            if q_row:
                all_qs.append(row_to_question_out(dict(q_row)))

        if is_mock and all_qs:
            subj_sort = {"physics": 1, "chemistry": 2, "mathematics": 3, "maths": 3}
            all_qs.sort(key=lambda q: (
                subj_sort.get((q.subject or "").lower(), 99),
                q.passage_id or q.id,
                q.subquestion_index or 0,
                q.id
            ))

    if in_progress and not is_mock:
        # Find calling user's current question in Speed Duel
        my_part = next((p for p in part_rows if p["user_id"] == user["id"]), None)
        if my_part and not my_part["is_finished"]:
            curr_idx = my_part["current_question_index"]
            if curr_idx < len(all_qs):
                current_q = all_qs[curr_idx]

    conn.close()

    # Parse subjects & chapters
    subjects_list = []
    if room.get("subjects"):
        try:
            subjects_list = json.loads(room["subjects"])
        except Exception:
            subjects_list = [room["subjects"]]

    chapters_list = []
    if room.get("chapters"):
        try:
            chapters_list = json.loads(room["chapters"])
        except Exception:
            chapters_list = [room["chapters"]]

    # Global server-synchronized time calculation
    time_rem_sec = None
    started_at_str = room.get("started_at")
    now_iso = datetime.datetime.utcnow().isoformat()
    if in_progress and started_at_str:
        try:
            started_dt = datetime.datetime.fromisoformat(started_at_str.replace("Z", "+00:00")).replace(tzinfo=None)
            now_dt = datetime.datetime.utcnow()
            elapsed_total = int((now_dt - started_dt).total_seconds())

            if is_mock:
                total_sec = (room.get("total_duration_minutes") or 60) * 60
                time_rem_sec = max(0, total_sec - elapsed_total)
            else:
                # Speed Duel: compute remaining time on current question for this player
                my_p = next((p for p in part_rows if p["user_id"] == user["id"]), None)
                if my_p and not my_p.get("is_finished"):
                    q_start_str = my_p.get("question_started_at") or started_at_str
                    q_start_dt = datetime.datetime.fromisoformat(q_start_str.replace("Z", "+00:00")).replace(tzinfo=None)
                    q_elapsed = int((now_dt - q_start_dt).total_seconds())
                    time_per_q = room.get("time_per_question") or 90
                    time_rem_sec = max(0, time_per_q - q_elapsed)
                else:
                    total_duel_sec = room["total_questions"] * (room.get("time_per_question") or 90)
                    time_rem_sec = max(0, total_duel_sec - elapsed_total)
        except Exception:
            time_rem_sec = None

    return RoomState(
        id=room["id"],
        code=room["code"],
        host_id=room["host_id"],
        mode=room["mode"],
        preset_name=room.get("preset_name"),
        subject=room.get("subject"),
        subjects=subjects_list,
        chapter=room.get("chapter"),
        chapters=chapters_list,
        difficulty_tier=room.get("difficulty_tier") or "MIXED",
        target_exam=room.get("target_exam") or "MIXED",
        question_type_filter=room.get("question_type_filter") or "ALL",
        total_questions=room["total_questions"],
        time_per_question=room["time_per_question"],
        total_duration_minutes=room["total_duration_minutes"],
        timing_type=room.get("timing_type", "SYNCHRONIZED"),
        is_public=bool(room.get("is_public", 1)),
        has_passcode=bool(room.get("passcode")),
        speed_bonus_enabled=bool(room.get("speed_bonus_enabled", 1)),
        negative_marking=room.get("negative_marking", -25.0),
        base_correct_score=room.get("base_correct_score", 100.0),
        status=room["status"],
        participants=participants,
        current_question=current_q,
        all_questions=all_qs if is_mock else None,
        time_remaining_seconds=time_rem_sec,
        started_at=started_at_str,
        server_time=now_iso,
        tournament_id=room.get("tournament_id"),
        tournament_match_id=room.get("tournament_match_id")
    )


def clean_abandoned_rooms():
    """
    Auto-purges stale or abandoned battle rooms:
    1. Rooms in 'LOBBY' created > 15 minutes ago.
    2. Rooms with 0 human participants.
    3. Rooms in 'IN_PROGRESS' started > 75 minutes ago with no active participants.
    4. Rooms marked 'ABANDONED'.
    """
    try:
        conn = get_connection()
        c = conn.cursor()
        now = datetime.datetime.utcnow()
        lobby_cutoff = (now - datetime.timedelta(minutes=15)).isoformat()
        progress_cutoff = (now - datetime.timedelta(minutes=75)).isoformat()

        c.execute("""
            SELECT id, code FROM rooms
            WHERE (status = 'LOBBY' AND created_at < ?)
               OR (status = 'IN_PROGRESS' AND started_at < ?)
               OR status = 'ABANDONED'
               OR (SELECT COUNT(*) FROM room_participants p WHERE p.room_id = rooms.id) = 0
        """, (lobby_cutoff, progress_cutoff))
        stale_rooms = [dict(r) for r in c.fetchall()]

        for r in stale_rooms:
            c.execute("DELETE FROM room_participants WHERE room_id = ?", (r["id"],))
            c.execute("DELETE FROM rooms WHERE id = ?", (r["id"],))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Auto-Cleanup Rooms]: {e}")


class TransferHostRequest(BaseModel):
    new_host_id: str


@router.post("/{code}/leave")
async def leave_room(code: str, user: dict = Depends(get_current_user)):
    """Removes a user from room participants and automatically reassigns host, or deletes room if abandoned."""
    code = code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        return {"success": True, "message": "Room already closed or deleted."}

    room = dict(room_row)
    room_id = room["id"]

    # Delete leaving user from room_participants
    c.execute("DELETE FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, user["id"]))

    # Query remaining participants
    c.execute("""
        SELECT p.user_id, u.username
        FROM room_participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.room_id = ?
        ORDER BY p.rowid ASC
    """, (room_id,))
    remaining = [dict(r) for r in c.fetchall()]
    if len(remaining) == 0:
        # All players have left - instantly delete the abandoned room!
        c.execute("DELETE FROM room_participants WHERE room_id = ?", (room_id,))
        c.execute("DELETE FROM rooms WHERE id = ?", (room_id,))
        conn.commit()
        conn.close()

        await room_hub.broadcast_to_room(code, "ROOM_CLOSED", {"reason": "All players departed."})
        return {
            "success": True,
            "remaining_participants": 0,
            "room_deleted": True
        }

    new_host_id = room["host_id"]
    host_changed = False

    if room["host_id"] == user["id"]:
        new_host_id = remaining[0]["user_id"]
        host_changed = True
        c.execute("UPDATE rooms SET host_id = ? WHERE id = ?", (new_host_id, room_id))

    conn.commit()
    conn.close()

    await room_hub.broadcast_to_room(code, "PLAYER_LEFT", {
        "user_id": user["id"],
        "username": user["username"],
        "remaining_count": len(remaining),
        "new_host_id": new_host_id if host_changed else None
    })

    if host_changed:
        await room_hub.broadcast_to_room(code, "HOST_CHANGED", {
            "new_host_id": new_host_id,
            "new_host_username": remaining_humans[0]["username"]
        })

    return {
        "success": True,
        "remaining_participants": len(remaining),
        "host_changed": host_changed,
        "new_host_id": new_host_id
    }


@router.get("/user/active")
def get_user_active_room(user: dict = Depends(get_current_user)):
    """
    Returns the user's current active IN_PROGRESS room if any, else null.
    Powers the Chess.com-style ongoing match banner on the Dashboard.
    """
    clean_abandoned_rooms()
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT r.code
        FROM rooms r
        JOIN room_participants p ON r.id = p.room_id
        WHERE p.user_id = ? AND r.status = 'IN_PROGRESS' AND p.is_finished = 0
        ORDER BY r.created_at DESC
        LIMIT 1
    """, (user["id"],))
    row = c.fetchone()
    conn.close()
    if not row:
        return {"active_room": None}
    try:
        state = get_room_state(row["code"], user)
        return {"active_room": state}
    except Exception:
        return {"active_room": None}


@router.post("/{code}/forfeit")
async def forfeit_room(code: str, user: dict = Depends(get_current_user)):
    """
    Forfeits/abandons an active match for the calling player.
    Marks them as finished and triggers match completion if all players are done.
    """
    code = code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")

    room = dict(room_row)
    room_id = room["id"]
    now = datetime.datetime.utcnow().isoformat()

    c.execute("SELECT * FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, user["id"]))
    p_row = c.fetchone()
    if not p_row:
        conn.close()
        raise HTTPException(status_code=400, detail="You are not a participant in this room.")

    c.execute("""
        UPDATE room_participants
        SET is_finished = 1, finished_at = ?
        WHERE room_id = ? AND user_id = ?
    """, (now, room_id, user["id"]))

    c.execute("SELECT COUNT(*) as unfinished FROM room_participants WHERE room_id = ? AND is_finished = 0", (room_id,))
    unfinished_count = c.fetchone()["unfinished"]

    match_completed = False
    if unfinished_count == 0:
        c.execute("UPDATE rooms SET status = 'COMPLETED', completed_at = ? WHERE id = ?", (now, room_id))
        match_completed = True

    conn.commit()
    conn.close()

    await room_hub.broadcast_to_room(code, "PLAYER_FINISHED", {
        "user_id": user["id"],
        "username": user["username"],
        "is_finished": True,
        "is_forfeit": True
    })

    if match_completed:
        await room_hub.broadcast_to_room(code, "MATCH_COMPLETED", {"completed_at": now})

    return {"success": True, "message": "Match forfeited successfully.", "match_completed": match_completed}


@router.post("/{code}/transfer_host")
async def transfer_host(code: str, req: TransferHostRequest, user: dict = Depends(get_current_user)):
    """Allows current host to manually transfer leadership to another player in the lobby."""
    code = code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")

    room = dict(room_row)
    if room["host_id"] != user["id"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Only the current host can transfer host privileges.")

    c.execute("""
        SELECT p.user_id, u.username
        FROM room_participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.room_id = ? AND p.user_id = ?
    """, (room["id"], req.new_host_id))
    target = c.fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=400, detail="Target player is not a participant in this room.")

    c.execute("UPDATE rooms SET host_id = ? WHERE id = ?", (req.new_host_id, room["id"]))
    conn.commit()
    conn.close()

    await room_hub.broadcast_to_room(code, "HOST_CHANGED", {
        "new_host_id": req.new_host_id,
        "new_host_username": target["username"]
    })

    return {"success": True, "new_host_id": req.new_host_id}


@router.post("/{code}/claim_host")
async def claim_host(code: str, user: dict = Depends(get_current_user)):
    """Allows an active participant to claim host status if the existing host has disconnected or departed."""
    code = code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")

    room = dict(room_row)
    room_id = room["id"]

    # Verify caller is an active participant in this room
    c.execute("SELECT 1 FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, user["id"]))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=403, detail="You are not a participant in this room.")

    # Check if registered host is in participants and connected
    c.execute("SELECT 1 FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, room["host_id"]))
    host_is_participant = bool(c.fetchone())
    host_is_connected = room["host_id"] in room_hub.active_rooms.get(code, {})

    if host_is_participant and host_is_connected and room["host_id"] != user["id"]:
        conn.close()
        raise HTTPException(status_code=400, detail="The current host is still active in the room.")

    c.execute("UPDATE rooms SET host_id = ? WHERE id = ?", (user["id"], room_id))
    conn.commit()
    conn.close()

    await room_hub.broadcast_to_room(code, "HOST_CHANGED", {
        "new_host_id": user["id"],
        "new_host_username": user["username"]
    })

    return {"success": True, "new_host_id": user["id"]}



@router.post("/{code}/start", response_model=RoomState)
async def start_room(code: str, user: dict = Depends(get_current_user)):
    code = code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")

    room = dict(room_row)
    room_id = room["id"]

    # Check caller is a participant
    c.execute("SELECT 1 FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, user["id"]))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=403, detail="You are not a participant in this room.")

    # Host verification with self-healing fallback
    if room["host_id"] != user["id"]:
        # If this is a tournament match, promote human caller to host
        if room.get("tournament_id"):
            c.execute("UPDATE rooms SET host_id = ? WHERE id = ?", (user["id"], room_id))
            conn.commit()
            room["host_id"] = user["id"]
            await room_hub.broadcast_to_room(code, "HOST_CHANGED", {
                "new_host_id": user["id"],
                "new_host_username": user["username"]
            })
        else:
            c.execute("SELECT 1 FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, room["host_id"]))
            host_in_room = bool(c.fetchone())
            host_connected = room["host_id"] in room_hub.active_rooms.get(code, {})

            # If listed host has left participants or disconnected, auto-promote caller
            if not host_in_room or not host_connected:
                c.execute("UPDATE rooms SET host_id = ? WHERE id = ?", (user["id"], room_id))
                conn.commit()
                room["host_id"] = user["id"]
                await room_hub.broadcast_to_room(code, "HOST_CHANGED", {
                    "new_host_id": user["id"],
                    "new_host_username": user["username"]
                })
            else:
                conn.close()
                raise HTTPException(status_code=403, detail="Only the room host can start the battle.")

    if room["status"] != "LOBBY":
        conn.close()
        raise HTTPException(status_code=400, detail="Match has already started or completed.")

    now = datetime.datetime.utcnow().isoformat()
    c.execute("UPDATE rooms SET status = 'IN_PROGRESS', started_at = ? WHERE id = ?", (now, room_id))
    c.execute("UPDATE room_participants SET question_started_at = ? WHERE room_id = ?", (now, room_id))
    conn.commit()

    conn.close()

    await room_hub.broadcast_to_room(code, "MATCH_STARTED", {"started_at": now})

    return get_room_state(code, user)



class BulkSubmissionRequest(BaseModel):
    answers: Dict[str, str]  # question_id -> selected_option
    total_time_seconds: int

@router.post("/{code}/submit_bulk")
async def submit_bulk_mock(code: str, req: BulkSubmissionRequest, user: dict = Depends(get_current_user)):
    """Submits entire mock test at once upon completion."""
    code = code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")

    room = dict(room_row)
    room_id = room["id"]

    c.execute("SELECT * FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, user["id"]))
    p_row = c.fetchone()
    if not p_row:
        conn.close()
        raise HTTPException(status_code=400, detail="You are not a participant in this room.")

    p = dict(p_row)
    if p["is_finished"]:
        conn.close()
        raise HTTPException(status_code=400, detail="You have already submitted this test.")

    q_ids = json.loads(room["question_ids"])
    answers_dict = {}
    total_score = 0
    total_marks = 0.0
    now = datetime.datetime.utcnow().isoformat()
    total_correct = 0

    base_score = room.get("base_correct_score", 100.0)
    neg_penalty = room.get("negative_marking", -25.0)

    for q_id in q_ids:
        c.execute("SELECT * FROM questions WHERE id = ?", (q_id,))
        q_row = c.fetchone()
        if not q_row:
            continue
        q = dict(q_row)
        user_choice = req.answers.get(q_id, "NONE")
        correct_ans = q["correct_answer"]
        q_type = q.get("question_type", "MCQ")

        if user_choice in ("NONE", "SKIPPED", "", None):
            delta_score = 0
            delta_marks = 0.0
            is_corr = False
        else:
            is_corr = is_answer_correct(user_choice, correct_ans, q_type)
            if is_corr:
                delta_score = int(base_score)
                delta_marks = 4.0
                total_correct += 1
            else:
                delta_score = int(neg_penalty)
                delta_marks = -1.0

            # Record question attempt with anti-guess / anti-spam guardrails
            time_per_item = max(1, req.total_time_seconds // max(1, len(q_ids)))
            from backend.app.tools.elo_engine import update_question_elo_from_attempt
            q_elo_delta, _ = update_question_elo_from_attempt(
                c,
                user["id"],
                q["id"],
                is_corr,
                time_per_item,
                float(user.get("overall_elo", 1200.0)),
                now
            )
            c.execute("""
                INSERT INTO activity_log (user_id, question_id, subject, chapter, is_correct, time_spent_seconds, elo_delta, mode, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user["id"], q["id"], q["subject"], q["chapter"], 1 if is_corr else 0, time_per_item, q_elo_delta, room["mode"], now))
            from backend.app.tools.elo_engine import record_chapter_attempt
            record_chapter_attempt(c, user["id"], q["subject"], q["chapter"], is_corr)
            try:
                from backend.app.tools.streaks_engine import record_daily_activity
                record_daily_activity(user["id"], c)
            except Exception:
                pass

        total_score += delta_score
        total_marks += delta_marks
        answers_dict[q_id] = {
            "selected": user_choice,
            "correct": is_corr,
            "delta_score": delta_score,
            "delta_marks": delta_marks
        }

    c.execute("""
        UPDATE room_participants
        SET score = ?, marks = ?, current_question_index = ?, answers = ?, is_finished = 1, finished_at = ?
        WHERE room_id = ? AND user_id = ?
    """, (total_score, total_marks, len(q_ids), json.dumps(answers_dict), now, room_id, user["id"]))

    # Update user stats
    c.execute("""
        UPDATE users
        SET total_solved = total_solved + ?,
            total_correct = total_correct + ?,
            weekly_rp = weekly_rp + ?,
            last_active = ?
        WHERE id = ?
    """, (len(q_ids), total_correct, max(10, total_score if total_score > 0 else 10), now, user["id"]))

    # Check if everyone finished
    c.execute("SELECT COUNT(*) as unfinished FROM room_participants WHERE room_id = ? AND is_finished = 0", (room_id,))
    unfinished_count = c.fetchone()["unfinished"]

    match_completed = False
    if unfinished_count == 0:
        c.execute("UPDATE rooms SET status = 'COMPLETED', completed_at = ? WHERE id = ?", (now, room_id))
        match_completed = True

        c.execute("""
            SELECT p.user_id, p.score, u.overall_elo, u.gold_medals
            FROM room_participants p
            JOIN users u ON p.user_id = u.id
            WHERE p.room_id = ?
            ORDER BY p.score DESC
        """, (room_id,))
        finished_parts = [dict(r) for r in c.fetchall()]

        if finished_parts:
            winner_id = finished_parts[0]["user_id"]
            c.execute("UPDATE users SET gold_medals = gold_medals + 1 WHERE id = ?", (winner_id,))
            if len(finished_parts) > 1:
                c.execute("UPDATE users SET silver_medals = silver_medals + 1 WHERE id = ?", (finished_parts[1]["user_id"],))
            if len(finished_parts) > 2:
                c.execute("UPDATE users SET bronze_medals = bronze_medals + 1 WHERE id = ?", (finished_parts[2]["user_id"],))

            q_elos = []
            if q_ids:
                placeholders = ','.join(['?'] * len(q_ids))
                c.execute(f"SELECT elo_rating FROM questions WHERE id IN ({placeholders})", q_ids)
                q_elos = [float(r["elo_rating"] or 1500) for r in c.fetchall()]

            user_answers_map = {}
            for part in finished_parts:
                ans_val = part.get("answers") or "{}"
                user_answers_map[part["user_id"]] = json.loads(ans_val) if isinstance(ans_val, str) else ans_val

            from backend.app.tools.elo_engine import apply_match_elo_to_user
            r_subjs = json.loads(room["subjects"]) if isinstance(room.get("subjects"), str) else (room.get("subjects") or [])
            r_chaps = json.loads(room["chapters"]) if isinstance(room.get("chapters"), str) else (room.get("chapters") or [])

            elo_deltas = calculate_elo_updates(finished_parts, user_answers_map, q_elos)
            for uid, delta in elo_deltas.items():
                apply_match_elo_to_user(c, uid, delta, r_subjs, r_chaps)

    conn.commit()
    conn.close()

    await room_hub.broadcast_to_room(code, "PLAYER_PROGRESS", {
        "user_id": user["id"],
        "username": user["username"],
        "is_finished": True,
        "total_questions": len(q_ids)
    })

    if match_completed:
        await room_hub.broadcast_to_room(code, "MATCH_COMPLETED", {"completed_at": now})

    return {
        "score": total_score,
        "marks": total_marks,
        "match_completed": match_completed
    }


@router.post("/{code}/submit")
async def submit_answer(code: str, submission: AnswerSubmissionRequest, user: dict = Depends(get_current_user)):
    code = code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")

    room = dict(room_row)
    room_id = room["id"]

    c.execute("SELECT * FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, user["id"]))
    p_row = c.fetchone()
    if not p_row:
        conn.close()
        raise HTTPException(status_code=400, detail="You are not a participant in this room.")

    p = dict(p_row)
    if p["is_finished"]:
        conn.close()
        raise HTTPException(status_code=400, detail="You have already completed all questions.")

    c.execute("SELECT * FROM questions WHERE id = ?", (submission.question_id,))
    q_row = c.fetchone()
    if not q_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found.")

    q = dict(q_row)
    correct_ans = str(q["correct_answer"]).strip()
    user_ans = str(submission.selected_option).strip()
    q_type = q.get("question_type", "MCQ")

    is_correct = is_answer_correct(user_ans, correct_ans, q_type)

    base_score = room.get("base_correct_score", 100.0)
    neg_penalty = room.get("negative_marking", -25.0)
    speed_bonus_on = bool(room.get("speed_bonus_enabled", 1))

    time_limit = room.get("time_per_question", 90)
    time_spent = min(time_limit, max(1, submission.time_spent_seconds))

    if room["mode"] == "SPEED_DUEL":
        if is_correct:
            if speed_bonus_on:
                speed_fraction = max(0.0, 1.0 - (time_spent / float(time_limit)))
                speed_bonus = int(50.0 * speed_fraction)
            else:
                speed_bonus = 0
            delta_score = int(base_score) + speed_bonus
            delta_marks = 4.0
        else:
            delta_score = int(neg_penalty)
            delta_marks = -1.0
    else:  # MOCK_TEST single advance
        if is_correct:
            delta_score = int(base_score)
            delta_marks = 4.0
        else:
            delta_score = int(neg_penalty)
            delta_marks = -1.0

    raw_ans = p.get("answers") or "{}"
    try:
        answers_dict = json.loads(raw_ans) if isinstance(raw_ans, str) else raw_ans
    except Exception:
        answers_dict = {}

    # Prevent double-submission of the same question from skipping questions
    q_ids = json.loads(room["question_ids"])
    if submission.question_id in answers_dict:
        curr_idx = p["current_question_index"]
        next_q_data = None
        if curr_idx < len(q_ids):
            c.execute("SELECT * FROM questions WHERE id = ?", (q_ids[curr_idx],))
            nq = c.fetchone()
            if nq:
                next_q_data = row_to_question_out(dict(nq)).dict()
        conn.close()
        prev = answers_dict[submission.question_id]
        return {
            "is_correct": prev.get("correct", False),
            "delta_score": prev.get("delta_score", 0),
            "delta_marks": prev.get("delta_marks", 0.0),
            "total_score": p["score"],
            "total_marks": p["marks"],
            "current_question_index": curr_idx,
            "is_finished": bool(p["is_finished"]),
            "match_completed": room["status"] == "COMPLETED",
            "next_question": next_q_data
        }

    answers_dict[submission.question_id] = {
        "selected": submission.selected_option,
        "correct": is_correct,
        "time_spent": time_spent,
        "delta_score": delta_score,
        "delta_marks": delta_marks
    }

    new_score = p["score"] + delta_score
    new_marks = p["marks"] + delta_marks
    new_idx = p["current_question_index"] + 1
    total_q = room["total_questions"]
    is_finished = 1 if new_idx >= total_q else 0
    now = datetime.datetime.utcnow().isoformat()
    finished_at = now if is_finished else None

    # Fetch next question directly for instant progression
    next_question = None
    if not is_finished and new_idx < len(q_ids):
        next_qid = q_ids[new_idx]
        c.execute("SELECT * FROM questions WHERE id = ?", (next_qid,))
        nq_row = c.fetchone()
        if nq_row:
            next_question = row_to_question_out(dict(nq_row)).dict()

    c.execute("""
        UPDATE room_participants
        SET score = ?, marks = ?, current_question_index = ?, answers = ?, is_finished = ?, finished_at = ?, question_started_at = ?
        WHERE room_id = ? AND user_id = ?
    """, (new_score, new_marks, new_idx, json.dumps(answers_dict), is_finished, finished_at, now, room_id, user["id"]))

    user_rp_gain = max(5, delta_score if delta_score > 0 else 5)
    c.execute("""
        UPDATE users
        SET total_solved = total_solved + 1,
            total_correct = total_correct + ?,
            weekly_rp = weekly_rp + ?,
            last_active = ?
        WHERE id = ?
    """, (1 if is_correct else 0, user_rp_gain, now, user["id"]))

    from backend.app.tools.elo_engine import update_question_elo_from_attempt
    q_elo_delta, _ = update_question_elo_from_attempt(
        c,
        user["id"],
        q["id"],
        is_correct,
        time_spent,
        float(user.get("overall_elo", 1200.0)),
        now
    )

    c.execute("""
        INSERT INTO activity_log (user_id, question_id, subject, chapter, is_correct, time_spent_seconds, elo_delta, mode, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user["id"], q["id"], q["subject"], q["chapter"], 1 if is_correct else 0, time_spent, q_elo_delta, room["mode"], now))
    from backend.app.tools.elo_engine import record_chapter_attempt
    record_chapter_attempt(c, user["id"], q["subject"], q["chapter"], is_correct)
    try:
        from backend.app.tools.streaks_engine import record_daily_activity
        record_daily_activity(user["id"], c)
    except Exception:
        pass

    c.execute("SELECT COUNT(*) as unfinished FROM room_participants WHERE room_id = ? AND is_finished = 0", (room_id,))
    unfinished_count = c.fetchone()["unfinished"]

    match_completed = False
    if unfinished_count == 0:
        c.execute("UPDATE rooms SET status = 'COMPLETED', completed_at = ? WHERE id = ?", (now, room_id))
        match_completed = True

        c.execute("""
            SELECT p.user_id, p.score, u.overall_elo, u.gold_medals
            FROM room_participants p
            JOIN users u ON p.user_id = u.id
            WHERE p.room_id = ?
            ORDER BY p.score DESC
        """, (room_id,))
        finished_parts = [dict(r) for r in c.fetchall()]

        if finished_parts:
            winner_id = finished_parts[0]["user_id"]
            c.execute("UPDATE users SET gold_medals = gold_medals + 1 WHERE id = ?", (winner_id,))
            if len(finished_parts) > 1:
                c.execute("UPDATE users SET silver_medals = silver_medals + 1 WHERE id = ?", (finished_parts[1]["user_id"],))
            if len(finished_parts) > 2:
                c.execute("UPDATE users SET bronze_medals = bronze_medals + 1 WHERE id = ?", (finished_parts[2]["user_id"],))

            q_elos = []
            if q_ids:
                placeholders = ','.join(['?'] * len(q_ids))
                c.execute(f"SELECT elo_rating FROM questions WHERE id IN ({placeholders})", q_ids)
                q_elos = [float(r["elo_rating"] or 1500) for r in c.fetchall()]

            user_answers_map = {}
            for part in finished_parts:
                ans_val = part.get("answers") or "{}"
                user_answers_map[part["user_id"]] = json.loads(ans_val) if isinstance(ans_val, str) else ans_val

            from backend.app.tools.elo_engine import apply_match_elo_to_user
            r_subjs = json.loads(room["subjects"]) if isinstance(room.get("subjects"), str) else (room.get("subjects") or [])
            r_chaps = json.loads(room["chapters"]) if isinstance(room.get("chapters"), str) else (room.get("chapters") or [])

            elo_deltas = calculate_elo_updates(finished_parts, user_answers_map, q_elos)
            for uid, delta in elo_deltas.items():
                apply_match_elo_to_user(c, uid, delta, r_subjs, r_chaps)

            if room.get("tournament_id"):
                try:
                    from backend.app.routes.tournaments import check_and_advance_tournament_round
                    t_id = room["tournament_id"]
                    win_uid = finished_parts[0]["user_id"] if finished_parts else None
                    c.execute("SELECT player1_id, player2_id FROM tournament_matches WHERE tournament_id = ? AND room_code = ?", (t_id, code))
                    tm_row = c.fetchone()
                    if tm_row:
                        p1_s = next((p["score"] for p in finished_parts if p["user_id"] == tm_row["player1_id"]), 0)
                        p2_s = next((p["score"] for p in finished_parts if p["user_id"] == tm_row["player2_id"]), 0)
                        p1_m = next((p.get("marks") for p in finished_parts if p["user_id"] == tm_row["player1_id"]), float(p1_s))
                        p2_m = next((p.get("marks") for p in finished_parts if p["user_id"] == tm_row["player2_id"]), float(p2_s))
                    else:
                        p1_s = finished_parts[0]["score"] if finished_parts else 0
                        p2_s = finished_parts[1]["score"] if len(finished_parts) > 1 else 0
                        p1_m = finished_parts[0].get("marks") if finished_parts else 0.0
                        p2_m = finished_parts[1].get("marks") if len(finished_parts) > 1 else 0.0
                    c.execute("""
                        UPDATE tournament_matches
                        SET status = 'COMPLETED', winner_id = ?, player1_score = ?, player2_score = ?, player1_marks = ?, player2_marks = ?, completed_at = ?
                        WHERE tournament_id = ? AND room_code = ?
                    """, (win_uid, p1_s, p2_s, p1_m, p2_m, now, t_id, code))
                    check_and_advance_tournament_round(c, t_id)
                except Exception as e:
                    print(f"[TOURNAMENT] Error advancing tournament match: {e}")

    conn.commit()
    conn.close()

    event_data = {
        "user_id": user["id"],
        "username": user["username"],
        "question_index": new_idx,
        "is_finished": bool(is_finished),
        "total_questions": total_q
    }

    if room["mode"] == "SPEED_DUEL":
        event_data.update({
            "score": new_score,
            "delta_score": delta_score,
            "is_correct": is_correct
        })
        await room_hub.broadcast_to_room(code, "SCORE_SURGE", event_data)
    else:
        await room_hub.broadcast_to_room(code, "PLAYER_PROGRESS", event_data)

    if match_completed:
        await room_hub.broadcast_to_room(code, "MATCH_COMPLETED", {"completed_at": now})

    return {
        "is_correct": is_correct,
        "delta_score": delta_score,
        "delta_marks": delta_marks,
        "total_score": new_score,
        "total_marks": new_marks,
        "current_question_index": new_idx,
        "is_finished": bool(is_finished),
        "match_completed": match_completed,
        "next_question": next_question
    }


@router.get("/{code}/results")
def get_room_results(code: str, user: dict = Depends(get_current_user)):
    code = code.strip().upper()
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM rooms WHERE code = ?", (code,))
    room_row = c.fetchone()
    if not room_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")

    room = dict(room_row)
    room_id = room["id"]

    order_clause = "p.marks DESC, p.score DESC" if room.get("mode") == "MOCK_TEST" else "p.score DESC, p.marks DESC"
    c.execute(f"""
        SELECT p.*, u.username, u.avatar_id, u.title, u.overall_elo
        FROM room_participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.room_id = ?
        ORDER BY {order_clause}
    """, (room_id,))
    part_rows = [dict(r) for r in c.fetchall()]

    q_ids = json.loads(room["question_ids"])
    questions_data = []
    for q_id in q_ids:
        c.execute("SELECT * FROM questions WHERE id = ?", (q_id,))
        q_row = c.fetchone()
        if q_row:
            qd = dict(q_row)
            raw_formulas = qd.get("key_formulas")
            try:
                formulas = json.loads(raw_formulas) if isinstance(raw_formulas, str) else (raw_formulas or [])
            except Exception:
                formulas = []
            
            q_out = row_to_question_out(qd)
            sol_out = QuestionSolutionOut(
                id=qd["id"],
                correct_answer=qd["correct_answer"],
                solution_text=qd.get("solution_text"),
                key_formulas=formulas,
                common_pitfall=qd.get("common_pitfall")
            )
            questions_data.append({
                "question": q_out.dict(),
                "solution": sol_out.dict()
            })

    conn.close()

    total_q = room.get("total_questions") or len(q_ids) or 1
    participants_summary = []
    for idx, p in enumerate(part_rows, start=1):
        raw_ans = p.get("answers") or "{}"
        try:
            answers_dict = json.loads(raw_ans) if isinstance(raw_ans, str) else raw_ans
        except Exception:
            answers_dict = {}

        attempted_items = [
            v for v in answers_dict.values()
            if isinstance(v, dict) and v.get("selected") not in ("NONE", "SKIPPED", "", None) and v.get("attempted") is not False
        ]
        attempted_cnt = len(attempted_items)
        corr_cnt = sum(1 for v in attempted_items if v.get("correct"))
        acc = round((corr_cnt / attempted_cnt) * 100, 1) if attempted_cnt > 0 else 0.0

        participants_summary.append({
            "rank": idx,
            "user_id": p["user_id"],
            "username": p["username"],
            "avatar_id": p.get("avatar_id") or "default",
            "title": p.get("title") or "JEE Aspirant",
            "score": p["score"],
            "marks": p["marks"],
            "answers": answers_dict,
            "total_attempted": attempted_cnt,
            "correct_count": corr_cnt,
            "accuracy": acc,
            "is_finished": bool(p["is_finished"])
        })

    return {
        "room_code": code,
        "mode": room["mode"],
        "status": room["status"],
        "total_questions": total_q,
        "max_marks": float(total_q * 4),
        "participants": participants_summary,
        "questions": questions_data
    }
