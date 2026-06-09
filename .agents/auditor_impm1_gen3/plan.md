# Verification Plan — Forensic Audit of No Fluff Jobs Scraper

This plan outlines the step-by-step procedure to independently verify the No Fluff Jobs scraper implementation.

## Step 1: Static Analysis of `src/scrapers/nofluffjobs.ts`
- Check imports (`axios`, `cheerio`, `playwright`).
- Inspect for hardcoded job listings, search results, descriptions, company names, or URLs designed to circumvent actual HTTP / Playwright calls.
- Verify fallback mechanism logic (Axios Search API -> Playwright Search Crawl; Axios Details API -> Axios Details HTML -> Playwright Details HTML).

## Step 2: Running `test-nofluff.ts`
- Run the test script `npx tsx test-nofluff.ts`.
- Observe if the test passes.
- Inspect the output console logs to verify it actually contacts the target websites (e.g. prints retrieved job lists, sample job details, URLs).

## Step 3: Running `test-nofluff-adversarial.ts`
- Run `npx tsx test-nofluff-adversarial.ts`.
- Observe if it successfully triggers the simulated network failures and falls back correctly.

## Step 4: Verification of Network Activity & Absence of Mocking / Facade
- Verify that real network calls are made and that the tests do not mock responses inside the scraper codebase.
- Confirm there are no prohibited patterns:
  - Hardcoded test results.
  - Facade implementation (e.g. returning static values).
  - Fabricated verification outputs.
  - Self-certifying tests.
  - Execution delegation (to external pre-built scrapers).
