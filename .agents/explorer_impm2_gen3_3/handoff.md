# Handoff Report — No Fluff Jobs Scraper Integration

## 1. Observation

* **Scraper Module 1: No Fluff Jobs (`src/scrapers/nofluffjobs.ts`)**
  * Line 5-13: Exports `interface ScrapedJob`
  * Line 27-35: Defines `LOCATION_MAP` for location normalization
  * Line 51: Exports `async function scrapeNoFluffJobs(keyword: string, locations?: string[]): Promise<ScrapedJob[]>`
  * Line 223: Exports `async function scrapeJobDetails(link: string): Promise<string>`

* **Scraper Module 2: Profession.hu (`src/scrapers/profession.ts`)**
  * Line 7-15: Exports `interface ScrapedJob`
  * Line 34-57: Defines `LOCATION_MAP` mapping keys to ID/slugs
  * Line 59: Exports `async function scrapeProfessionHu(keyword: string, locations?: string[]): Promise<ScrapedJob[]>`
  * Line 67: Mapped locations lookup is `const locInfo = LOCATION_MAP[locKey];` (expects lowercase input key but does not perform normalization)
  * Line 179: Exports `async function scrapeJobDetails(url: string): Promise<string>`

* **Scraper Manager (`src/scrapers/scraperManager.ts`)**
  * Line 2: Imports scraper functions: `import { scrapeProfessionHu, scrapeJobDetails } from './profession';`
  * Line 46-47: Retrieves configured locations:
    ```typescript
    const locRow = db.prepare("SELECT value FROM config WHERE key = 'locations'").get() as { value: string } | undefined;
    const locations: string[] = locRow ? JSON.parse(locRow.value) : [];
    ```
  * Line 49: Invokes Profession scraper:
    ```typescript
    const jobs = await scrapeProfessionHu(keyword, locations);
    ```
  * Line 85: Invokes details scraping:
    ```typescript
    const detailText = await scrapeJobDetails(job.link);
    ```

* **Database Module (`src/db/database.ts`)**
  * Line 17-34: Defines the `jobs` table schema:
    ```typescript
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT UNIQUE NOT NULL,
      platform TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      link TEXT NOT NULL,
      description TEXT NOT NULL,
      parsed_json TEXT,
      match_score INTEGER DEFAULT -1,
      match_pros TEXT,
      match_cons TEXT,
      match_justification TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
    ```

---

## 2. Logic Chain

1. **Avoiding Import Naming Conflicts**:
   Both `src/scrapers/profession.ts` and `src/scrapers/nofluffjobs.ts` export identical names (`ScrapedJob` and `scrapeJobDetails`). Direct import would cause name collisions in TypeScript. We must use aliasing:
   ```typescript
   import {
     scrapeProfessionHu,
     scrapeJobDetails as scrapeProfessionDetails,
     ScrapedJob as ProfessionScrapedJob
   } from './profession';
   import {
     scrapeNoFluffJobs,
     scrapeJobDetails as scrapeNoFluffDetails,
     ScrapedJob as NoFluffScrapedJob
   } from './nofluffjobs';
   ```
   To handle type safety cleanly, a union type `type UnifiedScrapedJob = ProfessionScrapedJob | NoFluffScrapedJob` can be defined and used.

2. **Parallel/Sequential Scraper Execution & Error Handling**:
   Running scrapers in parallel is faster, but sequential is also possible. To prevent a failure of one scraper from stopping the other, we must wrap each invocation in an independent `try/catch` block.
   * *Parallel approach (Recommended)*:
     ```typescript
     let professionJobs: ProfessionScrapedJob[] = [];
     let noFluffJobs: NoFluffScrapedJob[] = [];

     await Promise.all([
       (async () => {
         try {
           professionJobs = await scrapeProfessionHu(keyword, locations);
         } catch (err: any) {
           const errMsg = `Profession.hu scraper failed: ${err.message}`;
           console.error(errMsg);
           report.errors.push(errMsg);
         }
       })(),
       (async () => {
         try {
           noFluffJobs = await scrapeNoFluffJobs(keyword, locations);
         } catch (err: any) {
           const errMsg = `No Fluff Jobs scraper failed: ${err.message}`;
           console.error(errMsg);
           report.errors.push(errMsg);
         }
       })()
     ]);
     ```

