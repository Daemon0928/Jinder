# Handoff Report: E2E Test Infrastructure Design (M1.1)

This handoff report summarizes the observations, design reasoning, and actionable plan for implementing the E2E test infrastructure in Milestone E2E-M1.

---

## 1. Observation
*   **Observation 1 (Database path)**: In `src/db/database.ts` at line 5:
    ```typescript
    const DB_FILE = path.join(process.cwd(), 'jobs.db');
    ```
    This hardcodes the database file, making it impossible to sandbox data during test runs without affecting production data.
*   **Observation 2 (Hardcoded Scraper Domains)**: In `src/scrapers/profession.ts` at lines 63, 70, 72, and 126, the scraper utilizes hardcoded URLs prefixing `https://www.profession.hu`:
    ```typescript
    searchUrls.push(`https://www.profession.hu/allasok/1,0,0,${encodeURIComponent(keyword)}%401%401?keywordsearch`);
    ```
    This prevents routing scraper HTTP requests to a local sandboxed mock server.
*   **Observation 3 (Missing Test Runner)**: In `package.json` at line 12:
    ```json
    "test": "echo \"Error: no test specified\" && exit 1"
    ```
    There is currently no test runner script or framework configured.
*   **Observation 4 (Gemini API Dependency)**: In `src/matcher/gemini.ts` at lines 35-42, `summarizeCv` directly instantiates `GoogleGenAI` using `process.env.GEMINI_API_KEY`:
    ```typescript
    export async function summarizeCv(rawText: string): Promise<string | null> {
      const apiKey = process.env.GEMINI_API_KEY;
      ...
      const ai = new GoogleGenAI({ apiKey });
    ```
    This calls live Gemini endpoints, causing tests to fail in network-isolated environments (like CODE_ONLY mode) or consume active API quotas.
*   **Observation 5 (Infrastructure Scope)**: In `.agents/sub_orch_e2e_m1/SCOPE.md` at lines 4-8:
    *   "The test infrastructure needs to support running 60+ E2E tests across 4 tiers..."
    *   "A mock HTTP server should be set up to mock nofluffjobs.com APIs (`/api/search/posting` and `/api/posting/<slug>`) and Discord Webhooks."
    *   "Database state must be sandboxed using a test database file."

---

## 2. Logic Chain
1.  **Requirement**: Run tests under sandboxed, network-isolated conditions without calling actual external hosts (No Fluff Jobs, Profession.hu, Discord, or Gemini).
2.  **Step 1 (Mock HTTP server)**: Setting up a local mock server on port `5001` (using Express or Node's `http` module) allows us to return mock HTML or JSON for No Fluff Jobs search, details, and Profession.hu pages. It also allows us to verify Discord Webhooks by capturing POST requests (based on Observation 2, 5).
3.  **Step 2 (Base URL Config)**: To direct the scrapers to the local mock server, we must modify the scraper files to construct URLs using configurable base hosts (e.g., `process.env.PROFESSION_BASE_URL` and `process.env.NOFLUFF_BASE_URL`), defaulting to the real domains if not set (based on Observation 2).
4.  **Step 3 (DB Sandboxing)**: To prevent tests from polluting active database states, we must modify `src/db/database.ts` to look for a `DB_FILE` environment variable, defaulting to `jobs.test.db` in test modes. The test runner will handle creating, seeding, and clean-up of this test DB file (based on Observation 1, 5).
5.  **Step 4 (Gemini Mocking)**: To make tests independent of external Google endpoints, we can introduce a conditional check for `process.env.MOCK_GEMINI === 'true'` in `src/matcher/gemini.ts` and return static mock analysis objects (based on Observation 4).
6.  **Step 5 (60+ E2E Cases in 4 Tiers)**: By declaring tests in a TypeScript config file (`test-cases.ts`) where each case defines its configuration, mock responses, actions, and assertions, we can structure 60+ cases cleanly mapped to Feature, Boundary, Cross-feature, and Real-world tiers (based on Observation 5).

---

## 3. Caveats
*   **Playwright Headless Browser Environment**: Playwright requires Chrome/Chromium binaries to run. In extremely locked down or CI environments, Playwright may fail to spawn if binaries are missing. However, the scraper contains an Axios-first path which doesn't require a browser. If Playwright is missing, tests targeting the Playwright fallbacks will fail. The runner must check for Playwright availability or gracefully skip browser-specific edge cases if binaries are missing.
*   **External package installation**: No testing framework (like Vitest or Jest) is currently installed in `package.json`. Writing a custom TS test runner using `tsx` (which is already installed in `devDependencies`) is the most lightweight path as it avoids introducing new external npm dependency trees.

---

## 4. Conclusion
We conclude that the design of the sandboxed E2E testing infrastructure is highly feasible and requires minimal changes to the existing production code (introducing base URLs, environment-driven DB path, and Gemini mock check). A custom test runner `tests/e2e/run-tests.ts` using a local Express mock server (`tests/e2e/mock-server.ts`) is the optimal approach.

---

## 5. Verification Method
Verify this design by reviewing:
1.  `C:\Users\mark2\repos\Jinder\.agents\explorer_e2em1.1_1\analysis.md` (detailed architecture plan).
2.  `C:\Users\mark2\repos\Jinder\src/db/database.ts` and `src/scrapers/profession.ts` files to confirm the exact lines cited in Observations 1 & 2.
3.  `package.json` dependencies to confirm `tsx` availability.

---

## 6. Remaining Work
For the Implementer subagent in the next milestone (M1.2):
1.  **Configure Environment Routing**: Modify `src/db/database.ts`, `src/scrapers/profession.ts`, and `src/matcher/gemini.ts` to support sandboxed overrides.
2.  **Write `TEST_INFRA.md`**: Document the testing tiers, command execution, and architecture in the project root.
3.  **Implement Mock Server**: Create `tests/e2e/mock-server.ts` to intercept API calls (No Fluff Jobs, Profession, Webhooks).
4.  **Implement Test Runner Harness**: Create `tests/e2e/run-tests.ts` to boot the mock server, spawn the main app server, initialize/destroy the test DB, load `tests/e2e/test-cases.ts`, run tests, and report exit status.
5.  **Define 60+ Test Cases**: Declare the tests across the 4 tiers inside `tests/e2e/test-cases.ts`.
