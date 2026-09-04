import { CONTROL_COMMANDS, validateJournal } from "./run-journal.mjs";
import {
  createCloseWaitEvidence,
  validateCloseAuthorityEvidence,
} from "./run-target-writer-wait.mjs";

export const FACT_SCHEMA = "dag-run-facts:v1";
export const STATUS_SCHEMA = "dag-run-status:v1";
export const RUN_READY_FACT_SCHEMA = "run-ready-handoff-facts:v1";
export const RUN_READY_RESULT_SCHEMA = "run-ready-handoff:v1";
export const REPOSITORY_CLOSE_WAIT_TIMEOUT_MS = 30_000;
export const TARGET_WRITER_WAIT_TIMEOUT_MS = 30_000;
export const RUN_STATES = Object.freeze([
  "RECONCILING",
  "RUNNING",
  "WAITING_FOR_REPOSITORY_CLOSE_LEASE",
  "WAITING_FOR_TARGET_WRITER",
  "PAUSING",
  "PAUSED",
  "BLOCKED",
  "STOPPING",
  "STOPPED",
  "SUCCEEDED",
]);
export const NODE_STATES = Object.freeze([
  "PENDING",
  "READY",
  "DISPATCHED",
  "EXECUTING",
  "RETRYING",
  "IMPLEMENTATION_COMPLETE",
  "CLOSING",
  "SUCCEEDED",
  "BLOCKED",
  "FAILED",
]);
export { CONTROL_COMMANDS };
export const REASON_CODES = Object.freeze({
  invalidFactSchema: "invalid_fact_schema",
  emptyDag: "empty_dag",
  grantMissing: "grant_missing",
  grantInvalid: "grant_invalid",
  grantIdentityConflict: "grant_identity_conflict",
  duplicateNode: "duplicate_node",
  unknownBlocker: "unknown_blocker",
  dependencyCycle: "dependency_cycle",
  journalScopeConflict: "journal_scope_conflict",
  evidenceContradiction: "evidence_contradiction",
  insufficientEvidence: "insufficient_evidence",
  failedDependency: "failed_dependency",
  workerFailed: "worker_failed",
  implementationBlocked: "implementation_blocked",
  dispatchAttemptsExhausted: "dispatch_attempts_exhausted",
  environmentUnresolved: "environment_unresolved",
  repositoryCloseLeaseConflict: "repository_close_lease_conflict",
  repositoryCloseLeaseOwnerChanged: "repository_close_lease_owner_changed",
  repositoryCloseLeaseWaitTimeout: "repository_close_lease_wait_timeout",
  repositoryCloseLeaseWaitCoordinatorLost: "repository_close_lease_wait_coordinator_lost",
  repositoryCloseLeaseWaitInterrupted: "repository_close_lease_wait_interrupted",
  repositoryCloseLeaseEvidenceChanged: "repository_close_lease_evidence_changed",
  closeRequestEvidenceChanged: "close_request_evidence_changed",
  closeWriterConflict: "close_writer_conflict",
  targetWriterOwnerChanged: "target_writer_owner_changed",
  targetWriterWaitTimeout: "target_writer_wait_timeout",
  targetWriterWaitCoordinatorLost: "target_writer_wait_coordinator_lost",
  targetWriterWaitInterrupted: "target_writer_wait_interrupted",
  targetWriterEvidenceChanged: "target_writer_evidence_changed",
  trackerUnavailable: "tracker_unavailable",
  targetDirty: "target_dirty",
  targetStateUncertain: "target_state_uncertain",
  parentStateUncertain: "parent_state_uncertain",
  pausedByUser: "paused_by_user",
  stoppedByUser: "stopped_by_user",
});

const compareIds = (left, right) => String(left).localeCompare(String(right), "en");
const isText = (value) => typeof value === "string" && value.length > 0;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const gitObjectPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const normalizedPathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\\).+/u;

const observedRunReadyFacts = (input) => ({
  targetState: isText(input?.targetState) ? input.targetState : null,
  checkpointState: isText(input?.checkpoint?.state) ? input.checkpoint.state : null,
  checkpointProfileVersion: isText(input?.checkpoint?.profileVersion)
    ? input.checkpoint.profileVersion
    : null,
  producerCommand: isText(input?.checkpoint?.producerCommand)
    ? input.checkpoint.producerCommand
    : isText(input?.handoff?.producerCommand) ? input.handoff.producerCommand : null,
  transactionIdentity: isText(input?.checkpoint?.transactionIdentity)
    ? input.checkpoint.transactionIdentity
    : null,
  handoffIdentity: isText(input?.handoff?.identity) ? input.handoff.identity : null,
  handoffTransactionIdentity: isText(input?.handoff?.transactionIdentity)
    ? input.handoff.transactionIdentity
    : null,
  handoffPublicationIdentity: isText(input?.handoff?.publicationIdentity)
    ? input.handoff.publicationIdentity
    : null,
  trackerRecordIdentities: Array.isArray(input?.trackerRecordIdentities)
    ? input.trackerRecordIdentities.filter(isText)
    : [],
  decompositionIdentity: isText(input?.decompositionIdentity) ? input.decompositionIdentity : null,
  targetOwnership: isText(input?.targetOwnership) ? input.targetOwnership : null,
  checkpointPlanningSeal: isText(input?.checkpoint?.planningSeal) ? input.checkpoint.planningSeal : null,
  checkpointClassification: isText(input?.checkpoint?.classification) ? input.checkpoint.classification : null,
  checkpointApprovedScopeHash: isText(input?.checkpoint?.approvedScopeHash)
    ? input.checkpoint.approvedScopeHash
    : null,
  checkpointBaseline: isText(input?.checkpoint?.baseline) ? input.checkpoint.baseline : null,
  checkpointPlanPath: isText(input?.checkpoint?.planPath) ? input.checkpoint.planPath : null,
  checkpointGeneratedContentIdentity: isText(input?.checkpoint?.generatedContentIdentity)
    ? input.checkpoint.generatedContentIdentity
    : null,
  handoffProducerCommand: isText(input?.handoff?.producerCommand) ? input.handoff.producerCommand : null,
  handoffSpecId: isText(input?.handoff?.specId) ? input.handoff.specId : null,
  handoffTarget: isText(input?.handoff?.target) ? input.handoff.target : null,
  handoffPlanningSeal: isText(input?.handoff?.planningSeal) ? input.handoff.planningSeal : null,
  handoffClassification: isText(input?.handoff?.classification) ? input.handoff.classification : null,
  handoffApprovedScopeHash: isText(input?.handoff?.approvedScopeHash)
    ? input.handoff.approvedScopeHash
    : null,
  handoffRecordIdentities: Array.isArray(input?.handoff?.recordIdentities)
    ? input.handoff.recordIdentities.filter(isText)
    : [],
  handoffDecompositionIdentity: isText(input?.handoff?.decompositionIdentity)
    ? input.handoff.decompositionIdentity
    : null,
  handoffUpstreamPublicationIdentity: isText(input?.handoff?.upstreamPublicationIdentity)
    ? input.handoff.upstreamPublicationIdentity
    : null,
  handoffUpstreamHandoffIdentity: isText(input?.handoff?.upstreamHandoffIdentity)
    ? input.handoff.upstreamHandoffIdentity
    : null,
  handoffDecompositionDigest: isText(input?.handoff?.decompositionDigest)
    ? input.handoff.decompositionDigest
    : null,
});

const runReadyResult = (input, {
  state,
  reasonCode,
  evidence,
  nextOwner,
  noAutomaticTransition,
  recoveryPredicates,
  transactionIdentity = null,
  firstUnsatisfiedStage = null,
  retryCommand = null,
}) => ({
  schema: RUN_READY_RESULT_SCHEMA,
  state,
  reasonCode,
  affectedScope: {
    specId: isText(input?.authority?.specId) ? input.authority.specId : null,
    target: isText(input?.authority?.target) ? input.authority.target : null,
  },
  observed: observedRunReadyFacts(input),
  evidence,
  nextOwner,
  noAutomaticTransition,
  recoveryPredicates,
  transactionIdentity,
  firstUnsatisfiedStage,
  retryCommand,
});

const unknownRunReady = (input, reasonCode, evidence, recoveryPredicates) => runReadyResult(input, {
  state: "UNKNOWN",
  reasonCode,
  evidence,
  nextOwner: "human",
  noAutomaticTransition: "Observed Run Entry evidence does not authorize an automatic transition.",
  recoveryPredicates,
});

