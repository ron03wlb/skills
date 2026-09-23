import assert from "node:assert/strict";
import test from "node:test";

import { reduceRun } from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";
import { planHostActions } from "../../skills/personal/run-issue-workflow/scripts/pi-workflow-host.mjs";
import { planNativeCoordinatorStep } from "../../skills/personal/run-issue-workflow/scripts/native-coordinator-step.mjs";
import { validateEventSemantics } from "../../skills/personal/run-issue-workflow/scripts/run-journal.mjs";

const revision = `sha256:${"f".repeat(64)}`;
const grant = {
  schema: "dag-run-event:v1", sequence: 1, type: "grant.recorded", at: "2026-10-01T00:00:00.000Z",
  runIdentity: { runId: "run-1", specId: "S_1", approvedScopeHash: "scope", target: "main", classification: "MULTI", decompositionIdentity: "decomposition" }, maxParallel: 3,
};
const node = (issueId, blockers = [], taskState = "NONE") => ({ issueId, blockers, trackerState: "OPEN", taskState,
  completionState: "NONE", candidateReachable: false, worktreeState: "ABSENT" });
const facts = (journal, nodes) => ({ schema: "dag-run-facts:v1", run: { ...grant.runIdentity, reconciled: true,
  trackerAvailable: true, targetState: "CLEAN", targetHead: "a".repeat(40), closeWriterRunId: null, closeWriterState: "ABSENT",
  parentTrackerState: "OPEN", parentTrackerIdentity: "tracker-parent" }, nodes, contradictions: [], journal });

test("an activated revision pauses only active closure lanes and keeps independent siblings dispatchable", () => {
  const journal = [grant,
    { schema: "dag-run-event:v1", sequence: 2, type: "dispatch.recorded", at: "2026-10-01T00:01:00.000Z", issueId: "I_1", attempt: 1, taskRef: { threadId: "lane-1", hostId: "native" } },
    { schema: "dag-run-event:v1", sequence: 3, type: "revision.activated", at: "2026-10-01T00:02:00.000Z", revisionIdentity: revision, impactClosureIssueIds: ["I_1", "I_2"] },
  ];
  const status = reduceRun(facts(journal, [node("I_1", [], "EXECUTING"), node("I_2", ["I_1"]), node("I_3")]));
  assert.deepEqual(status.legalActions, [
    { type: "pause_revision_lane", issueId: "I_1", laneRef: "lane-1", revisionIdentity: revision },
    { type: "detach_revision_scope", issueId: "I_2", revisionIdentity: revision },
    { type: "dispatch_issue", issueId: "I_3", attempt: 1 },
  ]);
  const plan = planHostActions(status, { journal });
  assert.equal(plan.materializations[0].actionType, "pause_revision_lane");
  assert.equal(plan.materializations[0].revisionIdentity, revision);
  assert.equal(plan.materializations[1].actionType, "detach_revision_scope");
  const native = planNativeCoordinatorStep({ started: { runId: "run-1", plan: {
    disposition: "DISPATCH", lanes: [], readBacks: [], waits: [], reservations: [], closeIntents: [],
    hostOperations: plan.materializations.map((item) => ({ ...item })),
  } } });
  assert.deepEqual(native.actions.map(({ type }) => type), ["pause_revision_lane", "detach_revision_scope", "return_to_entry"]);
});

test("revision journal events require exact activation, lane request, and successor closure", () => {
  const activated = { type: "revision.activated", at: "2026-10-01T00:02:00.000Z", revisionIdentity: revision, impactClosureIssueIds: ["I_1"] };
  validateEventSemantics([grant], activated);
  const requested = { type: "revision.pause_requested", at: "2026-10-01T00:03:00.000Z", issueId: "I_1", revisionIdentity: revision,
    laneRef: "lane-1", requestIdentity: "request-1", nativeGeneration: "1" };
  validateEventSemantics([grant, activated], requested);
  const paused = { type: "revision.lane_paused", at: "2026-10-01T00:04:00.000Z", issueId: "I_1", revisionIdentity: revision,
    laneRef: "lane-1", requestIdentity: "request-1", nativeGeneration: "1", progressIdentity: "progress-1", candidate: "candidate-1", worktree: "/worktree-1" };
  validateEventSemantics([grant, activated, requested], paused);
  const successor = { type: "successor.grant_recorded", at: "2026-10-01T00:05:00.000Z", revisionIdentity: revision,
    successorRunId: "successor-1", impactClosureIssueIds: ["I_1"] };
  validateEventSemantics([grant, activated, requested, paused], successor);
  assert.throws(() => validateEventSemantics([grant, activated], successor), /detach or acknowledge pause/u);
});
