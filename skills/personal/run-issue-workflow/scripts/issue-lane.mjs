// Domain half of the Issue lane.
//
// One executable Issue owns exactly one isolated worker and one dedicated Issue worktree. This module
// decides, from observed lane evidence and the authority journal, whether that lane must be created,
// reused, replaced, simply observed, or refused — and it refuses a lane that would duplicate, that
// cannot prove its liveness, that would be replaced without a supersession link, or whose tools or
// prompt would widen the authority the agent was declared with.
//
// Scheduling evidence (task attempts, worker artifacts, creation intents) is owned by the delivery
// host run record; the supersession link is an authority fact and stays in the bundle-local journal.
// It imports the bundle-local authority entry only and decides no scope.
import { requireIsoInstant } from "./delivery-authority.mjs";

export const LANE_DECISION_SCHEMA = "pi-workflow-issue-lane-decision:v1";
export const LANE_STATES = Object.freeze(["ABSENT", "RESUMABLE", "ACTIVE", "INACTIVE", "UNKNOWN"]);
// The one lane per Issue is one managed worktree per generated worker task, never the shared checkout.
// The value is the host's own declared policy, so the spec default and this constant cannot drift.
export const LANE_WORKTREE_POLICY = "on";
export const LANE_HOST_ID = "pi-subagents";
// The one implementation agent every Issue lane uses, and the authoritative tool ceiling the bundle
// spec declares. A lane selects a subset of this ceiling and never widens it.
export const LANE_AGENT_NAME = "worker";
export const LANE_TOOL_CEILING = Object.freeze([
  "read",
  "grep",
  "find",
  "ls",
  "bash",
  "edit",
  "write",
]);
export const LANE_STOP_CODES = Object.freeze({
  ambiguousLane: "issue_lane_ambiguous",
  attemptAhead: "lane_attempt_ahead",
  livenessUnknown: "lane_liveness_unknown",
  creationIntentUnresolved: "creation_intent_unresolved",
  replacementWithoutEvidence: "lane_replacement_without_inactive_evidence",
  replacementNotDistinct: "lane_replacement_not_distinct",
  replacementWithoutPriorAttempt: "lane_replacement_without_prior_attempt",
  attemptUnaligned: "lane_attempt_unaligned",
  toolOutsideCeiling: "lane_tool_outside_declared_ceiling",
  toolOutsideAgent: "lane_tool_outside_agent_ceiling",
  promptMissingSkill: "lane_prompt_missing_skill",
  promptWidensAuthority: "lane_prompt_widens_authority",
  agentUnresolved: "lane_agent_unresolved",
});

// The contract skills a lane may invoke. A worker follows exactly its own skill: an implementation
// lane never closes, and a close lane never implements. Scope, grant and close authority stay with the
// caller that dispatched the lane.
export const LANE_SKILL_SCOPE = Object.freeze({
  "execute-issue": Object.freeze(["close-issue", "to-spec", "to-tickets", "verify-target-before-push", "attest-target-contribution", "pre-execute-issue"]),
  "close-issue": Object.freeze(["execute-issue", "to-spec", "to-tickets", "verify-target-before-push", "attest-target-contribution", "pre-execute-issue"]),
});

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;

const stop = (code, evidence) => Object.freeze({ code, evidence: [...evidence] });
// Validate the instant, then keep the canonical string: the journal stores the string.
const instant = (value) => {
  requireIsoInstant(value, "Lane supersession timestamp");
  return value;
};
const laneStop = (code, evidence) => Object.freeze({ decision: "STOP", laneRef: null, supersession: null, stop: stop(code, evidence) });

// One worker task ref, shaped exactly like the authority journal's task reference so a replacement can
// carry its supersession link through the existing retry contract.
export const laneTaskRef = (taskId) => ({ threadId: taskId, hostId: LANE_HOST_ID });

const laneRefKey = (ref) => (isRecord(ref) ? `${ref.hostId ?? ""}\0${ref.threadId ?? ""}` : "");

const observedLane = (entry, index) => {
  if (!isRecord(entry)) throw new TypeError(`Observed lane ${index} must be an object`);
  if (!isText(entry.issueId) || !isText(entry.runId)) throw new TypeError(`Observed lane ${index} must bind its Issue and Run`);
  if (!isText(entry.laneRef)) throw new TypeError(`Observed lane ${index} must name its lane`);
  if (!LANE_STATES.includes(entry.state)) throw new TypeError(`Observed lane ${index} has an unsupported state`);
  if (entry.attempt !== undefined && (!Number.isInteger(entry.attempt) || entry.attempt < 1)) {
    throw new TypeError(`Observed lane ${index} has a malformed attempt`);
  }
  if (entry.inactiveEvidence !== undefined && (!Array.isArray(entry.inactiveEvidence)
    || entry.inactiveEvidence.length === 0 || !entry.inactiveEvidence.every(isText))) {
    throw new TypeError(`Observed lane ${index} must prove its inactivity exactly`);
  }
  return {
    laneRef: entry.laneRef,
    issueId: entry.issueId,
    runId: entry.runId,
    attempt: entry.attempt ?? 0,
    state: entry.state,
    inactiveEvidence: entry.inactiveEvidence ?? null,
  };
};

