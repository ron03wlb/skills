# Reserve consequential choices and delegate routine design

**Goal:** Reduce human decision load while preserving evidence-backed design quality.
**Why planning is required:** This direct skill-maintenance request changes public decision and approval contracts. It is not a new Tracker Spec publication workflow.
**Acceptance:** New major direction, architecture, table DDL, data corrections, destructive or costly effects, and any migration cost require the missing human decision. Exact existing approvals remain reusable. Routine reversible choices, including application queries and bindings, follow accepted requirements, project contracts and conventions, then suitable established practice. Human questions include concrete alternatives, trade-offs, rationale and a recommendation; delegated choices retain concise evidence, reversal and verification assumptions. No new execution authority follows from design delegation. Preserve unrelated work and existing invocation, planning-lane and publication contracts.

### Outcome 1: One consistent decision boundary
- Work: Update shared `grilling`, its `grill-with-docs` aperture and `domain-modeling` inheritance. Record the user's accepted replacement of ADR-0070 in a new ADR and synchronize the glossary under the direct maintenance scope.
- Verify: Inspect the decision paths for routine SQL, DDL, migration costs, reserved architecture, approval reuse and pending evidence.

### Outcome 2: Discovery and guidance match
- Work: Synchronize affected public docs, router and descriptions where necessary. Keep unrelated workflow governance unchanged.
- Verify: `node --test tests/ron-workflow/grilling-contract.test.mjs tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-preparation.test.mjs`

### Outcome 3: Verify meaningful cases and preservation
- Work: Refresh scenario expectations and perform independent forward-testing under `skill-creator` for this consequential skill change. Keep observed model outcomes distinct from structural checks. Review the final scoped diff.
- Verify: Relevant skill validation, scenario responses, `git diff --check`, and final Git status. Record actual limitations; do not infer real-world question-count or latency improvements from wording.
