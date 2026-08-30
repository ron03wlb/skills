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

const assertSameIdentity = (expected, actual) => {
  const mismatch = RUN_IDENTITY_KEYS.find((key) => expected[key] !== actual?.[key]);
  if (mismatch) throw new Error(`RUN_IDENTITY_DRIFT:${mismatch}`);
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

const environmentUnresolved = (status, action) => diagnosedStop(status, {
  reasonCode: "environment_unresolved",
  evidence: [`Environment fingerprint ${action.fingerprint} has no approved automatic remediation.`],
  noAutomaticTransition: "Only the exact Windows Gradle loopback fingerprint is eligible for automatic remediation.",
  affectedNodes: [action.issueId],
  resumePredicates: ["environment_changed_or_human_resolution"],
});

export function createCoordinator({ store, tracker, tasks, reconcile, leaf, environment, now, sleep }) {
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
        await tasks.message(
          priorDispatch.taskRef,
          `Use $execute-issue to retry Issue ${action.issueId} under the unchanged read-back DAG Run Grant.`,
        );
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
        throw new Error("RETRY_TASK_LIVENESS_UNPROVEN");
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

  const closeIssue = async ({ action, current }) => {
    const taskRef = current.taskRefs?.[action.issueId];
    if (!isTaskRef(taskRef)) throw new Error("CLOSE_TASK_REFERENCE_MISSING");
    const closeWriter = store.acquireCloseWriter({
      target: current.runIdentity.target,
      runId: current.runIdentity.runId,
    });
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
      return waited?.coordinatorActive !== false;
    } finally {
      closeWriter.release();
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
    const closeWriter = store.acquireCloseWriter({
      target: current.runIdentity.target,
      runId: current.runIdentity.runId,
    });
    try {
      await leaf.closeParent({ issueId: action.issueId, runIdentity: current.runIdentity });
    } finally {
      closeWriter.release();
    }
  };

  return {
    async run(request = {}) {
      let runIdentity;
      let writer;
      let grantRecorded = false;
      let lastStatus = null;
      try {
        while (true) {
          const trackerResult = await readTracker(request);
          if (!trackerResult.available) return trackerUnavailable(request, trackerResult.attempts, lastStatus);
          const journal = runIdentity ? store.readEvents(runIdentity.runId) : [];
          const current = await reconcile({
            request,
            tracker: trackerResult.snapshot,
            journal,
            tasks,
          });
          if (!runIdentity) {
            runIdentity = current.runIdentity;
            assertSameIdentity(runIdentity, current.grant?.runIdentity);
            writer = store.acquireWriter(runIdentity.runId);
          } else {
            assertSameIdentity(runIdentity, current.runIdentity);
            assertSameIdentity(runIdentity, current.grant?.runIdentity);
          }
          if (!grantRecorded) {
            writer.append({
              type: "grant.recorded",
              at: now(),
              runIdentity,
              maxParallel: current.grant.maxParallel,
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

          for (const action of lastStatus.legalActions) {
            if (action.type === "dispatch_issue") {
              const stopped = await dispatchIssue({ action, current, status: lastStatus, writer });
              if (stopped) return stopped;
            } else if (action.type === "remediate_environment") {
              const remediated = await remediateEnvironment({ action, current, writer });
              if (!remediated) return environmentUnresolved(lastStatus, action);
            } else if (action.type === "close_issue") {
              const active = await closeIssue({ action, current });
              if (!active) return lastStatus;
            } else if (action.type === "close_parent") {
              await closeParent({ action, current });
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
        }
      } finally {
        if (writer) writer.release();
      }
    },
  };
}
