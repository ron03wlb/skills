---
name: pre-execute-issue
description: Inspect, prepare, and verify one repository-declared prerequisite before Issue execution.
disable-model-invocation: true
---

# Pre-Execute Issue

Inspect one fully published Tracker Spec or dependency-ready child Issue for a repository-owned prerequisite. This optional user-invoked workflow ends as `NOT_REQUIRED`, `WAITING_MANUAL`, `READY`, or transient `BLOCKED`; it never implements the remaining Issue.

## Entry and discovery

Read the exact Issue, linked parent or Spec, comments, Acceptance Criteria, Implementation Plan, blockers, target, Planning Seal, and repository instructions. Rebuild recovery state from the append-only prerequisite receipts before deciding what work remains.

Run authoritative discovery only after the exact Tracker Spec or child Issue is fully published and before any worktree creation or product implementation. Repository instructions must name one exact executable Prerequisite resolver and its `discover`, `prepare`, and `verify` invocations. Invoke `discover` exactly once per invocation, read-only, with the complete published Issue context and current non-sensitive evidence.

The repository owns the resolver transport, field names, policy, validation commands, target semantics, and safe extensions. Require machine-readable results containing the status and protected evidence needed by this workflow; do not invent a universal resolver transport, configuration schema, SQL parser, or receipt engine.

- No resolver declaration is `NOT_REQUIRED`: report it and stop with no worktree and no tracker receipt.
- A declared resolver that is missing, unreadable, ambiguous, unparseable, or inconsistent is transient `BLOCKED`: report the exact reason and stop with no worktree and no tracker receipt.
- A valid `REQUIRED` result identifies the declared Prerequisite artifact, resolver or policy identity, non-sensitive manual target identity, and repository-owned validation commands. `NOT_REQUIRED`, `REQUIRED`, and `BLOCKED` are transient results and create no prerequisite receipt.

## Prepare a required artifact

Only `REQUIRED` may create or reuse the dedicated Issue worktree and topic branch. Validate the Planning Seal and original target baseline exactly as `execute-issue` does. Reuse a matching existing Issue worktree, topic branch, and candidate ancestry from a current receipt or late-discovery checkpoint; never copy the artifact into a second worktree or branch.

Invoke repository-owned `prepare`. It may write only the declared Prerequisite artifact. If preparation requires Entity changes, business logic, or other remaining product implementation, stop and return unchanged Acceptance Criteria to `execute-issue`, or changed behavior, acceptance, target, exclusions, or ownership to planning.

Run the repository-defined syntax and static validation. Repair only confirmed failures inside the declared artifact for at most five Prerequisite artifact repair waves; initial generation, no-edit retries, and tool failures do not count. If wave five still fails, return transient `BLOCKED` without a receipt.

Syntax and static validation must pass before handoff. Commit the validated prerequisite artifact alone as a Local checkpoint commit, then require the Issue worktree to be clean before writing `WAITING_MANUAL`.

## Append the manual handoff

Append one `WAITING_MANUAL` receipt to the configured Issue tracker and read it back once. Receipts are append-only: never edit, replace, or delete earlier `WAITING_MANUAL` or `READY` evidence.

Bind the exact Issue, prerequisite commit, artifact paths and SHA-256 hashes, resolver or policy identity, non-sensitive manual target identity, and prerequisite ancestry. Include the topic branch and Issue worktree identities needed for recovery, but never include credentials, artifact contents, or another sensitive value. Never perform the human-owned manual action, replay SQL, poll the target, or run a full suite as target proof.

Stop at `WAITING_MANUAL` and tell the human the exact repository-owned manual action that remains, without performing it.

## Verify and recover READY

If a current `READY` receipt matches the current `REQUIRED` discovery result and its prerequisite commit remains in the required ancestry, report `READY` and stop without repeating target verification or appending a duplicate receipt.

On a later invocation, validate the current `WAITING_MANUAL` receipt against the current `REQUIRED` discovery result. Invoke `verify` exactly once, read-only, against only the declared outcome and non-sensitive target identity; never replay `prepare`, the artifact, or the manual action as verification.

Success appends and reads back one `READY` receipt with the same Protected prerequisite identity. Failure or unavailable access preserves `WAITING_MANUAL`, returns transient `BLOCKED`, and creates no failure receipt.

Tracker write or read-back failure is transient `BLOCKED` and never authorizes or claims `WAITING_MANUAL` or `READY`; report the unresolved tracker state and stop.

A current `READY` receipt needs no repeated target verification. Later implementation commits preserve it while the prerequisite commit remains an ancestor and every protected value still matches. Artifact, resolver, policy, manual target, or required ancestry drift makes the receipt stale; never treat stale evidence or human attestation alone as readiness.

Leave the clean Issue worktree and topic branch in place for `execute-issue`. Never invoke `execute-issue`, integrate, close the Issue, push, deploy, mutate a database or external environment, or perform the Manual prerequisite action.
