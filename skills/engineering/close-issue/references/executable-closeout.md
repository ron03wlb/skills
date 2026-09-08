# Executable closeout

Hold both close-owner leases after selecting completion.

## Preconditions

Before each action, read Git ancestry, exact worktree registration and tracker state. Require closed blockers and local candidate `C`. A present worktree must match its path, topic, clean state and `HEAD == C`; an absent worktree requires physical absence and target-reachable `C`. If the target worktree is dirty, stop before mutation: never stash, commit, clean, reset, or move unrelated work. The human resolves dirt, then direct `/close-issue <Issue-ID>` or the authorized coordinator resumes this owner after reconciliation, without repeating execution review or a full suite. Before any action, an already-closed Issue with unreachable `C` or a remaining exact worktree/directory is contradictory and stops.

## 1. Merge unchanged candidate

Read latest target `HEAD` while holding the target writer. If `C` is already an ancestor, merge is satisfied. Otherwise require the target worktree clean. If target is ancestor of `C`, run `git merge --ff-only <C>`; only diverged histories use `git merge --no-ff --no-edit <C>`. Do not rebase, refresh, edit `C`, or depend on `merge.ff`. Use [merge helper](../scripts/merge-candidate.mjs) with both close-owner leases and exact candidate.

When merge conflicts, run `git merge --abort`, prove the target returned to its pre-merge commit and is clean, then stop with Issue worktree registered and Issue open. Never auto-resolve, create a replacement candidate, append `implementation_blocked`, or invoke `execute-issue`. Unexpected ref movement or abort failure stops with exact Git state. Authorized execution recovery retains the topic/worktree, latest target and original Acceptance Criteria; a Scope change returns to planning. For coordinator conflict, return exactly one native final-answer line `Workflow close result: <JSON>` with `schema: issue-close-result:v1`, `state: CONFLICT`, exact `runId`, `issueId`, accepted `requestIdentity`, candidate, pre-merge `targetHead`, `targetRestored: true`, and conflicted paths. The coordinator transfers repair ownership; closeout never repairs.

After merge or reachable re-entry, invoke `verifyIntegratedCandidate` with both leases, original execution operation ID, Issue ID, candidate and every approved integration check; use `[]` only when none is required. Each check binds command, configuration, environment and fresh external inputs. The verification owner persists the obligation and UNKNOWN attempt before execution, retaining exact candidate/target/input PASS, FAIL and UNKNOWN outcomes.

A failed check preserves the merged commit, original completion and exact worktree and blocks cleanup/closure. An unchanged explicit failure is not executed again. Lost/unknown results require owning-source diagnosis; target movement, missing responses, skipped commands and ancestry never prove PASS. Changed relevant inputs receive their own evidence, while removing a required check from the same candidate's obligation is rejected. Before cleanup and again before tracker closure, prove all required checks PASS for the current clean combination. Target dirt stops.

Return verification identity and failed command/result. The coordinator final line may encode `Workflow close result: <JSON>` with `schema: issue-close-result:v1`, `state: INTEGRATION_FAILED|INTEGRATION_UNKNOWN`, the accepted request/Run/Issue identities and `integrationVerification`. Durable obligations survive dialogue/direct entry. The coordinator selects isolated recovery under existing scope, without fabricating conflict history.

## 2. Remove exact Issue worktree

Require `C` target-reachable and every required exact-combination integration check PASS. If the exact registered worktree remains, recheck path, topic branch, clean state, and `HEAD == C`, then run `git worktree remove <exact-issue-worktree>` from outside that directory. Never delete a branch or another worktree. Cleanup is satisfied only when both registration and directory are absent.

An unregistered, ordinary empty directory remains pending cleanup only when its recorded topic still names `C`, no registration claims its path or topic, and `C` is target-reachable. Preserve completion and resume the same close owner; remove only that exact empty directory nonrecursively after verifying ownership. Linked/nonempty paths or unknown owners stop. A tool policy rejection stops without alternate-tool retries; it is not a transient OS error. For host-held handles or policy rejection, read [host cleanup recovery](host-cleanup.md) for capability evidence, bounded observation and the same-owner failure result.

## 3. Close and read back Issue

Require `C` remains reachable, the exact worktree absent and every integration obligation still PASS for the current inputs. If the Issue is open, close it through the configured tracker and read it back once. If it is already closed, read it back and accept only when the same candidate is reachable and the worktree absent; otherwise stop without reopening.

For transient failures, probe after 5, 15, and 30 seconds; retry only unsatisfied actions. Unknown ownership or exhausted probes preserves the lane. A post-merge failure reports remaining actions; retry skips completed actions and resumes the next one, never rolling back a successful merge.
