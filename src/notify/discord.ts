import db from '../db/database';
import { DISCORD_EMBED_COLOR } from '../lib/constants';
import type { NotificationChannel, JobAlert, DigestPayload } from './types';

/** @deprecated use JobAlert from ./types — kept for existing imports. */
export type DiscordAlert = JobAlert;

function getWebhookUrl(): string | undefined {
  const row = db
    .prepare("SELECT value FROM config WHERE key = 'discord_webhook'")
    .get() as { value: string } | undefined;
  const url = row?.value;
  return url && url.startsWith('http') ? url : undefined;
}

async function post(webhookUrl: string, payload: unknown): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Discord notification channel. Supports both real-time high-match alerts and
 * a rolled-up digest posted to the same webhook. No-op when no webhook is
 * configured; failures are logged, never thrown.
 */
export const discordChannel: NotificationChannel = {
  name: 'discord',

  isConfigured() {
    return getWebhookUrl() !== undefined;
  },

  async sendAlert(alert: JobAlert): Promise<void> {
    try {
      const webhookUrl = getWebhookUrl();
      if (!webhookUrl) return;

      const headline = alert.reevaluated
        ? `🎉 **Reevaluated Highly Matched Job: ${alert.score}%**`
        : `🎉 **New Highly Matched Job: ${alert.score}%**`;
      const embedTitle = alert.reevaluated
        ? 'AI Match Justification (Reevaluated)'
        : 'AI Match Justification';

      await post(webhookUrl, {
        content: `${headline}\n**Title:** ${alert.title}\n**Company:** ${alert.company}\n**Location:** ${alert.location}\n[View Job Details](${alert.link})`,
        embeds: [
          {
            title: embedTitle,
            description: alert.justification.substring(0, 2048),
            color: DISCORD_EMBED_COLOR,
          },
        ],
      });
      console.log(`Sent Discord webhook for job: ${alert.title}`);
    } catch (webhookErr: any) {
      console.error('Failed to send Discord webhook:', webhookErr.message);
    }
  },

  async sendDigest(digest: DigestPayload): Promise<void> {
    try {
      const webhookUrl = getWebhookUrl();
      if (!webhookUrl) return;

      // Discord caps 10 embeds per message; the digest is already limited well
      // below that, but slice defensively.
      const embeds = digest.jobs.slice(0, 10).map((job) => ({
        title: `${job.score}% — ${job.title}`,
        description: `**${job.company}** · ${job.location}\n${job.justification.substring(0, 400)}\n[View Job Details](${job.link})`,
        color: DISCORD_EMBED_COLOR,
      }));

      await post(webhookUrl, {
        content: `📬 **Your Jinder digest — top ${digest.jobs.length} match${digest.jobs.length === 1 ? '' : 'es'} from the last ${digest.periodDays} day${digest.periodDays === 1 ? '' : 's'}**`,
        embeds,
      });
      console.log(`Sent Discord digest with ${digest.jobs.length} jobs.`);
    } catch (webhookErr: any) {
      console.error('Failed to send Discord digest:', webhookErr.message);
    }
  },
};

/**
 * Backwards-compatible helper for the scrape/reevaluation paths.
 * Prefer dispatchAlert (./index) for new call sites.
 */
export async function sendDiscordAlert(alert: JobAlert): Promise<void> {
  await discordChannel.sendAlert!(alert);
}
