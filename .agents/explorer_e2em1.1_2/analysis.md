# E2E Test Infrastructure Plan & Design for Jinder

This document details the plan and design for the End-to-End (E2E) test infrastructure of Jinder, supporting the integration of `nofluffjobs.com/hu`.

---

## 1. Test Directory Structure

We propose establishing a dedicated `tests/` folder in the project root containing tests, mock server code, mock data payloads, and helper utilities:

```
tests/
├── e2e/
│   ├── scraper.test.ts          # E2E tests for Profession.hu and No Fluff Jobs scrapers (API & Crawling)
│   ├── manager.test.ts          # E2E tests for ScraperManager (deduplication, runScraper flow)
│   ├── matcher.test.ts          # E2E tests for Gemini CV matching and summary logic
│   ├── server.test.ts           # E2E tests for backend REST endpoints (/api/jobs, /api/scrape, etc.)
│   └── webhook.test.ts          # E2E tests verifying Discord webhook triggers
├── mocks/
│   ├── mockServer.ts            # Lightweight Express server to intercept and mock HTTP calls
│   └── data/
│       ├── nofluff_search_api_ok.json     # Mock JSON for No Fluff search API (results found)
│       ├── nofluff_search_api_empty.json  # Mock JSON for No Fluff search API (no results)
│       ├── nofluff_detail_api.json        # Mock JSON for No Fluff job detail API
│       ├── nofluff_search_page.html       # Mock HTML for No Fluff search crawler fallback
│       └── nofluff_detail_page.html       # Mock HTML for No Fluff job detail crawler fallback
├── helpers/
│   ├── testDb.ts                # Database lifecycle utility (creates test DB, seeds CV, cleans up)
│   └── testEnv.ts               # Manages env variables (URLs, MOCK_GEMINI, DB name) before/after test runs
└── tsconfig.json                # TS config for testing environment (extends root tsconfig)
```

---

## 2. Mock Data Specifications

To test without internet access, the mock server will serve static payloads representing No Fluff Jobs search and posting detail endpoints.

### 2.1 No Fluff Jobs Search API (JSON POST response)
Location: `tests/mocks/data/nofluff_search_api_ok.json`
```json
{
  "postings": [
    {
      "slug": "senior-typescript-developer-budapest-xyz123",
      "title": "Senior TypeScript Developer",
      "brand": "TechCorp",
      "location": {
        "places": [
          {
            "city": "Budapest",
            "country": "Hungary"
          }
        ]
      }
    },
    {
      "slug": "remote-react-developer-abc456",
      "title": "React Developer",
      "brand": "AppStudio",
      "location": {
        "places": [
          {
            "city": "remote",
            "country": "Hungary"
          }
        ]
      }
    }
  ]
}
```

### 2.2 No Fluff Jobs Job Details API (JSON GET response)
Location: `tests/mocks/data/nofluff_detail_api.json`
```json
{
  "requirements": {
    "musts": [
      { "value": "TypeScript" },
      { "value": "Node.js" },
      { "value": "Express" }
    ],
    "nices": [
      { "value": "Docker" },
      { "value": "Playwright" }
    ],
    "description": "We are seeking a Senior TypeScript Developer to build our Jinder application."
  },
  "specs": {
    "dailyTasks": [
      "Write clean TypeScript code",
      "Perform REST API integration",
      "Configure test environments"
    ]
  }
}
```

### 2.3 No Fluff Jobs Search page (Playwright fallback HTML)
Location: `tests/mocks/data/nofluff_search_page.html`
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>IT Jobs in Hungary | No Fluff Jobs</title>
</head>
<body>
  <div class="list-container">
    <a href="/hu/job/senior-typescript-developer-budapest-xyz123" class="posting-list-item">
      <h3 class="posting-title__position">Senior TypeScript Developer</h3>
      <span class="posting-title__brand">TechCorp</span>
      <span class="posting-info__location">Budapest</span>
    </a>
    <a href="/hu/job/remote-react-developer-abc456" class="posting-list-item">
      <h3 class="posting-title__position">React Developer</h3>
      <span class="posting-title__brand">AppStudio</span>
      <span class="posting-info__location">remote</span>
    </a>
  </div>
</body>
</html>
```

### 2.4 No Fluff Jobs Job Details page (Playwright fallback HTML)
Location: `tests/mocks/data/nofluff_detail_page.html`
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Senior TypeScript Developer - TechCorp</title>
</head>
<body>
  <main class="posting-details">
    <h1 class="position-title">Senior TypeScript Developer</h1>
    <h2 class="company-name">TechCorp</h2>
    <div class="job-description">
      <p>We are seeking a Senior TypeScript Developer to build our Jinder application.</p>
      <h3>Requirements (Must):</h3>
      <p>TypeScript, Node.js, Express</p>
      <h3>Requirements (Nice):</h3>
      <p>Docker, Playwright</p>
      <h3>Daily Tasks:</h3>
      <p>Write clean TypeScript code, Perform REST API integration, Configure test environments</p>
    </div>
  </main>
</body>
</html>
```

---

## 3. Test Case Schema

For test suite readability and structures, we define interfaces for scraper and matcher test cases.

