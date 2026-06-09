# Integration Analysis & Strategy: Integrating No Fluff Jobs Scraper

This document outlines the analysis and implementation strategy for integrating the No Fluff Jobs scraper (`src/scrapers/nofluffjobs.ts`) into the Jinder scraper manager (`src/scrapers/scraperManager.ts`) and the SQLite database (`jobs.db`).

---

## 1. Import and Integration of Scraper Functions

### Current Imports in `scraperManager.ts`
```typescript
import { scrapeProfessionHu, scrapeJobDetails } from './profession';
```

### Recommended Integration Strategy
To integrate `scrapeNoFluffJobs` and its `scrapeJobDetails` function without naming collisions (since both platforms use `scrapeJobDetails` as their detail-fetching function name), we should import them using explicit aliases:

```typescript
import { 
  scrapeProfessionHu, 
  scrapeJobDetails as scrapeProfessionDetails, 
  ScrapedJob 
} from './profession';
import { 
  scrapeNoFluffJobs, 
  scrapeJobDetails as scrapeNoFluffDetails 
} from './nofluffjobs';
```

**Note:** Both `./profession` and `./nofluffjobs` define structure-compatible `ScrapedJob` interfaces. We can import and use `ScrapedJob` from `./profession` as the unified interface type for the search results from both platforms.

---

## 2. Location Mapping & Normalization

The user-configured locations are stored in the `config` table in `jobs.db` as a JSON string array of lowercase strings (e.g. `["budapest", "pecs", "tavmunka"]`).

### Platform-Specific Location Maps
Both scrapers contain internal location maps that translate these standard keys:
*   **Profession.hu** (`src/scrapers/profession.ts`):
    ```typescript
    const LOCATION_MAP: Record<string, LocationInfo> = {
      "budapest": { slug: "budapest", id: "23" },
      "pecs": { slug: "pecs", id: "26" },
      "debrecen": { slug: "debrecen", id: "32" },
      "szeged": { slug: "szeged", id: "29" },
      "gyor": { slug: "gyor", id: "31" },
      "tavmunka": { slug: "", id: "0", homeOfficeId: "6" },
      "home_office": { slug: "", id: "0", homeOfficeId: "5" }
    };
    ```
*   **No Fluff Jobs** (`src/scrapers/nofluffjobs.ts`):
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

### Recommended Location Mapping Logic
1.  **Defensive Lowercasing**: Retrieve locations from the database and map them to lowercase inside `scraperManager.ts` to ensure consistency.
    ```typescript
    const locRow = db.prepare("SELECT value FROM config WHERE key = 'locations'").get() as { value: string } | undefined;
    const locations: string[] = locRow ? JSON.parse(locRow.value).map((loc: string) => loc.toLowerCase()) : [];
    ```
2.  **No Additional Pre-Processing**: Since both scraper modules already map the lowercase location keys to their respective platforms' API representation internally, `scraperManager.ts` can simply pass the parsed `locations` array directly to both `scrapeProfessionHu` and `scrapeNoFluffJobs`.

---

## 3. Scraper Execution, Deduplication, and Database Saving

### A. Concurrency and Error Isolation
To prevent a failure on one job platform from blocking the entire scraping cycle, the search requests should be performed inside separate `try-catch` blocks, or concurrently using `Promise.allSettled`. 

*Executing concurrently with fallback results in faster execution:*
```typescript
let professionJobs: ScrapedJob[] = [];
let noFluffJobs: ScrapedJob[] = [];

const results = await Promise.allSettled([
  scrapeProfessionHu(keyword, locations),
  scrapeNoFluffJobs(keyword, locations)
]);

if (results[0].status === 'fulfilled') {
  professionJobs = results[0].value;
} else {
  console.error('Profession.hu search failed:', results[0].reason);
  report.errors.push(`Profession.hu: ${results[0].reason?.message || results[0].reason}`);
}

if (results[1].status === 'fulfilled') {
  noFluffJobs = results[1].value;
} else {
  console.error('No Fluff Jobs search failed:', results[1].reason);
  report.errors.push(`No Fluff Jobs: ${results[1].reason?.message || results[1].reason}`);
}

const combinedJobs = [...professionJobs, ...noFluffJobs];
```

### B. In-Memory Deduplication
To avoid processing any duplicate search results, standard in-memory deduplication should be implemented:
```typescript
const seenJobIds = new Set<string>();
const jobs: ScrapedJob[] = [];

for (const job of combinedJobs) {
  if (!seenJobIds.has(job.job_id)) {
    seenJobIds.add(job.job_id);
    jobs.push(job);
  }
}
```

