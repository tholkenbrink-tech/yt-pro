# Phase 2 Implementation Plan

## Audit: Phase 1 status (verified against current repo, commit `fb1c4ed`)
- **Backend** (`backend/app/`): FastAPI + SQLAlchemy (SQLite) + Alembic + Redis/RQ.
  Models: `User`, `Session`, `DownloadJob`, `DownloadItem`, `DownloadProfile`,
  `CookieConfig`, `AppSettings`. Routers: `auth`, `analyze`, `jobs`, `downloads`,
  `history`, `storage`, `admin`. `app/main.py` runs `Base.metadata.create_all`
  **and** Alembic migrations are used for docker-compose boot — new models need
  both an ORM class (auto-created) and a real Alembic migration (source of
  truth for the NAS deployment).
- **Streaming/Range is already implemented** in `backend/app/routers/downloads.py`
  (`_get_owned_item`, `_iter_range`, `active_stream` context manager) for the
  authenticated download endpoint. This is directly reusable for the new
  in-app player streaming endpoint — same ownership/expiry checks, same
  Range parsing, just a different response disposition (inline, not
  attachment) and no forced download filename.
- **Worker** (`backend/worker/run.py` + `app/services/download_job.py`): RQ job,
  full status state machine, now includes real ffprobe-based codec detection
  for `conversionNote` (fixed post-Phase-1). **Reused as-is** for Phase 2 —
  automatic sources feed the exact same job pipeline, no new download logic
  needed.
- **Scheduler** (`backend/scheduler/run.py`): currently only sweeps expired
  temp files every minute. Phase 2 adds a second responsibility (checking due
  `MonitoredSource` rows) to the same container/process — no new container
  needed, matches spec's "separate scheduler container, not cron in the web
  container" requirement since it already is separate.
- **Frontend** (`frontend/`): Next.js 14 App Router, Tailwind, routes `/`,
  `/analyze`, `/jobs/[id]`, `/history`, `/settings`, `/login`. Components:
  `BottomNav`, `DownloadCard`, `JobItemCard`, `QualitySelector`, `StatusPill`,
  `StorageStrip`, etc. `lib/statusLabels.ts` centralizes status→German-label
  mapping (reuse this pattern for the new media/source state configs).
  Polling-based live updates (`lib/useJobPolling.ts`) chosen over SSE for iOS
  Safari credential reliability — **keep this approach for Phase 2** (playback
  progress sync, source check status) for the same reason.
- No `FRONTEND_DESIGN_STATUS.md` exists yet — this plan doc plus
  `PHASE_2_STATUS.md` (written at the end) supersede that.

## Reusable components/patterns (don't rebuild)
- `_iter_range`/`active_stream`/`_get_owned_item` in `downloads.py` → base for
  the new `/api/items/{id}/stream` endpoint.
- `ytdlp_runner.dump_json` / `probe_codecs` → reused unmodified for monitored
  source playlist checks and codec-based iPhone-compatibility notes.
- `job_service.create_job` duplicate-guard pattern (hash of url+quality) →
  extend the same idea to per-YouTube-ID de-dup for monitored sources.
- `lib/statusLabels.ts` + `lib/useJobPolling.ts` on the frontend → same
  pattern for media/source state labels and progress-save polling.
- `lib/api.ts` (fetch client with CSRF header injection) → extend with new
  endpoints, no new client needed.

## Migrations needed (Alembic, additive only — no changes to existing columns)
1. `playback_progress` table (`PlaybackProgress` per spec §22.1), unique index
   on `(userId, downloadItemId)`.
2. `monitored_sources` table (§22.2).
3. `monitored_source_items` table (§22.3), unique index on
   `(monitoredSourceId, youtubeId)`.