const sameList = (left, right) => left.length === right.length
  && left.every((value, index) => value === right[index]);

const canonicalFact = (value) => {
  if (Array.isArray(value)) return value.map(canonicalFact);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalFact(value[key])]),
    );
  }
  return value;
};

const sameFact = (left, right) => JSON.stringify(canonicalFact(left))
  === JSON.stringify(canonicalFact(right));

export function reduceRunReadyHandoff(input) {
  const authority = input?.authority;
  const checkpoint = input?.checkpoint;
  const validAuthority = isRecord(authority)
    && isText(authority.specId)
    && isText(authority.target)
    && gitObjectPattern.test(authority.planningSeal)
    && ["SINGLE", "MULTI"].includes(authority.classification)
    && isText(authority.approvedScopeHash)
    && (authority.classification === "SINGLE"
      ? authority.decompositionIdentity === null
      : isText(authority.decompositionIdentity));
  if (input?.schema !== RUN_READY_FACT_SCHEMA || !validAuthority || !isRecord(checkpoint)
    || !isText(checkpoint.state) || !Array.isArray(input.trackerRecordIdentities)
    || !input.trackerRecordIdentities.every(isText) || !Array.isArray(input.evidence)
    || !input.evidence.every(isText)
    || !["NONE", "EXACT_PRODUCER", "UNOWNED", "UNKNOWN"].includes(input.targetOwnership)) {
    return unknownRunReady(
      input,
      "invalid_run_ready_facts",
      ["Expected one versioned Run-ready handoff fact set with exact authority and owning-source evidence."],
      ["supply_valid_run_ready_facts"],
    );
  }

  const expectedProducer = authority.classification === "SINGLE" ? "to-spec" : "to-tickets";
  const checkpointOwnsBaseScope = checkpoint.producerCommand === expectedProducer
    && checkpoint.specId === authority.specId
    && checkpoint.target === authority.target
    && checkpoint.planningSeal === authority.planningSeal
    && checkpoint.classification === authority.classification
    && checkpoint.approvedScopeHash === authority.approvedScopeHash
    && isText(checkpoint.transactionIdentity)
    && gitObjectPattern.test(checkpoint.baseline);
  const currentProfile = checkpoint.profileVersion === "v2";
  const frozenProfile = checkpoint.profileVersion === undefined
    || checkpoint.profileVersion === null
    || checkpoint.profileVersion === "v1";
  const currentBindingsOwnScope = isRecord(checkpoint.bindings)
    && checkpoint.bindings.approvedScopeIdentity === authority.approvedScopeHash
    && checkpoint.bindings.classification === authority.classification
    && checkpoint.bindings.planningSeal === authority.planningSeal
    && (authority.classification === "SINGLE"
      || isRecord(checkpoint.bindings.upstream)
        && isText(checkpoint.bindings.upstream.handoffIdentity)
        && isText(checkpoint.bindings.upstream.publicationIdentity));
  const checkpointOwnsScope = checkpointOwnsBaseScope
    && (currentProfile
      ? isText(checkpoint.operationId) && currentBindingsOwnScope
      : frozenProfile
        && checkpoint.initialTargetState === "CLEAN"
        && normalizedPathPattern.test(checkpoint.planPath)
        && sha256Pattern.test(checkpoint.generatedContentIdentity));
  if (input.evidence.length > 0 || ["UNKNOWN", "MULTIPLE"].includes(checkpoint.state)) {
    return unknownRunReady(
      input,
      "producer_evidence_ambiguous",
      input.evidence.length > 0 ? [...input.evidence] : [`Checkpoint state is ${checkpoint.state}.`],
      ["one_exact_readable_producer_state"],
    );
  }
  if (checkpoint.state === "LEGACY_PLAN_ONLY") {
    return unknownRunReady(
      input,
      "legacy_plan_only",
      ["A durable plan without one completed producer handoff is not Run authority."],
      ["producer_publishes_one_exact_completed_handoff"],
    );
  }
  if (["ACTIVE", "INCOMPLETE"].includes(checkpoint.state)) {
    if (!checkpointOwnsScope || !isText(checkpoint.firstUnsatisfiedStage)) {
      return unknownRunReady(
        input,
        "checkpoint_owner_ambiguous",
        ["The active or incomplete transaction does not prove one exact immediate-upstream producer and stage."],
        ["one_exact_producer_transaction_is_identified"],
      );
    }
    const frozenDirtyOwned = frozenProfile
      && input.targetState === "DIRTY"
      && input.targetOwnership === "EXACT_PRODUCER";
    const cleanTarget = input.targetState === "CLEAN" && input.targetOwnership === "NONE";
    const currentKnownUnownedDirt = currentProfile
      && input.targetState === "DIRTY"
      && input.targetOwnership === "UNOWNED";
    if (!frozenDirtyOwned && !cleanTarget && !currentKnownUnownedDirt) {
      return unknownRunReady(
        input,
        input.targetState === "DIRTY" ? "target_dirty_without_owner" : "target_state_uncertain",
        [`Target ${authority.target} does not have exact producer-owned incomplete state.`],
        ["target_is_clean_or_exact_incomplete_owner_is_proven"],
      );
    }
    return runReadyResult(input, {
      state: "INCOMPLETE",
      reasonCode: "producer_incomplete",
      evidence: [
        `${checkpoint.producerCommand} transaction ${checkpoint.transactionIdentity} is incomplete at ${checkpoint.firstUnsatisfiedStage}.`,
      ],
      nextOwner: checkpoint.producerCommand,
      noAutomaticTransition: "Run does not resume or repair an upstream producer transaction.",
      recoveryPredicates: [
        "transaction_is_inactive",
        "exact_retry_identity_matches",
        "producer_completes_handoff",
      ],
      transactionIdentity: checkpoint.transactionIdentity,
      firstUnsatisfiedStage: checkpoint.firstUnsatisfiedStage,
      retryCommand: `/${checkpoint.producerCommand} ${authority.specId}`,
    });
  }
  if (checkpoint.state === "ABSENT") {
    return unknownRunReady(
      input,
      "producer_handoff_missing",
      ["No completed immediate-upstream producer transaction is readable."],
      ["producer_handoff_is_readable"],
    );
  }
  if (checkpoint.state !== "COMPLETED") {
    return unknownRunReady(
      input,
      "invalid_run_ready_facts",
      [`Unsupported checkpoint state ${checkpoint.state}.`],
      ["supply_valid_run_ready_facts"],
    );
  }
  if (input.targetState === "DIRTY") {
    return unknownRunReady(
      input,
      "target_dirty_without_owner",
      [`Target ${authority.target} is dirty without one exact incomplete producer owner.`],
      ["target_is_clean_or_exact_incomplete_owner_is_proven"],
    );
  }
  if (input.targetState !== "CLEAN") {
    return unknownRunReady(
      input,
      "target_state_uncertain",
      [`Target ${authority.target} cleanliness is ${String(input.targetState ?? "unknown")}.`],
      ["target_state_is_known"],
    );
  }
  if (input.targetOwnership !== "NONE") {
    return unknownRunReady(
      input,
      "target_ownership_conflict",
      [`Clean target ${authority.target} has contradictory ownership state ${input.targetOwnership}.`],
      ["clean_target_has_no_dirty_owner"],
    );
  }
  if (!checkpointOwnsScope || checkpoint.firstUnsatisfiedStage !== null
    || !isText(checkpoint.handoffIdentity)) {
    return unknownRunReady(
      input,
      "producer_handoff_identity_conflict",
      ["The completed checkpoint does not bind the selected Spec, target, producer, or handoff identity."],
      ["completed_checkpoint_matches_selected_authority"],
    );
  }

  const handoff = input.handoff;
  if (!isRecord(handoff)) {
    return unknownRunReady(
      input,
      "producer_handoff_missing",
      ["The immediate-upstream handoff is missing."],
      ["producer_handoff_is_readable"],
    );
  }
  const handoffMatches = handoff.identity === checkpoint.handoffIdentity
    && handoff.producerCommand === expectedProducer
    && handoff.specId === authority.specId
    && handoff.target === authority.target
    && handoff.planningSeal === authority.planningSeal
    && handoff.classification === authority.classification
    && handoff.approvedScopeHash === authority.approvedScopeHash
    && Array.isArray(handoff.recordIdentities)
    && handoff.recordIdentities.every(isText)
    && handoff.decompositionIdentity === authority.decompositionIdentity;
  if (!handoffMatches) {
    return unknownRunReady(
      input,
      "producer_handoff_identity_conflict",
      ["The immediate-upstream handoff conflicts with selected Run authority or its completed checkpoint."],
      ["handoff_and_selected_authority_match"],
    );
  }

  const requiredRecordCount = authority.classification === "SINGLE" ? 1 : 2;
  const uniqueRecords = new Set(handoff.recordIdentities);
  if (handoff.recordIdentities.length !== requiredRecordCount
    || uniqueRecords.size !== requiredRecordCount
    || !sameList(handoff.recordIdentities, input.trackerRecordIdentities)) {
    return unknownRunReady(
      input,
      "tracker_record_identity_conflict",
      ["The handoff's immutable record identities do not match exact tracker read-back."],
      ["required_tracker_record_identities_match"],
    );
  }
  if (input.decompositionIdentity !== authority.decompositionIdentity) {
    return unknownRunReady(
      input,
      "decomposition_identity_conflict",
      ["The decomposition publication identity does not match selected Multi-Issue authority."],
      ["decomposition_identity_matches"],
    );
  }

  if (currentProfile && authority.classification === "SINGLE") {
    const stageReceipts = checkpoint.stageReceipts;
    const publicationReadBack = stageReceipts?.publicationReadBack;
    const currentPublicationMatches = isRecord(stageReceipts)
      && stageReceipts.planningSealReadBack?.planningSeal === authority.planningSeal
      && isRecord(publicationReadBack)
      && isText(publicationReadBack.publicationIdentity)
      && isText(publicationReadBack.trackerIdentity)
      && handoff.transactionIdentity === checkpoint.transactionIdentity
      && handoff.publicationIdentity === publicationReadBack.publicationIdentity
      && handoff.trackerIdentity === publicationReadBack.trackerIdentity
      && handoff.recordIdentities[0] === handoff.publicationIdentity;
    if (!currentPublicationMatches) {
      return unknownRunReady(
        input,
        "publication_handoff_identity_conflict",
        ["The current to-spec handoff conflicts with its transaction or publication read-back."],
        ["current_publication_handoff_matches_owning_sources"],
      );
    }
  }

  if (currentProfile && authority.classification === "MULTI") {
    const operationReceipt = handoff.operationReceipt;
    const stageReceipts = checkpoint.stageReceipts;
    const currentCompositeMatches = isText(handoff.upstreamPublicationIdentity)
      && isText(handoff.upstreamHandoffIdentity)
      && handoff.upstreamPublicationIdentity === checkpoint.bindings.upstream.publicationIdentity
      && handoff.upstreamHandoffIdentity === checkpoint.bindings.upstream.handoffIdentity
      && isRecord(operationReceipt)
      && operationReceipt.transactionIdentity === checkpoint.transactionIdentity
      && isRecord(stageReceipts)
      && sameFact(operationReceipt.decompositionReadBack, stageReceipts.decompositionReadBack)
      && sameFact(operationReceipt.readyStateReadBack, stageReceipts.readyStateReadBack)
      && sha256Pattern.test(handoff.decompositionDigest)
      && handoff.decompositionDigest === input.decompositionDigest
      && stageReceipts.decompositionReadBack?.decompositionIdentity === authority.decompositionIdentity
      && stageReceipts.decompositionReadBack?.decompositionDigest === input.decompositionDigest
      && sameFact(stageReceipts.readyStateReadBack?.frontier, input.readyFrontier)
      && isRecord(handoff.decompositionMapping)
      && sameFact(handoff.decompositionMapping, input.decompositionMapping)
      && Array.isArray(handoff.blockerEdges)
      && sameFact(handoff.blockerEdges, input.blockerEdges)
      && handoff.recordIdentities[0] === handoff.upstreamPublicationIdentity
      && handoff.recordIdentities[1] === authority.decompositionIdentity;
    if (!currentCompositeMatches) {
      return unknownRunReady(
        input,
        "composite_handoff_identity_conflict",
        ["The current to-tickets handoff conflicts with its operation or tracker read-back."],
        ["current_composite_handoff_matches_owning_sources"],
      );
    }
  }

  return runReadyResult(input, {
    state: "READY",
    reasonCode: null,
    evidence: [
      `${expectedProducer} handoff ${handoff.identity} matches Spec ${authority.specId}.`,
      `Target ${authority.target} is clean and its producer checkpoint is complete.`,
    ],
    nextOwner: "run-issue-workflow",
    noAutomaticTransition: null,
    recoveryPredicates: [],
  });
}

