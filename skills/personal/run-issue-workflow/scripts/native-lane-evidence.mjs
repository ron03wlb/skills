// Native lane evidence.
//
// ADR-0080 makes one Issue lane a native subagent lane, so a lane's liveness and completion must be
// proven from native owner sources instead of a pi-workflow host run record:
//
//   * the native subagent run record owns liveness and terminal state;
//   * the tracker completion note and the Issue's own tracker state own completion;
//   * Git owns the recorded worktree, the recorded topic branch and the candidate's reachability.
//
// No host artifact is read here. The reader enumerates nothing, resolves nothing by searching, and
// takes every source as an injected port, so the only files it can read are the exact ones its caller
// names. A lane it cannot attribute to its Issue and attempt, a run record that does not bind the
// recorded lane, a tracker note that does not bind this Issue, or Git evidence that contradicts the
// note all report `UNKNOWN` with the owning source named, which is the stop the lane planner needs
// instead of a guessed owner.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { LANE_STATES } from "./issue-lane.mjs";
import { realpathIsContained, resolveLaneRecordLocation } from "./native-lane-record-locator.mjs";
import { parseHostDispatchId } from "./pi-workflow-host.mjs";

export const NATIVE_LANE_EVIDENCE_SCHEMA = "native-lane-evidence:v1";
export const SUBAGENT_RUN_RECORD_SCHEMA = "pi-subagent-run-record:v1";
// The documented location of the native subagent run record's own pointer. The pointer sits beside
// every other per-run record under the agent root, so its directory is the only default this reader
// resolves without being told.
export const SUBAGENT_RUNS_DIRECTORY = "subagent-runs";
export const SUBAGENT_RUN_STATES = Object.freeze(["ABSENT", "PRESENT", "UNREADABLE"]);
export const COMPLETION_NOTE_KIND = "implementation_complete";
const TRACKER_STATES = Object.freeze(["OPEN", "CLOSED"]);

// Native subagent run status -> the lane liveness the planner reads. A live run is an active lane. A
// queued run is materialized but not executing, so its recorded request is resumable. A settled run
// (`completed`) is still the same lane and is never a fresh dispatch, and a failed or stopped run is
// the only inactive lane, which is why it carries the exact native evidence that proves it inactive.
// An unrecognised status proves nothing and stays UNKNOWN instead of defaulting to a live lane.
export const NATIVE_RUN_LIVENESS = Object.freeze({
  queued: Object.freeze({ lane: "RESUMABLE", terminal: false, settled: false }),
  running: Object.freeze({ lane: "ACTIVE", terminal: false, settled: false }),
  completed: Object.freeze({ lane: "RESUMABLE", terminal: true, settled: true }),
  partial: Object.freeze({ lane: "INACTIVE", terminal: true, settled: false }),
  failed: Object.freeze({ lane: "INACTIVE", terminal: true, settled: false }),
  stopped: Object.freeze({ lane: "INACTIVE", terminal: true, settled: false }),
  interrupted: Object.freeze({ lane: "INACTIVE", terminal: true, settled: false }),
});
const UNKNOWN_LIVENESS = Object.freeze({ lane: "UNKNOWN", terminal: false, settled: false });

// A native launcher that owns its own run ids records its own lifecycle vocabulary. Each alias below is
// the harness's own name for one of the statuses above; an unlisted name proves nothing and stays
// UNKNOWN rather than being guessed into a live or settled lane.
export const NATIVE_RUN_STATE_ALIASES = Object.freeze({
  pending: "queued",
  queued: "queued",
  running: "running",
  complete: "completed",
  completed: "completed",
  partial: "partial",
  failed: "failed",
  cancelled: "stopped",
  canceled: "stopped",
  stopped: "stopped",
  interrupted: "interrupted",
});
// The record file a launcher that does not write the pi-workflow task record publishes instead, and the
// process proof its own artifact set carries once the launched process has closed.
const NATIVE_STATUS_FILE = "status.json";
const NATIVE_PROCESS_TERMINAL_FILE = "process-terminal.json";
const isoOf = (value) => (typeof value === "number" && Number.isFinite(value)
  ? new Date(value).toISOString()
  : textOf(value));

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const textOf = (value) => (isText(value) ? value : null);
const commitOf = (value) => (typeof value === "string" && /^[a-f0-9]{7,64}$/u.test(value) ? value : null);

