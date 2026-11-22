import datetime
import json
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_connection
from backend.app.auth import create_access_token, get_current_user

client = TestClient(app)


def test_extend_scheduled_test_deadline_permissions_and_validations():
    """
    Verify:
    1. Only the examination scheduler or an admin can extend the deadline (403 for unauthorized).
    2. Invalid date format, past date, or date before start time are rejected (400).
    3. Valid future extension succeeds (200).
    """
    conn = get_connection()
    c = conn.cursor()

    creator_id = "test-ext-creator-001"
    other_user_id = "test-ext-other-002"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (creator_id, "ExtCreator", now_iso))

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (other_user_id, "ExtOtherUser", now_iso))
    conn.commit()

    headers_creator = {"Authorization": f"Bearer {create_access_token(creator_id, 'ExtCreator')}"}
    headers_other = {"Authorization": f"Bearer {create_access_token(other_user_id, 'ExtOtherUser')}"}

    now = datetime.datetime.now(datetime.timezone.utc)
    start_dt = now - datetime.timedelta(hours=2)
    initial_deadline = now + datetime.timedelta(hours=4)

    create_payload = {
        "title": "Calculus Speed Examination",
        "description": "Calculus test for deadline extension verification",
        "exam_type": "MAIN",
        "difficulty": "STRICT",
        "duration_minutes": 60,
        "total_questions": 3,
        "subjects": ["Mathematics"],
        "chapters": [],
        "scheduled_start_time": start_dt.isoformat(),
        "deadline_time": initial_deadline.isoformat(),
        "assigned_user_ids": ["*"]
    }

    res_create = client.post("/api/scheduled-tests/create", json=create_payload, headers=headers_creator)
    assert res_create.status_code == 200, res_create.text
    test_id = res_create.json()["test_id"]

    # 1. Other unauthorized user attempts extension -> 403 Forbidden
    new_dl = (now + datetime.timedelta(days=1)).isoformat()
    res_unauth = client.post(
        f"/api/scheduled-tests/{test_id}/extend-deadline",
        json={"new_deadline": new_dl, "reason": "Unauthorized test attempt"},
        headers=headers_other
    )
    assert res_unauth.status_code == 403
    assert "Only the examination scheduler or an administrator" in res_unauth.json()["detail"]

    # 2. Invalid date format -> 400 Bad Request
    res_invalid_fmt = client.post(
        f"/api/scheduled-tests/{test_id}/extend-deadline",
        json={"new_deadline": "invalid-datetime-string"},
        headers=headers_creator
    )
    assert res_invalid_fmt.status_code == 400

    # 3. New deadline before examination start time -> 400 Bad Request
    before_start = (start_dt - datetime.timedelta(hours=1)).isoformat()
    res_before_start = client.post(
        f"/api/scheduled-tests/{test_id}/extend-deadline",
        json={"new_deadline": before_start},
        headers=headers_creator
    )
    assert res_before_start.status_code == 400
    assert "after the examination start time" in res_before_start.json()["detail"]

    # 4. New deadline in the past -> 400 Bad Request
    past_date = (now - datetime.timedelta(minutes=5)).isoformat()
    res_past = client.post(
        f"/api/scheduled-tests/{test_id}/extend-deadline",
        json={"new_deadline": past_date},
        headers=headers_creator
    )
    assert res_past.status_code == 400
    assert "in the future" in res_past.json()["detail"]

    # 5. Creator successfully extends deadline
    extended_dl_1 = (now + datetime.timedelta(days=2)).isoformat()
    res_ext_creator = client.post(
        f"/api/scheduled-tests/{test_id}/extend-deadline",
        json={"new_deadline": extended_dl_1, "reason": "Extended by 48 hours for cohort review"},
        headers=headers_creator
    )
    assert res_ext_creator.status_code == 200
    assert res_ext_creator.json()["status"] == "success"

    # Verify scheduled_tests DB has updated deadline
    c.execute("SELECT deadline_time FROM scheduled_tests WHERE id = ?", (test_id,))
    assert c.fetchone()[0] == extended_dl_1

    # 6. Admin can also extend deadline via dependency override
    app.dependency_overrides[get_current_user] = lambda: {"id": "admin-999", "username": "SuperAdmin", "is_admin": True}
    try:
        extended_dl_2 = (now + datetime.timedelta(days=3)).isoformat()
        res_ext_admin = client.post(
            f"/api/scheduled-tests/{test_id}/extend-deadline",
            json={"new_deadline": extended_dl_2, "reason": "Admin extended further"}
        )
        assert res_ext_admin.status_code == 200
        c.execute("SELECT deadline_time FROM scheduled_tests WHERE id = ?", (test_id,))
        assert c.fetchone()[0] == extended_dl_2
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    conn.close()


