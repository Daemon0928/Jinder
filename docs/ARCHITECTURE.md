# Jinder Architecture

## Overview

Jinder is a single-process Node.js/TypeScript application: an Express API server that owns a SQLite database, a background scheduler, three scrapers, and a Gemini-based matching pipeline. The React frontend is compiled to static files and served by the same process, so one container is the entire deployment.

## The scrape → match → alert flow

1. **Trigger** — the UI (`POST /api/scrape`), the scheduler tick, or `POST /api/scheduler/run-now`. The guard against concurrent runs lives in one place: `SchedulerService.tryStartManualScrape()` claims the run atomically before any async work.
2. **Search** (`src/scrapers/scraperManager.ts`) — the three scrapers run in parallel:
   - `profession.ts`: Axios + Cheerio over paginated search URLs, with a Playwright fallback when blocked.
   - `nofluffjobs.ts`: the JSON search API first, HTML crawl fallback.
   - `careerPages.ts`: resolves each target company's career page (cache → search engines), then extracts posting links with Gemini.
   - All Playwright usage shares **one Chromium instance per run** (`lib/browser.ts`); pages are opened and closed per navigation.
3. **Filter** — results are deduplicated in memory by `job_id`, then against the `jobs` table; exclude-keywords drop matches on title (before detail fetch) and description (after).
4. **Details** — fetched sequentially with a 1.5 s delay (politeness); HTTP calls retry with exponential backoff (`lib/retry.ts`).
5. **Match** (`src/matching/pipeline.ts`) — jobs are matched in configurable batches with a single Gemini call carrying the CV once. If the batch call fails or returns an incomplete set, the pipeline transparently falls back to per-job calls. Because the batch response indexes come from the LLM, they are **validated** (integer, in range, unique) before being used — an unvalidated index would attach scores to the wrong job.
6. **Persist + notify** — each valid result is saved (insert for scrapes, update for re-evaluations) and matches at or above `MATCH_ALERT_THRESHOLD` (default 80) fire a Discord webhook (`notify/discord.ts`).
7. **History** — every run (scrape *and* re-evaluation) writes a `scrape_history` row with counts and errors.

The same pipeline serves both the scrape flow and CV re-evaluation; only the persistence callback differs.

## Module map

```
src/
  config.ts            zod-validated environment (fail-fast), thresholds
  types.ts             shared domain types (ScrapedJob, MatchResult, …)
  server.ts            wiring: middleware, routers, static serve, shutdown
  routes/              jobs / config / scrape+scheduler REST handlers
  scheduler.ts         interval scheduling, run guards, re-evaluation, history
  scrapers/            per-source scrapers + orchestrating manager
  matching/pipeline.ts batch matching with fallback + LLM-output validation
  matcher/gemini.ts    Gemini calls (summarize, match, batch match, link extraction)
  notify/discord.ts    webhook alerts
  middleware/auth.ts   optional bearer-token auth
  lib/                 browser (shared Chromium), retry, urlSafety (SSRF),
                       locations (unified per-platform mapping), logger, constants
  db/database.ts       better-sqlite3 + PRAGMA user_version migrations
```

## Design decisions

**SQLite via better-sqlite3.** Single-user, single-process, write volumes measured in rows per scrape — a client/server database would add operational cost for zero benefit. Synchronous queries keep the request handlers simple; WAL mode covers the concurrent-read case. Migrations are plain versioned functions gated by `PRAGMA user_version` — no ORM, no migration framework.

**LLM output is untrusted input.** Structured output (JSON schema) constrains the shape, but not the semantics: the batch matcher's `index` fields are validated for range and uniqueness, scores are integers by schema, and a failed/short batch falls back to individual calls rather than guessing alignment.

**Scraping politeness and resilience.** Sequential detail fetches with delays, randomized user agents, retry with jitter for transient failures, and a hard page cap per source. Search-engine discovery is best-effort with multiple engines. Where a site blocks HTTP clients, Playwright renders the page instead.

**SSRF containment.** Users can point the career-page scraper at arbitrary URLs, which a headless browser then opens. `lib/urlSafety.ts` therefore rejects non-HTTP schemes and any host resolving to loopback/private/link-local/CGNAT ranges before navigation (relaxed under `NODE_ENV=test` for the localhost mock server).

**Secrets stay server-side.** The Discord webhook is stored in SQLite but never echoed by the API — `GET /api/config` returns a masked tail, and the config writer ignores masked values so UI round-trips can't clobber the stored URL.

## Testing strategy

- **Unit** (vitest, `tests/unit/`): pure logic — SSRF matrix, location mapping invariants, retry semantics, and adversarial pipeline inputs (duplicate/out-of-range LLM indexes, fallback paths) with the Gemini module mocked.
- **E2E** (`tests/e2e/`): a mock upstream server simulates both job portals, search engines, and captures webhooks; `MOCK_GEMINI=true` makes the matcher deterministic. The runner spawns the real server, drives it over HTTP, and asserts on responses, database state, and webhook payloads — 71 cases covering happy paths, malformed input, upstream failures, scheduler behavior, and endpoint hardening.
- **CI** runs typecheck, type-aware lint, both builds, all tests, and a Docker image build.
