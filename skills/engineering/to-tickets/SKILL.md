---
name: to-tickets
description: Consume one Multi-Issue Spec handoff through a minimal decomposition producer and emit one composite Run handoff.
disable-model-invocation: true
---

# To Tickets

Consume one completed `/to-spec` handoff and its published classification; never reclassify delivery shape. `to-tickets` accepts only a Multi-Issue Spec. For a Single-Issue Spec, stop without mutation and report its published `/run-issue-workflow <Spec-ID>` route. For a Multi-Issue Spec, read its full body and comments and decompose only its approved scope.

The configured issue tracker, triage labels, current Workflow checkpoint profiles, and concrete upstream, checkpoint, tracker, and handoff adapters must already exist; otherwise stop and tell the human to invoke `/setup-matt-pocock-skills` or the repository's explicitly documented workflow setup. A frozen legacy or profile-v1 resume also requires its existing shared Target mutation writer. Never create or repair those authority seams here.

## 1. Consume the completed to-spec handoff

Read the exact completed `to-spec` `handoff.completed` result through the upstream adapter once. Require its producer, parent and tracker identity, target, Planning Seal, Multi-Issue classification, approved-scope identity, transaction identity, publication identity, and next command to match the current parent body, ordered comments, local target, and approved scope. Read the upstream publication and handoff identities back from their owning sources once; never rerun `to-spec` generation, review, validation, or publication logic, and never treat a cached summary or durable plan as authority.

Read the exact `to-tickets` operation only. Unrelated operations on the same target neither conflict nor block. Target-checkout dirt and unrelated staged, unstaged, untracked, modified, or mixed work are preserved and are not transaction authority because fresh decomposition performs no target write and requires no planning worktree. Accepted glossary or ADR writes return to `to-spec` and its isolated write lane. Missing, stale, contradictory, legacy plan-only, or ambiguous upstream or operation state stops before child, relation, label, or parent-comment mutation; never synthesize a handoff, infer ownership, or repair another operation.

Before publishing a Run-ready result, consume [Run preparation](../../../docs/agents/run-preparation.md). Read prior human approvals, prepare exact missing operations and read-only capability probes, then ask once for only the missing scope. Carry the actual inventory in the existing publication/handoff. After the exact Issue identities are published, call the Skill tool with "pre-execute-issue" for declared SQL prerequisites before their ready-state and final handoff read-backs. Reuse its one prepared task/worktree and exact human outcome; no SQL is N/A. Preparation never creates a Run Grant, executes SQL or authorizes deployment.

## 2. Draft independent children

Create narrow vertical slices whose behavior is independently verifiable. Give every child one immutable `<Spec-ID>/<NN>` Decomposition key plus its own stable `AC-n` Acceptance Criteria, source-grounded Implementation Plan, Verification, blockers, target, and Planning baseline. The key resolves its parent; tracker Issue IDs remain the public execution and closeout inputs, and titles are never identity. Expected paths and symbols are non-exhaustive. Every criterion must be covered by a plan step and verification item, and every step must cover a criterion through inline `Covers: AC-n` references.

The parent keeps only the overall outcome, cross-Issue constraints, and decomposition rationale. A child does not need to know whether siblings execute concurrently; it depends only on explicit blockers and shared parent constraints. Validate that the owned blocker graph is acyclic before any mutation. An External blocker must be an existing readable Issue; `/to-tickets` never creates, edits, closes, or assumes ownership of it.

Prefer tracer-bullet vertical slices. For one wide mechanical refactor that cannot stay green per slice, use expand-contract: expand, independently green migration batches, then contract after all migrations.

Generate the exact decomposition in memory from the approved parent, expected canonical child contracts, owned blocker graph, External blockers, publication order, and verification. It is producer input, not a repository artifact: never write or commit a target operational plan for a fresh operation.

## 3. Validate the consumed Planning Seal

Consume the exact Planning Seal from the completed `to-spec` read-back. Require its full commit to exist locally and be an ancestor of the target `HEAD`; require the parent body, target, Multi-Issue classification, and approved-scope identity to remain the same publication. Missing or unreachable lineage is a Hard gate and returns to `/to-spec`.

`to-tickets` does not rerun upstream planning generation, review, or validation and does not create a successor Planning Seal. Exact approved glossary or ADR changes require a renewed `to-spec` publication rather than a downstream planning write.

New public behavior, acceptance, target, or exclusion is a Spec revision: stop, tell the human to invoke `/to-spec`, and do not modify or silently expand the parent. Preserve any existing partial publication and report the exact consumed seal.

## 4. Start or resume the decomposition producer transaction

Before transaction creation or tracker mutation, read [`references/decomposition-publication-interfaces.md`](references/decomposition-publication-interfaces.md) and use only its upstream, checkpoint, tracker, and handoff adapters. Then read [the decomposition contract](references/decomposition-contract.md) only when starting, resuming, reconciling, or completing the producer transaction. That reference solely owns transaction profiles and stages, compatibility branches, publication payloads, and recovery matrices.

Use its exact adapter-bound operation and continue only from the first valid unsatisfied stage. Any authority, identity, ordering, or adapter ambiguity is a Hard gate before the next mutation; preserve completed receipts and partial state.

## 5. Reconcile and Publish Executable Issues

Apply its preflight before mutation, then perform its child, relation, parent-record, ready-state, and handoff read-backs in order through the adapters above. A Hard gate stops before the next mutation; a Recoverable blocker reports the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-tickets` retry. Advisories never change authority.

## 6. Complete

Only after the contract's decomposition and ready-state receipts read back may the transaction advance `handoff.completed`. Report the dependency-ready frontier without a child `/execute-issue` command and end exactly with `/run-issue-workflow <Spec-ID>`.

This skill never schedules product execution, starts a Run, implements, closes, integrates, pushes, deploys, rolls back, or silently repairs evidence.
