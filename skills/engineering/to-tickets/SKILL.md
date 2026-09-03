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

Read the exact `to-tickets` operation only. Unrelated operations on the same target neither conflict nor block. Target-checkout dirt and unrelated staged, unstaged, untracked, modified, or mixed work are preserved and are not transaction authority because fresh decomposition performs no target write. Missing, stale, contradictory, legacy plan-only, or ambiguous upstream or operation state stops before child, relation, label, or parent-comment mutation; never synthesize a handoff, infer ownership, or repair another operation.

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

Before transaction creation or tracker mutation, read [`references/decomposition-publication-interfaces.md`](references/decomposition-publication-interfaces.md) and use only its upstream, checkpoint, tracker, and handoff adapters.

First search the exact operation for an existing valid incomplete transaction-v1 or `to-tickets@v1` receipt. That compatibility branch has frozen exact resume behavior: continue its existing plan, checkpoint commit, attestation, decomposition, ready-state, and handoff stages at the first unsatisfied stage. Do not migrate, copy, rewrite, delete, or recreate it, and never use its behavior to shape a fresh operation.

A fresh ordinary decomposition uses `to-tickets@v2`. Call `bindProducerCheckpointOperationIdentity` and `createProducerOperationCheckpoint` for repository, Spec, approved publication identity or hash, producer `to-tickets`, and stage `decomposition`; bind the same transaction to tracker identity, profile `v2`, target, observed baseline, consumed Planning Seal, Multi-Issue classification, approved-scope identity, upstream publication identity, and upstream handoff identity. Caller correlation never defines authority. Its ordered stages are `decomposition.read_back`, `ready_state.read_back`, and `handoff.completed`.

The current profile has no target operational-plan file, plan-content stage, checkpoint commit, shared-writer acquisition, prospective `direct_target_contribution:v1` record, or attestation stage. Target-checkout dirt is preserved and is not transaction authority; only a ref, upstream, tracker, Planning Seal, or operation identity conflict that risks the wrong mutation is a Hard gate.

Only one exact matching transaction may resume at its first unsatisfied stage. Re-read every completed receipt and require every bound identity to match. A missing transaction with observed downstream mutation, duplicate exact operation, mismatched receipt, out-of-order stage, conflicting upstream publication or handoff, or ambiguous adapter result stops without regeneration, overwrite, duplicate mutation, rollback, or unrelated attribution. Completed transaction receipts remain immutable; do not mark them consumed, archive them, or delete them automatically.

## 5. Reconcile and Publish Executable Issues

After the transaction is bound, read [the decomposition contract](references/decomposition-contract.md) only when reconciling existing children, completing a recorded partial publication, publishing missing children, writing the Decomposition publication record, updating ready state, or appending the composite Run handoff. That reference is the single owner of those payloads, compatibility branches, and recovery matrices.

Apply its preflight before mutation, then perform its child, relation, parent-record, ready-state, and handoff read-backs in order through the adapters above. A Hard gate stops before the next mutation; a Recoverable blocker reports the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-tickets` retry. Advisories never change authority.

## 6. Complete

Only after the contract's decomposition and ready-state receipts read back may the transaction advance `handoff.completed`. Report the dependency-ready frontier without a child `/execute-issue` command and end exactly with `/run-issue-workflow <Spec-ID>`.

This skill never schedules tasks, starts a Run, implements, closes, integrates, pushes, deploys, rolls back, or silently repairs evidence.
