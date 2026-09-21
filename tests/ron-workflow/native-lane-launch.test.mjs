import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLaneLaunchRequest, publishLanePointer } from "../../skills/personal/run-issue-workflow/scripts/native-lane-launch.mjs";
import { readSubagentRunRecord } from "../../skills/personal/run-issue-workflow/scripts/native-lane-evidence.mjs";

// A virtual agent root: the reader and the pointer publisher only ever see the exact paths they are told
// about, so both are exercised without touching a real harness directory.
const virtualRoot = ({ files = {}, root = "/agent/subagent-runs", written = [] } = {}) => ({
  root,
  written,
  exists: (path) => Object.hasOwn(files, path) || written.some((row) => row.path === path),
  readFile: (path) => {
    const row = written.find((entry) => entry.path === path);
    if (row) return row.value;
    if (Object.hasOwn(files, path)) return files[path];
    throw new Error(`ENOENT ${path}`);
  },
  writeFile: (path, value) => { written.push({ path, value }); },
  makeDirectory: () => {},
});

const pointer = (fields) => `${JSON.stringify({ schemaVersion: 1, recordDir: undefined, ...fields }, null, 2)}\n`;

test("a lane launched by a harness that names its own runs reads back through its own record", () => {
  const cwd = "/repo";
  const runsDir = "/tmp/pi-subagents-uid/async-subagent-runs";
  const nativeRunId = "5dafff70-480a-b18a";
  const laneRef = "dispatch_I_kwDOTh5_1";
  const root = "/agent/subagent-runs";
  const pointerPath = `${root}/${laneRef}.json`;
  const laneDirectory = `${runsDir}/${nativeRunId}`;

  const files = {
    [pointerPath]: pointer({ runId: laneRef, nativeRunId, cwd, runsDir, recordDir: nativeRunId, correlationId: laneRef, updatedAt: "2026-09-18T06:00:00.000Z" }),
    [`${laneDirectory}/status.json`]: JSON.stringify({ runId: nativeRunId, state: "running", cwd, startedAt: 1789712587368, lastActivityAt: 1789712602377 }),
  };
  const virtual = virtualRoot({ files, root });

  const running = readSubagentRunRecord({ runId: laneRef, runsRoot: root, readFile: virtual.readFile, exists: virtual.exists });
  assert.equal(running.state, "PRESENT");
  assert.equal(running.nativeRunId, nativeRunId);
  assert.equal(running.status, "running");
  assert.equal(running.laneState, "ACTIVE");
  assert.equal(running.terminal, false);
  assert.equal(running.settled, false);
  assert.equal(running.heartbeatAt, new Date(1789712602377).toISOString());
  // The harness record's `cwd` is the launch directory, never the lane's own Issue worktree.
  assert.equal(running.worktreePath, null);

  files[`${laneDirectory}/status.json`] = JSON.stringify({ runId: nativeRunId, state: "complete", cwd, lastActivityAt: 1789712602377 });
  const unsettled = readSubagentRunRecord({ runId: laneRef, runsRoot: root, readFile: virtual.readFile, exists: virtual.exists });
  assert.equal(unsettled.status, "completed");
  assert.equal(unsettled.terminal, true);
  assert.equal(unsettled.settled, false, "completion without a closed-process proof never settles a lane");
  assert.match(unsettled.evidence.join(" "), /without a closed-process proof/u);

  files[`${laneDirectory}/process-terminal.json`] = JSON.stringify({ version: 1, state: "observed", runId: nativeRunId,
    instances: [{ kind: "runner", closeObservedAt: 1789712602377, exitCode: 0, signal: null }] });
  const settled = readSubagentRunRecord({ runId: laneRef, runsRoot: root, readFile: virtual.readFile, exists: virtual.exists });
  assert.equal(settled.status, "completed");
  assert.equal(settled.laneState, "RESUMABLE");
  assert.equal(settled.terminal, true);
  assert.equal(settled.settled, true);
});

