---
name: execute-issue
description: Implement and verify one dependency-ready tracker Issue in its recorded-target worktree. Use when a human invokes the Issue directly or a valid DAG Run Grant authorizes its coordinator lane.
---

# Execute Issue

Implement exactly one dependency-ready Tracker Spec or child Issue in a dedicated Git worktree. This skill owns implementation and Matt `code-review`; it stops at a trustworthy completion note and never invokes `close-issue`.

## Entry

Read the exact Issue, parent or linked Spec, comments, repository instructions, Acceptance Criteria, Implementation Plan, blockers, target, exclusions, and ordered execution history. Consume the published Single-Issue or child classification without reclassifying it. Unresolved blockers or material ambiguity stops before writing.

Entry authority is either direct human invocation or a valid **DAG Run Grant**. A coordinator holding that Grant may invoke this exact dependency-ready Issue without separate per-Issue human approval. `execute-issue` never creates or renews a DAG Run Grant.

For coordinator entry, require one read-back DAG Run Grant that binds the exact linked Spec, Issue target branch, published Single-Issue or Multi-Issue classification, and approved scope. A Single-Issue coordinator target must be the exact bound Spec. A Multi-Issue Grant must also bind the exact read-back **Decomposition publication record** whose mapping contains this Issue as an exact mapping member and whose published blockers make it dependency-ready. A Single-Issue outsider or Multi-Issue Issue absent from that bound mapping stops before worktree creation or any mutation. A missing, stale, or mismatched Grant stops before worktree creation or any mutation. The Grant adds no authority to execute a Manual prerequisite, change scope, repair ambiguity, integrate, close, push, or deploy.

If the latest valid `implementation_complete` note still binds this Issue, its Issue target branch, worktree, topic branch, baseline, and unchanged clean reviewed candidate, report that completion and stop unless the human explicitly requested the conflict-resolution rerun below. Target movement alone does not supersede `implementation_complete`, restart execution, or write `implementation_blocked`. A later blocked state supersedes completion only when its read-back evidence invalidates that candidate's own implementation, Standards or Spec review, or verification; a close conflict, partial close, or aggregate-gate failure is not execution evidence.

A dirty target stop or partial close is not a conflict-resolution rerun. When the completion remains valid, perform only cheap read-only identity and evidence checks, report the existing completion, and stop. Do not run baseline, affected, focused, final, or full suite verification; do not rerun review, create a commit, or write a tracker note. Tell the human to preserve and resolve the target work, then invoke `/close-issue <Issue-ID>` again.

An explicit conflict-resolution rerun is the only completion-preserving exception. After `/close-issue` reports a merge conflict, the human may explicitly invoke `execute-issue` again in the same topic branch and Issue worktree, capture the latest target as the new attempt baseline, merge that exact baseline into the topic branch without rebasing or resetting, and resolve the conflict only while the original Acceptance Criteria, target, exclusions, and ownership remain unchanged. This creates no second lane. Require the new candidate to contain the new baseline. A Scope change returns to planning; a successful rerun writes a new `implementation_complete` note that becomes current.

For a real blocked exit before completion or after candidate-invalidating evidence, append `implementation_blocked` with the reason and the target, worktree, baseline, and candidate identities that exist. Read it back once. Tracker write or read-back failure reports unresolved tracker ambiguity and never claims supersession or completion; never publish this state solely because the target moved.

Capture the local branch from which the Issue worktree is created as the Issue target branch, plus its worktree and current `HEAD` once as the execution baseline. That recorded branch is the only default merge destination. Preserve unrelated work and do not repeatedly re-confirm unchanged identities. Any number of Issue worktrees may execute concurrently against the same recorded target.

Require any Planning Seal to exist locally and be an ancestor of the execution baseline. Perform a seal-currency check: the target must have no uncommitted planning-artifact delta owned by this Issue or Spec. This check is not scope authority. Missing, stale, unreachable, or ambiguously owned planning evidence stops; tell the human to invoke `/to-spec` or `/to-tickets`.

`execute-issue` never creates or repairs a Planning Seal, stages target planning artifacts, or edits the parent to make validation pass. An older Issue without a Planning baseline may use `not-applicable` only when no relevant planning artifact needs sealing.

