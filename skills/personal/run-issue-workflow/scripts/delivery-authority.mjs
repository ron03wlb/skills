// The trusted bundle-local entry for deterministic delivery authority. A workflow bundle imports this
// module instead of reaching into individual owner modules. Every module reachable from here is
// authority-owned: none of them imports Codex host transport, task-lifecycle or presentation code, so
// a bundle loads the authority surface without the host boundary. The journal event schemas for
// host-produced delivery evidence are owned here because the journal stores and validates that
// evidence, while its producers stay in the host boundary.
// AUTHORITY_SURFACE records, per semantic the delivery contract lists, the authority modules this entry
// exposes as that semantic's owners. A row is a claim about ownership, not an exhaustive list of every
// module that participates: host store primitives that only persist a decision are excluded, and a
// module that exists only to define journalled event payload shape is not tied to one listed semantic.
// This entry's closure is the authoritative list of modules a bundle loads.
// The tests assert that each named module exists, that this entry reaches it, that the closure is exactly
// the intended authority modules, and that no other production module imports one directly.
export const AUTHORITY_SURFACE = Object.freeze({
  "run-identity-and-grant": ["run-core.mjs", "run-journal.mjs"],
  "operation-identity": ["workflow-operation-identity.mjs"],
  "approved-scope-and-decomposition": ["run-authority-adapters.mjs", "run-core.mjs"],
  "issue-execution-and-dispatch-budgets": ["issue-execution-budget.mjs", "run-core.mjs", "run-journal.mjs"],
  "material-repair-budget-and-model-policy": ["recovery-evidence.mjs", "model-repair-evidence.mjs", "issue-model-policy.mjs"],
  "closeout-authority-and-writer-serialization": ["run-target-writer-wait.mjs", "run-stale-proof.mjs", "close-continuation.mjs"],
  "cooperative-pause-graceful-stop-and-diagnosis": ["run-core.mjs", "recovery-compatibility.mjs"],
});

export * from "./run-authority-adapters.mjs";
export * from "./run-core.mjs";
export * from "./workflow-operation-identity.mjs";
export * from "./issue-execution-budget.mjs";
export * from "./issue-model-policy.mjs";
export * from "./recovery-evidence.mjs";
export * from "./model-repair-evidence.mjs";
export * from "./recovery-compatibility.mjs";
export * from "./run-journal.mjs";
export * from "./run-target-writer-wait.mjs";
export * from "./run-stale-proof.mjs";
export * from "./close-continuation.mjs";
export * from "./journal-event-schema.mjs";
