from __future__ import annotations

from functools import lru_cache

import redis
from rq import Queue

from app.core.config import settings

QUEUE_NAME = "downloads"

# RQ's default job timeout is 180s - process_job downloads every item in a
# job sequentially in one RQ job execution, so a single longer video (or any
# playlist with more than one item) reliably exceeded that and got silently
# killed mid-download with no error surfaced (RQ's JobTimeoutException isn't
# a subclass of Exception, so it isn't caught by _process_item's per-item
# try/except either). This is a generous ceiling, not a target duration -
# large/slow playlists should still finish well within it.
DOWNLOAD_JOB_TIMEOUT_SECONDS = 6 * 60 * 60


@lru_cache
def get_redis_connection():
    return redis.from_url(settings.REDIS_URL)


def get_queue() -> Queue:
    return Queue(QUEUE_NAME, connection=get_redis_connection())


def enqueue_download_job(job_id: str) -> None:
    get_queue().enqueue(
        "app.services.download_job.process_job",
        job_id,
        job_id=job_id,
        job_timeout=DOWNLOAD_JOB_TIMEOUT_SECONDS,
    )
