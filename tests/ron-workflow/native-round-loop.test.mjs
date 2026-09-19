// The native round loop is the delivery path's one round: it rebuilds every round from the journal plus
// fresh tracker and Git reads (AC-1), releases a dependant only when every published blocker satisfies
// all three release conditions (AC-2), derives the leaf contracts' existing material-work accounting
// from the journal so no restart can reset it (AC-3), and schedules within the Grant's concurrency
// limit with serialized close lanes (AC-4).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assessLaneSettlement } from "../../skills/personal/run-issue-workflow/scripts/lane-settlement-capability.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { readNativeLaneEvidence } from "../../skills/personal/run-issue-workflow/scripts/native-lane-evidence.mjs";
import { hostActionIdentity } from "../../skills/personal/run-issue-workflow/scripts/pi-workflow-host.mjs";
import { closeLaneLivenessFor } from "../../skills/personal/run-issue-workflow/scripts/run-entry.mjs";
import { LANE_TOOL_CEILING } from "../../skills/personal/run-issue-workflow/scripts/issue-lane.mjs";
import { bindTechnicalFailure, nextRepairWave, recoveryDigest } from "../../skills/personal/run-issue-workflow/scripts/recovery-evidence.mjs";
import { deriveCloseIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";
import {
  CLOSE_INTENT_STAGE,
  HEALTHY_LEAF_INVOCATIONS,
  MATERIAL_REPAIR_WAVE_LIMIT,
  MATERIAL_WORK_SCHEMA,
  RELEASE_FRONTIER_SCHEMA,
  ROUND_DEFERRAL_REASONS,
  ROUND_DISPOSITIONS,
  ROUND_LOOP_STOP_CODES,
  boundRoundActions,
  deriveMaterialWorkAccounting,
  deriveReleaseFrontier,
  laneSettlementObservations,
  planNativeRound,
  runNativeRoundLoop,
} from "../../skills/personal/run-issue-workflow/scripts/native-round-loop.mjs";

const AT = "2026-09-18T04:00:00.000Z";
const runId = "workflow-op-v1-114-round";
const specId = "I_114";
const target = "features/ron";
const targetHead = "a".repeat(40);
const repositoryId = "github:ron03wlb/skills";
const approvedPublicationIdentity = `sha256:${"c".repeat(64)}`;
const agentCeiling = [...LANE_TOOL_CEILING];
const laneTask = (issueId) => ({ threadId: `dispatch_${issueId}_1`, hostId: "pi-subagents" });
const runIdentity = {
  runId,
  specId,
  approvedScopeHash: approvedPublicationIdentity,
  target,
  classification: "MULTI",
  decompositionIdentity: "decomposition:114:03",
};

const candidateOf = (step) => step.toString(16).padStart(2, "0").repeat(20);
const grantEvent = { type: "grant.recorded", at: "2026-09-18T00:00:00.000Z", runIdentity, maxParallel: 3 };
const journal = (drafts) => drafts.map((draft, index) => ({ schema: "dag-run-event:v1", sequence: index + 1, ...draft }));
const dispatchEvent = (issueId, attempt = 1, taskRef = `dispatch_${issueId}_${attempt}`) => ({
  type: "dispatch.recorded",
  at: "2026-09-18T00:01:00.000Z",
  issueId,
  attempt,
  taskRef: { threadId: taskRef, hostId: "pi-subagents" },
});
const repairEvent = (issueId, wave) => ({
  type: "repair.recorded",
  at: "2026-09-18T00:02:00.000Z",
  issueId,
  wave,
  candidate: candidateOf(wave),
  targetHead,
  taskRef: laneTask(issueId),
  requestIdentity: `sha256:${String(wave).padStart(64, "0")}`,
  priorRepairWaves: wave - 1,
});
// A recorded technical-recovery repair wave. The reducer's own close-conflict guard counts only
// `repair.recorded`, so a repair consumed through this path is exactly the case where the cumulative
// budget must be derived rather than inherited from one path.
const recoveryRepairIntent = (issueId, wave) => {
  const failure = bindTechnicalFailure({
    runId,
    issueId,
    operationId: `workflow-op-v1-${"e".repeat(64)}`,
    candidate: candidateOf(wave),
    targetHead,
    worktree: "/wt/issue",
    topic: "issue/A",
    owningSource: "execute-issue",
    observedResult: "a local code defect in the Issue's own source",
    command: ["node", "--test"],
    repairWaveCount: wave - 1,
    ownerTaskRef: laneTask(issueId),
    diagnosis: { classification: "ISSUE_DEFECT", scopeCompatible: true, reason: "local code defect", source: "execute-issue" },
  });
  return {
    type: "recovery.intent",
    at: "2026-09-18T00:03:00.000Z",
    issueId,
    failure,
    phase: "REPAIR",
    wave,
    originalTaskRef: laneTask(issueId),
    requestIdentity: recoveryDigest({ failure, phase: "REPAIR", wave }),
  };
};
const closeIntentEvent = (issueId, operationId, requestIdentity) => ({
  type: "delivery.observed",
  at: AT,
  issueId,
  operationId,
  stage: CLOSE_INTENT_STAGE,
  disposition: "INTENT_RECORDED",
  sourceAt: AT,
  owner: "close-issue",
  evidenceIdentity: "sha256:close-request",
  requestIdentity,
  blockingPredicate: null,
});
const closeOperationId = (issueId) => deriveCloseIssueOperationIdentity({
  repositoryId,
  specId,
  approvedPublicationIdentity,
  issueId,
}).key;

const facts = (nodes, events, runOverrides = {}) => ({
  schema: "dag-run-facts:v1",
  run: {
    ...runIdentity,
    reconciled: true,
    trackerAvailable: true,
    targetState: "CLEAN",
    targetHead,
    closeWriterRunId: null,
    closeWriterState: "ABSENT",
    parentTrackerState: "OPEN",
    parentTrackerIdentity: "github-issue:114:version:1",
    repositoryCloseLeaseState: "ABSENT",
    repositoryCloseLeaseOperationId: null,
    ...runOverrides,
  },
  nodes,
  contradictions: [],
  journal: events,
});

const openNode = (issueId, blockers = [], overrides = {}) => ({
  issueId,
  blockers,
  trackerState: "OPEN",
  taskState: "NONE",
  completionState: "NONE",
  candidateReachable: false,
  worktreeState: "ABSENT",
  ...overrides,
});

const completeNode = (issueId, overrides = {}) => ({
  ...openNode(issueId),
  completionState: "COMPLETE",
  candidateReachable: false,
  worktreeState: "PRESENT",
  closeAuthorityEvidence: {
    trackerIdentity: `github-issue:${issueId}:version:1`,
    targetHead,
    candidateCommit: candidateOf(1),
    completionEvidenceId: `github-comment:completion-${issueId}`,
    completionBodySha256: `sha256:${"d".repeat(64)}`,
    worktreeIdentity: `registered-worktree:issue-${issueId}`,
  },
  ...overrides,
});

const succeededNode = (issueId, overrides = {}) => ({
  ...completeNode(issueId),
  trackerState: "CLOSED",
  candidateReachable: true,
  worktreeState: "ABSENT",
  ...overrides,
});

const roundRead = ({ nodes, events, laneEvidence = null, closeLane = null, readyState = null, readAt = AT }) => ({
  readAt,
  journal: events,
  facts: facts(nodes, events),
  laneEvidence,
  readyState,
  closeLane,
});

const plan = (read, extra = {}) => planNativeRound({ round: read, at: AT, agentCeiling, repositoryId, approvedPublicationIdentity, ...extra });

const LANE_STATE_BY_STATUS = { running: "ACTIVE", queued: "RESUMABLE" };

const laneEvidenceFor = ({ lanes, status = "running", worktreePath = "/wt/issue", trackerState = "OPEN", completion = null }) => readNativeLaneEvidence({
  lanes,
  readRun: ({ laneRef, runId: laneRunId, worktree }) => ({
    schema: "pi-subagent-run-record:v1",
    runId: laneRunId,
    state: "PRESENT",
    status,
    correlationId: `correlation-${laneRef}`,
    cwd: "/pi/agent",
    runsDir: "subagent-runs",
    updatedAt: AT,
    worktreePath: worktree ?? worktreePath,
    laneState: LANE_STATE_BY_STATUS[status] ?? "INACTIVE",
    terminal: ["completed", "failed", "stopped"].includes(status),
    settled: status === "completed",
    evidence: [`native record for ${laneRef} records ${status}`],
  }),
  readIssue: () => ({ state: trackerState, completion }),
  git: { revParse: () => null, isAncestor: () => false },
  repository: "/repo",
  target,
});

const loopPorts = ({ reads, launch, appendBase = 0, sink = null }) => {
  const appends = sink ?? [];
  const waits = [];
  let index = 0;
  return {
    appends,
    waits,
    readRound: async () => {
      const read = typeof reads === "function" ? reads(index) : reads[Math.min(index, reads.length - 1)];
      index += 1;
      return read;
    },
    append: (event) => {
      appends.push(event);
      return { ...event, schema: "dag-run-event:v1", sequence: appendBase + appends.length };
    },
    launch,
    wait: async ({ wait }) => {
      waits.push(wait);
      return { settled: false };
    },
    repositoryId,
    approvedPublicationIdentity,
    agentCeiling,
    now: () => AT,
  };
};

// ---------------------------------------------------------------------------------------------
// AC-1 — stateless rounds rebuilt from one fresh read
// ---------------------------------------------------------------------------------------------

test("one round rebuilds from its fresh read and reserves the lane before the envelope exists", () => {
  const read = roundRead({ nodes: [openNode("A")], events: journal([grantEvent]) });
  const planned = plan(read);
  assert.equal(planned.readAt, AT);
  assert.equal(planned.disposition, "DISPATCH");
  assert.ok(ROUND_DISPOSITIONS.includes(planned.disposition));
  assert.deepEqual(planned.legalActions, ["dispatch_issue"]);
  assert.deepEqual(planned.lanes.map((lane) => lane.id), ["dispatch_A_1"]);
  assert.equal(planned.lanes[0].laneRef, "dispatch_A_1");
  assert.deepEqual(planned.reservations.map((event) => event.type), ["dispatch.recorded"]);
  assert.equal(planned.lanes.length <= planned.maxParallel, true);
  assert.match(planned.evidence[0], /re-derived the release frontier from this round's node facts/u);
  assert.match(planned.evidence[0], /1 ready, 0 gated, 0 unproven/u);
});

test("a restart mid-round resumes the recorded lane instead of creating a second worker", async () => {
  // Round 1 materializes the lane and journals its reservation, then the launch is interrupted.
  const interrupted = loopPorts({
    reads: [roundRead({ nodes: [openNode("A")], events: journal([grantEvent]) })],
    launch: async () => { throw new Error("worker launch lost"); },
  });
  const first = await runNativeRoundLoop(interrupted);
  assert.equal(first.outcome, "INTERRUPTED");
  assert.equal(first.failed.id, "dispatch_A_1");
  assert.deepEqual(interrupted.appends.map((event) => event.type), ["dispatch.recorded"]);
  assert.deepEqual(first.rounds[0].launched, []);

  // The restart re-reads: the reservation is recorded and the lane is observed as active.
  const reserved = journal([grantEvent, dispatchEvent("A")]);
  const restart = loopPorts({
    reads: [roundRead({
      nodes: [openNode("A", [], { taskState: "TRANSIENT_FAILURE" })],
      events: reserved,
      laneEvidence: laneEvidenceFor({ lanes: [{ laneRef: "dispatch_A_1", issueId: "A", attempt: 1, runId: "run-a", worktree: "/wt/a", topic: "issue/A" }] }),
    })],
    launch: async () => ({ settled: false }),
  });
  const second = await runNativeRoundLoop(restart);
  assert.deepEqual(restart.appends, []);
  assert.deepEqual(second.rounds[0].launched, []);
  assert.deepEqual(second.rounds[0].lanes, []);
  assert.deepEqual(second.rounds[0].readBacks, ["dispatch_A_2"]);
  assert.equal(second.outcome, "WAITING");
});

test("a recorded resumable lane is resumed in place, never replaced by a second lane", () => {
  const events = journal([grantEvent, dispatchEvent("A")]);
  const read = roundRead({
    nodes: [openNode("A", [], { taskState: "TRANSIENT_FAILURE" })],
    events,
    laneEvidence: laneEvidenceFor({
      status: "queued",
      lanes: [{ laneRef: "dispatch_A_1", issueId: "A", attempt: 1, runId: "run-a", worktree: "/wt/a", topic: "issue/A" }],
    }),
  });
  const planned = plan(read);
  assert.deepEqual(planned.lanes.map((lane) => lane.laneRef), ["dispatch_A_1"]);
  assert.equal(planned.lanes[0].attempt, 2);
  assert.deepEqual(planned.reservations.map((event) => event.type), ["retry.recorded", "dispatch.recorded"]);
  assert.equal(planned.reservations[0].replacement, null);
});

test("an unattributed dispatch reservation stops the round instead of creating a second lane", () => {
  const events = journal([grantEvent, dispatchEvent("A")]);
  const planned = plan(roundRead({ nodes: [openNode("A", [], { taskState: "TRANSIENT_FAILURE" })], events }));
  assert.equal(planned.disposition, "BLOCKED");
  assert.equal(planned.stop.code, ROUND_LOOP_STOP_CODES.laneReservationUnread);
  assert.deepEqual(planned.lanes, []);
  assert.deepEqual(planned.reservations, []);
});

test("a settled implementation lane makes the close lane the next legal action", async () => {
  const appends = [];
  const read = () => roundRead({
    nodes: [completeNode("A")],
    events: journal([grantEvent, dispatchEvent("A"), ...appends]),
    closeLane: appends.length === 0 ? null : () => ({ state: "ACTIVE", evidence: ["the recorded close lane still holds the repository-close lease"] }),
  });
  const base = journal([grantEvent, dispatchEvent("A")]).length;  const planned = plan(read());
  assert.deepEqual(planned.legalActions, ["close_issue"]);
  assert.deepEqual(planned.lanes.map((lane) => lane.actionType), ["close_issue"]);
  assert.equal(planned.lanes[0].closeInvocation, 1);
  assert.deepEqual(planned.reservations, []);
  assert.equal(planned.closeIntents[0].operationId, closeOperationId("A"));
  assert.equal(planned.closeIntents[0].stage, CLOSE_INTENT_STAGE);
  assert.match(planned.closeIntents[0].requestIdentity, /#invocation-1$/u);

  // The loop writes that intent before the lane exists, launches the recorded lane, and the next round
  // reads back the recorded invocation instead of running a second close.
  const ports = loopPorts({ reads: read, launch: async () => ({ settled: true }), appendBase: base, sink: appends });
  const result = await runNativeRoundLoop(ports);
  assert.deepEqual(ports.appends.map((event) => event.type), ["delivery.observed"]);
  assert.deepEqual(result.rounds[0].launched.map((item) => item.id), ["close_A"]);
  assert.deepEqual(result.rounds[1].lanes, []);
  assert.deepEqual(result.rounds[1].readBacks, ["close_A"]);
  assert.equal(result.outcome, "WAITING");
});

test("a round that would re-plan against its own earlier read stops instead of duplicating work", async () => {
  // The read port keeps returning the journal the first round started from, so the recorded close-lane
  // intent is invisible to the second round: that staleness must stop the loop, not repeat the close.
  const stale = roundRead({ nodes: [completeNode("A")], events: journal([grantEvent, dispatchEvent("A")]) });
  const ports = loopPorts({ reads: [stale], launch: async () => ({ settled: true }), appendBase: 2 });
  const result = await runNativeRoundLoop(ports);
  assert.equal(result.outcome, "STALE_READ");
  assert.equal(result.stop.code, ROUND_LOOP_STOP_CODES.staleRead);
  assert.deepEqual(ports.appends.map((event) => event.type), ["delivery.observed"]);
  assert.equal(result.rounds.length, 1);
});

test("a round plan is a function of the read it was given, not of a previous round", () => {
  const stale = plan(roundRead({ nodes: [openNode("A")], events: journal([grantEvent]) }));
  const current = plan(roundRead({ nodes: [completeNode("A")], events: journal([grantEvent, dispatchEvent("A")]) }));
  assert.deepEqual(stale.lanes.map((lane) => lane.actionType), ["dispatch_issue"]);
  assert.deepEqual(current.lanes.map((lane) => lane.actionType), ["close_issue"]);
  const replay = plan(roundRead({ nodes: [openNode("A")], events: journal([grantEvent]) }));
  assert.deepEqual(replay.lanes.map((lane) => lane.id), stale.lanes.map((lane) => lane.id));
  assert.deepEqual(replay.reservations, stale.reservations);
});

// ---------------------------------------------------------------------------------------------
// AC-2 — dependency release from published edges and fresh reads
// ---------------------------------------------------------------------------------------------

test("a dependant is ready only when every blocker is closed, candidate-reachable and worktree-absent", () => {
  const frontier = deriveReleaseFrontier({ nodes: [succeededNode("A"), openNode("B", ["A"])], target });
  assert.equal(frontier.schema, RELEASE_FRONTIER_SCHEMA);
  assert.deepEqual(frontier.ready, ["A", "B"]);
  const [entry] = frontier.nodes.filter((node) => node.issueId === "B");
  assert.deepEqual(entry.blockers[0].conditions, { blockerClosed: true, candidateReachable: true, worktreeAbsent: true });
});

test("each release condition fails on its own and gates the dependant", () => {
  const conditions = (blocker) => deriveReleaseFrontier({ nodes: [blocker, openNode("B", ["A"])], target })
    .nodes.find((node) => node.issueId === "B");

  const open = conditions({ ...succeededNode("A"), trackerState: "OPEN" });
  assert.equal(open.state, "GATED");
  assert.deepEqual(open.blockers[0].conditions, { blockerClosed: false, candidateReachable: true, worktreeAbsent: true });
  assert.match(open.evidence.join(" "), /Issue A is still open in the tracker/u);

  const unreachable = conditions({ ...succeededNode("A"), candidateReachable: false });
  assert.equal(unreachable.state, "GATED");
  assert.deepEqual(unreachable.blockers[0].conditions, { blockerClosed: true, candidateReachable: false, worktreeAbsent: true });
  assert.match(unreachable.evidence.join(" "), /candidate is not reachable from the target/u);

  const present = conditions({ ...succeededNode("A"), worktreeState: "PRESENT" });
  assert.equal(present.state, "GATED");
  assert.deepEqual(present.blockers[0].conditions, { blockerClosed: true, candidateReachable: true, worktreeAbsent: false });
  assert.match(present.evidence.join(" "), /worktree is still present/u);
});

test("unproven release evidence is never reported ready", () => {
  const frontier = deriveReleaseFrontier({
    nodes: [{ ...succeededNode("A"), trackerState: "UNKNOWN", candidateReachable: "yes" }, openNode("B", ["A"])],
    target,
  });
  assert.deepEqual(frontier.ready, ["A"]);
  assert.deepEqual(frontier.unproven, ["B"]);
  const [entry] = frontier.nodes.filter((node) => node.issueId === "B");
  assert.deepEqual(entry.blockers[0].conditions, { blockerClosed: null, candidateReachable: null, worktreeAbsent: true });
  assert.match(entry.evidence.join(" "), /unproven/u);
  assert.match(entry.evidence.join(" "), /tracker state is not readable/u);
});

test("the frontier uses the published blocker edges only and never infers one", () => {
  // Two Issues a reader might guess are related — same module, same title text — carry no published edge
  // between them, and the frontier adds none.
  const guessed = deriveReleaseFrontier({
    nodes: [
      openNode("A", [], { module: "scripts/native-round-loop.mjs", title: "Round loop" }),
      openNode("B", [], { module: "scripts/native-round-loop.mjs", title: "Round loop tests" }),
    ],
    target,
  });
  assert.deepEqual(guessed.edges, []);
  assert.deepEqual(guessed.ready, ["A", "B"]);

  const published = deriveReleaseFrontier({ nodes: [succeededNode("A"), openNode("B", ["A"])], target });
  assert.deepEqual(published.edges, [{ dependant: "B", blocker: "A" }]);
  const missing = deriveReleaseFrontier({ nodes: [openNode("B", ["A"])], target });
  assert.deepEqual(missing.ready, []);
  assert.deepEqual(missing.unproven, ["B"]);
  assert.match(missing.nodes[0].evidence.join(" "), /no node in this round's read/u);
});

test("the release frontier is re-derived after a close, not read from the producer's projection", () => {
  const before = plan(roundRead({ nodes: [openNode("A"), openNode("B", ["A"])], events: journal([grantEvent]) }));
  assert.deepEqual(before.frontier.ready, ["A"]);
  assert.deepEqual(before.frontier.gated, ["B"]);

  // The closed child's fresh read now carries all three conditions; the producer's one-shot projection
  // still says the dependant is unreleased, and the round re-derives the frontier anyway.
  const after = plan(roundRead({
    nodes: [succeededNode("A"), openNode("B", ["A"])],
    events: journal([grantEvent, dispatchEvent("A")]),
    readyState: { readBack: { state: "NOT_RELEASED", dependants: ["B"] } },
  }));
  assert.deepEqual(after.frontier.ready, ["A", "B"]);
  assert.equal(after.readyState.consulted, false);
  assert.deepEqual(after.readyState.projection, { readBack: { state: "NOT_RELEASED", dependants: ["B"] } });
  assert.deepEqual(after.lanes.map((lane) => lane.issueId), ["B"]);
});

// ---------------------------------------------------------------------------------------------
// AC-3 — preserved material-work accounting derived from the journal
// ---------------------------------------------------------------------------------------------

test("a healthy Issue consumes exactly one execute-issue and one close-issue invocation", () => {
  const events = journal([grantEvent, dispatchEvent("A"), closeIntentEvent("A", closeOperationId("A"), "close_A#invocation-1")]);
  const accounting = deriveMaterialWorkAccounting({ journal: events, issueIds: ["A"] });
  assert.equal(accounting.schema, MATERIAL_WORK_SCHEMA);
  assert.equal(accounting.limit, MATERIAL_REPAIR_WAVE_LIMIT);
  assert.deepEqual(accounting.issues.A.leafInvocations, { "execute-issue": 1, "close-issue": 1 });
  assert.deepEqual(accounting.issues.A.leafInvocations, HEALTHY_LEAF_INVOCATIONS);
  assert.equal(accounting.issues.A.repairWaves, 0);
  assert.equal(accounting.issues.A.healthy, true);
  assert.deepEqual(accounting.issues.A.repeatedWork, []);
});

test("the cumulative repair count survives a restart, a replacement lane and a re-entry", () => {
  const restarted = journal([grantEvent, dispatchEvent("A"), repairEvent("A", 1)]);
  const first = deriveMaterialWorkAccounting({ journal: restarted, issueIds: ["A"] });
  assert.equal(first.issues.A.repairWaves, 1);
  // The same journal read twice is the same accounting: a restart keeps no in-memory count.
  assert.deepEqual(deriveMaterialWorkAccounting({ journal: restarted, issueIds: ["A"] }), first);
  // The existing owner's rule agrees with this derivation instead of being replaced by it.
  assert.equal(nextRepairWave({ failure: { issueId: "A", repairWaveCount: 0 }, journal: restarted }), 2);

  const replacement = journal([
    grantEvent,
    dispatchEvent("A"),
    repairEvent("A", 1),
    {
      type: "retry.recorded",
      at: "2026-09-18T00:03:00.000Z",
      issueId: "A",
      attempt: 1,
      reason: "prior_lane_inactive",
      priorTaskRef: laneTask("A"),
      replacement: {
        supersedesAttempt: 1,
        nextTaskRef: { threadId: "dispatch_A_2", hostId: "pi-subagents" },
        inactiveEvidence: ["the lane was stopped"],
      },
    },
    dispatchEvent("A", 2, "dispatch_A_2"),
    repairEvent("A", 2),
  ]);
  const second = deriveMaterialWorkAccounting({ journal: replacement, issueIds: ["A"] });
  assert.equal(second.issues.A.repairWaves, 2);
  assert.equal(second.issues.A.replacements, 1);
  assert.equal(second.issues.A.leafInvocations["execute-issue"], 2);
  assert.equal(second.issues.A.healthy, false);
  assert.deepEqual(second.issues.A.repeatedWork, [{ leaf: "execute-issue", invocations: 2, expected: 1 }]);
  assert.equal(second.issues.A.repairWaves >= first.issues.A.repairWaves, true);
  assert.equal(nextRepairWave({ failure: { issueId: "A", repairWaveCount: 0 }, journal: replacement }), 3);
});

test("repair waves consumed through the recovery path count against the same limit", () => {
  const waves = Array.from({ length: MATERIAL_REPAIR_WAVE_LIMIT }, (_, index) => recoveryRepairIntent("A", index + 1));
  const events = journal([grantEvent, dispatchEvent("A"), ...waves]);
  const accounting = deriveMaterialWorkAccounting({ journal: events, issueIds: ["A"] });
  assert.equal(accounting.issues.A.state, "EXHAUSTED");
  assert.equal(accounting.issues.A.repairWaves, MATERIAL_REPAIR_WAVE_LIMIT);
  assert.equal(accounting.issues.A.repairWavesRemaining, 0);
  assert.deepEqual(accounting.issues.A.repairCandidates, []);
  assert.throws(() => nextRepairWave({ failure: { issueId: "A", repairWaveCount: 0 }, journal: events }), /ten-wave/u);
});

test("a reached material-repair limit stops the round instead of materializing another wave", () => {
  const waves = Array.from({ length: MATERIAL_REPAIR_WAVE_LIMIT }, (_, index) => recoveryRepairIntent("A", index + 1));
  const events = journal([grantEvent, dispatchEvent("A"), ...waves]);
  // The reducer's own close-conflict guard counts only `repair.recorded`, so it authorizes this repair;
  // the cumulative derivation proves the ten-wave limit is already consumed, so the round stops.
  const planned = plan(roundRead({
    nodes: [completeNode("A", { closeConflict: { candidate: candidateOf(11), targetHead } })],
    events,
  }));
  assert.equal(planned.disposition, "BLOCKED");
  assert.equal(planned.stop.code, ROUND_LOOP_STOP_CODES.materialRepairBudgetUnavailable);
  assert.deepEqual(planned.lanes, []);
  assert.equal(planned.accounting.issues.A.state, "EXHAUSTED");
  assert.match(planned.stop.evidence.join(" "), /material repair waves/u);
});

test("a consumed budget still read-backs the repair operation it already recorded", () => {
  const waves = Array.from({ length: MATERIAL_REPAIR_WAVE_LIMIT }, (_, index) => repairEvent("A", index + 1));
  const accounting = deriveMaterialWorkAccounting({ journal: journal([grantEvent, dispatchEvent("A"), ...waves]), issueIds: ["A"] });
  assert.equal(accounting.issues.A.state, "EXHAUSTED");
  assert.deepEqual(accounting.issues.A.repairCandidates, Array.from({ length: MATERIAL_REPAIR_WAVE_LIMIT }, (_, index) => candidateOf(index + 1)));
  const recorded = boundRoundActions({
    lanes: [{ id: "repair_A_recorded", actionType: "repair_issue", issueId: "A", consumesRepairWave: true, repairCandidate: candidateOf(MATERIAL_REPAIR_WAVE_LIMIT) }],
    maxParallel: 3,
    accounting,
  });
  assert.deepEqual(recorded.accepted.map((lane) => lane.id), ["repair_A_recorded"]);
  assert.deepEqual(recorded.refused, []);

  const fresh = boundRoundActions({
    lanes: [{ id: "repair_A_next", actionType: "repair_issue", issueId: "A", consumesRepairWave: true, repairCandidate: candidateOf(MATERIAL_REPAIR_WAVE_LIMIT + 1) }],
    maxParallel: 3,
    accounting,
  });
  assert.deepEqual(fresh.accepted, []);
  assert.deepEqual(fresh.refused.map((lane) => lane.reason), [ROUND_LOOP_STOP_CODES.materialRepairBudgetUnavailable]);
  assert.match(fresh.refused[0].evidence.join(" "), /would consume wave 11/u);
});

test("an unprovable repair count is preserved instead of assumed to be zero", () => {
  const events = journal([grantEvent, dispatchEvent("A"), { ...repairEvent("A", 1), wave: "three" }]);
  const accounting = deriveMaterialWorkAccounting({ journal: events, issueIds: ["A"] });
  assert.equal(accounting.issues.A.state, "UNPROVEN");
  assert.match(accounting.issues.A.evidence.join(" "), /not one provable material repair wave count/u);
  const bound = boundRoundActions({
    lanes: [{ id: "recover_A", actionType: "recover_issue", issueId: "A", consumesRepairWave: true, repairCandidate: candidateOf(1) }],
    maxParallel: 3,
    accounting,
  });
  assert.deepEqual(bound.refused.map((lane) => lane.reason), [ROUND_LOOP_STOP_CODES.materialRepairBudgetUnavailable]);
  // A journal the Run's own validator refuses cannot authorize material work either: the round stops
  // with nothing materialized.
  const planned = plan(roundRead({ nodes: [openNode("A")], events }));
  assert.equal(planned.stop.code, ROUND_LOOP_STOP_CODES.hostPlanStopped);
  assert.deepEqual(planned.lanes, []);
  assert.deepEqual(planned.reservations, []);
});

// ---------------------------------------------------------------------------------------------
// AC-4 — bounded concurrency and serialized close lanes
// ---------------------------------------------------------------------------------------------

test("implementation lanes respect the Grant's concurrency limit", () => {
  const lanes = ["A", "B", "C"].map((issueId) => ({ id: `dispatch_${issueId}_1`, actionType: "dispatch_issue", issueId, consumesRepairWave: false }));
  const bound = boundRoundActions({ lanes, maxParallel: 2, activeIssueIds: [] });
  assert.equal(bound.executionSlots, 2);
  assert.deepEqual(bound.accepted.map((lane) => lane.issueId), ["A", "B"]);
  assert.deepEqual(bound.deferred.map((lane) => [lane.issueId, lane.reason]), [["C", ROUND_DEFERRAL_REASONS.concurrency]]);

  const contended = boundRoundActions({ lanes, maxParallel: 3, activeIssueIds: ["X", "Y"] });
  assert.equal(contended.executionSlots, 1);
  assert.deepEqual(contended.accepted.map((lane) => lane.issueId), ["A"]);
  assert.equal(contended.deferred.length, 2);
});

test("close lanes are serialized and consume no execution slot", () => {
  const bound = boundRoundActions({
    lanes: [
      { id: "close_A", actionType: "close_issue", issueId: "A" },
      { id: "close_B", actionType: "close_issue", issueId: "B" },
    ],
    maxParallel: 1,
    activeIssueIds: ["X"],
  });
  assert.deepEqual(bound.accepted.map((lane) => [lane.issueId, lane.decision]), [["A", "LAUNCH"]]);
  assert.deepEqual(bound.deferred.map((lane) => lane.reason), [ROUND_DEFERRAL_REASONS.closeSerialization]);

  // A close lane for one Issue runs beside an implementation lane for another, and never becomes two.
  const mixed = boundRoundActions({
    lanes: [
      { id: "dispatch_X_1", actionType: "dispatch_issue", issueId: "X", consumesRepairWave: false },
      { id: "close_A", actionType: "close_issue", issueId: "A" },
      { id: "close_B", actionType: "close_issue", issueId: "B" },
    ],
    maxParallel: 3,
  });
  assert.deepEqual(mixed.accepted.map((lane) => lane.id), ["dispatch_X_1", "close_A"]);
  assert.deepEqual(mixed.deferred.map((lane) => lane.reason), [ROUND_DEFERRAL_REASONS.closeSerialization]);

  // One Issue owns one lane in one round, whether or not it closes.
  const duplicate = boundRoundActions({
    lanes: [
      { id: "dispatch_A_1", actionType: "dispatch_issue", issueId: "A", consumesRepairWave: false },
      { id: "close_A", actionType: "close_issue", issueId: "A" },
    ],
    maxParallel: 3,
  });
  assert.deepEqual(duplicate.deferred.map((lane) => lane.reason), [ROUND_DEFERRAL_REASONS.duplicateIssueLane]);
});

test("a close lane whose recorded invocation is still owned is read back, never duplicated", () => {
  const events = journal([grantEvent, dispatchEvent("A"), closeIntentEvent("A", closeOperationId("A"), "close_A#invocation-1")]);
  const inFlight = plan(roundRead({
    nodes: [completeNode("A")],
    events,
    closeLane: () => ({ state: "ACTIVE", evidence: ["the close lane for A holds the repository-close lease"] }),
  }));
  assert.deepEqual(inFlight.lanes, []);
  assert.deepEqual(inFlight.readBacks.map((item) => [item.id, item.decision]), [["close_A", "READ_BACK"]]);
  assert.deepEqual(inFlight.closeIntents, []);
  assert.equal(deriveMaterialWorkAccounting({ journal: events, issueIds: ["A"] }).issues.A.leafInvocations["close-issue"], 1);

  const unproven = plan(roundRead({ nodes: [completeNode("A")], events }));
  assert.equal(unproven.disposition, "BLOCKED");
  assert.equal(unproven.stop.code, ROUND_LOOP_STOP_CODES.closeLaneOwnerUnproven);

  const lost = plan(roundRead({ nodes: [completeNode("A")], events, closeLane: () => ({ state: "ABSENT" }) }));
  assert.deepEqual(lost.lanes.map((lane) => lane.id), ["close_A"]);
  assert.equal(lost.lanes[0].closeInvocation, 2);
  assert.match(lost.closeIntents[0].requestIdentity, /#invocation-2$/u);
});

test("the reducer's bounded close wait passes through unchanged and consumes no slot", () => {
  const held = plan(roundRead({ nodes: [completeNode("A")], events: journal([grantEvent]) }));
  assert.deepEqual(held.waits, []);
  assert.deepEqual(held.lanes.map((lane) => lane.actionType), ["close_issue"]);

  const events = journal([grantEvent]);
  const waiting = planNativeRound({
    round: {
      readAt: AT,
      journal: events,
      facts: facts([completeNode("A")], events, {
        repositoryCloseLeaseState: "ACTIVE",
        repositoryCloseLeaseOperationId: "close-op-1",
        repositoryCloseLeaseOwner: { operationId: "close-op-1", coordinatorInstanceId: "coordinator-1", generation: "generation-1" },
        repositoryCloseLeaseHealth: "HEALTHY",
      }),
    },
    at: AT,
    agentCeiling,
    repositoryId,
    approvedPublicationIdentity,
  });
  assert.deepEqual(waiting.lanes, []);
  assert.deepEqual(waiting.waits.map((item) => item.actionType), ["wait_repository_close_lease"]);
  assert.equal(waiting.waits[0].timeoutMs, 30_000);
  assert.equal(waiting.waits[0].owner.operationId, "close-op-1");
  assert.equal(boundRoundActions({ lanes: [], maxParallel: 1, activeIssueIds: [] }).executionSlots, 1);
});

// ---------------------------------------------------------------------------------------------
// The close-lane liveness read names the lane its own close action minted
// ---------------------------------------------------------------------------------------------

// One native run record reader over an explicit set of materialized lanes — the exact port
// `closeLaneLivenessFor` consumes — so the lane reference the probe asks about is observable rather
// than inferred from the answer. An unlisted lane reads ABSENT, as a real reader reports it.
const closeRunReader = (lanes, asked = []) => ({ runId }) => {
  asked.push(runId);
  return { schema: "pi-subagent-run-record:v1", runId, state: "ABSENT", ...(lanes[runId] ?? {}) };
};

const liveLane = { state: "PRESENT", status: "running", terminal: false };

const closeProbeFor = (lanes, asked = []) => (request) => closeLaneLivenessFor({
  request,
  readSubagentRun: closeRunReader(lanes, asked),
});

test("the close-lane liveness read resolves the reference the host minted for the close action it reads", () => {
  const parentRef = hostActionIdentity({ type: "close_parent", issueId: specId });
  const childRef = hostActionIdentity({ type: "close_issue", issueId: "A" });
  assert.equal(parentRef, "close_parent_I_114");
  assert.equal(childRef, "close_A");

  const asked = [];
  const probe = closeProbeFor({ [parentRef]: liveLane }, asked);
  // A parent close reads the parent lane: a present non-terminal native record is ACTIVE.
  assert.equal(probe({ issueId: specId, actionType: "close_parent" }).state, "ACTIVE");
  assert.deepEqual(asked, [parentRef], "a parent close asks about the lane the host minted for it");
  // A child close keeps its own reference and its own classification: the parent's live record says
  // nothing about the child lane, so the same reader reports the child lane ABSENT.
  assert.equal(probe({ issueId: "A", actionType: "close_issue" }).state, "ABSENT");
  assert.deepEqual(asked, [parentRef, childRef]);
  // Both close shapes over the same present non-terminal record: each resolves its own host reference
  // and reads its own lane ACTIVE.
  const bothAsked = [];
  const bothLive = closeProbeFor({ [parentRef]: liveLane, [childRef]: liveLane }, bothAsked);
  assert.equal(bothLive({ issueId: specId, actionType: "close_parent" }).state, "ACTIVE");
  assert.equal(bothLive({ issueId: "A", actionType: "close_issue" }).state, "ACTIVE");
  assert.deepEqual(bothAsked, [parentRef, childRef]);
  // A terminal parent lane is ABSENT, and an unreadable one is UNKNOWN rather than a second close
  // owner, exactly as for a child today.
  assert.equal(closeProbeFor({ [parentRef]: { state: "PRESENT", status: "completed", terminal: true } })({ issueId: specId, actionType: "close_parent" }).state, "ABSENT");
  assert.equal(closeProbeFor({ [parentRef]: { state: "UNREADABLE", laneState: "UNKNOWN" } })({ issueId: specId, actionType: "close_parent" }).state, "UNKNOWN");
  // A read that names no close action is not derivable, so the probe refuses to read some other lane's
  // record and reports UNKNOWN instead.
  assert.equal(closeProbeFor({ [parentRef]: liveLane })({ issueId: specId }).state, "UNKNOWN");
});

test("a live Multi-Issue parent close lane is read back, and launched only when its own lane is gone", () => {
  const parentRef = hostActionIdentity({ type: "close_parent", issueId: specId });
  const parentEvents = journal([grantEvent, closeIntentEvent(specId, closeOperationId(specId), `${parentRef}#invocation-1`)]);

  // The parent's recorded invocation is still owned by the lane the host minted for the parent close.
  const inFlight = plan(roundRead({
    nodes: [succeededNode("A")],
    events: parentEvents,
    closeLane: closeProbeFor({ [parentRef]: liveLane }),
  }));
  assert.deepEqual(inFlight.legalActions, ["close_parent"]);
  assert.deepEqual(inFlight.lanes, [], "a live parent close lane is read back, never duplicated");
  assert.deepEqual(inFlight.readBacks.map((item) => [item.id, item.decision]), [[parentRef, "READ_BACK"]]);
  assert.deepEqual(inFlight.closeIntents, [], "a read-back records no second invocation");

  // Its native record is gone: the round may materialize the parent close again, as a new invocation.
  const lost = plan(roundRead({
    nodes: [succeededNode("A")],
    events: parentEvents,
    closeLane: closeProbeFor({}),
  }));
  assert.deepEqual(lost.lanes.map((lane) => [lane.id, lane.actionType, lane.issueId]), [[parentRef, "close_parent", specId]]);
  assert.equal(lost.lanes[0].closeInvocation, 2);
  assert.match(lost.closeIntents[0].requestIdentity, /^sha256:[0-9a-f]{64}#invocation-2$/u);

  // The child close keeps the behaviour it has today, driven through the same real probe.
  const childRef = hostActionIdentity({ type: "close_issue", issueId: "A" });
  const child = plan(roundRead({
    nodes: [completeNode("A")],
    events: journal([grantEvent, dispatchEvent("A"), closeIntentEvent("A", closeOperationId("A"), `${childRef}#invocation-1`)]),
    closeLane: closeProbeFor({ [childRef]: liveLane }),
  }));
  assert.deepEqual(child.lanes, []);
  assert.deepEqual(child.readBacks.map((item) => [item.id, item.decision]), [[childRef, "READ_BACK"]]);
});

// ---------------------------------------------------------------------------------------------
// The mapping onto the readiness probe's lane observations
// ---------------------------------------------------------------------------------------------

test("native lane evidence maps onto the readiness probe's lane settlement observations", () => {
  const settledEvidence = laneEvidenceFor({
    status: "completed",
    worktreePath: "/wt/issue-a",
    trackerState: "CLOSED",
    completion: {
      identity: "github-comment:completion-A",
      record: { kind: "implementation_complete", issueId: "A", candidate: candidateOf(1), topic: "issue/A", worktree: "/wt/issue-a" },
    },
    lanes: [{ laneRef: "dispatch_A_1", issueId: "A", attempt: 1, runId: "run-a", worktree: "/wt/issue-a", topic: "issue/A" }],
  });
  const [settled] = laneSettlementObservations({ lanes: settledEvidence.lanes });
  assert.deepEqual(
    { laneRef: settled.laneRef, capability: settled.capability, worktree: settled.worktree, work: settled.work, settlement: settled.settlement },
    { laneRef: "dispatch_A_1", capability: "mutate", worktree: "managed", work: "finished", settlement: "settled" },
  );
  const proven = assessLaneSettlement({ substrate: "pi-subagents", lanes: laneSettlementObservations({ lanes: settledEvidence.lanes }) });
  assert.equal(proven.state, "PROVEN");
  assert.equal(proven.ready, true);

  // The measured Run #108 shape: the mutation-capable managed-worktree lane was doing its work while
  // the substrate recorded no terminal settlement for it.
  const unfinishedEvidence = laneEvidenceFor({
    status: "running",
    lanes: [{ laneRef: "dispatch_B_1", issueId: "B", attempt: 1, runId: "run-b", worktree: "/wt/issue-b", topic: "issue/B" }],
  });
  const unfinished = laneSettlementObservations({ lanes: unfinishedEvidence.lanes });
  assert.equal(unfinished[0].work, "in-progress");
  assert.equal(assessLaneSettlement({ substrate: "pi-subagents", lanes: unfinished }).state, "UNPROVEN");
});

// ---------------------------------------------------------------------------------------------
// The journal is the only source of the counts, through the one writer
// ---------------------------------------------------------------------------------------------

test("the close-lane intent is recorded through the journal writer and counted on re-entry", async () => {
  const directory = mkdtempSync(join(tmpdir(), "native-round-loop-"));
  try {
    const store = createRunStore({ gitCommonDir: directory });
    const writer = store.acquireWriter(runId);
    try {
      writer.append({ type: "grant.recorded", at: "2026-09-18T00:00:00.000Z", runIdentity });
      writer.append(dispatchEvent("A"));
      const record = (event) => writer.append(event);
      const read = () => roundRead({
        nodes: [completeNode("A")],
        events: store.readEvents(runId),
        closeLane: store.readEvents(runId).some((event) => event.stage === CLOSE_INTENT_STAGE)
          ? () => ({ state: "ACTIVE", evidence: ["the recorded close lane is still owned"] })
          : null,
      });
      let round = 0;
      const ports = {
        readRound: async () => {
          round += 1;
          return read();
        },
        append: record,
        launch: async () => ({ settled: true }),
        repositoryId,
        approvedPublicationIdentity,
        agentCeiling,
        now: () => AT,
      };
      const result = await runNativeRoundLoop(ports);
      assert.equal(round, 2);
      assert.deepEqual(result.rounds[0].launched.map((item) => item.id), ["close_A"]);
      assert.deepEqual(result.rounds[1].readBacks, ["close_A"]);

      const recorded = store.readEvents(runId);
      assert.equal(recorded.length, 3);
      assert.equal(recorded[2].stage, CLOSE_INTENT_STAGE);
      assert.equal(recorded[2].disposition, "INTENT_RECORDED");
      const accounting = deriveMaterialWorkAccounting({ journal: recorded, issueIds: ["A"] });
      assert.equal(accounting.issues.A.leafInvocations["close-issue"], 1);
      assert.equal(accounting.issues.A.healthy, true);
      assert.equal(result.accounting.issues.A.state, "AVAILABLE");
    } finally {
      writer.release();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
