import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createCoordinator as createCoordinatorRuntime,
  WINDOWS_GRADLE_LOOPBACK_FINGERPRINT,
} from "../../skills/personal/run-issue-workflow/scripts/run-coordinator.mjs";
import { runBatch } from "../../skills/personal/run-issue-workflow/scripts/run-batch.mjs";
import { createCodexWorkflowTasks } from "../../skills/personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs";
import { modelDecisionInput } from "../../skills/personal/run-issue-workflow/scripts/issue-model-policy.mjs";
import { acquireCloseIssueLeases } from "../../skills/engineering/close-issue/scripts/close-lease.mjs";
import { RUN_READY_FACT_SCHEMA } from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { createTargetWriterWaitEvidence } from "../../skills/personal/run-issue-workflow/scripts/run-target-writer-wait.mjs";
import { bindTechnicalFailure } from "../../skills/personal/run-issue-workflow/scripts/recovery-evidence.mjs";

const createStoreFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "dag-coordinator-"));
  execFileSync("git", ["init", "-b", "target"], { cwd: root, stdio: "ignore" });
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const gitCommonDir = resolve(root, common);
  return { root, gitCommonDir, store: createRunStore({ gitCommonDir }) };
};

const identity = {
  runId: "run-15",
  specId: "15",
  approvedScopeHash: "sha256:issue-15",
  target: "features/ron",
  classification: "SINGLE",
  decompositionIdentity: null,
};