const requireText = (value, label) => {
  if (!isText(value)) throw new TypeError(`${label} is required`);
  return value;
};
const requireFn = (value, label) => {
  if (typeof value !== "function") throw new TypeError(`${label} must be a reader`);
  return value;
};

const readJson = (readFile, path) => {
  try {
    return JSON.parse(readFile(path));
  } catch {
    return null;
  }
};

// The one documented root every native subagent run record pointer lives under. `PI_CODING_AGENT_DIR`
// is honoured exactly as the lane agent resolver honours it, so a harness that moved its agent root
// cannot make this reader look in the wrong place.
export function subagentRunsRoot({ homeDir, env = process.env } = {}) {
  let configured = null;
  if (typeof env?.PI_CODING_AGENT_DIR === "string" && env.PI_CODING_AGENT_DIR.trim() !== "") {
    configured = env.PI_CODING_AGENT_DIR.trim();
  } else if (homeDir !== undefined) {
    configured = join(homeDir, ".pi", "agent");
  }
  if (configured === null) throw new TypeError("Native lane evidence needs the user home directory or the agent root");
  return join(configured, SUBAGENT_RUNS_DIRECTORY);
}

export const subagentRunRecordPath = ({ runsRoot, runId }) =>
  join(requireText(runsRoot, "Subagent run record root"), `${requireText(runId, "Subagent run id")}.json`);

const unreadableRun = (runId, evidence) => Object.freeze({
  schema: SUBAGENT_RUN_RECORD_SCHEMA,
  runId,
  state: "UNREADABLE",
  correlationId: null,
  cwd: null,
  runsDir: null,
  updatedAt: null,
  status: null,
  failureKind: null,
  worktreePath: null,
  heartbeatAt: null,
  laneState: "UNKNOWN",
  terminal: false,
  settled: false,
  evidence: Object.freeze([...evidence]),
});

