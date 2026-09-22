# Planning-adapter preflight

Run this preflight only when accepted glossary or ADR changes need a planning lane. It is a hard gate before any `lane-allocate` instruction, tool call, worktree creation, or document write. Read-only and tracker-only work keep their explicit empty accepted-change list and do not need it.

## Typed binding

Create or resume one user-visible checkpoint with these distinct fields:

```json
{
  "trackerIssueUrl": "https://gitlab.example/group/project/-/issues/189",
  "planningAdapterEndpoint": "https://planning.example/mcp",
  "planningAdapterCapability": "lane-allocate",
  "targetBranch": "feature/ron/#24846",
  "baselineIdentity": "ADR-0386:<accepted-baseline-identity>",
  "acceptedDecisions": [
    { "id": "decision-1", "decision": "…", "basis": "…", "source": "…" }
  ],
  "stage": "adapter_preflight_pending"
}
```

`trackerIssueUrl` is tracker metadata only. Parse it as an HTTPS GitLab Issue URL with a positive Issue IID; retain it as the proposed Spec identity and never use it to install, connect, or name an MCP server. `planningAdapterEndpoint` is an owner-supplied MCP server endpoint, not a web or tracker resource. Reject an endpoint that is equal to the tracker Issue URL or has an Issue, merge-request, project, or other tracker-web route. Do not infer an endpoint from the tracker host, repository remote, Issue URL, or branch.

Require `planningAdapterCapability` to be exactly `lane-allocate`. Validate the target branch and the baseline identity against the current target before allocation; for a recovered #189 request that means the exact `feature/ron/#24846` branch and the ADR-0386 baseline supplied by the request. Preserve the exact accepted decisions, including their basis and source, even when the preflight cannot run.

## Probe and gate

1. Inspect the host's connected MCP registry without mutation. Record its registered-server count and connected-server count.
2. Locate the planning adapter by its configured endpoint or registered adapter identity. If none is registered, return `registry_empty` when both counts are zero; otherwise return `adapter_missing`.
3. If it is registered but not connected, return `adapter_disconnected`.
4. Read its exposed tool list and require `lane-allocate`. If absent, return `capability_missing` with the discovered tool names.
5. Only after those checks and the target/baseline validation pass, return `ready` and invoke `lane-allocate` once with the preserved proposed Spec, target branch, ADR-0386 baseline identity, relevant facts, and accepted decisions needed by the allocation/handoff binding. Bind the returned allocation ID, opaque task ID, worktree, and revalidated baseline to this checkpoint and advance it to `lane_allocated`.

Treat these as structured outcomes, not prose inferred from a failed tool call: `registry_empty`, `adapter_missing`, `adapter_disconnected`, `capability_missing`, and `ready`. Record a redacted audit entry with endpoint source (never credentials), adapter name and version, exposed capability list, preflight outcome, and checkpoint/resume ID.

## Blocked recovery

For every outcome other than `ready`, save the checkpoint at `adapter_preflight_pending` and stop before allocation. Give one actionable diagnostic containing the registry counts, outcome, missing adapter or capability, discovered tools when present, the adapter-registration remedy, the checkpoint/resume ID, and this clarification: the GitLab Issue URL is tracker metadata, **not** an MCP endpoint.

The only remedy is for the adapter owner or Pi host to register and connect the explicitly supplied planning-adapter endpoint, or to follow an explicitly approved and recorded allocation procedure. Do not install an arbitrary GitLab URL, guess an endpoint, retry the grill, discard accepted decisions, or create an unbound/manual lane. Once a later preflight is `ready`, resume the preserved checkpoint directly at allocation; do not re-grill or request the already accepted decisions again.
