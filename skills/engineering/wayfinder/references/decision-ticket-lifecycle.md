# Decision-ticket lifecycle

A Wayfinder child is a planning decision, not a delivery Issue. It has exactly these states:

1. **Open** — unclaimed or claimed while evidence is gathered.
2. **Blocked** — an unresolved native blocker or missing decision evidence prevents settlement.
3. **Settled** — one resolution comment records the decision, its evidence links, and the map impact; the tracker then closes the ticket.

Only decision preparation that needs a planning lane consumes the bundled local Planning Lane Provider readiness result; ordinary research, grilling, and decision-only tickets do not. This is a provider-seam receipt, not setup's aggregate health: setup observes the installed `git-planning-seal.mjs` surface as `PRESENT`, `MISSING`, or `UNKNOWN`; the provider receipt reduces `PRESENT` to `READY` and preserves `MISSING` or `UNKNOWN` with the diagnostic's owning source. Only `READY` may allocate a lane. Wayfinder neither configures a provider nor accepts endpoint, remote-provider, or credential input.

A resolution comment must state the settled decision, its evidence, affected tickets/fog, and whether the map's delivery route remains valid. Ambiguous evidence leaves the ticket open and names the evidence owner; it never closes by inference.

Closing a settled decision creates no Run, Grant, delivery lane, worktree, candidate, or implementation authority. Only a cleared map's recorded route may move to `grill-with-docs` or `to-spec`.