// Decides the one legal lane action for one dispatch attempt.
export function planIssueLane({ runId, issueId, attempt, observed = [], creationIntent = null, nextLaneRef, at } = {}) {
  for (const [name, value] of [["runId", runId], ["issueId", issueId]]) {
    if (!isText(value)) throw new TypeError(`Issue lane planning requires ${name}`);
  }
  if (!Number.isInteger(attempt) || attempt < 1) throw new TypeError("Issue lane planning requires a positive attempt");
  if (!Array.isArray(observed)) throw new TypeError("Observed lanes must be an array");
  const lanes = observed.map(observedLane).filter((lane) => lane.runId === runId && lane.issueId === issueId);
  const base = { schema: LANE_DECISION_SCHEMA, runId, issueId, attempt, worktreePolicy: LANE_WORKTREE_POLICY };

  if (lanes.length > 1) {
    return Object.freeze({
      ...base,
      // One Issue owns one lane: two observed lanes are an ambiguity a human resolves, never a choice.
      ...laneStop(LANE_STOP_CODES.ambiguousLane, lanes.map((lane) => `${lane.laneRef} is an observed lane for Issue ${issueId}`)),
    });
  }
  if (lanes.length === 0) {
    if (creationIntent !== null) {
      const intent = isRecord(creationIntent) ? creationIntent : null;
      if (intent === null || intent.state !== "RESOLVED") {
        // A reserved creation whose response was lost must be read back, never re-created.
        return Object.freeze({
          ...base,
          ...laneStop(LANE_STOP_CODES.creationIntentUnresolved, [
            `A creation intent for Issue ${issueId} attempt ${attempt} is reserved without a proven lane.`,
          ]),
        });
      }
      if (isText(intent.laneRef)) {
        return Object.freeze({ ...base, decision: "REUSE", laneRef: intent.laneRef, supersession: null, stop: null });
      }
    }
    return Object.freeze({ ...base, decision: "CREATE", laneRef: null, supersession: null, stop: null });
  }

  const [lane] = lanes;
  if (lane.attempt > attempt) {
    return Object.freeze({
      ...base,
      ...laneStop(LANE_STOP_CODES.attemptAhead, [
        `Lane ${lane.laneRef} already owns attempt ${lane.attempt} ahead of planned attempt ${attempt}.`,
      ]),
    });
  }
  if (lane.state === "ACTIVE") {
    // An active lane is observed, never re-dispatched and never replaced.
    return Object.freeze({ ...base, decision: "OBSERVE", laneRef: lane.laneRef, supersession: null, stop: null });
  }
  if (lane.state === "RESUMABLE") {
    if (lane.attempt === attempt) {
      // The same recorded request is re-issued; the host's recorded request hash is the reservation.
      return Object.freeze({ ...base, decision: "REUSE", laneRef: lane.laneRef, retry: null, dispatch: null, supersession: null, stop: null });
    }
    if (lane.attempt === attempt - 1) {
      // A transient retry reuses the same reachable lane: the new attempt is accounted in the authority
      // journal with `replacement: null`, and the host run resumes that recorded lane instead of
      // creating a second worker for the same Issue.
      const priorTaskRef = laneTaskRef(lane.laneRef);
      return Object.freeze({
        ...base,
        decision: "RESUME",
        laneRef: lane.laneRef,
        retry: Object.freeze({
          type: "retry.recorded",
          at: instant(at),
          issueId,
          attempt: lane.attempt,
          reason: "transient_task_failure",
          priorTaskRef,
          replacement: null,
        }),
        dispatch: Object.freeze({
          type: "dispatch.recorded",
          at: instant(at),
          issueId,
          attempt,
          taskRef: priorTaskRef,
        }),
        supersession: null,
        stop: null,
      });
    }
    return Object.freeze({
      ...base,
      ...laneStop(LANE_STOP_CODES.attemptUnaligned, [
        lane.attempt === 0
          ? `Lane ${lane.laneRef} reports no attempt, so its retry reuse cannot be accounted.`
          : `Lane ${lane.laneRef} at attempt ${lane.attempt} cannot account planned attempt ${attempt}.`,
      ]),
    });
  }
  if (lane.state === "INACTIVE") {
    if (lane.inactiveEvidence === null) {
      return Object.freeze({
        ...base,
        ...laneStop(LANE_STOP_CODES.replacementWithoutEvidence, [
          `Lane ${lane.laneRef} is inactive without exact inactive evidence.`,
        ]),
      });
    }
    // The replacement ref is the exact lane the host will materialize, so the journal's authorized
    // taskRef and the created lane can never differ.
    const priorAttempt = lane.attempt >= 1 ? lane.attempt : attempt - 1;
    if (priorAttempt < 1) {
      return Object.freeze({
        ...base,
        ...laneStop(LANE_STOP_CODES.replacementWithoutPriorAttempt, [
          `Lane ${lane.laneRef} proves neither a prior attempt nor one to supersede.`,
        ]),
      });
    }
    const nextTaskRef = laneTaskRef(isText(nextLaneRef) ? nextLaneRef : `${issueId}-attempt-${attempt}`);
    if (nextTaskRef.threadId === lane.laneRef) {
      // A replacement that reuses the inactive lane's own identity is not a replacement.
      return Object.freeze({
        ...base,
        ...laneStop(LANE_STOP_CODES.replacementNotDistinct, [
          `Replacement lane ${nextTaskRef.threadId} reuses the inactive lane ${lane.laneRef}.`,
        ]),
      });
    }
    return Object.freeze({
      ...base,
      decision: "REPLACE",
      laneRef: lane.laneRef,
      // The replacement's supersession link is the authority fact the journal keeps.
      supersession: Object.freeze({
        type: "retry.recorded",
        at: instant(at),
        issueId,
        attempt: priorAttempt,
        reason: "prior_lane_inactive",
        priorTaskRef: laneTaskRef(lane.laneRef),
        replacement: Object.freeze({
          supersedesAttempt: priorAttempt,
          nextTaskRef,
          inactiveEvidence: [...lane.inactiveEvidence],
        }),
      }),
      stop: null,
    });
  }
  if (lane.state === "UNKNOWN") {
    return Object.freeze({
      ...base,
      ...laneStop(LANE_STOP_CODES.livenessUnknown, [
        `Lane ${lane.laneRef} liveness is UNKNOWN; an unknown owner is not an inactive owner.`,
      ]),
    });
  }
  return Object.freeze({ ...base, decision: "CREATE", laneRef: null, supersession: null, stop: null });
}

