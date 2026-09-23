# Spec publication interfaces

Use these repository-configured adapters for a current ordinary Spec publication. Each owns its source and returns a compact read-back receipt; callers compare identities rather than reconstructing another adapter's result. Fresh operations use `workflow-operation-identity.mjs`.

## Planning adapter

- `planning.readBaseline` calls `scripts/planning-entry.mjs`'s `readPlanningBaseline({ request, adapter })`. The request binds repository/Spec identity, target, baseline, approved scope, tracker version, source-keyed relevant facts, and accepted repository-relative changes with content identities. `adapter.readCurrent` independently reads tracker identity/version/scope, target head, and source facts; it must not echo request fields as proof. Identity disagreement throws; changed source facts return `DRIFTED` with their owner.
- `planning.allocateLane` accepts the proposed Spec, target, baseline, and relevant facts. It returns one durable allocation ID, adapter-issued opaque `taskId`, isolated worktree, and compatible baseline; caller task IDs and worktree paths are rejected. No accepted changes returns `COMPATIBLE` without a lane. A document write supplies its allocation, task ID, and worktree to `adapter.readLane`, which proves allocation, Git registration, isolation, ownership, equality, and exact accepted content. Drift, a dirty lane, or conflicting proof stops. `requiresPlanningLane` selects only this write boundary.
- Only `to-spec` primary mode resolves primary reservation before this read. Reservation creates no document-write or published-scope authority. `planning.disposeLane` disposes the registered lane after `handoff.completed` read-back.
- `planningSeal.read` returns target, Seal SHA, and `created`, `successor`, or `reused`. `planningSeal.write` accepts one compatible baseline, one accepted glossary/ADR patch, and the shared Target mutation-writer lease; it returns the target and a read-back Seal containing only that patch.

Only Seal writing needs the shared Target writer; tracker-only publication reuses the current Seal without a writer or worktree.

## Checkpoint adapter

- `checkpoint.read` takes repository, Spec, `to-spec`, versioned operation identity, profile, target, baseline, and bindings. Fresh `to-spec@v2` gets its operation identity receipt from `bindProducerCheckpointOperationIdentity`; it binds repository, Spec, approved publication identity or hash, producer `to-spec`, and stage `publication`. It returns no transaction or one exact transaction at its first unsatisfied stage.
- `checkpoint.create` persists and re-reads one `workflow-operation-envelope:v1` keyed by that identity. Its canonical intent contains title, UTF-8 body and digest, content type, and effects before tracker or target mutation; retries reuse it. It then resumes an exact transaction or creates only `to-spec@v2`. Bindings carry Seal, classification, approved scope, and owner-derived operation receipt. The ordered stages are `planning_seal.read_back`, `publication.read_back`, and `handoff.completed`; each owner receipt is appended to the envelope.
- `checkpoint.advance` appends and reads back one exact stage receipt. The same receipt is idempotent; changed or out-of-order receipts are Hard gates.

A valid incomplete transaction-v1 or `to-spec@v1` stays frozen: resume its exact stages without v1 creation, v2 migration, regeneration, or rewrite.

## Tracker adapter

- `tracker.reserve` takes repository, `primary` or `revision`, operation identity, and requested Spec identity. Primary reservation uses `deriveSpecReservationOperationIdentity` with the proposed-Spec identity; read-back returns the reserved tracker identity and Spec-bound versioned operation identity. Revision requires the existing Spec and approved identity/hash.
- `tracker.read` returns body, comments, labels, version token, and publication identity.
- `tracker.publish` uses the proven mode. Use CAS only when supported; GitHub otherwise reads, writes, and reads back expected body/version and labels. Timeout or missing response stays unresolved until `tracker.read` proves it.

## Handoff adapter

- `handoff.read` returns zero or one immutable receipt for the current transaction.
- `handoff.append` writes and returns one receipt binding producer, Spec, tracker, target, Seal, transaction, publication, classification, and approved scope; read it back before `handoff.completed`.

## Dispositions

| Disposition | Result |
| --- | --- |
| Hard gate | Stop before a mutation that could target the wrong ref, duplicate attribution, or corrupt state. |
| Recoverable blocker | Report owner, evidence, smallest human action, preserved stages, and the same `/to-spec` retry. |
| Advisory | Keep visible; it cannot change mutation, attribution, state, or published behavior. |

## Installed bindings

For this host, serialize GitHub publication and handoff fields through [GitHub payload encoding](../../../personal/run-issue-workflow/references/github-payloads.md); its reader consumes exact native comment IDs/body digests and never creates or repairs checkpoints. GitLab tracker-only publication uses the separately installed [GitLab producer adapters](../../../personal/run-issue-workflow/references/gitlab-producer-adapters.md), bound by `docs/agents/gitlab-producer.json`. Setup may inspect that binding, but publication, accepted document writes, and decomposition stay with their owning capabilities.
