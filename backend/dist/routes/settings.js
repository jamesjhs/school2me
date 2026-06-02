import argon2 from 'argon2';
import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../database/db.js';
import { requireAdminSession, requireUserSession } from '../middleware/auth.js';
import { generateUuidBuffer, uuidBufferToString, uuidStringToBuffer } from '../utils/uuid.js';
import { getSmtpSettings } from '../services/email.js';
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
    res.json({ family, children, activities });
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
export const adminRouter = Router();
adminRouter.use(requireAdminSession);
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
//# sourceMappingURL=settings.js.map