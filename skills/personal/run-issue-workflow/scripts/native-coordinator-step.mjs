import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readLanePointer, publishLanePointer } from "./native-lane-launch.mjs";
import { startRun } from "./run-entry.mjs";

export const NATIVE_COORDINATOR_STEP_SCHEMA = "native-coordinator-step:v1";
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const isText = (value) => typeof value === "string" && value.length > 0;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const COMPACT_OUTPUT_BYTE_LIMIT = 16 * 1024;
const requireText = (value, label) => {
  if (!isText(value)) throw new TypeError(`${label} must be non-empty text`);
  return value;
};
const planArray = (plan, name) => {
  const value = plan[name] ?? [];
  if (!Array.isArray(value)) throw new TypeError(`Native coordinator plan ${name} must be an array`);
  return value;
};
const promptFor = (launch) => {
  const prompt = String(launch?.prompt ?? "");
  if (Buffer.byteLength(prompt) <= 4096) return prompt;
  return `${prompt.slice(0, 4000)}\n[bounded by native coordinator]`;
};
const actionIdentity = (runId, type, item) => sha256(JSON.stringify({
  runId,
  type,
  laneRef: item.laneRef ?? item.id ?? null,
  issueId: item.issueId ?? null,
  requestIdentity: item.launch?.requestIdentity ?? item.requestIdentity ?? null,
  decision: item.decision ?? null,
}));
const freezeAction = (action) => Object.freeze(action);

const generationFor = ({ laneRef, type, runsRoot, readPointer }) => {
  const pointer = readPointer({ runsRoot, laneRef });
  if (type === "create_lane") {
    if (pointer !== null) throw new Error(`Create lane ${laneRef} already has a native generation`);
    return { generation: 1, previousNativeRunId: null };
  }
  if (pointer === null) throw new Error(`Resume lane ${laneRef} has no bound native generation`);
  return {
    generation: pointer.latest.generation + 1,
    previousNativeRunId: pointer.latest.nativeRunId,
  };
};

