import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  HOST_ACTION_POLICY,
  HOST_LANE_AGENT,
  HOST_PLAN_SCHEMA,
  HOST_STOP_CODES,
  HOST_TOOL_CEILING,
  LANE_SKILLS,
  RUN_SUPERSEDED_EVENT,
  assertReissueOrder,
  convergeBlockedRun,
  hostActionIdentity,
  planHostActions,
  planHostRound,
  recordHostRunSupersession,
} from "../../skills/personal/run-issue-workflow/scripts/pi-workflow-host.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { reduceRun } from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";
import controller from "../../skills/personal/run-issue-workflow/workflows/deliver-tracker-spec/helpers/controller.mjs";
import {
  parseRoundInput,
  recordedFromRunRecord,
} from "../../skills/personal/run-issue-workflow/workflows/deliver-tracker-spec/helpers/round-input.mjs";

const bundle = resolve(
  import.meta.dirname,
  "../../skills/personal/run-issue-workflow/workflows/deliver-tracker-spec",
);
const preservedContractSkills = [
  "execute-issue",
  "close-issue",
  "to-spec",
  "to-tickets",
  "verify-target-before-push",
  "attest-target-contribution",
  "pre-execute-issue",
];

const node = (issueId, blockers = [], overrides = {}) => ({
  issueId,
  blockers,
  trackerState: "OPEN",
  taskState: "NONE",
  completionState: "NONE",
  candidateReachable: false,
  worktreeState: "ABSENT",
  ...overrides,
});

const grant = {
  schema: "dag-run-event:v1",
  sequence: 1,
  type: "grant.recorded",
  at: "2026-09-16T00:00:00.000Z",
  runIdentity: {
    runId: "run-12",
    specId: "12",
    approvedScopeHash: "sha256:scope-12",
    target: "features/ron",
    classification: "MULTI",
    decompositionIdentity: "decomposition:12:01-05",
  },
  maxParallel: 3,
};

const dispatchEvent = (issueId, attempt = 1, sequence = 2) => ({
  schema: "dag-run-event:v1",
  sequence,
  type: "dispatch.recorded",
  at: "2026-09-16T00:01:00.000Z",
  issueId,
  attempt,
  taskRef: { threadId: `thread-${issueId}`, hostId: "local" },
});

const facts = (nodes, journal = [grant]) => ({
  schema: "dag-run-facts:v1",
  run: {
    runId: "run-12",
    specId: "12",
    approvedScopeHash: "sha256:scope-12",
    target: "features/ron",
    classification: "MULTI",
    decompositionIdentity: "decomposition:12:01-05",
    reconciled: true,
    trackerAvailable: true,
    targetState: "CLEAN",
    targetHead: "a".repeat(40),
    closeWriterRunId: null,
    closeWriterState: "ABSENT",
    parentTrackerState: "OPEN",
    parentTrackerIdentity: "github-issue:12:version:1",
  },
  nodes,
  contradictions: [],
  journal,
});

const dispatchPlan = (issueId, attempt) => ({
  schema: "dag-run-status:v1",
  run: { runId: "run-12", specId: "12", target: "features/ron", state: "RUNNING", controlRevision: 0 },
  legalActions: [{ type: "dispatch_issue", issueId, attempt }],
  diagnoses: [],
});

const grantDraft = () => {
  const { schema, sequence, ...draft } = grant;
  return draft;
};

const taskPayload = (overrides = {}) => JSON.stringify({
  facts: facts([node("13"), node("14")]),
  ...overrides,
});

const fakeContext = (calls, task) => ({
  task,
  log: () => {},
  agent: async (request) => {
    calls.push(request);
    return { ok: true };
  },
});

test("the plan materializes exactly the reducer's actions, in order", () => {
  const input = facts([node("13"), node("14")]);
  const status = reduceRun(input);
  const round = planHostRound({ facts: input });
  assert.deepEqual(round.authorizedActions, ["dispatch_issue", "dispatch_issue"]);
  assert.deepEqual(round.materializations.map((item) => item.id), ["dispatch_13_1", "dispatch_14_1"]);
  assert.deepEqual(
    round.materializations.map((item) => ({ action: item.actionType, issueId: item.issueId, attempt: item.attempt })),
    status.legalActions.map((action) => ({ action: action.type, issueId: action.issueId, attempt: action.attempt })),
  );
  assert.equal(round.disposition, "DISPATCH");
  assert.equal(round.stop, null);
});