test("technical failure diagnosis and isolated repair retain one operation budget across coordinator restart", async () => {
  const { root, store } = createStoreFixture();
  const original = { threadId: "original", hostId: "local" }, repairTask = { threadId: "repair", hostId: "local" };
  let running = false, recoveryRequest, diagnosed = false;
  const messages = [];
  const failureBase = { runId: identity.runId, issueId: "15", operationId: "issue-operation", candidate: "b".repeat(40), targetHead: "a".repeat(40),
    worktree: root, topic: "issue", owningSource: "integration-check", command: ["node", "check.mjs"], observedResult: "exit 1", ownerTaskRef: original,
    completionIdentity: "IC_original", completionBodySha256: `sha256:${"d".repeat(64)}`, repairWaveCount: 3 };
  const tasks = {
    async findIssueLane() { return [original]; }, async create() { throw new Error("No replacement execution lane"); },
    async ensureRecoveryTask() { return { taskRef: repairTask, previousOwner: { taskRef: original, state: "SETTLED", worktree: root, turnId: "settled" } }; },
    async read(ref) { return { state: ref.threadId === "repair" && running ? "RUNNING" : "RESUMABLE", cwd: root,
      snapshot: { turns: [{ status: "completed" }] }, ...(ref.threadId === "repair" ? { recoveryRequest } : {}) }; },
    async message(ref, prompt) {
      assert.deepEqual(ref, repairTask); messages.push(prompt);
      recoveryRequest = JSON.parse(prompt.match(/^Recovery request: (\{.+\})$/mu)[1]); running = true;
    }, async wait() { throw new Error("A step yields"); },
  };
  const options = { store, tasks, tracker: { read: async () => ({}) }, now: () => "2026-09-08T00:00:00.000Z", sleep: async () => {},
    reconcile: async () => reconciliation({ taskRefs: { 15: running ? repairTask : original }, nodes: [{ issueId: "15", blockers: [], trackerState: "OPEN",
      taskState: running ? "EXECUTING" : "NONE", completionState: "COMPLETE", candidateReachable: true, worktreeState: "PRESENT", recoveryActive: running,
      recovery: bindTechnicalFailure({ ...failureBase, ...(diagnosed ? { diagnosis: { classification: "ISSUE_DEFECT", source: "check.mjs", reason: "Fixture mismatch", scopeCompatible: true } } : {}) }) }] }) };
  try {
    const writer = store.acquireWriter(identity.runId);
    writer.append({ type: "grant.recorded", at: options.now(), runIdentity: identity });
    writer.append({ type: "dispatch.recorded", at: options.now(), issueId: "15", attempt: 1, taskRef: original }); writer.release();
    await createCoordinator(options).run({ specId: "15", mode: "step" });
    assert.equal(messages.length, 1); assert.match(messages[0], /Read-only diagnosis/u);
    await createCoordinator(options).run({ specId: "15", mode: "step" });
    assert.equal(messages.length, 1, "an active recovery is observed, not messaged again");
    running = false; diagnosed = true;
    await createCoordinator(options).run({ specId: "15", mode: "step" });
    assert.equal(messages.length, 2); assert.match(messages[1], /Material repair wave 4\/10/u);
    await createCoordinator(options).run({ specId: "15", mode: "step" });
    const events = store.readEvents(identity.runId);
    assert.equal(events.filter(event => event.type === "grant.recorded").length, 1);
    assert.deepEqual(events.filter(event => event.type === "recovery.intent").map(event => [event.phase, event.wave]), [["DIAGNOSE", null], ["REPAIR", 4]]);
    assert.equal(events.filter(event => event.type === "repair.recorded").length, 0, "no fabricated conflict repair event");
    assert.equal(messages.length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const multiIdentity = {
  ...identity,
  runId: "run-12",
  specId: "12",
  approvedScopeHash: "sha256:spec-12",
  classification: "MULTI",
  decompositionIdentity: "decomposition:12:01-05",
};

for (const classification of ["OUTCOME_UNKNOWN", "ENVIRONMENT"]) test(`${classification} dispatches its bounded owning action without a material wave`, async () => {
  const { root, store } = createStoreFixture();
  const original = { threadId: "original", hostId: "local" }, repair = { threadId: "repair", hostId: "local" };
  let recoveryRequest, attempted = false;
  const prompts = [];
  const failure = () => bindTechnicalFailure({ runId: identity.runId, issueId: "15", operationId: "original-operation", candidate: "b".repeat(40), targetHead: "a".repeat(40),
    worktree: root, topic: "issue", owningSource: "native command output", command: ["gradle", "test"], observedResult: "missing result", ownerTaskRef: original, repairWaveCount: null,
    diagnosis: { classification, source: "native command owner", nextOwner: "native command owner", reason: "Read exact command output",
      ...(classification === "ENVIRONMENT" ? { fingerprint: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT, remediationAttempted: attempted } : { readBackAttempted: attempted }) } });
  const tasks = { findIssueLane: async () => [original], create: async () => { throw new Error("No replacement"); }, wait: async () => { throw new Error("A step yields"); }, read: async ref => ({ state: "RESUMABLE", cwd: root, snapshot: { turns: [{ status: "completed" }] }, ...(ref.threadId === "repair" ? { recoveryRequest } : {}) }),
    ensureRecoveryTask: async () => ({ taskRef: repair, previousOwner: { taskRef: original, state: "SETTLED", worktree: root, turnId: "settled" } }),
    message: async (ref, prompt) => { assert.deepEqual(ref, repair); prompts.push(prompt); recoveryRequest = JSON.parse(prompt.match(/^Recovery request: (\{.+\})$/mu)[1]); } };
  const options = { store, tasks, tracker: { read: async () => ({}) }, now: () => "2026-09-08T00:00:00.000Z", sleep: async () => {},
    reconcile: async () => reconciliation({ taskRefs: { 15: original }, nodes: [{ issueId: "15", blockers: [], trackerState: "OPEN", taskState: "NONE", completionState: "BLOCKED", candidateReachable: false, worktreeState: "PRESENT", recovery: failure() }] }) };
  try {
    const writer = store.acquireWriter(identity.runId);
    writer.append({ type: "grant.recorded", at: options.now(), runIdentity: identity });
    writer.append({ type: "dispatch.recorded", at: options.now(), issueId: "15", attempt: 1, taskRef: original }); writer.release();
    await createCoordinator(options).run({ specId: "15", mode: "step" });
    await createCoordinator(options).run({ specId: "15", mode: "step" });
    assert.equal(prompts.length, 1);
    assert.equal(recoveryRequest.phase, classification === "ENVIRONMENT" ? "ENVIRONMENT" : "READBACK");
    assert.equal(recoveryRequest.wave, null, "an unproved material budget does not prevent read-back or exact bounded tool remediation");
    assert.match(prompts[0], classification === "ENVIRONMENT" ? /gradle-loopback-safe/u : /Read back the exact uncertain command/u);
    const events = store.readEvents(identity.runId);
    assert.equal(events.filter(event => event.type === "remediation.recorded").length, classification === "ENVIRONMENT" ? 1 : 0);
    attempted = true;
    const stopped = await createCoordinator(options).run({ specId: "15", mode: "step" });
    assert.equal(stopped.legalActions.length, 0); assert.equal(stopped.diagnoses[0].nextOwner, "native command owner");
    assert.equal(prompts.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const selectedPlanningSeal = "c".repeat(40);

test("cooperative batch steps read fresh activity, dispatch once, and preserve the existing Grant", async () => {
  const { root, store } = createStoreFixture();
  const active = new Set();
  let creates = 0;
  const coordinator = createCoordinator({ store, tracker: { async read() { return {}; } },
    tasks: {
      async findIssueLane() { return []; },
      async create({ issueId }) { creates += 1; active.add(issueId); return { threadId: `thread-${issueId}`, hostId: "local" }; },
      async read() { return { state: "RUNNING" }; },
      async message() { throw new Error("No message expected"); },
      async wait() { throw new Error("A batch step must yield instead of waiting on workers"); },
    },
    reconcile: async () => reconciliation({ runIdentity: multiIdentity,
      nodes: ["13", "14"].map(issueId => ({ issueId, blockers: [], trackerState: "OPEN", taskState: active.has(issueId) ? "EXECUTING" : "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" })),
    }), now: () => "2026-09-06T00:00:00.000Z", sleep: async () => {},
  });
  try {
    await coordinator.run({ specId: "12", mode: "snapshot" });
    await coordinator.run({ specId: "12", mode: "step", executionSlots: 0 });
    assert.equal(creates, 0);
    const first = await coordinator.run({ specId: "12", mode: "step", executionSlots: 1 });
    assert.equal(creates, 1);
    assert.equal(first.frontier.active.length, 1);
    assert.equal(store.readEvents(first.run.runId).filter(event => event.type === "grant.recorded").length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const closeAuthorityEvidenceFor = (issueId, overrides = {}) => ({
  trackerIdentity: `github-issue:${issueId}:version:1`,
  targetHead: "a".repeat(40),
  candidateCommit: "b".repeat(40),
  completionEvidenceId: `github-comment:completion-${issueId}`,
  completionBodySha256: `sha256:${"d".repeat(64)}`,
  worktreeIdentity: `registered-worktree:issue-${issueId}`,
  ...overrides,
});

const closeRequestIdentityFrom = (prompt) => {
  const match = prompt.match(/Close request identity: (sha256:[a-f0-9]{64})\./u);
  assert.ok(match, "close request prompt must carry its evidence identity");
  return match[1];
};

const withCloseAuthorityEvidence = (node) => node.completionState === "COMPLETE"
  ? { ...node, closeAuthorityEvidence: node.closeAuthorityEvidence ?? closeAuthorityEvidenceFor(node.issueId) }
  : node;

const readyHandoffFor = (runIdentity) => {
  const producerCommand = runIdentity.classification === "SINGLE" ? "to-spec" : "to-tickets";
  const recordIdentities = runIdentity.classification === "SINGLE"
    ? ["IC_to_spec"]
    : ["IC_to_spec", "IC_to_tickets"];
  return {
    schema: RUN_READY_FACT_SCHEMA,
    authority: {
      specId: runIdentity.specId,
      target: runIdentity.target,
      planningSeal: selectedPlanningSeal,
      classification: runIdentity.classification,
      approvedScopeHash: runIdentity.approvedScopeHash,
      decompositionIdentity: runIdentity.decompositionIdentity,
    },
    targetState: "CLEAN",
    checkpoint: {
      state: "COMPLETED",
      producerCommand,
      transactionIdentity: `sha256:${"3".repeat(64)}`,
      specId: runIdentity.specId,
      target: runIdentity.target,
      planningSeal: selectedPlanningSeal,
      classification: runIdentity.classification,
      approvedScopeHash: runIdentity.approvedScopeHash,
      baseline: "a".repeat(40),
      initialTargetState: "CLEAN",
      planPath: `superpowers/docs/plans/spec-${runIdentity.specId}.md`,
      generatedContentIdentity: `sha256:${"4".repeat(64)}`,
      firstUnsatisfiedStage: null,
      handoffIdentity: `${producerCommand}:handoff:${runIdentity.specId}`,
    },
    handoff: {
      identity: `${producerCommand}:handoff:${runIdentity.specId}`,
      producerCommand,
      specId: runIdentity.specId,
      target: runIdentity.target,
      planningSeal: selectedPlanningSeal,
      classification: runIdentity.classification,
      approvedScopeHash: runIdentity.approvedScopeHash,
      recordIdentities,
      decompositionIdentity: runIdentity.decompositionIdentity,
    },
    trackerRecordIdentities: recordIdentities,
    decompositionIdentity: runIdentity.decompositionIdentity,
    targetOwnership: "NONE",
    evidence: [],
  };
};

const defaultRunReadyHandoffAdapter = {
  async read({ current }) { return current.runReadyHandoff; },
};
const createCoordinator = (options) => createCoordinatorRuntime({
  handoff: defaultRunReadyHandoffAdapter,
  ...options,
});

const assertRecoverablePacket = (diagnosis, { specId = "15", source }) => {
  const packet = diagnosis.operatorPacket;
  assert.equal(packet.disposition, "Recoverable blocker");
  assert.match(packet.owningSource, source);
  assert.ok(packet.observedEvidence.length > 0);
  assert.ok(packet.smallestHumanAction.length > 0);
  assert.equal(packet.retryCommand, `/run-issue-workflow ${specId}`);
  assert.ok(packet.preservedStages.run.runId.length > 0);
  assert.ok(packet.preservedStages.run.state.length > 0);
  assert.ok(packet.preservedStages.issues.every(({ issueId, state }) => issueId.length > 0 && state.length > 0));
};

const reconciliation = ({
  runIdentity = identity,
  maxParallel = 3,
  taskRefs = {},
  run = {},
  nodes,
  contradictions = [],
  runReadyHandoff = readyHandoffFor(runIdentity),
}) => ({
  runIdentity,
  grant: { runIdentity, maxParallel },
  planningSeal: selectedPlanningSeal,
  runReadyHandoff,
  taskRefs,
  facts: {
    schema: "dag-run-facts:v1",
    run: {
      ...runIdentity,
      reconciled: true,
      trackerAvailable: true,
      targetState: "CLEAN",
      targetHead: "a".repeat(40),
      closeWriterRunId: null,
      closeWriterState: "ABSENT",
      parentTrackerState: "OPEN",
      parentTrackerIdentity: runIdentity.classification === "MULTI"
        ? `github-issue:${runIdentity.specId}:version:1`
        : null,
      ...run,
    },
    nodes: nodes.map(withCloseAuthorityEvidence),
    contradictions,
  },
});

test("model routing binds only a new Run and forwards validated semantic input to its first dispatch", async () => {
  for (const legacy of [false, true]) {
    const { root, store } = createStoreFixture();
    const modelPolicy = { version: "issue-model-policy:v1", specId: identity.specId, target: identity.target,
      approvedScopeHash: identity.approvedScopeHash, authorization: "Human approved this Run model pool and one bounded upgrade" };
    if (legacy) { const writer = store.acquireWriter(identity.runId); writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity: identity }); writer.release(); }
    const input = modelDecisionInput({ issueId: "15", specId: "15", approvedScopeHash: identity.approvedScopeHash, issueBody: "Issue contract", specBody: "Spec contract" });
    const decision = { inputIdentity: input.inputIdentity, reason: "coordinator selection" };
    let active = false, received;
    const coordinator = createCoordinator({ store, tracker: { async read() { return {}; } },
      tasks: { async findIssueLane() { return []; }, async create(args) { received = args; active = true; return { threadId: "worker", hostId: "local" }; },
        async read() { return { state: "RUNNING" }; }, async message() {}, async wait() { throw new Error("step does not wait"); } },
      reconcile: async () => ({ ...reconciliation({ nodes: [{ issueId: "15", blockers: [], trackerState: "OPEN", taskState: active ? "EXECUTING" : "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" }] }), modelInputs: { 15: input } }),
      now: () => "2026-09-08T00:00:00.000Z", sleep: async () => {},
    });
    try {
      await coordinator.run({ specId: "15", mode: "step", modelRouting: { policy: modelPolicy, decisions: { 15: decision } } });
      assert.deepEqual(received.modelInput, input);
      assert.deepEqual(received.modelDecision, decision);
      assert.deepEqual(store.readEvents(identity.runId)[0].modelPolicy, legacy ? undefined : modelPolicy);
      assert.equal(store.readEvents(identity.runId).filter(event => event.type === "grant.recorded").length, 1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("model routing yields reserve one same-task upgrade without consuming a dispatch retry", async () => {
  const { root, store } = createStoreFixture();
  const ref = { threadId: "worker", hostId: "local" };
  const writer = store.acquireWriter(identity.runId);
  writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity: identity,
    modelPolicy: { version: "issue-model-policy:v1", specId: identity.specId, target: identity.target, approvedScopeHash: identity.approvedScopeHash, authorization: "Approved model policy" } });
  writer.append({ type: "dispatch.recorded", at: "2026-09-08T00:00:00.000Z", issueId: "15", attempt: 1, taskRef: ref }); writer.release();
  let continued = false, received;
  const coordinator = createCoordinator({ store, tracker: { async read() { return {}; } },
    tasks: { async findIssueLane() { return [ref]; }, async create() { throw new Error("No replacement task"); }, async read() { return { state: continued ? "RUNNING" : "RESUMABLE" }; },
      async message() { throw new Error("Use explicit upgrade continuation"); }, async wait() {},
      async upgrade(args) { received = args; continued = true; assert.equal(store.readEvents(identity.runId).at(-1).type, "model.upgrade"); } },
    reconcile: async () => ({ ...reconciliation({ taskRefs: { 15: ref }, nodes: [{ issueId: "15", blockers: [], trackerState: "OPEN", taskState: continued ? "EXECUTING" : "MODEL_YIELDED", completionState: "NONE", candidateReachable: false, worktreeState: "PRESENT" }] }),
      modelYields: { 15: { candidate: "a".repeat(40), worktree: "/lane", topic: "topic", repairWaves: 2, yieldIdentity: "sha256:" + "b".repeat(64), finding: { identity: "F1" }, setting: { model: "gpt-6-astra", thinking: "high" } } } }),
    now: () => "2026-09-08T00:00:00.000Z", sleep: async () => {},
  });
  try {
    await coordinator.run({ specId: "15", mode: "step", executionSlots: 0 }); assert.equal(continued, false);
    const status = await coordinator.run({ specId: "15", mode: "step", executionSlots: 1 });
    assert.deepEqual(received.ref, ref); assert.equal(received.intent.repairWaves, 2);
    assert.equal(status.frontier.active.length, 1);
    assert.equal(store.readEvents(identity.runId).filter(event => event.type === "dispatch.recorded").length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Run-ready handoff INCOMPLETE and UNKNOWN stop before cleanup, writer, Grant, panel, or task mutation", async () => {
  for (const entryState of ["INCOMPLETE", "UNKNOWN"]) {
    const { root, store } = createStoreFixture();
    let selected = 0;
    let taskCalls = 0;
    let handoffReads = 0;
    const runReadyHandoff = readyHandoffFor(identity);
    if (entryState === "INCOMPLETE") {
      runReadyHandoff.checkpoint = {
        ...runReadyHandoff.checkpoint,
        state: "INCOMPLETE",
        firstUnsatisfiedStage: "publication.read_back",
        handoffIdentity: null,
      };
      runReadyHandoff.handoff = null;
      runReadyHandoff.trackerRecordIdentities = [];
    } else {
      runReadyHandoff.targetState = "DIRTY";
    }
    const tasks = Object.fromEntries(["findIssueLane", "create", "read", "message", "wait"].map((name) => [
      name,
      async () => { taskCalls += 1; throw new Error(`unexpected task call ${name}`); },
    ]));
    try {
      const coordinator = createCoordinator({
        store,
        tracker: { async read() { return {}; } },
        tasks,
        handoff: {
          async read({ current }) {
            handoffReads += 1;
            return current.runReadyHandoff;
          },
        },
        reconcile: async () => reconciliation({
          runReadyHandoff,
          nodes: [{
            issueId: "15",
            blockers: [],
            trackerState: "OPEN",
            taskState: "NONE",
            completionState: "NONE",
            candidateReachable: false,
            worktreeState: "ABSENT",
          }],
        }),
        onSelected: async () => { selected += 1; },
        now: () => "2026-09-02T00:00:00.000Z",
        sleep: async () => {},
      });

      const status = await coordinator.run({ specId: "15" });

      assert.equal(status.run.state, "BLOCKED");
      assert.equal(status.runReadyHandoff.state, entryState);
      assert.equal(status.legalActions.length, 0);
      assert.equal(selected, 0);
      assert.equal(taskCalls, 0);
      assert.equal(handoffReads, 1);
      assert.deepEqual(store.readEvents(identity.runId), []);
      assert.equal(store.readWriterLock(identity.runId), null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("Run-ready handoff rejects a stale Planning Seal before Run mutation", async () => {
  const { root, store } = createStoreFixture();
  try {
    const current = reconciliation({
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "ABSENT",
      }],
    });
    current.planningSeal = "d".repeat(40);
    const forbidden = async () => { throw new Error("stale Planning Seal permits no task action"); };
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks: {
        findIssueLane: forbidden,
        create: forbidden,
        read: forbidden,
        message: forbidden,
        wait: forbidden,
      },
      reconcile: async () => current,
      now: () => "2026-09-02T00:00:00.000Z",
      sleep: async () => {},
    });

    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.runReadyHandoff.state, "UNKNOWN");
    assert.equal(status.runReadyHandoff.reasonCode, "selected_authority_conflict");
    assert.match(status.runReadyHandoff.evidence[0], /planningSeal/u);
    assert.deepEqual(status.runReadyHandoff.observed.selectedAuthorityConflict, {
      field: "planningSeal",
      observed: selectedPlanningSeal,
      expected: "d".repeat(40),
    });
    assert.deepEqual(store.readEvents(identity.runId), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Run-ready handoff rejects stale INCOMPLETE authority before Run mutation", async () => {
  const { root, store } = createStoreFixture();
  try {
    const staleFacts = readyHandoffFor(identity);
    staleFacts.authority.specId = "99";
    staleFacts.checkpoint = {
      ...staleFacts.checkpoint,
      state: "ACTIVE",
      specId: "99",
      firstUnsatisfiedStage: "publication",
      handoffIdentity: null,
    };
    staleFacts.handoff = null;
    staleFacts.trackerRecordIdentities = [];
    const current = reconciliation({
      runReadyHandoff: staleFacts,
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "ABSENT",
      }],
    });
    const forbidden = async () => { throw new Error("stale incomplete authority permits no task action"); };
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks: {
        findIssueLane: forbidden,
        create: forbidden,
        read: forbidden,
        message: forbidden,
        wait: forbidden,
      },
      reconcile: async () => current,
      now: () => "2026-09-02T00:00:00.000Z",
      sleep: async () => {},
    });

    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.runReadyHandoff.state, "UNKNOWN");
    assert.equal(status.runReadyHandoff.reasonCode, "selected_authority_conflict");
    assert.equal(status.runReadyHandoff.retryCommand, null);
    assert.deepEqual(status.runReadyHandoff.observed.selectedAuthorityConflict, {
      field: "specId",
      observed: "99",
      expected: "15",
    });
    assert.deepEqual(store.readEvents(identity.runId), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Single-Issue Run creates one lane and closes only after implementation completion", async () => {
  const { root, store } = createStoreFixture();
  const trackerState = {
    trackerState: "OPEN",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
  };
  const taskStates = new Map();
  const created = [];
  const messages = [];
  let taskMode = "execute";
  let closeRequestIdentity = null;
  let clockMinute = 0;
  const now = () => `2026-08-30T00:${String(clockMinute++).padStart(2, "0")}:00.000Z`;

  const tasks = {
    async findIssueLane() {
      return [];
    },
    async create({ issueId }) {
      const taskRef = { threadId: `thread-${issueId}`, hostId: "local" };
      created.push(taskRef);
      taskStates.set(taskRef.threadId, "EXECUTING");
      return taskRef;
    },
    async read(taskRef) {
      return { state: taskStates.get(taskRef.threadId) ?? "INACTIVE", inactiveEvidence: ["settled"] };
    },
    async message(taskRef, message) {
      messages.push({ taskRef, message });
      closeRequestIdentity = closeRequestIdentityFrom(message);
      taskMode = "close";
      taskStates.set(taskRef.threadId, "EXECUTING");
    },
    async wait(taskRefs) {
      assert.equal(taskRefs.length, 1);
      if (taskMode === "execute") {
        trackerState.completionState = "COMPLETE";
        trackerState.worktreeState = "PRESENT";
      } else {
        trackerState.trackerState = "CLOSED";
        trackerState.candidateReachable = true;
        trackerState.worktreeState = "ABSENT";
      }
      taskStates.set(taskRefs[0].threadId, "SETTLED");
      return {
        coordinatorActive: true,
        taskSettled: true,
        ...(taskMode === "close" ? { closeRequestIdentity } : {}),
      };
    },
  };

  const tracker = {
    async read() {
      return { ...trackerState };
    },
  };

  const reconcile = async ({ tracker: currentTracker, journal }) => {
    const dispatch = journal.findLast((event) => event.type === "dispatch.recorded" && event.issueId === "15");
    const taskRef = dispatch?.taskRef ?? null;
    const taskState = taskRef && taskStates.get(taskRef.threadId) === "EXECUTING" ? "EXECUTING" : "NONE";
    return reconciliation({
      taskRefs: taskRef ? { 15: taskRef } : {},
      run: { parentTrackerState: currentTracker.trackerState },
      nodes: [{ issueId: "15", blockers: [], ...currentTracker, taskState }],
    });
  };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "SUCCEEDED");
    assert.equal(created.length, 1);
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /close-issue.*15/iu);
    assert.deepEqual(
      store.readEvents(identity.runId).filter(({ type }) => type === "dispatch.recorded")
        .map(({ issueId, attempt, taskRef }) => ({ issueId, attempt, taskRef })),
      [{ issueId: "15", attempt: 1, taskRef: created[0] }],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a transient failure retries the same reachable Issue lane", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const trackerState = {
    trackerState: "OPEN",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "PRESENT",
    taskState: "TRANSIENT_FAILURE",
  };
  const messages = [];
  let clockMinute = 0;
  const now = () => `2026-08-30T01:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();

  let mode = "retry";
  let closeRequestIdentity = null;
  const tasks = {
    async findIssueLane() {
      throw new Error("retry must not search for a replacement while the task is resumable");
    },
    async create() {
      throw new Error("retry must not create a replacement while the task is resumable");
    },
    async read(actual) {
      assert.deepEqual(actual, taskRef);
      return { state: "RESUMABLE", inactiveEvidence: [] };
    },
    async message(actual, message) {
      assert.deepEqual(actual, taskRef);
      messages.push(message);
      if (/close-issue/iu.test(message)) closeRequestIdentity = closeRequestIdentityFrom(message);
      trackerState.taskState = "EXECUTING";
    },
    async wait() {
      if (mode === "retry") {
        trackerState.taskState = "NONE";
        trackerState.completionState = "COMPLETE";
        mode = "close";
      } else {
        trackerState.trackerState = "CLOSED";
        trackerState.candidateReachable = true;
        trackerState.worktreeState = "ABSENT";
      }
      trackerState.taskState = "NONE";
      return {
        coordinatorActive: true,
        taskSettled: true,
        ...(closeRequestIdentity ? { closeRequestIdentity } : {}),
      };
    },
  };
  const tracker = { async read() { return { ...trackerState }; } };
  const reconcile = async ({ tracker: currentTracker, journal }) => {
    const dispatch = journal.findLast((event) => event.type === "dispatch.recorded" && event.issueId === "15");
    return reconciliation({
      taskRefs: dispatch ? { 15: dispatch.taskRef } : {},
      run: { parentTrackerState: currentTracker.trackerState },
      nodes: [{ issueId: "15", blockers: [], ...currentTracker }],
    });
  };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });
    const events = store.readEvents(identity.runId);

    assert.equal(status.run.state, "SUCCEEDED");
    assert.equal(messages.filter((message) => /execute-issue/iu.test(message)).length, 1);
    assert.equal(messages.filter((message) => /close-issue/iu.test(message)).length, 1);
    assert.deepEqual(
      events.filter(({ type }) => type === "retry.recorded")
        .map(({ issueId, attempt, priorTaskRef, replacement }) => ({ issueId, attempt, priorTaskRef, replacement })),
      [{ issueId: "15", attempt: 1, priorTaskRef: taskRef, replacement: null }],
    );
    assert.deepEqual(
      events.filter(({ type }) => type === "dispatch.recorded").map(({ attempt, taskRef: ref }) => ({ attempt, taskRef: ref })),
      [{ attempt: 1, taskRef }, { attempt: 2, taskRef }],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retry liveness ambiguity fails closed with structured evidence", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let clockMinute = 0;
  const now = () => `2026-08-30T01:${String(clockMinute++).padStart(2, "0")}:30.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();

  const tasks = {
    async findIssueLane() { throw new Error("ambiguous liveness forbids replacement lookup"); },
    async create() { throw new Error("ambiguous liveness forbids replacement creation"); },
    async read(actual) {
      assert.deepEqual(actual, taskRef);
      return { state: "UNKNOWN", inactiveEvidence: [] };
    },
    async message() { throw new Error("ambiguous liveness forbids retry messaging"); },
    async wait() { throw new Error("a structured stop must not wait"); },
  };
  const tracker = { async read() { return {}; } };
  const reconcile = async () => reconciliation({
    taskRefs: { 15: taskRef },
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "TRANSIENT_FAILURE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "PRESENT",
    }],
  });

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "insufficient_evidence");
    assert.deepEqual(status.diagnoses.at(-1).affectedNodes, ["15"]);
    assert.match(status.diagnoses.at(-1).evidence[0], /liveness.*UNKNOWN/iu);
    assert.equal(store.readEvents(identity.runId).some(({ type }) => type === "retry.recorded"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a replacement lane requires exact prior-task inactive evidence", async () => {
  const { root, store } = createStoreFixture();
  const priorTaskRef = { threadId: "thread-15-old", hostId: "local" };
  const replacementTaskRef = { threadId: "thread-15-new", hostId: "local" };
  const inactiveEvidence = ["Task read-back reports terminal failure and no active turn."];
  const trackerState = {
    trackerState: "OPEN",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "PRESENT",
    taskState: "TRANSIENT_FAILURE",
  };
  let clockMinute = 0;
  const now = () => `2026-08-30T02:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef: priorTaskRef });
  seed.release();

  let created = 0;
  let mode = "execute";
  let closeRequestIdentity = null;
  const tasks = {
    async findIssueLane() {
      return [];
    },
    async create() {
      created += 1;
      trackerState.taskState = "EXECUTING";
      return replacementTaskRef;
    },
    async read(actual) {
      if (actual.threadId === priorTaskRef.threadId) {
        assert.deepEqual(actual, priorTaskRef);
        return { state: "INACTIVE", inactiveEvidence };
      }
      assert.deepEqual(actual, replacementTaskRef);
      return { state: "ACTIVE", closeRequest: null };
    },
    async message(actual, message) {
      assert.deepEqual(actual, replacementTaskRef);
      assert.match(message, /close-issue/iu);
      closeRequestIdentity = closeRequestIdentityFrom(message);
      mode = "close";
      trackerState.taskState = "EXECUTING";
    },
    async wait() {
      trackerState.taskState = "NONE";
      if (mode === "execute") {
        trackerState.completionState = "COMPLETE";
      } else {
        trackerState.trackerState = "CLOSED";
        trackerState.candidateReachable = true;
        trackerState.worktreeState = "ABSENT";
      }
      return {
        coordinatorActive: true,
        taskSettled: true,
        ...(mode === "close" ? { closeRequestIdentity } : {}),
      };
    },
  };
  const tracker = { async read() { return { ...trackerState }; } };
  const reconcile = async ({ tracker: currentTracker, journal }) => {
    const dispatch = journal.findLast((event) => event.type === "dispatch.recorded" && event.issueId === "15");
    return reconciliation({
      taskRefs: dispatch ? { 15: dispatch.taskRef } : {},
      run: { parentTrackerState: currentTracker.trackerState },
      nodes: [{ issueId: "15", blockers: [], ...currentTracker }],
    });
  };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });
    const events = store.readEvents(identity.runId);

    assert.equal(status.run.state, "SUCCEEDED");
    assert.equal(created, 1);
    assert.deepEqual(
      events.find(({ type }) => type === "retry.recorded")?.replacement,
      { supersedesAttempt: 1, nextTaskRef: replacementTaskRef, inactiveEvidence },
    );
    assert.deepEqual(
      events.filter(({ type }) => type === "dispatch.recorded").map(({ attempt, taskRef }) => ({ attempt, taskRef })),
      [{ attempt: 1, taskRef: priorTaskRef }, { attempt: 2, taskRef: replacementTaskRef }],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("tracker recovery uses 5 and 15 second probes without consuming Issue retry", async () => {
  const { root, store } = createStoreFixture();
  const sleeps = [];
  let reads = 0;
  const tracker = {
    async read() {
      reads += 1;
      if (reads < 3) throw new Error("tracker offline");
      return {
        trackerState: "CLOSED",
        completionState: "COMPLETE",
        candidateReachable: true,
        worktreeState: "ABSENT",
        taskState: "NONE",
      };
    },
  };
  const unusedTasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} must not run for an already successful node`);
    }]),
  );
  const reconcile = async ({ tracker: currentTracker }) => reconciliation({
    run: { parentTrackerState: "CLOSED" },
    nodes: [{ issueId: "15", blockers: [], ...currentTracker }],
  });

  try {
    const coordinator = createCoordinator({
      store,
      tracker,
      tasks: unusedTasks,
      reconcile,
      now: () => "2026-08-30T03:00:00.000Z",
      sleep: async (delayMs) => sleeps.push(delayMs),
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "SUCCEEDED");
    assert.deepEqual(sleeps, [5_000, 15_000]);
    assert.equal(store.readEvents(identity.runId).some(({ type }) => type === "retry.recorded"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a read-back authority conflict stops immediately without network probes or task actions", async () => {
  const { root, store } = createStoreFixture();
  const sleeps = [];
  let reads = 0;
  const unusedTasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map(name => [name, async () => {
      assert.fail(`${name} must not run for conflicting scope`);
    }]),
  );
  try {
    const coordinator = createCoordinator({ store, tasks: unusedTasks,
      tracker: { async read() { reads++; throw Object.assign(new Error("Current approved Spec publication: expected one exact record, observed 0"), { code: "WORKFLOW_AUTHORITY_CONFLICT" }); } },
      reconcile: async () => assert.fail("conflicting authority cannot reconcile"),
      now: () => "2026-09-06T09:00:00.000Z", sleep: async delay => sleeps.push(delay),
    });
    const status = await coordinator.run({ specId: "15" });
    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses[0].reasonCode, "tracker_authority_conflict");
    assert.match(status.diagnoses[0].evidence[0], /expected one exact record, observed 0/u);
    assert.equal(reads, 1);
    assert.deepEqual(sleeps, []);
    assert.deepEqual(store.readEvents(identity.runId), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("tracker exhaustion probes 5, 15, and 30 seconds and takes no workflow action", async () => {
  const { root, store } = createStoreFixture();
  const sleeps = [];
  const tracker = { async read() { throw new Error("tracker offline"); } };
  const unusedTasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} must not run while tracker evidence is unavailable`);
    }]),
  );

  try {
    const coordinator = createCoordinator({
      store,
      tracker,
      tasks: unusedTasks,
      reconcile: async () => { throw new Error("reconcile must not run without tracker evidence"); },
      now: () => "2026-08-30T04:00:00.000Z",
      sleep: async (delayMs) => sleeps.push(delayMs),
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses[0].reasonCode, "tracker_unavailable");
    assert.deepEqual(status.diagnoses[0].attemptedRecovery, [
      { delayMs: 5_000 },
      { delayMs: 15_000 },
      { delayMs: 30_000 },
    ]);
    assert.deepEqual(sleeps, [5_000, 15_000, 30_000]);
    assert.deepEqual(store.readEvents(identity.runId), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the exact Windows Gradle remediation carries its dispatch attempt", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const trackerState = {
    trackerState: "OPEN",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "PRESENT",
    taskState: "ENVIRONMENT_FAILURE",
    failure: { fingerprint: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT },
  };
  let clockMinute = 0;
  const now = () => `2026-08-30T05:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();

  let mode = "execute";
  let closeRequestIdentity = null;
  const remediationCalls = [];
  const tasks = {
    async findIssueLane() { throw new Error("remediation must not replace the task"); },
    async create() { throw new Error("remediation must not create a task"); },
    async read() { return { state: "RESUMABLE", inactiveEvidence: [] }; },
    async message(actual, message) {
      assert.deepEqual(actual, taskRef);
      assert.match(message, /close-issue/iu);
      closeRequestIdentity = closeRequestIdentityFrom(message);
      mode = "close";
      trackerState.taskState = "EXECUTING";
    },
    async wait() {
      trackerState.taskState = "NONE";
      if (mode === "execute") {
        trackerState.completionState = "COMPLETE";
      } else {
        trackerState.trackerState = "CLOSED";
        trackerState.candidateReachable = true;
        trackerState.worktreeState = "ABSENT";
      }
      return {
        coordinatorActive: true,
        taskSettled: true,
        ...(mode === "close" ? { closeRequestIdentity } : {}),
      };
    },
  };
  const tracker = { async read() { return { ...trackerState }; } };
  const environment = {
    async remediate(input) {
      remediationCalls.push(input);
      trackerState.taskState = "EXECUTING";
    },
  };
  const reconcile = async ({ tracker: currentTracker, journal }) => {
    const dispatch = journal.findLast((event) => event.type === "dispatch.recorded" && event.issueId === "15");
    return reconciliation({
      taskRefs: dispatch ? { 15: dispatch.taskRef } : {},
      run: { parentTrackerState: currentTracker.trackerState },
      nodes: [{ issueId: "15", blockers: [], ...currentTracker }],
    });
  };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, environment, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });
    const events = store.readEvents(identity.runId);

    assert.equal(status.run.state, "SUCCEEDED");
    assert.deepEqual(remediationCalls, [{
      adapter: "gradle-loopback-safe",
      issueId: "15",
      attempt: 1,
      taskRef,
      fingerprint: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT,
      cycle: 1,
    }]);
    assert.deepEqual(
      events.filter(({ type }) => type === "remediation.recorded")
        .map(({ issueId, attempt, fingerprint, cycle, adapter }) => ({
          issueId,
          attempt,
          fingerprint,
          cycle,
          adapter,
        })),
      [{
        issueId: "15",
        attempt: 1,
        fingerprint: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT,
        cycle: 1,
        adapter: "gradle-loopback-safe",
      }],
    );
    assert.equal(events.some(({ type }) => type === "retry.recorded"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("re-entry adopts a settled task and partial close after coordinator loss", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const trackerState = {
    trackerState: "OPEN",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
  };
  let taskState = "NONE";
  let created = 0;
  let closeMessages = 0;
  let closeRequestIdentity = null;
  let coordinatorActive = false;
  let clockMinute = 0;
  const now = () => `2026-08-30T06:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const tasks = {
    async findIssueLane() { return []; },
    async create() {
      created += 1;
      taskState = "EXECUTING";
      return taskRef;
    },
    async read() { return { state: taskState === "NONE" ? "INACTIVE" : "RESUMABLE", inactiveEvidence: ["settled"] }; },
    async message(actual, message) {
      assert.deepEqual(actual, taskRef);
      assert.match(message, /close-issue/iu);
      closeRequestIdentity = closeRequestIdentityFrom(message);
      closeMessages += 1;
      taskState = "EXECUTING";
    },
    async wait() {
      if (!coordinatorActive) return { coordinatorActive: false };
      trackerState.trackerState = "CLOSED";
      taskState = "NONE";
      return { coordinatorActive: true, taskSettled: true, closeRequestIdentity };
    },
  };
  const tracker = { async read() { return { ...trackerState }; } };
  const reconcile = async ({ tracker: currentTracker, journal }) => {
    const dispatch = journal.findLast((event) => event.type === "dispatch.recorded" && event.issueId === "15");
    return reconciliation({
      taskRefs: dispatch ? { 15: dispatch.taskRef } : {},
      run: { parentTrackerState: currentTracker.trackerState },
      nodes: [{ issueId: "15", blockers: [], ...currentTracker, taskState }],
    });
  };

  try {
    const first = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const interrupted = await first.run({ specId: "15" });
    assert.equal(interrupted.run.state, "RUNNING");
    assert.equal(created, 1);
    assert.equal(closeMessages, 0);

    trackerState.completionState = "COMPLETE";
    trackerState.candidateReachable = true;
    trackerState.worktreeState = "ABSENT";
    taskState = "NONE";
    coordinatorActive = true;

    const resumed = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const completed = await resumed.run({ specId: "15" });
    assert.equal(completed.run.state, "SUCCEEDED");
    assert.equal(created, 1);
    assert.equal(closeMessages, 1);
    assert.equal(store.readEvents(identity.runId).filter(({ type }) => type === "dispatch.recorded").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a Multi-Issue Run releases published blockers and closes the parent last", async () => {
  const { root, store } = createStoreFixture();
  const trackerState = {
    parentTrackerState: "OPEN",
    nodes: {
      13: { trackerState: "CLOSED", completionState: "COMPLETE", candidateReachable: true, worktreeState: "ABSENT" },
      14: { trackerState: "CLOSED", completionState: "COMPLETE", candidateReachable: true, worktreeState: "ABSENT" },
      15: { trackerState: "OPEN", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" },
    },
  };
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let taskState = "NONE";
  let taskMode = "execute";
  const createdIssues = [];
  const parentCloses = [];
  let closeRequestIdentity = null;
  let clockMinute = 0;
  const now = () => `2026-08-30T07:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const tasks = {
    async findIssueLane() { return []; },
    async create({ issueId }) {
      createdIssues.push(issueId);
      taskState = "EXECUTING";
      return taskRef;
    },
    async read() { return { state: "RESUMABLE", inactiveEvidence: [] }; },
    async message(actual, message) {
      assert.deepEqual(actual, taskRef);
      assert.match(message, /close-issue.*15/iu);
      closeRequestIdentity = closeRequestIdentityFrom(message);
      taskMode = "close";
      taskState = "EXECUTING";
    },
    async wait() {
      taskState = "NONE";
      if (taskMode === "execute") {
        trackerState.nodes[15].completionState = "COMPLETE";
        trackerState.nodes[15].worktreeState = "PRESENT";
      } else {
        trackerState.nodes[15].trackerState = "CLOSED";
        trackerState.nodes[15].candidateReachable = true;
        trackerState.nodes[15].worktreeState = "ABSENT";
      }
      return {
        coordinatorActive: true,
        taskSettled: true,
        ...(taskMode === "close" ? { closeRequestIdentity } : {}),
      };
    },
  };
  const tracker = {
    async read() {
      return {
        parentTrackerState: trackerState.parentTrackerState,
        nodes: Object.fromEntries(Object.entries(trackerState.nodes).map(([issueId, node]) => [issueId, { ...node }])),
      };
    },
  };
  const leaf = {
    async closeParent(input) {
      parentCloses.push(input);
      trackerState.parentTrackerState = "CLOSED";
      return { settled: true, requestIdentity: input.requestIdentity };
    },
  };
  const reconcile = async ({ tracker: currentTracker, journal }) => {
    const dispatch = journal.findLast((event) => event.type === "dispatch.recorded" && event.issueId === "15");
    return reconciliation({
      runIdentity: multiIdentity,
      taskRefs: dispatch ? { 15: dispatch.taskRef } : {},
      run: { parentTrackerState: currentTracker.parentTrackerState },
      nodes: [
        { issueId: "13", blockers: [], ...currentTracker.nodes[13], taskState: "NONE" },
        { issueId: "14", blockers: [], ...currentTracker.nodes[14], taskState: "NONE" },
        { issueId: "15", blockers: ["13", "14"], ...currentTracker.nodes[15], taskState },
      ],
    });
  };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, leaf, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "12" });

    assert.equal(status.run.state, "SUCCEEDED");
    assert.deepEqual(createdIssues, ["15"]);
    assert.equal(parentCloses.length, 1);
    assert.deepEqual(
      { issueId: parentCloses[0].issueId, runIdentity: parentCloses[0].runIdentity },
      { issueId: "12", runIdentity: multiIdentity },
    );
    assert.equal(parentCloses[0].requestEvidence.target, multiIdentity.target);
    assert.equal(parentCloses[0].requestEvidence.childCloseStates.length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("default max_parallel adopts one lane and creates only two more of four ready Issues", async () => {
  const { root, store } = createStoreFixture();
  const adopted = { threadId: "thread-13-existing", hostId: "local" };
  const createdIssues = [];
  let clockMinute = 0;
  const now = () => `2026-08-30T08:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const tasks = {
    async findIssueLane({ issueId }) {
      return issueId === "13" ? [adopted] : [];
    },
    async create({ issueId }) {
      createdIssues.push(issueId);
      const taskRef = { threadId: `thread-${issueId}`, hostId: "local" };
      return taskRef;
    },
    async read() { return { state: "RESUMABLE", inactiveEvidence: [] }; },
    async message() { throw new Error("no close is legal before completion"); },
    async wait() { return { coordinatorActive: false }; },
  };
  const tracker = { async read() { return {}; } };
  const reconcile = async ({ journal }) => reconciliation({
    runIdentity: multiIdentity,
    taskRefs: Object.fromEntries(
      journal.filter(({ type }) => type === "dispatch.recorded").map(({ issueId, taskRef }) => [issueId, taskRef]),
    ),
    nodes: ["13", "14", "15", "16"].map((issueId) => ({
      issueId,
      blockers: [],
      trackerState: "OPEN",
      taskState: journal.some((event) => event.type === "dispatch.recorded" && event.issueId === issueId)
        ? "EXECUTING"
        : "NONE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "ABSENT",
    })),
  });

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "12" });
    const dispatches = store.readEvents(multiIdentity.runId)
      .filter(({ type }) => type === "dispatch.recorded");

    assert.equal(status.run.state, "RUNNING");
    assert.deepEqual(dispatches.map(({ issueId }) => issueId), ["13", "14", "15"]);
    assert.deepEqual(dispatches[0].taskRef, adopted);
    assert.deepEqual(createdIssues, ["14", "15"]);
    assert.equal(dispatches.some(({ issueId }) => issueId === "16"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("operation identity remains owner-derived while an unknown environment fingerprint stops", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let clockMinute = 0;
  const now = () => `2026-08-30T09:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  let taskState = "NONE";
  let remediationCalls = 0;
  const tasks = {
    async findIssueLane() { return []; },
    async create() { taskState = "ENVIRONMENT_FAILURE"; return taskRef; },
    async read() { throw new Error("no retry is legal"); },
    async message() { throw new Error("no retry is legal"); },
    async wait() { throw new Error("no wait is legal"); },
  };
  const tracker = { async read() { return {}; } };
  const runReadyHandoff = {
    ...readyHandoffFor(identity),
    operationIdentity: { key: identity.runId },
  };
  let reconciliations = 0;
  const reconcile = async () => {
    reconciliations += 1;
    return reconciliation({
      runIdentity: reconciliations === 1
        ? identity
        : { ...identity, runId: "caller-correlation-after-environment-stop" },
      runReadyHandoff,
      taskRefs: { 15: taskRef },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState,
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "PRESENT",
        failure: { fingerprint: "windows:some-other-environment-failure" },
      }],
    });
  };
  const environment = {
    async remediate() {
      remediationCalls += 1;
    },
  };

  try {
    const coordinator = createCoordinator({
      store,
      tracker,
      tasks,
      reconcile,
      environment,
      now,
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.deepEqual(status.legalActions, []);
    assert.equal(status.diagnoses.at(-1).reasonCode, "environment_unresolved");
    assert.deepEqual(status.diagnoses.at(-1).affectedNodes, ["15"]);
    assert.equal(remediationCalls, 0);
    assert.equal(
      store.readEvents(identity.runId).some(({ type }) => type === "remediation.recorded"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reconcile_run reacquires owning facts before waiting on active work", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let clockMinute = 0;
  let reconcileCalls = 0;
  const now = () => `2026-08-30T10:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();
  const tasks = {
    async findIssueLane() { throw new Error("no dispatch is legal"); },
    async create() { throw new Error("no dispatch is legal"); },
    async read() { return { state: "RESUMABLE", inactiveEvidence: [] }; },
    async message() { throw new Error("no message is legal"); },
    async wait() { return { coordinatorActive: false }; },
  };
  const tracker = { async read() { return {}; } };
  const reconcile = async () => {
    reconcileCalls += 1;
    return reconciliation({
      taskRefs: { 15: taskRef },
      run: { reconciled: reconcileCalls >= 3 },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "EXECUTING",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }],
    });
  };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "RUNNING");
    assert.equal(reconcileCalls, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [command, terminalState, transitionType] of [
  ["PAUSE", "PAUSED", "pause.transitioned"],
  ["STOP", "STOPPED", "stop.transitioned"],
]) {
  test(`${command} control revision abandons stale legal actions after the current action`, async () => {
    const { root, store } = createStoreFixture();
    const closeTaskRef = { threadId: "thread-13", hostId: "local" };
    const remediationTaskRef = { threadId: "thread-14", hostId: "local" };
    let clockMinute = 0;
    const now = () => `2026-08-30T10:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
    const seed = store.acquireWriter(multiIdentity.runId);
    seed.append({ type: "grant.recorded", at: now(), runIdentity: multiIdentity, maxParallel: 3 });
    seed.append({ type: "dispatch.recorded", at: now(), issueId: "13", attempt: 1, taskRef: closeTaskRef });
    seed.append({ type: "dispatch.recorded", at: now(), issueId: "14", attempt: 1, taskRef: remediationTaskRef });
    seed.release();

    let appendControl;
    let remediationCalls = 0;
    const tasks = {
      async findIssueLane() { throw new Error("stale dispatch must not start"); },
      async create() { throw new Error("stale dispatch must not create a lane"); },
      async read() { throw new Error("stale close must not read its lane"); },
      async message() { throw new Error("stale close must not send a request"); },
      async wait() { throw new Error("stale close must not wait"); },
    };
    const tracker = { async read() { return {}; } };
    const environment = {
      async remediate() {
        remediationCalls += 1;
        appendControl({ type: "control.revised", at: now(), revision: 1, command });
      },
    };
    const panel = {
      async open({ appendEvent }) {
        appendControl = appendEvent;
        return { async close() {} };
      },
    };
    const reconcile = async ({ journal }) => {
      const taskRefs = Object.fromEntries(journal
        .filter(({ type }) => type === "dispatch.recorded")
        .map(({ issueId, taskRef }) => [issueId, taskRef]));
      return reconciliation({
        runIdentity: multiIdentity,
        taskRefs,
        nodes: [
          {
            issueId: "13",
            blockers: [],
            trackerState: "OPEN",
            taskState: "NONE",
            completionState: "COMPLETE",
            candidateReachable: false,
            worktreeState: "PRESENT",
          },
          {
            issueId: "14",
            blockers: [],
            trackerState: "OPEN",
            taskState: "ENVIRONMENT_FAILURE",
            completionState: "NONE",
            candidateReachable: false,
            worktreeState: "PRESENT",
            failure: { fingerprint: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT },
          },
          {
            issueId: "15",
            blockers: [],
            trackerState: "OPEN",
            taskState: "NONE",
            completionState: "NONE",
            candidateReachable: false,
            worktreeState: "ABSENT",
          },
        ],
      });
    };

    try {
      const coordinator = createCoordinator({
        store,
        tracker,
        tasks,
        reconcile,
        environment,
        panel,
        now,
        sleep: async () => {},
      });
      const status = await coordinator.run({ specId: "12" });
      const events = store.readEvents(multiIdentity.runId);

      assert.equal(status.run.state, terminalState);
      assert.equal(remediationCalls, 1);
      assert.equal(events.some(({ type }) => type === "remediation.recorded"), true);
      assert.equal(events.some(({ type, issueId }) => type === "dispatch.recorded" && issueId === "15"), false);
      assert.deepEqual(
        events.filter(({ type }) => type === transitionType).map(({ revision }) => revision),
        [1],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const [command, action, terminalState] of [
  ["PAUSE", "pause.transitioned", "PAUSED"],
  ["STOP", "stop.transitioned", "STOPPED"],
]) {
  test(`${command} settles only through its reducer-authorized transition`, async () => {
    const { root, store } = createStoreFixture();
    let clockMinute = 0;
    const now = () => `2026-08-30T11:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
    const seed = store.acquireWriter(identity.runId);
    seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
    seed.append({ type: "control.revised", at: now(), revision: 1, command });
    seed.release();
    const tasks = {
      async findIssueLane() { throw new Error("control creates no lane"); },
      async create() { throw new Error("control creates no lane"); },
      async read() { throw new Error("control reads no lane"); },
      async message() { throw new Error("control messages no lane"); },
      async wait() { throw new Error("settled control has no active lane"); },
    };
    const tracker = { async read() { return {}; } };
    const reconcile = async () => reconciliation({
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "ABSENT",
      }],
    });

    try {
      const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
      const status = await coordinator.run({ specId: "15" });
      const transitions = store.readEvents(identity.runId).filter(({ type }) => type === action);

      assert.equal(status.run.state, terminalState);
      assert.deepEqual(transitions.map(({ revision }) => revision), [1]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("ambiguous Codex Issue lanes fail closed with a structured diagnosis", async () => {
  const { root, store } = createStoreFixture();
  let clockMinute = 0;
  const now = () => `2026-08-30T12:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const tasks = {
    async findIssueLane() {
      return [
        { threadId: "thread-15-a", hostId: "local" },
        { threadId: "thread-15-b", hostId: "local" },
      ];
    },
    async create() { throw new Error("ambiguity forbids task creation"); },
    async read() { throw new Error("no task was selected"); },
    async message() { throw new Error("no task was selected"); },
    async wait() { throw new Error("no task was selected"); },
  };
  const tracker = { async read() { return {}; } };
  const reconcile = async () => reconciliation({
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "ABSENT",
    }],
  });

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.deepEqual(status.legalActions, []);
    assert.equal(status.diagnoses.at(-1).reasonCode, "issue_lane_ambiguous");
    assert.deepEqual(status.diagnoses.at(-1).affectedNodes, ["15"]);
    assert.deepEqual(status.diagnoses.at(-1).resumePredicates, ["one_exact_issue_lane_is_proven"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale accepted close request blocks instead of reusing or duplicating closeout", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const seed = store.acquireWriter(identity.runId);
  seed.append({
    type: "grant.recorded",
    at: "2026-08-30T12:59:00.000Z",
    runIdentity: identity,
    maxParallel: 3,
  });
  seed.append({
    type: "dispatch.recorded",
    at: "2026-08-30T12:59:01.000Z",
    issueId: "15",
    attempt: 1,
    taskRef,
  });
  seed.release();
  let messageCalls = 0;
  let waitCalls = 0;
  const tasks = {
    async findIssueLane() { throw new Error("no dispatch is legal"); },
    async create() { throw new Error("no dispatch is legal"); },
    async read() {
      return {
        state: "ACTIVE",
        closeRequest: {
          state: "ACCEPTED",
          runId: identity.runId,
          issueId: "15",
          requestIdentity: `sha256:${"f".repeat(64)}`,
        },
      };
    },
    async message() { messageCalls += 1; },
    async wait() { waitCalls += 1; return { coordinatorActive: false }; },
  };
  const reconcile = async () => reconciliation({
    taskRefs: { 15: taskRef },
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "COMPLETE",
      candidateReachable: false,
      worktreeState: "PRESENT",
    }],
  });

  try {
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => "2026-08-30T13:00:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "close_request_evidence_changed");
    assert.equal(messageCalls, 0);
    assert.equal(waitCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("settled close response must match the current request identity", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const seed = store.acquireWriter(identity.runId);
  seed.append({
    type: "grant.recorded",
    at: "2026-08-30T12:59:00.000Z",
    runIdentity: identity,
    maxParallel: 3,
  });
  seed.append({
    type: "dispatch.recorded",
    at: "2026-08-30T12:59:01.000Z",
    issueId: "15",
    attempt: 1,
    taskRef,
  });
  seed.release();
  let closeRequest = null;
  let waitCalls = 0;
  const tasks = {
    async findIssueLane() { throw new Error("no dispatch is legal"); },
    async create() { throw new Error("no dispatch is legal"); },
    async read() { return { state: "ACTIVE", closeRequest }; },
    async message(_taskRef, prompt) {
      const requestIdentity = closeRequestIdentityFrom(prompt);
      closeRequest = { state: "ACCEPTED", runId: identity.runId, issueId: "15", requestIdentity };
    },
    async wait() {
      waitCalls += 1;
      return waitCalls === 1
        ? {
            coordinatorActive: true,
            taskSettled: true,
            closeRequestIdentity: `sha256:${"e".repeat(64)}`,
          }
        : { coordinatorActive: false };
    },
  };
  const reconcile = async () => reconciliation({
    taskRefs: { 15: taskRef },
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "COMPLETE",
      candidateReachable: false,
      worktreeState: "PRESENT",
    }],
  });

  try {
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => "2026-08-30T13:00:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "close_request_evidence_changed");
    assert.equal(waitCalls, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("re-entry observes an accepted close request instead of sending a duplicate", async () => {
  const { root, gitCommonDir, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const trackerState = {
    trackerState: "OPEN",
    completionState: "COMPLETE",
    candidateReachable: false,
    worktreeState: "PRESENT",
  };
  let closeRequest = null;
  let messageCalls = 0;
  let waitCalls = 0;
  let clockMinute = 0;
  const now = () => `2026-08-30T13:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();
  const tasks = {
    async findIssueLane() { throw new Error("no dispatch is legal"); },
    async create() { throw new Error("no dispatch is legal"); },
    async read() { return { state: "ACTIVE", closeRequest }; },
    async message(_taskRef, prompt) {
      messageCalls += 1;
      const requestIdentity = closeRequestIdentityFrom(prompt);
      closeRequest = { runId: identity.runId, issueId: "15", state: "ACCEPTED", requestIdentity };
    },
    async wait() {
      waitCalls += 1;
      if (waitCalls === 1) return { coordinatorActive: false };
      trackerState.trackerState = "CLOSED";
      trackerState.candidateReachable = true;
      trackerState.worktreeState = "ABSENT";
      return {
        coordinatorActive: true,
        taskSettled: true,
        closeRequestIdentity: closeRequest.requestIdentity,
      };
    },
  };
  const tracker = { async read() { return { ...trackerState }; } };
  const reconcile = async ({ tracker: currentTracker }) => reconciliation({
      taskRefs: { 15: taskRef },
      run: { parentTrackerState: currentTracker.trackerState },
      nodes: [{ issueId: "15", blockers: [], ...currentTracker, taskState: "NONE" }],
  });

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const interrupted = await coordinator.run({ specId: "15" });
    assert.deepEqual(store.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    assert.deepEqual(store.observeTargetMutationWriter({ target: identity.target }), {
      state: "ABSENT",
      owner: null,
    });
    const recoveredStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "coordinator-recovered" });
    const recovered = createCoordinator({
      store: recoveredStore,
      tracker,
      tasks,
      reconcile,
      now,
      sleep: async () => {},
    });
    const resumed = await recovered.run({ specId: "15" });

    assert.equal(interrupted.run.state, "RUNNING");
    assert.equal(resumed.run.state, "SUCCEEDED");
    assert.equal(messageCalls, 1);
    assert.equal(waitCalls, 2);
    assert.deepEqual(recoveredStore.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    assert.deepEqual(recoveredStore.observeTargetMutationWriter({ target: identity.target }), {
      state: "ABSENT",
      owner: null,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uncertain target mutation writer evidence stops before lane messaging", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let clockMinute = 0;
  const now = () => `2026-08-30T13:${String(clockMinute++).padStart(2, "0")}:30.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();
  const competing = store.acquireTargetMutationWriter({
    target: identity.target,
    operationId: "run-competing",
  });
  const sharedWriterStore = {
    ...store,
    readLeaseHealth() { return "UNKNOWN"; },
    acquireCloseWriter() { throw new Error("legacy close writer API must not drive new closeout"); },
    readCloseWriterLock() { throw new Error("legacy close writer API must not drive new closeout"); },
    reclaimCloseWriter() { throw new Error("legacy close writer API must not drive new closeout"); },
  };
  let taskCalls = 0;
  const recoveryDelays = [];
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      taskCalls += 1;
      throw new Error(`${name} is forbidden while another Run owns the target close writer`);
    }]),
  );
  const tracker = { async read() { return {}; } };
  const reconcile = async () => {
    const owner = store.readTargetMutationWriterLock(identity.target);
    return reconciliation({
      taskRefs: { 15: taskRef },
      run: {
        closeWriterRunId: owner.operationId,
        closeWriterState: "ACTIVE",
        closeWriterHealth: "UNKNOWN",
        closeWriterOwner: owner,
      },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }],
    });
  };

  try {
    const coordinator = createCoordinator({
      store: sharedWriterStore,
      tracker,
      tasks,
      reconcile,
      now,
      sleep: async delayMs => { recoveryDelays.push(delayMs); },
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "target_writer_health_unknown");
    assert.match(status.diagnoses.at(-1).evidence.join(" "), /UNKNOWN is not inactive ownership/u);
    assert.deepEqual(status.diagnoses.at(-1).affectedNodes, ["15"]);
    assert.deepEqual(recoveryDelays, [5000, 15000, 30000]);
    assert.equal(store.listHostFaults(identity.runId).at(-1).state, "exhausted");
    assert.equal(store.readEvents(identity.runId).findLast(event => event.type === "target-writer-wait.settled").outcome,
      "OWNER_HEALTH_UNKNOWN");
    assert.equal(taskCalls, 0);
    assert.equal(store.readTargetMutationWriterLock(identity.target).operationId, "run-competing");
  } finally {
    competing.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("separate owner-health fault episodes each use a fresh shared bounded policy and retain exact ownership", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: "2026-08-30T13:20:00.000Z", runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: "2026-08-30T13:20:01.000Z", issueId: "15", attempt: 1, taskRef });
  seed.release();
  const competing = store.acquireTargetMutationWriter({ target: identity.target, operationId: "run-health-recovery" });
  const healthStates = ["UNKNOWN", "UNKNOWN", "HEALTHY", "UNKNOWN", "HEALTHY"];
  const recoveryStore = {
    ...store,
    readLeaseHealth() { return healthStates.shift() ?? "HEALTHY"; },
  };
  const owner = store.readTargetMutationWriterLock(identity.target);
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map(name => [name, async () => {
      throw new Error(`${name} is forbidden during writer health recovery`);
    }]),
  );
  const reconcile = async () => reconciliation({
    taskRefs: { 15: taskRef },
    run: { closeWriterRunId: owner.operationId, closeWriterState: "ACTIVE", closeWriterHealth: "UNKNOWN", closeWriterOwner: owner },
    nodes: [{ issueId: "15", blockers: [], trackerState: "OPEN", taskState: "NONE", completionState: "COMPLETE",
      candidateReachable: false, worktreeState: "PRESENT" }],
  });
  const delays = [];
  let observationSlices = 0;

  try {
    const status = await createCoordinator({ store: recoveryStore, tracker: { async read() { return {}; } }, tasks,
      reconcile, now: () => "2026-08-30T13:20:02.000Z",
      sleep: async delayMs => {
        delays.push(delayMs);
        if (delayMs === 1000 && ++observationSlices >= 2) return { coordinatorActive: false };
        return undefined;
      } })
      .run({ specId: "15" });

    assert.equal(status.diagnoses.at(-1).reasonCode, "target_writer_wait_coordinator_lost");
    assert.deepEqual(delays, [5000, 15000, 1000, 5000, 1000]);
    const fault = store.listHostFaults(identity.runId).at(-1);
    assert.deepEqual({ state: fault.state, recoveryRounds: fault.recoveryRounds }, { state: "settled", recoveryRounds: 1 });
    assert.equal(store.readTargetMutationWriterLock(identity.target).operationId, "run-health-recovery");
  } finally {
    competing.release();
    rmSync(root, { recursive: true, force: true });
  }
});

const singlePreWaitEvidence = () => createTargetWriterWaitEvidence({
  runIdentity: identity,
  grant: { runIdentity: identity, maxParallel: 3 },
  run: {
    trackerAvailable: true,
    targetState: "CLEAN",
    targetHead: "a".repeat(40),
    parentTrackerState: "OPEN",
    parentTrackerIdentity: null,
  },
  nodes: [withCloseAuthorityEvidence({
    issueId: "15",
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "COMPLETE",
    candidateReachable: false,
    worktreeState: "PRESENT",
  })],
  controlRevision: 0,
});

test("closeout operation identity excludes a second target and uses one order for direct and DAG authority", () => {
  const { root, store } = createStoreFixture();
  const observedOrders = [];

  const acquireObservedLeaf = ({ authority, issueId, approvedPublicationIdentity, target }) => {
    const order = [];
    const observedStore = {
      acquireRepositoryCloseLease(request) {
        const lease = store.acquireRepositoryCloseLease(request);
        order.push("repository:acquired");
        return {
          ...lease,
          release() {
            lease.release();
            order.push("repository:released");
          },
        };
      },
      acquireTargetMutationWriter(request) {
        const writer = store.acquireTargetMutationWriter(request);
        order.push("target:acquired");
        return {
          ...writer,
          release() {
            writer.release();
            order.push("target:released");
          },
        };
      },
    };

    const unrelatedPlanning = store.acquireTargetMutationWriter({
      target: `${target}-planning`,
      operationId: `${issueId}-planning`,
    });
    unrelatedPlanning.release();

    const leases = acquireCloseIssueLeases({
      store: observedStore,
      target,
      repositoryId: "github:ron03wlb/skills",
      specId: "43",
      approvedPublicationIdentity,
      issueId,
    });
    assert.match(leases.operationId, /^workflow-op-v1-[a-f0-9]{64}$/u);
    assert.equal(leases.assertCurrent(), true, `${authority} lost closeout ownership`);
    return { leases, order };
  };

  try {
    assert.throws(
      () => acquireCloseIssueLeases({
        store,
        target: "features/ron",
        repositoryId: "github:ron03wlb/skills",
        specId: "43",
        approvedPublicationIdentity: "sha256:approved-revision-1",
        issueId: "44",
        operationId: "caller-defined-close-key",
      }),
      /unknown field operationId/u,
    );
    const direct = acquireObservedLeaf({
      authority: "direct",
      issueId: "44",
      approvedPublicationIdentity: "sha256:approved-revision-1",
      target: "features/ron",
    });
    assert.throws(
      () => acquireCloseIssueLeases({
        store,
        target: "release/next",
        repositoryId: "github:ron03wlb/skills",
        specId: "43",
        approvedPublicationIdentity: "sha256:approved-revision-2",
        issueId: "46",
      }),
      /REPOSITORY_CLOSE_LEASE_LOCKED/u,
    );
    direct.leases.release();
    observedOrders.push(direct.order);

    const dag = acquireObservedLeaf({
      authority: "DAG",
      issueId: "46",
      approvedPublicationIdentity: "sha256:approved-revision-2",
      target: "release/next",
    });
    dag.leases.release();
    observedOrders.push(dag.order);
    assert.deepEqual(observedOrders, [
      ["repository:acquired", "target:acquired", "target:released", "repository:released"],
      ["repository:acquired", "target:acquired", "target:released", "repository:released"],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("real close leaf owns both leases without coordinator double acquire", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const seed = store.acquireWriter(identity.runId);
  seed.append({
    type: "grant.recorded",
    at: "2026-09-03T00:00:00.000Z",
    runIdentity: identity,
    maxParallel: 3,
  });
  seed.append({
    type: "dispatch.recorded",
    at: "2026-09-03T00:00:01.000Z",
    issueId: "15",
    attempt: 1,
    taskRef,
  });
  seed.release();
  let closed = false;
  let closeAccepted = false;
  let closeRequestIdentity = null;
  let coordinatorLeaseCalls = 0;
  const coordinatorStore = {
    ...store,
    acquireRepositoryCloseLease() {
      coordinatorLeaseCalls += 1;
      throw new Error("coordinator must not acquire the repository close lease");
    },
    acquireTargetMutationWriter() {
      coordinatorLeaseCalls += 1;
      throw new Error("coordinator must not acquire the target mutation writer");
    },
  };
  const tasks = {
    async findIssueLane() { return [taskRef]; },
    async create() { throw new Error("the existing Issue lane must be reused"); },
    async read() {
      return {
        state: "ACTIVE",
        closeRequest: closeAccepted
          ? { state: "ACCEPTED", runId: identity.runId, issueId: "15", requestIdentity: closeRequestIdentity }
          : null,
      };
    },
    async message(_taskRef, prompt) {
      assert.match(prompt, /\$close-issue.*15/iu);
      assert.match(prompt, /"target":"features\/ron"/u);
      assert.match(prompt, /"targetState":"CLEAN"/u);
      assert.match(prompt, new RegExp(`"targetHead":"${"a".repeat(40)}"`, "u"));
      assert.match(prompt, /"completionState":"COMPLETE"/u);
      assert.match(prompt, /"worktreeState":"PRESENT"/u);
      assert.match(prompt, /"controlRevision":0/u);
      closeRequestIdentity = closeRequestIdentityFrom(prompt);
      const leases = acquireCloseIssueLeases({
        store,
        target: identity.target,
        repositoryId: "github:ron03wlb/skills",
        specId: identity.specId,
        approvedPublicationIdentity: identity.approvedScopeHash,
        issueId: "15",
      });
      assert.equal(leases.assertCurrent(), true);
      closeAccepted = true;
      closed = true;
      leases.release();
    },
    async wait() { return { coordinatorActive: true, taskSettled: true, closeRequestIdentity }; },
  };
  const reconcile = async () => reconciliation({
    taskRefs: { 15: taskRef },
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: closed ? "CLOSED" : "OPEN",
      taskState: "NONE",
      completionState: "COMPLETE",
      candidateReachable: closed,
      worktreeState: closed ? "ABSENT" : "PRESENT",
    }],
  });

  try {
    const coordinator = createCoordinator({
      store: coordinatorStore,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => "2026-09-03T00:01:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: identity.specId });

    assert.equal(status.run.state, "SUCCEEDED");
    assert.equal(coordinatorLeaseCalls, 0);
    assert.deepEqual(store.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    assert.deepEqual(store.observeTargetMutationWriter({ target: identity.target }), {
      state: "ABSENT",
      owner: null,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository close wait dispatches within max_parallel before requesting the close leaf", async () => {
  const { root, store } = createStoreFixture();
  const closeTaskRef = { threadId: "thread-13", hostId: "local" };
  const executeTaskRef = { threadId: "thread-14", hostId: "local" };
  const seed = store.acquireWriter(multiIdentity.runId);
  seed.append({
    type: "grant.recorded",
    at: "2026-09-03T01:00:00.000Z",
    runIdentity: multiIdentity,
    maxParallel: 1,
  });
  seed.append({
    type: "dispatch.recorded",
    at: "2026-09-03T01:00:01.000Z",
    issueId: "13",
    attempt: 1,
    taskRef: closeTaskRef,
  });
  seed.release();
  const competing = store.acquireRepositoryCloseLease({
    operationId: `workflow-op-v1-${"b".repeat(64)}`,
  });
  let competingReleased = false;
  let issue14Dispatched = false;
  let closeRequestIdentity = null;
  const order = [];
  const tasks = {
    async findIssueLane({ issueId }) {
      if (issueId === "13") return [closeTaskRef];
      if (issueId === "14") return [];
      throw new Error(`unexpected Issue ${issueId}`);
    },
    async create({ issueId }) {
      assert.equal(issueId, "14");
      issue14Dispatched = true;
      order.push("dispatch:14");
      return executeTaskRef;
    },
    async read() { return {}; },
    async message(_taskRef, prompt) {
      assert.equal(issue14Dispatched, true, "legal Issue dispatch must precede close waiting");
      assert.match(prompt, /\$close-issue.*13/iu);
      closeRequestIdentity = closeRequestIdentityFrom(prompt);
      order.push("close:13");
    },
    async wait() { return { coordinatorActive: false, taskSettled: true, closeRequestIdentity }; },
  };
  const reconcile = async () => {
    const repositoryLease = store.observeRepositoryCloseLease();
    return reconciliation({
      runIdentity: multiIdentity,
      maxParallel: 1,
      taskRefs: { 13: closeTaskRef, ...(issue14Dispatched ? { 14: executeTaskRef } : {}) },
      run: {
        repositoryCloseLeaseOperationId: repositoryLease.owner?.operationId ?? null,
        repositoryCloseLeaseState: repositoryLease.state === "ABSENT" ? "ABSENT" : "ACTIVE",
        repositoryCloseLeaseHealth: repositoryLease.state === "ABSENT" ? null : "HEALTHY",
        repositoryCloseLeaseOwner: repositoryLease.owner,
      },
      nodes: [
        {
          issueId: "13",
          blockers: [],
          trackerState: "OPEN",
          taskState: "NONE",
          completionState: "COMPLETE",
          candidateReachable: false,
          worktreeState: "PRESENT",
        },
        {
          issueId: "14",
          blockers: [],
          trackerState: "OPEN",
          taskState: issue14Dispatched ? "EXECUTING" : "NONE",
          completionState: "NONE",
          candidateReachable: false,
          worktreeState: issue14Dispatched ? "PRESENT" : "ABSENT",
        },
      ],
    });
  };

  try {
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: (() => {
        let second = 2;
        return () => `2026-09-03T01:00:${String(second++).padStart(2, "0")}.000Z`;
      })(),
      sleep: async () => {
        if (!competingReleased) {
          competing.release();
          competingReleased = true;
        }
      },
    });
    const status = await coordinator.run({ specId: multiIdentity.specId });
    const waitEvents = store.readEvents(multiIdentity.runId)
      .filter(({ type }) => type.startsWith("repository-close-wait."));

    assert.equal(status.run.state, "RUNNING", JSON.stringify(status));
    assert.deepEqual(order, ["dispatch:14", "close:13"]);
    assert.deepEqual(waitEvents.map(({ type, outcome }) => [type, outcome ?? null]), [
      ["repository-close-wait.started", null],
      ["repository-close-wait.settled", "RELEASED"],
    ]);
    assert.equal(store.readEvents(multiIdentity.runId)
      .filter(({ type, issueId }) => type === "dispatch.recorded" && issueId === "14").length, 1);
  } finally {
    if (!competingReleased) competing.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("healthy repository close wait remains fair beyond twelve virtual hours and only settles on coordinator loss", async () => {
  const { root, store } = createStoreFixture();
  const competitorOperationId = `workflow-op-v1-${"c".repeat(64)}`;
  const competitor = store.acquireRepositoryCloseLease({ operationId: competitorOperationId });
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const independentRef = { threadId: "thread-16", hostId: "local" };
  let independentDispatched = false;
  let sleepCalls = 0;
  let virtualElapsedMs = 0;
  const tasks = {
    async findIssueLane({ issueId }) {
      assert.equal(issueId, "16");
      return [];
    },
    async create({ issueId }) {
      assert.equal(issueId, "16");
      independentDispatched = true;
      return independentRef;
    },
    async read(ref) {
      assert.deepEqual(ref, independentRef);
      return { state: "RUNNING", snapshot: { turns: [{ status: "inProgress", durationMs: 0 }] } };
    },
    async message() { throw new Error("message is forbidden while repository close wait times out"); },
    async wait(refs) {
      assert.deepEqual(refs, [independentRef]);
      return { coordinatorActive: false, taskSettled: false };
    },
  };
  const reconcile = async () => {
    const observation = store.observeRepositoryCloseLease();
    return reconciliation({
      runIdentity: multiIdentity,
      maxParallel: 1,
      taskRefs: { 15: taskRef, ...(independentDispatched ? { 16: independentRef } : {}) },
      run: {
        repositoryCloseLeaseOperationId: observation.owner.operationId,
        repositoryCloseLeaseState: "ACTIVE",
        repositoryCloseLeaseHealth: "HEALTHY",
        repositoryCloseLeaseOwner: observation.owner,
      },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }, {
        issueId: "16",
        blockers: [],
        trackerState: "OPEN",
        taskState: independentDispatched ? "EXECUTING" : "NONE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: independentDispatched ? "PRESENT" : "ABSENT",
      }],
    });
  };

  try {
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => new Date(Date.parse("2026-09-03T01:30:00.000Z") + virtualElapsedMs).toISOString(),
      sleep: async () => {
        sleepCalls += 1;
        virtualElapsedMs += 15 * 60 * 1000;
        return sleepCalls >= 49 ? { coordinatorActive: false } : undefined;
      },
    });
    const status = await coordinator.run({ specId: multiIdentity.specId });
    const events = store.readEvents(multiIdentity.runId);
    const waitEvents = events
      .filter(({ type }) => type.startsWith("repository-close-wait."));

    assert.equal(status.run.state, "RUNNING", "the unaffected active Issue keeps the Run non-terminal");
    assert.equal(status.diagnoses.at(-1).reasonCode, "repository_close_lease_wait_coordinator_lost");
    assert.equal(waitEvents.at(-1).outcome, "COORDINATOR_INACTIVE");
    assert.equal(sleepCalls, 49);
    assert.ok(virtualElapsedMs > 12 * 60 * 60 * 1000);
    assert.equal(independentDispatched, true, "the independent Issue is dispatched before the healthy wait");
    assert.equal(events.some(event => event.type === "dispatch.recorded" && event.issueId === "16"), true);
    assert.equal(events.some(event => event.type === "execution.started" && event.issueId === "15"), false,
      "verified healthy contention consumes no Issue execution budget");
    assert.equal(status.nodes.find(node => node.issueId === "15").task.retryCount, 0);
    assert.equal(status.nodes.find(node => node.issueId === "16").state, "EXECUTING");
    assert.deepEqual(status.diagnoses.at(-1).resumePredicates, [
      "resolve_contradiction:repository_close_lease_wait_coordinator_lost",
    ]);
    assert.equal(store.observeRepositoryCloseLease().owner.operationId, competitorOperationId);
  } finally {
    competitor.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("real close leaf request follows max_parallel dispatch when both leases are available", async () => {
  const { root, store } = createStoreFixture();
  const closeTaskRef = { threadId: "thread-13", hostId: "local" };
  const executeTaskRef = { threadId: "thread-14", hostId: "local" };
  const seed = store.acquireWriter(multiIdentity.runId);
  seed.append({
    type: "grant.recorded",
    at: "2026-09-03T01:45:00.000Z",
    runIdentity: multiIdentity,
    maxParallel: 1,
  });
  seed.append({
    type: "dispatch.recorded",
    at: "2026-09-03T01:45:01.000Z",
    issueId: "13",
    attempt: 1,
    taskRef: closeTaskRef,
  });
  seed.release();
  let issue14Dispatched = false;
  let closeRequestIdentity = null;
  const order = [];
  const tasks = {
    async findIssueLane({ issueId }) {
      if (issueId === "13") return [closeTaskRef];
      if (issueId === "14") return [];
      throw new Error(`unexpected Issue ${issueId}`);
    },
    async create({ issueId }) {
      assert.equal(issueId, "14");
      issue14Dispatched = true;
      order.push("dispatch:14");
      return executeTaskRef;
    },
    async read() { return {}; },
    async message(_taskRef, prompt) {
      assert.equal(issue14Dispatched, true, "ready work must start before the available close leaf");
      assert.match(prompt, /"targetState":"CLEAN"/u);
      assert.match(prompt, new RegExp(`"targetHead":"${"a".repeat(40)}"`, "u"));
      assert.match(prompt, new RegExp(`"candidateCommit":"${"b".repeat(40)}"`, "u"));
      assert.match(prompt, /"completionBodySha256":"sha256:d{64}"/u);
      closeRequestIdentity = closeRequestIdentityFrom(prompt);
      order.push("close:13");
    },
    async wait() { return { coordinatorActive: false, taskSettled: true, closeRequestIdentity }; },
  };
  const reconcile = async () => reconciliation({
    runIdentity: multiIdentity,
    maxParallel: 1,
    taskRefs: { 13: closeTaskRef, ...(issue14Dispatched ? { 14: executeTaskRef } : {}) },
    nodes: [
      {
        issueId: "13",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      },
      {
        issueId: "14",
        blockers: [],
        trackerState: "OPEN",
        taskState: issue14Dispatched ? "EXECUTING" : "NONE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: issue14Dispatched ? "PRESENT" : "ABSENT",
      },
    ],
  });

  try {
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => "2026-09-03T01:45:02.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: multiIdentity.specId });

    assert.equal(status.run.state, "RUNNING");
    assert.deepEqual(order, ["dispatch:14", "close:13"]);
    assert.equal(store.readEvents(multiIdentity.runId)
      .filter(({ type, issueId }) => type === "dispatch.recorded" && issueId === "14").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("operation identity preserves an exact reconciled Run Grant without an optional selector", async () => {
  const { root, store } = createStoreFixture();
  const seed = store.acquireWriter(identity.runId);
  seed.append({
    type: "grant.recorded",
    at: "2026-09-03T00:00:00.000Z",
    runIdentity: identity,
    maxParallel: 3,
  });
  seed.release();
  const ownerDerived = { key: `workflow-op-v1-${"a".repeat(64)}` };
  const runReadyHandoff = { ...readyHandoffFor(identity), operationIdentity: ownerDerived };
  const tracker = { async read() { return {}; } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is unnecessary for a completed recorded Run`);
    }]),
  );
  const reconcile = async () => reconciliation({
    runReadyHandoff,
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "CLOSED",
      taskState: "NONE",
      completionState: "COMPLETE",
      candidateReachable: true,
      worktreeState: "ABSENT",
    }],
  });

  try {
    const coordinator = createCoordinator({
      store,
      tracker,
      tasks,
      reconcile,
      now: () => "2026-09-03T00:01:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: identity.specId });

    assert.equal(status.run.runId, identity.runId);
    assert.ok(store.readEvents(identity.runId).filter(({ type }) => type === "grant.recorded").length >= 1);
    assert.ok(store.readEvents(identity.runId)
      .filter(({ type }) => type === "grant.recorded")
      .every(({ runIdentity }) => runIdentity.runId === identity.runId));
    assert.deepEqual(store.readEvents(ownerDerived.key), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a healthy competing writer waits for release and reacquires authority before closeout", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let clockSecond = 0;
  const now = () => `2026-08-30T14:00:${String(clockSecond++).padStart(2, "0")}.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();
  const competing = store.acquireTargetMutationWriter({
    target: identity.target,
    operationId: "run-other-spec",
  });
  let competingReleased = false;
  let waitPolls = 0;
  let closed = false;
  let closeRequestIdentity = null;
  let reconciliations = 0;
  let closeMessageReconciliation = null;
  const tracker = { async read() { return {}; } };
  const tasks = {
    async findIssueLane() { return [taskRef]; },
    async create() { throw new Error("the existing Issue lane must be reused"); },
    async read() { return {}; },
    async message(_taskRef, prompt) {
      closeMessageReconciliation = reconciliations;
      closeRequestIdentity = closeRequestIdentityFrom(prompt);
    },
    async wait() {
      closed = true;
      return { taskSettled: true, coordinatorActive: true, closeRequestIdentity };
    },
  };
  const reconcile = async () => {
    reconciliations += 1;
    const lock = store.readTargetMutationWriterLock(identity.target);
    return reconciliation({
      taskRefs: { 15: taskRef },
      run: {
        closeWriterRunId: lock?.operationId ?? null,
        closeWriterState: lock === null ? "ABSENT" : "ACTIVE",
        closeWriterHealth: lock === null ? null : "HEALTHY",
        closeWriterOwner: lock === null ? null : {
          operationId: lock.operationId,
          coordinatorInstanceId: lock.coordinatorInstanceId,
          generation: lock.generation,
        },
      },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: closed ? "CLOSED" : "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: closed,
        worktreeState: closed ? "ABSENT" : "PRESENT",
      }],
    });
  };

  try {
    const coordinator = createCoordinator({
      store,
      tracker,
      tasks,
      reconcile,
      now,
      sleep: async () => {
        waitPolls += 1;
        if (!competingReleased && waitPolls === 30) {
          competing.release();
          competingReleased = true;
        }
      },
    });
    const status = await coordinator.run({ specId: "15" });
    const waitEvents = store.readEvents(identity.runId)
      .filter(({ type }) => type.startsWith("target-writer-wait."));

    assert.equal(status.run.state, "SUCCEEDED");
    assert.deepEqual(waitEvents.map(({ type, outcome }) => [type, outcome ?? null]), [
      ["target-writer-wait.started", null],
      ["target-writer-wait.settled", "RELEASED"],
    ]);
    assert.equal(waitPolls, 30);
    assert.ok(closeMessageReconciliation >= 3);
    assert.equal(store.readTargetMutationWriterLock(identity.target), null);
  } finally {
    if (!competingReleased) competing.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown writer ownership stops the wait without treating ambiguity as release", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const owner = {
    operationId: "run-other-spec",
    coordinatorInstanceId: "coordinator-other-spec",
    generation: "generation-other-spec",
  };
  let reconciliations = 0;
  const ambiguousStore = {
    ...store,
    readTargetMutationWriterLock() {
      return { state: "UNKNOWN", target: identity.target };
    },
    observeTargetMutationWriter() {
      return { state: "UNKNOWN", owner: null };
    },
  };
  const reconcile = async () => {
    reconciliations += 1;
    return reconciliation({
      taskRefs: { 15: taskRef },
      run: reconciliations <= 2 ? {
        closeWriterRunId: owner.operationId,
        closeWriterState: "ACTIVE",
        closeWriterHealth: "HEALTHY",
        closeWriterOwner: owner,
      } : {
        closeWriterRunId: "UNKNOWN",
        closeWriterState: "UNKNOWN",
      },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }],
    });
  };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden for ambiguous writer ownership`);
    }]),
  );

  try {
    const coordinator = createCoordinator({
      store: ambiguousStore,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => "2026-08-30T14:30:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "15" });
    const waitEvents = store.readEvents(identity.runId)
      .filter(({ type }) => type.startsWith("target-writer-wait."));

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "target_writer_owner_changed");
    assert.equal(waitEvents.at(-1).outcome, "OWNER_CHANGED");
    assert.match(status.diagnoses.at(-1).evidence.join(" "), /owning source/u);
    assertRecoverablePacket(status.diagnoses.at(-1), { source: /target-writer lock/u });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("target-writer wait times out with preserved ownership and same-command recovery", async () => {
  const { root, store } = createStoreFixture();
  const competitor = store.acquireTargetMutationWriter({
    target: identity.target,
    operationId: "run-other-spec",
  });
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden while target-writer wait times out`);
    }]),
  );
  const reconcile = async () => {
    const lock = store.readTargetMutationWriterLock(identity.target);
    return reconciliation({
      taskRefs: { 15: taskRef },
      run: {
        closeWriterRunId: lock.operationId,
        closeWriterState: "ACTIVE",
        closeWriterHealth: "HEALTHY",
        closeWriterOwner: {
          operationId: lock.operationId,
          coordinatorInstanceId: lock.coordinatorInstanceId,
          generation: lock.generation,
        },
      },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }],
    });
  };

  try {
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => "2026-08-30T14:45:00.000Z",
      sleep: async () => ({ coordinatorActive: false }),
    });
    const status = await coordinator.run({ specId: "15" });
    const waitEvents = store.readEvents(identity.runId)
      .filter(({ type }) => type.startsWith("target-writer-wait."));

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "target_writer_wait_coordinator_lost");
    assert.equal(waitEvents.at(-1).outcome, "COORDINATOR_INACTIVE");
    assert.deepEqual(status.diagnoses.at(-1).resumePredicates, [
      "coordinator_is_active",
    ]);
    assertRecoverablePacket(status.diagnoses.at(-1), { source: /coordinator liveness/u });
    assert.equal(
      status.diagnoses.at(-1).operatorPacket.preservedStages.run.state,
      "WAITING_FOR_TARGET_WRITER",
    );
    assert.equal(store.readTargetMutationWriterLock(identity.target).operationId, "run-other-spec");
  } finally {
    competitor.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("coordinator loss settles the writer wait without releasing another Run's writer", async () => {
  const { root, store } = createStoreFixture();
  const competitor = store.acquireTargetMutationWriter({
    target: identity.target,
    operationId: "run-other-spec",
  });
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden after coordinator loss`);
    }]),
  );
  const reconcile = async () => {
    const lock = store.readTargetMutationWriterLock(identity.target);
    return reconciliation({
      run: {
        closeWriterRunId: lock.operationId,
        closeWriterState: "ACTIVE",
        closeWriterHealth: "HEALTHY",
        closeWriterOwner: {
          operationId: lock.operationId,
          coordinatorInstanceId: lock.coordinatorInstanceId,
          generation: lock.generation,
        },
      },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }],
    });
  };

  try {
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => "2026-08-30T14:50:00.000Z",
      sleep: async () => ({ coordinatorActive: false }),
    });
    const status = await coordinator.run({ specId: "15" });
    const waitEvents = store.readEvents(identity.runId)
      .filter(({ type }) => type.startsWith("target-writer-wait."));

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "target_writer_wait_coordinator_lost");
    assert.equal(waitEvents.at(-1).outcome, "COORDINATOR_INACTIVE");
    assert.equal(store.readTargetMutationWriterLock(identity.target).operationId, "run-other-spec");
    assertRecoverablePacket(status.diagnoses.at(-1), { source: /coordinator liveness/u });
  } finally {
    competitor.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("re-entry settles an interrupted wait using the preserved Stop revision", async () => {
  const { root, gitCommonDir, store } = createStoreFixture();
  const competitor = store.acquireTargetMutationWriter({
    target: identity.target,
    operationId: "run-other-spec",
  });
  const lock = store.readTargetMutationWriterLock(identity.target);
  const owner = {
    operationId: lock.operationId,
    coordinatorInstanceId: lock.coordinatorInstanceId,
    generation: lock.generation,
  };
  const abandoned = store.acquireWriter(identity.runId);
  abandoned.append({
    type: "grant.recorded",
    at: "2026-08-30T14:52:00.000Z",
    runIdentity: identity,
    maxParallel: 3,
  });
  abandoned.append({
    type: "target-writer-wait.started",
    at: "2026-08-30T14:52:01.000Z",
    issueId: "15",
    target: identity.target,
    owner,
    timeoutMs: 30_000,
    preWaitEvidence: singlePreWaitEvidence(),
  });
  abandoned.append({
    type: "control.revised",
    at: "2026-08-30T14:52:01.500Z",
    revision: 1,
    command: "STOP",
  });
  abandoned.release();
  const recoveredStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "writer-wait-recovered" });
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden while reconciling the abandoned wait`);
    }]),
  );
  const reconcile = async () => reconciliation({
    run: {
      closeWriterRunId: owner.operationId,
      closeWriterState: "ACTIVE",
      closeWriterHealth: "HEALTHY",
      closeWriterOwner: owner,
    },
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "COMPLETE",
      candidateReachable: false,
      worktreeState: "PRESENT",
    }],
  });

  try {
    const coordinator = createCoordinator({
      store: recoveredStore,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => "2026-08-30T14:52:02.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "15" });
    const waitEvents = recoveredStore.readEvents(identity.runId)
      .filter(({ type }) => type.startsWith("target-writer-wait."));

    assert.equal(status.run.state, "STOPPED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "stopped_by_user");
    assert.equal(waitEvents.filter(({ type }) => type === "target-writer-wait.started").length, 1);
    assert.equal(waitEvents.at(-1).outcome, "CONTROL_CHANGED");
    assert.equal(recoveredStore.readTargetMutationWriterLock(identity.target).operationId, "run-other-spec");
  } finally {
    competitor.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("control revision drift abandons a target-writer wait before closeout", async () => {
  const { root, store } = createStoreFixture();
  const competitor = store.acquireTargetMutationWriter({
    target: identity.target,
    operationId: "run-other-spec",
  });
  let coordinatorWriter;
  let clockSecond = 0;
  const now = () => `2026-08-30T14:55:${String(clockSecond++).padStart(2, "0")}.000Z`;
  const wrappedStore = {
    ...store,
    acquireWriter(runId) {
      coordinatorWriter = store.acquireWriter(runId);
      return coordinatorWriter;
    },
  };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden after control revision drift`);
    }]),
  );
  const reconcile = async () => {
    const lock = store.readTargetMutationWriterLock(identity.target);
    return reconciliation({
      run: {
        closeWriterRunId: lock.operationId,
        closeWriterState: "ACTIVE",
        closeWriterHealth: "HEALTHY",
        closeWriterOwner: {
          operationId: lock.operationId,
          coordinatorInstanceId: lock.coordinatorInstanceId,
          generation: lock.generation,
        },
      },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }],
    });
  };
  let controlWritten = false;

  try {
    const coordinator = createCoordinator({
      store: wrappedStore,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now,
      sleep: async () => {
        if (!controlWritten) {
          coordinatorWriter.append({ type: "control.revised", at: now(), revision: 1, command: "PAUSE" });
          controlWritten = true;
        }
      },
    });
    const status = await coordinator.run({ specId: "15" });
    const waitEvents = store.readEvents(identity.runId)
      .filter(({ type }) => type.startsWith("target-writer-wait."));

    assert.equal(status.run.state, "PAUSED");
    assert.equal(waitEvents.at(-1).outcome, "CONTROL_CHANGED");
    assert.equal(store.readTargetMutationWriterLock(identity.target).operationId, "run-other-spec");
  } finally {
    competitor.release();
    rmSync(root, { recursive: true, force: true });
  }
});

const assertWriterReleaseEvidenceChange = async ({ mutate, label }) => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const competitor = store.acquireTargetMutationWriter({
    target: identity.target,
    operationId: "run-other-spec",
  });
  let competitorReleased = false;
  let reconciliations = 0;
  let taskCalls = 0;
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      taskCalls += 1;
      throw new Error(`${name} is forbidden after post-wait ${label} drift`);
    }]),
  );
  const reconcile = async () => {
    reconciliations += 1;
    const lock = store.readTargetMutationWriterLock(identity.target);
    const current = reconciliation({
      taskRefs: { 15: taskRef },
      run: lock === null ? {} : {
        closeWriterRunId: lock.operationId,
        closeWriterState: "ACTIVE",
        closeWriterHealth: "HEALTHY",
        closeWriterOwner: {
          operationId: lock.operationId,
          coordinatorInstanceId: lock.coordinatorInstanceId,
          generation: lock.generation,
        },
      },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }],
    });
    return reconciliations < 3 ? current : mutate(current);
  };

  try {
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      now: () => "2026-08-30T15:00:00.000Z",
      sleep: async () => {
        if (!competitorReleased) {
          competitor.release();
          competitorReleased = true;
        }
      },
    });
    const status = await coordinator.run({ specId: "15" });
    const waitEvents = store.readEvents(identity.runId)
      .filter(({ type }) => type.startsWith("target-writer-wait."));

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, label === "Grant" ? "grant_identity_conflict" : "target_writer_evidence_changed");
    if (label !== "Grant") assert.equal(waitEvents.at(-1).outcome, "EVIDENCE_CHANGED");
    assert.ok(reconciliations >= 3);
    assert.equal(taskCalls, 0);
    if (label !== "Grant") assertRecoverablePacket(status.diagnoses.at(-1), { source: /post-wait.*reconciliation/u });
  } finally {
    if (!competitorReleased) competitor.release();
    rmSync(root, { recursive: true, force: true });
  }
};

test("writer release rejects changed Grant evidence before closeout", async () => {
  await assertWriterReleaseEvidenceChange({
    label: "Grant",
    mutate: (current) => ({
      ...current,
      grant: {
        ...current.grant,
        runIdentity: { ...identity, approvedScopeHash: "sha256:changed-after-wait" },
      },
    }),
  });
});

test("writer release rejects regressed completion and candidate evidence before closeout", async () => {
  await assertWriterReleaseEvidenceChange({
    label: "completion and candidate",
    mutate: (current) => ({
      ...current,
      facts: {
        ...current.facts,
        nodes: current.facts.nodes.map((candidate) => candidate.issueId === "15"
          ? { ...candidate, completionState: "NONE", candidateReachable: false }
          : candidate),
      },
    }),
  });
});

test("fresh evidence rejects candidate identity drift even when aggregate states are unchanged", async () => {
  await assertWriterReleaseEvidenceChange({
    label: "exact candidate identity",
    mutate: (current) => ({
      ...current,
      facts: {
        ...current.facts,
        nodes: current.facts.nodes.map((candidate) => candidate.issueId === "15"
          ? {
              ...candidate,
              closeAuthorityEvidence: closeAuthorityEvidenceFor("15", {
                candidateCommit: "e".repeat(40),
              }),
            }
          : candidate),
      },
    }),
  });
});

test("inactive target-writer evidence stops without coordinator reclaim", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let clockMinute = 0;
  const now = () => `2026-08-30T13:${String(clockMinute++).padStart(2, "0")}:45.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();
  const racingStore = {
    ...store,
    reclaimTargetMutationWriter() {
      throw new Error("coordinator must never reclaim the close-issue leaf writer");
    },
  };
  const owner = {
    operationId: "run-race-winner",
    coordinatorInstanceId: "winner",
    generation: "new-generation",
  };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden after the reclaim race is lost`);
    }]),
  );
  const tracker = { async read() { return {}; } };
  const reconcile = async () => reconciliation({
      taskRefs: { 15: taskRef },
      run: {
        closeWriterRunId: owner.operationId,
        closeWriterState: "ACTIVE",
        closeWriterHealth: "INACTIVE",
        closeWriterOwner: owner,
      },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }],
  });

  try {
    const coordinator = createCoordinator({ store: racingStore, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "close_writer_conflict");
    assert.match(status.diagnoses.at(-1).evidence.join(" "), /run-race-winner/u);
    assertRecoverablePacket(status.diagnoses.at(-1), { source: /target-writer.*read-back/u });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("tracker exhaustion during an existing Run preserves identity and affected nodes", async () => {
  const { root, store } = createStoreFixture();
  let trackerReads = 0;
  let clockMinute = 0;
  const sleeps = [];
  const now = () => `2026-08-30T14:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const tracker = {
    async read() {
      trackerReads += 1;
      if (trackerReads === 1) return {};
      throw new Error("tracker unavailable");
    },
  };
  const tasks = {
    async findIssueLane() { throw new Error("outage forbids dispatch"); },
    async create() { throw new Error("outage forbids dispatch"); },
    async read() { throw new Error("outage forbids task reads"); },
    async message() { throw new Error("outage forbids messages"); },
    async wait() { throw new Error("outage forbids waits"); },
  };
  const reconcile = async () => reconciliation({
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "ABSENT",
    }],
  });

  try {
    const coordinator = createCoordinator({
      store,
      tracker,
      tasks,
      reconcile,
      now,
      sleep: async (delayMs) => sleeps.push(delayMs),
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.run.runId, identity.runId);
    assert.deepEqual(status.diagnoses.at(-1).affectedNodes, ["15"]);
    assert.deepEqual(sleeps, [5_000, 15_000, 30_000]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no-argument entry takes no action for zero or multiple non-terminal Runs", async () => {
  for (const candidates of [[], [identity, multiIdentity]]) {
    const { root, store } = createStoreFixture();
    let trackerReads = 0;
    const selector = { async listNonTerminalRuns() { return candidates; } };
    const tracker = { async read() { trackerReads += 1; throw new Error("selection must precede Tracker reads"); } };
    const tasks = Object.fromEntries(
      ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
        throw new Error(`${name} is forbidden without one selected Run`);
      }]),
    );
    const reconcile = async () => { throw new Error("reconciliation is forbidden without one selected Run"); };

    try {
      const coordinator = createCoordinator({
        store,
        tracker,
        tasks,
        selector,
        reconcile,
        now: () => "2026-08-30T15:00:00.000Z",
        sleep: async () => {},
      });
      const status = await coordinator.run({});

      assert.equal(status.run.state, "BLOCKED");
      assert.equal(status.diagnoses[0].reasonCode, "run_selection_required");
      assert.equal(status.diagnoses[0].evidence[0], `Found ${candidates.length} non-terminal Runs; exactly one is required.`);
      assert.equal(trackerReads, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("no-argument entry resumes one exact non-terminal Run", async () => {
  const { root, store } = createStoreFixture();
  const selector = { async listNonTerminalRuns() { return [identity]; } };
  const tracker = { async read(request) { assert.deepEqual(request.runIdentity, identity); return {}; } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is unnecessary for a successful resumed Run`);
    }]),
  );
  const reconcile = async ({ request }) => {
    assert.equal(request.specId, "15");
    assert.deepEqual(request.runIdentity, identity);
    return reconciliation({
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "CLOSED",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: true,
        worktreeState: "ABSENT",
      }],
    });
  };

  try {
    const coordinator = createCoordinator({
      store,
      tracker,
      tasks,
      selector,
      reconcile,
      now: () => "2026-08-30T16:00:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({});

    assert.equal(status.run.state, "SUCCEEDED");
    assert.equal(status.run.runId, identity.runId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("same-command recovery and re-entry observe accepted retry before journaling the next attempt", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let retryRequest = null;
  let messageCalls = 0;
  let clockMinute = 0;
  const now = () => `2026-08-30T17:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();
  const tasks = {
    async findIssueLane() { throw new Error("resumable task forbids replacement"); },
    async create() { throw new Error("resumable task forbids replacement"); },
    async read() { return { state: "RESUMABLE", inactiveEvidence: [], retryRequest }; },
    async message() {
      messageCalls += 1;
      retryRequest = { runId: identity.runId, issueId: "15", attempt: 2, state: "ACCEPTED" };
      throw new Error("coordinator lost after the retry prompt was accepted");
    },
    async wait() { return { coordinatorActive: false }; },
  };
  const tracker = { async read() { return {}; } };
  const reconcile = async ({ journal }) => {
    const dispatches = journal.filter(({ type }) => type === "dispatch.recorded");
    return reconciliation({
      taskRefs: { 15: dispatches.at(-1)?.taskRef ?? taskRef },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: dispatches.length === 1 ? "TRANSIENT_FAILURE" : "EXECUTING",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "PRESENT",
      }],
    });
  };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    assert.equal((await coordinator.run({ specId: "15" })).run.state, "RUNNING");
    const resumed = await coordinator.run({ specId: "15" });
    const dispatches = store.readEvents(identity.runId).filter(({ type }) => type === "dispatch.recorded");

    assert.equal(resumed.run.state, "RUNNING");
    assert.equal(messageCalls, 1);
    assert.deepEqual(dispatches.map(({ attempt, taskRef: ref }) => ({ attempt, taskRef: ref })), [
      { attempt: 1, taskRef },
      { attempt: 2, taskRef },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("grant renewal diagnoses max_parallel drift without replacing authority", async () => {
  const { root, store } = createStoreFixture();
  let clockMinute = 0;
  const now = () => `2026-08-30T18:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.release();
  const tracker = { async read() { return {}; } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden after Grant drift`);
    }]),
  );
  const reconcile = async () => reconciliation({
    maxParallel: 4,
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "ABSENT",
    }],
  });

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.run.maxParallel, 3);
    assert.equal(status.diagnoses.at(-1).reasonCode, "grant_identity_conflict");
    assert.equal(store.readEvents(identity.runId).filter(({ type }) => type === "grant.recorded").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit entry rejects a reconciled identity for another Spec before Grant mutation", async () => {
  const { root, store } = createStoreFixture();
  const wrongIdentity = { ...identity, runId: "run-12-wrong", specId: "12", approvedScopeHash: "sha256:spec-12" };
  let selectedHooks = 0;
  const tracker = { async read() { return {}; } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden after explicit Spec mismatch`);
    }]),
  );
  const reconcile = async () => reconciliation({
    runIdentity: wrongIdentity,
    nodes: [{
      issueId: "12",
      blockers: [],
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "ABSENT",
    }],
  });

  try {
    const coordinator = createCoordinator({
      store,
      tracker,
      tasks,
      reconcile,
      onSelected: async () => { selectedHooks += 1; },
      now: () => "2026-08-30T19:00:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "spec_selection_conflict");
    assert.equal(selectedHooks, 0);
    assert.deepEqual(store.readEvents(wrongIdentity.runId), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Grant identity drift becomes a structured authority stop", async () => {
  const { root, store } = createStoreFixture();
  const tracker = { async read() { return {}; } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden after Grant identity drift`);
    }]),
  );
  const reconcile = async () => ({
    ...reconciliation({
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "ABSENT",
      }],
    }),
    grant: {
      runIdentity: { ...identity, approvedScopeHash: "sha256:drifted" },
      maxParallel: 3,
    },
  });

  try {
    const coordinator = createCoordinator({
      store,
      tracker,
      tasks,
      reconcile,
      now: () => "2026-08-30T19:30:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "grant_identity_conflict");
    assert.match(status.diagnoses.at(-1).evidence[0], /approvedScopeHash/u);
    assert.deepEqual(store.readEvents(identity.runId), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unrecognized environment failure does not suppress an independent ready branch", async () => {
  const { root, store } = createStoreFixture();
  const failedTaskRef = { threadId: "thread-13", hostId: "local" };
  let clockMinute = 0;
  const now = () => `2026-08-30T20:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(multiIdentity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: multiIdentity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "13", attempt: 1, taskRef: failedTaskRef });
  seed.release();
  const createdIssues = [];
  const tasks = {
    async findIssueLane() { return []; },
    async create({ issueId }) {
      createdIssues.push(issueId);
      return { threadId: `thread-${issueId}`, hostId: "local" };
    },
    async read() { throw new Error("no task read is needed"); },
    async message() { throw new Error("no task message is needed"); },
    async wait() { throw new Error("diagnosed wave returns after scheduling independent work"); },
  };
  const tracker = { async read() { return {}; } };
  const reconcile = async ({ journal }) => reconciliation({
    runIdentity: multiIdentity,
    taskRefs: Object.fromEntries(
      journal.filter(({ type }) => type === "dispatch.recorded").map(({ issueId, taskRef }) => [issueId, taskRef]),
    ),
    nodes: [
      {
        issueId: "13",
        blockers: [],
        trackerState: "OPEN",
        taskState: "ENVIRONMENT_FAILURE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "PRESENT",
        failure: { fingerprint: "windows:unrecognized" },
      },
      {
        issueId: "14",
        blockers: [],
        trackerState: "OPEN",
        taskState: journal.some(({ type, issueId }) => type === "dispatch.recorded" && issueId === "14")
          ? "EXECUTING"
          : "NONE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "ABSENT",
      },
    ],
  });

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "12" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "environment_unresolved");
    assert.deepEqual(createdIssues, ["14"]);
    assert.equal(status.nodes.find(({ issueId }) => issueId === "13").state, "BLOCKED");
    assert.equal(status.nodes.find(({ issueId }) => issueId === "14").state, "EXECUTING");
    assert.deepEqual(status.frontier.active, ["14"]);
    assert.equal(
      store.readEvents(multiIdentity.runId).some(({ type, issueId }) => type === "dispatch.recorded" && issueId === "14"),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("environment diagnosis is discarded when refreshed evidence removes the failure", async () => {
  const { root, store } = createStoreFixture();
  const failedTaskRef = { threadId: "thread-13", hostId: "local" };
  let clockMinute = 0;
  const now = () => `2026-08-30T20:${String(clockMinute++).padStart(2, "0")}:30.000Z`;
  const seed = store.acquireWriter(multiIdentity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: multiIdentity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "13", attempt: 1, taskRef: failedTaskRef });
  seed.release();
  const createdIssues = [];
  const tasks = {
    async findIssueLane() { return []; },
    async create({ issueId }) {
      createdIssues.push(issueId);
      return { threadId: `thread-${issueId}`, hostId: "local" };
    },
    async read() { throw new Error("no retry or close is legal"); },
    async message() { throw new Error("no retry or close is legal"); },
    async wait() { return { coordinatorActive: false }; },
  };
  const tracker = { async read() { return {}; } };
  const reconcile = async ({ journal }) => {
    const issue14Dispatched = journal.some(({ type, issueId }) => type === "dispatch.recorded" && issueId === "14");
    return reconciliation({
      runIdentity: multiIdentity,
      taskRefs: Object.fromEntries(
        journal.filter(({ type }) => type === "dispatch.recorded").map(({ issueId, taskRef }) => [issueId, taskRef]),
      ),
      nodes: [
        {
          issueId: "13",
          blockers: [],
          trackerState: "OPEN",
          taskState: issue14Dispatched ? "EXECUTING" : "ENVIRONMENT_FAILURE",
          completionState: "NONE",
          candidateReachable: false,
          worktreeState: "PRESENT",
          ...(issue14Dispatched ? {} : { failure: { fingerprint: "windows:unrecognized" } }),
        },
        {
          issueId: "14",
          blockers: [],
          trackerState: "OPEN",
          taskState: issue14Dispatched ? "EXECUTING" : "NONE",
          completionState: "NONE",
          candidateReachable: false,
          worktreeState: issue14Dispatched ? "PRESENT" : "ABSENT",
        },
      ],
    });
  };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "12" });

    assert.equal(status.run.state, "RUNNING");
    assert.equal(status.diagnoses.some(({ reasonCode }) => reasonCode === "environment_unresolved"), false);
    assert.deepEqual(createdIssues, ["14"]);
    assert.deepEqual(status.frontier.active, ["13", "14"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("environment refresh revalidates Run and Grant authority before diagnosis", async () => {
  const { root, store } = createStoreFixture();
  const failedTaskRef = { threadId: "thread-13", hostId: "local" };
  let clockMinute = 0;
  const now = () => `2026-08-30T20:${String(clockMinute++).padStart(2, "0")}:40.000Z`;
  const seed = store.acquireWriter(multiIdentity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: multiIdentity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "13", attempt: 1, taskRef: failedTaskRef });
  seed.release();
  const tasks = {
    async findIssueLane() { return []; },
    async create({ issueId }) { return { threadId: `thread-${issueId}`, hostId: "local" }; },
    async read() { throw new Error("no retry or close is legal"); },
    async message() { throw new Error("no retry or close is legal"); },
    async wait() { throw new Error("authority drift must stop before waiting"); },
  };
  const tracker = { async read() { return {}; } };
  const reconcile = async ({ journal }) => {
    const issue14Dispatched = journal.some(({ type, issueId }) => type === "dispatch.recorded" && issueId === "14");
    const current = reconciliation({
      runIdentity: multiIdentity,
      taskRefs: Object.fromEntries(
        journal.filter(({ type }) => type === "dispatch.recorded").map(({ issueId, taskRef }) => [issueId, taskRef]),
      ),
      nodes: [
        {
          issueId: "13",
          blockers: [],
          trackerState: "OPEN",
          taskState: "ENVIRONMENT_FAILURE",
          completionState: "NONE",
          candidateReachable: false,
          worktreeState: "PRESENT",
          failure: { fingerprint: "windows:unrecognized" },
        },
        {
          issueId: "14",
          blockers: [],
          trackerState: "OPEN",
          taskState: issue14Dispatched ? "EXECUTING" : "NONE",
          completionState: "NONE",
          candidateReachable: false,
          worktreeState: issue14Dispatched ? "PRESENT" : "ABSENT",
        },
      ],
    });
    return issue14Dispatched
      ? { ...current, grant: { ...current.grant, runIdentity: { ...multiIdentity, approvedScopeHash: "sha256:drifted" } } }
      : current;
  };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "12" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "grant_identity_conflict");
    assert.match(status.diagnoses.at(-1).evidence[0], /approvedScopeHash/u);
    assert.equal(status.diagnoses.some(({ reasonCode }) => reasonCode === "environment_unresolved"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a tracker-closed send guard returns to full reconciliation before claiming success", async () => {
  for (const candidateStillReachable of [true, false]) {
    const { root, store } = createStoreFixture();
    const ref = { threadId: "original", hostId: "local" };
    let closed = false, guarded = 0, freshReconciliations = 0;
    const now = () => "2026-09-09T07:30:00.000Z";
    const tasks = { findIssueLane: async () => [ref], create: async () => { throw new Error("No new task"); },
      read: async () => ({ state: "RESUMABLE", snapshot: { turns: [{ status: "completed" }] } }),
      message: async () => { guarded++; closed = true; return { reconcileRequired: true, reasonCode: "issue_already_closed", issueId: "15" }; },
      wait: async () => { throw new Error("A suppressed send has no new native turn to wait for"); } };
    try {
      const writer = store.acquireWriter(identity.runId);
      writer.append({ type: "grant.recorded", at: now(), runIdentity: identity });
      writer.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef: ref }); writer.release();
      const status = await createCoordinator({ store, tasks, now, sleep: async () => {},
        tracker: { read: async () => ({ state: closed ? "CLOSED" : "OPEN" }) },
        reconcile: async ({ tracker }) => {
          if (closed) freshReconciliations++;
          return reconciliation({ taskRefs: { 15: ref }, nodes: [{ issueId: "15", blockers: [], trackerState: tracker.state,
            taskState: "NONE", completionState: "COMPLETE", candidateReachable: !closed || candidateStillReachable, worktreeState: "ABSENT" }] });
        } }).run({ specId: "15" });
      assert.equal(guarded, 1);
      assert.ok(freshReconciliations > 0);
      assert.equal(status.run.state, candidateStillReachable ? "SUCCEEDED" : "BLOCKED", "tracker closure alone never proves completed delivery");
      assert.equal(store.readEvents(identity.runId).filter(event => event.type === "grant.recorded").length, 1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("manual implementation completion adopts one existing lane for serialized close", async () => {
  const { root, store } = createStoreFixture();
  const adoptedTaskRef = { threadId: "thread-15-manual", hostId: "local" };
  const trackerState = {
    trackerState: "OPEN",
    completionState: "COMPLETE",
    candidateReachable: true,
    worktreeState: "PRESENT",
  };
  let clockMinute = 0;
  let laneReads = 0;
  let messages = 0;
  let closeRequestIdentity = null;
  const now = () => `2026-08-30T20:${String(clockMinute++).padStart(2, "0")}:45.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.release();
  const tasks = {
    async findIssueLane({ issueId }) {
      laneReads += 1;
      assert.equal(issueId, "15");
      return [adoptedTaskRef];
    },
    async create() { throw new Error("manual completion must not create a duplicate lane"); },
    async read(actual) { assert.deepEqual(actual, adoptedTaskRef); return { state: "ACTIVE" }; },
    async message(actual, message) {
      assert.deepEqual(actual, adoptedTaskRef);
      assert.match(message, /close-issue/iu);
      closeRequestIdentity = closeRequestIdentityFrom(message);
      messages += 1;
    },
    async wait() {
      trackerState.trackerState = "CLOSED";
      trackerState.worktreeState = "ABSENT";
      return { coordinatorActive: true, taskSettled: true, closeRequestIdentity };
    },
  };
  const tracker = { async read() { return { ...trackerState }; } };
  const reconcile = async ({ tracker: currentTracker }) => reconciliation({
    nodes: [{ issueId: "15", blockers: [], ...currentTracker, taskState: "NONE" }],
  });

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "SUCCEEDED");
    assert.equal(laneReads, 1);
    assert.equal(messages, 1);
    assert.equal(store.readEvents(identity.runId).some(({ type }) => type === "dispatch.recorded"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restart plus immediate tracker outage preserves a selector-known Run", async () => {
  const { root, store } = createStoreFixture();
  let clockMinute = 0;
  const now = () => `2026-08-30T21:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({
    type: "dispatch.recorded",
    at: now(),
    issueId: "15",
    attempt: 1,
    taskRef: { threadId: "thread-15", hostId: "local" },
  });
  seed.release();
  const selector = { async listNonTerminalRuns() { return [{ runIdentity: identity, issueIds: ["15"] }]; } };
  const tracker = { async read() { throw new Error("tracker offline at restart"); } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden during Tracker outage`);
    }]),
  );
  const reconcile = async () => { throw new Error("outage precedes reconciliation"); };

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, selector, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.run.runId, identity.runId);
    assert.deepEqual(status.nodes.map(({ issueId }) => issueId), ["15"]);
    assert.deepEqual(status.diagnoses[0].affectedNodes, ["15"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit re-entry reclaims an exactly proven stale engine writer", async () => {
  const { root, gitCommonDir, store } = createStoreFixture();
  const oldWriter = store.acquireWriter(identity.runId);
  oldWriter.append({
    type: "grant.recorded",
    at: "2026-08-30T22:00:00.000Z",
    runIdentity: identity,
    maxParallel: 3,
  });
  const owner = store.readWriterLock(identity.runId);
  const writerReclaimProof = {
    previousCoordinatorInstanceId: owner.coordinatorInstanceId,
    previousGeneration: owner.generation,
    coordinatorState: "INACTIVE",
    reconciled: true,
    evidence: ["The prior coordinator process is gone and no operation remains active."],
    abandonedOperationIds: [],
  };
  const recoveredStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "engine-recovered" });
  const tracker = { async read() { return {}; } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is unnecessary for a terminal recovered Run`);
    }]),
  );
  const reconcile = async () => ({
    ...reconciliation({
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "CLOSED",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: true,
        worktreeState: "ABSENT",
      }],
    }),
    writerReclaimProof,
  });

  try {
    const coordinator = createCoordinator({
      store: recoveredStore,
      tracker,
      tasks,
      reconcile,
      now: () => "2026-08-30T22:01:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "SUCCEEDED");
    assert.throws(() => oldWriter.release());
    assert.equal(recoveredStore.readWriterLock(identity.runId), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("active engine writer contention remains fenced and returns a structured stop", async () => {
  const { root, gitCommonDir, store } = createStoreFixture();
  const activeWriter = store.acquireWriter(identity.runId);
  activeWriter.append({
    type: "grant.recorded",
    at: "2026-08-30T22:30:00.000Z",
    runIdentity: identity,
    maxParallel: 3,
  });
  const owner = store.readWriterLock(identity.runId);
  const contenderStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "engine-contender" });
  const tracker = { async read() { return {}; } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden while the engine writer remains active`);
    }]),
  );
  const reconcile = async () => reconciliation({
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "ABSENT",
    }],
  });

  try {
    const coordinator = createCoordinator({
      store: contenderStore,
      tracker,
      tasks,
      reconcile,
      now: () => "2026-08-30T22:31:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "engine_writer_conflict");
    assert.match(status.diagnoses.at(-1).evidence.join(" "), new RegExp(owner.coordinatorInstanceId, "u"));
    assert.deepEqual(status.diagnoses.at(-1).resumePredicates, [
      "prior_engine_writer_is_inactive_with_exact_reclaim_proof",
    ]);
    assert.equal(contenderStore.readWriterLock(identity.runId).generation, owner.generation);
  } finally {
    activeWriter.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("settled parent close response must match the current request identity", async () => {
  const { root, store } = createStoreFixture();
  const seed = store.acquireWriter(multiIdentity.runId);
  seed.append({
    type: "grant.recorded",
    at: "2026-08-30T22:59:00.000Z",
    runIdentity: multiIdentity,
    maxParallel: 3,
  });
  seed.release();
  let parentTrackerState = "OPEN";
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is unnecessary after every child succeeded`);
    }]),
  );
  const leaf = {
    async closeParent() {
      parentTrackerState = "CLOSED";
      return { settled: true, requestIdentity: `sha256:${"e".repeat(64)}` };
    },
  };
  const reconcile = async () => reconciliation({
    runIdentity: multiIdentity,
    run: { parentTrackerState },
    nodes: ["13", "14", "15"].map((issueId) => ({
      issueId,
      blockers: [],
      trackerState: "CLOSED",
      taskState: "NONE",
      completionState: "COMPLETE",
      candidateReachable: true,
      worktreeState: "ABSENT",
    })),
  });

  try {
    const coordinator = createCoordinator({
      store,
      tracker: { async read() { return { parentTrackerState }; } },
      tasks,
      reconcile,
      leaf,
      now: () => "2026-08-30T23:00:00.000Z",
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: multiIdentity.specId });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "close_request_evidence_changed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const { name, coordinatorActive, mode, expectedState, expectedCalls } of [
  { name: "healthy parent close continues across native wait timeouts", coordinatorActive: true, expectedState: "SUCCEEDED", expectedCalls: 3 },
  { name: "parent close yields after coordinator loss", coordinatorActive: false, expectedState: "RUNNING", expectedCalls: 1 },
  { name: "unfinished parent close without liveness evidence still yields", expectedState: "RUNNING", expectedCalls: 1 },
  { name: "parent close step yields while the host remains active", coordinatorActive: true, mode: "step", expectedState: "RUNNING", expectedCalls: 1 },
]) {
  test(name, async () => {
    const { root, store } = createStoreFixture();
    const seed = store.acquireWriter(multiIdentity.runId);
    seed.append({ type: "grant.recorded", at: "2026-08-30T23:00:00.000Z", runIdentity: multiIdentity, maxParallel: 3 });
    seed.release();
    let parentTrackerState = "OPEN";
    const requests = [];
    const tasks = Object.fromEntries(
      ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
        throw new Error(`${name} is unnecessary after every child succeeded`);
      }]),
    );
    const leaf = {
      async closeParent({ requestIdentity, step }) {
        assert.equal(step, mode === "step");
        requests.push(requestIdentity);
        if (requests.length <= 2) return { settled: false, coordinatorActive };
        parentTrackerState = "CLOSED";
        return { settled: true, requestIdentity };
      },
    };
    const reconcile = async ({ tracker }) => reconciliation({
      runIdentity: multiIdentity,
      run: { parentTrackerState: tracker.parentTrackerState },
      nodes: ["13", "14", "15"].map((issueId) => ({
        issueId, blockers: [], trackerState: "CLOSED", taskState: "NONE",
        completionState: "COMPLETE", candidateReachable: true, worktreeState: "ABSENT",
      })),
    });
    try {
      const coordinator = createCoordinator({
        store, tasks, leaf, reconcile,
        tracker: { async read() { return { parentTrackerState }; } },
        now: () => "2026-08-30T23:00:00.000Z", sleep: async () => {},
      });
      const status = await coordinator.run({ specId: multiIdentity.specId, ...(mode ? { mode } : {}) });
      assert.equal(status.run.state, expectedState);
      assert.equal(requests.length, expectedCalls);
      assert.equal(new Set(requests).size, 1, "pending waits preserve the exact close request");
      assert.equal(store.readWriterLock(multiIdentity.runId), null);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("parent close delegates both leases to the real leaf", async () => {
  const { root, gitCommonDir, store } = createStoreFixture();
  let clockMinute = 0;
  const now = () => `2026-08-30T23:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(multiIdentity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: multiIdentity, maxParallel: 3 });
  seed.release();
  const recoveredStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "parent-close-recovered" });
  let coordinatorLeaseCalls = 0;
  const coordinatorStore = {
    ...recoveredStore,
    acquireRepositoryCloseLease() {
      coordinatorLeaseCalls += 1;
      throw new Error("coordinator must not acquire the repository close lease");
    },
    acquireTargetMutationWriter() {
      coordinatorLeaseCalls += 1;
      throw new Error("coordinator must not acquire the target mutation writer");
    },
  };
  let parentTrackerState = "OPEN";
  const tracker = { async read() { return { parentTrackerState }; } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is unnecessary after every child succeeded`);
    }]),
  );
  const leaf = {
    async closeParent({ issueId, requestIdentity, requestEvidence }) {
      assert.equal(issueId, "12");
      assert.equal(requestEvidence.target, multiIdentity.target);
      assert.equal(requestEvidence.maxParallel, 3);
      assert.equal(requestEvidence.targetState, "CLEAN");
      assert.equal(requestEvidence.targetHead, "a".repeat(40));
      assert.equal(requestEvidence.parentTrackerState, "OPEN");
      assert.equal(requestEvidence.parentTrackerIdentity, "github-issue:12:version:1");
      const leases = acquireCloseIssueLeases({
        store: recoveredStore,
        target: multiIdentity.target,
        repositoryId: "github:ron03wlb/skills",
        specId: multiIdentity.specId,
        approvedPublicationIdentity: multiIdentity.approvedScopeHash,
        issueId,
      });
      assert.equal(leases.assertCurrent(), true);
      parentTrackerState = "CLOSED";
      leases.release();
      return { settled: true, requestIdentity };
    },
  };
  const reconcile = async ({ tracker: currentTracker }) => reconciliation({
      runIdentity: multiIdentity,
      run: { parentTrackerState: currentTracker.parentTrackerState },
      nodes: ["13", "14", "15"].map((issueId) => ({
        issueId,
        blockers: [],
        trackerState: "CLOSED",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: true,
        worktreeState: "ABSENT",
      })),
  });

  try {
    const coordinator = createCoordinator({
      store: coordinatorStore,
      tracker,
      tasks,
      reconcile,
      leaf,
      now,
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "12" });

    assert.equal(status.run.state, "SUCCEEDED");
    assert.equal(coordinatorLeaseCalls, 0);
    assert.deepEqual(recoveredStore.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    assert.deepEqual(recoveredStore.observeTargetMutationWriter({ target: multiIdentity.target }), {
      state: "ABSENT",
      owner: null,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("known preparation gaps stop before Grant or task creation and the attested lane resumes without recreation", async () => {
  const { root, store } = createStoreFixture();
  const ref = { threadId: "prepared-task", hostId: "local" };
  let prepared = false;
  let accepted = false;
  let messages = 0;
  const tasks = {
    async findIssueLane({ prepared: packet }) { assert.deepEqual(packet.taskRef, ref); return [ref]; },
    async create() { throw new Error("Prepared work must reuse its task"); },
    async read() { return { state: accepted ? "RUNNING" : "RESUMABLE" }; },
    async message() { messages++; accepted = true; },
    async wait() { throw new Error("Cooperative step cannot wait"); },
  };
  const coordinator = createCoordinator({ store, tasks, tracker: { read: async () => ({}) },
    reconcile: async () => {
      const handoff = readyHandoffFor(identity);
      handoff.preparation = { state: prepared ? "READY" : "INCOMPLETE", reason: "Missing exact installation and SQL preparation" };
      return { ...reconciliation({ runReadyHandoff: handoff, nodes: [{ issueId: "15", blockers: [], trackerState: "OPEN", taskState: accepted ? "EXECUTING" : "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" }] }), preparedLanes: { 15: { taskRef: ref } } };
    }, now: () => "2026-09-06T00:00:00.000Z", sleep: async () => {},
  });
  try {
    assert.equal((await coordinator.run({ specId: "15", mode: "step" })).runReadyHandoff.state, "INCOMPLETE");
    assert.deepEqual(store.readEvents(identity.runId), []);
    assert.equal(messages, 0);
    prepared = true;
    await coordinator.run({ specId: "15", mode: "step" });
    assert.equal(messages, 1);
    assert.deepEqual(store.readEvents(identity.runId).find(event => event.type === "dispatch.recorded").taskRef, ref);
    await coordinator.run({ specId: "15", mode: "step" });
    assert.equal(messages, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("compatible runtime observation keeps the original Grant and incompatible sources remain isolated", async () => {
  const { root, store } = createStoreFixture();
  const first = { id: "1".repeat(64), sourceCommit: "a".repeat(40), sourceRepository: "github:example/repo", protocolVersion: 1 };
  const next = { ...first, id: "2".repeat(64), sourceCommit: "b".repeat(40) };
  const options = { store, tasks: Object.fromEntries(["findIssueLane", "create", "read", "message", "wait"].map(name => [name, async () => { throw new Error(`No task ${name}`); }])), tracker: { read: async () => ({}) },
    reconcile: async () => reconciliation({ nodes: [{ issueId: "15", blockers: [], trackerState: "OPEN", taskState: "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" }] }), now: () => "2026-09-06T00:00:00.000Z", sleep: async () => {} };
  try {
    await createCoordinator({ ...options, workflowVersion: first }).run({ specId: "15", mode: "snapshot" });
    const original = store.readEvents(identity.runId)[0];
    await createCoordinator({ ...options, workflowVersion: next, compatibleRecordedVersion: first }).run({ specId: "15", mode: "snapshot" });
    await createCoordinator({ ...options, workflowVersion: next, compatibleRecordedVersion: first }).run({ specId: "15", mode: "snapshot" });
    assert.deepEqual(store.readEvents(identity.runId)[0], original);
    assert.equal(store.readEvents(identity.runId).filter(event => event.type === "grant.recorded").length, 1);
    assert.equal(store.readEvents(identity.runId).filter(event => event.type === "runtime.observed").length, 1);
    const denied = await createCoordinator({ ...options, workflowVersion: { ...next, sourceRepository: "github:other/repo" }, compatibleRecordedVersion: first }).run({ specId: "15", mode: "snapshot" });
    assert.equal(denied.diagnoses.at(-1).reasonCode, "workflow_version_unavailable");
    assert.equal(store.readEvents(identity.runId).length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("conflict repair reuses the original lane and its persistent wave before closing only a newly reviewed candidate", async () => {
  const { root, store } = createStoreFixture();
  const ref = { threadId: "original", hostId: "local" };
  let candidate = "b".repeat(40);
  let repairRequest;
  let closeRequest;
  let repairs = 0;
  let closes = 0;
  let repaired = false;
  let running = false;
  let completed = false;
  const tasks = {
    async findIssueLane() { return [ref]; }, async create() { throw new Error("Never replace conflict lane"); },
    async read() { return { state: running ? "RUNNING" : "RESUMABLE", repairRequest, closeRequest,
      snapshot: { turns: [{ status: running ? "inProgress" : "completed", ...(running ? {} : { durationMs: 1 }) }] } }; },
    async message(taskRef, prompt) {
      assert.deepEqual(taskRef, ref);
      if (prompt.includes("Repair request:")) {
        repairs++; repairRequest = JSON.parse(prompt.match(/Repair request: (\{.+\})$/u)[1]); running = true;
        assert.match(prompt, /Verify the new candidate.*independent Standards and Spec review/u);
      } else {
        closes++; completed = true;
        closeRequest = { state: "ACCEPTED", requestIdentity: closeRequestIdentityFrom(prompt), runId: identity.runId, issueId: "15", evidence: JSON.parse(prompt.match(/Current close request evidence: (\{.+\})$/u)[1]) };
      }
    }, async wait() { throw new Error("A cooperative step cannot wait"); },
  };
  const options = { store, tasks, tracker: { read: async () => ({}) }, reconcile: async () => reconciliation({ taskRefs: { 15: ref },
    nodes: [{ issueId: "15", blockers: [], trackerState: completed ? "CLOSED" : "OPEN", taskState: running ? "EXECUTING" : "NONE", completionState: running ? "NONE" : "COMPLETE", candidateReachable: completed, worktreeState: completed ? "ABSENT" : "PRESENT", closeAuthorityEvidence: closeAuthorityEvidenceFor("15", { candidateCommit: candidate }), ...(!repaired && !running ? { closeConflict: { candidate, targetHead: "a".repeat(40) } } : {}) }] }), now: () => "2026-09-06T00:00:00.000Z", sleep: async () => {} };
  try {
    const writer = store.acquireWriter(identity.runId);
    writer.append({ type: "grant.recorded", at: options.now(), runIdentity: identity, maxParallel: 3 });
    writer.append({ type: "dispatch.recorded", at: options.now(), issueId: "15", attempt: 1, taskRef: ref }); writer.release();
    await createCoordinator(options).run({ specId: "15", mode: "step" });
    await createCoordinator(options).run({ specId: "15", mode: "step" });
    assert.equal(repairs, 1);
    assert.equal(store.readEvents(identity.runId).filter(event => event.type === "repair.recorded").length, 1);
    assert.equal(closes, 0, "repairing work has no renewed completion authority");
    running = false; repaired = true; candidate = "c".repeat(40);
    const result = await createCoordinator(options).run({ specId: "15", mode: "step" });
    assert.equal(closes, 1);
    assert.equal(result.run.state, "SUCCEEDED");
    const budgetWriter = store.acquireWriter(identity.runId);
    for (let wave = 2; wave <= 10; wave++) budgetWriter.append({ type: "repair.recorded", at: options.now(), issueId: "15", wave, candidate: String(wave).padStart(40, "0"), targetHead: "a".repeat(40), taskRef: ref, requestIdentity: `sha256:${String(wave).padStart(64, "0")}` });
    budgetWriter.release();
    repaired = false; completed = false; candidate = "d".repeat(40);
    for (let reentry = 0; reentry < 2; reentry++) {
      const exhausted = await createCoordinator(options).run({ specId: "15", mode: "step" });
      assert.equal(exhausted.diagnoses.at(-1).reasonCode, "repair_budget_exhausted");
    }
    assert.equal(repairs, 1);
    assert.equal(store.readEvents(identity.runId).filter(event => event.type === "repair.recorded").length, 10);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an ambiguous Issue lane isolates its dependants while the same Run dispatches independent work", async () => {
  const { root, store } = createStoreFixture();
  const active = new Set();
  let ambiguous = true;
  const creates = [];
  const actionStops = new Map();
  const options = { store, actionStops, tasks: {
    async findIssueLane({ issueId }) { return issueId === "13" && ambiguous ? [{ threadId: "first", hostId: "local" }, { threadId: "second", hostId: "local" }] : []; },
    async create({ issueId }) { creates.push(issueId); active.add(issueId); return { threadId: `task-${issueId}`, hostId: "local" }; },
    async read() { return { state: "RUNNING" }; }, async message() { throw new Error("No message expected"); }, async wait() { throw new Error("A batch step yields"); },
  }, tracker: { read: async () => ({}) }, reconcile: async () => reconciliation({ runIdentity: multiIdentity,
    nodes: ["13", "14", "16"].map(issueId => ({ issueId, blockers: issueId === "16" ? ["13"] : [], trackerState: "OPEN", taskState: active.has(issueId) ? "EXECUTING" : "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" })) }),
    now: () => "2026-09-06T00:00:00.000Z", sleep: async () => {} };
  try {
    const stopped = await createCoordinator(options).run({ specId: "12", mode: "step" });
    assert.deepEqual(stopped.diagnoses.find(item => item.reasonCode === "issue_lane_ambiguous").affectedNodes, ["13", "16"]);
    await createCoordinator(options).run({ specId: "12", mode: "snapshot" });
    await createCoordinator(options).run({ specId: "12", mode: "step" });
    assert.deepEqual(creates, ["14"]);
    ambiguous = false;
    await createCoordinator(options).run({ specId: "12", mode: "snapshot" });
    await createCoordinator(options).run({ specId: "12", mode: "step" });
    assert.deepEqual(creates, ["14", "13"], "fresh unique ownership unblocks only the original Issue without new approval");
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("batch first-round capacity includes unjournaled native creation intents in later lanes", async () => {
  for (const existingIdentity of [multiIdentity, { ...multiIdentity, classification: "SINGLE", decompositionIdentity: null }]) {
  for (const existing of [["first"], ["first", "second"]]) {
  const { root, store } = createStoreFixture();
  let creates = 0;
  let connected = true;
  const prompt = "the exact previously accepted creation prompt";
  store.reserveHostTask({ runId: existingIdentity.runId, issueId: "13", prompt });
  const tasks = createCodexWorkflowTasks({ store, project: { projectId: "project", hostId: "local" }, packageRoot: "/package", issueNumber: async id => id,
    host: { async call(name, args) {
      if (name.endsWith("list_threads")) return { threads: existing.map(id => ({ id, kind: "codex", projectId: "project", hostId: "local" })) };
      if (name.endsWith("read_thread")) return { thread: { id: args.threadId, hostId: "local", status: { type: "active" } }, turns: [{ items: [{ type: "userMessage", content: [{ type: "text", text: prompt }] }] }] };
      if (name.endsWith("create_thread")) { creates++; return { threadId: "new", hostId: "local" }; }
      throw new Error(`Unexpected ${name}`);
    } }, sleep: async () => {} });
  const options = { store, tasks, tracker: { read: async () => ({}) }, now: () => "2026-09-06T00:00:00.000Z", sleep: async () => {} };
  const lane = (runIdentity, issueId) => ({ specId: runIdentity.specId, run: request => createCoordinator({ ...options,
    reconcile: async ({ journal }) => reconciliation({ runIdentity, nodes: [{ issueId, blockers: [], trackerState: "OPEN", taskState: journal.some(event => event.type === "dispatch.recorded") ? "EXECUTING" : "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" }] }),
  }).run({ ...request, specId: runIdentity.specId }) });
  try {
    const result = await runBatch({ lanes: [lane(identity, "15"), lane(existingIdentity, "13")], maxWorkers: existing.length,
      connected: () => connected, sleep: async () => { connected = false; } });
    assert.equal(creates, 0, "the later ambiguous lane already occupies both shared slots");
    const observed = result.runs.find(status => status.run.specId === "12").nodes[0].task;
    if (existing.length === 2) assert.equal(observed.reservedWorkers, 2);
    else {
      assert.equal(observed.state, "EXECUTING");
      assert.equal(store.readEvents(existingIdentity.runId).filter(event => event.type === "dispatch.recorded").length, 1);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
  }
  }
});

test("failed close and repair actions exhaust one durable budget across fresh coordinators", async () => {
  for (const repair of [false, true]) {
    const { root, store } = createStoreFixture();
    const ref = { threadId: "original", hostId: "local" };
    let messages = 0;
    let candidate = "b".repeat(40);
    const options = { store, tracker: { read: async () => ({}) }, tasks: {
      findIssueLane: async () => [ref], read: async () => ({ state: "RESUMABLE" }),
      create: async () => { throw new Error("No replacement"); }, wait: async () => { throw new Error("No wait"); },
      message: async () => { messages++; throw new Error("Task message retry budget exhausted after native read-back"); },
    }, reconcile: async () => reconciliation({ runIdentity: multiIdentity, taskRefs: { 13: ref }, nodes: [
      { issueId: "13", blockers: [], trackerState: "OPEN", taskState: "NONE", completionState: "COMPLETE", candidateReachable: false, worktreeState: "PRESENT", closeAuthorityEvidence: closeAuthorityEvidenceFor("13", { candidateCommit: candidate }), ...(repair ? { closeConflict: { candidate, targetHead: "a".repeat(40) } } : {}) },
      { issueId: "14", blockers: ["13"], trackerState: "OPEN", taskState: "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" },
    ] }), now: () => "2026-09-06T00:00:00.000Z", sleep: async () => {} };
    try {
      const writer = store.acquireWriter(multiIdentity.runId);
      writer.append({ type: "grant.recorded", at: options.now(), runIdentity: multiIdentity, maxParallel: 3 });
      writer.append({ type: "dispatch.recorded", at: options.now(), issueId: "13", attempt: 1, taskRef: ref }); writer.release();
      let status;
      for (let entry = 0; entry < 8; entry++) status = await createCoordinator(options).run({ specId: "12", mode: "step" });
      assert.equal(messages, 3, "a unique existing lane does not reset the failed action budget");
      assert.deepEqual(status.diagnoses.find(item => item.reasonCode === "issue_action_retry_exhausted").affectedNodes, ["13", "14"]);
      assert.equal(store.readEvents(multiIdentity.runId).filter(event => event.type === "action.failed").length, 3);
      candidate = "c".repeat(40);
      await createCoordinator(options).run({ specId: "12", mode: "step" });
      assert.equal(messages, 4, "a freshly reviewed changed candidate supplies new owning-source progress");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
