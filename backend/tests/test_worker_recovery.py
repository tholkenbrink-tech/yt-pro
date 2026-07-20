from __future__ import annotations

from app.models.status import Status
from app.services.download_job import recover_stuck_jobs
from app.services.job_service import create_job


def test_stuck_job_reset_to_queued(db_session, test_user):
    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=stuck1",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": "stuck1", "title": "Stuck Video"}],
    )
    job.status = Status.DOWNLOADING_VIDEO.value
    for item in job.items:
        item.status = Status.DOWNLOADING_VIDEO.value
    db_session.commit()

    recovered_count = recover_stuck_jobs()
    assert recovered_count == 1

    db_session.expire_all()
    refreshed = db_session.get(job.__class__, job.id)
    assert refreshed.status == Status.QUEUED.value
    for item in refreshed.items:
        assert item.status == Status.QUEUED.value


def test_terminal_jobs_are_not_touched(db_session, test_user):
    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=done1",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": "done1", "title": "Done Video"}],
    )
    job.status = Status.READY.value
    db_session.commit()

    recovered_count = recover_stuck_jobs()
    assert recovered_count == 0

    db_session.expire_all()
    refreshed = db_session.get(job.__class__, job.id)
    assert refreshed.status == Status.READY.value
