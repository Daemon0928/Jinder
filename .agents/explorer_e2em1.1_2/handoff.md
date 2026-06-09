# E2E Milestone 1.1 Handoff Report (teamwork_preview_explorer)

## 1. Observation
We have inspected the source codebase, database configurations, package files, and other workspace files. Specifically:

1. **Database Path Definition**:
   In `src/db/database.ts` (lines 5-8):
   ```typescript
   const DB_FILE = path.join(process.cwd(), 'jobs.db');

   // Ensure db directory exists if we put it elsewhere, but process.cwd() is fine for jobs.db
   const db = new Database(DB_FILE);
   ```

2. **Hardcoded Profession.hu URLs**:
   In `src/scrapers/profession.ts` (lines 63, 72, 126):
   - Line 63: `searchUrls.push('https://www.profession.hu/allasok/1,0,0,...');`
   - Line 72: `searchUrls.push('https://www.profession.hu/allasok/${locInfo.slug}/1,0,${locInfo.id},${encodeURIComponent(keyword)}');`
   - Line 126: `fullUrl = 'https://www.profession.hu' + href;`

3. **Discord Webhook Configuration**:
   In `src/scrapers/scraperManager.ts` (lines 145-150):
   ```typescript
   if (score >= 80) {
     try {
       const webhookRow = db.prepare("SELECT value FROM config WHERE key = 'discord_webhook'").get() as { value: string } | undefined;
       const webhookUrl = webhookRow?.value;
       if (webhookUrl && webhookUrl.startsWith('http')) {
         // ... makes POST request
       }
   ```

4. **Gemini API Integration**:
   In `src/matcher/gemini.ts` (lines 42, 105):
   ```typescript
   const ai = new GoogleGenAI({ apiKey });
   ```
   Both `summarizeCv` and `matchJobWithGemini` fetch `process.env.GEMINI_API_KEY` and interact with `GoogleGenAI` models.

5. **No Fluff Jobs API Endpoint Definitions**:
   From previous explorer reports (e.g. `C:\Users\mark2\repos\Jinder\.agents\explorer_impm1_1\analysis.md` line 10, 29):
   - Search: `POST https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month`
   - Details: `GET https://nofluffjobs.com/api/posting/<slug>`
   - Fallback Crawler URL: `https://nofluffjobs.com/hu/jobs/${city}?q=${keyword}`
   - Fallback Job Details: `https://nofluffjobs.com/hu/job/${slug}`

6. **Current Testing Setup**:
   No pre-existing testing framework is configured in `package.json` (line 12):
   ```json
   "test": "echo \"Error: no test specified\" && exit 1"
   ```
   There are only standalone scratch scripts (`pw_test.js`, `test-profession.ts`, `test-suggest-api.ts`).

---

## 2. Logic Chain
To establish a completely offline, sandboxed E2E testing framework, we reason as follows:

1. **Database Isolation**:
   - By Observation 1, the database filename is hardcoded to `jobs.db`. Running tests against this would pollute production data.
   - *Logic*: Introducing `process.env.DATABASE_FILE || 'jobs.db'` in `src/db/database.ts` allows E2E runners to direct all SQL operations to a test database (e.g. `jobs_test.db`), which can be safely created, seeded, and torn down for each test run.

2. **Scraper Sandbox Routing**:
   - By Observation 2, the Profession scraper URLs are hardcoded, and by Observation 5, the No Fluff Jobs scraper will query hardcoded production APIs.
   - *Logic*: Making these base URLs configurable via `process.env.PROFESSION_BASE_URL` and `process.env.NOFLUFFJOBS_BASE_URL` allows tests to redirect HTTP traffic (both Axios and Playwright crawlers) to a locally running mock Express server.

3. **LLM / Gemini Isolation**:
   - By Observation 4, the semantic matcher requires a real Gemini API Key and communicates with external Google endpoints. Real LLM requests introduce cost, latency, and non-determinism into E2E suites.
   - *Logic*: Introducing a bypass flag `process.env.MOCK_GEMINI === 'true'` within `src/matcher/gemini.ts` lets us instantly bypass the `GoogleGenAI` client during E2E runs, returning deterministic structured results based on simple rules (e.g. check if job title includes "Senior").

4. **Discord Webhooks Sandboxing**:
   - By Observation 3, the Discord webhook URL is loaded dynamically from the configuration table in the database.
   - *Logic*: No source code changes are required for webhooks. E2E test scripts can seed the config table in `jobs_test.db` with `discord_webhook = http://localhost:5001/mock-discord-webhook`. The application will naturally post notifications to the local mock server, enabling assertions.

---

## 3. Caveats
- **Playwright Host Resolution**: Playwright browser instances running inside the Windows environment must have local network access to resolve `http://localhost:5001`. On standard Windows setups, localhost resolves successfully, but any strict firewall policies might restrict local port communication.
- **Node.js Test Runner Choice**: The project does not have a test runner. We recommend using `node:test` (available natively in modern Node.js) or `jest`/`vitest`. The final implementation suite must install necessary runner packages if Jest/Vitest are chosen.
- **No Fluff Jobs Scraper Implementation**: This report is based on the planned API layout of `nofluffjobs.com/hu` (Observation 5). If the scraper implementation details diverge, the mock server paths will need to be aligned.

---

## 4. Conclusion
A robust, sandboxed E2E test suite can be implemented by making database paths and scraper base URLs environment-configurable, introducing a `MOCK_GEMINI` bypass check in the matcher module, and running a local Express mock server to handle No Fluff Jobs, Profession, and Discord Webhook requests. This ensures E2E tests can run completely offline, deterministically, and with zero cost.

---

## 5. Verification Method
1. **Source Inspection**:
   Verify that database paths and scraper URLs are configurable by executing `git diff` after code modifications are made, verifying that hardcoded strings are replaced by `process.env` references.
2. **Offline Running**:
   Set `DATABASE_FILE=jobs_test.db`, `MOCK_GEMINI=true`, `PROFESSION_BASE_URL=http://localhost:5001`, and `NOFLUFFJOBS_BASE_URL=http://localhost:5001`. Disconnect internet access and launch a test runner to ensure that the system executes the scraping, matching, saving, and webhook dispatch sequence without error.
3. **Mock Server Payload Matching**:
   Inspect the mock Express server logs during test execution. Verify that incoming POST requests to `/mock-discord-webhook` match the payload structure from Observation 3 and that search payloads match No Fluff criteria specifications.
