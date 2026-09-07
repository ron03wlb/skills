---
status: accepted
---

# Carry Start authority through approved bootstrap

A human invocation of /run-issue-workflow <Spec-ID> selects delivery of that exact approved Spec; isolation of its workflow maintenance is not a demand for repeated permission. When Run creation is blocked by a governing-workflow defect and the selected Spec already identifies the maintenance Issue and approved installation scope, the active Codex task carries that existing human authority into a bounded maintenance operation outside the affected Run. Execution, review, installation and closeout retain their existing owners; the unavailable coordinator and a fabricated DAG Run Grant are not prerequisites for repairing it.

After exact installation and maintenance completion read-back, the active task revalidates the current Spec revision, producer handoff, tracker, Git, task, package and control evidence and continues the original Start. Ordinary Run creation and Grant read-back still precede product dispatch. Existing owner records carry maintenance progress and completion, allowing reconciliation to adopt completed maintenance without repeating execution or closeout. Uncertain outcomes are read back before retry; duplicates and changed ownership remain blockers.

This narrows ADR-0040's entry and repair boundary only for explicitly approved pre-Run maintenance. It introduces no generic permission to repair arbitrary infrastructure, no new user command, no second Grant or receipt framework, and no authority for push, deployment or database actions. Material scope or identity changes need an actual user decision; Pause, Stop, revoked authorization and unknown ownership prevent automatic continuation. Loss of the active task never implies background progress, and a later re-entry reuses exact durable evidence rather than treating remembered approval as proof of completed work.

We chose bounded authority continuity over requiring a user to invoke each internal leaf, and retained repair isolation over allowing a product Run to edit its own governing runtime. The bootstrap path must be verifiable independently of the code it repairs. Skill entry points reference the existing Run preparation owner for this branch instead of accumulating duplicated permission exceptions.
