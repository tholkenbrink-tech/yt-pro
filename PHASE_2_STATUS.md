# Phase 2 Status

## Implemented
- **Migrations**: `alembic/versions/0003_phase2_playback_sources.py` adds
  `PlaybackProgress`, `MonitoredSource`, `MonitoredSourceItem`,
  `SourceCheckRun`, and additive columns on `DownloadItem` (`sourceType`,
  `monitoredSourceId`, `originalPlaylistId`, `isAutomaticallyPrepared`,
  `retentionPolicy`, `keepOnServer`, `lastStreamedAt`). Verified
  `alembic upgrade head` runs clean on a fresh SQLite file (both in isolated
  testing and via the real `docker compose up` boot sequence, log-confirmed:
  `Running upgrade 0002 -> 0003`). No existing columns renamed or removed.
- **Streaming**: `GET /api/items/{id}/stream` reuses the exact
  Range/ownership/expiry logic already proven in Phase 1's download endpoint
  (`_get_owned_item`/`_iter_range`/`active_stream` in `downloads.py`), just
  with an inline (non-attachment) disposition for `<video src>` playback.
  Bumps `lastStreamedAt` on access.
- **Playback progress**: `GET/PUT /api/items/{id}/progress`,
  `POST /api/items/{id}/progress/reset`, `POST /api/items/{id}/mark-watched`.
  Completed logic (≥95% or <30s remaining) matches spec §15.4, mirrored on
  both backend (authoritative) and frontend (belt-and-suspenders UI state).
- **Mediathek backend**: `GET /api/library` (filter/sort/search over ready
  items + progress + source name), `PUT /api/items/{id}/keep` (exempts an
  item from the expiry scheduler regardless of `expiresAt` — verified the
  scheduler's sweep query and tested that a kept+expired item survives).
- **Automatic sources**: full CRUD + `POST /api/sources/analyze` (playlist
  preview before saving) + `check-now` + run history + per-item
  prepare/ignore. `source_service.check_source()` implements the three modes
  (discover-only / confirm-first / auto-prepare), per-item dedup via a
  unique `(monitoredSourceId, youtubeId)` index, a SQLite-safe compare-and-set
  lock (`UPDATE ... SET checking=1 WHERE checking=0`) so a manual "jetzt
  prüfen" and a scheduler tick can't double-process the same source,
  `maximumNewItemsPerRun`/`maximumBytesPerRun`/`maximumDurationSeconds` caps
  (with the skip count recorded, not silently dropped), and exponential
  backoff on repeated failures. A missing/expired cookie file surfaces as a
  distinct `authRequired` computed status rather than deleting the source or
  showing a generic failure, per spec §18.2.
- **Scheduler**: `scheduler/run.py` now does two things per 60s tick — the
  existing Phase 1 expiry sweep (now respecting `keepOnServer`) and a new
  due-source check (`nextCheckAt <= now AND enabled AND NOT checking`),
  reusing the same `check_source` function the manual endpoint calls.
- **Cookie test endpoint**: `POST /api/admin/cookies/test` runs a real
  `yt-dlp --dump-single-json` against a fixed public URL with the configured
  cookie file to confirm it's still accepted by yt-dlp.
- **Frontend design system**: CSS custom-property tokens (indigo/violet
  accent, explicitly not YouTube red), light/dark/system theme (no
  flash-of-wrong-theme), 8pt spacing scale, defined radii/type scale,
  `prefers-reduced-motion` respected.
- **Navigation**: `AppShell` with `MobileBottomNavigation` (4 items: Download/
  Aktivität/Mediathek/Einstellungen) and `DesktopSidebar` (≥ tablet). Old
  routes (`/`, `/analyze`, `/jobs/[id]`) redirect to their Phase 2
  equivalents rather than 404ing.
- **Player**: native `<video controls playsinline preload="metadata">`
  against the new stream endpoint — no custom playback-blocking overlay, so
  native iOS controls (incl. AirPlay when available) keep working. Resume
  UX: immediate seek to the saved position + a dismissible "Fortgesetzt bei
  MM:SS" toast with a "Von vorne" undo (chosen over a blocking pre-play
  prompt for a smoother feel). Progress saved on throttled `timeupdate`
  (~7s), `pause`, `pagehide`, `visibilitychange`, and PiP entry.
  `PictureInPictureButton` feature-detects `document.pictureInPictureEnabled`
  with a `webkitSupportsPresentationMode` fallback for older iOS Safari, and
  is hidden entirely (never shown-then-broken) when neither is available.
  `AirPlayHint` is a static label, not a custom trigger — iOS Safari has no
  reliable JS API to drive AirPlay directly, so the native control is relied
  on instead.
