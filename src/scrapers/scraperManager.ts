import db from "../db/database";
import {
  scrapeProfessionHu,
  scrapeJobDetails as scrapeProfessionDetails,
} from "./profession";
import {
  scrapeNoFluffJobs,
  scrapeJobDetails as scrapeNoFluffDetails,
} from "./nofluffjobs";
import { scrapeCareerPages, scrapeCareerPageDetails } from "./careerPages";
import { closeSharedBrowser } from "../lib/browser";
import { DETAIL_FETCH_DELAY_MS } from "../lib/constants";
import { computeDedupeKey } from "../lib/dedupe";
import { matchJobsInBatches } from "../matching/pipeline";
import { sendDiscordAlert } from "../notify/discord";
import config from "../config";
import { ScrapeReport, ScrapeProgress, ProgressCallback } from "../types";

export type { ScrapeReport, ScrapeProgress, ProgressCallback };

function matchesExcludeKeywords(
  title: string,
  description: string,
  excludeKeywords: string[],
): boolean {
  if (excludeKeywords.length === 0) return false;
  const lowerTitle = title.toLowerCase();
  const lowerDesc = description.toLowerCase();
  return excludeKeywords.some((kw) => {
    const lowerKw = kw.toLowerCase().trim();
    if (!lowerKw) return false;
    return lowerTitle.includes(lowerKw) || lowerDesc.includes(lowerKw);
  });
}


