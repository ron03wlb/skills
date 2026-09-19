// Native round loop.
//
// ADR-0080 keeps the authority layer and replaces only the execution material beneath it: the reducer
// still decides every legal action, the journal still owns grants, budgets, attempts and outcomes, and
// the leaves still own their worktree, verification, review, integration and closure. What the native
// substrate needs instead of a pi-workflow host run is one loop that turns the reducer's legal action
// set into native lanes. This module owns exactly that loop and decides nothing the owners already
// decide:
//
//   * Rebuild every round (AC-1). One round takes one fresh read of every owning source — the journal
//     plus the tracker and Git facts the reducer consumes — and reduces it before any materialization.
//     No round's decision is remembered: the only values the loop carries from one round to the next are
//     the identity of the journal event it just recorded, so the next read cannot silently re-plan
//     against an older snapshot, and the evidence it reports. A restart therefore resumes at the next
//     legal action instead of replaying an in-memory plan.
//   * Gate dependants from fresh reads (AC-2). The release frontier is re-derived from this round's
//     node facts, over the published blocker edges only, and requires all three release conditions:
//     the blocker is closed in the tracker, its candidate is reachable from the target, and its
//     worktree is absent. The decomposition producer's `ready_state.read_back` projection is a one-shot
//     bound to the publication that produced it, so after a child closes nothing re-derives the
//     frontier; the projection is therefore recorded as superseded and never consulted.
//   * Carry the leaf contracts' material-work accounting (AC-3). The existing per-Issue rule stands
//     unchanged: implementation and review together consume at most ten material repair waves, counted
//     cumulatively, and a healthy Issue takes exactly one `execute-issue` and one `close-issue`. Every
//     count is derived from the journal on every round, so a restart, a replacement lane or a re-entry
//     cannot reset it, and a reached limit stops the round instead of materializing more work.
//   * Schedule within the declared limits (AC-4). Implementation lanes respect the Grant's concurrency
//     limit, close lanes are serialized because the close owner alone holds the repository-close lease
//     and then the target writer, and a close lane consumes no execution slot.
//
// The journal append is the only side effect this loop plans: dispatch reservations are collected from
// `native-lane-runner.mjs` (which owns the reservation-before-envelope rule) and the close-lane intent
// is recorded through the existing delivery-progress owner, so a restart reads back the recorded lane
// instead of creating a second one. Nothing here launches, waits for, settles, integrates or closes
// anything: the loop returns the lanes its caller must materialize.
import { deriveCloseIssueOperationIdentity, requireIsoInstant, reduceRun, routeTechnicalRecovery } from "./delivery-authority.mjs";
import { DELIVERY_PROGRESS_EVENT, appendDeliveryProgress } from "./delivery-progress.mjs";
import { creationIntentsFor, observedLanesFor } from "./native-lane-evidence.mjs";
// `CLOSE_LANE_ACTIONS` is the lane runner's own vocabulary, so the loop and the runner can never
// disagree about which actions are close lanes.
import { CLOSE_LANE_ACTIONS, dispatchNativeLane } from "./native-lane-runner.mjs";
import { hostActionIdentity, planHostActions } from "./pi-workflow-host.mjs";

export const ROUND_PLAN_SCHEMA = "native-round-plan:v1";
export const ROUND_LOOP_SCHEMA = "native-round-loop:v1";
export const RELEASE_FRONTIER_SCHEMA = "native-release-frontier:v1";
export const MATERIAL_WORK_SCHEMA = "native-material-work:v1";
export const LANE_SETTLEMENT_OBSERVATION_SCHEMA = "lane-settlement-observation:v1";
// The existing material-work rule, unchanged: implementation and review together consume at most ten
// material repair waves per Issue, counted cumulatively across retries, replacement lanes, re-entry and
// restarts, while a healthy Issue completes with exactly one of each leaf.
export const MATERIAL_REPAIR_WAVE_LIMIT = 10;
export const HEALTHY_LEAF_INVOCATIONS = Object.freeze({ "execute-issue": 1, "close-issue": 1 });
export const CLOSE_INTENT_STAGE = "CLOSE_DISPATCH_INTENT";
export const ROUND_DISPOSITIONS = Object.freeze(["DISPATCH", "WAIT", "IDLE", "TERMINAL", "BLOCKED"]);
// The reducer action vocabulary this loop materializes as worker lanes, split by the limit that bounds
// it: the execution lanes `HOST_ACTION_POLICY` materializes as agents, and the close lanes its own
// runner declares. A close lane consumes no execution slot, so only the execution lanes are bounded by
// the Grant's concurrency limit.
export const EXECUTION_ACTIONS = Object.freeze(["dispatch_issue", "recover_issue", "repair_issue", "upgrade_issue"]);
export const CLOSE_ACTIONS = CLOSE_LANE_ACTIONS;
export const ROUND_LOOP_STOP_CODES = Object.freeze({
  readUnusable: "round_read_unusable",
  hostPlanStopped: "round_host_plan_stopped",
  materialRepairBudgetUnavailable: "round_material_repair_budget_unavailable",
  staleRead: "round_read_stale",
  closeLaneOwnerUnproven: "round_close_lane_owner_unproven",
  closeIdentityUnavailable: "round_close_identity_unavailable",
  laneReservationUnread: "round_lane_reservation_unread",
});
export const ROUND_DEFERRAL_REASONS = Object.freeze({
  concurrency: "concurrency_limit",
  closeSerialization: "close_lane_serialization",
  duplicateIssueLane: "round_duplicate_issue_lane",
  unsupportedAction: "unsupported_lane_action",
});

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const requireText = (value, label) => {
  if (!isText(value)) throw new TypeError(`${label} is required`);
  return value;
};
const stop = (code, evidence) => Object.freeze({ code, evidence: Object.freeze([...evidence]) });