def test_extend_deadline_upgrades_late_attempts_and_reseals_paper():
    """
    Verify:
    1. When an expired test has a late submission (is_late = 1),
    2. Extending the deadline into the future automatically upgrades the participant to official (is_late = 0).
    3. The Question Paper PDF endpoint reseals (403) once deadline is extended into the future.
    4. An in-app notification of type DEADLINE_EXTENDED is dispatched to enrolled candidates.
    """
    conn = get_connection()
    c = conn.cursor()

    creator_id = "test-ext-creator-upg-001"
    student_id = "test-ext-student-upg-002"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (creator_id, "UpgCreator", now_iso))

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (student_id, "UpgStudent", now_iso))
    conn.commit()

    headers_creator = {"Authorization": f"Bearer {create_access_token(creator_id, 'UpgCreator')}"}
    headers_student = {"Authorization": f"Bearer {create_access_token(student_id, 'UpgStudent')}"}

    now = datetime.datetime.now(datetime.timezone.utc)
    # Test created in the past whose deadline has already elapsed
    past_start = now - datetime.timedelta(hours=6)
    past_dl = now - datetime.timedelta(hours=1)

    create_payload = {
        "title": "Thermodynamics Late Attempt Test",
        "description": "Checking automatic promotion from late to official standing",
        "exam_type": "MAIN",
        "difficulty": "STRICT",
        "duration_minutes": 60,
        "total_questions": 3,
        "subjects": ["Physics"],
        "chapters": [],
        "scheduled_start_time": past_start.isoformat(),
        "deadline_time": past_dl.isoformat(),
        "assigned_user_ids": ["*"]
    }

    res_create = client.post("/api/scheduled-tests/create", json=create_payload, headers=headers_creator)
    assert res_create.status_code == 200, res_create.text
    test_id = res_create.json()["test_id"]
    room_code = res_create.json()["room_code"]

    c.execute("SELECT room_id FROM scheduled_tests WHERE id = ?", (test_id,))
    room_id = c.fetchone()[0]

    # Insert a student attempt that finished 30 minutes after past_dl (so marked is_late = 1)
    late_finish_dt = past_dl + datetime.timedelta(minutes=30)
    c.execute("""
        INSERT OR REPLACE INTO room_participants
        (room_id, user_id, current_question_index, score, marks, is_finished, finished_at, is_late)
        VALUES (?, ?, 3, 180, 180, 1, ?, 1)
    """, (room_id, student_id, late_finish_dt.isoformat()))
    conn.commit()

    # Prior to extension:
    # 1. Leaderboard shows 0 official, 1 late attempt
    res_lb_before = client.get(f"/api/scheduled-tests/{test_id}/leaderboard", headers=headers_student)
    assert res_lb_before.status_code == 200
    lb_data_before = res_lb_before.json()
    assert lb_data_before["total_official"] == 0
    assert lb_data_before["total_late"] == 1
    assert lb_data_before["test"]["is_past_deadline"] is True

    # 2. Question paper PDF is available because test is past deadline
    res_paper_before = client.get(f"/api/scheduled-tests/{test_id}/paper", headers=headers_student)
    assert res_paper_before.status_code == 200

    # Extend deadline to 1 day in the future!
    future_deadline = now + datetime.timedelta(days=1)
    res_extend = client.post(
        f"/api/scheduled-tests/{test_id}/extend-deadline",
        json={
            "new_deadline": future_deadline.isoformat(),
            "reason": "Server maintenance window granted +24 hours."
        },
        headers=headers_creator
    )
    assert res_extend.status_code == 200

    # After extension:
    # 1. The late submission finished before future_deadline, so is_late should be updated to 0!
    c.execute("SELECT is_late FROM room_participants WHERE room_id = ? AND user_id = ?", (room_id, student_id))
    assert c.fetchone()[0] == 0

    # 2. Leaderboard now shows 1 official and 0 late attempts!
    res_lb_after = client.get(f"/api/scheduled-tests/{test_id}/leaderboard", headers=headers_student)
    assert res_lb_after.status_code == 200
    lb_data_after = res_lb_after.json()
    assert lb_data_after["total_official"] == 1
    assert lb_data_after["total_late"] == 0
    assert lb_data_after["test"]["is_past_deadline"] is False

    # 3. Question paper PDF is resealed (HTTP 403) because deadline is now in the future!
    res_paper_after = client.get(f"/api/scheduled-tests/{test_id}/paper", headers=headers_student)
    assert res_paper_after.status_code == 403
    assert "sealed until the examination deadline" in res_paper_after.json()["detail"]

    # 4. In-app notification was dispatched to student
    conn.commit()
    c.execute("""
        SELECT title, message, type FROM user_notifications
        WHERE user_id = ? AND type = 'DEADLINE_EXTENDED'
        ORDER BY created_at DESC LIMIT 1
    """, (student_id,))
    notif = c.fetchone()
    assert notif is not None
    assert "Deadline Extended" in notif[0]
    assert "Server maintenance window" in notif[1]

    conn.close()
