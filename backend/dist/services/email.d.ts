interface SmtpSettings {
    host: string;
    port: number;
    user: string;
    pass: string;
}
export declare const getSmtpSettings: () => SmtpSettings;
export declare const sendMail: (input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
}) => Promise<void>;
export {};
//# sourceMappingURL=email.d.ts.map