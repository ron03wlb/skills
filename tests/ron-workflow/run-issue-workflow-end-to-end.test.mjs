import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
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
  return { root, store: createRunStore({ gitCommonDir, coordinatorInstanceId: "runtime-e2e" }) };
};

const identity = {
  runId: "run-17-single",
  specId: "17",
  approvedScopeHash: "sha256:issue-17",
  target: "features/ron",
  classification: "SINGLE",
  decompositionIdentity: null,
};

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
  const reconcile = async ({ journal }) => ({
    runIdentity: identity,
    grant: { runIdentity: identity, maxParallel: 3 },
    taskRefs: Object.fromEntries(journal
      .filter(({ type }) => type === "dispatch.recorded")
      .map(({ issueId, taskRef: ref }) => [issueId, ref])),
    facts: {
      schema: "dag-run-facts:v1",
      run: {
        ...identity,
        reconciled: true,
        trackerAvailable: true,
        targetState: "CLEAN",
        closeWriterRunId: null,
        closeWriterState: "ABSENT",
        parentTrackerState: "OPEN",
      },
      nodes: [{ issueId: "17", blockers: [], ...model }],
      contradictions: [],
    },
  });
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
  const cleanup = {
    async listRuns({ status }) {
      return [{
        runId: status.run.runId,
        specId: status.run.specId,
        state: status.run.state,
        terminalAt: "2026-08-30T08:01:00.000Z",
        engineLock: "RELEASED",
        activeTasks: "ABSENT",
      }];
    },
  };

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
    assert.deepEqual(result.cleanupPreview.skipped, [{ runId: identity.runId, reason: "within_30_days" }]);
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
  const reconcile = async () => ({
    runIdentity: identity,
    grant: { runIdentity: identity, maxParallel: 3 },
    taskRefs: {},
    facts: {
      schema: "dag-run-facts:v1",
      run: {
        ...identity,
        reconciled: true,
        trackerAvailable: true,
        targetState: "CLEAN",
        closeWriterRunId: null,
        closeWriterState: "ABSENT",
        parentTrackerState: "OPEN",
      },
      nodes: [{
        issueId: "17",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "ABSENT",
      }],
      contradictions: [],
    },
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
        return;
      }
      const resumed = await submit("RESUME");
      assert.equal(resumed.status.run.state, "RUNNING");
      const beforeRefresh = store.readEvents(identity.runId).length;
      const refreshed = await fetch(`${url.origin}/api/status`, { headers });
      assert.equal(refreshed.status, 200);
      assert.equal(store.readEvents(identity.runId).length, beforeRefresh);
      const stopped = await submit("STOP");
      assert.equal(stopped.status.run.state, "STOPPING");
    },
  };
  const cleanup = {
    async listRuns({ status }) {
      return [{
        runId: identity.runId,
        specId: identity.specId,
        state: status.run.state,
        terminalAt: status.run.state === "STOPPED" ? "2026-08-30T09:01:00.000Z" : null,
        engineLock: "RELEASED",
        activeTasks: "ABSENT",
      }];
    },
  };

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
    const paused = await runtime.run({ specId: "17" });
    assert.equal(paused.status.run.state, "PAUSED");
    assert.equal(paused.panel.closed, true);
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
    assert.deepEqual(stopped.cleanupPreview.skipped, [{
      runId: identity.runId,
      reason: "within_30_days",
    }]);
    await assert.rejects(fetch(`${priorOrigin}/api/status`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
