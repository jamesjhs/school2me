import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { env } from './config/env.js';
import { db } from './database/db.js';
import { adminAuthRouter, authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { feedsRouter } from './routes/feeds.js';
import { receiveRouter } from './routes/receive.js';
import { adminRouter, settingsRouter } from './routes/settings.js';
import { generateUuidBuffer } from './utils/uuid.js';

const app = express();
const allowedCorsOrigins = new Set([
  new URL(env.FRONTEND_BASE_URL).origin,
  new URL(env.PUBLIC_BASE_URL).origin
]);
const authDebugPathPrefixes = ['/api/auth', '/api/admin/auth'];

const getRequestContext = (req: Request) => ({
  method: req.method,
  path: req.originalUrl,
  origin: req.header('origin') ?? null,
  referer: req.header('referer') ?? null,
  host: req.header('host') ?? null,
  forwardedHost: req.header('x-forwarded-host') ?? null,
  forwardedProto: req.header('x-forwarded-proto') ?? null,
  forwardedFor: req.header('x-forwarded-for') ?? null,
  ip: req.ip,
  secure: req.secure,
  userAgent: req.header('user-agent') ?? null
});

const getRequestId = (res: Response) => String(res.getHeader('x-request-id') ?? 'unknown');
const shouldDebugLogRequest = (req: Request) => authDebugPathPrefixes.some((prefix) => req.path.startsWith(prefix));

if (env.TRUST_PROXY > 0) {
  app.set('trust proxy', env.TRUST_PROXY);
}

app.use('/receive', receiveRouter);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  const requestId = crypto.randomBytes(6).toString('hex');
  const context = getRequestContext(req);
  const shouldLog = shouldDebugLogRequest(req) || req.method === 'OPTIONS';

  res.setHeader('x-request-id', requestId);

  if (shouldLog) {
    console.info(`[${requestId}] Request started`, context);
  }

  res.on('finish', () => {
    if (!shouldLog && res.statusCode < 400) {
      return;
    }

    console.info(`[${requestId}] Request completed`, {
      ...context,
      status: res.statusCode
    });
  });

  return next();
});
app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin && allowedCorsOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-csrf-token');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,OPTIONS');
  } else if (origin) {
    console.warn(`[${getRequestId(res)}] CORS origin not allowed`, {
      ...getRequestContext(req),
      allowedOrigins: [...allowedCorsOrigins]
    });
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

const csrfExemptPaths = new Set([
  '/api/auth/csrf',
  '/api/auth/password-login',
  '/api/auth/magic-request',
  '/api/auth/magic-verify',
  '/api/auth/email-2fa/request',
  '/api/auth/email-2fa/verify',
  '/api/auth/join-share',
  '/api/auth/join-link',
  '/api/admin/auth/login'
]);

app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  if (csrfExemptPaths.has(req.path)) {
    return next();
  }

  const cookieToken = req.cookies['s2m_csrf'];
  const headerToken = req.header('x-csrf-token');

  if (!cookieToken || !headerToken) {
    console.warn(`[${getRequestId(res)}] Missing CSRF token`, {
      ...getRequestContext(req),
      hasCookieToken: Boolean(cookieToken),
      hasHeaderToken: Boolean(headerToken)
    });
    return res.status(403).json({ error: 'Missing CSRF token' });
  }

  const cookieHash = crypto.createHash('sha256').update(cookieToken).digest();
  const headerHash = crypto.createHash('sha256').update(headerToken).digest();

  if (!crypto.timingSafeEqual(cookieHash, headerHash)) {
    console.warn(`[${getRequestId(res)}] Invalid CSRF token`, {
      ...getRequestContext(req)
    });
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  return next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin', adminRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/settings', settingsRouter);
app.use('/feeds', feedsRouter);

app.get('/join/:token', (_req, res) => {
  res.status(200).send('Open the School2Me app and paste this token into Join via Share Link.');
});

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = getRequestId(res);
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[${requestId}] Unhandled server error`, {
    ...getRequestContext(req),
    message,
    stack
  });

  if (res.headersSent) {
    return _next(error);
  }

  res.status(500).json({
    error: 'Internal server error',
    requestId
  });
});

const ensureBootstrapData = () => {
  const familyCount = (db.prepare('SELECT COUNT(*) as count FROM families').get() as { count: number }).count;
  if (familyCount > 0) {
    return;
  }

  const familyId = generateUuidBuffer();
  db.prepare('INSERT INTO families (id, routing_alias) VALUES (?, ?)').run(familyId, 'family-demo');
};

ensureBootstrapData();

app.listen(env.PORT, () => {
  console.log('School2Me backend listening', {
    port: env.PORT,
    trustProxy: env.TRUST_PROXY,
    frontendOrigin: new URL(env.FRONTEND_BASE_URL).origin,
    publicOrigin: new URL(env.PUBLIC_BASE_URL).origin
  });
});
