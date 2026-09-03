# Close Issue operation identity

Load this interface before direct or DAG-coordinated closeout and on every partial retry.

## Owner and key

`close-issue` is the closeout operation owner. Derive its versioned operation identity with producer `close-issue` and stage `closeout` from the canonical repository identity, parent or linked Spec identity, approved publication identity or hash, and stable Issue identity. Use that key for the repository close lease and target mutation writer attempt; caller task, thread, Run correlation, branch name, or worktree path never defines authority.

Identical immutable inputs resume the same three-action close path. Different repositories, Specs, approved revisions, stages, or Issues remain distinct even when they share one target; the repository close lease serializes mutation without merging their identities into a queue.

## Immediate receipt

An Executable Issue consumes one exact read-back `implementation_complete` receipt. For a current receipt, validate its full `operationIdentity` against the canonical repository, Spec, approved publication identity, and Issue, then validate body hash, freshness, unchanged candidate, and current tracker, target, ancestry, lease, and worktree preconditions. A legacy completion that predates the identity contract retains its exact recorded identity and body without migration. `close-issue` does not rerun implementation, execution verification, or Standards and Spec review. A Multi-Issue parent consumes the published decomposition receipt and current closed-child preconditions instead.

Git ancestry, worktree registration, and tracker state remain the progress source. Closeout emits no replacement success receipt; its owner-produced results are the target ancestry, removed registered worktree, and closed tracker read-back.

## Compatibility and stops

Existing valid completion receipts and partial close progress retain their recorded identities. Missing, duplicate, mismatched, stale, out-of-order, or ambiguous evidence stops without migration, overwrite, deletion, rollback, or attribution to another Issue.
