---
name: close-issue
description: Close one completed Issue or Multi-Issue Spec against its recorded local target. Use when a human invokes closeout directly or a valid DAG Run Grant authorizes the next close action.
---

# Close Issue

Close one Issue by ID. Dispatch by the authoritative Issue shape: an Executable Issue follows the three-action close path; a Multi-Issue Spec follows the parent-only path. This skill never repairs product code, invokes `execute-issue`, reruns Standards or Spec review, runs aggregate verification, pushes, or deploys.

## Entry

Read the Issue, parent or linked Spec, ordered execution history, blockers, recorded Issue target branch, and local Git worktree registrations. Resolve exact identities from tracker and Git evidence; never infer the target from the current checkout or substitute a different branch. Read [`references/operation-identity.md`](references/operation-identity.md), call `deriveCloseIssueOperationIdentity` for the deterministic operation identity, and keep `close-issue` as the closeout operation owner. Derive the canonical Git common dir, then pass the immutable repository, Spec, approved-publication, and Issue inputs to [the owner-local lease boundary](scripts/close-lease.mjs); it derives the stable closeout key. `close-issue` remains the sole owner that acquires the repository close lease before the shared target mutation writer for direct human and DAG entry and every partial retry; callers and coordinators cannot pre-acquire, delegate, or pass either lease.

Entry authority is either direct human invocation or a valid **DAG Run Grant**. A coordinator holding that Grant may invoke closeout without separate per-Issue human approval. `close-issue` never creates or renews a DAG Run Grant. For coordinator entry, require the read-back Grant to bind the exact Spec, recorded Issue target branch, published classification and approved scope, plus the exact **Decomposition publication record** for a Multi-Issue Run. A Single-Issue executable target must be the exact bound Spec. A Multi-Issue Executable Issue must be an exact Issue in that record's key-to-Issue mapping; a parent-only target must be the exact bound Spec itself. An Executable Issue absent from the bound mapping stops before mutation. Missing, stale, or mismatched Grant evidence stops before mutation; the Grant never adds push, deploy, prerequisite-execution, scope-expansion, or ambiguity-repair authority.

Within the same Git common dir, closeouts for different targets share one repository close lease; different repositories remain concurrent. The target mutation writer still coordinates planning producers and closeout on their exact target. Issue execution, Issue worktree work, and planning for unrelated targets never acquire the repository close lease.

On healthy contention, observe the exact owner, then boundedly retry without lease stealing. After release, re-read every entry identity and mutation precondition before acquisition; an acquisition race returns to observation. Timeout, unknown ownership, stale-proof mismatch, or an unresolved acquisition race stops before closeout mutation. Reclaim only with exact owner-inactivity and abandoned-operation proof. The mechanism adds no scheduling service or global workflow lock.

Release the target writer before the repository lease, and release both only after the attempt's required read-back or verified pre-mutation stop. A release or fencing failure reports the exact ownership state and stops.

For an Executable Issue, select the latest valid `implementation_complete` note. Require a current receipt's `operationIdentity` to match the canonical repository, linked Spec, approved publication identity or hash, producer `execute-issue`, stage `implementation`, and Issue; a valid legacy completion that predates this contract remains frozen under its recorded identity and body. Then require its exact Issue target branch/worktree, topic branch/worktree, execution baseline, reviewed candidate `C`, Planning Seal, clean Standards and Spec, passing final verification, and clean Issue worktree evidence. A later state supersedes it only when read-back evidence invalidates `C` itself. Target movement, a close conflict, partial close progress, or aggregate-gate failure does not supersede completion and never sends the Issue back to `execute-issue`.

Before validating an Executable Issue's `workflowArtifacts` compatibility or `manualAttestations`, read [completion evidence](references/completion-evidence.md) and apply every gate there. Those records never supply close, coverage, verification, push, deployment, database, or Scope authority.

Require every blocker to remain closed. Require `C` to exist locally. When the registered Issue worktree is present, require its exact path and topic branch, clean state, and `HEAD == C`; when it is absent, accept cleanup as already satisfied only if `C` is reachable from the Issue target branch. Preserve unrelated work: if the target worktree is dirty, stop before mutation and never stash, commit, clean, reset, or move it. Tell the human to preserve and resolve that work, then retry `/close-issue <Issue-ID>`; this stop never needs another execution review or full suite.

Before any action, if the Issue is already closed while `C` is not reachable or its exact Issue worktree remains registered, classify the state as contradictory and out of order and stop. Never merge, remove the worktree, reopen the Issue, or repair that state automatically.

## Executable Issue: three idempotent actions

Perform exactly three ordered, idempotent actions: merge the unchanged candidate into the latest Issue target branch, remove the exact clean registered Issue worktree, and close the Issue. Before each action, derive current progress directly from Git ancestry, worktree registration, and tracker state; skip an action whose condition is already satisfied. Write no custom success or failure receipt.

### 1. Merge the candidate

Read the latest target `HEAD` while holding the shared target mutation writer. If `C` is already an ancestor of the target, the merge is satisfied. Otherwise require the target worktree to be clean and merge exact `C` into the latest target without rebasing, refreshing, or editing the Issue candidate. If the target is an ancestor of `C`, run `git merge --ff-only <C>`; only for diverged histories run `git merge --no-ff --no-edit <C>` to create the ordinary merge commit. Do not depend on repository `merge.ff` configuration.

If the merge conflicts, run `git merge --abort`, verify the target returned to its pre-merge commit and is clean, and stop with the Issue worktree registered and the Issue open. Never auto-resolve, create a replacement candidate, append `implementation_blocked`, or invoke `execute-issue`. An unexpected ref movement or abort failure reports the exact Git state and stops; a later `close-issue` retry starts from observable current state. The human may explicitly rerun `execute-issue` in the same topic branch and Issue worktree from the latest target only within the original Acceptance Criteria; a Scope change returns to planning.

After success, require `C` to be an ancestor of the current Issue target branch. A merge hook or other side effect that leaves the target worktree dirty stops before cleanup or closure and requires explicit human handling.

### 2. Remove the Issue worktree

Require `C` to be reachable from the Issue target branch. If the exact registered Issue worktree remains, recheck its path, topic branch, clean state, and `HEAD == C`, then run `git worktree remove <exact-issue-worktree>`. Never delete the topic branch or any other worktree. If the worktree is already absent, this action is satisfied.

### 3. Close the Issue

Require `C` to remain reachable and the exact Issue worktree to be absent. If the Issue is open, close it through the configured tracker and read it back once. If it is already closed, read it back and treat closure as satisfied only when the same candidate is reachable and the worktree is absent; otherwise stop without reopening.

A failure after merge reports which of the three observable actions remain. Retry skips completed actions and resumes the next one. Never roll back a successful merge automatically.

## Multi-Issue parent

A Multi-Issue Spec has no implementation candidate or Issue worktree. Require its matching read-back Decomposition publication record, exact child mapping, common Issue target branch, and current tracker state. Prove every exact child is closed and every child's unchanged completed candidate is reachable from that same target. Missing, unreadable, stale, duplicate, or conflicting publication evidence stops and returns to `/to-tickets <Parent-ID>` reconciliation; never infer completeness from visible children or use a legacy bypass.

Close and read back only the parent. Closing the final child never closes it implicitly, and parent closure never claims `push_ready` or performs aggregate verification.
