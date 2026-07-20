from __future__ import annotations


def test_duplicate_job_rejected_with_409(auth_client):
    payload = {"url": "https://youtube.com/watch?v=dup123", "selectedQuality": "720p", "sourceType": "video"}

    first = auth_client.post("/api/jobs", json=payload)
    assert first.status_code == 200
    existing_id = first.json()["id"]

    second = auth_client.post("/api/jobs", json=payload)
    assert second.status_code == 409
    assert second.json()["detail"]["existingJobId"] == existing_id


def test_different_quality_is_not_a_duplicate(auth_client):
    base = {"url": "https://youtube.com/watch?v=dup456", "sourceType": "video"}

    first = auth_client.post("/api/jobs", json={**base, "selectedQuality": "720p"})
    assert first.status_code == 200

    second = auth_client.post("/api/jobs", json={**base, "selectedQuality": "1080p"})
    assert second.status_code == 200
