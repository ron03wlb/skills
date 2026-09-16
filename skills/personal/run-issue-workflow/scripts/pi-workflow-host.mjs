// Domain half of the Delivery workflow host.
//
// The pi-workflow bundle is a thin host: it may not decide scope, grants, budgets, retries, repair
// routing, close eligibility, or stop classification. It materializes exactly the actions the Domain
// action reducer returns. Everything about that mapping that is a domain decision lives here:
//
//   * the deterministic identity and payload of one materialized operation, so a resumed host run
//     re-issues a recorded operation instead of dispatching a second one;
//   * the fail-closed checks that refuse a contradictory, unavailable, duplicate, or unaccounted
//     action set instead of dispatching it;
//   * the re-issue order proof a controller must satisfy before it may materialize anything new;
//   * the blocked-run convergence decision that reads a blocked or failed host run back and decides
//     same-host-run continuation or a journaled superseding host run.
//
// This module imports the bundle-local authority entry only; it never imports an owner module and it
// re-implements no authority. `reduceRun` stays the single producer of legal actions, and this module
// treats its output as an input it may refuse but never amend.
import { createHash } from "node:crypto";
import {
  RUN_SUPERSEDED_EVENT,
  RUN_SUPERSEDED_REASONS,
  STATUS_SCHEMA,
  reduceRun,
  requireIsoInstant,
} from "./delivery-authority.mjs";
import { createRunStore } from "./run-store.mjs";

export const HOST_PLAN_SCHEMA = "pi-workflow-host-plan:v1";
export const BLOCKED_RUN_CONVERGENCE_SCHEMA = "pi-workflow-blocked-run-convergence:v1";
export { RUN_SUPERSEDED_EVENT, RUN_SUPERSEDED_REASONS };
export const HOST_RUN_STATES = Object.freeze([
  "RECONCILING",
  "RUNNING",
  "BLOCKED",
  "FAILED",
  "INTERRUPTED",
  "STOPPED",
  "SUCCEEDED",
  "UNKNOWN",
]);
export const HOST_RUN_DYNAMIC_DISPOSITIONS = Object.freeze([
  "REPLAYABLE",
  "DIVERGED",
  "UNKNOWN",
]);
export const HOST_PLAN_DISPOSITIONS = Object.freeze(["DISPATCH", "IDLE", "TERMINAL", "BLOCKED"]);
export const HOST_STOP_CODES = Object.freeze({
  blockedRun: "blocked_run",
  contradictoryActionSet: "contradictory_action_set",
  unsupportedAction: "unsupported_action",
  duplicateMaterialization: "duplicate_materialization",
  replayDivergence: "replay_divergence",
  duplicateDispatch: "duplicate_dispatch",
  unaccountedDispatchAttempt: "unaccounted_dispatch_attempt",
});
// Reason codes that mean the owning sources contradict each other or do not yet prove the Run's
// state. A contradictory action set is never escaped by opening a second host run.
export const HOST_UNRESOLVED_REASON_CODES = Object.freeze([
  "evidence_contradiction",
  "insufficient_evidence",
  "journal_scope_conflict",
  "merge_conflict",
  "invalid_fact_schema",
]);

// The declared authority ceiling. A generated lane task selects a subset of this list and can never
// widen it; the bundle spec declares the same ceiling as its read/write policy.
export const HOST_TOOL_CEILING = Object.freeze([
  "read",
  "grep",
  "find",
  "ls",
  "bash",
  "edit",
  "write",
]);
const ISSUE_LANE_TOOLS = Object.freeze([...HOST_TOOL_CEILING]);
const HOST_OBSERVATION_TOOLS = Object.freeze(["read", "ls"]);

// One implementation agent serves every Issue lane; the skill the worker must follow is declared
// separately so a generated task can never borrow authority from the agent name alone.
export const HOST_LANE_AGENT = "worker";
export const LANE_SKILLS = Object.freeze(["execute-issue", "close-issue"]);

