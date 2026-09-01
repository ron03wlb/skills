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

Capture the exact local branch that will own the Issue worktree as the Issue target branch and its current `HEAD` once as the execution baseline before any prerequisite handoff. That recorded branch is the only default merge destination. After prerequisite routing, record the selected Issue worktree and topic branch identities once; reuse an exact worktree created or reused by `pre-execute-issue` instead of creating a second lane. Preserve unrelated work and do not repeatedly re-confirm unchanged identities. Any number of Issue worktrees may execute concurrently against the same recorded target.

Require any Planning Seal to exist locally and be an ancestor of the execution baseline. Perform a seal-currency check: the target must have no uncommitted planning-artifact delta owned by this Issue or Spec. This check is not scope authority. Missing, stale, unreachable, or ambiguously owned planning evidence stops; tell the human to invoke `/to-spec` or `/to-tickets`.

`execute-issue` never creates or repairs a Planning Seal, stages target planning artifacts, or edits the parent to make validation pass. An older Issue without a Planning baseline may use `not-applicable` only when no relevant planning artifact needs sealing.

### Manual prerequisite attestation

At Entry, inspect the published Issue, linked Spec, and ordered comments for an exact repository-relative artifact declared as a human-executed or human-applied Manual prerequisite. No declared Manual prerequisite preserves ordinary Issue execution. Arbitrary `.sql` files, undeclared paths, and repository scanning never trigger prerequisite routing.

Resolve at most one exact declaration. Missing path identity, multiple declarations, ambiguous ownership, conflicting Issue or Spec evidence, and changed-scope declarations stop without guessed selection, worktree cleanup, tracker repair, or artifact preparation.

For one exact declared artifact, first search the ordered history for a matching successful attestation. A `manual_prerequisite_complete:v2` is valid only when its tracker-native immutable identity and exact Issue, Prerequisite candidate, Git blob, normalized artifact path, and `APPLIED` or `NO_OP` outcome read back unchanged. Require that candidate and blob to exist locally, that the path at the candidate resolves to the blob, and later require that candidate to be an ancestor of the final implementation candidate. A legacy `manual_prerequisite_complete:v1` may authorize only its exact path-bound legacy non-generated artifact; it cannot authorize generated content or substitute for an existing Prerequisite candidate.

When one exact declared artifact has no matching valid attestation, invoke the model-invoked `pre-execute-issue` skill in the same direct-human or DAG-authorized lane. Pass the unchanged lane authority, exact Issue and linked Spec, recorded target and execution baseline, approved scope, declaration, and any already-selected branch or worktree identity. Never stop merely to ask for a second slash command, write a prerequisite-only `implementation_blocked` note, execute the artifact, or broaden the Grant.

After exact attestation read-back returns control, independently re-read the original direct-human authority or exact DAG Run Grant and freshly validate the Issue, linked Spec, target, Planning Seal, Prerequisite candidate, blob, artifact, outcome, topic branch, worktree, blockers, scope, and ancestry. Return only to the original lane. Reuse the same Issue topic branch and worktree, require the Prerequisite candidate to remain an ancestor of the final implementation candidate, and run the cheap relevant baseline check there. Any drift or a direct `pre-execute-issue` invocation without this active caller stops without implementation.

## Implement and verify

Trace the real behavior and highest practical verification seam. Use TDD when a focused behavioral test can capture the change. Commit coherent verified slices on the topic branch.

Expected paths and symbols are non-exhaustive planning evidence, not an allowlist:

- Include a **Necessary discovery** automatically when source evidence proves it is required by an existing plan step and unchanged Acceptance Criterion.
- Record a concise **Material plan deviation** and covered `AC-n` when the implementation path changes but behavior and Acceptance Criteria do not.
- A **Scope change** to behavior, Acceptance Criteria, target, exclusions, independent outcomes, or ownership stops and returns to planning.

Before review, prepare the prospective `workflowArtifacts` declaration for this attempt. Use an explicit empty list when there are none; otherwise give each entry one exact repository-relative path (`path`), truthful requirement source (`requirementSource`), and concise purpose (`purpose`). Every declared path must be unique and changed inside the exact Execution baseline-to-candidate diff. It is eligible only when repository or skill instructions required that non-contract plan, execution log, or equivalent artifact inside this Issue worktree.

Classification is behavioral, never extension-based. Runtime, public-contract, routing, Acceptance Criteria, governance, arbitrary, ambiguous, falsely sourced, or unowned documentation remains ordinary material scope and cannot enter `workflowArtifacts`. For each declared path, verify its Execution baseline-to-candidate diff ownership, then pass the prospective declaration to `code-review` so both axes inspect the artifact and its claimed requirement. A missing or false declaration is an in-scope review finding; changed behavior or ownership remains a Scope change.

The declaration supplies scope classification only. It never supplies Issue-to-candidate mapping, contribution coverage, review, verification authority, or an exemption from focused verification, the repository full suite, cleanliness, or ref stability.

