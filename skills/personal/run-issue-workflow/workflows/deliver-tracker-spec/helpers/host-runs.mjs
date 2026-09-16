// Bundle-local read-back of pi-workflow host runs for one Spec.
//
// `/run-issue-workflow <Spec-ID>` is the single reconciliation and re-entry authority. When a host run
// for that Spec is no longer terminal, this reader finds it from the pi-workflow run records under the
// project workflow root and states whether the same host run can be continued or must be superseded.
// It never invents a run: zero candidates select none, and more than one candidate is an ambiguity the
// entry must resolve rather than guessed away.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { HOST_TERMINAL_RUN_STATES } from "../../../scripts/pi-workflow-host.mjs";

export const HOST_RUN_READBACK_SCHEMA = "pi-workflow-host-run-readback:v1";

// The exact host replay-invariant failure E1 observed: a recorded controller operation re-issued with a
// different request shape. Only matching evidence makes a host run un-replayable; an ordinary `failed`
// run is resumable, which is what `/workflow resume` demonstrated.
const REPLAY_DIVERGENCE = /dynamic agent request changed/iu;

// A host run's own record status is the only scheduling fact this reader consumes.
const RUN_STATES = Object.freeze({
  completed: "SUCCEEDED",
  stopped: "STOPPED",
  failed: "FAILED",
  interrupted: "INTERRUPTED",
  running: "RUNNING",
  blocked: "BLOCKED",
  pending: "RUNNING",
});

export const workflowRootFor = (cwd) => join(cwd, ".pi", "workflows");

const defaultReadFile = (path) => readFileSync(path, "utf8");

const textOf = (value) => (typeof value === "string" ? value : null);

const evidenceOf = (record, dynamicState) => [
  textOf(record?.error),
  textOf(record?.failure),
  textOf(record?.reason),
  textOf(dynamicState?.error),
  textOf(dynamicState?.reason),
  // The documented per-task field the host writes a failure message into.
  ...(Array.isArray(record?.tasks) ? record.tasks.map((task) => textOf(task?.statusDetail)) : []),
].filter((value) => value !== null);

const stateFor = (status) => RUN_STATES[status] ?? "UNKNOWN";

// A run is only DIVERGED when its own record proves the host replay-invariant failure. An interrupted
// run proves nothing about replayability, so it stays UNKNOWN and the host's own recorded request-hash
// check remains the enforced guard.
const dispositionFor = (status, evidence) => {
  if (evidence.some((value) => REPLAY_DIVERGENCE.test(value))) return "DIVERGED";
  if (status === "interrupted") return "UNKNOWN";
  return "REPLAYABLE";
};

export function readHostRuns({ workflowRoot, readFile = defaultReadFile, readdir = readdirSync, exists = existsSync } = {}) {
  if (typeof workflowRoot !== "string" || !workflowRoot) throw new TypeError("Host run read-back needs one workflow root");
  if (!exists(workflowRoot)) return [];
  const runs = [];
  for (const entry of readdir(workflowRoot).sort()) {
    const recordPath = join(workflowRoot, entry, "run.json");
    if (!exists(recordPath)) continue;
    let record;
    try {
      record = JSON.parse(readFile(recordPath));
    } catch {
      // An unreadable run record is a host fact this reader cannot prove; it stays visible instead of
      // being silently dropped.
      runs.push({ runId: entry, readable: false, status: null, task: null, rawTasks: [], generatedTaskIds: [], evidence: [] });
      continue;
    }
    const statePath = join(workflowRoot, entry, "dynamic", "state.json");
    let dynamicState = null;
    if (exists(statePath)) {
      try {
        dynamicState = JSON.parse(readFile(statePath));
      } catch {
        dynamicState = null;
      }
    }
    runs.push({
      runId: typeof record?.id === "string" && record.id ? record.id : entry,
      readable: true,
      status: textOf(record?.status),
      task: textOf(record?.task),
      rawTasks: Array.isArray(record?.tasks) ? record.tasks : [],
      generatedTaskIds: Array.isArray(record?.tasks)
        ? record.tasks.filter((task) => task && typeof task.specId === "string").map((task) => task.specId)
        : [],
      evidence: evidenceOf(record, dynamicState),
    });
  }
  return runs;
}

const taskBinding = (task) => {
  if (typeof task !== "string") return null;
  try {
    const parsed = JSON.parse(task);
    const facts = parsed?.facts;
    if (facts?.schema !== "dag-run-facts:v1") return null;
    if (typeof facts.run?.specId !== "string" || typeof facts.run?.target !== "string") return null;
    return { specId: facts.run.specId, target: facts.run.target };
  } catch {
    return null;
  }
};

// Selects the one host run that binds this exact Spec and target and is not terminal.
export function selectBlockedHostRun(runs, { specId, target, stageId } = {}) {
  if (!Array.isArray(runs)) throw new TypeError("Host run read-back needs the discovered run list");
  if (typeof specId !== "string" || !specId) throw new TypeError("Host run read-back needs one Spec id");
  if (typeof target !== "string" || !target) throw new TypeError("Host run read-back needs one target branch");
  const candidates = runs.filter((run) => {
    const binding = taskBinding(run.task);
    if (!binding || binding.specId !== specId || binding.target !== target) return false;
    return !HOST_TERMINAL_RUN_STATES.includes(stateFor(run.status));
  });
  const base = { schema: HOST_RUN_READBACK_SCHEMA, specId, target };
  if (candidates.length === 0) return Object.freeze({ ...base, status: "NONE", runIds: [] });
  if (candidates.length > 1) {
    return Object.freeze({ ...base, status: "AMBIGUOUS", runIds: candidates.map((run) => run.runId) });
  }
  const [run] = candidates;
  return Object.freeze({
    ...base,
    status: "SELECTED",
    runIds: [run.runId],
    // The recorded operations the blocked host run already owns, in recorded order. The re-entry proof
    // runs against exactly these, so a continue or a supersession can never dispatch twice.
    recorded: recordedFromRunRecord({ tasks: run.rawTasks }, stageId),
    hostRun: Object.freeze({
      runId: run.runId,
      state: stateFor(run.status),
      dynamicDisposition: dispositionFor(run.status, run.evidence),
      generatedTaskIds: [...run.generatedTaskIds],
    }),
  });
}

// The recorded operations the host already materialized for one run, in recorded order, with the
// request shape it proved. A record that carries no request hash keeps `null`, which the domain half
// treats as "not provable here" rather than as a mismatch.
export function recordedFromRunRecord(runJson, stageId) {
  if (runJson === null || typeof runJson !== "object" || !Array.isArray(runJson.tasks)) return [];
  const prefix = typeof stageId === "string" && stageId ? `${stageId}.` : null;
  return runJson.tasks
    .filter((task) => task && typeof task.specId === "string"
      && (prefix === null || task.specId.startsWith(prefix)))
    .map((task) => ({
      id: prefix === null ? task.specId : task.specId.slice(prefix.length),
      requestIdentity: typeof task.requestHash === "string" && task.requestHash
        ? `sha256:${task.requestHash}`
        : null,
      outcome: task.status === "completed" ? "settled" : "recorded",
    }));
}

// One call the entry can make once it knows the project checkout and the selected Spec.
export function blockedHostRunFor({ cwd, specId, target, stageId, ...readers } = {}) {
  if (typeof cwd !== "string" || !cwd) throw new TypeError("Host run read-back needs the project checkout");
  return selectBlockedHostRun(
    readHostRuns({ workflowRoot: workflowRootFor(cwd), ...readers }),
    { specId, target, stageId },
  );
}
