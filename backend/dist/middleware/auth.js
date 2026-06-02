import { db } from '../database/db.js';
import { uuidBufferToString } from '../utils/uuid.js';
export const requireUserSession = (req, res, next) => {
    const sessionToken = req.cookies['s2m_session'];
    if (!sessionToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const row = db
        .prepare(`SELECT users.id as user_id, users.email, users.role, users.family_id
       FROM user_sessions
       INNER JOIN users ON users.id = user_sessions.user_id
       WHERE hex(user_sessions.id) = upper(?) AND user_sessions.expires_at > datetime('now')
       LIMIT 1`)
        .get(sessionToken);
    if (!row) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = {
        userId: uuidBufferToString(row.user_id),
        email: row.email,
        role: row.role,
        familyId: uuidBufferToString(row.family_id)
    };
    next();
};
export const requireAdminSession = (req, res, next) => {
    const adminSession = req.cookies['s2m_admin_session'];
    if (!adminSession) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const row = db
        .prepare("SELECT id FROM admin_sessions WHERE hex(id) = upper(?) AND expires_at > datetime('now') LIMIT 1")
        .get(adminSession);
    if (!row) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    req.isAdmin = true;
    next();
};
//# sourceMappingURL=auth.js.map