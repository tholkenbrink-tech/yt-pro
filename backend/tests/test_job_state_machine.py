from __future__ import annotations

import os

from app.core.config import settings
from app.models.download_item import DownloadItem
from app.models.status import Status
from app.services import download_job
from app.services.job_service import create_job


def _fake_run_download(args, on_progress_line=None):
    # args = [..., "-o", template, url]; extract the -o template to know where to write.
    template = args[args.index("-o") + 1]
    out_path = template.replace("%(ext)s", "mp4")
    with open(out_path, "wb") as f:
        f.write(b"fake video bytes")
    if on_progress_line:
        on_progress_line("[download]  50.0% of ~10.00MiB at 1.00MiB/s ETA 00:05")
        on_progress_line("[download] 100.0% of ~10.00MiB at 1.00MiB/s ETA 00:00")
    return 0


def test_job_progresses_through_full_state_machine(db_session, test_user, monkeypatch):
    monkeypatch.setattr(download_job.ytdlp_runner, "run_download", _fake_run_download)

    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=abc123",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": "abc123", "title": "Test Video"}],
    )
    assert job.status == Status.QUEUED.value

    download_job.process_job(job.id)

    db_session.expire_all()
    refreshed = db_session.get(job.__class__, job.id)
    assert refreshed.status == Status.READY.value
    assert refreshed.completedAt is not None

    item = db_session.query(DownloadItem).filter_by(jobId=job.id).one()
    assert item.status == Status.READY.value
    assert item.mediaPath is not None
    assert os.path.exists(item.mediaPath)
    assert item.fileSize == len(b"fake video bytes")
    # Default retention is "manual delete" (no AppSettings row => no auto-
    # expiry) - files live on the NAS, not ephemeral storage.
    assert item.expiresAt is None


def test_job_marks_failed_on_ytdlp_error(db_session, test_user, monkeypatch):
    def _failing_run_download(args, on_progress_line=None):
        return 1

    monkeypatch.setattr(download_job.ytdlp_runner, "run_download", _failing_run_download)

    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=fail1",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": "fail1", "title": "Failing Video"}],
    )

    download_job.process_job(job.id)

    db_session.expire_all()
    refreshed = db_session.get(job.__class__, job.id)
    assert refreshed.status == Status.FAILED.value

    item = db_session.query(DownloadItem).filter_by(jobId=job.id).one()
    assert item.status == Status.FAILED.value
    assert item.errorMessage is not None


def test_audio_only_item_gets_a_playable_mime_type(db_session, test_user, monkeypatch):
    """Audio downloads land in an .m4a, which is an MP4 container - the item
    has to be labelled audio/mp4 for AVFoundation/Safari to play it. The old
    "audio/m4a" is not a registered type and reached the <video> element and
    the offline store verbatim."""
    monkeypatch.setattr(download_job.ytdlp_runner, "run_download", _fake_run_download)

    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=aud123",
        source_type="video",
        quality="audio",
        items=[{"youtubeId": "aud123", "title": "Nur Ton"}],
    )

    download_job.process_job(job.id)

    db_session.expire_all()
    item = db_session.query(DownloadItem).filter_by(jobId=job.id).one()
    assert item.status == Status.READY.value
    assert item.mimeType == "audio/mp4"


def test_audio_only_download_omits_merge_output_format(db_session, test_user, monkeypatch):
    """--merge-output-format only accepts video containers, so passing "m4a"
    for the audio profile made yt-dlp exit on a usage error before it
    downloaded anything - every audio download failed. An audio-only download
    is a single stream and needs no merge flag at all."""
    captured: list[list[str]] = []

    def _capturing_run_download(args, on_progress_line=None):
        captured.append(args)
        return _fake_run_download(args, on_progress_line)

    monkeypatch.setattr(download_job.ytdlp_runner, "run_download", _capturing_run_download)

    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=aud456",
        source_type="video",
        quality="audio",
        items=[{"youtubeId": "aud456", "title": "Nur Ton"}],
    )
    download_job.process_job(job.id)

    assert captured, "run_download was never called"
    assert "--merge-output-format" not in captured[0]


def test_video_download_still_sets_merge_output_format(db_session, test_user, monkeypatch):
    captured: list[list[str]] = []

    def _capturing_run_download(args, on_progress_line=None):
        captured.append(args)
        return _fake_run_download(args, on_progress_line)

    monkeypatch.setattr(download_job.ytdlp_runner, "run_download", _capturing_run_download)

    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=vid456",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": "vid456", "title": "Mit Bild"}],
    )
    download_job.process_job(job.id)

    assert captured, "run_download was never called"
    args = captured[0]
    assert args[args.index("--merge-output-format") + 1] == "mp4"
