## 2026-06-06T19:30:09Z
You are Worker for Milestone IMP-M2.
Your working directory is C:\Users\mark2\repos\Jinder\.agents\worker_impm2_gen3\.
Your task is to implement the integration of the No Fluff Jobs scraper into `src/scrapers/scraperManager.ts` and ensure correct DB insertion and deduplication as outlined in the design guidelines.

Read:
- PROJECT.md (root)
- C:\Users\mark2\repos\Jinder\.agents\sub_orch_implementation_gen3\SCOPE.md (milestone details)
- C:\Users\mark2\repos\Jinder\.agents\explorer_impm2_gen3_3\handoff.md (explorer handoff report)
- src/scrapers/nofluffjobs.ts
- src/scrapers/scraperManager.ts

Implement the changes in `src/scrapers/scraperManager.ts`:
1. Use aliased imports to import both scrapers and their detail scraping functions without conflict.
2. In `runScraper`:
   - Fetch the location settings from the database and normalize them to lowercase.
   - Run both `scrapeProfessionHu` and `scrapeNoFluffJobs` (parallel run using `Promise.all` with individual `try-catch` blocks is recommended).
   - Combine the scraped jobs and deduplicate them in-memory using a Map keyed by `job_id`.
   - Update `report.scrapedCount` to represent the total unique scraped jobs.
   - In the job processing loop, call `scrapeJobDetails` dynamically based on the job's `platform` value (i.e. if `profession` use `scrapeProfessionDetails`, if `nofluffjobs` use `scrapeNoFluffDetails`).
3. Run the build command (`npm run build` or similar compile step) to verify compilation.
4. Run existing test scripts to ensure there are no regressions.
5. Write your implementation report to C:\Users\mark2\repos\Jinder\.agents\worker_impm2_gen3\handoff.md containing the changes made, the exact build/test commands executed, and their outcomes.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Send a message to your parent conversation ID (190c1049-3d55-4a2b-b434-5ff1642646ac) when done.
