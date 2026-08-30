import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  CONTROL_COMMANDS,
  NODE_STATES,
  planControl,
  REASON_CODES,
  reduceRun,
  RUN_STATES,
} from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

const node = (issueId, blockers = []) => ({
  issueId,
  blockers,
  trackerState: "OPEN",
  taskState: "NONE",
  completionState: "NONE",
  candidateReachable: false,
  worktreeState: "ABSENT",
});

const grant = {
  schema: "dag-run-event:v1",
  sequence: 1,
  type: "grant.recorded",
  at: "2026-08-30T00:00:00.000Z",
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

const grantFor = (classification = "SINGLE") => ({
  ...grant,
  runIdentity: {
    ...grant.runIdentity,
    classification,
    decompositionIdentity: classification === "MULTI" ? grant.runIdentity.decompositionIdentity : null,
  },
});

const dispatchEvent = (issueId, attempt = 1, sequence = 2) => ({
  schema: "dag-run-event:v1",
  sequence,
  type: "dispatch.recorded",
  at: `2026-08-30T00:0${sequence}:00.000Z`,
  issueId,
  attempt,
  taskRef: { threadId: `thread-${issueId}`, hostId: "local" },
});

const retryEvent = (issueId, attempt, sequence) => ({
  schema: "dag-run-event:v1",
  sequence,
  type: "retry.recorded",
  at: `2026-08-30T00:0${sequence}:00.000Z`,
  issueId,
  attempt,
  reason: "transient_terminal_failure",
  priorTaskRef: { threadId: `thread-${issueId}`, hostId: "local" },
  replacement: null,
});

const facts = (nodes) => ({
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
    closeWriterRunId: null,
    closeWriterState: "ABSENT",
    parentTrackerState: "OPEN",
  },
  nodes,
  contradictions: [],
  journal: [grant],
});

const createGitCommonDirFixture = (prefix) => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-b", "target"], { cwd: root, stdio: "ignore" });
  const relativeCommonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return { root, gitCommonDir: resolve(root, relativeCommonDir) };
};

test("the versioned runtime interface publishes the accepted state machines", () => {
  assert.deepEqual(RUN_STATES, [
    "RECONCILING", "RUNNING", "PAUSING", "PAUSED", "BLOCKED", "STOPPING", "STOPPED", "SUCCEEDED",
  ]);
  assert.deepEqual(NODE_STATES, [
    "PENDING", "READY", "DISPATCHED", "EXECUTING", "RETRYING",
    "IMPLEMENTATION_COMPLETE", "CLOSING", "SUCCEEDED", "BLOCKED", "FAILED",
  ]);
  assert.deepEqual(CONTROL_COMMANDS, ["PAUSE", "RESUME", "STOP"]);
  assert.equal(new Set(Object.values(REASON_CODES)).size, Object.values(REASON_CODES).length);
});

test("the same normalized evidence yields the same ready frontier", () => {
  const forward = reduceRun(facts([node("13"), node("14"), node("15", ["13", "14"])]));
  const reversed = reduceRun(facts([node("15", ["14", "13"]), node("14"), node("13")]));

  assert.deepEqual(reversed, forward);
  assert.equal(forward.run.state, "RUNNING");
  assert.equal(forward.run.maxParallel, 3);
  assert.deepEqual(
    forward.nodes.map(({ issueId, state }) => [issueId, state]),
    [["13", "READY"], ["14", "READY"], ["15", "PENDING"]],
  );
  assert.deepEqual(forward.frontier.ready, ["13", "14"]);
  assert.deepEqual(forward.legalActions, [
    { type: "dispatch_issue", issueId: "13", attempt: 1 },
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
  ]);

  const defaulted = reduceRun({
    ...facts([node("13"), node("14"), node("15"), node("16")]),
    journal: [{ ...grant, maxParallel: undefined }],
  });
  assert.equal(defaulted.run.maxParallel, 3);
  assert.equal(defaulted.legalActions.length, 3);
});

test("node lifecycle follows task, completion, Git, worktree, and tracker evidence", () => {
  const singleFacts = (nodeFacts, journal = [grantFor()]) => ({
    schema: "dag-run-facts:v1",
    run: {
      runId: "run-12",
      specId: "12",
      approvedScopeHash: "sha256:scope-12",
      target: "features/ron",
      classification: "SINGLE",
      decompositionIdentity: null,
      reconciled: true,
      trackerAvailable: true,
      targetState: "CLEAN",
      closeWriterRunId: null,
      closeWriterState: "ABSENT",
      parentTrackerState: "NOT_APPLICABLE",
    },
    nodes: [{ ...node("12"), ...nodeFacts }],
    contradictions: [],
    journal,
  });

  const dispatch = {
    schema: "dag-run-event:v1",
    sequence: 2,
    type: "dispatch.recorded",
    at: "2026-08-30T00:01:00.000Z",
    issueId: "12",
    attempt: 1,
    taskRef: { threadId: "thread-12", hostId: "local" },
  };
  const cases = [
    [{}, "READY"],
    [{ taskState: "DISPATCHED" }, "DISPATCHED"],
    [{ taskState: "EXECUTING" }, "EXECUTING"],
    [{ completionState: "COMPLETE", worktreeState: "PRESENT" }, "IMPLEMENTATION_COMPLETE"],
    [{ completionState: "COMPLETE", candidateReachable: true, worktreeState: "PRESENT" }, "CLOSING"],
    [{ completionState: "COMPLETE", candidateReachable: true, trackerState: "CLOSED" }, "SUCCEEDED"],
  ];

  for (const [nodeFacts, expectedState] of cases) {
    const journal = ["DISPATCHED", "EXECUTING"].includes(expectedState)
      ? [grantFor(), dispatch]
      : [grantFor()];
    const status = reduceRun(singleFacts(nodeFacts, journal));
    assert.equal(status.nodes[0].state, expectedState);
  }

  const complete = reduceRun(singleFacts({ completionState: "COMPLETE", worktreeState: "PRESENT" }));
  assert.deepEqual(complete.legalActions, [{ type: "close_issue", issueId: "12" }]);

  const succeeded = reduceRun(singleFacts({
    completionState: "COMPLETE",
    candidateReachable: true,
    trackerState: "CLOSED",
  }));
  assert.equal(succeeded.run.state, "SUCCEEDED");
  assert.deepEqual(succeeded.legalActions, []);
});

