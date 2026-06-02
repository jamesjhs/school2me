import type { NextFunction, Request, Response } from 'express';
import { db } from '../database/db.js';
import { uuidBufferToString } from '../utils/uuid.js';
import type { SessionUser } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      isAdmin?: boolean;
    }
  }
}

export const requireUserSession = (req: Request, res: Response, next: NextFunction) => {
  const sessionToken = req.cookies['s2m_session'];
  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const row = db
    .prepare(
      `SELECT users.id as user_id, users.email, users.role, users.family_id
       FROM user_sessions
       INNER JOIN users ON users.id = user_sessions.user_id
       WHERE hex(user_sessions.id) = upper(?) AND user_sessions.expires_at > datetime('now')
       LIMIT 1`
    )
    .get(sessionToken) as
    | { user_id: Buffer; email: string; role: 'admin' | 'member'; family_id: Buffer }
    | undefined;

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

export const requireAdminSession = (req: Request, res: Response, next: NextFunction) => {
  const adminSession = req.cookies['s2m_admin_session'];
  if (!adminSession) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const row = db
    .prepare("SELECT id FROM admin_sessions WHERE hex(id) = upper(?) AND expires_at > datetime('now') LIMIT 1")
    .get(adminSession) as { id: Buffer } | undefined;

  if (!row) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.isAdmin = true;
  next();
};
