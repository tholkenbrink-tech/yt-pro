# yt-pro

Private, iPhone-optimized web app for downloading YouTube videos you have the
rights to (own uploads, public-domain content, explicitly permitted content).
No DRM bypass, no protection-measure circumvention, no shared/public hosting.

**Phase 1 scope**: paste a YouTube URL → analyze → pick a quality → server
prepares the file in the background → pull the finished MP4 into Safari on
your iPhone → temp files auto-expire. No video player yet (by design — see
`PHASE_1_STATUS.md`).

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
pytest -q      # 35 tests, all mocked (no real yt-dlp/network calls)
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

## Known limitations (Phase 1) — see PHASE_1_STATUS.md for the full list
- No video player, no watch progress — download only.
- Only single video / Shorts / playlist / multi-line URL are active; channel
  and watched-playlist support are scaffolded in the data model but inert.
- Cookie import (for age-restricted/private videos you have rights to) has
  an admin upload endpoint but no UI walkthrough for obtaining the cookie
  file, and no OAuth flow — intentionally out of scope for Phase 1.
