import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { subagentRunsRoot } from "./native-lane-evidence.mjs";
import { resolveLaneRecordLocation } from "./native-lane-record-locator.mjs";

export const LANE_LAUNCH_REQUEST_SCHEMA = "native-lane-launch-request:v1";
export const LANE_POINTER_SCHEMA = "native-lane-pointer:v2";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const requireText = (value, label) => {
  if (!isText(value)) throw new TypeError(`${label} is required`);
  return value;
};

export function createLaneLaunchRequest({ runId, lane } = {}) {
  requireText(runId, "A lane launch request needs the logical DAG Run id");
  if (!isRecord(lane)) throw new TypeError("A lane launch request needs one planned lane");
  const launch = isRecord(lane.launch) ? lane.launch : null;
  if (launch === null) throw new TypeError(`Lane ${String(lane.id)} was not planned for a launch`);
  const laneRef = requireText(lane.laneRef, "A lane launch request needs the recorded lane reference");
  const prompt = requireText(launch.prompt, "A lane launch request needs the composed lane prompt");
  const standingRules = Array.isArray(launch.standingRules) ? launch.standingRules : [];
  if (standingRules.some((rule) => !isText(rule)) || standingRules.length === 0
    || standingRules.some((rule) => !prompt.includes(rule))) {
    throw new TypeError(`Lane ${laneRef} prompt does not carry its standing rules`);
  }
  const tools = Array.isArray(launch.tools) ? launch.tools : null;
  if (tools === null || tools.length === 0 || tools.some((tool) => !isText(tool)))
    throw new TypeError(`Lane ${laneRef} launch request needs its declared tools`);
  if (!isRecord(launch.taskRef) || !isText(launch.taskRef.threadId) || launch.taskRef.threadId !== laneRef)
    throw new TypeError(`Lane ${laneRef} launch request must carry its own task reference`);
  return Object.freeze({
    schema: LANE_LAUNCH_REQUEST_SCHEMA,
    runId,
    laneRef,
    issueId: requireText(lane.issueId, "A lane launch request needs its Issue"),
    actionType: requireText(lane.actionType, "A lane launch request needs its action type"),
    attempt: launch.attempt,
    decision: requireText(lane.decision, "A lane launch request needs its lane decision"),
    agent: requireText(launch.agent, "A lane launch request needs its agent"),
    skill: requireText(launch.skill, "A lane launch request needs its one contract skill"),
    tools: Object.freeze([...tools]),
    worktreePolicy: launch.worktreePolicy ?? null,
    prompt,
    standingRules: Object.freeze([...standingRules]),
    requestIdentity: launch.requestIdentity ?? null,
    reservedAt: launch.reservedAt ?? null,
  });
}

const parsePointer = ({ path, laneRef, readFile }) => {
  let pointer;
  try { pointer = JSON.parse(readFile(path)); }
  catch { throw new Error(`The existing lane pointer at ${path} is unreadable`); }
  if (pointer?.schema === "native-lane-pointer:v2") {
    if (pointer.runId !== laneRef || !Array.isArray(pointer.generations) || pointer.generations.length === 0)
      throw new Error(`Lane ${laneRef} has an invalid generation chain`);
    let previous = null;
    for (let index = 0; index < pointer.generations.length; index += 1) {
      const generation = pointer.generations[index];
      if (generation.generation !== index + 1 || generation.previousNativeRunId !== previous
        || !isText(generation.nativeRunId) || !isText(generation.cwd) || !isText(generation.runsDir))
        throw new Error(`Lane ${laneRef} generation chain is discontinuous at ${index + 1}`);
      try {
        resolveLaneRecordLocation({
          cwd: generation.cwd,
          runsDir: generation.runsDir,
          recordDir: generation.recordDir ?? generation.nativeRunId,
        });
      } catch (error) {
        throw new Error(`Lane ${laneRef} generation ${index + 1} has an unsafe record location: ${error.message}`);
      }
      previous = generation.nativeRunId;
    }
    return pointer;
  }
  if ((pointer?.schema === "native-lane-pointer:v1" || pointer?.schemaVersion === 1)
    && pointer.runId === laneRef && isText(pointer.nativeRunId)) {
    try {
      resolveLaneRecordLocation({
        cwd: pointer.cwd,
        runsDir: pointer.runsDir,
        recordDir: pointer.recordDir ?? pointer.nativeRunId,
      });
    } catch (error) {
      throw new Error(`Lane ${laneRef} has an unsafe record location: ${error.message}`);
    }
    return {
      schemaVersion: 2,
      schema: LANE_POINTER_SCHEMA,
      runId: laneRef,
      correlationId: pointer.correlationId ?? laneRef,
      generations: [{
        generation: 1,
        nativeRunId: pointer.nativeRunId,
        previousNativeRunId: null,
        cwd: pointer.cwd,
        runsDir: pointer.runsDir,
        ...(pointer.recordDir === undefined ? {} : { recordDir: pointer.recordDir }),
        updatedAt: pointer.updatedAt,
      }],
      updatedAt: pointer.updatedAt,
    };
  }
  throw new Error(`Lane ${laneRef} has an unsupported pointer schema`);
};

