from __future__ import annotations

import shutil
from collections import namedtuple

from app.services import disk

FakeUsage = namedtuple("usage", ["total", "used", "free"])


def test_job_creation_rejected_when_disk_nearly_full(auth_client, monkeypatch):
    monkeypatch.setattr(shutil, "disk_usage", lambda path: FakeUsage(total=100, used=100, free=0))

    resp = auth_client.post(
        "/api/jobs",
        json={"url": "https://youtube.com/watch?v=diskfull", "selectedQuality": "720p", "sourceType": "video"},
    )
    assert resp.status_code == 507


def test_job_creation_allowed_with_enough_disk(auth_client, monkeypatch):
    monkeypatch.setattr(
        shutil, "disk_usage", lambda path: FakeUsage(total=100 * 1024**3, used=1, free=99 * 1024**3)
    )

    resp = auth_client.post(
        "/api/jobs",
        json={"url": "https://youtube.com/watch?v=diskok", "selectedQuality": "720p", "sourceType": "video"},
    )
    assert resp.status_code == 200
