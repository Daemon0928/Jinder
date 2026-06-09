# Jinder E2E Test Infrastructure Plan — Handoff Report (E2E-M1)

This report details the findings and plans for establishing a robust E2E test infrastructure for the Jinder application under sandbox conditions.

---

## 1. Observation

1. **Hardcoded Database Path**: In `src/db/database.ts`, lines 5-8:
   ```typescript
   const DB_FILE = path.join(process.cwd(), 'jobs.db');
   
   // Ensure db directory exists if we put it elsewhere, but process.cwd() is fine for jobs.db
   const db = new Database(DB_FILE);
   ```
2. **Hardcoded Scraper URLs**: In `src/scrapers/profession.ts`, lines 63, 70, 72, 126:
   - Search URL: `https://www.profession.hu/allasok/...`
   - Detail URL: `https://www.profession.hu/allas/...`
   - Similarly, peer analysis in `.agents/explorer_impm1_1/analysis.md` records that the upcoming `nofluffjobs.ts` scraper will target:
     - Search API: `POST https://nofluffjobs.com/api/search/posting...`
     - Detail API: `GET https://nofluffjobs.com/api/posting/<slug>`
     - Web Crawl: `https://nofluffjobs.com/hu/jobs/...` and `https://nofluffjobs.com/hu/job/...`
3. **External LLM Dependency**: In `src/matcher/gemini.ts`, lines 93-105:
   ```typescript
   const apiKey = process.env.GEMINI_API_KEY;
   if (!apiKey) {
     console.warn("GEMINI_API_KEY is not set. Skipping semantic match.");
     return null;
   }
   
   const cvText = getCVText();
   if (!cvText) { ... }
   
   const ai = new GoogleGenAI({ apiKey });
   ```
4. **Discord Webhook Query**: In `src/scrapers/scraperManager.ts`, lines 147-149:
   ```typescript
   const webhookRow = db.prepare("SELECT value FROM config WHERE key = 'discord_webhook'").get() as { value: string } | undefined;
   const webhookUrl = webhookRow?.value;
   ```
5. **No Existing Test Framework**: In `package.json`, lines 12 & 30-38:
   ```json
   "test": "echo \"Error: no test specified\" && exit 1"
   ```
   No testing runner (e.g. Vitest, Jest) is configured in `devDependencies`.

---

## 2. Logic Chain

1. **Database Isolation**: Since the database path is hardcoded to `jobs.db` in `src/db/database.ts` (Observation 1), running E2E tests would write to and pollute the development database. Hence, we must configure `DB_FILE` to route queries to a temporary `jobs.test.db` when `NODE_ENV === 'test'`.
2. **Network Sandboxing**: Because we must run in a network-restricted `CODE_ONLY` environment and avoid external calls to `nofluffjobs.com` and `profession.hu` (Observation 2), we need to inject environment variable overrides (`NOFLUFF_API_BASE_URL`, `NOFLUFF_HTML_BASE_URL`, `PROFESSION_BASE_URL`) to redirect all scraper network requests to a local mock HTTP server.
3. **LLM Sandboxing**: Since Gemini evaluation requires an external HTTP connection to Google (Observation 3), we need to bypass it by exporting a mutable hook `mockGeminiHandler` in `src/matcher/gemini.ts` which returns pre-defined mock match scores and parsed job payloads when `NODE_ENV === 'test'`.
4. **Webhook Validation**: Because Discord webhooks are retrieved directly from the database configuration (Observation 4), writing `http://localhost:<mock_port>/webhook/discord` to the test database's config table will naturally route webhook requests to our local mock server without editing any code in the scraper manager.
5. **Testing Framework Recommendation**: As there is no test framework registered in `package.json` (Observation 5), we should install `vitest` and `cross-env` to execute our test runner in TypeScript out-of-the-box.

---

## 3. Caveats

- **Playwright Headless Execution**: Playwright searches in the fallback mode launch a real headless browser. When running inside the mock environment, Playwright must load HTML from `localhost:<mock_port>`. This works as long as the mock server is running and the HTML files are accessible.
- **Axios vs Playwright Fallback Coverage**: Our mock server must support both the JSON APIs (for Axios) and HTML pages (for Playwright crawler fallbacks) to fully test the failure recovery logic.

---

## 4. Conclusion

We can successfully test Jinder E2E in a sandboxed, offline environment by:
1. Routing the SQLite database to `jobs.test.db` in test mode.
2. Directing scraper HTTP requests to a local Express mock server using configurable base URLs.
3. Mocking Gemini API calls using a mutable in-memory test handler in `gemini.ts`.
4. Injecting the mock webhook path into the test database config table.
5. Establishing a `tests/` directory structure with Vitest as the test runner.

These design requirements are documented in detail in `C:\Users\mark2\repos\Jinder\.agents\explorer_e2em1.1_3\analysis.md`.

---

## 5. Verification Method

To independently verify the test planning and codebase design:
1. Inspect the `analysis.md` file:
   ```bash
   cat C:\Users\mark2\repos\Jinder\.agents\explorer_e2em1.1_3\analysis.md
   ```
2. Verify that the files modified match layout rules (all source changes are proposed for `src/` and E2E tests are organized under `tests/`).
3. Once the Implementer creates the files and installs Vitest, the E2E suite can be verified by executing:
   ```bash
   cross-env NODE_ENV=test vitest run tests/e2e/e2e.test.ts
   ```
