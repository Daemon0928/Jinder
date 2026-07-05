/** Scraping constants shared by all scrapers. */

export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Delay between sequential job-detail fetches (polite scraping). */
export const DETAIL_FETCH_DELAY_MS = 1500;
/** Delay between search result pages of the same site. */
export const SEARCH_PAGE_DELAY_MS = 1000;
/** Delay before hitting a search engine for career-page discovery. */
export const SEARCH_ENGINE_DELAY_MS = 2500;
/** Max search result pages fetched per site per keyword. */
export const MAX_SEARCH_PAGES = 3;

/** Discord embed sidebar color (blurple). */
export const DISCORD_EMBED_COLOR = 3447003;

/**
 * Application-pipeline stages, in funnel order. A job starts at `new` and moves
 * through the board as the user acts on it. This is the single source of truth
 * for valid `status` values — the API validates against it and the board renders
 * one column per entry.
 */
export const JOB_STATUSES = [
  'new',
  'interested',
  'applied',
  'interview',
  'offer',
  'rejected',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
