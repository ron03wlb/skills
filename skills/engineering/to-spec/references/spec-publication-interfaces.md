# Spec publication interfaces

Use these repository-configured adapters for a current ordinary Spec publication. Each owns its source and returns a compact read-back receipt; callers compare identities and never reconstruct another adapter's result. Fresh operations use `workflow-operation-identity.mjs` for one versioned operation identity receipt.

## Planning adapter

- `planning.readBaseline` calls owner-local `scripts/planning-entry.mjs`'s `readPlanningBaseline({ request, adapter })`. The request binds `repositoryId`, proposed or existing `specId`, `target`, `baseline`, `approvedScopeIdentity`, `trackerVersion` (a reservation version in primary mode), `relevantFacts` keyed by source locator, and explicit `acceptedChanges` entries with repository-relative `path` and `contentIdentity` (optionally its hunk identity). `adapter.readCurrent` reads the selected tracker identity/version/scope, current target `head`, and relevant source facts from their owners; it must not echo request fields as proof. Identity/version disagreement throws before publication, and a changed source returns `DRIFTED` with the owning source.
- `planning.allocateLane` accepts a proposed Spec identity, target, baseline, and explicit relevant facts; it atomically returns a durable allocation ID, adapter-issued opaque `taskId`, isolated worktree, and current compatible baseline. It rejects caller task IDs and worktree paths. An empty `acceptedChanges` list returns `COMPATIBLE` with the latest target SHA without reading or creating a lane. For actual glossary or ADR writes, `request.lane` carries the allocation ID, opaque `taskId`, and `worktree`; `adapter.readLane` proves the allocation, Git registration, isolation from the target checkout, repository/Spec/target/baseline ownership, equality, and exact accepted content. An ancestor baseline binds the latest target only when every explicit fact is unchanged; drift, a dirty allocated lane, or conflicting proof stops. The result's `requiresPlanningLane` selects the write boundary; it grants no commit or publication authority.
- Only `to-spec` primary mode resolves primary reservation before this read when its version does not exist yet, using the immutable proposed-Spec identity and the existing reservation adapter. Reservation grants no document write or published-scope authority. The tracker adapter still compare-and-sets the latest version at publication; the planning result does not replace that check.
- `planning.disposeLane` disposes of the registered lane after the `handoff.completed` read-back; the binding's action table owns its request, result, repeat, and stop conditions.
- `planningSeal.read` returns the exact target, Planning Seal SHA and `created`, `successor`, or `reused` state.
- `planningSeal.write` accepts one `COMPATIBLE` baseline, one exact accepted glossary or ADR patch, and the shared Target mutation writer lease; it returns the target ref and one read-back Planning Seal commit containing only that patch.

Only `planningSeal.write` needs the shared Target mutation writer; tracker-only publication reuses the current seal without a writer or worktree.

## Checkpoint adapter

- `checkpoint.read` takes the exact repository, Spec, producer `to-spec`, versioned operation identity receipt, profile version, target, baseline, and bindings. A fresh `to-spec@v2` operation gets its operation identity receipt from `bindProducerCheckpointOperationIdentity` in `workflow-operation-identity.mjs`; the receipt binds repository, Spec, approved publication identity or hash, producer `to-spec`, and stage `publication`. It returns no transaction or one exact transaction with its first unsatisfied stage.
- `checkpoint.create` calls `createProducerOperationCheckpoint`: it resumes an exact stored identity, otherwise creating only a fresh current `to-spec@v2` transaction. Its bindings contain the Planning Seal, classification, approved-scope identity, and owner-derived operation receipt. The generic store treats operation IDs and bindings as opaque. Its ordered stages are `planning_seal.read_back`, `publication.read_back`, and `handoff.completed`.
- `checkpoint.advance` appends one stage receipt and reads the exact transaction back. Repeating the same receipt is idempotent; a different receipt or out-of-order stage is a Hard gate.

An existing valid incomplete transaction-v1 or `to-spec@v1` receipt stays on its frozen profile: resume its exact plan, checkpoint, attestation, publication, and handoff stages; no v1 creation, v2 migration, plan regeneration, or receipt rewrite.

## Tracker adapter

- `tracker.reserve` takes the repository, `primary` or `revision` mode, exact operation identity, and requested Spec identity. Primary reservation calls `deriveSpecReservationOperationIdentity`; its bootstrap key uses only the repository and immutable proposed-Spec identity. It returns one immutable tracker identity; exact read-back replaces bootstrap authority with the reserved tracker identity and a Spec-bound versioned operation identity for later stages. Revision requires the existing Spec and its approved publication identity or hash.
- `tracker.read` returns that identity's body, comments, labels, version token, and publication identity.
- `tracker.publish` uses the mode proven during planning. Atomic CAS is used only when supported. On configured GitHub Issues, re-read the expected body/version, perform the authorized write, then verify the exact body and labels; report this as read/write/read-back, never CAS. If atomicity is an approved requirement, unsupported CAS blocks planning before Run-ready. It returns the observed version and publication identity; a timeout or missing response is unresolved until `tracker.read` proves the result.

## Handoff adapter

- `handoff.read` takes the exact current transaction identity and returns zero or one immutable handoff receipt.
- `handoff.append` writes one receipt binding that same producer, Spec, tracker, target, Planning Seal, transaction, publication, classification and approved-scope identities, then returns its immutable identity. Read it back before advancing `handoff.completed`.

## Dispositions

| Disposition | Evidence boundary | Result |
| --- | --- | --- |
| Hard gate | Continuing could target the wrong ref, duplicate or misattribute publication, or corrupt transaction state | Stop before the next mutation and report the conflicting identities. |
| Recoverable blocker | The owning source is readable but needs human repair or renewed confirmation | Report the owning source, observed evidence, smallest human action, preserved stages, and same `/to-spec` retry. |
| Advisory | Cannot affect mutation identity, attribution, durable state, or published behavior | Keep it visible; it never blocks or changes authority. |

## Installed Codex GitHub binding

For this configured host, serialize owner-verified publication and handoff fields through [GitHub payload encoding](../../../personal/run-issue-workflow/references/github-payloads.md). The installed reader consumes exact native comment IDs and body digests and never creates or repairs producer checkpoints; the producer still owns approval, ordered stage writes, and independent read-back.

## Installed GitLab producer binding

For GitLab tracker-only publication, use the separately installed [GitLab producer adapters](../../../personal/run-issue-workflow/references/gitlab-producer-adapters.md). The repository's `docs/agents/gitlab-producer.json` binds the host and project, supplying the concrete operations above. Setup may inspect the binding but cannot install or repair the package. Accepted document writes and decomposition remain separate owner capabilities; the Run entry composes its GitLab sources from this binding.
