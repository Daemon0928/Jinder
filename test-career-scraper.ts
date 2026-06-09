import { scrapeCareerPage, scrapeCareerPageDetails, findCareerPageUrl } from './src/scrapers/careerPages';
import path from 'path';

async function runTest() {
  console.log('=== STARTING OFFLINE CAREERS PAGE SCRAPING E2E TEST ===\n');

  // Resolve local file URL for mock board
  const boardPath = path.resolve(__dirname, 'test-careers-board.html').replace(/\\/g, '/');
  const boardUrl = `file:///${boardPath}`;
  console.log('Loading local mock careers page:', boardUrl);

  const keyword = 'software';
  console.log(`Scraping jobs matching keyword "${keyword}"...`);
  
  const jobs = await scrapeCareerPage(boardUrl, keyword, 'MockCorp');
  console.log(`\nDiscovered ${jobs.length} jobs:`, JSON.stringify(jobs, null, 2));

  // Validation 1: Verify correct number of jobs found
  if (jobs.length !== 2) {
    console.error(`❌ FAILED: Expected 2 jobs, but found ${jobs.length}.`);
    process.exitCode = 1;
    return;
  }
  console.log('✅ Discovered correct number of jobs.');

  // Validation 2: Verify job titles and platforms
  const titles = jobs.map(j => j.title);
  console.log('Discovered Job Titles:', titles);
  
  if (!titles.includes('Software Engineer') || !titles.includes('Senior Software Architect')) {
    console.error('❌ FAILED: Job titles do not match expected results.');
    process.exitCode = 1;
    return;
  }
  console.log('✅ Job titles match expected results.');

  for (const job of jobs) {
    if (job.platform !== 'career') {
      console.error(`❌ FAILED: Expected platform 'career', got '${job.platform}'`);
      process.exitCode = 1;
      return;
    }
  }
  console.log('✅ Job platforms are set correctly to "career".');

  // Validation 3: Scrape details and check content
  console.log('\nFetching details for the discovered jobs...');
  for (const job of jobs) {
    console.log(`Scraping details for "${job.title}" at link: ${job.link}`);
    const details = await scrapeCareerPageDetails(job.link);
    
    if (!details || details.trim().length === 0) {
      console.error(`❌ FAILED: Got empty details for "${job.title}"`);
      process.exitCode = 1;
      return;
    }
    
    console.log(`✅ Scraped ${details.length} chars.`);
    
    if (job.title === 'Software Engineer') {
      if (!details.includes('Node.js') || !details.includes('SQLite') || !details.includes('Playwright')) {
        console.error('❌ FAILED: Details for Software Engineer did not contain expected keywords.');
        process.exitCode = 1;
        return;
      }
      console.log('  ✅ Details verified successfully (contains Node.js, SQLite, Playwright).');
    } else if (job.title === 'Senior Software Architect') {
      if (!details.includes('AWS') || !details.includes('System Design')) {
        console.error('❌ FAILED: Details for Senior Software Architect did not contain expected keywords.');
        process.exitCode = 1;
        return;
      }
      console.log('  ✅ Details verified successfully (contains AWS, System Design).');
    }
  }

  // --- PHASE 6 VERIFICATIONS ---
  console.log('\n=== TESTING PHASE 6 NEW FEATURES ===\n');

  // Test 1: Behind Login Wall skip logic
  const loginPath = path.resolve(__dirname, 'test-careers-login.html').replace(/\\/g, '/');
  const loginUrl = `file:///${loginPath}`;
  console.log('Testing login-wall detection with:', loginUrl);
  const loginJobs = await scrapeCareerPage(loginUrl, keyword, 'LoginCorp');
  console.log(`Discovered ${loginJobs.length} jobs on login wall page.`);
  if (loginJobs.length !== 0) {
    console.error('❌ FAILED: Expected 0 jobs on a page behind login wall.');
    process.exitCode = 1;
    return;
  }
  console.log('✅ Behind login-wall gracefully skipped.');

  // Test 2: Pagination & load more
  const page1Path = path.resolve(__dirname, 'test-careers-page1.html').replace(/\\/g, '/');
  const page1Url = `file:///${page1Path}`;
  console.log('Testing pagination with:', page1Url);
  const paginatedJobs = await scrapeCareerPage(page1Url, keyword, 'PaginatedCorp');
  console.log(`Discovered ${paginatedJobs.length} jobs across paginated pages:`, paginatedJobs.map(j => j.title));
  if (paginatedJobs.length !== 2) {
    console.error(`❌ FAILED: Expected 2 jobs across pages, but found ${paginatedJobs.length}.`);
    process.exitCode = 1;
    return;
  }
  console.log('✅ Pagination / load-more successfully completed.');

  // Test 3: Manual URL bypass search
  const manualUrlInput = `ManualCorp|${boardUrl}`;
  console.log('Testing manual URL parser with:', manualUrlInput);
  const resolvedUrl = await findCareerPageUrl(manualUrlInput);
  console.log('Resolved URL:', resolvedUrl);
  if (resolvedUrl !== boardUrl) {
    console.error(`❌ FAILED: Expected resolved URL to be "${boardUrl}", but got "${resolvedUrl}".`);
    process.exitCode = 1;
    return;
  }
  console.log('✅ Manual URL parser bypass verified.');

  console.log('\nALL OFFLINE CAREER SCRAPING TESTS PASSED SUCCESSFULLY! 🌟');
  console.log('\n=== E2E TEST COMPLETED ===');
}

runTest().catch(err => {
  console.error('E2E test failed with error:', err);
  process.exit(1);
});
