// Native lane evidence owns lane liveness and completion for the ADR-0080 substrate. The native
// subagent run record owns liveness and terminal state, the tracker completion note owns completion,
// and Git owns the worktree, the recorded topic branch and the candidate's reachability. No host run
// artifact is read, and a lane that proves nothing fails closed.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LANE_STOP_CODES, planIssueLane } from "../../skills/personal/run-issue-workflow/scripts/issue-lane.mjs";
import {
  NATIVE_LANE_EVIDENCE_SCHEMA,
  SUBAGENT_RUN_RECORD_SCHEMA,
  creationIntentsFor,
  observedLanesFor,
  readNativeLaneEvidence,
  readSubagentRunRecord,
  subagentRunRecordPath,
  subagentRunsRoot,
} from "../../skills/personal/run-issue-workflow/scripts/native-lane-evidence.mjs";

const laneRef = "dispatch_I_child_1";
const issueId = "I_child";
const target = "features/ron";
const runId = "run_lane_1";
const worktree = "/home/ron/code/skills-issue-lanes/issue-116";
const candidate = "a".repeat(40);

const agentRootFixture = () => {
  const homeDir = mkdtempSync(join(tmpdir(), "native-lane-home-"));
  // The harness may move its agent root through the environment, so the fixture pins its own root
  // rather than inheriting the one this test process runs under.
  const runsRoot = subagentRunsRoot({ homeDir, env: {} });
  mkdirSync(runsRoot, { recursive: true });
  return { homeDir, runsRoot, cleanup: () => rmSync(homeDir, { recursive: true, force: true }) };
};

const writePointer = ({ runsRoot, id, cwd, runsDir, correlationId = "issue-116:lane" }) => {
  const path = subagentRunRecordPath({ runsRoot, runId: id });
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1,
    runId: id,
    cwd,
    runsDir,
    correlationId,
    updatedAt: "2026-09-18T02:00:00.000Z",
  }));
  return path;
};

const writeRunRecord = ({ cwd, runsDir, id, status, worktreePath = null, failureKind = null }) => {
  const directory = join(cwd, runsDir, id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "run.json"), JSON.stringify({
    schemaVersion: 2,
    runId: id,
    mode: "single",
    status,
    failureKind,
    latestAttemptId: "attempt_1",
    attempts: [{
      attemptId: "attempt_1",
      status,
      heartbeatAt: "2026-09-18T02:00:01.000Z",
      workspace: { mode: worktreePath === null ? "shared" : "worktree", cwd, worktreePath },
    }],
  }));
  return directory;
};

// One native lane whose run record, tracker note and Git state the test controls.
const laneFixture = ({ status, worktreePath = worktree, failureKind = null, completion = null, trackerState = "OPEN", git: gitOverrides = {} }) => {
  const fixture = agentRootFixture();
  const projectRoot = join(fixture.homeDir, "checkout");
  mkdirSync(projectRoot, { recursive: true });
  const runsDir = `.pi/workflow-subagents/${runId}/task-1`;
  writePointer({ runsRoot: fixture.runsRoot, id: runId, cwd: projectRoot, runsDir });
  writeRunRecord({ cwd: projectRoot, runsDir, id: runId, status, worktreePath, failureKind });
  const git = {
    revParse: ({ ref }) => (ref === "issue/116-native-lane-runner" ? "b".repeat(40) : null),
    isAncestor: ({ ancestor, descendant }) => ancestor === candidate && descendant === "b".repeat(40),
    ...gitOverrides,
  };
  const readIssue = () => ({ state: trackerState, completion });
  return { ...fixture, repository: projectRoot, git, readIssue };
};

const completionNote = (overrides = {}) => ({
  identity: "IC_kwDOTh5gv88AAAABVTiPTQ",
  record: {
    kind: "implementation_complete",
    issueId,
    candidate,
    topic: "issue/116-native-lane-runner",
    worktree,
    baseline: "9".repeat(40),
    ...overrides,
  },
});

const read = (fixture, lanes = [{ laneRef, issueId, attempt: 1, runId, worktree }]) => readNativeLaneEvidence({
  lanes,
  readRun: (lane) => readSubagentRunRecord({ runId: lane.runId, runsRoot: fixture.runsRoot }),
  readIssue: fixture.readIssue,
  git: fixture.git,
  repository: fixture.repository,
  target,
});

test("the native subagent run record is read from its documented pointer and own record", () => {
  const fixture = laneFixture({ status: "running" });
  try {
    const record = readSubagentRunRecord({ runId, runsRoot: fixture.runsRoot });
    assert.equal(record.schema, SUBAGENT_RUN_RECORD_SCHEMA);
    assert.equal(record.state, "PRESENT");
    assert.equal(record.status, "running");
    assert.equal(record.laneState, "ACTIVE");
    assert.equal(record.terminal, false);
    assert.equal(record.settled, false);
    assert.equal(record.worktreePath, worktree);
    assert.equal(record.correlationId, "issue-116:lane");
  } finally {
    fixture.cleanup();
  }
});

