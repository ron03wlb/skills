// Trusted bundle-local dynamic controller for the Delivery workflow host.
//
// This is transport, not authority. It reads one reconciled round from the workflow's runtime task,
// asks the domain halves (`scripts/pi-workflow-host.mjs` and `scripts/issue-lane.mjs`, reached through
// the bundle-local authority entry) what the Domain action reducer authorizes and what the Issue lane
// may do, and materializes exactly that as official workflow tasks and domain-owned host steps. It
// never invents, reorders, or reclassifies an action, and it fails closed — returning a blocked control
// with no generated work — whenever a domain owner refuses the round.
import {
  assertReissueOrder,
  convergeBlockedRun,
  hostControlSettlement,
  planHostRound,
  recordHostAuthorityEvent,
  recordHostRunSupersession,
} from "../../../scripts/pi-workflow-host.mjs";
import {
  assertLanePromptScope,
  assertLaneTools,
  laneTaskRef,
  planIssueLane,
} from "../../../scripts/issue-lane.mjs";
import { resolveLaneAgent } from "./lane-agent.mjs";
import { parseRoundInput } from "./round-input.mjs";

// The canonical worker definition ships inside this skill package; a delivery repository or user agent
// root must provide it where pi-workflow resolves generated agent names.
const CANONICAL_AGENT_SOURCE = new URL("../../../agents/worker.md", import.meta.url).pathname;

const EXECUTION_LANES = new Set(["execute-issue"]);
const boundedWait = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms)); });

const blockedControl = ({ input, code, evidence, decision = "STOP" }) => ({
  control: {
    status: "blocked",
    decision,
    stopCode: code,
    runId: input.facts.run.runId,
    specId: input.facts.run.specId,
    target: input.facts.run.target,
    evidence: [...evidence],
    generatedTaskIds: [],
  },
  analysis: `Delivery host round stopped with ${code} before dispatching any worker.`,
  refs: [],
});

const blockedIfJournalUnavailable = (input, code, evidence) => (
  input.gitCommonDir === null ? blockedControl({ input, code, evidence }) : null
);

