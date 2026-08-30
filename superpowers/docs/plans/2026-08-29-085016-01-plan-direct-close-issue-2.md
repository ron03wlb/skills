# Directly close GitHub Issue #2

**Goal:** Close only `ron03wlb/skills#2` as completed at the user's explicit direction, bypassing decomposition reconciliation.
**Why planning is required:** Closing a tracker Issue is a consequential external-state change.
**Acceptance:** Before mutation, require Issue #2 to be the uniquely identified open Spec at `https://github.com/ron03wlb/skills/issues/2`; stop if its identity or state changed. After mutation, require Issue #2 to read back as `CLOSED` with reason `COMPLETED`, while #3/#4, their relationships and labels, Git branches/worktrees, and all pre-existing local changes remain untouched. If the closure is later judged unintended, recovery is an explicit Issue reopen rather than an automatic rollback.

### Outcome 1: Direct tracker closure

- Work: Close only GitHub Issue #2 with reason `completed`; do not reconcile decomposition, edit Issue bodies or labels, change relationships, or mutate Git history/worktrees.
- Risks/open questions: This intentionally bypasses the repository `to-tickets` and `close-issue` evidence gates, so closure does not prove decomposition publication completeness or aggregate push readiness.
- Verify: `gh issue view 2 --repo ron03wlb/skills --json number,state,stateReason,closedAt,url`