// Reads exactly one lane's native subagent run record: the pointer record whose own fields name the
// run, and then the run's own record, which is the only source of liveness and terminal state. A
// pointer without a readable run record still proves the lane was materialized, so it stays PRESENT
// and reports UNKNOWN liveness rather than being mistaken for an absent lane.
export function readSubagentRunRecord({
  runId,
  runsRoot,
  homeDir,
  env = process.env,
  readFile = (path) => readFileSync(path, "utf8"),
  exists = existsSync,
  realpath = exists === existsSync ? realpathSync : null,
} = {}) {
  requireText(runId, "Native lane evidence needs one subagent run id");
  const root = runsRoot ?? subagentRunsRoot({ homeDir, env });
  const pointerPath = subagentRunRecordPath({ runsRoot: root, runId });
  if (!exists(pointerPath)) {
    return Object.freeze({
      schema: SUBAGENT_RUN_RECORD_SCHEMA,
      runId,
      state: "ABSENT",
      correlationId: null,
      cwd: null,
      runsDir: null,
      updatedAt: null,
      status: null,
      failureKind: null,
      worktreePath: null,
      heartbeatAt: null,
      laneState: "UNKNOWN",
      terminal: false,
      settled: false,
      evidence: Object.freeze([`No native subagent run record pointer exists at ${pointerPath}.`]),
    });
  }
  const pointer = readJson(readFile, pointerPath);
  if (pointer === null) return unreadableRun(runId, [`The native subagent run record pointer at ${pointerPath} is unreadable.`]);
  if (pointer.runId !== runId) {
    return unreadableRun(runId, [`The native subagent run record pointer at ${pointerPath} names run ${String(pointer.runId)}.`]);
  }
  let binding = pointer;
  let generation = 1;
  if (pointer.schema === "native-lane-pointer:v2") {
    if (!Array.isArray(pointer.generations) || pointer.generations.length === 0) {
      return unreadableRun(runId, [`The native lane pointer at ${pointerPath} has no generation chain.`]);
    }
    let previous = null;
    for (let index = 0; index < pointer.generations.length; index += 1) {
      const item = pointer.generations[index];
      if (item?.generation !== index + 1 || item?.previousNativeRunId !== previous || !isText(item?.nativeRunId)) {
        return unreadableRun(runId, [`The native lane pointer at ${pointerPath} has a discontinuous generation chain at ${index + 1}.`]);
      }
      try {
        resolveLaneRecordLocation({
          cwd: item.cwd,
          runsDir: item.runsDir,
          recordDir: item.recordDir ?? item.nativeRunId,
        });
      } catch (error) {
        return unreadableRun(runId, [`The native lane pointer at ${pointerPath} has an unsafe generation ${index + 1}: ${error.message}`]);
      }
      previous = item.nativeRunId;
    }
    binding = pointer.generations.at(-1);
    generation = binding.generation;
  }
  const cwd = textOf(binding.cwd);
  const runsDir = textOf(binding.runsDir);
  // A launcher that publishes the pointer owns the mapping from the recorded lane reference to the run
  // directory its harness created, so the pointer may name that directory explicitly and may point at an
  // absolute run root outside the project checkout.
  const recordDir = textOf(binding.recordDir) ?? textOf(binding.nativeRunId) ?? runId;
  const base = {
    schema: SUBAGENT_RUN_RECORD_SCHEMA,
    runId,
    correlationId: textOf(pointer.correlationId),
    nativeRunId: textOf(binding.nativeRunId),
    generation,
    previousNativeRunId: textOf(binding.previousNativeRunId),
    cwd,
    runsDir,
    updatedAt: textOf(binding.updatedAt) ?? textOf(pointer.updatedAt),
  };
  if (cwd === null || runsDir === null) {
    return unreadableRun(runId, [`The native subagent run record pointer at ${pointerPath} names no run directory.`]);
  }
  let location;
  try {
    location = resolveLaneRecordLocation({ cwd, runsDir, recordDir });
  } catch (error) {
    return unreadableRun(runId, [`The native lane pointer at ${pointerPath} has an unsafe record location: ${error.message}`]);
  }
  const { base: runRoot, laneDirectory } = location;
  const safelyExists = (path) => {
    if (!exists(path)) return false;
    if (realpath !== null && !realpathIsContained({ base: runRoot, candidate: path, realpath })) {
      throw new Error(`${path} resolves outside ${runRoot}`);
    }
    return true;
  };
  try {
    if (realpath !== null && exists(laneDirectory)
      && !realpathIsContained({ base: runRoot, candidate: laneDirectory, realpath })) {
      return unreadableRun(runId, [`The native lane directory ${laneDirectory} resolves outside its run root.`]);
    }
  } catch (error) {
    return unreadableRun(runId, [`The native lane directory ${laneDirectory} is unreadable: ${error.message}`]);
  }
  const taskRecordPath = join(laneDirectory, "run.json");
  let taskRecordExists;
  try {
    taskRecordExists = safelyExists(taskRecordPath);
  } catch (error) {
    return unreadableRun(runId, [`The native lane record ${taskRecordPath} is unsafe: ${error.message}`]);
  }
  if (!taskRecordExists) {
    // A harness that keeps its own lifecycle record instead of a pi-workflow task record: the pointer
    // still proves the lane was materialized, and only that harness's own record decides liveness.
    const nativePath = join(laneDirectory, NATIVE_STATUS_FILE);
    let nativeExists;
    try {
      nativeExists = safelyExists(nativePath);
    } catch (error) {
      return unreadableRun(runId, [`The native lane record ${nativePath} is unsafe: ${error.message}`]);
    }
    const native = nativeExists ? readJson(readFile, nativePath) : null;
    if (native === null) {
      return Object.freeze({
        ...base,
        state: "PRESENT",
        status: null,
        failureKind: null,
        worktreePath: null,
        heartbeatAt: null,
        laneState: "UNKNOWN",
        terminal: false,
        settled: false,
        evidence: Object.freeze([`Subagent run ${runId} publishes no readable record at ${nativePath}.`]),
      });
    }
    const nativeState = textOf(native.state) ?? textOf(native.status);
    const status = NATIVE_RUN_STATE_ALIASES[nativeState] ?? null;
    const liveness = NATIVE_RUN_LIVENESS[status] ?? UNKNOWN_LIVENESS;
    const processPath = join(laneDirectory, NATIVE_PROCESS_TERMINAL_FILE);
    let processExists;
    try {
      processExists = safelyExists(processPath);
    } catch (error) {
      return unreadableRun(runId, [`The native lane process record ${processPath} is unsafe: ${error.message}`]);
    }
    const process = processExists ? readJson(readFile, processPath) : null;
    const closedInstances = Array.isArray(process?.instances)
      ? process.instances.filter((instance) => instance?.closeObservedAt !== undefined && instance?.closeObservedAt !== null)
      : [];
    const processObserved = process?.state === "observed" && closedInstances.length > 0;
    return Object.freeze({
      ...base,
      state: "PRESENT",
      status,
      failureKind: textOf(native.failureKind),
      // The native record's `cwd` is the directory the launcher ran in, not the lane's own Issue
      // worktree, so it is never reported as one.
      worktreePath: null,
      heartbeatAt: isoOf(native.lastActivityAt),
      laneState: liveness.lane,
      terminal: liveness.terminal,
      // A settled lane additionally requires the launcher's own process proof, so a record that claims
      // completion while its process is still open cannot settle closeout.
      settled: liveness.settled && processObserved,
      evidence: Object.freeze([
        `Subagent run ${runId} records harness state ${nativeState ?? "unknown"} as status ${status ?? "unknown"}.`,
        ...(status === null ? [`Subagent run ${runId} records an unrecognised harness state ${String(nativeState)}.`] : []),
        ...(liveness.settled && !processObserved
          ? [`Subagent run ${runId} records completion without a closed-process proof at ${processPath}.`]
          : []),
        ...(closedInstances.length === 0 ? [] : [`Subagent run ${runId} observed process close with exit code ${String(closedInstances[0].exitCode ?? "unknown")}.`]),
      ]),
    });
  }
  const record = readJson(readFile, taskRecordPath);
  if (record === null) {
    return Object.freeze({
      ...base,
      state: "PRESENT",
      status: null,
      failureKind: null,
      worktreePath: null,
      heartbeatAt: null,
      laneState: "UNKNOWN",
      terminal: false,
      settled: false,
      evidence: Object.freeze([`Subagent run ${runId} publishes no readable record at ${taskRecordPath}.`]),
    });
  }
  const status = textOf(record.status);
  const liveness = NATIVE_RUN_LIVENESS[status] ?? UNKNOWN_LIVENESS;
  const attempts = Array.isArray(record.attempts) ? record.attempts : [];
  const latest = attempts.find((attempt) => attempt?.attemptId === record.latestAttemptId) ?? attempts.at(-1) ?? null;
  const workspace = isRecord(latest?.workspace) ? latest.workspace : {};
  return Object.freeze({
    ...base,
    state: "PRESENT",
    status,
    failureKind: textOf(record.failureKind),
    worktreePath: textOf(workspace.worktreePath) ?? textOf(workspace.cwd),
    heartbeatAt: textOf(latest?.heartbeatAt),
    laneState: liveness.lane,
    terminal: liveness.terminal,
    settled: liveness.settled,
    evidence: Object.freeze([
      `Subagent run ${runId} records status ${status ?? "unknown"}.`,
      ...(liveness.lane === "UNKNOWN" ? [`Subagent run ${runId} records an unrecognised status ${String(status)}.`] : []),
      ...(textOf(record.failureKind) === null ? [] : [`Subagent run ${runId} records failure kind ${record.failureKind}.`]),
    ]),
  });
}