export function readLanePointer({
  runsRoot = null,
  homeDir,
  env = process.env,
  laneRef,
  exists = existsSync,
  readFile = (path) => readFileSync(path, "utf8"),
} = {}) {
  const root = runsRoot ?? subagentRunsRoot({ homeDir, env });
  requireText(laneRef, "A lane pointer needs the recorded lane reference");
  const path = `${root}/${laneRef}.json`;
  if (!exists(path)) return null;
  const pointer = parsePointer({ path, laneRef, readFile });
  return Object.freeze({ path, pointer, latest: Object.freeze({ ...pointer.generations.at(-1) }) });
}

export function publishLanePointer({
  runsRoot = null,
  homeDir,
  env = process.env,
  laneRef,
  nativeRunId,
  previousNativeRunId = null,
  generation = null,
  cwd,
  runsDir,
  recordDir = null,
  at,
  exists = existsSync,
  readFile = (path) => readFileSync(path, "utf8"),
  writeFile = (path, value) => writeFileSync(path, value, { encoding: "utf8", flag: "wx", flush: true }),
  replaceFile = (from, to) => renameSync(from, to),
  makeDirectory = (path) => mkdirSync(path, { recursive: true }),
} = {}) {
  const root = runsRoot ?? subagentRunsRoot({ homeDir, env });
  requireText(laneRef, "A lane pointer needs the recorded lane reference");
  requireText(nativeRunId, "A lane pointer needs the native run id the harness created");
  requireText(cwd, "A lane pointer needs the launch directory");
  requireText(runsDir, "A lane pointer needs the run directory root");
  requireText(at, "A lane pointer needs its publication instant");
  if (recordDir !== null && !isText(recordDir)) throw new TypeError("A lane pointer record directory must be text when given");
  resolveLaneRecordLocation({ cwd, runsDir, recordDir: recordDir ?? nativeRunId });
  const path = `${root}/${laneRef}.json`;
  const existing = exists(path) ? parsePointer({ path, laneRef, readFile }) : null;
  const latest = existing?.generations.at(-1) ?? null;
  let requestedGeneration = generation;
  if (requestedGeneration === null) {
    if (latest === null) requestedGeneration = 1;
    else requestedGeneration = latest.nativeRunId === nativeRunId ? latest.generation : latest.generation + 1;
  }
  if (!Number.isInteger(requestedGeneration) || requestedGeneration < 1)
    throw new TypeError("A lane pointer generation must be a positive integer");
  if (latest !== null && latest.nativeRunId === nativeRunId && requestedGeneration === latest.generation) {
    const exact = latest.previousNativeRunId === previousNativeRunId && latest.cwd === cwd && latest.runsDir === runsDir
      && (latest.recordDir ?? null) === recordDir;
    if (!exact) throw new Error(`Lane ${laneRef} generation ${requestedGeneration} conflicts with its existing bind`);
    return Object.freeze({ path, pointer: existing, generation: latest, reused: true });
  }
  if (requestedGeneration !== (latest?.generation ?? 0) + 1)
    throw new Error(`Lane ${laneRef} generation chain is discontinuous: expected ${(latest?.generation ?? 0) + 1}, received ${requestedGeneration}`);
  if (previousNativeRunId !== (latest?.nativeRunId ?? null))
    throw new Error(`Lane ${laneRef} already points at native run ${String(latest?.nativeRunId)}; resume must bind that exact previous native run id`);
  const nextGeneration = {
    generation: requestedGeneration,
    nativeRunId,
    previousNativeRunId,
    cwd,
    runsDir,
    ...(recordDir === null ? {} : { recordDir }),
    updatedAt: at,
  };
  const pointer = {
    schemaVersion: 2,
    schema: LANE_POINTER_SCHEMA,
    runId: laneRef,
    correlationId: laneRef,
    nativeRunId,
    cwd,
    runsDir,
    ...(recordDir === null ? {} : { recordDir }),
    generations: [...(existing?.generations ?? []), nextGeneration],
    updatedAt: at,
  };
  makeDirectory(dirname(path));
  if (existing === null) writeFile(path, `${JSON.stringify(pointer, null, 2)}\n`);
  else {
    const temporary = `${path}.${process.pid}.${requestedGeneration}`;
    writeFile(temporary, `${JSON.stringify(pointer, null, 2)}\n`);
    replaceFile(temporary, path);
  }
  const readBack = parsePointer({ path, laneRef, readFile });
  if (JSON.stringify(readBack) !== JSON.stringify(pointer))
    throw new Error(`Lane ${laneRef} generation ${requestedGeneration} read-back differs`);
  return Object.freeze({ path, pointer, generation: Object.freeze(nextGeneration), reused: false });
}
