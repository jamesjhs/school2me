import { Router } from 'express';
import { createEvents } from 'ics';
import { db } from '../database/db.js';
import { uuidBufferToString } from '../utils/uuid.js';
export const feedsRouter = Router();
const xmlEscape = (value) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
feedsRouter.get('/:routing_alias/calendar.ics', (req, res) => {
    const family = db
        .prepare('SELECT id FROM families WHERE lower(routing_alias) = lower(?) LIMIT 1')
        .get(req.params.routing_alias);
    if (!family) {
        return res.status(404).send('Not found');
    }
    const events = db
        .prepare(`SELECT id, title, description, start_time, end_time, location
       FROM parsed_events
       WHERE family_id = ? AND start_time >= datetime('now')
       ORDER BY start_time ASC`)
        .all(family.id);
    const { error, value } = createEvents(events.map((event) => {
        const start = new Date(event.start_time);
        const end = event.end_time ? new Date(event.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
        return {
            uid: uuidBufferToString(event.id),
            title: event.title,
            description: event.description ?? '',
            location: event.location ?? '',
            start: [start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes()],
            end: [end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes()]
        };
    }));
    if (error || !value) {
        return res.status(500).send('Unable to render calendar');
    }
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(value);
});
feedsRouter.get('/:routing_alias/rss', (req, res) => {
    const family = db
        .prepare('SELECT id FROM families WHERE lower(routing_alias) = lower(?) LIMIT 1')
        .get(req.params.routing_alias);
    if (!family) {
        return res.status(404).send('Not found');
    }
    const emails = db
        .prepare(`SELECT id, sender, subject, body_text, processed_at
       FROM ingested_emails
       WHERE family_id = ? AND processed_at >= datetime('now', '-7 days')
       ORDER BY processed_at DESC`)
        .all(family.id);
    const items = emails
        .map((email) => `<item>
<title>${xmlEscape(email.subject ?? 'School update')}</title>
<description>${xmlEscape((email.body_text ?? '').slice(0, 3000))}</description>
<guid>${uuidBufferToString(email.id)}</guid>
<pubDate>${new Date(email.processed_at).toUTCString()}</pubDate>
<author>${xmlEscape(email.sender)}</author>
</item>`)
        .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>School2Me Updates</title>
<link>https://school2me.jahosi.co.uk/feeds/${xmlEscape(req.params.routing_alias)}/rss</link>
<description>Family updates from the last 7 days</description>
${items}
</channel>
</rss>`;
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
});
//# sourceMappingURL=feeds.js.map