# Issue #50 portable blocker representation

**Goal:** Implement GitLab body/native blocker-representation support for `to-tickets` without changing the published Issue scope or unrelated workflow ownership.

**Why planning is required:** The change modifies a promoted, cross-tracker workflow contract, its recovery semantics, public documentation, and executable contract tests.

**Acceptance:** AC-1 through AC-5 of GitHub Issue #50 are covered by the changed contracts and executable assertions; the canonical child body and logical blocker graph remain the sole portable authority; `to-tickets/SKILL.md` remains 846 words; the isolated worktree is clean at a committed, reviewed candidate. No integration, Issue closure, push, deployment, new tracker mutation probe, relation/label authority, checkpoint stage, producer profile, or Run-coordinator behavior is added.

### Outcome 1: Declare explicit GitLab capability selection
- Work: Update GitLab configuration guidance and decomposition publication interfaces so `blockingRepresentation` is an exact `body` or `native` read-back fact. New configuration defaults to body; an existing missing or failed declared-native selection stops before mutation.
- Risks/open questions: An HTTP 400, native relation failure, or unreadable configuration must never silently change mode.
- Verify: `node --test --test-name-pattern "GitLab tracker guidance|blocking representation" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Make the logical blocker graph portable
- Work: Define canonical `## Blocked by` body rendering, body/native reconciliation, native-only relation publishing, and the narrow pre-`decomposition.read_back` body-mode adoption/rejection rules in owner-local decomposition contracts.
- Risks/open questions: Parent/sub-issue behavior, `relates_to`, and `blocked` labels remain outside scope; conflicts and completed stages fail closed without duplicate child publication.
- Verify: `node --test --test-name-pattern "to-tickets|blocker representation" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Synchronize public documentation and proof
- Work: Update the human-facing `to-tickets` documentation and focused executable contracts, including success and failure cases required by AC-1 through AC-5.
- Risks/open questions: The required plan is a workflow artifact; it must remain execution-owned and is not a product-contract exemption.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Produce a reviewable completion candidate
- Work: Commit the scoped candidate, run `code-review` against the execution baseline, repair only confirmed in-scope findings, and write/read back one `implementation_complete` record.
- Risks/open questions: A review, scope, target, or execution-identity conflict stops without integration, cleanup, Issue closure, push, or deployment.
- Verify: `git diff --check` and final baseline-to-candidate review evidence.
