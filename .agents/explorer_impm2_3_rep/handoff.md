# Handoff Report: No Fluff Jobs Integration Analysis

## 1. Observation
*   **Module Exports**:
    *   `src/scrapers/nofluffjobs.ts` exports `scrapeNoFluffJobs(keyword: string, locations?: string[])` (line 49) and `scrapeJobDetails(link: string)` (line 221).
    *   `src/scrapers/profession.ts` exports `scrapeProfessionHu(keyword: string, locations?: string[])` (line 59) and `scrapeJobDetails(url: string)` (line 179).
*   **Database Schema**:
    *   `src/db/database.ts` (lines 17-34) defines the `jobs` table:
        ```sql
        CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT UNIQUE NOT NULL,
          platform TEXT NOT NULL,
          ...
        )
        ```
*   **Current Manager Logic**:
    *   `src/scrapers/scraperManager.ts` (lines 45-49) retrieves locations from `config`:
        ```typescript
        const locRow = db.prepare("SELECT value FROM config WHERE key = 'locations'").get() as { value: string } | undefined;
        const locations: string[] = locRow ? JSON.parse(locRow.value) : [];
        const jobs = await scrapeProfessionHu(keyword, locations);
        ```
    *   `src/scrapers/scraperManager.ts` (line 85) calls `scrapeJobDetails(job.link)` directly from the `./profession` import.

## 2. Logic Chain
1.  **Name Collision Resolution**: Because both `./profession` and `./nofluffjobs` export `scrapeJobDetails`, they must be imported with distinct aliases (e.g., `scrapeProfessionDetails` and `scrapeNoFluffDetails`) in `scraperManager.ts`.
2.  **Location Normalization**: Both scrapers possess an internal `LOCATION_MAP` that handles standard lowercase keys (e.g. `budapest`, `pecs`, `tavmunka`). To prevent issues from malformed settings, `scraperManager.ts` should normalize the config entries to lowercase via `.map(loc => loc.toLowerCase())` and pass them directly.
3.  **Concurrency and Error Isolation**: Running scrapers in parallel using `Promise.allSettled` is faster and ensures that if one platform fails (due to connection errors, rate-limiting, or CAPTCHA), the other platform's results are still processed.
4.  **Platform Dispatching**: In the job processing loop, detail fetching must be dynamically routed based on the `job.platform` property (i.e. using `scrapeNoFluffDetails` for `'nofluffjobs'` and `scrapeProfessionDetails` for `'profession'`) to ensure that the correct parser runs.
5.  **Database Compatibility**: The `job_id` values are prefixed with `profession-` and `nofluffjobs-` respectively, preventing collisions in the SQLite `jobs` table. The existing table is already fully compatible with the new platform records.

## 3. Caveats
*   Assumes user-configured locations mapped to the config table are matching the lowercase keys defined in both scraper modules (which they currently do).
*   Assumes network access in runtime is configured such that API requests to both platforms are permitted (our CODE_ONLY network restriction only applies to the investigator agent environment).

## 4. Conclusion
Integrating No Fluff Jobs into Jinder is simple, safe, and does not require database migration. The scraper manager `runScraper` function should be refactored to perform concurrent searches, deduplicate by job ID, and dynamically fetch details based on the job platform.

## 5. Verification Method
*   **Unit/Integration Test Execution**: Verify that `test-nofluff.ts` in the project root can be executed successfully using:
    ```bash
    npx ts-node test-nofluff.ts
    ```
*   **Compilation Verification**: After implementing the proposed changes in `scraperManager.ts`, verify that the project compiles cleanly using:
    ```bash
    npx tsc --noEmit
    ```
