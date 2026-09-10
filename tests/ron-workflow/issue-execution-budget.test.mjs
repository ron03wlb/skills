import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_SCHEMA,
  ISSUE_EXECUTION_LIMIT_MS,
  summarizeIssueExecutionBudget,
  validateJournal,
} from "../../skills/personal/run-issue-workflow/scripts/run-journal.mjs";
import { reduceRun } from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";
import { createIssueExecutionBudgetController } from "../../skills/personal/run-issue-workflow/scripts/issue-execution-budget.mjs";

const issueId = "I_execution";
const taskRef = { threadId: "thread-1", hostId: "local" };
const runIdentity = {
  runId: "workflow-op-v1-" + "1".repeat(64),
  specId: "I_spec",
  approvedScopeHash: "sha256:" + "2".repeat(64),
  target: "features/ron",
  classification: "SINGLE",
  decompositionIdentity: null,
};

const journal = (drafts) => drafts.map((draft, index) => ({
  ...draft,
  schema: EVENT_SCHEMA,
  sequence: index + 1,
}));

test("one Issue execution budget accumulates implementation and conflict repair without resetting", () => {
  const events = journal([
    { type: "grant.recorded", at: "2026-09-10T00:00:00.000Z", runIdentity, maxParallel: 3 },
    { type: "dispatch.recorded", at: "2026-09-10T00:00:00.000Z", issueId, attempt: 1, taskRef },
    { type: "execution.started", at: "2026-09-10T00:00:00.000Z", issueId, phase: "IMPLEMENTATION", phaseIdentity: "dispatch:2", taskRef },
    { type: "execution.observed", at: "2026-09-10T05:00:00.000Z", issueId, startSequence: 3, elapsedMs: 5 * 60 * 60 * 1000, state: "SETTLED", source: "NATIVE" },
    { type: "repair.recorded", at: "2026-09-10T05:00:01.000Z", issueId, wave: 1, candidate: "3".repeat(40), targetHead: "4".repeat(40), taskRef, requestIdentity: "sha256:" + "5".repeat(64) },
    { type: "execution.started", at: "2026-09-10T05:00:01.000Z", issueId, phase: "CONFLICT_REPAIR", phaseIdentity: "sha256:" + "5".repeat(64), taskRef },
    { type: "execution.observed", at: "2026-09-10T05:59:59.999Z", issueId, startSequence: 6, elapsedMs: 3_599_999, state: "ACTIVE", source: "MONOTONIC" },
  ]);

  validateJournal(events, { storageRunId: runIdentity.runId });
  assert.deepEqual(summarizeIssueExecutionBudget(events, issueId), {
    limitMs: ISSUE_EXECUTION_LIMIT_MS,
    consumedMs: ISSUE_EXECUTION_LIMIT_MS - 1,
    state: "ACTIVE",
    activeStartSequence: 6,
  });

  const exhausted = journal([
    ...events.map(({ schema: _schema, sequence: _sequence, ...event }) => event),
    { type: "execution.observed", at: "2026-09-10T06:00:00.000Z", issueId, startSequence: 6, elapsedMs: 3_600_000, state: "ACTIVE", source: "MONOTONIC" },
    { type: "execution.exhausted", at: "2026-09-10T06:00:00.000Z", issueId, consumedMs: ISSUE_EXECUTION_LIMIT_MS },
  ]);

  validateJournal(exhausted, { storageRunId: runIdentity.runId });
  assert.deepEqual(summarizeIssueExecutionBudget(exhausted, issueId), {
    limitMs: ISSUE_EXECUTION_LIMIT_MS,
    consumedMs: ISSUE_EXECUTION_LIMIT_MS,
    state: "EXHAUSTED",
    activeStartSequence: 6,
  });
});

