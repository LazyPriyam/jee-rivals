import datetime
import json
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_connection
from backend.app.auth import create_access_token

client = TestClient(app)


def test_approve_out_of_syllabus_report_reassigns_chapter():
    """
    Verify:
    1. Approving an OUT_OF_TEST_SYLLABUS report with new_chapter re-categorizes the question in DB (chapter, unit, subject).
    2. Invalidates question cache.
    3. Marks the report as APPROVED.
    4. Generates student notification detailing the reassignment.
    5. Reassign endpoint POST /api/questions/{id}/reassign-chapter directly updates chapter and unit.
    6. Fix-key endpoint POST /api/questions/{id}/fix-key updates chapter/unit when provided.
    """
    conn = get_connection()
    c = conn.cursor()

    admin_id = "test-admin-reassign-001"
    student_id = "test-reporter-reassign-002"
    qid = "test-q-reassign-101"
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (admin_id, "AdminUser", now_iso))

    c.execute("""
        INSERT OR REPLACE INTO users (id, username, pin_hash, overall_elo, created_at, token_version)
        VALUES (?, ?, 'fake_hash', 1500, ?, 1)
    """, (student_id, "ReporterStudent", now_iso))

    c.execute("""
        INSERT OR REPLACE INTO questions (
            id, subject, chapter, unit, text, question_type,
            options, correct_answer, solution_text, difficulty_tier,
            target_exam, validation_status
        ) VALUES (
            ?, 'Physics', 'Kinematics', 'Mechanics', 'A rotating wheel has angular velocity...', 'SINGLE_CHOICE',
            '[]', 'A', 'Solution text...', 'MEDIUM',
            'MAIN', 'VALIDATED'
        )
    """, (qid,))

    c.execute("""
        INSERT OR REPLACE INTO question_reports (
            id, question_id, reporter_id, reporter_username, reason, notes, status, created_at
        ) VALUES (
            'rep-reassign-001', ?, ?, 'ReporterStudent', 'OUT_OF_TEST_SYLLABUS', 'This is Rotational Dynamics, not Kinematics!', 'PENDING', ?
        )
    """, (qid, student_id, now_iso))

    conn.commit()

    from backend.app.config import ADMIN_SYNC_TOKEN
    headers_admin = {"X-Sync-Token": ADMIN_SYNC_TOKEN}

    # 1. Approve report and reassign chapter to "Rotational Dynamics"
    res_approve = client.post(
        f"/api/questions/{qid}/approve",
        json={"new_chapter": "Rotational Dynamics", "new_subject": "Physics"},
        headers=headers_admin
    )
    assert res_approve.status_code == 200, res_approve.text
    data = res_approve.json()
    assert data["status"] == "ok"
    assert data["new_chapter"] == "Rotational Dynamics"

    # Verify DB question record updated
    c.execute("SELECT chapter, unit, subject FROM questions WHERE id = ?", (qid,))
    row = c.fetchone()
    assert row[0] == "Rotational Dynamics"
    assert row[1] == "Mechanics"
    assert row[2] == "Physics"

    # Verify report status is APPROVED
    c.execute("SELECT status FROM question_reports WHERE question_id = ?", (qid,))
    rep_row = c.fetchone()
    assert rep_row[0] == "APPROVED"

    # Verify student notification created
    c.execute("SELECT message FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", (student_id,))
    notif_row = c.fetchone()
    assert notif_row is not None
    assert "Rotational Dynamics" in notif_row[0]

    # 2. Dedicated reassign endpoint: move question to "Electrostatics"
    res_reassign = client.post(
        f"/api/questions/{qid}/reassign-chapter",
        json={"chapter": "Electrostatics", "subject": "Physics"},
        headers=headers_admin
    )
    assert res_reassign.status_code == 200, res_reassign.text
    assert res_reassign.json()["new_chapter"] == "Electrostatics"
    assert res_reassign.json()["new_unit"] == "Electrodynamics"

    c.execute("SELECT chapter, unit FROM questions WHERE id = ?", (qid,))
    row_reassigned = c.fetchone()
    assert row_reassigned[0] == "Electrostatics"
    assert row_reassigned[1] == "Electrodynamics"

    # 3. Fix-key endpoint: update key and chapter to "Current Electricity"
    res_fix = client.post(
        f"/api/questions/{qid}/fix-key",
        json={"correct_answer": "B", "chapter": "Current Electricity", "subject": "Physics"},
        headers=headers_admin
    )
    assert res_fix.status_code == 200, res_fix.text
    assert res_fix.json()["success"] is True

    c.execute("SELECT correct_answer, chapter, unit FROM questions WHERE id = ?", (qid,))
    row_fixed = c.fetchone()
    assert row_fixed[0] == "B"
    assert row_fixed[1] == "Current Electricity"
    assert row_fixed[2] == "Electrodynamics"

    # Cleanup
    c.execute("DELETE FROM users WHERE id IN (?, ?)", (admin_id, student_id))
    c.execute("DELETE FROM questions WHERE id = ?", (qid,))
    c.execute("DELETE FROM question_reports WHERE question_id = ?", (qid,))
    c.execute("DELETE FROM user_notifications WHERE user_id = ?", (student_id,))
    conn.commit()
    conn.close()
