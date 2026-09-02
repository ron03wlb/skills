---
name: to-tickets
description: Consume a checkpointed Multi-Issue Spec, publish its Decomposition publication record, and emit one composite Run handoff.
disable-model-invocation: true
---

# To Tickets

Consume one completed `/to-spec` handoff and its published classification; never reclassify delivery shape. `to-tickets` accepts only a Multi-Issue Spec. For a Single-Issue Spec, stop without mutation and report its published `/run-issue-workflow <Spec-ID>` route. For a Multi-Issue Spec, read its full body and comments and decompose only its approved scope.

The configured issue tracker, triage labels, Workflow checkpoint transaction store, and shared Target mutation writer must already exist; otherwise stop and tell the human to invoke `/setup-matt-pocock-skills` or the repository's explicitly documented workflow setup. Never create or repair those authority seams here.

## 1. Consume the completed to-spec handoff

Read the exact completed `to-spec` `handoff.completed` result and require its producer, parent and tracker identity, target, Planning Seal, Multi-Issue classification, approved-scope identity, checkpoint commit, immutable `direct_target_contribution:v1` record identity, publication identity, and next command to match the current parent body, ordered comments, local target, and approved scope. Read the handoff and every referenced immutable identity back from its owning source; a cached summary or durable plan is not authority.

Before a new `to-tickets` Workflow checkpoint transaction, require the exact target to be clean and require no conflicting active or incomplete Workflow checkpoint transaction. Unrelated staged, unstaged, untracked, modified, mixed, or provenance-ambiguous work is preserved and stops before transaction, plan, Git, child, relation, label, or parent-comment mutation. A matching incomplete `to-tickets` transaction is the only resumable producer state: re-read every bound result and resume its first unsatisfied stage. Missing, stale, contradictory, unrelated dirty, legacy plan-only, or ambiguous upstream or transaction state stops without mutation; never synthesize a handoff, infer ownership, or repair another operation.

## 2. Draft independent children

Create narrow vertical slices whose behavior is independently verifiable. Give every child one immutable `<Spec-ID>/<NN>` Decomposition key plus its own stable `AC-n` Acceptance Criteria, source-grounded Implementation Plan, Verification, blockers, target, and Planning baseline. The key resolves its parent; tracker Issue IDs remain the public execution and closeout inputs, and titles are never identity. Expected paths and symbols are non-exhaustive. Every criterion must be covered by a plan step and verification item, and every step must cover a criterion through inline `Covers: AC-n` references.

The parent keeps only the overall outcome, cross-Issue constraints, and decomposition rationale. A child does not need to know whether siblings execute concurrently; it depends only on explicit blockers and shared parent constraints. Validate that the owned blocker graph is acyclic before any mutation. An External blocker must be an existing readable Issue; `/to-tickets` never creates, edits, closes, or assumes ownership of it.

Prefer tracer-bullet vertical slices. For one wide mechanical refactor that cannot stay green per slice, use expand-contract: expand, independently green migration batches, then contract after all migrations.

Generate the exact durable decomposition plan in memory from the approved parent, expected canonical child contracts, owned blocker graph, External blockers, publication order, and verification. Select its repository-conventional path and bind its exact path plus the generated content identity before any write. Do not write the plan until the Workflow checkpoint transaction below exists.

## 3. Validate or advance the Planning Seal

Validate the inherited Planning Seal before any successor Planning Seal: require its commit to exist locally and be an ancestor of the target `HEAD`. Missing or unreachable lineage stops and returns to `/to-spec`.

Before classifying the current delta on a retry, read prior partial-publication state. If it records a verified Planning Seal, require that full SHA to exist locally and be an ancestor of target `HEAD`, reuse it, and never fall back to the inherited seal. Conflicting or missing evidence stops.

- If there is no relevant planning-artifact delta and no recovered successor, reuse the inherited seal.
- Exact approved in-Spec glossary or ADR refinement may create at most one successor Planning Seal containing only that isolated delta. Preserve unrelated staged, unstaged, and untracked work.
- New public behavior, acceptance, target, or exclusion is a Spec revision: stop, tell the human to invoke `/to-spec`, and do not modify or silently expand the parent.

Verify the selected full SHA, ancestry, exact owned diff, and unrelated-state preservation. If publication later fails, retain the seal and report its full SHA with the partial state; do not amend, reset, or roll it back.

## 4. Start or resume the Workflow checkpoint transaction

After the selected Planning Seal is exact, bind one versioned Workflow checkpoint transaction to the repository identity, producer command `to-tickets`, exact parent Spec and tracker identity, consumed `to-spec` handoff and immutable record identity, target, post-Seal baseline, initially clean state, exact durable plan path and generated content identity, Multi-Issue classification, and approved-scope identity. Create the Workflow checkpoint transaction before writing the plan. Advance only this ordered prefix: `plan.written`, `checkpoint.committed`, `attestation.read_back`, `decomposition.read_back`, `ready_state.read_back`, `handoff.completed`.

