## 2026-06-06T19:31:28Z
Resume and implement the E2E testing infrastructure for milestone E2E-M1 (M1.2: Implement Infra & Mocks).
Your working directory is C:\Users\mark2\repos\Jinder\.agents\worker_e2em1.2_gen2_try5.

Detailed requirements:
1. Environment Routing in existing code:
   - `src/db/database.ts`: Allow routing DB_FILE to process.env.DB_FILE or fallback. Note that the SQLite database is instantiated at module load time, so the DB_FILE env variable must be set before this module is loaded.
   - `src/scrapers/profession.ts`: Introduce PROFESSION_BASE_URL (defaulting to https://www.profession.hu) and replace all hardcoded search/details URLs with variables using this base url.
   - `src/scrapers/nofluffjobs.ts`: Introduce NOFLUFF_BASE_URL (defaulting to https://nofluffjobs.com) and replace all hardcoded search/details/page crawl URLs with variables using this base url.
   - `src/matcher/gemini.ts`: Bypass models.generateContent if process.env.MOCK_GEMINI === 'true'.
     - For summarizeCv: return a deterministic markdown summary of key skills, summary, education.
     - For matchJobWithGemini: return a match score and details. If the job title contains (Score: XX), parse and return that XX score; otherwise if the title includes 'typescript', 'react', or 'senior' return 85, else return 45. Include mock justification, pros, cons, and parsedJob.

2. Mocks and Test Harness under `tests/e2e/`:
   - Create `tests/e2e/mock-server.ts`:
     - Run an Express server listening on port 5001.
     - Handle `POST /api/search/posting` (No Fluff API search): return postings matching query.
     - Handle `GET /api/posting/:slug` (No Fluff API details): return JSON posting requirements/specs.
     - Handle HTML scraping pages:
       - No Fluff Search HTML: `/hu/jobs/:city` and `/hu/jobs/all` returning a list of job links.
       - No Fluff Detail HTML: `/hu/job/:slug` returning cheerio-extractable job page text.
       - Profession Search HTML: `/allasok/...` returning job card lists.
       - Profession Detail HTML: `/allas/:slug` returning cheerio-extractable job description text.
     - Handle Discord webhook captures:
       - `POST /webhook/discord`: capture payloads.
       - `GET /api/test/received-webhooks`: retrieve list of captured webhooks.
       - `POST /api/test/clear-webhooks`: clear captured webhook list.
   - Create `tests/e2e/database-helper.ts`:
     - Provide setup, seed (insert config rows, mock CV, target locations/keywords, Discord webhook URL C:\Users\mark2\repos\Jinder\tests\e2e\database-helper.ts), and teardown.
   - Create `tests/e2e/test-cases.ts`:
     - Enumerate / structure a large set of test cases across the 4 Tiers (Feature coverage, Boundary/corner cases, Cross-feature interactions, and Real-world application workflows) up to 60+ cases if feasible.
   - Create `tests/e2e/run-tests.ts`:
     - Start mock server.
     - For each test case in `test-cases.ts`:
       - Clean and initialize test database (`jobs.test.db`).
       - Seed initial config data.
       - Run scraper manager or individual components (e.g. by importing and calling runScraper).
       - Verify assertions (assert on DB entries, captured webhooks, status callbacks, or exit codes).
     - Shutdown mock server.
     - Exit with 0 if all tests pass, non-zero otherwise.

3. Update `package.json`:
   - Add `"test:e2e": "tsx tests/e2e/run-tests.ts"` under scripts.

4. Create `TEST_INFRA.md` in the project root documenting:
   - Command to run E2E suite.
   - Structure of test cases.
   - Mock HTTP server endpoints and sandbox database configuration.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please execute the implementation, run verification checks (compiling and executing the test script to make sure it runs offline successfully and cleanly), and write your handoff report to C:\Users\mark2\repos\Jinder\.agents\worker_e2em1.2_gen2_try5\handoff.md.
When done, send a message to Jinder E2E-M1 Milestone Sub-orchestrator (Replacement, Gen 2).
