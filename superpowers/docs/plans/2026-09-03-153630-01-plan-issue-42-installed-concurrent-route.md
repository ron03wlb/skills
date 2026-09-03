# Prove the installed concurrent workflow and push boundary

**Goal:** Make the installed Ron workflow diagnosable and prove its existing planning, Run, aggregate-verification, and explicit-push seams as one consumer-visible route.
**Why planning is required:** The work spans public skill contracts, installed adapter discovery, concurrent workflow fixtures, and the remote-delivery authority boundary.
**Acceptance:** Work remains in the Issue #42 worktree at baseline `df7e59c315fc8c001eefdebc402365c96a40b95c`; setup diagnostics stay read-only and non-authorizing; existing producer, Run, verification, and push semantics do not change; no test or implementation performs a real tracker mutation or remote push; any scope, authority, baseline, or seam contradiction stops before further writes; final verification, two-axis review, clean worktree, and tracker completion-note read-back all succeed.

### Outcome 1: Read-only installed-seam diagnostics
- Work: Extend `setup-matt-pocock-skills` and its focused setup/tracker guidance so the configured tracker, labels, checkpoint store, producer handoffs, target reader, shared writer, and required public skill surfaces are discoverable from their owning sources. Missing seams report exact source and repair guidance without authorizing publication, execution, integration, verification, or push.
- Verify: `rtk node --test --test-name-pattern="installed route|setup diagnostics" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Stable public interfaces with focused internals
- Work: Keep invocation, human authority transitions, major gates, results, and next commands visible in the public setup, planning, Run, verification, push, and router surfaces while moving installation, adapter-payload, and receipt detail behind owner-local references or existing runtime modules. Preserve promoted packaging and personal-package boundaries.
- Verify: `rtk node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Consumer-visible concurrent installed route
- Work: Add one behavior-first fixture that composes two isolated Spec lanes and independent producer operations with separate per-Spec Runs on one target, continued ready work during a bounded writer wait, serialized integration, post-wait authority reacquisition, one owning-source repair plus same-command retry, and no cross-lane mutation.
- Verify: `rtk node --test --test-name-pattern="installed route|concurrent Spec|operation isolation|writer wait|same-command" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`

### Outcome 4: Aggregate verification to explicit push boundary
- Work: Add focused integration coverage for the frozen reachable closed-member range, exclusion of open unreachable candidates, target-movement invalidation, and exact `push_ready` receipt consumption. Keep verification non-pushing and push as one separately authorized non-force action with remote read-back.
- Verify: `rtk node --test --test-name-pattern="installed route|push_ready" tests/ron-workflow/skill-contracts.test.mjs`
- Verify: `rtk node --test --test-name-pattern="installed route|concurrent Spec|operation isolation|writer wait|same-command|push_ready" tests/ron-workflow/*.test.mjs`
- Verify: `rtk node --test tests/ron-workflow/*.test.mjs`
- Verify: `rtk git diff --check`
