import { Router } from 'express';
import { db } from '../database/db.js';
import { requireUserSession } from '../middleware/auth.js';
import { uuidBufferToString, uuidStringToBuffer } from '../utils/uuid.js';

export const dashboardRouter = Router();

dashboardRouter.get('/events', requireUserSession, (req, res) => {
  const familyId = uuidStringToBuffer(req.user!.familyId);
  const childId = typeof req.query.childId === 'string' && req.query.childId ? req.query.childId : null;
  const activityId = typeof req.query.activityId === 'string' && req.query.activityId ? req.query.activityId : null;

  let query = `
    SELECT id, child_id, activity_id, title, description, start_time, end_time, location, needs_review
    FROM parsed_events
    WHERE family_id = ? AND start_time >= datetime('now', '-1 day')
  `;

  const params: Array<Buffer> = [familyId];

  if (childId) {
    query += ' AND child_id = ?';
    params.push(uuidStringToBuffer(childId));
  }

  if (activityId) {
    query += ' AND activity_id = ?';
    params.push(uuidStringToBuffer(activityId));
  }

  query += ' ORDER BY start_time ASC LIMIT 200';

  const rows = db.prepare(query).all(...params) as Array<{
    id: Buffer;
    child_id: Buffer | null;
    activity_id: Buffer | null;
    title: string;
    description: string | null;
    start_time: string;
    end_time: string | null;
    location: string | null;
    needs_review: number;
  }>;

  res.json({
    events: rows.map((row) => ({
      id: uuidBufferToString(row.id),
      childId: row.child_id ? uuidBufferToString(row.child_id) : null,
      activityId: row.activity_id ? uuidBufferToString(row.activity_id) : null,
      title: row.title,
      description: row.description,
      startTime: row.start_time,
      endTime: row.end_time,
      location: row.location,
      needsReview: row.needs_review === 1
    }))
  });
});
