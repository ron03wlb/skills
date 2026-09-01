# Issue 33 prospective workflow checkpoint attestation

**Goal:** Extend `attest-target-contribution` to accept exact producer-owned Workflow plan checkpoint packets while preserving confirmation-gated recovery and the unchanged `direct_target_contribution:v1` writer.
**Why planning is required:** This changes a promoted public workflow contract, caller authority, tracker mutation eligibility, and routing documentation, then appends irreversible tracker evidence at completion.
**Acceptance:** AC-1 through AC-5 in GitHub Issue 33 pass; only the Issue-owned skill, metadata, docs, router, README summaries where required, contract tests, and this required plan change; prospective creation proves exact active `to-spec` or `to-tickets` transaction provenance and whole-commit eligibility without a second confirmation; recovery remains confirmation-gated; the v1 record schema stays byte-for-byte equivalent; focused and full Ron workflow suites pass; Standards and Spec review are clean; the final candidate and worktree are unchanged and clean before exact adoption and completion comments are appended and read back. Do not integrate, remove the Issue worktree, close an Issue, push, deploy, execute a prerequisite, or modify the Run journal.

### Outcome 1: Two fail-closed caller authorities
- Work: Add contract fixtures that distinguish the existing human-confirmed `verify-target-before-push` recovery packet from one exact prospective packet supplied by an active explicitly human-invoked `to-spec` or `to-tickets` transaction, rejecting manual, stale, inferred, ambiguous, cross-route, mixed-commit, modified-path, ancestry, and identity-drift cases.
- Verify: `node --test --test-name-pattern="direct target contribution|prospective checkpoint|attest-target-contribution|disjoint checkpoint" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: One unchanged v1 writer with exact history handling
- Work: Update the promoted skill and invocation metadata so route-specific authority and provenance checks feed common owner, target, commit, whole-diff, ordered-history, exact-reuse, disjoint-accumulation, conflict, append, read-back, and immutable-identity-return behavior without adding schema fields or downstream readiness claims.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Synchronized public orientation and routing
- Work: Re-sync the human docs, `ask-matt` skill and docs, and affected promoted README summaries in English so the prospective producer path, no-second-confirmation boundary, unchanged recovery path, and helper non-ownership boundaries remain consistent.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Clean reviewed candidate and bounded tracker evidence
- Work: Inspect the exact baseline-to-candidate diff, confirm the unchanged v1 schema, run independent Standards and Spec review with this plan as the only prospective `workflowArtifacts` entry, repair only confirmed in-scope findings, and publish only the required adoption and `implementation_complete` records after final authority and candidate read-back.
- Verify: `node --test tests/ron-workflow/*.test.mjs`
- Verify: `git diff --check`
