# Scope: E2E Test Implementation and Verification

## Architecture
- E2E Mock Server inside `tests/e2e/mock-server.ts` will support dynamic mock rules set via API.
- Matcher module `src/matcher/gemini.ts` will check mock rules on the mock server when `MOCK_GEMINI` is enabled.
- package.json script `test:e2e` runs the test suite via `npx tsx tests/e2e/run-tests.ts`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Mock Server Dynamic Rules | Implement dynamic rules (`activeRules`), set/get APIs, and `resetMockServer()` function, update route mappings | None | PLANNED |
| M2 | Gemini Mock Support | Update `src/matcher/gemini.ts` to call `/api/test/mock-rules` to query dynamic mock rules | M1 | PLANNED |
| M3 | Run E2E Tests | Add `test:e2e` script, run tests, fix any failing cases to achieve 100% pass | M2 | PLANNED |
| M4 | Documentation | Create `TEST_INFRA.md` and `TEST_READY.md` | M3 | PLANNED |

## Interface Contracts
- Mock server dynamic rule endpoints:
  - POST `/api/test/set-mock-rules`
  - GET `/api/test/mock-rules`
- `resetMockServer()` clears dynamic rules and webhooks.
- Test runner returns exit code 0 when all tests pass.
