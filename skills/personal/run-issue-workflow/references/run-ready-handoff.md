# Run-ready handoff

Read this reference only after selecting one exact Run and before cleanup, writer acquisition, Grant creation or renewal, panel open, task action, or leaf mutation. It solely owns immediate-upstream producer reduction and grants no producer-repair authority.

## Owning-source facts

Repository-owned `run-authority-adapters.mjs` turns owning sources for checkpoint and handoff read-back, tracker and Decomposition state, target state, and shared writer liveness into internal adapters; callers never supply or invent `handoff.read`. The handoff adapter runs once with the already-read tracker and reconciliation snapshots, reuses their selected Spec, target, Planning Seal, classification, approved scope, publication, and Decomposition facts, and performs the one Git-common-dir Workflow checkpoint classification read needed to return `run-ready-handoff-facts:v1`.

A Fresh Single-Issue Run reads only the current `to-spec` publication and handoff. A Fresh Multi-Issue Run reads only the current `to-tickets` upstream publication, upstream handoff, operation receipt, and valid `decomposition:v1` identity, digest, mapping, and blocker edges. Frozen legacy/profile-v1 handoffs retain their immutable record identities. Never coordinate two producer transactions or trust titles, labels alone, plan filenames, cached status, or inferred history.

## Reduction

Reduce the facts with `run-core.mjs`:

- `READY` requires the selected Spec, target, Planning Seal, classification, approved-scope identity, expected producer, completed handoff and transaction, required tracker publication identities, clean target, and Multi-Issue decomposition identity to agree. A current Single-Issue handoff matches its exact transaction identity and publication read-back. A current Multi-Issue handoff additionally matches its operation and tracker read-back, including upstream identities, operation stage receipts, decomposition digest and mapping, ready frontier, and blocker edges. Completed immutable transaction receipts are readable and non-blocking.
- `INCOMPLETE` requires one exact consistent transaction whose profile, Spec, target, Planning Seal, classification, approved-scope identity, baseline, transaction identity, and first unsatisfied stage are bound. A current producer never owns target dirt; known unrelated dirt does not change its retry, while unknown or purported current-producer ownership is `UNKNOWN`. A frozen profile additionally binds its initially-clean state, plan path, and generated-content identity. Return the exact `/<producer> <Spec-ID>` retry command, compact evidence, next owner, and retry predicates before any Run mutation. Never resume the producer, commit its plan, attest, publish, relabel, or delete its receipt.
- `UNKNOWN` covers missing, unreadable, malformed, contradictory, multiple, stale, drifted, legacy plan-only, dirty-target-without-owner, and identity-ambiguous evidence. Return a stable reason code; exact observed checkpoint and handoff producer, Spec, target, Planning Seal, classification, scope, record, and decomposition values; affected Spec and target; next owner; no-automatic-transition statement; and recovery predicates. Never guess ownership, synthesize a handoff, treat ordinary dirt as producer work, or dispatch.

Compare both `READY` and actionable `INCOMPLETE` authority with the live selected reconciliation. Any mismatch becomes `UNKNOWN` with the exact conflicting field, observed handoff value, and expected selected value; never return a retry command for stale producer authority.

This boundary does not revalidate producer generation, generated-content hashes, whole-commit checkpoint eligibility, v1 record semantics, producer review or tests, aggregate coverage, or producer retry correctness. Those remain upstream. The coordinator consumes the result before `onSelected`, so non-`READY` results may perform only the read-only cleanup preview and cannot apply cleanup, acquire an engine or target writer, append a Grant, open the panel, create or message a task, invoke a leaf, or mutate tracker or Git state.
