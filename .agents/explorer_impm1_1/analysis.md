# No Fluff Jobs Scraper Analysis — Explorer 1 Report (IMP-M1)

This document provides a comprehensive analysis of the requirements and codebase integration needed to implement the No Fluff Jobs scraper for `nofluffjobs.com/hu`.

---

## 1. API Requirements & Investigation

### 1.1 Search POST Endpoint
- **URL**: `POST https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month`
- **Headers**:
  - `Content-Type: application/json`
  - `User-Agent`: Desktop browser user-agent rotation (helper `getRandomUserAgent()`)
  - `Accept`: `application/json, text/plain, */*`
- **Payload Format**:
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
  *Note: If no locations are specified or none are mapped, the `criteriaSearch.city` array should be empty or omitted.*

### 1.2 Detail GET Endpoint
- **URL**: `GET https://nofluffjobs.com/api/posting/<slug>`
- **Response Format (JSON)**:
  Contains structured object with `requirements` and `specs` fields:
  - `requirements.musts`: Array of objects representing mandatory qualifications.
  - `requirements.nices`: Array of objects representing optional/preferred qualifications.
  - `specs.dailyTasks`: Array of strings or objects representing duties.
  - `requirements.description`: String containing general description.

### 1.3 Slug Extraction Strategy
The `slug` is the unique job identifier required for the Detail GET endpoint.
1. **From Search API Response**:
   The response object from the search API contains a list of postings (`postings: any[]`). Each posting should be parsed to find the slug using fallback properties for maximum resilience:
   ```typescript
   const slug = posting.slug || posting.id || (posting.url ? posting.url.split('/').pop() : '');
   ```
2. **From User-Facing HTML**:
   Job listing cards on the user-facing search page target `/job/` detail pages. We select all anchor (`<a>`) elements on the results page where the `href` attribute matches:
   - **Regex Pattern**: `/\/job\/([^/?#]+)/`
   - *Example*: `/hu/job/senior-typescript-developer-budapest-xyz123` resolves to Slug: `senior-typescript-developer-budapest-xyz123`.

---

## 2. HTML Layout & Selection Fallback

### 2.1 Search Page Crawler (Playwright Fallback)
If the internal search API fails, gets blocked, or returns an empty result set:
- **Search URL Pattern**: `https://nofluffjobs.com/hu/jobs/${city}?q=${encodeURIComponent(keyword)}`
  - *Where `city` is the lowercase mapped city value (e.g., `budapest`, `pecs`, `debrecen`, `szeged`, `gyor`, `remote`).*
  - *If no cities are specified, fallback URL is: `https://nofluffjobs.com/hu/jobs?q=${encodeURIComponent(keyword)}`.*
- **Card Selection**: Anchor elements targeting `a[href*="/job/"]` or `a.posting-list-item`.
- **Card Data Extraction**:
  - **Title**: Within the anchor or nearest parent, select the position title using selectors like `h3`, `h4`, `.posting-title__position`, or any class containing `title` or `position`.
  - **Company**: Select company/brand using `.posting-title__brand`, `.company-name`, or any class containing `brand` or `company`.
  - **Location**: Select locations/places using `.posting-info__location`, `.posting-location`, or any class containing `location`.

### 2.2 Detail Page Fallback
If the internal detail API fails or gets blocked:
- **Fallback URL**: `https://nofluffjobs.com/hu/job/${slug}` (or the exact job link).
- **Extraction Flow (Cheerio)**:
  1. Load fetched HTML into Cheerio.
  2. Strip bloated elements: `script, style, svg, iframe, nav, footer, header, noscript`.
  3. Extract text content from main container elements: `.posting-details`, `nfj-posting-details`, `main`, or `body`.
  4. Replace contiguous whitespace/newlines with a single space and trim.

### 2.3 Detail Fields Extraction from JSON Response
When the JSON API succeeds, we extract details from `requirements.musts`, `requirements.nices`, `specs.dailyTasks`, and `requirements.description` using a robust mapper:
```typescript
const extractValue = (item: any): string => {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.value || item.name || JSON.stringify(item);
};

const musts = (data.requirements?.musts || []).map(extractValue).filter(Boolean).join(', ');
const nices = (data.requirements?.nices || []).map(extractValue).filter(Boolean).join(', ');
const dailyTasks = (data.specs?.dailyTasks || []).map(extractValue).filter(Boolean).join(', ');
const description = data.requirements?.description || '';
```
We combine these into a single text block suitable for Gemini semantic matching:
```typescript
const parts: string[] = [];
if (musts) parts.push(`Requirements (Must): ${musts}`);
if (nices) parts.push(`Requirements (Nice): ${nices}`);
if (dailyTasks) parts.push(`Daily Tasks: ${dailyTasks}`);
if (description) parts.push(`Description: ${description}`);
const cleanedDetails = parts.join('\n\n');
```

