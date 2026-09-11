# Issue 88/89 recovery revision and execution

**Goal:** Publish one narrowly revised Spec 88/Issue 89 authority and complete Issue 89 from new operation `workflow-op-v1-36080e3e6b11689c5bf6c398506d39014439f285d1184f51b18a0b1e791e666f` without changing unrelated children or user work.
**Why planning is required:** This changes public tracker contracts, creates new workflow authority, installs an executable workflow package, and writes external tracker state.
**Acceptance:** The new publication is read back under approved scope `sha256:6e3328b3a7e8e67c3d0cf008abe05b812edd01da30e3b4274179f663b6f78e05`; Issue 89 alone receives the approved behavioral contract change, while Issues 90 and 91 receive only the mechanically required Planning baseline update; Issue 89 receives a clean implementation receipt; every repository, tracker, package, and managed-entry mutation is exact and recoverable; Issue 88 and Issue 89 remain open for their separate closeout owner; no push or deployment occurs.

### Outcome 1: Publish a narrow recovery revision
- Work: Revise the existing Multi-Issue Spec 88 and executable child 89 only enough to authorize the remaining post-selection batch-close runtime-evidence repair and reuse the prior repaired behavior. Preserve keys, target, blockers, exclusions, immutable history, and the behavioral contracts of Issues 90 and 91; update those siblings only to the newly required Planning baseline and Seal. Publish the new `to-spec` and `to-tickets` records through read/write/read-back using the new approved publication identity.
- Risks/open questions: Stop before mutation if Issue 90 or 91 requires any change beyond Planning baseline metadata, if an old lane is active or ambiguous, or if exact tracker/version/checkpoint ownership cannot be proved. Never reset or rewrite the old ten-wave records.
- Verify: `gh issue view 88 --repo ron03wlb/skills --json body,state,comments`
- Verify: `gh issue view 89 --repo ron03wlb/skills --json body,state,comments`

### Outcome 2: Reconcile and repair Issue 89 in the new operation
- Work: Start from target baseline `23673b326ab256c6bad1dd8e822496c9ced5643d` in a new isolated Issue worktree, reconcile the prior Issue 89 candidate without rewriting its immutable history, and repair the batch `close()` rejection boundary. Every post-selection failure retains selected runtime evidence; every selected lane receives at most one cleanup attempt; a cleanup failure cannot replace an earlier primary failure; CLI error output exposes the same evidence. Preserve the pre-selection no-runtime rule and all existing Acceptance Criteria.
- Risks/open questions: Any change to Issue behavior, target, exclusions, sibling ownership, or installation authority stops for planning. The old blocked candidate remains preserved until the new candidate is independently verified.
- Verify: `node --test --test-name-pattern "selected batch close failures" tests/ron-workflow/installed-entry.test.mjs`
- Verify: `node --test tests/ron-workflow/installed-entry.test.mjs`

### Outcome 3: Prove effective installation and publish implementation completion
- Work: Run separate Standards and Spec review against the new execution baseline, repair only confirmed in-scope findings within the new operation budget, install only the exact reviewed package through the existing installer authority, and verify both configured managed entries, manifest, candidate, retained packages, and original failed-stage qualification before publishing one `implementation_complete` record.
- Risks/open questions: Stop on dirty or mismatched Issue worktree, changed required external inputs, installation lock ambiguity, unqualified effective bytes, or any non-clean review axis. Do not integrate, remove either Issue worktree, close either Issue, push, or deploy.
- Verify: `node --test tests/ron-workflow/workflow-installation.test.mjs tests/ron-workflow/installed-entry.test.mjs`
- Verify: `node --test tests/ron-workflow/*.test.mjs`
