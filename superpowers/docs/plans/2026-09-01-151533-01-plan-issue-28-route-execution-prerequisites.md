# Route Issue Execution Through Prerequisite Handling

**Goal:** Make `execute-issue` enter and resume one exact prerequisite lifecycle inside its existing authorized lane while preserving ordinary execution, content-bound evidence, and every no-close/no-push boundary.
**Why planning is required:** Issue #28 changes a promoted public workflow contract and its downstream completion consumers across tracker authority, Git worktree identity, candidate ancestry, manual external execution, and aggregate delivery evidence, so the repository High-risk tier requires a durable plan.
**Acceptance:** GitHub Issue #28 AC-1 through AC-5 pass; no declaration preserves ordinary execution; one exact unresolved declared or unchanged-scope late prerequisite invokes `pre-execute-issue` in the same direct-human or DAG-authorized lane without repository scanning or a second command; v2 attestation identity and candidate, blob, artifact, and outcome stay content-bound through completion and downstream consumption; legacy v1 remains limited to a legacy non-generated artifact; the same Issue branch and worktree are reused and the Prerequisite candidate remains in final ancestry; ambiguity, drift, Scope change, or missing authority fails closed; the agent never executes SQL, mutates a database, integrates, closes, pushes, deploys, or cleans unrelated state; focused and full verification pass; Standards and Spec review are clean; the final candidate is committed and the Issue worktree is clean before one completion note is appended and read back.

### Outcome 1: Executable prerequisite routing contract
- Work: Add an Issue #28 contract test at the existing promoted skill seam for ordinary Entry, exact declared dispatch, unchanged-scope late discovery, direct and DAG lane resumption, v1/v2 eligibility, fresh identity checks, Prerequisite candidate ancestry, structured completion evidence, downstream consumption, and forbidden authority expansion.
- Verify: `node --test --test-name-pattern="execute-issue.*prerequisite|Late prerequisite discovery|manual_prerequisite_complete:v2|manualAttestations" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Same-lane Entry and late-discovery routing
- Work: Replace `execute-issue`'s manual stop-and-command behavior with exact declaration resolution and automatic model-invoked `pre-execute-issue` handoff. Preserve the original direct-human or exact DAG Run Grant authority, reuse the unique Issue branch and worktree created before or during prerequisite handling, checkpoint coherent late work, and return Scope changes to planning.
- Risks/open questions: Missing, multiple, ambiguous, conflicting, changed-scope, or stale Issue, Spec, target, Planning Seal, blocker, lane, branch, worktree, candidate, blob, artifact, outcome, or ancestry evidence stops without tracker repair, artifact guessing, external execution, cleanup, or duplicate lanes.
- Verify: `node --test --test-name-pattern="execute-issue.*prerequisite|Late prerequisite discovery|manual_prerequisite_complete:v2|manualAttestations" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Content-bound completion and consumers
- Work: Record every consumed v2 attestation by tracker-native identity and exact Issue, Prerequisite candidate, Git blob, repository-relative artifact path, and `APPLIED` or `NO_OP` outcome; keep an explicit empty list when none were consumed. Require `close-issue` and `verify-target-before-push` to read and validate that evidence and candidate ancestry, while accepting path-only legacy evidence only for an exact legacy non-generated artifact.
- Risks/open questions: Completion-note compatibility must not reinterpret a generated artifact as legacy, manufacture a missing attestation identity, or turn manual evidence into contribution, close, push, deploy, database, or verification authority.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Synchronized promoted and domain surfaces
- Work: Re-sync affected execution, prerequisite, closeout, target-verification, metadata, router, and human docs in English. Update the superseded `CONTEXT.md` relationships proved necessary by ADR-0047 and AC-5 without changing accepted vocabulary, delivery shape, or adjacent Issue ownership; preserve plugin membership and add no dependency or runtime.
- Verify: `node --test --test-name-pattern="promoted skills|execute-issue.*prerequisite|router exposes|changed delivery documentation" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 5: Candidate verification, review, and completion evidence
- Work: Run focused, contract, and full workflow verification, inspect the exact baseline-to-candidate diff, commit coherent changes, obtain independent clean Standards and Spec review with at most ten material repair waves, rerun final checks, and publish `implementation_complete` only for the unchanged clean reviewed candidate. Declare this plan as the sole `workflowArtifacts` entry required by the repository High-risk tier.
- Verify: `node --test tests/ron-workflow/*.test.mjs`; `git diff --check`
