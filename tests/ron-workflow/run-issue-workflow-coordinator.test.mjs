import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createCoordinator,
  WINDOWS_GRADLE_LOOPBACK_FINGERPRINT,
} from "../../skills/personal/run-issue-workflow/scripts/run-coordinator.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

const createStoreFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "dag-coordinator-"));
  execFileSync("git", ["init", "-b", "target"], { cwd: root, stdio: "ignore" });
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return { root, store: createRunStore({ gitCommonDir: resolve(root, common) }) };
};

const identity = {
  runId: "run-15",
  specId: "15",
  approvedScopeHash: "sha256:issue-15",
  target: "features/ron",
  classification: "SINGLE",
  decompositionIdentity: null,
};

const multiIdentity = {
  ...identity,
  runId: "run-12",
  specId: "12",
  approvedScopeHash: "sha256:spec-12",
  classification: "MULTI",
  decompositionIdentity: "decomposition:12:01-05",
};

const reconciliation = ({
  runIdentity = identity,
  maxParallel = 3,
  taskRefs = {},
  run = {},
  nodes,
  contradictions = [],
}) => ({
  runIdentity,
  grant: { runIdentity, maxParallel },
  taskRefs,
  facts: {
    schema: "dag-run-facts:v1",
    run: {
      ...runIdentity,
      reconciled: true,
      trackerAvailable: true,
      targetState: "CLEAN",
      closeWriterRunId: null,
      closeWriterState: "ABSENT",
      parentTrackerState: "OPEN",
      ...run,
    },
    nodes,
    contradictions,
  },
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
      return { coordinatorActive: true };
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
      return { coordinatorActive: true };
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
      return { coordinatorActive: true };
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

test("the exact Windows Gradle loopback fingerprint gets one process-local remediation", async () => {
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
  const remediationCalls = [];
  const tasks = {
    async findIssueLane() { throw new Error("remediation must not replace the task"); },
    async create() { throw new Error("remediation must not create a task"); },
    async read() { return { state: "RESUMABLE", inactiveEvidence: [] }; },
    async message(actual, message) {
      assert.deepEqual(actual, taskRef);
      assert.match(message, /close-issue/iu);
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
      return { coordinatorActive: true };
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
      taskRef,
      fingerprint: WINDOWS_GRADLE_LOOPBACK_FINGERPRINT,
      cycle: 1,
    }]);
    assert.deepEqual(
      events.filter(({ type }) => type === "remediation.recorded")
        .map(({ issueId, fingerprint, cycle, adapter }) => ({ issueId, fingerprint, cycle, adapter })),
      [{
        issueId: "15",
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
      closeMessages += 1;
      taskState = "EXECUTING";
    },
    async wait() {
      if (!coordinatorActive) return { coordinatorActive: false };
      trackerState.trackerState = "CLOSED";
      taskState = "NONE";
      return { coordinatorActive: true };
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
      return { coordinatorActive: true };
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
    assert.deepEqual(parentCloses, [{ issueId: "12", runIdentity: multiIdentity }]);
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

test("an unknown environment fingerprint stops with diagnosis and no automatic remediation", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let clockMinute = 0;
  const now = () => `2026-08-30T09:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();
  let remediationCalls = 0;
  const tasks = {
    async findIssueLane() { throw new Error("no dispatch is legal"); },
    async create() { throw new Error("no dispatch is legal"); },
    async read() { throw new Error("no retry is legal"); },
    async message() { throw new Error("no retry is legal"); },
    async wait() { throw new Error("no wait is legal"); },
  };
  const tracker = { async read() { return {}; } };
  const reconcile = async () => reconciliation({
    taskRefs: { 15: taskRef },
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "ENVIRONMENT_FAILURE",
      completionState: "NONE",
      candidateReachable: false,
      worktreeState: "PRESENT",
      failure: { fingerprint: "windows:some-other-environment-failure" },
    }],
  });
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

test("re-entry observes an accepted close request instead of sending a duplicate", async () => {
  const { root, store } = createStoreFixture();
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
    async message() {
      messageCalls += 1;
      closeRequest = { runId: identity.runId, issueId: "15", state: "ACCEPTED" };
    },
    async wait() {
      waitCalls += 1;
      if (waitCalls === 1) return { coordinatorActive: false };
      trackerState.trackerState = "CLOSED";
      trackerState.candidateReachable = true;
      trackerState.worktreeState = "ABSENT";
      return { coordinatorActive: true };
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
    const resumed = await coordinator.run({ specId: "15" });

    assert.equal(interrupted.run.state, "RUNNING");
    assert.equal(resumed.run.state, "SUCCEEDED");
    assert.equal(messageCalls, 1);
    assert.equal(waitCalls, 2);
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
