import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { db } from '../database/db.js';
const getSettingValue = (key) => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row?.value ?? null;
};
export const getSmtpSettings = () => {
    const host = getSettingValue('smtp_host') ?? env.SMTP_HOST;
    const port = Number(getSettingValue('smtp_port') ?? env.SMTP_PORT);
    const user = getSettingValue('smtp_user') ?? env.SMTP_USER;
    const pass = getSettingValue('smtp_pass') ?? env.SMTP_PASS;
    return { host, port, user, pass };
};
export const sendMail = async (input) => {
    const smtp = getSmtpSettings();
    const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: {
            user: smtp.user,
            pass: smtp.pass
        }
    });
    await transport.sendMail({
        from: `School2Me <${smtp.user}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html
    });
};
//# sourceMappingURL=email.js.map