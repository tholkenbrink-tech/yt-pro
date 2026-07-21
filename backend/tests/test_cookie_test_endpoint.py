from __future__ import annotations

import io

from app.services import ytdlp_runner


def _upload_valid_cookie_file(auth_client):
    content = b"# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tFALSE\t0\tname\tvalue\n"
    return auth_client.post(
        "/api/admin/cookies", files={"file": ("cookies.txt", io.BytesIO(content), "text/plain")}
    )


def test_cookie_test_without_file_returns_error(auth_client):
    resp = auth_client.post("/api/admin/cookies/test")
    assert resp.status_code == 200
    assert resp.json()["status"] == "error"


def test_cookie_test_valid(auth_client, monkeypatch):
    _upload_valid_cookie_file(auth_client)

    async def _fake(url, flat_playlist=False, cookies_path=None):
        assert cookies_path is not None
        return {"id": "dQw4w9WgXcQ", "title": "Test"}

    monkeypatch.setattr(ytdlp_runner, "dump_json", _fake)

    resp = auth_client.post("/api/admin/cookies/test")
    assert resp.status_code == 200
    assert resp.json()["status"] == "valid"


def test_cookie_test_expired(auth_client, monkeypatch):
    _upload_valid_cookie_file(auth_client)

    async def _fake(url, flat_playlist=False, cookies_path=None):
        raise ytdlp_runner.YtdlpError("ERROR: cookies are no longer valid, please sign in again")

    monkeypatch.setattr(ytdlp_runner, "dump_json", _fake)

    resp = auth_client.post("/api/admin/cookies/test")
    assert resp.status_code == 200
    assert resp.json()["status"] == "expired"
