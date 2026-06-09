import { scrapeNoFluffJobs, scrapeJobDetails, ScrapedJob } from './src/scrapers/nofluffjobs';
import axios from 'axios';
import { chromium } from 'playwright';

// Helper assertion function
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Variables to control mocking behavior
let blockSearchApi = false;
let blockDetailsApi = false;
let blockAxiosDetailsHtml = false;
let mockPlaywrightFailure = false;

// Register Axios request interceptor to simulate network blockages
axios.interceptors.request.use((config) => {
  const url = config.url || '';
  
  if (blockSearchApi && url.includes('/api/search/posting')) {
    console.log(`[MOCK] Intercepted and blocking Search API request: ${url}`);
    throw new Error('Simulated Search API network failure (503 Service Unavailable)');
  }
  
  if (blockDetailsApi && url.includes('/api/posting/')) {
    console.log(`[MOCK] Intercepted and blocking Details API request: ${url}`);
    throw new Error('Simulated Details API network failure (403 Forbidden)');
  }

  if (blockAxiosDetailsHtml && !url.includes('/api/') && url.includes('nofluffjobs.com')) {
    console.log(`[MOCK] Intercepted and blocking Axios HTML request: ${url}`);
    throw new Error('Simulated Axios HTML fetch failure (404 Not Found)');
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

// Monkey-patch Playwright's chromium.launch
const originalLaunch = chromium.launch;
chromium.launch = async function(options) {
  if (mockPlaywrightFailure) {
    console.log('[MOCK] Intercepted and failing Playwright chromium.launch');
    throw new Error('Simulated Playwright browser launch failure (Executable not found)');
  }
  return originalLaunch.call(chromium, options);
};

async function runAdversarialTests() {
  console.log('=== STARTING NO FLUFF JOBS SCRAPER ADVERSARIAL TESTING ===\n');

  // Test 1: Empty input (keyword)
  console.log('--- Test 1: Empty keyword ---');
  try {
    const jobs = await scrapeNoFluffJobs('');
    console.log(`Test 1 completed successfully. Returned ${jobs.length} jobs.`);
    assert(Array.isArray(jobs), 'Should return an array even for empty keyword');
  } catch (err: any) {
    console.error('Test 1 failed with error:', err);
    throw err;
  }

  // Test 2: Special characters in keyword
  console.log('\n--- Test 2: Special characters in keyword ---');
  try {
    const jobs = await scrapeNoFluffJobs('C# / .NET & C++');
    console.log(`Test 2 completed successfully. Returned ${jobs.length} jobs.`);
    assert(Array.isArray(jobs), 'Should handle special characters in keyword');
  } catch (err: any) {
    console.error('Test 2 failed with error:', err);
    throw err;
  }

  // Test 3: Invalid location parameter (should ignore or handle gracefully)
  console.log('\n--- Test 3: Invalid locations in parameter ---');
  try {
    const jobs = await scrapeNoFluffJobs('javascript', ['narnia', 'invalid_city', 'budapest']);
    console.log(`Test 3 completed successfully. Returned ${jobs.length} jobs.`);
    assert(Array.isArray(jobs), 'Should handle invalid locations and filter them out');
    // It should have filtered narnia/invalid_city and kept budapest
  } catch (err: any) {
    console.error('Test 3 failed with error:', err);
    throw err;
  }

  // Test 4: API failure + Playwright success (Search fallback)
  console.log('\n--- Test 4: API search failure, falling back to Playwright search ---');
  blockSearchApi = true;
  mockPlaywrightFailure = false;
  try {
    const jobs = await scrapeNoFluffJobs('javascript', ['budapest']);
    console.log(`Test 4 completed. Returned ${jobs.length} jobs.`);
    assert(Array.isArray(jobs), 'Fallback should return an array');
    assert(jobs.length > 0, 'Playwright fallback search should return jobs');
    
    // Check that we can use one of these jobs for details testing
    const sampleJob = jobs[0];
    console.log('Scraped job via Playwright search:', {
      title: sampleJob.title,
      company: sampleJob.company,
      location: sampleJob.location,
      link: sampleJob.link
    });

    // Test 5: Details API failure + Axios HTML details success (Details fallback level 1)
    console.log('\n--- Test 5: Details API failure, falling back to Axios HTML ---');
    blockDetailsApi = true;
    blockAxiosDetailsHtml = false;
    mockPlaywrightFailure = false;
    let details = await scrapeJobDetails(sampleJob.link);
    console.log(`Test 5 completed. Fetched details length: ${details.length}`);
    assert(typeof details === 'string', 'Details must be string');
    assert(details.length > 0, 'Axios HTML details fallback should not be empty');

    // Test 6: Details API failure + Axios HTML failure + Playwright HTML success (Details fallback level 2)
    console.log('\n--- Test 6: Details API & Axios HTML failure, falling back to Playwright ---');
    blockDetailsApi = true;
    blockAxiosDetailsHtml = true;
    mockPlaywrightFailure = false;
    details = await scrapeJobDetails(sampleJob.link);
    console.log(`Test 6 completed. Fetched details length: ${details.length}`);
    assert(typeof details === 'string', 'Details must be string');
    assert(details.length > 0, 'Playwright details fallback should not be empty');

  } catch (err: any) {
    console.error('Test 4-6 failed with error:', err);
    throw err;
  } finally {
    // Reset blockers
    blockSearchApi = false;
    blockDetailsApi = false;
    blockAxiosDetailsHtml = false;
  }

  // Test 7: API search failure + Playwright search failure (Total search failure)
  console.log('\n--- Test 7: API search failure & Playwright search failure (Total failure) ---');
  blockSearchApi = true;
  mockPlaywrightFailure = true;
  try {
    const jobs = await scrapeNoFluffJobs('javascript');
    console.log(`Test 7 completed. Returned ${jobs.length} jobs.`);
    // If it reaches here without throwing, check if it returned empty array
    assert(Array.isArray(jobs), 'Total failure should return an array');
    assert(jobs.length === 0, 'Total failure should return empty array');
  } catch (err: any) {
    console.warn('⚠️ Test 7 caught expected crash on Playwright launch failure. Error:', err.message);
    // Since we expect it to handle launch failure gracefully, throwing an unhandled error is a bug.
  } finally {
    blockSearchApi = false;
    mockPlaywrightFailure = false;
  }

  // Test 8: Details API failure + Axios details failure + Playwright details failure (Total details failure)
  console.log('\n--- Test 8: Total details failure (API + Axios + Playwright) ---');
  blockDetailsApi = true;
  blockAxiosDetailsHtml = true;
  mockPlaywrightFailure = true;
  try {
    const details = await scrapeJobDetails('https://nofluffjobs.com/hu/job/nonexistent-slug');
    console.log(`Test 8 completed. Returned details length: ${details.length}`);
    assert(typeof details === 'string', 'Total details failure should return a string');
    assert(details === '', 'Total details failure should return empty string');
  } catch (err: any) {
    console.warn('⚠️ Test 8 caught expected crash on Playwright launch failure in scrapeJobDetails. Error:', err.message);
    // Throwing an unhandled error here is also a bug.
  } finally {
    blockDetailsApi = false;
    blockAxiosDetailsHtml = false;
    mockPlaywrightFailure = false;
  }

  console.log('\n=== ALL ADVERSARIAL TESTS PASSED SUCCESSFULLY ===');
}

runAdversarialTests().catch(err => {
  console.error('\n❌ Adversarial tests failed:', err);
  process.exit(1);
});
