// Trusted bundle-local dynamic controller for the Delivery workflow host.
//
// This is transport, not authority. It reads one reconciled round from the workflow's runtime task,
// asks the domain half (`scripts/pi-workflow-host.mjs`, reached through the bundle-local authority
// entry) what the Domain action reducer authorizes, and materializes exactly that as official workflow
// tasks and domain-owned host steps. It never invents, reorders, or reclassifies an action, and it fails
// closed — returning a blocked control with no generated work — whenever the domain half refuses the
// round.
import {
  assertReissueOrder,
  convergeBlockedRun,
  hostControlSettlement,
  planHostRound,
  recordHostAuthorityEvent,
  recordHostRunSupersession,
} from "../../../scripts/pi-workflow-host.mjs";
import { parseRoundInput } from "./round-input.mjs";

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

// Returns a blocked control only when the authority journal is unreachable; otherwise null.
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

  const generated = [];
  const pending = [];
  // One reducer round may authorize up to `max_parallel` dispatches. They are generated through
  // `ctx.parallel` so the declared host concurrency is what actually bounds them, while the runtime
  // still records every sibling generation in plan order before the controller suspends.
  let batch = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const queued = batch;
    batch = [];
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
        settled: typeof settled?.[index] === "object",
      });
    }
  };
  for (const item of round.materializations) {
    if (item.kind === "agent") {
      batch.push(item);
      continue;
    }
    await flush();
    if (item.execution === "wait") {
      // A domain close wait is a host-side bounded observation that consumes no generated agent and no
      // concurrency slot. Its duration, its owner and its pre-wait evidence are the reducer's, never the
      // host's; the run log attributes the observation to that exact lease owner.
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
    // The bundle cannot perform this host step itself, so it hands the exact reducer operation back to
    // the single reconciliation entry instead of skipping it or inventing an adapter for it.
    pending.push({ id: item.id, actionType: item.actionType, operation: item.operation, issueId: item.issueId });
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
      generatedTaskIds: generated.map((item) => item.id),
      generated,
      pendingOperations: pending,
    },
    analysis: `Reduced Run ${round.runId} to ${round.materializations.length} materialization(s) in disposition ${disposition}: ${round.authorizedActions.join(", ") || "none"}.`,
    refs: [],
  };
}
