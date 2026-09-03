---
status: accepted
---

# Derive operation identity from immutable workflow inputs

Workflow adapters derive a deterministic operation key from the canonical repository identity, stable Spec ID, approved publication hash, and workflow stage. Issue-scoped stages also include the stable Issue ID. A caller-provided correlation ID may aid diagnostics, but an arbitrary opaque caller ID cannot define operation authority or isolation.

Repeated invocations for the same immutable inputs attach to or resume the same logical operation. Different Specs, different Issues, and newly approved Spec revisions produce different keys and may proceed concurrently. This provides idempotency for duplicate invocations without introducing a repository-wide or machine-wide execution limit.
