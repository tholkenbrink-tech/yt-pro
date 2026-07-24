from __future__ import annotations


def test_login_username_is_case_insensitive(client, test_user):
    # Family members naturally type their name capitalized ("Tester") even
    # though the seeded account name is lowercase - login must still work.
    resp = client.post("/api/auth/login", json={"username": "TESTER", "password": "testpass123"})
    assert resp.status_code == 200
    assert resp.json()["id"] == test_user.id


def test_login_wrong_password_still_rejected(client, test_user):
    resp = client.post("/api/auth/login", json={"username": "Tester", "password": "wrong"})
    assert resp.status_code == 401