test("a pi-workflow pointer with its own task record keeps reading exactly as before", () => {
  const cwd = "/repo";
  const runsDir = ".pi/workflow-subagents/workflow_x/task-2";
  const laneRef = "run_mu5aweya_aa0849";
  const root = "/agent/subagent-runs";
  const virtual = virtualRoot({ root, files: {
    [`${root}/${laneRef}.json`]: pointer({ runId: laneRef, cwd, runsDir, correlationId: "workflow_x:task-2", updatedAt: "2026-09-17T09:02:00.211Z" }),
    [`${cwd}/${runsDir}/${laneRef}/run.json`]: JSON.stringify({ status: "running", latestAttemptId: "a2",
      attempts: [{ attemptId: "a1", heartbeatAt: "2026-09-17T09:00:00.000Z" },
        { attemptId: "a2", heartbeatAt: "2026-09-17T09:02:00.211Z", workspace: { worktreePath: "/repo-issues/124" } }] }),
  } });

  const read = readSubagentRunRecord({ runId: laneRef, runsRoot: root, readFile: virtual.readFile, exists: virtual.exists });
  assert.equal(read.state, "PRESENT");
  assert.equal(read.status, "running");
  assert.equal(read.laneState, "ACTIVE");
  assert.equal(read.worktreePath, "/repo-issues/124");
  assert.equal(read.heartbeatAt, "2026-09-17T09:02:00.211Z");
});

test("unattributable, unknown and absent lane records never read as a lane", () => {
  const root = "/agent/subagent-runs";
  const cwd = "/repo";
  const runsDir = "/tmp/runs";

  const foreign = virtualRoot({ root, files: {
    [`${root}/lane-a.json`]: pointer({ runId: "lane-b", cwd, runsDir, recordDir: "native-1" }),
  } });
  assert.equal(readSubagentRunRecord({ runId: "lane-a", runsRoot: root, readFile: foreign.readFile, exists: foreign.exists }).state, "UNREADABLE");

  const unknownState = virtualRoot({ root, files: {
    [`${root}/lane-a.json`]: pointer({ runId: "lane-a", nativeRunId: "native-1", cwd, runsDir, recordDir: "native-1" }),
    [`${runsDir}/native-1/status.json`]: JSON.stringify({ runId: "native-1", state: "mystery" }),
  } });
  const unknown = readSubagentRunRecord({ runId: "lane-a", runsRoot: root, readFile: unknownState.readFile, exists: unknownState.exists });
  assert.equal(unknown.state, "PRESENT");
  assert.equal(unknown.status, null);
  assert.equal(unknown.laneState, "UNKNOWN");
  assert.equal(unknown.terminal, false);
  assert.match(unknown.evidence.join(" "), /unrecognised harness state/u);

  const absent = virtualRoot({ root });
  assert.equal(readSubagentRunRecord({ runId: "lane-a", runsRoot: root, readFile: absent.readFile, exists: absent.exists }).state, "ABSENT");

  const pointerWithoutRecord = virtualRoot({ root, files: {
    [`${root}/lane-a.json`]: pointer({ runId: "lane-a", nativeRunId: "native-1", cwd, runsDir, recordDir: "native-1" }),
  } });
  const materialized = readSubagentRunRecord({ runId: "lane-a", runsRoot: root, readFile: pointerWithoutRecord.readFile, exists: pointerWithoutRecord.exists });
  assert.equal(materialized.state, "PRESENT", "a pointer still proves the lane was materialized");
  assert.equal(materialized.laneState, "UNKNOWN");
});

test("the pointer binds one recorded lane to one native run and is never repointed", () => {
  const root = "/agent/subagent-runs";
  const virtual = virtualRoot({ root });
  const publish = (fields) => publishLanePointer({ runsRoot: root, laneRef: "dispatch_1", nativeRunId: "native-1",
    cwd: "/repo", runsDir: "/tmp/runs", recordDir: "native-1", at: "2026-09-18T06:00:00.000Z",
    exists: virtual.exists, readFile: virtual.readFile, writeFile: virtual.writeFile, makeDirectory: virtual.makeDirectory, ...fields });

  const first = publish({});
  assert.equal(first.reused, false);
  assert.equal(first.path, `${root}/dispatch_1.json`);
  assert.equal(first.pointer.runId, "dispatch_1");
  assert.equal(first.pointer.nativeRunId, "native-1");

  assert.equal(publish({}).reused, true, "the exact same launch republishes its own pointer");

  assert.throws(() => publish({ nativeRunId: "native-2" }), /already points at native run/u);
  assert.throws(() => publishLanePointer({ runsRoot: root, laneRef: "dispatch_1", cwd: "/repo", runsDir: "/tmp/runs", at: "x",
    exists: virtual.exists, readFile: virtual.readFile, writeFile: virtual.writeFile, makeDirectory: virtual.makeDirectory }),
  /native run id/u);
});

