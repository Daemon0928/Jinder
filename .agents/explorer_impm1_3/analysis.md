# No Fluff Jobs Scraper Analysis — IMP-M1

## 1. API Requirements & Endpoints

### 1.1 Search POST Endpoint
- **URL**: `POST https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month`
- **Headers**:
  - `Content-Type: application/json`
  - `User-Agent`: Randomly rotated desktop browser user agent
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
  *Note: If no locations are specified, `criteriaSearch` should be omitted or `city` array left empty.*

### 1.2 Detail GET Endpoint
- **URL**: `GET https://nofluffjobs.com/api/posting/<slug>`
- **Response Format (JSON)**:
  Typically contains structured fields representing requirements, specifications, and descriptions.

### 1.3 Slug Extraction Strategy
To load job details, we must extract the unique identifier (`slug`) for each job posting:
1. **From Search API Response**:
   Each posting object in the JSON returned by the search API contains a slug identifier. We should fallback across the following fields for maximum robustness:
   - `posting.slug` (direct property)
   - `posting.id` (often maps to the slug string)
   - `posting.postingUrl` or `posting.url` (parse the last path segment: `url.split('/').pop()`)
2. **From User-Facing HTML**:
   Job listing cards link to detail pages. We select all anchor (`<a>`) elements on the search results page where the `href` matches `/job/`.
   - **Regex for Slug Extraction**: `/\/job\/([^/?#]+)/`
     *Example*: `/hu/job/senior-typescript-developer-budapest-xyz123` -> Slug: `senior-typescript-developer-budapest-xyz123`

---

## 2. HTML Layout & Selection Fallback

### 2.1 Search Page Crawler (Playwright Fallback)
If the internal search API is blocked or returns empty:
- **Search URL**: `https://nofluffjobs.com/hu/jobs/${citySlug}?q=${encodeURIComponent(keyword)}`
  - *Where `citySlug` matches mapped city values in lowercase (e.g., `budapest`, `pecs`, `remote`).*
- **Card Selection**: Anchor elements targeting `a[href*="/job/"]` or `a.posting-list-item`.
- **Card Data Extraction**:
  - **Title**: Select inside card using `h3`, `.posting-title__position`, or classes containing `title` / `position`.
  - **Company**: Select inside card using `.posting-title__brand`, `.company-name`, or classes containing `brand` / `company`.
  - **Location**: Select inside card using `.posting-info__location`, `.posting-location`, or classes containing `location`.

### 2.2 Detail Page Fallback
If the internal detail API fails, fetch the HTML page `https://nofluffjobs.com/hu/job/<slug>` via Axios or Playwright:
- **HTML Cleaning**:
  1. Load HTML into Cheerio.
  2. Remove elements that inflate token count: `script`, `style`, `svg`, `iframe`, `nav`, `footer`, `header`, `noscript`.
  3. Extract text from `.posting-details`, `nfj-posting-details`, `main`, or fallback to `body`.
  4. Replace multiple spaces/newlines with a single space and trim.

### 2.3 Detail Fields Extraction from JSON Response
When the detail JSON API succeeds, we extract information from the following fields:
- **Must-have Requirements**: `requirements.musts` (Array of objects/strings)
- **Nice-to-have Requirements**: `requirements.nices` (Array of objects/strings)
- **Daily Tasks**: `specs.dailyTasks` (Array of strings/objects)
- **General Description**: `requirements.description` (String)

**Robust Extraction Logic**:
```typescript
const extractValue = (item: any): string => {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return item.value || item.name || JSON.stringify(item);
};

const musts = (details.requirements?.musts || []).map(extractValue).filter(Boolean).join(', ');
const nices = (details.requirements?.nices || []).map(extractValue).filter(Boolean).join(', ');
const dailyTasks = (details.specs?.dailyTasks || []).map(extractValue).filter(Boolean).join(', ');
const description = details.requirements?.description || '';
```
We then format these into a single structured text block:
```typescript
const textParts = [];
if (musts) textParts.push(`Requirements (Must): ${musts}`);
if (nices) textParts.push(`Requirements (Nice): ${nices}`);
if (dailyTasks) textParts.push(`Daily Tasks: ${dailyTasks}`);
if (description) textParts.push(`Description: ${description}`);
const cleanedDetailsText = textParts.join('\n\n');
```

---

## 3. Reference Structure (`profession.ts`)

`src/scrapers/profession.ts` provides the structural template:
1. **Interface**: Uses `ScrapedJob` interface containing `job_id`, `platform`, `title`, `company`, `location`, `link`, and `rawText`.
2. **User Agent Rotation**: Employs `USER_AGENTS` array and `getRandomUserAgent()` helper.
3. **Politeness Delays**: Includes small delays between search pages and a `1500` ms delay between detail fetches.
4. **Resiliency**: Tries fast HTTP requests (Axios) first, then falls back to Playwright if blocked.
5. **Cheerio Cleaning**: Cleans page text by stripping heavy elements (scripts, styles, SVGs).

---

## 4. Step-by-Step Implementation Strategy for `nofluffjobs.ts`

### Step 1: File Setup and Infrastructure
- Create `src/scrapers/nofluffjobs.ts`.
- Import necessary packages: `axios`, `* as cheerio`, `chromium` from `playwright`, and import `ScrapedJob` from `./profession`.
- Implement `USER_AGENTS` array, `getRandomUserAgent()`, and the location mapping map.

### Step 2: Location Mapping
- Define `LOCATION_MAP` mapping user locations to No Fluff Jobs cities:
  - `budapest` -> `Budapest`
  - `pecs` -> `Pécs`
  - `debrecen` -> `Debrecen`
  - `szeged` -> `Szeged`
  - `gyor` -> `Győr`
  - `tavmunka` or `home_office` -> `remote`
- In `scrapeNoFluffJobs`, translate the `locations` argument into No Fluff Jobs city values.

### Step 3: Implement `scrapeNoFluffJobs`
- Accept `keyword: string` and `locations?: string[]`.
- Build the API payload.
- Try `POST https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month` using Axios.
- Parse JSON to extract basic metadata and construct `ScrapedJob` entries.
- **API Fallback**: If the API call fails or yields no results, launch Playwright to crawl the search pages `https://nofluffjobs.com/hu/jobs/${city}?q=${keyword}`. Loop over results, extracting cards and basic info.

### Step 4: Implement `scrapeJobDetails`
- Accept `link: string` representing the job URL.
- Extract the slug from the URL.
- Try `GET https://nofluffjobs.com/api/posting/${slug}` using Axios.
- Parse JSON and combine musts, nices, daily tasks, and description.
- **Detail Fallback**: If detail API call fails, fetch `https://nofluffjobs.com/hu/job/${slug}` HTML via Axios/Playwright. Load HTML into Cheerio, strip unwanted elements, extract text from `.posting-details` / `main` / `body` and return cleaned string.