test("execution evidence cannot reset, double-settle, or replace uncertain elapsed time", () => {
  const base = [
    { type: "grant.recorded", at: "2026-09-10T00:00:00.000Z", runIdentity, maxParallel: 3 },
    { type: "dispatch.recorded", at: "2026-09-10T00:00:00.000Z", issueId, attempt: 1, taskRef },
    { type: "execution.started", at: "2026-09-10T00:00:00.000Z", issueId, phase: "IMPLEMENTATION", phaseIdentity: "dispatch:2", taskRef },
    { type: "execution.observed", at: "2026-09-10T01:00:00.000Z", issueId, startSequence: 3, elapsedMs: 3_600_000, state: "ACTIVE", source: "MONOTONIC" },
  ];
  const reset = journal([...base,
    { type: "execution.observed", at: "2026-09-10T01:00:01.000Z", issueId, startSequence: 3, elapsedMs: 1, state: "ACTIVE", source: "MONOTONIC" },
  ]);
  assert.throws(() => validateJournal(reset, { storageRunId: runIdentity.runId }), /cannot decrease/u);

  const settled = journal([...base,
    { type: "execution.observed", at: "2026-09-10T01:00:01.000Z", issueId, startSequence: 3, elapsedMs: 3_600_000, state: "SETTLED", source: "NATIVE" },
    { type: "execution.observed", at: "2026-09-10T01:00:02.000Z", issueId, startSequence: 3, elapsedMs: 3_600_001, state: "SETTLED", source: "NATIVE" },
  ]);
  assert.throws(() => validateJournal(settled, { storageRunId: runIdentity.runId }), /already settled/u);

  const uncertain = journal([...base,
    { type: "execution.uncertain", at: "2026-09-10T01:00:01.000Z", issueId, startSequence: 3,
      reason: "MONOTONIC_OR_NATIVE_ELAPSED_UNAVAILABLE" },
  ]);
  validateJournal(uncertain, { storageRunId: runIdentity.runId });
  assert.deepEqual(summarizeIssueExecutionBudget(uncertain, issueId), {
    limitMs: ISSUE_EXECUTION_LIMIT_MS,
    consumedMs: 3_600_000,
    state: "UNKNOWN",
    activeStartSequence: 3,
  });

  const reconciled = journal([...uncertain.map(({ schema: _schema, sequence: _sequence, ...event }) => event),
    { type: "execution.observed", at: "2026-09-10T01:00:02.000Z", issueId, startSequence: 3,
      elapsedMs: 3_600_001, state: "SETTLED", source: "NATIVE" },
  ]);
  validateJournal(reconciled, { storageRunId: runIdentity.runId });
  assert.equal(summarizeIssueExecutionBudget(reconciled, issueId).state, "AVAILABLE");

  const foreignPhase = journal([
    base[0],
    base[1],
    { ...base[2], phaseIdentity: "dispatch:999" },
  ]);
  assert.throws(() => validateJournal(foreignPhase, { storageRunId: runIdentity.runId }), /exact owned action/u);
});

test("exhaustion blocks only its Issue and preserves independent scheduling", () => {
  const multiRun = { ...runIdentity, classification: "MULTI", decompositionIdentity: "decomposition" };
  const secondIssue = "I_independent";
  const events = journal([
    { type: "grant.recorded", at: "2026-09-10T00:00:00.000Z", runIdentity: multiRun, maxParallel: 3 },
    { type: "dispatch.recorded", at: "2026-09-10T00:00:00.000Z", issueId, attempt: 1, taskRef },
    { type: "execution.started", at: "2026-09-10T00:00:00.000Z", issueId, phase: "IMPLEMENTATION", phaseIdentity: "dispatch:2", taskRef },
    { type: "execution.observed", at: "2026-09-10T06:00:00.000Z", issueId, startSequence: 3, elapsedMs: ISSUE_EXECUTION_LIMIT_MS, state: "ACTIVE", source: "MONOTONIC" },
    { type: "execution.exhausted", at: "2026-09-10T06:00:00.000Z", issueId, consumedMs: ISSUE_EXECUTION_LIMIT_MS },
  ]);
  const status = reduceRun({
    schema: "dag-run-facts:v1",
    run: { ...multiRun, reconciled: true, trackerAvailable: true, targetState: "CLEAN", targetHead: "a".repeat(40),
      repositoryCloseLeaseOperationId: null, repositoryCloseLeaseState: "ABSENT", closeWriterRunId: null,
      closeWriterState: "ABSENT", parentTrackerState: "OPEN", parentTrackerIdentity: multiRun.specId },
    nodes: [
      { issueId, blockers: [], trackerState: "OPEN", taskState: "EXECUTING", completionState: "NONE", candidateReachable: false, worktreeState: "PRESENT" },
      { issueId: secondIssue, blockers: [], trackerState: "OPEN", taskState: "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" },
    ],
    contradictions: [],
    journal: events,
  });

  assert.equal(status.nodes.find(node => node.issueId === issueId).state, "BLOCKED");
  assert.deepEqual(status.nodes.find(node => node.issueId === issueId).task.executionBudget, {
    limitMs: ISSUE_EXECUTION_LIMIT_MS,
    consumedMs: ISSUE_EXECUTION_LIMIT_MS,
    state: "EXHAUSTED",
  });
  assert.deepEqual(status.legalActions, [{ type: "dispatch_issue", issueId: secondIssue, attempt: 1 }]);
  assert.equal(status.diagnoses.some(item => item.reasonCode === "execution_timeout"
    && item.affectedNodes.includes(issueId)), true);
});

