# Current decomposition contract

Read this reference only after `to-tickets` consumes the exact upstream handoff and validates the Planning Seal. It solely owns the current transaction sequence, parent record, ready-state publication, composite Run handoff, and their current-profile recovery. Read its conditional companion only for the branch it names: [frozen v1 resume](decomposition-legacy-v1.md), [relation reconciliation](decomposition-reconciliation.md), or the [canonical child contract](canonical-child-contract.md).

## Start or resume the current producer

For a current operation, consume the checkpoint interface's owner-derived operation identity receipt and bind `to-tickets@v2` to tracker identity, target, observed baseline, consumed Planning Seal, Multi-Issue classification, approved-scope identity, upstream publication identity, and upstream handoff identity. Caller correlation never defines authority. Its ordered stages are `decomposition.read_back`, `ready_state.read_back`, and `handoff.completed`.

The current profile has no target operational-plan file, plan-content stage, checkpoint commit, shared-writer acquisition, prospective `direct_target_contribution:v1` record, or attestation stage. Target-checkout dirt is preserved and is not transaction authority; only a ref, upstream, tracker, Planning Seal, or operation identity conflict that risks the wrong mutation is a Hard gate.

Only one exact matching transaction may resume at its first unsatisfied stage. Re-read every completed receipt and require every bound identity to match. A missing transaction with observed downstream mutation, duplicate exact operation, mismatched receipt, out-of-order stage, conflicting upstream publication or handoff, or ambiguous adapter result stops without regeneration, overwrite, duplicate mutation, rollback, or unrelated attribution. Completed transaction receipts remain immutable; do not mark them consumed, archive them, or delete them automatically.

When rendering or validating a child, read [the canonical child contract](canonical-child-contract.md). When selecting provider relation representation, reconciling identities, or recovering partial publication, read [relation reconciliation](decomposition-reconciliation.md). When the exact operation has an incomplete `transaction-v1` or `to-tickets@v1` receipt, read [frozen v1 resume](decomposition-legacy-v1.md) instead of this current-profile start.

For an approved revision, retain existing keys and immutable child identities. An unchanged closed child may retain its original canonical body and Planning baseline only through explicit completion adoption in the new Decomposition record; a new parent seal does not rewrite completed work. Prove old publication/decomposition/handoff, exact completion identity and body digest, unchanged child body and incoming blockers, same target, closed tracker state, integrated candidate, absent Issue worktree, and no old Run ownership. A changed completed child needs a newly approved contribution. For an unfinished child changed by the approved revision, compare its exact old body/version before publishing the replacement, read back the complete new body, preserve identity/lifecycle/relationships, and prove no active or unknown old lane. Scope changes remain owned by `to-spec`.

## Publish completeness and ready state

After every expected child and blocker edge passes read-back, Reconcile the parent publication record:

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

With no current record, write exactly one. With one matching record, reuse it. Conflicting or multiple records stop without mutation. The canonical body edges and `decomposition:v1` retain the complete directed graph in both representations; native evidence is additional only in `native`. The Decomposition publication record proves completeness and is never a child identity source. Read the written or reused record back once, retain its tracker-native comment identity or durable local record locator plus SHA-256 exact-body digest, then advance `decomposition.read_back` before changing `ready-for-agent`.

A failure before or during record publication is recoverable partial publication by key: report the complete mapping, edge state, and selected seal. A bootstrap rerun must reuse all matching children and publish only the missing parent record. A fresh retry reuses the exact consumed Planning Seal from its upstream handoff; never cross-select a seal from another operation.

Compute readiness only after record read-back. An open child whose every owned and External blocker is closed belongs to the dependency-ready frontier. Apply `ready-for-agent` only to those children; remove a stale ready label from every open blocked or closed child. Blocked or closed children receive no ready label. Read every resulting child ready state back once and advance `ready_state.read_back` only when every state matches the published logical graph.

## Append the composite Run handoff

Append or reuse one final `handoff.completed` bound to upstream publication and upstream handoff identities, this current operation receipt, exact Decomposition comment identity or durable local record locator and SHA-256 body digest, parent/tracker identity, target, Planning Seal, complete key-to-Issue mapping, blocker edges, Multi-Issue classification, and approved-scope identity. The current operation receipt contains the transaction identity plus exact `decomposition.read_back` and `ready_state.read_back` receipts. With no current matching handoff append exactly one; with one exact matching handoff reuse it. Conflicting or multiple handoffs stop without mutation. Read the receipt back exactly before advancing `handoff.completed`.

Report the dependency-ready frontier without a child `/execute-issue` command and end with exactly `/run-issue-workflow <Spec-ID>`. This producer never schedules tasks or depends on Codex, Orca, titles, inferred blockers, or a global queue. A current transaction, upstream publication/handoff, child, relation, record, label, final handoff, target, scope, or identity failure preserves and reports exact partial state and stops without rollback, duplication, scheduling, task creation, Run start, implementation, closeout, push, or deploy.