### Manual prerequisite attestation

At Entry, inspect the published Issue and comments for any exact repository artifact that the Issue declares must be executed or applied by a human. No declared Manual prerequisite preserves ordinary Issue execution.

For each declared artifact, a read-back `manual_prerequisite_complete:v1` note with the same Issue and normalized repository-relative path is sufficient. Trust that human attestation without requiring a repository resolver, setup step, target identity, credentials, DB access, artifact hash, artifact-only commit, postflight output, external verification, `WAITING_MANUAL`, or `READY`. Never execute or replay the artifact.

If an attestation is missing, stop before worktree creation or prerequisite-dependent implementation and give the exact command `/pre-execute-issue <Issue-ID> <artifact-path>`. Do not write a duplicate prerequisite-only `implementation_blocked` note when the current execution history already records the same missing artifact. A later matching attestation resolves that prerequisite-only blocked state and permits execution to resume in the existing Issue lane.

Record the selected Issue worktree and topic branch identities once and run a cheap relevant baseline check.

## Implement and verify

Trace the real behavior and highest practical verification seam. Use TDD when a focused behavioral test can capture the change. Commit coherent verified slices on the topic branch.

Expected paths and symbols are non-exhaustive planning evidence, not an allowlist:

- Include a **Necessary discovery** automatically when source evidence proves it is required by an existing plan step and unchanged Acceptance Criterion.
- Record a concise **Material plan deviation** and covered `AC-n` when the implementation path changes but behavior and Acceptance Criteria do not.
- A **Scope change** to behavior, Acceptance Criteria, target, exclusions, independent outcomes, or ownership stops and returns to planning.

Run affected verification after each slice or repair. Before review, run the Issue's required final verification, including focused checks, typechecking where configured, and the repository-required full suite. Record exact commands and results.

If implementation evidence reveals a **Late prerequisite discovery**, stop before prerequisite-dependent verification. Preserve coherent checkpoint commits and record/read back `implementation_blocked` once with the exact artifact path. With unchanged Acceptance Criteria and approved schema outcome, instruct the human to invoke `/pre-execute-issue <Issue-ID> <artifact-path>`; after its matching attestation, resume the same worktree and candidate lane. Changed behavior, acceptance, target, exclusions, or ownership is a Scope change that returns to `/to-spec` or `/to-tickets`. Never auto-invoke, execute the artifact, roll back, or silently expand scope.

## Review and repair

Commit the candidate and invoke Matt `code-review` against the recorded baseline and Issue or linked Spec. Require both independent axes to be clean:

- **Standards:** repository instructions and documented standards are satisfied.
- **Spec:** every Acceptance Criterion and exclusion is satisfied without scope creep.

Confirm findings against source, tests, and the Spec. Fix every confirmed in-scope finding, run affected verification, commit the repair, and rerun the full two-axis review. Allow at most 10 repair waves per invocation; a wave counts only when code repair begins. Tool failures, duplicates, and unsupported findings do not count. If wave 10 remains unclean, preserve the latest verified commit, publish the blocked terminal state above, and leave the Issue open.

## Completion note

Rerun required final verification. Declare `implementation_complete` only when final verification passes, Standards and Spec are clean, the Issue worktree is clean, and its `HEAD` equals the reviewed candidate.

Write one compact tracker completion note containing:

- Issue and linked Spec; Issue target branch/worktree, topic branch/worktree, baseline, and final candidate;
- Planning Seal SHA/state (`created`, `reused`, `successor`, or `not-applicable`);
- `manualAttestations`: every consumed `manual_prerequisite_complete:v1` artifact path, or an empty list;
- `standards: clean`, `spec: clean`, exact verification commands/results, repair-wave count, and any Material plan deviations;
- `worktree: clean` and `implementation_complete`.

Read the note back once and stop. Later movement of the Issue target branch does not change this state. Execution never integrates the target, removes a worktree, closes the Issue, pushes, or deploys; the human or a coordinator holding the same valid DAG Run Grant separately invokes `/close-issue`.