Only one exact matching incomplete transaction may resume at its first unsatisfied stage. Re-read every completed result and require every bound identity to match. A mismatched producer, parent, tracker identity, upstream handoff, target, baseline, Planning Seal, path, content, checkpoint commit, evidence record, decomposition publication, ready state, final handoff, multiple active transaction, or ambiguous state stops without regeneration, overwrite, duplicate mutation, rollback, or unrelated attribution.

For a fresh `plan.written` stage, write only the already bound generated content to the exact plan path and read its content identity back. For `checkpoint.committed`, acquire the shared Target mutation writer, revalidate the clean baseline and transaction, commit only the exact plan, and require post-commit Git and target read-back to equal that checkpoint before releasing the writer. Acquisition failure stops before Git or tracker mutation.

After the checkpoint commit, automatically invoke model-invoked `attest-target-contribution` with the exact prospective packet owned by this producer. It binds the active producer, parent Spec identity, target, transaction identity, checkpoint commit, plan purpose, baseline, and read-back expectations. Require the exact reused or appended immutable `direct_target_contribution:v1` record identity before any decomposition publication. No second confirmation is permitted or required.

An exact retry never regenerates or duplicates the plan, plan write, checkpoint commit, evidence, tracker comment, or confirmation, and it never switches the Planning Seal or consumed upstream handoff. Completed transaction results remain immutable; do not mark them consumed, archive them, or delete them automatically.

## 5. Reconcile and Publish Executable Issues

Derive the complete expected key set, canonical child contracts, owned blocker edges, and readable External blockers from the approved parent before touching the tracker. Discover every tracker-supported identity source for every expected key and parent before any mutation. Body parent, target, Planning Seal, executable contract, native parent, and blocking relation evidence must all agree wherever the tracker supports them; titles are ignored.

Classify every expected key in one preflight:

- **Zero matches:** create exactly one child later, blockers before dependants.
- **One matching Issue:** reuse it without per-child authorization when every supported identity source and the complete canonical contract match. The only incomplete match allowed is an absent native relationship recorded by a prior partial-publication read-back with this exact child, key, and expected relation.
- **More than one match:** stop without mutation and report the duplicate key and Issue identities.

Any conflict in key, parent, target, Planning Seal, executable contract, body, or tracker-native relationship evidence must stop without mutation; never automatically repair conflicting evidence. An expected native relationship that points elsewhere is a conflict, not an incomplete match. Validate all existing matches, the owned acyclic graph, and every External blocker before creating any missing child. This preflight makes a retry recover partial publication by Decomposition key instead of duplicating children.

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

A failure before or during record publication is recoverable partial publication by key: report the full mapping and edge state plus the selected seal. On retry, reuse a verified successor Planning Seal and never fall back to the inherited seal. A bootstrap rerun must reuse all matching children and publish only the missing parent record.

Compute readiness only after record read-back. An open child whose every owned and External blocker is closed belongs to the dependency-ready frontier. Apply `ready-for-agent` only to those children; remove a stale ready label from every open blocked or closed child. Blocked or closed children receive no ready label. Read every resulting child ready state back once and advance `ready_state.read_back` only when every state matches the published graph.

### Append the composite Run handoff

Append or reuse one final `handoff.completed` bound to the consumed `to-spec` immutable v1 record identity, this producer's checkpoint commit and immutable v1 record identity, the exact Decomposition publication comment identity or durable local record locator, its SHA-256 exact body digest, parent and tracker identity, target, Planning Seal, complete key-to-Issue mapping, blocker edges, Multi-Issue classification, and approved-scope identity. With no current matching handoff, append exactly one. With one exact matching handoff, reuse it. Conflicting or multiple handoffs stop without mutation. Read the appended or reused receipt back exactly before advancing `handoff.completed`.

Report the dependency-ready frontier without any child `/execute-issue` command and end with exactly `/run-issue-workflow <Spec-ID>`. `/to-tickets` never schedules or creates tasks and never depends on Codex, Orca, titles, inferred blockers, or global queue state.

Any transaction, writer, checkpoint, attestation, upstream handoff, child, relation, Decomposition record, label, final handoff, target, scope, or identity failure preserves and reports the exact partial state and stops without rollback, duplication, scheduling, task creation, Run start, implementation, closeout, push, or deploy. Report the transaction identity, selected Planning Seal, checkpoint commit and v1 record identity when they exist, consumed upstream identity, exact first unsatisfied stage, published mapping and edge state, and any successful tracker identities. Never amend, reset, delete, or silently repair evidence.

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
