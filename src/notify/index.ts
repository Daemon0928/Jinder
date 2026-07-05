import { discordChannel } from './discord';
import { emailChannel } from './email';
import type { NotificationChannel, JobAlert, DigestPayload } from './types';

export type { NotificationChannel, JobAlert, DigestPayload, DigestJob } from './types';
export { sendDiscordAlert } from './discord';

/** All known channels. Configuration decides which actually fire. */
export const channels: NotificationChannel[] = [discordChannel, emailChannel];

/** Names of the channels currently configured to deliver. */
export function configuredChannels(): string[] {
  return channels.filter((c) => c.isConfigured()).map((c) => c.name);
}

/** Fan a real-time alert out to every configured channel that supports alerts. */
export async function dispatchAlert(alert: JobAlert): Promise<void> {
  await Promise.all(
    channels
      .filter((c) => c.isConfigured() && c.sendAlert)
      .map((c) => c.sendAlert!(alert)),
  );
}

/** Fan a digest out to every configured channel that supports digests. */
export async function dispatchDigest(digest: DigestPayload): Promise<void> {
  await Promise.all(
    channels
      .filter((c) => c.isConfigured() && c.sendDigest)
      .map((c) => c.sendDigest!(digest)),
  );
}
