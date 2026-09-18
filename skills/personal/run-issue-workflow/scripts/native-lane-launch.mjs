// Native lane launch.
//
// ADR-0080 makes one Issue lane a native subagent lane owned by the coordinator. The coordinator's own
// harness names its runs, so this owner supplies the two things the delivery host needs from that
// harness and must never invent:
//
//   * the exact launch request for one planned lane, derived from the lane's own launch envelope, so the
//     prompt, the one contract skill, the tool ceiling and the worktree policy cannot drift; and
//   * the documented pointer that binds the journal's recorded lane reference to the native run the
//     harness actually created, published exclusively and never repointed.
//
// A pointer the harness's own record cannot back is not evidence. This module publishes the mapping and
// nothing else: liveness, terminal state and settlement are read by `native-lane-evidence.mjs` from the
// harness's own artifacts under the pointer, so a launch that never happened stays ABSENT.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { subagentRunsRoot } from "./native-lane-evidence.mjs";

export const LANE_LAUNCH_REQUEST_SCHEMA = "native-lane-launch-request:v1";
export const LANE_POINTER_SCHEMA = "native-lane-pointer:v1";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const requireText = (value, label) => {
  if (!isText(value)) throw new TypeError(`${label} is required`);
  return value;
};

// The one request the coordinator hands to its harness for a planned lane. Every field comes from the
// lane's own launch envelope; this builder re-derives nothing and widens nothing.
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
  if (tools === null || tools.length === 0 || tools.some((tool) => !isText(tool))) {
    throw new TypeError(`Lane ${laneRef} launch request needs its declared tools`);
  }
  if (!isRecord(launch.taskRef) || !isText(launch.taskRef.threadId) || launch.taskRef.threadId !== laneRef) {
    throw new TypeError(`Lane ${laneRef} launch request must carry its own task reference`);
  }
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

// Publish the mapping the reader resolves: the pointer is named by the recorded lane reference, and its
// own `runId` is that same reference, because that identity — not the harness's id — is what the journal
// authorizes. The harness's own id is carried beside it, and the run directory may be absolute because a
// harness may keep its artifacts outside the project checkout.
export function publishLanePointer({
  runsRoot = null,
  homeDir,
  env = process.env,
  laneRef,
  nativeRunId,
  cwd,
  runsDir,
  recordDir = null,
  at,
  exists = existsSync,
  readFile = (path) => readFileSync(path, "utf8"),
  writeFile = (path, value) => writeFileSync(path, value, { encoding: "utf8", flag: "wx", flush: true }),
  makeDirectory = (path) => mkdirSync(path, { recursive: true }),
} = {}) {
  const root = runsRoot ?? subagentRunsRoot({ homeDir, env });
  requireText(laneRef, "A lane pointer needs the recorded lane reference");
  requireText(nativeRunId, "A lane pointer needs the native run id the harness created");
  requireText(cwd, "A lane pointer needs the launch directory");
  requireText(runsDir, "A lane pointer needs the run directory root");
  requireText(at, "A lane pointer needs its publication instant");
  if (recordDir !== null && !isText(recordDir)) throw new TypeError("A lane pointer record directory must be text when given");
  const path = `${root}/${laneRef}.json`;
  const pointer = {
    schemaVersion: 1,
    schema: LANE_POINTER_SCHEMA,
    runId: laneRef,
    nativeRunId,
    cwd,
    runsDir,
    ...(recordDir === null ? {} : { recordDir }),
    correlationId: laneRef,
    updatedAt: at,
  };
  if (exists(path)) {
    const existing = (() => {
      try { return JSON.parse(readFile(path)); } catch { throw new Error(`The existing lane pointer at ${path} is unreadable`); }
    })();
    if (JSON.stringify(existing) === JSON.stringify(pointer)) return Object.freeze({ path, pointer, reused: true });
    // A lane is bound to the native run it was launched as. Repointing it would let one recorded attempt
    // be satisfied by a second run, which is exactly the duplicate lane the reservation exists to stop.
    throw new Error(`Lane ${laneRef} already points at native run ${String(existing?.nativeRunId ?? existing?.runId)}; preserve it and resolve the existing lane instead of repointing it`);
  }
  makeDirectory(dirname(path));
  writeFile(path, `${JSON.stringify(pointer, null, 2)}\n`);
  return Object.freeze({ path, pointer, reused: false });
}
