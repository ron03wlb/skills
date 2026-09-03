# Decomposition publication interfaces

Use these repository-configured adapters for a current ordinary Multi-Issue decomposition. Each adapter owns its source and returns one compact read-back receipt; callers compare exact identities and never reconstruct another adapter's result.

## Upstream adapter

- `upstream.readPublication` consumes the already-selected parent snapshot and returns the exact tracker Spec identity, publication identity, body version, target, Planning Seal, Multi-Issue classification, approved-scope identity, and next command.
- `upstream.readHandoff` takes that publication identity and returns the completed `to-spec` transaction and immutable handoff identities. Call both reads once from the same selected snapshot; never rerun upstream generation, planning, review, validation, or publication.

## Checkpoint adapter

- `checkpoint.read` takes the exact repository, Spec, producer `to-tickets`, opaque operation identity, profile version, target, baseline, and bindings. It returns no transaction or one exact transaction with its first unsatisfied stage.
- `checkpoint.create` creates only a fresh current `to-tickets@v2` transaction. Its bindings contain the tracker Spec, upstream publication and handoff, Planning Seal, Multi-Issue classification, and approved-scope identities. Its ordered stages are `decomposition.read_back`, `ready_state.read_back`, and `handoff.completed`.
- `checkpoint.advance` appends one stage receipt and reads the exact transaction back. Repeating the same receipt is idempotent; a different receipt or out-of-order stage is a Hard gate.

An existing valid incomplete transaction-v1 or `to-tickets@v1` receipt stays on its frozen profile. Resume its exact existing plan, checkpoint, attestation, decomposition, ready-state, and handoff stages; never create a v1 transaction, migrate it to v2, regenerate its plan, or rewrite a completed receipt.

## Tracker adapter

- `tracker.discoverChildren` returns every tracker-supported identity source for the expected Decomposition keys without mutation.
- `tracker.publishChild` creates one missing canonical child; `tracker.publishRelation` creates only one expected absent native parent or blocking relation. Each call returns an immutable Issue or relation identity after exact read-back.
- `tracker.readDecomposition` returns zero or one exact `decomposition:v1` record identity, exact body digest, key mapping, and blocker edges. `tracker.publishDecomposition` appends only the already-rendered record, then reads it back.
- `tracker.readReadyState` returns every mapped child's open/closed and ready-label state. `tracker.writeReadyState` applies only the state derived from published blockers and returns the complete frontier after read-back.

## Handoff adapter

- `handoff.read` takes the exact current transaction identity and returns zero or one immutable composite handoff.
- `handoff.append` writes one receipt binding the upstream publication and handoff identities, current operation transaction identity and completed decomposition/ready-state receipts, Decomposition publication identity and body digest, parent and tracker identity, target, Planning Seal, mapping, blocker edges, Multi-Issue classification, and approved-scope identity. Read it back before advancing `handoff.completed`.

## Dispositions

| Disposition | Evidence boundary | Result |
| --- | --- | --- |
| Hard gate | Continuing could target the wrong Spec or ref, duplicate or misattribute tracker publication, or corrupt transaction state | Stop before the next mutation and report the conflicting identities. |
| Recoverable blocker | The owning source is readable but needs human repair | Report the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-tickets` retry. |
| Advisory | The observation cannot affect mutation identity, attribution, durable state, or published behavior | Keep it visible; it never blocks or changes authority. |