test("lane record locations fail closed on traversal and allow contained nested layouts", () => {
  const invalid = [
    "../spoof",
    "nested/../../spoof",
    "nested\\..\\../spoof",
    "/absolute/spoof",
    "C:\\absolute\\spoof",
    "nested/record\u0000.json",
  ];
  for (const recordDir of invalid) {
    const virtual = virtualRoot();
    assert.throws(() => publishLanePointer({
      runsRoot: virtual.root,
      laneRef: `lane-${invalid.indexOf(recordDir)}`,
      nativeRunId: "native-1",
      cwd: "/repo",
      runsDir: ".runs",
      recordDir,
      at: "2026-09-18T06:00:00.000Z",
      exists: virtual.exists,
      readFile: virtual.readFile,
      writeFile: virtual.writeFile,
      makeDirectory: virtual.makeDirectory,
    }), /relative|traverse|inside|control characters/u, recordDir);
    assert.equal(virtual.written.length, 0);
  }

  const nested = virtualRoot();
  const published = publishLanePointer({
    runsRoot: nested.root,
    laneRef: "lane-nested",
    nativeRunId: "native-1",
    cwd: "/repo",
    runsDir: ".runs",
    recordDir: "harness/native-1",
    at: "2026-09-18T06:00:00.000Z",
    exists: nested.exists,
    readFile: nested.readFile,
    writeFile: nested.writeFile,
    makeDirectory: nested.makeDirectory,
  });
  assert.equal(published.generation.recordDir, "harness/native-1");
});

test("a symlinked lane record outside the run root is unreadable and never settled", () => {
  const root = mkdtempSync(join(tmpdir(), "native-lane-containment-"));
  try {
    const pointers = join(root, "pointers");
    const runs = join(root, "runs");
    const outside = join(root, "outside");
    mkdirSync(pointers);
    mkdirSync(runs);
    mkdirSync(outside);
    writeFileSync(join(outside, "status.json"), JSON.stringify({ state: "completed" }));
    writeFileSync(join(outside, "process-terminal.json"), JSON.stringify({
      state: "observed",
      instances: [{ closeObservedAt: "2026-09-18T06:00:01.000Z", exitCode: 0 }],
    }));
    symlinkSync(outside, join(runs, "escaped"), "dir");
    publishLanePointer({
      runsRoot: pointers,
      laneRef: "lane-escaped",
      nativeRunId: "native-1",
      cwd: root,
      runsDir: runs,
      recordDir: "escaped",
      at: "2026-09-18T06:00:00.000Z",
    });

    const evidence = readSubagentRunRecord({ runId: "lane-escaped", runsRoot: pointers });
    assert.equal(evidence.state, "UNREADABLE");
    assert.equal(evidence.laneState, "UNKNOWN");
    assert.equal(evidence.terminal, false);
    assert.equal(evidence.settled, false);
    assert.match(evidence.evidence.join(" "), /outside|unsafe/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lane launch request carries the envelope it was planned with and nothing wider", () => {
  const launch = {
    taskRef: { threadId: "dispatch_1", hostId: "pi-subagents" },
    agent: "worker",
    skill: "execute-issue",
    tools: ["read", "bash"],
    worktreePolicy: "on",
    prompt: "Use $execute-issue to implement the Issue.\n\nStanding rules for this lane:\n- Read the repository, the tracker and Git only.",
    standingRules: ["Read the repository, the tracker and Git only."],
    requestIdentity: "sha256:abc",
    reservedAt: "2026-09-18T06:00:00.000Z",
    attempt: 1,
  };
  const lane = { id: "dispatch_1", laneRef: "dispatch_1", issueId: "I_kwDOTh5", actionType: "dispatch_issue", decision: "CREATE", launch };

  const request = createLaneLaunchRequest({ runId: "workflow-op-v1:x", lane });
  assert.equal(request.agent, "worker");
  assert.equal(request.skill, "execute-issue");
  assert.deepEqual(request.tools, ["read", "bash"]);
  assert.equal(request.laneRef, "dispatch_1");
  assert.equal(request.prompt, launch.prompt);

  const missingRules = { ...lane, launch: { ...launch, prompt: "Use $execute-issue without its standing rules." } };
  assert.throws(() => createLaneLaunchRequest({ runId: "workflow-op-v1:x", lane: missingRules }), /standing rules/u);

  const foreignTaskRef = { ...lane, launch: { ...launch, taskRef: { threadId: "another-lane", hostId: "pi-subagents" } } };
  assert.throws(() => createLaneLaunchRequest({ runId: "workflow-op-v1:x", lane: foreignTaskRef }), /task reference/u);

  const readBackLane = { ...lane, decision: "OBSERVE", launch: null };
  assert.throws(() => createLaneLaunchRequest({ runId: "workflow-op-v1:x", lane: readBackLane }), /not planned for a launch/u);
});
