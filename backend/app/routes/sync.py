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
        ("validation_flags", "TEXT DEFAULT '[]'")
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
                "subquestion_total": sub_tot
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

def invalidate_manifest_cache():
    """Invalidates the in-memory manifest cache so subsequent requests re-compute from database."""
    global _MANIFEST_CACHE
    _MANIFEST_CACHE = None


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
        diagram_filenames_to_check = set()
        if payload.clean_diagrams:
            for i in range(0, len(payload.question_ids), 100):
                chunk_q = payload.question_ids[i:i + 100]
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

        for i in range(0, len(payload.question_ids), 200):
            chunk = payload.question_ids[i:i + 200]
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


def _execute_admin_user_deletion(user_id: str, c):
    # 1. Activity logs and sessions
    c.execute("DELETE FROM activity_log WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM adaptive_sessions WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM user_rank_history WHERE user_id = ?", (user_id,))

    # 2. Mastery and FSRS memory
    c.execute("DELETE FROM user_chapter_elo WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM user_fsrs_states WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM question_bookmarks WHERE user_id = ?", (user_id,))

    # 3. Multiplayer rooms & tournaments
    c.execute("DELETE FROM room_participants WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM tournament_participants WHERE user_id = ?", (user_id,))

    # 4. Social graph: friendships, challenges, messages
    c.execute("DELETE FROM friends WHERE user_id = ? OR friend_id = ?", (user_id, user_id))
    c.execute("DELETE FROM direct_challenges WHERE sender_id = ? OR receiver_id = ?", (user_id, user_id))
    c.execute("DELETE FROM direct_messages WHERE sender_id = ? OR receiver_id = ?", (user_id, user_id))

    # 5. Notifications and update tracking
    c.execute("DELETE FROM user_notifications WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM user_update_reads WHERE user_id = ?", (user_id,))

    # 6. Primary user record
    c.execute("DELETE FROM users WHERE id = ?", (user_id,))


@router.delete("/users/{user_id}")
def admin_delete_user(user_id: str, x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, username FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found.")

    uname = row["username"]
    try:
        _execute_admin_user_deletion(user_id, c)
        conn.commit()
    finally:
        conn.close()

    try:
        from backend.app.database import backup_all_users
        backup_all_users()
    except Exception:
        pass

    return {
        "success": True,
        "message": f"Account '{uname}' ({user_id}) and all associated records permanently purged by admin.",
        "deleted_user_id": user_id,
        "deleted_username": uname
    }


@router.post("/users/delete")
def admin_delete_user_post(payload: AdminDeleteUserPayload, x_sync_token: Optional[str] = Header(None, alias="X-Sync-Token")):
    if not x_sync_token or x_sync_token != ADMIN_SYNC_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing sync authentication token."
        )

    conn = get_connection()
    c = conn.cursor()
    if payload.user_id:
        c.execute("SELECT id, username FROM users WHERE id = ?", (payload.user_id,))
    elif payload.username:
        c.execute("SELECT id, username FROM users WHERE username = ?", (payload.username,))
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Must provide user_id or username.")

    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")

    uid = row["id"]
    uname = row["username"]
    try:
        _execute_admin_user_deletion(uid, c)
        conn.commit()
    finally:
        conn.close()

    try:
        from backend.app.database import backup_all_users
        backup_all_users()
    except Exception:
        pass

    return {
        "success": True,
        "message": f"Account '{uname}' ({uid}) and all associated records permanently purged by admin.",
        "deleted_user_id": uid,
        "deleted_username": uname
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


