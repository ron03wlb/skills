# Issue #39 isolated Spec planning lane

**Goal:** Publish one Tracker Spec from one task-owned isolated planning lane through optimistic Planning baseline revalidation and a minimal current producer transaction.
**Why planning is required:** This Issue changes public workflow authority, tracker publication, and durable checkpoint contracts across skill, documentation, metadata, router, and store surfaces.
**Acceptance:** GitHub Issue #39 AC-1 through AC-4 pass from execution baseline `5dfead015ee6f1ea7247c064a570dd3bd27a06e1`; existing legacy transaction-v1 and `to-spec@v1` receipts keep exact frozen resume behavior; fresh ordinary Spec publication creates no target operational-plan commit or prospective contribution record; focused and full repository verification pass; both review axes are clean; the Issue worktree is clean at one reviewed candidate; only the required tracker completion evidence is published.

### Outcome 1: Bind one isolated planning lane
- Work: Make `grill-with-docs` and `domain-modeling` bind the current Codex task, one proposed Tracker Spec, one target, and one isolated planning worktree; define accepted-decision writes, handoff, and disposal boundaries without a shared planning checkout or global lock.
- Verify: `rtk node --test --test-name-pattern="grill-with-docs|planning lane|Planning baseline|to-spec|same-command" tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs`

### Outcome 2: Publish through optimistic baseline revalidation
- Work: Rework `to-spec` around relevant glossary, ADR, and source revalidation; allow compatible target movement to bind the latest baseline; return one evidence-rich Recoverable blocker for relevant drift; serialize only an accepted glossary or ADR Planning Seal write.
- Verify: `rtk node --test --test-name-pattern="grill-with-docs|planning lane|Planning baseline|to-spec|same-command" tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs`

### Outcome 3: Add the minimal current Spec producer profile
- Work: Add a purpose-specific `to-spec@v2` store profile for publication and handoff while preserving existing legacy and producer-profile-v1 transactions byte-for-behavior; define concrete checkpoint, tracker, and handoff adapter contracts with exact-operation retry semantics.
- Verify: `rtk node --test --test-name-pattern="workflow checkpoint producer profiles|to-spec" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Synchronize and prove the public route
- Work: Synchronize required skill instructions, internal references, docs, invocation metadata, router text, and README summaries in English; classify every gate and keep same-command recovery local to the owning seam.
- Verify: `rtk node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs` and `rtk git diff --check`

### Outcome 5: Review, repair, and publish completion evidence
- Work: Commit the candidate, run independent Standards and Spec review from the fixed execution baseline with this plan declared as the only `workflowArtifacts` entry, repair only confirmed in-scope findings, rerun final verification, and publish/read back the exact `implementation_complete` note.
- Verify: clean worktree at reviewed `HEAD`, exact final command results, unchanged target checkout, and GitHub Issue #39 comment read-back.
