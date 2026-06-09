# Task Request for Worker (E2E-M1.2) - Try 2

Your task is to implement the E2E testing infrastructure, mocks, and code routing for Jinder.

## Objective
Implement:
1. Environmental routing in existing files:
   - `src/db/database.ts` (route `DB_FILE` to `process.env.DB_FILE` or fallback to `jobs.db`)
   - `src/scrapers/profession.ts` (route profession.hu URLs to `process.env.PROFESSION_BASE_URL` or fallback)
   - `src/scrapers/nofluffjobs.ts` (route nofluffjobs.com URLs to `process.env.NOFLUFF_BASE_URL` or fallback)
   - `src/matcher/gemini.ts` (mock CV summarization and matching if `process.env.MOCK_GEMINI === 'true'`)
2. Local mock HTTP server `tests/e2e/mock-server.ts` to mock Profession, NoFluffJobs search and detail endpoints, and capture Discord webhooks.
3. Test database helper `tests/e2e/database-helper.ts`.
4. Test cases list `tests/e2e/test-cases.ts` for the 60+ tests.
5. Test runner harness `tests/e2e/run-tests.ts` to coordinate setting env vars, booting mock server, initializing DB, running test cases, verifying outputs, and shutting down.
6. Documentation `TEST_INFRA.md` in the project root.
7. Update `package.json` to expose `"test:e2e": "tsx tests/e2e/run-tests.ts"`.

## Mandatory Guidelines
- Do not hardcode test results.
- Implement genuine test verification logic.
- Ensure type compliance and clean compilation.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-06-05T17:05:09Z
Resume and implement the E2E testing infrastructure for milestone E2E-M1 (M1.2: Implement Infra & Mocks).
Your working directory is C:\Users\mark2\repos\Jinder\.agents\worker_e2em1.2_gen2_try2.

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
