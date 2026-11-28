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

    # Fast path: Diagram-only sync requires no DB transactions or question re-processing
    if not payload.questions:
        invalidate_diagram_manifest_cache()
        return {
            "success": True,
            "synced_questions": 0,
            "synced_diagrams": saved_diagrams,
            "errors": []
        }

    # 2. Upsert questions into database
    conn = get_connection()
    c = conn.cursor()

    # Self-heal missing schema columns on target database
    c.execute("PRAGMA table_info(questions)")
    cols_info = c.fetchall()
    valid_cols = set()
    for row in cols_info:
        if isinstance(row, (dict, list, tuple)):
            valid_cols.add(row["name"] if isinstance(row, dict) else row[1])
        else:
            valid_cols.add(getattr(row, "name", row[1]))

    expected_q_cols = [
        ("target_exam", "TEXT DEFAULT 'MIXED'"),
        ("passage_id", "TEXT"),
        ("passage_title", "TEXT"),
        ("passage_text", "TEXT"),
        ("subquestion_index", "INTEGER DEFAULT 1"),
        ("subquestion_total", "INTEGER DEFAULT 1"),
        ("common_pitfall", "TEXT"),
        ("key_formulas", "TEXT"),
        ("source_book", "TEXT"),
        ("validation_status", "TEXT DEFAULT 'VALIDATED'"),
        ("validation_flags", "TEXT DEFAULT '[]'"),
        ("linked_chapters", "TEXT DEFAULT '[]'")
    ]
    for col_name, col_def in expected_q_cols:
        if col_name not in valid_cols:
            try:
                c.execute(f"ALTER TABLE questions ADD COLUMN {col_name} {col_def}")
                valid_cols.add(col_name)
            except Exception as e:
                print(f"[SYNC] Column self-heal notice ({col_name}): {e}")

    saved_questions = 0
    errors = []

    for q in payload.questions:
        try:
            q_id = q.get("id")
            if not q_id:
                continue

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
                try:
                    from backend.app.tools.sync_solution_keys import clean_derivation_text, extract_derived_key, normalize_to_options
                    clean_sol = clean_derivation_text(sol_text)
                    if clean_sol:
                        sol_text = clean_sol
                    if q_type not in ("COMPREHENSION", "SUBJECTIVE", "MATRIX_MATCH") and "," not in correct_ans and ";" not in correct_ans:
                        derived_key = extract_derived_key(sol_text, q_type, options_str)
                        if derived_key:
                            der_norm = normalize_to_options(derived_key.upper(), options_str)
                            cur_norm = normalize_to_options(correct_ans.upper(), options_str)
                            if der_norm and der_norm != cur_norm:
                                correct_ans = der_norm
                except Exception as ex_derive:
                    print(f"[SYNC] Non-critical derivation sanitize note for {q_id}: {ex_derive}")

            raw_formulas = q.get("key_formulas", [])
            formulas_str = raw_formulas if isinstance(raw_formulas, str) else json.dumps(raw_formulas)

            common_pitfall = q.get("common_pitfall", "")
            diff = q.get("difficulty_tier") or "MEDIUM"
            target_exam = q.get("target_exam") or "JEE_MAIN"
            passage_id = q.get("passage_id")
            passage_title = q.get("passage_title")
            passage_text = q.get("passage_text")
            sub_idx = q.get("subquestion_index")
            sub_tot = q.get("subquestion_total")
            raw_linked = q.get("linked_chapters", [])
            linked_str = raw_linked if isinstance(raw_linked, str) else json.dumps(raw_linked)

            raw_elo = q.get("elo_rating")
            try:
                if raw_elo and int(float(raw_elo)) not in (1350, 1500, 1850):
                    elo = int(float(raw_elo))
                else:
                    from backend.app.tools.elo_engine import compute_seed_elo
                    elo = compute_seed_elo(q_id, target_exam, diff, q_type)
            except Exception:
                elo = 1500

            data_map = {
                "id": q_id,
                "subject": subject,
                "unit": unit,
                "chapter": chapter,
                "question_type": q_type,
                "text": text,
                "options": options_str,
                "has_diagram": has_diag,
                "diagram_urls": urls_str,
                "correct_answer": correct_ans,
                "solution_text": sol_text,
                "key_formulas": formulas_str,
                "common_pitfall": common_pitfall,
                "difficulty_tier": diff,
                "elo_rating": elo,
                "target_exam": target_exam,
                "passage_id": passage_id,
                "passage_title": passage_title,
                "passage_text": passage_text,
                "subquestion_index": sub_idx,
                "subquestion_total": sub_tot,
                "linked_chapters": linked_str
            }

            active_cols = [col for col in data_map.keys() if col in valid_cols]
            placeholders = ", ".join(["?"] * len(active_cols))
            update_clause = ", ".join([f"{col} = excluded.{col}" for col in active_cols if col != "id"])
            values = [data_map[c_name] for c_name in active_cols]

            c.execute(f"""
                INSERT INTO questions ({', '.join(active_cols)})
                VALUES ({placeholders})
                ON CONFLICT(id) DO UPDATE SET {update_clause}
            """, values)
            saved_questions += 1
        except Exception as e:
            err_msg = f"Q {q.get('id')}: {type(e).__name__} - {e}"
            print(f"[SYNC] Error upserting question {q.get('id')}: {e}")
            if len(errors) < 5:
                errors.append(err_msg)

    conn.commit()
    conn.close()

    try:
        from backend.app.tools.question_cache import invalidate_question_cache
        invalidate_question_cache()
    except Exception as e:
        print(f"[SYNC] Error invalidating question cache: {e}")

    invalidate_manifest_cache()

    return {
        "success": True,
        "synced_questions": saved_questions,
        "synced_diagrams": saved_diagrams,
        "errors": errors
    }