export function planNativeCoordinatorStep({
  started,
  runsRoot = null,
  readPointer = readLanePointer,
  append = null,
  appendAll = null,
  artifactRefs = {},
} = {}) {
  const plan = started?.plan;
  if (!plan || !isText(plan.runId)) {
    return Object.freeze({
      schema: NATIVE_COORDINATOR_STEP_SCHEMA,
      runId: null,
      outcome: "BLOCKED",
      actions: Object.freeze([]),
      artifactRefs: Object.freeze({ ...artifactRefs }),
      stop: started?.diagnosis ?? { code: "native_step_input_unavailable", evidence: ["Start returned no native round plan."] },
    });
  }

  // Preflight is deliberately complete before the journal writer is touched. Pointer generation,
  // prompts, tools, identities and the compact output are therefore either all valid or append count is
  // zero for the round.
  const runId = requireText(plan.runId, "Native coordinator Run id");
  const lanes = planArray(plan, "lanes");
  const readBacks = planArray(plan, "readBacks");
  const waits = planArray(plan, "waits");
  const hostOperations = planArray(plan, "hostOperations");
  const reservations = planArray(plan, "reservations");
  const closeIntents = planArray(plan, "closeIntents");
  for (const [name, events] of [["reservations", reservations], ["closeIntents", closeIntents]]) {
    if (events.some((event) => !isRecord(event))) throw new TypeError(`Native coordinator plan ${name} must contain only events`);
  }

  const actions = [];
  for (const lane of lanes) {
    if (!isRecord(lane)) throw new TypeError("Native coordinator lane must be an object");
    const laneRef = requireText(lane.laneRef, "Native coordinator lane reference");
    requireText(lane.id, `Native coordinator lane ${laneRef} action id`);
    requireText(lane.issueId, `Native coordinator lane ${laneRef} Issue id`);
    requireText(lane.actionType, `Native coordinator lane ${laneRef} action type`);
    requireText(lane.skill, `Native coordinator lane ${laneRef} skill`);
    requireText(lane.decision, `Native coordinator lane ${laneRef} decision`);
    const tools = lane.tools;
    if (!Array.isArray(tools) || tools.length === 0 || tools.some((tool) => !isText(tool))) {
      throw new TypeError(`Native coordinator lane ${laneRef} tools must be a non-empty text list`);
    }
    if (!isRecord(lane.launch)) throw new TypeError(`Native coordinator lane ${laneRef} has no launch envelope`);
    requireText(lane.launch.prompt, `Native coordinator lane ${laneRef} prompt`);
    const sameLane = ["recover_issue", "repair_issue", "upgrade_issue"].includes(lane.actionType)
      || lane.decision === "RESUME";
    const type = sameLane ? "resume_lane" : "create_lane";
    const nativeGeneration = generationFor({ laneRef, type, runsRoot, readPointer });
    actions.push(freezeAction({
      id: actionIdentity(runId, type, lane),
      type,
      runId,
      laneRef,
      issueId: lane.issueId,
      skill: lane.skill,
      mode: lane.worktreePolicy ?? null,
      tools: Object.freeze([...tools]),
      prompt: promptFor(lane.launch),
      requestIdentity: lane.launch.requestIdentity ?? null,
      decision: lane.decision,
      nativeGeneration: Object.freeze(nativeGeneration),
    }));
  }
  for (const item of readBacks) {
    if (!isRecord(item)) throw new TypeError("Native coordinator read-back must be an object");
    requireText(item.id, "Native coordinator read-back action id");
    requireText(item.laneRef, "Native coordinator read-back lane reference");
    requireText(item.issueId, "Native coordinator read-back Issue id");
    actions.push(freezeAction({
      id: actionIdentity(runId, "observe_lane", item), type: "observe_lane", runId,
      laneRef: item.laneRef, issueId: item.issueId, skill: null, mode: "read-only",
      tools: Object.freeze([]), prompt: "", requestIdentity: item.requestIdentity ?? null,
      decision: item.decision ?? null, nativeGeneration: null,
    }));
  }
  for (const item of waits) {
    if (!isRecord(item)) throw new TypeError("Native coordinator wait must be an object");
    const laneRef = requireText(item.laneRef ?? item.id, "Native coordinator wait identity");
    actions.push(freezeAction({
      id: actionIdentity(runId, "wait_owner", item), type: "wait_owner", runId, laneRef,
      issueId: item.issueId ?? null, skill: null, mode: item.execution ?? "wait",
      tools: Object.freeze([]), prompt: "", requestIdentity: item.requestIdentity ?? null,
      decision: null, nativeGeneration: null,
    }));
  }
  for (const item of hostOperations) {
    if (!isRecord(item)) throw new TypeError("Native coordinator host operation must be an object");
    const laneRef = requireText(item.laneRef ?? item.id, "Native coordinator host operation identity");
    const control = /pause|stop/iu.test(`${item.actionType ?? ""} ${item.id ?? ""}`);
    const type = control ? "settle_control" : "return_to_entry";
    actions.push(freezeAction({
      id: actionIdentity(runId, type, item), type, runId, laneRef,
      issueId: item.issueId ?? null, skill: null, mode: item.execution ?? null,
      tools: Object.freeze([]), prompt: "", requestIdentity: item.requestIdentity ?? null,
      decision: null, nativeGeneration: null,
    }));
  }
  if (new Set(actions.map(({ id }) => id)).size !== actions.length) {
    throw new Error("Native coordinator action identities are not unique");
  }

  let outcome = "ACTION_REQUIRED";
  if (actions.length === 0) {
    if (plan.disposition === "TERMINAL") outcome = "TERMINAL";
    else if (plan.disposition === "BLOCKED") outcome = "BLOCKED";
    else outcome = "WAITING";
  } else if (actions.every(({ type }) => type === "observe_lane")) outcome = "OBSERVING";
  const result = Object.freeze({
    schema: NATIVE_COORDINATOR_STEP_SCHEMA,
    runId,
    outcome,
    actions: Object.freeze(actions),
    artifactRefs: Object.freeze({ ...artifactRefs }),
    stop: plan.stop ?? null,
  });
  const compactOutput = `${JSON.stringify(result, null, 2)}\n`;
  if (Buffer.byteLength(compactOutput) > COMPACT_OUTPUT_BYTE_LIMIT) {
    throw new Error("Native coordinator compact output exceeds 16384 bytes");
  }

  const events = [...reservations, ...closeIntents];
  if (events.length > 0) {
    if (typeof appendAll === "function") appendAll(events);
    else if (typeof append === "function") for (const event of events) append(event);
    else throw new TypeError("Native coordinator actions need a durable journal writer");
  }
  return result;
}

