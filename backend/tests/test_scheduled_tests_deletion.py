import datetime
import json
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_connection

client = TestClient(app)

def test_unschedule_and_delete_scheduled_test():
    """Verify creator can unschedule and delete a test before release, and deleting from history removes it from tests."""
    conn = get_connection()
    c = conn.cursor()

    # Create dummy creator user
    creator_id = "test-creator-unschedule-001"
    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (creator_id, "CreatorUser", datetime.datetime.now(datetime.timezone.utc).isoformat()))

    # Create dummy student user
    student_id = "test-student-delete-002"
    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (student_id, "StudentUser", datetime.datetime.now(datetime.timezone.utc).isoformat()))
    conn.commit()

    from backend.app.auth import create_access_token
    creator_token = create_access_token(creator_id, "CreatorUser")
    student_token = create_access_token(student_id, "StudentUser")

    headers_creator = {"Authorization": f"Bearer {creator_token}"}
    headers_student = {"Authorization": f"Bearer {student_token}"}

    # 1. Creator schedules an upcoming test
    now = datetime.datetime.now(datetime.timezone.utc)
    future_start = now + datetime.timedelta(days=2)
    future_deadline = now + datetime.timedelta(days=4)

    create_payload = {
        "title": "Upcoming Physics Duel",
        "description": "Pre-release exam",
        "exam_type": "MAIN",
        "difficulty": "STRICT",
        "duration_minutes": 60,
        "total_questions": 5,
        "subjects": ["Physics"],
        "chapters": [],
        "scheduled_start_time": future_start.isoformat(),
        "deadline_time": future_deadline.isoformat(),
        "assigned_user_ids": [student_id]
    }

    res_create = client.post("/api/scheduled-tests/create", json=create_payload, headers=headers_creator)
    assert res_create.status_code == 200, res_create.text
    test_id = res_create.json()["test_id"]
    room_code = res_create.json()["room_code"]

    # Verify student sees it in catalog
    res_cat = client.get("/api/scheduled-tests/catalog", headers=headers_student)
    assert res_cat.status_code == 200
    cat_data = res_cat.json()
    test_ids_for_student = [t["id"] for t in cat_data["all"]]
    assert test_id in test_ids_for_student, "Scheduled test should be visible in student catalog"

    # 2. Test unschedule & delete by creator
    res_del = client.delete(f"/api/scheduled-tests/{test_id}", headers=headers_creator)
    assert res_del.status_code == 200, res_del.text
    del_json = res_del.json()
    assert del_json["status"] == "success"
    assert del_json["action"] == "unscheduled"

    # Verify student NO LONGER sees it in catalog
    res_cat_after = client.get("/api/scheduled-tests/catalog", headers=headers_student)
    assert res_cat_after.status_code == 200
    test_ids_after = [t["id"] for t in res_cat_after.json()["all"]]
    assert test_id not in test_ids_after, "Deleted/unscheduled test must not appear in catalog"

    # 3. Create a second test and test deletion from test history
    create_payload2 = {
        "title": "History Deletion Test Exam",
        "description": "Exam to test history sync",
        "exam_type": "MAIN",
        "difficulty": "STRICT",
        "duration_minutes": 60,
        "total_questions": 5,
        "subjects": ["Physics"],
        "chapters": [],
        "scheduled_start_time": (now - datetime.timedelta(hours=1)).isoformat(),
        "deadline_time": future_deadline.isoformat(),
        "assigned_user_ids": [student_id]
    }
    res_create2 = client.post("/api/scheduled-tests/create", json=create_payload2, headers=headers_creator)
    test_id2 = res_create2.json()["test_id"]
    room_code2 = res_create2.json()["room_code"]

    # Student starts the test
    res_start = client.post(f"/api/scheduled-tests/{test_id2}/start", headers=headers_student)
    assert res_start.status_code == 200

    # Student now deletes the room from test history
    res_hist_del = client.delete(f"/api/rooms/{room_code2}", headers=headers_student)
    assert res_hist_del.status_code == 200

    # Verify the test is also REMOVED from tests catalog for student account
    res_cat_after_hist = client.get("/api/scheduled-tests/catalog", headers=headers_student)
    test_ids_after_hist = [t["id"] for t in res_cat_after_hist.json()["all"]]
    assert test_id2 not in test_ids_after_hist, "Test deleted from test history must also be removed from tests catalog for this account"

    # Cleanup test users
    c.execute("DELETE FROM users WHERE id IN (?, ?)", (creator_id, student_id))
    c.execute("DELETE FROM user_deleted_tests WHERE user_id IN (?, ?)", (creator_id, student_id))
    conn.commit()
    conn.close()
