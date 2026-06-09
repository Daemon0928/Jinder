# Scope: E2E-M1 Test Infrastructure Design

## Architecture
- The test infrastructure needs to support running 60+ E2E tests across 4 tiers (Feature Coverage, Boundary/Corner, Cross-Feature, Real-World Application).
- It should run using a simple command and return exit code 0 if all tests pass, non-zero otherwise.
- The tests should interact with the application via its entry points/CLI (e.g., scraper manager or scraping functions) and utilize mock/sandbox data.
- A mock HTTP server should be set up to mock nofluffjobs.com APIs (`/api/search/posting` and `/api/posting/<slug>`) and Discord Webhooks.
- Database state must be sandboxed using a test database file.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1.1 | Explore & Design | Plan the test directory structure, mock data format, and test cases schema. Recommend changes in code for testability. | None | DONE |
| M1.2 | Implement Infra & Mocks | Create `TEST_INFRA.md` in project root. Implement mock HTTP server, test database helper, and test runner harness. | M1.1 | IN_PROGRESS |
| M1.3 | Review and Verify | Review and verify the implemented test infra and `TEST_INFRA.md` against requirement specs. | M1.2 | PLANNED |

## Interface Contracts
- Mock server must listen on a local port (e.g., 5001 or dynamic) and match the No Fluff Jobs API patterns.
- Test runner must have a configuration to route HTTP requests from the scraper to the mock server (e.g., via environment variable or custom config).
