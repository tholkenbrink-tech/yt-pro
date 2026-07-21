from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.limiter import limiter
from app.routers import admin, analyze, auth, downloads, history, jobs, library, sources, storage
from app.services.seed import seed_admin_user


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_admin_user(db)
    finally:
        db.close()
    yield


app = FastAPI(title="yt-pro", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(analyze.router)
app.include_router(jobs.router)
app.include_router(downloads.router)
app.include_router(history.router)
app.include_router(storage.router)
app.include_router(admin.router)
app.include_router(library.router)
app.include_router(sources.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
