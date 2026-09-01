# Workflow checkpoint transactions and target serialization

**Goal:** Implement Git-common-dir workflow checkpoint provenance and one shared target mutation writer for Issue #32 without changing downstream producer or Run behavior owned by later Issues.
**Why planning is required:** The change defines durable authority state, retry behavior, target-write fencing, stale-owner recovery, and compatibility across workflow operations.
**Acceptance:** AC-1 through AC-5 in GitHub Issue #32 pass with a clean committed candidate; unrelated target, tracker, worktree, and control state remains unchanged; malformed or conflicting persisted state fails closed; only the final `implementation_complete` tracker note is written after review and verification. Any scope, authority, Planning Seal, blocker, target, or ownership drift stops before further mutation.

### Outcome 1: Durable checkpoint transaction seam
- Work: Add a repository-neutral Git-common-dir store for exact create, read, ordered advance, resume, and classify operations. Bind repository, producer, Spec operation, target, baseline, initially clean state, plan path, and generated content identity; keep plan, checkpoint commit, attestation, publication, and handoff as distinct ordered results.
- Risks/open questions: Persisted ambiguity, partial writes, collisions, or mismatched retry identity must return structured blocking evidence and must not regenerate, overwrite, clean up, or infer legacy state.
- Verify: `rtk node --test --test-name-pattern="workflow checkpoint|checkpoint transaction" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs`

### Outcome 2: Shared target mutation writer
- Work: Generalize the existing close-writer API into a target-scoped writer interface while retaining compatibility aliases and the existing fenced lease, operation proof, stale reclaim, and per-target isolation behavior used by Run closeout.
- Risks/open questions: Generic naming must not create a second lock namespace or permit legacy and new callers to write the same target concurrently.
- Verify: `rtk node --test --test-name-pattern="target mutation writer|close writer" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs`

### Outcome 3: Read models and contract synchronization
- Work: Expose compact checkpoint and target-writer read models for later producer and Run consumers; update closeout and router wording only where the shared writer lifecycle is public, without routing producers or Run ahead of later child Issues.
- Verify: `rtk node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Compatibility and failure verification
- Work: Add focused fixtures for ordered resume boundaries, identity drift, malformed and partial state, immutable completed receipt reuse, same-target contention, different-target concurrency, fencing, stale reclaim, and legacy close-writer compatibility.
- Verify: `rtk node --test tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`
- Verify: `rtk git diff --check`
