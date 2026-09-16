import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  LANE_AGENT_NAME,
  LANE_SKILL_SCOPE,
  LANE_STOP_CODES,
  LANE_TOOL_CEILING,
  LANE_WORKTREE_POLICY,
  assertLanePromptScope,
  assertLaneTools,
  laneTaskRef,
  planIssueLane,
} from "../../skills/personal/run-issue-workflow/scripts/issue-lane.mjs";
import {
  HOST_ACTION_POLICY,
  HOST_LANE_AGENT,
  HOST_TOOL_CEILING,
  HOST_STOP_CODES,
  assertReissueOrder,
  planHostActions,
} from "../../skills/personal/run-issue-workflow/scripts/pi-workflow-host.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import controller from "../../skills/personal/run-issue-workflow/workflows/deliver-tracker-spec/helpers/controller.mjs";
import {
  parseAgentTools,
  resolveLaneAgent,
} from "../../skills/personal/run-issue-workflow/workflows/deliver-tracker-spec/helpers/lane-agent.mjs";

const runId = "run-12";
const issueId = "13";
const lane = (overrides = {}) => ({
  runId,
  issueId,
  laneRef: "dispatch_13_1",
  attempt: 1,
  state: "RESUMABLE",
  ...overrides,
});

const laneProject = ({ project = true, user = false } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "piwf-lane-"));
  const homeDir = join(directory, "home");
  mkdirSync(homeDir, { recursive: true });
  const definition = "---\nname: worker\ntools: read, grep, find, ls, bash, edit, write\nreadOnly: false\n---\n\nLane worker.\n";
  if (project) {
    mkdirSync(join(directory, ".pi", "agents"), { recursive: true });
    writeFileSync(join(directory, ".pi", "agents", "worker.md"), definition);
  }
  if (user) {
    mkdirSync(join(homeDir, ".pi", "agent", "agents"), { recursive: true });
    writeFileSync(join(homeDir, ".pi", "agent", "agents", "worker.md"), definition);
  }
  return { directory, homeDir, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
};

