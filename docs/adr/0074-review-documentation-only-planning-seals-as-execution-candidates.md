---
status: accepted
---

# Review documentation-only Planning Seals as execution candidates

When a Single-Issue's complete accepted outcome is the exact non-empty documentation diff already written in its Planning Seal, `to-spec` may publish a canonical declaration that names the Seal, its sole parent, and every changed documentation path. `execute-issue` may then retain that Seal as both execution baseline and candidate, but must review the sealed parent-to-Seal diff. The exception is valid only when the declaration explicitly excludes runtime, schema, API, deployment, Manual prerequisites, and every other execution change; it uses an explicit empty `workflowArtifacts` list and a completion `planning_seal_documentation:v1` review basis. `close-issue` and aggregate verification re-read the same evidence before trusting it.

The normal baseline-to-candidate contribution remains mandatory for every other Issue. The workflow never creates an empty marker commit, infers the exception from filenames or labels, treats sealed documentation as a workflow artifact, or converts this review basis into integration, push, or broader delivery authority. This refines ADR-0038's candidate rule for one already-sealed documentation outcome without changing its separate execution, closeout, and aggregate-verification ownership.

Source basis: direct workflow-maintenance request, 2026-09-14.
