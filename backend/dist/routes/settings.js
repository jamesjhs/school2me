import argon2 from 'argon2';
import crypto from 'node:crypto';
import { Router } from 'express';
import { statSync } from 'node:fs';
import { env } from '../config/env.js';
import { db } from '../database/db.js';
import { requireAdminSession, requireUserSession } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { getSmtpSettings } from '../services/email.js';
import { getAdminEmail } from '../services/adminIdentity.js';
import { generateUuidBuffer, uuidBufferToString, uuidStringToBuffer } from '../utils/uuid.js';
const isValidEmail = (value) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes(' '))
        return false;
    const at = trimmed.indexOf('@');
    if (at <= 0 || at !== trimmed.lastIndexOf('@'))
        return false;
    const domain = trimmed.slice(at + 1);
    return domain.length >= 3 && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
};
export const settingsRouter = Router();
settingsRouter.get('/profile', requireUserSession, (req, res) => {
    const familyId = uuidStringToBuffer(req.user.familyId);
    const family = db
        .prepare('SELECT routing_alias, created_at FROM families WHERE id = ? LIMIT 1')
        .get(familyId);
    const children = db
        .prepare('SELECT id, first_name, class_name, teacher_name FROM children WHERE family_id = ?')
        .all(familyId)
        .map((row) => ({ ...row, id: uuidBufferToString(row.id) }));
    const activities = db
        .prepare(`SELECT activities.id, activities.child_id, activities.name, activities.activity_type
       FROM activities INNER JOIN children ON children.id = activities.child_id
       WHERE children.family_id = ?`)
        .all(familyId)
        .map((row) => ({ ...row, id: uuidBufferToString(row.id), child_id: uuidBufferToString(row.child_id) }));
    res.json({ family, children, activities, user: req.user });
});
settingsRouter.post('/children', requireUserSession, (req, res) => {
    const familyId = uuidStringToBuffer(req.user.familyId);
    const { firstName, className, teacherName } = req.body;
    if (!firstName) {
        return res.status(400).json({ error: 'firstName required' });
    }
    const childId = generateUuidBuffer();
    db.prepare('INSERT INTO children (id, family_id, first_name, class_name, teacher_name) VALUES (?, ?, ?, ?, ?)').run(childId, familyId, firstName, className ?? null, teacherName ?? null);
    res.json({ id: uuidBufferToString(childId) });
});
settingsRouter.post('/activities', requireUserSession, (req, res) => {
    const { childId, name, activityType } = req.body;
    if (!childId || !name || !activityType) {
        return res.status(400).json({ error: 'childId, name and activityType required' });
    }
    const activityId = generateUuidBuffer();
    db.prepare('INSERT INTO activities (id, child_id, name, activity_type) VALUES (?, ?, ?, ?)').run(activityId, uuidStringToBuffer(childId), name, activityType);
    res.json({ id: uuidBufferToString(activityId) });
});
settingsRouter.get('/routing-alias', requireUserSession, (req, res) => {
    const family = db
        .prepare('SELECT routing_alias FROM families WHERE id = ?')
        .get(uuidStringToBuffer(req.user.familyId));
    res.json({ routingAlias: family?.routing_alias ?? null });
});
settingsRouter.post('/invites', requireUserSession, async (req, res) => {
    const familyId = uuidStringToBuffer(req.user.familyId);
    const { shareName, sharePassword, expiresInHours = 72 } = req.body;
    if (!shareName || !sharePassword) {
        return res.status(400).json({ error: 'shareName and sharePassword required' });
    }
    const passwordHash = await argon2.hash(sharePassword);
    const linkToken = crypto.randomBytes(32).toString('hex');
    const linkTokenHash = crypto.createHash('sha256').update(linkToken).digest('hex');
    const expiresAt = new Date(Date.now() + Math.max(1, expiresInHours) * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO family_invites (id, family_id, share_name, share_password_hash, link_token_hash, link_expires_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(share_name) DO UPDATE SET
       share_password_hash = excluded.share_password_hash,
       link_token_hash = excluded.link_token_hash,
       link_expires_at = excluded.link_expires_at`).run(generateUuidBuffer(), familyId, shareName, passwordHash, linkTokenHash, expiresAt);
    res.json({
        ok: true,
        shareName,
        shareLink: `${req.protocol}://${req.get('host')}/join/${linkToken}`,
        qrText: linkToken,
        expiresAt
    });
});
settingsRouter.put('/account/password', requireUserSession, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 12) {
        return res.status(400).json({ error: 'newPassword must be at least 12 characters' });
    }
    const user = db
        .prepare('SELECT id, password_hash FROM users WHERE id = ? LIMIT 1')
        .get(uuidStringToBuffer(req.user.userId));
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    if (user.password_hash) {
        if (!currentPassword) {
            return res.status(400).json({ error: 'currentPassword is required' });
        }
        const valid = await argon2.verify(user.password_hash, currentPassword);
        if (!valid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
    }
    const passwordHash = await argon2.hash(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
    res.json({ ok: true });
});
settingsRouter.delete('/account', requireUserSession, (req, res) => {
    const userId = uuidStringToBuffer(req.user.userId);
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });
    tx();
    res.clearCookie('s2m_session');
    res.json({ ok: true });
});
settingsRouter.delete('/family', requireUserSession, (req, res) => {
    const familyId = uuidStringToBuffer(req.user.familyId);
    db.prepare('DELETE FROM families WHERE id = ?').run(familyId);
    res.clearCookie('s2m_session');
    res.json({ ok: true });
});
export const adminRouter = Router();
const adminRouteLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 120 });
adminRouter.use(requireAdminSession);
adminRouter.use(adminRouteLimiter);
adminRouter.get('/account', (_req, res) => {
    res.json({ email: getAdminEmail() });
});
adminRouter.put('/account/email', (req, res) => {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Valid email is required' });
    }
    db.prepare(`INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`).run('admin_email', email.trim().toLowerCase());
    res.json({ ok: true, email: email.trim().toLowerCase() });
});
adminRouter.get('/system/status', (_req, res) => {
    let databaseSizeBytes = 0;
    let sizeAvailable = true;
    try {
        databaseSizeBytes = statSync(env.DB_PATH).size;
    }
    catch {
        sizeAvailable = false;
    }
    res.json({
        databaseSizeBytes,
        sizeAvailable,
        exportAvailable: true,
        restoreAvailable: true
    });
});
adminRouter.post('/system/export', (_req, res) => {
    res.json({ ok: true, message: 'Database export placeholder. Wire to secure snapshot storage.' });
});
adminRouter.post('/system/restore', (_req, res) => {
    res.json({ ok: true, message: 'Database restore placeholder. Wire to secure backup restore flow.' });
});
adminRouter.get('/settings/smtp', (_req, res) => {
    res.json(getSmtpSettings());
});
adminRouter.put('/settings/smtp', (req, res) => {
    const { host, port, user, pass } = req.body;
    if (!host || !port || !user || !pass) {
        return res.status(400).json({ error: 'host, port, user, pass are required' });
    }
    const updates = [
        ['smtp_host', host],
        ['smtp_port', String(port)],
        ['smtp_user', user],
        ['smtp_pass', pass]
    ];
    const stmt = db.prepare(`INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`);
    const tx = db.transaction(() => {
        updates.forEach(([key, value]) => stmt.run(key, value));
    });
    tx();
    res.json({ ok: true });
});
adminRouter.get('/settings/webhook-api-key', (_req, res) => {
    const row = db
        .prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1')
        .get('webhook_api_key');
    res.json({ apiKey: row?.value ?? env.WEBHOOK_API_KEY });
});
adminRouter.put('/settings/webhook-api-key', (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey || !apiKey.trim()) {
        return res.status(400).json({ error: 'apiKey is required' });
    }
    db.prepare(`INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`).run('webhook_api_key', apiKey.trim());
    res.json({ ok: true });
});
//# sourceMappingURL=settings.js.map