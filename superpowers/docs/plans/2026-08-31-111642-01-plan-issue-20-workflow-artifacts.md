# Add workflow artifact completion evidence

**Goal:** Implement Issue #20's prospective `workflowArtifacts` contract across Issue execution, review, closeout, aggregate verification, and synchronized promoted documentation.
**Why planning is required:** This changes the repository's promoted public workflow contract and the completion evidence consumed by multiple delivery gates.
**Acceptance:** The exact Issue #20 Acceptance Criteria and parent constraints remain authoritative. New completion notes require an explicit empty list or exact path, requirement source, and purpose entries; declared paths must be owned by the Issue contribution and behaviorally eligible, and the declaration never becomes review, coverage, verification, cleanliness, or ref-stability authority. Legacy completion notes remain readable. Before the only tracker mutation, require the Issue candidate, focused and full-suite verification, both review axes, worktree cleanliness, and candidate identity to pass; on comment write or read-back failure, preserve the clean candidate and report the unresolved tracker state without integration, closure, push, reset, or duplicate evidence.

### Outcome 1: Lock the prospective evidence contract with executable fixtures
- Work: Extend `tests/ron-workflow/skill-contracts.test.mjs` at the existing completion-note/target-verification seam for empty, valid, missing-path, false-source, public-contract, duplicate or ambiguous, and legacy-note cases.
- Risks/open questions: Tests must classify behavior and exact contribution ownership, not Markdown extensions or implementation details.
- Verify: `node --test --test-name-pattern="workflowArtifacts|Issue delivery|target verification" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Make every producer, reviewer, and consumer enforce one contract
- Work: Update `execute-issue`, `code-review`, `close-issue`, and `verify-target-before-push` so new notes produce and validate the field consistently, both review axes inspect declarations, and legacy notes retain their original validity.
- Risks/open questions: The field must never supply candidate mapping, contribution coverage, or a bypass for ordinary material documentation.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Synchronize promoted surfaces without expanding packaging
- Work: Re-sync affected `agents/openai.yaml`, human docs, `ask-matt`, and README summaries in English. Do not change plugin membership or add runtime parsing infrastructure because no skill is added, removed, or renamed.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Produce one review-clean executable candidate
- Work: Run the repository full suite, commit the exact Issue contribution, complete independent Standards and Spec review with bounded repair waves, rerun final verification, and append/read back one `implementation_complete` note containing the new declaration.
- Risks/open questions: The target branch, original checkout, Issue state, worktree registration, and unrelated files must remain untouched; execution stops before closeout or integration.
- Verify: `node --test tests/ron-workflow/*.test.mjs`
