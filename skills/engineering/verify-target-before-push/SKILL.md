---
name: verify-target-before-push
description: Verify one exact local-ahead or already-pushed target range, with confirmation-gated direct-contribution and closed-Issue recovery, without pushing.
disable-model-invocation: true
---

# Verify Target Before Push

Verify one frozen target range after Issue closeout. This skill has two evidence modes, **local-ahead** and **already-pushed**. Both run the same aggregate review and verification gate; only local-ahead may emit push readiness. Its only tracker-write recoveries are the exact human-confirmed Direct target contribution and closed-Issue evidence paths below. This skill never repairs product code, closes or reopens Issues, changes other tracker state, pushes, remote-merges, or deploys.

## Freeze exact `B` and `V`

Read repository instructions and tracker configuration, resolve exact commits, and select one mode without fallback or inference:

- **Local-ahead:** when the human names a local Issue target branch without an explicit comparison, resolve its unique configured upstream tracking tip as baseline `B` and its local `HEAD` as target `V`. Require `B` to be an ancestor of `V` and the selected `B..V` commit range to be non-empty. A missing or ambiguous upstream, detached target, empty range, or any need to guess `B` stops before review.
- **Already-pushed:** require an explicit merge request, pull request, or exact base/head range. Resolve its exact base as `B` and head as `V`, require both commits locally and `B` to be an ancestor of `V`, and bind the result to that immutable comparison. Never guess a post-push baseline from a branch, remote, merge message, or current checkout.

Capture the mode, target identity, `B`, and `V` once. Create a clean verification worktree at exact `V`; never clean or reuse a dirty target worktree. A ref or worktree identity mismatch stops.

## Derive the Target verification set

Query open and closed Issues whose ordered history contains an Execution completion note, `closed_issue_evidence_reconciliation:v1` record, or `direct_target_contribution:v1` record. Read each history once without pre-filtering by Issue target. Select the latest structurally readable `implementation_complete` note; a later state supersedes it only when read-back evidence invalidates that candidate's implementation, Standards or Spec review, or verification. Target movement, close conflict, partial close progress, and an aggregate-gate failure do not supersede completion. Defer only the one narrow non-passing-command decision described below; no other invalid completion becomes selectable.

Execution completion notes are the sole Issue-to-commit mapping authority. Derive membership only from their exact candidates and Git ancestry:

- candidate `C` reachable from `V` but not from `B` is a member;
- candidate reachable from `B` belongs to the baseline and is not a member;
- an open unreachable candidate is concurrent work outside this range;
- a closed unreachable candidate is contradictory delivery evidence and stops;
- a reachable member whose Issue is open also stops before review.

## Recover one closed historical completion-evidence failure

After freezing the candidate-derived member set and before ordinary completion-evidence rejection, consider recovery only when exactly one member is one closed affected Issue. Require its sole immutable completion note to be otherwise valid with exactly one non-passing command, its candidate reachable from `V` but not reachable from `B`, and its recorded exact Issue worktree absent from current worktree registration and disk. A later valid completion, other invalidating evidence, open Issue, registered worktree or present worktree path, coverage failure, Standards or Spec review failure, or additional historical failure makes reconciliation ineligible and stops with no tracker mutation.

In clean temporary worktrees at the exact affected execution baseline and candidate, rerun the exact failed command read-only. Build both Reconciliation diagnostic fingerprints from the exact command, exit code, failure count, ordered failure identities, source locators, and assertion or error identities. Require an identical diagnostic fingerprint at both commits and no additional candidate failure. Remove only those clean diagnostic worktrees after the comparison.

Discover remedy evidence from immutable tracker history and Git, never from a human cause assertion or coincidental current-target pass. Require exactly one closed remedy Issue whose published scope and delivered diff explicitly own the complete correction, whose valid passing completion is immutable, and whose target matches the affected Issue. Require both candidates to exist locally and remain reachable from `V`; neither must descend from the other. The original affected and remedy completion notes and both Issue states remain immutable.

Read the affected Issue's complete history for `closed_issue_evidence_reconciliation:v1`. Reuse one exact matching record without invoking the helper or writing a duplicate. A malformed, duplicate, edited, conflicting, drifting, unavailable, partial, or ambiguous plausible record stops without writing, repair, or inference.

