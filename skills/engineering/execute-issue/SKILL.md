---
name: execute-issue
description: Validate planning context and implement one tracker Issue in a dedicated worktree, repairing Standards and Spec findings before separate integration.
disable-model-invocation: true
---

# Execute Issue

Implement exactly one dependency-ready Tracker Spec or child Issue in a dedicated Git worktree. This skill owns implementation and Matt `code-review`; it stops at a trustworthy completion note and never invokes `close-issue`.

## Entry

Read the exact Issue, parent or linked Spec, comments, repository instructions, Acceptance Criteria, Implementation Plan, blockers, target, and exclusions. Consume the published Single-Issue or child classification without reclassifying it. Unresolved blockers or material ambiguity stops before writing.

Before any blocked exit from Entry, implementation, verification, or review, append an `implementation_blocked` terminal state with the reason and current target, worktree, baseline, and candidate identities that exist. Read it back once; a successfully read-back blocked state supersedes older successful execution evidence for this Issue only. Tracker write or read-back failure reports unresolved tracker ambiguity and never claims supersession or completion.

Capture the original target branch, worktree, and current `HEAD` once as the execution baseline. Preserve unrelated work and do not repeatedly re-confirm unchanged identities.

Require any Planning Seal to exist locally and be an ancestor of the execution baseline. Perform a seal-currency check: the target must have no uncommitted planning-artifact delta owned by this Issue or Spec. This check is not scope authority. Missing, stale, unreachable, or ambiguously owned planning evidence stops; tell the human to invoke `/to-spec` or `/to-tickets`.

`execute-issue` never creates or repairs a Planning Seal, stages target planning artifacts, or edits the parent to make validation pass. An older Issue without a Planning baseline may use `not-applicable` only when no relevant planning artifact needs sealing.

Create or reuse one dedicated Issue worktree and topic branch from the verified baseline. Record their exact identities once and run a cheap relevant baseline check.

## Implement and verify

Trace the real behavior and highest practical verification seam. Use TDD when a focused behavioral test can capture the change. Commit coherent verified slices on the topic branch.

Expected paths and symbols are non-exhaustive planning evidence, not an allowlist:

- Include a **Necessary discovery** automatically when source evidence proves it is required by an existing plan step and unchanged Acceptance Criterion.
- Record a concise **Material plan deviation** and covered `AC-n` when the implementation path changes but behavior and Acceptance Criteria do not.
- A **Scope change** to behavior, Acceptance Criteria, target, exclusions, independent outcomes, or ownership stops and returns to planning.

Run affected verification after each slice or repair. Before review, run the Issue's required final verification, including focused checks, typechecking where configured, and the repository-required full suite. Record exact commands and results.

## Review and repair

Commit the candidate and invoke Matt `code-review` against the recorded baseline and Issue or linked Spec. Require both independent axes to be clean:

- **Standards:** repository instructions and documented standards are satisfied.
- **Spec:** every Acceptance Criterion and exclusion is satisfied without scope creep.

Confirm findings against source, tests, and the Spec. Fix every confirmed in-scope finding, run affected verification, commit the repair, and rerun the full two-axis review. Allow at most 10 repair waves per invocation; a wave counts only when code repair begins. Tool failures, duplicates, and unsupported findings do not count. If wave 10 remains unclean, preserve the latest verified commit, publish the blocked terminal state above, and leave the Issue open.

## Completion note

Rerun required final verification. Declare `implementation_complete` only when final verification passes, Standards and Spec are clean, the Issue worktree is clean, and its `HEAD` equals the reviewed candidate.

Write one compact tracker completion note containing:

- Issue and linked Spec; original target branch/worktree, topic branch/worktree, baseline, and final candidate;
- Planning Seal SHA/state (`created`, `reused`, `successor`, or `not-applicable`);
- `standards: clean`, `spec: clean`, exact verification commands/results, repair-wave count, and any Material plan deviations;
- `worktree: clean` and `implementation_complete`.

Read the note back once and stop. Execution never integrates the target, removes a worktree, closes the Issue, pushes, or deploys; the human separately invokes `/close-issue`.
