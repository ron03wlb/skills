import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { planNativeCoordinatorStep, runNativeCoordinatorCli } from "../../skills/personal/run-issue-workflow/scripts/native-coordinator-step.mjs";
import { publishLanePointer, readLanePointer } from "../../skills/personal/run-issue-workflow/scripts/native-lane-launch.mjs";

const lane = (fields = {}) => ({
  id: "dispatch_I_1_1",
  laneRef: "dispatch_I_1_1",
  issueId: "I_1",
  actionType: "dispatch_issue",
  skill: "execute-issue",
  agent: "worker",
  tools: ["read", "bash"],
  worktreePolicy: "on",
  attempt: 1,
  decision: "CREATE",
  launch: {
    prompt: "Use $execute-issue.\nStanding rules for this lane:\n- Read the repository.",
    requestIdentity: "request-1",
  },
  ...fields,
});
const started = (plan) => ({ outcome: "READY", runId: "workflow-op-v1:run", plan: {
  disposition: "DISPATCH",
  reservations: [{ type: "dispatch.recorded", issueId: "I_1" }],
  closeIntents: [],
  lanes: [],
  readBacks: [],
  waits: [],
  hostOperations: [],
  stop: null,
  ...plan,
} });

test("the stateless stepper journals reservations before returning a create action", () => {
  const appended = [];
  const result = planNativeCoordinatorStep({
    started: started({ lanes: [lane()] }),
    append: (event) => appended.push(event),
    readPointer: () => null,
    artifactRefs: { round: "/tmp/round.json" },
  });
  assert.equal(result.schema, "native-coordinator-step:v1");
  assert.equal(result.outcome, "ACTION_REQUIRED");
  assert.deepEqual(appended, [{ type: "dispatch.recorded", issueId: "I_1" }]);
  assert.equal(result.actions.length, 1);
  assert.deepEqual(result.actions[0].nativeGeneration, { generation: 1, previousNativeRunId: null });
  assert.equal(result.actions[0].type, "create_lane");
  assert.match(result.actions[0].id, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(result.artifactRefs, { round: "/tmp/round.json" });
});

test("one coordinator step durably appends reservations and close intents in one writer call", () => {
  const batches = [];
  const result = planNativeCoordinatorStep({
    started: started({
      lanes: [lane()],
      closeIntents: [{ type: "delivery.progressed", issueId: "I_1" }],
    }),
    appendAll: (events) => batches.push(events),
    readPointer: () => null,
  });
  assert.equal(result.actions[0].type, "create_lane");
  assert.deepEqual(batches, [[
    { type: "dispatch.recorded", issueId: "I_1" },
    { type: "delivery.progressed", issueId: "I_1" },
  ]]);
});

test("complete preflight failures append no authority events", () => {
  const cases = [
    {
      name: "malformed pointer",
      plan: { lanes: [lane()] },
      readPointer: () => { throw new Error("malformed pointer"); },
      pattern: /malformed pointer/u,
    },
    {
      name: "missing resume pointer",
      plan: { lanes: [lane({ actionType: "repair_issue", decision: "RESUME" })] },
      readPointer: () => null,
      pattern: /no bound native generation/u,
    },
    {
      name: "invalid tools on a later lane",
      plan: { lanes: [lane(), lane({ id: "dispatch_I_2_1", laneRef: "dispatch_I_2_1", issueId: "I_2", tools: [] })] },
      readPointer: () => null,
      pattern: /tools/u,
    },
    {
      name: "duplicate action identity",
      plan: { lanes: [lane(), lane()] },
      readPointer: () => null,
      pattern: /identities are not unique/u,
    },
    {
      name: "oversized compact output",
      plan: {
        lanes: [],
        readBacks: Array.from({ length: 100 }, (_, index) => ({
          id: `observe-${index}`,
          laneRef: `lane-${index}-${"x".repeat(80)}`,
          issueId: `I_${index}`,
          decision: "READ_BACK",
        })),
      },
      readPointer: () => null,
      pattern: /exceeds 16384 bytes/u,
    },
  ];

  for (const item of cases) {
    const appended = [];
    assert.throws(() => planNativeCoordinatorStep({
      started: started(item.plan),
      appendAll: (events) => appended.push(...events),
      readPointer: item.readPointer,
    }), item.pattern, item.name);
    assert.deepEqual(appended, [], item.name);
  }
});

test("an oversized prompt blocks before its reservation is journaled", () => {
  const appended = [];
  const candidate = lane();
  const result = planNativeCoordinatorStep({
    started: started({
      lanes: [lane({ launch: { ...candidate.launch, prompt: "x".repeat(4097) } })],
    }),
    append: (event) => appended.push(event),
    readPointer: () => null,
  });
  assert.equal(result.outcome, "BLOCKED");
  assert.equal(result.stop.code, "native_action_prompt_too_large");
  assert.deepEqual(result.actions, []);
  assert.deepEqual(appended, []);
});

test("missing and non-string prompts block before their reservations are journaled", () => {
  for (const prompt of [undefined, { text: "not a prompt" }]) {
    const appended = [];
    const candidate = lane();
    const result = planNativeCoordinatorStep({
      started: started({ lanes: [lane({ launch: { ...candidate.launch, prompt } })] }),
      append: (event) => appended.push(event),
      readPointer: () => null,
    });
    assert.equal(result.outcome, "BLOCKED");
    assert.equal(result.stop.code, "native_action_prompt_invalid");
    assert.deepEqual(result.actions, []);
    assert.deepEqual(appended, []);
  }
});

test("conflicting top-level and legacy plan Run identities fail closed", () => {
  const input = started({ runId: "workflow-op-v1:other", lanes: [lane()] });
  const result = planNativeCoordinatorStep({ started: input, readPointer: () => null });
  assert.equal(result.outcome, "BLOCKED");
  assert.equal(result.stop.code, "native_step_input_unavailable");
  assert.deepEqual(result.actions, []);
});

test("present malformed Run identities fail closed", () => {
  for (const input of [
    { ...started({ lanes: [lane()] }), runId: 42 },
    started({ runId: 42, lanes: [lane()] }),
  ]) {
    const result = planNativeCoordinatorStep({ started: input, readPointer: () => null });
    assert.equal(result.outcome, "BLOCKED");
    assert.equal(result.stop.code, "native_step_input_unavailable");
    assert.deepEqual(result.actions, []);
  }
});

test("the coordinator CLI writes no artifact for conflicting Run identities", async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "native-coordinator-conflict-")));
  const artifact = join(root, "round.json");
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await assert.rejects(
    runNativeCoordinatorCli(["step", "186", "--cwd", root, "--artifact", artifact], {
      start: async () => ({ runId: "workflow-op-v1:run", plan: { runId: "workflow-op-v1:other" } }),
    }),
    /no validated Run identity/u,
  );
  assert.equal(existsSync(artifact), false);
});

