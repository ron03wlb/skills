---
status: accepted
---

# Serialize planning and delivery target writers

Planning and Issue delivery share one target-scoped **Target mutation serialization** boundary: `to-spec` acquires it for Planning Seal and workflow-plan checkpoint commits, `to-tickets` for its workflow-plan checkpoint, and `close-issue` for candidate integration. A writer that cannot acquire the exact target lease stops before Git or tracker mutation; it releases after its bounded target write and required authority read-back rather than holding the lease through the whole Spec or DAG lifecycle. Issue worktrees and different targets remain concurrent. We chose one common boundary over separate planning and closeout locks because independent namespaces still permit target races, while a global workflow lock would unnecessarily serialize unrelated targets and Issue execution.
