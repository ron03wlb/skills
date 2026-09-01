# Issue 25 review classification and aggregate repair ownership

**Goal:** Make every Issue-delivery review consumer use one evidence-backed confirmed-finding versus advisory gate and give aggregate corrections an explicit human-created Issue owner.
**Why planning is required:** This changes promoted public skill contracts and later appends irreversible tracker evidence.
**Acceptance:** AC-1 through AC-4 in GitHub Issue 25 pass; the candidate contains only the Issue-owned contract, documentation, metadata, router, tests, and this required plan; focused and full repository suites pass; independent Standards and Spec review are clean; the worktree is clean at the reviewed candidate. Before tracker writes, re-read Issue 24 and Issue 25 plus the bound DAG Run Grant, stop on identity or scope drift, append only the required adoption and completion records, and read each back. Do not close, push, deploy, execute prerequisites, or modify unrelated state.

### Outcome 1: Executable review-classification contract
- Work: Add regression assertions at the existing skill-contract seam for evidence-confirmed Standards and Spec violations, unsupported advisories, advisory visibility without failure or durable waiver state, and the absence of automatic tracker or product repair.
- Verify: `node --test --test-name-pattern="code review advisory|confirmed code review finding|Aggregate repair Issue|target verification" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Synchronized Issue-delivery semantics
- Work: Update `code-review`, `execute-issue`, and `verify-target-before-push` instructions so the Coordinator classifies observations from exact evidence while keeping Standards and Spec separate; aggregate confirmed findings withhold readiness and name the affected Issue, Spec, target, and a new human-created Aggregate repair Issue as the default owner. Re-sync their promoted docs and invocation metadata plus the `ask-matt` skill and docs without weakening existing gates.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Clean reviewed candidate and bounded tracker evidence
- Work: Review the exact baseline-to-candidate diff, repair only confirmed in-scope findings, and publish the required workflow-artifact adoption and `implementation_complete` records only after all final evidence binds the unchanged candidate.
- Verify: `node --test tests/ron-workflow/*.test.mjs`
- Verify: `git diff --check`
