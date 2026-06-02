# School2Me Technical Reference

## 1. System Overview

School2Me is a two-part application:

- **Backend** (`/tmp/workspace/jamesjhs/school2me/backend`): Express + TypeScript API, SQLCipher-encrypted SQLite, email ingestion/parsing, auth/session management, and feed generation.
- **Frontend** (`/tmp/workspace/jamesjhs/school2me/frontend`): React + TypeScript + Vite progressive web app for authentication, timeline views, family settings, and admin controls.

The repository uses npm workspaces from `/tmp/workspace/jamesjhs/school2me/package.json`.

## 2. Runtime Dependencies and Roles

### Backend key dependencies

- `express`, `cookie-parser`: HTTP API, JSON/cookie parsing.
- `better-sqlite3-multiple-ciphers`: SQLite + SQLCipher encryption.
- `argon2`: password hashing/verification.
- `nodemailer`: transactional mail (magic links + 2FA).
- `openai`: event extraction from school emails.
- `ics`: iCalendar generation.
- `zod`: strict environment validation.
- `uuid`: binary UUID conversion helpers.

### Frontend key dependencies

- `react`, `react-dom`: UI runtime.
- `react-router-dom`: page routing.
- `vite`: build/dev server.
- `vite-plugin-pwa`: service worker + web app manifest output.

## 3. Configuration Surface

Backend configuration is validated in `/tmp/workspace/jamesjhs/school2me/backend/src/config/env.ts`.

Required variables:

- `NODE_ENV` (`development|production`)
- `PORT`
- `TRUST_PROXY`
- `DB_PATH` (absolute path)
- `DB_ENCRYPTION_KEY` (64 hex chars)
- `CF_TURNSTILE_SITE_KEY`
- `CF_TURNSTILE_SECRET_KEY`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`
- `WEBHOOK_API_KEY`
- `OPENAI_API_KEY`
- `FRONTEND_BASE_URL`
- `PUBLIC_BASE_URL`

Frontend environment:

- `VITE_API_BASE_URL` (optional API prefix)
- `VITE_CF_TURNSTILE_SITE_KEY` (Turnstile widget integration input)

## 4. Data Model and Resource Map

Defined in `/tmp/workspace/jamesjhs/school2me/backend/src/database/db.ts`.

### Core entities

- `families`: tenant/root record (`routing_alias` drives inbound mail and public feed paths).
- `users`: family members (`admin|member` roles).
- `children`: managed family children.
- `activities`: child-linked activities.
- `ingested_emails`: raw school email capture.
- `parsed_events`: calendar-style events extracted from ingested emails.

### Security/session entities

- `magic_links`: one-time login tokens.
- `email_2fa_codes`: one-time numeric verification codes.
- `user_sessions`: authenticated user sessions.
- `admin_sessions`: authenticated admin sessions.
- `family_invites`: share-name/password and share-link onboarding artifacts.

### Operational settings

- `app_settings`: SMTP and webhook API key overrides.

## 5. Backend Execution Flow

Entry point: `/tmp/workspace/jamesjhs/school2me/backend/src/server.ts`.

1. Environment is loaded and validated.
2. Database opens, SQLCipher key applied, schema ensured.
3. Trust proxy is set when `TRUST_PROXY > 0`.
4. `/receive` route is mounted **before** JSON middleware because it requires raw body parsing.
5. CSRF middleware checks non-GET requests except explicit auth/admin exemptions.
6. API routes and feed routes are mounted.
7. Bootstrap creates one demo family if the database is empty.
8. Server starts on `PORT`.

## 6. API and Endpoint Catalog

### Health

- `GET /api/health`

### Public/webhook/feed resources

- `POST /receive` (email webhook ingestion; requires `x-jahosi-webhook-key`)
- `GET /feeds/:routing_alias/calendar.ics`
- `GET /feeds/:routing_alias/rss`
- `GET /join/:token` (token handoff informational page)

### User auth

- `GET /api/auth/csrf`
- `POST /api/auth/magic-request`
- `POST /api/auth/magic-verify`
- `POST /api/auth/email-2fa/request`
- `POST /api/auth/email-2fa/verify`
- `POST /api/auth/join-share`
- `POST /api/auth/join-link`
- `GET /api/auth/session`
- `POST /api/auth/logout`

### Dashboard

- `GET /api/dashboard/events` (supports `childId`, `activityId`)

### User settings

- `GET /api/settings/profile`
- `POST /api/settings/children`
- `POST /api/settings/activities`
- `GET /api/settings/routing-alias`
- `POST /api/settings/invites`

### Admin auth/settings

- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/auth/me`
- `GET /api/admin/settings/smtp`
- `PUT /api/admin/settings/smtp`
- `GET /api/admin/settings/webhook-api-key`
- `PUT /api/admin/settings/webhook-api-key`

## 7. Security Controls and Interrelationships

