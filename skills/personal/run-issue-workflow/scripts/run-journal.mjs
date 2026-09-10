import { validateCloseWaitEvidence } from "./run-target-writer-wait.mjs";
import { validateRecoveryIntent, sameRecoveryTask, nextRepairWave, nextMaintenanceWave } from "./recovery-evidence.mjs";
import { validateModelPolicy, validateModelSetting } from "./issue-model-policy.mjs";

export const EVENT_SCHEMA = "dag-run-event:v1";
export const DEFAULT_MAX_PARALLEL = 3;
export const ISSUE_EXECUTION_LIMIT_MS = 6 * 60 * 60 * 1000;
export const ISSUE_EXECUTION_PHASES = Object.freeze([
  "IMPLEMENTATION",
  "IMPLEMENTATION_RETRY",
  "IMPLEMENTATION_REPAIR",
  "CONFLICT_REPAIR",
]);
export const CONTROL_COMMANDS = Object.freeze(["PAUSE", "RESUME", "STOP"]);
export const RUN_EVENT_TYPES = Object.freeze([
  "grant.recorded",
  "model.acceptance",
  "model.substitution",
  "model.upgrade",
  "runtime.observed",
  "repair.recorded",
  "recovery.intent",
  "recovery.task",
  "action.failed",
  "control.revised",
  "dispatch.recorded",
  "execution.started",
  "execution.observed",
  "execution.uncertain",
  "execution.exhausted",
  "retry.recorded",
  "remediation.recorded",
  "repository-close-wait.started",
  "repository-close-wait.settled",
  "target-writer-wait.started",
  "target-writer-wait.settled",
  "pause.transitioned",
  "stop.transitioned",
]);

const controlCommands = new Set(CONTROL_COMMANDS);
const immutableRunIdentityKeys = Object.freeze([
  "runId",
  "specId",
  "approvedScopeHash",
  "target",
  "classification",
  "decompositionIdentity",
]);
const eventFields = new Map([
  ["recovery.intent", new Set(["type", "at", "issueId", "failure", "phase", "wave", "originalTaskRef", "requestIdentity"])],
  ["recovery.task", new Set(["type", "at", "issueId", "requestIdentity", "failureIdentity", "originalTaskRef", "taskRef", "previousOwner", "wave", "phase"])],
  ["model.upgrade", new Set(["type", "at", "issueId", "requestIdentity", "yieldIdentity", "taskRef", "candidate", "worktree", "topic", "repairWaves", "model", "thinking", "reason"])],
  ["model.substitution", new Set(["type", "at", "issueId", "requestIdentity", "fromModel", "model", "thinking", "reason"])],
  ["model.acceptance", new Set(["type", "at", "issueId", "requestIdentity", "model", "thinking", "phase", "acceptance", "effectiveReadBack", "evidence"])],
  ["action.failed", new Set(["type", "at", "issueId", "actionType", "progressIdentity", "attempt", "evidence"])],
  ["repair.recorded", new Set(["type", "at", "issueId", "wave", "candidate", "targetHead", "taskRef", "requestIdentity", "priorRepairWaves"])],
  ["runtime.observed", new Set(["type", "at", "workflowVersion"])],
  ["grant.recorded", new Set(["type", "at", "runIdentity", "maxParallel", "workflowVersion", "modelPolicy"])],
  ["control.revised", new Set(["type", "at", "revision", "command"])],
  ["dispatch.recorded", new Set(["type", "at", "issueId", "attempt", "taskRef"])],
  ["execution.started", new Set(["type", "at", "issueId", "phase", "phaseIdentity", "taskRef"])],
  ["execution.observed", new Set(["type", "at", "issueId", "startSequence", "elapsedMs", "state", "source"])],
  ["execution.uncertain", new Set(["type", "at", "issueId", "startSequence", "reason"])],
  ["execution.exhausted", new Set(["type", "at", "issueId", "consumedMs"])],
  ["retry.recorded", new Set([
    "type", "at", "issueId", "attempt", "reason", "priorTaskRef", "replacement",
  ])],
  ["remediation.recorded", new Set(["type", "at", "issueId", "attempt", "fingerprint", "cycle", "adapter"])],
  ["repository-close-wait.started", new Set([
    "type", "at", "issueId", "target", "owner", "timeoutMs", "preWaitEvidence",
  ])],
  ["repository-close-wait.settled", new Set([
    "type", "at", "waitSequence", "issueId", "target", "owner", "outcome", "evidence",
  ])],
  ["target-writer-wait.started", new Set([
    "type", "at", "issueId", "target", "owner", "timeoutMs", "preWaitEvidence",
  ])],
  ["target-writer-wait.settled", new Set([
    "type", "at", "waitSequence", "issueId", "target", "owner", "outcome", "evidence",
  ])],
  ["pause.transitioned", new Set(["type", "at", "revision"])],
  ["stop.transitioned", new Set(["type", "at", "revision"])],
]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} is required`);
};

const isoInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const requireIsoInstant = (value, label) => {
  if (typeof value !== "string" || !isoInstantPattern.test(value)
    || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(`${label} must be a canonical ISO instant`);
  }
  return Date.parse(value);
};

const requirePositiveInteger = (value, label, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} must be an integer from 1 through ${maximum}`);
  }
};

const requireNonNegativeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
};

const assertExactFields = (value, allowed, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
};

const workflowVersionFields = new Set(["id", "sourceCommit", "sourceRepository", "protocolVersion"]);
export function validateWorkflowVersion(version) {
  assertExactFields(version, workflowVersionFields, "workflow version");
  if (!/^[a-f0-9]{64}$/u.test(version.id ?? "")
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(version.sourceCommit ?? "")
    || version.protocolVersion !== 1) throw new TypeError("Invalid or incompatible workflow version");
  requireText(version.sourceRepository, "workflow version sourceRepository");
}

export const sameWorkflowVersion = (left, right) => [...workflowVersionFields]
  .every((field) => left?.[field] === right?.[field]);

const validateTaskRef = (taskRef, label) => {
  assertExactFields(taskRef, new Set(["threadId", "hostId"]), label);
  requireText(taskRef.threadId, `${label}.threadId`);
  requireText(taskRef.hostId, `${label}.hostId`);
};

const validateTargetWriterOwner = (owner, label) => {
  assertExactFields(owner, new Set(["operationId", "coordinatorInstanceId", "generation"]), label);
  requireText(owner.operationId, `${label}.operationId`);
  requireText(owner.coordinatorInstanceId, `${label}.coordinatorInstanceId`);
  requireText(owner.generation, `${label}.generation`);
};

const sameTargetWriterOwner = (left, right) => (
  left.operationId === right.operationId
  && left.coordinatorInstanceId === right.coordinatorInstanceId
  && left.generation === right.generation
);

const sameTaskRef = (left, right) => left.threadId === right.threadId && left.hostId === right.hostId;
const taskRefKey = ({ hostId, threadId }) => JSON.stringify([hostId, threadId]);

export const normalizeEventDraft = (eventDraft) => (
  isRecord(eventDraft) && eventDraft.type === "grant.recorded" && eventDraft.maxParallel === undefined
    ? { ...eventDraft, maxParallel: DEFAULT_MAX_PARALLEL }
    : eventDraft
);