---

## 3. Reference Structure (`profession.ts`)

The Profession.hu scraper (`src/scrapers/profession.ts`) serves as the architectural blueprint:
1. **Interface Contract**: Implements the `ScrapedJob` interface exported from `profession.ts`:
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
2. **User Agent Rotation**: Implements a `USER_AGENTS` list and `getRandomUserAgent()` function.
3. **Resilience Strategy**: Uses Axios first. On error, launches headless Playwright browser to load the page content, extracting HTML and parsing via Cheerio.
4. **Politeness Delay**: Implements a delay (e.g., 1000ms-1500ms) between subsequent page scrapes to avoid IP blocks.

---

## 4. Step-by-Step Implementation Strategy for `src/scrapers/nofluffjobs.ts`

### Step 1: Setup File & Constants
- Create `src/scrapers/nofluffjobs.ts`.
- Import `axios`, `* as cheerio`, `chromium` (from Playwright), and the `ScrapedJob` interface.
- Define `USER_AGENTS` array and `getRandomUserAgent()` helper.
- Define `LOCATION_MAP` for user locations mapping to No Fluff Jobs specific API and URL formats:
  ```typescript
  const LOCATION_MAP: Record<string, { apiVal: string, urlVal: string }> = {
    'budapest': { apiVal: 'Budapest', urlVal: 'budapest' },
    'pecs': { apiVal: 'Pécs', urlVal: 'pecs' },
    'debrecen': { apiVal: 'Debrecen', urlVal: 'debrecen' },
    'szeged': { apiVal: 'Szeged', urlVal: 'szeged' },
    'gyor': { apiVal: 'Győr', urlVal: 'gyor' },
    'tavmunka': { apiVal: 'remote', urlVal: 'remote' },
    'home_office': { apiVal: 'remote', urlVal: 'remote' }
  };
  ```

### Step 2: Implement `scrapeNoFluffJobs`
- Signature: `export async function scrapeNoFluffJobs(keyword: string, locations?: string[]): Promise<ScrapedJob[]>`
- Map input locations to `apiCities` and `urlCities` arrays using `LOCATION_MAP`.
- **API Flow (Axios)**:
  - Make `POST https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month` with body:
    ```json
    {
      "rawSearch": "<keyword>",
      "page": 1,
      "pageSize": 100,
      "criteriaSearch": { "city": [<apiCities>] }
    }
    ```
  - Parse the response. Extract postings and build `ScrapedJob` objects, mapping unique `job_id` as `'nofluffjobs-' + slug` and `platform` as `'nofluffjobs'`.
- **Fallback Flow (Playwright)**:
  - If the API request fails, falls back to crawling.
  - Construct URLs:
    - If `urlCities` contains values, construct `https://nofluffjobs.com/hu/jobs/${city}?q=${keyword}` for each city.
    - Otherwise, query `https://nofluffjobs.com/hu/jobs?q=${keyword}`.
  - Launch Playwright, fetch HTML, parse with Cheerio to extract cards, title, company, location, and link, then populate `ScrapedJob` objects.
- De-duplicate results by job URL.

### Step 3: Implement `scrapeJobDetails`
- Signature: `export async function scrapeJobDetails(link: string): Promise<string>`
- Extract `slug` from the `link` by splitting and taking the last path segment, removing trailing slashes or query parameters:
  ```typescript
  const cleanLink = link.endsWith('/') ? link.slice(0, -1) : link;
  const slug = cleanLink.split('/').pop()?.split('?')[0]?.split('#')[0] || '';
  ```
- **API Flow (Axios)**:
  - Fetch `GET https://nofluffjobs.com/api/posting/${slug}`.
  - If successful, map structured fields (`musts`, `nices`, `dailyTasks`, `description`) into a combined string.
- **Fallback Flow (Axios/Playwright HTML Scrape)**:
  - If Detail API fails or combined text block is empty, fetch the job detail HTML page.
  - Use Cheerio to remove scripts/styles/SVGs, extract text from `.posting-details`, `nfj-posting-details`, `main`, or `body`, and clean whitespace.
