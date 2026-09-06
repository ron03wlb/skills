# Spec publication interfaces

Use these repository-configured adapters for a current ordinary Spec publication. Each adapter owns its source and returns a compact read-back receipt; callers compare identities and never reconstruct another adapter's result. Fresh operations use the owner-local `workflow-operation-identity.mjs` module for one versioned operation identity receipt.

## Planning adapter

- `planning.readBaseline` calls owner-local `scripts/planning-entry.mjs`'s `readPlanningBaseline({ request, adapter })`. The request binds `repositoryId`, proposed or existing `specId`, `target`, `baseline`, `approvedScopeIdentity`, `trackerVersion` (a reservation version in primary mode), `relevantFacts` keyed by source locator, and explicit `acceptedChanges` entries with repository-relative `path` and `contentIdentity` (an exact accepted patch may include its hunk identity). `adapter.readCurrent` reads the selected tracker identity/version/scope, current target `head`, and relevant source facts from their owners; it must not echo request fields as proof. Identity/version disagreement throws before publication, and a changed source returns `DRIFTED` with the owning source.
- An empty `acceptedChanges` list returns `COMPATIBLE` with the latest target SHA without reading or creating a lane. For actual glossary or ADR writes, `request.lane` binds `taskId` and `worktree`; `adapter.readLane` proves Git registration, isolation from the target checkout, repository/Spec/target/baseline ownership, and exact accepted content. Missing or conflicting proof stops. The result's `requiresPlanningLane` selects the write boundary; it grants no commit or publication authority.
- Resolve primary reservation before this read when its version does not exist yet, using the immutable proposed-Spec identity and the existing reservation adapter. Reservation grants no document write or published-scope authority. The tracker adapter still compare-and-sets the latest version at publication; the planning result does not replace that check.
- `planningSeal.read` returns the exact target, Planning Seal SHA and `created`, `successor`, or `reused` state.
- `planningSeal.write` accepts one `COMPATIBLE` baseline, one exact accepted glossary or ADR patch, and the shared Target mutation writer lease. It returns the target ref and one read-back Planning Seal commit containing only that patch.

The shared Target mutation writer is needed only by `planningSeal.write`; tracker-only publication reuses the current seal without a writer or worktree.

## Checkpoint adapter

- `checkpoint.read` takes the exact repository, Spec, producer `to-spec`, versioned operation identity receipt, profile version, target, baseline, and bindings. A fresh `to-spec@v2` operation gets its operation identity receipt from `bindProducerCheckpointOperationIdentity` in `workflow-operation-identity.mjs`; the receipt binds repository, Spec, approved publication identity or hash, producer `to-spec`, and stage `publication`. It returns no transaction or one exact transaction with its first unsatisfied stage.
- `checkpoint.create` calls `createProducerOperationCheckpoint`, which first resumes an exact stored identity and otherwise creates only a fresh current `to-spec@v2` transaction. Its bindings contain the Planning Seal, classification, approved-scope identity, and owner-derived operation receipt. The generic store treats operation IDs and bindings as opaque persistence data. Its ordered stages are `planning_seal.read_back`, `publication.read_back`, and `handoff.completed`.
- `checkpoint.advance` appends one stage receipt and reads the exact transaction back. Repeating the same receipt is idempotent; a different receipt or out-of-order stage is a Hard gate.

An existing valid incomplete transaction-v1 or `to-spec@v1` receipt stays on its frozen profile. Resume its exact existing plan, checkpoint, attestation, publication, and handoff stages; never create a v1 transaction, migrate it to v2, regenerate its plan, or rewrite a completed receipt.

## Tracker adapter

- `tracker.reserve` takes the repository, `primary` or `revision` mode, exact operation identity, and requested Spec identity. Primary reservation calls `deriveSpecReservationOperationIdentity`; its bootstrap key uses only the repository and immutable proposed-Spec identity. It returns one immutable tracker identity; exact read-back then replaces bootstrap authority with the reserved tracker identity and a Spec-bound versioned operation identity for every later stage. Revision requires the existing Spec and its approved publication identity or hash.
- `tracker.read` returns that identity's body, comments, labels, version token, and publication identity.
- `tracker.publish` compare-and-sets the expected version token with the canonical body and `ready-for-agent` label, then returns the new version token and publication identity. A timeout or missing response is unresolved until `tracker.read` proves the result.

## Handoff adapter

- `handoff.read` takes the exact current transaction identity and returns zero or one immutable handoff receipt.
- `handoff.append` writes one receipt binding producer, Spec, tracker identity, target, Planning Seal, transaction identity, publication identity, classification, and approved-scope identity, then returns its immutable identity. Read it back before advancing `handoff.completed`.

## Dispositions

| Disposition | Evidence boundary | Result |
| --- | --- | --- |
| Hard gate | Continuing could target the wrong ref, duplicate or misattribute publication, or corrupt transaction state | Stop before the next mutation and report the conflicting identities. |
| Recoverable blocker | The owning source is readable but needs human repair or renewed confirmation | Report the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-spec` retry. |
| Advisory | The observation cannot affect mutation identity, attribution, durable state, or published behavior | Keep it visible; it never blocks or changes authority. |