// One lane record the caller owns: the recorded lane reference, the Issue it belongs to, its dispatch
// attempt, and — once a launch reported it — the lane's native run identity and recorded worktree.
const observedLaneRecord = (lane, index) => {
  if (!isRecord(lane)) throw new TypeError(`Recorded lane ${index} must be an object`);
  if (!isText(lane.laneRef)) throw new TypeError(`Recorded lane ${index} must name its lane reference`);
  if (!isText(lane.issueId)) throw new TypeError(`Recorded lane ${index} must bind its Issue`);
  if (!Number.isInteger(lane.attempt) || lane.attempt < 1) {
    throw new TypeError(`Recorded lane ${index} must bind one positive dispatch attempt`);
  }
  return {
    laneRef: lane.laneRef,
    issueId: lane.issueId,
    attempt: lane.attempt,
    runId: textOf(lane.runId),
    worktree: textOf(lane.worktree),
    topic: textOf(lane.topic),
  };
};

// The tracker read for one Issue: its tracker state and the one completion note that binds it. A note
// for another Issue, a note that is not a completion, or a completion without a candidate commit is not
// this lane's completion.
const trackerReadFor = (issueId, read, laneRef) => {
  const raw = read({ issueId, laneRef });
  if (!isRecord(raw)) throw new TypeError(`The tracker read for Issue ${issueId} must be an object`);
  const state = raw.state === undefined || raw.state === null ? null : requireText(raw.state, `Tracker state for Issue ${issueId}`);
  if (state !== null && !TRACKER_STATES.includes(state)) {
    throw new TypeError(`Tracker state ${state} for Issue ${issueId} is unsupported`);
  }
  if (raw.completion === undefined || raw.completion === null) return { state, completion: null, mismatch: null };
  const completion = raw.completion;
  if (!isRecord(completion)) throw new TypeError(`The completion note read for Issue ${issueId} must be an object`);
  const record = completion.record;
  if (!isRecord(record) || record.kind !== COMPLETION_NOTE_KIND) {
    return { state, completion: null, mismatch: `The tracker read for Issue ${issueId} names a note that is not a ${COMPLETION_NOTE_KIND} record.` };
  }
  if (record.issueId !== issueId) {
    return { state, completion: null, mismatch: `The tracker read for Issue ${issueId} names a completion note for Issue ${String(record.issueId)}.` };
  }
  const candidate = commitOf(record.candidate);
  if (candidate === null) {
    return { state, completion: null, mismatch: `The completion note for Issue ${issueId} names no candidate commit.` };
  }
  return {
    state,
    completion: Object.freeze({
      identity: textOf(completion.identity),
      candidate,
      topic: textOf(record.topic),
      worktree: textOf(record.worktree),
      baseline: commitOf(record.baseline),
    }),
    mismatch: null,
  };
};