// ---------------------------------------------------------------------------------------------
// AC-2 — the release frontier, re-derived from this round's fresh node facts
// ---------------------------------------------------------------------------------------------

// One fact reader's answer for one release condition: true, false, or unproven. A condition the reader
// cannot prove is never read as satisfied, because releasing a dependant on missing tracker or Git
// evidence is how a second lane ends up on an unclosed blocker.
const conditionOf = (value) => {
  if (value === true) return true;
  if (value === false) return false;
  return null;
};
const trackerCondition = (state) => {
  if (state === "CLOSED") return true;
  if (state === "OPEN") return false;
  return null;
};
const worktreeCondition = (state) => {
  if (state === "ABSENT") return true;
  if (state === "PRESENT") return false;
  return null;
};

const releaseConditions = (blocker, node) => {
  if (node === undefined) {
    return {
      blocker,
      conditions: Object.freeze({ blockerClosed: null, candidateReachable: null, worktreeAbsent: null }),
      evidence: Object.freeze([
        `Published blocker ${blocker} has no node in this round's read.`,
        "A release edge the publication does not carry a node for is unproven, never inferred.",
      ]),
    };
  }
  const blockerClosed = trackerCondition(node.trackerState);
  const candidateReachable = conditionOf(node.candidateReachable);
  const worktreeAbsent = worktreeCondition(node.worktreeState);
  const evidence = [];
  if (blockerClosed === null) evidence.push(`Issue ${blocker} tracker state is not readable as closed or open.`);
  if (candidateReachable === null) evidence.push(`Issue ${blocker} candidate reachability from the target is unproven.`);
  if (worktreeAbsent === null) evidence.push(`Issue ${blocker} worktree absence is unproven.`);
  if (blockerClosed === false) evidence.push(`Issue ${blocker} is still open in the tracker.`);
  if (candidateReachable === false) evidence.push(`Issue ${blocker} candidate is not reachable from the target.`);
  if (worktreeAbsent === false) evidence.push(`Issue ${blocker} worktree is still present.`);
  return { blocker, conditions: Object.freeze({ blockerClosed, candidateReachable, worktreeAbsent }), evidence: Object.freeze(evidence) };
};

// The frontier for one round: the exact state of every published blocker edge, freshly read. A node is
// READY only when every blocker satisfies all three conditions; a node with an unproven condition is
// UNKNOWN and is never reported ready.
export function deriveReleaseFrontier({ nodes, target } = {}) {
  requireText(target, "A release frontier needs the recorded target branch");
  if (!Array.isArray(nodes)) throw new TypeError("A release frontier needs this round's node facts");
  const byId = new Map();
  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node)) throw new TypeError(`Round node ${index} must be an object`);
    if (!isText(node.issueId)) throw new TypeError(`Round node ${index} must name its Issue`);
    if (!Array.isArray(node.blockers) || !node.blockers.every(isText)) {
      throw new TypeError(`Round node ${index} must carry its published blocker edges as text`);
    }
    byId.set(node.issueId, node);
  }
  const entries = nodes.map((node) => {
    const blockers = node.blockers.map((blocker) => releaseConditions(blocker, byId.get(blocker)));
    const unproven = blockers.filter((entry) => Object.values(entry.conditions).some((value) => value === null));
    const unsatisfied = blockers.filter((entry) => Object.values(entry.conditions).some((value) => value === false));
    const state = unproven.length > 0 ? "UNKNOWN" : unsatisfied.length > 0 ? "GATED" : "READY";
    const evidence = state === "READY"
      ? [blockers.length === 0
        ? `Issue ${node.issueId} has no published blocker edge, so it is ready.`
        : `Every published blocker of Issue ${node.issueId} is closed, candidate-reachable from ${target}, and worktree-absent.`]
      : [...new Set([...unproven, ...unsatisfied].flatMap((entry) => entry.evidence))];
    return Object.freeze({
      issueId: node.issueId,
      state,
      blockers: Object.freeze(blockers),
      evidence: Object.freeze(evidence),
    });
  });
  const select = (state) => entries.filter((entry) => entry.state === state).map((entry) => entry.issueId);
  return Object.freeze({
    schema: RELEASE_FRONTIER_SCHEMA,
    target,
    nodes: Object.freeze(entries),
    // The edges are the published ones this round read; the frontier adds no edge of its own.
    edges: Object.freeze(entries.flatMap((entry) => entry.blockers.map((item) => Object.freeze({
      dependant: entry.issueId,
      blocker: item.blocker,
    })))),
    ready: Object.freeze(select("READY")),
    gated: Object.freeze(select("GATED")),
    unproven: Object.freeze(select("UNKNOWN")),
  });
}

// ---------------------------------------------------------------------------------------------
// AC-3 — the leaf contracts' existing material-work accounting, derived from the journal
// ---------------------------------------------------------------------------------------------

const closeIntentEvents = (journal, issueId) => journal.filter((event) => (
  isRecord(event) && event.type === DELIVERY_PROGRESS_EVENT && event.issueId === issueId
  && event.stage === CLOSE_INTENT_STAGE
));