// One materialization policy per reducer action. `skill` names the preserved contract skill the worker
// must follow; `tools` is always a subset of HOST_TOOL_CEILING.
export const HOST_ACTION_POLICY = Object.freeze({
  dispatch_issue: Object.freeze({ kind: "agent", skill: "execute-issue", agent: HOST_LANE_AGENT, tools: ISSUE_LANE_TOOLS }),
  recover_issue: Object.freeze({ kind: "agent", skill: "execute-issue", agent: HOST_LANE_AGENT, tools: ISSUE_LANE_TOOLS }),
  repair_issue: Object.freeze({ kind: "agent", skill: "execute-issue", agent: HOST_LANE_AGENT, tools: ISSUE_LANE_TOOLS }),
  upgrade_issue: Object.freeze({ kind: "agent", skill: "execute-issue", agent: HOST_LANE_AGENT, tools: ISSUE_LANE_TOOLS }),
  close_issue: Object.freeze({ kind: "agent", skill: "close-issue", agent: HOST_LANE_AGENT, tools: ISSUE_LANE_TOOLS }),
  close_parent: Object.freeze({ kind: "agent", skill: "close-issue", agent: HOST_LANE_AGENT, tools: ISSUE_LANE_TOOLS }),
  remediate_environment: Object.freeze({ kind: "host", operation: "remediate_environment", execution: "delegated" }),
  reconcile_run: Object.freeze({ kind: "host", operation: "reconcile_run", execution: "delegated", tools: HOST_OBSERVATION_TOOLS }),
  wait_repository_close_lease: Object.freeze({ kind: "host", operation: "wait_repository_close_lease", execution: "wait" }),
  wait_target_writer: Object.freeze({ kind: "host", operation: "wait_target_writer", execution: "wait" }),
  settle_pause: Object.freeze({ kind: "host", operation: "settle_pause", execution: "settle" }),
  settle_stop: Object.freeze({ kind: "host", operation: "settle_stop", execution: "settle" }),
});