test("a failed branch blocks only its descendants while independent work remains legal", () => {
  const failed = {
    ...node("13"),
    taskState: "FAILED",
    failure: { kind: "SEMANTIC", evidence: ["implementation_blocked read back"] },
  };
  const succeeded = {
    ...node("14"),
    completionState: "COMPLETE",
    candidateReachable: true,
    trackerState: "CLOSED",
  };
  const status = reduceRun({
    ...facts([failed, succeeded, node("15", ["13"]), node("16", ["14"])]),
    journal: [grant, dispatchEvent("13")],
  });

  assert.equal(status.run.state, "RUNNING");
  assert.deepEqual(
    status.nodes.map(({ issueId, state }) => [issueId, state]),
    [["13", "FAILED"], ["14", "SUCCEEDED"], ["15", "BLOCKED"], ["16", "READY"]],
  );
  assert.deepEqual(status.legalActions, [{ type: "dispatch_issue", issueId: "16", attempt: 1 }]);
  assert.equal(status.diagnoses.find(({ reasonCode }) => reasonCode === "failed_dependency")?.affectedNodes[0], "15");
});

test("explicit contradictions fail closed with a structured stop diagnosis", () => {
  const status = reduceRun({
    ...facts([node("13"), node("14")]),
    contradictions: [{
      code: "candidate_and_tracker_disagree",
      evidence: ["Issue #13 is closed but its candidate is not reachable"],
      affectedNodes: ["13"],
    }],
  });

  assert.equal(status.run.state, "BLOCKED");
  assert.deepEqual(status.legalActions, []);
  assert.deepEqual(status.diagnoses[0], {
    reasonCode: "evidence_contradiction",
    limitationClass: "unresolved-evidence",
    evidence: ["Issue #13 is closed but its candidate is not reachable"],
    attemptedRecovery: [],
    retryCount: 0,
    noAutomaticTransition: "Contradictory authoritative evidence has no safe precedence.",
    affectedNodes: ["13"],
    unaffectedNodes: ["14"],
    nextOwner: "human",
    resumePredicates: ["resolve_contradiction:candidate_and_tracker_disagree"],
  });
});

test("missing authority and malformed DAG facts fail closed", () => {
  const cases = [
    [{ ...facts([node("13")]), schema: "dag-run-facts:v2" }, "invalid_fact_schema"],
    [{ ...facts([node("13")]), journal: [] }, "grant_missing"],
    [facts([]), "empty_dag"],
    [{ ...facts([node("13")]), journal: [{ ...grant, maxParallel: 0 }] }, "grant_invalid"],
    [{ ...facts([node("13")]), nodes: [null] }, "invalid_fact_schema"],
    [{ ...facts([node("13")]), contradictions: [{}] }, "invalid_fact_schema"],
    [{
      ...facts([{ ...node("13"), taskState: "ENVIRONMENT_FAILURE", failure: { fingerprint: Symbol("bad") } }]),
      journal: [grant, dispatchEvent("13")],
    }, "invalid_fact_schema"],
    [{
      ...facts([node("13")]),
      journal: [grant, { ...dispatchEvent("13"), attempt: "bad" }],
    }, "invalid_fact_schema"],
    [{
      ...facts([node("13")]),
      journal: [grant, {
        schema: "dag-run-event:v1",
        sequence: 2,
        type: "control.revised",
        at: "2026-08-30T00:01:00.000Z",
        revision: 1,
        command: "START",
      }],
    }, "invalid_fact_schema"],
    [{
      ...facts([{ ...node("13"), taskState: "ENVIRONMENT_FAILURE" }]),
      journal: [grant, dispatchEvent("13")],
    }, "insufficient_evidence"],
    [facts([node("13", ["missing"])]), "unknown_blocker"],
    [facts([node("13", ["14"]), node("14", ["13"])]), "dependency_cycle"],
    [{ ...facts([node("13"), node("13")]) }, "duplicate_node"],
    [{ ...facts([node("13")]), journal: [grant, dispatchEvent("999")] }, "journal_scope_conflict"],
  ];

  for (const [input, reasonCode] of cases) {
    const first = reduceRun(input);
    const second = reduceRun(input);
    assert.deepEqual(second, first);
    assert.equal(first.run.state, "BLOCKED");
    assert.deepEqual(first.legalActions, []);
    assert.equal(first.diagnoses[0].reasonCode, reasonCode);
  }

  const changedScope = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, approvedScopeHash: "sha256:changed-scope" },
  });
  assert.equal(changedScope.diagnoses[0].reasonCode, "grant_identity_conflict");

  const changedDecomposition = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, decompositionIdentity: "decomposition:changed" },
  });
  assert.equal(changedDecomposition.diagnoses[0].reasonCode, "grant_identity_conflict");

  const unsafeIdentity = facts([node("13")]);
  unsafeIdentity.run.runId = 1n;
  const sanitized = reduceRun(unsafeIdentity);
  assert.equal(sanitized.run.state, "BLOCKED");
  assert.doesNotThrow(() => JSON.stringify(sanitized));

  const invalidSingle = reduceRun({
    ...facts([node("12"), node("13")]),
    run: {
      ...facts([]).run,
      classification: "SINGLE",
      decompositionIdentity: null,
    },
    journal: [grantFor()],
  });
  assert.equal(invalidSingle.diagnoses[0].reasonCode, "invalid_fact_schema");

  const missingReconciliation = facts([node("13")]);
  delete missingReconciliation.run.reconciled;
  assert.equal(reduceRun(missingReconciliation).diagnoses[0].reasonCode, "invalid_fact_schema");
});

