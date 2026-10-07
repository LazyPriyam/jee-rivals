import json
import math
import uuid
import datetime
import random
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.app.database import get_connection
from backend.app.auth import get_current_user, get_optional_user
from backend.app.models import TournamentCreateRequest
from backend.app.routes.rooms import generate_room_code
from backend.app.tools.question_verifier import audit_and_heal_question

router = APIRouter(prefix="/api/tournaments", tags=["Tournaments"])


def get_tournament_full(cursor, tournament_id: str, current_user_id: Optional[str] = None) -> dict:
    cursor.execute("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    t_row = cursor.fetchone()
    if not t_row:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    tournament = dict(t_row)

    # Participants
    cursor.execute("""
        SELECT tp.*, u.overall_elo, u.title, u.current_division
        FROM tournament_participants tp
        LEFT JOIN users u ON tp.user_id = u.id
        WHERE tp.tournament_id = ?
        ORDER BY tp.seed ASC, tp.joined_at ASC
    """, (tournament_id,))
    participants = [dict(r) for r in cursor.fetchall()]

    # Matches
    cursor.execute("""
        SELECT m.*,
               u1.username as player1_name, u1.avatar_id as player1_avatar,
               u2.username as player2_name, u2.avatar_id as player2_avatar,
               w.username as winner_name
        FROM tournament_matches m
        LEFT JOIN users u1 ON m.player1_id = u1.id
        LEFT JOIN users u2 ON m.player2_id = u2.id
        LEFT JOIN users w ON m.winner_id = w.id
        WHERE m.tournament_id = ?
        ORDER BY m.round_number ASC, m.match_index ASC
    """, (tournament_id,))
    matches = [dict(r) for r in cursor.fetchall()]

    # Group matches by round
    rounds_map = {}
    for m in matches:
        rnd = m["round_number"]
        if rnd not in rounds_map:
            rounds_map[rnd] = []
        rounds_map[rnd].append(m)

    # Find active match for current user
    user_active_match = None
    if current_user_id:
        for m in matches:
            if m["round_number"] == tournament["current_round"] and m["status"] in ("READY", "IN_PROGRESS"):
                if m["player1_id"] == current_user_id or m["player2_id"] == current_user_id:
                    user_active_match = m
                    break

    # Winner details if completed
    winner_info = None
    if tournament.get("winner_id"):
        cursor.execute("SELECT id, username, avatar_id, title, overall_elo FROM users WHERE id = ?", (tournament["winner_id"],))
        w_row = cursor.fetchone()
        if w_row:
            winner_info = dict(w_row)

    runner_up_info = None
    if tournament.get("runner_up_id"):
        cursor.execute("SELECT id, username, avatar_id, title, overall_elo FROM users WHERE id = ?", (tournament["runner_up_id"],))
        ru_row = cursor.fetchone()
        if ru_row:
            runner_up_info = dict(ru_row)

    return {
        **tournament,
        "participants": participants,
        "participant_count": len(participants),
        "matches": matches,
        "rounds": [{"round_number": r, "matches": m_list} for r, m_list in sorted(rounds_map.items())],
        "user_active_match": user_active_match,
        "winner": winner_info,
        "runner_up": runner_up_info,
        "is_organizer": current_user_id == tournament["organizer_id"] if current_user_id else False,
        "is_registered": any(p["user_id"] == current_user_id for p in participants) if current_user_id else False,
    }


def create_match_room_helper(cursor, tournament: dict, player1_id: str, player2_id: str, round_num: int, match_idx: int) -> str:
    """Helper to generate a synchronized Speed Duel room for a 1v1 tournament clash."""
    room_code = generate_room_code()
    now = datetime.datetime.utcnow().isoformat()
    room_id = f"rm_{uuid.uuid4().hex[:12]}"

    # Pick questions based on tournament syllabus
    subj = tournament.get("subject", "Full Syllabus")
    target_exam = tournament.get("target_exam", "MIXED")
    q_count = max(3, int(tournament.get("question_count", 5)))
    oversample = min(q_count * 3, 50)

    base_where = "solution_text IS NOT NULL AND solution_text != '' AND (validation_status IS NULL OR validation_status != 'QUARANTINED')"
    query = f"SELECT * FROM questions WHERE {base_where}"
    params = []
    if subj and subj != "Full Syllabus":
        query += " AND subject = ?"
        params.append(subj)
    if target_exam and target_exam != "MIXED":
        query += " AND target_exam = ?"
        params.append(target_exam)

    query += " ORDER BY RANDOM() LIMIT ?"
    params.append(oversample)

    cursor.execute(query, params)
    q_rows = [dict(r) for r in cursor.fetchall()]

    verified_q_ids = []
    for r in q_rows:
        is_valid, healed_q, _ = audit_and_heal_question(r)
        if is_valid and healed_q:
            verified_q_ids.append(healed_q["id"])
            if len(verified_q_ids) >= q_count:
                break

    # Fallback if too few questions matched
    if len(verified_q_ids) < q_count:
        cursor.execute(f"SELECT * FROM questions WHERE {base_where} ORDER BY RANDOM() LIMIT ?", (oversample,))
        fallback_rows = [dict(r) for r in cursor.fetchall()]
        for r in fallback_rows:
            if r["id"] in verified_q_ids:
                continue
            is_valid, healed_q, _ = audit_and_heal_question(r)
            if is_valid and healed_q:
                verified_q_ids.append(healed_q["id"])
                if len(verified_q_ids) >= q_count:
                    break

    q_ids = verified_q_ids

    host_id = player1_id

    room_title = f"{tournament['title']} - Round {round_num} Duel"

    cursor.execute("""
        INSERT INTO rooms (
            id, code, host_id, mode, preset_name, subject, target_exam,
            difficulty_tier, question_ids, total_questions, time_per_question, timing_type,
            is_public, speed_bonus_enabled, status, created_at,
            tournament_id, tournament_match_id
        ) VALUES (?, ?, ?, 'SPEED_DUEL', ?, ?, ?, 'MIXED', ?, ?, ?, 'SYNCHRONIZED', 0, 1, 'LOBBY', ?, ?, ?)
    """, (
        room_id, room_code, host_id, room_title, subj, target_exam,
        json.dumps(q_ids), len(q_ids), int(tournament.get("time_per_question", 60)),
        now, tournament["id"], f"m_{round_num}_{match_idx}"
    ))

    # Add both contenders to room_participants
    for uid in (player1_id, player2_id):
        if uid:
            cursor.execute("""
                INSERT OR IGNORE INTO room_participants (room_id, user_id, current_question_index, score, marks, answers, is_finished)
                VALUES (?, ?, 0, 0, 0.0, '{}', 0)
            """, (room_id, uid))

    return room_code


@router.get("")
def list_tournaments(status_filter: Optional[str] = Query(None)):
    """Lists all tournaments with real-life prize info, organizer name, and current stage."""
    conn = get_connection()
    c = conn.cursor()

    query = """
        SELECT t.*,
               COUNT(tp.user_id) as participant_count,
               w.username as winner_name
        FROM tournaments t
        LEFT JOIN tournament_participants tp ON t.id = tp.tournament_id
        LEFT JOIN users w ON t.winner_id = w.id
    """
    params = []
    if status_filter:
        query += " WHERE t.status = ?"
        params.append(status_filter.upper())

    query += " GROUP BY t.id ORDER BY CASE t.status WHEN 'IN_PROGRESS' THEN 1 WHEN 'REGISTRATION' THEN 2 ELSE 3 END, t.created_at DESC"

    c.execute(query, params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


@router.post("")
def create_tournament(req: TournamentCreateRequest, user: dict = Depends(get_current_user)):
    """Creates a new organized tournament with real-world or in-game rewards."""
    if not req.title.strip():
        raise HTTPException(status_code=400, detail="Tournament title is required.")

    bracket_size = req.bracket_size if req.bracket_size in (3, 4, 8, 16) else 8
    total_rounds = 2 if bracket_size == 3 else int(math.log2(bracket_size))
    tournament_id = f"trn_{uuid.uuid4().hex[:10]}"
    now = datetime.datetime.utcnow().isoformat()

    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        INSERT INTO tournaments (
            id, title, description, organizer_id, organizer_name, format,
            target_exam, subject, bracket_size, reward_type, rp_pool,
            real_life_reward, claim_instructions, passcode, question_count,
            time_per_question, status, current_round, total_rounds, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRATION', 1, ?, ?)
    """, (
        tournament_id, req.title.strip(), req.description.strip(), user["id"], user["username"],
        req.format, req.target_exam, req.subject, bracket_size, req.reward_type,
        max(100, req.rp_pool), req.real_life_reward.strip() if req.real_life_reward else None,
        req.claim_instructions.strip() if req.claim_instructions else None,
        req.passcode.strip() if req.passcode else None,
        max(3, min(25, req.question_count)), max(30, min(180, req.time_per_question)),
        total_rounds, now
    ))

    # Auto-register organizer as first participant
    c.execute("""
        INSERT INTO tournament_participants (tournament_id, user_id, username, avatar_id, seed, joined_at)
        VALUES (?, ?, ?, ?, 1, ?)
    """, (tournament_id, user["id"], user["username"], user.get("avatar_id", "default"), now))

    conn.commit()
    data = get_tournament_full(c, tournament_id, user["id"])
    conn.close()
    return data


@router.get("/{tournament_id}")
def get_tournament_details(tournament_id: str, user: Optional[dict] = Depends(get_optional_user)):
    conn = get_connection()
    c = conn.cursor()
    uid = user["id"] if user else None
    data = get_tournament_full(c, tournament_id, uid)
    conn.close()
    return data


class JoinTournamentRequest(BaseModel):
    passcode: Optional[str] = None

@router.post("/{tournament_id}/join")
def join_tournament(tournament_id: str, req: JoinTournamentRequest, user: dict = Depends(get_current_user)):
    """Registers user for an upcoming tournament."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    t_row = c.fetchone()
    if not t_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Tournament not found.")

    t = dict(t_row)
    if t["status"] != "REGISTRATION":
        conn.close()
        raise HTTPException(status_code=400, detail="Registration for this tournament is closed.")

    if t.get("passcode") and t["passcode"] != (req.passcode or "").strip():
        conn.close()
        raise HTTPException(status_code=403, detail="Invalid tournament passcode.")

    c.execute("SELECT COUNT(*) as cnt FROM tournament_participants WHERE tournament_id = ?", (tournament_id,))
    current_cnt = c.fetchone()["cnt"]
    if current_cnt >= t["bracket_size"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Tournament roster is full.")

    now = datetime.datetime.utcnow().isoformat()
    c.execute("""
        INSERT OR IGNORE INTO tournament_participants (tournament_id, user_id, username, avatar_id, seed, joined_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (tournament_id, user["id"], user["username"], user.get("avatar_id", "default"), current_cnt + 1, now))

    conn.commit()
    data = get_tournament_full(c, tournament_id, user["id"])
    conn.close()
    return data


@router.post("/{tournament_id}/leave")
def leave_tournament(tournament_id: str, user: dict = Depends(get_current_user)):
    """Withdraws registration from an upcoming tournament."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    t_row = c.fetchone()
    if not t_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Tournament not found.")

    if t_row["status"] != "REGISTRATION":
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot withdraw once matches have started.")

    c.execute("DELETE FROM tournament_participants WHERE tournament_id = ? AND user_id = ?", (tournament_id, user["id"]))
    conn.commit()
    data = get_tournament_full(c, tournament_id, user["id"])
    conn.close()
    return data


@router.post("/{tournament_id}/seed_bot")
def seed_bot_participant(tournament_id: str, user: dict = Depends(get_current_user)):
    """Retired endpoint: All tournaments are strictly human-vs-human."""
    raise HTTPException(
        status_code=400,
        detail="AI bot sparring partners have been retired. All tournament contestants must be registered human aspirants."
    )


@router.post("/{tournament_id}/start")
def start_tournament(tournament_id: str, user: dict = Depends(get_current_user)):
    """Organizer starts the tournament, locks registration, and generates Round 1 bracket matches."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    t_row = c.fetchone()
    if not t_row or t_row["organizer_id"] != user["id"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Only the tournament organizer can launch the tournament.")

    t = dict(t_row)
    if t["status"] != "REGISTRATION":
        conn.close()
        raise HTTPException(status_code=400, detail="Tournament has already started.")

    c.execute("SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY seed ASC", (tournament_id,))
    participants = [dict(r) for r in c.fetchall()]

    if len(participants) < 2:
        conn.close()
        raise HTTPException(status_code=400, detail="At least 2 participants are needed to start a tournament.")

    now = datetime.datetime.utcnow().isoformat()

    # 2-PLAYER GRAND FINALS DIRECT CLASH
    if len(participants) == 2:
        c.execute("""
            UPDATE tournaments
            SET status = 'IN_PROGRESS', started_at = ?, current_round = 1, total_rounds = 1, bracket_size = 2
            WHERE id = ?
        """, (now, tournament_id))

        p1 = participants[0]
        p2 = participants[1]
        m1_id = f"m_{tournament_id}_r1_0"
        room_code = create_match_room_helper(c, t, p1["user_id"], p2["user_id"], 1, 0)

        c.execute("""
            INSERT INTO tournament_matches (
                id, tournament_id, round_number, match_index,
                player1_id, player2_id, room_code, status
            ) VALUES (?, ?, 1, 0, ?, ?, ?, 'READY')
        """, (m1_id, tournament_id, p1["user_id"], p2["user_id"], room_code))

        conn.commit()
        data = get_tournament_full(c, tournament_id, user["id"])
        conn.close()
        return data

    # 3-PLAYER STEPLADDER GAUNTLET FORMAT (Seed 2 vs Seed 3, winner plays Seed 1)
    if t.get("bracket_size") == 3 or len(participants) == 3:
        c.execute("""
            UPDATE tournaments
            SET status = 'IN_PROGRESS', started_at = ?, current_round = 1, total_rounds = 2, bracket_size = 3
            WHERE id = ?
        """, (now, tournament_id))

        # Round 1: Eliminator Clash (Seed 2 vs Seed 3)
        p1 = participants[1]  # Seed 2
        p2 = participants[2]  # Seed 3
        m1_id = f"m_{tournament_id}_r1_0"
        room_code = create_match_room_helper(c, t, p1["user_id"], p2["user_id"], 1, 0)

        c.execute("""
            INSERT INTO tournament_matches (
                id, tournament_id, round_number, match_index,
                player1_id, player2_id, room_code, status
            ) VALUES (?, ?, 1, 0, ?, ?, ?, 'READY')
        """, (m1_id, tournament_id, p1["user_id"], p2["user_id"], room_code))

        # Round 2: Grand Finals (Seed 1 gets Bye, awaits Eliminator Winner)
        m2_id = f"m_{tournament_id}_r2_0"
        c.execute("""
            INSERT INTO tournament_matches (
                id, tournament_id, round_number, match_index,
                player1_id, player2_id, room_code, status
            ) VALUES (?, ?, 2, 0, ?, NULL, NULL, 'PENDING')
        """, (m2_id, tournament_id, participants[0]["user_id"]))

        conn.commit()
        data = get_tournament_full(c, tournament_id, user["id"])
        conn.close()
        return data

    # 4+ PLAYERS: Standard Single-Elimination with Byes for top seeds
    total_rounds = int(math.ceil(math.log2(len(participants))))
    bracket_target = 2 ** total_rounds
    num_byes = bracket_target - len(participants)

    c.execute("""
        UPDATE tournaments
        SET status = 'IN_PROGRESS', started_at = ?, current_round = 1, total_rounds = ?, bracket_size = ?
        WHERE id = ?
    """, (now, total_rounds, len(participants), tournament_id))

    # Top seeds receive byes in Round 1
    for m_idx in range(num_byes):
        p1 = participants[m_idx]
        match_id = f"m_{tournament_id}_r1_{m_idx}"
        c.execute("""
            INSERT INTO tournament_matches (
                id, tournament_id, round_number, match_index,
                player1_id, player2_id, room_code, status,
                winner_id, player1_score, player2_score, completed_at
            ) VALUES (?, ?, 1, ?, ?, NULL, NULL, 'COMPLETED', ?, 0, 0, ?)
        """, (match_id, tournament_id, m_idx, p1["user_id"], p1["user_id"], now))

    # Remaining players pair up for live duels
    remaining_players = participants[num_byes:]
    for i in range(len(remaining_players) // 2):
        m_idx = num_byes + i
        p1 = remaining_players[i * 2]
        p2 = remaining_players[i * 2 + 1]
        match_id = f"m_{tournament_id}_r1_{m_idx}"
        room_code = create_match_room_helper(c, t, p1["user_id"], p2["user_id"], 1, m_idx)
        c.execute("""
            INSERT INTO tournament_matches (
                id, tournament_id, round_number, match_index,
                player1_id, player2_id, room_code, status
            ) VALUES (?, ?, 1, ?, ?, ?, ?, 'READY')
        """, (match_id, tournament_id, m_idx, p1["user_id"], p2["user_id"], room_code))

    check_and_advance_tournament_round(c, tournament_id)
    conn.commit()
    data = get_tournament_full(c, tournament_id, user["id"])
    conn.close()
    return data


@router.post("/{tournament_id}/matches/{match_id}/simulate")
def simulate_or_resolve_match(
    tournament_id: str,
    match_id: str,
    winner_player_num: int = Query(1),
    user: dict = Depends(get_current_user)
):
    """
    Organizer emergency action: Advances match if an opponent disconnected or organizer forces resolution.
    """
    conn = get_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    t_row = c.fetchone()
    if not t_row or t_row["organizer_id"] != user["id"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Only tournament organizer can resolve matches.")

    c.execute("SELECT * FROM tournament_matches WHERE id = ? AND tournament_id = ?", (match_id, tournament_id))
    m_row = c.fetchone()
    if not m_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Match not found.")

    m = dict(m_row)
    if m["status"] == "COMPLETED":
        conn.close()
        return {"success": True, "message": "Match already completed."}

    p1_id = m["player1_id"]
    p2_id = m["player2_id"]
    winner_id = p1_id if winner_player_num == 1 else p2_id
    now = datetime.datetime.utcnow().isoformat()

    c.execute("""
        UPDATE tournament_matches
        SET status = 'COMPLETED', winner_id = ?, player1_score = 100, player2_score = 50, completed_at = ?
        WHERE id = ?
    """, (winner_id, now, match_id))

    check_and_advance_tournament_round(c, tournament_id)
    conn.commit()
    data = get_tournament_full(c, tournament_id, user["id"])
    conn.close()
    return data


def check_and_advance_tournament_round(cursor, tournament_id: str):
    """
    Checks if all matches in current round are complete.
    If yes, advances to next round or crowns champion and distributes RP & medals.
    """
    cursor.execute("SELECT * FROM tournaments WHERE id = ?", (tournament_id,))
    t_row = cursor.fetchone()
    if not t_row:
        return

    t = dict(t_row)
    if t["status"] != "IN_PROGRESS":
        return

    curr_round = t["current_round"]
    total_rounds = t["total_rounds"]

    cursor.execute("""
        SELECT COUNT(*) as unfinished
        FROM tournament_matches
        WHERE tournament_id = ? AND round_number = ? AND status != 'COMPLETED'
    """, (tournament_id, curr_round))
    unfinished = cursor.fetchone()["unfinished"]

    if unfinished > 0:
        return  # Matches still ongoing in this round

    # All matches in current round are finished!
    cursor.execute("""
        SELECT * FROM tournament_matches
        WHERE tournament_id = ? AND round_number = ?
        ORDER BY match_index ASC
    """, (tournament_id, curr_round))
    finished_matches = [dict(r) for r in cursor.fetchall()]
    round_winners = [m["winner_id"] for m in finished_matches if m.get("winner_id")]

    now = datetime.datetime.utcnow().isoformat()

    if curr_round >= total_rounds:
        # GRAND FINALS COMPLETED! CROWN TOURNAMENT CHAMPION!
        if finished_matches and finished_matches[0].get("winner_id"):
            final_match = finished_matches[0]
            champ_id = final_match["winner_id"]
            runner_up_id = (
                final_match["player2_id"]
                if champ_id == final_match["player1_id"]
                else final_match["player1_id"]
            )

            cursor.execute("""
                UPDATE tournaments
                SET status = 'COMPLETED', completed_at = ?, winner_id = ?, runner_up_id = ?
                WHERE id = ?
            """, (now, champ_id, runner_up_id, tournament_id))

            # Distribute in-game rewards (RP Pool & Medals)
            rp_pool = int(t.get("rp_pool", 500))
            champ_rp = int(rp_pool * 0.70)
            runner_rp = int(rp_pool * 0.30)

            if champ_id:
                cursor.execute("""
                    UPDATE users
                    SET weekly_rp = weekly_rp + ?, gold_medals = gold_medals + 1
                    WHERE id = ?
                """, (champ_rp, champ_id))

            if runner_up_id:
                cursor.execute("""
                    UPDATE users
                    SET weekly_rp = weekly_rp + ?, silver_medals = silver_medals + 1
                    WHERE id = ?
                """, (runner_rp, runner_up_id))
    else:
        # ADVANCE TO NEXT ROUND
        next_round = curr_round + 1
        cursor.execute("UPDATE tournaments SET current_round = ? WHERE id = ?", (next_round, tournament_id))

        if t.get("bracket_size") == 3 and curr_round == 1:
            # 3-PLAYER STEPLADDER GAUNTLET:
            # Populate pre-created Grand Finals match with Seed 1 vs Eliminator Winner
            winner_of_r1 = round_winners[0] if round_winners else None
            cursor.execute("""
                SELECT * FROM tournament_matches
                WHERE tournament_id = ? AND round_number = 2 AND match_index = 0
            """, (tournament_id,))
            r2_row = cursor.fetchone()
            if r2_row and winner_of_r1:
                r2_match = dict(r2_row)
                seed1_id = r2_match["player1_id"]
                room_code = create_match_room_helper(cursor, t, seed1_id, winner_of_r1, 2, 0)
                cursor.execute("""
                    UPDATE tournament_matches
                    SET player2_id = ?, room_code = ?, status = 'READY'
                    WHERE id = ?
                """, (winner_of_r1, room_code, r2_match["id"]))
        else:
            # Standard single elimination bracket advancement (4, 8, 16)
            num_next_matches = len(round_winners) // 2
            for m_idx in range(num_next_matches):
                p1_id = round_winners[m_idx * 2]
                p2_id = round_winners[m_idx * 2 + 1] if (m_idx * 2 + 1) < len(round_winners) else None
                match_id = f"m_{tournament_id}_r{next_round}_{m_idx}"

                room_code = None
                status = "PENDING"
                if p1_id and p2_id:
                    room_code = create_match_room_helper(cursor, t, p1_id, p2_id, next_round, m_idx)
                    status = "READY"

                cursor.execute("""
                    INSERT INTO tournament_matches (
                        id, tournament_id, round_number, match_index,
                        player1_id, player2_id, room_code, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (match_id, tournament_id, next_round, m_idx, p1_id, p2_id, room_code, status))

            # Auto-advance if all matches in new round are completed
            check_and_advance_tournament_round(cursor, tournament_id)
