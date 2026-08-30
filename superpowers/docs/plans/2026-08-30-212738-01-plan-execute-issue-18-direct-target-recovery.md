# Execute Issue #18 direct target contribution recovery

**Goal:** Add one bounded direct-target attestation helper and confirmation-gated recovery path to target verification as one reviewed Issue #18 candidate.
**Why planning is required:** This changes promoted public workflow contracts, tracker authority evidence, aggregate verification, and plugin packaging.
**Acceptance:** Keep target `features/ron` and Planning Seal `432b8f1cc7e230b4a0b3ddabcfa4f5bd76b41a81` unchanged; work only on topic branch `codex/issue-18-attestation-recovery` in `C:\tmp\skills-issue-18`; satisfy AC-1 through AC-5 without writing a live direct-contribution record, running target verification, emitting `push_ready`, changing Issue state or labels, integrating, removing the worktree, pushing, remote-merging, or deploying. Commit one clean reviewed candidate and write/read back `implementation_complete` only after final verification. Stop and record/read back `implementation_blocked` on a scope change, stale planning evidence, unresolved blocker, or unrecoverable verification or review failure.

### Outcome 1: Lock the public recovery contract test-first

- Work: Use `tests/ron-workflow/skill-contracts.test.mjs` as the public contract seam; add failing assertions for strict eligibility, exact-record reuse and schema, one exact human confirmation, drift and contradiction stops, model invocation, fresh Entry restart, aggregate owner review, result separation, and prohibited mutation or push behavior.
- Risks/open questions: The assertions must describe observable contracts rather than prose accidents, and active or mixed commits must remain ineligible without partial-path recovery.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Implement and synchronize the bounded workflow

- Work: Add the promoted model-invoked `attest-target-contribution` skill and human docs; extend `verify-target-before-push` with confirmation-gated helper handoff, exact read-back validation, direct-contribution coverage, aggregate owner Spec review, and fresh Entry restart; synchronize metadata, router, READMEs, plugin manifest, and approved domain vocabulary without a generic framework or dependency.
- Risks/open questions: The verifier must never create its own authority, continue the failed gate, accept active or mixed changes, or let the helper claim review, verification, readiness, or push authority.
- Verify: `node --check tests/ron-workflow/skill-contracts.test.mjs`, `node --test tests/ron-workflow/skill-contracts.test.mjs`, `git diff --check`, and the repository-required read-only manifest review.

### Outcome 3: Produce one trustworthy execution candidate

- Work: Commit the verified Issue paths, review `432b8f1cc7e230b4a0b3ddabcfa4f5bd76b41a81...HEAD` independently for Standards and Spec, repair only confirmed in-scope findings for at most ten waves, rerun required focused and full verification, confirm a clean worktree and exact reviewed HEAD, then publish and read back the completion note.
- Risks/open questions: Any tracker write or read-back mismatch leaves completion unresolved and never authorizes closeout or push.
- Verify: `node --test tests/ron-workflow/*.test.mjs`, the focused and manifest checks above, `git status --short`, exact candidate identity, and tracker completion-note read-back.