const reduceNodeState = (node, dispatchAttempts, remediationCycles) => {
  if (node.completionState === "BLOCKED") return "BLOCKED";
  if (node.completionState === "COMPLETE" && ["DISPATCHED", "EXECUTING"].includes(node.taskState)) {
    return "BLOCKED";
  }
  if (node.completionState === "COMPLETE") {
    if (node.trackerState === "CLOSED" && node.candidateReachable && node.worktreeState === "ABSENT") {
      return "SUCCEEDED";
    }
    if (node.candidateReachable) return "CLOSING";
    return "IMPLEMENTATION_COMPLETE";
  }
  if (node.taskState === "EXECUTING") return "EXECUTING";
  if (node.taskState === "DISPATCHED") return "DISPATCHED";
  if (node.taskState === "TRANSIENT_FAILURE") return dispatchAttempts >= 3 ? "FAILED" : "RETRYING";
  if (node.taskState === "ENVIRONMENT_FAILURE") return remediationCycles >= 1 ? "FAILED" : "RETRYING";
  if (node.taskState === "FAILED") return "FAILED";
  return "READY";
};

const diagnosis = ({
  reasonCode,
  limitationClass = "instance-blocker",
  evidence,
  attemptedRecovery = [],
  retryCount = 0,
  noAutomaticTransition,
  affectedNodes,
  allNodes,
  nextOwner = "human",
  resumePredicates,
  operatorPacket,
}) => ({
  reasonCode,
  limitationClass,
  evidence,
  attemptedRecovery,
  retryCount,
  noAutomaticTransition,
  affectedNodes,
  unaffectedNodes: allNodes.filter((issueId) => !affectedNodes.includes(issueId)),
  nextOwner,
  resumePredicates,
  ...(operatorPacket === undefined ? {} : { operatorPacket }),
});

export const createRecoverableOperatorPacket = ({
  owningSource,
  observedEvidence,
  smallestHumanAction,
  run,
  nodes,
}) => ({
  disposition: "Recoverable blocker",
  owningSource,
  observedEvidence: [...observedEvidence],
  smallestHumanAction,
  preservedStages: {
    run: { runId: run.runId, state: run.state },
    issues: nodes.map(({ issueId, state }) => ({ issueId, state })),
  },
  retryCommand: `/run-issue-workflow ${run.specId}`,
});

const publicRun = (run, state, maxParallel = 3) => ({
  runId: isRecord(run) && isText(run.runId) ? run.runId : null,
  specId: isRecord(run) && isText(run.specId) ? run.specId : null,
  approvedScopeHash: isRecord(run) && isText(run.approvedScopeHash) ? run.approvedScopeHash : null,
  target: isRecord(run) && isText(run.target) ? run.target : null,
  classification: isRecord(run) && isText(run.classification) ? run.classification : null,
  decompositionIdentity: isRecord(run) && isText(run.decompositionIdentity) ? run.decompositionIdentity : null,
  repositoryCloseLeaseOperationId: isRecord(run) && isText(run.repositoryCloseLeaseOperationId)
    ? run.repositoryCloseLeaseOperationId
    : null,
  repositoryCloseLeaseState: isRecord(run)
    && ["ABSENT", "ACTIVE", "UNKNOWN"].includes(run.repositoryCloseLeaseState)
    ? run.repositoryCloseLeaseState
    : "ABSENT",
  closeWriterRunId: isRecord(run) && isText(run.closeWriterRunId) ? run.closeWriterRunId : null,
  closeWriterState: isRecord(run) && ["ABSENT", "ACTIVE", "UNKNOWN"].includes(run.closeWriterState)
    ? run.closeWriterState
    : "UNKNOWN",
  state,
  maxParallel,
  controlRevision: isRecord(run) && Number.isSafeInteger(run.controlRevision) ? run.controlRevision : 0,
  controlCommand: isRecord(run) && CONTROL_COMMANDS.includes(run.controlCommand) ? run.controlCommand : null,
});