class QuestionBatchDeletePayload(BaseModel):
    question_ids: List[str]
    clean_diagrams: bool = True


_MANIFEST_CACHE: Optional[Dict[str, Any]] = None
_DIAGRAM_MANIFEST_CACHE: Optional[Dict[str, Any]] = None

def invalidate_manifest_cache():
    """Invalidates the in-memory manifest cache so subsequent requests re-compute from database."""
    global _MANIFEST_CACHE, _DIAGRAM_MANIFEST_CACHE
    _MANIFEST_CACHE = None
    _DIAGRAM_MANIFEST_CACHE = None

def invalidate_diagram_manifest_cache():
    """Invalidates diagram manifest cache."""
    global _DIAGRAM_MANIFEST_CACHE
    _DIAGRAM_MANIFEST_CACHE = None


def get_or_build_diagram_manifest() -> Dict[str, Any]:
    """Returns cached diagram inventory with file sizes and MD5 hashes."""
    global _DIAGRAM_MANIFEST_CACHE
    if _DIAGRAM_MANIFEST_CACHE is not None:
        return _DIAGRAM_MANIFEST_CACHE

    import hashlib
    diags = {}
    if DIAGRAMS_DIR.exists():
        for p in DIAGRAMS_DIR.glob("*.png"):
            try:
                st = p.stat()
                with open(p, "rb") as f:
                    h = hashlib.md5(f.read()).hexdigest()
                diags[p.name] = {"size": st.st_size, "md5": h}
            except Exception:
                pass

    _DIAGRAM_MANIFEST_CACHE = {
        "total": len(diags),
        "diagrams": diags
    }
    return _DIAGRAM_MANIFEST_CACHE