If there is no exact record, present the complete reconciliation packet: affected Issue and completion identity, target, execution baseline, candidate, complete diagnostic fingerprint, remedy Issue and completion identity, remedy candidate, and the complete tracker comment draft. No write occurs until the human confirms that exact packet once. Confirmation authorizes only the exact immutable record and fresh exact-target verification; it does not waive the failed command or authorize review, readiness, push, Issue edits, or completion edits.

Immediately before mutation, re-read both Issues and completions, resolve the target and both candidates again, recheck worktree absence, rerun or revalidate the exact diagnostics, and require the confirmed draft unchanged. Any identity, state, scope, ref, reachability, worktree, diagnostic, eligibility, authority, or draft drift stops without writing. Then invoke the model-invoked `/record-closed-issue-reconciliation` skill with the exact confirmed packet without requiring a separate manual slash command. Never invoke `attest-target-contribution` for this recovery.

After exact record read-back, discard the stopped gate completely and automatically start a fresh `/verify-target-before-push` from Entry. Re-freeze mode, target, `B`, `V`, tracker histories, members, contribution evidence, and reconciliation records. Never resume the earlier gate or carry forward its review, verification, cleanliness, or ref-stability evidence.

For every member require the completion note's exact Issue identity, parent or linked Spec, Issue target branch, topic branch and worktree, Execution baseline, candidate `C`, Planning Seal, `manualAttestations` artifact paths including an empty list when none were consumed, Standards and Spec review identities and clean results, verification identity, exact commands, and a closed tracker state. Ordinary members require passing results. The one affected member carrying the exact record has the same requirements except that its exact recorded command remains historically non-passing; reconciliation admits that member only to fresh verification and does not rewrite the completion. Require every recorded review and verification candidate identity to bind exact `C`; require `C` to exist locally and remain an ancestor of `V`. Missing, unreadable, duplicate, ambiguous, mismatched, or candidate-invalidating evidence stops without substitution.

Before interpreting an absent field, inspect the parent or linked Spec for the logical `workflow_artifacts_contract_adopted:v1` record that exactly matches the completion's repository, tracker, Spec, and Issue target branch. Collapse multiple payload-identical physical records into one logical adoption. Validate its explicit `legacyCompletionFrontier`, including an empty list: every unique entry must bind one exact Issue, tracker-native immutable completion-note identity when available or durable local record locator, and SHA-256 of the exact note body. Do not compare order across parent and child histories. When the scope is adopted, a completion without `workflowArtifacts` remains legacy only if its exact identity and body digest occur in that frozen frontier; otherwise verification must stop. Missing, duplicate, malformed, unreadable, or digest-mismatched frontier evidence stops. A scope with no adoption record remains readable as legacy under its original contract; never retrofit it. Malformed, mismatched, unreadable, or payload-conflicting adoption records plausibly bound to the same repository, tracker, and Spec stop, while a well-formed record for another exact scope does not classify this one.

Determine plausible binding from the record kind and its physical parent or linked-Spec tracker location before validating payload scope fields. Never filter out a malformed record by a repository, tracker, Spec, or target field that the record itself is required to prove.

When a completion note contains `workflowArtifacts`, validate its explicit list. Every entry requires one unique repository-relative path (`path`), truthful requirement source (`requirementSource`), and purpose (`purpose`); the path must be changed inside the exact execution-baseline-to-candidate contribution and bound to that candidate's clean Standards and Spec review. Reject false sources plus runtime, public-contract, routing, Acceptance Criteria, governance, arbitrary, ambiguous, or unowned material scope.

`workflowArtifacts` supplies scope classification only, never contribution coverage or verification authority. Every declared workflow artifact remains visible to Standards review, Spec review, selected-range coverage, focused verification, the repository full suite, cleanliness, and ref-stability checks.

The Spec-scoped adoption record is compatibility evidence only and grants no implementation, review, coverage, verification, close, push, or deployment authority.

Do not use a closeout receipt, integration candidate, commit-message Issue identity, merge-message parsing, or a manually repeated Issue list. Freeze the member set before review.

## Prove selected-range coverage

Enumerate every material commit in `B..V`. Explain each one through at least one of these exact, read-back sources:

