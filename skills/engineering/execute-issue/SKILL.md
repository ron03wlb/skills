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

### Prerequisite inspection

At Entry, perform prerequisite discovery after the exact Issue is fully published and before any worktree creation or product implementation. Inspect repository instructions for one declared Prerequisite resolver. No resolver declaration is `NOT_REQUIRED` and preserves ordinary Issue execution. A declaration must name an exact executable command with machine-readable `discover`, `prepare`, and `verify` semantics; a missing, unreadable, ambiguous, unparseable, or inconsistent declaration is resolver `BLOCKED`.

Invoke only the resolver's read-only `discover` operation, exactly once, with the complete published Issue context and current evidence. Execution never invokes `pre-execute-issue`; it never calls `prepare` or `verify`, prepares an artifact, replays SQL, or performs the Manual prerequisite action.

- `NOT_REQUIRED` continues by creating the ordinary dedicated Issue worktree and topic branch from the verified baseline.
- `REQUIRED` must have a current read-back `READY` receipt whose exact Issue, prerequisite commit, artifact paths and SHA-256 hashes, resolver or policy identity, non-sensitive manual target identity, and prerequisite ancestry match current discovery. The prerequisite commit must be an ancestor of the current candidate. Reuse the same Issue worktree, topic branch, and candidate ancestry recorded by the receipt; never create a second execution lane.
- `REQUIRED` with missing or stale `READY` evidence records and reads back `implementation_blocked`, then instructs the human to invoke `/pre-execute-issue <Issue-ID>`.
- Resolver `BLOCKED` records and reads back `implementation_blocked` with the resolver failure, then instructs the human to repair the declaration or invoke `/pre-execute-issue <Issue-ID>`; generic execution never guesses the resolver.

Record the selected Issue worktree and topic branch identities once and run a cheap relevant baseline check.

## Implement and verify

Trace the real behavior and highest practical verification seam. Use TDD when a focused behavioral test can capture the change. Commit coherent verified slices on the topic branch.

Expected paths and symbols are non-exhaustive planning evidence, not an allowlist:

- Include a **Necessary discovery** automatically when source evidence proves it is required by an existing plan step and unchanged Acceptance Criterion.
- Record a concise **Material plan deviation** and covered `AC-n` when the implementation path changes but behavior and Acceptance Criteria do not.
- A **Scope change** to behavior, Acceptance Criteria, target, exclusions, independent outcomes, or ownership stops and returns to planning.

Run affected verification after each slice or repair. Before review, run the Issue's required final verification, including focused checks, typechecking where configured, and the repository-required full suite. Record exact commands and results.

If implementation evidence contradicts an Entry `NOT_REQUIRED` result, classify it as a **Late prerequisite discovery** and stop before prerequisite-dependent verification. Preserve coherent checkpoint commits and record/read back `implementation_blocked`. With unchanged Acceptance Criteria and approved schema outcome, instruct the human to invoke `/pre-execute-issue <Issue-ID>` so it reuses the same worktree; changed behavior, acceptance, target, exclusions, or ownership is a Scope change that returns to `/to-spec` or `/to-tickets`. Never auto-invoke, roll back, or silently expand scope.

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
