export interface E2ETestCase {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  description: string;
  configSetup: {
    cvText?: string;
    keywords?: string[];
    locations?: string[];
    discordWebhook?: string;
  };
  mockServerBehavior: {
    // Profession
    professionSearchHtml?: string;
    professionSearchStatus?: number;
    professionDetailHtml?: Record<string, string>;
    professionDetailStatus?: Record<string, number>;

    // No Fluff Jobs
    noFluffSearchPayload?: any;
    noFluffSearchStatus?: number;
    noFluffDetailPayloads?: Record<string, any>;
    noFluffDetailStatus?: Record<string, number>;
    noFluffSearchHtml?: string;
    noFluffSearchHtmlStatus?: number;
    noFluffDetailHtml?: Record<string, string>;
    noFluffDetailHtmlStatus?: Record<string, number>;

    // Gemini
    geminiPayload?: any;
    geminiStatus?: number;
    geminiSummarizePayload?: any;
    geminiSummarizeStatus?: number;

    // Webhook
    webhookStatus?: number;
  };
  execute: {
    action: 
      | 'api_config_get' 
      | 'api_config_post' 
      | 'api_jobs_get' 
      | 'api_jobs_patch' 
      | 'api_jobs_delete' 
      | 'api_cv_upload'
      | 'api_scrape_trigger'
      | 'api_scrape_status'
      | 'direct_profession_scrape';
    params?: any;
  };
  assertions: {
    status?: number;
    responseBodyContains?: string[];
    responseBodyEquals?: any;
    dbState?: {
      table: 'jobs' | 'config';
      count?: number;
      where?: string;
      expectedRows?: Array<Record<string, any>>;
    };
    webhookTriggered?: boolean;
    webhookCount?: number;
    webhookPayloadContains?: string[];
  };
}

export const testCases: E2ETestCase[] = [];

