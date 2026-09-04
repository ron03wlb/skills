# Issue 47: Shrink workflow Skill entries by role

**Goal:** Enforce role-aware entry budgets and move conditional workflow detail behind exact owner-local pointers without weakening authority, completion, or handoff contracts.
**Why planning is required:** This refactor changes always-loaded public workflow instructions across multiple Skills, so an omitted gate or misplaced owner could change mutation authority even when runtime code is untouched.
**Acceptance:** Every Router entry is at most 700 words and each named Operational entry is at most 1,500 words; failures name the exact file and count; entry authority, happy paths, fail-closed stops, completion behavior, deterministic identity, and owner-local trigger pointers remain complete and English; no runtime, tracker, target, closeout, push, or deployment behavior is added.

### Outcome 1: Role-aware budget contract
- Work: Add deterministic public-seam coverage in `tests/ron-workflow/skill-contracts.test.mjs` for the exact Router and Operational entry lists, measured counts, and actionable over-budget failures.
- Risks/open questions: Counting must be stable across line endings and Markdown formatting, and the role lists must be explicit rather than inferred from incidental prose.
- Verify: `rtk node --test --test-name-pattern="word budget|Router|Operational" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Progressive-disclosure entry refactor
- Work: Audit all six named entries and reduce every over-budget file. Keep compliant entries unchanged when their existing progressive disclosure is sufficient. Keep the common entry sequence and terminal gates inline; move only branch-specific schemas, adapter payloads, compatibility rules, manual prerequisites, and recovery matrices into focused references adjacent to their authoritative owner.
- Risks/open questions: Moving a must-read gate behind a weak pointer could silently weaken execution; copying a rule into a reference instead of moving it would create duplicate ownership.
- Verify: `rtk node --test --test-name-pattern="word budget|owner-local reference|single owner" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Synchronized public surfaces and final evidence
- Work: Reconcile invocation metadata, human docs, README/router relationships, glossary and ADR terms, reference links, and completion commands with the refactored entries; retain English and preserve existing invocation policy.
- Risks/open questions: Organization-only changes must not be presented as new authority or new workflow behavior.
- Verify: `rtk node --test tests/ron-workflow/skill-contracts.test.mjs`
- Verify: `rtk node --test tests/ron-workflow/*.test.mjs`
- Verify: `rtk git diff --check`
