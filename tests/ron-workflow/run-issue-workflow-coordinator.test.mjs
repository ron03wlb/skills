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
      return { coordinatorActive: true, taskSettled: true };
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
      return { coordinatorActive: true, taskSettled: true };
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
      return { coordinatorActive: true, taskSettled: true };
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
      return { coordinatorActive: true, taskSettled: true };
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
      return { coordinatorActive: true, taskSettled: true };
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
      return { coordinatorActive: true, taskSettled: true };
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
      return { settled: true };
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
  const { root, gitCommonDir, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  const trackerState = {
    trackerState: "OPEN",
    completionState: "COMPLETE",
    candidateReachable: false,
    worktreeState: "PRESENT",
  };
  let closeRequest = null;
  let closeWriterReclaimProof = null;
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
      return { coordinatorActive: true, taskSettled: true };
    },
  };
  const tracker = { async read() { return { ...trackerState }; } };
  const reconcile = async ({ tracker: currentTracker }) => ({
    ...reconciliation({
      taskRefs: { 15: taskRef },
      run: { parentTrackerState: currentTracker.trackerState },
      nodes: [{ issueId: "15", blockers: [], ...currentTracker, taskState: "NONE" }],
    }),
    closeWriterReclaimProof,
  });

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const interrupted = await coordinator.run({ specId: "15" });
    const closeOwner = store.readCloseWriterLock(identity.target);
    assert.equal(closeOwner.runId, identity.runId);
    closeWriterReclaimProof = {
      previousCoordinatorInstanceId: closeOwner.coordinatorInstanceId,
      previousGeneration: closeOwner.generation,
      coordinatorState: "INACTIVE",
      reconciled: true,
      evidence: ["The prior coordinator stopped after the accepted close request."],
      abandonedOperationIds: [],
    };
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
    assert.equal(recoveredStore.readCloseWriterLock(identity.target), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a competing target close writer returns a structured stop before lane messaging", async () => {
  const { root, store } = createStoreFixture();
  const taskRef = { threadId: "thread-15", hostId: "local" };
  let clockMinute = 0;
  const now = () => `2026-08-30T13:${String(clockMinute++).padStart(2, "0")}:30.000Z`;
  const seed = store.acquireWriter(identity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: identity, maxParallel: 3 });
  seed.append({ type: "dispatch.recorded", at: now(), issueId: "15", attempt: 1, taskRef });
  seed.release();
  const competing = store.acquireCloseWriter({ target: identity.target, runId: "run-competing" });
  let taskCalls = 0;
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      taskCalls += 1;
      throw new Error(`${name} is forbidden while another Run owns the target close writer`);
    }]),
  );
  const tracker = { async read() { return {}; } };
  const reconcile = async () => reconciliation({
    taskRefs: { 15: taskRef },
    nodes: [{
      issueId: "15",
      blockers: [],
      trackerState: "OPEN",
      taskState: "NONE",
      completionState: "COMPLETE",
      candidateReachable: true,
      worktreeState: "PRESENT",
    }],
  });

  try {
    const coordinator = createCoordinator({ store, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "close_writer_conflict");
    assert.match(status.diagnoses.at(-1).evidence.join(" "), /run-competing/u);
    assert.deepEqual(status.diagnoses.at(-1).affectedNodes, ["15"]);
    assert.equal(taskCalls, 0);
    assert.equal(store.readCloseWriterLock(identity.target).runId, "run-competing");
  } finally {
    competing.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a lost close-writer reclaim race returns the same structured stop", async () => {
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
    reclaimCloseWriter() { throw new Error("TARGET_CLOSE_WRITER_STALE_PROOF_MISMATCH"); },
    readCloseWriterLock() {
      return { runId: "run-race-winner", coordinatorInstanceId: "winner", generation: "new-generation" };
    },
  };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is forbidden after the reclaim race is lost`);
    }]),
  );
  const tracker = { async read() { return {}; } };
  const reconcile = async () => ({
    ...reconciliation({
      taskRefs: { 15: taskRef },
      nodes: [{
        issueId: "15",
        blockers: [],
        trackerState: "OPEN",
        taskState: "NONE",
        completionState: "COMPLETE",
        candidateReachable: true,
        worktreeState: "PRESENT",
      }],
    }),
    closeWriterReclaimProof: {
      previousCoordinatorInstanceId: "loser",
      previousGeneration: "old-generation",
      coordinatorState: "INACTIVE",
      reconciled: true,
      evidence: ["The previous close writer appeared stale before the race."],
      abandonedOperationIds: [],
    },
  });

  try {
    const coordinator = createCoordinator({ store: racingStore, tracker, tasks, reconcile, now, sleep: async () => {} });
    const status = await coordinator.run({ specId: "15" });

    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses.at(-1).reasonCode, "close_writer_conflict");
    assert.match(status.diagnoses.at(-1).evidence.join(" "), /run-race-winner/u);
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

test("re-entry observes an accepted retry request before journaling the next attempt", async () => {
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
    await assert.rejects(coordinator.run({ specId: "15" }), /coordinator lost/u);
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
      messages += 1;
    },
    async wait() {
      trackerState.trackerState = "CLOSED";
      trackerState.worktreeState = "ABSENT";
      return { coordinatorActive: true, taskSettled: true };
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

test("parent close re-entry reclaims the same target writer from exact stale proof", async () => {
  const { root, gitCommonDir, store } = createStoreFixture();
  let clockMinute = 0;
  const now = () => `2026-08-30T23:${String(clockMinute++).padStart(2, "0")}:00.000Z`;
  const seed = store.acquireWriter(multiIdentity.runId);
  seed.append({ type: "grant.recorded", at: now(), runIdentity: multiIdentity, maxParallel: 3 });
  seed.release();
  const abandoned = store.acquireCloseWriter({ target: multiIdentity.target, runId: multiIdentity.runId });
  const owner = store.readCloseWriterLock(multiIdentity.target);
  const closeWriterReclaimProof = {
    previousCoordinatorInstanceId: owner.coordinatorInstanceId,
    previousGeneration: owner.generation,
    coordinatorState: "INACTIVE",
    reconciled: true,
    evidence: ["The prior parent-close coordinator is inactive."],
    abandonedOperationIds: [],
  };
  const recoveredStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "parent-close-recovered" });
  let parentTrackerState = "OPEN";
  const tracker = { async read() { return { parentTrackerState }; } };
  const tasks = Object.fromEntries(
    ["findIssueLane", "create", "read", "message", "wait"].map((name) => [name, async () => {
      throw new Error(`${name} is unnecessary after every child succeeded`);
    }]),
  );
  const leaf = {
    async closeParent({ issueId }) {
      assert.equal(issueId, "12");
      parentTrackerState = "CLOSED";
      return { settled: true };
    },
  };
  const reconcile = async ({ tracker: currentTracker }) => ({
    ...reconciliation({
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
    }),
    closeWriterReclaimProof,
  });

  try {
    const coordinator = createCoordinator({
      store: recoveredStore,
      tracker,
      tasks,
      reconcile,
      leaf,
      now,
      sleep: async () => {},
    });
    const status = await coordinator.run({ specId: "12" });

    assert.equal(status.run.state, "SUCCEEDED");
    assert.throws(() => abandoned.release());
    assert.equal(recoveredStore.readCloseWriterLock(multiIdentity.target), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