// The Git read for one lane's candidate. Git is the only source of the worktree and candidate facts:
// the recorded topic branch must reach the candidate, and the target must be able to reach it once the
// close owner has integrated it. Every ref is read from the repository, because a worktree shares the
// repository's refs and the recorded branch outlives the worktree.
const gitReadFor = (git, { candidate, topic, repository, target }) => {
  const read = requireFn(git.isAncestor, "Native lane evidence needs a Git ancestry reader");
  const resolve = requireFn(git.revParse, "Native lane evidence needs a Git ref reader");
  const topicHead = topic === null ? null : resolve({ ref: topic, cwd: repository });
  return Object.freeze({
    candidate,
    topic,
    topicHead,
    onTopicBranch: topicHead === null ? false : read({ ancestor: candidate, descendant: topicHead, cwd: repository }),
    reachableFromTarget: read({ ancestor: candidate, descendant: target, cwd: repository }),
  });
};

const laneEvidence = ({
  lane,
  issueId,
  attempt,
  state,
  inactiveEvidence = null,
  run = null,
  tracker = null,
  completion = null,
  candidate = null,
  evidence,
}) => Object.freeze({
  laneRef: lane,
  issueId,
  attempt,
  state,
  inactiveEvidence: inactiveEvidence === null ? null : Object.freeze([...inactiveEvidence]),
  run,
  tracker,
  completion,
  candidate,
  evidence: Object.freeze([...evidence]),
});

