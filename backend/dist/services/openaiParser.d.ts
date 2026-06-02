export interface ParsedEventCandidate {
    title: string;
    description?: string;
    start_time: string;
    end_time?: string;
    location?: string;
    child_id?: string;
    activity_id?: string;
    confidence?: 'high' | 'medium' | 'low';
    needs_review?: boolean;
}
export declare const parseEmailAndPersistEvents: (payload: {
    recipient: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    sourceEmailId: Buffer;
}) => Promise<{
    matched: boolean;
    eventsStored: number;
}>;
//# sourceMappingURL=openaiParser.d.ts.map