test("a missing native run record reads as absent with its own path named", () => {
  const fixture = agentRootFixture();
  try {
    const record = readSubagentRunRecord({ runId: "run_absent", runsRoot: fixture.runsRoot });
    assert.equal(record.state, "ABSENT");
    assert.equal(record.laneState, "UNKNOWN");
    assert.match(record.evidence[0], /No native subagent run record pointer exists at .*run_absent\.json/u);
  } finally {
    fixture.cleanup();
  }
});

test("a live native lane is an active lane", () => {
  const fixture = laneFixture({ status: "running" });
  try {
    const evidence = read(fixture);
    assert.equal(evidence.schema, NATIVE_LANE_EVIDENCE_SCHEMA);
    assert.equal(evidence.lanes.length, 1);
    assert.equal(evidence.lanes[0].state, "ACTIVE");
    assert.equal(evidence.lanes[0].inactiveEvidence, null);
    assert.equal(evidence.lanes[0].run.runId, runId);
    assert.equal(evidence.creationIntents.length, 0);
    assert.deepEqual(observedLanesFor(evidence, { runId: "workflow-op-v1-dag" }), [{
      runId: "workflow-op-v1-dag",
      issueId,
      laneRef,
      attempt: 1,
      state: "ACTIVE",
    }]);
  } finally {
    fixture.cleanup();
  }
});

test("a settled lane with a published completion is complete, not a fresh dispatch", () => {
  const fixture = laneFixture({ status: "completed", completion: completionNote() });
  try {
    const [lane] = read(fixture).lanes;
    assert.equal(lane.state, "RESUMABLE");
    assert.equal(lane.completion.proven, true);
    assert.equal(lane.completion.identity, "IC_kwDOTh5gv88AAAABVTiPTQ");
    assert.equal(lane.completion.candidate, candidate);
    assert.equal(lane.completion.reachableFromTopicBranch, true);
    assert.equal(lane.completion.reachableFromTarget, false);
    assert.equal(lane.candidate.candidate, candidate);
    // A settled lane is reused or read back; it is never a second lane for the same Issue attempt.
    assert.match(lane.evidence.join("\n"), /is settled and is never a fresh dispatch/u);
  } finally {
    fixture.cleanup();
  }
});

test("a settled lane without a completion publication stays UNKNOWN instead of inactive", () => {
  const fixture = laneFixture({ status: "completed" });
  try {
    const [lane] = read(fixture).lanes;
    assert.equal(lane.state, "UNKNOWN");
    assert.match(lane.evidence.join("\n"), /settled completed and Issue I_child publishes no completion/u);
    assert.match(lane.evidence.join("\n"), /never re-dispatched and never replaced/u);
  } finally {
    fixture.cleanup();
  }
});

test("a settled failed lane proves its inactivity with the exact native record", () => {
  const fixture = laneFixture({ status: "failed", failureKind: "exit-code" });
  try {
    const [lane] = read(fixture).lanes;
    assert.equal(lane.state, "INACTIVE");
    assert.deepEqual(lane.inactiveEvidence, [
      "Subagent run run_lane_1 records status failed.",
      "Subagent run run_lane_1 records failure kind exit-code.",
    ]);
    assert.equal(lane.run.terminal, true);
  } finally {
    fixture.cleanup();
  }
});

test("a recorded dispatch with no native run identity is an unresolved creation intent", () => {
  const fixture = laneFixture({ status: "running" });
  try {
    const evidence = read(fixture, [{ laneRef, issueId, attempt: 1, worktree }]);
    assert.deepEqual(evidence.lanes, []);
    assert.deepEqual(evidence.creationIntents.map(({ laneRef: ref, state, attempt }) => [ref, state, attempt]), [[laneRef, "RESERVED", 1]]);
    const [intent] = creationIntentsFor(evidence);
    assert.match(intent.evidence[0], /recorded for Issue I_child attempt 1 with no native subagent run identity/u);
    // The planner reads the lost launch response back as an unresolved intent, never as a new lane.
    const decision = planIssueLane({
      runId: "workflow-op-v1-dag",
      issueId,
      attempt: 1,
      observed: observedLanesFor(evidence, { runId: "workflow-op-v1-dag" }),
      creationIntent: intent,
      at: "2026-09-18T02:00:00.000Z",
    });
    assert.equal(decision.decision, "STOP");
    assert.equal(decision.stop.code, LANE_STOP_CODES.creationIntentUnresolved);
  } finally {
    fixture.cleanup();
  }
});

