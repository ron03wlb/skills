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

If the Issue is already closed, resume only when the original target `HEAD` equals the recorded candidate, the Issue worktree is absent, the completion note identities match, and it contains the matching read-back `VERIFIED` receipt with target-after equal to the candidate. Read back and verify the closed state, report completion, and stop without closing it again. Any other already-closed state is closed-but-unverified ambiguity and stops without reopening the Issue.

For an open Issue, confirm the candidate is still the clean Issue worktree `HEAD` and blockers are closed. The original target worktree does not need to be clean. If the target already equals the candidate, continue only through receipt recovery below; an absent Issue worktree is valid only when the target equals the candidate and the completion note contains the matching `VERIFIED` receipt. Stop on any other ambiguity, dirty Issue worktree, changed scope, or missing evidence. The human starts only one integration into the same target branch at a time; other Issue worktrees and other target branches may proceed concurrently. Do not add a global queue or lock.

## Refresh the candidate

Merge the latest local target branch into the topic branch without rebasing. Conflicts, unrelated changes, or scope expansion stop with the Issue open; do not resolve product-code findings in closeout.

If the merge changes the candidate, rerun the recorded verification and Matt `code-review` against the current target and the same Issue or linked Spec. Any confirmed finding leaves the Issue open and returns it to a separate `/execute-issue` invocation. After a clean changed candidate, update and read back the completion note with the new candidate and verification results before integration. If the target was already an ancestor and the candidate did not change, reuse the clean execution review.

## Protect unrelated target work

Immediately before integration, record the target `HEAD` and build a canonical snapshot of every pre-existing staged, unstaged, and untracked target path. For candidate and dirty renames, include both source and destination. Parse machine-readable Git path output NUL-safely and compare paths using the repository and filesystem case semantics.

The snapshot preserves the dirty path set and status class, file type and mode, worktree content fingerprints, and index entries. Keep its path records local, compute a canonical SHA-256 digest plus staged, unstaged, and untracked counts, and never publish paths or file contents.

Compute the complete candidate delta from that target `HEAD`. A collision means the candidate and dirty sets contain the same path or an ancestor/descendant path-prefix pair. Any collision stops with the Issue open; never automatically stash, commit, clean, reset, or otherwise move target work.

After the collision check, update the completion note with a `dirty-target-preservation:v1` receipt in phase `PREPARED`. It binds the target-before SHA, candidate SHA, canonical dirty-snapshot digest, and non-sensitive counts. Read back and verify those exact fields before continuing; tracker failure, missing fields, or a mismatch stops before integration.

Re-read the target `HEAD` and recompute the dirty snapshot immediately before the fast-forward. If the target `HEAD` or digest moved, mark the receipt `FAILED` and read it back when possible, then stop this invocation with the Issue open. Do not refresh the candidate, replace the receipt baseline, or continue only because Git would accept the merge.

## Integrate, clean up, and close

From the original target worktree, run `git merge --ff-only` to fast-forward the target branch to the exact reviewed candidate and verify its `HEAD`. If Git refuses or the command fails, inspect and report the actual target, index, and worktree state; do not assume they are untouched. Keep the Issue open and mark the receipt `FAILED` whenever preservation is not proved. Do not merge from inside the Issue worktree or remove the active working directory.

After the fast-forward, recompute the canonical dirty snapshot. A digest mismatch is a partial failure: mark and read back the receipt as `FAILED` when possible, keep the Issue open, report the exact state, and do not attempt automatic repair or rollback. On a match, update the receipt to `VERIFIED` with target-after equal to the candidate and the same digest, then read back and verify those exact fields. Update failure, read-back failure, missing fields, or a mismatch stops before cleanup with the Issue open.

## Resume and finish

On retry, use only a receipt whose recorded identities match the current Issue and completion note:

- `PREPARED` with target still equal to target-before and a matching digest may repeat the collision check and final preflight, then fast-forward.
- `PREPARED` with target already equal to the candidate and a matching digest may be updated and read back as `VERIFIED`, then continue cleanup.
- `VERIFIED` with target equal to the candidate may continue cleanup and closure without re-baselining later unrelated dirt.
- A missing, `FAILED`, mismatched, unreadable, or third-SHA receipt is ambiguous and stops with the Issue open. A later direct invocation may start a new `PREPARED` attempt only after full refresh and review when the target is not already the candidate; never replace the baseline inside the stopped invocation.

Require the matching `VERIFIED` receipt before cleanup. Immediately re-read the target `HEAD` and require it still equals the receipt candidate before removing the Issue worktree. Target drift after verification stops with the Issue open without changing the `VERIFIED` receipt or re-baselining. Confirm the Issue worktree is registered, is the exact path from the completion note, and remains clean. Remove that worktree with `git worktree remove` from the target worktree, then prune only stale worktree metadata. On retry after verified target integration, an already absent worktree means cleanup is complete. Never delete the topic branch.

Require the same `VERIFIED` receipt and immediately re-read the target `HEAD`; require it still equals the receipt candidate before closing the Issue. Close the Issue through the configured tracker and read it back once. If integration, cleanup, or tracker closure fails after an earlier step succeeded, report the exact partial state and resume through the receipt rules; never roll back a successfully integrated target automatically.

Never push, remote-merge, deploy, delete unrelated files, publish derived output, or act on live providers. Keep local integration, Issue closure, push, remote merge, deployment, and live verification as separate claims.