- **Mediathek**: `MediaCard` (1/2/3-column responsive grid), centralized
  `lib/mediaStateConfig.ts` (same pattern as Phase 1's `statusLabels.ts`) for
  Neu/Begonnen/Angesehen/Automatisch vorbereitet/Läuft bald ab/Auf iPhone
  geladen, filters/sort/search wired straight to `GET /api/library` query
  params.
- **Automatic sources UI**: `/settings/sources` list, `/settings/sources/new`
  (paste → analyze preview → quality → schedule → mode → limits → save),
  `/settings/sources/[sourceId]` (edit, pause/resume, jetzt-prüfen,
  discovered-items list with prepare/ignore, run history).
- **Settings**: Download, Player, Automatische Quellen, Speicher,
  YouTube-Zugang, Design, Erweitert sections built. **Konto/password-change
  omitted** — there is no backend endpoint for changing the password (only
  the single env-seeded admin account from Phase 1), so the frontend agent
  correctly left this out rather than building a UI for a non-existent
  capability; logout/session info still present.

## Tested
- Backend: **69 pytest tests, all green** (35 original Phase 1 + 34 new
  Phase 2), including migration apply/rollback, stream endpoint (full/range/
  open-range/invalid-range/401/410), progress CRUD, library filtering/sort/
  search, source creation/analyze/check-now/discovery/dedup/caps, paused
  source skipped by scheduler, missing-cookie → authRequired without
  deletion, concurrent check-now + scheduler tick doesn't double-process,
  keepOnServer survives the expiry sweep. Re-ran the full suite myself after
  both agents finished — 69/69 confirmed independently.
- Frontend: `npm run build` (21 routes, all compile), `next lint` (0
  warnings), 17/17 Vitest unit tests, **84/84 Playwright e2e tests** across
  iPhone SE/14/Pro Max/iPad — including explicit regression coverage that the
  Phase 1 manual flow (paste → analyze → quality → prepare → download link)
  still works from its new `/download` location. Re-ran build myself
  independently — clean.
- Full stack: `docker compose up -d --build` verified locally after both
  agents' changes merged — `api`, `redis`, `worker`, `scheduler` all reached
  healthy/running, API logs confirm `alembic upgrade 0002 -> 0003` ran
  cleanly on boot, and the new `/api/library`/`/api/sources` endpoints
  correctly return 401 without a session (didn't accidentally ship
  unauthenticated). `cloudflared` restart-loops locally with no real tunnel
  token, same expected/harmless behavior as Phase 1.

## Not tested (needs you, on your real NAS + iPhone)
- **Picture-in-Picture on a real device** — feature-detection logic is
  correct in principle but has never run on actual iOS Safari; confirm the
  button appears/works and that resuming from PiP restores state correctly.
- **AirPlay** — only a static hint is shown; verify the native control's
  AirPlay icon actually appears and works on your real Apple TV / AirPlay
  target.
- **Range requests through the Cloudflare Tunnel for large media** — the
  PHASE_2_IMPLEMENTATION_PLAN.md flagged this as a risk (Cloudflare could in
  theory alter `Range`/`Content-Range` handling); verified locally
  end-to-end, not yet verified through the real tunnel.
- **A real monitored-source check against an actual YouTube playlist** —
  `check_source` was only exercised against mocked yt-dlp output in tests,
  same copyright-safety constraint as Phase 1. Add one real automatic source
  and watch it go through a real scheduled check before trusting it
  unattended.
- **Scheduler surviving an actual container restart mid-check** — the CAS
  lock (`checking=1`) is unit-tested at the DB level but a real `docker
  compose restart` while a check is in flight (leaving `checking=1` stuck)
  hasn't been exercised; if a source ever seems permanently stuck on
  "Wird geprüft", manually clearing that flag in the DB is the workaround
  until a startup-recovery routine (mirroring the Phase 1 worker's
  `recover_stuck_jobs`) is added for sources too — **known gap, see below**.
- Real Safari behavior for the new player page across lock/unlock, portrait/
  landscape, Wi-Fi/cellular handoff.

## Known limitations / deviations
- **No startup recovery for a source stuck in `checking=1`** after an
  unclean scheduler restart — Phase 1's worker has `recover_stuck_jobs()` for
  exactly this class of problem; Phase 2's scheduler does not yet have the
  equivalent for `MonitoredSource.checking`. Low risk (SQLite + a single
  scheduler replica), but worth adding before relying on unattended
  automatic sources for a long time.
- `maximumBytesPerRun` is enforced against an **estimated** size
  (duration × a constant bitrate assumption), not a real file size, since
  yt-dlp's flat-playlist listing doesn't return per-item sizes — same
  "estimated" caveat the Phase 1 spec already anticipated for quality-option
  sizes.
- Cron scheduling for sources uses a minimal hand-rolled matcher, not a
  full-featured cron library — covers the 5-field cases the settings UI
  actually exposes under "Erweitert", not arbitrary cron edge cases.
- `check-now` runs synchronously in the request rather than via the RQ
  queue — acceptable since flat-playlist analysis is fast, but means a very
  large playlist's manual check could make that one request slow; the
  scheduled path is unaffected since it's driven by the scheduler process,
  not a web request.
- Settings → Konto has no password-change flow (no backend support exists
  for it yet, correctly left out rather than faked).
- Cookie-required detection is a heuristic string match on yt-dlp's stderr
  (no structured error code exists) — works for the common phrasing but
  could misclassify an unrelated yt-dlp error as "needs login" in edge cases.

## Next sensible extensions
- Add `recover_stuck_sources()` (mirroring the worker's job-recovery
  routine) to the scheduler startup, closing the gap above.
- Real per-item size probing for automatic sources (a lightweight
  `--simulate` yt-dlp call per new item) to replace the bitrate estimate,
  if the added yt-dlp calls per check are acceptable.
- Password-change endpoint + Konto UI, if multi-credential rotation is ever
  wanted without editing `.env` and restarting.
- Web-push notifications (§21) were explicitly optional and not built —
  natural next step once the rest has been used for a while.
