---
status: accepted
---

# Schedule delivery through pi-workflow with a domain-owned action reducer

`run-issue-workflow` keeps sole ownership of delivery authority while `pi-workflow` owns scheduling and durable run records, and `pi-subagents` owns Issue worker execution. The `pi-workflow` bundle is a thin host: a trusted bundle-local dynamic controller calls the existing deterministic **Domain action reducer**, and only the actions that reducer returns become official workflow tasks. The delivery graph is deliberately not re-expressed as static workflow JSON, and the host never decides scope, grants, budgets, retries, repair routing, close eligibility, or stop classification.

This supersedes the Codex-native coordinator, control-panel, control-bridge, and status-snapshot clauses of [ADR-0040](0040-run-tracker-specs-as-codex-native-dags.md). ADR-0040's sole Start authority, Issue-lane isolation, leaf execution and closeout-ordering clauses remain in force, as do ADR-0038, ADR-0051, ADR-0059, ADR-0067, and ADR-0069. `/run-issue-workflow <Spec-ID>` stays the sole Start authority and becomes a thin entry that validates the Grant and Run-ready handoff before starting the host run.

Basis: human decision A2 in the `grill-with-docs` session of 2026-09-15 (Pi session `01a0a417-5fc9-7443-9212-f2084dbbe124`). A2 was preferred over re-expressing the delivery graph as static workflow JSON because ADR-0059 already fixes one owner per seam and the reducer's interleaved retry, repair, and wait actions do not map onto a fixed graph; it was preferred over a worker-only swap because the bespoke coordinator, host bridge, host driver, and panel are the cost being removed.

The retired implementation surface is the Codex host boundary: `codex-host-driver.js`, `codex-host-bridge.mjs`, the Codex task lifecycle adapter, the loopback control bridge and panel, and `docs/agents/workflow-host.json`. The preserved contract surface is `execute-issue`, `close-issue`, `to-spec`, `to-tickets`, `verify-target-before-push`, `attest-target-contribution`, and `pre-execute-issue`.

Reversal or validation: verify that a dynamic controller can re-issue the reducer's already-journaled dispatch operations in recorded order on resume without weakening fail-closed behavior, that a retained managed worktree can be re-addressed by the later close stage in the target checkout, that the reducer's create-intent reservation still prevents duplicate dispatch, and that host concurrency can express `max_parallel` three with close waits outside those slots. Failure of the first check reopens the graph-ownership choice.
