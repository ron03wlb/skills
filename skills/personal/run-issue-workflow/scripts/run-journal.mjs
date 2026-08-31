export const EVENT_SCHEMA = "dag-run-event:v1";
export const DEFAULT_MAX_PARALLEL = 3;
export const CONTROL_COMMANDS = Object.freeze(["PAUSE", "RESUME", "STOP"]);
export const RUN_EVENT_TYPES = Object.freeze([
  "grant.recorded",
  "control.revised",
  "dispatch.recorded",
  "retry.recorded",
  "remediation.recorded",
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
  ["grant.recorded", new Set(["type", "at", "runIdentity", "maxParallel"])],
  ["control.revised", new Set(["type", "at", "revision", "command"])],
  ["dispatch.recorded", new Set(["type", "at", "issueId", "attempt", "taskRef"])],
  ["retry.recorded", new Set([
    "type", "at", "issueId", "attempt", "reason", "priorTaskRef", "replacement",
  ])],
  ["remediation.recorded", new Set(["type", "at", "issueId", "attempt", "fingerprint", "cycle", "adapter"])],
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

const assertExactFields = (value, allowed, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
};

const validateTaskRef = (taskRef, label) => {
  assertExactFields(taskRef, new Set(["threadId", "hostId"]), label);
  requireText(taskRef.threadId, `${label}.threadId`);
  requireText(taskRef.hostId, `${label}.hostId`);
};

const sameTaskRef = (left, right) => left.threadId === right.threadId && left.hostId === right.hostId;
const taskRefKey = ({ hostId, threadId }) => JSON.stringify([hostId, threadId]);

export const normalizeEventDraft = (eventDraft) => (
  isRecord(eventDraft) && eventDraft.type === "grant.recorded" && eventDraft.maxParallel === undefined
    ? { ...eventDraft, maxParallel: DEFAULT_MAX_PARALLEL }
    : eventDraft
);

export function validateEventDraft(event) {
  if (!isRecord(event)) throw new TypeError("Journal event must be an object");
  if (Object.hasOwn(event, "schema") || Object.hasOwn(event, "sequence")) {
    throw new TypeError("Journal schema and sequence are store-owned");
  }
  const allowedFields = eventFields.get(event.type);
  if (!allowedFields) throw new TypeError(`Unsupported event type: ${String(event.type)}`);
  assertExactFields(event, allowedFields, `${event.type} event`);
  requireIsoInstant(event.at, "Journal event timestamp");
  switch (event.type) {
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
      if (event.attempt !== undefined) requirePositiveInteger(event.attempt, "remediation attempt", 3);
      requireText(event.fingerprint, "remediation fingerprint");
      requirePositiveInteger(event.cycle, "remediation cycle", 1);
      requireText(event.adapter, "remediation adapter");
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
    }
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
    validateEventDraft(draft);
    validateEventSemantics(validated, draft, options);
    validated.push(event);
  }
  return events;
}
