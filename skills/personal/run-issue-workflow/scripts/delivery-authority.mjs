// This is the trusted bundle-local boundary for deterministic delivery authority.
// Hosts may read evidence and materialize returned actions, but never reimplement these decisions.
export const AUTHORITY_SURFACE = Object.freeze([
  "run-identity-and-grant",
  "operation-identity",
  "approved-scope-and-decomposition",
  "issue-execution-and-dispatch-budgets",
  "material-repair-budget-and-model-policy",
  "closeout-authority-and-writer-serialization",
  "cooperative-pause-graceful-stop-and-diagnosis",
]);

export { createRunAuthorityAdapters } from "./run-authority-adapters.mjs";
export {
  reduceRunReadyHandoff,
  createRecoverableOperatorPacket,
  reduceRun,
  planControl,
} from "./run-core.mjs";
export {
  deriveWorkflowOperationIdentity,
  deriveToSpecPublicationOperationIdentity,
  deriveToTicketsOperationIdentity,
  deriveRunOperationIdentity,
  deriveExecuteIssueOperationIdentity,
  deriveCloseIssueOperationIdentity,
  deriveAggregateVerificationOperationIdentity,
  deriveSpecReservationOperationIdentity,
  bindProducerCheckpointOperationIdentity,
  createProducerOperationCheckpoint,
  assertWorkflowOperationIdentity,
} from "./workflow-operation-identity.mjs";
export { createIssueExecutionBudgetController } from "./issue-execution-budget.mjs";
export {
  modelDecisionInput,
  validateModelPolicy,
  validateModelDecision,
  validateFrozenModelDecision,
  automaticUpgrade,
} from "./issue-model-policy.mjs";
export {
  recoveryDigest,
  bindTechnicalFailure,
  routeTechnicalRecovery,
  nextRepairWave,
  readRepairProgress,
  readRepairWaveCount,
  validateExecutionResolution,
  validateVerificationResolution,
} from "./recovery-evidence.mjs";
export { readModelRepairBaseline } from "./model-repair-evidence.mjs";
export {
  validateJournal,
  summarizeIssueExecutionBudget,
  DEFAULT_MAX_PARALLEL,
  ISSUE_EXECUTION_LIMIT_MS,
} from "./run-journal.mjs";
export {
  validateCloseAuthorityEvidence,
  createCloseWaitEvidence,
  createTargetWriterWaitEvidence,
  validateTargetWriterWaitEvidence,
} from "./run-target-writer-wait.mjs";
export { validateStaleOwnerProof, isExactStaleOwnerProof } from "./run-stale-proof.mjs";
export {
  completedCloseCleanup,
  planCloseContinuation,
  closeContinuationSuffix,
} from "./close-continuation.mjs";