```typescript
export interface ScraperTestCase {
  name: string;
  keyword: string;
  locations: string[];
  mockBehavior: {
    searchStatus: number;                     // HTTP status code to return for search (e.g. 200, 403, 500)
    searchPayloadType: 'ok' | 'empty' | 'malformed';
    detailStatus: number;                     // HTTP status code to return for details (e.g. 200, 404, 500)
    detailPayloadType: 'ok' | 'malformed';
    enableFallbackUrl: boolean;              // If API is blocked, mock HTML endpoints should be active
  };
  expectations: {
    expectedJobsCount: number;                // Expected number of ScrapedJob elements returned
    shouldFallbackToPlaywright: boolean;      // True if Playwright crawling is expected to fire
    firstJobId: string;                       // Expected prefix and slug (e.g., "nofluffjobs-senior-typescript-developer-budapest-xyz123")
  };
}

export interface MatcherTestCase {
  name: string;
  jobTitle: string;
  jobCompany: string;
  jobText: string;
  cvText: string;
  mockGeminiScore: number;
  expectations: {
    shouldTriggerWebhook: boolean;            // True if matchScore >= 80
    matchScore: number;
  };
}
```

---

## 4. Sandboxed E2E Environment Design

To perform E2E testing locally without sending real external requests:

### 4.1 Database Sandboxing
The test run will set the environment variable `DATABASE_FILE=jobs_test.db`. 
- The DB initialization script in `src/db/database.ts` will check this variable to open `jobs_test.db` instead of the production `jobs.db`.
- A test helper (`tests/helpers/testDb.ts`) will set up the DB, create schema, seed configuration values (e.g. mock CV, locations, and mock webhook URL), and delete the file upon test suite teardown.

### 4.2 Mock HTTP Server
A lightweight server (using Express) is launched on `http://localhost:5001` at the start of E2E tests:
1. **No Fluff Jobs Endpoints**:
   - `POST /api/search/posting` returns `nofluff_search_api_ok.json` (or empty based on test scenario).
   - `GET /api/posting/:slug` returns `nofluff_detail_api.json`.
   - `GET /hu/jobs` and `GET /hu/jobs/:city` returns `nofluff_search_page.html`.
   - `GET /hu/job/:slug` returns `nofluff_detail_page.html`.
2. **Profession.hu Endpoints**:
   - `GET /allasok/*` returns mock HTML containing job cards.
   - `GET /allas/*` returns mock HTML containing job details.
3. **Discord Webhook**:
   - `POST /mock-discord-webhook` intercepts the Discord alerts. E2E tests can query the mock server to assert that webhook payloads were successfully sent and structured correctly.

### 4.3 LLM / Gemini API Mocking
Since calling Google's Gemini API is costly, requires an API key, and lacks deterministic outputs, we intercept LLM queries:
- Set `MOCK_GEMINI=true` in test environments.
- In `src/matcher/gemini.ts`, if `MOCK_GEMINI === 'true'`, return canned structured JSON responses (e.g. simulating match results with specific scores based on keywords in the job title).

---

## 5. Required Code Changes & Configuration Support

The following adjustments in the source codebase are required to support local mock routing:

### 5.1 SQLite Database (`src/db/database.ts`)
Enable variable database files:

```typescript
// Before (Line 5):
const DB_FILE = path.join(process.cwd(), 'jobs.db');

// After:
const DB_FILE = path.join(process.cwd(), process.env.DATABASE_FILE || 'jobs.db');
```

### 5.2 Profession.hu Scraper (`src/scrapers/profession.ts`)
Make base URL configurable:

```typescript
// Add at the top of the file:
const PROFESSION_BASE_URL = process.env.PROFESSION_BASE_URL || 'https://www.profession.hu';

// In scrapeProfessionHu (Line 63, 72):
// Replace: searchUrls.push(`https://www.profession.hu/...`)
// With: searchUrls.push(`${PROFESSION_BASE_URL}/...`)

// In scrapeProfessionHu link parser (Line 126):
// Replace: fullUrl = `https://www.profession.hu${href}`;
// With: fullUrl = `${PROFESSION_BASE_URL}${href}`;
```

### 5.3 No Fluff Jobs Scraper (Proposed in `src/scrapers/nofluffjobs.ts`)
The new scraper must be built with mock-ready base URLs:

```typescript
const NOFLUFFJOBS_BASE_URL = process.env.NOFLUFFJOBS_BASE_URL || 'https://nofluffjobs.com';

// API search request: `${NOFLUFFJOBS_BASE_URL}/api/search/posting?salaryCurrency=HUF&salaryPeriod=month`
// API detail request: `${NOFLUFFJOBS_BASE_URL}/api/posting/${slug}`
// Crawler search request: `${NOFLUFFJOBS_BASE_URL}/hu/jobs/${city}?q=${keyword}`
// Crawler detail request: `${NOFLUFFJOBS_BASE_URL}/hu/job/${slug}`
```

### 5.4 Gemini Matcher (`src/matcher/gemini.ts`)
Mock response bypass when `MOCK_GEMINI=true`:

```typescript
// At the beginning of matchJobWithGemini:
if (process.env.MOCK_GEMINI === 'true') {
  const score = jobTitle.toLowerCase().includes('senior') ? 85 : 45;
  return {
    matchScore: score,
    pros: ['Matches developer experience', 'Strong tech stack alignment'],
    cons: ['Requires onsite presence occasionally'],
    justification: `The position of ${jobTitle} at ${jobCompany} matches the CV skills.`,
    parsedJob: {
      title: jobTitle,
      company: jobCompany,
      location: 'Budapest',
      description: 'Mocked job description from Gemini.',
      techStack: ['TypeScript', 'Node.js'],
      salary: '1000000 HUF'
    }
  };
}

// At the beginning of summarizeCv:
if (process.env.MOCK_GEMINI === 'true') {
  return `## Professional Summary\nConcise CV summary (mocked).`;
}
```
