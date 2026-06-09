# Analysis - No Fluff Jobs Scraper (IMP-M1)

This document details the analysis of the requirements, API structure, HTML selectors, and the implementation strategy for the No Fluff Jobs scraper (`src/scrapers/nofluffjobs.ts`) to be integrated into Jinder.

---

## 1. API Requirements & Details

### A. Search POST Endpoint
* **URL**: `POST https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month`
* **Headers**:
  * `Content-Type: application/json`
  * `User-Agent`: A random, realistic user agent string to avoid cloudflare/WAF block.
  * `Accept-Language`: `hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7`
* **Payload Format**:
  ```json
  {
    "rawSearch": "<keyword>",
    "page": 1,
    "pageSize": 100,
    "criteriaSearch": {
      "city": ["<mapped_locations>"]
    }
  }
  ```
* **Location Mapping Table**:
  * `budapest` -> `"Budapest"`
  * `pecs` -> `"Pécs"`
  * `debrecen` -> `"Debrecen"`
  * `szeged` -> `"Szeged"`
  * `gyor` -> `"Győr"`
  * `tavmunka` -> `"remote"`
  * `home_office` -> `"remote"`

If `locations` is not provided or empty, the `"criteriaSearch"` block can be omitted or set to `{}` to search globally.

### B. Detail GET Endpoint
* **URL**: `GET https://nofluffjobs.com/api/posting/<slug>`
* **Headers**:
  * `User-Agent`: A random user agent.
  * `Accept`: `application/json`

### C. Slug Extraction
The slug represents the unique identifier of a posting on No Fluff Jobs (e.g., `senior-react-developer-budapest-xyz123`).
* **From Search Response (JSON)**: 
  Each posting item in the `postings` array has a `.slug` field.
* **From User-Facing HTML (Playwright Fallback)**:
  Job links in the HTML search results page point to `https://nofluffjobs.com/hu/job/<slug>` or `/hu/job/<slug>`. 
  We can extract the slug using a regex: `/\/job\/([^/?#]+)/` on the anchor's `href` attribute.

---

## 2. HTML Layout Analysis (nofluffjobs.com/hu)

If internal API calls are blocked or fail, the scraper falls back to crawling user-facing HTML pages.

### A. Search Results Page Crawling
* **URL Structure**: 
  `https://nofluffjobs.com/hu/jobs/${city}?q=${encodeURIComponent(keyword)}`
  where `${city}` is the lowercase name of the city mapped with accents removed:
  * `"Budapest"` -> `budapest`
  * `"Pécs"` -> `pecs`
  * `"Debrecen"` -> `debrecen`
  * `"Szeged"` -> `szeged`
  * `"Győr"` -> `gyor`
  * `"remote"` -> `remote`
  If no cities are specified: `https://nofluffjobs.com/hu/jobs?q=${encodeURIComponent(keyword)}`
* **Job Link Element Selection**:
  * Selector: `a[href*="/job/"]`
  * Extract:
    * `link`: Make absolute if relative (prefixed with `https://nofluffjobs.com`).
    * `slug`: Extract using `link.match(/\/job\/([^/?#]+)/)`.
    * `title`: Target header elements within the anchor, such as `h3`, `h4`, `[class*="position"]`, or `[class*="title"]`. Fallback to the anchor's trimmed text.
    * `company`: Target span or div elements inside the anchor with classes like `[class*="company"]` or `.company-name`.
    * `location`: Target span or div elements inside the anchor with classes like `[class*="location"]`, `[class*="city"]`.

### B. Detail Page Fallback
* **URL**: `https://nofluffjobs.com/hu/job/<slug>` (or plain `/job/<slug>`)
* **JSON Structure & Fields**:
  From the JSON detail API, we extract:
  * `requirements.musts`: Array of objects or strings. We extract the `.value` or `.name` property.
  * `requirements.nices`: Array of objects or strings. We extract the `.value` or `.name` property.
  * `specs.dailyTasks`: Array of strings.
  * `requirements.description`: String containing description text/HTML.
* **HTML Crawl Selection (If Detail API fails)**:
  We load the page using Axios or Playwright, remove non-content elements (`script, style, svg, iframe, nav, footer, header, noscript`), and extract the text from content divs:
  * Target main detail container: `.posting-details, [class*="posting-details"], main, body`
  * Clean whitespace: `.replace(/\s+/g, ' ').trim()`

---

## 3. Review of `src/scrapers/profession.ts`

Key patterns observed in the Profession.hu scraper:
1. **User Agent Rotation**: Avoids scraping detection using `USER_AGENTS` array and `getRandomUserAgent()`.
2. **Dual-Fetch Strategy**: Always attempts Axios first for speed, falling back to Playwright if Axios fails or returns blank content.
3. **Cheerio Cleanup**: Cleans up text by removing script tags, style sheets, and non-semantic SVGs.
4. **Typing & Structure**: Exports `ScrapedJob` and adheres to a specific signature for both search and detail scraping functions.

---

## 4. Step-by-Step Implementation Strategy for `src/scrapers/nofluffjobs.ts`

### Step 1: Interface & Helpers Setup
* Copy/import user-agent helpers and define the exported functions:
  ```typescript
  export interface ScrapedJob {
    job_id: string;
    platform: string;
    title: string;
    company: string;
    location: string;
    link: string;
    rawText: string;
  }
  ```

### Step 2: Implement Location Mapping
* Set up a mapper dictionary mirroring the specified mapping rules:
  ```typescript
  const LOCATION_MAP: Record<string, string> = {
    'budapest': 'Budapest',
    'pecs': 'Pécs',
    'debrecen': 'Debrecen',
    'szeged': 'Szeged',
    'gyor': 'Győr',
    'tavmunka': 'remote',
    'home_office': 'remote'
  };
  ```

### Step 3: Implement Search Postings Logic (`scrapeNoFluffJobs`)
* Try POST to `https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month` using `axios`.
* If JSON API returns postings, parse them:
  * Extract slug, title, company, location (handling nested objects robustly), and build the URL/IDs.
* If POST fails, gets blocked, or returns an empty list, launch Playwright to fetch HTML search result pages.
* Construct search URLs: `https://nofluffjobs.com/hu/jobs/${citySlug}?q=${keyword}` (normalize accents).
* Use Cheerio to parse the HTML and find job links, titles, and companies.

### Step 4: Implement Detail Extraction Logic (`scrapeJobDetails`)
* Parse the slug from the URL link.
* If slug is present, attempt GET to `https://nofluffjobs.com/api/posting/<slug>`.
* If JSON response is obtained, extract description, musts, nices, and daily tasks. Format into a structured markdown block:
  ```markdown
  Job Description:
  <description text>

  Requirements (Must Have):
  - <must1>
  - <must2>

  Requirements (Nice to Have):
  - <nice1>

  Daily Tasks:
  - <task1>
  ```
* If JSON API fails, fall back to fetching the full HTML page (via Axios first, then Playwright).
* Remove unwanted HTML tags using Cheerio and extract the page's main content body text.
