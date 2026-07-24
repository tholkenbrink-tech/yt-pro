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

    CORS_ORIGINS: str = ""

    TEMP_DIR: str = "/data/temp"
    THUMBNAIL_DIR: str = "/data/thumbnails"
    COOKIE_DIR: str = "/data/cookies"
    DATABASE_DIR: str = "/data/database"

    SESSION_TTL_HOURS: int = 24 * 30

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


# DEFAULT_QUALITY is a fixed app constant (not a DB column) per spec, keeps profile
# selection simple without needing a migration if the default ever changes.
DEFAULT_QUALITY = "720p"

settings = Settings()
