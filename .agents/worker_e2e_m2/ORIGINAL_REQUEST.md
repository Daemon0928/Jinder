## 2026-06-05T17:04:54Z
You are the E2E Test Suite Implementer (worker_e2e_m2).
Your working directory is: C:\Users\mark2\repos\Jinder\.agents\worker_e2e_m2.
Your parent is: E2E Testing Sub-orchestrator (Conv ID: 4178ed0e-5729-4195-92a2-0afe94650aad).
Your task is to design, implement, and verify the E2E Testing Track for nofluffjobs.com/hu.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Key Requirements:
1. Configure Environment Routing:
   - Modify src/db/database.ts to check for process.env.DB_FILE first, e.g.:
     const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), 'jobs.db');
   - Modify src/scrapers/profession.ts to support process.env.PROFESSION_BASE_URL (default: 'https://www.profession.hu') and replace the hardcoded domains.
   - Modify src/scrapers/nofluffjobs.ts to support process.env.NOFLUFF_BASE_URL (default: 'https://nofluffjobs.com') and replace the hardcoded domains.
   - Modify src/matcher/gemini.ts: if process.env.MOCK_GEMINI === 'true', bypass actual Gemini calls and fetch mocks from the mock server (or fall back to deterministic mocks):
     - For matchJobWithGemini: POST http://localhost:5001/api/mock/gemini with job details.
     - For summarizeCv: POST http://localhost:5001/api/mock/gemini-summarize with raw CV text.

2. Create TEST_INFRA.md in project root:
   - Detail the features under test (F1-F5), testing philosophy, 4-tier test case mapping, command execution, and test file locations.

3. Create the E2E Test Harness under tests/e2e/:
   - tests/e2e/database-helper.ts: DB init/seed/reset helper.
   - tests/e2e/mock-server.ts: Express server listening on port 5001. centralize mock endpoints for No Fluff Jobs (API + HTML web crawl), Profession.hu (HTML web crawl), Discord webhooks, Gemini mock queries, and received-webhook queue. Expose a POST /api/test/set-mock-rules endpoint to dynamically change mock behaviors for the active test case.
   - tests/e2e/test-cases.ts: Implement or programmatically generate 60+ test cases across the 4 tiers:
     - Tier 1: Feature Coverage (25+ tests)
     - Tier 2: Boundary & Corner (25+ tests)
     - Tier 3: Cross-Feature (5+ tests)
     - Tier 4: Real-World Scenarios (5+ tests)
   - tests/e2e/run-tests.ts: Boot the mock server, set env variables, spawn the main app server (using tsx on src/server.ts), wait for the app to be responsive, and run each test case. Clean and re-seed the test database and mock server rules before each test. Run detailed assertions, capture results, and print a test report. Shut down all processes. Exit with the number of failures.

4. Verify that the E2E test suite compiles and runs using:
   npx tsx tests/e2e/run-tests.ts
   Ensure that tests run and report status (any failing tests due to scraperManager integration not being complete yet are normal, but verify that the runner itself executes successfully and reports them).

5. Create TEST_READY.md in the project root:
   - Provide the E2E test runner command, feature checklists, and count summaries.

When done, write a handoff report in your working directory (.agents/worker_e2e_m2/handoff.md) and send a message back to me.