const publicNode = ({ node, state, dispatch = null, retryCount = 0, remediationCount = 0 }) => ({
  issueId: node.issueId,
  blockers: Array.isArray(node.blockers) ? [...node.blockers] : [],
  state,
  task: {
    ref: isRecord(dispatch?.taskRef) ? { ...dispatch.taskRef } : null,
    state: isText(node.taskState) ? node.taskState : "UNKNOWN",
    attempt: Number.isInteger(dispatch?.attempt) ? dispatch.attempt : 0,
    retryCount,
    remediationCount,
  },
  close: {
    completionState: isText(node.completionState) ? node.completionState : "UNKNOWN",
    candidateReachable: typeof node.candidateReachable === "boolean" ? node.candidateReachable : null,
    worktreeState: isText(node.worktreeState) ? node.worktreeState : "UNKNOWN",
    trackerState: isText(node.trackerState) ? node.trackerState : "UNKNOWN",
  },
});

const blockedResult = (input, reasonCode, evidence, affectedNodes = []) => {
  const allNodes = Array.isArray(input?.nodes)
    ? [...new Set(input.nodes.filter(isRecord).map(({ issueId }) => issueId).filter(isText))].sort(compareIds)
    : [];
  const affected = affectedNodes.length > 0 ? [...affectedNodes].sort(compareIds) : allNodes;
  return {
    schema: STATUS_SCHEMA,
    run: publicRun(input?.run, "BLOCKED"),
    nodes: allNodes.map((issueId) => publicNode({
      node: input.nodes.find((candidate) => candidate?.issueId === issueId),
      state: "BLOCKED",
    })),
    frontier: { ready: [], active: [], closeable: [] },
    legalActions: [],
    legalControls: ["STOP", "REFRESH"],
    diagnoses: [diagnosis({
      reasonCode,
      limitationClass: reasonCode.includes("evidence") || reasonCode.includes("grant")
        ? "unresolved-evidence"
        : "control-engine-defect",
      evidence,
      noAutomaticTransition: "The normalized input cannot authorize a safe transition.",
      affectedNodes: affected,
      allNodes,
      resumePredicates: [`supply_valid_facts:${reasonCode}`],
    })],
  };
};

const findDependencyCycle = (nodes) => {
  const byId = new Map(nodes.map((node) => [node.issueId, node]));
  const visited = new Set();
  const active = new Set();
  const visit = (issueId) => {
    if (active.has(issueId)) return issueId;
    if (visited.has(issueId)) return null;
    visited.add(issueId);
    active.add(issueId);
    for (const blocker of byId.get(issueId).blockers) {
      const cycle = visit(blocker);
      if (cycle) return cycle;
    }
    active.delete(issueId);
    return null;
  };
  for (const { issueId } of nodes) {
    const cycle = visit(issueId);
    if (cycle) return cycle;
  }
  return null;
};

