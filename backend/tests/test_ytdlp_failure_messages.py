from __future__ import annotations

import pytest

from app.models.download_item import DownloadItem
from app.models.status import Status
from app.services import download_job
from app.services.job_service import create_job
from app.services.ytdlp_errors import classify_download_failure


@pytest.mark.parametrize(
    "line,expected_fragment",
    [
        (
            "ERROR: [youtube] abc123: HTTP Error 429: Too Many Requests",
            "gedrosselt",
        ),
        (
            'ERROR: unable to write data: [Errno 28] No space left on device',
            "Speicherplatz",
        ),
        (
            "ERROR: [youtube] abc123: Sign in to confirm you're not a bot. Use --cookies",
            "gedrosselt",
        ),
        pytest.param(
            # yt-dlp emits a typographic apostrophe here, not an ASCII one -
            # verbatim from a real run.
            "ERROR: [youtube] abc123: Sign in to confirm you\u2019re not a bot. Use --cookies-from-browser",
            "gedrosselt",
            id="bot-check-typographic-apostrophe",
        ),
        (
            "ERROR: [youtube] abc123: Requested format is not available",
            "Format",
        ),
        (
            "ERROR: [youtube] abc123: Video unavailable. This video has been removed",
            "nicht mehr verfügbar",
        ),
        (
            "ERROR: [youtube] abc123: Private video. Sign in if you've been granted access",
            "privat",
        ),
        (
            "ERROR: unable to download video data: HTTP Error 403: Forbidden",
            "abgelehnt",
        ),
        (
            "ERROR: [youtube] abc123: Unable to download webpage: The read operation timed out",
            "Netzwerkfehler",
        ),
    ],
)
def test_known_failures_get_an_actionable_message(line, expected_fragment):
    assert expected_fragment in classify_download_failure([line])


def test_unrecognized_failure_falls_back_to_ytdlp_own_error_line():
    message = classify_download_failure(
        [
            "[download] Destination: /data/temp/x.mp4",
            "ERROR: [youtube] abc123: Something entirely new went wrong",
        ]
    )
    # Extractor/id prefix stripped, yt-dlp's own wording kept.
    assert message == "Download fehlgeschlagen: Something entirely new went wrong"


def test_silent_failure_still_reports_the_exit_code():
    assert "Code 1" in classify_download_failure([], returncode=1)


def test_long_fallback_message_is_truncated_for_the_column():
    message = classify_download_failure(["ERROR: " + "x" * 2000])
    assert len(message) <= 400


def test_failed_item_stores_the_classified_message(db_session, test_user, monkeypatch):
    def _rate_limited_run_download(args, on_progress_line=None):
        on_progress_line("[download] Destination: /data/temp/whatever.mp4")
        on_progress_line("ERROR: [youtube] fail1: HTTP Error 429: Too Many Requests")
        return 1

    monkeypatch.setattr(download_job.ytdlp_runner, "run_download", _rate_limited_run_download)

    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=fail1",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": "fail1", "title": "Rate limited"}],
    )

    download_job.process_job(job.id)

    db_session.expire_all()
    item = db_session.query(DownloadItem).filter_by(jobId=job.id).one()
    assert item.status == Status.FAILED.value
    assert "gedrosselt" in item.errorMessage
    assert "server logs" not in item.errorMessage


def test_download_args_carry_retry_and_pacing_flags(db_session, test_user, monkeypatch):
    seen: dict[str, list[str]] = {}

    def _capture_args(args, on_progress_line=None):
        seen["args"] = args
        return 1

    monkeypatch.setattr(download_job.ytdlp_runner, "run_download", _capture_args)

    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=flags1",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": "flags1", "title": "Flags"}],
    )
    download_job.process_job(job.id)

    args = seen["args"]
    for flag in ("--retries", "--fragment-retries", "--extractor-retries", "--sleep-requests", "--retry-sleep"):
        assert flag in args, f"{flag} missing from yt-dlp invocation"


def test_multi_item_job_sleeps_between_items_only(db_session, test_user, monkeypatch):
    sleeps: list[float] = []

    monkeypatch.setattr(download_job.settings, "DOWNLOAD_ITEM_DELAY_SECONDS", 3.0)
    monkeypatch.setattr(download_job.time, "sleep", lambda seconds: sleeps.append(seconds))
    monkeypatch.setattr(download_job.ytdlp_runner, "run_download", lambda args, on_progress_line=None: 1)

    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/playlist?list=PL123",
        source_type="playlist",
        quality="720p",
        items=[
            {"youtubeId": "one", "title": "One"},
            {"youtubeId": "two", "title": "Two"},
            {"youtubeId": "three", "title": "Three"},
        ],
    )
    download_job.process_job(job.id)

    # Three items, two gaps - nothing before the first download.
    assert sleeps == [3.0, 3.0]
