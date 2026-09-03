# Aggregate verification operation identity

Load this interface after freezing the exact verification range and member set.

## Owner and key

`verify-target-before-push` is the aggregate receipt owner. Derive one versioned operation identity per selected Spec with producer `verify-target-before-push` and stage `aggregate-verification`, using the canonical repository identity, stable Spec identity, and that Spec's approved publication identity or hash. The frozen ordered set of those receipts belongs to one aggregate gate; target text, invocation correlation, temporary worktree names, and commit messages never define operation authority.

Repeating the same frozen repository, range, member receipts, and Spec identities resumes the same evidence collection. A changed repository, range, member, Spec, or approved revision requires a fresh gate and cannot reuse old review or command results.

## Immediate receipts

Consume each member's exact read-back completion receipt and the Planning Seal, adoption, manual-attestation, reconciliation, or direct-contribution records that its owner-local aggregate interface requires. For a current completion, validate its `operationIdentity` against the canonical repository, Spec, approved publication identity, and Issue; retain a legacy completion that predates the identity contract under its exact recorded body. Validate receipt identity, content hash, freshness, candidate reachability, range membership, coverage, and current ref/worktree preconditions. The aggregate owner does not rerun Issue implementation, execution review, closeout, or producer semantic validation.

Only this owner runs aggregate Standards, multi-Spec review, focused verification, and the full suite. A passing local-ahead gate may emit `push_ready`; already-pushed mode emits only the Range verification result.

## Compatibility and stops

Existing valid completion and frozen legacy/profile-v1 receipts keep their recorded identities. Missing, duplicate, mismatched, stale, out-of-order, or ambiguous evidence stops without migration, overwrite, deletion, Issue mutation, or attribution to another Spec.