const HOST_RUN_STATE_SET = new Set(HOST_RUN_STATES);
const DISPATCH_LIMIT = 3;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const identity = (value) => `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
const requireText = (value, label) => {
  if (!isText(value)) throw new TypeError(`${label} is required`);
  return value;
};
const CONTROL_SETTLEMENTS = Object.freeze({
  settle_pause: Object.freeze({ command: "PAUSE", event: "pause.transitioned" }),
  settle_stop: Object.freeze({ command: "STOP", event: "stop.transitioned" }),
});
const requireGitObject = (value, label) => {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value ?? "")) {
    throw new TypeError(`${label} must be one exact Git object identity`);
  }
  return value;
};

// One generated task id must survive the host's task-id grammar: it is spliced as
// `<dynamic-stage-id>.<id>`, so it may not contain a path separator or whitespace.
const taskIdPart = (value) => {
  const text = String(value ?? "");
  if (!text) throw new TypeError("A materialized task id needs a non-empty identity");
  return text.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 96);
};

// The deterministic identity of one materialized operation. Two reducer rounds that authorize the same
// operation produce the same id, which is what makes the host's recorded request hash the reservation
// that prevents a second dispatch after a resume.
export function hostActionIdentity(action) {
  if (!isRecord(action) || !isText(action.type)) throw new TypeError("A reducer action must name its type");
  const issue = () => taskIdPart(action.issueId);
  switch (action.type) {
    case "dispatch_issue":
      if (!Number.isInteger(action.attempt) || action.attempt < 1) {
        throw new TypeError("A dispatched Issue action requires one positive attempt");
      }
      return `dispatch_${issue()}_${action.attempt}`;
    case "recover_issue":
      return `recover_${issue()}_${taskIdPart(action.failure?.identity)}`;
    case "repair_issue":
      return `repair_${issue()}_${taskIdPart(requireGitObject(action.candidate, "repair candidate").slice(0, 12))}`;
    case "upgrade_issue":
      return `upgrade_${issue()}`;
    case "close_issue":
      return `close_${issue()}`;
    case "close_parent":
      return `close_parent_${issue()}`;
    case "remediate_environment":
      return `remediate_${issue()}_${taskIdPart(action.attempt)}_${taskIdPart(action.fingerprint)}`;
    case "reconcile_run":
      return "reconcile_run";
    case "wait_repository_close_lease":
    case "wait_target_writer":
      return `${action.type}_${issue()}_${taskIdPart(action.owner?.operationId)}`;
    case "settle_pause":
    case "settle_stop":
      return `${action.type}_${taskIdPart(action.revision)}`;
    default:
      throw new TypeError(`Unsupported reducer action ${String(action.type)}`);
  }
}

const lanePrompt = (action) => {
  switch (action.type) {
    case "dispatch_issue":
      return `Use $execute-issue to implement dependency-ready Issue ${action.issueId} in its dedicated Issue worktree under the unchanged read-back DAG Run Grant. Dispatch attempt ${action.attempt}/${DISPATCH_LIMIT}.`;
    case "recover_issue":
      return `Use $execute-issue to recover Issue ${action.issueId} from its exact recorded failure ${action.failure?.identity} in an isolated task under the unchanged read-back DAG Run Grant.`;
    case "repair_issue":
      return `Use $execute-issue to repair Issue ${action.issueId} in its original task, topic branch and worktree. Merge the exact current target baseline ${action.targetHead} into the topic without rebasing or resetting, and resolve only the existing Acceptance Criteria and exclusions. Preserve candidate ${action.candidate}. Do not integrate or close.`;
    case "upgrade_issue":
      return `Use $execute-issue to continue Issue ${action.issueId} under one bounded model upgrade inside its original task and worktree. Do not change scope and do not restart the implementation.`;
    case "close_issue":
      return `Use $close-issue to close Issue ${action.issueId} against its recorded local target. The candidate is reviewed and verified; integrate it unchanged, remove the exact clean Issue worktree, then close and read back the Issue.`;
    case "close_parent":
      return `Use $close-issue to close Multi-Issue parent Spec ${action.issueId} after every mapped child reached node success. Perform parent-only closeout.`;
    default:
      throw new TypeError(`Action ${String(action.type)} has no generated worker lane`);
  }
};

const materialization = (action) => {
  const policy = HOST_ACTION_POLICY[action.type];
  if (!policy) throw new TypeError(`Unsupported reducer action ${String(action.type)}`);
  const id = hostActionIdentity(action);
  if (policy.kind === "host") {
    return Object.freeze({
      id,
      kind: "host",
      actionType: action.type,
      issueId: isText(action.issueId) ? action.issueId : null,
      operation: policy.operation,
      execution: policy.execution,
      // A close wait is the reducer's bound, not the host's: carry its exact owner and timeout through
      // instead of letting the host choose either.
      ...(action.type.startsWith("wait_") ? {
        owner: { ...action.owner },
        timeoutMs: action.timeoutMs,
        preWaitEvidence: action.preWaitEvidence,
      } : {}),
      ...(action.type.startsWith("settle_") ? { revision: action.revision } : {}),
      ...(policy.tools === undefined ? {} : { tools: [...policy.tools] }),
    });
  }
  const tools = [...policy.tools];
  const prompt = lanePrompt(action);
  return Object.freeze({
    id,
    kind: "agent",
    actionType: action.type,
    issueId: isText(action.issueId) ? action.issueId : null,
    skill: policy.skill,
    agent: policy.agent,
    tools,
    prompt,
    requestIdentity: identity({ id, skill: policy.skill, agent: policy.agent, tools, prompt }),
    ...(action.type === "dispatch_issue" ? { attempt: action.attempt } : {}),
  });
};

const stopFor = (code, evidence, diagnoses = []) => Object.freeze({
  code,
  evidence: [...evidence],
  diagnoses: (diagnoses ?? []).map((item) => ({
    reasonCode: item?.reasonCode ?? null,
    affectedNodes: [...(item?.affectedNodes ?? [])],
  })),
});

const dispatchAttemptsByIssue = (journal) => {
  const attempts = new Map();
  for (const event of Array.isArray(journal) ? journal : []) {
    if (event?.type !== "dispatch.recorded" || !isText(event.issueId)) continue;
    attempts.set(event.issueId, Math.max(attempts.get(event.issueId) ?? 0, event.attempt ?? 0));
  }
  return attempts;
};

const uniqueId = (value) => value.split(".").at(-1);

// The reducer's legal action set is an input this owner may refuse but never amend. Every failure path
// returns a stop instead of a partial plan, so a contradictory or unavailable action set can never
// dispatch anything.
export function planHostActions(status, { journal } = {}) {
  if (!isRecord(status) || status.schema !== STATUS_SCHEMA || !isRecord(status.run)) {
    throw new TypeError("A host round is planned from one dag-run-status:v1 projection");
  }
  const actions = status.legalActions;
  if (!Array.isArray(actions)) throw new TypeError("The reducer status must expose its legal actions");
  const run = {
    runId: requireText(status.run.runId, "host plan Run id"),
    specId: requireText(status.run.specId, "host plan Spec id"),
    target: requireText(status.run.target, "host plan target branch"),
    state: requireText(status.run.state, "host plan Run state"),
    controlRevision: status.run.controlRevision ?? 0,
  };
  const diagnoses = Array.isArray(status.diagnoses) ? status.diagnoses : [];
  const unresolved = diagnoses.filter((item) => HOST_UNRESOLVED_REASON_CODES.includes(item?.reasonCode));
  const plan = (disposition, materializations, stop) => Object.freeze({
    schema: HOST_PLAN_SCHEMA,
    runId: run.runId,
    specId: run.specId,
    target: run.target,
    state: run.state,
    controlRevision: run.controlRevision,
    disposition,
    stop: stop ?? null,
    materializations,
    authorizedActions: actions.map((action) => action?.type ?? null),
  });

  const materializations = [];
  const ids = new Set();
  for (const action of actions) {
    if (!isRecord(action) || !isText(action.type)) {
      return plan("BLOCKED", [], stopFor(HOST_STOP_CODES.unsupportedAction, ["A legal action does not name its type."]));
    }
    if (!HOST_ACTION_POLICY[action.type]) {
      return plan("BLOCKED", [], stopFor(
        HOST_STOP_CODES.unsupportedAction,
        [`Reducer action ${action.type} has no declared host materialization.`],
      ));
    }
    let item;
    try {
      item = materialization(action);
    } catch (error) {
      return plan("BLOCKED", [], stopFor(HOST_STOP_CODES.unsupportedAction, [error.message]));
    }
    if (ids.has(item.id)) {
      return plan("BLOCKED", [], stopFor(
        HOST_STOP_CODES.duplicateMaterialization,
        [`Reducer round authorized ${item.id} more than once.`],
      ));
    }
    ids.add(item.id);
    materializations.push(item);
  }

  const invalidWait = materializations.find((item) => item.kind === "host" && item.execution === "wait"
    && (!Number.isInteger(item.timeoutMs) || item.timeoutMs < 1));
  if (invalidWait) {
    return plan("BLOCKED", [], stopFor(
      HOST_STOP_CODES.unsupportedAction,
      [`Host operation ${invalidWait.id} arrived without the reducer's own bounded wait.`],
    ));
  }
  const attempts = dispatchAttemptsByIssue(journal);
  for (const item of materializations) {
    if (item.actionType !== "dispatch_issue") continue;
    if (item.attempt > (attempts.get(item.issueId) ?? 0) + 1 || item.attempt > DISPATCH_LIMIT) {
      return plan("BLOCKED", [], stopFor(
        HOST_STOP_CODES.unaccountedDispatchAttempt,
        [`Issue ${item.issueId} dispatch attempt ${item.attempt} is not accounted by a journaled attempt ${item.attempt - 1}.`],
      ));
    }
  }

  if (materializations.length > 0) return plan("DISPATCH", materializations, null);
  if (["SUCCEEDED", "STOPPED"].includes(run.state)) return plan("TERMINAL", [], null);
  if (run.state === "BLOCKED") {
    return plan("BLOCKED", [], unresolved.length > 0
      ? stopFor(
        HOST_STOP_CODES.contradictoryActionSet,
        unresolved.map((item) => `Unresolved ${item.reasonCode} evidence keeps Run ${run.runId} blocked.`),
        diagnoses,
      )
      : stopFor(
        HOST_STOP_CODES.blockedRun,
        [`Run ${run.runId} is BLOCKED with no legal action.`],
        diagnoses,
      ));
  }
  return plan("IDLE", [], null);
}

