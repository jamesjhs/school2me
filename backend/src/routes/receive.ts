import express from 'express';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { db } from '../database/db.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { parseEmailAndPersistEvents } from '../services/openaiParser.js';
import { generateUuidBuffer } from '../utils/uuid.js';

const webhookRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 120 });

export const receiveRouter = express.Router();

const extractString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractString(item);
      if (extracted) {
        return extracted;
      }
    }
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return extractString(record.email) ?? extractString(record.address) ?? extractString(record.value);
  }

  return undefined;
};

const extractEmailAddress = (value: unknown): string | undefined => {
  const extracted = extractString(value);
  if (!extracted) {
    return undefined;
  }

  const angleMatch = extracted.match(/<([^>]+)>/);
  return (angleMatch?.[1] ?? extracted).trim();
};

const readPayloadField = (payload: any, key: string): unknown => payload?.data?.[key] ?? payload?.[key];

const getWebhookApiKey = (): string => {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ? LIMIT 1')
    .get('webhook_api_key') as { value: string } | undefined;
  return row?.value ?? env.WEBHOOK_API_KEY;
};

const webhookKeyMatches = (providedKey: string): boolean => {
  const expectedKey = getWebhookApiKey();
  const providedHash = crypto.createHash('sha256').update(providedKey).digest();
  const expectedHash = crypto.createHash('sha256').update(expectedKey).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
};

receiveRouter.post('/', webhookRateLimiter, express.raw({ type: 'application/json' }), async (req, res) => {
  const providedWebhookKey = req.header('x-jahosi-webhook-key');
  if (!providedWebhookKey) {
    return res.status(401).json({ error: 'Missing webhook API key' });
  }

  if (!webhookKeyMatches(providedWebhookKey)) {
    return res.status(401).json({ error: 'Invalid webhook API key' });
  }

  const rawPayload = req.body.toString('utf-8');
  let payload: any;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  res.status(200).json({ received: true });

  setImmediate(async () => {
    try {
      const toAddress = extractEmailAddress(readPayloadField(payload, 'to') ?? readPayloadField(payload, 'recipient'));
      const alias = toAddress?.split('@')[0]?.toLowerCase();
      if (!toAddress || !alias) {
        return;
      }

      const family = db
        .prepare('SELECT id FROM families WHERE lower(routing_alias) = ? LIMIT 1')
        .get(alias) as { id: Buffer } | undefined;

      if (!family) {
        return;
      }

      const insertedEmailId = generateUuidBuffer();
      const insertResult = db.prepare(
        `INSERT INTO ingested_emails (id, family_id, sender, subject, body_text, body_html, vendor_email_id, attachments_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(vendor_email_id) DO NOTHING`
      ).run(
        insertedEmailId,
        family.id,
        extractEmailAddress(readPayloadField(payload, 'from') ?? readPayloadField(payload, 'sender')) ?? 'unknown@unknown',
        extractString(readPayloadField(payload, 'subject')) ?? '',
        extractString(readPayloadField(payload, 'text') ?? readPayloadField(payload, 'body_text') ?? readPayloadField(payload, 'bodyText')) ?? '',
        extractString(readPayloadField(payload, 'html') ?? readPayloadField(payload, 'body_html') ?? readPayloadField(payload, 'bodyHtml')) ?? '',
        extractString(readPayloadField(payload, 'email_id') ?? readPayloadField(payload, 'emailId') ?? readPayloadField(payload, 'message_id')) ??
          null,
        JSON.stringify(readPayloadField(payload, 'attachments') ?? [])
      );
      if (insertResult.changes === 0) {
        return;
      }

      const parseInput = {
        recipient: toAddress,
        subject: extractString(readPayloadField(payload, 'subject')) ?? '',
        bodyText: extractString(readPayloadField(payload, 'text') ?? readPayloadField(payload, 'body_text') ?? readPayloadField(payload, 'bodyText')) ?? '',
        sourceEmailId: insertedEmailId
      };

      const bodyHtml =
        extractString(readPayloadField(payload, 'html') ?? readPayloadField(payload, 'body_html') ?? readPayloadField(payload, 'bodyHtml')) ??
        '';
      if (bodyHtml) {
        Object.assign(parseInput, { bodyHtml });
      }

      await parseEmailAndPersistEvents(parseInput);
    } catch (error) {
      console.error('Webhook processing error', error);
    }
  });
});