test("every generated agent lane stays inside the declared tool ceiling and contract skills", () => {
  for (const [actionType, policy] of Object.entries(HOST_ACTION_POLICY)) {
    assert.ok(actionType.length > 0);
    if (policy.kind !== "agent") continue;
    assert.equal(policy.agent, HOST_LANE_AGENT);
    assert.ok(preservedContractSkills.includes(policy.skill), `${policy.skill} is not a preserved contract skill`);
    for (const tool of policy.tools) {
      assert.ok(HOST_TOOL_CEILING.includes(tool), `${actionType} widened the ceiling with ${tool}`);
    }
  }
  assert.deepEqual([...LANE_SKILLS].sort(), ["close-issue", "execute-issue"]);
});

test("a contradictory action set stops the round instead of dispatching", () => {
  const input = facts([node("13", [], { trackerState: "CLOSED" })]);
  input.contradictions = [{
    code: "closed_without_node_success",
    evidence: ["Issue 13 is closed without candidate reachability and worktree absence."],
    affectedNodes: ["13"],
  }];
  const round = planHostRound({ facts: input });
  assert.equal(round.disposition, "BLOCKED");
  assert.equal(round.stop.code, HOST_STOP_CODES.contradictoryActionSet);
  assert.deepEqual(round.materializations, []);
  assert.ok(round.stop.diagnoses.some((item) => item.reasonCode === "evidence_contradiction"));
});

test("a coherent blocked run is reported as blocked and dispatches nothing", () => {
  const input = facts([
    node("13", [], { completionState: "BLOCKED", failure: { kind: "implement", evidence: ["published implementation_blocked"] } }),
  ]);
  const round = planHostRound({ facts: input });
  assert.equal(round.disposition, "BLOCKED");
  assert.equal(round.stop.code, HOST_STOP_CODES.blockedRun);
  assert.deepEqual(round.materializations, []);
  assert.ok(round.stop.diagnoses.some((item) => item.reasonCode === "implementation_blocked"));
});

test("an unavailable action set is idle, and an unsupported action stops the round", () => {
  const idle = planHostActions({
    schema: "dag-run-status:v1",
    run: { runId: "run-12", specId: "12", target: "features/ron", state: "RUNNING", controlRevision: 4 },
    legalActions: [],
    diagnoses: [],
  });
  assert.equal(idle.disposition, "IDLE");
  assert.equal(idle.stop, null);
  assert.deepEqual(idle.materializations, []);

  const unsupported = planHostActions({
    schema: "dag-run-status:v1",
    run: { runId: "run-12", specId: "12", target: "features/ron", state: "RUNNING", controlRevision: 4 },
    legalActions: [{ type: "rebalance_galaxy", issueId: "13" }],
    diagnoses: [],
  });
  assert.equal(unsupported.stop.code, HOST_STOP_CODES.unsupportedAction);
  assert.deepEqual(unsupported.materializations, []);

  assert.throws(() => planHostActions({ schema: "dag-run-status:v2", run: {}, legalActions: [] }), /dag-run-status:v1/u);
});

test("a host wait and the reconcile action are host operations, not generated workers", () => {
  const status = {
    schema: "dag-run-status:v1",
    run: { runId: "run-12", specId: "12", target: "features/ron", state: "RECONCILING", controlRevision: 0 },
    legalActions: [{ type: "reconcile_run" }, { type: "wait_repository_close_lease", issueId: "13", owner: { operationId: "close-op-1" } }],
    diagnoses: [],
  };
  const reconcile = planHostActions(status, { journal: [grant] });
  assert.deepEqual(reconcile.authorizedActions, ["reconcile_run", "wait_repository_close_lease"]);
  assert.deepEqual(reconcile.materializations.map((item) => [item.kind, item.operation]), [
    ["host", "reconcile_run"],
    ["host", "wait_repository_close_lease"],
  ]);
  assert.deepEqual(reconcile.materializations[0].tools, ["read", "ls"]);
  assert.equal(reconcile.materializations[1].tools, undefined);
});

