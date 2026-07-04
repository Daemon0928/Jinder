/** Shared domain types — single source of truth for scraper/matcher/DB shapes. */

/** A job listing as returned by any scraper's search phase. */
export interface ScrapedJob {
  job_id: string;
  platform: string;
  title: string;
  company: string;
  location: string;
  link: string;
  rawText: string;
}

/** Structured details Gemini extracts from a posting. */
export interface ParsedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  techStack: string[];
  salary: string;
}

/** Result of matching one job against the CV. */
export interface MatchResult {
  matchScore: number;
  pros: string[];
  cons: string[];
  justification: string;
  parsedJob: ParsedJob;
}

export interface BatchMatchInput {
  title: string;
  company: string;
  description: string;
}

/** Batch results carry the 0-based index of the input they refer to. */
export interface BatchMatchResult extends MatchResult {
  index: number;
}

/** A row of the `jobs` table. */
export interface JobRow {
  id: number;
  job_id: string;
  platform: string;
  title: string;
  company: string;
  location: string | null;
  link: string;
  description: string;
  parsed_json: string | null;
  match_score: number;
  match_pros: string | null;
  match_cons: string | null;
  match_justification: string | null;
  status: string;
  created_at: string;
}

export interface ScrapeReport {
  scrapedCount: number;
  newJobsCount: number;
  matchedCount: number;
  errors: string[];
}

export interface ScrapeProgress {
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

export type ProgressCallback = (progress: Partial<ScrapeProgress>) => void;
