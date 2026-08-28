---
status: accepted
---

# Prepare prerequisite artifacts before Issue execution

`pre-execute-issue` may prepare and statically validate a repository-declared prerequisite artifact in the same candidate identity chain later consumed by `execute-issue`, then pauses before any manual external mutation. Repository-defined syntax or static failures are repaired within that artifact and rechecked for at most five material repair waves per invocation; initial generation, retries without an artifact edit, and tool failures do not count. `WAITING_MANUAL` is unavailable until validation passes, and wave five still failing stops as `BLOCKED`. This avoids leaving artifact creation without an owner while keeping the seam narrow: if preparation requires Entity, business logic, or other remaining product implementation, the skill stops and returns that work to planning or `execute-issue` rather than silently expanding its authority.
