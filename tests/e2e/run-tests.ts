import axios from 'axios';
import { spawn } from 'child_process';
import { startMockServer, stopMockServer, resetMockServer } from './mock-server';
import { initTestDb, resetTestDb, seedTestDb, getTestDb } from './database-helper';
import { testCases } from './test-cases';
import fs from 'fs';
import path from 'path';

// Configure Axios to not throw on non-2xx status codes so we can assert error statuses
axios.defaults.validateStatus = () => true;

// Set environment variables programmatically for this process
process.env.NODE_ENV = 'test';
process.env.DB_FILE = 'jobs.test.db';
process.env.MOCK_GEMINI = 'true';
process.env.PROFESSION_BASE_URL = 'http://localhost:5001';
process.env.NOFLUFF_BASE_URL = 'http://localhost:5001';
process.env.PORT = '5000';

async function waitForAppServer(retries = 30, delay = 200): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get('http://localhost:5000/api/config', { timeout: 1000 });
      if (res.status === 200) {
        return true;
      }
    } catch (e) {}
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return false;
}

// Helper to seed jobs table directly for tests that need predefined job records
function seedJobsTable(jobs: any[]) {
  const db = getTestDb();
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO jobs (
      id, job_id, platform, title, company, location, link, description, 
      parsed_json, match_score, match_pros, match_cons, match_justification, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const job of jobs) {
    insertStmt.run(
      job.id || null,
      job.job_id,
      job.platform,
      job.title,
      job.company,
      job.location || 'Hungary',
      job.link,
      job.description || 'Details',
      job.parsed_json || '{}',
      job.match_score !== undefined ? job.match_score : -1,
      job.match_pros || '[]',
      job.match_cons || '[]',
      job.match_justification || '',
      job.status || 'new'
    );
  }
  db.close();
}

