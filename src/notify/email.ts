import nodemailer from 'nodemailer';
import db from '../db/database';
import type { NotificationChannel, DigestPayload } from './types';
import { renderDigestHtml, renderDigestText } from './render';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string;
}

function readConfig(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value || undefined;
}

/** Read SMTP settings from the config table; undefined when incomplete. */
function getSmtpConfig(): SmtpConfig | undefined {
  const host = readConfig('smtp_host');
  const to = readConfig('email_to');
  // A host to connect to and a recipient are the minimum to send anything.
  if (!host || !to) return undefined;

  const port = parseInt(readConfig('smtp_port') || '587', 10);
  const from = readConfig('email_from') || readConfig('smtp_user') || 'jinder@localhost';

  return {
    host,
    port: Number.isNaN(port) ? 587 : port,
    secure: readConfig('smtp_secure') === 'true',
    user: readConfig('smtp_user'),
    pass: readConfig('smtp_pass'),
    from,
    to,
  };
}

/**
 * Email notification channel. Delivers the periodic digest over SMTP.
 * It has no real-time alert path — high-match pings stay on Discord.
 * No-op when SMTP is not configured; failures are logged, never thrown.
 */
export const emailChannel: NotificationChannel = {
  name: 'email',

  isConfigured() {
    return getSmtpConfig() !== undefined;
  },

  async sendDigest(digest: DigestPayload): Promise<void> {
    try {
      const cfg = getSmtpConfig();
      if (!cfg) return;

      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      });

      await transporter.sendMail({
        from: cfg.from,
        to: cfg.to,
        subject: `Jinder digest — ${digest.jobs.length} top match${digest.jobs.length === 1 ? '' : 'es'}`,
        text: renderDigestText(digest),
        html: renderDigestHtml(digest),
      });
      console.log(`Sent email digest with ${digest.jobs.length} jobs to ${cfg.to}.`);
    } catch (emailErr: any) {
      console.error('Failed to send email digest:', emailErr.message);
    }
  },
};
