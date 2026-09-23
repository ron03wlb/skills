# Execute Issue operation identity

Load this interface for a fresh execution attempt or retry whose current operation evidence is missing, duplicated, mismatched, or ambiguous.

## Owner and key

`execute-issue` is the implementation receipt owner. Derive its versioned operation identity with producer `execute-issue` and stage `implementation` from the canonical repository identity, parent or linked Spec identity, approved publication identity or hash, and stable Issue identity. A caller task, thread, Run correlation value, branch name, or worktree path is diagnostic only and never defines authority.

Identical immutable inputs select the same Issue lane, topic branch, and worktree and resume the first unfinished execution stage. An evidence-bound technical recovery may transfer exclusive ownership to a separate task while retaining this operation, original task history, and cumulative repair budget; task identity is not operation identity. A different repository, Spec, approved revision, producer, stage, or Issue selects a different operation and may execute concurrently.

## Immediate receipt

Direct entry consumes the exact human invocation plus current tracker and Git read-back. DAG entry consumes one read-back Run Grant that binds this Issue and Spec. Validate only that authority receipt's identity, content hash, freshness, and current Issue, dependency, target, branch, and worktree preconditions. `execute-issue` does not rerun Run dispatch or reconciliation semantics.

The terminal owner-produced receipt is the exact read-back `implementation_complete` note. Its `operationIdentity` is the full `workflow-operation-identity:v1` receipt. For repository-backed completion, the approved publication identity and stable Issue inputs bind the reviewed candidate and verification evidence for `close-issue`; `tracker_only:v1` instead binds the prose-backed tracker outcome and explicit no-candidate state under its shared contract. Downstream closeout does not rerun implementation, Standards or Spec review, or execution verification.