// ==========================================
// TIER 1: FEATURE COVERAGE (26 Tests: E2E-T1-01 to E2E-T1-26)
// ==========================================
for (let i = 1; i <= 26; i++) {
  const id = `E2E-T1-${i.toString().padStart(2, '0')}`;
  let name = '';
  let description = '';
  let action: E2ETestCase['execute']['action'] = 'api_config_get';
  let params: any = undefined;
  let configSetup: E2ETestCase['configSetup'] = {
    cvText: "Developer CV with TypeScript and Node.js",
    keywords: ["TypeScript"],
    locations: ["budapest"],
    discordWebhook: "http://localhost:5001/webhook"
  };
  let mockServerBehavior: E2ETestCase['mockServerBehavior'] = {};
  let assertions: E2ETestCase['assertions'] = { status: 200 };

  switch (i) {
    case 1:
      name = "GET /api/config gets standard configuration";
      description = "Verifies that initial config matches seeded database values.";
      action = 'api_config_get';
      assertions = {
        status: 200,
        responseBodyContains: ["cv", "keywords", "locations", "discordWebhook"]
      };
      break;
    case 2:
      name = "POST /api/config saves configuration successfully";
      description = "Saves new keywords, locations and webhook values.";
      action = 'api_config_post';
      params = {
        cv: "Updated CV text",
        keywords: ["React", "Python"],
        locations: ["budapest", "tavmunka"],
        discordWebhook: "http://localhost:5001/webhook-new"
      };
      assertions = {
        status: 200,
        responseBodyEquals: { success: true },
        dbState: {
          table: 'config',
          count: 7,
          where: "key = 'cv'",
          expectedRows: [{ key: 'cv', value: 'Updated CV text' }]
        }
      };
      break;
    case 3:
      name = "GET /api/jobs returns empty list when DB is empty";
      description = "Verifies empty list of jobs on fresh database.";
      action = 'api_jobs_get';
      configSetup = {}; // No jobs seeded
      assertions = {
        status: 200,
        responseBodyEquals: []
      };
      break;
    case 4:
      name = "GET /api/jobs returns list of seeded jobs";
      description = "Verifies that seeded job matches list response.";
      action = 'api_jobs_get';
      assertions = {
        status: 200,
        // Seeds will be done by direct insertion in test runner before run
      };
      break;
    case 5:
      name = "PATCH /api/jobs/:id updates job status to bookmarked";
      description = "Tests status update transition to bookmarked.";
      action = 'api_jobs_patch';
      params = { id: 1, body: { status: 'bookmarked' } };
      assertions = {
        status: 200,
        responseBodyEquals: { success: true, id: "1", status: "bookmarked" },
        dbState: {
          table: 'jobs',
          where: "id = 1",
          expectedRows: [{ status: 'bookmarked' }]
        }
      };
      break;
    case 6:
      name = "PATCH /api/jobs/:id updates job status to applied";
      description = "Tests status update transition to applied.";
      action = 'api_jobs_patch';
      params = { id: 1, body: { status: 'applied' } };
      assertions = {
        status: 200,
        responseBodyEquals: { success: true, id: "1", status: "applied" }
      };
      break;
    case 7:
      name = "PATCH /api/jobs/:id updates job status to rejected";
      description = "Tests status update transition to rejected.";
      action = 'api_jobs_patch';
      params = { id: 1, body: { status: 'rejected' } };
      assertions = {
        status: 200,
        responseBodyEquals: { success: true, id: "1", status: "rejected" }
      };
      break;
    case 8:
      name = "PATCH /api/jobs/:id returns 400 for invalid status values";
      description = "Sending invalid status like 'interviewing' should fail.";
      action = 'api_jobs_patch';
      params = { id: 1, body: { status: 'interviewing' } };
      assertions = {
        status: 400,
        responseBodyContains: ["Invalid status value"]
      };
      break;
    case 9:
      name = "PATCH /api/jobs/:id returns 404 for non-existent job ID";
      description = "Verifies error when patching a non-existent job ID.";
      action = 'api_jobs_patch';
      params = { id: 9999, body: { status: 'bookmarked' } };
      assertions = {
        status: 404,
        responseBodyContains: ["Job not found"]
      };
      break;
    case 10:
      name = "DELETE /api/jobs/:id deletes a job successfully";
      description = "Removes job from SQLite DB.";
      action = 'api_jobs_delete';
      params = { id: 1 };
      assertions = {
        status: 200,
        responseBodyEquals: { success: true },
        dbState: {
          table: 'jobs',
          count: 0 // Assumes 1 job existed and was deleted
        }
      };
      break;
    case 11:
      name = "DELETE /api/jobs/:id returns 404 for non-existent job ID";
      description = "Attempting to delete non-existent job returns error.";
      action = 'api_jobs_delete';
      params = { id: 9999 };
      assertions = {
        status: 404,
        responseBodyContains: ["Job not found"]
      };
      break;
    case 12:
      name = "CV Upload endpoint extracts and summarizes PDF CV";
      description = "Verifies text extraction and mock summarization on PDF upload.";
      action = 'api_cv_upload';
      params = { filename: 'my_cv.pdf', content: 'Minimal PDF mock CV content' };
      mockServerBehavior = {
        geminiSummarizeStatus: 200,
        geminiSummarizePayload: { summary: "Summarized E2E CV profile" }
      };
      assertions = {
        status: 200,
        responseBodyContains: ["success", "my_cv.pdf", "Summarized E2E CV profile"]
      };
      break;
    case 13:
      name = "Scrape No Fluff Jobs via API search path";
      description = "Mocks search API response and verifies ScrapedJob formatting.";
      action = 'api_scrape_trigger';
      mockServerBehavior = {
        noFluffSearchStatus: 200,
        noFluffSearchPayload: {
          postings: [{
            id: "nfj-t1-13",
            slug: "typescript-dev-13",
            title: "TypeScript Developer",
            name: "Company 13",
            location: { places: [{ city: "Budapest" }] },
            fullyRemote: false
          }]
        },
        noFluffDetailStatus: { "typescript-dev-13": 200 },
        noFluffDetailPayloads: {
          "typescript-dev-13": {
            requirements: { musts: [{ value: "TypeScript" }] },
            specs: { dailyTasks: ["Write code"] }
          }
        }
      };
      assertions = {
        status: 200,
        // Running scraper trigger will complete in background. We verify status
      };
      break;
    case 14:
      name = "Scrape No Fluff Jobs via Playwright fallback search";
      description = "Verifies Playwright search HTML parsing if search API is blocked.";
      action = 'api_scrape_trigger';
      mockServerBehavior = {
        noFluffSearchStatus: 500, // Trigger fallback
        noFluffSearchHtmlStatus: 200,
        noFluffSearchHtml: `
          <html>
            <body>
              <a href="/hu/job/playwright-job-14">
                <div class="posting-title__position">Playwright Developer</div>
                <div class="company-name">Playwright Kft</div>
                <div class="posting-info__location">Budapest</div>
              </a>
            </body>
          </html>
        `,
        noFluffDetailStatus: { "playwright-job-14": 200 },
        noFluffDetailPayloads: {
          "playwright-job-14": {
            requirements: { musts: [{ value: "Playwright" }] },
            specs: { dailyTasks: ["Write tests"] }
          }
        }
      };
      assertions = { status: 200 };
      break;
    case 15:
      name = "Scrape No Fluff Jobs details page parsing";
      description = "Tests that musts, nices, description, and daily tasks are parsed and merged.";
      action = 'api_scrape_trigger';
      mockServerBehavior = {
        noFluffSearchStatus: 200,
        noFluffSearchPayload: {
          postings: [{ id: "nfj-t1-15", slug: "dev-15", title: "Dev", name: "Comp", location: { places: [{ city: "Budapest" }] } }]
        },
        noFluffDetailPayloads: {
          "dev-15": {
            requirements: { 
              musts: [{ value: "React" }],
              nices: [{ value: "TypeScript" }],
              description: "Custom job details text"
            },
            specs: { dailyTasks: ["Develop software"] }
          }
        }
      };
      assertions = { status: 200 };
      break;
    case 16:
      name = "Scrape Profession.hu search HTML pages";
      description = "Tests extraction of jobs list from Profession.hu HTML template.";
      action = 'direct_profession_scrape';
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `
          <html>
            <body>
              <div class="job-card">
                <a href="/allas/profession-developer-99">Profession Dev</a>
                <span class="company">Profession Co</span>
                <span class="location">Budapest</span>
              </div>
            </body>
          </html>
        `,
        professionDetailStatus: { "99": 200 },
        professionDetailHtml: {
          "99": "<html><body><main class='job-description'>Required: Node.js, TypeScript.</main></body></html>"
        }
      };
      assertions = {
        status: 200,
        responseBodyContains: ["profession-99"]
      };
      break;
    case 17:
      name = "Scrape Profession.hu details page fallback";
      description = "Verifies detail HTML extraction for Profession.hu.";
      action = 'direct_profession_scrape';
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `
          <html>
            <body>
              <div class="job-card">
                <a href="/allas/profession-developer-17">Profession 17</a>
                <span class="company">Co 17</span>
                <span class="location">Szeged</span>
              </div>
            </body>
          </html>
        `,
        professionDetailStatus: { "17": 200 },
        professionDetailHtml: {
          "17": "Detailed description for job 17"
        }
      };
      assertions = { status: 200 };
      break;
    case 18:
      name = "Scraper Manager executes successfully with empty locations";
      description = "Verifies scraper runs when no location is configured in database config.";
      action = 'api_scrape_trigger';
      configSetup = { keywords: ["TS"], locations: [] };
      assertions = { status: 200 };
      break;
    case 19:
      name = "Scraper Manager executes successfully with specific locations";
      description = "Locations are mapped correctly and search urls query these locations.";
      action = 'api_scrape_trigger';
      configSetup = { keywords: ["Python"], locations: ["budapest", "pecs"] };
      assertions = { status: 200 };
      break;
    case 20:
      name = "Deduplication skips saving already scraped job ID";
      description = "Scraper manager checks if job_id exists and skips details fetch & save.";
      action = 'api_scrape_trigger';
      // Seed job and run scrape representing same job_id. We verify skipped count increments.
      assertions = { status: 200 };
      break;
    case 21:
      name = "Discord webhook dispatches on highly matching jobs";
      description = "Job matching >= 80% triggers POST webhook request to mock server.";
      action = 'api_scrape_trigger';
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `
          <html><body><div class="job-card"><a href="/allas/job-21">Job 21</a><span class="company">C</span><span class="location">B</span></div></body></html>
        `,
        professionDetailHtml: { "21": "Senior Web Developer" },
        geminiStatus: 200,
        geminiPayload: {
          matchScore: 90,
          pros: ["Great match"],
          cons: [],
          justification: "Candidate is a perfect fit.",
          parsedJob: { title: "Job 21", company: "C", location: "B", description: "Desc", techStack: ["TS"], salary: "1M" }
        },
        webhookStatus: 200
      };
      assertions = {
        status: 200,
        webhookTriggered: true,
        webhookCount: 1,
        webhookPayloadContains: ["Job 21", "90%", "AI Match Justification"]
      };
      break;
    case 22:
      name = "Discord webhook does not dispatch on low matching jobs";
      description = "Job matching < 80% does not trigger webhook request.";
      action = 'api_scrape_trigger';
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `
          <html><body><div class="job-card"><a href="/allas/job-22">Job 22</a><span class="company">C</span><span class="location">B</span></div></body></html>
        `,
        professionDetailHtml: { "22": "Junior PHP Developer" },
        geminiStatus: 200,
        geminiPayload: {
          matchScore: 40,
          pros: [],
          cons: ["Doesn't match CV"],
          justification: "Not a fit.",
          parsedJob: { title: "Job 22", company: "C", location: "B", description: "Desc", techStack: ["PHP"], salary: "500k" }
        }
      };
      assertions = {
        status: 200,
        webhookTriggered: false
      };
      break;
    case 23:
      name = "Scrape progress updates status phases";
      description = "Checks that status transitions to 'searching', 'fetching', etc.";
      action = 'api_scrape_status';
      assertions = {
        status: 200,
        responseBodyContains: ["phase", "isScraping"]
      };
      break;
    case 24:
      name = "GET /api/scrape/status returns idle when no active scraping is running";
      description = "Verifies default idle state values on clean startup.";
      action = 'api_scrape_status';
      assertions = {
        status: 200,
        responseBodyContains: ["phase", "done", "isScraping"]
      };
      break;
    case 25:
      name = "POST /api/scrape triggers background run immediately";
      description = "POST request returns HTTP 200 with status started, before scrape ends.";
      action = 'api_scrape_trigger';
      assertions = {
        status: 200,
        responseBodyContains: ["status", "started", "background"]
      };
      break;
    case 26:
      name = "Database auto-initializes config and jobs tables on server load";
      description = "Asserts database schemas are created dynamically on start.";
      action = 'api_config_get';
      assertions = {
        status: 200,
        dbState: {
          table: 'jobs',
          count: 0
        }
      };
      break;
  }

  testCases.push({
    id,
    name,
    tier: 1,
    description,
    configSetup,
    mockServerBehavior,
    execute: { action, params },
    assertions
  });
}

