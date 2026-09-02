---
status: accepted
---

# Scope checkpoints to one producer operation

A v2 checkpoint `scopeKey` contains only repository identity, Tracker Spec identity, producer command, and operation or revision identity. The full transaction identity separately binds target, profile, baseline, and producer-owned evidence: an exact match resumes, while drift under the same scope conflicts. Different operations may coexist on one target, and only an actual target mutation uses the shared Target mutation writer.

The checkpoint store remains a thin idempotency and persistence boundary. It validates the store-owned profile, ordered progress, exact retry, atomic state, and scope conflict; Tracker Spec content, approved scope, Issue contracts, blockers, relationships, labels, and handoff semantics remain with the producer and concrete tracker adapters. We chose this over a target-wide checkpoint gate or generic workflow rule engine so workflow governance does not displace Issue delivery logic.

The operation or revision identity is an opaque non-empty value to the store. Producers may use values such as `primary`, `revision:<identity>`, or `decomposition:<approved-scope-identity>`, but the store neither parses them nor derives a profile from them; profile selection comes only from the producer command and explicit profile version.

Producer-specific authority identities live in one secret-free **Producer checkpoint bindings** object. The store persists its canonical form and requires exact equality on retry, but does not define or validate its semantic fields. The producer adapter owns the required bindings and must re-read their owning sources before creating or resuming a transaction.

Each completed stage persists one opaque **Checkpoint stage receipt** without a common receipt envelope or persisted receipt digest. The store requires a non-empty secret-free object, stable key-order canonicalization, profile order, and canonical equality on retry; the producer adapter owns the receipt fields and may advance only after authoritative read-back. This keeps the store a minimal crash/retry sequencer while Issue publication remains the primary workflow.

Producer and Run gates use an exact-operation read as their only checkpoint authority. Checkpoint creation and advancement lock only that operation scope; unrelated incomplete transactions on the same target neither conflict nor block. A repository or target listing may remain for diagnostics, but its aggregate state cannot authorize or deny workflow progress. Actual target-branch writes continue to use the separate shared Target mutation writer.

The store exposes no target-wide checkpoint classifier. Its public authority surface is exact-operation read, create, and advance only. If setup later needs repository-wide diagnostics, that belongs in a separate read-only adapter and cannot authorize or block producer or Run progress.
