import { env } from '../config/env.js';
import { db } from '../database/db.js';

export const getAdminEmail = (): string => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1').get('admin_email') as
    | { value: string }
    | undefined;

  return row?.value?.trim().toLowerCase() || env.ADMIN_EMAIL.trim().toLowerCase();
};
