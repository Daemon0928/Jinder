# Handoff Report — No Fluff Jobs Scraper Verification (IMP-M1)

## 1. Observation

- **Command executed**: `npx tsx test-nofluff-adversarial.ts` (created and executed to simulate failures).
- **Result 1 (Search Fallback crash)**:
  ```
  --- Test 5: Complete Search Failure (API and Playwright both fail) ---
  Scraping No Fluff Jobs for keyword: "javascript"...
  Querying search API with payload: {"rawSearch":"javascript","page":1,"pageSize":100}
  No Fluff Jobs search API failed: Simulated API POST failure. Falling back to Playwright...
  API search failed or returned 0 results. Running Playwright fallback search crawl...
  ❌ Test 5 Failed (crashed instead of returning empty array): Simulated Playwright browser launch failure
  ```
- **Result 2 (Details Fallback crash)**:
  ```
  --- Test 8: Total details failure (API + Axios + Playwright) ---
  No Fluff Jobs detail API failed for slug: critical-failure. Falling back to HTML crawl... Simulated network failure for Axios GET
  Axios detail page fetch failed for https://nofluffjobs.com/hu/job/critical-failure. Falling back to Playwright... Simulated network failure for Axios GET
  ❌ Test 8 Failed (crashed instead of returning empty string): Simulated Playwright launch failure
  ```
- **Result 3 (Cheerio Duplication)**:
  ```
  --- Test 6: Detail API fails, falling back to Axios HTML GET ---
  No Fluff Jobs detail API failed for slug: senior-js-developer. Falling back to HTML crawl... Simulated API GET failure (404 Not Found)
  Mocking Axios GET HTML for: https://nofluffjobs.com/hu/job/senior-js-developer
  Test 6 details content:
  "Senior JS Developer Requirements: React, Node.js, TypeScript Tasks: Build amazing apps, write tests. Senior JS Developer Requirements: React, Node.js, TypeScript Tasks: Build amazing apps, write tests. Senior JS Developer Requirements: React, Node.js, TypeScript Tasks: Build amazing apps, write tests."
  ```
- **Result 4 (Remote Filtering Drop)**:
  ```
  --- Test 3: Invalid locations in parameter ---
  Scraping No Fluff Jobs for keyword: "javascript"...
  Querying search API with payload: {"rawSearch":"javascript","page":1,"pageSize":100,"criteriaSearch":{"city":["Budapest"]}}
  ```
  When passing `['remote']` directly as a parameter, the payload has no `criteriaSearch` at all (as shown when passing no valid locations), falling back to global search.
- **File target**: `src/scrapers/nofluffjobs.ts`

---

## 2. Logic Chain

1. **Playwright Search Crash**: In `src/scrapers/nofluffjobs.ts`, when the API POST fails, the execution falls back to Playwright search crawling. The code calls `const browser = await chromium.launch({ headless: true });` outside the `try...finally` block. If this launch throws an error, the promise rejects and the function fails with an unhandled exception instead of returning the empty `jobs` array.
2. **Playwright Details Crash**: In `src/scrapers/nofluffjobs.ts`, inside `scrapeJobDetails`'s outer Axios catch block, `const browser = await chromium.launch({ headless: true });` is executed outside the nested `try...catch` block. If `chromium.launch` fails here, it propagates directly, crashing the details scraper loop.
3. **Cheerio Duplication**: In `src/scrapers/nofluffjobs.ts`, the selector `$('main, [class*="job-description"], body')` is used to extract HTML page details. Cheerio matches all three nested elements and concatenates their text content, returning the description 3x duplicated.
4. **Missing 'remote' mapping**: The dictionaries `LOCATION_MAP` and `FALLBACK_CITY_MAP` lack `'remote'` key mapping. When input is `'remote'`, it is filtered out of `mappedLocations` and `fallbackCities`. If no other valid locations are specified, this drops the criteria filter, triggering a global search instead of remote filtering.

---

## 3. Caveats

- We did not verify DB insertion of duplicate descriptions, but since `jobs.db` holds whatever description string is returned by `scrapeJobDetails`, the duplicated text will end up in the DB and then in Gemini matcher.
- Playwright fallback search crawl matches items using class names like `.posting-title__position` and `.company-name`. If the site's layout changes, the fallback will return 0 results (which is handled gracefully, but we can't guarantee selectors will never break).

---

## 4. Conclusion

The No Fluff Jobs scraper contains critical robustness vulnerabilities: Playwright browser launch failures (e.g. on server environments without Chromium binaries or under memory pressure) trigger unhandled crashes in both search and details functions. Additionally, HTML scraping fallbacks suffer from a 3x text duplication defect, and the `'remote'` location parameter is dropped.

---

## 5. Verification Method

To independently verify these findings, run the adversarial test suite:
1. Run command: `npx tsx test-nofluff-adversarial.ts` in the workspace root.
2. Check output:
   - Verify that Test 7 and Test 8 print crash errors (`❌ Test 5 Failed...` and `❌ Test 8 Failed...` or warnings about unhandled rejection).
   - Verify that Test 6 prints duplicated text in details content.
   - Verify that Test 3b fails to filter by remote.