export function bindNativeCoordinatorLane({
  runsRoot,
  laneRef,
  nativeRunId,
  generation,
  previousNativeRunId = null,
  cwd,
  runsDir,
  recordDir = null,
  at,
} = {}) {
  const result = publishLanePointer({
    runsRoot,
    laneRef,
    nativeRunId,
    generation,
    previousNativeRunId,
    cwd,
    runsDir,
    recordDir,
    at,
  });
  return {
    schema: "native-coordinator-bind:v1",
    laneRef,
    nativeRunId,
    generation: result.generation.generation,
    previousNativeRunId: result.generation.previousNativeRunId,
    path: result.path,
    reused: result.reused,
  };
}

const flags = (argv) => {
  const values = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) values[argv[index].slice(2)] = argv[++index] ?? true;
    else positional.push(argv[index]);
  }
  return { values, positional };
};

export async function runNativeCoordinatorCli(argv = process.argv.slice(2)) {
  const [command = "step", ...rest] = argv;
  const { values, positional } = flags(rest);
  if (command === "bind") {
    const result = bindNativeCoordinatorLane({
      runsRoot: values["runs-root"],
      laneRef: values.lane,
      nativeRunId: values["native-run-id"],
      generation: Number(values.generation),
      previousNativeRunId: values.previous === undefined || values.previous === "null" ? null : values.previous,
      cwd: values.cwd,
      runsDir: values["runs-dir"],
      recordDir: values["record-dir"] ?? null,
      at: values.at ?? new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  if (command !== "step") throw new Error(`Unknown native coordinator command: ${command}`);
  const specId = positional[0] ?? values.spec;
  const started = await startRun({ cwd: values.cwd ?? process.cwd(), specId, approval: values.approve ?? null });
  const startedRecord = /** @type {Record<string, any>} */ (started);
  const artifactPath = resolve(values.artifact ?? joinArtifact(values.cwd ?? process.cwd(), startedRecord.plan?.runId ?? "unbound"));
  mkdirSync(dirname(artifactPath), { recursive: true });
  const artifact = {
    schema: "native-coordinator-round-artifact:v1",
    start: { ...started, nativeLoop: undefined, round: undefined },
    round: startedRecord.round ?? null,
    plan: startedRecord.plan ?? null,
  };
  const bytes = `${JSON.stringify(artifact)}\n`;
  if (Buffer.byteLength(bytes) > 512 * 1024) throw new Error("Native coordinator round artifact exceeds 524288 bytes");
  writeFileSync(artifactPath, bytes, { mode: 0o600 });
  const result = planNativeCoordinatorStep({
    started,
    runsRoot: values["runs-root"] ?? null,
    append: startedRecord.nativeLoop?.append ?? null,
    appendAll: startedRecord.nativeLoop?.appendAll ?? null,
    artifactRefs: { round: artifactPath },
  });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (Buffer.byteLength(output) > 16 * 1024) throw new Error("Native coordinator compact output exceeds 16384 bytes");
  process.stdout.write(output);
  return result;
}

const joinArtifact = (cwd, runId) => resolve(cwd, ".git", "run-issue-workflow", "artifacts", `${runId.replaceAll(/[^a-zA-Z0-9._-]/gu, "_")}.json`);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runNativeCoordinatorCli();
}
