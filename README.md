# yt-pro

Private, iPhone-optimized web app for downloading YouTube videos you have the
rights to (own uploads, public-domain content, explicitly permitted content).
No DRM bypass, no protection-measure circumvention, no shared/public hosting.

**Phase 1** (manual downloads): paste a YouTube URL → analyze → pick a
quality → server prepares the file in the background → pull the finished
MP4 into Safari on your iPhone → temp files auto-expire. See
`PHASE_1_STATUS.md`.

**Phase 2** (media library) adds: an in-app iOS-compatible video player with
Picture-in-Picture and resume, a persistent Mediathek, and automatically
monitored YouTube playlists that discover/prepare new videos on a schedule —
alongside the manual flow, not instead of it. See `PHASE_2_STATUS.md` for
what's implemented/tested and what still needs verifying on your real NAS
and iPhone.

Main areas: **Download** (manual, `/download`), **Aktivität** (`/activity`,
job progress), **Mediathek** (`/library`, play/resume/PiP/download/delete),
**Einstellungen** (`/settings`, incl. `/settings/sources` for automatic
playlists).

## Architecture

- **Backend** (`backend/`): FastAPI + SQLAlchemy/Alembic (SQLite) + Redis/RQ
  job queue + yt-dlp/FFmpeg, run entirely in Docker (own containers for the
  API, the job worker, and the expiry scheduler). Meant to run on your NAS.
- **Frontend** (`frontend/`): Next.js 14 PWA, deployed to Cloudflare Pages.
- **Bridge**: the frontend (on `*.pages.dev`) talks to the backend over
  HTTPS through a **Cloudflare Tunnel** (`cloudflared`), so the NAS needs no
  open inbound ports and gets TLS for free.

```
Safari (iPhone) ──HTTPS──> Cloudflare Pages (Next.js PWA)
                                   │  fetch(), credentials: include
                                   ▼
                        Cloudflare Tunnel (cloudflared)
                                   │
                                   ▼
                    NAS: docker-compose (api / worker / scheduler / redis)
```

## Local development

Requires Docker. The backend only ever runs inside containers — do not rely
on your host Python version.

```bash
cp .env.example .env        # edit ADMIN_USERNAME / ADMIN_PASSWORD / SESSION_SECRET
docker compose up -d --build
curl http://localhost:8000/api/health   # -> {"status":"ok"}
```

`cloudflared` will restart-loop locally until you set a real
`CLOUDFLARE_TUNNEL_TOKEN` — that's expected and harmless; it's only needed
for the real NAS deployment (see below). The `api` container also publishes
`127.0.0.1:8000` so you can hit it directly while developing.

Backend tests:
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt pytest pytest-asyncio httpx
pytest -q      # 69 tests, all mocked (no real yt-dlp/network calls)
```

Frontend (needs Node 18+):
```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm run dev                  # http://localhost:3000
npm run build                # production build
npm run lint
npx vitest run                # unit tests
npx playwright test           # e2e, mocked API, iPhone/iPad viewports
```

## Deploying

### Backend → UGREEN NAS (Docker Compose)
1. Copy this repo to the NAS (or `git clone` it there).
2. `cp .env.example .env` and fill in real values — especially
   `ADMIN_USERNAME`/`ADMIN_PASSWORD` (your login), `SESSION_SECRET`
   (`openssl rand -hex 32`), and `CORS_ORIGINS` (your Cloudflare Pages URL).
3. In Cloudflare Zero Trust → Networks → Tunnels, create a tunnel, point a
   public hostname (e.g. `api.yt-pro.yourdomain.com`) at
   `http://api:8000` (the compose service name/port), and copy the tunnel
   token into `CLOUDFLARE_TUNNEL_TOKEN` in `.env`.
4. `docker compose up -d --build` on the NAS. `docker compose ps` should
   show `api`, `worker`, `scheduler`, `redis`, and `cloudflared` all healthy.
5. Data persists in named volumes (`db_data`, `temp_data`, `thumbnail_data`,
   `cookie_data`) — back these up if you care about download history.

### Frontend → Cloudflare Pages
Same pattern as this account's other personal projects: create a Pages
project git-connected to this repo's `frontend/` directory (build command
`npm run build`, output uses the Next.js framework preset — no
`next-on-pages`/export step needed), set `NEXT_PUBLIC_API_BASE_URL` to your
tunnel hostname from step 3 above as a Pages environment variable, push to
`main` and Cloudflare builds/deploys automatically.

## Security notes
- Single local admin account only, no self-registration.
- Session cookie is HttpOnly + Secure + SameSite=None (required because the
  frontend and API are on different origins) with a CSRF double-submit
  token on every mutating request.
- yt-dlp/FFmpeg are always invoked with a fixed, server-built argument list
  — the client can never pass raw shell/yt-dlp flags.
- Only `youtube.com`/`www.youtube.com`/`m.youtube.com`/`music.youtube.com`/
  `youtu.be` URLs are accepted (checked via `urllib.parse`, not string
  matching, to resist SSRF/spoofing tricks).
- Downloaded files are served only to an authenticated session, from a
  UUID-keyed path — never a public/guessable URL.

## Known limitations
See `PHASE_1_STATUS.md` and `PHASE_2_STATUS.md` for the full, current lists.
Highlights: channel/watched-playlist auto-sync (beyond playlists you add as
a monitored source) is still scaffolded-but-inert; no password-change UI
(single env-seeded admin account only); no OAuth, no Google-password entry
— cookie import remains the only path for private-playlist access; a
monitored source stuck mid-check after an unclean restart currently needs a
manual DB fix (no auto-recovery yet, unlike the Phase 1 job worker).

## Automatic playlist sources (Phase 2)
Under **Einstellungen → Automatische Quellen** (`/settings/sources`): paste
a playlist URL, pick a quality and a check schedule (manual/6h/12h/daily/
weekly, or a cron expression under "Erweitert"), and a mode:
- **Nur erkennen** — new videos are listed but not prepared.
- **Vorher bestätigen** — new videos wait for you to tap "Vorbereiten".
- **Automatisch vorbereiten** — new videos go straight into the same
  download queue Phase 1 uses.
A background scheduler tick (same container as the temp-file expiry sweep)
checks due sources, skips ones already mid-check, and never re-prepares a
video it has already seen for that source.
