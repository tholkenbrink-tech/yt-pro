# Phase 1 Status

## Implemented
- **Auth**: single seeded admin user, bcrypt password hash, opaque server-side
  session (HttpOnly/Secure/SameSite=None cookie + DB-backed session row so
  logout actually invalidates it), CSRF double-submit token, slowapi rate
  limiting on login.
- **URL analysis**: host allowlist (5 supported YouTube domains) validated via
  `urllib.parse`, yt-dlp `--dump-single-json` with a fixed argument list,
  single video / Shorts / playlist / multi-line-URL support, playlist item
  size limit (`MAX_PLAYLIST_ITEMS`, default 50).
- **Quality profiles**: audio/360p/480p/480p/720p(default)/1080p/best, seeded
  via Alembic data migration; format selectors built server-side from the
  profile, never from client input.
- **Job queue & worker**: Redis + RQ, dedicated worker container, exact
  German-labeled status state machine from the spec, atomic finalize
  (`.part` → `os.replace`), duplicate-job guard (409 on same URL+quality
  while one is in flight), worker-restart recovery (stuck jobs reset to
  `queued` on worker boot).
- **iPhone-compatibility transparency**: the worker now actually probes the
  produced file with `ffprobe` and reports `no_conversion` / `merged_only` /
  `converted_for_iphone` based on real codec inspection (this was a stub in
  an earlier draft — fixed and covered by the existing job-state-machine
  tests, which still pass).
- **Download delivery**: authenticated `GET /api/items/{id}/download` with
  Range support, sanitized `Content-Disposition` filename, 401/410 handling,
  an in-process "currently streaming" guard so the scheduler never deletes a
  file mid-transfer. ZIP bundling endpoint for playlists.
- **Temp file retention**: configurable (1h/6h/24h/3d/manual, default 24h),
  scheduler container sweeps expired files every minute, history rows
  survive file deletion.
- **History**: search/sort/filter, re-prepare, delete.
- **Storage status**: used/free bytes, low-space warning, runtime-changeable
  retention.
- **Cookie import scaffold**: admin-only Netscape cookies.txt upload, status
  tracking, wired to yt-dlp's `--cookies` flag. No UI for *obtaining*
  cookies, no OAuth — intentionally out of scope.
- **Frontend**: Home, Analyze/preview (single + playlist with per-item
  deselect), Job progress (polling-based live updates, not SSE — see
  Deviations), Finished-download card with iOS save instructions, History,
  Storage settings, first-run legal notice modal, PWA manifest + shell-only
  service worker (never caches `/api/*` or downloads), safe-area CSS,
  light/dark theme.
- **Docker Compose**: `api`/`worker`/`scheduler`/`redis`/`cloudflared`,
  named volumes, healthchecks, non-root containers via PUID/PGID.

## Tested
- Backend: 35 pytest tests, all green, all offline (yt-dlp/ffmpeg mocked).
  Covers URL allowlist edge cases, format-selector logic, filename
  sanitization/path-traversal, full job state machine (success + failure
  path), duplicate-job rejection, worker-restart recovery, scheduled expiry
  (incl. active-stream protection), authenticated download (401/200/410),
  playlist size limit, disk-space guard.
- Frontend: `npm run build` + `next lint` clean; 9/9 Vitest unit tests
  (status-label map, CSRF cookie reader); 28/28 Playwright e2e tests across
  iPhone SE / iPhone 14 / iPhone Pro Max / iPad viewports, fully mocked API.
- Full stack: `docker compose up -d --build` verified locally — `api`,
  `worker`, `scheduler`, `redis` all reach a healthy/running state,
  `GET /api/health` responds `{"status":"ok"}`. Found and fixed two
  Compose-level bugs during this verification: `worker`/`scheduler` needed
  `PYTHONPATH=/app` to resolve the `app` package when run as
  `python worker/run.py`, and both containers inherited the API's HTTP
  healthcheck from the shared Dockerfile even though they don't serve HTTP
  (now explicitly disabled for those two services).
- `cloudflared` correctly restart-loops locally with no real tunnel token
  configured — expected, not a bug; only resolves once a real
  `CLOUDFLARE_TUNNEL_TOKEN` is set on the actual NAS deployment.

## Not tested (needs you, on your real NAS + iPhone)
- A real yt-dlp download against actual YouTube — this dev environment's
  network access to YouTube was not exercised; the pytest suite deliberately
  mocks the subprocess boundary per the spec's copyright-safety instruction.
  **Run one real end-to-end download on your NAS before trusting this in
  daily use.**
- Real Cloudflare Tunnel + Pages deployment (tunnel token, DNS, Pages
  project creation) — README has the exact steps, but nobody has run them.
- Real Safari-on-iPhone behavior: Add-to-Home-Screen flow, the actual
  Safari download manager UI, "In Dateien sichern" flow, standalone-mode
  detection, Dynamic Island/safe-area rendering on a physical device.
- Long-running job survival across an actual NAS reboot (worker-restart
  recovery is unit-tested against the DB state machine, not against a real
  Docker restart mid-download).

## Known limitations / deviations
- **Polling instead of SSE** for job progress: native `EventSource` can't
  reliably send `credentials: "include"` cross-site, which is exactly the
  situation here (Pages frontend, tunneled API) and iPhone Safari is the
  worst case for it. The frontend polls `GET /api/jobs/{id}` every 2s
  (backing off once terminal) instead — functionally equivalent, slightly
  less efficient, much more reliable on iOS.
- Channel/`/videos`/`/shorts`/`/streams`/watched-playlist source types exist
  as inert string values in the data model but have no analysis logic or UI
  — reserved for Phase 2 as specified.
- No video player, no watch position, no AirPlay — intentionally excluded
  from this phase.
- SQLite only (Postgres was explicitly optional for the MVP); the schema is
  managed through Alembic so switching `DATABASE_URL` later shouldn't need a
  rewrite, but that switch itself hasn't been exercised.
- Single admin user only; no invite/multi-user flow.

## Architecture notes for Phase 2
- A player would slot in as a new route (e.g. `/watch/[itemId]`) reading
  from the existing `DownloadItem.mediaPath`/`fileName` — no schema change
  needed beyond adding watch-position fields if "continue watching" is
  wanted later.
- Channel/watched-playlist sync would extend `analyze_service.py` +
  `download_job.py` to poll a channel's `/videos` (or similar) feed on a
  scheduler tick and auto-enqueue new items against the already-scaffolded
  `sourceType` values — the DB and job model don't need to change, just the
  scheduler and a new "watched source" table.
- If a second concurrent user is ever wanted, the session/User model already
  supports it (`userId` foreign keys throughout); what's missing is a
  registration/invite flow and per-user storage quotas.
