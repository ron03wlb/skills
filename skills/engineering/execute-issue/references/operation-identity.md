# Execute Issue operation identity

Load this interface for a fresh execution attempt or any retry whose operation evidence is missing, duplicated, mismatched, or ambiguous.

## Owner and key

`execute-issue` is the implementation receipt owner. Derive its versioned operation identity with producer `execute-issue` and stage `implementation` from the canonical repository identity, parent or linked Spec identity, approved publication identity or hash, and stable Issue identity. A caller task, thread, Run correlation value, branch name, or worktree path is diagnostic only and never defines authority.

Identical immutable inputs select the same Issue lane, topic branch, and worktree and resume the first unfinished execution stage. A different repository, Spec, approved revision, producer, stage, or Issue selects a different operation and may execute concurrently.

## Immediate receipt

Direct entry consumes the exact human invocation plus current tracker and Git read-back. DAG entry consumes one read-back Run Grant that binds this Issue and Spec. Validate only that authority receipt's identity, content hash, freshness, and the current Issue, dependency, target, branch, and worktree preconditions. `execute-issue` does not rerun Run dispatch or reconciliation semantics.

The terminal owner-produced receipt is the exact read-back `implementation_complete` note. Its `operationIdentity` is the full `workflow-operation-identity:v1` receipt; the approved publication identity and stable Issue inputs bind the reviewed candidate and verification evidence for `close-issue`. Downstream closeout does not rerun implementation, Standards or Spec review, or execution verification.

## Compatibility and stops

An existing valid completion or active legacy execution lane that predates this receipt contract retains its recorded identity without a synthetic field. Never migrate, overwrite, delete, or recreate it. Missing, duplicate, mismatched, stale, out-of-order, or ambiguous current evidence stops before implementation or tracker mutation and reports the conflicting identities.
