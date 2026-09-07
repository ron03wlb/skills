# Issue 67 operational reading load

**Goal:** Reduce the `to-spec` and `close-issue` operational-entry reading load without changing their workflow authority or safety behavior.

**Why planning is required:** This changes public workflow contracts and writes a GitHub execution receipt under a bound Multi-Issue Run.

**Acceptance:** Both entries are at most 1,200 whitespace-delimited words; the four baseline-to-candidate scenario totals strictly decrease; retained authority, closeout ordering, and legacy behavior have focused and full-suite evidence; the reviewed candidate and completion receipt read back cleanly.

### Outcome 1: Measure the same four conditional reading paths

- Work: Define a reproducible whitespace-token convention and inventory the entry plus only the mandatory references for fresh Single publication, fresh Multi publication, Executable close, and parent-only close, against baseline `9714cce428597f9ec5edc4b3665d2c0d1f9d7697` and the candidate.
- Verify: `node --test --test-reporter=spec tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Consolidate operational instruction ownership

- Work: Shorten `skills/engineering/to-spec/SKILL.md` and `skills/engineering/close-issue/SKILL.md` through existing conditional owner references while preserving entry authority, ordered actions, immediate stops, leases, candidate checks, and legacy branches; update only the affected tests, router/docs, and Windows evidence measurement record where source requires it.
- Verify: `node --test --test-reporter=spec tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/planning-entry.test.mjs tests/ron-workflow/close-conflict-recovery.test.mjs tests/ron-workflow/close-continuation.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`

### Outcome 3: Complete the reviewed execution receipt

- Work: Commit the coherent candidate, independently review Standards and Spec against Issue 67 and its parent, and append/read back exactly one `implementation_complete` note with the owner-derived operation identity and final verification evidence.
- Risks/open questions: A changed target, scope, tracker identity, ambiguous receipt, or non-decreasing scenario total stops this lane before completion; no integration, push, deployment, or closeout is permitted.
- Verify: `node --test tests/ron-workflow/*.test.mjs`