export default async function controller(ctx) {
  const input = parseRoundInput(ctx.task);
  ctx.log("delivery host round", { runId: input.facts.run.runId, specId: input.facts.run.specId });
  const round = planHostRound({ facts: input.facts });
  const at = input.at ?? new Date().toISOString();

  let convergence = null;
  if (input.blockedHostRun !== null) {
    convergence = convergeBlockedRun({ facts: input.facts, hostRun: input.blockedHostRun, at });
    ctx.log("blocked host run convergence", {
      hostRunId: convergence.hostRunId,
      decision: convergence.decision,
      reason: convergence.reason,
    });
    if (convergence.decision === "STOP") {
      return blockedControl({ input, code: convergence.reason, evidence: convergence.evidence });
    }
    if (convergence.decision === "NEW_RUN") {
      // The superseding host run is journaled before it dispatches anything, so the blocked run's
      // recorded attempts can never be dispatched twice. The control projection carries only the
      // journal locator; the authority journal owns the superseded host run identity.
      const blocked = blockedIfJournalUnavailable(input, "supersession_journal_unavailable", [
        "A superseding host run needs the authority journal common directory.",
      ]);
      if (blocked) return blocked;
      const recorded = recordHostRunSupersession({
        gitCommonDir: input.gitCommonDir,
        runId: input.facts.run.runId,
        event: convergence.journalEvent,
      });
      return {
        control: {
          status: "superseded",
          decision: "NEW_RUN",
          reason: convergence.reason,
          runId: input.facts.run.runId,
          specId: input.facts.run.specId,
          target: input.facts.run.target,
          supersessionSequence: recorded.sequence,
          generatedTaskIds: [],
        },
        analysis: `Host run ${convergence.supersession.supersededHostRunId} is superseded by ${input.facts.run.runId} with a journaled supersession link; no recorded operation is re-dispatched.`,
        refs: [],
      };
    }
  }

  if (round.stop && convergence?.decision !== "CONTINUE_SAME_RUN") {
    return blockedControl({ input, code: round.stop.code, evidence: round.stop.evidence });
  }
  // A blocked Run the domain has just decided to continue is not a stop: this round simply has no
  // legal action of its own, and the entry resumes the same host run.
  const disposition = convergence?.decision === "CONTINUE_SAME_RUN" && round.disposition === "BLOCKED"
    ? "IDLE"
    : round.disposition;
  // The re-issue proof only governs a round that actually materializes something: an idle or blocked
  // round dispatches nothing, so there is no duplicate to refuse.
  const replayStop = round.materializations.length > 0 ? assertReissueOrder(round, input.recorded) : null;
  if (replayStop) return blockedControl({ input, code: replayStop.code, evidence: replayStop.evidence });

  const laneAgent = round.materializations.some((item) => item.kind === "agent")
    ? resolveLaneAgent({
      cwd: input.cwd ?? process.cwd(),
      homeDir: input.homeDir,
      canonicalSource: CANONICAL_AGENT_SOURCE,
    })
    : null;
  if (laneAgent !== null && laneAgent.stop !== null) {
    return blockedControl({ input, code: laneAgent.stop.code, evidence: laneAgent.stop.evidence });
  }

  const generated = [];
  const observed = [];
  const pending = [];
  let batch = [];
  const enqueue = (item, extra = {}) => {
    batch.push({ ...item, ...extra });
  };
  const flush = async () => {
    if (batch.length === 0) return;
    const queued = batch;
    batch = [];
    // Generated lanes are issued through `ctx.parallel` so the declared host concurrency is what
    // actually bounds them, while the runtime records every sibling generation in plan order.
    const settled = await ctx.parallel(queued.map((entry) => () => ctx.agent({
      id: entry.id,
      agent: entry.agent,
      tools: entry.tools,
      prompt: entry.prompt,
    })));
    for (const [index, entry] of queued.entries()) {
      generated.push({
        id: entry.id,
        actionType: entry.actionType,
        issueId: entry.issueId,
        laneDecision: entry.laneDecision ?? null,
        settled: typeof settled?.[index] === "object",
      });
    }
  };

  for (const item of round.materializations) {
    if (item.kind !== "agent") {
      await flush();
      if (item.execution === "wait") {
        // A domain close wait is a host-side bounded observation that consumes no generated agent and
        // no concurrency slot. Its duration, its owner and its pre-wait evidence are the reducer's,
        // never the host's; the run log attributes the observation to that exact lease owner.
        ctx.log("delivery close wait", {
          operation: item.operation,
          owner: item.owner,
          timeoutMs: item.timeoutMs,
          preWaitEvidence: item.preWaitEvidence,
        });
        await boundedWait(item.timeoutMs);
        generated.push({ id: item.id, actionType: item.actionType, issueId: item.issueId, waited: true, timeoutMs: item.timeoutMs });
        continue;
      }
      if (item.execution === "settle") {
        const settlement = hostControlSettlement({ type: item.actionType, revision: item.revision }, input.facts.journal, at);
        if (settlement.stop) return blockedControl({ input, code: settlement.stop.code, evidence: settlement.stop.evidence });
        if (settlement.event === null) {
          generated.push({ id: item.id, actionType: item.actionType, settledRevision: settlement.revision });
            continue;
        }
        const blocked = blockedIfJournalUnavailable(input, "control_settlement_journal_unavailable", [
          "A cooperative control settlement needs the authority journal common directory.",
        ]);
        if (blocked) return blocked;
        const recorded = recordHostAuthorityEvent({
          gitCommonDir: input.gitCommonDir,
          runId: input.facts.run.runId,
          event: settlement.event,
        });
        generated.push({ id: item.id, actionType: item.actionType, settledRevision: settlement.revision, sequence: recorded.sequence });
        continue;
      }
      // The bundle cannot perform this host step itself, so it hands the exact reducer operation back
      // to the single reconciliation entry instead of skipping it or inventing an adapter for it.
      pending.push({ id: item.id, actionType: item.actionType, operation: item.operation, issueId: item.issueId });
      continue;
    }

    // One Issue, one lane. The decision is the lane module's, never this controller's.
    const creationIntent = input.lanes.creationIntents.find((intent) => (
      intent?.runId === input.facts.run.runId && intent?.issueId === item.issueId
    )) ?? null;
    const lane = planIssueLane({
      runId: input.facts.run.runId,
      issueId: item.issueId,
      attempt: item.attempt ?? 1,
      observed: input.lanes.observed,
      creationIntent,
      nextLaneRef: item.id,
      at,
    });
    if (lane.stop !== null) {
      return blockedControl({ input, code: lane.stop.code, evidence: lane.stop.evidence });
    }
    if (lane.decision === "OBSERVE") {
      observed.push({ id: item.id, issueId: item.issueId, laneRef: lane.laneRef });
      continue;
    }
    if (lane.decision === "REPLACE") {
      // The replacement's supersession link is written to the authority journal before the replacement
      // lane exists, so no replacement is ever unproven.
      const blocked = blockedIfJournalUnavailable(input, "lane_supersession_journal_unavailable", [
        "A replacement lane needs the authority journal common directory.",
      ]);
      if (blocked) return blocked;
      recordHostAuthorityEvent({ gitCommonDir: input.gitCommonDir, runId: input.facts.run.runId, event: lane.supersession });
    }
    const toolsStop = assertLaneTools({ tools: item.tools, agentCeiling: laneAgent.ceiling });
    if (toolsStop !== null) return blockedControl({ input, code: toolsStop.code, evidence: toolsStop.evidence });
    const promptStop = assertLanePromptScope({ prompt: item.prompt, skill: item.skill });
    if (promptStop !== null) return blockedControl({ input, code: promptStop.code, evidence: promptStop.evidence });
    const attempt = item.attempt ?? 1;
    const recordedBefore = input.facts.journal.some((event) => (
      event?.type === "dispatch.recorded" && event.issueId === item.issueId && event.attempt === attempt
    ));
    if (!recordedBefore) {
      // A brand-new lane reserves its creation intent in the authority journal before native
      // delivery, so a lost response can never become a second lane and no attempt goes uncounted.
      const blocked = blockedIfJournalUnavailable(input, "lane_dispatch_journal_unavailable", [
        "A new Issue lane needs the authority journal common directory.",
      ]);
      if (blocked) return blocked;
      const recorded = recordHostAuthorityEvent({
        gitCommonDir: input.gitCommonDir,
        runId: input.facts.run.runId,
        event: { type: "dispatch.recorded", at, issueId: item.issueId, attempt, taskRef: laneTaskRef(item.id) },
      });
      ctx.log("issue lane reserved", { issueId: item.issueId, attempt, laneRef: item.id, sequence: recorded.sequence });
    }
    enqueue(item, { laneDecision: lane.decision });
  }
  await flush();

  return {
    control: {
      status: pending.length > 0 ? "awaiting_entry" : disposition === "DISPATCH" ? "dispatched" : disposition.toLowerCase(),
      decision: convergence?.decision ?? "PLAN",
      runId: round.runId,
      specId: round.specId,
      target: round.target,
      controlRevision: round.controlRevision,
      authorizedActions: round.authorizedActions,
      laneAgent: laneAgent === null ? null : { name: laneAgent.name, scope: laneAgent.scope, ceiling: [...laneAgent.ceiling] },
      generatedTaskIds: generated.map((item) => item.id),
      generated,
      observedLanes: observed,
      pendingOperations: pending,
    },
    analysis: `Reduced Run ${round.runId} to ${round.materializations.length} materialization(s) in disposition ${disposition}: ${round.authorizedActions.join(", ") || "none"}.`,
    refs: [],
  };
}
