# Codex-native workflow coordinator

**Goal:** Implement Issue #15's explicit-only personal coordinator so one authorized Tracker Spec can reconcile and advance its dependency-ready Codex Issue lanes until delivery success or a diagnosed stop.
**Why planning is required:** The coordinator can create Codex tasks and authorize tracker/worktree leaf mutations, making its public workflow contract and recovery behavior High-risk.
**Acceptance:** The candidate binds only the exact Spec/target/classification/scope/decomposition identity; uses one saved-project local Codex task per Issue lane; derives actions only from the existing reducer and live evidence; bounds task retry, tracker probes, close writers, and exact environment remediation; resumes without duplicate lanes or close actions; remains explicit-only and personal; preserves the original checkout; and performs no integration, Issue closure for #15, push, deploy, panel work, or Issue #17 end-to-end composition. Focused and full repository verification, Standards review, and Spec review must be clean before completion.

### Outcome 1: Explicit personal skill contract

- Work: Add `skills/personal/run-issue-workflow/SKILL.md` and `agents/openai.yaml` for exact/no-argument selection, DAG Run Grant creation/renewal, saved-project local task lifecycle, reducer-driven execution/close waves, re-entry, outage/remediation boundaries, and fail-closed stops. Register only in `skills/personal/README.md`; keep promoted READMEs, public docs, plugin packaging, push, deploy, panel, and shared-skill self-editing outside the interface.
- Risks/open questions: Public OpenAI documentation does not expose the app-internal task tool schema, so the skill must bind to the current host's task tools without claiming an external API contract.
- Verify: `node --test --test-name-pattern="Codex-native workflow coordinator" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Deep coordinator module with real adapter seams

- Work: Add `skills/personal/run-issue-workflow/scripts/run-coordinator.mjs` with one `createCoordinator(...).run(request)` interface. Reuse `run-core.mjs`, `run-journal.mjs`, and `run-store.mjs`; keep normalized evidence acquisition, Codex task operations, leaf closeout, and recognized environment remediation behind injected adapters. Journal dispatch/retry/remediation facts, honor `max_parallel`, serialize close actions, wait on active task refs, and stop on semantic/contradictory evidence.
- Risks/open questions: A coordinator interruption between task creation and journal append must fail closed and reconcile a unique live lane before any replacement; it must never guess or create a duplicate.
- Verify: `node --test tests/ron-workflow/run-issue-workflow-coordinator.test.mjs`

### Outcome 3: Focused recovery and boundary evidence

- Work: Add fake-adapter tests for exact/no-argument selection, initial and resumed task dispatch, same-task retry and proven replacement, settled-task adoption after coordinator loss, partial close resumption, independent scheduling up to default three, tracker recovery/exhaustion at 5/15/30 seconds without Issue retry consumption, exact one-cycle Gradle loopback remediation, semantic no-retry stops, and personal-only packaging.
- Verify: `node --test tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Repository-wide candidate gate

- Work: Commit coherent slices, run required syntax/focused/full checks, compare the exact baseline-to-candidate diff with Issue #15 AC-1 through AC-7 and exclusions, then run independent Standards and Spec review. Repair only confirmed in-scope findings for at most ten waves and rerun both axes after each repair.
- Verify: `node --test tests/ron-workflow/*.test.mjs` and `git diff --check b27b88e005cf7581720ff8e9a59767d4c786d3a5..HEAD`
