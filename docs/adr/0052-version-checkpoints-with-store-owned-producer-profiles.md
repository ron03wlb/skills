---
status: accepted
---

# Version checkpoints with store-owned producer profiles

Introduce `workflow-checkpoint-transaction:v2`, in which each transaction names a versioned **Producer checkpoint profile** selected and validated by the store. `to-spec@v1` owns its five-stage sequence and `to-tickets@v1` owns its six-stage sequence, while callers cannot supply arbitrary stages. Existing completed v1 receipts remain readable and immutable; we chose a successor schema over expanding v1 because changing its strict identity, progress, and completion semantics in place would make historical receipt meaning depend on the reader version.

An exact valid incomplete v1 transaction uses **Legacy checkpoint resume**: the successor store continues it under the frozen five-stage v1 semantics and never rewrites it as v2. Malformed, ambiguous, or identity-incomplete v1 state fails closed, and every newly created transaction uses v2. This avoids manufacturing profile or identity evidence that the original receipt never recorded.

Legacy and v2 receipts remain in the same checkpoint directory under their schema-derived keys. Exact-operation discovery checks only the derivable legacy and current keys: one matching receipt is reused, no match permits v2 creation, and both schemas for the same operation return `UNKNOWN`. Receipts for unrelated operations are ignored, and the store never copies, renames, rewrites, or deletes historical state.
