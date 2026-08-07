# Ron Wiki-optional delivery

**Goal:** Let the complete Ron Issue lifecycle operate when no accepted Canonical Wiki baseline exists, while preserving the existing ready-Wiki flow.
**Why planning is required:** This changes a public workflow contract shared by authorization, execution, closeout, skills, and durable evidence.
**Acceptance:** Missing-Wiki semantic work uses `semantic + none + not-applicable`, skips only Wiki-specific gates and claims, completes through closeout, keeps ready-Wiki behavior unchanged, and is visible through the installed local skill junctions.

### Outcome 1: Shared contract accepts Wiki-optional delivery
- Work: Add a focused regression case, then minimally update `validateWikiExecutionBinding` without adding an enum or configuration state.
- Verify: `node --test --test-name-pattern "Wiki-optional|Wiki execution bindings" tests/ron-workflow/ron-wiki.test.mjs`

### Outcome 2: Ron skills route and close without a missing-Wiki gate
- Work: Align the router, spec, tickets, execution, closeout, user docs, glossary, and one ADR; preserve the existing ready and bootstrap paths.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Contract suite and local installation remain valid
- Work: Run the focused Ron workflow suite, inspect the scoped diff against existing user changes, validate affected skill folders, and verify all eight local junctions resolve to this checkout.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/ron-wiki.test.mjs tests/ron-workflow/ron-wiki-forward.test.mjs`