- a member's Execution baseline-to-candidate contribution;
- a referenced Planning Seal;
- necessary merge topology connecting otherwise covered histories; or
- a valid Direct target contribution record.

For every `direct_target_contribution:v1` record, validate its exact tracker location, owner scope, target, ordered full SHAs, Git ancestry, current whole-commit diff, fixed classification, human attestation, target-range-only statement, and strict eligibility. The owning Tracker Specs or Issues join the aggregate Spec review. A malformed, duplicate, conflicting, mismatched, unavailable, partially written, unreachable, ineligible, or ambiguously owned record stops without substitution.

Issue contributions are many-to-many: overlapping contribution ranges are valid and require no unique owner. A declared workflow artifact changed inside a member's exact contribution uses that ordinary member contribution as its coverage source; the declaration adds no fifth source. A commit with no valid explanation stops before aggregate review. Never infer ownership from commit or merge messages, and never accept an unexplained material commit.

## Recover eligible uncovered contributions

Recovery is considered only when the frozen selected-range coverage check finds uncovered material commits. First discover any exact matching `direct_target_contribution:v1` records and reuse them as the fourth selected-range coverage source without invoking `/attest-target-contribution` or writing a duplicate.

Every remaining uncovered commit must contain only explicit human-directed, non-product workflow or governance maintenance outside an Executable Issue by design and have one unambiguous owning Tracker Spec or Issue. Active skill behavior, runtime or source, tests, configuration, dependencies, migrations, security, data, public APIs, any mixed commit, partial-path attestation, or owner ambiguity is ineligible. A non-coverage failure — including review, test, cleanliness, ref, tracker, normal execution, or closeout failure — performs no tracker mutation in this Direct target contribution path. The sole historical completion-evidence exception is the separately proved closed-Issue reconciliation path above.

When and only when every uncovered commit is eligible, prepare and present the exact owner, target, fixed classification, ordered full commit SHAs, per-commit purposes, and complete tracker comment draft for every owner-target group. No write occurs until the human confirms that exact draft once. Confirmation authorizes only those exact records; it does not waive this gate or authorize review, readiness, or push.

Immediately before mutation, re-read the owner and refs and revalidate owner, target, commit, whole diff, eligibility, and ref identity. Any owner, target, commit, diff, eligibility, or ref drift before mutation stops without writing or silently broadening the confirmation.

After confirmation, invoke the model-invoked `/attest-target-contribution` skill with the exact confirmed packet without requiring a separate manual slash command. Require every reused or appended record to receive exact read-back. A malformed, duplicate, conflicting, mismatched, unavailable, or partially written record stops; never edit tracker history, continue with a subset, or manufacture replacement authority.

After exact record read-back, discard the failed gate completely and automatically start a fresh `/verify-target-before-push` from Entry. Re-freeze all refs and identities, rebuild members and direct contributions, and revalidate every record against its exact tracker location, owner scope, target, full SHAs, Git ancestry, current diff, and strict eligibility. Never resume from the earlier coverage point or carry forward its review, verification, cleanliness, or ref-stability evidence.

## Run one aggregate gate

Before review, validate every accepted reconciliation record at its exact affected-Issue tracker location. Re-read the affected and remedy immutable completion identities, require the record's exact affected, diagnostic, remedy, `authorized_by`, and statement fields, and reject extra fields. For each reconciliation record, require the affected and remedy candidates reachable from current `V`, the affected candidate not reachable from current `B`, the exact diagnostic still bound to current target verification evidence, and the remedy completion valid and passing. A record grants conditional membership only; it is never a fifth coverage source or verification result.

Invoke Matt `code-review` on committed diff `B...V`. Run the Standards axis against the aggregate diff and every member's declared workflow-artifact requirement sources; run the Spec axis against every member Issue, every parent or linked Spec, every declared workflow artifact, every affected and remedy Issue for accepted reconciliation records, and every owning Tracker Spec or Issue for accepted Direct target contributions. Keep the axes separate and use the shared evidence classification. A **Code review advisory** remains visible but does not block the gate, trigger repair, consume a repair wave, or create waiver authority. Only a Coordinator-verified **Confirmed code review finding** backed by exact repository or Spec evidence withholds push readiness.

