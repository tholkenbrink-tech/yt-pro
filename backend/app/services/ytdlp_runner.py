from __future__ import annotations

import asyncio
import json
import subprocess
from typing import Any, Optional

ANALYZE_TIMEOUT_SECONDS = 30


class YtdlpError(RuntimeError):
    pass


async def dump_json(url: str, flat_playlist: bool = False, cookies_path: Optional[str] = None) -> dict[str, Any]:
    """Runs `yt-dlp --dump-single-json` for a single URL. Fixed argument list,
    no user-supplied yt-dlp flags -- `url` has already passed the host allowlist.
    `cookies_path` is a server-configured file path, never user input."""
    args = ["yt-dlp", "--dump-single-json", "--no-warnings", "--skip-download"]
    if flat_playlist:
        args.append("--flat-playlist")
    if cookies_path:
        args.extend(["--cookies", cookies_path])
    args.append(url)

    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=ANALYZE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise YtdlpError("yt-dlp analyze timed out")

    if proc.returncode != 0:
        raise YtdlpError(stderr.decode("utf-8", errors="replace")[:2000])

    try:
        return json.loads(stdout.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        raise YtdlpError("yt-dlp returned invalid JSON") from exc


def run_download(args: list[str], on_progress_line=None) -> int:
    """Runs yt-dlp for an actual download, streaming stdout line-by-line to
    on_progress_line. Sync (used from the RQ worker process). Never shell=True,
    always an explicit argument list built server-side."""
    proc = subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        if on_progress_line:
            on_progress_line(line.rstrip("\n"))
    proc.wait()
    return proc.returncode


def run_ffmpeg(args: list[str], on_progress_line=None) -> int:
    """Same streaming pattern as run_download - ffmpeg logs progress
    (`time=00:00:05.00 ...`) to stderr, merged into stdout here so callers
    can track a genuinely long-running encode instead of it looking frozen."""
    if on_progress_line is None:
        proc = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        return proc.returncode

    proc = subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        on_progress_line(line.rstrip("\n"))
    proc.wait()
    return proc.returncode


def probe_duration(path: str) -> Optional[float]:
    """Source duration in seconds, used to turn ffmpeg's `time=` progress
    lines into a percentage. None if ffprobe is unavailable/fails - callers
    must fall back to a coarser progress signal, never crash on this."""
    try:
        proc = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
        )
        if proc.returncode != 0:
            return None
        return float(proc.stdout.strip())
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None


def probe_bitrate_kbps(path: str) -> Optional[int]:
    """Overall (video+audio) bitrate in kbit/s, used to decide whether a
    source is already small enough to skip the fixed-bitrate re-encode
    pass entirely. None if ffprobe is unavailable/fails."""
    try:
        proc = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=bit_rate",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
        )
        if proc.returncode != 0:
            return None
        return int(float(proc.stdout.strip()) / 1000)
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None


def probe_codecs(path: str) -> tuple[Optional[str], Optional[str]]:
    """Returns (video_codec, audio_codec) for a media file via ffprobe, or
    (None, None) if it can't be determined (missing binary, unreadable file) --
    callers must treat unknown codecs as "don't touch it", never as "needs conversion"."""
    try:
        proc = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "stream=codec_type,codec_name",
                "-of", "json",
                path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
        )
        if proc.returncode != 0:
            return None, None
        data = json.loads(proc.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return None, None

    video_codec = None
    audio_codec = None
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video" and video_codec is None:
            video_codec = stream.get("codec_name")
        elif stream.get("codec_type") == "audio" and audio_codec is None:
            audio_codec = stream.get("codec_name")
    return video_codec, audio_codec