// The material repair budget and the leaf-invocation counts for every Issue in the Run, derived from
// the journal alone on every round. Nothing here is remembered between rounds, so a restart, a
// replacement lane or a re-entry re-derives the same cumulative count rather than starting over.
export function deriveMaterialWorkAccounting({ journal, issueIds } = {}) {
  if (!Array.isArray(journal)) throw new TypeError("Material-work accounting needs the authority journal");
  if (!Array.isArray(issueIds) || issueIds.length === 0 || !issueIds.every(isText)) {
    throw new TypeError("Material-work accounting needs the Run's Issue list");
  }
  const issues = {};
  for (const issueId of issueIds) {
    const events = journal.filter((event) => isRecord(event) && event.issueId === issueId);
    const waves = [];
    let unproven = null;
    const readWave = (value, label) => {
      if (value === undefined || value === null) return;
      if (!Number.isInteger(value) || value < 0 || value > MATERIAL_REPAIR_WAVE_LIMIT) {
        unproven = unproven ?? `${label} for Issue ${issueId} records ${String(value)}, which is not one provable material repair wave count.`;
        return;
      }
      waves.push(value);
    };
    for (const event of events) {
      if (event.type === "repair.recorded") readWave(event.wave, "repair.recorded");
      if (event.type === "recovery.intent" && event.phase === "REPAIR") readWave(event.wave, "recovery.intent");
      if (event.type === "recovery.task" && event.phase === "REPAIR") readWave(event.wave, "recovery.task");
      // A model upgrade carries the count it continued from, so a re-entry under a bounded upgrade
      // cannot report a lower wave than the repair it continued.
      if (event.type === "model.upgrade") readWave(event.repairWaves, "model.upgrade");
    }
    const repairWaves = Math.max(0, ...waves);
    const repairCandidates = [...new Set(events
      .filter((event) => event.type === "repair.recorded" && isText(event.candidate))
      .map((event) => event.candidate))];
    const dispatches = events.filter((event) => event.type === "dispatch.recorded");
    const dispatchAttempts = Math.max(0, ...dispatches.map((event) => (Number.isInteger(event.attempt) ? event.attempt : 0)));
    const retries = events.filter((event) => event.type === "retry.recorded");
    const replacements = retries.filter((event) => isRecord(event.replacement));
    const intents = closeIntentEvents(journal, issueId);
    // One recorded close-lane invocation is one distinct intent; the loop records the invocation
    // ordinal as the request identity, so a repeated materialization is countable instead of being
    // silently deduplicated as the same request.
    const closeInvocations = new Set(intents.map((event) => (isText(event.requestIdentity) ? event.requestIdentity : null))).size;
    const state = unproven !== null
      ? "UNPROVEN"
      : repairWaves >= MATERIAL_REPAIR_WAVE_LIMIT ? "EXHAUSTED" : "AVAILABLE";
    const repeatedWork = [];
    if (Number.isInteger(dispatchAttempts) && dispatchAttempts > HEALTHY_LEAF_INVOCATIONS["execute-issue"]) {
      repeatedWork.push({ leaf: "execute-issue", invocations: dispatchAttempts, expected: HEALTHY_LEAF_INVOCATIONS["execute-issue"] });
    }
    if (closeInvocations > HEALTHY_LEAF_INVOCATIONS["close-issue"]) {
      repeatedWork.push({ leaf: "close-issue", invocations: closeInvocations, expected: HEALTHY_LEAF_INVOCATIONS["close-issue"] });
    }
    const evidence = [
      `Issue ${issueId} records ${repairWaves}/${MATERIAL_REPAIR_WAVE_LIMIT} material repair waves, ${dispatchAttempts} execute-issue invocation(s), ${retries.length} retry(ies) of which ${replacements.length} replaced a lane, and ${closeInvocations} close-issue invocation(s).`,
      ...(unproven === null ? [] : [unproven]),
    ];
    issues[issueId] = Object.freeze({
      issueId,
      state,
      repairWaves,
      repairWavesRemaining: Math.max(0, MATERIAL_REPAIR_WAVE_LIMIT - repairWaves),
      // The candidates the recorded repair waves already produced. A repair lane naming one of them is
      // the recorded operation re-issued, not a new wave the budget has to pay for.
      repairCandidates: Object.freeze(repairCandidates),
      leafInvocations: Object.freeze({ "execute-issue": dispatchAttempts, "close-issue": closeInvocations }),
      retries: retries.length,
      replacements: replacements.length,
      // A healthy Issue shows no repeated work: no repair wave, at most one execute-issue invocation
      // and at most one close-issue invocation. Healthy contention and lease waits consume nothing.
      healthy: unproven === null && repairWaves === 0 && retries.length === 0
        && dispatchAttempts <= HEALTHY_LEAF_INVOCATIONS["execute-issue"]
        && closeInvocations <= HEALTHY_LEAF_INVOCATIONS["close-issue"],
      repeatedWork: Object.freeze(repeatedWork),
      evidence: Object.freeze([...evidence, ...repeatedWork.map((item) => (
        `Issue ${issueId} invoked ${item.leaf} ${item.invocations} times where a healthy Issue invokes it ${item.expected}.`
      ))]),
    });
  }
  return Object.freeze({
    schema: MATERIAL_WORK_SCHEMA,
    limit: MATERIAL_REPAIR_WAVE_LIMIT,
    healthyInvocations: HEALTHY_LEAF_INVOCATIONS,
    issues: Object.freeze(issues),
  });
}

// ---------------------------------------------------------------------------------------------
// AC-4 — the round's lanes, bounded by the concurrency limit and close-lane serialization
// ---------------------------------------------------------------------------------------------

const laneBoundEntry = (lane, fields) => Object.freeze({ ...lane, ...fields });

// Whether the derived budget can pay for one repair-consuming lane. An unprovable count is never
// assumed to be zero, so it cannot authorize material work; a consumed budget authorizes only the
// recorded repair operation itself — the same candidate the recorded waves already produced — which is
// a read-back of a wave already counted, never an eleventh one.
const repairWaveAvailable = ({ entry, lane }) => {
  if (entry === null || entry.state === "UNPROVEN") return false;
  if (entry.state === "AVAILABLE") return true;
  return isText(lane.repairCandidate) && entry.repairCandidates.includes(lane.repairCandidate);
};

