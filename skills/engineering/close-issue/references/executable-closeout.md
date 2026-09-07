# Executable closeout

Read this reference only after the entry has selected a valid Executable Issue completion and acquired the close owner's two leases.

## Preconditions and progress

Read Git ancestry, exact worktree registration, and tracker state before each action; they are the progress source. Require every blocker closed and candidate `C` to exist. When the exact registered Issue worktree exists, recheck path, topic branch, clean state, and `HEAD == C`; when absent, cleanup is already satisfied only if `C` is reachable from the recorded target. If the target worktree is dirty, stop before mutation: never stash, commit, clean, reset, or move unrelated work. The human preserves and resolves dirty state, then must retry `/close-issue <Issue-ID>`; that retry never needs execution review or a full suite. Before any action, if the Issue is already closed while `C` is unreachable or its exact worktree remains registered, stop as contradictory and out of order.

## 1. Merge unchanged candidate

Read latest target `HEAD` while holding the target writer. If `C` is already an ancestor, merge is satisfied. Otherwise require the target worktree clean. If target is ancestor of `C`, run `git merge --ff-only <C>`; only diverged histories use `git merge --no-ff --no-edit <C>`. Do not rebase, refresh, edit `C`, or depend on `merge.ff`. Use [merge helper](../scripts/merge-candidate.mjs) with both close-owner leases and exact candidate.

When merge conflicts, run `git merge --abort`, prove the target returned to its pre-merge commit and is clean, then stop with Issue worktree registered and Issue open. Never auto-resolve, create a replacement candidate, append `implementation_blocked`, or invoke `execute-issue`. Unexpected ref movement or abort failure stops with exact Git state. The human or same authorized coordinator may rerun `execute-issue` in the same topic branch and Issue worktree from the latest target only within the original Acceptance Criteria; a Scope change returns to planning. For coordinator conflict, return exactly one native final-answer line `Workflow close result: <JSON>` with `schema: issue-close-result:v1`, `state: CONFLICT`, exact `runId`, `issueId`, accepted `requestIdentity`, candidate, pre-merge `targetHead`, `targetRestored: true`, and conflicted paths. The coordinator may hand the original lane to the authorized execution recovery path only within unchanged Acceptance Criteria; closeout never repairs it.

After a new merge, require `C` target-reachable and run only the Issue-plan integration verification for that new clean combination. Reuse only exact combination evidence through execution's verification cache. A hook or side effect leaving target dirty stops before cleanup/closure.

## 2. Remove exact Issue worktree

Require `C` target-reachable. If the exact registered worktree remains, recheck path, topic branch, clean state, and `HEAD == C`, then run `git worktree remove <exact-issue-worktree>` from outside that directory. Never delete a branch or another worktree. Cleanup is satisfied only when both registration and directory are absent.

An unregistered, ordinary empty directory remains pending cleanup only when its recorded topic still names `C`, no registration claims its path or topic, and `C` is target-reachable. Preserve completion and resume the same close owner; remove only that exact empty directory nonrecursively after verifying ownership. Linked/nonempty paths or unknown owners stop. A tool policy rejection stops without alternate-tool retries; it is not a transient OS error. Host-held handles require supported owner release, never arbitrary process termination.

## 3. Close and read back Issue

Require `C` remains reachable and the exact worktree absent. If the Issue is open, close it through the configured tracker and read it back once. If it is already closed, read it back and accept only when the same candidate is reachable and the worktree absent; otherwise stop without reopening.

For transient Git/tracker failure, probe state after 5, 15, and 30 seconds; retry only unsatisfied actions. Unknown ownership or exhausted probes preserves the lane. A post-merge failure reports remaining actions; retry skips completed actions and resumes the next one, never rolling back a successful merge.
