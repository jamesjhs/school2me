import cookieParser from 'cookie-parser';
import express from 'express';
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
if (env.TRUST_PROXY > 0) {
    app.set('trust proxy', env.TRUST_PROXY);
}
app.use('/receive', receiveRouter);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
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
        return res.status(403).json({ error: 'Missing CSRF token' });
    }
    const cookieHash = crypto.createHash('sha256').update(cookieToken).digest();
    const headerHash = crypto.createHash('sha256').update(headerToken).digest();
    if (!crypto.timingSafeEqual(cookieHash, headerHash)) {
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
const ensureBootstrapData = () => {
    const familyCount = db.prepare('SELECT COUNT(*) as count FROM families').get().count;
    if (familyCount > 0) {
        return;
    }
    const familyId = generateUuidBuffer();
    db.prepare('INSERT INTO families (id, routing_alias) VALUES (?, ?)').run(familyId, 'family-demo');
};
ensureBootstrapData();
app.listen(env.PORT, () => {
    console.log(`School2Me backend listening on ${env.PORT}`);
});
//# sourceMappingURL=server.js.map