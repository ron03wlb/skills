import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { createWorkflowRuntime } from "../../skills/personal/run-issue-workflow/scripts/run-workflow.mjs";

const createStoreFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "dag-runtime-"));
  execFileSync("git", ["init", "-b", "features/ron"], { cwd: root, stdio: "ignore" });
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const gitCommonDir = resolve(root, common);
  return { root, gitCommonDir, store: createRunStore({ gitCommonDir, coordinatorInstanceId: "runtime-e2e" }) };
};

const identity = {
  runId: "run-17-single",
  specId: "17",
  approvedScopeHash: "sha256:issue-17",
  target: "features/ron",
  classification: "SINGLE",
  decompositionIdentity: null,
};

const multiIdentity = {
  runId: "run-12-multi",
  specId: "12",
  approvedScopeHash: "sha256:spec-12",
  target: "features/ron",
  classification: "MULTI",
  decompositionIdentity: "decomposition:12:05",
};

const singleRunCurrent = ({
  journal = [],
  model,
  targetState = "CLEAN",
  contradictions = [],
}) => ({
  runIdentity: identity,
  grant: { runIdentity: identity, maxParallel: 3 },
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
      closeWriterRunId: null,
      closeWriterState: "ABSENT",
      parentTrackerState: "OPEN",
    },
    nodes: [{ issueId: "17", blockers: [], ...model }],
    contradictions,
  },
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
          ? { state: "ACCEPTED", runId: identity.runId, issueId: "17" }
          : null,
      };
    },
    async message(ref, prompt) {
      assert.deepEqual(ref, taskRef);
      assert.match(prompt, /\$close-issue.*17/u);
      calls.closeMessages += 1;
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
      return { coordinatorActive: true, taskSettled: true };
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
      assert.match(html, /run-17-single/u);
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
  });
  const browser = {
    async open(panelUrl) {
      panelOpenCount += 1;
      const url = new URL(panelUrl);
      priorOrigin = url.origin;
      const headers = { authorization: `Bearer ${url.searchParams.get("token")}` };
      const submit = async (command) => {
        const response = await fetch(`${url.origin}/api/control/${command.toLowerCase()}`, {
          method: "POST",
          headers,
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
          ? { state: "ACCEPTED", runId: multiIdentity.runId, issueId }
          : null,
      };
    },
    async message(ref, prompt) {
      const issueId = issueByThread.get(ref.threadId);
      assert.match(prompt, new RegExp(`\\$close-issue.*${issueId}`, "u"));
      assert.equal(store.readCloseWriter(multiIdentity.target), multiIdentity.runId);
      closeAccepted.add(issueId);
    },
    async wait(refs) {
      largestWaitBatch = Math.max(largestWaitBatch, refs.length);
      const issueIds = refs.map(({ threadId }) => issueByThread.get(threadId));
      for (const issueId of issueIds) {
        const node = nodes.get(issueId);
        if (closeAccepted.has(issueId)) {
          node.trackerState = "CLOSED";
          node.worktreeState = "ABSENT";
          closeOrder.push(issueId);
        } else {
          node.taskState = "NONE";
          node.completionState = "COMPLETE";
          node.candidateReachable = true;
          node.worktreeState = "PRESENT";
        }
      }
      return { coordinatorActive: true, taskSettled: true };
    },
  };
  const reconcile = async ({ journal }) => ({
    runIdentity: multiIdentity,
    grant: { runIdentity: multiIdentity, maxParallel: 2 },
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
        closeWriterRunId: null,
        closeWriterState: "ABSENT",
        parentTrackerState,
      },
      nodes: [...nodes.values()].map((node) => ({ ...node, blockers: [...node.blockers] })),
      contradictions: [],
    },
  });
  const leaf = {
    async closeParent({ issueId }) {
      assert.equal(issueId, "12");
      assert.equal(store.readCloseWriter(multiIdentity.target), multiIdentity.runId);
      assert.equal([...nodes.values()].every((node) => (
        node.trackerState === "CLOSED" && node.candidateReachable && node.worktreeState === "ABSENT"
      )), true);
      closeOrder.push("parent:12");
      parentTrackerState = "CLOSED";
      return { settled: true };
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
    assert.equal(result.panel.closed, true);
  } finally {
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
          ? { state: "ACCEPTED", runId: identity.runId, issueId: "17" }
          : null,
      };
    },
    async message() {
      closeMessages += 1;
      throw new Error("accepted partial close must not be sent again");
    },
    async wait() {
      if (!interrupted) {
        interrupted = true;
        return { coordinatorActive: false, taskSettled: false };
      }
      model.trackerState = "CLOSED";
      model.worktreeState = "ABSENT";
      return { coordinatorActive: true, taskSettled: true };
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

    model.taskState = "NONE";
    model.completionState = "COMPLETE";
    model.candidateReachable = true;
    model.worktreeState = "PRESENT";
    model.closeAccepted = true;

    const resumed = await runtime.run({});
    assert.equal(resumed.status.run.state, "SUCCEEDED", JSON.stringify(resumed.status));
    assert.equal(created, 1);
    assert.equal(closeMessages, 0);
    assert.equal(panelOpens, 2);
    assert.equal(resumed.journal.filter(({ type }) => type === "dispatch.recorded").length, 1);
    assert.equal(resumed.journal.filter(({ type }) => type === "grant.recorded").length, 2);
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
      browser: { async open() { throw new Error("panel host unavailable"); } },
      cleanup: { async listRuns() { return []; } },
      now: () => "2026-08-30T12:30:00.000Z",
      sleep: async () => {},
    });
    const result = await runtime.run({ specId: "17" });
    const diagnosis = result.status.diagnoses.at(-1);

    assert.equal(result.status.run.state, "BLOCKED");
    assert.equal(diagnosis.reasonCode, "panel_unavailable");
    assert.match(diagnosis.evidence.join(" "), /panel host unavailable/u);
    assert.deepEqual(diagnosis.affectedNodes, ["17"]);
    assert.equal(diagnosis.nextOwner, "human");
    assert.deepEqual(diagnosis.resumePredicates, ["panel_can_open"]);
    assert.equal(result.panel.opened, true);
    assert.equal(result.panel.closed, true);
    assert.ok(result.panel.origin.startsWith("http://127.0.0.1:"));
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
  const oldestRunDir = join(gitCommonDir, "matt-workflow-control", "runs", "terminal-10");
  for (const { runId } of terminalRuns) store.acquireWriter(runId).release();
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
        headers: { authorization: `Bearer ${url.searchParams.get("token")}` },
      });
      assert.equal(response.status, 200);
    },
  };
  try {
    const runtime = createWorkflowRuntime({
      store,
      tracker: { async read() { return { issueId: "17", state: "OPEN" }; } },
      tasks,
      reconcile: async ({ journal }) => singleRunCurrent({
        journal,
        model,
        targetState: "DIRTY",
      }),
      browser,
      cleanup: { async listRuns() { return terminalRuns; } },
      now: () => evaluatedAt,
      sleep: async () => {},
    });

    const previewed = await runtime.run({ specId: "17", cleanupPreview: true });
    assert.deepEqual(previewed.cleanupPreview.eligible.map(({ runId }) => runId), ["terminal-10"]);
    assert.equal(previewed.cleanupResult, null);
    assert.equal(existsSync(oldestRunDir), true);

    const applied = await runtime.run({ specId: "17" });
    assert.deepEqual(applied.cleanupPreview.eligible.map(({ runId }) => runId), ["terminal-10"]);
    assert.deepEqual(applied.cleanupResult.removed, ["terminal-10"]);
    assert.equal(existsSync(oldestRunDir), false);
    assert.deepEqual(store.readCleanupRecords().map(({ runId }) => runId), ["terminal-10"]);
    assert.equal(applied.status.run.state, "STOPPED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("end-to-end target and contract stops remain structured after panel shutdown", async (t) => {
  const scenarios = [
    {
      name: "dirty target",
      targetState: "DIRTY",
      contradictions: [],
      reasonCode: "target_dirty",
      resumePredicate: "target_is_clean",
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
        assert.equal(panels, 1);
        assert.equal(result.panel.closed, true);
        assert.deepEqual(diagnosis.affectedNodes, ["17"]);
        assert.deepEqual(diagnosis.unaffectedNodes, []);
        assert.equal(diagnosis.nextOwner, "human");
        assert.ok(diagnosis.evidence.length > 0);
        assert.deepEqual(diagnosis.resumePredicates, [scenario.resumePredicate]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