export function validateEventDraft(event, { allowLegacyRemediation = false } = {}) {
  if (!isRecord(event)) throw new TypeError("Journal event must be an object");
  if (Object.hasOwn(event, "schema") || Object.hasOwn(event, "sequence")) {
    throw new TypeError("Journal schema and sequence are store-owned");
  }
  const allowedFields = eventFields.get(event.type);
  if (!allowedFields) throw new TypeError(`Unsupported event type: ${String(event.type)}`);
  assertExactFields(event, allowedFields, `${event.type} event`);
  requireIsoInstant(event.at, "Journal event timestamp");
  switch (event.type) {
    case "recovery.intent":
      validateRecoveryIntent(event);
      break;
    case "recovery.task":
      validateTaskRef(event.taskRef, "recovery task");
      validateTaskRef(event.originalTaskRef, "original recovery task");
      if (sameRecoveryTask(event.taskRef, event.originalTaskRef) || event.previousOwner?.state !== "SETTLED"
        || !sameRecoveryTask(event.previousOwner.taskRef, event.originalTaskRef)
        || typeof event.previousOwner.worktree !== "string") throw new Error("Recovery requires a separate task and exact settled previous owner");
      break;
    case "model.upgrade":
      validateModelSetting(event);
      validateTaskRef(event.taskRef, "Model upgrade task");
      for (const key of ["issueId", "worktree", "topic", "reason"]) requireText(event[key], `Model upgrade ${key}`);
      if (!/^sha256:[a-f0-9]{64}$/u.test(event.requestIdentity) || !/^sha256:[a-f0-9]{64}$/u.test(event.yieldIdentity)
        || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(event.candidate)
        || !Number.isInteger(event.repairWaves) || event.repairWaves < 2 || event.repairWaves >= 10
        || event.model !== "gpt-6-astra" || !["high", "xhigh", "max", "ultra"].includes(event.thinking)) throw new TypeError("Invalid model upgrade reservation");
      break;
    case "model.substitution":
      validateModelSetting(event);
      requireText(event.issueId, "Model substitution Issue");
      requireText(event.reason, "Model substitution reason");
      if (!["gpt-5.6-terra", "gpt-5.6-sol"].includes(event.fromModel) || event.model !== "gpt-6-astra"
        || !["high", "xhigh", "max", "ultra"].includes(event.thinking)
        || !/^sha256:[a-f0-9]{64}$/u.test(event.requestIdentity)) throw new TypeError("Invalid pre-creation Astra substitution");
      break;
    case "model.acceptance":
      requireText(event.issueId, "Model acceptance Issue");
      requireText(event.evidence, "Model acceptance evidence");
      validateModelSetting(event);
      if (!/^sha256:[a-f0-9]{64}$/u.test(event.requestIdentity)
        || !["creation", "substitution", "upgrade"].includes(event.phase)
        || !["accepted", "unknown", "unavailable"].includes(event.acceptance)
        || event.effectiveReadBack !== "unavailable") throw new TypeError("Invalid native model acceptance evidence");
      break;
    case "action.failed":
      requireText(event.issueId, "failed action Issue");
      if (!["dispatch_issue", "repair_issue", "close_issue", "recover_issue", "upgrade_issue"].includes(event.actionType)) throw new TypeError("Unsupported failed action");
      if (!/^sha256:[a-f0-9]{64}$/u.test(event.progressIdentity)) throw new TypeError("Failed action requires exact progress identity");
      requirePositiveInteger(event.attempt, "failed action attempt", 3);
      requireText(event.evidence, "failed action evidence");
      break;
    case "repair.recorded":
      requireText(event.issueId, "repair Issue");
      requirePositiveInteger(event.wave, "repair wave", 10);
      if (event.priorRepairWaves !== undefined && (!Number.isInteger(event.priorRepairWaves) || event.priorRepairWaves < 0
        || event.priorRepairWaves >= 10 || event.wave !== event.priorRepairWaves + 1)) throw new TypeError("Repair must preserve the execution owner's cumulative budget");
      validateTaskRef(event.taskRef, "repair task");
      for (const field of ["candidate", "targetHead"]) if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(event[field])) throw new TypeError("Repair requires exact Git commits");
      if (!/^sha256:[a-f0-9]{64}$/u.test(event.requestIdentity)) throw new TypeError("Repair request identity is invalid");
      break;
    case "runtime.observed":
      validateWorkflowVersion(event.workflowVersion);
      break;
    case "grant.recorded":
      assertExactFields(event.runIdentity, new Set(immutableRunIdentityKeys), "grant runIdentity");
      for (const key of ["runId", "specId", "approvedScopeHash", "target", "classification"]) {
        requireText(event.runIdentity[key], `grant runIdentity.${key}`);
      }
      if (!["SINGLE", "MULTI"].includes(event.runIdentity.classification)) {
        throw new TypeError("grant runIdentity.classification must be SINGLE or MULTI");
      }
      if (event.runIdentity.classification === "MULTI") {
        requireText(event.runIdentity.decompositionIdentity, "grant runIdentity.decompositionIdentity");
      } else if (event.runIdentity.decompositionIdentity !== null) {
        throw new TypeError("A SINGLE Run must bind decompositionIdentity as null");
      }
      if (event.maxParallel !== undefined) requirePositiveInteger(event.maxParallel, "maxParallel");
      if (event.workflowVersion !== undefined) validateWorkflowVersion(event.workflowVersion);
      if (event.modelPolicy !== undefined) validateModelPolicy(event.modelPolicy, event.runIdentity);
      break;
    case "control.revised":
      requirePositiveInteger(event.revision, "control revision");
      if (!controlCommands.has(event.command)) throw new TypeError("Unsupported control command");
      break;
    case "dispatch.recorded":
      requireText(event.issueId, "dispatch issueId");
      requirePositiveInteger(event.attempt, "dispatch attempt", 3);
      validateTaskRef(event.taskRef, "dispatch taskRef");
      break;
    case "execution.started":
      requireText(event.issueId, "execution Issue");
      if (!ISSUE_EXECUTION_PHASES.includes(event.phase)) throw new TypeError("Unsupported Issue execution phase");
      requireText(event.phaseIdentity, "execution phase identity");
      validateTaskRef(event.taskRef, "execution taskRef");
      break;
    case "execution.observed":
      requireText(event.issueId, "execution observation Issue");
      requirePositiveInteger(event.startSequence, "execution start sequence");
      requireNonNegativeInteger(event.elapsedMs, "execution elapsedMs");
      if (!["ACTIVE", "SETTLED"].includes(event.state)) throw new TypeError("Unsupported Issue execution observation state");
      if (!["MONOTONIC", "NATIVE"].includes(event.source)) {
        throw new TypeError("Unsupported Issue execution observation source");
      }
      break;
    case "execution.uncertain":
      requireText(event.issueId, "uncertain execution Issue");
      requirePositiveInteger(event.startSequence, "uncertain execution start sequence");
      if (event.reason !== "MONOTONIC_OR_NATIVE_ELAPSED_UNAVAILABLE") throw new TypeError("Unsupported uncertain execution reason");
      break;
    case "execution.exhausted":
      requireText(event.issueId, "execution exhaustion Issue");
      requireNonNegativeInteger(event.consumedMs, "execution exhaustion consumedMs");
      if (event.consumedMs < ISSUE_EXECUTION_LIMIT_MS) throw new TypeError("Execution exhaustion cannot precede the six-hour limit");
      break;
    case "retry.recorded":
      requireText(event.issueId, "retry issueId");
      requirePositiveInteger(event.attempt, "retry attempt", 3);
      requireText(event.reason, "retry reason");
      validateTaskRef(event.priorTaskRef, "retry priorTaskRef");
      if (event.replacement !== null) {
        assertExactFields(
          event.replacement,
          new Set(["supersedesAttempt", "nextTaskRef", "inactiveEvidence"]),
          "retry replacement",
        );
        if (event.replacement.supersedesAttempt !== event.attempt) {
          throw new TypeError("Replacement supersedesAttempt must match retry attempt");
        }
        validateTaskRef(event.replacement.nextTaskRef, "retry replacement nextTaskRef");
        if (sameTaskRef(event.priorTaskRef, event.replacement.nextTaskRef)) {
          throw new TypeError("Replacement nextTaskRef must identify a different task");
        }
        if (!Array.isArray(event.replacement.inactiveEvidence)
          || event.replacement.inactiveEvidence.length === 0
          || !event.replacement.inactiveEvidence.every((item) => typeof item === "string" && item.length > 0)) {
          throw new TypeError("Replacement requires exact prior-task inactive evidence");
        }
      }
      break;
    case "remediation.recorded":
      requireText(event.issueId, "remediation issueId");
      if (event.attempt === undefined && !allowLegacyRemediation) {
        throw new TypeError("Remediation attempt is required for new journal events");
      }
      if (event.attempt !== undefined) requirePositiveInteger(event.attempt, "remediation attempt", 3);
      requireText(event.fingerprint, "remediation fingerprint");
      requirePositiveInteger(event.cycle, "remediation cycle", 1);
      requireText(event.adapter, "remediation adapter");
      break;
    case "repository-close-wait.started":
    case "target-writer-wait.started":
      requireText(event.issueId, "close wait issueId");
      requireText(event.target, "close wait target");
      validateTargetWriterOwner(event.owner, "close wait owner");
      requirePositiveInteger(event.timeoutMs, "close wait timeoutMs", 300_000);
      validateCloseWaitEvidence(event.preWaitEvidence);
      break;
    case "repository-close-wait.settled":
    case "target-writer-wait.settled":
      requirePositiveInteger(event.waitSequence, "close wait sequence");
      requireText(event.issueId, "close wait issueId");
      requireText(event.target, "close wait target");
      validateTargetWriterOwner(event.owner, "close wait owner");
      if (!["RELEASED", "TIMED_OUT", "OWNER_CHANGED", "OWNER_HEALTH_UNKNOWN", "CONTROL_CHANGED", "COORDINATOR_INACTIVE", "EVIDENCE_CHANGED"].includes(event.outcome)) {
        throw new TypeError("Unsupported close wait outcome");
      }
      if (!Array.isArray(event.evidence) || event.evidence.length === 0 || !event.evidence.every((item) => (
        typeof item === "string" && item.length > 0
      ))) {
        throw new TypeError("Close wait settlement requires exact evidence");
      }
      break;
    case "pause.transitioned":
    case "stop.transitioned":
      requirePositiveInteger(event.revision, "transition revision");
      break;
    default:
      throw new TypeError(`Unsupported event type: ${String(event.type)}`);
  }
}

