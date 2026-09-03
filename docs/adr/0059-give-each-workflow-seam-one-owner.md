---
status: accepted
---

# Give each workflow seam one owner

Each workflow stage owns one non-overlapping responsibility:

- `to-spec` owns Spec revalidation and publication.
- `to-tickets` owns Issue decomposition and the ready frontier.
- `run-issue-workflow` owns dispatch and reconciliation.
- `execute-issue` owns implementation, review, and completion inside the Issue worktree.
- `close-issue` owns target integration, Issue worktree cleanup, and tracker closure.
- `verify-target-before-push` owns aggregate target-range verification.

A downstream stage consumes the exact immutable receipt produced by the upstream owner. It validates receipt identity, content hash, freshness, and current mutation preconditions, but it does not repeat the owner's semantic validation. This preserves fail-closed transitions while preventing duplicated work and duplicated contract text across Skills.