// Reconcile facts are reduced by the domain reducer and then planned.
export function planHostRound({ facts, journal } = {}) {
  return planHostActions(reduceRun(facts), { journal: journal ?? facts?.journal });
}

// The re-issue proof a controller must satisfy before it materializes anything new: every operation the
// host already recorded is re-issued in the recorded order with the recorded request shape. A recorded
// operation that settled may never be materialized a second time.
export function assertReissueOrder(plan, recorded) {
  if (!isRecord(plan) || plan.schema !== HOST_PLAN_SCHEMA) {
    throw new TypeError("Re-issue order is proved against one pi-workflow-host-plan:v1 plan");
  }
  if (!Array.isArray(recorded) || recorded.length === 0) return null;
  const entries = recorded.map((entry, index) => {
    if (!isRecord(entry) || !isText(entry.id)) throw new TypeError(`Recorded host operation ${index} needs an id`);
    if (entry.requestIdentity !== undefined && entry.requestIdentity !== null && !isText(entry.requestIdentity)) {
      throw new TypeError(`Recorded host operation ${entry.id} has a malformed request identity`);
    }
    if (entry.outcome !== undefined && !["recorded", "settled"].includes(entry.outcome)) {
      throw new TypeError(`Recorded host operation ${entry.id} has an unsupported outcome`);
    }
    return { id: uniqueId(entry.id), requestIdentity: entry.requestIdentity ?? null, outcome: entry.outcome ?? "recorded" };
  });
  const byId = new Map(plan.materializations.map((item) => [item.id, item]));
  const order = new Map(plan.materializations.map((item, index) => [item.id, index]));
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const item = byId.get(entry.id);
    if (!item) {
      return stopFor(HOST_STOP_CODES.replayDivergence, [
        `Host operation ${entry.id} is already recorded but the reducer no longer authorizes it.`,
      ]);
    }
    if (index > 0 && order.get(entry.id) <= order.get(entries[index - 1].id)) {
      return stopFor(HOST_STOP_CODES.replayDivergence, [
        `Recorded host operations ${entries[index - 1].id} and ${entry.id} are not a re-issuable prefix.`,
      ]);
    }
    if (entry.requestIdentity !== null && entry.requestIdentity !== item.requestIdentity) {
      return stopFor(HOST_STOP_CODES.replayDivergence, [
        `Host operation ${entry.id} was recorded with request identity ${entry.requestIdentity} and is now ${item.requestIdentity}.`,
      ]);
    }
    if (entry.outcome === "settled") {
      return stopFor(HOST_STOP_CODES.duplicateDispatch, [
        `Host operation ${entry.id} already settled and must not be materialized again.`,
      ]);
    }
  }
  return null;
}