test("dispatch attempts are refused unless the journal accounts for the previous attempt", () => {
  const unaccounted = planHostActions(dispatchPlan("13", 2), { journal: [grant] });
  assert.equal(unaccounted.stop.code, HOST_STOP_CODES.unaccountedDispatchAttempt);
  assert.deepEqual(unaccounted.materializations, []);

  const counted = planHostActions(dispatchPlan("13", 2), { journal: [grant, dispatchEvent("13", 1)] });
  assert.equal(counted.stop, null);
  assert.equal(counted.materializations[0].id, "dispatch_13_2");

  const beyondBudget = planHostActions(dispatchPlan("13", 4), {
    journal: [grant, dispatchEvent("13", 1), dispatchEvent("13", 2, 3), dispatchEvent("13", 3, 4)],
  });
  assert.equal(beyondBudget.stop.code, HOST_STOP_CODES.unaccountedDispatchAttempt);
});

test("re-issued host operations must keep their recorded order and request shape", () => {
  const plan = planHostActions(dispatchPlan("13", 1), { journal: [grant] });
  const item = plan.materializations[0];
  assert.equal(assertReissueOrder(plan, [{ id: item.id, requestIdentity: item.requestIdentity }]), null);
  assert.equal(assertReissueOrder(plan, [{ id: item.id, requestIdentity: null }]), null);

  const divergent = assertReissueOrder(plan, [{ id: item.id, requestIdentity: `sha256:${"a".repeat(64)}` }]);
  assert.equal(divergent.code, HOST_STOP_CODES.replayDivergence);

  const unissued = assertReissueOrder(plan, [{ id: "dispatch_99_1" }]);
  assert.equal(unissued.code, HOST_STOP_CODES.replayDivergence);
});

test("a settled host operation is never materialized a second time", () => {
  const plan = planHostActions(dispatchPlan("13", 1), { journal: [grant] });
  const item = plan.materializations[0];
  const duplicate = assertReissueOrder(plan, [{ id: item.id, requestIdentity: item.requestIdentity, outcome: "settled" }]);
  assert.equal(duplicate.code, HOST_STOP_CODES.duplicateDispatch);
});

test("host action identity is deterministic and names the exact operation", () => {
  assert.equal(hostActionIdentity({ type: "dispatch_issue", issueId: "13", attempt: 2 }), "dispatch_13_2");
  assert.equal(hostActionIdentity({ type: "close_issue", issueId: "13" }), "close_13");
  assert.equal(hostActionIdentity({ type: "close_parent", issueId: "12" }), "close_parent_12");
  assert.throws(() => hostActionIdentity({ type: "dispatch_issue", issueId: "13", attempt: 0 }), /positive attempt/u);
  assert.throws(() => hostActionIdentity({ type: "unknown_action", issueId: "13" }), /Unsupported reducer action/u);
});

test("blocked-run convergence continues a replayable host run", () => {
  const input = facts([node("13", [], { taskState: "DISPATCHED" })], [grant, dispatchEvent("13", 1)]);
  const convergence = convergeBlockedRun({
    facts: input,
    hostRun: {
      runId: "host-1",
      state: "RUNNING",
      dynamicDisposition: "REPLAYABLE",
      generatedTaskIds: ["delivery.dispatch_13_1"],
    },
  });
  assert.equal(convergence.decision, "CONTINUE_SAME_RUN");
  assert.equal(convergence.journalEvent, null);
  assert.equal(convergence.supersession, null);
});

