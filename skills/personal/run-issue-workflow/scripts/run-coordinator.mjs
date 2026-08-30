import { DEFAULT_MAX_PARALLEL } from "./run-journal.mjs";

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

const isText = (value) => typeof value === "string" && value.length > 0;
const isTaskRef = (value) => value && isText(value.threadId) && isText(value.hostId);

const requireMethod = (owner, name) => {
  if (typeof owner?.[name] !== "function") throw new TypeError(`Coordinator adapter requires ${name}()`);
};

const identityMismatch = (expected, actual) => (
  RUN_IDENTITY_KEYS.find((key) => expected?.[key] !== actual?.[key]) ?? null
);

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

const preflightConflict = (current, { reasonCode, evidence, resumePredicates }) => {
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
      limitationClass: "contract-blocker",
      evidence,
      attemptedRecovery: [],
      retryCount: 0,
      noAutomaticTransition: "Selection and reconciled Run authority must match exactly.",
      affectedNodes: allNodes,
      unaffectedNodes: [],
      nextOwner: "human",
      resumePredicates,
    }],
  };
};

const diagnosedStop = (status, {
  reasonCode,
  limitationClass = "instance-blocker",
  evidence,
  attemptedRecovery = [],
  retryCount = 0,
  noAutomaticTransition,
  affectedNodes,
  resumePredicates,
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
    }],
  };
};

const trackerUnavailable = (request, attempts, status) => {
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
  if (!status) return initialTrackerUnavailable(request, attempts);
  const affectedNodes = status.nodes
    .filter(({ state }) => state !== "SUCCEEDED")
    .map(({ issueId }) => issueId);
  return diagnosedStop(status, {
    reasonCode: "tracker_unavailable",
    limitationClass: "unresolved-evidence",
    evidence: [`Tracker reads failed after ${attempts.join(", ")} millisecond probes.`],
    attemptedRecovery: attempts.map((delayMs) => ({ delayMs })),
    noAutomaticTransition: "Cached tracker evidence cannot authorize workflow action.",
    affectedNodes,
    resumePredicates: ["tracker_read_succeeds"],
  });
};

