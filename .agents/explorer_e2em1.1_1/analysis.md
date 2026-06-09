# E2E Test Infrastructure Design Analysis (M1.1)

This report presents the design and planning for the Jinder E2E test infrastructure. It details how the application's components (Scrapers, Scraper Manager, Matcher/Gemini, Webhooks, Database, and Express Server) can be tested in a sandboxed, automated, and deterministic environment, satisfying the requirement to run 60+ test cases across 4 testing tiers.

---

## 1. Codebase Examination Findings

Based on an audit of the project root and current code:
*   **Production Codebase**:
    *   `src/db/database.ts`: Initializes SQLite (`jobs.db`) and manages `jobs` and `config` tables. The database file path is currently hardcoded to `process.cwd()/jobs.db`.
    *   `src/scrapers/profession.ts`: Scrapes Profession.hu by building search URLs, fetching HTML via `axios` or fallback headless `playwright`, extracting job details, and fetching job detail text. URLs are currently hardcoded to `https://www.profession.hu`.
    *   `src/scrapers/scraperManager.ts`: Handles the workflow by loading locations/keywords from the config, running scraper functions, deduplicating, fetching detail pages, calling Gemini matching, saving records to SQLite, and sending Discord webhooks if the score is $\ge 80\%$.
    *   `src/matcher/gemini.ts`: Interacts with `@google/genai` to summarize CVs and semantically match job descriptions against user CVs using the model `gemini-3.1-flash-lite`.
    *   `src/server.ts`: Express API server listening on `PORT` (default 5000), exposing endpoints for configuration (`/api/config`), jobs list/update/delete (`/api/jobs`), and scraper execution (`/api/scrape` and `/api/scrape/status`).
*   **Testing Codebase**:
    *   `pw_test.js`: A simple Playwright script that navigates to `https://www.profession.hu` and types a keyword.
    *   `test-profession.ts` / `test-suggest-api.ts`: Helper scripts for manual search and suggestion API testing.
    *   There is currently no unified E2E test harness or automated test runner.

---

## 2. Planned Test Directory Structure

The E2E test suite will reside in a dedicated directory in the project root. This keeps tests isolated from production code, conforming to the workspace layout guidelines:

```
tests/
├── e2e/
│   ├── run-tests.ts          # Orchestrator & test runner harness
│   ├── mock-server.ts        # Mock HTTP server (for nofluffjobs.com, profession.hu, webhooks)
│   ├── database-helper.ts    # Setup, seeding, and teardown of the test database
│   ├── test-cases.ts         # Declaration of all 60+ E2E test cases
│   ├── mock-data/            # Mock responses representing scrapers and APIs
│   │   ├── search/
│   │   │   ├── nofluffjobs-react.json
│   │   │   └── profession-budapest.html
│   │   └── postings/
│   │       ├── senior-ts-budapest.json
│   │       └── junior-react-remote.json
│   └── test-case-schema.json # Validation schema for test case definition
```

---

## 3. Mock Data Format (No Fluff Jobs)

No Fluff Jobs scraper will interact with two main endpoints. The test infrastructure will supply mock data representing these APIs.

### 3.1. Search Endpoint (`POST /api/search/posting`)
Mock response format for `POST https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month` representing a list of matching job cards:

```json
{
  "postings": [
    {
      "id": "nfj-101",
      "slug": "senior-typescript-developer-budapest",
      "title": "Senior TypeScript Developer",
      "company": "Tech Solutions Kft",
      "location": "Budapest",
      "salary": {
        "from": 1200000,
        "to": 1800000,
        "currency": "HUF"
      }
    },
    {
      "id": "nfj-102",
      "slug": "junior-react-developer-remote",
      "title": "Junior React Developer",
      "company": "Global Devs",
      "location": "remote",
      "salary": {
        "from": 600000,
        "to": 800000,
        "currency": "HUF"
      }
    }
  ]
}
```

### 3.2. Posting Detail Endpoint (`GET /api/posting/<slug>`)
Mock response format for `GET https://nofluffjobs.com/api/posting/<slug>` representing requirements, specs, and descriptions:

```json
{
  "requirements": {
    "musts": [
      { "value": "TypeScript", "name": "TypeScript" },
      { "value": "Node.js", "name": "Node.js" },
      { "value": "5+ years experience", "name": "Experience" }
    ],
    "nices": [
      { "value": "React", "name": "React" },
      { "value": "Docker", "name": "Docker" }
    ],
    "description": "We are seeking a Senior TypeScript Developer to lead our backend integration efforts."
  },
  "specs": {
    "dailyTasks": [
      "Designing system architectures",
      "Writing clean TypeScript code",
      "Conducting code reviews"
    ]
  }
}
```

---

## 4. Test Case Schema & Tier Mapping

