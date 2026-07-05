import db from './db/database';
import { runScraper } from './scrapers/scraperManager';
import { ScrapeReport, ScrapeProgress } from './types';
import { matchJobsInBatches } from './matching/pipeline';
import { dispatchAlert } from './notify';
import config from './config';

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

  /**
   * Atomically claim a manual scrape run. Returns false when a run is already
   * active. This is the single guard for API-triggered runs — routes must not
   * check isRunning themselves.
   */
  public tryStartManualScrape(): boolean {
    if (this.isRunning) {
      return false;
    }
    this.progress.isScraping = true;
    this.progress.phase = 'searching';
    this.runNow().catch((err: any) => {
      console.error('Manual background scraping run failed:', err.message);
    });
    return true;
  }

  /** Atomically claim a reevaluation run; false when one is already active. */
  public tryStartReevaluation(customBatchSize?: number): boolean {
    if (this.isRunning) {
      return false;
    }
    this.progress.isScraping = true;
    this.progress.phase = 'reevaluating';
    this.runReevaluation(customBatchSize).catch((err: any) => {
      console.error('Manual background reevaluation run failed:', err.message);
    });
    return true;
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

  public async runReevaluation(customBatchSize?: number): Promise<void> {
    if (this.isRunning) {
      throw new Error('A scraping or reevaluation job is already running');
    }

    this.isRunning = true;

    // Log the reevaluation run so it shows up in scrape history like scrapes do
    const startedAt = new Date().toISOString();
    let historyId: number | bigint = 0;
    try {
      const info = db.prepare(`
        INSERT INTO scrape_history (started_at, "trigger", status)
        VALUES (?, 'reevaluation', 'running')
      `).run(startedAt);
      historyId = info.lastInsertRowid;
    } catch (dbErr: any) {
      console.error('Failed to log reevaluation start to database:', dbErr.message);
    }

    const finishHistory = (status: 'completed' | 'failed', errors: string[]) => {
      if (!historyId) return;
      try {
        db.prepare(`
          UPDATE scrape_history
          SET finished_at = ?, total_scraped = ?, new_jobs = 0, matched = ?, errors = ?, status = ?
          WHERE id = ?
        `).run(
          new Date().toISOString(),
          this.progress.totalJobs,
          this.progress.matched,
          JSON.stringify(errors),
          status,
          historyId
        );
      } catch (dbErr: any) {
        console.error('Failed to log reevaluation finish to database:', dbErr.message);
      }
    };

    // Initialize progress
    this.progress = {
      isScraping: true,
      phase: 'reevaluating',
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

    try {
      // 1. Get all jobs in DB
      const allJobs = db.prepare('SELECT id, job_id, platform, title, company, location, link, description FROM jobs').all() as any[];
      this.progress.totalJobs = allJobs.length;

      if (allJobs.length === 0) {
        this.progress.isScraping = false;
        this.progress.phase = 'done';
        finishHistory('completed', []);
        this.isRunning = false;
        return;
      }

      // Determine batch size (prioritize customBatchSize -> database config -> default 10)
      let BATCH_SIZE = 10;
      if (customBatchSize !== undefined && customBatchSize > 0) {
        BATCH_SIZE = customBatchSize;
      } else {
        const batchSizeRow = db.prepare("SELECT value FROM config WHERE key = 'batch_size'").get() as { value: string } | undefined;
        if (batchSizeRow) {
          const parsed = parseInt(batchSizeRow.value, 10);
          if (!isNaN(parsed) && parsed > 0) {
            BATCH_SIZE = parsed;
          }
        }
      }

      const updateStmt = db.prepare(`
        UPDATE jobs
        SET title = ?,
            company = ?,
            location = ?,
            parsed_json = ?,
            match_score = ?,
            match_pros = ?,
            match_cons = ?,
            match_justification = ?
        WHERE id = ?
      `);

      // Match in batches through the shared pipeline, updating rows as results arrive
      await matchJobsInBatches(
        allJobs,
        (j) => ({ title: j.title, company: j.company, description: j.description }),
        BATCH_SIZE,
        {
          onBatchStart: (offset, batch) => {
            this.progress.currentJobIndex = offset;
            this.progress.currentJobTitle = batch.map(j => j.title).join(', ');
          },
          onBatchError: (message) => {
            console.warn(`Reevaluation batch matching failed, falling back to individual:`, message);
            this.progress.errors++;
          },
          onItemError: (item, message) => {
            console.error(`Reevaluation individual fallback matching failed for job ${item.id}:`, message);
            this.progress.errors++;
          },
          onInvalidIndex: (index) => {
            console.warn(`Skipping reevaluation result with invalid or duplicate index: ${index}`);
            this.progress.errors++;
          },
          onResult: async (job, res) => {
            try {
              const finalTitle = res.parsedJob.title || job.title;
              const finalCompany = res.parsedJob.company || job.company;
              const finalLocation = res.parsedJob.location || job.location;
              const score = res.matchScore;
              const justification = res.justification;

              updateStmt.run(
                finalTitle,
                finalCompany,
                finalLocation,
                JSON.stringify(res.parsedJob),
                score,
                JSON.stringify(res.pros),
                JSON.stringify(res.cons),
                justification,
                job.id
              );

              this.progress.matched++;

              if (score >= config.MATCH_ALERT_THRESHOLD) {
                await dispatchAlert({
                  title: finalTitle,
                  company: finalCompany,
                  location: finalLocation,
                  link: job.link,
                  score,
                  justification,
                  reevaluated: true,
                });
              }
            } catch (saveError: any) {
              console.error(`Error saving reevaluated job ${job.id}:`, saveError.message);
              this.progress.errors++;
            }
          },
        },
      );

      this.progress.currentJobIndex = allJobs.length;
      this.progress.phase = 'done';
      this.progress.isScraping = false;
      finishHistory('completed', []);
    } catch (err: any) {
      console.error('Reevaluation failed:', err.message);
      this.progress.phase = 'done';
      this.progress.isScraping = false;
      finishHistory('failed', [`Fatal error: ${err.message}`]);
    } finally {
      this.isRunning = false;
    }
  }
}

// Export a singleton instance
export const schedulerService = new SchedulerService();
