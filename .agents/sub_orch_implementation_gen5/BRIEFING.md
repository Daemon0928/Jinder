# BRIEFING — 2026-06-06T21:30:50+02:00

## Mission
Implement support for nofluffjobs.com/hu in the Jinder application, starting with IMP-M2.

## 🔒 My Identity
- Archetype: sub_orch
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: C:\Users\mark2\repos\Jinder\.agents\sub_orch_implementation_gen5
- Original parent: Jinder Support Orchestrator
- Original parent conversation ID: a810d610-89e2-4a03-99e5-424f4605db2d

## 🔒 My Workflow
- **Pattern**: Project (as sub-orchestrator)
- **Scope document**: C:\Users\mark2\repos\Jinder\.agents\sub_orch_implementation_gen5\SCOPE.md
1. **Decompose**: Milestones are predefined in SCOPE.md. For each milestone, execute the Explorer -> Worker -> Reviewer -> Challenger -> Forensic Auditor cycle.
2. **Dispatch & Execute** (pick ONE):
   - **Direct (iteration loop)**: For each milestone, run the loop:
     a. Spawn 3 Explorer(s) to recommend fix strategy.
     b. Spawn a Worker to implement changes, build, and test.
     c. Spawn 2 Reviewer(s) to examine correctness, robustness, and tests.
     d. Spawn 2 Challenger(s) to empirically verify correctness.
     e. Spawn a Forensic Auditor to perform integrity verification.
     f. Gate: Verify build/tests, reviews, challenger, auditor (CLEAN). Loop on failure.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Self-succeed at 16 spawns. Write handoff.md, spawn successor.
- **Work items**:
  - IMP-M1 [done]
  - IMP-M2 [pending]
  - IMP-M3 [pending]
  - IMP-M4 [pending]
- **Current phase**: 2
- **Current focus**: IMP-M2: Scraper Manager & DB Integration

## 🔒 Key Constraints
- Run the full Explorer -> Worker -> Reviewer -> Challenger -> Forensic Auditor cycle for each milestone.
- Do not make changes to source code directly; must delegate to subagents.
- Verify using tests and Forensic Auditor. Reject on any integrity violation.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.

## Current Parent
- Conversation ID: a810d610-89e2-4a03-99e5-424f4605db2d
- Updated: not yet

## Key Decisions Made
- Starting from IMP-M2 as IMP-M1 is completed.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_1 | teamwork_preview_explorer | IMP-M2 investigation | pending | e5f4249a-c725-4add-a537-38f39f4a234e |
| explorer_2 | teamwork_preview_explorer | IMP-M2 investigation | pending | 6175fa53-196d-4758-b4ca-8983673db604 |
| explorer_3 | teamwork_preview_explorer | IMP-M2 investigation | pending | 00a447b0-0eb9-4193-921f-cc36ae4eab81 |

## Succession Status
- Succession required: no
- Spawn count: 3 / 16
- Pending subagents: none
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: task-27
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- C:\Users\mark2\repos\Jinder\.agents\sub_orch_implementation_gen5\progress.md — progress tracker
- C:\Users\mark2\repos\Jinder\.agents\sub_orch_implementation_gen5\SCOPE.md — scope description
- C:\Users\mark2\repos\Jinder\.agents\sub_orch_implementation_gen5\ORIGINAL_REQUEST.md — verbatim user request