const assertHostRun = (hostRun) => {
  if (!isRecord(hostRun)) throw new TypeError("Blocked-run convergence needs one host run record");
  const runId = requireText(hostRun.runId, "host run id");
  const state = requireText(hostRun.state, "host run state");
  if (!HOST_RUN_STATE_SET.has(state)) throw new TypeError(`Unsupported host run state ${state}`);
  const disposition = requireText(hostRun.dynamicDisposition, "host run dynamic disposition");
  if (!HOST_RUN_DYNAMIC_DISPOSITIONS.includes(disposition)) {
    throw new TypeError(`Unsupported dynamic disposition ${disposition}`);
  }
  const generatedTaskIds = hostRun.generatedTaskIds ?? [];
  if (!Array.isArray(generatedTaskIds) || !generatedTaskIds.every(isText)) {
    throw new TypeError("Host run generated task ids must be strings");
  }
  return { runId, state, disposition, generatedTaskIds };
};

// The blocked-run convergence entry. `/run-issue-workflow <Spec-ID>` reads a blocked or failed host run
// back and takes exactly one of these decisions; it never dispatches twice and never opens a superseding
// host run while any dispatch attempt is unaccounted.
export function convergeBlockedRun({ facts, hostRun, at } = {}) {
  const observed = assertHostRun(hostRun);
  const status = reduceRun(facts);
  const plan = planHostActions(status, { journal: facts?.journal });
  const base = {
    schema: BLOCKED_RUN_CONVERGENCE_SCHEMA,
    hostRunId: observed.runId,
    specId: status?.run?.specId ?? null,
    target: status?.run?.target ?? null,
    hostRunState: observed.state,
    dynamicDisposition: observed.disposition,
    plan,
    supersession: null,
    journalEvent: null,
  };
  if (["SUCCEEDED", "STOPPED"].includes(observed.state)) {
    return Object.freeze({ ...base, decision: "NO_ACTION", reason: "HOST_RUN_TERMINAL", evidence: [] });
  }
  if (plan.stop && plan.stop.code !== HOST_STOP_CODES.blockedRun) {
    return Object.freeze({ ...base, decision: "STOP", reason: plan.stop.code, evidence: plan.stop.evidence });
  }
  if (observed.disposition === "REPLAYABLE") {
    return Object.freeze({
      ...base,
      decision: "CONTINUE_SAME_RUN",
      reason: "HOST_RUN_REPLAYABLE",
      evidence: [
        `Host run ${observed.runId} can re-issue its ${observed.generatedTaskIds.length} recorded operation(s) in order.`,
      ],
    });
  }
  // A superseding host run may not be opened while the blocked run owns an unaccounted dispatch.
  const attempts = dispatchAttemptsByIssue(facts?.journal);
  const unaccounted = [];
  for (const id of observed.generatedTaskIds) {
    const match = /^dispatch_([A-Za-z0-9_-]+)_([1-9][0-9]*)$/u.exec(uniqueId(id));
    if (!match) continue;
    const issueId = match[1];
    const attempt = Number(match[2]);
    if ((attempts.get(issueId) ?? 0) < attempt) {
      unaccounted.push(`${id} has no journaled dispatch attempt ${attempt}`);
    }
  }
  if (unaccounted.length > 0) {
    return Object.freeze({
      ...base,
      decision: "STOP",
      reason: HOST_STOP_CODES.unaccountedDispatchAttempt,
      evidence: unaccounted,
    });
  }
  requireIsoInstant(at, "A superseding host run timestamp");
  const reason = observed.disposition === "DIVERGED" ? "DYNAMIC_REPLAY_DIVERGED" : "DYNAMIC_REPLAY_UNKNOWN";
  const evidence = [
    `Host run ${observed.runId} recorded dynamic disposition ${observed.disposition}.`,
    `Host run ${observed.runId} owns no unaccounted dispatch attempt.`,
    ...observed.generatedTaskIds.map((id) => `Recorded host operation ${id} is preserved and is not re-dispatched by the superseding host run.`),
  ];
  return Object.freeze({
    ...base,
    decision: "NEW_RUN",
    reason,
    evidence,
    supersession: Object.freeze({ supersededRunId: observed.runId, reason, evidence: [...evidence] }),
    journalEvent: Object.freeze({
      type: RUN_SUPERSEDED_EVENT,
      at,
      supersededRunId: observed.runId,
      reason,
      evidence: [...evidence],
    }),
  });
}