async function run() {
  console.log('=== Starting Jinder E2E Test Suite ===');
  
  // 1. Start Mock Server
  console.log('Booting mock server on port 5001...');
  await startMockServer(5001);

  // 2. Initialize database
  console.log('Initializing test database jobs.test.db...');
  resetTestDb();

  // 3. Spawn App Server
  console.log('Spawning main application server on port 5000...');
  const appProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_FILE: 'jobs.test.db',
      MOCK_GEMINI: 'true',
      PROFESSION_BASE_URL: 'http://localhost:5001',
      NOFLUFF_BASE_URL: 'http://localhost:5001',
      PORT: '5000'
    },
    shell: true
  });

  // Pipe app server stdout/stderr to help debugging if needed
  appProcess.stdout.on('data', (data) => {
    // Optionally log app server logs in verbose mode
    console.log(`[App Server] ${data.toString().trim()}`);
  });
  appProcess.stderr.on('data', (data) => {
    console.error(`[App Server Error] ${data.toString().trim()}`);
  });

  let appReady = false;
  try {
    console.log('Waiting for application server to become responsive...');
    appReady = await waitForAppServer(40, 250);
    if (!appReady) {
      throw new Error('Application server failed to start or respond on port 5000');
    }
    console.log('Application server is ready.');

    let passedCount = 0;
    let failedCount = 0;
    const failuresReport: string[] = [];

    // 4. Run Test Cases
    for (const tc of testCases) {
      console.log(`\n--------------------------------------------`);
      console.log(`[${tc.id}] Running: ${tc.name}`);
      console.log(`Description: ${tc.description}`);

      try {
        // Reset state
        resetMockServer();
        resetTestDb();

        // Seed basic config
        if (tc.configSetup) {
          const { cvText, keywords, locations, discordWebhook } = tc.configSetup;
          seedTestDb(cvText, keywords, locations, discordWebhook);
        }

        // Apply mock server behavior
        if (tc.mockServerBehavior) {
          await axios.post('http://localhost:5001/api/test/set-mock-rules', tc.mockServerBehavior);
        }

        // Extra seeds for specific tests (e.g. jobs table)
        if (tc.id === 'E2E-T1-04' || tc.id === 'E2E-T1-05' || tc.id === 'E2E-T1-06' || 
            tc.id === 'E2E-T1-07' || tc.id === 'E2E-T1-08' || tc.id === 'E2E-T1-09' || 
            tc.id === 'E2E-T1-10' || tc.id === 'E2E-T1-11' || tc.id === 'E2E-T1-20' ||
            tc.id === 'E2E-T3-04') {
          seedJobsTable([
            {
              id: 1,
              job_id: 'profession-mock-1',
              platform: 'profession',
              title: 'Test Job 1',
              company: 'Test Company 1',
              location: 'Budapest',
              link: 'http://localhost:5001/allas/test-job-1',
              description: 'Test details',
              status: 'new'
            }
          ]);
        }

        if (tc.id === 'E2E-T2-24') {
          // Seed malformed config manually
          const db = getTestDb();
          db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('keywords', 'invalid-json')").run();
          db.close();
        }

        // Wait brief moment
        await new Promise((resolve) => setTimeout(resolve, 50));

        let responseStatus = 0;
        let responseData: any = null;

        // Execute action
        switch (tc.execute.action) {
          case 'api_config_get': {
            const res = await axios.get('http://localhost:5000/api/config');
            responseStatus = res.status;
            responseData = res.data;
            break;
          }
          case 'api_config_post': {
            const res = await axios.post('http://localhost:5000/api/config', tc.execute.params);
            responseStatus = res.status;
            responseData = res.data;
            break;
          }
          case 'api_jobs_get': {
            const res = await axios.get('http://localhost:5000/api/jobs');
            responseStatus = res.status;
            responseData = res.data;
            break;
          }
          case 'api_jobs_patch': {
            const { id, body } = tc.execute.params;
            const res = await axios.patch(`http://localhost:5000/api/jobs/${id}`, body);
            responseStatus = res.status;
            responseData = res.data;
            break;
          }
          case 'api_jobs_delete': {
            const { id } = tc.execute.params;
            const res = await axios.delete(`http://localhost:5000/api/jobs/${id}`);
            responseStatus = res.status;
            responseData = res.data;
            break;
          }
          case 'api_cv_upload': {
            const { filename, content } = tc.execute.params;
            const formData = new FormData();
            const blob = new Blob([content], { type: 'application/pdf' });
            formData.append('cv', blob, filename);
            const res = await fetch('http://localhost:5000/api/config/cv-upload', {
              method: 'POST',
              body: formData
            });
            responseStatus = res.status;
            responseData = await res.json();
            break;
          }
          case 'api_scrape_trigger': {
            const res = await axios.post('http://localhost:5000/api/scrape');
            responseStatus = res.status;
            responseData = res.data;

            // Wait for scrape background task to finish (check phase == 'done')
            let isDone = false;
            for (let attempt = 0; attempt < 100; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, 200));
              const statusRes = await axios.get('http://localhost:5000/api/scrape/status');
              if (statusRes.data && statusRes.data.phase === 'done' && !statusRes.data.isScraping) {
                isDone = true;
                break;
              }
            }
            break;
          }
          case 'api_scrape_status': {
            const res = await axios.get('http://localhost:5000/api/scrape/status');
            responseStatus = res.status;
            responseData = res.data;
            break;
          }
          case 'direct_profession_scrape': {
            const { scrapeProfessionHu } = require('../../src/scrapers/profession');
            const keyword = (tc.configSetup && tc.configSetup.keywords && tc.configSetup.keywords[0]) || 'TypeScript';
            const locations = (tc.configSetup && tc.configSetup.locations) || [];
            const result = await scrapeProfessionHu(keyword, locations);
            responseStatus = 200;
            responseData = result;
            break;
          }
        }

        // Run assertions
        const caseErrors: string[] = [];

        if (tc.assertions.status !== undefined && responseStatus !== tc.assertions.status) {
          caseErrors.push(`Expected HTTP status ${tc.assertions.status}, got ${responseStatus}`);
        }

        if (tc.assertions.responseBodyContains) {
          const bodyStr = JSON.stringify(responseData).toLowerCase();
          for (const piece of tc.assertions.responseBodyContains) {
            if (!bodyStr.includes(piece.toLowerCase())) {
              caseErrors.push(`Expected response body to contain "${piece}"`);
            }
          }
        }

        if (tc.assertions.responseBodyEquals) {
          const actualStr = JSON.stringify(responseData);
          const expectedStr = JSON.stringify(tc.assertions.responseBodyEquals);
          if (actualStr !== expectedStr) {
            caseErrors.push(`Expected response body to equal ${expectedStr}, got ${actualStr}`);
          }
        }

        if (tc.assertions.dbState) {
          const db = getTestDb();
          const table = tc.assertions.dbState.table;
          try {
            if (tc.assertions.dbState.count !== undefined) {
              const row = db.prepare(`SELECT count(*) as count FROM ${table}`).get() as { count: number };
              if (row.count !== tc.assertions.dbState.count) {
                caseErrors.push(`Expected database count for table '${table}' to be ${tc.assertions.dbState.count}, got ${row.count}`);
              }
            }
            if (tc.assertions.dbState.where && tc.assertions.dbState.expectedRows) {
              const rows = db.prepare(`SELECT * FROM ${table} WHERE ${tc.assertions.dbState.where}`).all();
              for (const expectedRow of tc.assertions.dbState.expectedRows) {
                let found = false;
                for (const row of rows as any[]) {
                  let rowMatches = true;
                  for (const [key, val] of Object.entries(expectedRow)) {
                    if (row[key] !== val) {
                      rowMatches = false;
                      break;
                    }
                  }
                  if (rowMatches) {
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  caseErrors.push(`Expected DB row in '${table}' matching ${JSON.stringify(expectedRow)}, none found in: ${JSON.stringify(rows)}`);
                }
              }
            }
          } catch (dbErr: any) {
            caseErrors.push(`Database query failed during assertion: ${dbErr.message}`);
          } finally {
            db.close();
          }
        }

        if (tc.assertions.webhookTriggered !== undefined) {
          const webhookRes = await axios.get('http://localhost:5001/api/test/received-webhooks');
          const webhooks = webhookRes.data;
          const triggered = webhooks.length > 0;
          if (triggered !== tc.assertions.webhookTriggered) {
            caseErrors.push(`Expected webhookTriggered to be ${tc.assertions.webhookTriggered}, got ${triggered}`);
          }
          if (tc.assertions.webhookCount !== undefined && webhooks.length !== tc.assertions.webhookCount) {
            caseErrors.push(`Expected webhookCount to be ${tc.assertions.webhookCount}, got ${webhooks.length}`);
          }
          if (tc.assertions.webhookPayloadContains && webhooks.length > 0) {
            const payloadStr = JSON.stringify(webhooks).toLowerCase();
            for (const piece of tc.assertions.webhookPayloadContains) {
              if (!payloadStr.includes(piece.toLowerCase())) {
                caseErrors.push(`Expected webhook payload to contain "${piece}"`);
              }
            }
          }
        }

        if (caseErrors.length === 0) {
          console.log(`[PASS] ${tc.id}`);
          passedCount++;
        } else {
          console.error(`[FAIL] ${tc.id}`);
          for (const err of caseErrors) {
            console.error(`  - ${err}`);
          }
          failedCount++;
          failuresReport.push(`${tc.id}: ${tc.name} -> ${caseErrors.join(' | ')}`);
        }

      } catch (tcErr: any) {
        console.error(`[ERROR] ${tc.id} threw an unhandled error:`, tcErr.message);
        failedCount++;
        failuresReport.push(`${tc.id}: ${tc.name} -> Unhandled error: ${tcErr.message}`);
      }
    }

    console.log('\n============================================');
    console.log('=== E2E Test Report Summary ===');
    console.log(`Total Run:  ${testCases.length}`);
    console.log(`Passed:     ${passedCount}`);
    console.log(`Failed:     ${failedCount}`);
    console.log('============================================');

    if (failedCount > 0) {
      console.log('\nDetailed Failures:');
      for (const fail of failuresReport) {
        console.log(`- ${fail}`);
      }
      console.log('\n(Note: Failing scraperManager integration tests are expected at this stage, but the runner executed successfully.)');
    }

    // Clean up test DB files
    try {
      const DB_FILE = path.join(process.cwd(), 'jobs.test.db');
      if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
      if (fs.existsSync(`${DB_FILE}-shm`)) fs.unlinkSync(`${DB_FILE}-shm`);
      if (fs.existsSync(`${DB_FILE}-wal`)) fs.unlinkSync(`${DB_FILE}-wal`);
    } catch (cleanErr) {}

    // Shutdown processes
    console.log('Shutting down spawned application server...');
    appProcess.kill();
    await stopMockServer();

    process.exit(failedCount);

  } catch (err: any) {
    console.error('Fatal runner error:', err.message);
    appProcess.kill();
    await stopMockServer();
    process.exit(1);
  }
}

run();