- **Session cookies**: `s2m_session` (user), `s2m_admin_session` (admin), `s2m_csrf` (anti-CSRF token source).
- **CSRF**: state-changing routes require matching cookie/header token (`x-csrf-token`), except explicit auth bootstrap endpoints.
- **Rate limiting**: in-memory IP-based limiters for auth and webhook surfaces.
- **Turnstile**: bot check for login/join request endpoints.
- **Credential handling**: Argon2 verification for admin and invite password checks.
- **Webhook key**: timing-safe compare of provided vs configured secret.
- **Database protection**: SQLCipher key + WAL mode + FK enforcement.

## 8. Email Ingestion and Event Extraction Data Flow

1. External sender posts JSON payload to `/receive` with webhook API key.
2. Request is acknowledged immediately (`{ received: true }`).
3. Async worker extracts recipient alias from payload.
4. Alias maps to `families.routing_alias`.
5. Raw email is inserted into `ingested_emails` (dedupe by vendor email ID when available).
6. Parser service loads family/child/activity context.
7. OpenAI prompt requests strict JSON event candidates.
8. Parsed events are inserted into `parsed_events`, flagged for review when confidence is low/unknown.
9. Dashboard and ICS feeds consume `parsed_events`; RSS consumes `ingested_emails`.

## 9. Frontend Resource and Feature Map

Router entry: `/tmp/workspace/jamesjhs/school2me/frontend/src/App.tsx`.

- `/auth` → `AuthPage` (magic link, email 2FA, join via share name/password, join via link token)
- `/dashboard` → `DashboardPage` (timeline grouping and child/activity filtering)
- `/settings` → `SettingsPage` (family profile, child/activity creation, invite generation)
- `/admin` → `AdminPage` (admin login, SMTP + webhook key administration)

Shared API client:

- `apiGet`, `apiPost`, `apiPut`
- automatic CSRF bootstrap from `GET /api/auth/csrf`
- `credentials: include` on all requests

PWA resources:

- `/tmp/workspace/jamesjhs/school2me/frontend/public/manifest.json`
- `/tmp/workspace/jamesjhs/school2me/frontend/src/serviceWorker.ts`

## 10. Function-Level Backend Reference

### `server.ts`

- `ensureBootstrapData`: creates initial demo family if none exists.

### `routes/auth.ts`

- `hashValue`, `timingSafeEmailEquals`: constant-time hash comparisons.
- `setCsrfCookie`: issues CSRF token cookie.
- `issueSession`: creates `user_sessions` row + session cookie.
- `findUserByEmail`: canonical account lookup.
- Route handlers implement all user/admin auth lifecycle operations.

### `routes/settings.ts`

- User-side profile/child/activity/invite handlers.
- Admin-side SMTP + webhook key handlers with DB-backed overrides.

### `routes/dashboard.ts`

- Event retrieval and optional filtering by child/activity.

### `routes/receive.ts`

- `extractString`, `extractEmailAddress`: robust payload field parsing.
- `getWebhookApiKey`, `webhookKeyMatches`: secure API key retrieval/compare.
- Main receive handler: validate, ingest, async parse dispatch.

### `routes/feeds.ts`

- `xmlEscape`: RSS-safe escaping.
- `toIcsDateTuple`: UTC tuple conversion for `ics`.
- ICS and RSS generation handlers.

### `services/openaiParser.ts`

- `getFamilyContextByRecipient`: alias to family context mapping.
- `parseJsonFromText`: strict extraction safety.
- `extractJsonPayload`: Responses API first, Chat Completions fallback.
- `parseEmailAndPersistEvents`: orchestration and DB persistence.

### `services/email.ts`

- `getSmtpSettings`: env + app_settings overlay resolution.
- `sendMail`: transactional outbound email.

### `services/turnstile.ts`

- `verifyTurnstileToken`: Cloudflare Turnstile server-side verification.

### `middleware/auth.ts`

- `requireUserSession`: validates user session cookie + enriches `req.user`.
- `requireAdminSession`: validates admin session cookie + marks `req.isAdmin`.

### `middleware/rateLimit.ts`

- `createRateLimiter`: in-memory windowed request limiter by IP.

### `utils/uuid.ts`

- `generateUuidBuffer`, `uuidStringToBuffer`, `uuidBufferToString`: binary UUID helpers.

## 11. Build/Test/Lint Commands

From `/tmp/workspace/jamesjhs/school2me`:

- `npm run lint` → backend + frontend lint
- `npm run build` → backend TS compile + frontend production build
- `npm test` → backend node tests

## 12. Operational Notes

- Rate limiting is process-local (memory map), not distributed.
- Feed routes are public by design and keyed by routing alias.
- Email parsing quality depends on valid OpenAI credentials and model response quality.
- SMTP/webhook settings can be overridden at runtime through admin endpoints.
