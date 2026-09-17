// The pi-workflow substrate owns lane evidence: a Run's own host run records are the only proof that a
// lane was materialized, and the only proof that a recorded dispatch attempt was never delivered.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  HOST_LANE_EVIDENCE_SCHEMA,
  createHostTaskReader,
  observedLanesFor,
  readHostLaneEvidence,
  workflowRootFor,
} from "../../skills/personal/run-issue-workflow/workflows/deliver-tracker-spec/helpers/host-runs.mjs";

const specId = "I_spec";
const target = "main";
const stageId = "delivery";
const laneId = "dispatch_I_child_1";
const taskSpecId = `${stageId}.${laneId}`;

const roundTask = (boundSpecId, boundTarget) => JSON.stringify({
  facts: { schema: "dag-run-facts:v1", run: { specId: boundSpecId, target: boundTarget } },
});

const project = ({ runs }) => {
  const directory = mkdtempSync(join(tmpdir(), "host-lane-"));
  const workflowRoot = workflowRootFor(directory);
  for (const run of runs) {
    const runDirectory = join(workflowRoot, run.runId);
    mkdirSync(runDirectory, { recursive: true });
    writeFileSync(join(runDirectory, "run.json"), JSON.stringify({
      id: run.runId,
      status: run.status,
      task: roundTask(run.specId ?? specId, run.target ?? target),
      tasks: run.tasks,
    }));
  }
  return { directory, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
};

const task = (status, overrides = {}) => ({ specId: taskSpecId, status, ...overrides });

test("a live pi-workflow task is an active executing lane", () => {
  const fixture = project({ runs: [{ runId: "run-1", status: "running", tasks: [task("running")] }] });
  try {
    const evidence = readHostLaneEvidence({ cwd: fixture.directory, specId, target, stageId });
    assert.equal(evidence.schema, HOST_LANE_EVIDENCE_SCHEMA);
    assert.equal(evidence.lanes.length, 1);
    assert.equal(evidence.lanes[0].laneState, "ACTIVE");
    assert.equal(evidence.lanes[0].taskState, "RUNNING");
    assert.equal(evidence.lanes[0].inactiveEvidence, null);
    const reader = createHostTaskReader({ cwd: fixture.directory, specId, target, stageId });
    assert.deepEqual(reader.read({ threadId: laneId, hostId: "pi-subagents" }).state, "RUNNING");
  } finally {
    fixture.cleanup();
  }
});

test("a settled native terminal stays the same lane instead of becoming a fresh dispatch", () => {
  const fixture = project({ runs: [{ runId: "run-1", status: "failed", tasks: [task("completed")] }] });
  try {
    const evidence = readHostLaneEvidence({ cwd: fixture.directory, specId, target, stageId });
    // No lane observation: the planner must never treat a published-outcome gap as a new lane.
    assert.deepEqual(evidence.lanes[0].laneState, null);
    const reader = createHostTaskReader({ cwd: fixture.directory, specId, target, stageId });
    assert.equal(reader.read({ threadId: laneId }).state, "DISPATCHED");
  } finally {
    fixture.cleanup();
  }
});

test("a settled-failed lane proves its inactivity with the exact host record", () => {
  const fixture = project({
    runs: [{ runId: "run-9", status: "failed", tasks: [task("failed", { statusDetail: "lane exited 1" })] }],
  });
  try {
    const [lane] = readHostLaneEvidence({ cwd: fixture.directory, specId, target, stageId }).lanes;
    assert.equal(lane.laneState, "INACTIVE");
    assert.equal(lane.taskState, "TRANSIENT_FAILURE");
    assert.deepEqual(lane.inactiveEvidence, [`Host run run-9 task ${taskSpecId} settled with status failed`, "lane exited 1"]);
  } finally {
    fixture.cleanup();
  }
});

test("a lane no host run ever materialized reads as absent", () => {
  const fixture = project({
    runs: [
      { runId: "run-1", status: "failed", tasks: [{ specId: `${stageId}.controller`, status: "failed" }] },
      { runId: "run-2", status: "completed", tasks: [] },
    ],
  });
  try {
    assert.deepEqual(readHostLaneEvidence({ cwd: fixture.directory, specId, target, stageId }).lanes, []);
    const reader = createHostTaskReader({ cwd: fixture.directory, specId, target, stageId });
    assert.equal(reader.read({ threadId: laneId, hostId: "pi-subagents" }), null);
  } finally {
    fixture.cleanup();
  }
});

test("lane evidence binds the selected Spec and target and ignores foreign runs", () => {
  const fixture = project({
    runs: [
      { runId: "run-other-spec", status: "running", specId: "I_other", tasks: [task("running")] },
      { runId: "run-other-target", status: "running", target: "other", tasks: [task("running")] },
      { runId: "run-foreign-stage", status: "running", tasks: [{ specId: "closeout.dispatch_I_child_1", status: "running" }] },
      { runId: "run-mine", status: "running", tasks: [task("pending")] },
    ],
  });
  try {
    const evidence = readHostLaneEvidence({ cwd: fixture.directory, specId, target, stageId });
    assert.deepEqual(evidence.lanes.map(({ hostRunId, laneState }) => [hostRunId, laneState]), [["run-mine", "RESUMABLE"]]);
  } finally {
    fixture.cleanup();
  }
});

test("observed lanes bind the logical DAG Run and refuse to guess an unattributable lane", () => {
  const fixture = project({
    runs: [{
      runId: "run-1",
      status: "running",
      tasks: [task("running"), { specId: `${stageId}.close_I_child`, status: "running" }],
    }],
  });
  try {
    const evidence = readHostLaneEvidence({ cwd: fixture.directory, specId, target, stageId });
    assert.deepEqual(evidence.unattributed, ["close_I_child"]);
    assert.deepEqual(observedLanesFor(evidence, { runId: "run-abc" }), [{
      runId: "run-abc",
      issueId: "I_child",
      laneRef: laneId,
      attempt: 1,
      state: "ACTIVE",
    }]);
    assert.throws(() => observedLanesFor(evidence, {}), /DAG Run id/u);
  } finally {
    fixture.cleanup();
  }
});

test("an unreadable run record stays visible instead of being dropped", () => {
  const fixture = project({ runs: [{ runId: "run-broken", status: "running", tasks: [] }] });
  try {
    writeFileSync(join(workflowRootFor(fixture.directory), "run-broken", "run.json"), "{ not json");
    const evidence = readHostLaneEvidence({ cwd: fixture.directory, specId, target, stageId });
    assert.deepEqual(evidence.lanes, []);
  } finally {
    fixture.cleanup();
  }
});
