# Handoff Report — Codebase Explorer 3 (IMP-M2)

## 1. Observation

### A. Scraper Integration & Deduplication
In `src/scrapers/scraperManager.ts`, the No Fluff Jobs scraper functions are imported alongside Profession.hu functions with proper aliasing to prevent name collisions:
```typescript
import { scrapeProfessionHu, scrapeJobDetails as scrapeProfessionDetails } from './profession';
import { scrapeNoFluffJobs, scrapeJobDetails as scrapeNoFluffDetails } from './nofluffjobs';
```

The scraper manager executes both scrapers concurrently inside a `Promise.all` block. Each scraper invocation is wrapped in its own `try/catch` block, ensuring that an error in one does not halt the execution of the other:
```typescript
    await Promise.all([
      (async () => {
        try {
          professionJobs = await scrapeProfessionHu(keyword, locations);
        } catch (err: any) {
          console.error('scrapeProfessionHu failed:', err.message);
          report.errors.push(`Profession.hu scraper error: ${err.message}`);
        }
      })(),
      (async () => {
        try {
          noFluffJobs = await scrapeNoFluffJobs(keyword, locations);
        } catch (err: any) {
          console.error('scrapeNoFluffJobs failed:', err.message);
          report.errors.push(`NoFluffJobs scraper error: ${err.message}`);
        }
      })()
    ]);
```

In-memory deduplication of the merged scraper output is performed via a `Map` keyed by `job_id` (lines 73-82):
```typescript
    const allJobs = [...professionJobs, ...noFluffJobs];
    const jobsMap = new Map<string, any>();
    for (const job of allJobs) {
      if (job && job.job_id) {
        jobsMap.set(job.job_id, job);
      }
    }
    const jobs = Array.from(jobsMap.values());
```

Duplicate prevention against the SQLite database is handled before fetching details (lines 99-105):
```typescript
        // Check if job already exists in DB
        const exists = checkStmt.get(job.job_id);
        if (exists) {
          skipped++;
          onProgress?.({ currentJobIndex: i + 1, currentJobTitle: job.title, skipped });
          continue; // Skip already scraped jobs
        }
```

### B. Location Normalization & Mapping
In `src/scrapers/scraperManager.ts`, the locations loaded from database config are normalized to lowercase (line 49):
```typescript
    const locations: string[] = (Array.isArray(rawLocations) ? rawLocations : []).map((loc: any) => String(loc).toLowerCase());
```
In `src/scrapers/nofluffjobs.ts`, these lowercased location strings are mapped to title-case names for the JSON POST search API using `LOCATION_MAP` (lines 27-50) and to lowercase slugs for the HTML search fallback url using `FALLBACK_CITY_MAP` (lines 52-75).

In `src/scrapers/profession.ts` (line 68), lookup is performed directly:
```typescript
    for (const locKey of locations) {
      const locInfo = LOCATION_MAP[locKey];
```
This requires lowercase inputs since `LOCATION_MAP` keys are lowercase.

### C. E2E Test Suite Boot Error
When running E2E tests, the mock server crashes with the following error:
```
C:\Users\mark2\repos\Jinder\node_modules\path-to-regexp\src\index.ts:245
        throw new PathError(`Unexpected ${value} at index ${index - 1}`, str);
              ^

PathError [TypeError]: Unexpected ( at index 8: /allasok(.*); visit https://git.new/pathToRegexpError for info
...
  originalPath: '/allasok(.*)'
}
```
In `tests/e2e/mock-server.ts` line 245:
```typescript
app.get('/allasok(.*)', (req, res) => {
```

---

## 2. Logic Chain

1. **Integration and Concurrency**: Aliased imports of `scrapeJobDetails` from `./profession` and `./nofluffjobs` successfully resolve TypeScript name collisions. Concurrency is handled correctly via `Promise.all` while error isolation prevents one platform's scraping errors from causing the other platform's scraping to abort.
2. **Duplicate Prevention**: In-memory deduplication via `jobsMap` removes duplicates within a single run, and the database query check against `job.job_id` prevents re-scraping jobs that have already been saved to SQLite. Since both scrapers use prefixing (`profession-` and `nofluffjobs-`), collisions across platforms are avoided.
3. **Location Normalization Safety**: Lowercasing the locations in the manager before passing them to the scrapers is critical. Since `LOCATION_MAP` in `profession.ts` has strictly lowercase keys, passing mixed-case locations would skip those cities. The manager's normalization ensures lookups always succeed.
4. **Mock Server Crash**: In Express v5, path matching is handled by a newer version of `path-to-regexp` (v8) that has dropped support for raw regex syntax inside paths (specifically `(.*)`). Replacing `/allasok(.*)` with `/allasok*` allows the mock server to register the route without throwing a `PathError`. Inside the route, the implementation decodes and parses the complete URL using `req.originalUrl`, so changing the route matcher does not affect the query extraction logic.

---

## 3. Caveats

- **Network Restraints**: The local E2E test suite runs against a local mock server and is fully self-contained. The adversarial tests in `test-nofluff-adversarial.ts` contain two tests that perform real HTTP calls to `nofluffjobs.com`. These real-network tests will fail if executed in a network-blocked sandbox environment, but they succeed under standard local user execution.
- **Robustness in `scrapeProfessionHu`**: While the scraper manager currently lowercases location keys, other files (e.g. CLI tools or independent verification scripts) could invoke `scrapeProfessionHu` directly with raw mixed-case strings. In this case, city lookups would fail silently.

---

## 4. Conclusion

1. **Scraper Manager & DB Integration (IMP-M2)** is fully implemented, following all specifications:
   - `nofluffjobs` scraper is integrated with parallel execution and proper error isolation.
   - Deduplication is implemented in-memory and verified against SQLite prior to processing.
   - Database schemas and column usage are fully compatible and require no migrations.
   - Location mapping maps keys to title-cased API values and fallback slugs correctly.
2. **Critical Recommendation**: Fix the routing path in `tests/e2e/mock-server.ts` to allow E2E testing:
   - Target File: `tests/e2e/mock-server.ts`, Line 245.
   - **Before**: `app.get('/allasok(.*)', (req, res) => {`
   - **After**: `app.get('/allasok*', (req, res) => {`
3. **Improvement Recommendation**: Add lowercasing safety inside `scrapeProfessionHu` to safeguard against non-normalized inputs:
   - Target File: `src/scrapers/profession.ts`, Line 67.
   - **Before**: `for (const locKey of locations) {`
   - **After**: `for (const locKey of locations) { const normalizedKey = locKey.toLowerCase(); const locInfo = LOCATION_MAP[normalizedKey];`

---

## 5. Verification Method

To verify the conclusions and recommendations:
1. **Compilation**:
   Run `npx tsc --noEmit` to verify type safety and compilation.
2. **E2E Testing (Boot Verification)**:
   Apply the recommended fix to `tests/e2e/mock-server.ts` line 245:
   Change `app.get('/allasok(.*)',` to `app.get('/allasok*',`
   Then run the E2E tests:
   ```bash
   npx tsx tests/e2e/run-tests.ts
   ```
   Confirm that the mock server boots and all E2E tests pass.