def get_or_build_manifest() -> Dict[str, Any]:
    """Returns the cached complete manifest dictionary, building it from sqlite if not yet cached."""
    global _MANIFEST_CACHE
    if _MANIFEST_CACHE is not None:
        return _MANIFEST_CACHE

    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT id, text, correct_answer, options, solution_text, chapter, unit, subject,
               difficulty_tier, target_exam, question_type, has_diagram, diagram_urls
        FROM questions
    """)
    rows = c.fetchall()
    conn.close()

    import hashlib
    from backend.app.tools.sync_solution_keys import clean_derivation_text

    ids = []
    hashes = {}
    for r in rows:
        qid = r["id"]
        ids.append(qid)
        sol = clean_derivation_text(r["solution_text"] or "")
        parts = [
            str(r["text"] or "").strip(),
            str(r["correct_answer"] or "").strip().upper(),
            str(r["options"] or "").strip(),
            str(sol).strip(),
            str(r["chapter"] or "").strip(),
            str(r["unit"] or "").strip(),
            str(r["subject"] or "").strip(),
            str(r["difficulty_tier"] or "").strip().upper(),
            str(r["target_exam"] or "").strip().upper(),
            str(r["question_type"] or "").strip().upper(),
            str(1 if r["has_diagram"] else 0),
            str(r["diagram_urls"] or "").strip(),
        ]
        raw = "|".join(parts)
        hashes[qid] = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    _MANIFEST_CACHE = {
        "total": len(ids),
        "ids": ids,
        "filtered": False,
        "subject": None,
        "chapter": None,
        "hashes": hashes
    }
    return _MANIFEST_CACHE


@router.get("/question-ids")
def get_existing_question_ids(
    subject: Optional[str] = None,
    chapter: Optional[str] = None,
    include_hashes: bool = True,
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    """
    Returns question IDs and content checksum hashes currently stored on the cloud server
    (optionally filtered by subject/chapter) for intelligent zero-force delta sync.
    Serves from in-memory cache in sub-millisecond time.
    """
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    # Fast path: Unfiltered full manifest served directly from memory cache
    if not subject and not chapter and include_hashes:
        return get_or_build_manifest()

    conn = get_connection()
    c = conn.cursor()

    if include_hashes:
        query = """
            SELECT id, text, correct_answer, options, solution_text, chapter, unit, subject,
                   difficulty_tier, target_exam, question_type, has_diagram, diagram_urls
            FROM questions WHERE 1=1
        """
    else:
        query = "SELECT id FROM questions WHERE 1=1"

    params = []
    if subject:
        query += " AND LOWER(subject) = ?"
        params.append(subject.strip().lower())
    if chapter:
        query += " AND LOWER(chapter) = ?"
        params.append(chapter.strip().lower())

    c.execute(query, tuple(params))
    rows = c.fetchall()
    conn.close()

    ids = []
    hashes = {}

    if include_hashes:
        import hashlib
        from backend.app.tools.sync_solution_keys import clean_derivation_text
        for r in rows:
            qid = r["id"]
            ids.append(qid)
            sol = clean_derivation_text(r["solution_text"] or "")
            parts = [
                str(r["text"] or "").strip(),
                str(r["correct_answer"] or "").strip().upper(),
                str(r["options"] or "").strip(),
                str(sol).strip(),
                str(r["chapter"] or "").strip(),
                str(r["unit"] or "").strip(),
                str(r["subject"] or "").strip(),
                str(r["difficulty_tier"] or "").strip().upper(),
                str(r["target_exam"] or "").strip().upper(),
                str(r["question_type"] or "").strip().upper(),
                str(1 if r["has_diagram"] else 0),
                str(r["diagram_urls"] or "").strip(),
            ]
            raw = "|".join(parts)
            hashes[qid] = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    else:
        ids = [r[0] for r in rows]

    res = {
        "total": len(ids),
        "ids": ids,
        "filtered": bool(subject or chapter),
        "subject": subject,
        "chapter": chapter
    }
    if include_hashes:
        res["hashes"] = hashes
    return res


@router.get("/diagram-manifest")
def get_diagram_manifest_endpoint(
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    """
    Returns inventory of diagram files currently stored on the cloud server
    with file sizes and MD5 checksums for instant zero-force delta sync of diagrams.
    """
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )
    return get_or_build_diagram_manifest()


@router.get("/question-manifest")
def get_question_manifest(
    subject: Optional[str] = None,
    chapter: Optional[str] = None,
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    """Dedicated endpoint returning question IDs mapped to their content checksums for zero-bandwidth delta syncing."""
    return get_existing_question_ids(subject=subject, chapter=chapter, include_hashes=True, x_sync_token=x_sync_token)


@router.post("/questions/delete-batch")
def delete_questions_batch(
    payload: QuestionBatchDeletePayload,
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    """
    Deletes a list of questions by ID from the cloud database and removes orphaned diagram files.
    Used by 'jee cloud push --delete' to prune questions removed locally.
    """
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    if not payload.question_ids:
        return {"success": True, "deleted_count": 0, "cleaned_diagrams": 0}

    from pathlib import Path
    conn = get_connection()
    c = conn.cursor()
    deleted_count = 0
    cleaned_diagrams = 0

    try:
        # Referential integrity safeguard:
        # Never delete questions that are actively referenced in any past or active exams (rooms or scheduled_tests).
        # This prevents historic test scorecards, papers, and answer keys from losing questions or corrupting marks!
        safe_delete_ids = list(payload.question_ids)
        try:
            c.execute("SELECT question_ids FROM rooms")
            used_qids = set()
            for r_row in c.fetchall():
                raw_qids = r_row[0]
                if raw_qids:
                    try:
                        q_parsed = json.loads(raw_qids) if isinstance(raw_qids, str) else raw_qids
                        if isinstance(q_parsed, list):
                            for qid_val in q_parsed:
                                used_qids.add(str(qid_val))
                    except Exception:
                        pass
            
            c.execute("SELECT question_ids FROM scheduled_tests")
            for st_row in c.fetchall():
                raw_st = st_row[0]
                if raw_st:
                    try:
                        st_parsed = json.loads(raw_st) if isinstance(raw_st, str) else raw_st
                        if isinstance(st_parsed, list):
                            for qid_val in st_parsed:
                                used_qids.add(str(qid_val))
                    except Exception:
                        pass

            protected_count = sum(1 for qid in safe_delete_ids if str(qid) in used_qids)
            if protected_count > 0:
                print(f"[SYNC] Safeguard preserved {protected_count} question(s) referenced in candidate test history.")
                safe_delete_ids = [qid for qid in safe_delete_ids if str(qid) not in used_qids]
        except Exception as guard_err:
            print(f"[SYNC] Protected question scan note: {guard_err}")

        if not safe_delete_ids:
            return {"success": True, "deleted_count": 0, "cleaned_diagrams": 0, "note": "All requested questions preserved by exam history safeguard."}

        diagram_filenames_to_check = set()
        if payload.clean_diagrams:
            for i in range(0, len(safe_delete_ids), 100):
                chunk_q = safe_delete_ids[i:i + 100]
                placeholders = ",".join(["?"] * len(chunk_q))
                c.execute(f"SELECT diagram_urls FROM questions WHERE id IN ({placeholders}) AND has_diagram = 1", chunk_q)
                for r in c.fetchall():
                    raw = r[0]
                    if raw:
                        try:
                            urls = json.loads(raw) if isinstance(raw, str) else raw
                            for u in urls:
                                fn = Path(str(u).replace("\\", "/")).name
                                if fn:
                                    diagram_filenames_to_check.add(fn)
                        except Exception:
                            pass

        for i in range(0, len(safe_delete_ids), 200):
            chunk = safe_delete_ids[i:i + 200]
            placeholders = ",".join(["?"] * len(chunk))
            c.execute(f"DELETE FROM questions WHERE id IN ({placeholders})", chunk)
            deleted_count += getattr(c, "rowcount", len(chunk))

        if payload.clean_diagrams and diagram_filenames_to_check:
            for fn in diagram_filenames_to_check:
                try:
                    c.execute("SELECT COUNT(*) FROM questions WHERE diagram_urls LIKE ? LIMIT 1", (f"%{fn}%",))
                    still_used = c.fetchone()[0]
                    if not still_used:
                        fpath = DIAGRAMS_DIR / fn
                        if fpath.is_file():
                            fpath.unlink(missing_ok=True)
                            cleaned_diagrams += 1
                except Exception:
                    pass

        conn.commit()
    finally:
        conn.close()

    try:
        from backend.app.tools.question_cache import invalidate_question_cache
        invalidate_question_cache()
    except Exception as e:
        print(f"[SYNC] Error invalidating question cache after delete: {e}")

    invalidate_manifest_cache()

    return {
        "success": True,
        "deleted_count": deleted_count,
        "cleaned_diagrams": cleaned_diagrams
    }



class AdminDeleteUserPayload(BaseModel):
    user_id: Optional[str] = None
    username: Optional[str] = None


@router.get("/users")
def get_admin_users(
    include_auth: bool = False,
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users ORDER BY overall_elo DESC, created_at DESC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    users = []
    for r in rows:
        solved = r.get("total_solved") or 0
        correct = r.get("total_correct") or 0
        acc = round((correct / solved * 100), 1) if solved > 0 else 0.0
        u_dict = {
            "id": r["id"],
            "username": r["username"],
            "overall_elo": round(float(r.get("overall_elo") or 1200.0), 1),
            "physics_elo": round(float(r.get("physics_elo") or 1200.0), 1),
            "chemistry_elo": round(float(r.get("chemistry_elo") or 1200.0), 1),
            "math_elo": round(float(r.get("math_elo") or 1200.0), 1),
            "division": r.get("current_division") or "BRONZE",
            "weekly_rp": r.get("weekly_rp") or 0,
            "total_solved": solved,
            "total_correct": correct,
            "accuracy": acc,
            "medals": {
                "gold": r.get("gold_medals") or 0,
                "silver": r.get("silver_medals") or 0,
                "bronze": r.get("bronze_medals") or 0
            },
            "created_at": r.get("created_at"),
            "last_active": r.get("last_active"),
            "target_college": r.get("target_college") or "IIT Bombay",
            "target_exam": r.get("target_exam") or "JEE_MAIN",
            "streak": r.get("current_streak") or 0,
            "longest_streak": r.get("longest_streak") or 0,
            "bio": r.get("bio") or ""
        }
        if include_auth:
            u_dict["pin_hash"] = r.get("pin_hash")
            u_dict["avatar_id"] = r.get("avatar_id") or "flame"
            u_dict["title"] = r.get("title") or "JEE Aspirant"
            u_dict["chapter_stats"] = r.get("chapter_stats") or "{}"
            u_dict["learnt_chapters"] = r.get("learnt_chapters") or "[]"
            u_dict["chat_settings"] = r.get("chat_settings") or "{}"
            u_dict["banner_theme"] = r.get("banner_theme") or "orange_cyber"
            u_dict["pinned_badges"] = r.get("pinned_badges") or '["elo_bronze", "first_blood"]'
            u_dict["target_exam_date"] = r.get("target_exam_date") or "JEE Main Jan 2026"
            u_dict["streak_freezes"] = r.get("streak_freezes") or 0
            u_dict["streak_history"] = r.get("streak_history") or "[]"

        users.append(u_dict)

    return {"users": users, "total": len(users)}


class UserUpsertPayload(BaseModel):
    users: List[Dict[str, Any]]


@router.post("/users/upsert")
def upsert_admin_users(
    payload: UserUpsertPayload,
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    conn = get_connection()
    c = conn.cursor()
    c.execute("PRAGMA table_info(users)")
    valid_cols = {row["name"] for row in c.fetchall()}

    upserted = 0
    for u in payload.users:
        if not u.get("id") or not u.get("username"):
            continue
        record = {k: v for k, v in u.items() if k in valid_cols}
        cols = list(record.keys())
        placeholders = ", ".join(["?"] * len(cols))
        update_clause = ", ".join([f"{col} = excluded.{col}" for col in cols if col != "id"])
        sql = f"""
            INSERT INTO users ({', '.join(cols)})
            VALUES ({placeholders})
            ON CONFLICT(id) DO UPDATE SET {update_clause}
        """
        c.execute(sql, list(record.values()))
        upserted += 1

    conn.commit()
    conn.close()

    try:
        from backend.app.database import backup_all_users
        backup_all_users()
    except Exception:
        pass

    return {"success": True, "upserted_count": upserted}


@router.delete("/users/{user_id}")
def admin_delete_user(user_id: str, x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    from backend.app.tools.security_engine import purge_user_account
    try:
        res = purge_user_account(user_id, reason="admin_gui_purge")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {
        "success": True,
        "message": f"Account '{res['username']}' ({res['user_id']}) and all associated records permanently purged by admin.",
        "deleted_user_id": res["user_id"],
        "deleted_username": res["username"]
    }


@router.post("/users/delete")
def admin_delete_user_post(payload: AdminDeleteUserPayload, x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    target = payload.user_id or payload.username
    if not target:
        raise HTTPException(status_code=400, detail="Must provide user_id or username.")

    from backend.app.tools.security_engine import purge_user_account
    try:
        res = purge_user_account(target, reason="admin_gui_purge")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {
        "success": True,
        "message": f"Account '{res['username']}' ({res['user_id']}) and all associated records permanently purged by admin.",
        "deleted_user_id": res["user_id"],
        "deleted_username": res["username"]
    }


@router.post("/season/trigger-reset")
def trigger_admin_season_reset(
    force: bool = False,
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )
    from backend.app.tools.season_engine import check_and_execute_season_rollover
    res = check_and_execute_season_rollover(force=force)
    return {"success": True, "result": res}


@router.get("/season/status")
def get_admin_season_status(
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )
    from backend.app.tools.season_engine import get_current_season_meta
    return get_current_season_meta()


@router.post("/daily-goal/reconcile")
def reconcile_admin_daily_goals(
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )
    from backend.app.tools.daily_goal_engine import reconcile_all_users_daily_goal
    res = reconcile_all_users_daily_goal()
    return {"success": True, "result": res}


@router.get("/daily-goal/inspect")
def inspect_admin_daily_goals(
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )
    conn = get_connection()
    c = conn.cursor()
    from backend.app.tools.daily_goal_engine import get_ist_today_boundaries, compute_today_solved_count
    today_str, start_utc_iso = get_ist_today_boundaries()
    c.execute("SELECT id, username, total_solved, daily_question_goal, daily_goal_solved, daily_goal_date, last_active FROM users")
    users = [dict(r) for r in c.fetchall()]
    dossier = []
    for u in users:
        detected = compute_today_solved_count(u["id"], c)
        dossier.append({
            "username": u["username"],
            "daily_question_goal": u.get("daily_question_goal") or 60,
            "current_daily_goal_solved": u.get("daily_goal_solved") or 0,
            "detected_today_solved": detected,
            "daily_goal_date": u.get("daily_goal_date"),
            "last_active": u.get("last_active")
        })
    conn.close()
    return {"today_ist": today_str, "start_utc_iso": start_utc_iso, "users": dossier}

@router.post("/rooms/{code}/reconcile-marks")
def admin_reconcile_room_marks(
    code: str,
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, mode FROM rooms WHERE UPPER(code) = UPPER(?)", (code,))
    rm = c.fetchone()
    if not rm:
        conn.close()
        raise HTTPException(status_code=404, detail="Room not found.")
    rm_id = rm["id"]

    from backend.app.routes.rooms import get_room_results
    results = get_room_results(code=code)

    c.execute("SELECT user_id, marks, score, answers FROM room_participants WHERE room_id = ?", (rm_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"success": True, "room_code": code, "participants": rows, "results_participants": results.get("participants")}


@router.get("/scheduled-tests/{test_id}/audit")
def admin_audit_scheduled_test(
    test_id: str,
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    """
    Spoiler-free metadata & formatting audit for a scheduled test's assigned questions.
    Returns only structural/syllabus/formatting diagnostics without question text or answers.
    """
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, title, room_id, subjects, chapters, total_questions FROM scheduled_tests WHERE id = ?", (test_id,))
    st = c.fetchone()
    if not st:
        conn.close()
        raise HTTPException(status_code=404, detail="Scheduled test not found.")

    st_dict = dict(st)
    c.execute("SELECT question_ids FROM rooms WHERE id = ?", (st_dict["room_id"],))
    rm = c.fetchone()
    if not rm or not rm["question_ids"]:
        conn.close()
        raise HTTPException(status_code=404, detail="Room question_ids not found.")

    q_ids = json.loads(rm["question_ids"]) if isinstance(rm["question_ids"], str) else rm["question_ids"]
    placeholders = ",".join("?" for _ in q_ids)
    c.execute(f"SELECT * FROM questions WHERE id IN ({placeholders})", tuple(q_ids))
    q_map = {r["id"]: dict(r) for r in c.fetchall()}
    conn.close()

    audit_items = []
    for idx, qid in enumerate(q_ids, 1):
        q = q_map.get(qid)
        if not q:
            audit_items.append({"index": idx, "id": qid, "missing_from_db": True})
            continue

        txt = str(q.get("text") or "")
        opts_raw = q.get("options") or "[]"
        try:
            opts = json.loads(opts_raw) if isinstance(opts_raw, str) else opts_raw
        except Exception:
            opts = []
        lk_raw = q.get("linked_chapters") or "[]"
        try:
            lk = json.loads(lk_raw) if isinstance(lk_raw, str) else lk_raw
        except Exception:
            lk = []
        diag_raw = q.get("diagram_urls") or "[]"
        try:
            diags = json.loads(diag_raw) if isinstance(diag_raw, str) else diag_raw
        except Exception:
            diags = []

        issues = []
        if not txt.strip():
            issues.append("empty_text")
        if txt.count("$") % 2 != 0:
            issues.append("unclosed_dollar_latex")
        qtype = str(q.get("question_type") or "").upper()
        if qtype != "NUMERICAL" and (not isinstance(opts, list) or len(opts) < 2):
            issues.append("missing_or_insufficient_options")
        if not str(q.get("correct_answer") or "").strip():
            issues.append("missing_correct_answer")
        if q.get("has_diagram") and (not isinstance(diags, list) or len(diags) == 0):
            issues.append("missing_diagram_urls")
        if str(q.get("validation_status") or "").upper() != "VALIDATED":
            issues.append(f"status_{q.get('validation_status')}")

        audit_items.append({
            "index": idx,
            "id": qid,
            "subject": q.get("subject"),
            "chapter": q.get("chapter"),
            "linked_chapters": lk,
            "question_type": qtype,
            "validation_status": q.get("validation_status"),
            "has_diagram": bool(q.get("has_diagram")),
            "diagram_count": len(diags) if isinstance(diags, list) else 0,
            "issues": issues,
        })

    return {
        "test_id": st_dict["id"],
        "title": st_dict["title"],
        "subjects": json.loads(st_dict["subjects"]) if isinstance(st_dict["subjects"], str) else st_dict["subjects"],
        "chapters": json.loads(st_dict["chapters"]) if isinstance(st_dict["chapters"], str) else st_dict["chapters"],
        "total_questions": len(q_ids),
        "questions": audit_items,
    }


@router.post("/reports/revert-batch")
def admin_revert_approved_reports(
    since_iso: str = "2026-11-28T07:20:00",
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        UPDATE question_reports
        SET status = 'PENDING', resolved_at = NULL, resolved_by = NULL
        WHERE status = 'APPROVED' AND resolved_by = 'Admin (GUI)' AND resolved_at >= ?
    """, (since_iso,))
    reverted_reports = c.rowcount

    c.execute("""
        DELETE FROM user_notifications
        WHERE type = 'REPORT_APPROVED' AND created_at >= ?
    """, (since_iso,))
    deleted_notifs = c.rowcount

    conn.commit()
    conn.close()
    return {
        "success": True,
        "reverted_reports": reverted_reports,
        "deleted_notifications": deleted_notifs,
    }


