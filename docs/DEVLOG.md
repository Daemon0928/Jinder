# Development Log (internal)

> Historical notes from the initial build of the No Fluff Jobs scraper track.
> For user-facing documentation see the root [README.md](../README.md).

# Project: Jinder No Fluff Jobs Scraper Support

## Architecture
- Jinder is an application that scrapes IT/tech jobs in Hungary, matching them semantically against a user CV stored in SQLite database (`jobs.db`) config table using Gemini, and triggers Discord Webhooks for highly matching positions (match score >= 80%).
- Data flow:
  1. Trigger scraping with keyword and locations.
  2. Scraper Manager retrieves location settings, triggers scrapers (Profession.hu and No Fluff Jobs) in parallel or sequentially.
  3. No Fluff Jobs Scraper first attempts the API search endpoint: `POST https://nofluffjobs.com/api/search/posting?salaryCurrency=HUF&salaryPeriod=month` with payload `{ "rawSearch": "<keyword>", "page": 1, "pageSize": 100, "criteriaSearch": { "city": [<mapped_locations>] } }`. If blocked or empty, crawls user-facing HTML pages via Playwright.
  4. For each job result, detail page text is fetched using details API (`GET https://nofluffjobs.com/api/posting/<slug>`) or Playwright/Axios fallback. Text from fields like `requirements.musts`, `requirements.nices`, `specs.dailyTasks`, and `requirements.description` is combined into a single text block.
  5. The Scraper Manager checks for duplicates (prefixed as `nofluffjobs-<slug>` or similar), fetches details, matches using Gemini, saves matching metrics, and alerts on Discord if match score >= 80%.

## Milestones
| Track / Milestone | Scope | Assigned Agent | Status |
|---|---|---|---|
| **E2E Testing Track** | Design test cases, build E2E suite, publish `TEST_READY.md` | E2E Sub-orch Gen 3 (`623b077f-ff76-4abc-8036-eff548bfbcee`) | DONE |
| **Implementation Track** | Drive milestones IMP-M1 through IMP-M4 below | Imp Sub-orch Gen 5 (`190c1049-3d55-4a2b-b434-5ff1642646ac`) | DONE |
| M1: Scraper Development | Create `src/scrapers/nofluffjobs.ts` | Delegated to Imp Sub-orch | DONE |
| M2: Scraper Manager | Integrate into `scraperManager.ts`, locations mapping, sqlite save | Delegated to Imp Sub-orch | DONE |
| M3: Gemini & Webhooks | Semantic matching, score >= 80% Discord alerts | Delegated to Imp Sub-orch | DONE |
| M4: Final verification | E2E test passes & adversarial coverage hardening | Delegated to Imp Sub-orch | DONE |
| M5: Finesse & Polishing | UI overflow fixes, experience logic weight caps, exclude keywords, dynamic batch sizes, CV reevaluation | Antigravity | DONE |


## Interface Contracts
### `src/scrapers/nofluffjobs.ts` ↔ `src/scrapers/scraperManager.ts`
- Functions exported from `nofluffjobs.ts`:
  - `scrapeNoFluffJobs(keyword: string, locations?: string[]): Promise<ScrapedJob[]>`
  - `scrapeJobDetails(link: string): Promise<string>`

### Database Schema Compatibility
- SQLite DB `jobs.db` holds scraped jobs in table `jobs`:
  - `job_id`: text (prefixed with `'nofluffjobs-'`)
  - `platform`: text (`'nofluffjobs'`)
  - `title`: text
  - `company`: text
  - `location`: text
  - `link`: text
  - `description`: text (extracted raw details)
  - `parsed_json`: text (JSON string of parsed job)
  - `match_score`: integer
  - `match_pros`: text (JSON string)
  - `match_cons`: text (JSON string)
  - `match_justification`: text
  - `status`: text (default `'new'`)

## Code Layout
- `src/scrapers/nofluffjobs.ts`: Scraper implementation for nofluffjobs.com/hu.
- `src/scrapers/scraperManager.ts`: Main entry point runner calling all scrapers.
- `tests/scratch/test-nofluff.ts`: Verification script for the new scraper.

## Docker Integration

We support running the Jinder application and its E2E test suite in a Linux environment using Docker.

### Requirements
- Docker and Docker Compose installed on the host.
- A `.env` file in the root containing your `GEMINI_API_KEY`.

### Build & Start the Application
To build the Docker image and start the backend/frontend server (exposing on port `5000`):
```bash
docker compose up --build jinder
```

### Run the E2E Test Suite
To run all 63 E2E test cases inside the Linux container:
```bash
docker compose run --rm tests
```