test("impossible owning-source combinations are reducer contradictions", () => {
  const closedWithoutCompletion = reduceRun(facts([{
    ...node("13"),
    trackerState: "CLOSED",
  }]));
  assert.equal(closedWithoutCompletion.run.state, "BLOCKED");
  assert.equal(closedWithoutCompletion.diagnoses[0].reasonCode, "evidence_contradiction");

  const missingCandidate = reduceRun(facts([{
    ...node("13"),
    completionState: "COMPLETE",
    worktreeState: "ABSENT",
  }]));
  assert.equal(missingCandidate.run.state, "BLOCKED");
  assert.equal(missingCandidate.diagnoses[0].reasonCode, "insufficient_evidence");

  const uncertain = reduceRun(facts([{ ...node("13"), worktreeState: "UNKNOWN" }]));
  assert.equal(uncertain.run.state, "BLOCKED");
  assert.equal(uncertain.diagnoses[0].reasonCode, "insufficient_evidence");

  const closedBeforeCleanup = reduceRun(facts([{
    ...node("13"),
    completionState: "COMPLETE",
    candidateReachable: true,
    worktreeState: "PRESENT",
    trackerState: "CLOSED",
  }]));
  assert.equal(closedBeforeCleanup.run.state, "BLOCKED");
  assert.equal(closedBeforeCleanup.diagnoses[0].reasonCode, "evidence_contradiction");

  const dispatchedWithoutReference = reduceRun(facts([{ ...node("13"), taskState: "DISPATCHED" }]));
  assert.equal(dispatchedWithoutReference.run.state, "BLOCKED");
  assert.equal(dispatchedWithoutReference.diagnoses[0].reasonCode, "insufficient_evidence");

  const dispatchWithoutTaskEvidence = reduceRun({
    ...facts([node("13")]),
    journal: [grant, dispatchEvent("13")],
  });
  assert.equal(dispatchWithoutTaskEvidence.run.state, "BLOCKED");
  assert.equal(dispatchWithoutTaskEvidence.diagnoses[0].reasonCode, "insufficient_evidence");
  assert.deepEqual(dispatchWithoutTaskEvidence.legalActions, []);

  const parentClosedEarly = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, parentTrackerState: "CLOSED" },
  });
  assert.equal(parentClosedEarly.run.state, "BLOCKED");
  assert.equal(parentClosedEarly.diagnoses[0].reasonCode, "evidence_contradiction");
});