// A lane's tools are always a subset of the ceiling the bundle declares and of the ceiling the agent
// itself was declared with. A lane can never widen either.
export function assertLaneTools({ tools, agentCeiling } = {}) {
  if (!Array.isArray(tools) || tools.length === 0 || !tools.every(isText)) {
    throw new TypeError("Lane tools must be one non-empty string list");
  }
  if (!Array.isArray(agentCeiling) || !agentCeiling.every(isText)) {
    throw new TypeError("The agent ceiling must be one string list");
  }
  const outsideDeclared = tools.filter((tool) => !LANE_TOOL_CEILING.includes(tool));
  if (outsideDeclared.length > 0) {
    return stop(LANE_STOP_CODES.toolOutsideCeiling, outsideDeclared.map((tool) => `${tool} is outside the declared tool ceiling`));
  }
  const outsideAgent = tools.filter((tool) => !agentCeiling.includes(tool));
  if (outsideAgent.length > 0) {
    return stop(LANE_STOP_CODES.toolOutsideAgent, outsideAgent.map((tool) => `${tool} is outside the agent-declared ceiling`));
  }
  return null;
}

// A lane prompt names exactly its own contract skill and never another contract skill's command, so no
// worker can grant itself scope, a Grant, or close authority by re-reading a wider skill.
export function assertLanePromptScope({ prompt, skill } = {}) {
  if (!isText(prompt)) throw new TypeError("A lane prompt must be text");
  if (!isText(skill) || !LANE_SKILL_SCOPE[skill]) throw new TypeError(`Unsupported lane skill ${String(skill)}`);
  const invoked = [...prompt.matchAll(/\$([a-z][a-z0-9-]*)/gu)].map((match) => match[1]);
  if (!invoked.includes(skill)) {
    return stop(LANE_STOP_CODES.promptMissingSkill, [`The lane prompt does not invoke $${skill}.`]);
  }
  const widened = invoked.filter((name) => LANE_SKILL_SCOPE[skill].includes(name));
  if (widened.length > 0) {
    return stop(LANE_STOP_CODES.promptWidensAuthority, widened.map((name) => `The lane prompt also invokes $${name}`));
  }
  return null;
}
