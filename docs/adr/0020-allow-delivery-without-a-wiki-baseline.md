---
status: superseded by ADR-0021
---

# Allow delivery without a Wiki baseline

Ron permits semantic Issues to complete when the repository has no accepted Canonical Wiki baseline. Wiki-optional delivery skips only Wiki-specific gates, reconciliation, validation, mutation, and review while preserving the remaining authorization, execution, target-verification, and Issue-closeout guarantees; repositories with a ready baseline keep the existing Wiki flow.

This narrows ADR-0013: its bootstrap rules remain valid, but its ready-baseline gate does not apply to Wiki-optional delivery. Future bootstrap and historical backfill behavior are outside this decision.
