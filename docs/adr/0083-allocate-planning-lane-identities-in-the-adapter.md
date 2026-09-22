---
status: accepted
---

# Allocate planning-lane identities in the adapter

Planning lanes receive their opaque task identity and isolated native worktree from one durable planning-adapter allocation keyed by repository, proposed Spec, and target, rather than requiring host task identity. The allocation rejects caller IDs and worktree paths, resumes its exact record, and may rebind an ancestor baseline only after every explicit relevant fact still matches current target bytes. This removes host-identity-only blocking while preserving equality-based provenance, lane isolation, and drift gates.

Basis: human decision in the #185 recovery discussion to issue durable adapter UUIDs and automatically rebind compatible ancestor baselines. Reversal or validation: prove retries reuse one allocation without duplicating a worktree, while fact drift, dirty lanes, and conflicting allocation evidence stop before document writes.
