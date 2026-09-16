# Executable closeout

After selecting completion, hold both leases.

## Preconditions

Require closed blockers, local candidate `C`, and a worktree matching its path/topic, clean, with `HEAD == C`; an absent worktree requires no directory and target-reachable `C`. If the target worktree is dirty, stop before mutation: never stash, commit, clean, reset, or move unrelated work. The human resolves dirt, then direct `/close-issue <Issue-ID>` or the authorized coordinator resumes this owner after reconciliation, without repeating execution review or a full suite. Before any action, an already-closed Issue with unreachable `C` or a remaining exact worktree/directory is contradictory and stops.

## 1. Merge unchanged candidate

With the target writer held, read latest target `HEAD`. If candidate `C` is already an ancestor of target, merge is satisfied; otherwise require a clean target. If target is ancestor of `C`, run `git merge --ff-only <C>`; only diverged histories use `git merge --no-ff --no-edit <C>`. Do not rebase, refresh, edit `C`, or depend on `merge.ff`. Use the [merge helper](../scripts/merge-candidate.mjs) with both leases and exact candidate.

When merge conflicts, `git merge --abort`; prove the clean pre-merge target, then stop with Issue worktree registered and Issue open. Never auto-resolve, replace the candidate, append `implementation_blocked`, or invoke `execute-issue`. Ref movement or abort failure stops with exact Git state. Authorized execution recovery retains the topic/worktree, latest target and original Acceptance Criteria; Scope change returns to planning. A coordinator conflict returns the `CONFLICT` [close result line](close-result-lines.md); it transfers repair ownership, and closeout never repairs.

After merge or reachable re-entry, invoke `verifyIntegratedCandidate` with both leases, execution operation ID, Issue, candidate and every approved integration check (`[]` only when none apply), binding command/configuration/environment/fresh external inputs. `verificationRecovery` re-reads changed inputs or supplies exact native `readOutcome(attempt): {attemptIdentity,exitCode,source,evidence}`. Persist obligations/UNKNOWN before execution; retain PASS/FAIL/UNKNOWN.

Failure preserves the merged commit, completion and exact worktree, blocking cleanup/closure; do not repeat an unchanged explicit failure. Lost or unknown results need owning-source diagnosis; target movement, missing responses, skipped commands and ancestry never prove PASS. Changed inputs need new evidence, and required checks cannot disappear from the same candidate. Prove every check PASS for the current clean combination before cleanup or tracker closure. Target dirt stops.

Keep verification identity and failed command/result at their owner; a coordinator reports its `INTEGRATION_FAILED` or `INTEGRATION_UNKNOWN` [close result line](close-result-lines.md). Automatic cleanup requires persisted PASS and `externalInputs: {kind: "none"}`; other external-input checks stay with this owner. Obligations survive re-entry and later cleanup failure.

## 2. Remove exact Issue worktree

Require target-reachable `C` and every exact-combination check PASS. If the exact registered worktree remains, recheck path, topic branch, clean state and `HEAD == C`, then run `git worktree remove <exact-issue-worktree>` from outside it. Never delete any branch or other worktree. Cleanup is satisfied only when both registration and directory are absent.

An unregistered ordinary empty directory, held handles, unknown owners, linked or nonempty paths, and tool-policy rejection follow [host cleanup recovery](host-cleanup.md).

## 3. Close and read back Issue

Require reachable `C`, absent exact worktree and current PASS obligations. If the Issue is open, close it through its tracker and read it back once. If it is already closed, read it back and accept only when the same candidate is reachable and the worktree absent; otherwise stop without reopening.

After successful read-back, while both leases remain current, call `markCompleted()` once. A coordinator returns the `CLOSED` [close result line](close-result-lines.md).

Probe transient failures after 5/15/30 seconds; retry skips completed actions and resumes the next one. Unknown ownership/exhausted probes preserves the lane. Target movement during partial close requires verifying the new combination; prior PASS preserves completed cleanup. Never roll back a successful merge.
