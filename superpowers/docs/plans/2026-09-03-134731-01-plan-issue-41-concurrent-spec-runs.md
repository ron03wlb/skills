# Coordinate concurrent Spec Runs with bounded writer waits

**Goal:** Let independent per-Spec workflow runtimes continue Issue execution concurrently while serializing only target integration through repository-owned authority adapters and a bounded writer-wait state.
**Why planning is required:** The change alters concurrent coordinator behavior, durable Run state, shared-writer lease handling, and public operator recovery contracts.
**Acceptance:** Each runtime keeps its own active guard and `max_parallel`; the composition builds exact owning-source handoff, checkpoint, tracker/decomposition, target, and writer adapters; a readable healthy competing writer creates a bounded journaled wait without consuming execution slots; release triggers full authority reacquisition before closeout; unknown ownership, timeout, coordinator loss, control drift, or changed evidence performs no stale mutation and returns an actionable same-command recovery packet. Existing target, tracker, worktree, task, and journal state stays preserved on every stop.

### Outcome 1: Repository-owned runtime composition

- Work: Deepen the workflow runtime interface so callers supply owning sources and receive repository-built adapters for checkpoint and handoff read-back, tracker/decomposition facts, target state, reconciliation, and shared target-writer access. Keep the active guard and `max_parallel` scoped to one runtime and Run identity, with no global scheduler or shared slot pool.
- Verify: `rtk node --test --test-name-pattern="multiple Runs|runtime instance|handoff adapter" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`

### Outcome 2: Bounded target-writer wait and reconciliation

- Work: Represent healthy foreign writer contention as explicit journal and reducer state, keep ready Issue dispatch outside that wait, and have the coordinator observe bounded release before reacquiring tracker, target, candidate, completion, control-revision, Grant, and worktree facts. Never release or reclaim another active writer.
- Risks/open questions: Writer ownership that is unreadable, becomes stale, outlives the bound, loses its coordinator, or changes during reacquisition must fail closed without treating elapsed time as lease authority.
- Verify: `rtk node --test --test-name-pattern="writer wait|closeout contention|coordinator loss|control revision" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`

### Outcome 3: Operator contract and recovery evidence

- Work: Synchronize the personal skill, operator guide, README, metadata, and status examples where their public behavior changes. Describe the owning source, exact evidence, smallest human action, preserved stages, and same `/run-issue-workflow` retry for exceptional recovery while keeping setup, push, and cross-seam installed-route proof in Issue #42.
- Verify: `rtk node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Candidate-level regression proof

- Work: Add behavior-first tests at the runtime, reducer/coordinator, and end-to-end seams for separate Runs, per-Run concurrency, healthy writer release, timeout, ambiguous ownership, coordinator loss, authority drift, and changed post-wait evidence. Inspect adapter and journal call logs to prove only integration is serialized and that closeout uses freshly reacquired authority.
- Verify: `rtk node --test tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`
- Verify: `rtk node --test tests/ron-workflow/*.test.mjs`
- Verify: `rtk git diff --check`