export function reduceRun(input) {
  if (input?.schema !== FACT_SCHEMA || !isRecord(input.run) || !Array.isArray(input.nodes)
    || !Array.isArray(input.contradictions) || !Array.isArray(input.journal)) {
    return blockedResult(input, REASON_CODES.invalidFactSchema, ["Expected dag-run-facts:v1 normalized input."]);
  }
  if (input.nodes.length === 0) {
    return blockedResult(input, REASON_CODES.emptyDag, ["A DAG Run requires at least one executable Issue."]);
  }
  if (!input.nodes.every((node) => isRecord(node) && isText(node.issueId) && Array.isArray(node.blockers)
      && node.blockers.every(isText)
      && (node.failure === undefined || (isRecord(node.failure)
        && (node.failure.kind === undefined || isText(node.failure.kind))
        && (node.failure.fingerprint === undefined || isText(node.failure.fingerprint))
        && (node.failure.evidence === undefined || (Array.isArray(node.failure.evidence)
          && node.failure.evidence.every(isText))))))
    || !input.contradictions.every((contradiction) => isRecord(contradiction)
      && isText(contradiction.code) && Array.isArray(contradiction.evidence)
      && contradiction.evidence.every(isText) && Array.isArray(contradiction.affectedNodes)
      && contradiction.affectedNodes.every(isText)
      && (contradiction.reasonCode === undefined || isText(contradiction.reasonCode)))
    || !input.journal.every((event) => isRecord(event) && isText(event.type))
    || !isText(input.run.runId) || !isText(input.run.specId) || !isText(input.run.approvedScopeHash)
    || !isText(input.run.target) || !["SINGLE", "MULTI"].includes(input.run.classification)
    || (input.run.classification === "MULTI" && !isText(input.run.decompositionIdentity))
    || (input.run.classification === "SINGLE" && input.run.decompositionIdentity !== null)
    || typeof input.run.reconciled !== "boolean"
    || (input.run.repositoryCloseLeaseState !== undefined
      && !["ABSENT", "ACTIVE", "UNKNOWN"].includes(input.run.repositoryCloseLeaseState))
    || (input.run.repositoryCloseLeaseState === "ABSENT"
      && input.run.repositoryCloseLeaseOperationId !== null)
    || (["ACTIVE", "UNKNOWN"].includes(input.run.repositoryCloseLeaseState)
      && !isText(input.run.repositoryCloseLeaseOperationId))
    || !["ABSENT", "ACTIVE", "UNKNOWN"].includes(input.run.closeWriterState)
    || (input.run.closeWriterState === "ABSENT" && input.run.closeWriterRunId !== null)
    || (input.run.closeWriterState !== "ABSENT" && !isText(input.run.closeWriterRunId))) {
    return blockedResult(input, REASON_CODES.invalidFactSchema, ["Run identity and node facts are malformed."]);
  }
  if (input.run.classification === "SINGLE"
    && (input.nodes.length !== 1 || input.nodes[0].issueId !== input.run.specId)) {
    return blockedResult(input, REASON_CODES.invalidFactSchema, ["A SINGLE Run must contain only its Spec Issue node."]);
  }
  for (const node of input.nodes) {
    if (node.completionState !== "COMPLETE") continue;
    try {
      validateCloseAuthorityEvidence(
        node.closeAuthorityEvidence,
        `Issue ${node.issueId} close authority evidence`,
      );
      if (!gitObjectPattern.test(input.run.targetHead)
        || node.closeAuthorityEvidence.targetHead !== input.run.targetHead) {
        throw new TypeError(`Issue ${node.issueId} close authority targetHead must match the current target head`);
      }
    } catch (error) {
      return blockedResult(input, REASON_CODES.insufficientEvidence, [error.message], [node.issueId]);
    }
  }
  try {
    validateJournal(input.journal, { storageRunId: input.run.runId });
  } catch (error) {
    const reasonCode = /maxParallel/u.test(error.message)
      ? REASON_CODES.grantInvalid
      : REASON_CODES.invalidFactSchema;
    return blockedResult(input, reasonCode, [`Invalid Run journal: ${error.message}`]);
  }
  const grant = input.journal.findLast(({ type }) => type === "grant.recorded");
  if (!grant) {
    return blockedResult(input, REASON_CODES.grantMissing, ["No grant.recorded event exists."]);
  }
  const identity = grant.runIdentity ?? {};
  if (identity.runId !== input.run.runId || identity.specId !== input.run.specId
    || identity.approvedScopeHash !== input.run.approvedScopeHash || identity.target !== input.run.target
    || identity.classification !== input.run.classification
    || identity.decompositionIdentity !== input.run.decompositionIdentity) {
    return blockedResult(input, REASON_CODES.grantIdentityConflict, ["The current grant does not bind the normalized Run identity."]);
  }
  const maxParallel = grant.maxParallel === undefined ? 3 : grant.maxParallel;
  if (!Number.isInteger(maxParallel) || maxParallel < 1) {
    return blockedResult(input, REASON_CODES.grantInvalid, ["The Run Grant maxParallel must be a positive integer."]);
  }
  const seen = new Set();
  for (const { issueId } of input.nodes) {
    if (seen.has(issueId)) {
      return blockedResult(input, REASON_CODES.duplicateNode, [`Issue ${issueId} occurs more than once.`], [issueId]);
    }
    seen.add(issueId);
  }
  for (const { issueId, blockers } of input.nodes) {
    const unknown = blockers.find((blocker) => !seen.has(blocker));
    if (unknown) {
      return blockedResult(input, REASON_CODES.unknownBlocker, [`Issue ${issueId} references unknown blocker ${unknown}.`], [issueId]);
    }
  }
  const dependencyCycle = findDependencyCycle(input.nodes);
  if (dependencyCycle) {
    return blockedResult(input, REASON_CODES.dependencyCycle, [`Issue ${dependencyCycle} participates in a blocker cycle.`], [dependencyCycle]);
  }
  const parentWriterWait = (event) => input.run.classification === "MULTI"
    && event.issueId === input.run.specId
    && [
      "repository-close-wait.started",
      "repository-close-wait.settled",
      "target-writer-wait.started",
      "target-writer-wait.settled",
    ].includes(event.type);
  const outOfScopeJournalEvent = input.journal.find((event) => (
    [
      "dispatch.recorded",
      "retry.recorded",
      "remediation.recorded",
      "repository-close-wait.started",
      "repository-close-wait.settled",
      "target-writer-wait.started",
      "target-writer-wait.settled",
    ].includes(event.type)
      && !seen.has(event.issueId)
      && !parentWriterWait(event)
  ));
  if (outOfScopeJournalEvent) {
    return blockedResult(
      input,
      REASON_CODES.journalScopeConflict,
      [`Journal event ${outOfScopeJournalEvent.type} references out-of-scope Issue ${outOfScopeJournalEvent.issueId}.`],
    );
  }
  const normalizedNodes = [...input.nodes]
    .sort((left, right) => compareIds(left.issueId, right.issueId))
    .map((node) => ({ ...node, blockers: [...node.blockers].sort(compareIds) }));
  const allNodeIds = normalizedNodes.map(({ issueId }) => issueId);
  const dispatchAttemptsByIssue = new Map(allNodeIds.map((issueId) => [issueId, 0]));
  const latestDispatchByIssue = new Map();
  const retryCountByIssue = new Map(allNodeIds.map((issueId) => [issueId, 0]));
  const remediationCountByIssue = new Map(allNodeIds.map((issueId) => [issueId, 0]));
  const remediationCyclesByIssueAttemptAndFingerprint = new Map();
  const resolvedRemediations = [];
  for (const event of input.journal) {
    if (event.type === "dispatch.recorded" && dispatchAttemptsByIssue.has(event.issueId)) {
      dispatchAttemptsByIssue.set(
        event.issueId,
        Math.max(dispatchAttemptsByIssue.get(event.issueId), event.attempt ?? 0),
      );
      latestDispatchByIssue.set(event.issueId, event);
    }
    if (event.type === "retry.recorded" && retryCountByIssue.has(event.issueId)) {
      retryCountByIssue.set(event.issueId, retryCountByIssue.get(event.issueId) + 1);
    }
    if (event.type === "remediation.recorded") {
      const attempt = event.attempt ?? latestDispatchByIssue.get(event.issueId)?.attempt;
      const key = `${event.issueId}\0${attempt}\0${event.fingerprint}`;
      remediationCyclesByIssueAttemptAndFingerprint.set(
        key,
        Math.max(remediationCyclesByIssueAttemptAndFingerprint.get(key) ?? 0, event.cycle ?? 0),
      );
      resolvedRemediations.push({ ...event, attempt });
      if (remediationCountByIssue.has(event.issueId)) {
        remediationCountByIssue.set(event.issueId, remediationCountByIssue.get(event.issueId) + 1);
      }
    }
  }
  const byId = new Map(normalizedNodes.map((node) => [node.issueId, node]));
  const stateById = new Map();
  const failedDependencyDiagnoses = [];

  const deriveState = (issueId, visiting = new Set()) => {
    if (stateById.has(issueId)) return stateById.get(issueId);
    const node = byId.get(issueId);
    if (!node || visiting.has(issueId)) return "BLOCKED";
    const nextVisiting = new Set(visiting).add(issueId);
    const blockerStates = node.blockers.map((blocker) => [blocker, deriveState(blocker, nextVisiting)]);
    const failedBlockers = blockerStates
      .filter(([, state]) => ["BLOCKED", "FAILED"].includes(state))
      .map(([blocker]) => blocker);
    let state;
    if (failedBlockers.length > 0) {
      state = "BLOCKED";
      failedDependencyDiagnoses.push(diagnosis({
        reasonCode: REASON_CODES.failedDependency,
        evidence: failedBlockers.map((blocker) => `Issue ${blocker} cannot release its blocker edge.`),
        noAutomaticTransition: "A failed dependency cannot release this node.",
        affectedNodes: [issueId],
        allNodes: allNodeIds,
        resumePredicates: failedBlockers.map((blocker) => `dependency_succeeds:${blocker}`),
      }));
    } else if (blockerStates.some(([, blockerState]) => blockerState !== "SUCCEEDED")) {
      state = "PENDING";
    } else {
      const attempt = latestDispatchByIssue.get(issueId)?.attempt ?? 0;
      const remediationKey = `${issueId}\0${attempt}\0${node.failure?.fingerprint ?? ""}`;
      state = reduceNodeState(
        node,
        dispatchAttemptsByIssue.get(issueId),
        remediationCyclesByIssueAttemptAndFingerprint.get(remediationKey) ?? 0,
      );
    }
    stateById.set(issueId, state);
    return state;
  };

  const nodes = normalizedNodes.map((node) => publicNode({
    node,
    state: deriveState(node.issueId),
    dispatch: latestDispatchByIssue.get(node.issueId),
    retryCount: retryCountByIssue.get(node.issueId),
    remediationCount: remediationCountByIssue.get(node.issueId),
  }));
  failedDependencyDiagnoses.sort((left, right) => compareIds(left.affectedNodes[0], right.affectedNodes[0]));
  const nodeDiagnoses = normalizedNodes.flatMap((node) => {
    const state = stateById.get(node.issueId);
    if (node.completionState === "BLOCKED") {
      return [diagnosis({
        reasonCode: REASON_CODES.implementationBlocked,
        evidence: node.failure?.evidence ?? ["The Issue published implementation_blocked."],
        noAutomaticTransition: "Implementation-blocked evidence requires its named owner to resolve it.",
        affectedNodes: [node.issueId],
        allNodes: allNodeIds,
        resumePredicates: ["implementation_blocker_resolved"],
      })];
    }
    if (state === "FAILED" && node.taskState === "TRANSIENT_FAILURE") {
      const attempts = dispatchAttemptsByIssue.get(node.issueId);
      return [diagnosis({
        reasonCode: REASON_CODES.dispatchAttemptsExhausted,
        evidence: [`Issue ${node.issueId} exhausted ${attempts} dispatch attempts.`],
        retryCount: attempts,
        noAutomaticTransition: "The three-attempt transient dispatch budget is exhausted.",
        affectedNodes: [node.issueId],
        allNodes: allNodeIds,
        resumePredicates: ["human_selects_recovery"],
      })];
    }
    if (state === "FAILED" && node.taskState === "ENVIRONMENT_FAILURE") {
      const fingerprint = node.failure?.fingerprint ?? "unknown";
      const attempt = latestDispatchByIssue.get(node.issueId)?.attempt ?? 0;
      const cycles = remediationCyclesByIssueAttemptAndFingerprint
        .get(`${node.issueId}\0${attempt}\0${fingerprint}`) ?? 0;
      return [diagnosis({
        reasonCode: REASON_CODES.environmentUnresolved,
        evidence: [`Environment fingerprint ${fingerprint} remained after remediation for Issue ${node.issueId} attempt ${attempt}.`],
        attemptedRecovery: resolvedRemediations
          .filter((event) => event.issueId === node.issueId
            && event.attempt === attempt
            && event.fingerprint === fingerprint)
          .map(({ adapter, attempt: remediationAttempt, cycle }) => ({
            adapter,
            attempt: remediationAttempt,
            cycle,
          })),
        noAutomaticTransition: "One remediation cycle per dispatch attempt and exact fingerprint is the limit.",
        affectedNodes: [node.issueId],
        allNodes: allNodeIds,
        retryCount: cycles,
        resumePredicates: ["environment_changed_or_human_resolution"],
      })];
    }
    if (state === "FAILED" && node.taskState === "FAILED") {
      return [diagnosis({
        reasonCode: REASON_CODES.workerFailed,
        evidence: node.failure?.evidence ?? ["The worker reported a non-transient failure."],
        noAutomaticTransition: "Semantic worker failure is not retryable.",
        affectedNodes: [node.issueId],
        allNodes: allNodeIds,
        resumePredicates: ["human_selects_recovery"],
      })];
    }
    return [];
  });
  const derivedContradictions = normalizedNodes.flatMap((node) => {
    const stateFieldChecks = [
      [["OPEN", "CLOSED"], node.trackerState, "trackerState"],
      [["NONE", "DISPATCHED", "EXECUTING", "TRANSIENT_FAILURE", "ENVIRONMENT_FAILURE", "FAILED"], node.taskState, "taskState"],
      [["NONE", "COMPLETE", "BLOCKED"], node.completionState, "completionState"],
      [["PRESENT", "ABSENT"], node.worktreeState, "worktreeState"],
    ];
    const invalidStateField = stateFieldChecks.find(([allowed, value]) => !allowed.includes(value));
    if (invalidStateField || typeof node.candidateReachable !== "boolean") {
      const field = invalidStateField?.[2] ?? "candidateReachable";
      return [{
        code: `unknown_${field}`,
        reasonCode: REASON_CODES.insufficientEvidence,
        evidence: [`Issue ${node.issueId} has unknown or invalid ${field} evidence.`],
        affectedNodes: [node.issueId],
      }];
    }
    if (node.taskState === "ENVIRONMENT_FAILURE" && !isText(node.failure?.fingerprint)) {
      return [{
        code: "environment_failure_without_fingerprint",
        reasonCode: REASON_CODES.insufficientEvidence,
        evidence: [`Issue ${node.issueId} has environment-failure evidence without a stable fingerprint.`],
        affectedNodes: [node.issueId],
      }];
    }
    if (node.completionState === "COMPLETE" && ["DISPATCHED", "EXECUTING"].includes(node.taskState)) {
      return [{
        code: "completion_while_task_active",
        reasonCode: REASON_CODES.evidenceContradiction,
        evidence: [`Issue ${node.issueId} has completion evidence while its Codex task is still active.`],
        affectedNodes: [node.issueId],
      }];
    }
    if (node.trackerState === "CLOSED" && (
      node.completionState !== "COMPLETE" || !node.candidateReachable || node.worktreeState !== "ABSENT"
    )) {
      return [{
        code: "closed_without_node_success",
        reasonCode: REASON_CODES.evidenceContradiction,
        evidence: [`Issue ${node.issueId} is closed without candidate reachability and worktree absence.`],
        affectedNodes: [node.issueId],
      }];
    }
    if (node.completionState === "COMPLETE" && !node.candidateReachable && node.worktreeState === "ABSENT") {
      return [{
        code: "candidate_lane_missing",
        reasonCode: REASON_CODES.insufficientEvidence,
        evidence: [`Issue ${node.issueId} has completion evidence but neither target reachability nor a worktree.`],
        affectedNodes: [node.issueId],
      }];
    }
    if (node.candidateReachable && node.completionState !== "COMPLETE") {
      return [{
        code: "reachable_without_completion",
        reasonCode: REASON_CODES.evidenceContradiction,
        evidence: [`Issue ${node.issueId} candidate is reachable without completion-note authority.`],
        affectedNodes: [node.issueId],
      }];
    }
    if (["DISPATCHED", "EXECUTING", "TRANSIENT_FAILURE", "ENVIRONMENT_FAILURE", "FAILED"].includes(node.taskState)
      && dispatchAttemptsByIssue.get(node.issueId) === 0) {
      return [{
        code: "task_without_dispatch_reference",
        reasonCode: REASON_CODES.insufficientEvidence,
        evidence: [`Issue ${node.issueId} task evidence has no journaled dispatch reference.`],
        affectedNodes: [node.issueId],
      }];
    }
    if (node.taskState === "NONE" && node.completionState === "NONE"
      && dispatchAttemptsByIssue.get(node.issueId) > 0) {
      return [{
        code: "dispatch_without_task_evidence",
        reasonCode: REASON_CODES.insufficientEvidence,
        evidence: [`Issue ${node.issueId} has a journaled dispatch but no authoritative task evidence.`],
        affectedNodes: [node.issueId],
      }];
    }
    return [];
  });
  if (input.run.classification === "MULTI" && input.run.parentTrackerState === "CLOSED"
    && nodes.some(({ state }) => state !== "SUCCEEDED")) {
    derivedContradictions.push({
      code: "parent_closed_before_children",
      reasonCode: REASON_CODES.evidenceContradiction,
      evidence: [`Parent Issue ${input.run.specId} is closed before every exact child succeeded.`],
      affectedNodes: nodes.filter(({ state }) => state !== "SUCCEEDED").map(({ issueId }) => issueId),
    });
  }
  const releasedCloseWait = input.journal.some((event) => (
    ["repository-close-wait.settled", "target-writer-wait.settled"].includes(event.type)
    && event.outcome === "RELEASED"
  ));
  const postWaitPacket = (evidence, {
    owningSource = "post-wait owning-source reconciliation",
    smallestHumanAction = "Restore consistent current authority without changing the preserved Run or Issue stages.",
  } = {}) => createRecoverableOperatorPacket({
    owningSource,
    observedEvidence: evidence,
    smallestHumanAction,
    run: { ...input.run, state: "BLOCKED" },
    nodes,
  });
  const contradictionDiagnoses = [...input.contradictions, ...derivedContradictions]
    .sort((left, right) => compareIds(left.code, right.code))
    .map((contradiction) => diagnosis({
      reasonCode: contradiction.reasonCode ?? REASON_CODES.evidenceContradiction,
      limitationClass: "unresolved-evidence",
      evidence: [...contradiction.evidence],
      noAutomaticTransition: "Contradictory authoritative evidence has no safe precedence.",
      affectedNodes: [...contradiction.affectedNodes].sort(compareIds),
      allNodes: allNodeIds,
      resumePredicates: [`resolve_contradiction:${contradiction.code}`],
      operatorPacket: contradiction.reasonCode === "merge_conflict"
        ? postWaitPacket(contradiction.evidence, {
          owningSource: "target integration result",
          smallestHumanAction: "Resolve the exact Issue integration conflict without changing its accepted scope.",
        })
        : releasedCloseWait
          ? postWaitPacket(contradiction.evidence)
        : undefined,
    }));
  const ready = nodes.filter(({ state }) => state === "READY").map(({ issueId }) => issueId);
  const retrying = nodes.filter(({ state }) => state === "RETRYING").map(({ issueId }) => issueId);
  const active = normalizedNodes
    .filter(({ taskState }) => ["DISPATCHED", "EXECUTING"].includes(taskState))
    .map(({ issueId }) => issueId);
  const closeable = nodes
    .filter(({ state }) => ["IMPLEMENTATION_COMPLETE", "CLOSING"].includes(state))
    .map(({ issueId }) => issueId);
  const allSucceeded = nodes.length > 0 && nodes.every(({ state }) => state === "SUCCEEDED");
  const deliverySucceeded = allSucceeded && (
    input.run.classification === "SINGLE" || input.run.parentTrackerState === "CLOSED"
  );
  const slots = Math.max(0, maxParallel - active.length);
  const normalActions = [];
  const latestControl = input.journal.findLast(({ type }) => type === "control.revised");
  const controlRevision = latestControl?.revision ?? 0;
  const repositoryCloseLeaseState = input.run.repositoryCloseLeaseState ?? "ABSENT";
  const repositoryCloseLeaseOperationId = input.run.repositoryCloseLeaseOperationId ?? null;
  const repositoryCloseLeaseOwner = input.run.repositoryCloseLeaseOwner;
  const repositoryCloseLeaseHealthy = repositoryCloseLeaseState === "ACTIVE"
    && input.run.repositoryCloseLeaseHealth === "HEALTHY"
    && isRecord(repositoryCloseLeaseOwner)
    && repositoryCloseLeaseOwner.operationId === repositoryCloseLeaseOperationId
    && isText(repositoryCloseLeaseOwner.coordinatorInstanceId)
    && isText(repositoryCloseLeaseOwner.generation);
  const repositoryCloseLeaseUncertain = repositoryCloseLeaseState === "UNKNOWN"
    || (repositoryCloseLeaseState === "ACTIVE" && !repositoryCloseLeaseHealthy);
  const repositoryCloseLeaseAvailable = repositoryCloseLeaseState === "ABSENT";
  const closeWriterOwner = input.run.closeWriterOwner;
  const targetCloseWriterHealthy = input.run.closeWriterState === "ACTIVE"
    && input.run.closeWriterHealth === "HEALTHY"
    && isRecord(closeWriterOwner)
    && closeWriterOwner.operationId === input.run.closeWriterRunId
    && isText(closeWriterOwner.coordinatorInstanceId)
    && isText(closeWriterOwner.generation);
  const targetCloseWriterUncertain = input.run.closeWriterState === "UNKNOWN"
    || (input.run.closeWriterState === "ACTIVE" && !targetCloseWriterHealthy);
  const targetCloseWriterAvailable = input.run.closeWriterState === "ABSENT";
  const closeoutAvailable = repositoryCloseLeaseAvailable && targetCloseWriterAvailable;
  const remediations = retrying.flatMap((issueId) => {
    const node = byId.get(issueId);
    if (node.taskState !== "ENVIRONMENT_FAILURE") return [];
    if (!isText(node.failure?.fingerprint)) return [];
    const attempt = latestDispatchByIssue.get(issueId)?.attempt;
    if (!Number.isInteger(attempt)) return [];
    return [{
      type: "remediate_environment",
      issueId,
      attempt,
      fingerprint: node.failure.fingerprint,
      cycle: 1,
    }];
  }).slice(0, slots);
  normalActions.push(...remediations);
  const dispatchable = [
    ...retrying.filter((issueId) => byId.get(issueId).taskState === "TRANSIENT_FAILURE"),
    ...ready,
  ];
  const dispatchActions = dispatchable.slice(0, Math.max(0, slots - remediations.length)).map((issueId) => ({
    type: "dispatch_issue",
    issueId,
    attempt: (dispatchAttemptsByIssue.get(issueId) ?? 0) + 1,
  }));
  normalActions.push(...dispatchActions);
  const executionActionsScheduled = remediations.length > 0 || dispatchActions.length > 0;
  if (!executionActionsScheduled && closeoutAvailable && closeable.length > 0) {
    normalActions.push({ type: "close_issue", issueId: closeable[0] });
  }
  const needsParentClose = allSucceeded && input.run.classification === "MULTI"
    && input.run.parentTrackerState === "OPEN";
  if (!executionActionsScheduled && needsParentClose && closeoutAvailable) {
    normalActions.push({ type: "close_parent", issueId: input.run.specId });
  }
  const activeRepositoryCloseWait = input.journal.findLast((event) => (
    event.type === "repository-close-wait.started"
    && !input.journal.some((candidate) => (
      candidate.type === "repository-close-wait.settled" && candidate.waitSequence === event.sequence
    ))
  ));
  const activeTargetWriterWait = input.journal.findLast((event) => (
    event.type === "target-writer-wait.started"
    && !input.journal.some((candidate) => (
      candidate.type === "target-writer-wait.settled" && candidate.waitSequence === event.sequence
    ))
  ));
  const waitingIssueId = closeable[0] ?? (needsParentClose ? input.run.specId : null);
  const preWaitEvidence = createCloseWaitEvidence({
    runIdentity: input.run,
    grant,
    run: input.run,
    nodes: normalizedNodes,
    controlRevision,
  });
  if (!executionActionsScheduled && repositoryCloseLeaseHealthy && waitingIssueId !== null) {
    normalActions.push({
      type: "wait_repository_close_lease",
      issueId: waitingIssueId,
      owner: {
        operationId: repositoryCloseLeaseOwner.operationId,
        coordinatorInstanceId: repositoryCloseLeaseOwner.coordinatorInstanceId,
        generation: repositoryCloseLeaseOwner.generation,
      },
      timeoutMs: REPOSITORY_CLOSE_WAIT_TIMEOUT_MS,
      preWaitEvidence,
    });
  } else if (!executionActionsScheduled && repositoryCloseLeaseAvailable
    && targetCloseWriterHealthy && waitingIssueId !== null) {
    normalActions.push({
      type: "wait_target_writer",
      issueId: waitingIssueId,
      owner: {
        operationId: closeWriterOwner.operationId,
        coordinatorInstanceId: closeWriterOwner.coordinatorInstanceId,
        generation: closeWriterOwner.generation,
      },
      timeoutMs: TARGET_WRITER_WAIT_TIMEOUT_MS,
      preWaitEvidence,
    });
  }
  const activeCloseWait = activeRepositoryCloseWait ?? activeTargetWriterWait;
  if (activeCloseWait) {
    normalActions.splice(0, normalActions.length, {
      type: activeCloseWait.type === "repository-close-wait.started"
        ? "wait_repository_close_lease"
        : "wait_target_writer",
      issueId: activeCloseWait.issueId,
      owner: { ...activeCloseWait.owner },
      timeoutMs: activeCloseWait.timeoutMs,
      preWaitEvidence: activeCloseWait.preWaitEvidence,
    });
  }
  const repositoryCloseDiagnoses = !executionActionsScheduled && repositoryCloseLeaseUncertain
    && (closeable.length > 0 || needsParentClose)
    ? [diagnosis({
      reasonCode: REASON_CODES.repositoryCloseLeaseConflict,
      limitationClass: "unresolved-evidence",
      evidence: [`Repository close lease ${repositoryCloseLeaseOperationId ?? "UNKNOWN"} ownership or liveness is uncertain.`],
      noAutomaticTransition: "The coordinator never reclaims, releases, or replaces a close-issue leaf lease.",
      affectedNodes: closeable,
      allNodes: allNodeIds,
      resumePredicates: ["repository_close_lease_is_absent_or_healthy"],
      operatorPacket: createRecoverableOperatorPacket({
        owningSource: "repository close-lease and liveness read-back",
        observedEvidence: [`Repository close lease ${repositoryCloseLeaseOperationId ?? "UNKNOWN"} is not safely waitable.`],
        smallestHumanAction: "Reconcile the exact repository close-lease owner, then retry the same command.",
        run: { ...input.run, state: "BLOCKED" },
        nodes,
      }),
    })]
    : [];
  const closeWriterDiagnoses = !executionActionsScheduled && targetCloseWriterUncertain
    && (closeable.length > 0 || needsParentClose)
    ? [diagnosis({
      reasonCode: REASON_CODES.closeWriterConflict,
      limitationClass: "unresolved-evidence",
      evidence: [`Close-writer liveness for operation ${input.run.closeWriterRunId} on target ${input.run.target} is unknown.`],
      noAutomaticTransition: "The coordinator never reclaims, releases, or replaces a close-issue leaf writer.",
      affectedNodes: closeable,
      allNodes: allNodeIds,
      resumePredicates: ["prove_single_close_writer"],
      operatorPacket: createRecoverableOperatorPacket({
        owningSource: "shared target-writer lock and liveness read-back",
        observedEvidence: [`Close-writer liveness for operation ${input.run.closeWriterRunId} on target ${input.run.target} is unknown.`],
        smallestHumanAction: "Restore one exact readable target-writer owner and liveness result without releasing another leaf's writer.",
        run: { ...input.run, state: "BLOCKED" },
        nodes,
      }),
    })]
    : [];
  const globalGateDiagnoses = [];
  if (input.run.trackerAvailable !== true) {
    const evidence = ["Current tracker evidence is unavailable."];
    globalGateDiagnoses.push(diagnosis({
      reasonCode: REASON_CODES.trackerUnavailable,
      limitationClass: "unresolved-evidence",
      evidence,
      noAutomaticTransition: "Cached tracker state cannot authorize workflow actions.",
      affectedNodes: allNodeIds.filter((issueId) => stateById.get(issueId) !== "SUCCEEDED"),
      allNodes: allNodeIds,
      resumePredicates: ["tracker_read_succeeds"],
      operatorPacket: releasedCloseWait ? postWaitPacket(evidence) : undefined,
    }));
  } else if (input.run.targetState === "DIRTY") {
    const evidence = [`Target ${input.run.target} has uncommitted work.`];
    globalGateDiagnoses.push(diagnosis({
      reasonCode: REASON_CODES.targetDirty,
      evidence,
      noAutomaticTransition: "Target-wide mutation must stop while the target is dirty.",
      affectedNodes: allNodeIds.filter((issueId) => stateById.get(issueId) !== "SUCCEEDED"),
      allNodes: allNodeIds,
      resumePredicates: ["target_is_clean"],
      operatorPacket: releasedCloseWait ? postWaitPacket(evidence) : undefined,
    }));
  } else if (input.run.targetState !== "CLEAN") {
    const evidence = [`Target ${input.run.target} cleanliness is uncertain.`];
    globalGateDiagnoses.push(diagnosis({
      reasonCode: REASON_CODES.targetStateUncertain,
      limitationClass: "unresolved-evidence",
      evidence,
      noAutomaticTransition: "Unknown target state cannot authorize mutation.",
      affectedNodes: allNodeIds.filter((issueId) => stateById.get(issueId) !== "SUCCEEDED"),
      allNodes: allNodeIds,
      resumePredicates: ["target_state_is_known"],
      operatorPacket: releasedCloseWait ? postWaitPacket(evidence) : undefined,
    }));
  } else if (allSucceeded && input.run.classification === "MULTI"
    && (!["OPEN", "CLOSED"].includes(input.run.parentTrackerState)
      || !isText(input.run.parentTrackerIdentity))) {
    const evidence = [`Parent Issue ${input.run.specId} state or tracker identity is uncertain.`];
    globalGateDiagnoses.push(diagnosis({
      reasonCode: REASON_CODES.parentStateUncertain,
      limitationClass: "unresolved-evidence",
      evidence,
      noAutomaticTransition: "Parent closeout requires current tracker evidence.",
      affectedNodes: [],
      allNodes: allNodeIds,
      resumePredicates: ["parent_tracker_state_is_known"],
      operatorPacket: releasedCloseWait ? postWaitPacket(evidence) : undefined,
    }));
  }
  const hasContradiction = contradictionDiagnoses.length > 0
    || repositoryCloseDiagnoses.length > 0
    || closeWriterDiagnoses.length > 0
    || globalGateDiagnoses.length > 0;
  const hasActiveWork = active.length > 0
    || activeRepositoryCloseWait !== undefined
    || activeTargetWriterWait !== undefined;
  const noProgress = !deliverySucceeded && !hasContradiction && normalActions.length === 0 && !hasActiveWork;
  const hasPauseTransition = input.journal.some((event) => (
    event.type === "pause.transitioned" && event.revision === controlRevision
  ));
  const hasStopTransition = input.journal.some((event) => (
    event.type === "stop.transitioned" && event.revision === controlRevision
  ));
  let state = deliverySucceeded
    ? "SUCCEEDED"
    : hasContradiction || noProgress
      ? "BLOCKED"
      : input.run.reconciled === false
        ? "RECONCILING"
        : activeRepositoryCloseWait
          ? "WAITING_FOR_REPOSITORY_CLOSE_LEASE"
          : activeTargetWriterWait
            ? "WAITING_FOR_TARGET_WRITER"
          : "RUNNING";
  let legalActions = state === "RECONCILING" ? [{ type: "reconcile_run" }] : normalActions;
  const controlDiagnoses = [];
  if (!deliverySucceeded && latestControl?.command === "PAUSE") {
    const pauseSettled = hasPauseTransition && !hasActiveWork;
    state = pauseSettled ? "PAUSED" : "PAUSING";
    legalActions = activeCloseWait
      ? normalActions
      : !hasPauseTransition && !hasActiveWork
        ? [{ type: "settle_pause", revision: controlRevision }]
        : [];
    if (pauseSettled) {
      controlDiagnoses.push(diagnosis({
        reasonCode: REASON_CODES.pausedByUser,
        evidence: [`Pause revision ${controlRevision} is settled.`],
        noAutomaticTransition: "A paused Run requires Resume control.",
        affectedNodes: allNodeIds.filter((issueId) => stateById.get(issueId) !== "SUCCEEDED"),
        allNodes: allNodeIds,
        resumePredicates: ["resume_requested"],
      }));
    }
  }
  if (!deliverySucceeded && latestControl?.command === "STOP") {
    const stopSettled = hasStopTransition && !hasActiveWork;
    state = stopSettled ? "STOPPED" : "STOPPING";
    legalActions = activeCloseWait
      ? normalActions
      : !hasStopTransition && !hasActiveWork
        ? [{ type: "settle_stop", revision: controlRevision }]
        : [];
    if (stopSettled) {
      controlDiagnoses.push(diagnosis({
        reasonCode: REASON_CODES.stoppedByUser,
        evidence: [`Stop revision ${controlRevision} is settled.`],
        noAutomaticTransition: "A stopped Run requires a later explicit workflow invocation and new Grant.",
        affectedNodes: allNodeIds.filter((issueId) => stateById.get(issueId) !== "SUCCEEDED"),
        allNodes: allNodeIds,
        resumePredicates: ["new_explicit_invocation"],
      }));
    }
  }
  if (hasContradiction && !["STOPPING", "STOPPED"].includes(state)) {
    state = "BLOCKED";
    legalActions = [];
  }
  const controlsByState = {
    SUCCEEDED: ["REFRESH"],
    STOPPED: ["REFRESH"],
    STOPPING: ["REFRESH"],
    PAUSING: ["STOP", "REFRESH"],
    PAUSED: ["RESUME", "STOP", "REFRESH"],
    BLOCKED: ["RESUME", "STOP", "REFRESH"],
    WAITING_FOR_REPOSITORY_CLOSE_LEASE: ["PAUSE", "STOP", "REFRESH"],
    WAITING_FOR_TARGET_WRITER: ["PAUSE", "STOP", "REFRESH"],
  };

  return {
    schema: STATUS_SCHEMA,
    run: {
      ...publicRun(input.run, state, maxParallel),
      controlRevision,
      controlCommand: latestControl?.command ?? null,
    },
    nodes,
    frontier: {
      ready,
      active,
      closeable,
    },
    legalActions,
    legalControls: controlsByState[state] ?? ["PAUSE", "STOP", "REFRESH"],
    diagnoses: [
      ...globalGateDiagnoses,
      ...contradictionDiagnoses,
      ...repositoryCloseDiagnoses,
      ...closeWriterDiagnoses,
      ...nodeDiagnoses,
      ...failedDependencyDiagnoses,
      ...controlDiagnoses,
    ],
  };
}

