# Pre-Spec Discovery Contract

Use this file only to shape `docs/project/discovery.md` in a consumer repository.

```yaml
---
status: discovery
current_gate: product_boundary
spec: null
updated: YYYY-MM-DD
---
```

Allowed status values:

- `discovery`
- `hold`
- `stopped`
- `ready_for_spec`
- `frozen`

Allowed gate values:

- `product_boundary`
- `product_risk`
- `architecture`
- `cost`
- `ready_for_spec`

Use these sections:

1. Project Profile
2. Problem, users, buyer, and success outcomes
3. MVP and non-goals
4. Facts, inferences, assumptions, and unresolved questions
5. Architecture candidates and trade-offs
6. Twelve-month Cash TCO and Effort Cost
7. Budget Envelope
8. Risk Triggers and mitigations
9. Design Approvals
10. Evidence links

Keep canonical acceptance criteria, Ticket execution state, implementation completion, commit state, integration, push, deployment, and runtime proof out of this brief. After Matt `to-spec` publishes, set `status: frozen` and `spec` to the tracker URL or local tracker path.
