---
status: superseded by ADR-0021
---

# Delegate only the bounded clean path

Ron supports exception-only interaction through a human-originated `workflow-authorization:v1` clean-path delegation. The delegation is recorded before autonomous mutation and binds one repository action or Issue, the current Preview or Spec lineage, target branch and starting identity, exact code, artifact, and Wiki scope ceilings, named local capabilities, required validators, and exclusions.

The Coordinator may derive and record an exact downstream execution or closeout Grant only when:

- all referenced records and payload hashes verify;
- every exact write path is a subset of its approved ceiling;
- target refresh is denied; any movement from the bound starting identity invalidates the root, Preview, and derived Grants;
- mechanical validation and every required independent review pass;
- there are no findings, ambiguities, unverified claims, silent deletions, or new capabilities;
- the operation remains local and excludes push, remote merge, deploy, branch deletion, live-provider action, and legacy-data deletion.

The derived Grant records the human delegation source, Coordinator identity, exact Preview and evidence hashes, exact paths and capabilities, and derivation time. It cannot delegate further or widen the original ceiling.

Target drift or conflict, ceiling expansion, a path outside any applicable current ceiling, repair outside the approved envelope, or a missing/new capability stops the flow. Target drift requires a new human root and downstream records bound to the new identity. With the target unchanged, updated exact inputs inside every applicable current ceiling invalidate stale Preview/Grant evidence and require complete revalidation, but not a new human decision. Ron reports actual authorization problems and trade-offs for human decision. Revocation or supersession invalidates both the delegation and every unconsumed derived Grant.

Direct `/wiki` invocation may grant exactly one bounded clean initialization or ready-state sync, selected from verified baseline state. Initialization may use `publish_bootstrap_spec`; sync without an active change-owning Issue may use `publish_wiki_repair_spec`. Both may then use the existing `execute` and `close_standalone` capabilities, with writes restricted to exact Preview or ledger-derived paths, the target Wiki-state configuration path when applicable, and manifest-owned intermediates. `/wiki` publishes through the same shared Change Spec primitive used by `to-spec-ron`, records the resulting exact Issue authorization, and routes execution and closeout through the existing skills. This is not a second Change Spec format or closeout authority.

When no Issue exists yet, the exact clean-path ceiling is first recorded as a mode-`0600`, hash-verified `workflow-clean-path-delegation:v1` file under repository-local Git metadata. It binds one clean Preview and exactly one bootstrap- or repair-publish capability. After the shared publisher creates or reuses the Issue, both the Change Spec and exact execution contract must be published and read back. The Coordinator then writes an append-only `workflow-authorization:v1` Issue record that binds the local delegation ID and hash plus the exact Issue, Spec, contract, paths, and downstream capabilities. No Lane or execution starts before that Issue record verifies. Failure preserves the local record for recovery; successful Issue-record read-back permits deleting the local copy.
