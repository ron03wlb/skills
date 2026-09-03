# Issue #40 - Minimal to-tickets decomposition producer

**Goal:** Make fresh Multi-Issue decomposition use one minimal operation-scoped producer transaction and composite Run handoff without target plan checkpoints or prospective contribution evidence.
**Why planning is required:** This Issue changes public workflow authority, durable checkpoint profiles, tracker publication contracts, and the Run consumer across promoted skills and repository control code.
**Acceptance:** GitHub Issue #40 AC-1 through AC-4 pass from execution baseline `4eb4e530936b7ea7b942295c444d3065f3a8eb7e`; fresh `to-tickets@v2` operations retain only decomposition, ready-state, and handoff receipts while existing legacy and profile-v1 receipts keep frozen exact-resume behavior; canonical child, relation, partial-publication, record, and ready-frontier behavior remains intact; the Run consumer accepts the new composite handoff without repeating upstream validation; focused and full repository verification pass; both review axes are clean; and the Issue worktree is clean at one reviewed candidate. Before the completion-note write, re-read Issue #40, parent #37, the adoption record, blocker state, candidate, reviews, verification, and worktree identities. Any mismatch, scope change, or tracker write/read-back uncertainty stops with #40 open and the Issue worktree preserved for the same `/execute-issue 40` retry.

### Outcome 1: Add the minimal current decomposition profile
- Work: Drive `workflow-control-store.mjs` through its public store interface so fresh `to-tickets@v2` transactions expose only `decomposition.read_back`, `ready_state.read_back`, and `handoff.completed`; preserve every legacy and `to-tickets@v1` identity, stage order, receipt, and exact retry.
- Verify: `rtk node --test --test-name-pattern="to-tickets|operation isolation|decomposition|ready frontier|composite handoff" tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs`

### Outcome 2: Publish through concrete producer-owned interfaces
- Work: Add the focused `to-tickets` adapter reference and synchronize its public skill, docs, metadata, router summaries, README entries, and domain vocabulary. Bind upstream publication and handoff read-back, current operation receipt, selected Planning Seal, parent, target, classification, approved scope, canonical mapping, blocker edges, and decomposition identity/digest without a target plan, checkpoint commit, or prospective attestation.
- Verify: `rtk node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs`

### Outcome 3: Keep the immediate Run consumer compatible
- Work: Update the Run-ready handoff contract and fixtures to consume the current Multi-Issue receipt shape while retaining frozen legacy/profile-v1 handoffs. Keep producer generation, tracker reconciliation, review, and aggregate validation upstream.
- Verify: `rtk node --test --test-name-pattern="Run-ready handoff|to-tickets|composite handoff" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs`

### Outcome 4: Prove the complete Issue contribution
- Work: Run final focused and full repository checks, compare the exact baseline-to-candidate diff with AC-1 through AC-4, complete independent Standards and Spec review, and repair only confirmed in-scope findings before publishing one read-back completion note.
- Verify: `rtk node --test tests/ron-workflow/*.test.mjs` and `rtk git diff --check 4eb4e530936b7ea7b942295c444d3065f3a8eb7e...HEAD`