const issueLaneAmbiguous = (status, issueId, laneCount) => diagnosedStop(status, {
  reasonCode: "issue_lane_ambiguous",
  limitationClass: "unresolved-evidence",
  evidence: [`Issue ${issueId} matched ${laneCount} Codex task lanes; exactly one or zero is required.`],
  noAutomaticTransition: "Ambiguous task identity cannot authorize dispatch, retry, or closeout.",
  affectedNodes: status.nodes.map(({ issueId: nodeIssueId }) => nodeIssueId),
  resumePredicates: ["one_exact_issue_lane_is_proven"],
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

const authorityDrift = ({ status, runIdentity, current, recordedGrant }) => {
  const mismatch = identityMismatch(runIdentity, current.runIdentity)
    ?? identityMismatch(runIdentity, current.grant?.runIdentity);
  if (mismatch) {
    return diagnosedStop(status, {
      reasonCode: "grant_identity_conflict",
      limitationClass: "contract-blocker",
      evidence: [`Run identity changed at ${mismatch} during reconciliation.`],
      noAutomaticTransition: "A live Run cannot change its bound authority.",
      affectedNodes: status.nodes.map(({ issueId }) => issueId),
      resumePredicates: ["grant_and_reconciled_run_identity_match"],
    });
  }
  const grantMaxParallel = current.grant?.maxParallel ?? DEFAULT_MAX_PARALLEL;
  if (recordedGrant && recordedGrant.maxParallel !== grantMaxParallel) {
    return diagnosedStop(status, {
      reasonCode: "grant_identity_conflict",
      limitationClass: "contract-blocker",
      evidence: [
        `Run ${runIdentity.runId} Grant max_parallel is ${recordedGrant.maxParallel}; reconciliation proposed ${grantMaxParallel}.`,
      ],
      noAutomaticTransition: "Grant renewal cannot change max_parallel without a valid revisioned setting.",
      affectedNodes: status.nodes.map(({ issueId }) => issueId),
      resumePredicates: ["matching_grant_or_revisioned_setting_is_reconciled"],
    });
  }
  return null;
};

export function createCoordinator({ store, tracker, tasks, selector, reconcile, leaf, environment, now, sleep }) {
  for (const method of ["readEvents", "acquireWriter", "acquireCloseWriter"]) requireMethod(store, method);
  requireMethod(tracker, "read");
  for (const method of ["findIssueLane", "create", "read", "message", "wait"]) requireMethod(tasks, method);
  if (typeof reconcile !== "function") throw new TypeError("Coordinator requires reconcile()");
  if (typeof now !== "function") throw new TypeError("Coordinator requires now()");
  if (typeof sleep !== "function") throw new TypeError("Coordinator requires sleep()");

  const readTracker = async (request) => {
    try {
      return { available: true, snapshot: await tracker.read(request), attempts: [] };
    } catch {
      const attempts = [];
      for (const delayMs of TRACKER_PROBE_DELAYS_MS) {
        attempts.push(delayMs);
        await sleep(delayMs);
        try {
          return { available: true, snapshot: await tracker.read(request), attempts };
        } catch {
          // Exhaust the fixed probe schedule before returning a diagnosis.
        }
      }
      return { available: false, snapshot: null, attempts };
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
            `Use $execute-issue to retry Issue ${action.issueId} under the unchanged read-back DAG Run Grant.`,
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
    const existing = await tasks.findIssueLane({
      issueId: action.issueId,
      runIdentity: current.runIdentity,
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
    writer.append({
      type: "dispatch.recorded",
      at: now(),
      issueId: action.issueId,
      attempt: action.attempt,
      taskRef,
    });
    return null;
  };

  const acquireTargetCloseWriter = (current) => {
    if (current.closeWriterReclaimProof) {
      requireMethod(store, "reclaimCloseWriter");
      return store.reclaimCloseWriter({
        target: current.runIdentity.target,
        runId: current.runIdentity.runId,
        staleProof: current.closeWriterReclaimProof,
      });
    }
    return store.acquireCloseWriter({
      target: current.runIdentity.target,
      runId: current.runIdentity.runId,
    });
  };

  const closeIssue = async ({ action, current, status }) => {
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
    const closeWriter = acquireTargetCloseWriter(current);
    let settled = false;
    try {
      const task = await tasks.read(taskRef);
      const accepted = task?.closeRequest?.state === "ACCEPTED"
        && task.closeRequest.runId === current.runIdentity.runId
        && task.closeRequest.issueId === action.issueId;
      if (!accepted) {
        await tasks.message(
          taskRef,
          `Use $close-issue to close Issue ${action.issueId} under the unchanged read-back DAG Run Grant.`,
        );
      }
      const waited = await tasks.wait([taskRef]);
      settled = waited?.taskSettled === true;
      return { active: settled && waited?.coordinatorActive !== false };
    } finally {
      if (settled) closeWriter.release();
    }
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
      fingerprint: action.fingerprint,
      cycle: action.cycle,
      adapter,
    });
    await environment.remediate({
      adapter,
      issueId: action.issueId,
      taskRef,
      fingerprint: action.fingerprint,
      cycle: action.cycle,
    });
    return true;
  };

  const closeParent = async ({ action, current }) => {
    requireMethod(leaf, "closeParent");
    const closeWriter = acquireTargetCloseWriter(current);
    let settled = false;
    try {
      const result = await leaf.closeParent({ issueId: action.issueId, runIdentity: current.runIdentity });
      settled = result?.settled === true;
      return settled;
    } finally {
      if (settled) closeWriter.release();
    }
  };

  return {
    async run(request = {}) {
      let selectedRequest = request;
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
        const matching = candidates.filter((candidate) => (
          (candidate.runIdentity ?? candidate)?.specId === request.specId
        ));
        if (matching.length > 1) return runSelectionRequired(matching.length);
        if (matching.length === 1) {
          const selectedCandidate = matching[0];
          selectedRequest = {
            ...request,
            runIdentity: selectedCandidate.runIdentity ?? selectedCandidate,
            issueIds: selectedCandidate.issueIds,
            maxParallel: selectedCandidate.maxParallel,
          };
        }
      }
      let runIdentity;
      let writer;
      let grantRecorded = false;
      let lastStatus = null;
      try {
        while (true) {
          const trackerResult = await readTracker(selectedRequest);
          if (!trackerResult.available) return trackerUnavailable(selectedRequest, trackerResult.attempts, lastStatus);
          const journal = runIdentity ? store.readEvents(runIdentity.runId) : [];
          const current = await reconcile({
            request: selectedRequest,
            tracker: trackerResult.snapshot,
            journal,
            tasks,
          });
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
            if (current.writerReclaimProof) {
              requireMethod(store, "reclaimWriter");
              writer = store.reclaimWriter({
                runId: runIdentity.runId,
                staleProof: current.writerReclaimProof,
              });
            } else {
              writer = store.acquireWriter(runIdentity.runId);
            }
          } else {
            const recordedGrant = store.readEvents(runIdentity.runId)
              .findLast(({ type }) => type === "grant.recorded");
            const stopped = authorityDrift({ status: lastStatus, runIdentity, current, recordedGrant });
            if (stopped) return stopped;
          }
          if (!grantRecorded) {
            const previousGrant = store.readEvents(runIdentity.runId)
              .findLast(({ type }) => type === "grant.recorded");
            const grantMaxParallel = current.grant.maxParallel ?? DEFAULT_MAX_PARALLEL;
            if (previousGrant && previousGrant.maxParallel !== grantMaxParallel) {
              lastStatus = writer.rebuildStatus(current.facts);
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
            writer.append({
              type: "grant.recorded",
              at: now(),
              runIdentity,
              maxParallel: grantMaxParallel,
            });
            grantRecorded = true;
            lastStatus = writer.rebuildStatus(current.facts);
            continue;
          }

          lastStatus = writer.rebuildStatus(current.facts);
          if (["SUCCEEDED", "STOPPED"].includes(lastStatus.run.state)) return lastStatus;
          if (lastStatus.legalActions.length === 0) {
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
          for (const action of lastStatus.legalActions) {
            if (action.type === "dispatch_issue") {
              const stopped = await dispatchIssue({ action, current, status: lastStatus, writer });
              if (stopped) return stopped;
            } else if (action.type === "remediate_environment") {
              const remediated = await remediateEnvironment({ action, current, writer });
              if (!remediated) {
                deferredEnvironmentStop ??= action;
                continue;
              }
            } else if (action.type === "close_issue") {
              const outcome = await closeIssue({ action, current, status: lastStatus });
              if (outcome.stopped) return outcome.stopped;
              if (!outcome.active) return lastStatus;
            } else if (action.type === "close_parent") {
              const settled = await closeParent({ action, current });
              if (!settled) return lastStatus;
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
          }
          if (deferredEnvironmentStop) {
            const trackerResult = await readTracker(selectedRequest);
            if (!trackerResult.available) {
              return trackerUnavailable(selectedRequest, trackerResult.attempts, lastStatus);
            }
            const refreshed = await reconcile({
              request: selectedRequest,
              tracker: trackerResult.snapshot,
              journal: store.readEvents(runIdentity.runId),
              tasks,
            });
            const refreshedStatus = writer.rebuildStatus(refreshed.facts);
            const recordedGrant = store.readEvents(runIdentity.runId)
              .findLast(({ type }) => type === "grant.recorded");
            const authorityStopped = authorityDrift({
              status: refreshedStatus,
              runIdentity,
              current: refreshed,
              recordedGrant,
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
        if (writer) writer.release();
      }
    },
  };
}