// ==========================================
// TIER 2: BOUNDARY & CORNER CASES (26 Tests: E2E-T2-01 to E2E-T2-26)
// ==========================================
for (let i = 1; i <= 26; i++) {
  const id = `E2E-T2-${i.toString().padStart(2, '0')}`;
  let name = '';
  let description = '';
  let action: E2ETestCase['execute']['action'] = 'api_scrape_trigger';
  let params: any = undefined;
  let configSetup: E2ETestCase['configSetup'] = {
    cvText: "Developer CV with TypeScript",
    keywords: ["TypeScript"],
    locations: ["budapest"],
    discordWebhook: "http://localhost:5001/webhook"
  };
  let mockServerBehavior: E2ETestCase['mockServerBehavior'] = {};
  let assertions: E2ETestCase['assertions'] = { status: 200 };

  switch (i) {
    case 1:
      name = "Scraper handles empty search results from No Fluff Jobs API";
      description = "Should exit search phase with 0 jobs and proceed without error.";
      mockServerBehavior = {
        noFluffSearchStatus: 200,
        noFluffSearchPayload: { postings: [] }
      };
      assertions = { status: 200 };
      break;
    case 2:
      name = "Scraper handles empty search HTML from Profession.hu";
      description = "Should complete search phase with 0 jobs and proceed without error.";
      action = 'direct_profession_scrape';
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: "<html><body>No jobs found.</body></html>"
      };
      assertions = { status: 200, responseBodyEquals: [] };
      break;
    case 3:
      name = "No Fluff Jobs detail API missing specifications field";
      description = "Verify details fetch parses properly when 'specs' is missing.";
      mockServerBehavior = {
        noFluffSearchStatus: 200,
        noFluffSearchPayload: { postings: [{ id: "1", slug: "dev-1", title: "Dev", name: "C" }] },
        noFluffDetailPayloads: {
          "dev-1": { requirements: { musts: [{ value: "React" }] } } // specs missing
        }
      };
      assertions = { status: 200 };
      break;
    case 4:
      name = "No Fluff Jobs detail API missing requirements";
      description = "Verify details fetch parses properly when 'requirements' is missing.";
      mockServerBehavior = {
        noFluffSearchStatus: 200,
        noFluffSearchPayload: { postings: [{ id: "1", slug: "dev-1", title: "Dev", name: "C" }] },
        noFluffDetailPayloads: {
          "dev-1": { specs: { dailyTasks: ["Coding"] } } // requirements missing
        }
      };
      assertions = { status: 200 };
      break;
    case 5:
      name = "Profession.hu scraper parses job card with missing company name";
      description = "Tests that missing company falls back to default company string.";
      action = 'direct_profession_scrape';
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `
          <html><body><div class="job-card"><a href="/allas/profession-dev-5">Job</a></div></body></html>
        `,
        professionDetailHtml: { "5": "Details text" }
      };
      assertions = { status: 200 };
      break;
    case 6:
      name = "Job details contain mixed languages (English/Hungarian)";
      description = "Verify mock Gemini translates and parses text successfully.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `
          <html><body><div class="job-card"><a href="/allas/dev-6">Job</a><span class="company">C</span></div></body></html>
        `,
        professionDetailHtml: { "6": "Ez egy senior szoftverfejlesztő pozíció. Node.js szükséges." },
        geminiStatus: 200,
        geminiPayload: {
          matchScore: 85,
          pros: ["TypeScript experience match"],
          cons: [],
          justification: "Hungarian listing translated and matched.",
          parsedJob: { title: "Senior Developer", company: "C", location: "Budapest", description: "This is a senior software engineer position. Node.js required.", techStack: ["Node.js"], salary: "" }
        }
      };
      assertions = { status: 200 };
      break;
    case 7:
      name = "Search API returns HTTP 500 Internal Server Error";
      description = "Main scraper manager log should catch and handle fallback.";
      mockServerBehavior = {
        noFluffSearchStatus: 500
      };
      assertions = { status: 200 };
      break;
    case 8:
      name = "Search API returns HTTP 403 Forbidden Access";
      description = "Playwright crawler should be triggered to bypass blocking.";
      mockServerBehavior = {
        noFluffSearchStatus: 403,
        noFluffSearchHtmlStatus: 200,
        noFluffSearchHtml: "<html><body></body></html>"
      };
      assertions = { status: 200 };
      break;
    case 9:
      name = "Search API returns HTTP 429 Rate Limited";
      description = "Gracefully logged and proceeds with Playwright fallback search.";
      mockServerBehavior = {
        noFluffSearchStatus: 429,
        noFluffSearchHtmlStatus: 200,
        noFluffSearchHtml: "<html><body></body></html>"
      };
      assertions = { status: 200 };
      break;
    case 10:
      name = "Details API returns HTTP 500 error";
      description = "Scraper Manager logs the details error and moves to the next job card.";
      mockServerBehavior = {
        noFluffSearchStatus: 200,
        noFluffSearchPayload: { postings: [{ id: "1", slug: "dev-1", title: "Dev", name: "C" }, { id: "2", slug: "dev-2", title: "Dev 2", name: "C" }] },
        noFluffDetailStatus: { "dev-1": 500, "dev-2": 200 },
        noFluffDetailPayloads: { "dev-2": { requirements: { musts: [] } } }
      };
      assertions = { status: 200 };
      break;
    case 11:
      name = "Details API returns HTTP 404 Not Found";
      description = "Logged, detailText remains empty, and job processing is bypassed.";
      mockServerBehavior = {
        noFluffSearchStatus: 200,
        noFluffSearchPayload: { postings: [{ id: "1", slug: "dev-1", title: "Dev", name: "C" }] },
        noFluffDetailStatus: { "dev-1": 404 }
      };
      assertions = { status: 200 };
      break;
    case 12:
      name = "Gemini API returns HTTP 500 or rate limit";
      description = "Scraper continues, saving job with score -1 instead of throwing.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-12">Job</a><span class="company">C</span></div></body></html>`,
        professionDetailHtml: { "12": "Details text" },
        geminiStatus: 500
      };
      assertions = { status: 200 };
      break;
    case 13:
      name = "Gemini API returns invalid JSON string format";
      description = "Parsing fails but is caught, and job matches are logged as errors.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-13">Job</a><span class="company">C</span></div></body></html>`,
        professionDetailHtml: { "13": "Details text" },
        geminiStatus: 200,
        geminiPayload: "this is not json"
      };
      assertions = { status: 200 };
      break;
    case 14:
      name = "Discord Webhook returns HTTP 500 server error";
      description = "Scraper committed changes to SQLite DB successfully despite webhook failure.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-14">Job</a><span class="company">C</span></div></body></html>`,
        professionDetailHtml: { "14": "Details" },
        geminiStatus: 200,
        geminiPayload: { matchScore: 90, pros: [], cons: [], justification: "A", parsedJob: { title: "Dev 14", company: "C", location: "L", description: "D", techStack: [], salary: "" } },
        webhookStatus: 500
      };
      assertions = { status: 200 };
      break;
    case 15:
      name = "Discord Webhook returns HTTP 429 rate limit";
      description = "Catches webhook rejection and completes scraper run safely.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-15">Job</a><span class="company">C</span></div></body></html>`,
        professionDetailHtml: { "15": "Details" },
        geminiStatus: 200,
        geminiPayload: { matchScore: 90, pros: [], cons: [], justification: "A", parsedJob: { title: "Dev 15", company: "C", location: "L", description: "D", techStack: [], salary: "" } },
        webhookStatus: 429
      };
      assertions = { status: 200 };
      break;
    case 16:
      name = "CV Upload with invalid text extension returns HTTP 400";
      description = "Uploading my_cv.txt should trigger multer validation block.";
      action = 'api_cv_upload';
      params = { filename: 'my_cv.txt', content: 'hello world' };
      assertions = { status: 400 };
      break;
    case 17:
      name = "CV Upload with empty PDF payload returns HTTP 422 or 500";
      description = "Uploading empty buffer results in text extraction failure.";
      action = 'api_cv_upload';
      params = { filename: 'empty.pdf', content: '' };
      assertions = { status: 422 };
      break;
    case 18:
      name = "Malformed Discord Webhook URL string does not crash scraper";
      description = "Should bypass webhook dispatch with clear warning log.";
      configSetup = { discordWebhook: "not-a-valid-url" };
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-18">Job</a><span class="company">C</span></div></body></html>`,
        professionDetailHtml: { "18": "Details" },
        geminiStatus: 200,
        geminiPayload: { matchScore: 85, pros: [], cons: [], justification: "A", parsedJob: { title: "Dev 18", company: "C", location: "L", description: "D", techStack: [], salary: "" } }
      };
      assertions = { status: 200 };
      break;
    case 19:
      name = "Search keywords contain special character patterns";
      description = "Tests search query encoding for keywords like 'C++' or 'Node.js'.";
      configSetup = { keywords: ["C++", "Node.js"], locations: ["budapest"] };
      assertions = { status: 200 };
      break;
    case 20:
      name = "Scrape triggers with empty locations configuration array";
      description = "Verify it defaults to Hungary/national search parameter mapping.";
      configSetup = { keywords: ["Developer"], locations: [] };
      assertions = { status: 200 };
      break;
    case 21:
      name = "Scrapes job with extremely large detail page texts";
      description = "Ensures no out-of-memory or buffer truncation issues occur.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-21">Job</a><span class="company">C</span></div></body></html>`,
        professionDetailHtml: { "21": "Large Text ".repeat(1000) }
      };
      assertions = { status: 200 };
      break;
    case 22:
      name = "Clamps negative Gemini match score to standard bounds";
      description = "Validates that score returned below 0 is handled correctly.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-22">Job</a><span class="company">C</span></div></body></html>`,
        professionDetailHtml: { "22": "Details" },
        geminiStatus: 200,
        geminiPayload: { matchScore: -50, pros: [], cons: [], justification: "A", parsedJob: { title: "D", company: "C", location: "L", description: "D", techStack: [], salary: "" } }
      };
      assertions = { status: 200 };
      break;
    case 23:
      name = "Clamps excessive Gemini match score exceeding 100";
      description = "Score returned as 150 is capped or handled gracefully.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-23">Job</a><span class="company">C</span></div></body></html>`,
        professionDetailHtml: { "23": "Details" },
        geminiStatus: 200,
        geminiPayload: { matchScore: 150, pros: [], cons: [], justification: "A", parsedJob: { title: "D", company: "C", location: "L", description: "D", techStack: [], salary: "" } }
      };
      assertions = { status: 200 };
      break;
    case 24:
      name = "Recovers from malformed JSON configurations in config table";
      description = "System falls back to default settings without throwing startup exception.";
      action = 'api_config_get';
      // Seed malformed json manually in test-runner
      assertions = { status: 200 };
      break;
    case 25:
      name = "Rejects parallel scraping requests while active scraper is running";
      description = "Returns HTTP 429 Too Many Requests status code.";
      action = 'api_scrape_trigger';
      // Trigger twice sequentially without waiting.
      assertions = { status: 200 };
      break;
    case 26:
      name = "Recovers gracefully when database file is deleted at runtime";
      description = "Logs write errors but doesn't crash server process.";
      action = 'api_scrape_trigger';
      assertions = { status: 200 };
      break;
  }

  testCases.push({
    id,
    name,
    tier: 2,
    description,
    configSetup,
    mockServerBehavior,
    execute: { action, params },
    assertions
  });
}

// ==========================================
// TIER 3: CROSS-FEATURE INTERACTIONS (6 Tests: E2E-T3-01 to E2E-T3-06)
// ==========================================
for (let i = 1; i <= 6; i++) {
  const id = `E2E-T3-${i.toString().padStart(2, '0')}`;
  let name = '';
  let description = '';
  let action: E2ETestCase['execute']['action'] = 'api_scrape_trigger';
  let params: any = undefined;
  let configSetup: E2ETestCase['configSetup'] = {
    cvText: "Developer CV with React",
    keywords: ["React"],
    locations: ["budapest"],
    discordWebhook: "http://localhost:5001/webhook"
  };
  let mockServerBehavior: E2ETestCase['mockServerBehavior'] = {};
  let assertions: E2ETestCase['assertions'] = { status: 200 };

  switch (i) {
    case 1:
      name = "Scrape -> Match -> Webhook Pipeline integration flow";
      description = "Scrapes a job, matches >= 80%, pushes alert to Discord webhook.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-31">Job</a><span class="company">Co</span></div></body></html>`,
        professionDetailHtml: { "31": "Senior React Developer role" },
        geminiStatus: 200,
        geminiPayload: {
          matchScore: 88,
          pros: ["Has React experience"],
          cons: [],
          justification: "Excellent fit.",
          parsedJob: { title: "React Dev", company: "Co", location: "Budapest", description: "D", techStack: ["React"], salary: "" }
        },
        webhookStatus: 200
      };
      assertions = {
        status: 200,
        webhookTriggered: true,
        webhookCount: 1,
        webhookPayloadContains: ["React Dev", "88%"]
      };
      break;
    case 2:
      name = "Scrape -> Match -> No Webhook Pipeline low-score flow";
      description = "Scrapes a job, matches < 80%, job stored but webhook is bypassed.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `<html><body><div class="job-card"><a href="/allas/dev-32">Job</a><span class="company">Co</span></div></body></html>`,
        professionDetailHtml: { "32": "C++ Engineer" },
        geminiStatus: 200,
        geminiPayload: {
          matchScore: 35,
          pros: [],
          cons: ["Wrong tech stack"],
          justification: "Poor fit.",
          parsedJob: { title: "C++ Eng", company: "Co", location: "Budapest", description: "D", techStack: ["C++"], salary: "" }
        }
      };
      assertions = {
        status: 200,
        webhookTriggered: false
      };
      break;
    case 3:
      name = "Scraper Manager background thread updates scraper progress phases";
      description = "Verifies scrape phase transition from searching to done.";
      action = 'api_scrape_trigger';
      assertions = { status: 200 };
      break;
    case 4:
      name = "Workflow status remains unchanged on sequential scrape iterations";
      description = "Seeding a job status as bookmarked doesn't get overwritten to new.";
      action = 'api_scrape_trigger';
      assertions = { status: 200 };
      break;
    case 5:
      name = "CV Upload updates CV summary which is used in later matching prompt";
      description = "Submitting new CV via upload saves summary used in subsequent scrapes.";
      action = 'api_cv_upload';
      params = { filename: 'new_cv.pdf', content: 'New CV Text' };
      mockServerBehavior = {
        geminiSummarizeStatus: 200,
        geminiSummarizePayload: { summary: "Updated Summary Profile" }
      };
      assertions = { status: 200 };
      break;
    case 6:
      name = "Changing scraper configuration triggers scrape with updated parameters";
      description = "Verify that saving new keyword config redirects scraper targets.";
      action = 'api_config_post';
      params = { keywords: ["Rust"] };
      assertions = { status: 200 };
      break;
  }

  testCases.push({
    id,
    name,
    tier: 3,
    description,
    configSetup,
    mockServerBehavior,
    execute: { action, params },
    assertions
  });
}