export function validateEventSemantics(events, event, { storageRunId } = {}) {
  if (events.length === 0 && event.type !== "grant.recorded") {
    throw new TypeError("The first Run event must be grant.recorded");
  }
  if (event.type === "grant.recorded") {
    if (storageRunId !== undefined && event.runIdentity.runId !== storageRunId) {
      throw new TypeError("The Grant runId must match its storage Run");
    }
    const previous = events.findLast(({ type }) => type === "grant.recorded");
    if (previous) {
      if (immutableRunIdentityKeys.some((key) => previous.runIdentity[key] !== event.runIdentity[key])) {
        throw new TypeError("A renewed grant must preserve the Run identity");
      }
      if ((previous.maxParallel ?? DEFAULT_MAX_PARALLEL) !== (event.maxParallel ?? DEFAULT_MAX_PARALLEL)) {
        throw new TypeError("A renewed grant must preserve maxParallel until a revisioned setting exists");
      }
      if (!sameWorkflowVersion(previous.workflowVersion, event.workflowVersion)) {
        throw new TypeError("A renewed grant must preserve its workflow version");
      }
      if (JSON.stringify(previous.modelPolicy) !== JSON.stringify(event.modelPolicy)) throw new TypeError("A renewed grant must preserve model policy membership");
    }
  }
  if (event.type === "model.acceptance" && !events.find(item => item.type === "grant.recorded")?.modelPolicy) {
    throw new TypeError("Model acceptance requires a policy-bound Run");
  }
  if (event.type === "model.substitution") {
    const rejection = events.findLast(item => item.type === "model.acceptance" && item.issueId === event.issueId);
    if (!events.find(item => item.type === "grant.recorded")?.modelPolicy
      || !rejection || rejection.phase !== "creation" || rejection.acceptance !== "unavailable" || rejection.model !== event.fromModel
      || events.some(item => item.issueId === event.issueId && ["model.substitution", "dispatch.recorded"].includes(item.type))) {
      throw new TypeError("Model substitution requires one confirmed pre-creation rejection");
    }
  }
  if (event.type === "model.upgrade") {
    const grant = events.find(item => item.type === "grant.recorded");
    const dispatch = events.findLast(item => item.type === "dispatch.recorded" && item.issueId === event.issueId);
    if (!grant?.modelPolicy || !dispatch || !sameTaskRef(dispatch.taskRef, event.taskRef)
      || events.some(item => item.type === "model.upgrade" && item.issueId === event.issueId)) {
      throw new TypeError("A model upgrade must reserve the sole allowance in the original policy-bound task");
    }
  }
  if (event.type === "action.failed") {
    const previous = events.filter(item => item.type === event.type && item.issueId === event.issueId
      && item.actionType === event.actionType && item.progressIdentity === event.progressIdentity);
    if (event.attempt !== previous.length + 1) throw new TypeError("Failed action attempts must preserve their monotonic progress budget");
  }
  if (event.type === "repair.recorded") {
    const previous = events.filter(item => item.type === "repair.recorded" && item.issueId === event.issueId);
    const dispatch = events.findLast(item => item.type === "dispatch.recorded" && item.issueId === event.issueId);
    const priorCount = event.priorRepairWaves ?? previous.at(-1)?.wave ?? 0;
    if (!dispatch || !sameTaskRef(dispatch.taskRef, event.taskRef) || event.wave !== priorCount + 1 || priorCount < (previous.at(-1)?.wave ?? 0)
      || previous.some(item => item.candidate === event.candidate)) throw new TypeError("Repair must preserve its original dispatched lane and monotonic candidate budget");
  }
  if (event.type === "recovery.intent") {
    const grant = events.find(item => item.type === "grant.recorded");
    const dispatch = events.findLast(item => item.type === "dispatch.recorded" && item.issueId === event.issueId);
    if (event.failure.runId !== grant?.runIdentity.runId || !dispatch
      || !sameRecoveryTask(dispatch.taskRef, event.originalTaskRef) || !sameRecoveryTask(event.failure.ownerTaskRef, event.originalTaskRef)
      || events.some(item => item.type === "recovery.intent" && item.requestIdentity === event.requestIdentity)) throw new Error("Recovery intent must bind the original Run and dispatched task exactly once");
    if (event.phase === "REPAIR" && event.wave !== nextRepairWave({ failure: event.failure, journal: events })) throw new Error("Recovery must preserve the cumulative material repair count");
    if (event.phase === "MAINTENANCE" && event.wave !== nextMaintenanceWave({ failure: event.failure, journal: events })) throw new Error("Maintenance must preserve its scoped operation budget");
  }
  if (event.type === "recovery.task") {
    const intent = events.find(item => item.type === "recovery.intent" && item.requestIdentity === event.requestIdentity);
    if (!intent || intent.issueId !== event.issueId || intent.failure.identity !== event.failureIdentity
      || intent.phase !== event.phase || intent.wave !== event.wave || !sameRecoveryTask(intent.originalTaskRef, event.originalTaskRef)
      || event.previousOwner.worktree !== intent.failure.worktree
      || events.some(item => ["dispatch.recorded", "recovery.task"].includes(item.type) && item.issueId !== event.issueId && sameRecoveryTask(item.taskRef, event.taskRef))
      || events.some(item => item.type === "recovery.task" && item.issueId === event.issueId && item.phase !== "MAINTENANCE"
        && event.phase !== "MAINTENANCE" && !sameRecoveryTask(item.taskRef, event.taskRef))
      || events.some(item => item.type === "recovery.task" && item.requestIdentity === event.requestIdentity)) throw new Error("Recovery transfer lacks its exact prior intent and exclusive ownership proof");
  }
  if (event.type === "runtime.observed") {
    const grant = events.findLast(({ type }) => type === "grant.recorded");
    if (!grant?.workflowVersion || grant.workflowVersion.sourceRepository !== event.workflowVersion.sourceRepository
      || grant.workflowVersion.protocolVersion !== event.workflowVersion.protocolVersion) throw new TypeError("Runtime observation requires a compatible recorded package source and protocol");
  }
  if (event.type === "control.revised") {
    const previousControl = events.findLast(({ type }) => type === "control.revised");
    const previousRevision = previousControl?.revision ?? 0;
    if (event.revision !== previousRevision + 1) {
      throw new TypeError(`Expected next control revision ${previousRevision + 1}`);
    }
    if (previousControl?.command === event.command) {
      throw new TypeError(`Repeated ${event.command} control is idempotent and must not create a revision`);
    }
  }
  if (event.type === "dispatch.recorded") {
    const aliasedDispatch = events.find((item) => (
      ((item.type === "dispatch.recorded" && taskRefKey(item.taskRef) === taskRefKey(event.taskRef))
        || (item.type === "retry.recorded" && item.replacement
          && taskRefKey(item.replacement.nextTaskRef) === taskRefKey(event.taskRef)))
      && item.issueId !== event.issueId
    ));
    if (aliasedDispatch) {
      throw new TypeError(`One taskRef cannot serve both Issue ${aliasedDispatch.issueId} and ${event.issueId}`);
    }
    const previousDispatch = events
      .filter(({ type, issueId }) => type === "dispatch.recorded" && issueId === event.issueId)
      .sort((left, right) => right.attempt - left.attempt)[0];
    const previousAttempt = previousDispatch?.attempt ?? 0;
    if (event.attempt !== previousAttempt + 1) {
      throw new TypeError(`Expected next dispatch attempt ${previousAttempt + 1}`);
    }
    if (previousDispatch) {
      const retry = events.findLast((item) => (
        item.type === "retry.recorded"
        && item.issueId === event.issueId
        && item.attempt === previousAttempt
      ));
      if (!retry) throw new TypeError("A later dispatch attempt requires one matching retry fact");
      const authorizedTaskRef = retry.replacement?.nextTaskRef ?? previousDispatch.taskRef;
      if (!sameTaskRef(event.taskRef, authorizedTaskRef)) {
        throw new TypeError("Dispatch taskRef is not authorized by the matching retry fact");
      }
    }
  }
  if (event.type === "execution.started") {
    const dispatch = events.find(item => item.type === "dispatch.recorded" && item.issueId === event.issueId
      && event.phaseIdentity === `dispatch:${item.sequence}` && sameTaskRef(item.taskRef, event.taskRef));
    const repair = events.find(item => item.type === "repair.recorded" && item.issueId === event.issueId
      && item.requestIdentity === event.phaseIdentity && sameTaskRef(item.taskRef, event.taskRef));
    const recovery = events.find(item => item.type === "recovery.intent" && item.issueId === event.issueId
      && ["CONTINUE", "REPAIR"].includes(item.phase) && item.requestIdentity === event.phaseIdentity);
    const recoveryTask = recovery && events.find(item => item.type === "recovery.task" && item.issueId === event.issueId
      && item.requestIdentity === recovery.requestIdentity && sameTaskRef(item.taskRef, event.taskRef));
    const upgrade = events.find(item => item.type === "model.upgrade" && item.issueId === event.issueId
      && item.requestIdentity === event.phaseIdentity && sameTaskRef(item.taskRef, event.taskRef));
    const phaseOwner = event.phase === "IMPLEMENTATION"
      ? dispatch?.attempt === 1
      : event.phase === "IMPLEMENTATION_RETRY"
        ? dispatch?.attempt > 1
        : event.phase === "CONFLICT_REPAIR"
          ? Boolean(repair)
          : Boolean(recoveryTask || upgrade);
    const duplicate = events.some(item => item.type === "execution.started" && item.issueId === event.issueId
      && item.phaseIdentity === event.phaseIdentity);
    const active = events.findLast(item => item.type === "execution.started" && item.issueId === event.issueId
      && !events.some(candidate => candidate.type === "execution.observed" && candidate.startSequence === item.sequence
        && candidate.state === "SETTLED"));
    if (!phaseOwner || duplicate || active) {
      throw new TypeError("Execution start requires its exact owned action, unique phase, and no active predecessor");
    }
  }
  if (event.type === "execution.observed") {
    const started = events.find(item => item.type === "execution.started" && item.sequence === event.startSequence);
    const previous = events.filter(item => item.type === "execution.observed" && item.startSequence === event.startSequence);
    if (!started || started.issueId !== event.issueId) throw new TypeError("Execution observation requires its exact Issue start");
    if (previous.some(item => item.state === "SETTLED")) throw new TypeError("Execution interval is already settled");
    if (event.elapsedMs < (previous.at(-1)?.elapsedMs ?? 0)) throw new TypeError("Execution elapsed time cannot decrease or reset");
  }
  if (event.type === "execution.uncertain") {
    const started = events.find(item => item.type === "execution.started" && item.sequence === event.startSequence);
    const latestEvidence = events.findLast(item => ["execution.observed", "execution.uncertain"].includes(item.type)
      && item.startSequence === event.startSequence);
    const duplicate = latestEvidence?.type === "execution.uncertain";
    const settled = events.some(item => item.type === "execution.observed" && item.startSequence === event.startSequence
      && item.state === "SETTLED");
    if (!started || started.issueId !== event.issueId || duplicate || settled) {
      throw new TypeError("Uncertain execution requires one unsettled exact Issue start");
    }
  }
  if (event.type === "execution.exhausted") {
    const previous = events.filter(item => item.type === "execution.exhausted" && item.issueId === event.issueId);
    const summary = summarizeIssueExecutionBudget(events, event.issueId);
    if (previous.length > 0 || summary.consumedMs !== event.consumedMs || summary.consumedMs < ISSUE_EXECUTION_LIMIT_MS) {
      throw new TypeError("Execution exhaustion must record the exact first cumulative six-hour crossing");
    }
  }
  if (event.type === "retry.recorded") {
    const dispatched = events.find((item) => (
      item.type === "dispatch.recorded" && item.issueId === event.issueId && item.attempt === event.attempt
    ));
    const duplicate = events.some((item) => (
      item.type === "retry.recorded" && item.issueId === event.issueId && item.attempt === event.attempt
    ));
    if (!dispatched || duplicate) throw new TypeError("Retry facts require one matching dispatch attempt");
    if (!sameTaskRef(event.priorTaskRef, dispatched.taskRef)) {
      throw new TypeError("Retry priorTaskRef must match the dispatched attempt");
    }
    if (event.replacement) {
      const nextKey = taskRefKey(event.replacement.nextTaskRef);
      const alreadyBound = events.some((item) => (
        (item.type === "dispatch.recorded" && taskRefKey(item.taskRef) === nextKey)
        || (item.type === "retry.recorded" && item.replacement
          && taskRefKey(item.replacement.nextTaskRef) === nextKey)
      ));
      if (alreadyBound) {
        throw new TypeError("A replacement nextTaskRef must be new to this Run and cannot revive a superseded task");
      }
    }
  }
  if (event.type === "remediation.recorded") {
    const latestDispatch = events.findLast((item) => (
      item.type === "dispatch.recorded" && item.issueId === event.issueId
    ));
    if (!latestDispatch) {
      throw new TypeError("Remediation requires one preceding dispatch for the same Issue");
    }
    const attempt = event.attempt ?? latestDispatch.attempt;
    if (attempt !== latestDispatch.attempt) {
      throw new TypeError(`Remediation attempt must match current dispatch attempt ${latestDispatch.attempt}`);
    }
    let precedingAttempt = null;
    const duplicate = events.some((item) => {
      if (item.type === "dispatch.recorded" && item.issueId === event.issueId) {
        precedingAttempt = item.attempt;
        return false;
      }
      return item.type === "remediation.recorded"
        && item.issueId === event.issueId
        && item.fingerprint === event.fingerprint
        && (item.attempt ?? precedingAttempt) === attempt;
    });
    if (duplicate) {
      throw new TypeError(`Only one remediation cycle is allowed per exact fingerprint in dispatch attempt ${attempt}`);
    }
  }
  if (["repository-close-wait.started", "target-writer-wait.started"].includes(event.type)) {
    const eventPrefix = event.type.split(".")[0];
    const settledType = `${eventPrefix}.settled`;
    const activeWait = events.findLast((item) => item.type === event.type
      && !events.some((candidate) => (
        candidate.type === settledType && candidate.waitSequence === item.sequence
      )));
    if (activeWait) throw new TypeError(`Close wait ${activeWait.sequence} is already active`);
    const grant = events.findLast(({ type }) => type === "grant.recorded");
    if (grant?.runIdentity?.target !== event.target) {
      throw new TypeError("Close wait target must match the Run Grant");
    }
    if (immutableRunIdentityKeys.some((key) => (
      event.preWaitEvidence.runIdentity[key] !== grant.runIdentity[key]
      || event.preWaitEvidence.grant.runIdentity[key] !== grant.runIdentity[key]
    )) || event.preWaitEvidence.grant.maxParallel !== (grant.maxParallel ?? DEFAULT_MAX_PARALLEL)
      || event.preWaitEvidence.target.state === undefined
      || event.preWaitEvidence.runIdentity.target !== event.target) {
      throw new TypeError("Close pre-wait evidence must match the current Run Grant and target");
    }
  }
  if (["repository-close-wait.settled", "target-writer-wait.settled"].includes(event.type)) {
    const startedType = `${event.type.split(".")[0]}.started`;
    const started = events.find((item) => (
      item.type === startedType && item.sequence === event.waitSequence
    ));
    const duplicate = events.some((item) => (
      item.type === event.type && item.waitSequence === event.waitSequence
    ));
    if (!started || duplicate) throw new TypeError("Close wait settlement requires one active start");
    if (started.issueId !== event.issueId || started.target !== event.target
      || !sameTargetWriterOwner(started.owner, event.owner)) {
      throw new TypeError("Close wait settlement must match its exact start");
    }
    if (requireIsoInstant(event.at, "target-writer wait settlement timestamp")
      < requireIsoInstant(started.at, "target-writer wait start timestamp")) {
      throw new TypeError("Close wait cannot settle before it starts");
    }
    if (event.outcome === "TIMED_OUT"
      && Date.parse(event.at) - Date.parse(started.at) < started.timeoutMs) {
      throw new TypeError("Close wait cannot time out before its bound");
    }
  }
  if (["pause.transitioned", "stop.transitioned"].includes(event.type)) {
    const expectedCommand = event.type === "pause.transitioned" ? "PAUSE" : "STOP";
    const latestControl = events.findLast(({ type }) => type === "control.revised");
    const duplicate = events.some((item) => item.type === event.type && item.revision === event.revision);
    if (duplicate || latestControl?.command !== expectedCommand || latestControl.revision !== event.revision) {
      throw new TypeError(`Transition requires one matching ${expectedCommand} control revision`);
    }
  }
}

