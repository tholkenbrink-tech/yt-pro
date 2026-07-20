from __future__ import annotations

# Shared by the Alembic data migration and tests so the seed data lives in one place.
DOWNLOAD_PROFILES_SEED = [
    {
        "name": "audio",
        "maximumResolution": None,
        "audioOnly": True,
        "preferredContainer": "m4a",
        "preferredVideoCodec": None,
        "preferredAudioCodec": "aac",
        "enabled": True,
    },
    {
        "name": "360p",
        "maximumResolution": 360,
        "audioOnly": False,
        "preferredContainer": "mp4",
        "preferredVideoCodec": "h264",
        "preferredAudioCodec": "aac",
        "enabled": True,
    },
    {
        "name": "480p",
        "maximumResolution": 480,
        "audioOnly": False,
        "preferredContainer": "mp4",
        "preferredVideoCodec": "h264",
        "preferredAudioCodec": "aac",
        "enabled": True,
    },
    {
        "name": "720p",
        "maximumResolution": 720,
        "audioOnly": False,
        "preferredContainer": "mp4",
        "preferredVideoCodec": "h264",
        "preferredAudioCodec": "aac",
        "enabled": True,
    },
    {
        "name": "1080p",
        "maximumResolution": 1080,
        "audioOnly": False,
        "preferredContainer": "mp4",
        "preferredVideoCodec": "h264",
        "preferredAudioCodec": "aac",
        "enabled": True,
    },
    {
        "name": "best",
        "maximumResolution": None,
        "audioOnly": False,
        "preferredContainer": "mp4",
        "preferredVideoCodec": "h264",
        "preferredAudioCodec": "aac",
        "enabled": True,
    },
]
