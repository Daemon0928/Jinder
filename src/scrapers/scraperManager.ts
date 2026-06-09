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
import {
  matchJobWithGemini,
  matchJobsBatchWithGemini,
} from "../matcher/gemini";

export interface ScrapeReport {
  scrapedCount: number;
  newJobsCount: number;
  matchedCount: number;
  errors: string[];
}

export interface ScrapeProgress {
  phase: "searching" | "fetching" | "matching" | "saving" | "done";
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
    const insertStmt = db.prepare(`
      INSERT INTO jobs (
        job_id, platform, title, company, location, link, description, 
        parsed_json, match_score, match_pros, match_cons, match_justification, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
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

        newJobsToMatch.push({ job, detailText });

        // Add 1.5 seconds delay between scraping details to be polite
        await new Promise((resolve) => setTimeout(resolve, 1500));

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

    // 3. Batch matching with fallback
    const BATCH_SIZE = 10;
    for (let b = 0; b < newJobsToMatch.length; b += BATCH_SIZE) {
      const batch = newJobsToMatch.slice(b, b + BATCH_SIZE);
      console.log(
        `Matching batch of ${batch.length} jobs (progress: ${b}/${newJobsToMatch.length})...`,
      );

      onProgress?.({
        phase: "matching",
        currentJobIndex: b + 1,
        totalJobs: newJobsToMatch.length,
        currentJobTitle: batch.map((x) => x.job.title).join(", "),
      });

      const batchInput = batch.map((item, idx) => ({
        title: item.job.title,
        company: item.job.company,
        description: item.detailText,
      }));

      let matchResults: any[] | null = null;
      try {
        matchResults = await matchJobsBatchWithGemini(batchInput);
        if (!matchResults || matchResults.length !== batch.length) {
          throw new Error(
            "Batch matching failed or returned incomplete results",
          );
        }
      } catch (batchErr: any) {
        console.warn(
          `Batch matching failed, falling back to individual matching:`,
          batchErr.message,
        );
        report.errors.push(`Batch matching fallback: ${batchErr.message}`);

        // Fallback to individual matching for this batch
        matchResults = [];
        for (let idx = 0; idx < batch.length; idx++) {
          const item = batch[idx];
          try {
            const result = await matchJobWithGemini(
              item.job.title,
              item.job.company,
              item.detailText,
            );
            if (result) {
              matchResults.push({
                ...result,
                index: idx,
              });
            }
          } catch (indivErr: any) {
            console.error(
              `Individual fallback matching failed for ${item.job.job_id}:`,
              indivErr.message,
            );
            report.errors.push(
              `Individual matching fallback error for ${item.job.job_id}: ${indivErr.message}`,
            );
          }
        }
      }

      // Process match results and save to DB
      for (const res of matchResults) {
        const item = batch[res.index];
        if (!item) continue;

        const job = item.job;
        const detailText = item.detailText;

        try {
          report.matchedCount++;

          let finalTitle = job.title;
          let finalCompany = job.company;
          let finalLocation = job.location;
          let parsedJsonStr = "";
          let score = -1;
          let prosStr = "[]";
          let consStr = "[]";
          let justification = "";

          if (res) {
            finalTitle = res.parsedJob.title || job.title;
            finalCompany = res.parsedJob.company || job.company;
            finalLocation = res.parsedJob.location || job.location;
            parsedJsonStr = JSON.stringify(res.parsedJob);
            score = res.matchScore;
            prosStr = JSON.stringify(res.pros);
            consStr = JSON.stringify(res.cons);
            justification = res.justification;
          }

          onProgress?.({ phase: "saving" });

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
            justification,
          );

          console.log(
            `Saved job "${finalTitle}" to database. Score: ${score}%`,
          );

          if (score >= 80) {
            try {
              const webhookRow = db
                .prepare(
                  "SELECT value FROM config WHERE key = 'discord_webhook'",
                )
                .get() as { value: string } | undefined;
              const webhookUrl = webhookRow?.value;
              if (webhookUrl && webhookUrl.startsWith("http")) {
                const payload = {
                  content: `🎉 **New Highly Matched Job: ${score}%**\n**Title:** ${finalTitle}\n**Company:** ${finalCompany}\n**Location:** ${finalLocation}\n[View Job Details](${job.link})`,
                  embeds: [
                    {
                      title: "AI Match Justification",
                      description: justification.substring(0, 2048),
                      color: 3447003,
                    },
                  ],
                };
                await fetch(webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                console.log(`Sent Discord webhook for job: ${finalTitle}`);
              }
            } catch (webhookErr: any) {
              console.error(
                "Failed to send Discord webhook:",
                webhookErr.message,
              );
            }
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
      }
    }
  } catch (error: any) {
    console.error("Scraper manager run failed:", error.message);
    report.errors.push(`Global scraper error: ${error.message}`);
  }

  onProgress?.({ phase: "done" });
  return report;
}
