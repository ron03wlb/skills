import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { acquireCloseIssueLeases } from "../../skills/engineering/close-issue/scripts/close-lease.mjs";
import {
  reduceRunReadyHandoff,
  RUN_READY_FACT_SCHEMA,
} from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";
import { createRunAuthorityAdapters } from "../../skills/personal/run-issue-workflow/scripts/run-authority-adapters.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { createWorkflowRuntime as createWorkflowRuntimeSource } from "../../skills/personal/run-issue-workflow/scripts/run-workflow.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import {
  bindProducerCheckpointOperationIdentity,
  createProducerOperationCheckpoint,
  deriveWorkflowOperationIdentity,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const createStoreFixture = (createStore = createRunStore) => {
  const root = mkdtempSync(join(tmpdir(), "dag-runtime-"));
  execFileSync("git", ["init", "-b", "features/ron"], { cwd: root, stdio: "ignore" });
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const gitCommonDir = resolve(root, common);
  return { root, gitCommonDir, store: createStore({ gitCommonDir, coordinatorInstanceId: "runtime-e2e" }) };
};

const identity = {
  runId: deriveWorkflowOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: "17",
    approvedPublicationIdentity: "sha256:issue-17",
    producer: "run-issue-workflow",
    stage: "run",
    issueId: null,
  }).key,
  specId: "17",
  approvedScopeHash: "sha256:issue-17",
  target: "features/ron",
  classification: "SINGLE",
  decompositionIdentity: null,
};

const multiIdentity = {
  runId: deriveWorkflowOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: "12",
    approvedPublicationIdentity: "sha256:spec-12",
    producer: "run-issue-workflow",
    stage: "run",
    issueId: null,
  }).key,
  specId: "12",
  approvedScopeHash: "sha256:spec-12",
  target: "features/ron",
  classification: "MULTI",
  decompositionIdentity: "decomposition:12:05",
};

const selectedPlanningSeal = "c".repeat(40);

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

const currentReadyHandoffFor = (runIdentity) => {
  const handoff = readyHandoffFor(runIdentity);
  const transactionIdentity = handoff.checkpoint.transactionIdentity;
  const publicationReadBack = {
    publicationIdentity: handoff.trackerRecordIdentities[0],
    trackerIdentity: `issue:${runIdentity.specId}`,
  };
  return {
    ...handoff,
    checkpoint: {
      ...handoff.checkpoint,
      profileVersion: "v2",
      operationId: "caller-correlation",
      bindings: {
        approvedScopeIdentity: runIdentity.approvedScopeHash,
        classification: runIdentity.classification,
        planningSeal: selectedPlanningSeal,
        ...(runIdentity.classification === "MULTI" ? {
          upstream: {
            handoffIdentity: "IC_to_spec_handoff",
            publicationIdentity: "IC_to_spec_publication",
          },
        } : {}),
      },
      ...(runIdentity.classification === "SINGLE" ? {
        stageReceipts: {
          planningSealReadBack: { planningSeal: selectedPlanningSeal, state: "reused" },
          publicationReadBack,
        },
      } : {}),
    },
    ...(runIdentity.classification === "SINGLE" ? {
      handoff: {
        ...handoff.handoff,
        transactionIdentity,
        publicationIdentity: publicationReadBack.publicationIdentity,
        trackerIdentity: publicationReadBack.trackerIdentity,
      },
    } : {}),
  };
};

const defaultRunReadyHandoffAdapter = {
  async read({ current }) { return current.runReadyHandoff; },
};
const createWorkflowRuntime = (options, runtimeSource = createWorkflowRuntimeSource) => {
  const {
    tracker,
    selector,
    reconcile,
    handoff = defaultRunReadyHandoffAdapter,
    ...runtimeOptions
  } = options;
  const handoffFacts = new WeakMap();
  const readHandoffFacts = async (input) => {
    if (!handoffFacts.has(input.current)) handoffFacts.set(input.current, await handoff.read(input));
    return handoffFacts.get(input.current);
  };
  return runtimeSource({
    ...runtimeOptions,
    authoritySources: {
      repository: { async readIdentity() { return "github:ron03wlb/skills"; } },
      tracker,
      selector,
      reconciliation: { read: reconcile },
      target: {
        async read({ current }) {
          return {
            state: current.facts.run.targetState,
            head: current.facts.run.targetHead,
            ownership: current.runReadyHandoff?.targetOwnership,
          };
        },
      },
      checkpoint: {
        async read(input) { return (await readHandoffFacts(input)).checkpoint; },
      },
      handoff: {
        async read(input) { return (await readHandoffFacts(input)).handoff; },
      },
      writer: {
        async readHealth({ current, leaseKind }) {
          return leaseKind === "repository-close"
            ? current.facts.run.repositoryCloseLeaseHealth ?? "UNKNOWN"
            : current.facts.run.closeWriterHealth ?? "UNKNOWN";
        },
      },
    },
  });
};

const singleRunCurrent = ({
  journal = [],
  model,
  targetState = "CLEAN",
  contradictions = [],
  runReadyHandoff = readyHandoffFor(identity),
  run = {},
}) => ({
  runIdentity: identity,
  grant: { runIdentity: identity, maxParallel: 3 },
  planningSeal: selectedPlanningSeal,
  runReadyHandoff,
  taskRefs: Object.fromEntries(journal
    .filter(({ type }) => type === "dispatch.recorded")
    .map(({ issueId, taskRef }) => [issueId, taskRef])),
  facts: {
    schema: "dag-run-facts:v1",
    run: {
      ...identity,
      reconciled: true,
      trackerAvailable: true,
      targetState,
      targetHead: "a".repeat(40),
      closeWriterRunId: null,
      closeWriterState: "ABSENT",
      parentTrackerState: "OPEN",
      parentTrackerIdentity: null,
      ...run,
    },
    nodes: [withCloseAuthorityEvidence({ issueId: "17", blockers: [], ...model })],
    contradictions,
  },
});

const runExplicitSelection = async ({
  store,
  candidates,
  currentRun,
  runReadyHandoff = currentReadyHandoffFor(currentRun),
}) => {
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
  };
  let creates = 0;
  const reconcile = async ({ request, journal }) => {
    const selectedRun = request.runIdentity ?? currentRun;
    const current = singleRunCurrent({ journal, model, runReadyHandoff });
    return {
      ...current,
      runIdentity: selectedRun,
      grant: { ...current.grant, runIdentity: selectedRun },
      facts: { ...current.facts, run: { ...current.facts.run, ...selectedRun } },
    };
  };
  const runtime = createWorkflowRuntime({
    store,
    tracker: { async read() { return {}; } },
    selector: { async listNonTerminalRuns() { return candidates.map((runIdentity) => ({ runIdentity })); } },
    tasks: {
      async findIssueLane() { return []; },
      async create() {
        creates += 1;
        model.taskState = "DISPATCHED";
        return { threadId: "thread-selected-run", hostId: "local" };
      },
      async read() { return { state: "RUNNING" }; },
      async message() { throw new Error("retry is unnecessary"); },
      async wait() { return { coordinatorActive: false, taskSettled: false }; },
    },
    reconcile,
    browser: { async open() {} },
    cleanup: { async listRuns() { return []; } },
    now: () => "2026-09-03T00:01:00.000Z",
    sleep: async () => {},
  });
  return { result: await runtime.run({ specId: currentRun.specId }), creates };
};

