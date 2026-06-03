import { env } from '../config/env.js';
import { db } from '../database/db.js';
export const getAdminEmail = () => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get('admin_email');
    return row?.value?.trim().toLowerCase() || env.ADMIN_EMAIL.trim().toLowerCase();
};
//# sourceMappingURL=adminIdentity.js.map