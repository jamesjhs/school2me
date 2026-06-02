import argon2 from 'argon2';
import { Router } from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { db } from '../database/db.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { sendMail } from '../services/email.js';
import { verifyTurnstileToken } from '../services/turnstile.js';
import { generateUuidBuffer, uuidBufferToString } from '../utils/uuid.js';
import { requireUserSession } from '../middleware/auth.js';
export const authRouter = Router();
const SESSION_TTL_HOURS = 24 * 14;
const authRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });
const strictAuthRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 8 });
const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');
const timingSafeEmailEquals = (input, expected) => {
    const one = crypto.createHash('sha256').update(input.toLowerCase().trim()).digest();
    const two = crypto.createHash('sha256').update(expected.toLowerCase().trim()).digest();
    return crypto.timingSafeEqual(one, two);
};
const setCsrfCookie = (res) => {
    const csrfToken = crypto.randomBytes(24).toString('hex');
    res.cookie('s2m_csrf', csrfToken, {
        httpOnly: false,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000
    });
    return csrfToken;
};
const issueSession = (res, userId) => {
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
const findUserByEmail = (email) => db.prepare('SELECT id, email, role, family_id FROM users WHERE lower(email) = lower(?) LIMIT 1').get(email);
authRouter.get('/csrf', (_req, res) => {
    const token = setCsrfCookie(res);
    res.json({ csrfToken: token });
});
authRouter.post('/magic-request', strictAuthRateLimiter, async (req, res) => {
    const { email, ['cf-turnstile-response']: turnstileToken } = req.body;
    if (!email || !turnstileToken) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const turnstileOk = await verifyTurnstileToken(turnstileToken, req.ip);
    if (!turnstileOk) {
        return res.status(400).json({ error: 'Turnstile validation failed' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashValue(token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO magic_links (id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(generateUuidBuffer(), email.trim().toLowerCase(), tokenHash, expiresAt);
    const loginUrl = `${env.FRONTEND_BASE_URL}/auth?magicToken=${token}`;
    await sendMail({
        to: email,
        subject: 'Your School2Me Magic Link',
        text: `Sign in: ${loginUrl}\n\nThis link expires in 15 minutes.`
    });
    res.json({ ok: true });
});
authRouter.post('/magic-verify', strictAuthRateLimiter, (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }
    const tokenHash = hashValue(token);
    const link = db
        .prepare("SELECT id, email FROM magic_links WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now') LIMIT 1")
        .get(tokenHash);
    if (!link) {
        return res.status(400).json({ error: 'Invalid or expired link' });
    }
    db.prepare("UPDATE magic_links SET used_at = datetime('now') WHERE id = ?").run(link.id);
    const user = findUserByEmail(link.email);
    if (!user) {
        return res.status(404).json({ error: 'No account for this email. Join a family first.' });
    }
    issueSession(res, user.id);
    return res.json({
        ok: true,
        user: {
            id: uuidBufferToString(user.id),
            email: user.email,
            role: user.role,
            familyId: uuidBufferToString(user.family_id)
        }
    });
});
authRouter.post('/email-2fa/request', strictAuthRateLimiter, async (req, res) => {
    const { email, ['cf-turnstile-response']: turnstileToken } = req.body;
    if (!email || !turnstileToken) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const turnstileOk = await verifyTurnstileToken(turnstileToken, req.ip);
    if (!turnstileOk) {
        return res.status(400).json({ error: 'Turnstile validation failed' });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = hashValue(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO email_2fa_codes (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)').run(generateUuidBuffer(), email.trim().toLowerCase(), codeHash, expiresAt);
    await sendMail({
        to: email,
        subject: 'Your School2Me verification code',
        text: `Your verification code is: ${code}\n\nExpires in 10 minutes.`
    });
    res.json({ ok: true });
});
authRouter.post('/email-2fa/verify', strictAuthRateLimiter, (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const codeHash = hashValue(code.trim());
    const record = db
        .prepare("SELECT id FROM email_2fa_codes WHERE lower(email) = lower(?) AND code_hash = ? AND used_at IS NULL AND expires_at > datetime('now') LIMIT 1")
        .get(email.trim(), codeHash);
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
    const { email, shareName, sharePassword, ['cf-turnstile-response']: turnstileToken } = req.body;
    if (!email || !shareName || !sharePassword || !turnstileToken) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const turnstileOk = await verifyTurnstileToken(turnstileToken, req.ip);
    if (!turnstileOk) {
        return res.status(400).json({ error: 'Turnstile validation failed' });
    }
    const invite = db
        .prepare('SELECT id, family_id, share_password_hash FROM family_invites WHERE lower(share_name) = lower(?) LIMIT 1')
        .get(shareName.trim());
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
        db.prepare('INSERT INTO users (id, family_id, email, role) VALUES (?, ?, ?, ?)').run(newUserId, invite.family_id, email.trim().toLowerCase(), 'member');
        user = findUserByEmail(email.trim().toLowerCase());
    }
    if (!user) {
        return res.status(500).json({ error: 'Unable to create account' });
    }
    issueSession(res, user.id);
    res.json({ ok: true });
});
authRouter.post('/join-link', strictAuthRateLimiter, async (req, res) => {
    const { email, token, ['cf-turnstile-response']: turnstileToken } = req.body;
    if (!email || !token || !turnstileToken) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    const turnstileOk = await verifyTurnstileToken(turnstileToken, req.ip);
    if (!turnstileOk) {
        return res.status(400).json({ error: 'Turnstile validation failed' });
    }
    const invite = db
        .prepare("SELECT id, family_id FROM family_invites WHERE link_token_hash = ? AND link_expires_at > datetime('now') LIMIT 1")
        .get(hashValue(token));
    if (!invite) {
        return res.status(400).json({ error: 'Invalid or expired invite link' });
    }
    let user = findUserByEmail(email.trim().toLowerCase());
    if (!user) {
        const newUserId = generateUuidBuffer();
        db.prepare('INSERT INTO users (id, family_id, email, role) VALUES (?, ?, ?, ?)').run(newUserId, invite.family_id, email.trim().toLowerCase(), 'member');
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
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Missing credentials' });
    }
    const emailValid = timingSafeEmailEquals(email, env.ADMIN_EMAIL);
    const passwordValid = await argon2.verify(env.ADMIN_PASSWORD_HASH, password);
    if (!emailValid || !passwordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
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
    return res.json({ ok: true });
});
adminAuthRouter.post('/logout', (req, res) => {
    const adminSession = req.cookies['s2m_admin_session'];
    if (adminSession) {
        db.prepare('DELETE FROM admin_sessions WHERE hex(id) = upper(?)').run(adminSession);
    }
    res.clearCookie('s2m_admin_session');
    res.json({ ok: true });
});
adminAuthRouter.get('/me', (req, res) => {
    const adminSession = req.cookies['s2m_admin_session'];
    if (!adminSession) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const row = db
        .prepare("SELECT id FROM admin_sessions WHERE hex(id)=upper(?) AND expires_at > datetime('now') LIMIT 1")
        .get(adminSession);
    if (!row) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json({ email: env.ADMIN_EMAIL });
});
//# sourceMappingURL=auth.js.map