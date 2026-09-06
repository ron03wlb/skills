import { createHash } from "node:crypto";
import { planCloseContinuation, closeContinuationSuffix } from "./close-continuation.mjs";

import { DEFAULT_MAX_PARALLEL, validateWorkflowVersion, sameWorkflowVersion } from "./run-journal.mjs";
import {
  createRecoverableOperatorPacket,
  REASON_CODES,
  reduceRunReadyHandoff,
  planControl,
} from "./run-core.mjs";
import {
  createCloseWaitEvidence,
  sameCloseWaitAuthority,
} from "./run-target-writer-wait.mjs";

const TRACKER_PROBE_DELAYS_MS = Object.freeze([5_000, 15_000, 30_000]);
export const WINDOWS_GRADLE_LOOPBACK_FINGERPRINT =
  "windows:Selector.open():java.io.IOException: Unable to establish loopback connection";
const RUN_IDENTITY_KEYS = Object.freeze([
  "runId",
  "specId",
  "approvedScopeHash",
  "target",
  "classification",
  "decompositionIdentity",
]);
const RUN_READY_AUTHORITY_KEYS = Object.freeze([
  "specId",
  "approvedScopeHash",
  "target",
  "classification",
  "decompositionIdentity",
  "planningSeal",
]);
const RECLAIM_CONTENTION = Object.freeze([
  "RECLAIM_GATE_LOCKED",
  "RECLAIM_GATE_STALE_PROOF_MISMATCH",
  "RECLAIM_GATE_TAKEOVER_LOCKED",
  "RECLAIM_GATE_TAKEOVER_STALE_PROOF_MISMATCH",
  "RECLAIM_GATE_LEASE_FENCED",
  "LOCK_LEASE_FENCED",
]);
const ENGINE_WRITER_CONTENTION = new Set([
  ...RECLAIM_CONTENTION,
  "CLEANUP_IN_PROGRESS",
  "RUN_WRITER_LOCKED",
  "RUN_WRITER_RECLAIM_IN_PROGRESS",
  "RUN_WRITER_STALE_PROOF_MISMATCH",
  "RUN_WRITER_OPERATION_ACTIVE_OR_UNPROVEN",
]);
const MUTATING_ACTION_TYPES = new Set([
  "dispatch_issue",
  "repair_issue",
  "remediate_environment",
  "close_issue",
  "close_parent",
  "wait_repository_close_lease",
  "wait_target_writer",
  "settle_pause",
  "settle_stop",
]);

const isText = (value) => typeof value === "string" && value.length > 0;
const isTaskRef = (value) => value && isText(value.threadId) && isText(value.hostId);
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const closeRequestAuthority = (evidence) => {
  const { targetHead, targetState, trackerState, parentTrackerState, candidateReachable, worktreeState, ...authority } = evidence;
  if (authority.authorityEvidence) {
    const { targetHead: ignored, ...fixed } = authority.authorityEvidence;
    authority.authorityEvidence = fixed;
  }
  if (authority.childCloseStates) authority.childCloseStates = authority.childCloseStates.map(closeRequestAuthority);
  return authority;
};
export const closeRequestIdentityFor = (evidence) => `sha256:${createHash("sha256")
  .update(JSON.stringify(canonicalize(closeRequestAuthority(evidence))))
  .digest("hex")}`;

const requireMethod = (owner, name) => {
  if (typeof owner?.[name] !== "function") throw new TypeError(`Coordinator adapter requires ${name}()`);
};

const identityMismatch = (expected, actual) => (
  RUN_IDENTITY_KEYS.find((key) => expected?.[key] !== actual?.[key]) ?? null
);

const authorityMismatch = (expected, actual) => (
  RUN_IDENTITY_KEYS.find((key) => key !== "runId" && expected?.[key] !== actual?.[key]) ?? null
);

const bindFreshRunOperation = (current, operationIdentity) => {
  if (!isText(operationIdentity?.key)) throw new TypeError("Run operation identity is malformed");
  const runIdentity = { ...current.runIdentity, runId: operationIdentity.key };
  return {
    ...current,
    operationIdentity,
    runIdentity,
    grant: current.grant ? { ...current.grant, runIdentity } : current.grant,
    facts: {
      ...current.facts,
      run: { ...current.facts.run, runId: operationIdentity.key },
    },
  };
};

const initialTrackerUnavailable = (request, attempts) => ({
  schema: "dag-run-status:v1",
  run: {
    runId: null,
    specId: request.specId ?? null,
    state: "BLOCKED",
  },
  nodes: [],
  frontier: { ready: [], active: [], closeable: [] },
  legalActions: [],
  legalControls: ["REFRESH"],
  diagnoses: [{
    reasonCode: "tracker_unavailable",
    limitationClass: "unresolved-evidence",
    evidence: [`Tracker reads failed before entry and after ${attempts.join(", ")} millisecond probes.`],
    attemptedRecovery: attempts.map((delayMs) => ({ delayMs })),
    retryCount: 0,
    noAutomaticTransition: "Cached tracker evidence cannot authorize workflow action.",
    affectedNodes: [],
    unaffectedNodes: [],
    nextOwner: "human",
    resumePredicates: ["tracker_read_succeeds"],
  }],
});

const runSelectionRequired = (candidateCount) => ({
  schema: "dag-run-status:v1",
  run: { runId: null, specId: null, state: "BLOCKED" },
  nodes: [],
  frontier: { ready: [], active: [], closeable: [] },
  legalActions: [],
  legalControls: ["REFRESH"],
  diagnoses: [{
    reasonCode: "run_selection_required",
    limitationClass: "unresolved-evidence",
    evidence: [`Found ${candidateCount} non-terminal Runs; exactly one is required.`],
    attemptedRecovery: [],
    retryCount: 0,
    noAutomaticTransition: "No-argument entry cannot guess a new or ambiguous Run.",
    affectedNodes: [],
    unaffectedNodes: [],
    nextOwner: "human",
    resumePredicates: ["one_exact_non_terminal_run_or_explicit_spec_id"],
  }],
});

const preflightConflict = (current, {
  reasonCode,
  limitationClass = "contract-blocker",
  evidence,
  noAutomaticTransition = "Selection and reconciled Run authority must match exactly.",
  resumePredicates,
  nextOwner = "human",
}) => {
  const runIdentity = current?.runIdentity ?? {};
  const allNodes = Array.isArray(current?.facts?.nodes)
    ? current.facts.nodes.map(({ issueId }) => issueId).filter(isText)
    : [];
  return {
    schema: "dag-run-status:v1",
    run: {
      ...runIdentity,
      closeWriterRunId: null,
      closeWriterState: "ABSENT",
      state: "BLOCKED",
      maxParallel: current?.grant?.maxParallel ?? DEFAULT_MAX_PARALLEL,
      controlRevision: 0,
      controlCommand: null,
    },
    nodes: allNodes.map((issueId) => ({ issueId, blockers: [], state: "BLOCKED" })),
    frontier: { ready: [], active: [], closeable: [] },
    legalActions: [],
    legalControls: ["REFRESH"],
    diagnoses: [{
      reasonCode,
      limitationClass,
      evidence,
      attemptedRecovery: [],
      retryCount: 0,
      noAutomaticTransition,
      affectedNodes: allNodes,
      unaffectedNodes: [],
      nextOwner,
      resumePredicates,
    }],
  };
};

const runReadyStop = (current, runReadyHandoff) => ({
  ...preflightConflict(current, {
    reasonCode: runReadyHandoff.reasonCode,
    limitationClass: runReadyHandoff.state === "INCOMPLETE" ? "instance-blocker" : "unresolved-evidence",
    evidence: runReadyHandoff.evidence,
    noAutomaticTransition: runReadyHandoff.noAutomaticTransition,
    resumePredicates: runReadyHandoff.recoveryPredicates,
    nextOwner: runReadyHandoff.nextOwner,
  }),
  runReadyHandoff,
});

