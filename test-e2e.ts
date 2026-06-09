import dotenv from 'dotenv';
dotenv.config();

import db from './src/db/database';
import { runScraper } from './src/scrapers/scraperManager';

async function verifyE2E() {
  console.log('=== STARTING END-TO-END VERIFICATION ===\n');

  // 1. Fetch current counts from DB
  const initialNoFluffCount = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE platform = 'nofluffjobs'").get() as { count: number };
  console.log(`Initial nofluffjobs in database: ${initialNoFluffCount.count}`);

  // 2. Trigger scraper for 'javascript'
  const keyword = 'javascript';
  console.log(`\nRunning Scraper Manager for keyword "${keyword}"...`);
  
  const report = await runScraper(keyword, (progress) => {
    console.log(`Progress Update -> phase: ${progress.phase}, currentJobIndex: ${progress.currentJobIndex}/${progress.totalJobs}, title: ${progress.currentJobTitle}`);
  });

  console.log('\n--- SCRAPE REPORT ---');
  console.log('Scraped count:', report.scrapedCount);
  console.log('New jobs count:', report.newJobsCount);
  console.log('Matched count:', report.matchedCount);
  console.log('Errors:', report.errors);

  // 3. Query DB to verify listings have been stored
  const finalNoFluffCount = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE platform = 'nofluffjobs'").get() as { count: number };
  console.log(`\nFinal nofluffjobs in database: ${finalNoFluffCount.count}`);

  const newJobs = db.prepare("SELECT title, company, platform, match_score FROM jobs WHERE platform = 'nofluffjobs' ORDER BY id DESC LIMIT 5").all() as any[];
  console.log('\nRecently added No Fluff Jobs:');
  newJobs.forEach((job, index) => {
    console.log(`${index + 1}. [${job.platform}] ${job.title} at ${job.company} (Match Score: ${job.match_score}%)`);
  });

  if (finalNoFluffCount.count > initialNoFluffCount.count) {
    console.log('\n✅ SUCCESS: New No Fluff Jobs scraped and matched successfully!');
  } else {
    console.log('\n⚠️ WARNING: No new No Fluff Jobs added. They might have been skipped as duplicates.');
  }

  console.log('\n=== END-TO-END VERIFICATION COMPLETED ===');
}

verifyE2E().catch(err => {
  console.error('E2E verification failed:', err);
  process.exit(1);
});
