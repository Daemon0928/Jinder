# Project Context - Jinder Support Orchestrator

## Current Codebase Context
- **Repository**: Jinder job scraping and matching engine.
- **Language**: TypeScript (`tsc` target, `tsx` for running dev/scripts).
- **Database**: SQLite (`jobs.db`) with two main tables:
  - `jobs`: Stores crawled positions. Key fields: `job_id` (unique text), `platform` (text), `title`, `company`, `location`, `link`, `description`, `parsed_json`, `match_score`, `match_pros`, `match_cons`, `match_justification`, `status`.
  - `config`: Stores general configuration items, including `cv` (user's CV text) and `locations` (JSON array of mapped location keywords).
- **Job Matching**: Done via `matchJobWithGemini` in `src/matcher/gemini.ts`. Score >= 80% triggers Discord webhooks (using webhook URL from `config` table key `discord_webhook`).
- **Scraper manager**: `src/scrapers/scraperManager.ts` runs scrapers. Currently only Profession.hu scraper exists (`src/scrapers/profession.ts`).

## Active Coordination
- **E2E Testing Track Orchestrator**: `dab62315-8925-41f5-bdb2-44247201fa1d` (working folder: `.agents/sub_orch_e2e_testing`). Designs and builds the tests independently.
- **Implementation Track Orchestrator**: `bf60a732-9237-4bcc-aecd-65cc0f4c9b38` (working folder: `.agents/sub_orch_implementation`). Builds the No Fluff Jobs scraper, registers it in the manager, updates SQLite storage and location mappings, and runs matches/alerts.

## External Documentation & Vault Paths
- Verbatim request: `.agents/orchestrator/ORIGINAL_REQUEST.md` (and `C:/Users/mark2/repos/Jinder/ORIGINAL_REQUEST.md`)
- Task list to check off: `C:/Users/mark2/repos/Jinder/vault/CodingWithAI/02 Projects/Jinder/Jinder.md`
- Today's daily log to append summary: `C:/Users/mark2/repos/Jinder/vault/CodingWithAI/01 Daily/2026-06-05.md`
