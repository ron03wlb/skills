# Frozen decomposition legacy resume

Read this reference only when the exact operation has an existing valid incomplete `transaction-v1` or `to-tickets@v1` receipt. It is the sole compatibility owner for that branch.

Continue an existing valid incomplete `transaction-v1` or `to-tickets@v1` plan, checkpoint commit, attestation, decomposition, ready-state, and handoff at the first unsatisfied stage. This frozen exact resume permits no migration, copy, rewrite, delete, recreate, or fresh-operation shaping.

The original checkpoint and immutable `direct_target_contribution:v1` bindings remain attached to its final handoff. Reuse only its existing bound successor Planning Seal; never cross-select a seal from another operation. Report the existing checkpoint and attestation evidence with the ordinary partial-state report.

Any missing, mismatched, duplicate, out-of-order, or ambiguous receipt stops without mutation. A current `to-tickets@v2` operation never loads or adopts this branch.