const facts = (nodes, journal) => ({
  schema: "dag-run-facts:v1",
  run: {
    runId,
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

const grant = {
  schema: "dag-run-event:v1",
  sequence: 1,
  type: "grant.recorded",
  at: "2026-09-16T00:00:00.000Z",
  runIdentity: {
    runId,
    specId: "12",
    approvedScopeHash: "sha256:scope-12",
    target: "features/ron",
    classification: "MULTI",
    decompositionIdentity: "decomposition:12:01-05",
  },
  maxParallel: 3,
};

const readyNode = (id) => ({
  issueId: id,
  blockers: [],
  trackerState: "OPEN",
  taskState: "NONE",
  completionState: "NONE",
  candidateReachable: false,
  worktreeState: "ABSENT",
});

const grantDraft = () => {
  const { schema, sequence, ...draft } = grant;
  return draft;
};

const dispatchRecordDraft = (attempt = 1, laneRef = "dispatch_13_1") => {
  const { schema, sequence, ...draft } = dispatchDraft(attempt, laneRef);
  return draft;
};

// One authority journal seeded with the Run's grant, and optionally the original dispatch.
const journalWith = (...drafts) => {
  const gitCommonDir = mkdtempSync(join(tmpdir(), "piwf-lane-journal-"));
  const store = createRunStore({ gitCommonDir });
  const writer = store.acquireWriter(runId);
  try {
    writer.append(grantDraft());
    for (const draft of drafts) writer.append(draft);
  } finally {
    writer.release();
  }
  return { gitCommonDir, cleanup: () => rmSync(gitCommonDir, { recursive: true, force: true }) };
};

const dispatchDraft = (attempt = 1, laneRef = "dispatch_13_1") => ({
  schema: "dag-run-event:v1",
  sequence: 2,
  type: "dispatch.recorded",
  at: "2026-09-16T00:01:00.000Z",
  issueId,
  attempt,
  taskRef: laneTaskRef(laneRef),
});

const fakeContext = (calls, task) => ({
  task,
  log: () => {},
  agent: async (request) => {
    calls.push(request);
    return { ok: true };
  },
  parallel: async (thunks) => {
    const settled = [];
    for (const thunk of thunks) settled.push(await thunk());
    return settled;
  },
});

test("one lane per Issue: a fresh Issue creates exactly one lane", () => {
  const decision = planIssueLane({ runId, issueId, attempt: 1 });
  assert.equal(decision.decision, "CREATE");
  assert.equal(decision.laneRef, null);
  assert.equal(decision.stop, null);
  assert.equal(decision.worktreePolicy, LANE_WORKTREE_POLICY);
});

test("a reserved creation intent whose lane is unproven is never re-created", () => {
  const unresolved = planIssueLane({
    runId,
    issueId,
    attempt: 1,
    creationIntent: { runId, issueId, attempt: 1, state: "RESERVED" },
  });
  assert.equal(unresolved.decision, "STOP");
  assert.equal(unresolved.stop.code, LANE_STOP_CODES.creationIntentUnresolved);
  assert.deepEqual(unresolved.supersession, null);

  const resolved = planIssueLane({
    runId,
    issueId,
    attempt: 1,
    creationIntent: { runId, issueId, attempt: 1, state: "RESOLVED", laneRef: "dispatch_13_1" },
  });
  assert.equal(resolved.decision, "REUSE");
  assert.equal(resolved.laneRef, "dispatch_13_1");
});

test("two observed lanes for one Issue are an ambiguity, and an active lane is observed", () => {
  const ambiguous = planIssueLane({ runId, issueId, attempt: 1, observed: [lane(), lane({ laneRef: "dispatch_13_1b" })] });
  assert.equal(ambiguous.stop.code, LANE_STOP_CODES.ambiguousLane);

  const active = planIssueLane({ runId, issueId, attempt: 1, observed: [lane({ state: "ACTIVE" })] });
  assert.equal(active.decision, "OBSERVE");
  assert.equal(active.laneRef, "dispatch_13_1");
});

test("an attempt behind an existing lane is refused and a resumable lane is reused", () => {
  const ahead = planIssueLane({ runId, issueId, attempt: 1, observed: [lane({ attempt: 2 })] });
  assert.equal(ahead.stop.code, LANE_STOP_CODES.attemptAhead);

  const reuse = planIssueLane({ runId, issueId, attempt: 1, observed: [lane()] });
  assert.equal(reuse.decision, "REUSE");
});

test("a transient retry reuses the same reachable lane instead of creating a second one", () => {
  const decision = planIssueLane({
    runId,
    issueId,
    attempt: 2,
    observed: [lane({ state: "RESUMABLE", attempt: 1 })],
    at: "2026-09-16T02:00:00.000Z",
  });
  assert.equal(decision.decision, "RESUME");
  assert.equal(decision.laneRef, "dispatch_13_1");
  assert.equal(decision.supersession, null);
  // The new attempt is accounted with replacement null, so the same lane is resumed.
  assert.deepEqual(decision.retry, {
    type: "retry.recorded",
    at: "2026-09-16T02:00:00.000Z",
    issueId,
    attempt: 1,
    reason: "transient_task_failure",
    priorTaskRef: laneTaskRef("dispatch_13_1"),
    replacement: null,
  });
  assert.deepEqual(decision.dispatch, {
    type: "dispatch.recorded",
    at: "2026-09-16T02:00:00.000Z",
    issueId,
    attempt: 2,
    taskRef: laneTaskRef("dispatch_13_1"),
  });

  const unaligned = planIssueLane({ runId, issueId, attempt: 3, observed: [lane({ state: "RESUMABLE", attempt: 1 })], at: "2026-09-16T02:00:00.000Z" });
  assert.equal(unaligned.stop.code, LANE_STOP_CODES.attemptUnaligned);

  const noAttempt = planIssueLane({
    runId, issueId, attempt: 2, at: "2026-09-16T02:00:00.000Z",
    observed: [{ runId, issueId, laneRef: "dispatch_13_1", state: "RESUMABLE" }],
  });
  assert.equal(noAttempt.stop.code, LANE_STOP_CODES.attemptUnaligned);
});

test("a lane with no recorded attempt can neither resume nor be replaced", () => {
  const resuming = planIssueLane({
    runId, issueId, attempt: 1, at: "2026-09-16T02:00:00.000Z",
    observed: [{ runId, issueId, laneRef: "dispatch_13_1", state: "RESUMABLE" }],
  });
  assert.equal(resuming.decision, "STOP");
  assert.equal(resuming.stop.code, LANE_STOP_CODES.attemptUnaligned);

  const replacing = planIssueLane({
    runId, issueId, attempt: 1, at: "2026-09-16T02:00:00.000Z",
    observed: [{
      runId, issueId, laneRef: "dispatch_13_1", state: "INACTIVE",
      inactiveEvidence: ["native task settled with no active turn"],
    }],
  });
  assert.equal(replacing.decision, "STOP");
  assert.equal(replacing.stop.code, LANE_STOP_CODES.replacementWithoutPriorAttempt);
});

test("a replacement lane must be a distinct lane", () => {
  const same = planIssueLane({
    runId,
    issueId,
    attempt: 2,
    observed: [lane({ state: "INACTIVE", attempt: 1, inactiveEvidence: ["settled with no active turn"] })],
    nextLaneRef: "dispatch_13_1",
    at: "2026-09-16T02:00:00.000Z",
  });
  assert.equal(same.stop.code, LANE_STOP_CODES.replacementNotDistinct);
});

test("a replacement lane carries its supersession link, and needs exact inactive evidence", () => {
  const withoutEvidence = planIssueLane({ runId, issueId, attempt: 2, observed: [lane({ state: "INACTIVE", attempt: 1 })] });
  assert.equal(withoutEvidence.stop.code, LANE_STOP_CODES.replacementWithoutEvidence);

  const replace = planIssueLane({
    runId,
    issueId,
    attempt: 2,
    observed: [lane({ state: "INACTIVE", attempt: 1, inactiveEvidence: ["native task settled with no active turn"] })],
    nextLaneRef: "dispatch_13_2",
    at: "2026-09-16T02:00:00.000Z",
  });
  assert.equal(replace.decision, "REPLACE");
  assert.deepEqual(replace.supersession, {
    type: "retry.recorded",
    at: "2026-09-16T02:00:00.000Z",
    issueId,
    attempt: 1,
    reason: "prior_lane_inactive",
    priorTaskRef: laneTaskRef("dispatch_13_1"),
    replacement: {
      supersedesAttempt: 1,
      nextTaskRef: laneTaskRef("dispatch_13_2"),
      inactiveEvidence: ["native task settled with no active turn"],
    },
  });

  const unknown = planIssueLane({ runId, issueId, attempt: 1, observed: [lane({ state: "UNKNOWN" })] });
  assert.equal(unknown.stop.code, LANE_STOP_CODES.livenessUnknown);
});

test("a lane's tools stay inside both the declared ceiling and the agent's own ceiling", () => {
  assert.equal(assertLaneTools({ tools: ["read", "bash"], agentCeiling: [...LANE_TOOL_CEILING] }), null);
  const outsideDeclared = assertLaneTools({ tools: ["read", "network"], agentCeiling: [...LANE_TOOL_CEILING] });
  assert.equal(outsideDeclared.code, LANE_STOP_CODES.toolOutsideCeiling);
  const outsideAgent = assertLaneTools({ tools: ["read", "write"], agentCeiling: ["read", "grep"] });
  assert.equal(outsideAgent.code, LANE_STOP_CODES.toolOutsideAgent);
});

test("a lane prompt invokes exactly its own contract skill and never widens authority", () => {
  assert.equal(assertLanePromptScope({ prompt: "Use $execute-issue to implement Issue 13.", skill: "execute-issue" }), null);
  assert.equal(assertLanePromptScope({ prompt: "Use $close-issue to close Issue 13.", skill: "close-issue" }), null);

  const missing = assertLanePromptScope({ prompt: "Implement Issue 13.", skill: "execute-issue" });
  assert.equal(missing.code, LANE_STOP_CODES.promptMissingSkill);

  const widened = assertLanePromptScope({
    prompt: "Use $execute-issue to implement Issue 13, then $close-issue it.",
    skill: "execute-issue",
  });
  assert.equal(widened.code, LANE_STOP_CODES.promptWidensAuthority);
  assert.deepEqual(LANE_SKILL_SCOPE["execute-issue"].includes("close-issue"), true);
});

test("the lane agent resolves only from the roots pi-workflow itself searches", () => {
  const project = laneProject({ project: true });
  const userOnly = laneProject({ project: false, user: true });
  const missing = laneProject({ project: false });
  try {
    const fromProject = resolveLaneAgent({ cwd: project.directory, homeDir: project.homeDir });
    assert.equal(fromProject.resolved, true);
    assert.equal(fromProject.scope, "project");
    assert.deepEqual(fromProject.ceiling, ["read", "grep", "find", "ls", "bash", "edit", "write"]);

    const fromUser = resolveLaneAgent({ cwd: userOnly.directory, homeDir: userOnly.homeDir });
    assert.equal(fromUser.resolved, true);
    assert.equal(fromUser.scope, "user");

    const unresolved = resolveLaneAgent({ cwd: missing.directory, homeDir: missing.homeDir, canonicalSource: "agents/worker.md" });
    assert.equal(unresolved.resolved, false);
    assert.equal(unresolved.stop.code, LANE_STOP_CODES.agentUnresolved);
    assert.ok(unresolved.stop.evidence.some((line) => line.includes(join(missing.homeDir, ".pi", "agent", "agents", "worker.md"))));
    assert.ok(unresolved.stop.evidence.some((line) => line.includes("agents/worker.md")));
  } finally {
    project.cleanup();
    userOnly.cleanup();
    missing.cleanup();
  }
});

test("an agent definition without a readable tool list never becomes a ceiling", () => {
  assert.deepEqual(parseAgentTools(["name: worker", "tools: read, bash", "readOnly: false"]), ["read", "bash"]);
  assert.deepEqual(parseAgentTools(["tools:", "  - read", "  - bash", "readOnly: false"]), ["read", "bash"]);
  assert.deepEqual(parseAgentTools(["name: worker"]), []);

  const directory = mkdtempSync(join(tmpdir(), "piwf-lane-bad-"));
  try {
    mkdirSync(join(directory, ".pi", "agents"), { recursive: true });
    writeFileSync(join(directory, ".pi", "agents", "worker.md"), "---\nname: worker\n---\n\nNo tools.\n");
    const unresolved = resolveLaneAgent({ cwd: directory, homeDir: directory });
    assert.equal(unresolved.resolved, false);
    assert.equal(unresolved.stop.code, LANE_STOP_CODES.agentUnresolved);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("exactly one lane per Issue is materialized per round", () => {
  const status = {
    schema: "dag-run-status:v1",
    run: { runId, specId: "12", target: "features/ron", state: "RUNNING", controlRevision: 0 },
    legalActions: [
      { type: "dispatch_issue", issueId: "13", attempt: 1 },
      { type: "dispatch_issue", issueId: "13", attempt: 1 },
    ],
    diagnoses: [],
  };
  const plan = planHostActions(status, { journal: [grant] });
  assert.equal(plan.stop.code, HOST_STOP_CODES.duplicateMaterialization);
  assert.deepEqual(plan.materializations, []);
});

test("the re-issue proof governs exactly the lanes the round materializes", () => {
  const status = {
    schema: "dag-run-status:v1",
    run: { runId, specId: "12", target: "features/ron", state: "RUNNING", controlRevision: 0 },
    legalActions: [{ type: "dispatch_issue", issueId: "13", attempt: 1 }],
    diagnoses: [],
  };
  const plan = planHostActions(status, { journal: [grant] });
  // A recorded lane the round only observes is not part of the proof.
  assert.equal(assertReissueOrder(plan, [{ id: "dispatch_14_1" }]), null);
  assert.equal(assertReissueOrder(plan, [{ id: "dispatch_14_1" }], new Set(["dispatch_13_1"])), null);
  // A recorded lane the round does materialize with a different request shape is refused.
  const divergent = assertReissueOrder(
    plan,
    [{ id: "dispatch_13_1", requestIdentity: `sha256:${"c".repeat(64)}` }],
    new Set(["dispatch_13_1"]),
  );
  assert.equal(divergent.code, HOST_STOP_CODES.replayDivergence);
});

test("every declared lane names a skill, an agent and a managed worktree", () => {
  assert.equal(HOST_LANE_AGENT, LANE_AGENT_NAME);
  for (const [actionType, policy] of Object.entries(HOST_ACTION_POLICY)) {
    if (policy.kind !== "agent") continue;
    assert.equal(policy.agent, LANE_AGENT_NAME, `${actionType} must use the lane agent`);
    for (const tool of policy.tools) assert.ok(LANE_TOOL_CEILING.includes(tool));
  }
  const spec = JSON.parse(readFileSync(resolve(
    import.meta.dirname,
    "../../skills/personal/run-issue-workflow/workflows/deliver-tracker-spec/spec.json",
  ), "utf8"));
  assert.equal(spec.defaults.agent, LANE_AGENT_NAME);
  assert.deepEqual(spec.defaults.tools, [...LANE_TOOL_CEILING]);
  assert.equal(spec.defaults.worktreePolicy, LANE_WORKTREE_POLICY);
  assert.equal(HOST_TOOL_CEILING, LANE_TOOL_CEILING);
});

test("the controller refuses a lane whose worker agent does not resolve", async () => {
  const project = laneProject({ project: false });
  try {
    const calls = [];
    const result = await controller(fakeContext(calls, JSON.stringify({
      facts: facts([readyNode("13")], [grant]),
      cwd: project.directory,
      homeDir: project.homeDir,
    })));
    assert.deepEqual(calls, []);
    assert.equal(result.control.stopCode, LANE_STOP_CODES.agentUnresolved);
  } finally {
    project.cleanup();
  }
});

test("the controller materializes one resolvable lane and observes an active one", async () => {
  const project = laneProject({ project: true });
  const journal = journalWith();
  try {
    const calls = [];
    const dispatched = await controller(fakeContext(calls, JSON.stringify({
      facts: facts([readyNode("13")], [grant]),
      cwd: project.directory,
      homeDir: project.homeDir,
      gitCommonDir: journal.gitCommonDir,
    })));
    assert.deepEqual(calls.map((call) => call.id), ["dispatch_13_1"]);
    assert.equal(dispatched.control.laneAgent.scope, "project");
    assert.deepEqual(dispatched.control.generated[0].laneDecision, "CREATE");
    const events = readFileSync(join(journal.gitCommonDir, "matt-workflow-control", "runs", runId, "events.jsonl"), "utf8")
      .trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.type), ["grant.recorded", "dispatch.recorded"]);
    assert.deepEqual(events[1].taskRef, laneTaskRef("dispatch_13_1"));

    const observedCalls = [];
    const observed = await controller(fakeContext(observedCalls, JSON.stringify({
      facts: facts([readyNode("13")], [grant]),
      cwd: project.directory,
      homeDir: project.homeDir,
      gitCommonDir: journal.gitCommonDir,
      lanes: {
        observed: [{ runId, issueId: "13", laneRef: "dispatch_13_1", attempt: 1, state: "ACTIVE" }],
        creationIntents: [],
      },
    })));
    assert.deepEqual(observedCalls, []);
    assert.deepEqual(observed.control.observedLanes.map((item) => item.laneRef), ["dispatch_13_1"]);
    assert.deepEqual(observed.control.generatedTaskIds, []);
  } finally {
    project.cleanup();
    journal.cleanup();
  }
});

test("the controller resumes the same lane on a transient retry and accounts both attempts", async () => {
  const project = laneProject({ project: true });
  const journal = journalWith(dispatchRecordDraft(1, "dispatch_13_1"));
  try {
    const failedNode = {
      ...readyNode("13"),
      taskState: "TRANSIENT_FAILURE",
      failure: { kind: "transient", evidence: ["native launch failed"] },
    };
    const calls = [];
    const result = await controller(fakeContext(calls, JSON.stringify({
      facts: facts([failedNode], [grant, dispatchDraft(1, "dispatch_13_1")]),
      cwd: project.directory,
      homeDir: project.homeDir,
      gitCommonDir: journal.gitCommonDir,
      at: "2026-09-16T02:00:00.000Z",
      lanes: {
        observed: [{ runId, issueId, laneRef: "dispatch_13_1", attempt: 1, state: "RESUMABLE" }],
        creationIntents: [],
      },
    })));
    // No second worker is created for the same Issue.
    assert.deepEqual(calls, []);
    assert.equal(result.control.status, "resume_same_run");
    assert.equal(result.control.resumeSameHostRun, true);
    assert.deepEqual(result.control.resumedLanes, [{ issueId, laneRef: "dispatch_13_1", attempt: 2, sequence: 4 }]);
    const events = readFileSync(join(journal.gitCommonDir, "matt-workflow-control", "runs", runId, "events.jsonl"), "utf8")
      .trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.type), ["grant.recorded", "dispatch.recorded", "retry.recorded", "dispatch.recorded"]);
    assert.deepEqual(events[2].replacement, null);
    assert.deepEqual(events[3].taskRef, laneTaskRef("dispatch_13_1"));
  } finally {
    project.cleanup();
    journal.cleanup();
  }
});

test("a re-used lane whose dispatch is not journaled stops instead of throwing", async () => {
  const project = laneProject({ project: true });
  const journal = journalWith();
  try {
    const calls = [];
    const result = await controller(fakeContext(calls, JSON.stringify({
      facts: facts([readyNode("13")], [grant]),
      cwd: project.directory,
      homeDir: project.homeDir,
      gitCommonDir: journal.gitCommonDir,
      lanes: {
        observed: [{ runId, issueId, laneRef: "dispatch_13_1", attempt: 1, state: "RESUMABLE" }],
        creationIntents: [],
      },
    })));
    assert.deepEqual(calls, []);
    assert.equal(result.control.stopCode, LANE_STOP_CODES.dispatchUnaccounted);
  } finally {
    project.cleanup();
    journal.cleanup();
  }
});

test("a new lane whose attempt has no journaled retry stops instead of throwing", async () => {
  const project = laneProject({ project: true });
  const journal = journalWith(dispatchRecordDraft(1, "dispatch_13_1"));
  try {
    const failedNode = {
      ...readyNode("13"),
      taskState: "TRANSIENT_FAILURE",
      failure: { kind: "transient", evidence: ["native launch failed"] },
    };
    const calls = [];
    // No observed lane, so the module plans CREATE at attempt 2 with no retry fact of its own.
    const result = await controller(fakeContext(calls, JSON.stringify({
      facts: facts([failedNode], [grant, dispatchDraft(1, "dispatch_13_1")]),
      cwd: project.directory,
      homeDir: project.homeDir,
      gitCommonDir: journal.gitCommonDir,
      at: "2026-09-16T02:00:00.000Z",
    })));
    assert.deepEqual(calls, []);
    assert.equal(result.control.stopCode, LANE_STOP_CODES.dispatchUnaccounted);
  } finally {
    project.cleanup();
    journal.cleanup();
  }
});

test("a new lane without an authority journal is refused rather than created uncounted", async () => {
  const project = laneProject({ project: true });
  try {
    const calls = [];
    const result = await controller(fakeContext(calls, JSON.stringify({
      facts: facts([readyNode("13")], [grant]),
      cwd: project.directory,
      homeDir: project.homeDir,
    })));
    assert.deepEqual(calls, []);
    assert.equal(result.control.stopCode, "lane_dispatch_journal_unavailable");
  } finally {
    project.cleanup();
  }
});

test("the controller journals a lane replacement before the replacement exists", async () => {
  const project = laneProject({ project: true });
  const journal = journalWith(dispatchRecordDraft(1, "dispatch_13_1"));
  const gitCommonDir = journal.gitCommonDir;
  try {
    const failedNode = {
      ...readyNode("13"),
      taskState: "TRANSIENT_FAILURE",
      failure: { kind: "transient", evidence: ["native launch failed"] },
    };
    const calls = [];
    const result = await controller(fakeContext(calls, JSON.stringify({
      facts: facts([failedNode], [grant, dispatchDraft(1, "dispatch_13_1")]),
      cwd: project.directory,
      homeDir: project.homeDir,
      gitCommonDir,
      lanes: {
        observed: [{
          runId,
          issueId: "13",
          laneRef: "dispatch_13_1",
          attempt: 1,
          state: "INACTIVE",
          inactiveEvidence: ["native task settled with no active turn"],
        }],
        creationIntents: [],
      },
    })));
    assert.deepEqual(calls.map((call) => call.id), ["dispatch_13_2"]);
    assert.deepEqual(result.control.generated[0].laneDecision, "REPLACE");
    const events = readFileSync(join(gitCommonDir, "matt-workflow-control", "runs", runId, "events.jsonl"), "utf8")
      .trim().split("\n").map((line) => JSON.parse(line));
    // The supersession link lands before the replacement lane is dispatched, and the replacement lane
    // is the exact ref the journal authorized.
    assert.deepEqual(events.map((event) => event.type), ["grant.recorded", "dispatch.recorded", "retry.recorded", "dispatch.recorded"]);
    assert.deepEqual(events[2].replacement.supersedesAttempt, 1);
    assert.deepEqual(events[2].replacement.nextTaskRef, laneTaskRef("dispatch_13_2"));
    assert.deepEqual(events[3].type, "dispatch.recorded");
    assert.deepEqual(events[3].taskRef, laneTaskRef("dispatch_13_2"));
  } finally {
    project.cleanup();
    journal.cleanup();
  }
});
