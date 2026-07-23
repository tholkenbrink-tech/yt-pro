from __future__ import annotations

import os
import tempfile

_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)

os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["ADMIN_USERNAME"] = "testadmin"
os.environ["ADMIN_PASSWORD"] = "testpass123"
os.environ["SESSION_SECRET"] = "test-secret"
os.environ["CORS_ORIGINS"] = "http://testserver"
os.environ["TEMP_DIR"] = tempfile.mkdtemp(prefix="yt_pro_temp_")
os.environ["COOKIE_DIR"] = tempfile.mkdtemp(prefix="yt_pro_cookies_")
os.environ["MIN_FREE_DISK_BYTES"] = "1"  # low bar so disk-guard tests can opt in explicitly

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.deps import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME  # noqa: E402
from app.core.security import hash_password, new_token  # noqa: E402
from app.main import app  # noqa: E402
from app.models.download_profile import DownloadProfile  # noqa: E402
from app.models.session import Session as SessionModel  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.profiles_seed import DOWNLOAD_PROFILES_SEED  # noqa: E402

from datetime import datetime, timedelta  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    for profile in DOWNLOAD_PROFILES_SEED:
        db.add(DownloadProfile(**profile))
    db.commit()
    db.close()
    yield


@pytest.fixture(autouse=True)
def _no_real_queue(monkeypatch):
    monkeypatch.setattr("app.routers.jobs.enqueue_download_job", lambda job_id: None)
    monkeypatch.setattr("app.routers.history.enqueue_download_job", lambda job_id: None)
    monkeypatch.setattr("app.routers.sources.enqueue_download_job", lambda job_id: None)
    monkeypatch.setattr("app.core.queue.enqueue_download_job", lambda job_id: None)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def test_user(db_session):
    user = User(name="tester", passwordHash=hash_password("testpass123"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_client(client, test_user, db_session):
    session_id = new_token()
    csrf_token = new_token(16)
    db_session.add(
        SessionModel(
            id=session_id,
            userId=test_user.id,
            expiresAt=datetime.utcnow() + timedelta(hours=1),
        )
    )
    db_session.commit()

    client.cookies.set(SESSION_COOKIE_NAME, session_id)
    client.cookies.set(CSRF_COOKIE_NAME, csrf_token)
    client.headers.update({"X-CSRF-Token": csrf_token})
    return client