test("text controls can pause and stop a Run when its browser panel is unavailable", async () => {
  const { root, store } = createStoreFixture();
  const model = {
    trackerState: "OPEN", taskState: "NONE", completionState: "NONE",
    candidateReachable: false, worktreeState: "ABSENT",
  };
  const workflowVersion = { id: "a".repeat(64), sourceCommit: "b".repeat(40),
    sourceRepository: "/trusted/skills", protocolVersion: 1 };
  const controlsSeen = [];
  let disconnected = false;
  const tasks = Object.fromEntries(["findIssueLane", "create", "read", "message", "wait"]
    .map((name) => [name, async () => { throw new Error(`Stopped Run must not call ${name}`); }]));
  try {
    const runtime = createWorkflowRuntime({
      store, tasks, workflowVersion,
      tracker: { async read() { return {}; } },
      reconcile: async ({ journal }) => singleRunCurrent({ journal, model }),
      browser: { async open() { throw new Error("Browser unavailable"); } },
      controls: {
        async connect({ readStatus, submitControl }) {
          assert.equal((await readStatus()).run.runId, identity.runId);
          for (const command of ["PAUSE", "STOP"]) {
            const result = await submitControl(command);
            assert.equal(result.accepted, true);
            controlsSeen.push(command);
          }
          return { async close() { disconnected = true; } };
        },
      },
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-09-06T04:00:00.000Z", sleep: async () => {},
    });
    const result = await runtime.run({ specId: identity.specId });
    assert.equal(result.status.run.state, "STOPPED");
    assert.deepEqual(result.journal.find(({ type }) => type === "grant.recorded").workflowVersion, workflowVersion);
    assert.deepEqual(controlsSeen, ["PAUSE", "STOP"]);
    assert.deepEqual(result.journal.filter(({ type }) => type === "control.revised")
      .map(({ command }) => command), ["PAUSE", "STOP"]);
    assert.equal(result.journal.some(({ type }) => type === "dispatch.recorded"), false);
    assert.equal(result.panel.mode, "text");
    assert.equal(disconnected, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a paused text-only Run diagnoses host loss without requiring a browser", async () => {
  const { root, store } = createStoreFixture();
  const model = { trackerState: "OPEN", taskState: "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" };
  const tasks = Object.fromEntries(["findIssueLane", "create", "read", "message", "wait"]
    .map((name) => [name, async () => { throw new Error(`Paused Run must not call ${name}`); }]));
  try {
    const runtime = createWorkflowRuntime({
      store, tasks,
      tracker: { async read() { return {}; } },
      reconcile: async ({ journal }) => singleRunCurrent({ journal, model }),
      browser: { async open() { throw new Error("Browser unavailable"); } },
      controls: { async connect({ submitControl, onDisconnect }) {
        await submitControl("PAUSE");
        onDisconnect(new Error("CODEX_HOST_DISCONNECTED"));
        return { async close() {} };
      } },
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-09-06T04:00:00.000Z", sleep: async () => {},
    });
    const result = await runtime.run({ specId: identity.specId });
    const diagnosis = result.status.diagnoses.find(({ reasonCode }) => reasonCode === "coordinator_unavailable");
    assert.ok(diagnosis);
    assert.deepEqual(diagnosis.resumePredicates, ["active_host_reconnected"]);
    assert.equal(result.status.diagnoses.some(({ reasonCode }) => reasonCode === "panel_unavailable"), false);
    assert.equal(result.journal.some(({ type }) => type === "dispatch.recorded"), false);
    assert.equal(store.readWriterLock(identity.runId), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("runtime composition builds the owning-source handoff adapter", async () => {
  const { root, store } = createStoreFixture();
  const reads = [];
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
  };
  const current = singleRunCurrent({ journal: [], model });
  const authoritySources = {
    repository: {
      async readIdentity() {
        reads.push("repository");
        return "github:ron03wlb/skills";
      },
    },
    tracker: {
      async read() {
        reads.push("tracker");
        return { issueId: "17", state: "OPEN" };
      },
    },
    reconciliation: {
      async read() {
        reads.push("reconciliation");
        return current;
      },
    },
    target: {
      async read() {
        reads.push("target");
        return { state: "DIRTY" };
      },
    },
    checkpoint: {
      async read() {
        reads.push("checkpoint");
        return current.runReadyHandoff.checkpoint;
      },
    },
    handoff: {
      async read() {
        reads.push("handoff");
        return current.runReadyHandoff.handoff;
      },
    },
    writer: {
      async readHealth() {
        throw new Error("writer health is unnecessary when no writer exists");
      },
    },
  };
  const forbiddenTasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden for a DIRTY owning-source target`);
    }]),
  );
  let panelOpens = 0;

  try {
    const runtime = createWorkflowRuntimeSource({
      store,
      authoritySources,
      tasks: forbiddenTasks,
      browser: { async open() { panelOpens += 1; } },
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-08-30T07:30:00.000Z",
      sleep: async () => {},
    });
    const result = await runtime.run({ specId: "17", cleanupPreview: true });

    assert.equal(result.status.run.state, "BLOCKED");
    assert.equal(result.status.diagnoses[0].reasonCode, "target_ownership_conflict");
    assert.equal(result.status.runReadyHandoff.state, "UNKNOWN");
    assert.deepEqual(
      reads.slice(0, 6),
      ["tracker", "reconciliation", "target", "repository", "checkpoint", "handoff"],
    );
    assert.equal(reads.filter((name) => name === "checkpoint").length, 1);
    assert.equal(reads.filter((name) => name === "handoff").length, 1);
    assert.equal(panelOpens, 0);
    assert.equal(store.readEvents(identity.runId).filter(({ type }) => type === "grant.recorded").length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Run receipt owner derives one operation identity from the immediate producer receipt", async () => {
  const { root, store } = createStoreFixture();
  const current = singleRunCurrent({
    journal: [],
    model: {
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "ABSENT",
    },
    runReadyHandoff: currentReadyHandoffFor(identity),
  });
  const callerRunId = "caller-correlation-for-run-17";
  current.runIdentity = { ...current.runIdentity, runId: callerRunId };
  current.grant = { ...current.grant, runIdentity: current.runIdentity };
  current.facts = { ...current.facts, run: { ...current.facts.run, runId: callerRunId } };
  const expected = deriveWorkflowOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: identity.specId,
    approvedPublicationIdentity: identity.approvedScopeHash,
    producer: "run-issue-workflow",
    stage: "run",
    issueId: null,
  });
  const sources = {
    repository: { async readIdentity() { return "github:ron03wlb/skills"; } },
    tracker: { async read() { return {}; } },
    reconciliation: { async read() { return current; } },
    target: { async read() { return { state: "CLEAN", ownership: "NONE" }; } },
    checkpoint: {
      async read() { return current.runReadyHandoff.checkpoint; },
    },
    handoff: { async read() { return current.runReadyHandoff.handoff; } },
    writer: { async readHealth() { throw new Error("writer is absent"); } },
  };

  try {
    const adapters = createRunAuthorityAdapters({ sources, store, tasks: {} });
    const reconciled = await adapters.reconcile({ request: { specId: "17" }, tracker: {}, journal: [] });
    const facts = await adapters.handoff.read({ request: { specId: "17" }, tracker: {}, current: reconciled });

    assert.deepEqual(facts.operationIdentity, expected);
    assert.notEqual(facts.operationIdentity.key, callerRunId, "caller correlation must not define Run authority");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("operation identity leaves malformed current authority to the structured UNKNOWN reducer", async () => {
  const { root, store } = createStoreFixture();
  const current = singleRunCurrent({
    journal: [],
    model: {
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "ABSENT",
    },
    runReadyHandoff: currentReadyHandoffFor(identity),
  });
  delete current.runReadyHandoff.authority.approvedScopeHash;
  const sources = {
    repository: { async readIdentity() { return "github:ron03wlb/skills"; } },
    tracker: { async read() { return {}; } },
    reconciliation: { async read() { return current; } },
    target: { async read() { return { state: "CLEAN", ownership: "NONE" }; } },
    checkpoint: { async read() { return current.runReadyHandoff.checkpoint; } },
    handoff: { async read() { return current.runReadyHandoff.handoff; } },
    writer: { async readHealth() { throw new Error("writer is absent"); } },
  };

  try {
    const adapters = createRunAuthorityAdapters({ sources, store, tasks: {} });
    const reconciled = await adapters.reconcile({ request: { specId: "17" }, tracker: {}, journal: [] });
    const facts = await adapters.handoff.read({ request: { specId: "17" }, tracker: {}, current: reconciled });
    const reduced = reduceRunReadyHandoff(facts);

    assert.equal(facts.operationIdentity, null);
    assert.equal(reduced.state, "UNKNOWN");
    assert.equal(reduced.reasonCode, "invalid_run_ready_facts");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("approved revision operation identity does not resume another revision's Run", async () => {
  const { root, store } = createStoreFixture();
  const oldRun = {
    ...identity,
    runId: deriveWorkflowOperationIdentity({
      repositoryId: "github:ron03wlb/skills",
      specId: identity.specId,
      approvedPublicationIdentity: "sha256:old-approved-revision",
      producer: "run-issue-workflow",
      stage: "run",
      issueId: null,
    }).key,
    approvedScopeHash: "sha256:old-approved-revision",
  };
  const currentRun = {
    ...identity,
    runId: "caller-correlation-for-new-revision",
    approvedScopeHash: "sha256:new-approved-revision",
  };
  const expected = deriveWorkflowOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: currentRun.specId,
    approvedPublicationIdentity: currentRun.approvedScopeHash,
    producer: "run-issue-workflow",
    stage: "run",
    issueId: null,
  });
  const seed = store.acquireWriter(oldRun.runId);
  seed.append({
    type: "grant.recorded",
    at: "2026-09-03T00:00:00.000Z",
    runIdentity: oldRun,
    maxParallel: 3,
  });
  seed.release();
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
  };
  const taskRef = { threadId: "thread-new-revision", hostId: "local" };
  const selector = { async listNonTerminalRuns() { return [{ runIdentity: oldRun }]; } };
  const tracker = { async read() { return {}; } };
  const tasks = {
    async findIssueLane() { return []; },
    async create() { model.taskState = "DISPATCHED"; return taskRef; },
    async read() { return { state: "RUNNING" }; },
    async message() { throw new Error("retry is unnecessary"); },
    async wait() { return { coordinatorActive: false, taskSettled: false }; },
  };
  const runReadyHandoff = currentReadyHandoffFor(currentRun);
  const reconcile = async ({ journal }) => {
    const current = singleRunCurrent({ journal, model, runReadyHandoff });
    const runIdentity = { ...currentRun };
    return {
      ...current,
      runIdentity,
      grant: { ...current.grant, runIdentity },
      facts: { ...current.facts, run: { ...current.facts.run, ...runIdentity } },
    };
  };

  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker,
      selector,
      tasks,
      reconcile,
      browser: { async open() {} },
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-09-03T00:01:00.000Z",
      sleep: async () => {},
    });
    const result = await runtime.run({ specId: identity.specId });

    assert.equal(result.status.run.runId, expected.key);
    assert.equal(store.readEvents(oldRun.runId).filter(({ type }) => type === "grant.recorded").length, 1);
    assert.equal(result.journal.filter(({ type }) => type === "grant.recorded").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("same approved revision resumes one pre-identity Run without creating the deterministic Run", async () => {
  const { root, store } = createStoreFixture();
  const opaqueRun = { ...identity, runId: "pre-identity-run-17" };
  const deterministic = deriveWorkflowOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: identity.specId,
    approvedPublicationIdentity: identity.approvedScopeHash,
    producer: "run-issue-workflow",
    stage: "run",
    issueId: null,
  });
  const seed = store.acquireWriter(opaqueRun.runId);
  seed.append({
    type: "grant.recorded",
    at: "2026-09-03T00:00:00.000Z",
    runIdentity: opaqueRun,
    maxParallel: 3,
  });
  seed.release();

  try {
    const { result, creates } = await runExplicitSelection({
      store,
      candidates: [opaqueRun],
      currentRun: identity,
    });

    assert.equal(result.status.run.runId, opaqueRun.runId);
    assert.equal(creates, 1);
    assert.deepEqual(store.readEvents(deterministic.key), []);
    assert.ok(store.readEvents(opaqueRun.runId)
      .filter(({ type }) => type === "grant.recorded")
      .every(({ runIdentity }) => runIdentity.runId === opaqueRun.runId));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate same-authority pre-identity Runs stop before selecting or creating a Run", async () => {
  const { root, store } = createStoreFixture();
  const opaqueRuns = [
    { ...identity, runId: "pre-identity-run-17-a" },
    { ...identity, runId: "pre-identity-run-17-b" },
  ];
  for (const runIdentity of opaqueRuns) {
    const seed = store.acquireWriter(runIdentity.runId);
    seed.append({
      type: "grant.recorded",
      at: "2026-09-03T00:00:00.000Z",
      runIdentity,
      maxParallel: 3,
    });
    seed.release();
  }

  try {
    const { result, creates } = await runExplicitSelection({
      store,
      candidates: opaqueRuns,
      currentRun: identity,
    });

    assert.equal(result.status.run.runId, null);
    assert.equal(result.status.diagnoses[0].reasonCode, "run_selection_required");
    assert.equal(creates, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deterministic and opaque same-authority Runs stop as duplicate compatibility evidence", async () => {
  const { root, store } = createStoreFixture();
  const deterministicIdentity = deriveWorkflowOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: identity.specId,
    approvedPublicationIdentity: identity.approvedScopeHash,
    producer: "run-issue-workflow",
    stage: "run",
    issueId: null,
  });
  const candidates = [
    { ...identity, runId: deterministicIdentity.key },
    { ...identity, runId: "pre-identity-run-17" },
  ];
  for (const runIdentity of candidates) {
    const seed = store.acquireWriter(runIdentity.runId);
    seed.append({
      type: "grant.recorded",
      at: "2026-09-03T00:00:00.000Z",
      runIdentity,
      maxParallel: 3,
    });
    seed.release();
  }

  try {
    const { result, creates } = await runExplicitSelection({ store, candidates, currentRun: identity });

    assert.equal(result.status.run.runId, null);
    assert.equal(result.status.diagnoses[0].reasonCode, "run_selection_required");
    assert.equal(creates, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fresh Run from a frozen profile-v1 handoff still uses the deterministic identity", async () => {
  const { root, store } = createStoreFixture();
  const expected = deriveWorkflowOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: identity.specId,
    approvedPublicationIdentity: identity.approvedScopeHash,
    producer: "run-issue-workflow",
    stage: "run",
    issueId: null,
  });
  const legacyHandoff = readyHandoffFor(identity);
  legacyHandoff.checkpoint.profileVersion = "v1";

  try {
    const { result, creates } = await runExplicitSelection({
      store,
      candidates: [],
      currentRun: identity,
      runReadyHandoff: legacyHandoff,
    });

    assert.equal(result.status.run.runId, expected.key);
    assert.equal(creates, 1);
    assert.equal(result.journal.filter(({ type }) => type === "grant.recorded").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime interface rejects a caller-invented handoff adapter", () => {
  const { root, store } = createStoreFixture();
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {}]),
  );

  try {
    assert.throws(() => createWorkflowRuntimeSource({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile: async () => ({}),
      handoff: { async read() { return {}; } },
      browser: { async open() {} },
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-08-30T07:45:00.000Z",
      sleep: async () => {},
    }), /authoritySources/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("composed runtime leaves inactive leaf-writer recovery to close-issue", async () => {
  const { root, gitCommonDir } = createStoreFixture();
  const staleStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "runtime-stale-owner" });
  const staleWriter = staleStore.acquireTargetMutationWriter({
    target: identity.target,
    operationId: identity.runId,
  });
  const staleOwner = staleStore.readTargetMutationWriterLock(identity.target);
  const store = createRunStore({ gitCommonDir, coordinatorInstanceId: "runtime-reclaimer" });
  const reclaimProof = {
    previousCoordinatorInstanceId: staleOwner.coordinatorInstanceId,
    previousGeneration: staleOwner.generation,
    coordinatorState: "INACTIVE",
    reconciled: true,
    evidence: ["The exact prior coordinator is inactive."],
    abandonedOperationIds: [],
  };
  const taskRef = { threadId: "thread-17", hostId: "local" };
  let closeAccepted = false;
  let closeRequestIdentity = null;
  let closed = false;
  const tasks = {
    async findIssueLane() { return [taskRef]; },
    async create() { throw new Error("manual completion must reuse its Issue lane"); },
    async read() {
      return {
        state: "SETTLED",
        closeRequest: closeAccepted
          ? { state: "ACCEPTED", runId: identity.runId, issueId: "17", requestIdentity: closeRequestIdentity }
          : null,
      };
    },
    async message(_taskRef, prompt) {
      closeRequestIdentity = closeRequestIdentityFrom(prompt);
      closeAccepted = true;
    },
    async wait() {
      closed = true;
      return { coordinatorActive: true, taskSettled: true, closeRequestIdentity };
    },
  };
  const reconcile = async ({ journal }) => {
    const lock = store.readTargetMutationWriterLock(identity.target);
    const current = singleRunCurrent({
      journal,
      model: {
        trackerState: closed ? "CLOSED" : "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: closed,
        worktreeState: closed ? "ABSENT" : "PRESENT",
      },
      run: lock === null ? {} : {
        closeWriterRunId: lock.operationId,
        closeWriterState: "ACTIVE",
        closeWriterHealth: "INACTIVE",
        closeWriterOwner: {
          operationId: lock.operationId,
          coordinatorInstanceId: lock.coordinatorInstanceId,
          generation: lock.generation,
        },
      },
    });
    return { ...current, closeWriterReclaimProof: reclaimProof };
  };

  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      browser: { async open() {} },
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-08-30T07:50:00.000Z",
      sleep: async () => {},
    });
    const result = await runtime.run({ specId: "17", cleanupPreview: true });

    assert.equal(result.status.run.state, "BLOCKED");
    assert.equal(result.status.diagnoses.at(-1).reasonCode, "close_writer_conflict");
    assert.equal(closeAccepted, false);
    assert.equal(store.readTargetMutationWriterLock(identity.target).operationId, identity.runId);
  } finally {
    staleWriter.release();
    rmSync(root, { recursive: true, force: true });
  }
});

for (const { label, corrupt } of [
  {
    label: "unknown proof fields",
    corrupt: (proof) => ({ ...proof, unownedAssertion: true }),
  },
  {
    label: "duplicate abandoned operation ids",
    corrupt: (proof) => ({ ...proof, abandonedOperationIds: ["operation-1", "operation-1"] }),
  },
]) {
  test(`composed runtime fences inactive-writer reclaim with ${label}`, async () => {
    const { root, gitCommonDir } = createStoreFixture();
    const staleStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "runtime-stale-owner" });
    staleStore.acquireTargetMutationWriter({
      target: identity.target,
      operationId: identity.runId,
    });
    const staleOwner = staleStore.readTargetMutationWriterLock(identity.target);
    const store = createRunStore({ gitCommonDir, coordinatorInstanceId: "runtime-reclaimer" });
    const reclaimProof = corrupt({
      previousCoordinatorInstanceId: staleOwner.coordinatorInstanceId,
      previousGeneration: staleOwner.generation,
      coordinatorState: "INACTIVE",
      reconciled: true,
      evidence: ["The exact prior coordinator is inactive."],
      abandonedOperationIds: [],
    });
    const forbiddenTasks = Object.fromEntries(
      ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
        throw new Error(`${name} is forbidden for a non-exact reclaim proof`);
      }]),
    );
    const reconcile = async ({ journal }) => {
      const lock = store.readTargetMutationWriterLock(identity.target);
      const current = singleRunCurrent({
        journal,
        model: {
          trackerState: "OPEN",
          taskState: "NONE",
          completionState: "COMPLETE",
          candidateReachable: false,
          worktreeState: "PRESENT",
        },
        run: {
          closeWriterRunId: lock.operationId,
          closeWriterState: "ACTIVE",
          closeWriterHealth: "INACTIVE",
          closeWriterOwner: {
            operationId: lock.operationId,
            coordinatorInstanceId: lock.coordinatorInstanceId,
            generation: lock.generation,
          },
        },
      });
      return { ...current, closeWriterReclaimProof: reclaimProof };
    };

    try {
      const runtime = createWorkflowRuntime({
        store,
        tracker: { async read() { return {}; } },
        tasks: forbiddenTasks,
        reconcile,
        browser: { async open() {} },
        cleanup: { async listRuns() { return []; } },
        now: () => "2026-08-30T07:55:00.000Z",
        sleep: async () => {},
      });
      const result = await runtime.run({ specId: "17", cleanupPreview: true });
      const diagnosis = result.status.diagnoses.find(({ reasonCode }) => reasonCode === "close_writer_conflict");

      assert.equal(result.status.run.state, "BLOCKED");
      assert.equal(diagnosis.operatorPacket.disposition, "Recoverable blocker");
      assert.match(diagnosis.operatorPacket.owningSource, /target-writer lock/u);
      assert.equal(store.readTargetMutationWriterLock(identity.target).operationId, identity.runId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("multiple runtime instances keep per-Run max_parallel on one target", async () => {
  const { root, gitCommonDir } = createStoreFixture();
  const runA = {
    ...multiIdentity,
    runId: "run-71-multi",
    specId: "71",
    approvedScopeHash: "sha256:spec-71",
    decompositionIdentity: "decomposition:71",
  };
  const runB = {
    ...multiIdentity,
    runId: "run-72-multi",
    specId: "72",
    approvedScopeHash: "sha256:spec-72",
    decompositionIdentity: "decomposition:72",
  };
  const stores = [
    createRunStore({ gitCommonDir, coordinatorInstanceId: "runtime-71" }),
    createRunStore({ gitCommonDir, coordinatorInstanceId: "runtime-72" }),
  ];
  const definitions = [
    { runIdentity: runA, maxParallel: 1, issueIds: ["711", "712", "713"] },
    { runIdentity: runB, maxParallel: 2, issueIds: ["721", "722", "723"] },
  ];
  const created = [[], []];
  let waitingRuntimes = 0;
  let releaseWaiters;
  const bothWaiting = new Promise((resolve) => { releaseWaiters = resolve; });

  const runtimeFor = (index) => {
    const { runIdentity, maxParallel, issueIds } = definitions[index];
    const model = new Map(issueIds.map((issueId) => [issueId, "NONE"]));
    const tasks = {
      async findIssueLane() { return []; },
      async create({ issueId }) {
        created[index].push(issueId);
        model.set(issueId, "DISPATCHED");
        return { threadId: `thread-${issueId}`, hostId: "local" };
      },
      async read() { throw new Error("task read is unnecessary before the first wait"); },
      async message() { throw new Error("task message is unnecessary before the first wait"); },
      async wait() {
        waitingRuntimes += 1;
        if (waitingRuntimes === 2) releaseWaiters();
        await bothWaiting;
        return { coordinatorActive: false };
      },
    };
    const reconcile = async ({ journal }) => ({
      runIdentity,
      grant: { runIdentity, maxParallel },
      planningSeal: selectedPlanningSeal,
      runReadyHandoff: readyHandoffFor(runIdentity),
      taskRefs: Object.fromEntries(journal
        .filter(({ type }) => type === "dispatch.recorded")
        .map(({ issueId, taskRef }) => [issueId, taskRef])),
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
          parentTrackerIdentity: "github-issue:12:version:1",
        },
        nodes: issueIds.map((issueId) => ({
          issueId,
          blockers: [],
          trackerState: "OPEN",
          taskState: model.get(issueId),
          completionState: "NONE",
          candidateReachable: false,
          worktreeState: "ABSENT",
        })),
        contradictions: [],
      },
    });
    return createWorkflowRuntime({
      store: stores[index],
      tracker: { async read() { return {}; } },
      tasks,
      reconcile,
      browser: { async open() {} },
      cleanup: { async listRuns() { return []; } },
      now: () => `2026-08-30T07:5${index}:00.000Z`,
      sleep: async () => {},
    });
  };

  try {
    const [resultA, resultB] = await Promise.all(definitions.map(({ runIdentity }, index) => (
      runtimeFor(index).run({ specId: runIdentity.specId, cleanupPreview: true })
    )));

    assert.equal(resultA.status.run.state, "RUNNING");
    assert.equal(resultB.status.run.state, "RUNNING");
    assert.equal(resultA.status.run.maxParallel, 1);
    assert.equal(resultB.status.run.maxParallel, 2);
    assert.deepEqual(created, [["711"], ["721", "722"]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installed route composes concurrent Spec operations, Runs, writer wait, and same-command recovery", async () => {
  const { root, gitCommonDir } = createStoreFixture();
  const producerStore = createWorkflowControlStore({ gitCommonDir });
  const closeStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "installed-close-run" });
  const executionStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "installed-execution-run" });
  const proposedBaseline = "8".repeat(40);
  let liveTargetHead = proposedBaseline;
  let targetReconfirmed = false;
  let activeToSpecOperation = null;
  const toSpecOperationFor = (baseline) => bindProducerCheckpointOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: identity.specId,
    producerCommand: "to-spec",
    operationId: "replaced-by-owner-derived-identity",
    profileVersion: "v2",
    target: identity.target,
    baseline,
    bindings: {
      approvedScopeIdentity: identity.approvedScopeHash,
      classification: identity.classification,
      planningSeal: selectedPlanningSeal,
    },
  });
  const toTicketsOperation = bindProducerCheckpointOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: multiIdentity.specId,
    producerCommand: "to-tickets",
    operationId: "replaced-by-owner-derived-identity",
    profileVersion: "v2",
    target: multiIdentity.target,
    baseline: "9".repeat(40),
    bindings: {
      approvedScopeIdentity: multiIdentity.approvedScopeHash,
      classification: multiIdentity.classification,
      planningSeal: selectedPlanningSeal,
      upstream: {
        handoffIdentity: "handoff:to-spec:12",
        publicationIdentity: "tracker-version:12",
        trackerIdentity: "issue:12",
      },
    },
  });
  const singleRunOperationKey = deriveWorkflowOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: identity.specId,
    approvedPublicationIdentity: identity.approvedScopeHash,
    producer: "run-issue-workflow",
    stage: "run",
    issueId: null,
  }).key;
  const multiRunOperationKey = deriveWorkflowOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    specId: multiIdentity.specId,
    approvedPublicationIdentity: multiIdentity.approvedScopeHash,
    producer: "run-issue-workflow",
    stage: "run",
    issueId: null,
  }).key;
  const runReadyHandoffFromProducer = ({ runIdentity, operation }) => {
    const transaction = producerStore.readCheckpoint(operation);
    const receipts = Object.fromEntries(transaction.progress.map(({ stage, receipt }) => [stage, receipt]));
    const handoffIdentity = receipts["handoff.completed"]?.handoffIdentity ?? null;
    const common = {
      schema: RUN_READY_FACT_SCHEMA,
      authority: {
        specId: operation.specId,
        target: operation.target,
        planningSeal: operation.bindings.planningSeal,
        classification: operation.bindings.classification,
        approvedScopeHash: operation.bindings.approvedScopeIdentity,
        decompositionIdentity: runIdentity.decompositionIdentity,
      },
      targetState: "CLEAN",
      targetOwnership: "NONE",
      checkpoint: {
        state: transaction.state,
        producerCommand: operation.producerCommand,
        profileVersion: operation.profileVersion,
        transactionIdentity: transaction.transactionId,
        specId: operation.specId,
        target: operation.target,
        planningSeal: operation.bindings.planningSeal,
        classification: operation.bindings.classification,
        approvedScopeHash: operation.bindings.approvedScopeIdentity,
        baseline: operation.baseline,
        operationId: operation.operationId,
        bindings: operation.bindings,
        firstUnsatisfiedStage: transaction.nextStage,
        handoffIdentity,
      },
      decompositionIdentity: runIdentity.decompositionIdentity,
      evidence: [],
    };
    if (runIdentity.classification === "SINGLE") {
      const publication = receipts["publication.read_back"];
      const recordIdentities = publication ? [publication.publicationIdentity] : [];
      return {
        ...common,
        checkpoint: {
          ...common.checkpoint,
          stageReceipts: {
            planningSealReadBack: receipts["planning_seal.read_back"],
            publicationReadBack: publication,
          },
        },
        handoff: handoffIdentity === null ? null : {
          identity: handoffIdentity,
          producerCommand: operation.producerCommand,
          specId: operation.specId,
          target: operation.target,
          planningSeal: operation.bindings.planningSeal,
          classification: operation.bindings.classification,
          approvedScopeHash: operation.bindings.approvedScopeIdentity,
          decompositionIdentity: null,
          transactionIdentity: transaction.transactionId,
          publicationIdentity: publication.publicationIdentity,
          trackerIdentity: publication.trackerIdentity,
          recordIdentities,
        },
        trackerRecordIdentities: recordIdentities,
      };
    }

    const decomposition = receipts["decomposition.read_back"];
    const readyState = receipts["ready_state.read_back"];
    const recordIdentities = [operation.bindings.upstream.publicationIdentity, decomposition.decompositionIdentity];
    const blockerEdges = [];
    return {
      ...common,
      checkpoint: {
        ...common.checkpoint,
        stageReceipts: {
          decompositionReadBack: decomposition,
          readyStateReadBack: readyState,
        },
      },
      handoff: handoffIdentity === null ? null : {
        identity: handoffIdentity,
        producerCommand: operation.producerCommand,
        specId: operation.specId,
        target: operation.target,
        planningSeal: operation.bindings.planningSeal,
        classification: operation.bindings.classification,
        approvedScopeHash: operation.bindings.approvedScopeIdentity,
        decompositionIdentity: decomposition.decompositionIdentity,
        recordIdentities,
        upstreamPublicationIdentity: operation.bindings.upstream.publicationIdentity,
        upstreamHandoffIdentity: operation.bindings.upstream.handoffIdentity,
        operationReceipt: {
          transactionIdentity: transaction.transactionId,
          decompositionReadBack: decomposition,
          readyStateReadBack: readyState,
        },
        decompositionDigest: decomposition.decompositionDigest,
        decompositionMapping: decomposition.mapping,
        blockerEdges,
      },
      trackerRecordIdentities: recordIdentities,
      decompositionDigest: decomposition.decompositionDigest,
      decompositionMapping: decomposition.mapping,
      blockerEdges,
      readyFrontier: readyState.frontier,
    };
  };
  const producerHandoffReads = { SINGLE: 0, MULTI: 0 };
  const producerHandoffAdapter = ({ runIdentity, readOperation }) => ({
    async read() {
      producerHandoffReads[runIdentity.classification] += 1;
      return runReadyHandoffFromProducer({ runIdentity, operation: readOperation() });
    },
  });
  const runReadyAuthorityFromProducer = ({ runIdentity, operation }) => {
    const { checkpoint: _checkpoint, handoff: _handoff, ...authority } = runReadyHandoffFromProducer({ runIdentity, operation });
    return authority;
  };

  let publicationReadBack = null;
  let repairedSpec = null;
  const runToSpec = () => {
    if (activeToSpecOperation === null) {
      if (liveTargetHead !== proposedBaseline && !targetReconfirmed) {
        return { state: "BLOCKED", reasonCode: "TARGET_MOVED", expected: proposedBaseline, observed: liveTargetHead };
      }
      activeToSpecOperation = toSpecOperationFor(liveTargetHead);
    }
    let checkpoint = createProducerOperationCheckpoint({ store: producerStore, identity: activeToSpecOperation });
    if (checkpoint.nextStage === "planning_seal.read_back") {
      checkpoint = producerStore.advanceCheckpoint({
        identity: activeToSpecOperation,
        stage: "planning_seal.read_back",
        receipt: { planningSeal: selectedPlanningSeal, state: "reused" },
      });
    }
    if (checkpoint.nextStage === "publication.read_back") {
      if (publicationReadBack === null) return checkpoint;
      checkpoint = producerStore.advanceCheckpoint({
        identity: activeToSpecOperation,
        stage: "publication.read_back",
        receipt: publicationReadBack,
      });
    }
    if (checkpoint.nextStage === "handoff.completed") {
      checkpoint = producerStore.advanceCheckpoint({
        identity: activeToSpecOperation,
        stage: "handoff.completed",
        receipt: { handoffIdentity: "handoff:to-spec:17" },
      });
    }
    return checkpoint;
  };
  liveTargetHead = "9".repeat(40);
  const targetMovedSpec = runToSpec();
  const initialDecomposition = createProducerOperationCheckpoint({ store: producerStore, identity: toTicketsOperation });
  producerStore.advanceCheckpoint({
    identity: toTicketsOperation,
    stage: "decomposition.read_back",
    receipt: {
      decompositionIdentity: multiIdentity.decompositionIdentity,
      decompositionDigest: `sha256:${"5".repeat(64)}`,
      mapping: { "12/01": "821", "12/02": "822" },
    },
  });
  producerStore.advanceCheckpoint({
    identity: toTicketsOperation,
    stage: "ready_state.read_back",
    receipt: { frontier: ["821", "822"] },
  });
  const completedDecomposition = producerStore.advanceCheckpoint({
    identity: toTicketsOperation,
    stage: "handoff.completed",
    receipt: { handoffIdentity: "handoff:to-tickets:12" },
  });
  const competingWriter = executionStore.acquireTargetMutationWriter({
    target: identity.target,
    operationId: "planning-seal-spec-12",
  });
  const closeTaskRef = { threadId: "thread-17", hostId: "local" };
  const closeModel = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "COMPLETE",
    candidateReachable: false,
    worktreeState: "PRESENT",
    closeAccepted: false,
    closeRequestIdentity: null,
  };
  const executionIssueIds = ["821", "822"];
  const executionModel = new Map(executionIssueIds.map((issueId) => [issueId, "NONE"]));
  const created = [];
  let resolveExecutionStarted;
  const executionStarted = new Promise((resolve) => { resolveExecutionStarted = resolve; });
  let competingWriterReleased = false;
  let trackerReads = 0;
  let closeMessageTrackerReads = null;
  let second = 0;
  const now = () => `2026-08-30T08:10:${String(second++).padStart(2, "0")}.000Z`;

  const closeRuntime = createWorkflowRuntime({
    store: closeStore,
    handoff: producerHandoffAdapter({ runIdentity: identity, readOperation: () => activeToSpecOperation }),
    tracker: {
      async read() {
        trackerReads += 1;
        return { issueId: "17", state: closeModel.trackerState };
      },
    },
    tasks: {
      async findIssueLane() { return [closeTaskRef]; },
      async create() { throw new Error("completed Issue must reuse its lane"); },
      async read() {
        return {
          state: "SETTLED",
          closeRequest: closeModel.closeAccepted
            ? {
                state: "ACCEPTED",
                runId: singleRunOperationKey,
                issueId: "17",
                requestIdentity: closeModel.closeRequestIdentity,
              }
            : null,
        };
      },
      async message(_taskRef, prompt) {
        assert.deepEqual(created, executionIssueIds, "the other Run must dispatch while closeout is waiting");
        closeMessageTrackerReads = trackerReads;
        closeModel.closeRequestIdentity = closeRequestIdentityFrom(prompt);
        closeModel.closeAccepted = true;
      },
      async wait() {
        closeModel.trackerState = "CLOSED";
        closeModel.candidateReachable = true;
        closeModel.worktreeState = "ABSENT";
        return {
          coordinatorActive: true,
          taskSettled: true,
          closeRequestIdentity: closeModel.closeRequestIdentity,
        };
      },
    },
    reconcile: async ({ journal }) => {
      const lock = closeStore.readTargetMutationWriterLock(identity.target);
      const current = singleRunCurrent({
        journal,
        model: closeModel,
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
      });
      return {
        ...current,
        runReadyHandoff: undefined,
        runReadyAuthority: runReadyAuthorityFromProducer({ runIdentity: identity, operation: activeToSpecOperation }),
      };
    },
    browser: { async open() {} },
    cleanup: { async listRuns() { return []; } },
    now,
    sleep: async () => {
      await executionStarted;
      if (!competingWriterReleased) {
        competingWriter.release();
        competingWriterReleased = true;
      }
    },
  });

  const executionRuntime = createWorkflowRuntime({
    store: executionStore,
    handoff: producerHandoffAdapter({ runIdentity: multiIdentity, readOperation: () => toTicketsOperation }),
    tracker: { async read() { return {}; } },
    tasks: {
      async findIssueLane() { return []; },
      async create({ issueId }) {
        created.push(issueId);
        executionModel.set(issueId, "DISPATCHED");
        if (created.length === executionIssueIds.length) resolveExecutionStarted();
        return { threadId: `thread-${issueId}`, hostId: "local" };
      },
      async read() { throw new Error("task read is unnecessary before the first wait"); },
      async message() { throw new Error("task message is unnecessary before the first wait"); },
      async wait() {
        await executionStarted;
        return { coordinatorActive: false };
      },
    },
    reconcile: async ({ journal }) => ({
      runIdentity: multiIdentity,
      grant: { runIdentity: multiIdentity, maxParallel: 2 },
      planningSeal: selectedPlanningSeal,
      runReadyAuthority: runReadyAuthorityFromProducer({ runIdentity: multiIdentity, operation: toTicketsOperation }),
      taskRefs: Object.fromEntries(journal
        .filter(({ type }) => type === "dispatch.recorded")
        .map(({ issueId, taskRef }) => [issueId, taskRef])),
      facts: {
        schema: "dag-run-facts:v1",
        run: {
          ...multiIdentity,
          reconciled: true,
          trackerAvailable: true,
          targetState: "CLEAN",
          targetHead: "a".repeat(40),
          closeWriterRunId: "planning-seal-spec-12",
          closeWriterState: "ACTIVE",
          closeWriterHealth: "HEALTHY",
          parentTrackerState: "OPEN",
          parentTrackerIdentity: "github-issue:12:version:1",
        },
        nodes: executionIssueIds.map((issueId) => ({
          issueId,
          blockers: [],
          trackerState: "OPEN",
          taskState: executionModel.get(issueId),
          completionState: "NONE",
          candidateReachable: false,
          worktreeState: "ABSENT",
        })),
        contradictions: [],
      },
    }),
    browser: { async open() {} },
    cleanup: { async listRuns() { return []; } },
    now,
    sleep: async () => {},
  });

  try {
    const executionPromise = executionRuntime.run({ specId: multiIdentity.specId, cleanupPreview: true });
    await executionStarted;
    assert.deepEqual(created, executionIssueIds, "target movement in one lane must not block the other Run");

    targetReconfirmed = true;
    const stoppedSpec = runToSpec();
    publicationReadBack = { publicationIdentity: "tracker-version:17", trackerIdentity: "issue:17" };
    repairedSpec = runToSpec();
    const [closeResult, executionResult] = await Promise.all([
      closeRuntime.run({ specId: identity.specId, cleanupPreview: true }),
      executionPromise,
    ]);
    const waits = closeResult.journal.filter(({ type }) => type.startsWith("target-writer-wait."));

    assert.equal(closeResult.status.run.state, "SUCCEEDED");
    assert.equal(executionResult.status.run.state, "RUNNING");
    assert.deepEqual(created, executionIssueIds);
    assert.deepEqual(waits.map(({ outcome }) => outcome ?? null), [null, "RELEASED"]);
    assert.ok(closeMessageTrackerReads >= 3, "closeout must use post-wait tracker evidence");
    assert.deepEqual(
      targetMovedSpec,
      { state: "BLOCKED", reasonCode: "TARGET_MOVED", expected: proposedBaseline, observed: liveTargetHead },
      "the planning lane must revalidate a moved target before publication",
    );
    assert.equal(activeToSpecOperation.baseline, liveTargetHead, "human reconfirmation binds the moved target baseline");
    assert.equal(stoppedSpec.nextStage, "publication.read_back", "owning-source failure preserves the producer stage");
    assert.equal(repairedSpec.state, "COMPLETED", "the same to-spec command resumes after human repair");
    assert.equal(repairedSpec.scopeKey, stoppedSpec.scopeKey, "same-command recovery keeps the exact producer operation");
    assert.equal(repairedSpec.transactionId, stoppedSpec.transactionId);
    assert.equal(completedDecomposition.state, "COMPLETED");
    assert.deepEqual(producerStore.readCheckpoint(toTicketsOperation), completedDecomposition, "repair must not mutate the other lane");
    assert.notEqual(stoppedSpec.scopeKey, initialDecomposition.scopeKey, "producer operations remain isolated on one target");
    assert.equal(
      closeResult.journal.find(({ type }) => type === "grant.recorded").runIdentity.runId,
      singleRunOperationKey,
      "fresh Single Run must bind the owner-derived operation identity",
    );
    assert.equal(
      executionResult.journal.find(({ type }) => type === "grant.recorded").runIdentity.runId,
      multiRunOperationKey,
      "different Spec authority must bind a different Run operation identity",
    );
    assert.ok(producerHandoffReads.SINGLE > 0, "the Single Run must consume its producer through the concrete authority adapter");
    assert.ok(producerHandoffReads.MULTI > 0, "the Multi Run must consume its producer through the concrete authority adapter");
    assert.equal(closeStore.readTargetMutationWriterLock(identity.target), null);
  } finally {
    if (!competingWriterReleased) competingWriter.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("installed route proves real close leaf concurrency and same-command resume recovery", async () => {
  const installedRoot = mkdtempSync(join(tmpdir(), "installed-workflow-skills-"));
  const installedTargets = {
    "close-issue": resolve("skills/engineering/close-issue"),
    "run-issue-workflow": resolve("skills/personal/run-issue-workflow"),
  };
  for (const [name, target] of Object.entries(installedTargets)) {
    symlinkSync(target, join(installedRoot, name), "junction");
    const resolvedLink = realpathSync(join(installedRoot, name));
    const resolvedTarget = realpathSync(target);
    assert.equal(
      process.platform === "win32" ? resolvedLink.toLowerCase() : resolvedLink,
      process.platform === "win32" ? resolvedTarget.toLowerCase() : resolvedTarget,
      `${name} must resolve through the installed skill link`,
    );
  }
  const [installedCloseLeaf, installedRunStore, installedRunWorkflow, installedOperationIdentity] = await Promise.all([
    import(pathToFileURL(join(installedRoot, "close-issue/scripts/close-lease.mjs")).href),
    import(pathToFileURL(join(installedRoot, "run-issue-workflow/scripts/run-store.mjs")).href),
    import(pathToFileURL(join(installedRoot, "run-issue-workflow/scripts/run-workflow.mjs")).href),
    import(pathToFileURL(join(installedRoot, "run-issue-workflow/scripts/workflow-operation-identity.mjs")).href),
  ]);
  const acquireInstalledCloseIssueLeases = installedCloseLeaf.acquireCloseIssueLeases;
  const createInstalledRunStore = installedRunStore.createRunStore;
  const createInstalledWorkflowRuntime = installedRunWorkflow.createWorkflowRuntime;
  const deriveInstalledWorkflowOperationIdentity = installedOperationIdentity.deriveWorkflowOperationIdentity;
  const repositoryA = createStoreFixture(createInstalledRunStore);
  const repositoryB = createStoreFixture(createInstalledRunStore);
  const repositoryIdA = "github:example/installed-a";
  const repositoryIdB = "github:example/installed-b";
  const runIdentityFor = ({ repositoryId, specId, target, classification = "SINGLE" }) => {
    const approvedScopeHash = `sha256:${specId.padStart(64, "0")}`;
    return {
      runId: deriveInstalledWorkflowOperationIdentity({
        repositoryId,
        specId,
        approvedPublicationIdentity: approvedScopeHash,
        producer: "run-issue-workflow",
        stage: "run",
        issueId: null,
      }).key,
      specId,
      approvedScopeHash,
      target,
      classification,
      decompositionIdentity: classification === "MULTI" ? `decomposition:${specId}` : null,
    };
  };
  const runs = {
    closeA1: runIdentityFor({ repositoryId: repositoryIdA, specId: "91", target: "features/one" }),
    closeA2: runIdentityFor({ repositoryId: repositoryIdA, specId: "92", target: "features/two" }),
    closeB: runIdentityFor({ repositoryId: repositoryIdB, specId: "93", target: "features/three" }),
    executeA: runIdentityFor({
      repositoryId: repositoryIdA,
      specId: "94",
      target: "features/four",
      classification: "MULTI",
    }),
    executeB: runIdentityFor({
      repositoryId: repositoryIdB,
      specId: "95",
      target: "features/five",
      classification: "MULTI",
    }),
  };
  const stores = {
    closeA1: createInstalledRunStore({
      gitCommonDir: repositoryA.gitCommonDir,
      coordinatorInstanceId: "installed-coordinator-a1",
    }),
    closeA2: createInstalledRunStore({
      gitCommonDir: repositoryA.gitCommonDir,
      coordinatorInstanceId: "installed-coordinator-a2",
    }),
    closeB: createInstalledRunStore({
      gitCommonDir: repositoryB.gitCommonDir,
      coordinatorInstanceId: "installed-coordinator-b",
    }),
    leafA1: createInstalledRunStore({
      gitCommonDir: repositoryA.gitCommonDir,
      coordinatorInstanceId: "real-close-leaf-a1",
    }),
    leafA2: createInstalledRunStore({
      gitCommonDir: repositoryA.gitCommonDir,
      coordinatorInstanceId: "real-close-leaf-a2",
    }),
    leafB: createInstalledRunStore({
      gitCommonDir: repositoryB.gitCommonDir,
      coordinatorInstanceId: "real-close-leaf-b",
    }),
    executeA: createInstalledRunStore({
      gitCommonDir: repositoryA.gitCommonDir,
      coordinatorInstanceId: "installed-execute-a",
    }),
    executeB: createInstalledRunStore({
      gitCommonDir: repositoryB.gitCommonDir,
      coordinatorInstanceId: "installed-execute-b",
    }),
  };
  const trace = [];
  let releaseHeldLeaves;
  const heldLeavesReleased = new Promise((resolve) => { releaseHeldLeaves = resolve; });
  const acquired = {};
  const acquiredPromises = {};
  for (const label of ["closeA1", "closeB"]) {
    acquiredPromises[label] = new Promise((resolve) => { acquired[label] = resolve; });
  }

  const createCloseHarness = ({
    label,
    store,
    leafStore,
    runIdentity,
    repositoryId,
    issueId,
    holdLeaf = false,
    sleep = async () => {},
  }) => {
    const taskRef = { threadId: `thread-${issueId}`, hostId: "local" };
    const seed = store.acquireWriter(runIdentity.runId);
    seed.append({
      type: "grant.recorded",
      at: "2026-09-04T00:00:00.000Z",
      runIdentity,
      maxParallel: 1,
    });
    seed.append({
      type: "dispatch.recorded",
      at: "2026-09-04T00:00:01.000Z",
      issueId,
      attempt: 1,
      taskRef,
    });
    seed.release();
    const model = {
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "COMPLETE",
      candidateReachable: false,
      worktreeState: "PRESENT",
      closeAccepted: false,
      closeRequestIdentity: null,
    };
    let leafLeases = null;
    let closeMessages = 0;
    let trackerReads = 0;
    let trackerReadsAtMessage = null;
    const evidenceReads = {
      tracker: 0,
      target: 0,
      candidate: 0,
      completion: 0,
      worktree: 0,
      control: 0,
      grant: 0,
    };
    let evidenceReadsAtMessage = null;
    let second = 2;
    const now = () => new Date(Date.UTC(2026, 8, 4, 0, 0, second++)).toISOString();
    const coordinatorStore = {
      ...store,
      acquireRepositoryCloseLease() {
        throw new Error("the installed coordinator must not acquire the repository close lease");
      },
      acquireTargetMutationWriter() {
        throw new Error("the installed coordinator must not acquire the target mutation writer");
      },
    };
    const tracker = {
      async read() {
        trackerReads += 1;
        evidenceReads.tracker += 1;
        return { issueId, state: model.trackerState };
      },
    };
    const tasks = {
      async findIssueLane() { return [taskRef]; },
      async create() { throw new Error("completed Issue must reuse its installed lane"); },
      async read() {
        return {
          state: "SETTLED",
          closeRequest: model.closeAccepted
            ? {
                state: "ACCEPTED",
                runId: runIdentity.runId,
                issueId,
                requestIdentity: model.closeRequestIdentity,
              }
            : null,
        };
      },
      async message(_taskRef, prompt) {
        closeMessages += 1;
        trackerReadsAtMessage = trackerReads;
        evidenceReadsAtMessage = { ...evidenceReads };
        assert.match(prompt, new RegExp(`\\$close-issue.*${issueId}`, "u"));
        assert.match(prompt, new RegExp(`"target":"${runIdentity.target}"`, "u"));
        assert.match(prompt, /"completionState":"COMPLETE"/u);
        assert.match(prompt, /"worktreeState":"PRESENT"/u);
        model.closeRequestIdentity = closeRequestIdentityFrom(prompt);
        leafLeases = acquireInstalledCloseIssueLeases({
          store: leafStore,
          target: runIdentity.target,
          repositoryId,
          specId: runIdentity.specId,
          approvedPublicationIdentity: runIdentity.approvedScopeHash,
          issueId,
        });
        trace.push({
          event: "acquire",
          label,
          at: now(),
          operationId: leafLeases.operationId,
          repositoryLeaseOwner: leafStore.observeRepositoryCloseLease().owner,
          targetWriterOperationId: leafStore.readTargetMutationWriterLock(runIdentity.target)?.operationId ?? null,
        });
        acquired[label]?.();
        model.closeAccepted = true;
      },
      async wait() {
        if (holdLeaf) await heldLeavesReleased;
        model.trackerState = "CLOSED";
        model.candidateReachable = true;
        model.worktreeState = "ABSENT";
        assert.equal(leafLeases.assertCurrent(), true);
        trace.push({
          event: "release",
          label,
          at: now(),
          operationId: leafLeases.operationId,
          repositoryLeaseOwner: leafStore.observeRepositoryCloseLease().owner,
          targetWriterOperationId: leafStore.readTargetMutationWriterLock(runIdentity.target)?.operationId ?? null,
        });
        leafLeases.release();
        leafLeases = null;
        return {
          coordinatorActive: true,
          taskSettled: true,
          closeRequestIdentity: model.closeRequestIdentity,
        };
      },
    };
    const reconcile = async ({ journal }) => {
      const repositoryLease = store.observeRepositoryCloseLease();
      evidenceReads.target += 1;
      evidenceReads.candidate += 1;
      evidenceReads.completion += 1;
      evidenceReads.worktree += 1;
      evidenceReads.control += 1;
      const controlRevision = journal.findLast(({ type }) => type === "control.revised")?.revision ?? 0;
      const recordedGrant = journal.findLast(({ type }) => type === "grant.recorded");
      assert.equal(controlRevision, 0);
      if (recordedGrant) {
        evidenceReads.grant += 1;
        assert.equal(recordedGrant.runIdentity.runId, runIdentity.runId);
        assert.equal(recordedGrant.maxParallel, 1);
      }
      return {
        runIdentity,
        grant: { runIdentity, maxParallel: 1 },
        planningSeal: selectedPlanningSeal,
        runReadyHandoff: readyHandoffFor(runIdentity),
        taskRefs: { [issueId]: taskRef },
        facts: {
          schema: "dag-run-facts:v1",
          run: {
            ...runIdentity,
            reconciled: true,
            trackerAvailable: true,
            targetState: "CLEAN",
            targetHead: "a".repeat(40),
            repositoryCloseLeaseOperationId: repositoryLease.owner?.operationId ?? null,
            repositoryCloseLeaseState: repositoryLease.state === "ABSENT" ? "ABSENT" : "ACTIVE",
            repositoryCloseLeaseHealth: repositoryLease.state === "ABSENT" ? null : "HEALTHY",
            repositoryCloseLeaseOwner: repositoryLease.owner,
            closeWriterRunId: null,
            closeWriterState: "ABSENT",
            parentTrackerState: "OPEN",
            parentTrackerIdentity: null,
          },
          nodes: [withCloseAuthorityEvidence({ issueId, blockers: [], ...model })],
          contradictions: [],
        },
      };
    };
    const runtime = () => createWorkflowRuntime({
      store: coordinatorStore,
      tracker,
      tasks,
      reconcile,
      browser: { async open() {} },
      cleanup: { async listRuns() { return []; } },
      now,
      sleep,
    }, createInstalledWorkflowRuntime);
    return {
      runtime,
      snapshot: () => ({
        closeMessages,
        trackerReads,
        trackerReadsAtMessage,
        evidenceReads: { ...evidenceReads },
        evidenceReadsAtMessage: evidenceReadsAtMessage === null ? null : { ...evidenceReadsAtMessage },
        leafLeases,
      }),
      release: () => leafLeases?.release(),
    };
  };

  const createExecutionHarness = ({ store, runIdentity, issueIds, maxParallel }) => {
    const model = new Map(issueIds.map((issueId) => [issueId, "NONE"]));
    const created = [];
    const runtime = createWorkflowRuntime({
      store,
      tracker: { async read() { return {}; } },
      tasks: {
        async findIssueLane() { return []; },
        async create({ issueId }) {
          created.push(issueId);
          model.set(issueId, "DISPATCHED");
          return { threadId: `thread-${issueId}`, hostId: "local" };
        },
        async read() { return { state: "RUNNING" }; },
        async message() { throw new Error("execution-only Run must not request closeout"); },
        async wait() { return { coordinatorActive: false, taskSettled: false }; },
      },
      reconcile: async ({ journal }) => {
        const repositoryLease = store.observeRepositoryCloseLease();
        return {
          runIdentity,
          grant: { runIdentity, maxParallel },
          planningSeal: selectedPlanningSeal,
          runReadyHandoff: readyHandoffFor(runIdentity),
          taskRefs: Object.fromEntries(journal
            .filter(({ type }) => type === "dispatch.recorded")
            .map(({ issueId, taskRef }) => [issueId, taskRef])),
          facts: {
            schema: "dag-run-facts:v1",
            run: {
              ...runIdentity,
              reconciled: true,
              trackerAvailable: true,
              targetState: "CLEAN",
              targetHead: "a".repeat(40),
              repositoryCloseLeaseOperationId: repositoryLease.owner?.operationId ?? null,
              repositoryCloseLeaseState: repositoryLease.state === "ABSENT" ? "ABSENT" : "ACTIVE",
              repositoryCloseLeaseHealth: repositoryLease.state === "ABSENT" ? null : "HEALTHY",
              repositoryCloseLeaseOwner: repositoryLease.owner,
              closeWriterRunId: null,
              closeWriterState: "ABSENT",
              parentTrackerState: "OPEN",
              parentTrackerIdentity: `github-issue:${runIdentity.specId}:version:1`,
            },
            nodes: issueIds.map((issueId) => ({
              issueId,
              blockers: [],
              trackerState: "OPEN",
              taskState: model.get(issueId),
              completionState: "NONE",
              candidateReachable: false,
              worktreeState: model.get(issueId) === "NONE" ? "ABSENT" : "PRESENT",
            })),
            contradictions: [],
          },
        };
      },
      browser: { async open() {} },
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-09-04T00:01:00.000Z",
      sleep: async () => {},
    }, createInstalledWorkflowRuntime);
    return { runtime, created };
  };

  let closeA1;
  let closeA2;
  let closeB;
  try {
    closeA1 = createCloseHarness({
      label: "closeA1",
      store: stores.closeA1,
      leafStore: stores.leafA1,
      runIdentity: runs.closeA1,
      repositoryId: repositoryIdA,
      issueId: "91",
      holdLeaf: true,
    });
    let closeA2SleepCalls = 0;
    closeA2 = createCloseHarness({
      label: "closeA2",
      store: stores.closeA2,
      leafStore: stores.leafA2,
      runIdentity: runs.closeA2,
      repositoryId: repositoryIdA,
      issueId: "92",
      sleep: async () => { closeA2SleepCalls += 1; return closeA2SleepCalls >= 65 ? { coordinatorActive: false } : undefined; },
    });
    closeB = createCloseHarness({
      label: "closeB",
      store: stores.closeB,
      leafStore: stores.leafB,
      runIdentity: runs.closeB,
      repositoryId: repositoryIdB,
      issueId: "93",
      holdLeaf: true,
    });
    const executionA = createExecutionHarness({
      store: stores.executeA,
      runIdentity: runs.executeA,
      issueIds: ["941", "942"],
      maxParallel: 1,
    });
    const executionB = createExecutionHarness({
      store: stores.executeB,
      runIdentity: runs.executeB,
      issueIds: ["951", "952", "953"],
      maxParallel: 2,
    });

    const heldClosePromises = {
      closeA1: closeA1.runtime().run({ specId: runs.closeA1.specId, cleanupPreview: true }),
      closeB: closeB.runtime().run({ specId: runs.closeB.specId, cleanupPreview: true }),
    };
    const acquisitionOrFailure = (label) => Promise.race([
      acquiredPromises[label],
      heldClosePromises[label].then(() => {
        throw new Error(`${label} settled before acquiring its close leases`);
      }),
    ]);
    await Promise.all([acquisitionOrFailure("closeA1"), acquisitionOrFailure("closeB")]);
    assert.notEqual(
      stores.closeA1.observeRepositoryCloseLease().state,
      "ABSENT",
      "different Git common directories overlap while both real leaves hold authority",
    );
    assert.notEqual(stores.closeB.observeRepositoryCloseLease().state, "ABSENT");
    assert.equal(
      stores.closeA1.observeRepositoryCloseLease().owner.coordinatorInstanceId,
      "real-close-leaf-a1",
    );
    assert.equal(
      stores.closeB.observeRepositoryCloseLease().owner.coordinatorInstanceId,
      "real-close-leaf-b",
    );

    const [blockedCloseA2, executionResultA, executionResultB] = await Promise.all([
      closeA2.runtime().run({ specId: runs.closeA2.specId, cleanupPreview: true }),
      executionA.runtime.run({ specId: runs.executeA.specId, cleanupPreview: true }),
      executionB.runtime.run({ specId: runs.executeB.specId, cleanupPreview: true }),
    ]);
    const readsAfterTimeout = closeA2.snapshot().trackerReads;
    const evidenceReadsAfterTimeout = closeA2.snapshot().evidenceReads;

    assert.equal(blockedCloseA2.status.run.state, "BLOCKED");
    const timeoutDiagnosis = blockedCloseA2.status.diagnoses.at(-1);
    assert.equal(timeoutDiagnosis.reasonCode, "repository_close_lease_wait_coordinator_lost");
    assert.equal(blockedCloseA2.status.nodes[0].task.retryCount, 0);
    assert.equal(blockedCloseA2.status.nodes[0].close.completionState, "COMPLETE");
    assert.equal(blockedCloseA2.status.nodes[0].close.candidateReachable, false);
    assert.equal(blockedCloseA2.status.nodes[0].close.worktreeState, "PRESENT");
    const timedOutWait = blockedCloseA2.journal.findLast(({ type }) => type === "repository-close-wait.started");
    assert.equal(timedOutWait.owner.operationId, trace.find(({ event, label }) => (
      event === "acquire" && label === "closeA1"
    )).operationId);
    assert.match(timeoutDiagnosis.operatorPacket.observedEvidence.join(" "), /coordinator liveness/iu);
    assert.equal(closeA2.snapshot().closeMessages, 0);
    assert.equal(closeA2SleepCalls, 65);
    assert.equal(executionResultA.status.run.maxParallel, 1);
    assert.equal(executionResultB.status.run.maxParallel, 2);
    assert.deepEqual(executionA.created, ["941"]);
    assert.deepEqual(executionB.created, ["951", "952"]);

    releaseHeldLeaves();
    const [closedA1, closedB] = await Promise.all([
      heldClosePromises.closeA1,
      heldClosePromises.closeB,
    ]);
    assert.equal(closedA1.status.run.state, "SUCCEEDED");
    assert.equal(closedB.status.run.state, "SUCCEEDED");

    const resumedCloseA2 = await closeA2.runtime().run({
      specId: runs.closeA2.specId,
      cleanupPreview: true,
    });
    assert.equal(resumedCloseA2.status.run.state, "SUCCEEDED");
    assert.equal(
      resumedCloseA2.status.run.runId,
      blockedCloseA2.status.run.runId,
      "the same command reuses the Run identity after fresh evidence",
    );
    assert.ok(closeA2.snapshot().trackerReadsAtMessage > readsAfterTimeout);
    for (const seam of Object.keys(evidenceReadsAfterTimeout)) {
      assert.ok(
        closeA2.snapshot().evidenceReadsAtMessage[seam] > evidenceReadsAfterTimeout[seam],
        `${seam} evidence must be read again before the resumed close request`,
      );
    }
    assert.equal(closeA2.snapshot().closeMessages, 1);
    assert.deepEqual(new Set(resumedCloseA2.journal
      .filter(({ type }) => type === "grant.recorded")
      .map(({ runIdentity }) => runIdentity.runId)), new Set([runs.closeA2.runId]));
    assert.ok(
      trace.findIndex(({ event, label }) => event === "release" && label === "closeA1")
        < trace.findIndex(({ event, label }) => event === "acquire" && label === "closeA2"),
      "different targets in the same Git common directory acquire in legal order",
    );
    const operationIds = trace
      .filter(({ event }) => event === "acquire")
      .map(({ operationId }) => operationId);
    assert.equal(new Set(operationIds).size, 3, "different repository, Spec, and Issue inputs keep distinct operationId values");
    for (const event of trace.filter(({ event }) => event === "acquire")) {
      assert.match(event.at, /^2026-09-04T/u);
      assert.equal(event.repositoryLeaseOwner.operationId, event.operationId);
      assert.match(event.repositoryLeaseOwner.coordinatorInstanceId, /^real-close-leaf-/u);
      assert.equal(event.targetWriterOperationId, event.operationId);
    }
    assert.deepEqual(stores.closeA1.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    assert.deepEqual(stores.closeA2.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    assert.deepEqual(stores.closeB.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    assert.equal(stores.closeA1.readTargetMutationWriterLock(runs.closeA1.target), null);
    assert.equal(stores.closeA2.readTargetMutationWriterLock(runs.closeA2.target), null);
    assert.equal(stores.closeB.readTargetMutationWriterLock(runs.closeB.target), null);
  } finally {
    closeA1?.release();
    closeA2?.release();
    closeB?.release();
    releaseHeldLeaves?.();
    rmSync(repositoryA.root, { recursive: true, force: true });
    rmSync(repositoryB.root, { recursive: true, force: true });
    rmSync(installedRoot, { recursive: true, force: true });
  }
});

test("end-to-end closeout contention uses repository close wait and refreshes evidence before the real close leaf", async () => {
  const { root, store } = createStoreFixture();
  const competitor = store.acquireRepositoryCloseLease({
    operationId: `workflow-op-v1-${"c".repeat(64)}`,
  });
  const taskRef = { threadId: "thread-17", hostId: "local" };
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "COMPLETE",
    candidateReachable: false,
    worktreeState: "PRESENT",
    closeAccepted: false,
    closeRequestIdentity: null,
  };
  let competitorReleased = false;
  let leafLeases = null;
  let trackerReads = 0;
  let closeMessageTrackerReads = null;
  let second = 0;
  const now = () => `2026-08-30T07:58:${String(second++).padStart(2, "0")}.000Z`;
  const tracker = {
    async read() {
      trackerReads += 1;
      return { issueId: "17", state: model.trackerState };
    },
  };
  const tasks = {
    async findIssueLane() { return [taskRef]; },
    async create() { throw new Error("manual completion must reuse its Issue lane"); },
    async read() {
      return {
        state: "SETTLED",
        closeRequest: model.closeAccepted
          ? {
              state: "ACCEPTED",
              runId: identity.runId,
              issueId: "17",
              requestIdentity: model.closeRequestIdentity,
            }
          : null,
      };
    },
    async message(_taskRef, prompt) {
      closeMessageTrackerReads = trackerReads;
      assert.match(prompt, /\$close-issue.*17/iu);
      model.closeRequestIdentity = closeRequestIdentityFrom(prompt);
      leafLeases = acquireCloseIssueLeases({
        store,
        target: identity.target,
        repositoryId: "github:ron03wlb/skills",
        specId: identity.specId,
        approvedPublicationIdentity: identity.approvedScopeHash,
        issueId: "17",
      });
      assert.equal(leafLeases.assertCurrent(), true);
      model.closeAccepted = true;
    },
    async wait() {
      model.trackerState = "CLOSED";
      model.candidateReachable = true;
      model.worktreeState = "ABSENT";
      assert.equal(leafLeases.assertCurrent(), true);
      leafLeases.release();
      leafLeases = null;
      return {
        coordinatorActive: true,
        taskSettled: true,
        closeRequestIdentity: model.closeRequestIdentity,
      };
    },
  };
  const reconcile = async ({ journal }) => singleRunCurrent({
      journal,
      model,
      run: { repositoryCloseLeaseHealth: "HEALTHY" },
    });

  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker,
      tasks,
      reconcile,
      browser: { async open() {} },
      cleanup: { async listRuns() { return []; } },
      now,
      sleep: async () => {
        if (!competitorReleased) {
          competitor.release();
          competitorReleased = true;
        }
      },
    });
    const result = await runtime.run({ specId: "17", cleanupPreview: true });
    const waitEvents = result.journal.filter(({ type }) => type.startsWith("repository-close-wait."));

    assert.equal(result.status.run.state, "SUCCEEDED");
    assert.deepEqual(waitEvents.map(({ outcome }) => outcome ?? null), [null, "RELEASED"]);
    assert.ok(closeMessageTrackerReads >= 3);
    assert.deepEqual(store.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    assert.deepEqual(store.observeTargetMutationWriter({ target: identity.target }), {
      state: "ABSENT",
      owner: null,
    });
  } finally {
    leafLeases?.release();
    if (!competitorReleased) competitor.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end Single-Issue runtime opens the panel and retains terminal inspection", async () => {
  const { root, store } = createStoreFixture();
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
    closeAccepted: false,
    closeRequestIdentity: null,
  };
  const calls = { created: 0, closeMessages: 0, browser: 0 };
  const taskRef = { threadId: "thread-17", hostId: "local" };
  let openedStatus;
  let openedOrigin;
  let second = 0;
  const now = () => `2026-08-30T08:00:${String(second++).padStart(2, "0")}.000Z`;
  const tracker = {
    async read() {
      return { issueId: "17", state: model.trackerState };
    },
  };
  const tasks = {
    async findIssueLane() { return []; },
    async create() {
      calls.created += 1;
      model.taskState = "DISPATCHED";
      return taskRef;
    },
    async read() {
      return {
        state: "SETTLED",
        closeRequest: model.closeAccepted
          ? {
              state: "ACCEPTED",
              runId: identity.runId,
              issueId: "17",
              requestIdentity: model.closeRequestIdentity,
            }
          : null,
      };
    },
    async message(ref, prompt) {
      assert.deepEqual(ref, taskRef);
      assert.match(prompt, /\$close-issue.*17/u);
      calls.closeMessages += 1;
      model.closeRequestIdentity = closeRequestIdentityFrom(prompt);
      model.closeAccepted = true;
    },
    async wait() {
      if (model.completionState === "NONE") {
        model.taskState = "NONE";
        model.completionState = "COMPLETE";
        model.candidateReachable = true;
        model.worktreeState = "PRESENT";
      } else {
        model.trackerState = "CLOSED";
        model.worktreeState = "ABSENT";
      }
      return {
        coordinatorActive: true,
        taskSettled: true,
        closeRequestIdentity: model.closeAccepted ? model.closeRequestIdentity : undefined,
      };
    },
  };
  const reconcile = async ({ journal }) => singleRunCurrent({ journal, model });
  const browser = {
    async open(panelUrl) {
      calls.browser += 1;
      openedOrigin = new URL(panelUrl).origin;
      const response = await fetch(panelUrl);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, new RegExp(identity.runId, "u"));
      const token = new URL(panelUrl).searchParams.get("token");
      openedStatus = await fetch(`${openedOrigin}/api/status`, {
        headers: { authorization: `Bearer ${token}` },
      }).then((statusResponse) => statusResponse.json());
    },
  };
  const cleanup = { async listRuns() { return []; } };

  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker,
      tasks,
      reconcile,
      browser,
      cleanup,
      now,
      sleep: async () => {},
    });
    const result = await runtime.run({ specId: "17" });

    assert.equal(result.status.run.state, "SUCCEEDED", JSON.stringify(result.status));
    assert.equal(result.status.nodes[0].close.candidateReachable, true);
    assert.equal(result.status.nodes[0].close.worktreeState, "ABSENT");
    assert.equal(result.status.nodes[0].close.trackerState, "CLOSED");
    assert.equal(calls.created, 1);
    assert.equal(calls.closeMessages, 1);
    assert.equal(calls.browser, 1);
    assert.equal(openedStatus.run.state, "RUNNING");
    assert.deepEqual(openedStatus.frontier.ready, ["17"]);
    assert.equal(result.panel.opened, true);
    assert.equal(result.panel.closed, true);
    assert.equal(result.panel.origin, openedOrigin);
    assert.equal(result.journal.filter(({ type }) => type === "dispatch.recorded").length, 1);
    assert.equal(result.cleanupPreview.schema, "dag-run-cleanup-preview:v1");
    assert.deepEqual(result.cleanupPreview.skipped, []);
    assert.deepEqual(result.cleanupResult.removed, []);
    await assert.rejects(fetch(`${openedOrigin}/api/status`));
    assert.equal(store.readStatus(identity.runId).run.state, "SUCCEEDED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end Run-ready handoff stop performs only read-only cleanup preview", async () => {
  const { root, store } = createStoreFixture();
  const runReadyHandoff = readyHandoffFor(identity);
  runReadyHandoff.checkpoint = {
    ...runReadyHandoff.checkpoint,
    state: "INCOMPLETE",
    firstUnsatisfiedStage: "publication.read_back",
    handoffIdentity: null,
  };
  runReadyHandoff.handoff = null;
  runReadyHandoff.trackerRecordIdentities = [];
  let taskCalls = 0;
  let browserCalls = 0;
  let cleanupReads = 0;
  let handoffReads = 0;
  const tasks = Object.fromEntries(["findIssueLane", "create", "read", "message", "wait"].map((name) => [
    name,
    async () => { taskCalls += 1; throw new Error(`unexpected task call ${name}`); },
  ]));
  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker: { async read() { return {}; } },
      tasks,
      handoff: {
        async read({ tracker: trackerSnapshot, current }) {
          handoffReads += 1;
          assert.deepEqual(trackerSnapshot, {});
          return current.runReadyHandoff;
        },
      },
      reconcile: async ({ journal }) => singleRunCurrent({
        journal,
        runReadyHandoff,
        model: {
          trackerState: "OPEN",
          taskState: "NONE",
          completionState: "NONE",
          candidateReachable: false,
          worktreeState: "ABSENT",
        },
      }),
      browser: { async open() { browserCalls += 1; } },
      cleanup: { async listRuns() { cleanupReads += 1; return []; } },
      now: () => "2026-09-02T00:00:00.000Z",
      sleep: async () => {},
    });

    const result = await runtime.run({ specId: "17" });

    assert.equal(result.status.runReadyHandoff.state, "INCOMPLETE");
    assert.equal(result.cleanupResult, null);
    assert.equal(cleanupReads, 1);
    assert.equal(taskCalls, 0);
    assert.equal(browserCalls, 0);
    assert.equal(handoffReads, 1);
    assert.deepEqual(store.readEvents(identity.runId), []);
    assert.equal(store.readWriterLock(identity.runId), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end panel Pause, Resume, Refresh, and Stop share the coordinator writer", async () => {
  const { root, store } = createStoreFixture();
  let panelOpenCount = 0;
  let priorOrigin;
  let resumeFlow;
  let targetState = "CLEAN";
  let second = 0;
  const now = () => `2026-08-30T09:00:${String(second++).padStart(2, "0")}.000Z`;
  const tracker = { async read() { return { issueId: "17", state: "OPEN" }; } };
  const tasks = {
    async findIssueLane() { throw new Error("control settlement must not inspect lanes"); },
    async create() { throw new Error("control settlement must not create lanes"); },
    async read() { throw new Error("control settlement must not read lanes"); },
    async message() { throw new Error("control settlement must not message lanes"); },
    async wait() { throw new Error("control settlement has no active lane"); },
  };
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
  };
  const reconcile = async ({ journal }) => singleRunCurrent({
    journal,
    model,
    targetState,
    contradictions: targetState === "DIRTY" ? [{ code: "scope_conflict", evidence: ["Changed accepted scope"], affectedNodes: ["17"] }] : [],
  });
  const browser = {
    async open(panelUrl) {
      panelOpenCount += 1;
      const url = new URL(panelUrl);
      priorOrigin = url.origin;
      const headers = { authorization: `Bearer ${url.searchParams.get("token")}` };
      let controlRevision = panelOpenCount === 1 ? 1 : 3;
      const submit = async (command) => {
        const response = await fetch(`${url.origin}/api/control/${command.toLowerCase()}`, {
          method: "POST",
          headers: { ...headers, "x-workflow-control-id": `panel-${command.toLowerCase()}-${controlRevision}`,
            "x-workflow-control-revision": String(controlRevision++) },
        });
        assert.equal(response.status, 200);
        return response.json();
      };
      if (panelOpenCount === 1) {
        const paused = await submit("PAUSE");
        assert.equal(paused.status.run.state, "PAUSING");
        resumeFlow = (async () => {
          while (true) {
            const current = await fetch(`${url.origin}/api/status`, { headers }).then((response) => response.json());
            if (current.run.state === "PAUSED") break;
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          targetState = "DIRTY";
          const beforeRefresh = store.readEvents(identity.runId).length;
          const refreshed = await fetch(`${url.origin}/api/status`, { headers });
          assert.equal(refreshed.status, 200);
          assert.equal(store.readEvents(identity.runId).length, beforeRefresh);
          const resumed = await submit("RESUME");
          assert.equal(resumed.status.run.state, "RUNNING");
        })();
        return;
      }
      const stopped = await submit("STOP");
      assert.equal(stopped.status.run.state, "STOPPING");
    },
  };
  const cleanup = { async listRuns() { return []; } };

  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker,
      tasks,
      reconcile,
      browser,
      cleanup,
      now,
      sleep: async () => {},
    });
    const resumed = await runtime.run({ specId: "17" });
    await resumeFlow;
    assert.equal(resumed.status.run.state, "BLOCKED");
    assert.equal(resumed.status.run.controlCommand, "RESUME");
    assert.equal(resumed.panel.closed, true);
    await assert.rejects(fetch(`${priorOrigin}/api/status`));

    targetState = "CLEAN";
    const stopped = await runtime.run({ specId: "17" });
    assert.equal(stopped.status.run.state, "STOPPED");
    assert.equal(stopped.panel.closed, true);
    assert.equal(panelOpenCount, 2);
    assert.deepEqual(stopped.journal
      .filter(({ type }) => type === "control.revised")
      .map(({ revision, command }) => ({ revision, command })), [
      { revision: 1, command: "PAUSE" },
      { revision: 2, command: "RESUME" },
      { revision: 3, command: "STOP" },
    ]);
    assert.equal(stopped.journal.filter(({ type }) => type === "pause.transitioned").length, 1);
    assert.equal(stopped.journal.filter(({ type }) => type === "stop.transitioned").length, 1);
    assert.deepEqual(stopped.cleanupPreview.skipped, []);
    assert.deepEqual(stopped.cleanupResult.removed, []);
    await assert.rejects(fetch(`${priorOrigin}/api/status`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end paused Run accepts Stop from the same panel", async () => {
  const { root, store } = createStoreFixture();
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
  };
  let stopFlow;
  let panelOpens = 0;
  const forbidden = async () => { throw new Error("paused Stop permits no task action"); };
  const tasks = {
    findIssueLane: forbidden,
    create: forbidden,
    read: forbidden,
    message: forbidden,
    wait: forbidden,
  };
  const browser = {
    async open(panelUrl) {
      panelOpens += 1;
      const url = new URL(panelUrl);
      const headers = { authorization: `Bearer ${url.searchParams.get("token")}` };
      const pause = await fetch(`${url.origin}/api/control/pause`, { method: "POST",
        headers: { ...headers, "x-workflow-control-id": "panel-pause-1", "x-workflow-control-revision": "1" } });
      assert.equal(pause.status, 200);
      stopFlow = (async () => {
        while (true) {
          const current = await fetch(`${url.origin}/api/status`, { headers }).then((response) => response.json());
          if (current.run.state === "PAUSED") break;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        const stop = await fetch(`${url.origin}/api/control/stop`, { method: "POST",
          headers: { ...headers, "x-workflow-control-id": "panel-stop-2", "x-workflow-control-revision": "2" } });
        assert.equal(stop.status, 200);
      })();
    },
  };
  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker: { async read() { return { issueId: "17", state: "OPEN" }; } },
      tasks,
      reconcile: async ({ journal }) => singleRunCurrent({ journal, model }),
      browser,
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-08-30T09:30:00.000Z",
      sleep: async () => {},
    });
    const result = await runtime.run({ specId: "17" });
    await stopFlow;

    assert.equal(result.status.run.state, "STOPPED");
    assert.equal(panelOpens, 1);
    assert.deepEqual(result.journal
      .filter(({ type }) => type === "control.revised")
      .map(({ command }) => command), ["PAUSE", "STOP"]);
    assert.equal(result.journal.filter(({ type }) => type === "stop.transitioned").length, 1);
    assert.equal(result.panel.closed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end Multi-Issue runtime releases blockers and closes the parent last", async () => {
  const { root, store } = createStoreFixture();
  const nodes = new Map([
    ["13", {
      issueId: "13", blockers: [], trackerState: "OPEN", taskState: "NONE",
      completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT",
    }],
    ["14", {
      issueId: "14", blockers: [], trackerState: "OPEN", taskState: "NONE",
      completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT",
    }],
    ["17", {
      issueId: "17", blockers: ["13"], trackerState: "OPEN", taskState: "NONE",
      completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT",
    }],
  ]);
  let parentTrackerState = "OPEN";
  let second = 0;
  let largestWaitBatch = 0;
  const now = () => `2026-08-30T10:00:${String(second++).padStart(2, "0")}.000Z`;
  const created = [];
  const closeOrder = [];
  const closeAccepted = new Set();
  const closeRequestIdentities = new Map();
  const closeLeases = new Map();
  const taskRefs = new Map();
  const issueByThread = new Map();
  const tracker = {
    async read() {
      return { parentTrackerState, nodes: [...nodes.values()].map((node) => ({ ...node })) };
    },
  };
  const tasks = {
    async findIssueLane() { return []; },
    async create({ issueId }) {
      if (issueId === "17") {
        const blocker = nodes.get("13");
        assert.equal(blocker.trackerState, "CLOSED");
        assert.equal(blocker.candidateReachable, true);
        assert.equal(blocker.worktreeState, "ABSENT");
      }
      const ref = { threadId: `thread-${issueId}`, hostId: "local" };
      created.push(issueId);
      taskRefs.set(issueId, ref);
      issueByThread.set(ref.threadId, issueId);
      nodes.get(issueId).taskState = "DISPATCHED";
      return ref;
    },
    async read(ref) {
      const issueId = issueByThread.get(ref.threadId);
      return {
        state: "SETTLED",
        closeRequest: closeAccepted.has(issueId)
          ? {
              state: "ACCEPTED",
              runId: multiIdentity.runId,
              issueId,
              requestIdentity: closeRequestIdentities.get(issueId),
            }
          : null,
      };
    },
    async message(ref, prompt) {
      const issueId = issueByThread.get(ref.threadId);
      assert.match(prompt, new RegExp(`\\$close-issue.*${issueId}`, "u"));
      closeRequestIdentities.set(issueId, closeRequestIdentityFrom(prompt));
      const leases = acquireCloseIssueLeases({
        store,
        target: multiIdentity.target,
        repositoryId: "github:ron03wlb/skills",
        specId: multiIdentity.specId,
        approvedPublicationIdentity: multiIdentity.approvedScopeHash,
        issueId,
      });
      assert.equal(leases.assertCurrent(), true);
      closeLeases.set(issueId, leases);
      closeAccepted.add(issueId);
    },
    async wait(refs) {
      largestWaitBatch = Math.max(largestWaitBatch, refs.length);
      const issueIds = refs.map(({ threadId }) => issueByThread.get(threadId));
      const closingIssueIds = issueIds.filter((issueId) => closeAccepted.has(issueId));
      assert.ok(closingIssueIds.length <= 1, "repository close lease permits one active close request");
      for (const issueId of issueIds) {
        const node = nodes.get(issueId);
        if (closeAccepted.has(issueId)) {
          const leases = closeLeases.get(issueId);
          assert.equal(leases.assertCurrent(), true);
          node.trackerState = "CLOSED";
          node.worktreeState = "ABSENT";
          closeOrder.push(issueId);
          leases.release();
          closeLeases.delete(issueId);
        } else {
          node.taskState = "NONE";
          node.completionState = "COMPLETE";
          node.candidateReachable = true;
          node.worktreeState = "PRESENT";
        }
      }
      return {
        coordinatorActive: true,
        taskSettled: true,
        closeRequestIdentity: closingIssueIds.length === 1
          ? closeRequestIdentities.get(closingIssueIds[0])
          : undefined,
      };
    },
  };
  const reconcile = async ({ journal }) => ({
    runIdentity: multiIdentity,
    grant: { runIdentity: multiIdentity, maxParallel: 2 },
    planningSeal: selectedPlanningSeal,
    runReadyHandoff: readyHandoffFor(multiIdentity),
    taskRefs: Object.fromEntries(journal
      .filter(({ type }) => type === "dispatch.recorded")
      .map(({ issueId, taskRef }) => [issueId, taskRef])),
    facts: {
      schema: "dag-run-facts:v1",
      run: {
        ...multiIdentity,
        reconciled: true,
        trackerAvailable: true,
        targetState: "CLEAN",
        targetHead: "a".repeat(40),
        closeWriterRunId: null,
        closeWriterState: "ABSENT",
        parentTrackerState,
        parentTrackerIdentity: "github-issue:12:version:1",
      },
      nodes: [...nodes.values()]
        .map((node) => ({ ...node, blockers: [...node.blockers] }))
        .map(withCloseAuthorityEvidence),
      contradictions: [],
    },
  });
  const leaf = {
    async closeParent({ issueId, requestIdentity, requestEvidence }) {
      assert.equal(issueId, "12");
      assert.equal(requestEvidence.target, multiIdentity.target);
      assert.equal(requestEvidence.targetState, "CLEAN");
      assert.equal(requestEvidence.targetHead, "a".repeat(40));
      assert.equal(requestEvidence.parentTrackerState, "OPEN");
      assert.equal(requestEvidence.parentTrackerIdentity, "github-issue:12:version:1");
      assert.equal([...nodes.values()].every((node) => (
        node.trackerState === "CLOSED" && node.candidateReachable && node.worktreeState === "ABSENT"
      )), true);
      const leases = acquireCloseIssueLeases({
        store,
        target: multiIdentity.target,
        repositoryId: "github:ron03wlb/skills",
        specId: multiIdentity.specId,
        approvedPublicationIdentity: multiIdentity.approvedScopeHash,
        issueId,
      });
      assert.equal(leases.assertCurrent(), true);
      closeOrder.push("parent:12");
      parentTrackerState = "CLOSED";
      leases.release();
      return { settled: true, requestIdentity };
    },
  };
  let initialPanelStatus;
  const browser = {
    async open(panelUrl) {
      const url = new URL(panelUrl);
      initialPanelStatus = await fetch(`${url.origin}/api/status`, {
        headers: { authorization: `Bearer ${url.searchParams.get("token")}` },
      }).then((response) => response.json());
    },
  };
  const cleanup = { async listRuns() { return []; } };

  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker,
      tasks,
      reconcile,
      leaf,
      browser,
      cleanup,
      now,
      sleep: async () => {},
    });
    const result = await runtime.run({ specId: "12" });

    assert.equal(result.status.run.state, "SUCCEEDED", JSON.stringify(result.status));
    assert.equal(result.status.run.maxParallel, 2);
    assert.deepEqual(initialPanelStatus.frontier.ready, ["13", "14"]);
    assert.deepEqual(created, ["13", "14", "17"]);
    assert.equal(largestWaitBatch, 2);
    assert.deepEqual(closeOrder, ["13", "14", "17", "parent:12"]);
    assert.equal(parentTrackerState, "CLOSED");
    assert.deepEqual(result.journal
      .filter(({ type }) => type === "dispatch.recorded")
      .map(({ issueId }) => issueId), ["13", "14", "17"]);
    assert.equal(store.readCloseWriter(multiIdentity.target), null);
    assert.deepEqual(store.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    assert.equal(result.panel.closed, true);
  } finally {
    for (const leases of closeLeases.values()) leases.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end no-argument recovery adopts interrupted manual and partial-close evidence", async () => {
  const { root, store } = createStoreFixture();
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
    closeAccepted: false,
    closeRequestIdentity: null,
  };
  const taskRef = { threadId: "thread-17-recovery", hostId: "local" };
  let created = 0;
  let closeMessages = 0;
  let panelOpens = 0;
  let interrupted = false;
  let second = 0;
  const now = () => `2026-08-30T11:00:${String(second++).padStart(2, "0")}.000Z`;
  const tracker = { async read() { return { issueId: "17", state: model.trackerState }; } };
  const selector = {
    async listNonTerminalRuns() {
      return [{ runIdentity: identity, issueIds: ["17"], maxParallel: 3 }];
    },
  };
  const tasks = {
    async findIssueLane() { return []; },
    async create() {
      created += 1;
      model.taskState = "DISPATCHED";
      return taskRef;
    },
    async read() {
      return {
        state: "SETTLED",
        closeRequest: model.closeAccepted
          ? {
              state: "ACCEPTED",
              runId: identity.runId,
              issueId: "17",
              requestIdentity: model.closeRequestIdentity,
            }
          : null,
      };
    },
    async message(_taskRef, prompt) {
      closeMessages += 1;
      model.closeRequestIdentity = closeRequestIdentityFrom(prompt);
      model.closeAccepted = true;
    },
    async wait() {
      if (model.completionState === "NONE") {
        model.taskState = "NONE";
        model.completionState = "COMPLETE";
        model.candidateReachable = true;
        model.worktreeState = "PRESENT";
        return { coordinatorActive: true, taskSettled: true };
      }
      if (!interrupted) {
        interrupted = true;
        return { coordinatorActive: false, taskSettled: false };
      }
      model.trackerState = "CLOSED";
      model.worktreeState = "ABSENT";
      return {
        coordinatorActive: true,
        taskSettled: true,
        closeRequestIdentity: model.closeRequestIdentity,
      };
    },
  };
  const reconcile = async ({ journal }) => singleRunCurrent({ journal, model });
  const browser = { async open() { panelOpens += 1; } };
  const cleanup = { async listRuns() { return []; } };

  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker,
      tasks,
      selector,
      reconcile,
      browser,
      cleanup,
      now,
      sleep: async () => {},
    });
    const first = await runtime.run({ specId: "17" });
    assert.equal(first.status.run.state, "RUNNING");
    assert.equal(first.panel.closed, true);
    assert.equal(created, 1);

    const resumed = await runtime.run({});
    assert.equal(resumed.status.run.state, "SUCCEEDED", JSON.stringify(resumed.status));
    assert.equal(created, 1);
    assert.equal(closeMessages, 1, "recovery must reuse the accepted evidence-bound request");
    assert.equal(panelOpens, 2);
    assert.equal(resumed.journal.filter(({ type }) => type === "dispatch.recorded").length, 1);
    assert.equal(resumed.journal.filter(({ type }) => type === "grant.recorded").length, 1, "re-entry preserves the original Grant");
    assert.equal(model.trackerState, "CLOSED");
    assert.equal(model.worktreeState, "ABSENT");
    assert.equal(store.readWriterLock(identity.runId), null);
    assert.equal(store.readCloseWriter(identity.target), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end tracker exhaustion returns a stable diagnosis without opening a panel", async () => {
  const { root, store } = createStoreFixture();
  const probes = [];
  let trackerReads = 0;
  const tracker = {
    async read() {
      trackerReads += 1;
      throw new Error("tracker offline");
    },
  };
  const forbidden = async () => { throw new Error("tracker outage permits no task action"); };
  const tasks = {
    findIssueLane: forbidden,
    create: forbidden,
    read: forbidden,
    message: forbidden,
    wait: forbidden,
  };
  const cleanup = {
    async listRuns({ request }) {
      assert.equal(request.specId, "17");
      return [];
    },
  };

  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker,
      tasks,
      reconcile: async () => { throw new Error("tracker outage permits no reconciliation"); },
      browser: { async open() { throw new Error("tracker outage permits no panel"); } },
      cleanup,
      now: () => "2026-08-30T12:00:00.000Z",
      sleep: async (delayMs) => probes.push(delayMs),
    });
    const result = await runtime.run({ specId: "17" });

    assert.equal(trackerReads, 4);
    assert.deepEqual(probes, [5_000, 15_000, 30_000]);
    assert.equal(result.status.run.state, "BLOCKED");
    assert.equal(result.status.diagnoses[0].reasonCode, "tracker_unavailable");
    assert.deepEqual(result.status.diagnoses[0].attemptedRecovery, probes.map((delayMs) => ({ delayMs })));
    assert.deepEqual(result.status.diagnoses[0].resumePredicates, ["tracker_read_succeeds"]);
    assert.deepEqual(result.panel, { opened: false, closed: false, origin: null });
    assert.deepEqual(result.cleanupPreview, {
      schema: "dag-run-cleanup-preview:v1",
      evaluatedAt: "2026-08-30T12:00:00.000Z",
      eligible: [],
      skipped: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end panel open loss returns a stable diagnosis and retained inspection", async () => {
  const { root, store } = createStoreFixture();
  let controlCredential;
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
  };
  const forbidden = async () => { throw new Error("panel loss permits no task action"); };
  const tasks = {
    findIssueLane: forbidden,
    create: forbidden,
    read: forbidden,
    message: forbidden,
    wait: forbidden,
  };
  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker: { async read() { return { issueId: "17", state: "OPEN" }; } },
      tasks,
      reconcile: async ({ journal }) => singleRunCurrent({ journal, model }),
      browser: {
        async open(panelUrl) {
          controlCredential = new URL(panelUrl).searchParams.get("token");
          throw new Error(`panel host unavailable at ${panelUrl}`);
        },
      },
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-08-30T12:30:00.000Z",
      sleep: async () => {},
    });
    const result = await runtime.run({ specId: "17" });
    const diagnosis = result.status.diagnoses.at(-1);

    assert.equal(result.status.run.state, "BLOCKED");
    assert.equal(diagnosis.reasonCode, "panel_unavailable");
    assert.deepEqual(diagnosis.evidence, ["The Run panel failed to open or remain available."]);
    assert.deepEqual(diagnosis.affectedNodes, ["17"]);
    assert.equal(diagnosis.nextOwner, "human");
    assert.deepEqual(diagnosis.resumePredicates, ["panel_can_open"]);
    assert.equal(result.panel.opened, true);
    assert.equal(result.panel.closed, true);
    assert.ok(result.panel.origin.startsWith("http://127.0.0.1:"));
    assert.equal(JSON.stringify(result).includes(controlCredential), false);
    assert.deepEqual(store.readStatus(identity.runId), result.status);
    assert.equal(JSON.stringify(store.readStatus(identity.runId)).includes(controlCredential), false);
    assert.equal(JSON.stringify(store.readEvents(identity.runId)).includes(controlCredential), false);
    assert.equal(store.readWriterLock(identity.runId), null);
    assert.equal(result.journal.filter(({ type }) => type === "dispatch.recorded").length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end explicit invocation applies retention unless cleanup preview is requested", async () => {
  const { root, gitCommonDir, store } = createStoreFixture();
  const evaluatedAt = "2026-08-30T14:00:00.000Z";
  const terminalRuns = Array.from({ length: 11 }, (_, index) => ({
    runId: `terminal-${String(index).padStart(2, "0")}`,
    specId: String(100 + index),
    state: "SUCCEEDED",
    terminalAt: new Date(Date.parse(evaluatedAt) - (40 + index) * 86_400_000).toISOString(),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  const selectedRunContradiction = {
    runId: identity.runId,
    specId: identity.specId,
    state: "SUCCEEDED",
    terminalAt: new Date(Date.parse(evaluatedAt) - 2 * 86_400_000).toISOString(),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  };
  const retentionRuns = [...terminalRuns, selectedRunContradiction];
  const oldestRunDir = join(gitCommonDir, "matt-workflow-control", "runs", "terminal-10");
  for (const { runId } of retentionRuns) store.acquireWriter(runId).release();
  let panels = 0;
  const model = {
    trackerState: "OPEN",
    taskState: "NONE",
    completionState: "NONE",
    candidateReachable: false,
    worktreeState: "ABSENT",
  };
  const forbidden = async () => { throw new Error("retention fixture permits no task action"); };
  const tasks = {
    findIssueLane: forbidden,
    create: forbidden,
    read: forbidden,
    message: forbidden,
    wait: forbidden,
  };
  const browser = {
    async open(panelUrl) {
      panels += 1;
      if (panels > 1) return;
      const url = new URL(panelUrl);
      const response = await fetch(`${url.origin}/api/control/stop`, {
        method: "POST",
        headers: { authorization: `Bearer ${url.searchParams.get("token")}`,
          "x-workflow-control-id": "panel-stop-1", "x-workflow-control-revision": "1" },
      });
      assert.equal(response.status, 200);
    },
  };
  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker: { async read() { return { issueId: "17", state: "OPEN" }; } },
      tasks,
      selector: {
        async listNonTerminalRuns() { return []; },
      },
      reconcile: async ({ journal }) => singleRunCurrent({
        journal,
        model,
        targetState: "CLEAN",
      }),
      browser,
      cleanup: { async listRuns() { return retentionRuns; } },
      now: () => evaluatedAt,
      sleep: async () => {},
    });

    const unselected = await runtime.run({});
    assert.equal(unselected.status.diagnoses[0].reasonCode, "run_selection_required");
    assert.deepEqual(unselected.cleanupPreview.eligible.map(({ runId }) => runId), ["terminal-09", "terminal-10"]);
    assert.equal(unselected.cleanupResult, null);
    assert.equal(existsSync(oldestRunDir), true);

    const previewed = await runtime.run({ specId: "17", cleanupPreview: true });
    assert.deepEqual(previewed.cleanupPreview.eligible.map(({ runId }) => runId), ["terminal-10"]);
    assert.equal(previewed.cleanupResult, null);
    assert.equal(existsSync(oldestRunDir), true);

    const applied = await runtime.run({ specId: "17" });
    assert.deepEqual(applied.cleanupPreview.eligible.map(({ runId }) => runId), ["terminal-10"]);
    assert.deepEqual(applied.cleanupPreview.skipped.find(({ runId }) => runId === identity.runId), {
      runId: identity.runId,
      reason: "selected_run",
    });
    assert.deepEqual(applied.cleanupResult.removed, ["terminal-10"]);
    assert.equal(existsSync(oldestRunDir), false);
    for (const { runId } of terminalRuns.slice(0, 10)) {
      assert.equal(existsSync(join(gitCommonDir, "matt-workflow-control", "runs", runId)), true);
    }
    assert.deepEqual(store.readCleanupRecords().map(({ runId }) => runId), ["terminal-10"]);
    assert.equal(applied.status.run.state, "STOPPED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end target and contract stops remain structured after panel shutdown", async (t) => {
  const scenarios = [
    {
      name: "unknown target ownership",
      targetState: "UNKNOWN",
      contradictions: [],
      reasonCode: "target_state_uncertain",
      resumePredicate: "target_state_is_known",
      expectedPanels: 0,
    },
    {
      name: "merge conflict",
      targetState: "CLEAN",
      contradictions: [{
        code: "merge_conflict",
        reasonCode: "merge_conflict",
        evidence: ["Target integration reported a merge conflict."],
        affectedNodes: ["17"],
      }],
      reasonCode: "merge_conflict",
      resumePredicate: "resolve_contradiction:merge_conflict",
      expectedPanels: 1,
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const { root, store } = createStoreFixture();
      let panels = 0;
      const tasks = Object.fromEntries(
        ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
          throw new Error(`${scenario.name} permits no task ${name}`);
        }]),
      );
      const model = {
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "ABSENT",
      };
      const reconcile = async ({ journal }) => singleRunCurrent({
        journal,
        model,
        targetState: scenario.targetState,
        contradictions: scenario.contradictions,
      });
      try {
        const runtime = createWorkflowRuntime({
          store,
          tracker: { async read() { return { issueId: "17", state: "OPEN" }; } },
          tasks,
          reconcile,
          browser: { async open() { panels += 1; } },
          cleanup: { async listRuns() { return []; } },
          now: () => "2026-08-30T13:00:00.000Z",
          sleep: async () => {},
        });
        const result = await runtime.run({ specId: "17" });
        const diagnosis = result.status.diagnoses.find(({ reasonCode }) => reasonCode === scenario.reasonCode);
        assert.equal(result.status.run.state, "BLOCKED");
        assert.equal(panels, scenario.expectedPanels);
        assert.equal(result.panel.closed, scenario.expectedPanels === 1);
        assert.deepEqual(diagnosis.affectedNodes, ["17"]);
        assert.deepEqual(diagnosis.unaffectedNodes, []);
        assert.equal(diagnosis.nextOwner, "human");
        assert.ok(diagnosis.evidence.length > 0);
        assert.deepEqual(diagnosis.resumePredicates, [scenario.resumePredicate]);
        if (scenario.reasonCode === "merge_conflict") {
          assert.equal(diagnosis.operatorPacket.disposition, "Recoverable blocker");
          assert.match(diagnosis.operatorPacket.owningSource, /target integration result/u);
          assert.equal(diagnosis.operatorPacket.retryCommand, "/run-issue-workflow 17");
          assert.deepEqual(diagnosis.operatorPacket.preservedStages.issues, [{
            issueId: "17",
            state: "READY",
          }]);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
