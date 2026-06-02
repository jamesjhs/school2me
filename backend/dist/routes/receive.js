import express from 'express';
import { Resend } from 'resend';
import { env } from '../config/env.js';
import { db } from '../database/db.js';
import { parseEmailAndPersistEvents } from '../services/openaiParser.js';
import { generateUuidBuffer } from '../utils/uuid.js';
const resend = new Resend(env.RESEND_API_KEY);
export const receiveRouter = express.Router();
const extractEmailId = (verifiedPayload) => {
    return (verifiedPayload?.data?.email_id ??
        verifiedPayload?.data?.emailId ??
        verifiedPayload?.email_id ??
        verifiedPayload?.emailId);
};
receiveRouter.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const id = req.header('svix-id');
    const timestamp = req.header('svix-timestamp');
    const signature = req.header('svix-signature');
    if (!id || !timestamp || !signature) {
        return res.status(400).json({ error: 'Missing webhook headers' });
    }
    const payload = req.body.toString('utf-8');
    let verified;
    try {
        verified = resend.webhooks.verify({
            payload,
            headers: { id, timestamp, signature },
            webhookSecret: env.RESEND_WEBHOOK_SECRET
        });
    }
    catch {
        return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    res.status(200).json({ received: true });
    setImmediate(async () => {
        try {
            const emailId = extractEmailId(verified);
            if (!emailId) {
                return;
            }
            const fetched = await resend.emails.get(emailId);
            if (fetched.error || !fetched.data) {
                return;
            }
            const toAddress = fetched.data.to?.[0] ?? '';
            const alias = toAddress.split('@')[0]?.toLowerCase();
            if (!alias) {
                return;
            }
            const family = db
                .prepare('SELECT id FROM families WHERE lower(routing_alias) = ? LIMIT 1')
                .get(alias);
            if (!family) {
                return;
            }
            const insertedEmailId = generateUuidBuffer();
            db.prepare(`INSERT INTO ingested_emails (id, family_id, sender, subject, body_text, body_html, vendor_email_id, attachments_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(insertedEmailId, family.id, fetched.data.from, fetched.data.subject ?? '', fetched.data.text ?? '', fetched.data.html ?? '', emailId, JSON.stringify(fetched.data.attachments ?? []));
            const parseInput = {
                recipient: toAddress,
                subject: fetched.data.subject ?? '',
                bodyText: fetched.data.text ?? '',
                sourceEmailId: insertedEmailId
            };
            if (fetched.data.html) {
                Object.assign(parseInput, { bodyHtml: fetched.data.html });
            }
            await parseEmailAndPersistEvents(parseInput);
        }
        catch (error) {
            console.error('Webhook processing error', error);
        }
    });
});
//# sourceMappingURL=receive.js.map