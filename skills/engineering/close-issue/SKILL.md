---
name: close-issue
description: Integrate one exact reviewed candidate into its current local target, remove its worktree, and close the Issue.
disable-model-invocation: true
---

# Close Issue

Close exactly one executed Issue. Successful closure always means its exact reviewed candidate is locally integrated into the named target. This skill never repairs product code, never invokes `execute-issue`, and never reruns Standards/Spec review or expensive full verification.

## Entry

Read the open Issue and its ordered `execute-issue` state history once. Record the latest terminal execution state as `E`; require `E` to be the `implementation_complete` Execution completion note, with no later blocked state, and require original target branch/worktree, Issue worktree, topic branch, baseline, exact reviewed candidate, Planning Seal, clean Standards and Spec, passing final verification, and clean worktree evidence. Confirm blockers remain closed.

Capture the current original target commit as `T` and the unchanged reviewed candidate as `C`. Require `C` to equal the clean registered Issue worktree `HEAD`. The original target worktree does not need to be clean and may contain unrelated staged, unstaged, and untracked work. One human serializes integrations into the same target; no global queue or lock is added.

If the Issue is already closed, resume only when the recorded candidate and integration candidate are ancestors of the current target, the Issue worktree is absent, identities and matching read-back receipt agree. Read back and confirm closed state, then report completion without closing it again; every other closed state stops without reopening.

## Prepare the integration candidate

Create an isolated temporary integration worktree and branch from exact `T` without modifying the real target or Issue worktree.

- If `T` is an ancestor of `C`, set `I = C`.
- Otherwise, if `C` is an ancestor of `T`, use `git commit-tree` to create `I` as a two-parent merge commit with the exact tree of `T` and exact parents `T` then `C`; verify that tree and parent list.
- Otherwise create `I` with a no-fast-forward merge of exact `C` into `T`, without rebasing. The merge commit may only compose those histories; do not edit or repair product code.

Require both `T` and `C` to be ancestors of `I` and the temporary worktree to be clean. A merge conflict, changed candidate, ambiguous identity, scope change, or unexpected merge content stops before real target mutation, receipt preparation, Issue worktree cleanup, or Issue closure. Never auto-resolve conflicts. Remove only the temporary integration worktree when safe; otherwise report its exact retained state.

## Protect unrelated target work

Immediately before integration, require target `HEAD == T`. Create invocation-unique strict-UTF-8 JSON input and output paths, require the final output to be absent, and run:

`node <close-issue-skill>/scripts/preservation.mjs inspect <input-json-path> <output-json-path>`

The `closeout-preservation-inspection-input:v1` input supplies only the resolved target worktree, expected target identity, `T`, and `I`. Never precompute or pass dirty paths, candidate paths, fingerprints, case semantics, collision results, or hook evidence. The private read-only module derives them in one inspection: every staged, unstaged, and untracked path; both endpoints of candidate and dirty renames; path/status class, file type/mode, worktree fingerprints, and index entries; NUL-safe Git output; repository/filesystem case semantics; the complete `T..I` delta; same-path and ancestor/descendant path-prefix collisions; and effective post-merge hook evidence.

Continue only when the command exits zero and the complete expected `closeout-preservation-inspection:v1` result is `SAFE`. Validate observed target, dirty SHA-256 and counts, hook fingerprints, collision outcome, reason code, and every required field. A classified `COLLISION` or `BLOCKED` result is diagnostic only and exits non-zero; command failure, missing output, stale output, malformed JSON, missing field, schema mismatch, or any untrusted state stops without inference. Any collision stops with the Issue open; never automatically stash, commit, clean, reset, or move user work.

Keep paths local and publish only the canonical dirty digest, staged/unstaged/untracked counts, and hook evidence. Never publish paths or file contents. After validation, remove only this invocation's exact input/output and `<output-json-path>.tmp-*` files; never reuse a result path. Stdout and a reusable repository-local result file are not evidence transports.

Append a read-back `dirty-target-preservation:v1` receipt in phase `PREPARED` binding the Issue, execution-state identity `E`, target branch, `T`, `C`, `I`, dirty digest and counts, and hook evidence. Read back and verify those exact fields before continuing. Tracker failure or mismatch stops before integration.

Immediately re-read target `HEAD`, latest execution state, and blockers, then rerun the same private inspection with expected target `T`. Target, `E`, blocker, digest, count, or hook drift updates/read-backs the receipt as `FAILED` when possible and stops; never re-baseline inside the invocation.

## Integrate and prove inclusion

From the original target worktree run `git merge --ff-only <I>`. Verify target `HEAD == I` and `C` is an ancestor of `I`. Git refusal or any identity mismatch marks/read-backs `FAILED` when possible and stops with the Issue open; inspect actual state and never assume rollback.

Run the same private inspection with expected target `I`. Anything except a complete trusted `SAFE` result records available expected and observed evidence in `FAILED`, keeps the Issue open, and never triggers automatic repair or rollback. On equal dirty digest/counts and hook evidence, update the receipt to `VERIFIED` with target-after `I`, candidate reachable, the same evidence, then read back every field. Missing or mismatched proof stops before cleanup.

## Resume, clean up, and close

Matching `PREPARED` may resume only from `T` with unchanged evidence or from `I` with proved candidate ancestry and unchanged evidence. Matching `VERIFIED` may resume at `I`. Missing, unreadable, mismatched, or third-SHA evidence stops.

A `FAILED` receipt stops cleanup and closure. Explicit recovery requires a new successful execution or an integration-repair Issue; never convert unproved preservation into closure.

Require a matching read-back `VERIFIED` receipt before cleanup and before closing. At both gates re-read target `HEAD == I`, latest execution state identity `E`, and every blocker still closed; any drift leaves the Issue open and reports the exact partial state. Remove the exact clean registered Issue worktree with `git worktree remove`; an already absent worktree means cleanup is complete only with matching receipt evidence. Prune only stale worktree metadata and never delete the topic branch.

Close the Issue through the configured tracker and read it back once. Failure after integration reports exact partial state and resumes only through matching receipts; never roll back a successful integration automatically.

Never push, remote-merge, deploy, delete unrelated files, or treat local integration as production verification.