// One lane's native state. Order matters: attribution, then the native run record, then the tracker
// note, then Git. A lane that proves nothing fails closed with the owning source named.
const readOneLane = ({ lane, readRun, readIssue, git, repository, target, runIds }) => {
  const dispatch = parseHostDispatchId(lane.laneRef);
  if (dispatch === null || dispatch.issueId !== lane.issueId || dispatch.attempt !== lane.attempt) {
    return {
      unattributed: lane.laneRef,
      evidence: laneEvidence({
        lane: lane.laneRef,
        issueId: lane.issueId,
        attempt: lane.attempt,
        state: "UNKNOWN",
        evidence: [
          `Recorded lane ${lane.laneRef} does not name Issue ${lane.issueId} attempt ${lane.attempt}.`,
          "A lane is attributed by the identity its dispatch reservation recorded, never by title, path or order.",
        ],
      }),
    };
  }
  if (lane.runId === null) {
    // A recorded dispatch reservation whose native run identity was never reported back. This is the
    // lost launch response: it is read back as an unresolved creation intent, never re-created.
    return {
      creationIntent: Object.freeze({
        laneRef: lane.laneRef,
        issueId: lane.issueId,
        attempt: lane.attempt,
        state: "RESERVED",
        evidence: Object.freeze([
          `Lane ${lane.laneRef} is recorded for Issue ${lane.issueId} attempt ${lane.attempt} with no native subagent run identity.`,
          "The recorded reservation is read back; a second lane for the same Issue attempt is never created.",
        ]),
      }),
    };
  }
  runIds.push(lane.runId);
  const run = readRun({ laneRef: lane.laneRef, issueId: lane.issueId, attempt: lane.attempt, runId: lane.runId, worktree: lane.worktree });
  if (!isRecord(run) || !SUBAGENT_RUN_STATES.includes(run.state)) {
    throw new TypeError(`The subagent run read for lane ${lane.laneRef} must name one native run record state`);
  }
  const runEvidence = Object.freeze({
    runId: run.runId,
    state: run.state,
    status: run.status ?? null,
    cwd: run.cwd ?? null,
    runsDir: run.runsDir ?? null,
    correlationId: run.correlationId ?? null,
    worktreePath: run.worktreePath ?? null,
    updatedAt: run.updatedAt ?? null,
    laneState: run.laneState,
    terminal: run.terminal === true,
    settled: run.settled === true,
    evidence: [...(run.evidence ?? [])],
  });
  if (run.state !== "PRESENT") {
    return {
      evidence: laneEvidence({
        lane: lane.laneRef,
        issueId: lane.issueId,
        attempt: lane.attempt,
        state: "UNKNOWN",
        run: runEvidence,
        evidence: [
          `Lane ${lane.laneRef} native subagent run ${lane.runId} is ${run.state}.`,
          ...runEvidence.evidence,
          `The recorded lane ${lane.laneRef} is the owning source of this read-back.`,
        ],
      }),
    };
  }
  if (lane.worktree !== null && runEvidence.worktreePath !== null && runEvidence.worktreePath !== lane.worktree) {
    return {
      evidence: laneEvidence({
        lane: lane.laneRef,
        issueId: lane.issueId,
        attempt: lane.attempt,
        state: "UNKNOWN",
        run: runEvidence,
        evidence: [
          `Recorded lane ${lane.laneRef} owns worktree ${lane.worktree}, but native subagent run ${lane.runId} reports ${runEvidence.worktreePath}.`,
          "Lane ownership is unproven, so it is never reported as an active or inactive lane.",
        ],
      }),
    };
  }

  const tracker = trackerReadFor(lane.issueId, readIssue, lane.laneRef);
  const trackerEvidence = Object.freeze({
    state: tracker.state,
    completionIdentity: tracker.completion === null ? null : tracker.completion.identity,
    candidate: tracker.completion === null ? null : tracker.completion.candidate,
  });
  if (tracker.mismatch !== null) {
    return {
      evidence: laneEvidence({
        lane: lane.laneRef,
        issueId: lane.issueId,
        attempt: lane.attempt,
        state: "UNKNOWN",
        run: runEvidence,
        tracker: trackerEvidence,
        evidence: [
          tracker.mismatch,
          "The tracker read and the recorded lane do not agree, so completion is unproven.",
        ],
      }),
    };
  }

  let completion = null;
  let candidate = null;
  if (tracker.completion !== null) {
    const topic = tracker.completion.topic ?? lane.topic;
    const worktree = tracker.completion.worktree ?? lane.worktree;
    candidate = gitReadFor(git, {
      candidate: tracker.completion.candidate,
      topic,
      repository,
      target: requireText(target, "Native lane evidence needs the recorded Issue target branch"),
    });
    completion = Object.freeze({
      proven: candidate.onTopicBranch,
      identity: tracker.completion.identity,
      issueState: tracker.state,
      candidate: candidate.candidate,
      topic,
      worktree,
      reachableFromTopicBranch: candidate.onTopicBranch,
      reachableFromTarget: candidate.reachableFromTarget,
    });
  }

  const evidence = [...runEvidence.evidence];
  if (runEvidence.settled) {
    if (completion === null || completion.proven !== true) {
      return {
        evidence: laneEvidence({
          lane: lane.laneRef,
          issueId: lane.issueId,
          attempt: lane.attempt,
          state: "UNKNOWN",
          run: runEvidence,
          tracker: trackerEvidence,
          completion,
          candidate,
          evidence: [
            ...evidence,
            `Subagent run ${lane.runId} settled ${runEvidence.status} and Issue ${lane.issueId} publishes no completion whose candidate is reachable from lane ${lane.laneRef}'s recorded topic branch ${completion?.topic ?? "none"}.`,
            "A settled lane without a native completion publication stays UNKNOWN; it is never re-dispatched and never replaced.",
          ],
        }),
      };
    }
    return {
      evidence: laneEvidence({
        lane: lane.laneRef,
        issueId: lane.issueId,
        attempt: lane.attempt,
        state: "RESUMABLE",
        run: runEvidence,
        tracker: trackerEvidence,
        completion,
        candidate,
        evidence: [
          ...evidence,
          `Issue ${lane.issueId} publishes completion ${completion.identity ?? "without an identity"} with candidate ${completion.candidate} reachable from topic branch ${completion.topic}.`,
          // The lane is not executing, and it is the one recorded lane for this Issue attempt, so the
          // recorded request is read back or resumed rather than superseded by a second lane.
          `Lane ${lane.laneRef} is settled and is never a fresh dispatch for Issue ${lane.issueId}.`,
        ],
      }),
    };
  }
  if (runEvidence.laneState === "UNKNOWN") {
    return {
      evidence: laneEvidence({
        lane: lane.laneRef,
        issueId: lane.issueId,
        attempt: lane.attempt,
        state: "UNKNOWN",
        run: runEvidence,
        tracker: trackerEvidence,
        completion,
        candidate,
        evidence: [...evidence, `Lane ${lane.laneRef} liveness is UNKNOWN.`],
      }),
    };
  }
  return {
    evidence: laneEvidence({
      lane: lane.laneRef,
      issueId: lane.issueId,
      attempt: lane.attempt,
      state: runEvidence.laneState,
      inactiveEvidence: runEvidence.laneState === "INACTIVE" ? evidence : null,
      run: runEvidence,
      tracker: trackerEvidence,
      completion,
      candidate,
      evidence: runEvidence.laneState === "INACTIVE"
        ? [...evidence, `Lane ${lane.laneRef} is inactive; its exact native evidence is recorded above.`]
        : evidence,
    }),
  };
};

