import argon2 from 'argon2';
import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { db } from '../database/db.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { sendMail } from '../services/email.js';
import { getAdminEmail } from '../services/adminIdentity.js';
import { verifyTurnstileToken } from '../services/turnstile.js';
import { generateUuidBuffer, uuidBufferToString } from '../utils/uuid.js';
import { requireUserSession } from '../middleware/auth.js';

export const authRouter = Router();

const SESSION_TTL_HOURS = 24 * 14;
const authRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });
const strictAuthRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 8 });

type LoginRole = 'user' | 'admin';

const hashValue = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const timingSafeEmailEquals = (input: string, expected: string) => {
  const one = crypto.createHash('sha256').update(input.toLowerCase().trim()).digest();
  const two = crypto.createHash('sha256').update(expected.toLowerCase().trim()).digest();
  return crypto.timingSafeEqual(one, two);
};

const normalizeLoginRole = (role: unknown): LoginRole => (role === 'admin' ? 'admin' : 'user');

const setCsrfCookie = (res: any): string => {
  const csrfToken = crypto.randomBytes(24).toString('hex');
  res.cookie('s2m_csrf', csrfToken, {
    httpOnly: false,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000
  });
  return csrfToken;
};

const issueSession = (res: any, userId: Buffer) => {
  const sessionId = generateUuidBuffer();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO user_sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, userId, expiresAt);

  res.cookie('s2m_session', sessionId.toString('hex').toUpperCase(), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000
  });

  setCsrfCookie(res);
};

const issueAdminSession = (res: any) => {
  const adminSessionId = generateUuidBuffer();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO admin_sessions (id, expires_at) VALUES (?, ?)').run(adminSessionId, expiresAt);

  res.cookie('s2m_admin_session', adminSessionId.toString('hex').toUpperCase(), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000
  });

  setCsrfCookie(res);
};

const findUserByEmail = (email: string) =>
  db
    .prepare('SELECT id, email, password_hash, role, family_id FROM users WHERE lower(email) = lower(?) LIMIT 1')
    .get(email) as
    | { id: Buffer; email: string; password_hash: string | null; role: 'admin' | 'member'; family_id: Buffer }
    | undefined;

const requireTurnstile = async (token: string | undefined, ip: string | undefined, res: any): Promise<boolean> => {
  if (!token) {
    res.status(400).json({ error: 'Missing required fields' });
    return false;
  }

  const turnstileOk = await verifyTurnstileToken(token, ip);
  if (!turnstileOk) {
    res.status(400).json({ error: 'Turnstile validation failed' });
    return false;
  }

  return true;
};

authRouter.get('/csrf', (_req, res) => {
  const token = setCsrfCookie(res);
  res.json({ csrfToken: token });
});

