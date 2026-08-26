# Simplify Spec Delivery Routing

**Goal:** Make `/to-spec` the sole Single-Issue versus Multi-Issue routing authority, produce execution-ready plans at the correct artifact level, and remove duplicated or conflicting routing from the Matt–Ron workflow.

**Why planning is required:** This changes promoted skill contracts and the public handoff between planning, execution, review, and closeout. A routing mistake could skip decomposition, send a Tracker Spec through the wrong executor, or silently expand implementation scope.

**Acceptance:** GitHub Issues and default triage labels are configured for `ron03wlb/skills`; one primary Single-Issue Tracker Spec is published with a read-back Planning Seal and `ready-for-agent`; that Spec contains a mapped implementation plan and ends with `/execute-issue <Spec-ID>`; a Multi-Issue Spec delegates decomposition to `/to-tickets`, whose dependency-ready child Issues contain their own mapped plans and execution commands; approved Standalone Specs remain eligible for `/implement`; necessary source-grounded file discovery does not stop execution, while scope changes do; `/close-issue` integrates only a reviewed candidate that already contains the current target and otherwise returns immediately to `/execute-issue`; duplicated routing text is removed and contract tests prove the resulting flow.

### Outcome 1: Configure and publish the authoritative Spec

- Work: Configure GitHub Issues for `ron03wlb/skills`, record the tracker, default triage labels, and single-context domain layout, and create one Planning Seal commit containing only approved setup and planning artifacts. Publish one primary Spec with `ready-for-agent`, then read back its mode, full commit SHA, seal state, body, and label.
- Risks/open questions: If the Planning Seal commit succeeds but Issue creation, labeling, or read-back fails, retain the commit and report the exact partial state; do not amend, reset, roll back tracker settings, publish a duplicate, or substitute a newer target SHA.
- Verify: `gh issue view <Spec-ID> --repo ron03wlb/skills --json number,title,body,state,labels,url`

### Outcome 2: Establish one authoritative delivery contract

- Work: Keep glossary-level terms in `CONTEXT.md`; create a new ADR that supersedes the affected routing decisions in ADR 0022 without overwriting its unrelated in-progress closeout edits. Define artifact shape, routing ownership, ambiguity handling, and the three discovery tiers once.
- Risks/open questions: The new ADR must distinguish publication (`Tracker Spec` versus `Standalone Spec`) from delivery shape (`Single-Issue` versus `Multi-Issue`) so that a local tracker record is not mistaken for a standalone plan.
- Verify: `git diff --check -- CONTEXT.md docs/adr`

### Outcome 3: Make planning artifacts directly executable

- Work: Update `/to-spec` to emit stable Acceptance Criteria and a compact mapped Implementation Plan for Single-Issue Specs. Update `/to-tickets` to put the same compact contract on each child Issue and emit execution commands only for the dependency-ready frontier.
- Risks/open questions: Expected files and symbols are planning evidence, not an allowlist. Mapping must remain inline (`Covers: AC-n`) rather than introduce a separate matrix or parser.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Simplify execution and closeout boundaries

- Work: Shorten `/ask-matt` to a routing map, restrict `/implement` to approved Standalone Specs or direct current-branch work, and make `/execute-issue` consume the published classification without reclassifying. Encode necessary discovery, material plan deviation, and scope-change behavior at the executor boundary. Make `/close-issue` stop before merge or verification when the current target is not already an ancestor of the reviewed candidate, returning the Issue to `/execute-issue` for refresh, verification, review, and a new completion note.
- Risks/open questions: Material plan deviations may continue only when Acceptance Criteria and public behavior are unchanged; completion evidence must record the reason without creating a second tracker inventory. Repeated target drift may require repeated explicit handoffs, but closeout must not automatically invoke execution.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 5: Synchronize documentation and prove the contract

- Work: Update the matching engineering docs and skill descriptions only where routing changed. Replace extensive User Stories and duplicated default-routing prose. Add contract assertions for mapping completeness, executor selection, frontier output, and non-allowlist discovery.
- Risks/open questions: Preserve `close-issue` dirty-target protection, collision stop, receipt read-back, partial-state recovery, exact worktree cleanup, and tracker closure while moving changed-candidate refresh and revalidation back to `/execute-issue`. Preserve all unrelated dirty work. Do not add a new skill, dependency, parser, or standalone traceability matrix.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`
- Verify: `git diff --check`
