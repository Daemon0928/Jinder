# Adversarial Review & Stress Testing Report — No Fluff Jobs Scraper

## Challenge Summary

**Overall risk assessment**: MEDIUM

While the basic functionality of the No Fluff Jobs scraper works perfectly under happy path conditions (fetching postings and details via reverse-engineered JSON APIs), the scraper has several robustness gaps, logic flaws, and crash vulnerabilities under failure and edge-case scenarios. Specifically, Playwright browser launch failures cause unhandled crashes, overlapping Cheerio selectors cause 3x description duplication (token bloat), and direct `'remote'` location query parameters are silently dropped.

---

## Challenges

### [High] Challenge 1: Uncaught Playwright Launch Failure during Search Fallback

- **Assumption challenged**: The browser launch sequence in the search fallback block is assumed to be error-free.
- **Attack scenario**: If Chromium binaries are missing or the Playwright browser fails to launch (e.g., system OOM, permission error, lack of GUI dependencies), `chromium.launch` throws an error.
- **Blast radius**: The search API failure catch block will trigger the Playwright fallback search crawl, which immediately crashes. Because the browser launch is outside the `try...finally` block and is not caught inside `scrapeNoFluffJobs`, the entire scrape run terminates with an unhandled rejection, rather than returning whatever was scraped or an empty array.
- **Mitigation**: Wrap `chromium.launch` in a `try...catch` block. Ensure `browser` is checked for existence before calling `browser.close()`. Return the `jobs` array (which may be empty).

---

### [High] Challenge 2: Uncaught Playwright Launch Failure in Detail Scraper Fallback

- **Assumption challenged**: The Playwright detail fallback launch sequence is assumed to be safe from failure.
- **Attack scenario**: If the detail API and Axios page GET both fail, the code attempts to launch Playwright:
  ```typescript
  } catch (error: any) {
    console.warn(`Axios detail page fetch failed for ${jobUrl}. Falling back to Playwright...`, error.message);
    const browser = await chromium.launch({ headless: true }); // <--- THROW POINT
    try {
      const page = await browser.newPage({ ... });
      ...
    } catch (pwError: any) {
      ...
    } finally {
      await browser.close();
    }
  }
  ```
  Since `chromium.launch` is located inside the outer catch block but *outside* the nested `try...catch`, any error thrown during launch propagates out of `scrapeJobDetails` completely.
- **Blast radius**: The entire job details fetch crashes, causing the Scraper Manager loop to crash and aborting the process for subsequent jobs.
- **Mitigation**: Wrap the browser instantiation, page loading, and cleanup entirely in a single `try...catch` block so that launch failures are caught and handled gracefully (returning an empty string `""` so the calling loop can continue).

---

### [Medium] Challenge 3: Overlapping Cheerio Selectors Cause Text Content Duplication (Token Bloat)

- **Assumption challenged**: The Cheerio selector query `main, [class*="job-description"], body` retrieves a single distinct block of text.
- **Attack scenario**: In the HTML details fallback:
  ```typescript
  const mainContent = $('main, [class*="job-description"], body');
  const text = mainContent.length ? mainContent.text() : $('body').text();
  ```
  If the page contains `<body>`, `<main>`, and `<div class="job-description">`, the jQuery/Cheerio selector matches all three elements. Calling `.text()` on a matched set concatenates the text of each element. Since they are nested (body contains main, main contains description), the text of the job description is duplicated up to 3 times in the output.
- **Blast radius**: Significant token bloat in the job descriptions sent to Gemini, increasing LLM latency, cost, and risk of context limit overflow.
- **Mitigation**: Prioritize selectors sequentially instead of concurrently. Check for the most specific element first:
  ```typescript
  let element = $('[class*="job-description"]');
  if (!element.length) element = $('main');
  if (!element.length) element = $('body');
  const text = element.text();
  ```

---

### [Medium] Challenge 4: Missing 'remote' Mapping in Location Maps

- **Assumption challenged**: All common location inputs (including `'remote'`) are mapped to the platform's location filters.
- **Attack scenario**: If a caller calls `scrapeNoFluffJobs('javascript', ['remote'])`, both `LOCATION_MAP` and `FALLBACK_CITY_MAP` lack a `'remote'` key. As a result, the location parameter gets filtered out entirely.
- **Blast radius**: The scraper silently falls back to a global search (unfiltered by location) instead of running a remote-only search.
- **Mitigation**: Add `'remote': 'remote'` to `LOCATION_MAP` and `FALLBACK_CITY_MAP`.

---

## Stress Test Results

- **Empty input keyword (`""`)** → Return list of all jobs without crashing → Returned 160 postings → **PASS**
- **Special characters in keyword (`"C++"`, `"C# / .NET & C++"`)** → URL encodes search term, does not crash, returns jobs → Returned 187 postings → **PASS**
- **Invalid location parameter (`['narnia', 'invalid_city']`)** → Filters out invalid, falls back to global or valid locations → Kept valid (`budapest` -> `Budapest`), ignored invalid → **PASS**
- **API POST fails, Playwright search succeeds** → Fallback to Playwright and crawl page → Switched to Playwright and crawled 20 jobs → **PASS**
- **API POST and Playwright search both fail** → Handle error, return empty array `[]` without throwing → Crashed on Playwright launch → **FAIL** (See Challenge 1)
- **Detail API fails, Axios HTML GET succeeds** → Extract content from HTML via Cheerio → Extracted text, but duplicated 3x due to selector overlap → **PASS (with duplication defect)** (See Challenge 3)
- **Detail API and Axios HTML GET fail, Playwright succeeds** → Fallback to Playwright crawl for details → Extracted details via Playwright → **PASS**
- **Detail API, Axios GET, and Playwright details all fail** → Handle error, return empty string `""` without throwing → Crashed on Playwright launch → **FAIL** (See Challenge 2)
- **Keyword with `'remote'` location parameter** → Filters search to remote postings → Parameter filtered out, falls back to global search → **FAIL** (See Challenge 4)

---

## Unchallenged Areas

- **Gemini Matcher / SQLite DB integration** — Out of scope for this review. Verified only the interface contract and scraping functions of `src/scrapers/nofluffjobs.ts`.