// The one scheduling decision this loop owns. `lanes` are the authorized lane materializations of this
// round; a lane is accepted (launched, or read back when it is already in flight), refused when the
// material repair budget cannot authorize it, or deferred by a declared limit. A close lane never
// consumes an execution slot, and at most one close lane runs at a time.
//
// This bound can only ever defer: the reducer has already sliced its own action set against the Grant's
// concurrency limit and the workers it has reserved, so the loop never adds a lane the reducer refused.
// What it adds is the limit's own enforcement at the seam that materializes, and the close-lane
// serialization the reducer's single close action does not by itself prove.
export function boundRoundActions({
  lanes,
  maxParallel,
  activeIssueIds = [],
  accounting = null,
  closeLaneStates = {},
} = {}) {
  if (!Array.isArray(lanes)) throw new TypeError("A bounded round needs the authorized lane list");
  if (!Number.isInteger(maxParallel) || maxParallel < 1) {
    throw new TypeError("A bounded round needs the Grant's positive concurrency limit");
  }
  if (!Array.isArray(activeIssueIds)) throw new TypeError("A bounded round needs the active Issue list");
  const slots = Math.max(0, maxParallel - activeIssueIds.length);
  const accepted = [];
  const deferred = [];
  const refused = [];
  const seenIssues = new Set();
  let executionAccepted = 0;
  let closeAccepted = false;
  for (const lane of lanes) {
    if (seenIssues.has(lane.issueId)) {
      deferred.push(laneBoundEntry(lane, {
        reason: ROUND_DEFERRAL_REASONS.duplicateIssueLane,
        evidence: [`Issue ${lane.issueId} already has one lane in this round; one Issue owns one lane.`],
      }));
      continue;
    }
    seenIssues.add(lane.issueId);
    if (CLOSE_ACTIONS.includes(lane.actionType)) {
      if (closeAccepted) {
        deferred.push(laneBoundEntry(lane, {
          reason: ROUND_DEFERRAL_REASONS.closeSerialization,
          evidence: ["This round already materialized one close lane; the repository-close lease and the target writer are held by one close owner at a time."],
        }));
        continue;
      }
      closeAccepted = true;
      const closeLane = closeLaneStates[lane.issueId] ?? { state: "ABSENT" };
      // A recorded close lane that fresh evidence reports in flight is read back, never duplicated, and
      // it consumes no execution slot because close authority is not a dispatch attempt.
      if (closeLane.state === "ACTIVE") {
        accepted.push(laneBoundEntry(lane, {
          decision: "READ_BACK",
          closeInvocation: closeLane.recordedInvocation ?? null,
          evidence: [`Close lane for Issue ${lane.issueId} is already recorded and still owned by its close owner; the round reads it back instead of materializing a second one.`],
        }));
        continue;
      }
      accepted.push(laneBoundEntry(lane, {
        decision: "LAUNCH",
        closeInvocation: closeLane.nextInvocation ?? 1,
        evidence: [`The round materializes one close lane for Issue ${lane.issueId}; close lanes consume no execution slot and stay serialized.`],
      }));
      continue;
    }
    if (EXECUTION_ACTIONS.includes(lane.actionType)) {
      const entry = accounting?.issues?.[lane.issueId] ?? null;
      if (lane.consumesRepairWave === true && !repairWaveAvailable({ entry, lane })) {
        refused.push(laneBoundEntry(lane, {
          reason: ROUND_LOOP_STOP_CODES.materialRepairBudgetUnavailable,
          evidence: entry === null
            ? [`Issue ${lane.issueId} needs a material repair wave that no derivation authorizes.`]
            : [...entry.evidence,
              ...(entry.state === "EXHAUSTED"
                ? [`Repair candidate ${lane.repairCandidate ?? "none"} is not the candidate the recorded repair waves already produced, so this lane would consume wave ${entry.repairWaves + 1}.`]
                : [])],
        }));
        continue;
      }
      if (executionAccepted >= slots) {
        deferred.push(laneBoundEntry(lane, {
          reason: ROUND_DEFERRAL_REASONS.concurrency,
          evidence: [`${maxParallel - slots} of the Grant's ${maxParallel} execution slots are taken, so ${slots} implementation lane(s) may run this round.`],
        }));
        continue;
      }
      executionAccepted += 1;
      accepted.push(laneBoundEntry(lane, { decision: "LAUNCH", closeInvocation: null, evidence: [`Implementation lane ${lane.id} takes one of ${slots} available execution slot(s).`] }));
      continue;
    }
    deferred.push(laneBoundEntry(lane, {
      reason: ROUND_DEFERRAL_REASONS.unsupportedAction,
      evidence: [`Action ${lane.actionType} is not a lane this loop materializes.`],
    }));
  }
  return Object.freeze({
    maxParallel,
    occupied: activeIssueIds.length,
    executionSlots: slots,
    accepted: Object.freeze(accepted),
    deferred: Object.freeze(deferred),
    refused: Object.freeze(refused),
  });
}

// ---------------------------------------------------------------------------------------------
// The mapping onto the readiness probe's lane-settlement observations
// ---------------------------------------------------------------------------------------------