const diagnosedStop = (status, {
  reasonCode,
  limitationClass = "instance-blocker",
  evidence,
  attemptedRecovery = [],
  retryCount = 0,
  noAutomaticTransition,
  affectedNodes,
  resumePredicates,
  operatorPacket,
}) => {
  const allNodes = status.nodes.map(({ issueId }) => issueId);
  return {
    ...status,
    run: { ...status.run, state: "BLOCKED" },
    nodes: status.nodes.map((node) => (
      affectedNodes.includes(node.issueId) ? { ...node, state: "BLOCKED" } : node
    )),
    frontier: Object.fromEntries(Object.entries(status.frontier).map(([name, issueIds]) => [
      name,
      issueIds.filter((issueId) => !affectedNodes.includes(issueId)),
    ])),
    legalActions: [],
    legalControls: ["RESUME", "STOP", "REFRESH"],
    diagnoses: [...status.diagnoses, {
      reasonCode,
      limitationClass,
      evidence,
      attemptedRecovery,
      retryCount,
      noAutomaticTransition,
      affectedNodes,
      unaffectedNodes: allNodes.filter((issueId) => !affectedNodes.includes(issueId)),
      nextOwner: "human",
      resumePredicates,
      ...(operatorPacket === undefined ? {} : { operatorPacket }),
    }],
  };
};

const closeRequestEvidenceChanged = (status, { issueId, expected, observed }) => diagnosedStop(status, {
  reasonCode: REASON_CODES.closeRequestEvidenceChanged,
  limitationClass: "unresolved-evidence",
  evidence: [
    `Issue ${issueId} close request identity changed; expected ${expected}, observed ${observed ?? "missing"}.`,
  ],
  noAutomaticTransition: "A stale or unbound close request cannot authorize closeout.",
  affectedNodes: status.nodes.some((node) => node.issueId === issueId)
    ? [issueId]
    : status.nodes.map(({ issueId: childIssueId }) => childIssueId),
  resumePredicates: ["close_request_identity_is_reconciled", "retry_same_run_issue_workflow"],
});

const trackerUnavailable = (request, attempts, status, authorityConflict) => {
  if (!status && request.runIdentity) {
    const issueIds = Array.isArray(request.issueIds) && request.issueIds.every(isText)
      ? [...new Set(request.issueIds)]
      : request.runIdentity.classification === "SINGLE"
        ? [request.runIdentity.specId]
        : [];
    status = {
      schema: "dag-run-status:v1",
      run: {
        ...request.runIdentity,
        closeWriterRunId: null,
        closeWriterState: "UNKNOWN",
        state: "BLOCKED",
        maxParallel: request.maxParallel ?? DEFAULT_MAX_PARALLEL,
        controlRevision: 0,
        controlCommand: null,
      },
      nodes: issueIds.map((issueId) => ({ issueId, blockers: [], state: "BLOCKED" })),
      frontier: { ready: [], active: [], closeable: [] },
      legalActions: [],
      legalControls: ["RESUME", "STOP", "REFRESH"],
      diagnoses: [],
    };
  }
  if (!status) {
    const initial = initialTrackerUnavailable(request, attempts);
    if (!authorityConflict) return initial;
    status = { ...initial, diagnoses: [] };
  }
  const affectedNodes = status.nodes
    .filter(({ state }) => state !== "SUCCEEDED")
    .map(({ issueId }) => issueId);
  return diagnosedStop(status, {
    reasonCode: authorityConflict ? "tracker_authority_conflict" : "tracker_unavailable",
    limitationClass: "unresolved-evidence",
    evidence: authorityConflict ? [authorityConflict] : [`Tracker reads failed after ${attempts.join(", ")} millisecond probes.`],
    attemptedRecovery: attempts.map((delayMs) => ({ delayMs })),
    noAutomaticTransition: authorityConflict ? "Conflicting current authority requires its planning owner; network retries cannot repair it." : "Cached tracker evidence cannot authorize workflow action.",
    affectedNodes,
    resumePredicates: [authorityConflict ? "current_scope_authority_agrees" : "tracker_read_succeeds"],
  });
};

const issueLaneAmbiguous = (status, issueId, laneCount) => ({ ...diagnosedStop(status, {
  reasonCode: "issue_lane_ambiguous",
  limitationClass: "unresolved-evidence",
  evidence: [`Issue ${issueId} matched ${laneCount} Codex task lanes; exactly one or zero is required.`],
  noAutomaticTransition: "Ambiguous task identity cannot authorize dispatch, retry, or closeout.",
  affectedNodes: [issueId],
  resumePredicates: ["one_exact_issue_lane_is_proven"],
}), reservationCount: laneCount || status.run.maxParallel,
  nodes: status.nodes.map(node => node.issueId === issueId
    ? { ...node, task: { ...node.task, reservedWorkers: laneCount || status.run.maxParallel } } : node),
});

const issueLaneMissing = (status, issueId) => diagnosedStop(status, {
  reasonCode: "issue_lane_missing",
  limitationClass: "unresolved-evidence",
  evidence: [`Issue ${issueId} has valid completion evidence but no adoptable Codex task lane.`],
  noAutomaticTransition: "Closeout cannot create or guess a task lane after manual completion.",
  affectedNodes: [issueId],
  resumePredicates: ["one_exact_issue_lane_is_proven"],
});

const environmentUnresolved = (status, action) => diagnosedStop(status, {
  reasonCode: "environment_unresolved",
  evidence: [`Environment fingerprint ${action.fingerprint} has no approved automatic remediation.`],
  noAutomaticTransition: "Only the exact Windows Gradle loopback fingerprint is eligible for automatic remediation.",
  affectedNodes: [action.issueId],
  resumePredicates: ["environment_changed_or_human_resolution"],
});

const panelUnavailable = (status) => diagnosedStop(status, {
  reasonCode: "panel_unavailable",
  evidence: ["The Run panel failed to open or remain available."],
  noAutomaticTransition: "The required Run panel must open before workflow actions continue.",
  affectedNodes: status.nodes
    .filter(({ state }) => state !== "SUCCEEDED")
    .map(({ issueId }) => issueId),
  resumePredicates: ["panel_can_open"],
});

const coordinatorUnavailable = (status) => diagnosedStop(status, {
  reasonCode: "coordinator_unavailable",
  evidence: ["The active Codex host heartbeat disconnected."],
  noAutomaticTransition: "Reconnect the active host and resume the same Run; preserve existing tasks and controls.",
  affectedNodes: status.nodes.filter(({ state }) => state !== "SUCCEEDED").map(({ issueId }) => issueId),
  resumePredicates: ["active_host_reconnected"],
});

const authorityDrift = ({ status, runIdentity, current, recordedGrant, afterWriterWait = false }) => {
  const recoverablePacket = (evidence, smallestHumanAction) => afterWriterWait
    ? createRecoverableOperatorPacket({
      owningSource: "Run identity and DAG Run Grant read-back",
      observedEvidence: evidence,
      smallestHumanAction,
      run: status.run,
      nodes: status.nodes,
    })
    : undefined;
  const mismatch = identityMismatch(runIdentity, current.runIdentity)
    ?? identityMismatch(runIdentity, current.grant?.runIdentity);
  if (mismatch) {
    const evidence = [`Run identity changed at ${mismatch} during reconciliation.`];
    return diagnosedStop(status, {
      reasonCode: "grant_identity_conflict",
      limitationClass: "contract-blocker",
      evidence,
      noAutomaticTransition: "A live Run cannot change its bound authority.",
      affectedNodes: status.nodes.map(({ issueId }) => issueId),
      resumePredicates: ["grant_and_reconciled_run_identity_match"],
      operatorPacket: recoverablePacket(
        evidence,
        "Restore one exact Run identity and Grant read-back without changing the preserved candidate or Issue stages.",
      ),
    });
  }
  const grantMaxParallel = current.grant?.maxParallel ?? DEFAULT_MAX_PARALLEL;
  if (recordedGrant && recordedGrant.maxParallel !== grantMaxParallel) {
    const evidence = [
      `Run ${runIdentity.runId} Grant max_parallel is ${recordedGrant.maxParallel}; reconciliation proposed ${grantMaxParallel}.`,
    ];
    return diagnosedStop(status, {
      reasonCode: "grant_identity_conflict",
      limitationClass: "contract-blocker",
      evidence,
      noAutomaticTransition: "Grant renewal cannot change max_parallel without a valid revisioned setting.",
      affectedNodes: status.nodes.map(({ issueId }) => issueId),
      resumePredicates: ["matching_grant_or_revisioned_setting_is_reconciled"],
      operatorPacket: recoverablePacket(
        evidence,
        "Restore the journaled max_parallel or publish its authorized revision before retrying.",
      ),
    });
  }
  return null;
};

