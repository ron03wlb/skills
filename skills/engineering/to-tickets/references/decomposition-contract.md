# Decomposition contract

Read this reference only after `to-tickets` has consumed the exact upstream handoff and validated the Planning Seal. This file solely owns transaction profiles and stages, compatibility behavior, child rendering, identity reconciliation, partial publication recovery, the parent record payload, ready-state publication, the composite Run handoff, and their recovery matrices.

## Start or resume the producer transaction

First search the exact operation for an existing valid incomplete transaction-v1 or `to-tickets@v1` receipt. That compatibility branch has frozen exact resume behavior: continue its existing plan, checkpoint commit, attestation, decomposition, ready-state, and handoff stages at the first unsatisfied stage. Do not migrate, copy, rewrite, delete, or recreate it, and never use its behavior to shape a fresh operation.

A fresh ordinary decomposition uses `to-tickets@v2`. Consume the checkpoint interface's owner-derived operation identity receipt and bind the same transaction to tracker identity, profile `v2`, target, observed baseline, consumed Planning Seal, Multi-Issue classification, approved-scope identity, upstream publication identity, and upstream handoff identity. Caller correlation never defines authority. Its ordered stages are `decomposition.read_back`, `ready_state.read_back`, and `handoff.completed`.

The current profile has no target operational-plan file, plan-content stage, checkpoint commit, shared-writer acquisition, prospective `direct_target_contribution:v1` record, or attestation stage. Target-checkout dirt is preserved and is not transaction authority; only a ref, upstream, tracker, Planning Seal, or operation identity conflict that risks the wrong mutation is a Hard gate.

Only one exact matching transaction may resume at its first unsatisfied stage. Re-read every completed receipt and require every bound identity to match. A missing transaction with observed downstream mutation, duplicate exact operation, mismatched receipt, out-of-order stage, conflicting upstream publication or handoff, or ambiguous adapter result stops without regeneration, overwrite, duplicate mutation, rollback, or unrelated attribution. Completed transaction receipts remain immutable; do not mark them consumed, archive them, or delete them automatically.

## Reconcile executable Issues

Derive the complete expected key set, canonical child contracts, owned blocker edges, and readable External blockers from the approved parent before touching the tracker. Discover every tracker-supported identity source for every expected key and parent before any mutation. Body parent, target, Planning Seal, executable contract, native parent, and blocking relation evidence must all agree wherever the tracker supports them; titles are ignored.

Classify every expected key in one preflight:

- **Zero matches:** create exactly one child later, blockers before dependants.
- **One matching Issue:** reuse it without per-child authorization when every supported identity source and the complete canonical contract match. The only incomplete match allowed is an absent native relationship recorded by a prior partial-publication read-back with this exact child, key, and expected relation.
- **More than one match:** stop without mutation and report the duplicate key and Issue identities.

Any conflict in key, parent, target, Planning Seal, executable contract, body, or tracker-native relationship evidence must stop without mutation; never automatically repair conflicting evidence. An expected native relationship that points elsewhere is a conflict, not an incomplete match. Validate all existing matches, the owned acyclic graph, and every External blocker before creating any missing child. This preflight makes a retry recover partial publication by Decomposition key instead of duplicating children.

Read any prior partial-publication state and bind its exact child, key, expected relation, and failed read-back before continuing. Complete only an absent native relationship whose exact child identity, Decomposition key, expected relation, and failed read-back are bound by that state. Read the relation back once. Missing partial-state identity or any conflicting relation stops without mutation; body, contract, key, target, and Planning Seal mismatches are never repairable here.

### Publish missing children

Render one canonical child contract through the configured adapter:

- **Local tracker:** write one file per missing child under `.scratch/<feature>/issues/`, using the Decomposition key for stable discovery and local parent/blocker references.
- **A real issue tracker:** create one Issue per missing child and render the same body, then add every tracker-supported native parent and blocking relation. The adapter changes only local title, body wrapper or filename, and native relationship syntax; it does not fork child semantics.

Read each published Issue back once and require its Decomposition key, body, Acceptance Criteria mapping, Planning baseline, parent, blocking relations, and target to match. A native relationship write or read-back failure must bind the exact child identity, Decomposition key, expected absent relationship, and failed read-back in partial-publication state. Report created identities, selected Planning Seal, and exact matched or missing keys, then stop without modifying the parent or unrelated Issues.

## Publish completeness and ready state

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

## Append the composite Run handoff

Append or reuse one final `handoff.completed` bound to the upstream publication identity, upstream handoff identity, this current operation transaction receipt, the exact Decomposition publication comment identity or durable local record locator, its SHA-256 exact body digest, parent and tracker identity, target, Planning Seal, complete key-to-Issue mapping, blocker edges, Multi-Issue classification, and approved-scope identity. The current operation receipt contains the transaction identity plus the exact `decomposition.read_back` and `ready_state.read_back` receipts. With no current matching handoff, append exactly one. With one exact matching handoff, reuse it. Conflicting or multiple handoffs stop without mutation. Read the appended or reused receipt back exactly before advancing `handoff.completed`.

An existing frozen transaction-v1 or `to-tickets@v1` handoff retains its original checkpoint commit and immutable `direct_target_contribution:v1` bindings. Never rewrite or migrate that receipt into the current shape.

Report the dependency-ready frontier without any child `/execute-issue` command and end with exactly `/run-issue-workflow <Spec-ID>`. `/to-tickets` never schedules or creates tasks and never depends on Codex, Orca, titles, inferred blockers, or global queue state.

Any current transaction, upstream publication, upstream handoff, child, relation, Decomposition record, label, final handoff, target, scope, or identity failure preserves and reports the exact partial state and stops without rollback, duplication, scheduling, task creation, Run start, implementation, closeout, push, or deploy. Report the transaction identity, consumed Planning Seal, upstream publication and handoff identities, exact first unsatisfied stage, published mapping and edge state, and successful tracker identities. A frozen compatibility resume additionally reports its existing checkpoint and attestation evidence. Never amend, reset, delete, or silently repair evidence.

## Canonical child contract

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