3. **Location Normalization & Mapping**:
   In `profession.ts`, `LOCATION_MAP` keys are lowercase, but the scraper performs lookup with `LOCATION_MAP[locKey]` without lowercasing. If a user configures a location with capital letters, `profession.ts` fails to find it. In `nofluffjobs.ts`, mapping lowercases the values. To guarantee both scrapers match successfully, the manager must lowercase all location inputs:
   ```typescript
   const locations: string[] = locRow ? JSON.parse(locRow.value).map((l: string) => l.toLowerCase()) : [];
   ```

4. **In-Memory Deduplication**:
   If both scrapers find the same job or duplicate listings are retrieved, they must be deduplicated by `job_id` before processing to avoid redundant work:
   ```typescript
   const mergedJobs = [...professionJobs, ...noFluffJobs];
   const uniqueJobsMap = new Map<string, UnifiedScrapedJob>();
   for (const job of mergedJobs) {
     if (!uniqueJobsMap.has(job.job_id)) {
       uniqueJobsMap.set(job.job_id, job);
     }
   }
   const jobs = Array.from(uniqueJobsMap.values());
   ```

5. **Dynamic Details Call by Job Platform**:
   The detail scraper should be called dynamically using the `job.platform` property:
   ```typescript
   let detailText = '';
   if (job.platform === 'profession') {
     detailText = await scrapeProfessionDetails(job.link);
   } else if (job.platform === 'nofluffjobs') {
     detailText = await scrapeNoFluffDetails(job.link);
   } else {
     console.warn(`Unsupported job platform: ${job.platform}`);
     continue;
   }
   ```

6. **SQLite Schema Compatibility**:
   The `jobs` table schema defines:
   - `job_id` (`TEXT UNIQUE`): Compatibility verified. `nofluffjobs-${slug}` and `profession-${id}` are distinct unique strings.
   - `platform` (`TEXT`): Holds `'nofluffjobs'` or `'profession'`.
   - `title`, `company`, `location`, `link`, `description` (holds `detailText`): All strings, compatible.
   No database migrations or column modifications are required.

---

## 3. Caveats

- **Concurrency Load**: Running both Playwright-backed scrapers in parallel may launch multiple headless chromium browser instances, increasing peak CPU/memory. If resource usage becomes an issue, sequential execution with try/catch is a safer alternative.
- **Unmapped Locations**: Any location name not defined in the scraper's internal maps (`LOCATION_MAP`) will be skipped by that scraper. Lowercasing helps but doesn't solve missing mappings (e.g. `narnia`).

---

## 4. Conclusion

Integrating No Fluff Jobs into the `scraperManager` can be achieved by:
1. Aliasing the imported types and functions to prevent naming conflicts.
2. Normalizing location tags to lowercase.
3. Fetching listings from both scrapers using parallel or sequential execution inside independent `try/catch` handlers.
4. Deduplicating the combined list of jobs using a `Map` keyed by `job_id`.
5. Delegating the detail scraping to the correct scraper helper depending on the `job.platform` property.

No database changes are needed since the existing columns and statements accommodate the `nofluffjobs` structure out-of-the-box.

---

## 5. Verification Method

- **Compilation Verification**:
  Run `npm run build` to ensure the project compiles with no TypeScript errors.
- **Functional Scraper Verification**:
  Execute `npx tsx test-nofluff.ts` and `npx tsx test-nofluff-adversarial.ts` to verify the scraper's direct functionality.
- **Integration Verification**:
  1. Once integrated, start the server (`npm run dev`) and trigger the scraping endpoint (`POST /api/scrape` with target keywords).
  2. Inspect the console logs to confirm details are fetched for both platforms.
  3. Verify that `jobs.db` has been updated and contains records with the `platform` column set to `'nofluffjobs'`.