4. `source_check_runs` table (§22.4).
5. `download_items` gets additive columns: `sourceType`, `monitoredSourceId`
   (nullable FK), `originalPlaylistId`, `isAutomaticallyPrepared` (bool,
   default false), `retentionPolicy`, `keepOnServer` (bool, default false),
   `lastStreamedAt`. (`activeStreamCount` already exists as `activeStreams`
   — reuse, don't rename, to avoid an unnecessary breaking migration.)

## API extensions (additive — no existing route signatures change)
- `GET /api/items/{id}/stream` — new, player-facing Range endpoint (reuses
  existing streaming helpers, inline disposition).
- `GET /api/items/{id}/progress`, `PUT /api/items/{id}/progress`,
  `POST /api/items/{id}/progress/reset`, `POST /api/items/{id}/mark-watched`.
- `GET /api/library` — the Mediathek listing (filters: status/manual-vs-auto/
  source/quality/type/expiring-soon; sort; search) built from `DownloadItem`
  joined with `PlaybackProgress` and `MonitoredSource` — this is a new
  read-optimized endpoint, not a replacement for `/api/history`, since
  History (Phase 1) and Mediathek (Phase 2) show overlapping but distinct
  info (history = all attempts incl. failed; library = ready/kept media).
- `GET/POST /api/sources`, `GET/PUT/DELETE /api/sources/{id}`,
  `POST /api/sources/{id}/pause`, `POST /api/sources/{id}/resume`,
  `POST /api/sources/{id}/check-now`, `GET /api/sources/{id}/runs`,
  `GET /api/sources/{id}/items`, `POST /api/sources/{id}/items/{itemId}/prepare`,
  `POST /api/sources/{id}/items/{itemId}/ignore`.
- `PUT /api/items/{id}/keep` (toggle "behalten"/never-auto-expire).
- Cookie endpoints already exist (`admin.py`) — extend with
  `POST /api/admin/cookies/test` (dry-run yt-dlp analyze against a known
  private-ish check, or simplest: attempt `dump_json` on the configured
  cookie file against a fixed public URL to confirm yt-dlp accepts the
  cookie file format/isn't expired-looking) per §23.4.

## Frontend changes
- New design tokens (CSS custom properties) replacing ad-hoc Tailwind
  colors: `--color-background/surface/surfaceElevated/text-*/border/accent*/
  success/warning/error/info/progress-track/overlay`, indigo/violet accent
  (not YouTube red), light+dark via `prefers-color-scheme` + a manual
  toggle stored in settings.
- New nav: `AppShell` with `MobileBottomNavigation` (Download/Aktivität/
  Mediathek/Einstellungen, ≤4 items, safe-area padding) and
  `DesktopSidebar` (≥ tablet width) — replaces current `BottomNav`-only shell.
- Routes added: `/activity` (renames/absorbs the active-jobs part of `/`),
  `/activity/[jobId]` (replaces `/jobs/[id]`, kept as a redirect for any
  saved links), `/library`, `/library/[videoId]` (with `VideoPlayer`),
  `/settings/sources`, `/settings/sources/new`, `/settings/sources/[id]`,
  `/settings/storage`, `/settings/account`. `/download` becomes the new home
  (`/` redirects to it); `/download/preview` absorbs the current `/analyze`.
- New components per spec §24 — built incrementally, prioritizing the ones
  the acceptance criteria actually exercise (`VideoPlayer`, `PlayerControls`,
  `PictureInPictureButton`, `MediaCard`, `AutomatedSourceCard`,
  `SourceSchedulePicker`, `SourceModeSelector`, `EstimatedFileSize`,
  `StatusBadge`/`ProgressBar` refactor of existing `StatusPill`) before purely
  cosmetic ones (`Toast`, `Skeleton`, `FilterSheet` can be simple first drafts).
- `VideoPlayer`: native `<video controls playsinline preload="metadata">`,
  progress auto-save via `timeupdate` (throttled to ~7s) +
  `pagehide`/`visibilitychange`/`enterpictureinpicture` handlers, resume
  prompt, PiP button gated on `document.pictureInPictureEnabled`.

## Risks / iOS & Safari constraints
- **PiP support is Safari-version-dependent** and unverifiable from this dev
  environment — code must feature-detect (`document.pictureInPictureEnabled`
  and `video.webkitSupportsPresentationMode` for the older iOS Safari PiP
  API) and hide the button entirely rather than showing a broken one.
- **AirPlay** has no JS API to detect availability reliably on iOS Safari —
  show a static hint/label near native controls rather than a custom button
  claiming to trigger it (native `<video>` controls already expose AirPlay
  when available; don't reimplement).
- **Range requests over the Cloudflare Tunnel**: must verify Cloudflare
  doesn't strip/mangle `Range`/`Content-Range` headers for large media — flag
  as a real-device test item, not assumed to work.
- **Background scheduler correctness while the PWA is closed** is inherently
  server-side already (Phase 1 architecture) — Phase 2 doesn't change this
  guarantee, just adds a second scheduled job type to the same process.
- **SQLite + concurrent scheduler/worker writes**: existing code already
  handles this via short-lived sessions; the new per-source "checking" lock
  needs a DB-row-based lock (a `lastCheckedAt`/status compare-and-set), not a
  file lock, since multiple processes touch the same SQLite file.
- Real iPhone/Safari testing, real Cloudflare Tunnel Range behavior, and
  real scheduled-source-checking against actual YouTube playlists cannot be
  verified from this dev environment — called out explicitly in
  `PHASE_2_STATUS.md` as pending on the user's real deployment, same caveat
  as Phase 1.

## Implementation order (mirrors spec §31)
1. This plan.
2. Migrations (5 items above).
3. Streaming endpoint + progress API (backend).
4. Player + resume UI (frontend).
5. Mediathek redesign (frontend, backed by `GET /api/library`).
6. Monitored sources backend (CRUD, analyze-as-source, item discovery).
7. Scheduler: due-source checking, per-source lock, duplicate protection,
   backoff on failure.
8. Frontend for automatic sources (`/settings/sources*`).
9. Settings redesign (all sub-sections from spec §19).
10. PiP, AirPlay hint, iOS polish pass across the whole frontend.
11. Tests (new + full Phase 1 regression).
12. Docs (`PHASE_2_STATUS.md`, README/`.env.example`/docker docs updates).

Given the scope, backend (migrations→streaming→progress→sources→scheduler)
and frontend (design system→shell→player→library→sources UI→settings) are
built as two parallel workstreams against the API contract above, same
pattern as Phase 1, then integrated and verified together (build, full test
suite, `docker compose up` health check) before writing status docs.
