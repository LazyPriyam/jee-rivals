import pytest
import uuid
import datetime
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.database import get_connection, get_user_by_id, get_user_by_username
from backend.app.auth import create_access_token, hash_pin, verify_pin

client = TestClient(app)

def test_register_validation():
    # 1. Username too short
    res = client.post("/api/auth/register", json={"username": "ab", "pin": "1234"})
    assert res.status_code == 422 or res.status_code == 400

    # 2. Username with invalid characters (spaces)
    res = client.post("/api/auth/register", json={"username": "hello world", "pin": "1234"})
    assert res.status_code == 400
    assert "letters, numbers, underscores" in res.json()["detail"]

    # 3. PIN too short
    res = client.post("/api/auth/register", json={"username": "valid_user_1", "pin": "12"})
    assert res.status_code == 422 or res.status_code == 400

    # 4. Valid registration
    unique_name = f"test_{uuid.uuid4().hex[:8]}"
    res = client.post("/api/auth/register", json={"username": unique_name, "pin": "1234"})
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["user"]["username"].lower() == unique_name.lower()
    assert data["user"]["total_solved"] == 0


def test_pin_change_and_token_invalidation():
    unique_name = f"test_{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/auth/register", json={"username": unique_name, "pin": "1234"})
    assert reg.status_code == 200
    old_token = reg.json()["token"]
    user_id = reg.json()["user"]["id"]

    # Verify old token works on /api/auth/me
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert me_res.status_code == 200

    # Fail pin change with incorrect current PIN
    fail_res = client.post(
        "/api/auth/change-pin",
        json={"current_pin": "9999", "new_pin": "5678"},
        headers={"Authorization": f"Bearer {old_token}"}
    )
    assert fail_res.status_code == 400
    assert "incorrect" in fail_res.json()["detail"].lower()

    # Success pin change
    succ_res = client.post(
        "/api/auth/change-pin",
        json={"current_pin": "1234", "new_pin": "5678"},
        headers={"Authorization": f"Bearer {old_token}"}
    )
    assert succ_res.status_code == 200
    new_token = succ_res.json()["token"]
    assert new_token != old_token

    # Verify new token works
    new_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_token}"})
    assert new_me.status_code == 200

    # Verify old token is now REVOKED via token_version check (Ghost 404)
    old_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert old_me.status_code == 404
    assert "not exist anymore" in old_me.json()["detail"].lower()


def test_change_username():
    unique_name = f"test_{uuid.uuid4().hex[:8]}"
    new_name = f"new_{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/auth/register", json={"username": unique_name, "pin": "1234"})
    assert reg.status_code == 200
    token = reg.json()["token"]

    # Change to invalid name
    inv_res = client.post(
        "/api/auth/change-username",
        json={"new_username": "a b c"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert inv_res.status_code == 400

    # Change to valid new name
    chg_res = client.post(
        "/api/auth/change-username",
        json={"new_username": new_name},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert chg_res.status_code == 200
    new_token = chg_res.json()["token"]

    # Verify user profile reflects new username
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_token}"})
    assert me_res.status_code == 200
    assert me_res.json()["username"] == new_name

    # Verify old token was revoked
    old_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert old_me.status_code == 404


def test_profile_update_and_safe_image():
    unique_name = f"test_{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/auth/register", json={"username": unique_name, "pin": "1234"})
    token = reg.json()["token"]

    # Unsafe image format (script / svg / html)
    bad_img = client.post(
        "/api/auth/profile",
        json={"avatar_image_url": "javascript:alert(1)"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert bad_img.status_code == 400
    assert "invalid avatar image format" in bad_img.json()["detail"].lower()

    # Safe data URL image
    safe_data_uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    good_img = client.post(
        "/api/auth/profile",
        json={
            "avatar_image_url": safe_data_uri,
            "target_college": "IIT Bombay",
            "daily_question_goal": 85
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert good_img.status_code == 200
    p = good_img.json()
    assert p["avatar_image_url"] == safe_data_uri
    assert p["target_college"] == "IIT Bombay"
    assert p["daily_question_goal"] == 85


def test_reset_data():
    unique_name = f"test_{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/auth/register", json={"username": unique_name, "pin": "1234"})
    token = reg.json()["token"]
    user_id = reg.json()["user"]["id"]

    # Simulate some stats
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE users SET total_solved = 42, total_correct = 35 WHERE id = ?", (user_id,))
    c.execute("INSERT OR REPLACE INTO question_bookmarks (user_id, question_id, created_at) VALUES (?, 'q1', ?)",
              (user_id, datetime.datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()

    # Reset
    reset_res = client.post("/api/auth/reset-data", headers={"Authorization": f"Bearer {token}"})
    assert reset_res.status_code == 200
    data = reset_res.json()["user"]
    assert data["total_solved"] == 0
    assert data["total_correct"] == 0

    # Verify bookmarks cleared
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM question_bookmarks WHERE user_id = ?", (user_id,))
    assert c.fetchone()[0] == 0
    conn.close()


def test_delete_account_and_tombstone():
    unique_name = f"test_{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/auth/register", json={"username": unique_name, "pin": "1234"})
    token = reg.json()["token"]

    # Wrong PIN fails
    del_fail = client.post(
        "/api/auth/delete-account",
        json={"pin": "wrong", "confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert del_fail.status_code == 400

    # Correct PIN purges
    del_succ = client.post(
        "/api/auth/delete-account",
        json={"pin": "1234", "confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert del_succ.status_code == 200
    assert del_succ.json()["success"] is True

    # User no longer exists in database
    assert get_user_by_username(unique_name) is None

    # Logging in with deleted account is blocked by tombstone
    login_res = client.post("/api/auth/login", json={"username": unique_name, "pin": "1234"})
    assert login_res.status_code == 401
    assert "permanently deleted" in login_res.json()["detail"].lower()

    # Re-registering the deleted name is blocked by tombstone
    re_reg = client.post("/api/auth/register", json={"username": unique_name, "pin": "1234"})
    assert re_reg.status_code == 400
    assert "permanently deleted" in re_reg.json()["detail"].lower()
