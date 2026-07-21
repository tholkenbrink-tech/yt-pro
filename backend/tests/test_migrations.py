from __future__ import annotations

import os
import subprocess
import sys
import tempfile

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_alembic_upgrade_head_runs_clean_on_fresh_db():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(db_path)

    env = dict(os.environ)
    env.update(
        {
            "DATABASE_URL": f"sqlite:///{db_path}",
            "REDIS_URL": "redis://localhost:6379/15",
            "ADMIN_USERNAME": "a",
            "ADMIN_PASSWORD": "b",
            "SESSION_SECRET": "c",
            "CORS_ORIGINS": "http://x",
        }
    )
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr

    import sqlite3

    conn = sqlite3.connect(db_path)
    tables = {row[0] for row in conn.execute("select name from sqlite_master where type='table'")}
    conn.close()
    os.remove(db_path)

    for expected in (
        "monitored_sources",
        "monitored_source_items",
        "source_check_runs",
        "playback_progress",
        "download_items",
    ):
        assert expected in tables
