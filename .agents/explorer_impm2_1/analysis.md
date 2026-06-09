# No Fluff Jobs Integration Analysis & Implementation Strategy

## Executive Summary
This document outlines the strategy to integrate the `nofluffjobs` scraper and its detail-fetching mechanism into the core scraper manager (`src/scrapers/scraperManager.ts`) and database (`jobs.db`) of Jinder. The existing database schema is fully compatible with both platforms, and the location mapping keys map cleanly between the client configuration and both scrapers. Graceful error handling and deduplication are recommended to ensure reliability and performance.

---

## 1. Import and Integration in `scraperManager.ts`

### Naming Collisions & Aliasing
Both `src/scrapers/profession.ts` and `src/scrapers/nofluffjobs.ts` export a function named `scrapeJobDetails`. To prevent naming collisions, we must import them with aliases. 

Additionally, both files define a identical `ScrapedJob` interface. Since they are structurally compatible in TypeScript, we can import `ScrapedJob` from `profession.ts` to type both sets of jobs.

### Proposed Import Section
```typescript
import db from '../db/database';
import { scrapeProfessionHu, scrapeJobDetails as scrapeProfessionJobDetails, ScrapedJob } from './profession';
import { scrapeNoFluffJobs, scrapeJobDetails as scrapeNoFluffJobDetails } from './nofluffjobs';
import { matchJobWithGemini } from '../matcher/gemini';
```

---

## 2. Location Mapping Strategy

### Configuration and Mapping Flow
1. User-configured locations are saved in the SQLite `config` table under the key `'locations'` (e.g. `["budapest", "pecs", "tavmunka"]`).
2. `scraperManager.ts` retrieves this array of strings and passes it directly to the scraper functions:
   - `scrapeProfessionHu(keyword, locations)`
   - `scrapeNoFluffJobs(keyword, locations)`
3. Each scraper is responsible for mapping these raw config keys to its own platform-specific format. Thus, **no location mapping logic is needed in `scraperManager.ts`**.

### Enhancing `nofluffjobs.ts` Mappings
Currently, `nofluffjobs.ts` only maps a subset of the 22 locations supported by Jinder. To ensure all configured locations are mapped correctly on both platforms, the `LOCATION_MAP` (for API search payloads) and `FALLBACK_CITY_MAP` (for Playwright search URLs) in `src/scrapers/nofluffjobs.ts` should be expanded to include all Jinder locations.

**Recommended changes inside `src/scrapers/nofluffjobs.ts`:**
```typescript
const LOCATION_MAP: Record<string, string> = {
  'budapest': 'Budapest',
  'pest': 'Pest',
  'debrecen': 'Debrecen',
  'szeged': 'Szeged',
  'miskolc': 'Miskolc',
  'pecs': 'Pécs',
  'gyor': 'Győr',
  'nyiregyhaza': 'Nyíregyháza',
  'kecskemet': 'Kecskemét',
  'szekesfehervar': 'Székesfehérvár',
  'szombathely': 'Szombathely',
  'szolnok': 'Szolnok',
  'tatabanya': 'Tatabánya',
  'kaposvar': 'Kaposvár',
  'bekescsaba': 'Békéscsaba',
  'veszprem': 'Veszprém',
  'zalaegerszeg': 'Zalaegerszeg',
  'eger': 'Eger',
  'salgotarjan': 'Salgótarján',
  'szekszard': 'Szekszárd',
  'tavmunka': 'remote',
  'home_office': 'remote'
};

const FALLBACK_CITY_MAP: Record<string, string> = {
  'budapest': 'budapest',
  'pest': 'pest',
  'debrecen': 'debrecen',
  'szeged': 'szeged',
  'miskolc': 'miskolc',
  'pecs': 'pecs',
  'gyor': 'gyor',
  'nyiregyhaza': 'nyiregyhaza',
  'kecskemet': 'kecskemet',
  'szekesfehervar': 'szekesfehervar',
  'szombathely': 'szombathely',
  'szolnok': 'szolnok',
  'tatabanya': 'tatabanya',
  'kaposvar': 'kaposvar',
  'bekescsaba': 'bekescsaba',
  'veszprem': 'veszprem',
  'zalaegerszeg': 'zalaegerszeg',
  'eger': 'eger',
  'salgotarjan': 'salgotarjan',
  'szekszard': 'szekszard',
  'tavmunka': 'remote',
  'home_office': 'remote'
};
```
*Note: Mappings for `'tavmunka'` and `'home_office'` resolve to `'remote'`, which is natively supported by No Fluff Jobs' POST API search criteria.*

---

## 3. Scraper Execution, Deduplication, and Database Save

To integrate `nofluffjobs` into the `runScraper` flow, the following sequence is recommended:

### A. Run Portals Sequentially with Error Isolation
Running scrapers with separate try-catch blocks ensures that if one platform fails (e.g. due to connection error or rate-limiting), the other platform can still succeed.

