import { scrapeNoFluffJobs, scrapeJobDetails, ScrapedJob } from './src/scrapers/nofluffjobs';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('=== STARTING NO FLUFF JOBS SCRAPER VERIFICATION ===\n');

  // Test 1: Search with 'budapest' and 'tavmunka' locations
  console.log('--- Test 1: scrapeNoFluffJobs with locations ["budapest", "tavmunka"] ---');
  const keyword = 'javascript';
  const locations = ['budapest', 'tavmunka'];
  
  const jobs: ScrapedJob[] = await scrapeNoFluffJobs(keyword, locations);
  console.log(`Test 1 returned ${jobs.length} jobs.`);
  
  assert(Array.isArray(jobs), 'scrapeNoFluffJobs should return an array.');
  
  if (jobs.length > 0) {
    const job = jobs[0];
    console.log('Sample Job details:', {
      job_id: job.job_id,
      platform: job.platform,
      title: job.title,
      company: job.company,
      location: job.location,
      link: job.link
    });

    assert(typeof job.job_id === 'string' && job.job_id.startsWith('nofluffjobs-'), 'job_id should be string starting with nofluffjobs-');
    assert(job.platform === 'nofluffjobs', 'platform should be nofluffjobs');
    assert(typeof job.title === 'string' && job.title.length > 0, 'title should be a non-empty string');
    assert(typeof job.company === 'string' && job.company.length > 0, 'company should be a non-empty string');
    assert(typeof job.location === 'string' && job.location.length > 0, 'location should be a non-empty string');
    assert(typeof job.link === 'string' && job.link.startsWith('http'), 'link should be a valid URL');

    // Test 2: Fetch details for sample job
    console.log('\n--- Test 2: scrapeJobDetails ---');
    console.log(`Fetching details for link: ${job.link}`);
    const details = await scrapeJobDetails(job.link);
    console.log(`Fetched details length: ${details.length}`);
    console.log(`Details preview:\n${details.substring(0, 400)}...\n`);
    
    assert(typeof details === 'string', 'details should be a string');
    assert(details.length > 0, 'details should not be empty');
  } else {
    console.log('No jobs found for keyword and locations, skipping details test.');
  }

  // Test 3: Search with no locations
  console.log('\n--- Test 3: scrapeNoFluffJobs without locations (global search) ---');
  const globalJobs = await scrapeNoFluffJobs('react');
  console.log(`Test 3 returned ${globalJobs.length} jobs.`);
  assert(Array.isArray(globalJobs), 'Global search should return an array.');
  
  if (globalJobs.length > 0) {
    const job = globalJobs[0];
    console.log('Sample Global Job:', {
      job_id: job.job_id,
      title: job.title,
      company: job.company,
      location: job.location
    });
    assert(job.platform === 'nofluffjobs', 'platform should be nofluffjobs');
    assert(typeof job.title === 'string' && job.title.length > 0, 'title should be non-empty');
  }

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
}

runTests().catch(err => {
  console.error('\n❌ Verification tests failed:', err);
  process.exit(1);
});
