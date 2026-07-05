import db from './db/database';
import { dispatchDigest, configuredChannels } from './notify';
import type { DigestJob, DigestPayload } from './notify';

export interface DigestSettings {
  enabled: boolean;
  intervalDays: number;
  minScore: number;
  maxJobs: number;
}

export interface DigestStatus extends DigestSettings {
  channels: string[];
  lastSentAt: string | null;
  nextRunAt: string | null;
  /** How many jobs the digest would currently contain. */
  pendingCount: number;
}

function readConfig(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? undefined;
}

function readInt(key: string, fallback: number): number {
  const raw = readConfig(key);
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Periodic digest of top new matches. Runs its own timer (independent of the
 * scrape scheduler) and fans the digest out to every configured notification
 * channel. "Top" = highest-scoring jobs still in the `new` column, scored at or
 * above the configured threshold, discovered since the last digest was sent.
 */
export class DigestService {
  private timer: NodeJS.Timeout | null = null;
  /** Wall-clock check cadence; the actual send is gated on the interval. */
  private static readonly CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

  constructor() {
    this.initFromConfig();
  }

  private initFromConfig(): void {
    try {
      if (this.getSettings().enabled) {
        console.log('Weekly digest enabled in config. Arming digest timer.');
        this.start();
      } else {
        console.log('Weekly digest disabled in config.');
      }
    } catch (err: any) {
      console.error('Failed to initialize digest service from config:', err.message);
    }
  }

  public getSettings(): DigestSettings {
    return {
      enabled: readConfig('digest_enabled') === 'true',
      intervalDays: Math.max(readInt('digest_interval_days', 7), 1),
      minScore: readInt('digest_min_score', 80),
      maxJobs: Math.max(readInt('digest_max_jobs', 10), 1),
    };
  }

  public getStatus(): DigestStatus {
    const settings = this.getSettings();
    const lastSentAt = readConfig('last_digest_at') ?? null;
    return {
      ...settings,
      channels: configuredChannels(),
      lastSentAt,
      nextRunAt: this.computeNextRunAt(settings, lastSentAt),
      pendingCount: this.collectJobs(settings).length,
    };
  }

  private computeNextRunAt(settings: DigestSettings, lastSentAt: string | null): string | null {
    if (!settings.enabled) return null;
    const base = lastSentAt ? new Date(lastSentAt).getTime() : Date.now();
    return new Date(base + settings.intervalDays * 24 * 60 * 60 * 1000).toISOString();
  }

  /** Whether enough time has elapsed since the last digest to send another. */
  private isDue(settings: DigestSettings): boolean {
    const lastSentAt = readConfig('last_digest_at');
    if (!lastSentAt) return true;
    const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
    return elapsedMs >= settings.intervalDays * 24 * 60 * 60 * 1000;
  }

  /** Select the top matches for a digest given the current settings. */
  public collectJobs(settings = this.getSettings()): DigestJob[] {
    const lastSentAt = readConfig('last_digest_at');
    const params: (string | number)[] = [settings.minScore];
    let sinceClause = '';
    if (lastSentAt) {
      sinceClause = ' AND created_at > ?';
      params.push(lastSentAt);
    }

    const rows = db
      .prepare(
        `SELECT title, company, location, link, match_score, match_justification
         FROM jobs
         WHERE status = 'new' AND match_score >= ?${sinceClause}
         ORDER BY match_score DESC, created_at DESC
         LIMIT ?`,
      )
      .all(...params, settings.maxJobs) as Array<{
      title: string;
      company: string;
      location: string | null;
      link: string;
      match_score: number;
      match_justification: string | null;
    }>;

    return rows.map((r) => ({
      title: r.title,
      company: r.company,
      location: r.location || 'Hungary',
      link: r.link,
      score: r.match_score,
      justification: r.match_justification || '',
    }));
  }

  /** Build a digest payload from the current top matches (no side effects). */
  public buildPayload(settings = this.getSettings()): DigestPayload {
    return {
      jobs: this.collectJobs(settings),
      periodDays: settings.intervalDays,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Compose and dispatch a digest now. Returns the payload that was sent (or
   * would have been sent when there are no jobs). Records the send timestamp
   * only when jobs were actually delivered so an empty window doesn't reset
   * the accumulation window.
   */
  public async sendNow(): Promise<DigestPayload> {
    const settings = this.getSettings();
    const payload = this.buildPayload(settings);

    if (payload.jobs.length === 0) {
      console.log('Digest run skipped: no new matches in the window.');
      return payload;
    }

    await dispatchDigest(payload);
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('last_digest_at', ?)").run(
      payload.generatedAt,
    );
    console.log(`Digest dispatched (${payload.jobs.length} jobs) to: ${configuredChannels().join(', ') || 'no channels'}`);
    return payload;
  }

  public start(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.tick();
    }, DigestService.CHECK_INTERVAL_MS);
    // Unref so an idle digest timer never keeps the process alive on its own.
    this.timer.unref?.();
    console.log('Digest timer started (hourly due-check).');
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('Digest timer stopped.');
  }

  private async tick(): Promise<void> {
    try {
      const settings = this.getSettings();
      if (!settings.enabled) {
        this.stop();
        return;
      }
      if (this.isDue(settings)) {
        await this.sendNow();
      }
    } catch (err: any) {
      console.error('Digest tick failed:', err.message);
    }
  }

  /** Re-read config and (re)arm or disarm the timer accordingly. */
  public reconfigure(): void {
    if (this.getSettings().enabled) {
      this.start();
    } else {
      this.stop();
    }
  }
}

export const digestService = new DigestService();
