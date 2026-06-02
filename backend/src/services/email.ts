import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { db } from '../database/db.js';

interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
}

const getSettingValue = (key: string): string | null => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
};

export const getSmtpSettings = (): SmtpSettings => {
  const host = getSettingValue('smtp_host') ?? env.SMTP_HOST;
  const port = Number(getSettingValue('smtp_port') ?? env.SMTP_PORT);
  const user = getSettingValue('smtp_user') ?? env.SMTP_USER;
  const pass = getSettingValue('smtp_pass') ?? env.SMTP_PASS;

  return { host, port, user, pass };
};

export const sendMail = async (input: { to: string; subject: string; text: string; html?: string }) => {
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
