# Restore features/ron push readiness

**Goal:** Add fail-closed successor verification evidence so aggregate verification can replace an obsolete path-specific command only when a later member explicitly retires every referenced path and proves current behavior.
**Why planning is required:** This changes a public verification contract and governs tracker evidence, Git history, and the local push-readiness authorization boundary.
**Acceptance:** Starting from exact target `e4432cc6fc7637f8c3391ba8e6b1f737ddddd880`, one reviewed and closed repair Issue preserves every existing candidate and unrelated work, documents and tests the successor rule, fast-forwards local `features/ron`, and produces a matching local `push_ready:v1` note only after a fresh aggregate gate passes. No push, history rewrite, old completion-note edit, retired-file restoration, or unrelated worktree cleanup occurs.

### Outcome 1: Seal the successor evidence decision
- Work: Define Successor verification evidence in `CONTEXT.md`, extend ADR-0038 with its strict applicability boundary, and update this same-scope durable plan.
- Risks/open questions: Partial path ownership, rename inference, non-path-specific commands, missing absence proof, or a successor candidate that does not descend from the earlier candidate must fail closed.
- Verify: `git diff --check e4432cc6fc7637f8c3391ba8e6b1f737ddddd880...HEAD`

### Outcome 2: Publish one executable repair contract
- Work: Create one Single-Issue Spec against `codex/push-readiness-repair-target` with stable Acceptance Criteria for command applicability, successor proof, synchronized promoted surfaces, fixture coverage, and the no-push boundary.
- Risks/open questions: Tracker publication or read-back mismatch stops after preserving the verified Planning Seal; no implementation begins from ambiguous Issue evidence.
- Verify: `gh issue view <Issue-ID> --repo ron03wlb/skills --json body,state,labels,comments`

### Outcome 3: Implement the minimum fail-closed rule
- Work: Update `verify-target-before-push`, its human documentation, and the existing aggregate fixture so still-applicable commands run unchanged while an explicitly retired path-specific command records its successor disposition and uses the successor's passing current-behavior evidence.
- Risks/open questions: The rule must not parse or waive arbitrary shell failures, alter historical completion notes, restore retired files, or create a new runtime framework.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Close locally and prove aggregate readiness
- Work: Complete two-axis review and Issue closeout, fast-forward local `features/ron` to the unchanged candidate, then rerun the aggregate gate against its configured upstream and write the local Git note only after all claims pass.
- Risks/open questions: Any target, remote-tip, Issue, review, verification, cleanliness, or unrelated-work snapshot drift stops before the note; push remains separately unauthorized.
- Verify: `git notes --ref=refs/notes/matt-push-ready show features/ron`
