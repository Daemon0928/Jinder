# E2E Test Infrastructure Plan — Jinder (No Fluff Jobs & Profession.hu)

This document outlines the design, directory structure, mock data formats, test case schemas, and sandboxed execution strategies for Jinder's E2E test infrastructure. The design is tailored to run completely offline (satisfying `CODE_ONLY` network restrictions) while verifying the entire pipeline: Scraper -> Scraper Manager -> LLM Matcher -> DB Persistence -> Discord Webhook.

---

## 1. Test Directory Structure

To maintain clean separation between production code and testing artifacts, we propose the following layout inside the project root:

```
/
├── src/
│   ├── db/
│   │   └── database.ts
│   ├── matcher/
│   │   └── gemini.ts
│   └── scrapers/
│       ├── profession.ts
│       ├── nofluffjobs.ts
│       └── scraperManager.ts
│
├── tests/
│   ├── e2e/
│   │   └── e2e.test.ts          # Main E2E integration test suite
│   ├── mocks/
│   │   ├── mockServer.ts        # HTTP mock server for No Fluff Jobs, Profession.hu, & Discord Webhook
│   │   └── geminiMock.ts        # Gemini API mock installer
│   └── fixtures/
│       ├── test-cases.json      # Structured test case declarations
│       └── html/
│           ├── nofluff-search.html  # Mock search page HTML for Playwright crawler
│           ├── nofluff-detail.html  # Mock detail page HTML for Playwright crawler
│           ├── profession-search.html
│           └── profession-detail.html
```

---

## 2. Sandboxing Strategy

To ensure reproducible runs and complete network isolation:

### 2.1 Configurable Base URLs (HTTP Routing)
The scrapers currently hardcode external API and website URLs. We will modify the scrapers to resolve base URLs from environment variables, fallback-defaulted to the real sites:
- **No Fluff Jobs API**: `NOFLUFF_API_BASE_URL` (default: `https://nofluffjobs.com`)
- **No Fluff Jobs Web**: `NOFLUFF_HTML_BASE_URL` (default: `https://nofluffjobs.com`)
- **Profession.hu Web**: `PROFESSION_BASE_URL` (default: `https://www.profession.hu`)

During E2E testing, these environment variables are set to `http://localhost:<mock_port>`, effectively redirecting all Axios and Playwright HTTP requests to our local mock server.

### 2.2 Local HTTP Mock Server (`tests/mocks/mockServer.ts`)
We spin up a lightweight Express mock server on a random free port. It exposes:
- **No Fluff Jobs API**:
  - `POST /api/search/posting?salaryCurrency=HUF&salaryPeriod=month` -> Returns mock search JSON (from fixtures).
  - `GET /api/posting/:slug` -> Returns mock job details JSON.
- **No Fluff Jobs Web (Playwright Fallback)**:
  - `GET /hu/jobs` or `GET /hu/jobs/:city` -> Returns mock search HTML containing job links.
  - `GET /hu/job/:slug` -> Returns mock detail page HTML.
- **Discord Webhook Mock**:
  - `POST /webhook/discord` -> Captures payload and pushes it to an in-memory array.
- **Test Helpers**:
  - `GET /__test/webhooks` -> Exposes captured webhooks for test assertions.
  - `POST /__test/reset` -> Clears captured webhook requests and resets mocked endpoints state.

### 2.3 SQLite Database Isolation
To prevent tests from corrupting or reading live developer database data:
1. We modify `src/db/database.ts` to select `jobs.test.db` when `NODE_ENV === 'test'`.
2. In E2E test setup (`beforeAll`), we delete any existing `jobs.test.db` (including `-wal` and `-shm` files) and run `initDatabase()` to ensure a clean, isolated schema.
3. The server/scraper manager will naturally query and save into this test database.
4. During test teardown (`afterAll`), we close the DB and delete the test database files.

### 2.4 Gemini API (LLM) Mocking
Calling the Google Gemini API requires a real API key and internet access. We bypass this by exposing a test-only mock hook in `src/matcher/gemini.ts`.
- In `gemini.ts`, we export a mutable handler function `mockGeminiHandler`.
- If `NODE_ENV === 'test'` and `mockGeminiHandler` is defined, the `matchJobWithGemini` function executes this mock handler instead of calling the Google GenAI SDK.
- This allows our test runner to dynamically simulate different Gemini match scores, pros/cons, and translated details.

---

## 3. Mock Data Formats (No Fluff Jobs)

### 3.1 Search POST Response Mock
- **Endpoint**: `POST /api/search/posting?salaryCurrency=HUF&salaryPeriod=month`
- **JSON Format**:
```json
{
  "postings": [
    {
      "slug": "senior-react-developer-budapest-xyz",
      "title": "Senior React Developer",
      "brand": "TechCorp",
      "location": "Budapest",
      "url": "https://nofluffjobs.com/hu/job/senior-react-developer-budapest-xyz"
    },
    {
      "slug": "cobol-mainframe-developer-remote-abc",
      "title": "COBOL Mainframe Developer",
      "brand": "LegacyBank",
      "location": "remote",
      "url": "https://nofluffjobs.com/hu/job/cobol-mainframe-developer-remote-abc"
    }
  ]
}
```

### 3.2 Detail GET Response Mock
- **Endpoint**: `GET /api/posting/:slug`
- **JSON Format** (e.g. for slug `senior-react-developer-budapest-xyz`):
```json
{
  "requirements": {
    "musts": [
      { "value": "React", "name": "React" },
      { "value": "TypeScript", "name": "TypeScript" }
    ],
    "nices": [
      { "value": "Next.js", "name": "Next.js" }
    ],
    "description": "Looking for a seasoned frontend engineer to build modern single-page applications."
  },
  "specs": {
    "dailyTasks": [
      "Develop new features in React",
      "Optimize performance",
      "Mentor junior engineers"
    ]
  }
}
```