test("blocked-run convergence journals one superseding host run without re-dispatching", () => {
  const input = facts([node("13", [], { taskState: "DISPATCHED" })], [grant, dispatchEvent("13", 1)]);
  const convergence = convergeBlockedRun({
    facts: input,
    hostRun: {
      runId: "host-1",
      state: "FAILED",
      dynamicDisposition: "DIVERGED",
      generatedTaskIds: ["delivery.dispatch_13_1"],
    },
    at: "2026-09-16T01:00:00.000Z",
  });
  assert.equal(convergence.decision, "NEW_RUN");
  assert.equal(convergence.supersession.supersededRunId, "host-1");
  assert.deepEqual(convergence.journalEvent, {
    type: RUN_SUPERSEDED_EVENT,
    at: "2026-09-16T01:00:00.000Z",
    supersededRunId: "host-1",
    reason: "DYNAMIC_REPLAY_DIVERGED",
    evidence: convergence.journalEvent.evidence,
  });

  const gitCommonDir = mkdtempSync(join(tmpdir(), "piwf-host-journal-"));
  try {
    const store = createRunStore({ gitCommonDir });
    const writer = store.acquireWriter("run-12");
    try {
      writer.append(grantDraft());
    } finally {
      writer.release();
    }
    const recorded = recordHostRunSupersession({
      gitCommonDir,
      runId: "run-12",
      event: convergence.journalEvent,
    });
    assert.equal(recorded.type, RUN_SUPERSEDED_EVENT);
    assert.equal(recorded.sequence, 2);
    const events = readFileSync(join(gitCommonDir, "matt-workflow-control", "runs", "run-12", "events.jsonl"), "utf8")
      .trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.type), ["grant.recorded", RUN_SUPERSEDED_EVENT]);
    assert.equal(events[1].supersededRunId, "host-1");
  } finally {
    rmSync(gitCommonDir, { recursive: true, force: true });
  }
});

test("an unaccounted dispatch blocks a superseding host run", () => {
  const input = facts([node("13")]);
  const convergence = convergeBlockedRun({
    facts: input,
    hostRun: {
      runId: "host-1",
      state: "FAILED",
      dynamicDisposition: "UNKNOWN",
      generatedTaskIds: ["delivery.dispatch_13_1"],
    },
    at: "2026-09-16T01:00:00.000Z",
  });
  assert.equal(convergence.decision, "STOP");
  assert.equal(convergence.reason, HOST_STOP_CODES.unaccountedDispatchAttempt);
  assert.equal(convergence.journalEvent, null);
});

test("convergence refuses to escape contradictory evidence and no-ops on a terminal host run", () => {
  const contradictory = facts([node("13")]);
  contradictory.contradictions = [{
    code: "reachable_without_completion",
    evidence: ["Issue 13 candidate is reachable without completion-note authority."],
    affectedNodes: ["13"],
  }];
  const stopped = convergeBlockedRun({
    facts: contradictory,
    hostRun: { runId: "host-1", state: "BLOCKED", dynamicDisposition: "DIVERGED", generatedTaskIds: [] },
    at: "2026-09-16T01:00:00.000Z",
  });
  assert.equal(stopped.decision, "STOP");
  assert.equal(stopped.reason, HOST_STOP_CODES.contradictoryActionSet);

  const terminal = convergeBlockedRun({
    facts: facts([node("13")]),
    hostRun: { runId: "host-1", state: "SUCCEEDED", dynamicDisposition: "REPLAYABLE", generatedTaskIds: [] },
  });
  assert.equal(terminal.decision, "NO_ACTION");
});

test("the controller materializes only the planned actions", async () => {
  const calls = [];
  const result = await controller(fakeContext(calls, taskPayload()));
  assert.deepEqual(calls.map((call) => call.id), ["dispatch_13_1", "dispatch_14_1"]);
  assert.deepEqual(calls.map((call) => call.agent), [HOST_LANE_AGENT, HOST_LANE_AGENT]);
  for (const call of calls) {
    for (const tool of call.tools) assert.ok(HOST_TOOL_CEILING.includes(tool));
  }
  assert.deepEqual(result.control.generatedTaskIds, ["dispatch_13_1", "dispatch_14_1"]);
  assert.equal(result.control.status, "dispatched");
});

test("the controller dispatches nothing when the round is refused", async () => {
  const input = facts([node("13")]);
  input.contradictions = [{
    code: "closed_without_node_success",
    evidence: ["Issue 13 is closed without candidate reachability and worktree absence."],
    affectedNodes: ["13"],
  }];
  const calls = [];
  const result = await controller(fakeContext(calls, JSON.stringify({ facts: input })));
  assert.deepEqual(calls, []);
  assert.equal(result.control.status, "blocked");
  assert.equal(result.control.stopCode, HOST_STOP_CODES.contradictoryActionSet);
  assert.deepEqual(result.control.generatedTaskIds, []);
});

