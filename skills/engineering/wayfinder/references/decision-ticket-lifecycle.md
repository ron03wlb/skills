# Decision-ticket lifecycle

A Wayfinder child is a planning decision, not a delivery Issue. It has exactly these states:

1. **Open** — unclaimed or claimed while evidence is gathered.
2. **Blocked** — an unresolved native blocker or missing decision evidence prevents settlement.
3. **Settled** — one resolution comment records the decision, its evidence links, and the map impact; the tracker then closes the ticket.

Before claiming or preparing a decision that needs a planning lane, consume the setup-owned bundled local Planning Lane Provider readiness result. Only `READY` may continue. `MISSING` or `UNKNOWN` stops with the provider diagnostic and names `setup-matt-pocock-skills` as the next owner; Wayfinder neither configures a provider nor accepts endpoint, remote-provider, or credential input.

A resolution comment must state the settled decision, its evidence, affected tickets/fog, and whether the map's delivery route remains valid. Ambiguous evidence leaves the ticket open and names the evidence owner; it never closes by inference.

Closing a settled decision creates no Run, Grant, delivery lane, worktree, candidate, or implementation authority. Only a cleared map's recorded route may move to `grill-with-docs` or `to-spec`.