export function createCoordinator({
  store,
  tracker,
  tasks,
  selector,
  reconcile,
  handoff,
  leaf,
  environment,
  panel,
  onSelected,
  workflowVersion,
  compatibleRecordedVersion,
  actionStops = new Map(),
  now,
  sleep,
}) {
  for (const method of [
    "readEvents",
    "acquireWriter",
    "readWriterLock",
    "observeRepositoryCloseLease",
    "observeTargetMutationWriter",
  ]) requireMethod(store, method);
  if (workflowVersion !== undefined) validateWorkflowVersion(workflowVersion);
  requireMethod(tracker, "read");
  for (const method of ["findIssueLane", "create", "read", "message", "wait"]) requireMethod(tasks, method);
  if (panel) {
    requireMethod(panel, "open");
    requireMethod(store, "readStatus");
  }
  if (onSelected !== undefined && typeof onSelected !== "function") {
    throw new TypeError("Coordinator onSelected must be a function");
  }
  if (typeof reconcile !== "function") throw new TypeError("Coordinator requires reconcile()");
  requireMethod(handoff, "read");
  if (typeof now !== "function") throw new TypeError("Coordinator requires now()");
  if (typeof sleep !== "function") throw new TypeError("Coordinator requires sleep()");

  const readTracker = async (request) => {
    const attempts = [];
    for (const delayMs of [0, ...TRACKER_PROBE_DELAYS_MS]) {
      if (delayMs) {
        attempts.push(delayMs);
        await sleep(delayMs);
      }
      try {
        return { available: true, snapshot: await tracker.read(request), attempts };
      } catch (error) {
        if (error.code === "WORKFLOW_AUTHORITY_CONFLICT") return { available: false, snapshot: null, attempts, authorityConflict: error.message };
        // Transport failures retain the fixed probe schedule.
      }
    }
    return { available: false, snapshot: null, attempts };
  };

  const acquireRunWriter = (current) => {
    try {
      if (current.writerReclaimProof) {
        requireMethod(store, "reclaimWriter");
        return { writer: store.reclaimWriter({
          runId: current.runIdentity.runId,
          staleProof: current.writerReclaimProof,
        }) };
      }
      return { writer: store.acquireWriter(current.runIdentity.runId) };
    } catch (error) {
      if (!ENGINE_WRITER_CONTENTION.has(error?.message)) throw error;
      const owner = store.readWriterLock(current.runIdentity.runId);
      return { stopped: preflightConflict(current, {
        reasonCode: "engine_writer_conflict",
        limitationClass: "unresolved-evidence",
        evidence: [`${error.message}; observed engine writer owner ${JSON.stringify(owner)}.`],
        noAutomaticTransition: "A live or unproven engine writer remains fenced.",
        resumePredicates: ["prior_engine_writer_is_inactive_with_exact_reclaim_proof"],
      }) };
    }
  };

  const dispatchIssue = async ({ action, current, status, writer }) => {
    if (action.attempt > 1) {
      const journal = store.readEvents(current.runIdentity.runId);
      const priorDispatch = journal.findLast((event) => (
        event.type === "dispatch.recorded"
        && event.issueId === action.issueId
        && event.attempt === action.attempt - 1
      ));
      if (!priorDispatch) throw new Error("RETRY_DISPATCH_REFERENCE_MISSING");
      const task = await tasks.read(priorDispatch.taskRef);
      let nextTaskRef = priorDispatch.taskRef;
      let replacement = null;
      if (task?.state === "RESUMABLE") {
        const accepted = task.retryRequest?.state === "ACCEPTED"
          && task.retryRequest.runId === current.runIdentity.runId
          && task.retryRequest.issueId === action.issueId
          && task.retryRequest.attempt === action.attempt;
        if (!accepted) {
          await tasks.message(
            priorDispatch.taskRef,
            `Use $execute-issue to retry Issue ${action.issueId} under the unchanged read-back DAG Run Grant. Retry request: ${JSON.stringify({runId: current.runIdentity.runId, issueId: action.issueId, attempt: action.attempt})}`,
          );
        }
      } else if (task?.state === "INACTIVE" && Array.isArray(task.inactiveEvidence)
        && task.inactiveEvidence.length > 0 && task.inactiveEvidence.every(isText)) {
        const existing = await tasks.findIssueLane({
          issueId: action.issueId,
          runIdentity: current.runIdentity,
          supersededTaskRef: priorDispatch.taskRef,
        });
        if (!Array.isArray(existing) || existing.length > 1) {
          return issueLaneAmbiguous(status, action.issueId, Array.isArray(existing) ? existing.length : 0);
        }
        nextTaskRef = existing[0] ?? await tasks.create({
          issueId: action.issueId,
          runIdentity: current.runIdentity,
          environment: "local",
          attempt: action.attempt,
        });
        if (!isTaskRef(nextTaskRef)) throw new Error("ISSUE_LANE_NOT_READY");
        replacement = {
          supersedesAttempt: action.attempt - 1,
          nextTaskRef,
          inactiveEvidence: [...task.inactiveEvidence],
        };
      } else {
        return diagnosedStop(status, {
          reasonCode: "insufficient_evidence",
          limitationClass: "unresolved-evidence",
          evidence: [
            `Task ${priorDispatch.taskRef.threadId}@${priorDispatch.taskRef.hostId} liveness state ${task?.state ?? "missing"} does not prove resumable or exactly inactive.`,
          ],
          noAutomaticTransition: "Retry cannot resume or replace a task without exact liveness evidence.",
          affectedNodes: [action.issueId],
          resumePredicates: ["exact_task_liveness_evidence_is_available"],
        });
      }
      writer.append({
        type: "retry.recorded",
        at: now(),
        issueId: action.issueId,
        attempt: action.attempt - 1,
        reason: "transient_task_failure",
        priorTaskRef: priorDispatch.taskRef,
        replacement,
      });
      writer.append({
        type: "dispatch.recorded",
        at: now(),
        issueId: action.issueId,
        attempt: action.attempt,
        taskRef: nextTaskRef,
      });
      return null;
    }
    const prepared = current.preparedLanes?.[action.issueId];
    const existing = await tasks.findIssueLane({
      issueId: action.issueId,
      runIdentity: current.runIdentity,
      prepared,
    });
    if (!Array.isArray(existing) || existing.length > 1) {
      return issueLaneAmbiguous(status, action.issueId, Array.isArray(existing) ? existing.length : 0);
    }
    const taskRef = existing[0] ?? await tasks.create({
      issueId: action.issueId,
      runIdentity: current.runIdentity,
      environment: "local",
    });
    if (!isTaskRef(taskRef)) throw new Error("ISSUE_LANE_NOT_READY");
    if (prepared) {
      const task = await tasks.read(taskRef);
      const accepted = task.retryRequest?.state === "ACCEPTED" && task.retryRequest.runId === current.runIdentity.runId
        && task.retryRequest.issueId === action.issueId && task.retryRequest.attempt === 1;
      if (!accepted) {
        if (task.state !== "RESUMABLE") throw new Error("Prepared lane has not settled; preserve it before execution");
        await tasks.message(taskRef, `Use $execute-issue to retry Issue ${action.issueId} from its prepared prerequisite candidate in this exact task and worktree. Reuse the freshly read attestation and existing approvals. Retry request: ${JSON.stringify({ runId: current.runIdentity.runId, issueId: action.issueId, attempt: 1 })}`);
      }
    }
    writer.append({
      type: "dispatch.recorded",
      at: now(),
      issueId: action.issueId,
      attempt: action.attempt,
      taskRef,
    });
    return null;
  };

  const repairIssue = async ({ action, current, writer }) => {
    const journal = store.readEvents(current.runIdentity.runId);
    const prior = journal.filter(event => event.type === "repair.recorded" && event.issueId === action.issueId);
    const taskRef = current.taskRefs?.[action.issueId];
    if (!isTaskRef(taskRef)) throw new Error("Conflict repair requires the original Issue task");
    let intent = prior.findLast(event => event.candidate === action.candidate);
    if (!intent) {
      const wave = prior.length + 1;
      if (wave > 10) throw new Error("Persistent conflict repair budget exhausted");
      const requestIdentity = closeRequestIdentityFor({ runIdentity: current.runIdentity, issueId: action.issueId, candidate: action.candidate, baseline: action.targetHead, wave });
      intent = writer.append({ type: "repair.recorded", at: now(), issueId: action.issueId, wave, candidate: action.candidate, targetHead: action.targetHead, taskRef, requestIdentity });
    }
    const task = await tasks.read(taskRef);
    const accepted = task.repairRequest?.requestIdentity === intent.requestIdentity && task.repairRequest.runId === current.runIdentity.runId;
    if (!accepted) {
      if (task.state !== "RESUMABLE") throw new Error("Original Issue task is not ready for conflict repair");
      await tasks.message(taskRef, `Use $execute-issue to repair Issue ${action.issueId} in this original task, topic branch and worktree under the unchanged read-back DAG Run Grant. The close owner restored the target after a merge conflict. Merge the exact current target baseline into this topic without rebasing or resetting; resolve only the existing AC and exclusions. Semantic scope conflicts stop this Issue and its dependants. Verify the new candidate and obtain clean independent Standards and Spec review before a new implementation_complete; do not integrate or close. Persistent repair wave ${intent.wave}/10. Repair request: ${JSON.stringify({ runId: current.runIdentity.runId, issueId: action.issueId, candidate: intent.candidate, baseline: intent.targetHead, wave: intent.wave, requestIdentity: intent.requestIdentity })}`);
    }
  };

  const closeIssue = async ({ action, current, status, step = false }) => {
    let taskRef = current.taskRefs?.[action.issueId];
    if (!isTaskRef(taskRef)) {
      const existing = await tasks.findIssueLane({
        issueId: action.issueId,
        runIdentity: current.runIdentity,
        purpose: "close",
      });
      if (!Array.isArray(existing) || existing.length > 1) {
        return { stopped: issueLaneAmbiguous(status, action.issueId, Array.isArray(existing) ? existing.length : 0) };
      }
      taskRef = existing[0];
      if (!isTaskRef(taskRef)) return { stopped: issueLaneMissing(status, action.issueId) };
    }
    const node = status.nodes.find(({ issueId }) => issueId === action.issueId);
    const sourceNode = current.facts.nodes.find(({ issueId }) => issueId === action.issueId);
    const requestEvidence = {
      runIdentity: current.runIdentity,
      maxParallel: current.grant.maxParallel ?? DEFAULT_MAX_PARALLEL,
      issueId: action.issueId,
      target: current.runIdentity.target,
      targetState: current.facts.run.targetState,
      targetHead: current.facts.run.targetHead,
      controlRevision: status.run.controlRevision,
      trackerState: node.close.trackerState,
      completionState: node.close.completionState,
      candidateReachable: node.close.candidateReachable,
      worktreeState: node.close.worktreeState,
      authorityEvidence: sourceNode.closeAuthorityEvidence,
    };
    let requestIdentity = closeRequestIdentityFor(requestEvidence);
    const task = await tasks.read(taskRef);
    const acceptedForLane = task?.closeRequest?.state === "ACCEPTED"
      && task.closeRequest.runId === current.runIdentity.runId
      && task.closeRequest.issueId === action.issueId;
    if (acceptedForLane && task.closeRequest.evidence && closeRequestIdentityFor(task.closeRequest.evidence) === requestIdentity) requestIdentity = task.closeRequest.requestIdentity;
    const repair = store.readEvents(current.runIdentity.runId).findLast(event => event.type === "repair.recorded" && event.issueId === action.issueId);
    const renewedAfterRepair = acceptedForLane && task.state === "RESUMABLE" && repair
      && repair.candidate === task.closeRequest.evidence?.authorityEvidence?.candidateCommit
      && sourceNode.closeAuthorityEvidence.candidateCommit !== repair.candidate;
    if (task?.closeRequest?.state === "ACCEPTED"
      && (!acceptedForLane || task.closeRequest.requestIdentity !== requestIdentity) && !renewedAfterRepair) {
      return {
        stopped: closeRequestEvidenceChanged(status, {
          issueId: action.issueId,
          expected: requestIdentity,
          observed: task.closeRequest.requestIdentity,
        }),
      };
    }
    const accepted = acceptedForLane && task.closeRequest.requestIdentity === requestIdentity;
    const continuation = accepted ? planCloseContinuation({ task, requestIdentity, requestEvidence }) : { needed: false };
    if (continuation.exhausted) return { stopped: diagnosedStop(status, {
      reasonCode: "close_retry_budget_exhausted", evidence: ["Three native close continuations settled without progress; preserve the original task and current Git/tracker state."],
      affectedNodes: [action.issueId], noAutomaticTransition: "The unchanged close progress exhausted its persistent continuation budget.", resumePredicates: ["close_progress_or_owning_source_failure_is_resolved"],
    }) };
    if (continuation.needed) await sleep([5000, 15000, 30000][continuation.attempt - 1]);
    if (!accepted || continuation.needed) {
      await tasks.message(
        taskRef,
        `Use $close-issue to close Issue ${action.issueId} under the unchanged read-back DAG Run Grant. Close request identity: ${requestIdentity}. Current close request evidence: ${JSON.stringify(requestEvidence)}${closeContinuationSuffix(continuation)}`,
      );
    }
    if (step) return { active: true };
    const waited = await tasks.wait([taskRef]);
    const settled = waited?.taskSettled === true;
    if (settled && waited.closeRequestIdentity !== requestIdentity) {
      return {
        stopped: closeRequestEvidenceChanged(status, {
          issueId: action.issueId,
          expected: requestIdentity,
          observed: waited.closeRequestIdentity,
        }),
      };
    }
    return { active: waited?.coordinatorActive !== false };
  };

  const remediateEnvironment = async ({ action, current, writer }) => {
    if (action.fingerprint !== WINDOWS_GRADLE_LOOPBACK_FINGERPRINT) {
      return false;
    }
    requireMethod(environment, "remediate");
    const taskRef = current.taskRefs?.[action.issueId];
    if (!isTaskRef(taskRef)) throw new Error("REMEDIATION_TASK_REFERENCE_MISSING");
    const adapter = "gradle-loopback-safe";
    writer.append({
      type: "remediation.recorded",
      at: now(),
      issueId: action.issueId,
      attempt: action.attempt,
      fingerprint: action.fingerprint,
      cycle: action.cycle,
      adapter,
    });
    await environment.remediate({
      adapter,
      issueId: action.issueId,
      attempt: action.attempt,
      taskRef,
      fingerprint: action.fingerprint,
      cycle: action.cycle,
    });
    return true;
  };

  const closeParent = async ({ action, current, status, step = false }) => {
    requireMethod(leaf, "closeParent");
    const requestEvidence = {
      runIdentity: current.runIdentity,
      maxParallel: current.grant.maxParallel ?? DEFAULT_MAX_PARALLEL,
      issueId: action.issueId,
      target: current.runIdentity.target,
      targetState: current.facts.run.targetState,
      targetHead: current.facts.run.targetHead,
      parentTrackerState: current.facts.run.parentTrackerState,
      parentTrackerIdentity: current.facts.run.parentTrackerIdentity,
      controlRevision: status.run.controlRevision,
      childCloseStates: status.nodes.map(({ issueId, close }) => ({
        issueId,
        ...close,
        authorityEvidence: current.facts.nodes
          .find((node) => node.issueId === issueId).closeAuthorityEvidence,
      })),
    };
    const requestIdentity = closeRequestIdentityFor(requestEvidence);
    const result = await leaf.closeParent({
      issueId: action.issueId,
      runIdentity: current.runIdentity,
      requestIdentity,
      requestEvidence,
      step,
    });
    if (result?.settled === true && result.requestIdentity !== requestIdentity) {
      return {
        stopped: closeRequestEvidenceChanged(status, {
          issueId: action.issueId,
          expected: requestIdentity,
          observed: result.requestIdentity,
        }),
      };
    }
    return { settled: result?.settled === true };
  };

  const waitForCloseLease = async ({ action, current, operationIdentity, request, status, writer }) => {
    const repositoryCloseWait = action.type === "wait_repository_close_lease";
    const waitKind = repositoryCloseWait ? {
      startedType: "repository-close-wait.started",
      settledType: "repository-close-wait.settled",
      label: "repository close lease",
      readBackSource: "repository close-lease read-back",
      livenessSource: "repository close-lease and liveness read-back",
      ownerChanged: REASON_CODES.repositoryCloseLeaseOwnerChanged,
      timeout: REASON_CODES.repositoryCloseLeaseWaitTimeout,
      coordinatorLost: REASON_CODES.repositoryCloseLeaseWaitCoordinatorLost,
      interrupted: REASON_CODES.repositoryCloseLeaseWaitInterrupted,
      evidenceChanged: REASON_CODES.repositoryCloseLeaseEvidenceChanged,
      absentPredicate: "repository_close_lease_is_absent_or_healthy",
      reconcilePredicate: "repository_close_lease_ownership_is_reconciled",
    } : {
      startedType: "target-writer-wait.started",
      settledType: "target-writer-wait.settled",
      label: "target mutation writer",
      readBackSource: "shared target-writer lock read-back",
      livenessSource: "shared target-writer lock and liveness read-back",
      ownerChanged: REASON_CODES.targetWriterOwnerChanged,
      timeout: REASON_CODES.targetWriterWaitTimeout,
      coordinatorLost: REASON_CODES.targetWriterWaitCoordinatorLost,
      interrupted: REASON_CODES.targetWriterWaitInterrupted,
      evidenceChanged: REASON_CODES.targetWriterEvidenceChanged,
      absentPredicate: "target_writer_is_absent_or_healthy",
      reconcilePredicate: "target_writer_ownership_is_reconciled",
    };
    const events = store.readEvents(current.runIdentity.runId);
    let recoveryStatus = status;
    const unsettled = events.findLast((event) => event.type === waitKind.startedType
      && !events.some((candidate) => (
        candidate.type === waitKind.settledType && candidate.waitSequence === event.sequence
      )));
    const recovery = {
      [waitKind.ownerChanged]: {
        owningSource: waitKind.readBackSource,
        smallestHumanAction: `Reconcile the current ${waitKind.label} owner without releasing or replacing it.`,
      },
      [waitKind.timeout]: {
        owningSource: waitKind.livenessSource,
        smallestHumanAction: `Wait for the healthy ${waitKind.label} owner to finish, then retry the same command.`,
      },
      [waitKind.coordinatorLost]: {
        owningSource: "active coordinator liveness read-back",
        smallestHumanAction: "Start one active coordinator by retrying the same command.",
      },
      [waitKind.interrupted]: {
        owningSource: "append-only coordinator journal read-back",
        smallestHumanAction: "Inspect the settled orphaned wait, then retry the same command.",
      },
      [waitKind.evidenceChanged]: {
        owningSource: "post-wait owning-source reconciliation",
        smallestHumanAction: "Restore or accept the changed owning-source evidence, then retry the same command.",
      },
    };
    const stop = (reasonCode, evidence, resumePredicates) => {
      const recoveryAction = recovery[reasonCode];
      return { stopped: diagnosedStop(recoveryStatus, {
        reasonCode,
        limitationClass: "instance-blocker",
        evidence,
        noAutomaticTransition: `Closeout cannot continue from stale or exceptional ${waitKind.label} wait evidence.`,
        affectedNodes: [action.issueId],
        resumePredicates,
        operatorPacket: createRecoverableOperatorPacket({
          ...recoveryAction,
          observedEvidence: evidence,
          run: recoveryStatus.run,
          nodes: recoveryStatus.nodes,
        }),
      }) };
    };
    const appendSettlement = ({ started, outcome, evidence, at = now() }) => writer.append({
      type: waitKind.settledType,
      at,
      waitSequence: started.sequence,
      issueId: started.issueId,
      target: started.target,
      owner: started.owner,
      outcome,
      evidence,
    });

    const started = unsettled ?? writer.append({
      type: waitKind.startedType,
      at: now(),
      issueId: action.issueId,
      target: current.runIdentity.target,
      owner: action.owner,
      timeoutMs: action.timeoutMs,
      preWaitEvidence: action.preWaitEvidence,
    });
    if (started.preWaitEvidence.controlRevision !== status.run.controlRevision) {
      appendSettlement({ started, outcome: "CONTROL_CHANGED", evidence: ["A control revision superseded the pending observation."] });
      return { controlRevisionChanged: true };
    }
    const changedEvidenceStop = (evidence) => {
      appendSettlement({ started, outcome: "EVIDENCE_CHANGED", evidence });
      return stop(
        waitKind.evidenceChanged,
        evidence,
        ["post_wait_evidence_is_reconciled", "retry_same_run_issue_workflow"],
      );
    };
    const reconcileReleasedWriter = async () => {
      const trackerResult = await readTracker(request);
      if (!trackerResult.available) {
        return changedEvidenceStop([
          `The exact competing ${waitKind.label} released, but Tracker read-back failed after probes ${trackerResult.attempts.join(", ")}.`,
        ]);
      }
      let refreshed;
      try {
        refreshed = await reconcile({
          request,
          tracker: trackerResult.snapshot,
          journal: store.readEvents(current.runIdentity.runId),
          tasks,
        });
        if (operationIdentity) refreshed = bindFreshRunOperation(refreshed, operationIdentity);
        recoveryStatus = writer.rebuildStatus(refreshed.facts);
        const refreshedEvidence = createCloseWaitEvidence({
          runIdentity: refreshed.runIdentity,
          grant: refreshed.grant,
          run: refreshed.facts.run,
          nodes: refreshed.facts.nodes,
          controlRevision: recoveryStatus.run.controlRevision,
        });
        if (!sameCloseWaitAuthority(started.preWaitEvidence, refreshedEvidence, action.issueId)) {
          return changedEvidenceStop([
            `Pre-wait evidence ${JSON.stringify(started.preWaitEvidence)}.`,
            `Post-wait evidence ${JSON.stringify(refreshedEvidence)}.`,
          ]);
        }
      } catch (error) {
        return changedEvidenceStop([
          `The exact competing ${waitKind.label} released, but owning-source reconciliation failed: ${error?.message ?? String(error)}.`,
        ]);
      }
      appendSettlement({
        started,
        outcome: "RELEASED",
        evidence: [`The exact competing ${waitKind.label} is absent; close authority is unchanged and current readiness was reacquired.`],
      });
      return { released: true };
    };
    const settleObservedOwner = async (observation) => {
      if (observation.state === "MATCH") return null;
      if (observation.state === "ABSENT") {
        return reconcileReleasedWriter();
      }
      appendSettlement({
        started,
        outcome: "OWNER_CHANGED",
        evidence: [`${waitKind.label} changed from ${JSON.stringify(action.owner)} to ${JSON.stringify(observation.owner)} (${observation.state}).`],
      });
      return stop(
        waitKind.ownerChanged,
        [
          `${waitKind.label} ownership changed during wait for target ${current.runIdentity.target}.`,
          `Observed owning source ${JSON.stringify(observation)}.`,
        ],
        [waitKind.reconcilePredicate, "retry_same_run_issue_workflow"],
      );
    };
    const observeOwner = () => repositoryCloseWait
      ? store.observeRepositoryCloseLease({ expectedOwner: action.owner })
      : store.observeTargetMutationWriter({
        target: current.runIdentity.target,
        expectedOwner: action.owner,
      });
    recoveryStatus = writer.rebuildStatus(current.facts);
    const observedOutcome = await settleObservedOwner(observeOwner());
    if (observedOutcome) return observedOutcome;
    const health = repositoryCloseWait ? current.facts.run.repositoryCloseLeaseHealth : current.facts.run.closeWriterHealth;
    if (health !== "HEALTHY") {
      appendSettlement({ started, outcome: "COORDINATOR_INACTIVE", evidence: ["Current owner health is unproven; the lease remains untouched."] });
      return stop(waitKind.coordinatorLost, ["Current owner health is unproven."], [waitKind.reconcilePredicate]);
    }
    // One observation slice yields back to scheduling; elapsed time never invalidates healthy ownership.
    const waitResult = request.mode === "step" ? undefined : await sleep(1000);
    if (waitResult?.coordinatorActive === false) {
      appendSettlement({ started, outcome: "COORDINATOR_INACTIVE", evidence: ["The active coordinator disconnected; retain owner and progress."] });
      return stop(waitKind.coordinatorLost, ["Coordinator liveness became inactive during wait."], ["coordinator_is_active"]);
    }
    const latestControl = store.readEvents(current.runIdentity.runId).findLast(({ type }) => type === "control.revised");
    if ((latestControl?.revision ?? 0) !== status.run.controlRevision) {
      appendSettlement({ started, outcome: "CONTROL_CHANGED", evidence: ["Control revision changed during wait."] });
      return { controlRevisionChanged: true };
    }
    return { waiting: true };

  };

  return {
    async run(request = {}) {
      if (request.executionSlots !== undefined && (!Number.isInteger(request.executionSlots) || request.executionSlots < 0)) throw new TypeError("Invalid batch execution capacity");
      let selectedRequest = request;
      let stepFinished = false;
      let candidateRuns = null;
      if (!isText(request.specId)) {
        requireMethod(selector, "listNonTerminalRuns");
        const candidates = await selector.listNonTerminalRuns({ store, tasks, specId: null });
        if (!Array.isArray(candidates) || candidates.length !== 1) {
          return runSelectionRequired(Array.isArray(candidates) ? candidates.length : 0);
        }
        const selectedCandidate = candidates[0];
        const selectedRun = selectedCandidate.runIdentity ?? selectedCandidate;
        if (!RUN_IDENTITY_KEYS.every((key) => key === "decompositionIdentity"
          ? selectedRun?.[key] === null || isText(selectedRun?.[key])
          : isText(selectedRun?.[key]))) {
          return runSelectionRequired(candidates.length);
        }
        selectedRequest = {
          ...request,
          specId: selectedRun.specId,
          runIdentity: selectedRun,
          issueIds: selectedCandidate.issueIds,
          maxParallel: selectedCandidate.maxParallel,
        };
      } else if (typeof selector?.listNonTerminalRuns === "function") {
        const candidates = await selector.listNonTerminalRuns({ store, tasks, specId: request.specId });
        if (!Array.isArray(candidates)) return runSelectionRequired(0);
        candidateRuns = candidates.filter((candidate) => (
          (candidate.runIdentity ?? candidate)?.specId === request.specId
        ));
      }
      let runIdentity;
      let runOperationIdentity;
      let writer;
      let grantRecorded = false;
      let lastStatus = null;
      let latestFacts = null;
      let panelHandle = null;
      const actionFactsIdentity = (facts, issueId) => JSON.stringify(canonicalize({
        run: Object.fromEntries(RUN_IDENTITY_KEYS.map(key => [key, facts.run[key]])),
        node: facts.nodes.find(node => node.issueId === issueId),
      }));
      const actionProgressIdentity = (facts, issueId) => {
        const resume = store.readEvents(facts.run.runId).findLast(event => event.type === "control.revised" && event.command === "RESUME");
        return `sha256:${createHash("sha256").update(JSON.stringify([actionFactsIdentity(facts, issueId), resume?.revision ?? 0])).digest("hex")}`;
      };
      const failedActions = facts => store.readEvents(facts.run.runId).filter(event => event.type === "action.failed"
        && event.progressIdentity === actionProgressIdentity(facts, event.issueId));
      const rebuildStatus = (facts) => {
        const control = store.readEvents(facts.run.runId).findLast(event => event.type === "control.revised");
        const local = [];
        const reservations = new Map();
        for (const failure of failedActions(facts).filter(event => event.attempt === 3)) {
          local.push({ code: "issue_action_retry_exhausted", reasonCode: "issue_action_retry_exhausted",
            affectedNodes: [failure.issueId], evidence: [`${failure.actionType} exhausted three attempts without owning-source progress: ${failure.evidence}`] });
          if (failure.actionType === "dispatch_issue") reservations.set(failure.issueId, 1);
        }
        for (const [key, entry] of actionStops) {
          if (entry.runId !== facts.run.runId) continue;
          if (entry.factsIdentity !== actionFactsIdentity(facts, entry.issueId)
            || control?.command === "RESUME" && control.revision > entry.controlRevision) { actionStops.delete(key); continue; }
          if (entry.reservationCount) reservations.set(entry.issueId, entry.reservationCount);
          local.push({ code: entry.diagnosis.reasonCode, reasonCode: entry.diagnosis.reasonCode,
            affectedNodes: [entry.issueId], evidence: entry.diagnosis.evidence });
        }
        latestFacts = { ...facts, nodes: facts.nodes.map(node => reservations.has(node.issueId) ? { ...node, reservedWorkers: reservations.get(node.issueId) } : node), contradictions: [...facts.contradictions, ...local] };
        return writer.rebuildStatus(latestFacts);
      };
      const isolateActionStop = (stopped, action, current) => {
        if (current.runIdentity.classification !== "MULTI" || !current.facts.nodes.some(node => node.issueId === action.issueId)) return false;
        const diagnosis = stopped.diagnoses.findLast(item => item.affectedNodes.includes(action.issueId));
        if (!diagnosis) return false;
        actionStops.set(`${current.runIdentity.runId}:${action.issueId}`, { runId: current.runIdentity.runId, issueId: action.issueId,
          factsIdentity: actionFactsIdentity(current.facts, action.issueId), controlRevision: stopped.run.controlRevision, diagnosis, reservationCount: stopped.reservationCount ?? 0 });
        return true;
      };
      const refreshActionStops = async current => {
        for (const [key, entry] of actionStops) {
          if (entry.runId !== current.runIdentity.runId || !["issue_lane_ambiguous", "issue_lane_missing"].includes(entry.diagnosis.reasonCode)) continue;
          try {
            const found = await tasks.findIssueLane({ issueId: entry.issueId, runIdentity: current.runIdentity });
            if (Array.isArray(found) && (found.length === 1 || found.length === 0 && entry.diagnosis.reasonCode === "issue_lane_ambiguous")) actionStops.delete(key);
            else if (Array.isArray(found)) entry.reservationCount = found.length;
          } catch { /* Unproven identity keeps only this Issue fenced. */ }
        }
      };
      const publishPanelStop = (status, error) => {
        requireMethod(writer, "publishStatus");
        return writer.publishStatus(error?.message === "CODEX_HOST_DISCONNECTED"
          ? coordinatorUnavailable(status) : panelUnavailable(status));
      };
      const openPanel = async (status) => {
        if (!panel || panelHandle) return null;
        try {
          const opened = await panel.open({
            runIdentity,
            readStatus: () => store.readStatus(runIdentity.runId),
            appendEvent: (event) => writer.append(event),
            rebuildStatus: () => writer.rebuildStatus(latestFacts),
          });
          requireMethod(opened, "close");
          panelHandle = opened;
          return null;
        } catch (error) {
          return publishPanelStop(status, error);
        }
      };
      try {
        while (true) {
          const trackerResult = await readTracker(selectedRequest);
          if (!trackerResult.available) {
            if (!selectedRequest.runIdentity && candidateRuns?.length > 1) {
              return runSelectionRequired(candidateRuns.length);
            }
            const outageCandidate = !selectedRequest.runIdentity && candidateRuns?.length === 1
              ? candidateRuns[0]
              : null;
            const outageRequest = outageCandidate ? {
              ...selectedRequest,
              runIdentity: outageCandidate.runIdentity ?? outageCandidate,
              issueIds: outageCandidate.issueIds,
              maxParallel: outageCandidate.maxParallel,
            } : selectedRequest;
            return trackerUnavailable(outageRequest, trackerResult.attempts, lastStatus, trackerResult.authorityConflict);
          }
          const journal = runIdentity ? store.readEvents(runIdentity.runId) : [];
          let current = await reconcile({
            request: selectedRequest,
            tracker: trackerResult.snapshot,
            journal,
            tasks,
          });
          if (runOperationIdentity) current = bindFreshRunOperation(current, runOperationIdentity);
          if (current.runIdentity?.specId !== selectedRequest.specId) {
            return preflightConflict(current, {
              reasonCode: "spec_selection_conflict",
              evidence: [
                `Entry selected Spec ${selectedRequest.specId}; reconciliation returned Spec ${current.runIdentity?.specId ?? "unknown"}.`,
              ],
              resumePredicates: ["selected_and_reconciled_spec_match"],
            });
          }
          if (!runIdentity) {
            const runReadyFacts = await handoff.read({
              request: selectedRequest,
              tracker: trackerResult.snapshot,
              current,
            });
            let runReadyHandoff = reduceRunReadyHandoff(runReadyFacts);
            if (["READY", "INCOMPLETE"].includes(runReadyHandoff.state)) {
              const mismatch = RUN_READY_AUTHORITY_KEYS.find((key) => (
                runReadyFacts.authority[key] !== (key === "planningSeal"
                  ? current.planningSeal
                  : current.runIdentity[key])
              ));
              if (mismatch) {
                const observed = runReadyFacts.authority[mismatch] ?? null;
                const expected = (mismatch === "planningSeal"
                  ? current.planningSeal
                  : current.runIdentity[mismatch]) ?? null;
                runReadyHandoff = {
                  ...runReadyHandoff,
                  state: "UNKNOWN",
                  reasonCode: "selected_authority_conflict",
                  retryCommand: null,
                  evidence: [
                    `Run-ready handoff authority ${mismatch} observed ${JSON.stringify(observed)}; reconciliation expected ${JSON.stringify(expected)}.`,
                  ],
                  observed: {
                    ...runReadyHandoff.observed,
                    selectedAuthorityConflict: { field: mismatch, observed, expected },
                  },
                  nextOwner: "human",
                  noAutomaticTransition: "Observed Run Entry evidence does not authorize an automatic transition.",
                  recoveryPredicates: ["selected_and_handoff_authority_match"],
                };
              }
            }
            if (runReadyHandoff.state !== "READY") return runReadyStop(current, runReadyHandoff);
            if (candidateRuns && !selectedRequest.runIdentity) {
              const deterministic = runReadyFacts.operationIdentity
                ? candidateRuns.filter((candidate) => (
                  (candidate.runIdentity ?? candidate)?.runId === runReadyFacts.operationIdentity.key
                ))
                : [];
              const compatible = candidateRuns.filter((candidate) => (
                authorityMismatch(current.runIdentity, candidate.runIdentity ?? candidate) === null
              ));
              const deterministicConflict = deterministic.some((candidate) => (
                authorityMismatch(current.runIdentity, candidate.runIdentity ?? candidate) !== null
              ));
              const matching = deterministicConflict ? deterministic : compatible;
              if (matching.length > 1) return runSelectionRequired(matching.length);
              if (matching.length === 1) {
                const selectedCandidate = matching[0];
                selectedRequest = {
                  ...selectedRequest,
                  runIdentity: selectedCandidate.runIdentity ?? selectedCandidate,
                  issueIds: selectedCandidate.issueIds,
                  maxParallel: selectedCandidate.maxParallel,
                };
                continue;
              }
            }
            const selectedRunId = selectedRequest.runIdentity?.runId ?? current.runIdentity?.runId;
            const observedGrant = isText(selectedRunId)
              ? store.readEvents(selectedRunId).findLast(({ type }) => type === "grant.recorded")
              : null;
            const selectedGrant = observedGrant
              && identityMismatch(current.runIdentity, observedGrant.runIdentity) === null
              ? observedGrant
              : null;
            if (runReadyFacts.operationIdentity && !selectedGrant) {
              runOperationIdentity = runReadyFacts.operationIdentity;
              current = bindFreshRunOperation(current, runReadyFacts.operationIdentity);
            }
            runIdentity = current.runIdentity;
            const selectedMismatch = selectedRequest.runIdentity
              ? identityMismatch(selectedRequest.runIdentity, runIdentity)
              : null;
            const grantMismatch = identityMismatch(runIdentity, current.grant?.runIdentity);
            if (selectedMismatch || grantMismatch) {
              const mismatch = selectedMismatch ?? grantMismatch;
              return preflightConflict(current, {
                reasonCode: "grant_identity_conflict",
                evidence: [`Run identity differs at ${mismatch}.`],
                resumePredicates: ["grant_and_selected_run_identity_match"],
              });
            }
            if (onSelected) await onSelected({ request: selectedRequest, current });
            const acquired = acquireRunWriter(current);
            if (acquired.stopped) return acquired.stopped;
            writer = acquired.writer;
          } else {
            const recordedGrant = store.readEvents(runIdentity.runId)
              .findLast(({ type }) => type === "grant.recorded");
            const afterWriterWait = journal.some((event) => (
              ["repository-close-wait.settled", "target-writer-wait.settled"].includes(event.type)
              && event.outcome === "RELEASED"
            ));
            const stopped = authorityDrift({
              status: lastStatus,
              runIdentity,
              current,
              recordedGrant,
              afterWriterWait,
            });
            if (stopped) return stopped;
          }
          if (!grantRecorded) {
            const previousGrant = store.readEvents(runIdentity.runId)
              .findLast(({ type }) => type === "grant.recorded");
            const grantMaxParallel = current.grant.maxParallel ?? DEFAULT_MAX_PARALLEL;
            if (previousGrant && previousGrant.maxParallel !== grantMaxParallel) {
              lastStatus = rebuildStatus(current.facts);
              return diagnosedStop(lastStatus, {
                reasonCode: "grant_identity_conflict",
                limitationClass: "contract-blocker",
                evidence: [
                  `Run ${runIdentity.runId} Grant max_parallel is ${previousGrant.maxParallel}; reconciliation proposed ${grantMaxParallel}.`,
                ],
                noAutomaticTransition: "Grant renewal cannot change max_parallel without a valid revisioned setting.",
                affectedNodes: lastStatus.nodes.map(({ issueId }) => issueId),
                resumePredicates: ["matching_grant_or_revisioned_setting_is_reconciled"],
              });
            }
            if (previousGrant && !sameWorkflowVersion(previousGrant.workflowVersion, workflowVersion)
              && !(sameWorkflowVersion(previousGrant.workflowVersion, compatibleRecordedVersion)
                && workflowVersion?.protocolVersion === 1 && compatibleRecordedVersion?.protocolVersion === 1
                && workflowVersion.sourceRepository === compatibleRecordedVersion.sourceRepository)) {
              return diagnosedStop(rebuildStatus(current.facts), {
                reasonCode: "workflow_version_unavailable",
                limitationClass: "contract-blocker",
                evidence: ["The runtime version differs from this Run's recorded workflow version."],
                noAutomaticTransition: "Preserve the Run and restore its trusted package before resuming.",
                affectedNodes: current.facts.nodes.map(({ issueId }) => issueId),
                resumePredicates: ["recorded_workflow_version_is_available"],
              });
            }
            if (!previousGrant) writer.append({
              type: "grant.recorded",
              at: now(),
              runIdentity,
              maxParallel: grantMaxParallel,
              ...(workflowVersion === undefined ? {} : { workflowVersion }),
            });
            const priorRuntime = store.readEvents(runIdentity.runId).findLast(({ type }) => type === "runtime.observed");
            if (previousGrant && !sameWorkflowVersion(previousGrant.workflowVersion, workflowVersion)
              && !sameWorkflowVersion(priorRuntime?.workflowVersion, workflowVersion)) writer.append({ type: "runtime.observed", at: now(), workflowVersion });
            grantRecorded = true;
            lastStatus = rebuildStatus(current.facts);
            const panelStopped = await openPanel(lastStatus);
            if (panelStopped) return panelStopped;
            continue;
          }

          // Creation may have reached the host before its dispatch receipt. Reconcile every
          // pending intent before a batch snapshot can advertise free worker capacity.
          if (tasks.observePendingCreations) {
            const pending = await tasks.observePendingCreations({ runIdentity, issueIds: current.facts.nodes.map(node => node.issueId) });
            let adopted = false;
            for (const observation of pending) {
              if (observation.refs?.length === 1 && isTaskRef(observation.refs[0])) {
                writer.append({ type: "dispatch.recorded", at: now(), issueId: observation.issueId, attempt: 1, taskRef: observation.refs[0] });
                actionStops.delete(`${runIdentity.runId}:${observation.issueId}`);
                adopted = true;
              } else {
                const stopped = issueLaneAmbiguous(rebuildStatus(current.facts), observation.issueId, observation.refs?.length ?? 0);
                if (observation.error) stopped.diagnoses.at(-1).evidence.push(observation.error);
                if (!isolateActionStop(stopped, { issueId: observation.issueId }, current)) return stopped;
              }
            }
            if (adopted) continue;
          }
          await refreshActionStops(current);
          lastStatus = rebuildStatus(current.facts);
          for (const pending of request.controlQueue?.splice(0) ?? []) {
            try {
              const decision = planControl(lastStatus, pending.command, now());
              if (decision.changed) { writer.append(decision.event); lastStatus = rebuildStatus(current.facts); }
              pending.resolve({ ...decision, status: lastStatus });
            } catch (error) { pending.reject(error); }
          }
          if (["SUCCEEDED", "STOPPED"].includes(lastStatus.run.state) || request.mode === "snapshot" || stepFinished) return lastStatus;
          if (lastStatus.legalActions.length === 0) {
            if (request.mode === "step") return lastStatus;
            if (lastStatus.run.state === "PAUSED" && typeof panelHandle?.waitForControl === "function") {
              try {
                await panelHandle.waitForControl(lastStatus.run.controlRevision);
              } catch (error) {
                return publishPanelStop(lastStatus, error);
              }
              continue;
            }
            const activeTaskRefs = lastStatus.frontier.active.map((issueId) => current.taskRefs?.[issueId]);
            if (activeTaskRefs.length === 0) return lastStatus;
            if (activeTaskRefs.some((taskRef) => !isTaskRef(taskRef))) {
              throw new Error("ACTIVE_TASK_REFERENCE_MISSING");
            }
            const waited = await tasks.wait(activeTaskRefs);
            if (waited?.coordinatorActive === false) return lastStatus;
            continue;
          }

          let deferredEnvironmentStop = null;
          let controlRevisionChanged = false;
          const actions = lastStatus.legalActions.filter(action => request.executionSlots !== 0 || !["dispatch_issue", "remediate_environment", "repair_issue"].includes(action.type));
          if (request.mode === "step" && actions.length === 0) return lastStatus;
          for (const action of request.mode === "step" ? actions.slice(0, 1) : actions) {
            if (MUTATING_ACTION_TYPES.has(action.type)) {
              const latestControl = store.readEvents(runIdentity.runId)
                .findLast(({ type }) => type === "control.revised");
              if ((latestControl?.revision ?? 0) !== lastStatus.run.controlRevision) {
                controlRevisionChanged = true;
                break;
              }
            }
            try {
            if (action.type === "dispatch_issue") {
              const stopped = await dispatchIssue({ action, current, status: lastStatus, writer });
              if (stopped) { if (isolateActionStop(stopped, action, current)) break; return stopped; }
            } else if (action.type === "repair_issue") {
              await repairIssue({ action, current, writer });
            } else if (action.type === "remediate_environment") {
              const remediated = await remediateEnvironment({ action, current, writer });
              if (!remediated) {
                deferredEnvironmentStop ??= action;
                continue;
              }
            } else if (action.type === "close_issue") {
              const outcome = await closeIssue({ action, current, status: lastStatus, step: request.mode === "step" });
              if (outcome.stopped) { if (isolateActionStop(outcome.stopped, action, current)) break; return outcome.stopped; }
              if (!outcome.active) return lastStatus;
            } else if (action.type === "close_parent") {
              const outcome = await closeParent({ action, current, status: lastStatus, step: request.mode === "step" });
              if (outcome.stopped) { if (isolateActionStop(outcome.stopped, action, current)) break; return outcome.stopped; }
              if (!outcome.settled && request.mode !== "step") return lastStatus;
            } else if (["wait_repository_close_lease", "wait_target_writer"].includes(action.type)) {
              const outcome = await waitForCloseLease({
                action,
                current,
                operationIdentity: runOperationIdentity,
                request: selectedRequest,
                status: lastStatus,
                writer,
              });
              if (outcome.stopped) { if (isolateActionStop(outcome.stopped, action, current)) break; return outcome.stopped; }
              if (outcome.controlRevisionChanged) {
                controlRevisionChanged = true;
                break;
              }
            } else if (action.type === "reconcile_run") {
              // The next loop reacquires tracker and task-owned evidence before rebuilding status.
            } else if (["settle_pause", "settle_stop"].includes(action.type)) {
              writer.append({
                type: action.type === "settle_pause" ? "pause.transitioned" : "stop.transitioned",
                at: now(),
                revision: action.revision,
              });
            } else {
              throw new Error(`UNSUPPORTED_COORDINATOR_ACTION:${action.type}`);
            }
            } catch (error) {
              if (!["dispatch_issue", "repair_issue", "close_issue"].includes(action.type)) throw error;
              lastStatus = rebuildStatus(current.facts); // A fenced writer must throw before any continuation.
              const progressIdentity = actionProgressIdentity(current.facts, action.issueId);
              const attempt = failedActions(current.facts).filter(event => event.issueId === action.issueId && event.actionType === action.type).length + 1;
              writer.append({ type: "action.failed", at: now(), issueId: action.issueId, actionType: action.type, progressIdentity, attempt, evidence: error.message });
              if (attempt < 3) await sleep([1000, 5000][attempt - 1]);
              break;
            }
          }
          if (request.mode === "step") stepFinished = true;
          if (controlRevisionChanged) continue;
          if (deferredEnvironmentStop) {
            const trackerResult = await readTracker(selectedRequest);
            if (!trackerResult.available) {
              return trackerUnavailable(selectedRequest, trackerResult.attempts, lastStatus, trackerResult.authorityConflict);
            }
            let refreshed = await reconcile({
              request: selectedRequest,
              tracker: trackerResult.snapshot,
              journal: store.readEvents(runIdentity.runId),
              tasks,
            });
            if (runOperationIdentity) refreshed = bindFreshRunOperation(refreshed, runOperationIdentity);
            const refreshedStatus = rebuildStatus(refreshed.facts);
            const recordedGrant = store.readEvents(runIdentity.runId)
              .findLast(({ type }) => type === "grant.recorded");
            const authorityStopped = authorityDrift({
              status: refreshedStatus,
              runIdentity,
              current: refreshed,
              recordedGrant,
              afterWriterWait: store.readEvents(runIdentity.runId).some((event) => (
                ["repository-close-wait.settled", "target-writer-wait.settled"].includes(event.type)
                && event.outcome === "RELEASED"
              )),
            });
            if (authorityStopped) return authorityStopped;
            const stillPresent = refreshedStatus.legalActions.some((action) => (
              action.type === "remediate_environment"
              && action.issueId === deferredEnvironmentStop.issueId
              && action.fingerprint === deferredEnvironmentStop.fingerprint
            ));
            if (!stillPresent) {
              lastStatus = refreshedStatus;
              continue;
            }
            return environmentUnresolved(refreshedStatus, deferredEnvironmentStop);
          }
        }
      } finally {
        try {
          if (panelHandle) await panelHandle.close();
        } finally {
          if (writer) writer.release();
        }
      }
    },
  };
}
