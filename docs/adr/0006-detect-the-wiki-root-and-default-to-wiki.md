---
status: accepted
---

# Detect the Wiki root and default to `wiki/`

Each repository records its exact Canonical Wiki root in `docs/agents/ron-workflow.md`. Setup classifies an existing repository-local knowledge root as `adoptable` only when all of these are evidenced:

- it is Git-tracked;
- it exists at the fixed target SHA;
- its scope is current business behavior rather than a document archive;
- it has a topic or page inventory or index;
- no competing source claims canonical authority.

Failure of any criterion produces `needs-bootstrap`. Such a root may provide source seeds for bootstrap or migration but cannot be adopted as canonical. When no root is adoptable, setup proposes `wiki/`.

`adoptable` permits setup to propose reuse; it does not implicitly prove a reviewed `ready` baseline. Direct `/setup-ron` invocation may carry a bounded clean-path delegation for the exact configuration proposal. When the assessment and required baseline-review evidence are clean, setup may record the root without another prompt; any ambiguity, competing authority, missing proof, or scope change stops for human decision. Without valid baseline-review evidence it records `missing`.

Ron skills resolve this configuration rather than hard-code a path. Change Specs, Issue history, ADRs, workflow configuration, and temporary artifacts keep their existing authorities and do not move into the Wiki root.
