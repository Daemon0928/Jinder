# Scope: Implementation Track (Gen 4 Replacement)

## Architecture
- Implementation Track builds the features according to specifications in `PROJECT.md` and `ORIGINAL_REQUEST.md`.
- Works on:
  - `src/scrapers/nofluffjobs.ts`
  - `src/scrapers/scraperManager.ts`
  - Database schema/logic, location mapping, duplicates prevention.
  - Matching using existing Gemini API, triggering Discord webhook on match score >= 80%.
  - Verifying against test suites.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| IMP-M1 | No Fluff Jobs Scraper | Develop `src/scrapers/nofluffjobs.ts` for search results and detail page scraping with fallbacks. | None | DONE |
| IMP-M2 | Scraper Manager & DB Integration | Integrate `nofluffjobs` into `scraperManager.ts`, manage location mapping, SQLite saving, duplicates prevention. | IMP-M1 | PLANNED |
| IMP-M3 | Gemini & Webhook Verification | Verify that scraped jobs are matched via Gemini and high scores trigger Discord Webhooks. | IMP-M2 | PLANNED |
| IMP-M4 | E2E Integration and Hardening | Pass 100% of the E2E test suite (Tiers 1-4) and adversarial coverage hardening (Tier 5). | IMP-M3 | PLANNED |

## Interface Contracts
- `scrapeNoFluffJobs(keyword: string, locations?: string[]): Promise<ScrapedJob[]>` in `src/scrapers/nofluffjobs.ts`.
- `runScraper` must run both scrapers when triggered.