export function planControl(status, command, at) {
  const supported = new Set(CONTROL_COMMANDS);
  if (!supported.has(command)) {
    return {
      accepted: false,
      changed: false,
      event: null,
      revision: status.run.controlRevision,
      reason: "unsupported_control",
    };
  }
  if (status.run.controlCommand === command) {
    return {
      accepted: true,
      changed: false,
      event: null,
      revision: status.run.controlRevision,
    };
  }
  const idempotentStates = {
    PAUSE: new Set(["PAUSING", "PAUSED"]),
    RESUME: new Set(["RECONCILING", "RUNNING"]),
    STOP: new Set(["STOPPING", "STOPPED"]),
  };
  if (idempotentStates[command].has(status.run.state)) {
    return {
      accepted: true,
      changed: false,
      event: null,
      revision: status.run.controlRevision,
    };
  }
  const legal = {
    PAUSE: new Set([
      "RECONCILING",
      "RUNNING",
      "WAITING_FOR_REPOSITORY_CLOSE_LEASE",
      "WAITING_FOR_TARGET_WRITER",
    ]),
    RESUME: new Set(["PAUSED", "BLOCKED"]),
    STOP: new Set([
      "RECONCILING",
      "RUNNING",
      "WAITING_FOR_REPOSITORY_CLOSE_LEASE",
      "WAITING_FOR_TARGET_WRITER",
      "PAUSING",
      "PAUSED",
      "BLOCKED",
    ]),
  };
  if (!legal[command].has(status.run.state)) {
    return {
      accepted: false,
      changed: false,
      event: null,
      revision: status.run.controlRevision,
      reason: "illegal_control",
    };
  }
  const revision = status.run.controlRevision + 1;
  return {
    accepted: true,
    changed: true,
    event: { type: "control.revised", at, revision, command },
    revision,
  };
}
