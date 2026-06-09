## 2026-06-05T16:01:38Z
You are a worker agent (teamwork_preview_worker).
Your working directory is C:\Users\mark2\repos\Jinder\.agents\worker_e2em1.2.
Your parent is Jinder E2E-M1 Milestone Sub-orchestrator (Conversation ID: 8e2a9fcf-0b04-448a-88eb-1b99fda9d071).
Your task is to implement the E2E testing infrastructure and mock setups for the No Fluff Jobs integration.
Specifically, you must:
1. Support configurable base URLs for scrapers:
   - In `src/scrapers/nofluffjobs.ts` and `src/scrapers/profession.ts`, read the base URLs from environment variables (e.g. `process.env.NOFLUFF_BASE_URL` and `process.env.PROFESSION_BASE_URL`), defaulting to the real domains if not set.
2. Support database sandboxing:
   - In `src/db/database.ts`, support choosing a different SQLite database path using the `process.env.DB_FILE` environment variable (defaulting to the regular `jobs.db`).
3. Support Gemini API Mocking:
   - In `src/matcher/gemini.ts`, add a check for `process.env.MOCK_GEMINI === 'true'`. If set, mock the API responses for `summarizeCv` or matching logic so they return deterministic values without calling external APIs.
4. Implement the E2E Test Suite in the `tests/e2e/` folder:
   - `tests/e2e/mock-server.ts`: An Express mock HTTP server that runs on a port (e.g., `5001`). It must mimic the No Fluff Jobs search/post endpoints (based on the specifications in ORIGINAL_REQUEST.md), Profession.hu endpoints, and capture Discord webhooks.
   - `tests/e2e/test-cases.ts`: A structured list of test cases (at least ~60 tests across Tier 1 Feature Coverage, Tier 2 Boundary/Corner, Tier 3 Cross-Feature, and Tier 4 Real-World Application scenarios, as defined in Project Pattern - Dual Track).
   - `tests/e2e/run-tests.ts`: A script to initialize the test DB (`jobs.test.db`), boot the mock server, run the test cases by triggering scrapers/managers with mock environment variables, assert the results in DB/webhooks, clean up, and exit with code 0 if all pass, non-zero otherwise.
5. Create `TEST_INFRA.md` in the project root containing:
   - Test suite configuration and how to run it.
   - Coverage checklist (Tiers 1-4).
   - Mock data templates.
6. Verify your changes: compile/run TypeScript checks and verify the test harness is compilable.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

When done, write your handoff report to C:\Users\mark2\repos\Jinder\.agents\worker_e2em1.2\handoff.md and report back via send_message.
