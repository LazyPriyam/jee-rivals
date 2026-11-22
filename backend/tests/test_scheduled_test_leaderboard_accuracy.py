import datetime
import json
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_connection
from backend.app.auth import create_access_token

client = TestClient(app)


def test_scheduled_test_leaderboard_accuracy_calculation():
    """
    Verify:
    1. Candidate with 52 correct out of 59 attempted has accuracy calculated correctly (~88.1%).
    2. correct_count is 52 (not 0).
    3. attempted_count is 59 (not total 75 questions).
    4. accuracy in catalog test_item['user_attempt']['accuracy'] is also correct.
    """
    conn = get_connection()
    c = conn.cursor()

    student_id = "test-student-accuracy-001"
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now_utc.isoformat()
    start_iso = (now_utc - datetime.timedelta(days=1)).isoformat()
    deadline_iso = (now_utc + datetime.timedelta(days=1)).isoformat()

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, current_division, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1850, 'DIAMOND I', ?, 1)
    """, (student_id, "LazyPriyam", now_iso))

    room_id = "room-test-accuracy-leaderboard"
    test_id = "sched-test-accuracy-leaderboard"

    # 75 questions mock
    q_ids = [f"q_{i}" for i in range(1, 76)]

    c.execute("""
        INSERT OR REPLACE INTO rooms (
            id, code, host_id, mode, preset_name, total_questions,
            total_duration_minutes, status, created_at, question_ids
        ) VALUES (
            ?, 'TESTACC', ?, 'MOCK_TEST', 'Test #2', 75,
            180, 'IN_PROGRESS', ?, ?
        )
    """, (room_id, student_id, start_iso, json.dumps(q_ids)))

    c.execute("""
        INSERT OR REPLACE INTO scheduled_tests (
            id, room_id, title, description, exam_type, difficulty,
            duration_minutes, total_questions, total_marks, question_ids,
            subjects, chapters, scheduled_start_time, deadline_time,
            assigned_user_ids, created_by_user_id, created_at
        ) VALUES (
            ?, ?, 'Test #2', 'Accuracy evaluation test', 'MAIN', 'STRICT',
            180, 75, 300, ?,
            '[\"Physics\", \"Chemistry\", \"Mathematics\"]', '[]',
            ?, ?, '[\"*\"]', ?, ?
        )
    """, (test_id, room_id, json.dumps(q_ids), start_iso, deadline_iso, student_id, start_iso))

    # Answers: 52 correct, 7 incorrect, 16 skipped (59 attempted total)
    answers_dict = {}
    for i in range(1, 53):  # 1 to 52: correct
        answers_dict[f"q_{i}"] = {
            "selected": "A",
            "correct": True,
            "delta_marks": 4.0,
            "delta_score": 100
        }
    for i in range(53, 60):  # 53 to 59: incorrect
        answers_dict[f"q_{i}"] = {
            "selected": "C",
            "correct": False,
            "delta_marks": -1.0,
            "delta_score": -25
        }
    for i in range(60, 76):  # 60 to 75: unattempted / skipped
        answers_dict[f"q_{i}"] = {
            "selected": "NONE",
            "correct": False,
            "delta_marks": 0.0,
            "delta_score": 0
        }
    answers_dict["__meta_timeline"] = []

    c.execute("""
        INSERT OR REPLACE INTO room_participants (
            room_id, user_id, current_question_index, score, marks, answers,
            is_finished, finished_at, is_late
        ) VALUES (
            ?, ?, 75, 5025, 201.0, ?,
            1, ?, 0
        )
    """, (room_id, student_id, json.dumps(answers_dict), now_iso))
    conn.commit()
    conn.close()

    token = create_access_token(student_id, "LazyPriyam")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test leaderboard endpoint
    res_lb = client.get(f"/api/scheduled-tests/{test_id}/leaderboard", headers=headers)
    assert res_lb.status_code == 200, res_lb.text
    lb_data = res_lb.json()

    official = lb_data.get("official_standings", [])
    assert len(official) == 1
    standing = official[0]

    assert standing["username"] == "LazyPriyam"
    assert standing["marks"] == 201.0
    assert standing["correct_count"] == 52
    assert standing["attempted_count"] == 59
    assert standing["accuracy"] == 88.1

    # 2. Test catalog endpoint user_attempt
    res_cat = client.get("/api/scheduled-tests/catalog", headers=headers)
    assert res_cat.status_code == 200, res_cat.text
    cat_data = res_cat.json()
    t_entry = next((t for t in cat_data.get("all", []) if t["id"] == test_id), None)
    assert t_entry is not None
    assert t_entry.get("user_attempt") is not None
    assert t_entry["user_attempt"]["accuracy"] == 88.1