@router.post("/reconcile-scores")
def admin_reconcile_scores(
    user_id: Optional[str] = None,
    room_code: Optional[str] = None,
    dry_run: bool = False,
    x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")
):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    from backend.app.routes.rooms import is_answer_correct

    conn = get_connection()
    c = conn.cursor()

    # 1. Reset any lingering APPROVED reports on question_reports that would re-trigger dropped marks in get_room_results
    cleared_reports = 0
    if not dry_run:
        c.execute("""
            UPDATE question_reports
            SET status = 'PENDING', resolved_at = NULL, resolved_by = NULL
            WHERE status = 'APPROVED' AND resolved_by = 'Admin (GUI)'
        """)
        cleared_reports = c.rowcount

    # 2. Select target rooms
    if room_code:
        c.execute("""
            SELECT id, code, mode, base_correct_score, negative_marking, question_ids
            FROM rooms
            WHERE UPPER(code) = UPPER(?) AND status != 'DELETED'
        """, (room_code.strip(),))
    else:
        c.execute("""
            SELECT id, code, mode, base_correct_score, negative_marking, question_ids
            FROM rooms
            WHERE status != 'DELETED'
        """)
    rooms = [dict(r) for r in c.fetchall()]

    reconciliation_results = []
    total_participants_updated = 0

    for rm in rooms:
        rm_id = rm["id"]
        rm_code = rm.get("code") or ""
        base_score = float(rm.get("base_correct_score") or 100.0)
        neg_penalty = float(rm.get("negative_marking") or -25.0)

        raw_qids = rm.get("question_ids") or "[]"
        try:
            q_ids = json.loads(raw_qids) if isinstance(raw_qids, str) else raw_qids
        except Exception:
            q_ids = []

        if not q_ids:
            continue

        # Batch load questions metadata
        placeholders = ",".join("?" for _ in q_ids)
        c.execute(f"""
            SELECT id, correct_answer, question_type, validation_status
            FROM questions
            WHERE id IN ({placeholders})
        """, tuple(str(x) for x in q_ids))
        q_map = {str(row["id"]): dict(row) for row in c.fetchall()}

        defective_qids = {
            qid for qid, q in q_map.items()
            if (q.get("validation_status") or "").upper() == "QUARANTINED"
        }
        if "eff5b1bc-a730-4423-b9c3-34423a407bbc" in [str(x) for x in q_ids]:
            defective_qids.add("eff5b1bc-a730-4423-b9c3-34423a407bbc")

        # Fetch participants
        if user_id:
            c.execute("""
                SELECT user_id, answers, score, marks
                FROM room_participants
                WHERE room_id = ? AND user_id = ?
            """, (rm_id, user_id))
        else:
            c.execute("""
                SELECT user_id, answers, score, marks
                FROM room_participants
                WHERE room_id = ?
            """, (rm_id,))
        participants = [dict(p) for p in c.fetchall()]

        for p in participants:
            p_uid = p["user_id"]
            raw_ans = p.get("answers") or "{}"
            try:
                ans_map = json.loads(raw_ans) if isinstance(raw_ans, str) else (raw_ans or {})
            except Exception:
                ans_map = {}

            if not isinstance(ans_map, dict):
                ans_map = {}

            old_marks = float(p["marks"] if p.get("marks") is not None else 0.0)
            old_score = float(p["score"] if p.get("score") is not None else 0.0)

            new_marks = 0.0
            new_score = 0
            altered_items = []
            modified_ans = dict(ans_map)

            for qid in q_ids:
                qid_str = str(qid)
                q_info = q_map.get(qid_str)
                if not q_info:
                    continue

                q_sub = modified_ans.get(qid_str)
                if qid_str in defective_qids:
                    # Legitimate quarantined defective question
                    if isinstance(q_sub, dict):
                        q_sub["correct"] = True
                        q_sub["is_dropped"] = True
                        q_sub["delta_marks"] = 4.0
                        q_sub["delta_score"] = int(base_score)
                    else:
                        q_sub = {
                            "selected": str(q_sub or "SKIPPED"),
                            "correct": True,
                            "is_dropped": True,
                            "delta_marks": 4.0,
                            "delta_score": int(base_score)
                        }
                    modified_ans[qid_str] = q_sub
                    new_marks += 4.0
                    new_score += int(base_score)
                    continue

                # Standard question: strip any illegitimate is_dropped flags
                user_sel = None
                was_att = False
                time_spent = 0
                if isinstance(q_sub, dict):
                    user_sel = q_sub.get("selected")
                    was_att = user_sel not in ("NONE", "SKIPPED", "", None) and q_sub.get("attempted") is not False
                    time_spent = q_sub.get("time_spent") or q_sub.get("time_spent_seconds") or 0
                    had_dropped = bool(q_sub.get("is_dropped"))
                else:
                    user_sel = str(q_sub or "")
                    was_att = user_sel not in ("NONE", "SKIPPED", "", None)
                    had_dropped = False

                if not was_att:
                    # Skipped question
                    d_marks = 0.0
                    d_score = 0
                    is_corr = False
                    user_entry = {
                        "selected": "SKIPPED",
                        "correct": False,
                        "delta_marks": d_marks,
                        "delta_score": d_score,
                    }
                    if time_spent:
                        user_entry["time_spent"] = time_spent
                        user_entry["time_spent_seconds"] = time_spent
                    modified_ans[qid_str] = user_entry
                else:
                    # Attempted question: evaluate authentic key
                    c_key = q_info.get("correct_answer") or ""
                    q_type = q_info.get("question_type") or "MCQ"
                    is_corr = is_answer_correct(str(user_sel), str(c_key), str(q_type))
                    if is_corr:
                        d_marks = 4.0
                        d_score = int(base_score)
                    else:
                        d_marks = -1.0
                        d_score = int(neg_penalty)

                    user_entry = {
                        "selected": user_sel,
                        "correct": is_corr,
                        "delta_marks": d_marks,
                        "delta_score": d_score,
                    }
                    if time_spent:
                        user_entry["time_spent"] = time_spent
                        user_entry["time_spent_seconds"] = time_spent
                    modified_ans[qid_str] = user_entry

                if had_dropped:
                    altered_items.append({
                        "question_id": qid_str,
                        "was_dropped": True,
                        "now_correct": is_corr,
                        "delta_marks": d_marks
                    })

                new_marks += d_marks
                new_score += d_score

            marks_diff = round(new_marks - old_marks, 2)
            score_diff = round(new_score - old_score, 2)

            if abs(marks_diff) > 0.01 or abs(score_diff) > 0.01 or altered_items:
                reconciliation_results.append({
                    "room_code": rm_code,
                    "user_id": p_uid,
                    "old_marks": old_marks,
                    "new_marks": new_marks,
                    "marks_diff": marks_diff,
                    "old_score": old_score,
                    "new_score": new_score,
                    "score_diff": score_diff,
                    "reverted_questions_count": len(altered_items),
                })
                if not dry_run:
                    c.execute("""
                        UPDATE room_participants
                        SET marks = ?, score = ?, answers = ?
                        WHERE room_id = ? AND user_id = ?
                    """, (new_marks, new_score, json.dumps(modified_ans), rm_id, p_uid))
                    total_participants_updated += 1

    # Clean up spurious dropped notifications if not dry run
    deleted_dropped_notifs = 0
    if not dry_run:
        c.execute("""
            DELETE FROM user_notifications
            WHERE type IN ('DROPPED_QUESTION_AWARD', 'REPORT_APPROVED')
              AND created_at >= '2026-11-28T07:00:00'
        """)
        deleted_dropped_notifs = c.rowcount
        conn.commit()

    conn.close()

    return {
        "success": True,
        "dry_run": dry_run,
        "cleared_reports": cleared_reports,
        "total_participants_updated": total_participants_updated,
        "deleted_dropped_notifications": deleted_dropped_notifs,
        "changes": reconciliation_results,
    }