export async function runScraper(
  keyword: string,
  onProgress?: ProgressCallback,
): Promise<ScrapeReport> {
  const report: ScrapeReport = {
    scrapedCount: 0,
    newJobsCount: 0,
    matchedCount: 0,
    errors: [],
  };

  let skipped = 0;

  try {
    // 1. Fetch job links from platforms
    onProgress?.({
      phase: "searching",
      currentJobTitle: "",
      currentJobIndex: 0,
      totalJobs: 0,
    });

    // Fetch exclude keywords from config
    const excludeKwRow = db
      .prepare("SELECT value FROM config WHERE key = 'exclude_keywords'")
      .get() as { value: string } | undefined;
    const rawExcludeKeywords = excludeKwRow ? JSON.parse(excludeKwRow.value) : [];
    const excludeKeywords: string[] = Array.isArray(rawExcludeKeywords) ? rawExcludeKeywords : [];

    // Fetch batch size from config
    const batchSizeRow = db
      .prepare("SELECT value FROM config WHERE key = 'batch_size'")
      .get() as { value: string } | undefined;
    let BATCH_SIZE = 10;
    if (batchSizeRow) {
      const parsed = parseInt(batchSizeRow.value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        BATCH_SIZE = parsed;
      }
    }

    // Fetch selected locations from config
    const locRow = db
      .prepare("SELECT value FROM config WHERE key = 'locations'")
      .get() as { value: string } | undefined;
    const rawLocations = locRow ? JSON.parse(locRow.value) : [];
    const locations: string[] = (
      Array.isArray(rawLocations) ? rawLocations : []
    ).map((loc: any) => String(loc).toLowerCase());

    // Fetch selected companies from config
    const compRow = db
      .prepare("SELECT value FROM config WHERE key = 'companies'")
      .get() as { value: string } | undefined;
    const rawCompanies = compRow ? JSON.parse(compRow.value) : [];
    const companies: string[] = Array.isArray(rawCompanies) ? rawCompanies : [];

    let professionJobs: any[] = [];
    let noFluffJobs: any[] = [];
    let careerJobs: any[] = [];

    await Promise.all([
      (async () => {
        try {
          professionJobs = await scrapeProfessionHu(keyword, locations);
        } catch (err: any) {
          console.error("scrapeProfessionHu failed:", err.message);
          report.errors.push(`Profession.hu scraper error: ${err.message}`);
        }
      })(),
      (async () => {
        try {
          noFluffJobs = await scrapeNoFluffJobs(keyword, locations);
        } catch (err: any) {
          console.error("scrapeNoFluffJobs failed:", err.message);
          report.errors.push(`NoFluffJobs scraper error: ${err.message}`);
        }
      })(),
      (async () => {
        try {
          if (companies.length > 0) {
            careerJobs = await scrapeCareerPages(
              keyword,
              companies,
              report.errors,
            );
          }
        } catch (err: any) {
          console.error("scrapeCareerPages failed:", err.message);
          report.errors.push(`Career pages scraper error: ${err.message}`);
        }
      })(),
    ]);

    // Merge search results and deduplicate them in-memory using job_id.
    const allJobs = [...professionJobs, ...noFluffJobs, ...careerJobs];
    const jobsMap = new Map<string, any>();
    for (const job of allJobs) {
      if (job && job.job_id) {
        jobsMap.set(job.job_id, job);
      }
    }
    const jobs = Array.from(jobsMap.values());
    report.scrapedCount = jobs.length;

    onProgress?.({ totalJobs: jobs.length });

    // Prepared statements for DB queries
    const checkStmt = db.prepare("SELECT id FROM jobs WHERE job_id = ?");
    const findSiblingStmt = db.prepare(`
      SELECT * FROM jobs WHERE dedupe_key = ? AND match_score >= 0 ORDER BY id LIMIT 1
    `);
    const insertStmt = db.prepare(`
      INSERT INTO jobs (
        job_id, platform, title, company, location, link, description,
        parsed_json, match_score, match_pros, match_cons, match_justification, dedupe_key, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `);

    // 2. Fetch details sequentially for new jobs (polite scraping)
    interface NewJobWithDetails {
      job: any;
      detailText: string;
    }
    const newJobsToMatch: NewJobWithDetails[] = [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      try {
        // Check if job already exists in DB
        const exists = checkStmt.get(job.job_id);
        if (exists) {
          skipped++;
          onProgress?.({
            currentJobIndex: i + 1,
            currentJobTitle: job.title,
            skipped,
          });
          continue; // Skip already scraped jobs
        }

        // Check if job matches exclude keywords (title level check before details fetch)
        if (matchesExcludeKeywords(job.title, "", excludeKeywords)) {
          console.log(`Skipping job "${job.title}" (matches exclude keywords in title)`);
          skipped++;
          onProgress?.({
            currentJobIndex: i + 1,
            currentJobTitle: job.title,
            skipped,
          });
          continue;
        }

        report.newJobsCount++;
        console.log(
          `Processing new job details fetch: ${job.title} at ${job.company}`,
        );

        // Fetch detail page text
        onProgress?.({
          phase: "fetching",
          currentJobIndex: i + 1,
          currentJobTitle: job.title,
        });

        let detailText = "";
        if (job.platform === "profession") {
          detailText = await scrapeProfessionDetails(job.link);
        } else if (job.platform === "nofluffjobs") {
          detailText = await scrapeNoFluffDetails(job.link);
        } else if (job.platform === "career") {
          detailText = await scrapeCareerPageDetails(job.link);
        } else {
          console.warn(
            `Unknown platform: ${job.platform} for job ${job.job_id}`,
          );
        }

        if (!detailText) {
          console.warn(`Could not retrieve details for job link: ${job.link}`);
          report.errors.push(`Job ${job.job_id}: Could not retrieve details`);
          continue;
        }

        // Check if job matches exclude keywords (description level check after details fetch)
        if (matchesExcludeKeywords(job.title, detailText, excludeKeywords)) {
          console.log(`Skipping job "${job.title}" (matches exclude keywords in description)`);
          skipped++;
          onProgress?.({
            currentJobIndex: i + 1,
            currentJobTitle: job.title,
            skipped,
          });
          continue;
        }

        newJobsToMatch.push({ job, detailText });

        // Add 1.5 seconds delay between scraping details to be polite
        await new Promise((resolve) => setTimeout(resolve, DETAIL_FETCH_DELAY_MS));

        onProgress?.({
          newJobs: report.newJobsCount,
          errors: report.errors.length,
        });
      } catch (jobError: any) {
        console.error(
          `Error fetching job details for ${job.job_id}:`,
          jobError.message,
        );
        report.errors.push(`Job ${job.job_id}: ${jobError.message}`);
        onProgress?.({ errors: report.errors.length });
      }
    }

    // 3a. Cross-platform dedup: when the same role (company+title) already has
    // a scored row from another platform, reuse its evaluation instead of
    // spending another Gemini call. The listing is still saved so every
    // platform's link is visible, sharing the dedupe_key.
    const jobsNeedingMatch: NewJobWithDetails[] = [];
    for (const item of newJobsToMatch) {
      const dedupeKey = computeDedupeKey(item.job.company, item.job.title);
      const sibling = dedupeKey ? (findSiblingStmt.get(dedupeKey) as any) : undefined;
      if (!sibling) {
        jobsNeedingMatch.push(item);
        continue;
      }
      try {
        insertStmt.run(
          item.job.job_id,
          item.job.platform,
          sibling.title,
          sibling.company,
          item.job.location || sibling.location,
          item.job.link,
          item.detailText,
          sibling.parsed_json,
          sibling.match_score,
          sibling.match_pros,
          sibling.match_cons,
          sibling.match_justification,
          dedupeKey,
        );
        report.matchedCount++;
        console.log(
          `Reused match for "${item.job.title}" (${item.job.platform}) from existing ${sibling.platform} listing. Score: ${sibling.match_score}%`,
        );
        onProgress?.({ matched: report.matchedCount });
      } catch (dupErr: any) {
        console.error(`Error saving deduped job ${item.job.job_id}:`, dupErr.message);
        report.errors.push(`Save deduped job ${item.job.job_id}: ${dupErr.message}`);
      }
    }

    // 3b. Batch matching with fallback (shared pipeline), saving as results arrive
    await matchJobsInBatches(
      jobsNeedingMatch,
      (item) => ({
        title: item.job.title,
        company: item.job.company,
        description: item.detailText,
      }),
      BATCH_SIZE,
      {
        onBatchStart: (offset, batch) => {
          console.log(
            `Matching batch of ${batch.length} jobs (progress: ${offset}/${newJobsToMatch.length})...`,
          );
          onProgress?.({
            phase: "matching",
            currentJobIndex: offset + 1,
            totalJobs: newJobsToMatch.length,
            currentJobTitle: batch.map((x) => x.job.title).join(", "),
          });
        },
        onBatchError: (message) => {
          console.warn(`Batch matching failed, falling back to individual matching:`, message);
          report.errors.push(`Batch matching fallback: ${message}`);
        },
        onItemError: (item, message) => {
          console.error(`Individual fallback matching failed for ${item.job.job_id}:`, message);
          report.errors.push(
            `Individual matching fallback error for ${item.job.job_id}: ${message}`,
          );
        },
        onInvalidIndex: (index) => {
          console.warn(`Skipping match result with invalid or duplicate index: ${index}`);
          report.errors.push(`Invalid batch match index: ${index}`);
        },
        onResult: async (item, res) => {
          const job = item.job;
          try {
            report.matchedCount++;

            const finalTitle = res.parsedJob.title || job.title;
            const finalCompany = res.parsedJob.company || job.company;
            const finalLocation = res.parsedJob.location || job.location;
            const score = res.matchScore;
            const justification = res.justification;

            onProgress?.({ phase: "saving" });

            insertStmt.run(
              job.job_id,
              job.platform,
              finalTitle,
              finalCompany,
              finalLocation,
              job.link,
              item.detailText,
              JSON.stringify(res.parsedJob),
              score,
              JSON.stringify(res.pros),
              JSON.stringify(res.cons),
              justification,
              computeDedupeKey(finalCompany, finalTitle),
            );

            console.log(`Saved job "${finalTitle}" to database. Score: ${score}%`);

            if (score >= config.MATCH_ALERT_THRESHOLD) {
              await sendDiscordAlert({
                title: finalTitle,
                company: finalCompany,
                location: finalLocation,
                link: job.link,
                score,
                justification,
              });
            }

            onProgress?.({
              newJobs: report.newJobsCount,
              matched: report.matchedCount,
              errors: report.errors.length,
            });
          } catch (saveError: any) {
            console.error(`Error saving job ${job.job_id}:`, saveError.message);
            report.errors.push(`Save job ${job.job_id}: ${saveError.message}`);
            onProgress?.({ errors: report.errors.length });
          }
        },
      },
    );
  } catch (error: any) {
    console.error("Scraper manager run failed:", error.message);
    report.errors.push(`Global scraper error: ${error.message}`);
  } finally {
    // All scrapers share one Chromium instance per run; close it here.
    await closeSharedBrowser();
  }

  onProgress?.({ phase: "done" });
  return report;
}
