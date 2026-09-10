# Issue 87 six-hour execution budget

**Goal:** Enforce one cumulative six-hour execution budget per Issue operation while preserving truthful long-lived dependency and writer contention.
**Why planning is required:** The change controls durable workflow authority, recovery ownership, timeout behavior, and close dispatch across process and task boundaries.
**Acceptance:** The original Run, Grant, Issue operation, task/worktree ownership, candidate, repair-wave budget, and late outcomes remain preserved; only proved execution activity is charged; uncertain time or ownership fails closed; exhaustion prevents new execution, repair, retry, and close dispatch without killing the current owner; no push, deployment, SQL, integration, or Issue closure occurs in this lane.

### Outcome 1: Durable operation-owned execution accounting
- Work: Extend the Run journal/store contracts with minimal Issue-operation phase and duration evidence covering implementation, conflict repair, replacement/retry, restart, and same-command re-entry without resetting consumed time.
- Risks/open questions: Clock movement, missing native task timing, duplicate turn evidence, and cross-task ownership must remain explicit rather than fabricating elapsed time.
- Verify: `node --test tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs`

### Outcome 2: Independent six-hour authorization boundary
- Work: Apply the accumulated budget before dispatch, execution repair/retry, and close continuation; interrupt bounded native observation at the deadline while preserving the live original owner and late outcome evidence.
- Risks/open questions: Deadline handling must not imply cancellation or consume the existing three-attempt and ten-wave limits.
- Verify: `node --test tests/ron-workflow/codex-workflow-tasks.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`

### Outcome 3: Truthful healthy and unknown contention handling
- Work: Keep verified healthy dependency, repository-close, and target-writer waits uncharged for at least twelve virtual hours; reconcile UNKNOWN owner health through the bounded 5/15/30-second fault policy and never translate unknown health into proven coordinator loss or lease release.
- Risks/open questions: Owner and generation drift must remain distinct from health unavailability, Pause/Stop, and authority drift.
- Verify: `node --test tests/ron-workflow/run-issue-workflow-recovery.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs`

### Outcome 4: Owner-facing contract and final evidence
- Work: Update affected English workflow instructions and host-driver evidence with the six-hour budget, healthy-wait semantics, virtual-time coverage, and explicit real Windows soak limitations.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs && node --test tests/ron-workflow/*.test.mjs`
