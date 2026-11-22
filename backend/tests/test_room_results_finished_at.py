import datetime
import json
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_connection

client = TestClient(app)


def test_room_results_returns_participant_finished_at():
    """
    Verify:
    1. In get_room_results, participants have their finished_at timestamp included.
    2. The top-level response provides user_finished_at matching the candidate's finished_at.
    3. If room.completed_at is null (e.g. scheduled test room), completed_at falls back to user_finished_at.
    """
    conn = get_connection()
    c = conn.cursor()

    student_id = "test-student-finished-at-001"
    room_id = "test-room-finished-at-room"
    room_code = "TESTFA1"
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    created_at_iso = (now_utc - datetime.timedelta(days=3)).isoformat()
    submission_finished_at = now_utc.isoformat()

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (student_id, "FinishedStudent", created_at_iso))

    # Room created 3 days ago, completed_at is NULL (still open contest)
    c.execute("""
        INSERT OR REPLACE INTO rooms (
            id, code, host_id, mode, preset_name, total_questions,
            total_duration_minutes, status, created_at, completed_at, question_ids
        ) VALUES (
            ?, ?, ?, 'MOCK_TEST', 'Test Mock Finished Date', 1,
            60, 'IN_PROGRESS', ?, NULL, '[]'
        )
    """, (room_id, room_code, student_id, created_at_iso))

    # Participant submitted today
    c.execute("""
        INSERT OR REPLACE INTO room_participants (
            room_id, user_id, current_question_index, score, marks, answers,
            is_finished, finished_at, is_late
        ) VALUES (
            ?, ?, 1, 100, 4.0, '{}',
            1, ?, 0
        )
    """, (room_id, student_id, submission_finished_at))
    conn.commit()
    conn.close()

    from backend.app.auth import create_access_token
    token = create_access_token(student_id, "FinishedStudent")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get(f"/api/rooms/{room_code}/results", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    # Verify participant has finished_at
    parts = data.get("participants", [])
    assert len(parts) >= 1
    p = parts[0]
    assert p.get("finished_at") == submission_finished_at

    # Verify top-level user_finished_at and completed_at fallback
    assert data.get("user_finished_at") == submission_finished_at
    assert data.get("finished_at") == submission_finished_at
    assert data.get("completed_at") == submission_finished_at
