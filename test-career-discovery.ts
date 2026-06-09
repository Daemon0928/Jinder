import { findCareerPageUrl } from './src/scrapers/careerPages';
import db, { initDatabase } from './src/db/database';

async function testCareerDiscovery() {
  console.log('=== STARTING CAREERS PAGE DISCOVERY TEST ===\n');

  // Ensure database tables are created
  initDatabase();

  const testCompany = 'Morgan Stanley Budapest';
  
  // Clear any existing cache for this company to force a search
  console.log(`Clearing cache for company "${testCompany}"...`);
  db.prepare("DELETE FROM career_page_cache WHERE company_name = ?").run(testCompany);

  // 1. First run: Cache Miss (should query search engines)
  console.log('\n--- Run 1: Expecting Search Engine Query (Cache Miss) ---');
  const startTime1 = Date.now();
  const url1 = await findCareerPageUrl(testCompany);
  const duration1 = Date.now() - startTime1;
  
  console.log(`Resolved URL: ${url1}`);
  console.log(`Duration: ${(duration1 / 1000).toFixed(2)}s`);
  
  if (!url1) {
    throw new Error('Test failed: Could not discover career URL.');
  }

  // 2. Second run: Cache Hit (should resolve instantly from database)
  console.log('\n--- Run 2: Expecting Instant Cache Hit ---');
  const startTime2 = Date.now();
  const url2 = await findCareerPageUrl(testCompany);
  const duration2 = Date.now() - startTime2;

  console.log(`Resolved URL: ${url2}`);
  console.log(`Duration: ${(duration2 / 1000).toFixed(2)}s`);

  if (url1 !== url2) {
    throw new Error('Test failed: Resolved URLs are not identical.');
  }

  if (duration2 > 200) {
    throw new Error(`Test failed: Cache hit took too long (${duration2}ms). Should be under 200ms.`);
  }

  console.log('\n✅ SUCCESS: Career page URL discovered, cached, and retrieved instantly!');
  console.log('\n=== TEST COMPLETED SUCCESSFULLY ===');
}

testCareerDiscovery().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