// The native lane evidence read maps onto the lane observation the lane-settlement readiness probe
// consumes: `{laneRef, capability, worktree, work, settlement}`. Every native Issue lane is
// mutation-capable and runs in one managed worktree — that is what `HOST_ACTION_POLICY` and
// `LANE_WORKTREE_POLICY` declare for it — and its work is finished once its own record proves a
// terminal outcome or a published completion, while settlement is the substrate's own terminal state.
export function laneSettlementObservations({ lanes } = {}) {
  if (!Array.isArray(lanes)) throw new TypeError("Lane settlement observations need the native lane evidence read");
  return Object.freeze(lanes.map((lane) => {
    if (!isRecord(lane) || !isText(lane.laneRef)) throw new TypeError("A lane observation needs the lane reference it came from");
    const run = isRecord(lane.run) ? lane.run : {};
    const settled = run.settled === true;
    const finished = settled || run.terminal === true || lane.completion?.proven === true;
    return Object.freeze({
      schema: LANE_SETTLEMENT_OBSERVATION_SCHEMA,
      laneRef: lane.laneRef,
      capability: "mutate",
      worktree: "managed",
      work: finished ? "finished" : run.state === "PRESENT" ? "in-progress" : "none",
      settlement: settled ? "settled" : "absent",
      recorded: Object.freeze([...(lane.evidence ?? [])]),
    });
  }));
}

// ---------------------------------------------------------------------------------------------
// AC-1 — one round, rebuilt from one fresh read
// ---------------------------------------------------------------------------------------------

const requireRoundRead = (round) => {
  if (!isRecord(round)) throw new TypeError("A round plan needs one fresh round read");
  requireIsoInstant(round.readAt, "Round read timestamp");
  if (!Array.isArray(round.journal)) throw new TypeError("A round read needs the exact journal snapshot");
  if (!isRecord(round.facts) || !Array.isArray(round.facts.journal) || !Array.isArray(round.facts.nodes)) {
    throw new TypeError("A round read needs one dag-run-facts:v1 read that carries the same journal");
  }
  const same = round.journal.length === round.facts.journal.length
    && round.journal.every((event, index) => event?.type === round.facts.journal[index]?.type);
  if (!same) {
    throw new TypeError("The round's journal snapshot and the facts' journal are not the same read");
  }
  return {
    readAt: round.readAt,
    journal: round.journal,
    facts: round.facts,
    laneEvidence: round.laneEvidence ?? null,
    readyState: isRecord(round.readyState) ? round.readyState : null,
    closeLane: typeof round.closeLane === "function" ? round.closeLane : null,
  };
};

const laneAction = (status, id) => status.legalActions.find((action) => {
  try {
    return hostActionIdentity(action) === id;
  } catch {
    return false;
  }
});

// The repair-phase check the reducer itself routes by: a `repair_issue` lane and a `recover_issue` lane
// whose recovery phase is REPAIR both consume one material repair wave. An unprovable phase fails
// closed and consumes one, so an unread failure can never buy extra material work.
const consumesRepairWave = (action) => {
  if (action?.type === "repair_issue") return true;
  if (action?.type !== "recover_issue") return false;
  try {
    return routeTechnicalRecovery(action.failure).phase === "REPAIR";
  } catch {
    return true;
  }
};

