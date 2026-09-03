---
status: accepted
---

# Derive operation identity from immutable workflow inputs

Workflow adapters derive a deterministic operation key from the canonical repository identity, stable Spec ID, approved publication hash, and workflow stage. Issue-scoped stages also include the stable Issue ID. A caller-provided correlation ID may aid diagnostics, but an arbitrary opaque caller ID cannot define operation authority or isolation.

Repeated invocations for the same immutable inputs attach to or resume the same logical operation. Different Specs, different Issues, and newly approved Spec revisions produce different keys and may proceed concurrently. This provides idempotency for duplicate invocations without introducing a repository-wide or machine-wide execution limit.

Contract adoption is explicit at completion boundaries. One immutable Spec-scoped `workflow_operation_identity_contract_adopted:v1` record freezes the exact identities and body hashes of already valid completion notes that lack the receipt. After adoption, an omitted receipt is legacy only when it is an exact frontier member; malformed, conflicting, unlisted, or digest-mismatched evidence stops. This compatibility record is independent from workflow-artifact adoption and grants no workflow authority.
