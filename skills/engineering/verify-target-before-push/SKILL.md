---
name: verify-target-before-push
description: Verify one exact local-ahead or already-pushed target range from completion-note contributions without pushing.
disable-model-invocation: true
---

# Verify Target Before Push

Verify one frozen target range after Issue closeout. This skill has two evidence modes, **local-ahead** and **already-pushed**. Both run the same aggregate review and verification gate; only local-ahead may emit push readiness. This skill never repairs product code, closes or reopens Issues, changes other tracker state, pushes, remote-merges, or deploys.

## Freeze exact `B` and `V`

Read repository instructions and tracker configuration, resolve exact commits, and select one mode without fallback or inference:

- **Local-ahead:** when the human names a local Issue target branch without an explicit comparison, resolve its unique configured upstream tracking tip as baseline `B` and its local `HEAD` as target `V`. Require `B` to be an ancestor of `V` and the selected `B..V` commit range to be non-empty. A missing or ambiguous upstream, detached target, empty range, or any need to guess `B` stops before review.
- **Already-pushed:** require an explicit merge request, pull request, or exact base/head range. Resolve its exact base as `B` and head as `V`, require both commits locally and `B` to be an ancestor of `V`, and bind the result to that immutable comparison. Never guess a post-push baseline from a branch, remote, merge message, or current checkout.

Capture the mode, target identity, `B`, and `V` once. Create a clean verification worktree at exact `V`; never clean or reuse a dirty target worktree. A ref or worktree identity mismatch stops.

## Derive the Target verification set

Query open and closed Issues whose ordered history contains an Execution completion note naming this exact Issue target. Read each history once. Select the latest valid `implementation_complete` note; a later state supersedes it only when read-back evidence invalidates that candidate's implementation, Standards or Spec review, or verification. Target movement, close conflict, partial close progress, and an aggregate-gate failure do not supersede completion.

Execution completion notes are the sole Issue-to-commit mapping authority. Derive membership only from their exact candidates and Git ancestry:

- candidate `C` reachable from `V` but not from `B` is a member;
- candidate reachable from `B` belongs to the baseline and is not a member;
- an open unreachable candidate is concurrent work outside this range;
- a closed unreachable candidate is contradictory delivery evidence and stops;
- a reachable member whose Issue is open also stops before review.

For every member require exact Issue, parent or linked Spec, Issue target branch, Execution baseline, candidate `C`, Planning Seal or prerequisite identities, recorded verification commands, and a closed tracker state. Require `C` to exist locally and remain an ancestor of `V`. Missing, unreadable, duplicate, ambiguous, mismatched, or candidate-invalidating evidence stops without substitution.

Do not use a closeout receipt, integration candidate, commit-message Issue identity, merge-message parsing, or a manually repeated Issue list. Freeze the member set before review.

## Prove selected-range coverage

Enumerate every material commit in `B..V`. Explain each one through at least one of these exact, read-back sources:

- a member's Execution baseline-to-candidate contribution;
- a referenced Planning Seal or prerequisite commit;
- necessary merge topology connecting otherwise covered histories.

Issue contributions are many-to-many: overlapping contribution ranges are valid and require no unique owner. A commit with no valid explanation stops before aggregate review. Never infer ownership from commit or merge messages, and never accept an unexplained material commit.

## Run one aggregate gate

Invoke Matt `code-review` on committed diff `B...V`. Run the Standards axis against the aggregate diff and the Spec axis against every member Issue plus every parent or linked Spec. Both axes must be clean.

Collect the focused verification commands recorded by member completion notes, deduplicate exact commands, and run that focused set in the clean verification worktree at exact `V`. Then run the repository-required full suite exactly once at exact `V`. Require every command to pass and the verification worktree to remain clean.

This is a gate, not a repair loop. Any identity, coverage, review, verification, target, or cleanliness failure withholds a result and reports exact evidence without changing product code or tracker state. It never automatically invokes `execute-issue`, `close-issue`, or another verification run.

## Return the mode-specific result

Immediately re-read all selected refs and require the frozen `B` and `V` to be unchanged. Re-prove every member candidate reachable and every member Issue closed.

- **Local-ahead:** write one local Git note under `refs/notes/matt-push-ready` on exact `V`. The human-readable `push_ready:v1` record binds mode, target, `B`, `V`, member Issue and candidate identities, coverage evidence, both clean review axes, exact commands and results, and clean verification worktree. Read it back once and require every field to match. Reuse an exact matching note on retry; never overwrite mismatched evidence. Target movement invalidates this aggregate evidence and requires this skill again, never `execute-issue`.
- **Already-pushed:** return one read-only **Range verification result** binding the explicit merge request, pull request, or base/head source, exact `B`, `V`, members, coverage, reviews, commands, and results. Never write `push_ready`, a Git note, or retroactive push authorization for this mode.

Remove only the clean temporary verification worktree after result read-back or construction. Push remains a separate explicit action and must require a current matching `push_ready:v1` note on the exact local target `HEAD`.

## Failure ownership

Failure never rolls back integrations or automatically repairs, reruns, closes, or reopens an Issue. Product correction requires explicit ownership and the normal planning, execution, closeout, and fresh aggregate-verification flow.
