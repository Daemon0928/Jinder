# BRIEFING — 2026-06-05T17:56:09+02:00

## Mission
Implement support for nofluffjobs.com/hu in the Jinder application, allowing users to scrape IT/tech jobs and automatically match them against their uploaded CV using Gemini.

## 🔒 My Identity
- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: C:\Users\mark2\repos\Jinder\.agents\orchestrator
- Original parent: main agent
- Original parent conversation ID: 5a042fab-39cc-4022-986a-e99847cfb22a

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: C:\Users\mark2\repos\Jinder\.agents\orchestrator\PROJECT.md
1. **Decompose**: Decompose task into E2E testing track and implementation track. Implementation track has multiple milestones representing scrapers, scrapers manager, db/matching/webhooks, and final verification.
2. **Dispatch & Execute** (pick ONE):
   - **Delegate (sub-orchestrator)**: Spawn sub-orchestrators for milestones or dual tracks.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Spawn successor after 16 spawns, write handoff.md, exit.
- **Work items**:
  1. Decompose project into dual tracks (Implementation & E2E Testing) [pending]
  2. Implement E2E Testing track [pending]
  3. Implement No Fluff Jobs Scraper (Milestone 1) [pending]
  4. Scraper Manager Integration (Milestone 2) [pending]
  5. Gemini Matching & Webhooks (Milestone 3) [pending]
  6. Final Milestone: 100% E2E test pass & adversarial hardening (Milestone 4) [pending]
- **Current phase**: 1
- **Current focus**: Decompose project into dual tracks

## 🔒 Key Constraints
- NEVER write, modify, or create source code files directly (only delegate to workers/subagents).
- NEVER run build/test commands yourself.
- No reuse of a subagent after it has delivered its handoff.
- Forensic Auditor binary veto on integrity failure.

## Current Parent
- Conversation ID: 5a042fab-39cc-4022-986a-e99847cfb22a
- Updated: not yet

## Key Decisions Made
- Use Project pattern with dual tracks (Implementation and E2E Testing).

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| E2E Testing Sub-orchestrator | self | Design and run E2E Testing Track | failed | dab64315-8925-41f5-bdb2-44247201fa1d |
| Implementation Sub-orchestrator | self | Build and verify No Fluff Jobs support | failed | bf60a732-9237-4bcc-aecd-65cc0f4c9b38 |
| E2E Testing Sub-orchestrator Gen 2 | self | Design and run E2E Testing Track (Gen 2) | failed | 4178ed0e-5729-4195-92a2-0afe94650aad |
| Implementation Sub-orchestrator Gen 2 | self | Build and verify No Fluff Jobs support (Gen 2) | failed | 2a6e60fb-15e9-44a4-9093-e9a61529c430 |
| Implementation Sub-orchestrator Gen 3 | self | Build and verify No Fluff Jobs support (Gen 3) | failed | 190c1049-3d55-4a2b-b434-5ff1642646ac |
| E2E Testing Sub-orchestrator Gen 3 | self | Design and run E2E Testing Track (Gen 3) | in-progress | 623b077f-ff76-4abc-8036-eff548bfbcee |
| Implementation Sub-orchestrator Gen 4 | self | Build and verify No Fluff Jobs support (Gen 4) | failed | e838b1af-993a-4ee1-b111-581c58b6707d |
| TypeScript Developer & Test Runner | teamwork_preview_worker | Fix mock-server.ts and run E2E tests | failed | 691f0312-348e-4c4a-ad15-797e9032dfba |
| TypeScript Developer & Test Runner 2 | teamwork_preview_worker | Fix mock-server.ts and run E2E tests | pending | e9fb3a6a-442c-411f-9bf6-1a14ce083e9d |
| Implementation Sub-orchestrator Gen 5 | self | Build and verify No Fluff Jobs support (Gen 5) | in-progress | 190c1049-3d55-4a2b-b434-5ff1642646ac |

## Succession Status
- Succession required: no
- Spawn count: 10 / 16
- Pending subagents: 623b077f-ff76-4abc-8036-eff548bfbcee, 190c1049-3d55-4a2b-b434-5ff1642646ac, e9fb3a6a-442c-411f-9bf6-1a14ce083e9d
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: a498e6f3-a337-4f44-976b-f01f0939fb1a/task-83
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- C:\Users\mark2\repos\Jinder\.agents\orchestrator\PROJECT.md — Global index, architecture, milestones, interfaces
- C:\Users\mark2\repos\Jinder\.agents\orchestrator\progress.md — Internal heartbeat and state checkpoint
- C:\Users\mark2\repos\Jinder\.agents\orchestrator\ORIGINAL_REQUEST.md — Verbatim user request record