test("the controller refuses a divergent re-issue before generating work", async () => {
  const calls = [];
  const result = await controller(fakeContext(calls, taskPayload({
    recorded: [{ id: "dispatch_13_1", requestIdentity: `sha256:${"b".repeat(64)}` }],
  })));
  assert.deepEqual(calls, []);
  assert.equal(result.control.stopCode, HOST_STOP_CODES.replayDivergence);
});

test("the controller journals a superseding host run without dispatching", async () => {
  const gitCommonDir = mkdtempSync(join(tmpdir(), "piwf-host-controller-"));
  try {
    const store = createRunStore({ gitCommonDir });
    const writer = store.acquireWriter("run-12");
    try {
      writer.append(grantDraft());
    } finally {
      writer.release();
    }
    const calls = [];
    const result = await controller(fakeContext(calls, JSON.stringify({
      facts: facts([node("13", [], { taskState: "DISPATCHED" })], [grant, dispatchEvent("13", 1)]),
      blockedHostRun: {
        runId: "host-1",
        state: "FAILED",
        dynamicDisposition: "DIVERGED",
        generatedTaskIds: ["delivery.dispatch_13_1"],
      },
      gitCommonDir,
      at: "2026-09-16T01:00:00.000Z",
    })));
    assert.deepEqual(calls, []);
    assert.equal(result.control.status, "superseded");
    assert.equal(result.control.decision, "NEW_RUN");
    assert.equal(result.control.supersessionSequence, 2);
  } finally {
    rmSync(gitCommonDir, { recursive: true, force: true });
  }
});

test("the round reader accepts an explicit file indirection and refuses a malformed round", () => {
  const directory = mkdtempSync(join(tmpdir(), "piwf-host-round-"));
  try {
    const path = join(directory, "round.json");
    writeFileSync(path, JSON.stringify({ facts: facts([node("13")]), recorded: [{ id: "close_13" }] }));
    const parsed = parseRoundInput(JSON.stringify({ inputPath: path, stageId: "delivery" }));
    assert.equal(parsed.facts.run.specId, "12");
    assert.deepEqual(parsed.recorded, [{ id: "close_13" }]);
    assert.equal(parsed.stageId, "delivery");

    assert.throws(() => parseRoundInput("not json"), /not one JSON object/u);
    assert.throws(() => parseRoundInput(JSON.stringify({ facts: { schema: "dag-run-facts:v2" } })), /dag-run-facts:v1/u);
    assert.throws(
      () => parseRoundInput(JSON.stringify({ facts: facts([node("13")]), blockedHostRun: "host-1" })),
      /blockedHostRun must be one host run record/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("recorded host operations are read back from the run record in order", () => {
  const runJson = {
    tasks: [
      { specId: "delivery.dispatch_13_1", status: "completed", requestHash: "a".repeat(64) },
      { specId: "delivery.close_13", status: "running" },
      { specId: "other.task", status: "completed" },
    ],
  };
  assert.deepEqual(recordedFromRunRecord(runJson, "delivery"), [
    { id: "dispatch_13_1", requestIdentity: `sha256:${"a".repeat(64)}`, outcome: "settled" },
    { id: "close_13", requestIdentity: null, outcome: "recorded" },
  ]);
  assert.deepEqual(recordedFromRunRecord({}, "delivery"), []);
});

test("the bundle keeps every declared reference bundle-local and declares its ceiling", () => {
  const spec = JSON.parse(readFileSync(join(bundle, "spec.json"), "utf8"));
  assert.equal(spec.schemaVersion, 1);
  assert.equal(spec.name, "deliver-tracker-spec");
  assert.deepEqual(spec.defaults.tools, [...HOST_TOOL_CEILING]);
  assert.equal(spec.defaults.readOnly, false);
  const stages = spec.artifactGraph.stages;
  assert.equal(stages.length, 1);
  const [stage] = stages;
  assert.equal(stage.type, "dynamic");
  assert.match(stage.dynamic.uses, /^\.\//u);
  assert.equal(stage.dynamic.mode, "graph-splice");
  assert.equal(stage.dynamic.budget.maxConcurrency, 3);
  assert.equal(stage.dynamic.helpers, undefined);
  assert.equal(stage.dynamic.workflows, undefined);
  assert.ok(existsSync(join(bundle, stage.dynamic.uses.replace(/^\.\//u, ""))));
  for (const output of Object.keys(stage.output)) assert.ok(["analysis", "refs"].includes(output));
});