```typescript
// 1. Fetch job links from platforms
onProgress?.({ phase: 'searching', currentJobTitle: 'Profession.hu...', currentJobIndex: 0, totalJobs: 0 });

// Fetch selected locations from config
const locRow = db.prepare("SELECT value FROM config WHERE key = 'locations'").get() as { value: string } | undefined;
const locations: string[] = locRow ? JSON.parse(locRow.value) : [];

let professionJobs: ScrapedJob[] = [];
let noFluffJobs: ScrapedJob[] = [];

// Scrape Profession.hu
try {
  professionJobs = await scrapeProfessionHu(keyword, locations);
} catch (error: any) {
  console.error(`Profession.hu scraper failed: ${error.message}`);
  report.errors.push(`Profession.hu: ${error.message}`);
}

// Scrape No Fluff Jobs
onProgress?.({ phase: 'searching', currentJobTitle: 'No Fluff Jobs...', currentJobIndex: 0, totalJobs: 0 });
try {
  noFluffJobs = await scrapeNoFluffJobs(keyword, locations);
} catch (error: any) {
  console.error(`No Fluff Jobs scraper failed: ${error.message}`);
  report.errors.push(`No Fluff Jobs: ${error.message}`);
}
```

### B. Merge & Deduplicate Upfront
After collecting lists from both platforms, merge them into a single array and deduplicate by `job_id` (a `Set` is recommended) before processing. This prevents redundant requests to Gemini or detail fetchers in case of duplicate entries within the same run.

```typescript
const combinedJobs = [...professionJobs, ...noFluffJobs];
const seenJobIds = new Set<string>();
const jobs: ScrapedJob[] = [];

for (const job of combinedJobs) {
  if (!seenJobIds.has(job.job_id)) {
    seenJobIds.add(job.job_id);
    jobs.push(job);
  }
}

report.scrapedCount = jobs.length;
onProgress?.({ totalJobs: jobs.length });
```

### C. Platform-Specific Detail Fetching
Inside the processing loop, dispatch to the correct detail scraper function based on `job.platform`:

```typescript
let detailText = '';
if (job.platform === 'profession') {
  detailText = await scrapeProfessionJobDetails(job.link);
} else if (job.platform === 'nofluffjobs') {
  detailText = await scrapeNoFluffJobDetails(job.link);
} else {
  console.warn(`Unknown platform encountered: ${job.platform}`);
  continue;
}
```

### D. SQLite Save Compatibility
The `jobs` table schema contains a `job_id` column with a `UNIQUE` constraint, which serves as the primary duplicate check:
- `checkStmt` (`SELECT id FROM jobs WHERE job_id = ?`) checks this before fetching details.
- Since `profession.ts` prefixes IDs with `profession-` (e.g. `profession-123456`) and `nofluffjobs.ts` prefixes them with `nofluffjobs-` (e.g. `nofluffjobs-slug`), there is no possibility of cross-platform ID collision.
- The `platform` column stores `'profession'` or `'nofluffjobs'` correctly.
- All other fields (`title`, `company`, `location`, `link`, `description`) are fully populated and mapped correctly to the database columns without schema modifications.

---

## 4. Complete Code Design for `src/scrapers/scraperManager.ts`

Here is the exact code design for the integrated `runScraper` function:

```typescript
import db from '../db/database';
import { scrapeProfessionHu, scrapeJobDetails as scrapeProfessionJobDetails, ScrapedJob } from './profession';
import { scrapeNoFluffJobs, scrapeJobDetails as scrapeNoFluffJobDetails } from './nofluffjobs';
import { matchJobWithGemini } from '../matcher/gemini';

export interface ScrapeReport {
  scrapedCount: number;
  newJobsCount: number;
  matchedCount: number;
  errors: string[];
}

export interface ScrapeProgress {
  phase: 'searching' | 'fetching' | 'matching' | 'saving' | 'done';
  currentJobIndex: number;
  totalJobs: number;
  currentJobTitle: string;
  currentKeyword: string;
  keywordIndex: number;
  totalKeywords: number;
  newJobs: number;
  matched: number;
  skipped: number;
  errors: number;
}

export type ProgressCallback = (progress: Partial<ScrapeProgress>) => void;

export async function runScraper(
  keyword: string,
  onProgress?: ProgressCallback
): Promise<ScrapeReport> {
  const report: ScrapeReport = {
    scrapedCount: 0,
    newJobsCount: 0,
    matchedCount: 0,
    errors: []
  };

  let skipped = 0;

  try {
    // 1. Fetch job links from platforms
    onProgress?.({ phase: 'searching', currentJobTitle: 'Profession.hu...', currentJobIndex: 0, totalJobs: 0 });
    
    // Fetch selected locations from config
    const locRow = db.prepare("SELECT value FROM config WHERE key = 'locations'").get() as { value: string } | undefined;
    const locations: string[] = locRow ? JSON.parse(locRow.value) : [];

    let professionJobs: ScrapedJob[] = [];
    let noFluffJobs: ScrapedJob[] = [];

    // Scrape Profession.hu
    try {
      professionJobs = await scrapeProfessionHu(keyword, locations);
    } catch (profError: any) {
      console.error(`Profession.hu scraper failed:`, profError.message);
      report.errors.push(`Profession.hu: ${profError.message}`);
    }

    // Scrape No Fluff Jobs
    onProgress?.({ phase: 'searching', currentJobTitle: 'No Fluff Jobs...' });
    try {
      noFluffJobs = await scrapeNoFluffJobs(keyword, locations);
    } catch (nfjError: any) {
      console.error(`No Fluff Jobs scraper failed:`, nfjError.message);
      report.errors.push(`No Fluff Jobs: ${nfjError.message}`);
    }

    // Merge and deduplicate jobs list
    const combinedJobs = [...professionJobs, ...noFluffJobs];
    const seenJobIds = new Set<string>();
    const jobs: ScrapedJob[] = [];

    for (const job of combinedJobs) {
      if (!seenJobIds.has(job.job_id)) {
        seenJobIds.add(job.job_id);
        jobs.push(job);
      }
    }

    report.scrapedCount = jobs.length;
    onProgress?.({ totalJobs: jobs.length, skipped: 0 });

    // Prepared statements for DB queries
    const checkStmt = db.prepare('SELECT id FROM jobs WHERE job_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO jobs (
        job_id, platform, title, company, location, link, description, 
        parsed_json, match_score, match_pros, match_cons, match_justification, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `);

    // 2. Process each job
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        // Check if job already exists in DB
        const exists = checkStmt.get(job.job_id);
        if (exists) {
          skipped++;
          onProgress?.({ currentJobIndex: i + 1, currentJobTitle: job.title, skipped });
          continue; // Skip already scraped jobs
        }

        report.newJobsCount++;
        console.log(`Processing new job: ${job.title} at ${job.company}`);

        // Fetch detail page text based on platform
        onProgress?.({
          phase: 'fetching',
          currentJobIndex: i + 1,
          currentJobTitle: job.title,
        });

        let detailText = '';
        if (job.platform === 'profession') {
          detailText = await scrapeProfessionJobDetails(job.link);
        } else if (job.platform === 'nofluffjobs') {
          detailText = await scrapeNoFluffJobDetails(job.link);
        }

        if (!detailText) {
          console.warn(`Could not retrieve details for job link: ${job.link}`);
          continue;
        }

        // Polite delay
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Call Gemini for matching
        onProgress?.({
          phase: 'matching',
          currentJobIndex: i + 1,
          currentJobTitle: job.title,
        });

        const matchResult = await matchJobWithGemini(job.title, job.company, detailText);
        
        let finalTitle = job.title;
        let finalCompany = job.company;
        let finalLocation = job.location;
        let parsedJsonStr = '';
        let score = -1;
        let prosStr = '[]';
        let consStr = '[]';
        let justification = '';

        if (matchResult) {
          report.matchedCount++;
          finalTitle = matchResult.parsedJob.title || job.title;
          finalCompany = matchResult.parsedJob.company || job.company;
          finalLocation = matchResult.parsedJob.location || job.location;
          parsedJsonStr = JSON.stringify(matchResult.parsedJob);
          score = matchResult.matchScore;
          prosStr = JSON.stringify(matchResult.pros);
          consStr = JSON.stringify(matchResult.cons);
          justification = matchResult.justification;
        }

        // Insert job into database
        onProgress?.({ phase: 'saving' });

        insertStmt.run(
          job.job_id,
          job.platform,
          finalTitle,
          finalCompany,
          finalLocation,
          job.link,
          detailText,
          parsedJsonStr,
          score,
          prosStr,
          consStr,
          justification
        );

        console.log(`Saved job "${finalTitle}" to database. Score: ${score}%`);

        // Handle Discord Webhook (identical to existing logic)
        if (score >= 80) {
          try {
            const webhookRow = db.prepare("SELECT value FROM config WHERE key = 'discord_webhook'").get() as { value: string } | undefined;
            const webhookUrl = webhookRow?.value;
            if (webhookUrl && webhookUrl.startsWith('http')) {
               const payload = {
                 content: `🎉 **New Highly Matched Job: ${score}%**\n**Title:** ${finalTitle}\n**Company:** ${finalCompany}\n**Location:** ${finalLocation}\n[View Job Details](${job.link})`,
                 embeds: [{
                    title: "AI Match Justification",
                    description: justification.substring(0, 2048),
                    color: 3447003
                 }]
               };
               await fetch(webhookUrl, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(payload)
               });
               console.log(`Sent Discord webhook for job: ${finalTitle}`);
            }
          } catch (webhookErr: any) {
            console.error('Failed to send Discord webhook:', webhookErr.message);
          }
        }

        onProgress?.({
          newJobs: report.newJobsCount,
          matched: report.matchedCount,
          errors: report.errors.length,
        });

      } catch (jobError: any) {
        console.error(`Error processing job ${job.job_id}:`, jobError.message);
        report.errors.push(`Job ${job.job_id}: ${jobError.message}`);
        onProgress?.({ errors: report.errors.length });
      }
    }
  } catch (error: any) {
    console.error('Scraper manager run failed:', error.message);
    report.errors.push(`Global scraper error: ${error.message}`);
  }

  onProgress?.({ phase: 'done' });
  return report;
}
```
