import assert from "node:assert/strict";
import test from "node:test";
import { runBatch } from "../../skills/personal/run-issue-workflow/scripts/run-batch.mjs";

test("selected Specs take turns, share worker capacity, and keep blocked and close-only lanes independent", async () => {
  const starts = [];
  let workers = 0;
  let maximum = 0;
  let ticks = 0;
  const lanes = ["a", "b"].map(specId => {
    let completed = 0;
    let active = false;
    return { specId, async run({ mode, executionSlots }) {
      if (mode === "step") {
        assert.ok(executionSlots > 0);
        assert.equal(active, false);
        starts.push(specId);
        active = true; workers += 1; maximum = Math.max(maximum, workers);
      } else if (active && ticks % 2 === 1) { active = false; workers -= 1; completed += 1; }
      return { run: { specId, runId: `run-${specId}`, state: completed === 2 ? "SUCCEEDED" : "RUNNING" },
        nodes: [{ task: { state: active ? "EXECUTING" : "NONE" } }],
        legalActions: !active && completed < 2 ? [{ type: "dispatch_issue" }] : [] };
    } };
  });
  lanes.push({ specId: "blocked", async run({ mode }) { assert.equal(mode, "snapshot"); return { run: { state: "BLOCKED" }, nodes: [], legalActions: [] }; } });
  const result = await runBatch({ lanes, maxWorkers: 1, sleep: async () => { ticks += 1; } });
  assert.deepEqual(starts, ["a", "b", "a", "b"]);
  assert.equal(maximum, 1);
  assert.equal(result.runs.filter(status => status.run.state === "SUCCEEDED").length, 2);
});

test("restart observes every selected existing worker before any new dispatch", async () => {
  const trace = [];
  let running = true;
  let created = false;
  const result = await runBatch({ maxWorkers: 1, connected: () => !created,
    lanes: [
      { specId: "ready", async run({ mode, executionSlots }) { trace.push(`ready:${mode}`); if (mode === "step") { assert.equal(running, false); assert.equal(executionSlots, 1); created = true; } return { run: { state: "RUNNING" }, nodes: [], legalActions: [{ type: "dispatch_issue" }] }; } },
      { specId: "existing", async run() { trace.push("existing:read"); return { run: { state: running ? "RUNNING" : "SUCCEEDED" }, nodes: [{ task: { state: running ? "EXECUTING" : "NONE" } }], legalActions: [] }; } },
    ], sleep: async () => { running = false; },
  });
  assert.ok(trace.indexOf("existing:read") < trace.indexOf("ready:step"));
  assert.equal(result.state, "PRESERVED");
});

test("DISPATCHED workers and unavailable activity reserve the shared capacity", async () => {
  for (const unavailable of [false, true]) {
    let connected = true;
    let attempted = 0;
    await runBatch({ maxWorkers: 1, connected: () => connected,
      lanes: [
        { specId: "existing", run: async () => unavailable
          ? { run: { state: "UNAVAILABLE" }, capacityUnknown: true, nodes: [], legalActions: [] }
          : { run: { state: "RUNNING" }, nodes: [{ task: { state: "DISPATCHED" } }], legalActions: [] } },
        { specId: "ready", async run({ mode }) { if (mode === "step") attempted++; return { run: { state: "RUNNING" }, nodes: [], legalActions: [{ type: "dispatch_issue" }] }; } },
      ], sleep: async () => { connected = false; },
    });
    assert.equal(attempted, 0, "unread activity cannot become an empty worker slot");
  }
});
