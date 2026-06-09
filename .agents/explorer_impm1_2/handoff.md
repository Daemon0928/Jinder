# Handoff Report - No Fluff Jobs Scraper Analysis (IMP-M1)

This report details the findings and implementation plan for the No Fluff Jobs scraper module (`src/scrapers/nofluffjobs.ts`).

## 1. Observation
* **File Structure**: `src/scrapers/profession.ts` exports:
  * `export interface ScrapedJob { job_id: string; platform: string; title: string; company: string; location: string; link: string; rawText: string; }` (lines 5-13)
  * `export async function scrapeProfessionHu(keyword: string, locations?: string[]): Promise<ScrapedJob[]>` (line 57)
  * `export async function scrapeJobDetails(url: string): Promise<string>` (line 177)
* **Dual-Fetch Pattern**: In `src/scrapers/profession.ts`, Axios is tried first (lines 85-92), and if it fails/gets blocked, Playwright (chromium) is launched as a fallback (lines 97-112).
* **Database Compatibility**: `src/db/database.ts` creates the `jobs` table (lines 17-34) requiring fields: `job_id` (unique), `platform`, `title`, `company`, `location`, `link`, `description`, etc.
* **API Details**: As specified in `PROJECT.md` (lines 8-9) and `ORIGINAL_REQUEST.md` (lines 15-23), the No Fluff Jobs search uses `POST https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month` and details use `GET https://nofluffjobs.com/api/posting/<slug>`.

## 2. Logic Chain
1. To ensure integration with `scraperManager.ts` and compatibility with the SQLite database schema, `src/scrapers/nofluffjobs.ts` must export `scrapeNoFluffJobs` and `scrapeJobDetails` matching the exact signature and output format of `profession.ts`.
2. The scraper must first perform a JSON API call for search. If this returns empty or gets blocked, it must fall back to crawling `https://nofluffjobs.com/hu/jobs/<city>?q=<keyword>` via Playwright.
3. The slug needed for the detail endpoint must be parsed from the search JSON response (as `posting.slug`) or extracted from the anchor `href` matching `/job/([^/?#]+)` on the fallback HTML results.
4. When calling `GET https://nofluffjobs.com/api/posting/<slug>`, we must extract and format `requirements.musts`, `requirements.nices`, `specs.dailyTasks`, and `requirements.description` into a single markdown text block so it can be stored in the SQLite `description` field for Gemini evaluation.
5. If the detail JSON API fails, it must fall back to cleaning the user-facing HTML page text using Cheerio.

## 3. Caveats
* **Network Restrictions**: Due to CODE_ONLY network mode, the actual endpoints were not queryable in real-time during this analysis. The API response payloads were modeled based on the specifications in `PROJECT.md` and standard No Fluff Jobs public interfaces.
* **API Invalidation**: If No Fluff Jobs modifies its internal API JSON payload schemas, the parser logic (specifically the nested properties in search and details) will need updating.

## 4. Conclusion
The implementation of `src/scrapers/nofluffjobs.ts` is fully defined and ready to proceed. By employing the dual-fetch strategy and robust JSON extraction/HTML parsing helpers, the scraper will achieve high reliability and clean data output.

## 5. Verification Method
1. **Typescript compilation**: Run `npm run build` or `npx tsc` to verify there are no TypeScript compiler errors.
2. **Scraper test script**: Run `npx tsx test-nofluff.ts` (a new test file to be created) to verify that `scrapeNoFluffJobs("react", ["budapest"])` returns valid job records and that `scrapeJobDetails(<link>)` successfully formats job details.
3. **Database Insertion**: Verify that job records are successfully inserted into `jobs.db` with `platform = 'nofluffjobs'` and unique `job_id` prefixed with `nofluffjobs-`.
