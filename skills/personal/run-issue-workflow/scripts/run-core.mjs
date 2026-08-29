export const FACT_SCHEMA = "dag-run-facts:v1";
export const STATUS_SCHEMA = "dag-run-status:v1";
export const RUN_STATES = Object.freeze([
  "RECONCILING",
  "RUNNING",
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
export const CONTROL_COMMANDS = Object.freeze(["PAUSE", "RESUME", "STOP"]);
export const REASON_CODES = Object.freeze({
  invalidFactSchema: "invalid_fact_schema",
  emptyDag: "empty_dag",
  grantMissing: "grant_missing",
  grantInvalid: "grant_invalid",
  grantIdentityConflict: "grant_identity_conflict",
  duplicateNode: "duplicate_node",
  unknownBlocker: "unknown_blocker",
  dependencyCycle: "dependency_cycle",
  evidenceContradiction: "evidence_contradiction",
  insufficientEvidence: "insufficient_evidence",
  failedDependency: "failed_dependency",
  workerFailed: "worker_failed",
  implementationBlocked: "implementation_blocked",
  dispatchAttemptsExhausted: "dispatch_attempts_exhausted",
  environmentUnresolved: "environment_unresolved",
  closeWriterConflict: "close_writer_conflict",
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

const reduceNodeState = (node, dispatchAttempts, remediationCycles) => {
  if (node.completionState === "BLOCKED") return "BLOCKED";
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
});

const publicRun = (run, state, maxParallel = 3) => ({
  runId: isRecord(run) ? run.runId ?? null : null,
  specId: isRecord(run) ? run.specId ?? null : null,
  approvedScopeHash: isRecord(run) ? run.approvedScopeHash ?? null : null,
  target: isRecord(run) ? run.target ?? null : null,
  classification: isRecord(run) ? run.classification ?? null : null,
  decompositionIdentity: isRecord(run) ? run.decompositionIdentity ?? null : null,
  state,
  maxParallel,
  controlRevision: isRecord(run) ? run.controlRevision ?? 0 : 0,
  controlCommand: isRecord(run) ? run.controlCommand ?? null : null,
});

const blockedResult = (input, reasonCode, evidence, affectedNodes = []) => {
  const allNodes = Array.isArray(input?.nodes)
    ? [...new Set(input.nodes.filter(isRecord).map(({ issueId }) => issueId).filter(isText))].sort(compareIds)
    : [];
  const affected = affectedNodes.length > 0 ? [...affectedNodes].sort(compareIds) : allNodes;
  return {
    schema: STATUS_SCHEMA,
    run: publicRun(input?.run, "BLOCKED"),
    nodes: allNodes.map((issueId) => ({ issueId, blockers: [], state: "BLOCKED" })),
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
      && node.blockers.every(isText))
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
    || (input.run.closeWriterRunId !== null && !isText(input.run.closeWriterRunId))) {
    return blockedResult(input, REASON_CODES.invalidFactSchema, ["Run identity and node facts are malformed."]);
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
  const normalizedNodes = [...input.nodes]
    .sort((left, right) => compareIds(left.issueId, right.issueId))
    .map((node) => ({ ...node, blockers: [...node.blockers].sort(compareIds) }));
  const allNodeIds = normalizedNodes.map(({ issueId }) => issueId);
  const dispatchAttemptsByIssue = new Map(allNodeIds.map((issueId) => [issueId, 0]));
  const remediationCyclesByIssueAndFingerprint = new Map();
  for (const event of input.journal) {
    if (event.type === "dispatch.recorded" && dispatchAttemptsByIssue.has(event.issueId)) {
      dispatchAttemptsByIssue.set(
        event.issueId,
        Math.max(dispatchAttemptsByIssue.get(event.issueId), event.attempt ?? 0),
      );
    }
    if (event.type === "remediation.recorded") {
      const key = `${event.issueId}\0${event.fingerprint}`;
      remediationCyclesByIssueAndFingerprint.set(
        key,
        Math.max(remediationCyclesByIssueAndFingerprint.get(key) ?? 0, event.cycle ?? 0),
      );
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
      const remediationKey = `${issueId}\0${node.failure?.fingerprint ?? ""}`;
      state = reduceNodeState(
        node,
        dispatchAttemptsByIssue.get(issueId),
        remediationCyclesByIssueAndFingerprint.get(remediationKey) ?? 0,
      );
    }
    stateById.set(issueId, state);
    return state;
  };

  const nodes = normalizedNodes.map(({ issueId, blockers }) => ({
    issueId,
    blockers,
    state: deriveState(issueId),
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
      const cycles = remediationCyclesByIssueAndFingerprint.get(`${node.issueId}\0${fingerprint}`) ?? 0;
      return [diagnosis({
        reasonCode: REASON_CODES.environmentUnresolved,
        evidence: [`Environment fingerprint ${fingerprint} remained after remediation.`],
        attemptedRecovery: input.journal
          .filter((event) => event.type === "remediation.recorded" && event.issueId === node.issueId && event.fingerprint === fingerprint)
          .map(({ adapter, cycle }) => ({ adapter, cycle })),
        noAutomaticTransition: "One remediation cycle per exact fingerprint is the limit.",
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
    }));
  const ready = nodes.filter(({ state }) => state === "READY").map(({ issueId }) => issueId);
  const retrying = nodes.filter(({ state }) => state === "RETRYING").map(({ issueId }) => issueId);
  const active = nodes
    .filter(({ state }) => ["DISPATCHED", "EXECUTING"].includes(state))
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
  const targetCloseWriterConflict = input.run.closeWriterRunId !== null
    && input.run.closeWriterRunId !== input.run.runId;
  const targetCloseWriterOwned = input.run.closeWriterRunId === input.run.runId;
  const targetCloseWriterAvailable = input.run.closeWriterRunId === null;
  if (targetCloseWriterAvailable && closeable.length > 0) {
    normalActions.push({ type: "close_issue", issueId: closeable[0] });
  }
  const remediations = retrying.flatMap((issueId) => {
    const node = byId.get(issueId);
    if (node.taskState !== "ENVIRONMENT_FAILURE") return [];
    if (!isText(node.failure?.fingerprint)) return [];
    return [{
      type: "remediate_environment",
      issueId,
      fingerprint: node.failure.fingerprint,
      cycle: 1,
    }];
  }).slice(0, slots);
  normalActions.push(...remediations);
  const dispatchable = [
    ...retrying.filter((issueId) => byId.get(issueId).taskState === "TRANSIENT_FAILURE"),
    ...ready,
  ];
  normalActions.push(...dispatchable.slice(0, Math.max(0, slots - remediations.length)).map((issueId) => ({
    type: "dispatch_issue",
    issueId,
    attempt: (dispatchAttemptsByIssue.get(issueId) ?? 0) + 1,
  })));
  const needsParentClose = allSucceeded && input.run.classification === "MULTI"
    && input.run.parentTrackerState === "OPEN";
  if (needsParentClose && targetCloseWriterAvailable) {
    normalActions.push({ type: "close_parent", issueId: input.run.specId });
  }
  const closeWriterDiagnoses = targetCloseWriterConflict && (closeable.length > 0 || needsParentClose)
    ? [diagnosis({
      reasonCode: REASON_CODES.closeWriterConflict,
      limitationClass: "unresolved-evidence",
      evidence: [`Run ${input.run.closeWriterRunId} already owns the close writer for target ${input.run.target}.`],
      noAutomaticTransition: "Only one close writer may act on one target.",
      affectedNodes: closeable,
      allNodes: allNodeIds,
      resumePredicates: ["prove_single_close_writer"],
    })]
    : [];
  const globalGateDiagnoses = [];
  if (input.run.trackerAvailable !== true) {
    globalGateDiagnoses.push(diagnosis({
      reasonCode: REASON_CODES.trackerUnavailable,
      limitationClass: "unresolved-evidence",
      evidence: ["Current tracker evidence is unavailable."],
      noAutomaticTransition: "Cached tracker state cannot authorize workflow actions.",
      affectedNodes: allNodeIds.filter((issueId) => stateById.get(issueId) !== "SUCCEEDED"),
      allNodes: allNodeIds,
      resumePredicates: ["tracker_read_succeeds"],
    }));
  } else if (input.run.targetState === "DIRTY") {
    globalGateDiagnoses.push(diagnosis({
      reasonCode: REASON_CODES.targetDirty,
      evidence: [`Target ${input.run.target} has uncommitted work.`],
      noAutomaticTransition: "Target-wide mutation must stop while the target is dirty.",
      affectedNodes: allNodeIds.filter((issueId) => stateById.get(issueId) !== "SUCCEEDED"),
      allNodes: allNodeIds,
      resumePredicates: ["target_is_clean"],
    }));
  } else if (input.run.targetState !== "CLEAN") {
    globalGateDiagnoses.push(diagnosis({
      reasonCode: REASON_CODES.targetStateUncertain,
      limitationClass: "unresolved-evidence",
      evidence: [`Target ${input.run.target} cleanliness is uncertain.`],
      noAutomaticTransition: "Unknown target state cannot authorize mutation.",
      affectedNodes: allNodeIds.filter((issueId) => stateById.get(issueId) !== "SUCCEEDED"),
      allNodes: allNodeIds,
      resumePredicates: ["target_state_is_known"],
    }));
  } else if (allSucceeded && input.run.classification === "MULTI"
    && !["OPEN", "CLOSED"].includes(input.run.parentTrackerState)) {
    globalGateDiagnoses.push(diagnosis({
      reasonCode: REASON_CODES.parentStateUncertain,
      limitationClass: "unresolved-evidence",
      evidence: [`Parent Issue ${input.run.specId} state is uncertain.`],
      noAutomaticTransition: "Parent closeout requires current tracker evidence.",
      affectedNodes: [],
      allNodes: allNodeIds,
      resumePredicates: ["parent_tracker_state_is_known"],
    }));
  }
  const hasContradiction = contradictionDiagnoses.length > 0
    || globalGateDiagnoses.length > 0;
  const hasActiveWork = active.length > 0 || targetCloseWriterOwned;
  const noProgress = !deliverySucceeded && !hasContradiction && normalActions.length === 0 && !hasActiveWork;
  const latestControl = input.journal.findLast(({ type }) => type === "control.revised");
  const controlRevision = latestControl?.revision ?? 0;
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
        : "RUNNING";
  let legalActions = state === "RECONCILING" ? [{ type: "reconcile_run" }] : normalActions;
  const controlDiagnoses = [];
  if (!deliverySucceeded && latestControl?.command === "PAUSE") {
    const pauseSettled = hasPauseTransition && !hasActiveWork;
    state = pauseSettled ? "PAUSED" : "PAUSING";
    legalActions = !hasPauseTransition && !hasActiveWork
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
    legalActions = !hasStopTransition && !hasActiveWork
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
    PAUSE: new Set(["RECONCILING", "RUNNING"]),
    RESUME: new Set(["PAUSED", "BLOCKED"]),
    STOP: new Set(["RECONCILING", "RUNNING", "PAUSING", "PAUSED", "BLOCKED"]),
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