To automate and cleanly declare the **60+ test cases** across the **4 tiers**, a TypeScript interface and JSON schema will define each test case structure:

```typescript
export interface E2ETestCase {
  id: string; // e.g. "E2E-T1-01"
  name: string;
  tier: 1 | 2 | 3 | 4; // Tier 1: Feature, Tier 2: Boundary, Tier 3: Cross, Tier 4: Real-world
  description: string;
  configSetup: {
    cvText?: string;
    keywords?: string[];
    locations?: string[];
    discordWebhook?: string;
  };
  mockServerBehavior: {
    searchStatus?: number;
    searchPayload?: any;
    postingStatus?: Record<string, number>;
    postingPayloads?: Record<string, any>;
    webhookStatus?: number;
  };
  execute: {
    action: 'run_scraper' | 'cv_upload' | 'api_scrape_trigger' | 'status_update';
    params?: any;
  };
  assertions: {
    exitCode?: number;
    dbState?: {
      table: 'jobs' | 'config';
      count?: number;
      where?: string;
      expectedRows?: Array<Record<string, any>>;
    };
    webhookTriggered?: boolean;
    webhookPayloadContains?: string[];
    errorMatches?: string;
  };
}
```

### 4.1. Tier 1: Feature Coverage (Target: ~20 cases)
Tests individual features in isolation using happy path data.
*   **Scraper Isolation**:
    *   No Fluff Jobs scraper: API search response successfully converted to `ScrapedJob[]`.
    *   No Fluff Jobs details: Fetch and build the combined description string from JSON.
    *   No Fluff Jobs fallback: Crawl mock search results HTML and detail HTML via Playwright.
    *   Profession.hu scraper: Happy path scrape of search and details using Playwright.
*   **Manager & Database**:
    *   Deduplication: Scraper Manager skips processing if job already exists in DB.
    *   Insertion: New scraped jobs correctly stored in `jobs` table with correct formats.
*   **API & Core**:
    *   CV Upload: Endpoint correctly extracts PDF text (via mock PDF reader) and saves it.
    *   CV Summary: Summarization executes and saves summary under config.
    *   Discord Webhooks: Dispatch webhook on score $\ge 80\%$, verify standard payload format.

### 4.2. Tier 2: Boundary & Corner Cases (Target: ~20 cases)
Tests edge cases, malformed data, and resilience.
*   **Data Boundaries**:
    *   Empty search results: Scraper returns empty array without crashing.
    *   Null or missing fields: Mock response missing salary, requirements, or location.
    *   Mixed languages (English/Hungarian) in job details.
*   **API and DB Failures**:
    *   Mock server returns HTTP 500, 403, 404, or 429 on search endpoint.
    *   Mock server returns HTTP 500 or 404 on details endpoint.
    *   Gemini API returns error or rate limit (verify scraper proceeds, logging the error, without halting).
    *   Discord Webhook returns HTTP 429 or 500 (verify jobs are still successfully committed to DB).
    *   Empty/missing SQLite tables (verify auto-recovery and database initialization).
*   **User Input Errors**:
    *   CV upload with non-PDF files or corrupted PDF payloads.
    *   Invalid webhook URL strings (e.g. malformed URLs, empty config).

### 4.3. Tier 3: Cross-Feature Interactions (Target: ~15 cases)
Tests how different parts of the system interact sequentially.
*   **Scraper-to-DB-to-Webhook Pipeline**:
    *   Run scraper $\to$ Save new job to DB $\to$ Matcher scores job $\ge 80\% \to$ Webhook triggered successfully.
    *   Run scraper $\to$ Save new job to DB $\to$ Matcher scores job $< 80\% \to$ Webhook NOT triggered.
*   **UI API & Scraper Manager Integration**:
    *   POST `/api/scrape` initiates background run $\to$ Poll GET `/api/scrape/status` to assert transition through phases (`searching` $\to$ `fetching` $\to$ `matching` $\to$ `saving` $\to$ `done`).
*   **Status Workflow**:
    *   Scrape job $\to$ Status is `'new'`. PATCH `/api/jobs/:id` with `'bookmarked'` $\to$ database updates. Re-scrape same keyword $\to$ verify status remains `'bookmarked'` and does not reset to `'new'`.

### 4.4. Tier 4: Real-World Application Scenarios (Target: ~5 cases)
Validates end-to-end user workflows using complex, realistic datasets.
*   **Standard Job Hunt workflow**:
    *   User uploads a multi-page PDF CV, configures 3 keywords ("javascript", "node", "angular") and 2 locations ("budapest", "home_office"). Trigger API scraper run. Scrape 15 mock jobs. 3 matching above 80% successfully fire Discord alerts. User fetches `/api/jobs` to display matched list, deletes 2, and updates 1 to `'applied'`.
