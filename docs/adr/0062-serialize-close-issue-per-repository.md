---
status: accepted
supersedes: ADR-0051 and ADR-0056 only for concurrent close-issue operations on different targets
---

# Serialize close-issue per repository

Only one `close-issue` operation may execute at a time within one canonical Git repository, identified by its `git common dir`, regardless of Spec or target branch. Other closeout operations for that repository wait under ADR-0061. Different repositories may close concurrently, and this policy adds no repository-wide or machine-wide limit to `execute-issue`.

`close-issue` remains the sole leaf that acquires and releases closeout authority. It acquires the repository close lease before the existing target mutation lease and releases them in reverse order after the required read-back. The target lease continues to serialize planning and closeout mutation on the same target without serializing planning on unrelated targets. Coordinators only observe contention, perform bounded waiting and evidence refresh, and request the leaf operation; they never acquire or delegate either lease.

This decision supersedes only the clauses in ADR-0051 and ADR-0056 that permit simultaneous closeout on different targets in the same repository. Their target-mutation boundary, leaf ownership, and cross-repository concurrency remain in force. A machine-wide close lock is not introduced.