// One round: reconcile this round's fresh read, reduce it, re-derive the release frontier and the
// material-work accounting, and plan the bounded lane set. It appends nothing and launches nothing.
export function planNativeRound({
  round,
  at,
  agentCeiling,
  repositoryId = null,
  approvedPublicationIdentity = null,
} = {}) {
  requireIsoInstant(at, "Round plan timestamp");
  const read = requireRoundRead(round);
  const status = reduceRun(read.facts);
  const nodesReadable = read.facts.nodes.length > 0 && read.facts.nodes.every((node) => (
    isRecord(node) && isText(node.issueId) && Array.isArray(node.blockers) && node.blockers.every(isText)
  ));
  const usable = isText(status.run.runId) && isText(status.run.specId) && isText(status.run.target) && nodesReadable;
  const frontier = usable ? deriveReleaseFrontier({ nodes: read.facts.nodes, target: status.run.target }) : null;
  const accounting = usable
    ? deriveMaterialWorkAccounting({ journal: read.journal, issueIds: read.facts.nodes.map((node) => node.issueId) })
    : null;
  const base = {
    schema: ROUND_PLAN_SCHEMA,
    at,
    readAt: read.readAt,
    runId: status.run.runId ?? null,
    specId: status.run.specId ?? null,
    target: status.run.target ?? null,
    state: status.run.state,
    controlRevision: status.run.controlRevision ?? 0,
    maxParallel: status.run.maxParallel ?? null,
    frontier,
    accounting,
    // The producer's ready-state projection is a one-shot bound to its own read-back. The round records
    // it as superseded and re-derives the frontier from this round's reads instead.
    readyState: Object.freeze({ projection: read.readyState, consulted: false }),
    legalActions: Object.freeze([...(status.legalActions ?? [])].map((action) => action.type)),
    lanes: Object.freeze([]),
    readBacks: Object.freeze([]),
    waits: Object.freeze([]),
    hostOperations: Object.freeze([]),
    reservations: Object.freeze([]),
    closeIntents: Object.freeze([]),
    deferred: Object.freeze([]),
    refused: Object.freeze([]),
    disposition: "BLOCKED",
    stop: null,
    evidence: Object.freeze([]),
  };
  const planFor = (fields) => Object.freeze({ ...base, ...fields });
  const stoppedFor = (code, evidence, fields = {}) => planFor({
    ...fields,
    disposition: "BLOCKED",
    stop: stop(code, evidence),
    evidence: Object.freeze([...evidence]),
  });
  if (!usable) {
    return stoppedFor(ROUND_LOOP_STOP_CODES.readUnusable, [
      "This round's read does not name a Run, Spec, target and usable node set, so no action can be materialized.",
      ...(status.diagnoses ?? []).flatMap((diagnosis) => diagnosis.evidence ?? []).slice(0, 8),
    ]);
  }

  const hostPlan = planHostActions(status, { journal: read.journal });
  if (hostPlan.stop) {
    // The reducer's own plan is the authority for a round with no materializable lane: a blocked Run, a
    // contradictory action set, or an action the host planner refuses are all that owner's stop, and the
    // loop reports it instead of inventing a lane.
    return stoppedFor(ROUND_LOOP_STOP_CODES.hostPlanStopped, [
      `Run ${status.run.runId} is ${status.run.state} with ${status.legalActions.length} legal action(s); the host planner stopped the round: ${hostPlan.stop.code}.`,
      ...hostPlan.stop.evidence,
    ], { legalActions: hostPlan.authorizedActions.map((action) => String(action)) });
  }
  const materializations = hostPlan.materializations;
  const laneItems = materializations.filter((item) => item.kind === "agent");
  const waits = materializations.filter((item) => item.kind === "host" && item.execution === "wait");
  const hostOperations = materializations.filter((item) => item.kind === "host" && item.execution !== "wait");

  // A recorded close lane is the owning source of its own re-entry: a close lane that fresh evidence
  // reports in flight is read back, and a close lane whose recorded intent has no live owner is
  // unknown ownership, which stops instead of putting a second close owner on the same Issue.
  const closeLaneStates = {};
  for (const item of laneItems.filter((lane) => CLOSE_ACTIONS.includes(lane.actionType))) {    if (!isText(repositoryId) || !isText(approvedPublicationIdentity)) {
      return stoppedFor(ROUND_LOOP_STOP_CODES.closeIdentityUnavailable, [
        `Issue ${item.issueId} is closeable, but this round cannot derive the close-issue operation identity it must record.`,
        "A close lane without its operation identity is unaccounted, so nothing is materialized.",
      ]);
    }
    const operationId = deriveCloseIssueOperationIdentity({
      repositoryId,
      specId: status.run.specId,
      approvedPublicationIdentity,
      issueId: item.issueId,
    }).key;
    const intents = closeIntentEvents(read.journal, item.issueId).filter((event) => event.operationId === operationId);
    if (intents.length === 0) {
      closeLaneStates[item.issueId] = { state: "ABSENT", operationId, recordedInvocation: 0, nextInvocation: 1, recorded: null };
      continue;
    }
    const recorded = intents.at(-1);
    // The liveness read names the close action it is asking about, so the probe derives the lane
    // reference from the same action the host minted: `close_parent_<Issue>` for a parent close and
    // `close_<Issue>` for a child one.
    const fresh = read.closeLane === null
      ? null
      : read.closeLane({ issueId: item.issueId, actionType: item.actionType, operationId, requestIdentity: recorded.requestIdentity });
    const state = isRecord(fresh) && ["ACTIVE", "ABSENT"].includes(fresh.state) ? fresh.state : "UNKNOWN";
    if (state === "UNKNOWN") {
      return stoppedFor(ROUND_LOOP_STOP_CODES.closeLaneOwnerUnproven, [
        `Issue ${item.issueId} records close-lane invocation ${recorded.requestIdentity ?? "without an identity"}, but this round cannot read that lane's owner.`,
        ...(isRecord(fresh) && Array.isArray(fresh.evidence) ? fresh.evidence : []),
        "An unproven close-lane owner is not a lane to materialize a second close in.",
      ]);
    }
    closeLaneStates[item.issueId] = {
      state,
      operationId,
      recordedInvocation: intents.length,
      nextInvocation: intents.length + 1,
      recorded: { requestIdentity: recorded.requestIdentity ?? null },
    };
  }

  const bound = boundRoundActions({
    lanes: laneItems.map((item) => {
      const action = laneAction(status, item.id);
      return {
        id: item.id,
        actionType: item.actionType,
        issueId: item.issueId,
        attempt: item.attempt ?? action?.attempt ?? null,
        consumesRepairWave: consumesRepairWave(action),
        repairCandidate: isText(action?.candidate) ? action.candidate : null,
      };
    }),
    maxParallel: status.run.maxParallel,
    activeIssueIds: status.frontier.active,
    accounting,
    closeLaneStates,
  });
  if (bound.refused.length > 0) {
    return stoppedFor(ROUND_LOOP_STOP_CODES.materialRepairBudgetUnavailable, [
      ...bound.refused.flatMap((item) => item.evidence),
      "The leaf contracts' existing material-work limit stands unchanged, so the round preserves the candidate and stops.",
    ], {
      refused: bound.refused,
      deferred: bound.deferred,
      lanes: bound.accepted.map((item) => Object.freeze({ id: item.id, actionType: item.actionType, issueId: item.issueId, decision: item.decision })),
    });
  }

  const observed = read.laneEvidence === null ? [] : observedLanesFor(read.laneEvidence, { runId: status.run.runId });
  const creationIntents = read.laneEvidence === null ? [] : creationIntentsFor(read.laneEvidence);
  const evidence = observed.length === 0
    ? []
    : [`This round read ${observed.length} recorded lane(s), so every reservation is read back before it is re-created.`];
  const lanes = [];
  const readBacks = [];
  const reservations = [];
  const closeIntents = [];
  // A lane this round must not materialize — an observed lane, a lane under the existing identity it
  // resumes, or a close lane whose recorded invocation is still owned — is reported as a read-back.
  const readBack = (item, decision, laneRef, evidence) => Object.freeze({
    id: item.id,
    actionType: item.actionType,
    issueId: item.issueId,
    laneRef,
    requestIdentity: item.requestIdentity ?? null,
    decision,
    evidence: Object.freeze([...evidence]),
  });
  for (const entry of bound.accepted) {
    const item = laneItems.find((candidate) => candidate.id === entry.id);
    if (entry.decision === "READ_BACK") {
      readBacks.push(readBack(item, "READ_BACK", item.id, entry.evidence));
      continue;
    }
    const collected = [];
    const envelope = dispatchNativeLane({
      materialization: item,
      runId: status.run.runId,
      attempt: item.attempt ?? entry.attempt ?? 1,
      observed,
      creationIntents,
      agentCeiling,
      at,
      append: (event) => {
        collected.push(event);
        return event;
      },
    });
    if (envelope.stop) {
      return stoppedFor(envelope.stop.code, [
        `Lane ${item.id} was refused by the lane runner before anything was materialized.`,
        ...envelope.stop.evidence,
      ]);
    }
    const recordedDispatch = read.journal.some((event) => (
      event?.type === "dispatch.recorded" && event.issueId === item.issueId
    ));
    if (envelope.decision === "CREATE" && recordedDispatch) {
      // A dispatch reservation this round could not read back must never become a second lane: the
      // recorded reservation is the owning source, and only evidence that attributes it resolves it.
      return stoppedFor(ROUND_LOOP_STOP_CODES.laneReservationUnread, [
        `Issue ${item.issueId} records a dispatch reservation, but this round read no lane evidence that attributes it.`,
        "A lost launch response is read back or repaired, never repeated.",
      ]);
    }
    reservations.push(...collected);
    if (envelope.launch === null) {
      readBacks.push(readBack(item, envelope.decision, envelope.laneRef, entry.evidence));
      continue;
    }
    const invocation = entry.closeInvocation ?? null;
    if (CLOSE_ACTIONS.includes(item.actionType)) {
      // The close lane's own invocation is recorded before the lane exists, through the delivery
      // progress owner, so a restart reads the invocation back instead of running a second close.
      closeIntents.push(Object.freeze({
        type: DELIVERY_PROGRESS_EVENT,
        at,
        issueId: item.issueId,
        operationId: closeLaneStates[item.issueId].operationId,
        stage: CLOSE_INTENT_STAGE,
        disposition: "INTENT_RECORDED",
        sourceAt: at,
        owner: "close-issue",
        evidenceIdentity: item.requestIdentity ?? null,
        requestIdentity: `${item.requestIdentity ?? item.id}#invocation-${invocation ?? 1}`,
        blockingPredicate: null,
      }));
    }
    lanes.push(Object.freeze({
      id: item.id,
      actionType: item.actionType,
      issueId: item.issueId,
      skill: item.skill,
      agent: item.agent,
      tools: Object.freeze([...item.tools]),
      worktreePolicy: item.worktreePolicy,
      attempt: envelope.attempt,
      decision: envelope.decision,
      laneRef: envelope.laneRef,
      reservationRule: envelope.reservationRule,
      closeInvocation: invocation,
      launch: envelope.launch,
      evidence: Object.freeze([...entry.evidence]),
    }));
  }

  const dispositionPlan = lanes.length > 0 || readBacks.length > 0 || waits.length > 0 || hostOperations.length > 0
    ? "DISPATCH"
    : hostPlan.disposition === "TERMINAL"
      ? "TERMINAL"
      : hostPlan.disposition === "BLOCKED"
        ? "BLOCKED"
        : status.frontier.active.length > 0 || status.nodes.some((node) => node.state === "CLOSING")
          ? "WAIT"
          : "IDLE";
  if (!ROUND_DISPOSITIONS.includes(dispositionPlan)) throw new TypeError(`Round disposition ${dispositionPlan} is outside the declared vocabulary`);
  return planFor({
    disposition: dispositionPlan,
    lanes: Object.freeze(lanes),
    readBacks: Object.freeze(readBacks),
    waits: Object.freeze(waits.map((item) => Object.freeze({ ...item }))),
    hostOperations: Object.freeze(hostOperations.map((item) => Object.freeze({ ...item }))),
    reservations: Object.freeze(reservations),
    closeIntents: Object.freeze(closeIntents),
    deferred: bound.deferred,
    evidence: Object.freeze([
      `Run ${status.run.runId} round at ${at} read ${read.journal.length} journal event(s) and re-derived the release frontier from this round's node facts: ${frontier.ready.length} ready, ${frontier.gated.length} gated, ${frontier.unproven.length} unproven.`,
      `The round materializes ${lanes.length} lane(s), reads back ${readBacks.length}, defers ${bound.deferred.length}, and passes through ${waits.length} bounded wait(s) with ${hostOperations.length} host operation(s).`,
      ...evidence,
    ]),
  });
}

