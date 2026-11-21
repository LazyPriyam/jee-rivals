import datetime
import json
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_connection

client = TestClient(app)


def test_deadline_blocks_cbt_and_provides_question_paper_pdf():
    """
    Verify:
    1. Once an exam deadline passes, CBT mode is blocked with HTTP 403 for unfinished students.
    2. Room join also blocks CBT entry after deadline with HTTP 403.
    3. The Question Paper PDF endpoint /api/scheduled-tests/{test_id}/paper is available for offline solving.
    4. Paper endpoint is sealed (403) before the scheduled start time.
    """
    conn = get_connection()
    c = conn.cursor()

    creator_id = "test-creator-pdf-001"
    student_id = "test-student-pdf-002"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (creator_id, "PdfCreator", now_iso))

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (student_id, "PdfStudent", now_iso))
    conn.commit()

    from backend.app.auth import create_access_token
    creator_token = create_access_token(creator_id, "PdfCreator")
    student_token = create_access_token(student_id, "PdfStudent")

    headers_creator = {"Authorization": f"Bearer {creator_token}"}
    headers_student = {"Authorization": f"Bearer {student_token}"}

    now = datetime.datetime.now(datetime.timezone.utc)

    # --- Scenario 1: Test with deadline in the PAST (Expired CBT) ---
    past_start = now - datetime.timedelta(hours=5)
    past_deadline = now - datetime.timedelta(hours=1)

    create_payload = {
        "title": "Expired Deadline Physics Paper",
        "description": "Paper past deadline for offline PDF testing",
        "exam_type": "MAIN",
        "difficulty": "STRICT",
        "duration_minutes": 60,
        "total_questions": 3,
        "subjects": ["Physics"],
        "chapters": [],
        "scheduled_start_time": past_start.isoformat(),
        "deadline_time": past_deadline.isoformat(),
        "assigned_user_ids": ["*"]
    }

    res_create = client.post("/api/scheduled-tests/create", json=create_payload, headers=headers_creator)
    assert res_create.status_code == 200, res_create.text
    test_id = res_create.json()["test_id"]
    room_code = res_create.json()["room_code"]

    # 1. Student attempts to start CBT after deadline -> Expect 403 Forbidden
    res_start = client.post(f"/api/scheduled-tests/{test_id}/start", headers=headers_student)
    assert res_start.status_code == 403, f"Expected 403, got {res_start.status_code}: {res_start.text}"
    assert "deadline" in res_start.json()["detail"].lower()
    assert "cbt mode is closed" in res_start.json()["detail"].lower() or "cbt" in res_start.json()["detail"].lower()

    # 2. Student attempts to join room directly -> Expect 403 Forbidden
    res_join = client.post("/api/rooms/join", json={"code": room_code}, headers=headers_student)
    assert res_join.status_code == 403, f"Expected 403 on join, got {res_join.status_code}: {res_join.text}"
    assert "deadline" in res_join.json()["detail"].lower()

    # 3. Student fetches Question Paper for offline home practice -> Expect 200 OK
    res_paper = client.get(f"/api/scheduled-tests/{test_id}/paper", headers=headers_student)
    assert res_paper.status_code == 200, res_paper.text
    paper_data = res_paper.json()
    assert paper_data["status"] == "ok"
    assert paper_data["test_id"] == test_id
    assert len(paper_data["questions"]) > 0
    assert len(paper_data["answer_key"]) == len(paper_data["questions"])
    assert paper_data["marking_scheme"]["correct"] == 4
    assert paper_data["marking_scheme"]["incorrect"] == -1

    # Verify each question has subject, text, marking scheme
    for q in paper_data["questions"]:
        assert "qnum" in q
        assert "text" in q
        assert "subject" in q
        assert "correct_mark" in q

    # --- Scenario 2: Test in FUTURE (Pre-release sealed paper) ---
    future_start = now + datetime.timedelta(days=2)
    future_deadline = now + datetime.timedelta(days=4)

    create_future = {
        "title": "Future Sealed Exam",
        "description": "Paper not yet started",
        "exam_type": "MAIN",
        "difficulty": "STRICT",
        "duration_minutes": 60,
        "total_questions": 3,
        "subjects": ["Physics"],
        "chapters": [],
        "scheduled_start_time": future_start.isoformat(),
        "deadline_time": future_deadline.isoformat(),
        "assigned_user_ids": ["*"]
    }

    res_create_fut = client.post("/api/scheduled-tests/create", json=create_future, headers=headers_creator)
    fut_test_id = res_create_fut.json()["test_id"]

    # Student attempts to fetch paper before release -> Expect 403 Forbidden (sealed)
    res_paper_fut = client.get(f"/api/scheduled-tests/{fut_test_id}/paper", headers=headers_student)
    assert res_paper_fut.status_code == 403
    assert "sealed" in res_paper_fut.json()["detail"].lower()

    # Cleanup
    c.execute("DELETE FROM users WHERE id IN (?, ?)", (creator_id, student_id))
    c.execute("DELETE FROM scheduled_tests WHERE id IN (?, ?)", (test_id, fut_test_id))
    conn.commit()
    conn.close()