test("dispatch, retry, remediation, and close writers stay within their budgets", () => {
  const twoActive = reduceRun({
    ...facts([
      { ...node("13"), taskState: "EXECUTING" },
      { ...node("14"), taskState: "DISPATCHED" },
      node("15"),
      node("16"),
    ]),
    journal: [grant, dispatchEvent("13", 1, 2), dispatchEvent("14", 1, 3)],
  });
  assert.deepEqual(twoActive.frontier.active, ["13", "14"]);
  assert.deepEqual(twoActive.legalActions, [{ type: "dispatch_issue", issueId: "15", attempt: 1 }]);

  const closeDoesNotConsumeExecution = reduceRun(facts([
    { ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" },
    node("14"),
  ]));
  assert.deepEqual(closeDoesNotConsumeExecution.legalActions, [
    { type: "close_issue", issueId: "13" },
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
  ]);

  const partialCloseDoesNotConsumeExecution = reduceRun(facts([
    { ...node("13"), completionState: "COMPLETE", candidateReachable: true, worktreeState: "PRESENT" },
    node("14"),
  ]));
  assert.deepEqual(partialCloseDoesNotConsumeExecution.legalActions, [
    { type: "close_issue", issueId: "13" },
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
  ]);

  const retrying = reduceRun({
    ...facts([{ ...node("13"), taskState: "TRANSIENT_FAILURE" }]),
    journal: [grant, dispatchEvent("13", 1, 2)],
  });
  assert.equal(retrying.nodes[0].state, "RETRYING");
  assert.deepEqual(retrying.legalActions, [{ type: "dispatch_issue", issueId: "13", attempt: 2 }]);

  const prematureCompletion = reduceRun({
    ...facts([{
      ...node("13"),
      taskState: "EXECUTING",
      completionState: "COMPLETE",
      worktreeState: "PRESENT",
    }]),
    journal: [grant, dispatchEvent("13")],
  });
  assert.equal(prematureCompletion.run.state, "BLOCKED");
  assert.deepEqual(prematureCompletion.frontier.active, ["13"]);
  assert.deepEqual(prematureCompletion.frontier.closeable, []);
  assert.equal(prematureCompletion.diagnoses[0].reasonCode, "evidence_contradiction");

  const exhausted = reduceRun({
    ...facts([{ ...node("13"), taskState: "TRANSIENT_FAILURE" }]),
    journal: [
      grant,
      dispatchEvent("13", 1, 2),
      retryEvent("13", 1, 3),
      dispatchEvent("13", 2, 4),
      retryEvent("13", 2, 5),
      dispatchEvent("13", 3, 6),
    ],
  });
  assert.equal(exhausted.nodes[0].state, "FAILED");
  assert.equal(exhausted.run.state, "BLOCKED");
  assert.equal(exhausted.diagnoses[0].reasonCode, "dispatch_attempts_exhausted");
  assert.equal(exhausted.diagnoses[0].retryCount, 3);

  const environmentFailure = { ...node("13"), taskState: "ENVIRONMENT_FAILURE", failure: { fingerprint: "selector-loopback" } };
  const remediable = reduceRun({ ...facts([environmentFailure]), journal: [grant, dispatchEvent("13")] });
  assert.equal(remediable.nodes[0].state, "RETRYING");
  assert.deepEqual(remediable.legalActions, [{
    type: "remediate_environment",
    issueId: "13",
    fingerprint: "selector-loopback",
    cycle: 1,
  }]);
  const remediationConsumesExecutionCapacity = reduceRun({
    ...facts([environmentFailure, node("14"), node("15"), node("16")]),
    journal: [grant, dispatchEvent("13")],
  });
  assert.deepEqual(remediationConsumesExecutionCapacity.legalActions, [
    { type: "remediate_environment", issueId: "13", fingerprint: "selector-loopback", cycle: 1 },
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
    { type: "dispatch_issue", issueId: "15", attempt: 1 },
  ]);

  const unresolved = reduceRun({
    ...facts([environmentFailure]),
    journal: [grant, dispatchEvent("13"), {
      schema: "dag-run-event:v1",
      sequence: 3,
      type: "remediation.recorded",
      at: "2026-08-30T00:01:00.000Z",
      issueId: "13",
      fingerprint: "selector-loopback",
      cycle: 1,
      adapter: "gradle-loopback-safe",
    }],
  });
  assert.equal(unresolved.nodes[0].state, "FAILED");
  assert.equal(unresolved.diagnoses[0].reasonCode, "environment_unresolved");

  const partialCloseouts = reduceRun(facts([
    { ...node("13"), completionState: "COMPLETE", candidateReachable: true, worktreeState: "PRESENT" },
    { ...node("14"), completionState: "COMPLETE", candidateReachable: true, worktreeState: "PRESENT" },
  ]));
  assert.equal(partialCloseouts.run.state, "RUNNING");
  assert.deepEqual(partialCloseouts.legalActions, [{ type: "close_issue", issueId: "13" }]);

  const resumedCloseout = reduceRun(facts([{
    ...node("13"),
    completionState: "COMPLETE",
    candidateReachable: true,
    worktreeState: "ABSENT",
  }]));
  assert.equal(resumedCloseout.nodes[0].state, "CLOSING");
  assert.deepEqual(resumedCloseout.legalActions, [{ type: "close_issue", issueId: "13" }]);

  const targetCloseConflict = reduceRun({
    ...facts([{ ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" }]),
    run: { ...facts([]).run, closeWriterRunId: "another-run", closeWriterState: "ACTIVE" },
  });
  assert.equal(targetCloseConflict.run.state, "BLOCKED");
  assert.equal(targetCloseConflict.diagnoses[0].reasonCode, "close_writer_conflict");
  assert.deepEqual(targetCloseConflict.legalActions, []);

  const uncertainOwnClose = reduceRun({
    ...facts([{ ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" }]),
    run: { ...facts([]).run, closeWriterRunId: "run-12", closeWriterState: "UNKNOWN" },
  });
  assert.equal(uncertainOwnClose.run.state, "BLOCKED");
  assert.equal(uncertainOwnClose.diagnoses[0].reasonCode, "close_writer_conflict");

  const serializedCloseWithIndependentExecution = reduceRun({
    ...facts([
      { ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" },
      node("14"),
    ]),
    run: { ...facts([]).run, closeWriterRunId: "another-run", closeWriterState: "ACTIVE" },
  });
  assert.equal(serializedCloseWithIndependentExecution.run.state, "RUNNING");
  assert.deepEqual(serializedCloseWithIndependentExecution.legalActions, [
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
  ]);

  const unrelatedExecution = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, closeWriterRunId: "another-run", closeWriterState: "ACTIVE" },
  });
  assert.equal(unrelatedExecution.run.state, "RUNNING");
  assert.deepEqual(unrelatedExecution.legalActions, [{ type: "dispatch_issue", issueId: "13", attempt: 1 }]);
});

test("Pause, Resume, and Stop are revisioned and idempotent with no Start control", () => {
  const running = reduceRun(facts([node("13")]));
  const pause = planControl(running, "PAUSE", "2026-08-30T00:01:00.000Z");
  assert.equal(pause.changed, true);
  assert.deepEqual(pause.event, {
    type: "control.revised",
    at: "2026-08-30T00:01:00.000Z",
    revision: 1,
    command: "PAUSE",
  });

  const pausing = reduceRun({ ...facts([node("13")]), journal: [grant, { ...pause.event, schema: "dag-run-event:v1", sequence: 2 }] });
  assert.equal(pausing.run.state, "PAUSING");
  assert.deepEqual(pausing.legalActions, [{ type: "settle_pause", revision: 1 }]);

  const paused = reduceRun({
    ...facts([node("13")]),
    journal: [
      grant,
      { ...pause.event, schema: "dag-run-event:v1", sequence: 2 },
      {
        schema: "dag-run-event:v1",
        sequence: 3,
        type: "pause.transitioned",
        at: "2026-08-30T00:02:00.000Z",
        revision: 1,
      },
    ],
  });
  assert.equal(paused.run.state, "PAUSED");
  assert.equal(planControl(paused, "PAUSE", "2026-08-30T00:03:00.000Z").changed, false);
  assert.equal(planControl(paused, "RESUME", "2026-08-30T00:03:00.000Z").event.revision, 2);
  assert.equal(planControl(paused, "START", "2026-08-30T00:03:00.000Z").accepted, false);

  const prematurePause = reduceRun({
    ...facts([{ ...node("13"), taskState: "EXECUTING" }]),
    journal: [
      grant,
      dispatchEvent("13", 1, 2),
      { ...pause.event, schema: "dag-run-event:v1", sequence: 3 },
      {
        schema: "dag-run-event:v1",
        sequence: 4,
        type: "pause.transitioned",
        at: "2026-08-30T00:02:00.000Z",
        revision: 1,
      },
    ],
  });
  assert.equal(prematurePause.run.state, "PAUSING");
  assert.deepEqual(prematurePause.frontier.active, ["13"]);

  const stop = planControl(paused, "STOP", "2026-08-30T00:04:00.000Z");
  assert.equal(stop.event.revision, 2);
  const stopping = reduceRun({
    ...facts([node("13")]),
    journal: [...pausedJournal(pause), { ...stop.event, schema: "dag-run-event:v1", sequence: 4 }],
  });
  assert.equal(stopping.run.state, "STOPPING");
  assert.deepEqual(stopping.legalActions, [{ type: "settle_stop", revision: 2 }]);

  const stopped = reduceRun({
    ...facts([node("13")]),
    journal: [
      ...pausedJournal(pause),
      { ...stop.event, schema: "dag-run-event:v1", sequence: 4 },
      {
        schema: "dag-run-event:v1",
        sequence: 5,
        type: "stop.transitioned",
        at: "2026-08-30T00:05:00.000Z",
        revision: 2,
      },
    ],
  });
  assert.equal(stopped.run.state, "STOPPED");
  assert.deepEqual(stopped.legalControls, ["REFRESH"]);

  const prematureStop = reduceRun({
    ...facts([{ ...node("13"), taskState: "EXECUTING" }]),
    journal: [
      grant,
      dispatchEvent("13", 1, 2),
      {
        schema: "dag-run-event:v1",
        sequence: 3,
        type: "control.revised",
        at: "2026-08-30T00:03:00.000Z",
        revision: 1,
        command: "STOP",
      },
      {
        schema: "dag-run-event:v1",
        sequence: 4,
        type: "stop.transitioned",
        at: "2026-08-30T00:04:00.000Z",
        revision: 1,
      },
    ],
  });
  assert.equal(prematureStop.run.state, "STOPPING");
  assert.deepEqual(prematureStop.frontier.active, ["13"]);

  const resumedButStillBlocked = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, targetState: "DIRTY" },
    journal: [grant, {
      schema: "dag-run-event:v1",
      sequence: 2,
      type: "control.revised",
      at: "2026-08-30T00:06:00.000Z",
      revision: 1,
      command: "RESUME",
    }],
  });
  const repeatedResume = planControl(resumedButStillBlocked, "RESUME", "2026-08-30T00:07:00.000Z");
  assert.equal(repeatedResume.changed, false);
  assert.equal(repeatedResume.revision, 1);
});

test("reconciliation, tracker, target, and parent gates fail closed at their owning seam", () => {
  const reconciling = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, reconciled: false },
  });
  assert.equal(reconciling.run.state, "RECONCILING");
  assert.deepEqual(reconciling.legalActions, [{ type: "reconcile_run" }]);

  const gates = [
    [{ trackerAvailable: false }, "tracker_unavailable"],
    [{ targetState: "DIRTY" }, "target_dirty"],
    [{ targetState: "UNKNOWN" }, "target_state_uncertain"],
  ];
  for (const [runFacts, reasonCode] of gates) {
    const status = reduceRun({ ...facts([node("13")]), run: { ...facts([]).run, ...runFacts } });
    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses[0].reasonCode, reasonCode);
    assert.deepEqual(status.legalActions, []);
  }

  const completedChild = {
    ...node("13"),
    completionState: "COMPLETE",
    candidateReachable: true,
    trackerState: "CLOSED",
  };
  const parentUnknown = reduceRun({
    ...facts([completedChild]),
    run: { ...facts([]).run, parentTrackerState: "UNKNOWN" },
  });
  assert.equal(parentUnknown.run.state, "BLOCKED");
  assert.equal(parentUnknown.diagnoses[0].reasonCode, "parent_state_uncertain");

  const parentOpen = reduceRun(facts([completedChild]));
  assert.deepEqual(parentOpen.legalActions, [{ type: "close_parent", issueId: "12" }]);
});

