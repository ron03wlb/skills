---
name: close-issue
description: Integrate one exact reviewed candidate into its current local target, remove its worktree, and close the Issue.
disable-model-invocation: true
---

# Close Issue

Close exactly one executed Issue. Successful closure always means its exact reviewed candidate is locally integrated into the named target. This skill never repairs product code, never invokes `execute-issue`, and never reruns Standards/Spec review or expensive full verification.

## Entry

Read the open Issue and latest `execute-issue` completion note once. Require `implementation_complete`, original target branch/worktree, Issue worktree, topic branch, baseline, exact reviewed candidate, Planning Seal, clean Standards and Spec, passing final verification, and clean worktree evidence. Confirm blockers remain closed.

Capture the current original target commit as `T` and the unchanged reviewed candidate as `C`. Require `C` to equal the clean registered Issue worktree `HEAD`. The original target worktree does not need to be clean and may contain unrelated staged, unstaged, and untracked work. One human serializes integrations into the same target; no global queue or lock is added.

If the Issue is already closed, resume only when the recorded candidate and integration candidate are ancestors of the current target, the Issue worktree is absent, identities and matching read-back receipt agree. Read back and confirm closed state, then report completion without closing it again; every other closed state stops without reopening.

## Prepare the integration candidate

Create an isolated temporary integration worktree and branch from exact `T` without modifying the real target or Issue worktree.

- If `T` is an ancestor of `C`, set `I = C`.
- Otherwise create `I` with a no-fast-forward merge of exact `C` into `T`, without rebasing. The merge commit may only compose those histories; do not edit or repair product code.

Require both `T` and `C` to be ancestors of `I` and the temporary worktree to be clean. A merge conflict, changed candidate, ambiguous identity, scope change, or unexpected merge content stops before real target mutation, receipt preparation, Issue worktree cleanup, or Issue closure. Never auto-resolve conflicts. Remove only the temporary integration worktree when safe; otherwise report its exact retained state.

## Protect unrelated target work

Immediately before integration, require target `HEAD == T`. Build a canonical snapshot of every pre-existing staged, unstaged, and untracked target path. For candidate and dirty renames, include both source and destination. Parse machine-readable Git output NUL-safely and compare with repository/filesystem case semantics.

Snapshot path/status class, file type/mode, worktree content fingerprints, and index entries. Keep paths local; publish only a canonical SHA-256 digest and staged, unstaged, and untracked counts. Resolve and fingerprint effective post-merge hook state, keeping its path local. Never publish paths or file contents.

Compare the complete `T..I` delta with dirty paths. A collision is the same path or an ancestor/descendant path-prefix pair. Any collision stops with the Issue open; never automatically stash, commit, clean, reset, or move user work.

Append a read-back `dirty-target-preservation:v1` receipt in phase `PREPARED` binding the Issue, target branch, `T`, `C`, `I`, dirty digest and counts, and hook evidence. Read back and verify those exact fields before continuing. Tracker failure or mismatch stops before integration.

Immediately re-read target `HEAD`, dirty snapshot, and hook evidence. Target, digest, or hook drift updates/read-backs the receipt as `FAILED` when possible and stops; never re-baseline inside the invocation.

## Integrate and prove inclusion

From the original target worktree run `git merge --ff-only <I>`. Verify target `HEAD == I` and `C` is an ancestor of `I`. Git refusal or any identity mismatch marks/read-backs `FAILED` when possible and stops with the Issue open; inspect actual state and never assume rollback.

Recompute dirty and hook evidence. Mismatch records expected and observed evidence in `FAILED`, keeps the Issue open, and never triggers automatic repair or rollback. On equality, update the receipt to `VERIFIED` with target-after `I`, candidate reachable, the same digest/counts/hook evidence, then read back every field. Missing or mismatched proof stops before cleanup.

## Resume, clean up, and close

Matching `PREPARED` may resume only from `T` with unchanged evidence or from `I` with proved candidate ancestry and unchanged evidence. Matching `VERIFIED` may resume at `I`. Missing, unreadable, mismatched, or third-SHA evidence stops.

A `FAILED` receipt stops by default. A later explicit human reconciliation may accept only post-fast-forward dirty drift when the receipt preserves failure-time expected/observed evidence, reflog proves `T -> I`, `C` and `I` remain ancestors of current target, collision remains zero, the exact Issue worktree is clean, and hook evidence is sufficient. Legacy missing transition-time hook evidence additionally requires current hook absence and explicit acceptance that absence is not retroactively proven. Append and read back a separate `dirty-target-reconciliation:v1` receipt in phase `RECONCILED`; never replace `FAILED`, and state `preservation equality is not proven`.

Require a matching read-back `VERIFIED` or `RECONCILED` receipt before cleanup and before closing. For an open Issue, re-read target `HEAD == I` at each gate. Remove the exact clean registered Issue worktree with `git worktree remove`; an already absent worktree means cleanup is complete only with matching receipt evidence. Prune only stale worktree metadata and never delete the topic branch.

Close the Issue through the configured tracker and read it back once. Failure after integration reports exact partial state and resumes only through matching receipts; never roll back a successful integration automatically.

Never push, remote-merge, deploy, delete unrelated files, or treat local integration as production verification.