test("exhaustion forbids every new Issue execution, repair, retry, and close action", () => {
  const singleIdentity = { ...runIdentity, specId: issueId };
  const closeAuthorityEvidence = { trackerIdentity: `github-issue:${issueId}:version:1`, targetHead: "a".repeat(40),
    candidateCommit: "b".repeat(40), completionEvidenceId: "github-comment:completion", completionBodySha256: "sha256:" + "d".repeat(64),
    worktreeIdentity: `registered-worktree:${issueId}` };
  const events = journal([
    { type: "grant.recorded", at: "2026-09-10T00:00:00.000Z", runIdentity: singleIdentity, maxParallel: 3 },
    { type: "dispatch.recorded", at: "2026-09-10T00:00:00.000Z", issueId, attempt: 1, taskRef },
    { type: "execution.started", at: "2026-09-10T00:00:00.000Z", issueId, phase: "IMPLEMENTATION", phaseIdentity: "dispatch:2", taskRef },
    { type: "execution.observed", at: "2026-09-10T06:00:00.000Z", issueId, startSequence: 3,
      elapsedMs: ISSUE_EXECUTION_LIMIT_MS, state: "SETTLED", source: "NATIVE" },
    { type: "execution.exhausted", at: "2026-09-10T06:00:00.000Z", issueId, consumedMs: ISSUE_EXECUTION_LIMIT_MS },
  ]);
  const variants = [
    { taskState: "TRANSIENT_FAILURE", completionState: "NONE" },
    { taskState: "NONE", completionState: "COMPLETE", closeAuthorityEvidence, closeConflict: {
      candidate: "3".repeat(40), targetHead: "4".repeat(40), repairWaves: 0,
    } },
    { taskState: "NONE", completionState: "COMPLETE", closeAuthorityEvidence },
  ];

  for (const variant of variants) {
    const status = reduceRun({ schema: "dag-run-facts:v1", run: { ...singleIdentity, reconciled: true,
      trackerAvailable: true, targetState: "CLEAN", targetHead: "a".repeat(40), repositoryCloseLeaseOperationId: null,
      repositoryCloseLeaseState: "ABSENT", closeWriterRunId: null, closeWriterState: "ABSENT", parentTrackerState: "OPEN",
      parentTrackerIdentity: null },
    nodes: [{ issueId, blockers: [], trackerState: "OPEN", candidateReachable: false, worktreeState: "PRESENT", ...variant }],
    contradictions: [], journal: events });
    assert.deepEqual(status.legalActions, []);
    assert.equal(status.diagnoses.some(item => item.reasonCode === "execution_timeout"), true,
      JSON.stringify({ variant, diagnoses: status.diagnoses }));
  }
});

test("the runtime controller uses monotonic time and records the exact six-hour crossing", async () => {
  const events = journal([
    { type: "grant.recorded", at: "2026-09-10T00:00:00.000Z", runIdentity, maxParallel: 3 },
    { type: "dispatch.recorded", at: "2026-09-10T00:00:00.000Z", issueId, attempt: 1, taskRef },
  ]);
  let monotonic = 10_000;
  const append = draft => {
    const event = { ...draft, schema: EVENT_SCHEMA, sequence: events.length + 1 };
    validateJournal([...events, event], { storageRunId: runIdentity.runId });
    events.push(event);
    return event;
  };
  const controller = createIssueExecutionBudgetController({
    store: { readEvents: () => events },
    tasks: { async read() { return { state: "RUNNING", snapshot: { turns: [{ status: "inProgress" }] } }; } },
    now: () => "2026-09-10T00:00:00.000Z",
    monotonicNow: () => monotonic,
  });
  controller.start({ writer: { append }, runId: runIdentity.runId, issueId, phase: "IMPLEMENTATION",
    phaseIdentity: "dispatch:2", taskRef, monotonicStartedAt: monotonic });

  monotonic += ISSUE_EXECUTION_LIMIT_MS - 1;
  await controller.sync({ writer: { append }, runId: runIdentity.runId, issueIds: [issueId] });
  assert.equal(summarizeIssueExecutionBudget(events, issueId).state, "ACTIVE");
  assert.equal(controller.remainingMs({ runId: runIdentity.runId, issueIds: [issueId] }), 1);

  monotonic += 1;
  await controller.sync({ writer: { append }, runId: runIdentity.runId, issueIds: [issueId] });
  assert.equal(events.filter(event => event.type === "execution.exhausted").length, 1);
  assert.equal(summarizeIssueExecutionBudget(events, issueId).consumedMs, ISSUE_EXECUTION_LIMIT_MS);
});

