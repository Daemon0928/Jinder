/** API response shapes shared across the app. */

export interface ParsedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  techStack: string[];
  salary: string;
}

export type JobStatus = 'new' | 'interested' | 'applied' | 'interview' | 'offer' | 'rejected';

/** Pipeline stages in funnel order — mirrors JOB_STATUSES on the backend. */
export const JOB_STATUSES: JobStatus[] = [
  'new',
  'interested',
  'applied',
  'interview',
  'offer',
  'rejected',
];

export const STATUS_LABELS: Record<JobStatus, string> = {
  new: 'New',
  interested: 'Interested',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
};

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
  /** Free-text notes attached on the application board. */
  notes: string | null;
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
  email: EmailConfig;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  /** Whether a password is stored (the secret itself is never returned). */
  smtpPassSet: boolean;
  from: string;
  to: string;
  /** Only sent on save when the user types a new password. */
  smtpPass?: string;
}

export interface DigestJob {
  title: string;
  company: string;
  location: string;
  link: string;
  score: number;
  justification: string;
}

export interface DigestPreview {
  jobs: DigestJob[];
  periodDays: number;
  generatedAt: string;
}

export interface DigestStatus {
  enabled: boolean;
  intervalDays: number;
  minScore: number;
  maxJobs: number;
  channels: string[];
  lastSentAt: string | null;
  nextRunAt: string | null;
  pendingCount: number;
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

export interface AnalyticsData {
  totals: { jobs: number; scored: number; highMatches: number; avgScore: number | null };
  scoreHistogram: Array<{ bucket: string; count: number }>;
  platforms: Array<{ platform: string; count: number; avgScore: number | null }>;
  statusCounts: Array<{ status: string; count: number }>;
  topCompanies: Array<{ company: string; count: number; avgScore: number | null }>;
  runs: Array<{
    startedAt: string;
    trigger: string;
    totalScraped: number;
    newJobs: number;
    matched: number;
    status: string;
  }>;
}

export interface CvUploadResult {
  success: boolean;
  filename: string;
  extractedLength: number;
  preview: string;
  summary: string | null;
}
