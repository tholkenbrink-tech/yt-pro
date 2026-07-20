from __future__ import annotations

import logging
import sys

from rq import Worker

from app.core.queue import QUEUE_NAME, get_redis_connection
from app.services.download_job import recover_stuck_jobs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("yt_pro.worker.run")


def main() -> None:
    recovered = recover_stuck_jobs()
    if recovered:
        logger.info("recovered %d stuck job(s) back to queued", recovered)

    # Single worker process is the concurrency control: MAX_CONCURRENT_JOBS is
    # enforced by running exactly one worker replica against the queue rather
    # than a semaphore -- documented tradeoff, keeps this simple.
    connection = get_redis_connection()
    worker = Worker([QUEUE_NAME], connection=connection)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    sys.exit(main())