---

## 4. Test Case Schema and Scenarios

We define test cases in `tests/fixtures/test-cases.json`. The test cases specify the environment configurations, mock return values, and final DB and Webhook assertions.

### 4.1 Test Case JSON Schema
```json
[
  {
    "id": "string",
    "description": "string",
    "searchKeyword": "string",
    "locations": ["string"],
    "cvText": "string",
    "mockData": {
      "search": "object",
      "details": {
        "<slug>": "object"
      }
    },
    "geminiMock": {
      "matchScore": "number",
      "pros": ["string"],
      "cons": ["string"],
      "justification": "string",
      "parsedJob": {
        "title": "string",
        "company": "string",
        "location": "string",
        "description": "string",
        "techStack": ["string"],
        "salary": "string"
      }
    },
    "expectations": {
      "dbStatus": "string",
      "dbMatchScore": "number",
      "webhookTriggered": "boolean",
      "webhookContentContains": ["string"]
    }
  }
]
```

### 4.2 Key E2E Test Scenarios

1. **Scenario 1: High Match Notification (Score >= 80%)**
   - **Trigger**: Run scraper for keyword "react".
   - **Mock Gemini Output**: Match score `85%`.
   - **Expectation**: 
     - Job is saved to `jobs.test.db` with `platform` = `'nofluffjobs'` and `job_id` = `'nofluffjobs-senior-react-developer-budapest-xyz'`.
     - `match_score` is set to `85`.
     - Discord Webhook mock receives a `POST` request with the job description and alert details.

2. **Scenario 2: Low Match Silent Save (Score < 80%)**
   - **Trigger**: Run scraper for keyword "cobol".
   - **Mock Gemini Output**: Match score `15%`.
   - **Expectation**:
     - Job is saved to `jobs.test.db` with `match_score` = `15`.
     - Discord Webhook mock is **not** called.

3. **Scenario 3: Deduplication (Skip Existing)**
   - **Trigger**: Run scraper with the same keyword "react" twice.
   - **Setup**: In the second run, ensure the job `nofluffjobs-senior-react-developer-budapest-xyz` already exists in `jobs.test.db`.
   - **Expectation**:
     - The second scrape execution skips fetching details and skips matching (saving network requests/tokens).
     - Database does not create a duplicate row.

4. **Scenario 4: Crawler Fallback (API Blocked)**
   - **Setup**: The API endpoints return HTTP `403 Forbidden` or `500 Server Error`.
   - **Execution**: The scraper fails over to Playwright crawling of HTML search pages.
   - **Expectation**:
     - Scraper successfully parses mock HTML search and detail pages.
     - Entire process completes normally with identical database outcome as Scenario 1.

---

## 5. Required Code Changes

To support the above sandboxing, the following files require minor updates:

### 5.1 Database Config (`src/db/database.ts`)
Change how `DB_FILE` is defined:
```typescript
// Before:
// const DB_FILE = path.join(process.cwd(), 'jobs.db');

// After:
const DB_FILE = process.env.NODE_ENV === 'test' 
  ? path.join(process.cwd(), 'jobs.test.db')
  : (process.env.DB_FILE || path.join(process.cwd(), 'jobs.db'));
```

### 5.2 Scraper Endpoints (`src/scrapers/nofluffjobs.ts`)
When importing/constructing URLs, resolve base path from the environment:
```typescript
const NOFLUFF_API_BASE_URL = process.env.NOFLUFF_API_BASE_URL || 'https://nofluffjobs.com';
const NOFLUFF_HTML_BASE_URL = process.env.NOFLUFF_HTML_BASE_URL || 'https://nofluffjobs.com';

// Search API Endpoint:
const searchUrl = `${NOFLUFF_API_BASE_URL}/api/search/posting?salaryCurrency=HUF&salaryPeriod=month`;

// Detail API Endpoint:
const detailUrl = `${NOFLUFF_API_BASE_URL}/api/posting/${slug}`;

// Playwright Crawl Fallback Endpoints:
const htmlSearchUrl = `${NOFLUFF_HTML_BASE_URL}/hu/jobs/${city}?q=${encodeURIComponent(keyword)}`;
const htmlDetailUrl = `${NOFLUFF_HTML_BASE_URL}/hu/job/${slug}`;
```

### 5.3 Gemini Mock Hook (`src/matcher/gemini.ts`)
Inject a test hook to bypass live LLM generation:
```typescript
// Add type definition and exporter
export type GeminiMatcherHandler = (title: string, company: string, text: string) => Promise<MatchResult | null>;

let mockGeminiHandler: GeminiMatcherHandler | null = null;

export function setMockGeminiHandler(handler: GeminiMatcherHandler | null) {
  mockGeminiHandler = handler;
}

// Modify matchJobWithGemini:
export async function matchJobWithGemini(
  jobTitle: string,
  jobCompany: string,
  rawHtmlOrText: string,
): Promise<MatchResult | null> {
  // Bypasses Gemini API when testing
  if (process.env.NODE_ENV === 'test' && mockGeminiHandler) {
    return mockGeminiHandler(jobTitle, jobCompany, rawHtmlOrText);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  // ... original GoogleGenAI implementation
}
```

---

## 6. Verification Method

Once implemented, the E2E test suite can be executed with a standard command, e.g.:
```bash
# Set environment to test and run the Vitest test execution
cross-env NODE_ENV=test vitest run tests/e2e/e2e.test.ts
```
The test verifies:
- File creation and cleanup of `jobs.test.db`.
- Mock server endpoint routing (Axios / Playwright).
- Webhook logging and payload match assertions.