// The one native read for one logical DAG Run. `lanes` are the recorded lanes the caller owns; every
// other source is an injected port, so this reader never reaches a host run record, a pi-workflow
// directory, or a home directory listing.
export function readNativeLaneEvidence({ lanes, readRun, readIssue, git, repository, target } = {}) {
  if (!Array.isArray(lanes)) throw new TypeError("Native lane evidence needs one recorded lane list");
  const runRead = requireFn(readRun, "Native lane evidence needs a subagent run reader");
  const issueRead = requireFn(readIssue, "Native lane evidence needs a tracker reader");
  if (!isRecord(git)) throw new TypeError("Native lane evidence needs one Git reader");
  requireText(repository, "Native lane evidence needs the repository the recorded branches live in");
  const observations = [];
  const creationIntents = [];
  const unattributed = [];
  const runIds = [];
  for (const [index, raw] of lanes.entries()) {
    const lane = observedLaneRecord(raw, index);
    const read = readOneLane({ lane, readRun: runRead, readIssue: issueRead, git, repository, target, runIds });
    if (read.unattributed !== undefined) unattributed.push(read.unattributed);
    if (read.creationIntent !== undefined) creationIntents.push(read.creationIntent);
    if (read.evidence !== undefined) observations.push(read.evidence);
  }
  const duplicateRuns = runIds.filter((runId, index) => runIds.indexOf(runId) !== index);
  return Object.freeze({
    schema: NATIVE_LANE_EVIDENCE_SCHEMA,
    target: target ?? null,
    lanes: Object.freeze(observations),
    creationIntents: Object.freeze(creationIntents),
    unattributed: Object.freeze(unattributed),
    // Two recorded lanes that share one native run record cannot both be that run's lane; the owning
    // source is named here instead of being resolved by preference.
    duplicateRunRecords: Object.freeze([...new Set(duplicateRuns)]),
  });
}