test("same-lane recovery resumes the exact latest native generation", () => {
  const result = planNativeCoordinatorStep({
    started: started({ lanes: [lane({ actionType: "repair_issue", decision: "LAUNCH" })], reservations: [] }),
    readPointer: () => ({ latest: { generation: 2, nativeRunId: "native-2" } }),
  });
  assert.equal(result.actions[0].type, "resume_lane");
  assert.deepEqual(result.actions[0].nativeGeneration, { generation: 3, previousNativeRunId: "native-2" });
});

test("observe, wait, control, terminal and blocked plans map without model calls", () => {
  const observing = planNativeCoordinatorStep({
    started: started({ readBacks: [{ id: "observe-1", laneRef: "lane-1", issueId: "I_1", decision: "READ_BACK" }], reservations: [] }),
  });
  assert.equal(observing.outcome, "OBSERVING");
  assert.equal(observing.actions[0].type, "observe_lane");
  const waits = planNativeCoordinatorStep({ started: started({ waits: [{ id: "wait-1", issueId: "I_1", execution: "wait" }], reservations: [] }) });
  assert.equal(waits.actions[0].type, "wait_owner");
  const control = planNativeCoordinatorStep({ started: started({ hostOperations: [{ id: "settle_stop", actionType: "settle_stop" }], reservations: [] }) });
  assert.equal(control.actions[0].type, "settle_control");
  assert.equal(planNativeCoordinatorStep({ started: started({ disposition: "TERMINAL", reservations: [] }) }).outcome, "TERMINAL");
  assert.equal(planNativeCoordinatorStep({ started: started({ disposition: "BLOCKED", stop: { code: "x" }, reservations: [] }) }).outcome, "BLOCKED");
});

test("v2 lane pointers append an exact generation chain and reject conflicts", () => {
  const files = new Map();
  const exists = (path) => files.has(path);
  const readFile = (path) => files.get(path);
  const writeFile = (path, value) => {
    if (files.has(path)) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" });
    files.set(path, value);
  };
  const replaceFile = (from, to) => {
    files.set(to, files.get(from));
    files.delete(from);
  };
  const options = { runsRoot: "/runs", laneRef: "lane-1", cwd: "/repo", runsDir: "/native", recordDir: "native-1",
    exists, readFile, writeFile, replaceFile, makeDirectory: () => {} };
  const first = publishLanePointer({ ...options, nativeRunId: "native-1", generation: 1, previousNativeRunId: null, at: "2026-09-19T00:00:00.000Z" });
  assert.equal(first.pointer.schema, "native-lane-pointer:v2");
  assert.equal(first.pointer.generations.length, 1);
  assert.equal(publishLanePointer({ ...options, nativeRunId: "native-1", generation: 1, previousNativeRunId: null, at: "2026-09-19T00:00:00.000Z" }).reused, true);
  const second = publishLanePointer({ ...options, nativeRunId: "native-2", generation: 2, previousNativeRunId: "native-1", recordDir: "native-2", at: "2026-09-19T00:01:00.000Z" });
  assert.deepEqual(second.pointer.generations.map(({ nativeRunId }) => nativeRunId), ["native-1", "native-2"]);
  assert.equal(readLanePointer({ ...options }).latest.nativeRunId, "native-2");
  assert.throws(() => publishLanePointer({ ...options, nativeRunId: "native-3", generation: 4, previousNativeRunId: "native-2", at: "2026-09-19T00:02:00.000Z" }), /discontinuous/u);
  assert.throws(() => publishLanePointer({ ...options, nativeRunId: "native-3", generation: 3, previousNativeRunId: "wrong", at: "2026-09-19T00:02:00.000Z" }), /exact previous native run id/u);
});