Run affected verification after each slice or repair. Before review, run the Issue's required final verification, including focused checks, typechecking where configured, and the repository-required full suite. Record exact commands and results.

If implementation evidence reveals a **Late prerequisite discovery**, stop before prerequisite-dependent verification and preserve coherent checkpoint commits in the existing Issue worktree. When behavior, Acceptance Criteria, target, exclusions, schema outcome, and ownership remain unchanged, bind the one exact discovered artifact as a Necessary discovery and automatically invoke `pre-execute-issue` in the same active lane. After exact attestation read-back, repeat the fresh authority, identity, worktree, blocker, scope, and ancestry checks above and continue from the same branch. A change to any of those scope dimensions is a Scope change that returns to `/to-spec` or `/to-tickets` without artifact preparation or silent expansion. Never execute the artifact, run recovery, roll back external state, create a second lane, or convert failure into an attestation.

## Review and repair

Commit the candidate and invoke Matt `code-review` against the recorded baseline and Issue or linked Spec. Keep its Standards and Spec axes separate and apply its shared evidence classification. Require both axes to contain no Confirmed code review finding before treating them as clean:

- **Standards:** no exact repository evidence proves a violation of repository instructions or documented standards.
- **Spec:** no exact Spec evidence proves an Acceptance Criterion, exclusion, or scope mismatch.

Confirm observations against source, tests, repository standards, and the Spec. Each Code review advisory remains visible; collectively, Code review advisories do not fail execution, trigger repair, consume a repair wave, or create durable waiver state. Fix every Confirmed code review finding that is in scope, run affected verification, commit the repair, and rerun the full two-axis review. Allow at most 10 repair waves per invocation; a wave counts only when code repair begins. Tool failures, duplicates, and smells, preferences, or suggestions that lack exact governing evidence remain advisories and do not count; when exact evidence proves a violation, the observation is a Confirmed code review finding. If wave 10 remains unclean, preserve the latest verified commit, publish the blocked terminal state above, and leave the Issue open.

## Completion note

Rerun required final verification. Declare `implementation_complete` only when final verification passes, Standards and Spec are clean, the Issue worktree is clean, and its `HEAD` equals the reviewed candidate. Re-read every consumed Manual execution attestation and require each v2 Prerequisite candidate to remain an ancestor of that final candidate; missing, conflicting, edited, unreachable, or path/blob-mismatched evidence stops completion.

Before the first prospective completion under an exact repository, tracker, parent or linked Spec, and Issue target branch, inspect that Spec and its exact child histories, including local-file tracker histories, for one logical `workflow_artifacts_contract_adopted:v1` record. If none exists, freeze every already read-back valid completion without `workflowArtifacts` into `legacyCompletionFrontier`, then append one durable adoption record binding the exact four scope identities plus that explicit list, including an empty list. Each frontier entry binds the exact Issue, tracker-native immutable completion-note identity when available or durable local record locator, and SHA-256 of the exact note body. Read the adoption back once; otherwise reuse the existing logical record. Do not infer order across parent and child histories: after adoption, a completion without `workflowArtifacts` is legacy only when its exact identity and body digest occur in the frozen frontier. Missing, duplicate, malformed, mismatched, unreadable, or digest-mismatched frontier evidence stops.

Concurrent first completions may publish multiple payload-identical physical adoption records; collapse them idempotently into one logical record and never append another after any exact payload is visible. Malformed, mismatched, unreadable, or payload-conflicting adoption records plausibly bound to the same repository, tracker, and Spec stop without writing completion; write or read-back uncertainty reports unresolved tracker ambiguity. A scope with no adoption record remains legacy-compatible. Never add a completion to the frontier retroactively. The record is compatibility evidence only and grants no implementation, review, coverage, verification, close, push, or deployment authority.

Determine plausible binding from the record kind and its physical parent or linked-Spec tracker location before validating payload scope fields. Never filter out a malformed record by a repository, tracker, Spec, or target field that the record itself is required to prove.

Write one compact tracker completion note containing:

- Issue and linked Spec; Issue target branch/worktree, topic branch/worktree, baseline, and final candidate;
- Planning Seal SHA/state (`created`, `reused`, `successor`, or `not-applicable`);
- `manualAttestations`: every consumed attestation, or an explicit empty list. A v2 entry records `kind: manual_prerequisite_complete:v2`, its tracker-native immutable identity, Issue, Prerequisite candidate, Git blob, artifact, and outcome; a v1 entry records its immutable identity, Issue, and exact legacy non-generated artifact path. Never degrade v2 to a path string or infer a missing field;
- `workflowArtifacts`: the reviewed prospective entries with exact `path`, `requirementSource`, and `purpose`, or an explicit empty list;
- `standards: clean`, `spec: clean`, exact verification commands/results, repair-wave count, and any Material plan deviations;
- `worktree: clean` and `implementation_complete`.

Read the note back once and stop. Later movement of the Issue target branch does not change this state. Execution never integrates the target, removes a worktree, closes the Issue, pushes, or deploys; the human or a coordinator holding the same valid DAG Run Grant separately invokes `/close-issue`.
