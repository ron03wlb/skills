---
status: accepted
---

# Use the bundled local Planning Lane Provider

Planning document writes use the coordinator's bundled Git Planning Lane Provider as their only allocator. It durably binds an opaque task ID, allocation ID, proposed Spec identity, target, baseline, relevant source facts, and an isolated native Git worktree. Compatible retries reuse that allocation; only a clean lane with unchanged relevant facts may rebind to a later target baseline.

This keeps allocation local to the repository workflow and avoids treating tracker URLs, remote endpoints, or credentials as planning-provider configuration. Those values are outside the planning-lane request and fail closed before allocation. Setup observes that the bundled surface is installed; grill-with-docs consumes it for accepted document-writing lanes.

The provider owns allocation, registration, and disposal. Setup and grilling do not duplicate its filesystem or Git mutations, and to-spec still owns Planning Seal writes and tracker publication. Validation is the provider's retry/rebind tests, including rejection of endpoint, remote-provider, and credential fields.