// A cooperative Pause or Stop settlement is a domain-owned journal transition. The host may only
// append it when the journal's latest control revision still authorizes exactly that command.
export function hostControlSettlement(action, journal, at) {
  if (!isRecord(action) || !CONTROL_SETTLEMENTS[action.type]) {
    throw new TypeError("Only a settle_pause or settle_stop action has a host control settlement");
  }
  const { command, event: eventType } = CONTROL_SETTLEMENTS[action.type];
  const events = Array.isArray(journal) ? journal : [];
  const latest = events.findLast((event) => event?.type === "control.revised" && event.command === command);
  if (!latest || latest.revision !== action.revision) {
    return {
      stop: stopFor(HOST_STOP_CODES.unsupportedAction, [
        `Control settlement ${action.type} at revision ${action.revision} is not authorized by the journal's latest ${command} revision ${latest?.revision ?? "none"}.`,
      ]),
      event: null,
    };
  }
  if (events.some((event) => event?.type === eventType && event.revision === action.revision)) {
    return { stop: null, event: null, revision: action.revision };
  }
  requireIsoInstant(at, "Control settlement timestamp");
  return { stop: null, revision: action.revision, event: { type: eventType, at, revision: action.revision } };
}

// Every authority-journal append the host performs goes through the single journal writer.
export function recordHostAuthorityEvent({ gitCommonDir, runId, event } = {}) {
  requireText(gitCommonDir, "authority journal common directory");
  requireText(runId, "authority journal Run id");
  if (!isRecord(event) || !isText(event.type)) throw new TypeError("A host authority event needs its type");
  const store = createRunStore({ gitCommonDir });
  const writer = store.acquireWriter(runId);
  try {
    return writer.append(event);
  } finally {
    writer.release();
  }
}

// The supersession link is an authority fact: it proves that the superseding host run did not
// re-dispatch an attempt the blocked host run already owned. The authority journal keeps it, and its
// single writer stays the only append path.
export function recordHostRunSupersession({ gitCommonDir, runId, event } = {}) {
  requireText(gitCommonDir, "authority journal common directory");
  requireText(runId, "authority journal Run id");
  if (!isRecord(event) || event.type !== RUN_SUPERSEDED_EVENT) {
    throw new TypeError("Only one run.superseded draft can be recorded as a host Run supersession");
  }
  requireText(event.supersededRunId, "superseded host Run id");
  if (!RUN_SUPERSEDED_REASONS.includes(event.reason)) throw new TypeError("Unsupported host Run supersession reason");
  requireIsoInstant(event.at, "Host Run supersession timestamp");
  if (!Array.isArray(event.evidence) || event.evidence.length === 0
    || !event.evidence.every((item) => isText(item))) {
    throw new TypeError("Host Run supersession requires exact evidence");
  }
  return recordHostAuthorityEvent({ gitCommonDir, runId, event: { ...event, evidence: [...event.evidence] } });
}
