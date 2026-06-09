import db from './db/database';
import { runScraper, ScrapeReport, ScrapeProgress } from './scrapers/scraperManager';

export interface SchedulerStatus {
  enabled: boolean;
  intervalHours: number;
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunSummary: {
    id: number;
    startedAt: string;
    finishedAt: string | null;
    trigger: string;
    totalScraped: number;
    newJobs: number;
    matched: number;
    errors: string[];
    status: string;
  } | null;
}

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private nextRunAt: Date | null = null;
  private intervalMs = 4 * 60 * 60 * 1000; // default 4 hours in ms

  public progress: ScrapeProgress & { isScraping: boolean } = {
    isScraping: false,
    phase: 'done',
    currentJobIndex: 0,
    totalJobs: 0,
    currentJobTitle: '',
    currentKeyword: '',
    keywordIndex: 0,
    totalKeywords: 0,
    newJobs: 0,
    matched: 0,
    skipped: 0,
    errors: 0,
  };

  constructor() {
    // Auto-start on creation if configured
    this.initFromConfig();
  }

  private initFromConfig(): void {
    try {
      const enabled = this.isSchedulerEnabled();
      const intervalHours = this.getIntervalHours();
      this.intervalMs = intervalHours * 60 * 60 * 1000;

      if (enabled) {
        console.log(`Scheduler enabled in config. Starting with interval: ${intervalHours} hours.`);
        this.start(this.intervalMs);
      } else {
        console.log('Scheduler disabled in config.');
      }
    } catch (err: any) {
      console.error('Failed to initialize scheduler from config:', err.message);
    }
  }

  public start(intervalMs: number): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.intervalMs = intervalMs;
    this.nextRunAt = new Date(Date.now() + intervalMs);
    this.timer = setInterval(() => {
      this.tick();
    }, intervalMs);
    console.log(`Scheduler started. Next run scheduled at: ${this.nextRunAt.toISOString()}`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextRunAt = null;
    console.log('Scheduler stopped.');
  }

  public async runNow(): Promise<ScrapeReport> {
    const wasRunningTimer = this.timer !== null;
    this.stop();

    try {
      const report = await this.executeScrape('manual');
      return report;
    } finally {
      // Re-align and restart the scheduler timer if it was running or is enabled
      if (wasRunningTimer || this.isSchedulerEnabled()) {
        const intervalHours = this.getIntervalHours();
        this.start(intervalHours * 60 * 60 * 1000);
      }
    }
  }

  public getStatus(): SchedulerStatus {
    const enabled = this.isSchedulerEnabled();
    const intervalHours = this.getIntervalHours();
    const lastSummary = this.getLastRunSummary();
    const lastRunAt = lastSummary ? lastSummary.startedAt : null;

    return {
      enabled,
      intervalHours,
      isRunning: this.isRunning,
      lastRunAt,
      nextRunAt: this.nextRunAt ? this.nextRunAt.toISOString() : null,
      lastRunSummary: lastSummary,
    };
  }

  private async tick(): Promise<void> {
    console.log('Scheduler tick triggered.');
    try {
      this.nextRunAt = new Date(Date.now() + this.intervalMs);
      await this.executeScrape('scheduled');
    } catch (err: any) {
      console.error('Error in scheduler tick execution:', err.message);
    }
  }

  private async executeScrape(triggerType: 'scheduled' | 'manual'): Promise<ScrapeReport> {
    if (this.isRunning) {
      throw new Error('A scraping job is already running');
    }

    this.isRunning = true;

    let keywords: string[] = ['szoftverfejlesztő'];
    try {
      const kwRow = db.prepare("SELECT value FROM config WHERE key = 'keywords'").get() as { value: string } | undefined;
      if (kwRow) {
        keywords = JSON.parse(kwRow.value);
      }
    } catch (kwErr) {
      console.warn('Failed to parse keywords config, falling back to default:', kwErr);
    }

    this.progress = {
      isScraping: true,
      phase: 'searching',
      currentJobIndex: 0,
      totalJobs: 0,
      currentJobTitle: '',
      currentKeyword: '',
      keywordIndex: 0,
      totalKeywords: keywords.length,
      newJobs: 0,
      matched: 0,
      skipped: 0,
      errors: 0,
    };

    // Log the start of the scraping run
    const startedAt = new Date().toISOString();
    let historyId: number | bigint = 0;
    try {
      const insertHistory = db.prepare(`
        INSERT INTO scrape_history (started_at, "trigger", status)
        VALUES (?, ?, 'running')
      `);
      const info = insertHistory.run(startedAt, triggerType);
      historyId = info.lastInsertRowid;
    } catch (dbErr: any) {
      console.error('Failed to log scrape start to database:', dbErr.message);
    }

    const aggregatedReport: ScrapeReport = {
      scrapedCount: 0,
      newJobsCount: 0,
      matchedCount: 0,
      errors: [],
    };

    try {
      for (let ki = 0; ki < keywords.length; ki++) {
        const kw = keywords[ki];
        this.progress.currentKeyword = kw;
        this.progress.keywordIndex = ki + 1;

        const report = await runScraper(kw, (partial) => {
          Object.assign(this.progress, partial);
        });

        aggregatedReport.scrapedCount += report.scrapedCount;
        aggregatedReport.newJobsCount += report.newJobsCount;
        aggregatedReport.matchedCount += report.matchedCount;
        aggregatedReport.errors.push(...report.errors);
      }

      this.progress.isScraping = false;
      this.progress.phase = 'done';

      // Log successful completion
      if (historyId) {
        const finishedAt = new Date().toISOString();
        db.prepare(`
          UPDATE scrape_history
          SET finished_at = ?,
              total_scraped = ?,
              new_jobs = ?,
              matched = ?,
              errors = ?,
              status = 'completed'
          WHERE id = ?
        `).run(
          finishedAt,
          aggregatedReport.scrapedCount,
          aggregatedReport.newJobsCount,
          aggregatedReport.matchedCount,
          JSON.stringify(aggregatedReport.errors),
          historyId
        );
      }
    } catch (err: any) {
      console.error('Scheduler scraping run failed:', err.message);
      aggregatedReport.errors.push(`Fatal error: ${err.message}`);

      this.progress.isScraping = false;
      this.progress.phase = 'done';

      // Log failed run
      if (historyId) {
        const finishedAt = new Date().toISOString();
        db.prepare(`
          UPDATE scrape_history
          SET finished_at = ?,
              total_scraped = ?,
              new_jobs = ?,
              matched = ?,
              errors = ?,
              status = 'failed'
          WHERE id = ?
        `).run(
          finishedAt,
          aggregatedReport.scrapedCount,
          aggregatedReport.newJobsCount,
          aggregatedReport.matchedCount,
          JSON.stringify(aggregatedReport.errors),
          historyId
        );
      }
    } finally {
      this.isRunning = false;
    }

    return aggregatedReport;
  }

  private isSchedulerEnabled(): boolean {
    const row = db.prepare("SELECT value FROM config WHERE key = 'scheduler_enabled'").get() as { value: string } | undefined;
    return row ? row.value === 'true' : false;
  }

  private getIntervalHours(): number {
    const row = db.prepare("SELECT value FROM config WHERE key = 'scheduler_interval_hours'").get() as { value: string } | undefined;
    if (row) {
      const val = parseInt(row.value, 10);
      return isNaN(val) ? 4 : val;
    }
    return 4;
  }

  private getLastRunSummary() {
    try {
      const row = db.prepare(`
        SELECT * FROM scrape_history 
        ORDER BY id DESC LIMIT 1
      `).get() as any;

      if (!row) return null;

      return {
        id: row.id,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        trigger: row.trigger,
        totalScraped: row.total_scraped,
        newJobs: row.new_jobs,
        matched: row.matched,
        errors: JSON.parse(row.errors || '[]'),
        status: row.status,
      };
    } catch (err) {
      console.error('Failed to query last run summary:', err);
      return null;
    }
  }
}

// Export a singleton instance
export const schedulerService = new SchedulerService();