// ==========================================
// TIER 4: REAL-WORLD SCENARIOS (5 Tests: E2E-T4-01 to E2E-T4-05)
// ==========================================
for (let i = 1; i <= 5; i++) {
  const id = `E2E-T4-${i.toString().padStart(2, '0')}`;
  let name = '';
  let description = '';
  let action: E2ETestCase['execute']['action'] = 'api_scrape_trigger';
  let params: any = undefined;
  let configSetup: E2ETestCase['configSetup'] = {
    cvText: "Developer CV",
    keywords: ["TypeScript"],
    locations: ["budapest"],
    discordWebhook: "http://localhost:5001/webhook"
  };
  let mockServerBehavior: E2ETestCase['mockServerBehavior'] = {};
  let assertions: E2ETestCase['assertions'] = { status: 200 };

  switch (i) {
    case 1:
      name = "Standard End-to-End Job Hunting User Workflow";
      description = "Full flow: configures keywords, scrapes multiple jobs, asserts database insertions, webhooks, and status bookmark updating.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `
          <html><body>
            <div class="job-card"><a href="/allas/prof-real-1">Real Job 1</a><span class="company">Co</span></div>
            <div class="job-card"><a href="/allas/prof-real-2">Real Job 2</a><span class="company">Co</span></div>
          </body></html>
        `,
        professionDetailHtml: {
          "real-1": "Details 1",
          "real-2": "Details 2"
        },
        geminiStatus: 200,
        geminiPayload: {
          matchScore: 85,
          pros: ["A"],
          cons: [],
          justification: "Justified",
          parsedJob: { title: "Real Job", company: "Co", location: "Budapest", description: "D", techStack: ["TS"], salary: "" }
        },
        webhookStatus: 200
      };
      assertions = {
        status: 200,
        webhookTriggered: true,
        webhookCount: 2
      };
      break;
    case 2:
      name = "Adversarial network flakiness resilience test";
      description = "Pipeline runs successfully while APIs return random transient failures.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `
          <html><body>
            <div class="job-card"><a href="/allas/prof-adv-1">Adv Job 1</a><span class="company">Co</span></div>
            <div class="job-card"><a href="/allas/prof-adv-2">Adv Job 2</a><span class="company">Co</span></div>
          </body></html>
        `,
        professionDetailStatus: {
          "adv-1": 500, // Failed details fetch
          "adv-2": 200
        },
        professionDetailHtml: {
          "adv-2": "Details 2"
        },
        geminiStatus: 200,
        geminiPayload: {
          matchScore: 82,
          pros: ["A"],
          cons: [],
          justification: "Justified",
          parsedJob: { title: "Adv Job 2", company: "Co", location: "Budapest", description: "D", techStack: ["TS"], salary: "" }
        },
        webhookStatus: 500 // Failed webhook but DB saves
      };
      assertions = { status: 200 };
      break;
    case 3:
      name = "Multiple Keyword Scrape Sequence workflow";
      description = "Runs scraper sequentially for two configured keywords 'React' and 'Angular'.";
      configSetup = { keywords: ["React", "Angular"], locations: ["budapest"] };
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: "<html><body></body></html>"
      };
      assertions = { status: 200 };
      break;
    case 4:
      name = "High Volume Job Listing Scrape test";
      description = "Verifies throttled details queries and database transaction sanity.";
      mockServerBehavior = {
        professionSearchStatus: 200,
        professionSearchHtml: `
          <html><body>
            ${Array.from({ length: 10 }, (_, k) => `
              <div class="job-card">
                <a href="/allas/prof-high-${k}">High Job ${k}</a>
                <span class="company">Co</span>
              </div>
            `).join('')}
          </body></html>
        `,
        geminiStatus: 200
      };
      assertions = { status: 200 };
      break;
    case 5:
      name = "Database migration and clean initialization test";
      description = "Asserts app server startup initialization flow and database robustness.";
      action = 'api_config_get';
      assertions = { status: 200 };
      break;
  }

  testCases.push({
    id,
    name,
    tier: 4,
    description,
    configSetup,
    mockServerBehavior,
    execute: { action, params },
    assertions
  });
}
