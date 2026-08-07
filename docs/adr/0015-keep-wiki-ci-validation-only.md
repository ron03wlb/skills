---
status: superseded by ADR-0021
---

# Keep Wiki CI mechanical and validation-only

Wiki CI owns only deterministic mechanical validation: page contract, material-claim mappings, source-path existence, source-locator syntax and supported resolvability, internal links, navigation, configured builds, mechanical support-output drift, baseline-state consistency, and proof that validation leaves the tracked tree unchanged.

Semantic correctness belongs to an independent read-only human or agent Wiki reviewer examining one fixed candidate SHA against the prior Wiki, current Change Spec, code, tests, and Wiki reconciliation ledger. The content author, writable Coordinator, and Wiki engine may provide advisory findings but cannot self-accept. Only the allocated independent reviewer may produce `reviewed-clean`, and the Coordinator verifies its evidence.

CI may regenerate mechanical artifacts in temporary storage for comparison, but it does not edit, commit, push, publish, or otherwise accept Canonical Wiki content. Semantic changes occur only inside an authorized Ron Issue flow. Detected drift fails validation and can be investigated and reconciled through ready-state `/wiki`.

Ready-state `/wiki` reports the two proof axes separately. It may report a generic `clean` only when the mechanical result is `clean` and the semantic result is `reviewed-clean`. Its default human-facing output says only that validation passed. Exact candidate identity and the two detailed results remain in durable evidence; they appear only on request or when needed to explain findings or missing proof.

Clean, already-authorized work follows exception-only interaction and does not ask for another routine confirmation. Findings, ambiguity, changed scope, missing capability, or a new authorization boundary stop and present the problem and trade-offs. This reporting policy never grants a write or external capability by itself.

Publication remains a separately authorized capability.