// The lane planner's observed entries for one logical DAG Run. A lane that proves no liveness stays
// UNKNOWN, which stops the planner instead of letting it guess at ownership.
export function observedLanesFor(evidence, { runId } = {}) {
  if (!isRecord(evidence) || evidence.schema !== NATIVE_LANE_EVIDENCE_SCHEMA) {
    throw new TypeError("Observed lanes need one native lane evidence read");
  }
  requireText(runId, "Observed lanes need one DAG Run id");
  return Object.freeze(evidence.lanes.map((lane) => Object.freeze({
    runId,
    issueId: lane.issueId,
    laneRef: lane.laneRef,
    attempt: lane.attempt,
    state: LANE_STATES.includes(lane.state) ? lane.state : "UNKNOWN",
    ...(lane.inactiveEvidence === null ? {} : { inactiveEvidence: [...lane.inactiveEvidence] }),
  })));
}

// The creation intents the same read proves: a journaled dispatch reservation whose native run
// identity was never reported back. They are handed to the planner as unresolved intents, so a lost
// launch response is read back instead of being re-created.
export function creationIntentsFor(evidence) {
  if (!isRecord(evidence) || evidence.schema !== NATIVE_LANE_EVIDENCE_SCHEMA) {
    throw new TypeError("Creation intents need one native lane evidence read");
  }
  return Object.freeze(evidence.creationIntents.map((intent) => Object.freeze({
    laneRef: intent.laneRef,
    issueId: intent.issueId,
    attempt: intent.attempt,
    state: intent.state,
    evidence: [...intent.evidence],
  })));
}