authRouter.post('/password-login', strictAuthRateLimiter, async (req, res) => {
  const { email, password, role, ['cf-turnstile-response']: turnstileToken } = req.body as {
    email?: string;
    password?: string;
    role?: LoginRole;
    'cf-turnstile-response'?: string;
  };

  if (!email || !password || !turnstileToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!(await requireTurnstile(turnstileToken, req.ip, res))) {
    return;
  }

  const loginRole = normalizeLoginRole(role);
  if (loginRole === 'admin') {
    const emailValid = timingSafeEmailEquals(email, getAdminEmail());
    const passwordValid = await argon2.verify(env.ADMIN_PASSWORD_HASH, password);

    if (!emailValid || !passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    issueAdminSession(res);
    return res.json({ ok: true, role: 'admin', destination: '/admin' });
  }

  const user = findUserByEmail(email.trim().toLowerCase());
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordValid = await argon2.verify(user.password_hash, password);
  if (!passwordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  issueSession(res, user.id);
  return res.json({
    ok: true,
    role: user.role,
    destination: user.role === 'admin' ? '/admin' : '/dashboard',
    user: {
      id: uuidBufferToString(user.id),
      email: user.email,
      role: user.role,
      familyId: uuidBufferToString(user.family_id)
    }
  });
});

authRouter.post('/magic-request', strictAuthRateLimiter, async (req, res) => {
  const { email, role, ['cf-turnstile-response']: turnstileToken } = req.body as {
    email?: string;
    role?: LoginRole;
    'cf-turnstile-response'?: string;
  };

  if (!email || !turnstileToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!(await requireTurnstile(turnstileToken, req.ip, res))) {
    return;
  }

  const loginRole = normalizeLoginRole(role);
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashValue(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO magic_links (id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(
    generateUuidBuffer(),
    email.trim().toLowerCase(),
    tokenHash,
    expiresAt
  );

  const loginUrl = `${env.FRONTEND_BASE_URL}/auth?magicToken=${token}&role=${loginRole}`;
  await sendMail({
    to: email,
    subject: 'Your School2Me Magic Link',
    text: `Sign in: ${loginUrl}\n\nThis link expires in 15 minutes.`
  });

  res.json({ ok: true });
});

authRouter.post('/magic-verify', strictAuthRateLimiter, (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  const tokenHash = hashValue(token);
  const link = db
    .prepare("SELECT id, email FROM magic_links WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now') LIMIT 1")
    .get(tokenHash) as { id: Buffer; email: string } | undefined;

  if (!link) {
    return res.status(400).json({ error: 'Invalid or expired link' });
  }

  db.prepare("UPDATE magic_links SET used_at = datetime('now') WHERE id = ?").run(link.id);

  if (timingSafeEmailEquals(link.email, getAdminEmail())) {
    issueAdminSession(res);
    return res.json({ ok: true, role: 'admin', destination: '/admin' });
  }

  const user = findUserByEmail(link.email);
  if (!user) {
    return res.status(404).json({ error: 'No account for this email. Join a family first.' });
  }

  issueSession(res, user.id);

  return res.json({
    ok: true,
    role: user.role,
    destination: user.role === 'admin' ? '/admin' : '/dashboard',
    user: {
      id: uuidBufferToString(user.id),
      email: user.email,
      role: user.role,
      familyId: uuidBufferToString(user.family_id)
    }
  });
});

authRouter.post('/email-2fa/request', strictAuthRateLimiter, async (req, res) => {
  const { email, ['cf-turnstile-response']: turnstileToken } = req.body as {
    email?: string;
    'cf-turnstile-response'?: string;
  };

  if (!email || !turnstileToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!(await requireTurnstile(turnstileToken, req.ip, res))) {
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = hashValue(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO email_2fa_codes (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)').run(
    generateUuidBuffer(),
    email.trim().toLowerCase(),
    codeHash,
    expiresAt
  );

  await sendMail({
    to: email,
    subject: 'Your School2Me verification code',
    text: `Your verification code is: ${code}\n\nExpires in 10 minutes.`
  });

  res.json({ ok: true });
});

authRouter.post('/email-2fa/verify', strictAuthRateLimiter, (req, res) => {
  const { email, code } = req.body as { email?: string; code?: string };
  if (!email || !code) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const codeHash = hashValue(code.trim());

  const record = db
    .prepare(
      "SELECT id FROM email_2fa_codes WHERE lower(email) = lower(?) AND code_hash = ? AND used_at IS NULL AND expires_at > datetime('now') LIMIT 1"
    )
    .get(email.trim(), codeHash) as { id: Buffer } | undefined;

  if (!record) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  db.prepare("UPDATE email_2fa_codes SET used_at = datetime('now') WHERE id = ?").run(record.id);

  const user = findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: 'No account for this email. Join a family first.' });
  }

  issueSession(res, user.id);
  return res.json({ ok: true });
});

authRouter.post('/join-share', strictAuthRateLimiter, async (req, res) => {
  const { email, shareName, sharePassword, ['cf-turnstile-response']: turnstileToken } = req.body as {
    email?: string;
    shareName?: string;
    sharePassword?: string;
    'cf-turnstile-response'?: string;
  };

  if (!email || !shareName || !sharePassword || !turnstileToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!(await requireTurnstile(turnstileToken, req.ip, res))) {
    return;
  }

  const invite = db
    .prepare('SELECT id, family_id, share_password_hash FROM family_invites WHERE lower(share_name) = lower(?) LIMIT 1')
    .get(shareName.trim()) as { id: Buffer; family_id: Buffer; share_password_hash: string } | undefined;

  if (!invite) {
    return res.status(404).json({ error: 'Share name not found' });
  }

  const validPassword = await argon2.verify(invite.share_password_hash, sharePassword);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid share password' });
  }

  let user = findUserByEmail(email.trim().toLowerCase());
  if (!user) {
    const newUserId = generateUuidBuffer();
    db.prepare('INSERT INTO users (id, family_id, email, role) VALUES (?, ?, ?, ?)').run(
      newUserId,
      invite.family_id,
      email.trim().toLowerCase(),
      'member'
    );
    user = findUserByEmail(email.trim().toLowerCase());
  }

  if (!user) {
    return res.status(500).json({ error: 'Unable to create account' });
  }

  issueSession(res, user.id);
  res.json({ ok: true });
});

authRouter.post('/join-link', strictAuthRateLimiter, async (req, res) => {
  const { email, token, ['cf-turnstile-response']: turnstileToken } = req.body as {
    email?: string;
    token?: string;
    'cf-turnstile-response'?: string;
  };

  if (!email || !token || !turnstileToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!(await requireTurnstile(turnstileToken, req.ip, res))) {
    return;
  }

  const invite = db
    .prepare(
      "SELECT id, family_id FROM family_invites WHERE link_token_hash = ? AND link_expires_at > datetime('now') LIMIT 1"
    )
    .get(hashValue(token)) as { id: Buffer; family_id: Buffer } | undefined;

  if (!invite) {
    return res.status(400).json({ error: 'Invalid or expired invite link' });
  }

  let user = findUserByEmail(email.trim().toLowerCase());
  if (!user) {
    const newUserId = generateUuidBuffer();
    db.prepare('INSERT INTO users (id, family_id, email, role) VALUES (?, ?, ?, ?)').run(
      newUserId,
      invite.family_id,
      email.trim().toLowerCase(),
      'member'
    );
    user = findUserByEmail(email.trim().toLowerCase());
  }

  if (!user) {
    return res.status(500).json({ error: 'Unable to create account' });
  }

  issueSession(res, user.id);
  res.json({ ok: true });
});

authRouter.get('/session', requireUserSession, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post('/logout', authRateLimiter, requireUserSession, (req, res) => {
  const sessionToken = req.cookies['s2m_session'];
  if (sessionToken) {
    db.prepare('DELETE FROM user_sessions WHERE hex(id) = upper(?)').run(sessionToken);
  }

  res.clearCookie('s2m_session');
  res.json({ ok: true });
});

export const adminAuthRouter = Router();

adminAuthRouter.post('/login', strictAuthRateLimiter, async (req, res) => {
  const { email, password, ['cf-turnstile-response']: turnstileToken } = req.body as {
    email?: string;
    password?: string;
    'cf-turnstile-response'?: string;
  };

  if (!email || !password || !turnstileToken) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  if (!(await requireTurnstile(turnstileToken, req.ip, res))) {
    return;
  }

  const emailValid = timingSafeEmailEquals(email, getAdminEmail());
  const passwordValid = await argon2.verify(env.ADMIN_PASSWORD_HASH, password);

  if (!emailValid || !passwordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  issueAdminSession(res);

  return res.json({ ok: true, role: 'admin', destination: '/admin' });
});

adminAuthRouter.post('/logout', (req, res) => {
  const adminSession = req.cookies['s2m_admin_session'];
  if (adminSession) {
    db.prepare('DELETE FROM admin_sessions WHERE hex(id) = upper(?)').run(adminSession);
  }

  res.clearCookie('s2m_admin_session');
  res.json({ ok: true });
});

adminAuthRouter.get('/me', (_req, res) => {
  const adminSession = _req.cookies['s2m_admin_session'];
  if (!adminSession) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const row = db
    .prepare("SELECT id FROM admin_sessions WHERE hex(id)=upper(?) AND expires_at > datetime('now') LIMIT 1")
    .get(adminSession);

  if (!row) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.json({ email: getAdminEmail() });
});