test("runtime re-entry preserves proved elapsed as UNKNOWN until exact native settlement", async () => {
  const events = journal([
    { type: "grant.recorded", at: "2026-09-10T00:00:00.000Z", runIdentity, maxParallel: 3 },
    { type: "dispatch.recorded", at: "2026-09-10T00:00:00.000Z", issueId, attempt: 1, taskRef },
    { type: "execution.started", at: "2026-09-10T00:00:00.000Z", issueId, phase: "IMPLEMENTATION", phaseIdentity: "dispatch:2", taskRef },
    { type: "execution.observed", at: "2026-09-10T01:00:00.000Z", issueId, startSequence: 3,
      elapsedMs: 3_600_000, state: "ACTIVE", source: "MONOTONIC" },
  ]);
  let task = { state: "RUNNING", snapshot: { turns: [{ status: "inProgress" }] } };
  const append = draft => {
    const event = { ...draft, schema: EVENT_SCHEMA, sequence: events.length + 1 };
    validateJournal([...events, event], { storageRunId: runIdentity.runId });
    events.push(event);
    return event;
  };
  const controller = createIssueExecutionBudgetController({
    store: { readEvents: () => events }, tasks: { async read() { return task; } },
    now: () => "2026-09-10T02:00:00.000Z", monotonicNow: () => 1,
  });

  await controller.sync({ writer: { append }, runId: runIdentity.runId, issueIds: [issueId] });
  assert.equal(summarizeIssueExecutionBudget(events, issueId).state, "UNKNOWN");
  assert.equal(summarizeIssueExecutionBudget(events, issueId).consumedMs, 3_600_000);

  task = { state: "RESUMABLE", snapshot: { turns: [{ status: "completed", durationMs: 3_700_000 }] } };
  await controller.sync({ writer: { append }, runId: runIdentity.runId, issueIds: [issueId] });
  assert.deepEqual(summarizeIssueExecutionBudget(events, issueId), {
    limitMs: ISSUE_EXECUTION_LIMIT_MS,
    consumedMs: 3_700_000,
    state: "AVAILABLE",
    activeStartSequence: null,
  });
});

test("runtime re-entry continues from native active duration without resetting the interval", async () => {
  const events = journal([
    { type: "grant.recorded", at: "2026-09-10T00:00:00.000Z", runIdentity, maxParallel: 3 },
    { type: "dispatch.recorded", at: "2026-09-10T00:00:00.000Z", issueId, attempt: 1, taskRef },
    { type: "execution.started", at: "2026-09-10T00:00:00.000Z", issueId, phase: "IMPLEMENTATION", phaseIdentity: "dispatch:2", taskRef },
    { type: "execution.observed", at: "2026-09-10T01:00:00.000Z", issueId, startSequence: 3,
      elapsedMs: 3_600_000, state: "ACTIVE", source: "MONOTONIC" },
  ]);
  const append = draft => {
    const event = { ...draft, schema: EVENT_SCHEMA, sequence: events.length + 1 };
    validateJournal([...events, event], { storageRunId: runIdentity.runId });
    events.push(event);
    return event;
  };
  const controller = createIssueExecutionBudgetController({
    store: { readEvents: () => events },
    tasks: { async read() {
      return { state: "RUNNING", snapshot: { turns: [{ status: "inProgress", durationMs: 3_700_000 }] } };
    } },
    now: () => "2026-09-10T02:00:00.000Z",
    monotonicNow: () => 1,
  });

  await controller.sync({ writer: { append }, runId: runIdentity.runId, issueIds: [issueId] });

  assert.deepEqual(summarizeIssueExecutionBudget(events, issueId), {
    limitMs: ISSUE_EXECUTION_LIMIT_MS,
    consumedMs: 3_700_000,
    state: "ACTIVE",
    activeStartSequence: 3,
  });
  assert.equal(events.at(-1).source, "NATIVE");
});