export function validateJournal(events, options = {}) {
  if (!Array.isArray(events)) throw new TypeError("Run journal must be an array");
  const validated = [];
  for (const [index, event] of events.entries()) {
    if (!isRecord(event) || event.schema !== EVENT_SCHEMA || event.sequence !== index + 1) {
      throw new TypeError(`Invalid journal event at sequence ${index + 1}`);
    }
    const { schema: _schema, sequence: _sequence, ...draft } = event;
    validateEventDraft(draft, { allowLegacyRemediation: true });
    validateEventSemantics(validated, draft, options);
    validated.push(event);
  }
  return events;
}

export function summarizeIssueExecutionBudget(events, issueId) {
  const starts = events.filter(event => event.type === "execution.started" && event.issueId === issueId);
  let consumedMs = 0;
  let activeStartSequence = null;
  for (const started of starts) {
    const observations = events.filter(event => event.type === "execution.observed"
      && event.issueId === issueId && event.startSequence === started.sequence);
    consumedMs += observations.at(-1)?.elapsedMs ?? 0;
    if (!observations.some(event => event.state === "SETTLED")) activeStartSequence = started.sequence;
  }
  const latestActiveEvidence = activeStartSequence === null ? null : events.findLast(event => (
    ["execution.observed", "execution.uncertain"].includes(event.type)
      && event.issueId === issueId && event.startSequence === activeStartSequence
  ));
  const uncertain = latestActiveEvidence?.type === "execution.uncertain";
  const exhausted = consumedMs >= ISSUE_EXECUTION_LIMIT_MS
    || events.some(event => event.type === "execution.exhausted" && event.issueId === issueId);
  return {
    limitMs: ISSUE_EXECUTION_LIMIT_MS,
    consumedMs,
    state: exhausted ? "EXHAUSTED" : uncertain ? "UNKNOWN" : activeStartSequence === null ? "AVAILABLE" : "ACTIVE",
    activeStartSequence,
  };
}
