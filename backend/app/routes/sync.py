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
                from backend.app.tools.sync_solution_keys import clean_derivation_text, extract_derived_key, normalize_to_options
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
            u_dict["streak_freezes"] = r.get("streak_freezes") or 1
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

