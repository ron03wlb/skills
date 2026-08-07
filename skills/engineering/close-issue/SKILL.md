---
name: close-issue
description: Integrate one reviewed Issue worktree into its original local branch, remove it, and close the Issue.
disable-model-invocation: true
---

# Close Issue

Close exactly one executed Issue. This skill integrates the reviewed candidate, removes its worktree, and closes the Issue; it never repairs product code or invokes `execute-issue` automatically.

## Entry

Read the Issue and its latest `execute-issue` completion note once. A direct invocation covers the local merge, worktree removal, and Issue closure for that one Issue; do not ask for phase-by-phase authorization.

Require the note to identify the original target branch, Issue worktree, topic branch, baseline, final reviewed candidate, clean Standards and Spec results, and passing verification.

If the Issue is already closed, resume only when the original target `HEAD` equals the recorded candidate, the Issue worktree is absent, and the completion note identities match. Read back and verify the closed state, report completion, and stop without closing it again. Any other already-closed state is ambiguous and stops.

For an open Issue, confirm the candidate is still the clean Issue worktree `HEAD`, the target worktree is clean, and blockers are closed. On retry, an absent Issue worktree is valid only when the original target `HEAD` already equals the recorded candidate; continue with tracker closure. Stop on any other ambiguity, dirty state, changed scope, missing evidence, or another local integration in progress. The human manually ensures only one integration is active; do not add a queue or lock.

## Refresh the candidate

Merge the latest local target branch into the topic branch without rebasing. Conflicts, unrelated changes, or scope expansion stop with the Issue open; do not resolve product-code findings in closeout.

If the merge changes the candidate, rerun the recorded verification and Matt `code-review` against the current target and the same Issue or linked Spec. Any confirmed finding leaves the Issue open and returns it to a separate `/execute-issue` invocation. After a clean changed candidate, update and read back the completion note with the new candidate and verification results before integration. If the target was already an ancestor and the candidate did not change, reuse the clean execution review.

## Integrate, clean up, and close

From the original target worktree, fast-forward the target branch to the exact reviewed candidate and verify its `HEAD`. On retry, skip this step only when target `HEAD` already equals that candidate. Do not merge from inside the Issue worktree or remove the active working directory.

Confirm the Issue worktree is registered, is the exact path from the completion note, and remains clean. Remove that worktree with `git worktree remove` from the target worktree, then prune only stale worktree metadata. On retry after verified target integration, an already absent worktree means cleanup is complete. Never delete the topic branch.

Close the Issue through the configured tracker and read it back once. If integration, cleanup, or tracker closure fails after an earlier step succeeded, report the exact partial state and resume idempotently; never roll back a successfully integrated target automatically.

Never push, remote-merge, deploy, delete unrelated files, publish derived output, or act on live providers. Keep local integration, Issue closure, push, remote merge, deployment, and live verification as separate claims.
