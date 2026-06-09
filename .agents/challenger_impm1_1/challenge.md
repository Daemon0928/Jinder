# Challenge Report — 2026-06-05T19:05:00+02:00

## Challenge Summary

**Overall risk assessment**: MEDIUM

While the basic search flow, details extraction, API querying, and first-level HTML scraping fallbacks (Axios) are functional and robust, the scraper suffers from two unhandled exceptions if the browser environment fails to launch chromium (e.g. missing dependencies, lack of memory, or missing Playwright binaries).

## Challenges

### [Medium] Challenge 1: Unhandled browser launch failures in Playwright fallbacks

- **Assumption challenged**: The scraper assumes that Playwright `chromium.launch()` will always succeed if a fallback to browser crawling is required.
- **Attack scenario**: If the scraping is run in a minimal Docker container, a server environment lacking Chromium dependencies, or under resource exhaustion (OOM), `chromium.launch()` will throw an exception.
- **Blast radius**: Since `chromium.launch()` is positioned outside of the main `try` blocks in both `scrapeNoFluffJobs` (line 143) and `scrapeJobDetails` (line 298), the exception is uncaught within the scraper methods. It propagates to the calling agent (Scraper Manager), which will crash or fail the entire scrape operation unless it catches the error at the outer level.
- **Mitigation**: Move the `chromium.launch` statement inside the `try` block in both functions.
  - In `scrapeNoFluffJobs`:
    ```typescript
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      // ... navigation and parsing
    } catch (pwError) {
      console.error(`Playwright search fallback failed: ${pwError.message}`);
    } finally {
      if (browser) await browser.close();
    }
    ```
  - In `scrapeJobDetails`:
    ```typescript
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      // ... newPage, goto, etc.
    } catch (pwError) {
      console.error(`Playwright detail fallback failed: ${pwError.message}`);
      return '';
    } finally {
      if (browser) await browser.close();
    }
    ```

### [Low] Challenge 2: Location parameter vulnerability to leading/trailing whitespace

- **Assumption challenged**: The scraper assumes input location string elements will be trimmed of whitespace.
- **Attack scenario**: If location strings passed from the manager contain leading/trailing whitespaces (e.g., `[' budapest ']`), they will fail to match the `LOCATION_MAP` keys.
- **Blast radius**: The location filter is silently ignored (mapped to `undefined` and filtered out). This defaults the search to a broader scope than requested, potentially fetching and matching jobs from unwanted cities.
- **Mitigation**: Update the location mapping code to trim input locations:
  ```typescript
  const mappedLocations = Array.from(new Set(
    (locations || [])
      .map(loc => LOCATION_MAP[loc.trim().toLowerCase()])
      .filter((loc): loc is string => !!loc)
  ));
  ```

## Stress Test Results

- **Scenario 1**: Search with empty keyword (`keyword = ""`)
  - **Expected behavior**: Handled gracefully (e.g. return empty array or search all).
  - **Actual behavior**: API search returned 160 postings successfully.
  - **Status**: PASS

- **Scenario 2**: Special characters in keyword (`keyword = "C# / .NET & C++"`)
  - **Expected behavior**: Special characters URL-encoded properly or posted correctly in JSON payload.
  - **Actual behavior**: API search queried payload correctly, returned 187 postings successfully.
  - **Status**: PASS

- **Scenario 3**: Invalid location parameter (`locations = ['narnia', 'invalid_city', 'budapest']`)
  - **Expected behavior**: Ignores invalid locations and processes valid ones.
  - **Actual behavior**: Filtered out invalid entries, mapped `'budapest'` to `'Budapest'`, successfully returned 22 postings.
  - **Status**: PASS

- **Scenario 4**: API search fails, Playwright search succeeds (Playwright search fallback)
  - **Expected behavior**: Fallback to Playwright search, extract postings correctly.
  - **Actual behavior**: Fell back to Playwright search, parsed the HTML using Cheerio, and returned 20 scraped jobs with correct fields.
  - **Status**: PASS

- **Scenario 5**: Details API fails, Axios HTML details succeeds (Details level 1 fallback)
  - **Expected behavior**: Fallback to Axios HTML fetch and extract page text.
  - **Actual behavior**: Warned about API failure, successfully fetched HTML text via Axios (8527 characters returned).
  - **Status**: PASS

- **Scenario 6**: Details API & Axios HTML fail, Playwright details succeeds (Details level 2 fallback)
  - **Expected behavior**: Fallback to Playwright HTML fetch and extract page text.
  - **Actual behavior**: Warned about API and Axios failures, successfully fetched HTML text via Playwright (8527 characters returned).
  - **Status**: PASS

- **Scenario 7**: API search fails, Playwright browser launch fails (Uncaught search fallback failure)
  - **Expected behavior**: Return empty array `[]` gracefully.
  - **Actual behavior**: Unhandled exception thrown: `Error: Simulated Playwright browser launch failure (Executable not found)`.
  - **Status**: FAIL (Bug)

- **Scenario 8**: Details API, Axios details, and Playwright browser launch fail (Uncaught details fallback failure)
  - **Expected behavior**: Return empty string `""` gracefully.
  - **Actual behavior**: Unhandled exception thrown: `Error: Simulated Playwright browser launch failure (Executable not found)`.
  - **Status**: FAIL (Bug)

## Unchallenged Areas

- **Gemini integration / DB storage** — Out of scope for this sub-task; focused purely on scraping correctness and robustness of `src/scrapers/nofluffjobs.ts`.