For every Confirmed code review finding, report its exact evidence, affected Issue and Spec identities, and the same target branch. The default correction owner is a new human-created **Aggregate repair Issue** on that target. This verifier never creates or executes an Aggregate repair Issue, repairs product code, reopens an earlier Issue, or edits an immutable completion note.

Collect the focused verification commands recorded by member completion notes with their exact Issue and candidate origins, then deduplicate exact commands. Every command remains applicable at exact `V` unless it has valid **Successor verification evidence**. That evidence is allowed only for a path-specific command when one later member candidate descends from every earlier candidate that recorded the command, the later Issue Acceptance Criteria explicitly retire every repository path required by the command, its completion evidence records those paths absent and identifies passing current-behavior commands, every identified current-behavior command remains applicable and is included in the focused set, and every retired path remains absent at `V`.

Missing or ambiguous path extraction, partial retirement or ownership, inferred deletion or rename, absent descendant ancestry, missing absence or current-behavior proof, multiple possible successors, or a non-path-specific command stops without substitution. Never classify an arbitrary failed command as retired, edit an earlier completion note, restore a retired path, or use successor evidence to waive any member, contribution, review, full-suite, target, or cleanliness requirement.

Record each accepted disposition with the exact superseded command, earlier Issue and candidate identities, retired paths, successor Issue and candidate, Acceptance Criteria, absence proof, and current-behavior commands and results. Collect every exact command from every ordinary member and affected member carrying an exact reconciliation record, preserving Issue and candidate origins, then deduplicate exact strings. Identify the repository-required full-suite command before execution: if any completion also records that exact command, remove its focused duplicate. Run every remaining deduplicated focused command in the clean verification worktree at exact `V`, then run the repository-required full suite exactly once at exact `V`. A duplicate full-suite command runs once, never once per completion plus once as the aggregate suite. Require every executed command to pass and the verification worktree to remain clean.

This is a gate, not a repair loop. Both evidence modes retain all Standards, focused, full-suite, cleanliness, ref-stability, and result-separation requirements. Any identity, coverage, review, verification, target, or cleanliness failure withholds a result and reports exact evidence without changing product code or tracker state. Outside the exact confirmed recovery above, it never automatically invokes `execute-issue`, `close-issue`, or another verification run.

## Return the mode-specific result

Immediately re-read all selected refs and require the frozen `B` and `V` to be unchanged. Re-prove every member candidate reachable and every member Issue closed.

- **Local-ahead:** only a completely passing local-ahead fresh gate may write one local Git note under `refs/notes/matt-push-ready` on exact `V`. The human-readable `push_ready:v1` record binds mode, target, `B`, `V`, member Issue and candidate identities, reconciliation and Direct target contribution record identities, coverage evidence, both clean review axes, exact executed commands and results, every superseded command and its exact successor proof, and clean verification worktree. Read it back once and require every field to match. Reuse an exact matching note on retry; never overwrite mismatched evidence. Target movement invalidates this aggregate evidence and requires this skill again, never `execute-issue`.
- **Already-pushed:** return one read-only **Range verification result** binding the explicit merge request, pull request, or base/head source, exact `B`, `V`, members, reconciliation records, coverage, reviews, exact executed commands and results, and every superseded command with its exact successor proof. Never write `push_ready`, a Git note, or retroactive push authorization for this mode.

Remove only the clean temporary verification worktree after result read-back or construction. Push remains a separate explicit action and must require a current matching `push_ready:v1` note on the exact local target `HEAD`.

Neither helper nor either recovery pushes. Reconciliation never reopens an Issue, edits or replaces a completion note, invokes `attest-target-contribution`, runs aggregate verification inside the helper, or claims readiness. Never add a generic attestation framework, SHA allowlist, partial-path exception, or verifier-owned authority source.

## Failure ownership

Failure never rolls back integrations or automatically repairs, reruns, closes, or reopens an Issue. A Confirmed aggregate finding withholds the result and reports the exact finding, affected Issue and Spec identities, and same target branch; its default correction owner is a new human-created Aggregate repair Issue. The verifier never creates or executes that Issue, repairs product code, reopens an earlier Issue, or edits an immutable completion note. Product correction requires explicit human ownership and the normal planning, execution, closeout, and fresh aggregate-verification flow.
