---
status: superseded by ADR-0022
---

# Focus Ron on local Issue delivery

Ron delivery no longer owns repository setup or Canonical Wiki maintenance: it relies on Matt's tracker and domain configuration, uses one bounded local lifecycle authorization across separately invoked execution and closeout, lets `execute-issue` own implementation plus Matt `code-review` and at most ten repair waves per invocation, and reserves `close-issue` for target refresh, Parent aggregate review, local integration, and closure. `/wiki` remains an independent Wiki-only edit, validation, semantic-review, repair, and local-commit flow, while `/remove-ron` removes only the retired repository-local Ron footprint; this trades per-phase Grants and Wiki coupling for fewer prompts and hashes while retaining fixed scope, compact hashed completion evidence, manual integration serialization, and external-delivery exclusions.
