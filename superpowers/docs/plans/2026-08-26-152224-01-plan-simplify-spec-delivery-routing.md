# Simplify Spec Delivery Routing

**Goal:** Make `/to-spec` the sole delivery-shape authority, produce execution-ready Issue plans, let every successful `/close-issue` integrate its exact reviewed candidate into the current target in any order, and require one aggregate verification gate before push.

**Why planning is required:** This changes promoted skill contracts and the public handoff between planning, execution, review, local integration, tracker closure, and push readiness. A routing or evidence mistake could omit an Issue from the target, close an unintegrated Issue, repeat expensive review work, or push an aggregate tree whose cross-Issue interactions were never verified.

**Acceptance:** GitHub Issues remains the configured tracker for `ron03wlb/skills`; one primary Single-Issue Tracker Spec is published with a read-back successor Planning Seal and `ready-for-agent`; `/to-spec` and `/to-tickets` produce mapped executable plans; `/execute-issue` owns one Issue's implementation, verification, and Standards/Spec repair; `/close-issue` integrates that exact candidate into the current target without refreshing or re-reviewing it, proves candidate reachability, preserves unrelated target work, then removes the exact worktree and closes the Issue; a new user-invoked `/verify-target-before-push` proves all closed Issue candidates are present in the exact aggregate target, runs aggregate review and verification, and emits a current-HEAD push-ready receipt without pushing.

### Outcome 1: Preserve the authoritative publication

- Work: Reuse the configured GitHub tracker, default triage labels, and single-context domain layout. Update the existing primary Spec and create one successor Planning Seal commit containing only its approved planning artifacts. Read back the mode, full commit SHA, successor state, body, label, and next command.
- Risks/open questions: If the successor commit succeeds but Issue update, labeling, or read-back fails, retain the commit and report the exact partial state; do not amend, reset, publish a duplicate, or substitute a newer target SHA.
- Verify: `gh issue view 1 --repo ron03wlb/skills --json number,title,body,state,labels,url`

### Outcome 2: Keep one authoritative planning contract

- Work: Keep glossary-level terms in `CONTEXT.md`; create a new ADR that supersedes affected routing and closeout decisions in ADR 0022 without overwriting unrelated in-progress edits. Define publication shape, delivery shape, ambiguity handling, discovery tiers, exact-candidate evidence, per-Issue integration receipts, aggregate push readiness, and failure ownership once.
- Risks/open questions: `closed` must continue to mean locally integrated into the named target, while `push_ready` remains a later aggregate claim. A close receipt cannot be promoted into aggregate proof merely because Git merged without conflicts.
- Verify: `git diff --check -- CONTEXT.md docs/adr`

### Outcome 3: Make planning artifacts directly executable

- Work: Update `/to-spec` to emit stable Acceptance Criteria and a compact mapped Implementation Plan for Single-Issue Specs. Update `/to-tickets` to put the same compact contract on each child Issue and emit execution commands only for the dependency-ready frontier. Independent Issues do not need to know whether other Issues execute concurrently.
- Risks/open questions: Expected paths and symbols are planning evidence, not an allowlist. Mapping remains inline (`Covers: AC-n`) rather than adding a parser or separate matrix.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Make close integrate one exact candidate

- Work: Keep `/execute-issue` responsible for the exact candidate's implementation, final verification, and full Standards/Spec repair. Make `/close-issue` capture current target `T` and reviewed candidate `C`, create an isolated integration candidate `I` from `T`, use `C` directly when `T` is its ancestor or a no-fast-forward merge when histories diverge, and stop on conflicts or ambiguity without product repair. Protect unrelated target work, fast-forward the real target from `T` to `I`, prove `C` is reachable from `I`, write/read back the integration receipt, then remove the exact worktree and close/read back the Issue.
- Risks/open questions: A clean Git merge proves composition and lineage, not aggregate semantic compatibility. `/close-issue` must not rerun Matt review or expensive full verification, and it must never auto-resolve conflicts, roll back a successful integration, push, or deploy.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 5: Add the mandatory pre-push aggregate gate

- Work: Add one concise user-invoked `/verify-target-before-push` skill. It reads integration receipts for the selected target and fixed verification baseline, detects closed Issues whose exact candidates are absent, reviews the aggregate diff against repository Standards and all member Specs, runs the required union-focused and full verification, and writes/read-backs a `push_ready` receipt bound to the exact target `HEAD`. Target movement invalidates the receipt. The skill never pushes.
- Risks/open questions: Aggregate failure occurs after local integration and Issue closure by explicit design. Preserve the target and receipts, withhold `push_ready`, and route product correction through an explicit integration-repair Issue or explicit reopening; do not silently rewrite history or tracker state.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 6: Synchronize documentation and prove the workflow

- Work: Update promoted-skill metadata, docs, READMEs, router, plugin manifest, glossary/ADR, and contract tests. Add fixtures for direct fast-forward, divergent no-fast-forward merge, arbitrary close order, merge conflict stop, receipt ancestry, missing closed candidate, aggregate failure, current-head push readiness, and stale receipt invalidation. Keep skill text bounded and remove duplicated revalidation rules from closeout.
- Risks/open questions: Preserve all unrelated dirty work. Adding exactly one new skill is authorized, but no new external dependency, parser, global queue, or automatic push is introduced.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`
- Verify: `git diff --check`
