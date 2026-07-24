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
    always an explicit argument list built server-side. Callers that need the
    real extracted metadata (e.g. the true per-video thumbnail, which
    --flat-playlist listings don't carry) should pass --write-info-json and
    read the resulting <outtmpl>.info.json file themselves."""
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
