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

A fresh ordinary decomposition uses `to-tickets@v2`. Bind one exact operation-scoped transaction to repository, Spec and tracker identity, producer `to-tickets`, opaque operation identity, profile `v2`, target, observed baseline, consumed Planning Seal, Multi-Issue classification, approved-scope identity, upstream publication identity, and upstream handoff identity. Its ordered stages are `decomposition.read_back`, `ready_state.read_back`, and `handoff.completed`.

The current profile has no target operational-plan file, plan-content stage, checkpoint commit, shared-writer acquisition, prospective `direct_target_contribution:v1` record, or attestation stage. Target-checkout dirt is preserved and is not transaction authority; only a ref, upstream, tracker, Planning Seal, or operation identity conflict that risks the wrong mutation is a Hard gate.

Only one exact matching transaction may resume at its first unsatisfied stage. Re-read every completed receipt and require every bound identity to match. A missing transaction with observed downstream mutation, duplicate exact operation, mismatched receipt, out-of-order stage, conflicting upstream publication or handoff, or ambiguous adapter result stops without regeneration, overwrite, duplicate mutation, rollback, or unrelated attribution. Completed transaction receipts remain immutable; do not mark them consumed, archive them, or delete them automatically.

## 5. Reconcile and Publish Executable Issues

Derive the complete expected key set, canonical child contracts, owned blocker edges, and readable External blockers from the approved parent before touching the tracker. Discover every tracker-supported identity source for every expected key and parent before any mutation. Body parent, target, Planning Seal, executable contract, native parent, and blocking relation evidence must all agree wherever the tracker supports them; titles are ignored.

Classify every expected key in one preflight:

- **Zero matches:** create exactly one child later, blockers before dependants.
- **One matching Issue:** reuse it without per-child authorization when every supported identity source and the complete canonical contract match. The only incomplete match allowed is an absent native relationship recorded by a prior partial-publication read-back with this exact child, key, and expected relation.
- **More than one match:** stop without mutation and report the duplicate key and Issue identities.

Any conflict in key, parent, target, Planning Seal, executable contract, body, or tracker-native relationship evidence must stop without mutation; never automatically repair conflicting evidence. An expected native relationship that points elsewhere is a conflict, not an incomplete match. Validate all existing matches, the owned acyclic graph, and every External blocker before creating any missing child. This preflight makes a retry recover partial publication by Decomposition key instead of duplicating children.

Read any prior partial-publication state and bind its exact child, key, expected relation, and failed read-back before continuing.

### Complete a recorded partial publication

Before creating a missing child, complete only an absent native relationship whose exact child identity, Decomposition key, expected relation, and failed read-back are bound by the prior partial-publication state. Read that relation back once. Missing partial-state identity or any conflicting relation stops without mutation; body, contract, key, target, and Planning Seal mismatches are never repairable here.

### Publish missing children

Render one canonical child contract through the configured adapter:

- **Local tracker:** write one file per missing child under `.scratch/<feature>/issues/`, using the Decomposition key for stable discovery and local parent/blocker references.
- **A real issue tracker:** create one Issue per missing child and render the same body, then add every tracker-supported native parent and blocking relation. The adapter changes only local title, body wrapper or filename, and native relationship syntax; it does not fork the child semantics.

Read each published Issue back once and require its Decomposition key, body, Acceptance Criteria mapping, Planning baseline, parent, blocking relations, and target to match. A native relationship write or read-back failure must bind the exact child identity, Decomposition key, expected absent relationship, and failed read-back in partial-publication state. For every mismatch, report created identifiers, selected Planning Seal, and exact matched or missing keys, then stop without modifying the parent or unrelated Issues.

## 6. Publish completeness and the ready frontier

After every expected child and blocker edge passes read-back, Reconcile the parent publication record against this minimal versioned contract:

<decomposition-publication-record>

schema: decomposition:v1
parent: <Multi-Issue Spec ID>
Planning Seal: <selected full SHA>
target: <original local target branch>
key-to-Issue mapping:
- <Spec-ID>/<NN>: <Issue-ID>
blocker edges:
- <blocking Issue-ID> -> <blocked child Issue-ID>

</decomposition-publication-record>

With no current record, write exactly one. With one matching record, reuse it. Conflicting or multiple records stop without mutation. The Decomposition publication record proves Issue decomposition completeness and is never a child identity source. Read the written or reused record back once, retain its tracker-native comment identity or durable local record locator plus the SHA-256 digest of its exact body, and only then advance `decomposition.read_back` before changing `ready-for-agent`.

A failure before or during record publication is recoverable partial publication by key: report the full mapping and edge state plus the selected seal. On a fresh `to-tickets@v2` retry, reuse the exact consumed Planning Seal from its upstream handoff. A frozen legacy or profile-v1 exact resume may reuse only its existing bound successor Planning Seal. Never cross-select a seal from another operation. A bootstrap rerun must reuse all matching children and publish only the missing parent record.

Compute readiness only after record read-back. An open child whose every owned and External blocker is closed belongs to the dependency-ready frontier. Apply `ready-for-agent` only to those children; remove a stale ready label from every open blocked or closed child. Blocked or closed children receive no ready label. Read every resulting child ready state back once and advance `ready_state.read_back` only when every state matches the published graph.

### Append the composite Run handoff

Append or reuse one final `handoff.completed` bound to the upstream publication identity, upstream handoff identity, this current operation transaction receipt, the exact Decomposition publication comment identity or durable local record locator, its SHA-256 exact body digest, parent and tracker identity, target, Planning Seal, complete key-to-Issue mapping, blocker edges, Multi-Issue classification, and approved-scope identity. The current operation receipt contains the transaction identity plus the exact `decomposition.read_back` and `ready_state.read_back` receipts. With no current matching handoff, append exactly one. With one exact matching handoff, reuse it. Conflicting or multiple handoffs stop without mutation. Read the appended or reused receipt back exactly before advancing `handoff.completed`.

An existing frozen transaction-v1 or `to-tickets@v1` handoff retains its original checkpoint commit and immutable `direct_target_contribution:v1` bindings. Never rewrite or migrate that receipt into the current shape.

Report the dependency-ready frontier without any child `/execute-issue` command and end with exactly `/run-issue-workflow <Spec-ID>`. `/to-tickets` never schedules or creates tasks and never depends on Codex, Orca, titles, inferred blockers, or global queue state.

Any current transaction, upstream publication, upstream handoff, child, relation, Decomposition record, label, final handoff, target, scope, or identity failure preserves and reports the exact partial state and stops without rollback, duplication, scheduling, task creation, Run start, implementation, closeout, push, or deploy. Report the transaction identity, consumed Planning Seal, upstream publication and handoff identities, exact first unsatisfied stage, published mapping and edge state, and any successful tracker identities. A frozen compatibility resume additionally reports its existing checkpoint and attestation evidence. Never amend, reset, delete, or silently repair evidence.

<child-contract>

## Parent

<Multi-Issue Spec reference.>

## Decomposition key

`<Spec-ID>/<NN>`

## What to build

<One independently verifiable outcome.>

## Acceptance Criteria

- **AC-1 - <name>:** <Observable condition.>

## Implementation Plan

### Step 1: <outcome>

<Source-grounded work.> **Covers: AC-1.**

## Verification

- <Observable check.> **Covers: AC-1.**

## Blocked by

<Issue references or None.>

## Planning baseline

- Commit: <full local target-branch commit SHA>
- Seal: <created, successor, or reused>

## Target

<Original local target branch.>

</child-contract>
