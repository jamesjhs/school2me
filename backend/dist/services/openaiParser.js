import OpenAI from 'openai';
import { env } from '../config/env.js';
import { db } from '../database/db.js';
import { generateUuidBuffer, uuidBufferToString, uuidStringToBuffer } from '../utils/uuid.js';
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const getFamilyContextByRecipient = (recipient) => {
    const alias = recipient.split('@')[0]?.trim().toLowerCase();
    if (!alias) {
        return null;
    }
    const family = db
        .prepare('SELECT id, routing_alias FROM families WHERE lower(routing_alias) = ? LIMIT 1')
        .get(alias);
    if (!family) {
        return null;
    }
    const children = db
        .prepare('SELECT id, first_name, class_name, teacher_name FROM children WHERE family_id = ?')
        .all(family.id)
        .map((row) => ({ ...row, id: uuidBufferToString(row.id) }));
    const activities = db
        .prepare(`SELECT activities.id, activities.child_id, activities.name, activities.activity_type
       FROM activities
       INNER JOIN children ON children.id = activities.child_id
       WHERE children.family_id = ?`)
        .all(family.id)
        .map((row) => ({ ...row, id: uuidBufferToString(row.id), child_id: uuidBufferToString(row.child_id) }));
    return {
        familyId: family.id,
        familyIdString: uuidBufferToString(family.id),
        routingAlias: family.routing_alias,
        children,
        activities
    };
};
const parseJsonFromText = (text) => {
    const parsed = JSON.parse(text);
    return {
        events: Array.isArray(parsed.events) ? parsed.events : []
    };
};
const extractJsonPayload = async (message, emailBody) => {
    const systemInstruction = `
You are School2Me's extraction engine.
Current server timestamp (UTC): ${new Date().toISOString()}.
Return strict JSON only with shape: {"events": [{"title": string, "description"?: string, "start_time": ISO8601 UTC string, "end_time"?: ISO8601 UTC string, "location"?: string, "child_id"?: string, "activity_id"?: string, "confidence"?: "high"|"medium"|"low", "needs_review"?: boolean}]}
Normalize relative dates (e.g., tomorrow, next Tuesday) into UTC ISO-8601.
Use known child/activity ids when confident; otherwise leave them empty and set needs_review true.
`;
    try {
        const response = await client.responses.create({
            model: 'gpt-4.1-mini',
            text: {
                format: {
                    type: 'json_object'
                }
            },
            input: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `${message}\n\nEmail body:\n${emailBody}` }
            ]
        });
        const outputText = response.output_text ?? '{}';
        return parseJsonFromText(outputText);
    }
    catch {
        const completion = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `${message}\n\nEmail body:\n${emailBody}` }
            ]
        });
        const text = completion.choices[0]?.message?.content ?? '{}';
        return parseJsonFromText(text);
    }
};
export const parseEmailAndPersistEvents = async (payload) => {
    const context = getFamilyContextByRecipient(payload.recipient);
    if (!context) {
        return { matched: false, eventsStored: 0 };
    }
    const contextSummary = {
        family_id: context.familyIdString,
        routing_alias: context.routingAlias,
        children: context.children,
        activities: context.activities
    };
    const userPrompt = `Family context:\n${JSON.stringify(contextSummary)}\n\nSubject: ${payload.subject}`;
    const extracted = await extractJsonPayload(userPrompt, payload.bodyText || payload.bodyHtml || '');
    const insert = db.prepare(`INSERT INTO parsed_events (id, family_id, child_id, activity_id, title, description, start_time, end_time, location, source_email_id, needs_review)
     VALUES (@id, @family_id, @child_id, @activity_id, @title, @description, @start_time, @end_time, @location, @source_email_id, @needs_review)`);
    let stored = 0;
    const transaction = db.transaction(() => {
        for (const event of extracted.events) {
            if (!event.title || !event.start_time) {
                continue;
            }
            const childId = event.child_id ? uuidStringToBuffer(event.child_id) : null;
            const activityId = event.activity_id ? uuidStringToBuffer(event.activity_id) : null;
            const confidenceNeedsReview = event.confidence ? event.confidence !== 'high' : true;
            insert.run({
                id: generateUuidBuffer(),
                family_id: context.familyId,
                child_id: childId,
                activity_id: activityId,
                title: event.title,
                description: event.description ?? null,
                start_time: event.start_time,
                end_time: event.end_time ?? null,
                location: event.location ?? null,
                source_email_id: payload.sourceEmailId,
                needs_review: event.needs_review === true || confidenceNeedsReview ? 1 : 0
            });
            stored += 1;
        }
    });
    transaction();
    return { matched: true, eventsStored: stored };
};
//# sourceMappingURL=openaiParser.js.map