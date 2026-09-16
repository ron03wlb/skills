// Trusted bundle-local dynamic controller for the Delivery workflow host.
//
// This is transport, not authority. It reads one reconciled round from the workflow's runtime task,
// asks the domain half (`scripts/pi-workflow-host.mjs`, reached through the bundle-local authority
// entry) what the Domain action reducer authorizes, and materializes exactly that as official workflow
// tasks. It never invents, reorders, or reclassifies an action, and it fails closed — returning a
// blocked control with no generated work — whenever the domain half refuses the round.
import {
  HOST_STOP_CODES,
  assertReissueOrder,
  convergeBlockedRun,
  planHostRound,
  recordHostRunSupersession,
} from "../../../scripts/pi-workflow-host.mjs";
import { parseRoundInput } from "./round-input.mjs";

const WAIT_OPERATIONS = new Set(["wait_repository_close_lease", "wait_target_writer"]);
const HOST_OPERATION_LIMIT_MS = 30_000;

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

const boundedWait = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms)); });

export default async function controller(ctx) {
  const input = parseRoundInput(ctx.task);
  ctx.log("delivery host round", { runId: input.facts.run.runId, specId: input.facts.run.specId });
  const round = planHostRound({ facts: input.facts });

  let convergence = null;
  if (input.blockedHostRun !== null) {
    convergence = convergeBlockedRun({
      facts: input.facts,
      hostRun: input.blockedHostRun,
      at: input.at ?? new Date().toISOString(),
    });
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
      // recorded attempts can never be dispatched twice.
      if (input.gitCommonDir === null) {
        return blockedControl({
          input,
          code: "supersession_journal_unavailable",
          evidence: ["A superseding host run needs the authority journal common directory."],
        });
      }
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
          supersededHostRunId: convergence.supersession.supersededRunId,
          supersessionSequence: recorded.sequence,
          generatedTaskIds: [],
        },
        analysis: `Host run ${convergence.supersession.supersededRunId} is superseded by ${input.facts.run.runId} with a journaled supersession link; no recorded operation is re-dispatched.`,
        refs: [],
      };
    }
  }

  if (round.stop && (!convergence || convergence.decision !== "CONTINUE_SAME_RUN")) {
    return blockedControl({ input, code: round.stop.code, evidence: round.stop.evidence });
  }
  const recorded = input.recorded;
  const replayStop = assertReissueOrder(round, recorded);
  if (replayStop) return blockedControl({ input, code: replayStop.code, evidence: replayStop.evidence });

  const generated = [];
  for (const item of round.materializations) {
    if (item.kind === "agent") {
      const settled = await ctx.agent({
        id: item.id,
        agent: item.agent,
        tools: item.tools,
        prompt: item.prompt,
      });
      generated.push({ id: item.id, actionType: item.actionType, issueId: item.issueId, settled: typeof settled === "object" });
      continue;
    }
    if (WAIT_OPERATIONS.has(item.operation)) {
      // A domain close wait is a host-side bounded observation: it consumes no generated agent and no
      // concurrency slot, and its settlement is read back from the owning sources on the next round.
      await boundedWait(HOST_OPERATION_LIMIT_MS);
      generated.push({ id: item.id, actionType: item.actionType, issueId: item.issueId, waited: true });
      continue;
    }
    // Any other host-side settlement belongs to a later acceptance stage. Refusing it visibly is
    // fail-closed; silently skipping it would let the reducer's round look settled when it is not.
    return blockedControl({
      input,
      code: HOST_STOP_CODES.unsupportedAction,
      evidence: [`Host operation ${item.operation} has no acceptance step in this bundle revision.`],
    });
  }

  return {
    control: {
      status: round.disposition === "DISPATCH" ? "dispatched" : round.disposition.toLowerCase(),
      decision: convergence?.decision ?? "PLAN",
      runId: round.runId,
      specId: round.specId,
      target: round.target,
      controlRevision: round.controlRevision,
      authorizedActions: round.authorizedActions,
      generatedTaskIds: generated.map((item) => item.id),
      generated,
    },
    analysis: `Reduced Run ${round.runId} to ${round.materializations.length} materialization(s) in disposition ${round.disposition}: ${round.authorizedActions.join(", ") || "none"}.`,
    refs: [],
  };
}