function pausedJournal(pause) {
  return [
    grant,
    { ...pause.event, schema: "dag-run-event:v1", sequence: 2 },
    {
      schema: "dag-run-event:v1",
      sequence: 3,
      type: "pause.transitioned",
      at: "2026-08-30T00:02:00.000Z",
      revision: 1,
    },
  ];
}

test("the single writer appends ordered control events and atomically rebuilds disposable status", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-store-");
  const store = createRunStore({ gitCommonDir });
  try {
    const badOrderWriter = store.acquireWriter("bad-order");
    assert.throws(() => badOrderWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:00:00.000Z",
      issueId: "13",
      attempt: 1,
      taskRef: { threadId: "thread-13", hostId: "local" },
    }), /first Run event/u);
    badOrderWriter.release();

    const mismatchedWriter = store.acquireWriter("mismatched-run");
    assert.throws(() => mismatchedWriter.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: grant.runIdentity,
    }), /storage Run/u);
    mismatchedWriter.release();

    const retryWriter = store.acquireWriter("retry-run");
    retryWriter.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: { ...grant.runIdentity, runId: "retry-run" },
    });
    retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:01:00.000Z",
      issueId: "13",
      attempt: 1,
      taskRef: { threadId: "thread-13", hostId: "local" },
    });
    assert.throws(() => retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      attempt: 2,
      taskRef: { threadId: "replacement-13", hostId: "local" },
    }), /matching retry fact/u);
    retryWriter.append({
      type: "retry.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      attempt: 1,
      reason: "transient_terminal_failure",
      priorTaskRef: { threadId: "thread-13", hostId: "local" },
      replacement: null,
    });
    retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:03:00.000Z",
      issueId: "13",
      attempt: 2,
      taskRef: { threadId: "thread-13", hostId: "local" },
    });
    retryWriter.append({
      type: "retry.recorded",
      at: "2026-08-30T00:04:00.000Z",
      issueId: "13",
      attempt: 2,
      reason: "proven_inactive_task",
      priorTaskRef: { threadId: "thread-13", hostId: "local" },
      replacement: {
        supersedesAttempt: 2,
        nextTaskRef: { threadId: "replacement-13", hostId: "local" },
        inactiveEvidence: ["Codex task read-back reports the prior task cannot continue."],
      },
    });
    assert.throws(() => retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:05:00.000Z",
      issueId: "13",
      attempt: 3,
      taskRef: { threadId: "thread-13", hostId: "local" },
    }), /not authorized/u);
    retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:05:00.000Z",
      issueId: "13",
      attempt: 3,
      taskRef: { threadId: "replacement-13", hostId: "local" },
    });
    assert.throws(() => retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:06:00.000Z",
      issueId: "14",
      attempt: 1,
      taskRef: { threadId: "replacement-13", hostId: "local" },
    }), /cannot serve both Issue/u);
    assert.throws(() => retryWriter.append({
      type: "retry.recorded",
      at: "2026-08-30T00:06:00.000Z",
      issueId: "13",
      attempt: 3,
      reason: "proven_inactive_task",
      priorTaskRef: { threadId: "replacement-13", hostId: "local" },
      replacement: {
        supersedesAttempt: 3,
        nextTaskRef: { threadId: "thread-13", hostId: "local" },
        inactiveEvidence: ["Codex task read-back reports the replacement cannot continue."],
      },
    }), /new to this Run/u);
    retryWriter.release();

    const writer = store.acquireWriter("run-12");
    assert.throws(() => store.acquireWriter("run-12"), /RUN_WRITER_LOCKED/u);
    assert.throws(() => writer.append({
      type: "grant.recorded",
      at: "0",
      runIdentity: grant.runIdentity,
    }), /canonical ISO instant/u);

    const storedGrant = writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: grant.runIdentity,
    });
    const storedDispatch = writer.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:01:00.000Z",
      issueId: "13",
      attempt: 1,
      taskRef: { threadId: "thread-13", hostId: "local" },
    });
    assert.equal(storedGrant.sequence, 1);
    assert.equal(storedGrant.maxParallel, 3);
    assert.equal(storedDispatch.sequence, 2);
    assert.deepEqual(store.readEvents("run-12"), [storedGrant, storedDispatch]);
    assert.throws(() => writer.append({ type: "run.started", at: "2026-08-30T00:02:00.000Z" }), /event type/u);
    assert.throws(() => writer.append({
      type: "control.revised",
      at: "2026-08-30T00:02:00.000Z",
      revision: 2,
      command: "PAUSE",
    }), /next control revision/u);
    assert.throws(() => writer.append({
      type: "control.revised",
      at: "2026-08-30T00:02:00.000Z",
      revision: 1,
      command: "START",
    }), /control command/u);
    assert.throws(() => writer.append({
      schema: "caller-owned",
      sequence: 99,
      type: "retry.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      attempt: 1,
      reason: "terminal_failure",
    }), /store-owned/u);
    assert.throws(() => writer.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      attempt: 3,
      taskRef: { threadId: "thread-13", hostId: "local" },
    }), /next dispatch attempt/u);
    assert.throws(() => writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:02:00.000Z",
      runIdentity: { ...grant.runIdentity, approvedScopeHash: "sha256:changed-scope" },
    }), /preserve the Run identity/u);
    assert.throws(() => writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:02:00.000Z",
      runIdentity: grant.runIdentity,
      maxParallel: 9,
    }), /maxParallel/u);
    assert.throws(() => writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:02:00.000Z",
      runIdentity: grant.runIdentity,
      credential: "must-not-persist",
    }), /unknown field/u);
    assert.throws(() => writer.append({
      type: "pause.transitioned",
      at: "2026-08-30T00:02:00.000Z",
      revision: 1,
    }), /matching PAUSE/u);
    assert.throws(() => writer.append({
      type: "retry.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      controlToken: "must-not-persist",
    }), /token/u);
    assert.equal(store.readEvents("run-12").length, 2);

    const currentFacts = facts([{ ...node("13"), taskState: "EXECUTING" }]);
    delete currentFacts.journal;
    const status = writer.rebuildStatus(currentFacts);
    assert.equal(status.run.state, "RUNNING");
    assert.equal(status.nodes[0].state, "EXECUTING");
    assert.deepEqual(store.readStatus("run-12"), status);

    const statusPath = join(gitCommonDir, "matt-workflow-control", "runs", "run-12", "status.json");
    const beforeRejectedWrite = readFileSync(statusPath, "utf8");
    assert.throws(() => writer.rebuildStatus({
      ...currentFacts,
      run: { ...currentFacts.run, controlToken: "must-not-persist" },
    }), /token/u);
    assert.equal(readFileSync(statusPath, "utf8"), beforeRejectedWrite);

    writeFileSync(statusPath, "{corrupt", "utf8");
    assert.equal(writer.rebuildStatus(currentFacts).run.state, "RUNNING");
    assert.equal(readdirSync(join(gitCommonDir, "matt-workflow-control", "runs", "run-12")).some((name) => name.includes(".tmp-")), false);

    writer.append({
      type: "control.revised",
      at: "2026-08-30T00:03:00.000Z",
      revision: 1,
      command: "PAUSE",
    });
    assert.throws(() => writer.append({
      type: "control.revised",
      at: "2026-08-30T00:04:00.000Z",
      revision: 2,
      command: "PAUSE",
    }), /idempotent/u);

    writer.release();
    const runDirectory = join(gitCommonDir, "matt-workflow-control", "runs", "run-12");
    assert.equal(existsSync(join(runDirectory, "engine.lock")), false);
    assert.equal(readdirSync(runDirectory).some((name) => name.startsWith("engine.lock.release-")), false);

    const closeWriter = store.acquireCloseWriter({ target: "features/ron", runId: "run-12" });
    assert.equal(store.readCloseWriter("features/ron"), "run-12");
    assert.throws(
      () => store.acquireCloseWriter({ target: "features/ron", runId: "another-run" }),
      /TARGET_CLOSE_WRITER_LOCKED/u,
    );
    store.acquireCloseWriter({ target: "another-target", runId: "another-run" }).release();
    closeWriter.release();
    assert.equal(store.readCloseWriter("features/ron"), null);
    assert.equal(readdirSync(join(gitCommonDir, "matt-workflow-control", "close-writers"))
      .some((name) => name.includes(".release-")), false);
    store.acquireCloseWriter({ target: "features/ron", runId: "another-run" }).release();

    const controlRoot = join(gitCommonDir, "matt-workflow-control");
    const cleanupLock = join(controlRoot, "cleanup.lock");
    mkdirSync(controlRoot, { recursive: true });
    mkdirSync(cleanupLock);
    assert.throws(() => store.acquireWriter("cleanup-race"), /CLEANUP_IN_PROGRESS/u);
    rmdirSync(cleanupLock);
    store.acquireWriter("run-12").release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup retains recent and newest terminal Runs and deletes only after an audit append", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-");
  const store = createRunStore({ gitCommonDir });
  const now = "2026-08-30T00:00:00.000Z";
  const daysAgo = (days) => new Date(Date.parse(now) - days * 86_400_000).toISOString();
  const terminalRuns = Array.from({ length: 13 }, (_, index) => ({
    runId: `terminal-${String(index).padStart(2, "0")}`,
    specId: String(100 + index),
    state: index === 2 ? "STOPPED" : "SUCCEEDED",
    terminalAt: daysAgo(index === 0 ? 1 : 30 + index),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  const guardedRuns = [
    { runId: "running-old", specId: "200", state: "RUNNING", terminalAt: daysAgo(100), engineLock: "RELEASED", activeTasks: "ABSENT" },
    { runId: "locked-old", specId: "201", state: "SUCCEEDED", terminalAt: daysAgo(100), engineLock: "RELEASED", activeTasks: "ABSENT" },
    { runId: "tasks-old", specId: "202", state: "STOPPED", terminalAt: daysAgo(100), engineLock: "RELEASED", activeTasks: "PRESENT" },
    { runId: "uncertain-old", specId: "203", state: "SUCCEEDED", terminalAt: daysAgo(100), engineLock: "UNKNOWN", activeTasks: "UNKNOWN" },
    { runId: "reclaiming-old", specId: "204", state: "SUCCEEDED", terminalAt: daysAgo(100), engineLock: "RELEASED", activeTasks: "ABSENT" },
  ];
  try {
    for (const { runId } of [...terminalRuns, ...guardedRuns]) {
      const writer = store.acquireWriter(runId);
      if (runId !== "locked-old") writer.release();
    }
    mkdirSync(join(
      gitCommonDir,
      "matt-workflow-control",
      "runs",
      "reclaiming-old",
      "engine-reclaim.lock",
    ));

    const preview = store.previewCleanup({ now, runs: [...terminalRuns, ...guardedRuns] });
    assert.deepEqual(preview.eligible.map(({ runId }) => runId), ["terminal-10", "terminal-11", "terminal-12"]);
    assert.equal(preview.skipped.find(({ runId }) => runId === "terminal-00").reason, "within_30_days");
    assert.equal(preview.skipped.find(({ runId }) => runId === "terminal-09").reason, "newest_10_terminal_runs");
    assert.equal(preview.skipped.find(({ runId }) => runId === "running-old").reason, "non_terminal");
    assert.equal(preview.skipped.find(({ runId }) => runId === "locked-old").reason, "engine_active_or_uncertain");
    assert.equal(preview.skipped.find(({ runId }) => runId === "tasks-old").reason, "tasks_active_or_uncertain");
    assert.equal(preview.skipped.find(({ runId }) => runId === "uncertain-old").reason, "engine_active_or_uncertain");
    assert.equal(preview.skipped.find(({ runId }) => runId === "reclaiming-old").reason, "engine_active_or_uncertain");

    const applied = store.applyCleanup({ now, runs: [...terminalRuns, ...guardedRuns] });
    assert.deepEqual(applied.removed, ["terminal-10", "terminal-11", "terminal-12"]);
    for (const runId of applied.removed) {
      assert.equal(existsSync(join(gitCommonDir, "matt-workflow-control", "runs", runId)), false);
    }
    assert.deepEqual(store.readCleanupRecords().map(({ runId }) => runId), applied.removed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup append failure preserves every eligible Run directory", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-failure-");
  const store = createRunStore({ gitCommonDir });
  const now = "2026-08-30T00:00:00.000Z";
  const runs = Array.from({ length: 11 }, (_, index) => ({
    runId: `failure-${String(index).padStart(2, "0")}`,
    specId: String(300 + index),
    state: "SUCCEEDED",
    terminalAt: new Date(Date.parse(now) - (40 + index) * 86_400_000).toISOString(),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  const cleanupPath = join(gitCommonDir, "matt-workflow-control", "cleanup.jsonl");
  try {
    for (const { runId } of runs) store.acquireWriter(runId).release();
    writeFileSync(cleanupPath, "", "utf8");
    chmodSync(cleanupPath, 0o444);
    assert.throws(() => store.applyCleanup({ now, runs }));
    assert.equal(existsSync(join(gitCommonDir, "matt-workflow-control", "runs", "failure-10")), true);
  } finally {
    if (existsSync(cleanupPath)) chmodSync(cleanupPath, 0o666);
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup rejects duplicate Run evidence before destructive retention", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-duplicate-");
  const store = createRunStore({ gitCommonDir });
  const runId = "duplicate-run";
  const now = "2026-08-30T00:00:00.000Z";
  try {
    store.acquireWriter(runId).release();
    const runs = [
      {
        runId,
        specId: "400",
        state: "SUCCEEDED",
        terminalAt: "2026-06-01T00:00:00.000Z",
        engineLock: "RELEASED",
        activeTasks: "ABSENT",
      },
      {
        runId,
        specId: "400",
        state: "RUNNING",
        terminalAt: null,
        engineLock: "RELEASED",
        activeTasks: "PRESENT",
      },
    ];
    assert.throws(() => store.previewCleanup({ now, runs }), /duplicate runId/u);
    assert.throws(() => store.applyCleanup({ now, runs }), /duplicate runId/u);
    assert.equal(existsSync(join(gitCommonDir, "matt-workflow-control", "runs", runId)), true);
    assert.deepEqual(store.readCleanupRecords(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup requires complete Spec audit identity before destructive retention", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-spec-");
  const store = createRunStore({ gitCommonDir });
  const runId = "missing-spec-run";
  const now = "2026-08-30T00:00:00.000Z";
  try {
    store.acquireWriter(runId).release();
    const incomplete = [{
      runId,
      state: "SUCCEEDED",
      terminalAt: "2026-06-01T00:00:00.000Z",
      engineLock: "RELEASED",
      activeTasks: "ABSENT",
    }];
    assert.throws(() => store.previewCleanup({ now, runs: incomplete }), /specId/u);
    assert.throws(() => store.applyCleanup({ now, runs: incomplete }), /specId/u);
    assert.equal(existsSync(join(gitCommonDir, "matt-workflow-control", "runs", runId)), true);
    assert.deepEqual(store.readCleanupRecords(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup newest-ten floor ignores absent directories", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-absent-");
  const store = createRunStore({ gitCommonDir });
  const now = "2026-08-30T00:00:00.000Z";
  const daysAgo = (days) => new Date(Date.parse(now) - days * 86_400_000).toISOString();
  const existing = Array.from({ length: 11 }, (_, index) => ({
    runId: `existing-${String(index).padStart(2, "0")}`,
    specId: String(500 + index),
    state: "SUCCEEDED",
    terminalAt: daysAgo(40 + index),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  const absent = Array.from({ length: 10 }, (_, index) => ({
    runId: `absent-${String(index).padStart(2, "0")}`,
    specId: String(600 + index),
    state: "SUCCEEDED",
    terminalAt: daysAgo(index + 1),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  try {
    for (const { runId } of existing) store.acquireWriter(runId).release();
    const preview = store.previewCleanup({ now, runs: [...absent, ...existing] });
    assert.deepEqual(preview.eligible.map(({ runId }) => runId), ["existing-10"]);
    assert.equal(preview.skipped.filter(({ reason }) => reason === "newest_10_terminal_runs").length, 10);
    assert.equal(preview.skipped.filter(({ reason }) => reason === "run_directory_absent").length, 10);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup recovers an exact stale lease and resumes append-before-delete idempotently", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-reclaim-");
  const store = createRunStore({ gitCommonDir, coordinatorInstanceId: "cleanup-new" });
  const now = "2026-08-30T00:00:00.000Z";
  const runs = Array.from({ length: 11 }, (_, index) => ({
    runId: `recover-${String(index).padStart(2, "0")}`,
    specId: String(700 + index),
    state: "SUCCEEDED",
    terminalAt: new Date(Date.parse(now) - (40 + index) * 86_400_000).toISOString(),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  const controlRoot = join(gitCommonDir, "matt-workflow-control");
  const runsRoot = join(controlRoot, "runs");
  const cleanupLock = join(controlRoot, "cleanup.lock");
  try {
    for (const { runId } of runs) mkdirSync(join(runsRoot, runId), { recursive: true });
    writeFileSync(join(controlRoot, "cleanup.jsonl"), `${JSON.stringify({
      schema: "dag-run-cleanup:v1",
      sequence: 1,
      runId: "recover-10",
      specId: "710",
      terminalState: "SUCCEEDED",
      deletionTime: now,
      retentionReason: "older_than_30_days_and_outside_newest_10",
    })}\n`, "utf8");
    mkdirSync(cleanupLock);
    writeFileSync(join(cleanupLock, "owner.json"), `${JSON.stringify({
      schema: "dag-run-lock-owner:v1",
      kind: "cleanup",
      runId: "cleanup",
      coordinatorInstanceId: "cleanup-old",
      generation: "cleanup-generation-old",
    })}\n`, "utf8");
    assert.equal(store.readCleanupLock().generation, "cleanup-generation-old");
    assert.throws(() => store.applyCleanup({ now, runs }), /CLEANUP_WRITER_LOCKED/u);
    assert.throws(() => store.previewCleanup({ now: "0", runs }), /ISO time/u);
    assert.throws(() => store.previewCleanup({
      now,
      runs: runs.map((run, index) => (index === 0 ? { ...run, terminalAt: "0" } : run)),
    }), /canonical ISO instant/u);
    const applied = store.applyCleanup({
      now,
      runs,
      cleanupStaleProof: {
        previousCoordinatorInstanceId: "cleanup-old",
        previousGeneration: "cleanup-generation-old",
        coordinatorState: "INACTIVE",
        reconciled: true,
        evidence: ["Coordinator read-back proves cleanup-old is inactive."],
        abandonedOperationIds: [],
      },
    });
    assert.deepEqual(applied.removed, ["recover-10"]);
    assert.equal(existsSync(join(runsRoot, "recover-10")), false);
    assert.equal(store.readCleanupRecords().length, 1);
    assert.equal(existsSync(cleanupLock), false);

    mkdirSync(cleanupLock);
    writeFileSync(join(cleanupLock, "owner.json"), "{corrupt", "utf8");
    assert.throws(() => store.applyCleanup({
      now,
      runs,
      cleanupStaleProof: {
        previousCoordinatorInstanceId: "cleanup-old",
        previousGeneration: "cleanup-generation-old",
        coordinatorState: "INACTIVE",
        reconciled: true,
        evidence: ["The malformed owner cannot authorize recovery."],
        abandonedOperationIds: [],
      },
    }));
    assert.equal(existsSync(cleanupLock), true);
    assert.equal(store.readCleanupLock().state, "UNKNOWN");
    assert.throws(() => store.applyCleanup({ now, runs }), /CLEANUP_WRITER_LOCKED/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit stale-owner proof can reclaim same-Run engine and close locks", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-lock-reclaim-");
  const oldStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "coordinator-old" });
  const newStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "coordinator-new" });
  const staleProofFor = (owner, abandonedOperationIds = []) => ({
    previousCoordinatorInstanceId: owner.coordinatorInstanceId,
    previousGeneration: owner.generation,
    coordinatorState: "INACTIVE",
    reconciled: true,
    evidence: ["Codex task read-back proves the previous coordinator is inactive."],
    abandonedOperationIds,
  });
  try {
    const oldWriter = oldStore.acquireWriter("reclaim-run");
    const oldOwner = oldStore.readWriterLock("reclaim-run");
    const staleProof = staleProofFor(oldOwner);
    assert.equal(oldOwner.coordinatorInstanceId, "coordinator-old");
    assert.throws(() => newStore.acquireWriter("reclaim-run"), /RUN_WRITER_LOCKED/u);
    assert.throws(() => newStore.reclaimWriter({
      runId: "reclaim-run",
      staleProof: { ...staleProof, previousCoordinatorInstanceId: "wrong-owner" },
    }), /STALE_PROOF_MISMATCH/u);
    const strandedGate = join(
      gitCommonDir,
      "matt-workflow-control",
      "runs",
      "reclaim-run",
      "engine-reclaim.lock",
    );
    mkdirSync(strandedGate);
    writeFileSync(join(strandedGate, "owner.json"), `${JSON.stringify({
      schema: "dag-run-lock-owner:v1",
      kind: "engine-reclaim",
      runId: "reclaim-run",
      coordinatorInstanceId: "coordinator-gate-old",
      generation: "gate-generation-old",
    })}\n`, "utf8");
    assert.equal(newStore.readWriterReclaimLock("reclaim-run").generation, "gate-generation-old");
    assert.throws(() => newStore.reclaimWriter({
      runId: "reclaim-run",
      staleProof,
      gateStaleProof: staleProofFor({
        coordinatorInstanceId: "coordinator-gate-old",
        generation: "wrong-gate-generation",
      }),
    }), /GATE_STALE_PROOF_MISMATCH/u);
    assert.equal(newStore.readWriterReclaimLock("reclaim-run").generation, "gate-generation-old");
    const adoptedWriter = newStore.reclaimWriter({
      runId: "reclaim-run",
      staleProof,
      gateStaleProof: {
        ...staleProofFor({
          coordinatorInstanceId: "coordinator-gate-old",
          generation: "gate-generation-old",
        }),
      },
    });
    assert.equal(newStore.readWriterLock("reclaim-run").coordinatorInstanceId, "coordinator-new");
    assert.throws(() => oldWriter.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: { ...grant.runIdentity, runId: "reclaim-run" },
      maxParallel: 3,
    }), /LOCK_LEASE_FENCED/u);
    assert.throws(() => oldWriter.release(), /LOCK_LEASE_FENCED/u);
    assert.equal(newStore.readWriterLock("reclaim-run").coordinatorInstanceId, "coordinator-new");
    adoptedWriter.release();

    const laterOldWriter = oldStore.acquireWriter("reclaim-run");
    assert.throws(() => newStore.reclaimWriter({ runId: "reclaim-run", staleProof }), /STALE_PROOF_MISMATCH/u);
    laterOldWriter.release();

    const operationWriter = oldStore.acquireWriter("operation-run");
    const operationOwner = oldStore.readWriterLock("operation-run");
    const operationId = `operation.${operationOwner.generation}.abandoned.lock`;
    mkdirSync(join(
      gitCommonDir,
      "matt-workflow-control",
      "runs",
      "operation-run",
      "engine.lock",
      operationId,
    ));
    assert.deepEqual(oldStore.readWriterLock("operation-run").activeOperationIds, [operationId]);
    assert.throws(() => newStore.reclaimWriter({
      runId: "operation-run",
      staleProof: staleProofFor(operationOwner),
    }), /OPERATION_ACTIVE_OR_UNPROVEN/u);
    const recoveredOperationWriter = newStore.reclaimWriter({
      runId: "operation-run",
      staleProof: staleProofFor(operationOwner, [operationId]),
    });
    assert.throws(() => operationWriter.release(), /LOCK_LEASE_FENCED/u);
    recoveredOperationWriter.release();

    const oldCloseWriter = oldStore.acquireCloseWriter({ target: "features/ron", runId: "reclaim-run" });
    const oldCloseOwner = oldStore.readCloseWriterLock("features/ron");
    const closeStaleProof = staleProofFor(oldCloseOwner);
    assert.equal(oldCloseOwner.coordinatorInstanceId, "coordinator-old");
    assert.throws(
      () => newStore.acquireCloseWriter({ target: "features/ron", runId: "reclaim-run" }),
      /TARGET_CLOSE_WRITER_LOCKED/u,
    );
    const adoptedCloseWriter = newStore.reclaimCloseWriter({
      target: "features/ron",
      runId: "reclaim-run",
      staleProof: closeStaleProof,
    });
    assert.equal(newStore.readCloseWriterLock("features/ron").coordinatorInstanceId, "coordinator-new");
    assert.throws(() => oldCloseWriter.assertCurrent(), /LOCK_LEASE_FENCED/u);
    assert.throws(() => oldCloseWriter.release(), /LOCK_LEASE_FENCED/u);
    assert.equal(newStore.readCloseWriterLock("features/ron").coordinatorInstanceId, "coordinator-new");
    adoptedCloseWriter.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
