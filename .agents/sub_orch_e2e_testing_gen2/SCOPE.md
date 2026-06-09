# Scope: E2E Testing Track (Gen 2 Replacement)

## Architecture
- The E2E Testing Track is responsible for designing the test infrastructure, test runner, and test cases covering all 4 tiers of verification.
- Output: `TEST_READY.md` at project root, and the E2E test suite in the repository.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| E2E-M1 | Test Infrastructure Design | Design the test framework/harness, define JSON/input formats and test runner script. Create `TEST_INFRA.md`. | None | DONE |
| E2E-M2 | Test Cases Implementation | Write all 4 tiers of test cases (Tier 1-4, minimum 60 test cases) checking all features (F1-F5). | E2E-M1 | IN_PROGRESS |
| E2E-M3 | Test Runner & Validation | Develop the E2E test runner, compile/test it against mock data or sandbox, publish `TEST_READY.md`. | E2E-M2 | IN_PROGRESS |

## Interface Contracts
- The E2E test runner must run using a simple command and return exit code 0 if all tests pass, non-zero otherwise.
- The tests must interact with the application via its entry points/CLI (e.g. `test-nofluff.ts` or scraper functions) without needing internal code dependencies.
