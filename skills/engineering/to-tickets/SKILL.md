---
name: to-tickets
description: Consume one Multi-Issue Spec handoff through a minimal decomposition producer and emit one composite Run handoff.
disable-model-invocation: true
---

# To Tickets

Consume one completed `/to-spec` handoff and its published classification; never reclassify delivery shape. This skill accepts only a Multi-Issue Spec. For a Single-Issue Spec, stop without mutation and report `/run-issue-workflow <Spec-ID>`.

Configured tracker/triage labels and concrete upstream, checkpoint, tracker, and handoff adapters are prerequisites; otherwise stop and tell the human to invoke `/setup-matt-pocock-skills` or the repository's documented workflow setup.

## 1. Bind the upstream publication

Read the exact completed upstream `to-spec` `handoff.completed` and publication through their owning source once. Read the exact `to-tickets` operation only; unrelated operations on the same target neither conflict nor block. Require producer, parent/tracker identity, target, Planning Seal, Multi-Issue classification, approved scope, transaction, publication, and next command to match the current parent and target. Missing, stale, contradictory, or ambiguous evidence stops before mutation; never rerun upstream generation, planning, review, validation, or publication.

Fresh decomposition is tracker-only and requires no planning worktree: target dirt is preserved and never becomes transaction authority, and accepted glossary or ADR writes return to `/to-spec`. Before ready state, consume [Run preparation](../../../docs/agents/run-preparation.md); it reuses approvals, prepares only declared SQL prerequisites through `pre-execute-issue`, and neither creates a Run Grant nor executes a prerequisite.

## 2. Draft the executable children

Create independently verifiable vertical slices. Every child has an immutable `<Spec-ID>/<NN>` Decomposition key, stable `AC-n` Acceptance Criteria, source-grounded Implementation Plan, Verification, blockers, target, and Planning baseline. Issue IDs are public execution/closeout inputs; titles are never identity. Every criterion, plan step, and verification item maps through inline `Covers: AC-n`.

The parent retains only outcome, cross-Issue constraints, decomposition rationale, and the handoff. A child does not need to know whether siblings execute concurrently. Validate the owned blocker graph is acyclic before mutation. An External blocker is existing readable evidence only. Prefer tracer-bullet slices; use expand-contract only when a wide mechanical refactor cannot stay green per slice.

When rendering or validating a child, read [the canonical child contract](references/canonical-child-contract.md). When selecting provider relation representation, reconciling tracker identities, or recovering partial child/relation publication, read [relation reconciliation](references/decomposition-reconciliation.md). Do not load either reference for an upstream-only stop.

## 3. Validate the published Planning Seal

Require the completed `to-spec` Seal to exist locally, be an ancestor of target `HEAD`, and still match parent body, target, classification, and approved scope. Missing or unreachable lineage is a Hard gate that returns to `/to-spec`. This skill neither reruns upstream planning nor creates a successor Seal. A changed public behavior, acceptance, target, or exclusion is a Spec revision: stop, do not modify the parent, report the exact consumed Seal, and tell the human to invoke `/to-spec`.

## 4. Run the decomposition producer

Before transaction creation or tracker mutation, read [decomposition publication interfaces](references/decomposition-publication-interfaces.md); it owns adapter payloads and source read-backs. Then read [the current decomposition contract](references/decomposition-contract.md) when starting, resuming, reconciling, or completing the current producer transaction. For an existing incomplete `transaction-v1` or `to-tickets@v1` receipt, read [frozen v1 resume](references/decomposition-legacy-v1.md) and continue only its exact historical stages.

Continue only from the first valid unsatisfied stage. Authority, identity, ordering, or adapter ambiguity is a Hard gate before the next mutation; completed receipts and partial state remain preserved.

## 5. Reconcile and Publish Executable Issues

Apply the contract preflight, then perform child, relation, parent-record, ready-state, and handoff read-backs in owner order. A Hard gate stops before the next mutation; a Recoverable blocker names its source, evidence, smallest human action, preserved stages, and the same `/to-tickets` retry. Advisories remain visible without changing authority.

Only after decomposition and ready-state receipts read back may the transaction advance `handoff.completed`. Report the dependency-ready frontier without a child `/execute-issue` command and end exactly with `/run-issue-workflow <Spec-ID>`.

This skill publishes decomposition only: it never starts a Run, implements, closes, integrates, pushes, deploys, rolls back, or silently repairs evidence.