// ---------------------------------------------------------------------------------------------
// AC-1 — the loop: every round re-reads, materializes within the limits, and journals
// ---------------------------------------------------------------------------------------------

const requirePort = (value, label) => {
  if (typeof value !== "function") throw new TypeError(`${label} must be a port`);
  return value;
};

// Runs rounds until the Run reaches a terminal state, stops, or asks its caller for fresh evidence.
// `readRound` is called once per round and is the only source of round state: the loop never carries a
// previous round's decisions forward, which is what makes a restart resume at the next legal action.
export async function runNativeRoundLoop({
  readRound,
  append,
  launch,
  wait = null,
  repositoryId = null,
  approvedPublicationIdentity = null,
  agentCeiling,
  now = () => new Date().toISOString(),
  maxRounds = 64,
} = {}) {
  const readPort = requirePort(readRound, "A round loop needs a fresh read port");
  const appendPort = requirePort(append, "A round loop needs the single journal writer");
  const launchPort = requirePort(launch, "A round loop needs a lane launch port");
  if (!Number.isInteger(maxRounds) || maxRounds < 1) throw new TypeError("A round loop needs a positive round bound");
  let lastRecorded = null;
  let lastRun = Object.freeze({ runId: null, specId: null, target: null });
  let lastFrontier = null;
  const rounds = [];
  let lastAccounting = null;
  for (let index = 0; index < maxRounds; index += 1) {
    const at = now();
    requireIsoInstant(at, "Round timestamp");
    const round = await readPort({ round: index + 1, at });
    // A round must rebuild from a journal that already contains everything the previous round wrote;
    // otherwise it would re-plan against its own earlier read and duplicate work the journal records.
    if (lastRecorded !== null) {
      const journal = Array.isArray(round?.journal) ? round.journal : null;
      const includes = journal !== null && journal.length >= lastRecorded.sequence
        && journal[lastRecorded.sequence - 1]?.type === lastRecorded.type;
      if (!includes) {
        return Object.freeze({
          schema: ROUND_LOOP_SCHEMA,
          outcome: "STALE_READ",
          ...lastRun,
          rounds: Object.freeze(rounds),
          frontier: lastFrontier,
          accounting: lastAccounting,
          stop: stop(ROUND_LOOP_STOP_CODES.staleRead, [
            `Round ${index + 1} read a journal that does not contain the ${lastRecorded.type} event recorded at sequence ${lastRecorded.sequence}.`,
            "A round is rebuilt from the journal plus fresh tracker and Git reads, so a stale journal cannot authorize another lane.",
          ]),
          evidence: Object.freeze([
            `The loop recorded ${lastRecorded.type} at sequence ${lastRecorded.sequence} and the next round's read does not carry it.`,
          ]),
        });
      }
    }
    const plan = planNativeRound({ round, at, agentCeiling, repositoryId, approvedPublicationIdentity });
    lastAccounting = plan.accounting;
    lastFrontier = plan.frontier;
    lastRun = Object.freeze({ runId: plan.runId, specId: plan.specId, target: plan.target });
    const applied = [];
    const recorded = (stored) => {
      if (!Number.isInteger(stored?.sequence)) {
        throw new TypeError("A round loop needs the recorded journal event its writer returned");
      }
      lastRecorded = { type: stored.type, sequence: stored.sequence };
      return stored;
    };
    for (const event of plan.reservations) applied.push(recorded(appendPort(event)));
    for (const event of plan.closeIntents) {
      // The delivery-progress owner appends idempotently: a re-entry that derives the same close-lane
      // invocation reads the recorded event back instead of writing a second one.
      applied.push(recorded(appendDeliveryProgress({ writer: { append: appendPort }, journal: round.journal, event })));
    }
    const waited = [];
    for (const item of plan.waits) {
      const outcome = wait === null ? Object.freeze({ settled: false, reason: "no wait port was given" }) : await wait({ wait: item, plan, at });
      waited.push(Object.freeze({ id: item.id, actionType: item.actionType, issueId: item.issueId, outcome }));
    }
    const launched = [];
    const roundEntry = () => Object.freeze({
      round: index + 1,
      at,
      disposition: plan.disposition,
      legalActions: plan.legalActions,
      lanes: plan.lanes.map((item) => item.id),
      readBacks: plan.readBacks.map((item) => item.id),
      deferred: plan.deferred.map((item) => ({ id: item.id, reason: item.reason })),
      applied,
      waited,
      launched,
    });
    for (const lane of plan.lanes) {
      try {
        const outcome = await launchPort({ lane, plan, at });
        launched.push(Object.freeze({ id: lane.id, laneRef: lane.laneRef, actionType: lane.actionType, issueId: lane.issueId, outcome: outcome ?? null }));
      } catch (error) {
        rounds.push(roundEntry());
        return Object.freeze({
          schema: ROUND_LOOP_SCHEMA,
          outcome: "INTERRUPTED",
          ...lastRun,
          failed: Object.freeze({ id: lane.id, laneRef: lane.laneRef, issueId: lane.issueId, message: error instanceof Error ? error.message : String(error) }),
          rounds: Object.freeze(rounds),
          frontier: plan.frontier,
          accounting: lastAccounting,
          stop: null,
          evidence: Object.freeze([
            `Lane ${lane.id} for Issue ${lane.issueId} did not materialize; the round's journal writes stay recorded, so the restart reads the lane back instead of creating a second one.`,
          ]),
        });
      }
    }
    const progressed = applied.length > 0 || launched.length > 0 || waited.some((item) => item.outcome?.settled === true);
    rounds.push(roundEntry());
    const result = (outcome, fields) => Object.freeze({
      schema: ROUND_LOOP_SCHEMA,
      outcome,
      runId: plan.runId,
      specId: plan.specId,
      target: plan.target,
      rounds: Object.freeze(rounds),
      frontier: plan.frontier,
      accounting: plan.accounting,
      stop: fields.stop ?? null,
      evidence: Object.freeze([...(plan.evidence ?? []), ...(fields.evidence ?? [])]),
    });
    if (plan.stop) return result("STOP", { stop: plan.stop, evidence: plan.stop.evidence });
    if (plan.disposition === "TERMINAL") return result("TERMINAL", { evidence: ["The Run reached a terminal state."] });
    // A blocked Run the host planner reports as a stop is not re-planned: the loop reports the exact
    // stop and materializes nothing.
    if (plan.disposition === "BLOCKED") {
      return result("STOP", {
        stop: stop(ROUND_LOOP_STOP_CODES.hostPlanStopped, ["The Run is blocked with no legal action and no owner-produced stop."]),
      });
    }
    // A round that changed nothing cannot make progress on its own: the next legal action depends on
    // evidence this loop does not own, so it yields to its caller instead of spinning.
    if (!progressed) {
      return result("WAITING", {
        evidence: ["This round had no legal action and nothing to read back, so the loop yields until an owning source changes."],
      });
    }
  }
  return Object.freeze({
    schema: ROUND_LOOP_SCHEMA,
    outcome: "ROUND_LIMIT",
    ...lastRun,
    rounds: Object.freeze(rounds),
    frontier: lastFrontier,
    accounting: lastAccounting,
    stop: null,
    evidence: Object.freeze([`The loop reached its ${maxRounds}-round bound without a terminal state.`]),
  });
}