test("a lane identity that does not name its Issue and attempt is unattributed", () => {
  const fixture = laneFixture({ status: "running" });
  try {
    const evidence = read(fixture, [{ laneRef: "close_I_child", issueId, attempt: 1, runId }]);
    assert.deepEqual(evidence.unattributed, ["close_I_child"]);
    assert.equal(evidence.lanes[0].state, "UNKNOWN");
    assert.match(evidence.lanes[0].evidence.join("\n"), /does not name Issue I_child attempt 1/u);
  } finally {
    fixture.cleanup();
  }
});

test("a run record that binds another worktree proves no ownership", () => {
  const fixture = laneFixture({ status: "running", worktreePath: "/home/ron/code/skills-issue-lanes/issue-999" });
  try {
    const [lane] = read(fixture).lanes;
    assert.equal(lane.state, "UNKNOWN");
    assert.match(lane.evidence.join("\n"), /owns worktree .*issue-116, but native subagent run run_lane_1 reports .*issue-999/u);
  } finally {
    fixture.cleanup();
  }
});

test("a subagent run with an unreadable record proves no liveness", () => {
  const fixture = laneFixture({ status: "running" });
  try {
    const runsDir = `.pi/workflow-subagents/${runId}/task-1`;
    writeFileSync(join(fixture.homeDir, "checkout", runsDir, runId, "run.json"), "{ not json");
    const [lane] = read(fixture).lanes;
    assert.equal(lane.state, "UNKNOWN");
    assert.match(lane.evidence.join("\n"), /publishes no readable record/u);
  } finally {
    fixture.cleanup();
  }
});

test("a completion note that binds another Issue or names no candidate is not this lane's completion", () => {
  const other = laneFixture({ status: "completed", completion: completionNote({ issueId: "I_other" }) });
  const noCandidate = laneFixture({ status: "completed", completion: completionNote({ candidate: null }) });
  try {
    const [foreign] = read(other).lanes;
    assert.equal(foreign.state, "UNKNOWN");
    assert.match(foreign.evidence.join("\n"), /names a completion note for Issue I_other/u);
    const [candidateLess] = read(noCandidate).lanes;
    assert.equal(candidateLess.state, "UNKNOWN");
    assert.match(candidateLess.evidence.join("\n"), /names no candidate commit/u);
  } finally {
    other.cleanup();
    noCandidate.cleanup();
  }
});

test("a completion whose candidate Git cannot reach from the topic branch is unproven", () => {
  const fixture = laneFixture({ status: "completed", completion: completionNote(), git: { isAncestor: () => false } });
  try {
    const [lane] = read(fixture).lanes;
    assert.equal(lane.state, "UNKNOWN");
    assert.equal(lane.completion.proven, false);
    assert.match(lane.evidence.join("\n"), /no completion whose candidate is reachable from lane dispatch_I_child_1's recorded topic branch issue\/116-native-lane-runner/u);
  } finally {
    fixture.cleanup();
  }
});

test("two recorded lanes that share one native run record are named instead of resolved", () => {
  const fixture = laneFixture({ status: "running" });
  try {
    const evidence = read(fixture, [
      { laneRef, issueId, attempt: 1, runId, worktree },
      { laneRef: "dispatch_I_child_2", issueId, attempt: 2, runId, worktree },
    ]);
    assert.deepEqual(evidence.duplicateRunRecords, [runId]);
    assert.equal(evidence.lanes.length, 2);
  } finally {
    fixture.cleanup();
  }
});

test("the native reader reads only the exact paths it is given", () => {
  const fixture = laneFixture({ status: "running" });
  try {
    const paths = [];
    const evidence = readNativeLaneEvidence({
      lanes: [{ laneRef, issueId, attempt: 1, runId, worktree }],
      readRun: (lane) => readSubagentRunRecord({
        runId: lane.runId,
        runsRoot: fixture.runsRoot,
        readFile: (path) => {
          paths.push(path);
          return readFileSync(path, "utf8");
        },
      }),
      readIssue: fixture.readIssue,
      git: fixture.git,
      repository: fixture.repository,
      target,
    });
    assert.equal(evidence.lanes.length, 1);
    assert.deepEqual(paths.map((path) => path.split("/").at(-1)), [`${runId}.json`, "run.json"]);
    assert.ok(paths.every((path) => path.startsWith(fixture.homeDir)));
  } finally {
    fixture.cleanup();
  }
});

test("the native reader reaches no host run artifact and enumerates nothing", () => {
  const source = readFileSync(join(
    import.meta.dirname,
    "../../skills/personal/run-issue-workflow/scripts/native-lane-evidence.mjs",
  ), "utf8");
  // The retired lane evidence came from pi-workflow host run records under `.pi/workflows`. This reader
  // must never name one, and must never discover a source by listing a directory.
  assert.doesNotMatch(source, /\.pi\/workflows|workflowRootFor|host-runs/u);
  assert.doesNotMatch(source, /readdirSync|globSync|opendirSync/u);
  assert.match(source, /subagent-runs/u);
  for (const port of ["readRun", "readIssue", "git"]) {
    assert.match(source, new RegExp(port, "u"));
  }
});
