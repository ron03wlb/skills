---
name: pre-execute-issue
description: Prepare and attest one exact declared Issue prerequisite. Use when a human invokes it directly or an active `execute-issue` lane hands off the same unresolved Manual prerequisite.
---

# Pre-Execute Issue

Resolve one exact Manual prerequisite, establish its content identity, and record the human-reported outcome. Never perform the external prerequisite.

## Accept one exact entry

Entry is either a direct `/pre-execute-issue <Issue-ID>` invocation or an active `execute-issue` handoff that already binds the exact caller lane and approved scope. Read the exact Issue, linked Spec, ordered comments, published classification, blockers, Planning Seal, and recorded target.

From the Issue or linked Spec, resolve only one exact declared normalized repository-relative artifact, or accept one exact unchanged-scope late discovery from the active handoff. The late-discovery packet must preserve behavior, Acceptance Criteria, target, exclusions, schema outcome, and ownership.

No declaration skips this workflow without a write or worktree; arbitrary `.sql` files and repository scanning never trigger it. Missing, multiple, ambiguous, or contradictory declaration or ownership evidence stops without worktree creation or tracker mutation. Never guess a path, dialect, target, or owner.

## Reconcile the Issue worktree

Derive the recorded Issue target from tracker evidence, not the current checkout. Reconcile exactly one unique Issue topic branch and Issue worktree using the repository's established Issue-worktree convention. An active handoff must reuse its exact branch and worktree; it never creates a second lane. A direct invocation may create the one pair from the current recorded target when neither exists.

Create or reuse only that exact pair. Dirty, mismatched, multiply registered, ambiguous, or ambiguously owned branch or worktree state stops without cleanup or unrelated mutation. Never stash, reset, move, delete, or repair existing state. Record the target baseline, topic branch, worktree path, and current checkpoint once.

## Resolve the Prerequisite candidate

On retry, inspect the ordered Issue history before any new preparation or presentation. When one existing `manual_prerequisite_complete:v2` matches the declared path, verify its exact candidate, blob, outcome, worktree, branch, and target/checkpoint ancestry; reuse the attestation and continue only to the caller boundary. Never prepare or present the already-attested content again. Multiple or conflicting matches stop. An exact path-bound legacy v1 may be reused only when no generated Prerequisite candidate exists for that artifact; never upgrade or apply it to generated content.

Reuse an artifact as a matching clean valid **Prerequisite candidate** only when one read-back packet supplies its full candidate commit, exact Git blob, normalized repository-relative path, passing deterministic validation, and clean Standards and Spec review evidence. Verify that Git contains the commit and blob, the candidate contains the recorded target baseline and any active-lane checkpoint, the exact worktree is clean at that candidate, and the declared path resolves to that blob. Missing review or validation evidence is not reconstructed from filenames, commit messages, or prose.

Otherwise invoke the model-invoked `prepare-prerequisite-artifact` skill with the exact Issue, linked Spec, target, worktree, topic branch, unchanged scope, checkpoint, and declared artifact. Accept its return only when a fresh read-back proves the matching candidate, blob, path, validation, clean review, worktree, branch, and ancestry evidence. Any drift or mismatch stops without accepting readiness.

Present the committed primary **Operator SQL**, candidate, blob, and repository-relative path to the human for execution. Never execute or replay it, connect to a database, run recovery or cleanup, retry a failure, collect credentials, or invent external-state proof.

## Record one content-bound outcome

Accept exactly `APPLIED` or `NO_OP` as a successful human-reported outcome. A generic success statement receives one focused clarification asking which of those two values the Operator SQL emitted.

Search the Issue comments for an exact `manual_prerequisite_complete:v2` with the same Issue, candidate, blob, normalized artifact path, and outcome. Reuse the exact match without writing a duplicate. A conflicting content identity or outcome stops as ambiguous tracker state.

Otherwise append this minimal tracker note and read it back once:

```text
manual_prerequisite_complete:v2
issue: <Issue-ID>
candidate: <full-prerequisite-candidate-SHA>
blob: <full-Git-blob-SHA>
artifact: <repository-relative-path>
outcome: <APPLIED|NO_OP>
attested_by: human
```

The tracker supplies author and timestamp. Do not add credentials, target details, artifact contents, query output, a duplicate digest, or invented verification claims. Legacy `manual_prerequisite_complete:v1` notes remain readable only for their exact path-bound legacy artifact; they cannot authorize a newly generated Prerequisite candidate.

An error, SQL failure, missing outcome, or any other value produces no attestation, no resume, and no automatic retry or rollback. Report the error text and stop; read-only diagnosis and any corrected candidate require separate authority.

Tracker write or read-back failure is unresolved persistence: report it and never claim the attestation was recorded or the lane may continue.

## Stop or return to the caller

A direct invocation must stop after exact attestation read-back and grants no implementation authority. Report the Issue, candidate, blob, artifact, and outcome, then tell the human that `/execute-issue <Issue-ID>` is a separate action.

For an active handoff, return only to the same authorized execution lane after a fresh read proves the Issue, linked Spec, target, declared artifact, candidate, blob, topic branch, worktree, blocker state, approved scope, and candidate/checkpoint/target ancestry are unchanged. The original direct-human authority or exact DAG Run Grant must still bind that lane; this skill creates no execution authority.

Never implement the Issue, integrate the target, close an Issue, push, deploy, broaden the artifact, perform external cleanup, mutate a database, or change any unrelated tracker or Git state.
