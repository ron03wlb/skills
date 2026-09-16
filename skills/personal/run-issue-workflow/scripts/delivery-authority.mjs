// The trusted bundle-local entry for deterministic delivery authority. A workflow bundle imports this
// module instead of reaching into individual owner modules. Every module reachable from here is
// authority-owned: none of them imports Codex host transport, task-lifecycle or presentation code, so
// a bundle loads the authority surface without the host boundary. The journal event schemas for
// host-produced delivery evidence are owned here because the journal stores and validates that
// evidence, while its producers stay in the host boundary.
// AUTHORITY_SURFACE names the primary export of each authority semantic the delivery contract lists.
// It is a partition: every named export belongs to exactly one semantic, and each name must resolve
// to a real export of this entry.
export const AUTHORITY_SURFACE = Object.freeze({
  "run-identity-and-grant": [
    "reduceRunReadyHandoff",
    "reduceRun",
    "validateJournal",
  ],
  "operation-identity": [
    "deriveWorkflowOperationIdentity",
    "deriveRunOperationIdentity",
    "deriveExecuteIssueOperationIdentity",
    "deriveCloseIssueOperationIdentity",
    "deriveToSpecPublicationOperationIdentity",
    "deriveToTicketsOperationIdentity",
    "deriveAggregateVerificationOperationIdentity",
    "deriveSpecReservationOperationIdentity",
    "bindProducerCheckpointOperationIdentity",
    "assertWorkflowOperationIdentity",
  ],
  "approved-scope-and-decomposition": [
    "createRunAuthorityAdapters",
  ],
  "issue-execution-and-dispatch-budgets": [
    "createIssueExecutionBudgetController",
    "summarizeIssueExecutionBudget",
    "ISSUE_EXECUTION_LIMIT_MS",
    "DEFAULT_MAX_PARALLEL",
  ],
  "material-repair-budget-and-model-policy": [
    "nextRepairWave",
    "nextMaintenanceWave",
    "readRepairWaveCount",
    "readModelRepairBaseline",
    "modelDecisionInput",
    "validateModelPolicy",
    "validateFrozenModelDecision",
    "automaticUpgrade",
    "routeTechnicalRecovery",
  ],
  "closeout-authority-and-writer-serialization": [
    "validateCloseAuthorityEvidence",
    "createCloseWaitEvidence",
    "createTargetWriterWaitEvidence",
    "validateTargetWriterWaitEvidence",
    "planCloseContinuation",
    "completedCloseCleanup",
  ],
  "cooperative-pause-graceful-stop-and-diagnosis": [
    "planControl",
    "createRecoverableOperatorPacket",
    "REASON_CODES",
    "assessRecoveryCompatibility",
  ],
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
