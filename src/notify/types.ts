/**
 * Notification channel abstraction. A channel is any outbound integration that
 * can deliver either a real-time high-match alert or a periodic digest of top
 * matches. Discord and Email each implement the parts they support; the
 * dispatcher (see ./index) fans a payload out to every configured channel.
 */

/** A single high-scoring job worth alerting on, in real time. */
export interface JobAlert {
  title: string;
  company: string;
  location: string;
  link: string;
  score: number;
  justification: string;
  /** Reevaluated matches get slightly different wording. */
  reevaluated?: boolean;
}

/** One entry in a digest — a top match discovered during the digest window. */
export interface DigestJob {
  title: string;
  company: string;
  location: string;
  link: string;
  score: number;
  justification: string;
}

/** A batch of top matches to deliver as a single digest message/email. */
export interface DigestPayload {
  jobs: DigestJob[];
  /** Length of the window these jobs were collected over, in days. */
  periodDays: number;
  generatedAt: string;
}

export interface NotificationChannel {
  /** Stable identifier used in logs (e.g. "discord", "email"). */
  readonly name: string;
  /** True when the channel has enough configuration to deliver. */
  isConfigured(): boolean;
  /** Deliver a real-time alert. Omitted by channels that only do digests. */
  sendAlert?(alert: JobAlert): Promise<void>;
  /** Deliver a periodic digest. Omitted by channels that only do alerts. */
  sendDigest?(digest: DigestPayload): Promise<void>;
}
