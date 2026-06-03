import { Router } from 'express';
import { env } from '../config/env.js';
import { db } from '../database/db.js';
import { requireUserSession } from '../middleware/auth.js';
import { uuidBufferToString, uuidStringToBuffer } from '../utils/uuid.js';
export const dashboardRouter = Router();
dashboardRouter.get('/summary', requireUserSession, (req, res) => {
    const familyId = uuidStringToBuffer(req.user.familyId);
    const family = db
        .prepare('SELECT routing_alias FROM families WHERE id = ? LIMIT 1')
        .get(familyId);
    if (!family) {
        return res.status(404).json({ error: 'Family not found' });
    }
    const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
    const alias = family.routing_alias;
    const publicHost = new URL(env.PUBLIC_BASE_URL).hostname;
    res.json({
        userEmail: req.user.email,
        routingAlias: alias,
        forwardingEmail: `${alias}@${publicHost}`,
        calendarIcsUrl: `${base}/feeds/${alias}/calendar.ics`,
        rssUrl: `${base}/feeds/${alias}/rss`
    });
});
dashboardRouter.get('/inbox', requireUserSession, (req, res) => {
    const familyId = uuidStringToBuffer(req.user.familyId);
    const rows = db
        .prepare(`SELECT id, sender, subject, body_text, processed_at
       FROM ingested_emails
       WHERE family_id = ?
       ORDER BY processed_at DESC
       LIMIT 100`)
        .all(familyId);
    res.json({
        emails: rows.map((row) => ({
            id: uuidBufferToString(row.id),
            sender: row.sender,
            subject: row.subject,
            bodyText: row.body_text,
            processedAt: row.processed_at
        }))
    });
});
dashboardRouter.get('/events', requireUserSession, (req, res) => {
    const familyId = uuidStringToBuffer(req.user.familyId);
    const childId = typeof req.query.childId === 'string' && req.query.childId ? req.query.childId : null;
    const activityId = typeof req.query.activityId === 'string' && req.query.activityId ? req.query.activityId : null;
    let query = `
    SELECT id, child_id, activity_id, title, description, start_time, end_time, location, needs_review
    FROM parsed_events
    WHERE family_id = ? AND start_time >= datetime('now', '-1 day')
  `;
    const params = [familyId];
    if (childId) {
        query += ' AND child_id = ?';
        params.push(uuidStringToBuffer(childId));
    }
    if (activityId) {
        query += ' AND activity_id = ?';
        params.push(uuidStringToBuffer(activityId));
    }
    query += ' ORDER BY start_time ASC LIMIT 200';
    const rows = db.prepare(query).all(...params);
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
//# sourceMappingURL=dashboard.js.map