# School2Me Installation Guide

This guide installs School2Me for development or self-hosted deployment.

## 1) Prerequisites

- Node.js 20+ and npm 10+
- A writable absolute path for the encrypted SQLite database file
- Cloudflare Turnstile site/secret keys
- SMTP credentials for outbound email
- OpenAI API key
- Admin password hash (Argon2)

## 2) Clone and install dependencies

```bash
cd /tmp/workspace/jamesjhs/school2me
npm ci
```

## 3) Configure backend environment

Copy and edit backend environment variables:

```bash
cp /tmp/workspace/jamesjhs/school2me/backend/.env.example /tmp/workspace/jamesjhs/school2me/backend/.env
```

Set at minimum:

- `PORT` (default backend API port)
- `TRUST_PROXY` (`1` when behind reverse proxy/CDN)
- `DB_PATH` (absolute DB file path)
- `DB_ENCRYPTION_KEY` (64 hex characters)
- `CF_TURNSTILE_SITE_KEY`, `CF_TURNSTILE_SECRET_KEY`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`
- `WEBHOOK_API_KEY`
- `OPENAI_API_KEY`
- `FRONTEND_BASE_URL`
- `PUBLIC_BASE_URL`

### Generate an Argon2 admin password hash

Run from backend:

```bash
cd /tmp/workspace/jamesjhs/school2me/backend
node -e "import('argon2').then(async a=>{console.log(await a.default.hash(process.argv[1]));})" "your-admin-password"
```

Copy output into `ADMIN_PASSWORD_HASH`.

## 4) Configure frontend environment

Copy and edit frontend environment variables:

```bash
cp /tmp/workspace/jamesjhs/school2me/frontend/.env.example /tmp/workspace/jamesjhs/school2me/frontend/.env
```

Set:

- `VITE_API_BASE_URL` (for same-origin setups this can be blank)
- `VITE_CF_TURNSTILE_SITE_KEY`

## 5) Validate installation before first run

From repository root:

```bash
cd /tmp/workspace/jamesjhs/school2me
npm run lint
npm run build
npm test
```

## 6) Start in development mode

Open two terminals:

### Terminal A (backend)

```bash
cd /tmp/workspace/jamesjhs/school2me
npm run dev:backend
```

### Terminal B (frontend)

```bash
cd /tmp/workspace/jamesjhs/school2me
npm run dev:frontend
```

Default endpoints:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:4020/api/health`

## 7) Production build and run

```bash
cd /tmp/workspace/jamesjhs/school2me
npm run build
cd /tmp/workspace/jamesjhs/school2me/backend
npm run start
```

Serve frontend static files from:

- `/tmp/workspace/jamesjhs/school2me/frontend/dist`

Ensure reverse proxy routes:

- `/api/*` and `/receive` to backend
- frontend static assets and SPA fallback to frontend build output
- `/help.html` as a public static help page

## 8) Webhook setup

Configure your email/webhook provider to POST JSON payloads to:

- `https://<your-domain>/receive`

Include header:

- `x-jahosi-webhook-key: <WEBHOOK_API_KEY>`

Payload should include common fields (to/recipient, from/sender, subject, text/html, optional email/message id).

## 9) Post-install smoke checks

1. `GET /api/health` returns `{ ok: true, ... }`
2. `/auth` loads and can request magic link / 2FA
3. `/admin` login works with configured admin credentials
4. `/settings` can create child and activity
5. `/api/settings/invites` generates share link token
6. `POST /receive` ingests test payload and creates dashboard events
7. Public feeds resolve:
   - `/feeds/<routing_alias>/calendar.ics`
   - `/feeds/<routing_alias>/rss`
8. Standalone help page loads at `/help.html`