### C. Dynamic Detail Fetching
During the sequential processing loop of the merged jobs, we must route the detail fetching call to the correct platform-specific function based on the `job.platform` property:
```typescript
let detailText = '';
if (job.platform === 'nofluffjobs') {
  detailText = await scrapeNoFluffDetails(job.link);
} else if (job.platform === 'profession') {
  detailText = await scrapeProfessionDetails(job.link);
} else {
  console.warn(`Unknown platform encountered: ${job.platform}`);
  continue;
}
```

### D. Database & Webhook Compatibility
1.  **Deduplication (Existing Jobs)**: The SQLite database schema uses `job_id` as a `UNIQUE` index.
    *   Profession jobs are prefixed with `profession-` (e.g. `profession-123456`).
    *   No Fluff Jobs jobs are prefixed with `nofluffjobs-` (e.g. `nofluffjobs-java-dev-slug`).
    *   This guarantees that no collision will occur in the database.
2.  **No Schema Adjustments**: The `jobs` table has columns for `platform`, `link`, `description`, `title`, and `company` which are fully compatible with both platforms.
3.  **Webhook Notifications**: The discord webhook payload retrieves details (such as `score`, `finalTitle`, `finalCompany`, and `finalLocation`) and links (`job.link`) and functions correctly for both platforms out of the box.

---

## 4. Proposed Implementation Code for `src/scrapers/scraperManager.ts`

Here is the recommended code implementation for `src/scrapers/scraperManager.ts`:

```typescript
import db from '../db/database';
import { scrapeProfessionHu, scrapeJobDetails as scrapeProfessionDetails, ScrapedJob } from './profession';
import { scrapeNoFluffJobs, scrapeJobDetails as scrapeNoFluffDetails } from './nofluffjobs';
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
    onProgress?.({ phase: 'searching', currentJobTitle: 'Initiating search...', currentJobIndex: 0, totalJobs: 0 });
    
    // Fetch selected locations from config
    const locRow = db.prepare("SELECT value FROM config WHERE key = 'locations'").get() as { value: string } | undefined;
    const locations: string[] = locRow 
      ? JSON.parse(locRow.value).map((loc: string) => loc.toLowerCase()) 
      : [];

    let professionJobs: ScrapedJob[] = [];
    let noFluffJobs: ScrapedJob[] = [];

    // Parallel search execution for maximum speed and isolated error boundary
    const searchResults = await Promise.allSettled([
      scrapeProfessionHu(keyword, locations),
      scrapeNoFluffJobs(keyword, locations)
    ]);

    if (searchResults[0].status === 'fulfilled') {
      professionJobs = searchResults[0].value;
    } else {
      console.error('Profession.hu search failed:', searchResults[0].reason);
      report.errors.push(`Profession.hu: ${searchResults[0].reason?.message || searchResults[0].reason}`);
    }

    if (searchResults[1].status === 'fulfilled') {
      noFluffJobs = searchResults[1].value;
    } else {
      console.error('No Fluff Jobs search failed:', searchResults[1].reason);
      report.errors.push(`No Fluff Jobs: ${searchResults[1].reason?.message || searchResults[1].reason}`);
    }

    // Merge and deduplicate
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

    // Prepared statements for DB queries
    const checkStmt = db.prepare('SELECT id FROM jobs WHERE job_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO jobs (
        job_id, platform, title, company, location, link, description, 
        parsed_json, match_score, match_pros, match_cons, match_justification, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `);

    // 2. Process each job sequentially
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
        console.log(`Processing new job: ${job.title} at ${job.company} (${job.platform})`);

        // Fetch detail page text using platform-appropriate detail fetcher
        onProgress?.({
          phase: 'fetching',
          currentJobIndex: i + 1,
          currentJobTitle: job.title,
        });

        let detailText = '';
        if (job.platform === 'nofluffjobs') {
          detailText = await scrapeNoFluffDetails(job.link);
        } else if (job.platform === 'profession') {
          detailText = await scrapeProfessionDetails(job.link);
        } else {
          console.warn(`Unknown platform encountered: ${job.platform}`);
          continue;
        }

        if (!detailText) {
          console.warn(`Could not retrieve details for job link: ${job.link}`);
          continue;
        }

        // Add polite delay (1.5 seconds)
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
