# Issue 79 autonomous technical failure recovery

**Goal:** Complete the approved Single-Issue recovery lifecycle in the existing Issue task and worktree.
**Why planning is required:** Changes to workflow authority, exclusive task ownership, integration verification and close renewal are High-risk.
**Acceptance:** AC-1 through AC-10 of GitHub Issue 79; exact-candidate focused checks, repository full suite and independent Standards/Spec review pass before completion. No installation, target integration, cleanup, closure, push or deployment in this execution lane.

## Authority and lane

- Spec: `I_kwDOTh5gv88AAAABQPxr_w`; approved scope `sha256:0474c7b73328633600ba7b5552d39de5e7da6edf20d290b488accbde1b912230`.
- Run: `workflow-op-v1-b035d845a3841ef4bdb5c0bc56b90e0be0be036b669f30782f31599920971b62`.
- Execution operation: `workflow-op-v1-3f8bbcd7d9ac6a6f377f9aa4fdbd0bc3cb1dddc0f60a2cecf7fd5730fe5509f9`.
- Baseline and Planning Seal: `28857351f4243bb4d7ba1d9998195073df2135c0`; target `features/ron`.
- Task: `01a08084-bbfd-7aa0-8b1c-401c6b3211c1`; existing worktree `C:/Users/ron.chang/.codex/worktrees/d7e1/skills`; branch `codex/issue-79-autonomous-recovery`.
- Pinned Matt/Ron package: `852bd245fbd94b8a7a815de4a52e036cfa691f97c1169fddff6e604ef53ea90f`. Generic required host helpers use the current catalog, as explicitly clarified by the original coordinator after human approval. Preserve the initial blocked note and creation intent.
- Initial material repair count is zero, proved by the initial tracker history and no preceding implementation. Carry cumulative progress through subsequent review repairs.

### Outcome 1: Source boundaries survive dispatch and re-entry
- Work: Correct `codex-workflow-tasks.mjs` and owning instructions. Pin Matt/Ron owners and shared package references; allow explicitly required generic host helpers from the current catalog. Retain historical task intents and diagnose truly missing dependencies. This is necessary discovery under AC-1/AC-10, explicitly authorized in the continuation.
- Verify: `node --test tests/ron-workflow/codex-workflow-tasks.test.mjs tests/ron-workflow/skill-contracts.test.mjs`.

### Outcome 2: Integration evidence survives failed and uncertain operations
- Work: Extend the existing close owner and continuation/record consumer seams with durable exact-combination obligations and PASS/FAIL/UNKNOWN results. A failed check preserves merge/worktree/completion; unchanged failure suppresses redispatch. All checks must pass before cleanup/closure. Covers AC-1/AC-2/AC-9.
- Verify: `node --test tests/ron-workflow/close-continuation.test.mjs tests/ron-workflow/close-conflict-recovery.test.mjs` and real temporary Git failure/re-entry fixtures.

### Outcome 3: One isolated repair owner and cumulative budget
- Work: Extend native task adapter, Run facts/journal/coordinator to persist diagnosis, creation/message intent and explicit ownership transfer. Reuse exactly matched repair tasks across uncertainty/restart. Preserve original worktree/operation, ten material waves, independent nodes and Pause/Stop. Covers AC-1/AC-3/AC-4/AC-5/AC-9.
- Verify: Focused native-task and coordinator tests with lost responses, active old writers, pending setup, restart, duplicate delivery and budget exhaustion.

### Outcome 4: Repair lineage and maintenance resume the same Run
- Work: Connect verified Issue replacement completion and isolated governing-workflow maintenance to original failure/ownership/candidate lineage. Prove runtime compatibility from changed behavior and input evidence, retaining Grants and history. No fabricated conflict events, automatic reopening or product-package edits. Covers AC-6/AC-7/AC-8.
- Verify: Packaged source/task and real Git integration tests; prior-format incomplete Run fixtures in installed-entry and github-workflow-sources tests. State native-host coverage limits.

### Outcome 5: Contracts and reviewed candidate agree
- Work: Synchronize execution, close, coordinator interfaces, glossary, ADR-0038, promoted docs and routing with actual behavior. Declare this required non-contract plan as a workflow artifact. Covers AC-10 and final verification of all ACs.
- Verify: `node --test tests/ron-workflow/*.test.mjs`, configured typechecking if any, `git diff --check`, independent Standards and Spec review at the exact committed candidate; publish/read back one current completion.
