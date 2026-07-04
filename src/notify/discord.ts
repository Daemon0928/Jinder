import db from '../db/database';
import { DISCORD_EMBED_COLOR } from '../lib/constants';

export interface DiscordAlert {
  title: string;
  company: string;
  location: string;
  link: string;
  score: number;
  justification: string;
  /** Reevaluated matches get slightly different wording. */
  reevaluated?: boolean;
}

/**
 * Send a high-match alert to the configured Discord webhook.
 * No-op when no webhook is configured; failures are logged, never thrown.
 */
export async function sendDiscordAlert(alert: DiscordAlert): Promise<void> {
  try {
    const webhookRow = db
      .prepare("SELECT value FROM config WHERE key = 'discord_webhook'")
      .get() as { value: string } | undefined;
    const webhookUrl = webhookRow?.value;
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      return;
    }

    const headline = alert.reevaluated
      ? `🎉 **Reevaluated Highly Matched Job: ${alert.score}%**`
      : `🎉 **New Highly Matched Job: ${alert.score}%**`;
    const embedTitle = alert.reevaluated
      ? 'AI Match Justification (Reevaluated)'
      : 'AI Match Justification';

    const payload = {
      content: `${headline}\n**Title:** ${alert.title}\n**Company:** ${alert.company}\n**Location:** ${alert.location}\n[View Job Details](${alert.link})`,
      embeds: [
        {
          title: embedTitle,
          description: alert.justification.substring(0, 2048),
          color: DISCORD_EMBED_COLOR,
        },
      ],
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log(`Sent Discord webhook for job: ${alert.title}`);
  } catch (webhookErr: any) {
    console.error('Failed to send Discord webhook:', webhookErr.message);
  }
}
