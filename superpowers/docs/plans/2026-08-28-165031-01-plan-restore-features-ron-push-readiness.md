# Restore features/ron push readiness

**Goal:** Create one reviewed integration-repair candidate that preserves the intended local range, removes stale ADR authority, and supplies exact contribution coverage for aggregate push verification.
**Why planning is required:** The repair crosses Git histories and tracker state, and the final candidate must preserve every closed-Issue candidate while making no remote mutation.
**Acceptance:** The repair candidate contains exact `features/ron@64393d66c8f24cf568bcbb24bd48f4ab997d051d`, retains its intended deliverables and planning records, marks ADR-0022 and ADR-0023 as superseded by ADR-0038, passes the repository suite and two-axis review, closes through the recorded repair target, fast-forwards local `features/ron`, and obtains a matching `push_ready:v1` note without pushing.

### Outcome 1: Seal one explicit repair scope
- Work: Publish one Single-Issue Spec that owns adoption of the exact unpushed range, the ADR authority correction, preservation of existing deliverables, and the no-push boundary.
- Risks/open questions: Any target, candidate, or remote-tip drift stops before integration; no history rewrite, force update, or fabricated completion evidence is allowed.
- Verify: `gh issue view <Issue-ID> --repo ron03wlb/skills --json body,state,labels,comments`

### Outcome 2: Produce the minimal reviewed candidate
- Work: Merge the exact local target into the dedicated Issue lane, change only ADR-0022 and ADR-0023 as authorized, and retain the explicitly committed planning/history artifacts.
- Risks/open questions: The candidate must remain a descendant of both the Planning Seal and the original local target so all prior Issue candidates stay reachable.
- Verify: `node --test tests/ron-workflow/*.test.mjs`

### Outcome 3: Integrate locally and prove aggregate readiness
- Work: Complete the Issue note and closeout, fast-forward local `features/ron` to the unchanged reviewed candidate, then run the current aggregate verifier against its configured upstream.
- Risks/open questions: A review finding, failed test, unexplained commit, dirty worktree, ref drift, or mismatched note stops before push.
- Verify: `git notes --ref=refs/notes/matt-push-ready show features/ron`
