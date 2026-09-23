# Planning-lane preflight

Run this preflight only when accepted glossary or ADR changes need a planning lane. It is a hard gate before allocation, worktree creation, or document writing. Read-only and tracker-only work keep an explicit empty accepted-change list and need no lane.

## Local binding

The bundled local Planning Lane Provider is the only allocator. Create or resume one checkpoint with these fields:

```json
{
  "proposedSpecIdentity": "opaque proposed Spec identity",
  "target": "feature/ron",
  "baseline": "40-or-64-character commit",
  "relevantFacts": { "docs/adr/0001-example.md": "git-blob:<object-id>" },
  "acceptedChanges": []
}
```

Validate the target and baseline against the current local Git target. Preserve the proposed Spec identity, explicit relevant facts, and accepted changes. The allocator issues the opaque task ID, allocation ID, branch, and isolated worktree; callers never provide or derive them.

Provider endpoints, remote-provider selection, and credential fields are not part of this interface. Their presence is an attributable `bundled local provider only` stop. A tracker URL remains tracker metadata and is never a provider locator.

## Allocate and re-read

1. Call the bundled provider once with the exact binding.
2. On a first call, it durably records one allocation and materializes its isolated Git worktree.
3. On a compatible retry, it returns the same allocation and task identity. It may rebind an ancestor baseline only after every relevant fact still matches and the lane is clean.
4. On a changed fact, mismatched binding, missing native worktree, or dirty lane, preserve the allocation and stop before document writes.
5. Register accepted document bytes only after human acceptance, then re-read the registration through the provider before `to-spec` seals it.

The outcomes are `ALLOCATED` and `DRIFTED`, plus attributable fail-closed errors. A retry reads or completes only the durable exact allocation; it does not create a second worktree.
