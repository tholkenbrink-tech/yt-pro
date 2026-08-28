from __future__ import annotations

from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite:////data/database/app.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    SESSION_SECRET: str = "change-me-in-production"

    # Shared parent domain (e.g. ".yt-pro.de") for the CSRF cookie so JS running
    # on the frontend's subdomain can read it via document.cookie. Left unset by
    # default so local dev / the test client (host "testserver") are unaffected -
    # only needed when the API and frontend are on different subdomains of the
    # same registrable domain.
    COOKIE_DOMAIN: Optional[str] = None

    DEFAULT_RETENTION_HOURS: int = 24
    MAX_PLAYLIST_ITEMS: int = 50
    MAX_CONCURRENT_JOBS: int = 2
    MIN_FREE_DISK_BYTES: int = 2 * 1024 * 1024 * 1024

    # Pacing against YouTube's rate limiting, both in seconds. Downloading
    # several videos in a row from one IP is what triggers HTTP 429 / the bot
    # check; a gap between the extractor's API calls and between a job's items
    # costs a few seconds per video and avoids most of it. Raise either if
    # multi-video jobs still fail partway through.
    YTDLP_SLEEP_REQUESTS_SECONDS: float = 1.0
    DOWNLOAD_ITEM_DELAY_SECONDS: float = 3.0

    CORS_ORIGINS: str = ""

    TEMP_DIR: str = "/data/temp"
    THUMBNAIL_DIR: str = "/data/thumbnails"
    COOKIE_DIR: str = "/data/cookies"
    DATABASE_DIR: str = "/data/database"

    # Personal/family app used offline (airplane mode, spotty connectivity)
    # for extended stretches - a short-lived session would force a re-login
    # exactly when there's no connectivity to do it. 90 days gives comfortable
    # headroom over "days or weeks" of not opening the app.
    SESSION_TTL_HOURS: int = 24 * 90

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


# DEFAULT_QUALITY is a fixed app constant (not a DB column) per spec, keeps profile
# selection simple without needing a migration if the default ever changes.
DEFAULT_QUALITY = "720p"

settings = Settings()