*   **Adversarial Network Scenarios**:
    *   Pipeline runs while mock server experiences 20% random HTTP packet drop, Gemini API rate limits, and Discord webhooks time out. Verify system logs errors correctly, proceeds with next jobs, commits all succeeded jobs to the DB, and gracefully exits with code 0.

---

## 5. Sandboxing & Mocking Strategies

To run tests in a local, network-isolated environment (CODE_ONLY mode):

### 5.1. Mock HTTP Server
A local Express/Node server (listening on port `5001` during tests) will mock all external domains:
1.  **No Fluff Jobs APIs**: Mock `POST /api/search/posting` and `GET /api/posting/:slug`.
2.  **No Fluff Jobs HTML**: Serves mock user-facing HTML pages for Playwright fallback testing.
3.  **Profession.hu**: Serves mock HTML pages mimicking the Profession search and details pages.
4.  **Discord Webhook**: Captures the POST request to `/api/webhooks/...`, validates JSON structure, and stores requests in an in-memory queue.
5.  **Test Endpoint**: Exposes a GET `/api/test/received-webhooks` endpoint for the test runner to query and assert webhook dispatches.

### 5.2. Test Database Sandboxing
*   **File Isolation**: E2E tests will use a separate SQLite database file `jobs.test.db` instead of the development file `jobs.db`.
*   **Lifecycle**:
    *   **Setup**: Delete any existing `jobs.test.db` and call `initDatabase()` to build fresh tables.
    *   **Seed**: Insert initial config values (e.g. mock CV text, keywords, and redirect webhook URL to `http://localhost:5001/webhook`).
    *   **Teardown**: Close DB connection and delete the `jobs.test.db` file.

### 5.3. Gemini API Mocking
To bypass external AI API calls:
*   We will introduce a `MOCK_GEMINI=true` environment variable.
*   When active, `src/matcher/gemini.ts` will skip calling the Google GenAI SDK and instead return deterministic, pre-structured responses.
*   The scores can be configured dynamically (e.g. matching keywords in job titles, or returning values based on the job description text) to test both high-match and low-match webhook logic.

---

## 6. Required Code & Configuration Changes

The following changes are needed in production code to support routing and database sandboxing:

### 6.1. Database Path Config (in `src/db/database.ts`)
Make the database path dynamic, checking for `DB_FILE` or a test environment suffix:
```typescript
const DB_FILE = process.env.DB_FILE || 
  path.join(process.cwd(), process.env.NODE_ENV === 'test' ? 'jobs.test.db' : 'jobs.db');
```

### 6.2. Configurable Scraper Domains
Introduce environment variables for external hosts.
*   **`src/scrapers/profession.ts`**:
    ```typescript
    const PROFESSION_BASE_URL = process.env.PROFESSION_BASE_URL || 'https://www.profession.hu';
    // Replace hardcoded "https://www.profession.hu" URL prefixes with PROFESSION_BASE_URL
    ```
*   **`src/scrapers/nofluffjobs.ts`** (under development):
    ```typescript
    const NOFLUFF_BASE_URL = process.env.NOFLUFF_BASE_URL || 'https://nofluffjobs.com';
    // Use NOFLUFF_BASE_URL for all search API requests and details requests
    ```

### 6.3. Gemini Mocking (in `src/matcher/gemini.ts`)
Add a bypass conditional block for tests:
```typescript
if (process.env.MOCK_GEMINI === 'true') {
  const score = jobTitle.toLowerCase().includes('typescript') || 
                jobTitle.toLowerCase().includes('react') ? 85 : 45;
  return {
    matchScore: score,
    pros: ['Matches core frontend/backend stack', 'Located in target region'],
    cons: ['Requires database familiarity'],
    justification: 'The job title matches the candidate\'s experience with TypeScript/React.',
    parsedJob: {
      title: jobTitle,
      company: jobCompany,
      location: 'Budapest',
      description: 'Mocked description of ' + jobTitle,
      techStack: ['TypeScript', 'React'],
      salary: '1 200 000 HUF'
    }
  };
}
```

### 6.4. Test Script execution (in `package.json`)
The custom TS test runner will orchestrate setting the environment variables programmatically inside Node.js, ensuring cross-platform capability without relying on shell-dependent variables.
We can add a simple script task:
```json
"test:e2e": "npx tsx tests/e2e/run-tests.ts"
```
Inside `run-tests.ts`, the environment will be set prior to booting up the test server or Express:
```typescript
process.env.NODE_ENV = 'test';
process.env.DB_FILE = 'jobs.test.db';
process.env.MOCK_GEMINI = 'true';
process.env.PROFESSION_BASE_URL = 'http://localhost:5001';
process.env.NOFLUFF_BASE_URL = 'http://localhost:5001';
```
This guarantees a fully automated sandbox E2E test runner execution.
