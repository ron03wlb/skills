# Coordinator lifecycle

> Retired surface: the Codex-native coordinator was removed with the host boundary in Issue 102. Its
> reducer-action materialization is governed by [the delivery host contract](delivery-host.md), which is
> the surviving authority. This page keeps only the retired coordinator's compact-outcome and no-repair
> boundaries for historical reconciliation; nothing here is an active launch or control path.

The retired coordinator composed `run-workflow.mjs`, `run-coordinator.mjs`, `run-batch.mjs`, the Codex
host bridge, the Codex task lifecycle adapter, and the loopback panel. That whole boundary is gone. The
surviving delivery host is the pi-workflow bundle at `workflows/deliver-tracker-spec/`, whose controller
asks `scripts/pi-workflow-host.mjs` what the Domain action reducer authorizes and materializes exactly
that; one executable Issue owns one isolated worker lane and one dedicated Issue worktree.

The retired coordinator's compact-outcome and no-repair boundaries remain the authoritative wording for
any historical journal it produced: each native observation journals a compact allowlisted `task.outcome`
receipt and normal completion does not read full task history; the task and delivery no-progress behavior
is owned by the [compact recovery outcome and progress diagnosis contract](recovery.md#compact-outcomes-and-progress-diagnosis). The coordinator never repaired product or workflow source: it only classified
evidence, dispatched the exact authorized owner, observed that owner, and resumed the same Run from the
next unsatisfied stage when the required evidence settled.
