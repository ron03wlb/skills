# Decomposition publication interfaces

Use these repository-configured adapters for a current ordinary Multi-Issue decomposition. Each adapter owns its source and returns one compact read-back receipt; callers compare exact identities and never reconstruct another adapter's result. Producer policy selects and validates every input before calling these interfaces.

## Upstream adapter

- `upstream.readPublication` consumes the already-selected parent snapshot and returns the exact tracker Spec identity, publication identity, body version, target, Planning Seal, Multi-Issue classification, approved-scope identity, and next command.
- `upstream.readHandoff` takes that publication identity and returns the completed `to-spec` transaction and immutable handoff identities. Call both reads once from the same selected snapshot; never rerun upstream generation, planning, review, validation, or publication.

Fresh decomposition is tracker-only: no planning lane is required. The consumed seal, publication identity, body version, and approved scope still bind every mutation; accepted glossary or ADR writes return to `to-spec`.

## Checkpoint adapter

- `checkpoint.read` takes the exact repository, Spec, producer `to-tickets`, versioned operation identity receipt, profile version, target, baseline, and bindings. A fresh `to-tickets@v2` operation gets its operation identity receipt from `bindProducerCheckpointOperationIdentity` in `workflow-operation-identity.mjs`; the receipt binds repository, Spec, approved publication identity or hash, producer `to-tickets`, and stage `decomposition`. It returns no transaction or one immutable transaction read-back with its recorded first unsatisfied stage.
- `checkpoint.create` accepts already-validated operation bindings and the owner-derived receipt, delegates persistence to `createProducerOperationCheckpoint`, and returns one immutable transaction read-back.
- `checkpoint.advance` accepts the transaction identity and one owner-authorized stage receipt, appends it, and returns the exact transaction read-back.

## Tracker adapter

- `tracker.discoverChildren` returns every tracker-supported identity source for the expected Decomposition keys without mutation, plus the selected `blockingRepresentation`: exactly `body` or `native`. A missing, unreadable, or unsupported representation is `UNKNOWN`; producer policy stops before child, relation, label, or parent-record mutation and asks for one explicit `body` or `native` repair.
- `tracker.publishChild` creates one missing canonical child, including its canonical `## Blocked by` body section. `tracker.publishRelation` creates only one expected absent native parent relation or a blocking relation in `native` representation; it is never the body-mode blocker publisher. Each call returns an immutable Issue or relation identity after exact read-back.
- Ordinary child read-back returns the canonical body blocker edges in stable tracker-identity order. In `native` representation it additionally returns the native blocking relation evidence; body-mode read-back never infers a native relation.
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
