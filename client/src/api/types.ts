/** API response shapes shared across the app. */

export interface ParsedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  techStack: string[];
  salary: string;
}

export type JobStatus = 'new' | 'bookmarked' | 'applied' | 'rejected';

export interface Job {
  id: number;
  job_id: string;
  platform: string;
  title: string;
  company: string;
  location: string;
  link: string;
  description: string;
  parsed_json: ParsedJob | null;
  match_score: number;
  match_pros: string[];
  match_cons: string[];
  match_justification: string;
  status: JobStatus;
  created_at: string;
  /** Shared by listings of the same role scraped from different platforms. */
  dedupe_key: string | null;
}

export interface ScrapeProgress {
  isScraping: boolean;
  phase: 'searching' | 'fetching' | 'matching' | 'saving' | 'done' | 'reevaluating';
  currentJobIndex: number;
  totalJobs: number;
  currentJobTitle: string;
  currentKeyword: string;
  keywordIndex: number;
  totalKeywords: number;
  newJobs: number;
  matched: number;
  skipped: number;
  errors: number;
}

export const defaultProgress: ScrapeProgress = {
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

export interface AppConfig {
  cv: string;
  keywords: string[];
  excludeKeywords: string[];
  cvFilename: string | null;
  cvSummary: string | null;
  /** Masked tail of the stored webhook (never the full secret). */
  discordWebhook: string;
  discordWebhookSet: boolean;
  locations: string[];
  companies: string[];
  batchSize: number;
}

export interface SchedulerSummary {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  totalScraped: number;
  newJobs: number;
  matched: number;
  errors: string[];
  status: string;
}

export interface SchedulerStatus {
  enabled: boolean;
  intervalHours: number;
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunSummary: SchedulerSummary | null;
}

export interface CvUploadResult {
  success: boolean;
  filename: string;
  extractedLength: number;
  preview: string;
  summary: string | null;
}
