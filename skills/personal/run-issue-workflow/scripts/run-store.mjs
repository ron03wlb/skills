import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { CONTROL_COMMANDS, reduceRun, STATUS_SCHEMA } from "./run-core.mjs";

export const EVENT_SCHEMA = "dag-run-event:v1";
export const CLEANUP_SCHEMA = "dag-run-cleanup:v1";
export const CLEANUP_PREVIEW_SCHEMA = "dag-run-cleanup-preview:v1";
export const RUN_EVENT_TYPES = Object.freeze([
  "grant.recorded",
  "control.revised",
  "dispatch.recorded",
  "retry.recorded",
  "remediation.recorded",
  "pause.transitioned",
  "stop.transitioned",
]);

const allowedEventTypes = new Set(RUN_EVENT_TYPES);
const runIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const controlCommands = new Set(CONTROL_COMMANDS);
const immutableRunIdentityKeys = [
  "runId",
  "specId",
  "approvedScopeHash",
  "target",
  "classification",
  "decompositionIdentity",
];
const defaultMaxParallel = 3;
const eventFields = new Map([
  ["grant.recorded", new Set(["type", "at", "runIdentity", "maxParallel"])],
  ["control.revised", new Set(["type", "at", "revision", "command"])],
  ["dispatch.recorded", new Set(["type", "at", "issueId", "attempt", "taskRef"])],
  ["retry.recorded", new Set(["type", "at", "issueId", "attempt", "reason"])],
  ["remediation.recorded", new Set(["type", "at", "issueId", "fingerprint", "cycle", "adapter"])],
  ["pause.transitioned", new Set(["type", "at", "revision"])],
  ["stop.transitioned", new Set(["type", "at", "revision"])],
]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const assertExactFields = (value, allowed, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
};

const assertSafeRunId = (runId) => {
  if (typeof runId !== "string" || !runIdPattern.test(runId) || runId === "." || runId === "..") {
    throw new TypeError("runId must be one safe path segment");
  }
};

const assertNoToken = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase().includes("token")) {
      throw new TypeError("Per-run control token fields must never be persisted");
    }
    assertNoToken(child, seen);
  }
};

const writeAll = (descriptor, text) => {
  const content = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < content.length) {
    const written = writeSync(descriptor, content, offset, content.length - offset, null);
    if (written <= 0) throw new Error("Unable to complete durable write");
    offset += written;
  }
};

const durableAppend = (path, text) => {
  const descriptor = openSync(path, "a");
  try {
    writeAll(descriptor, text);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

const requirePositiveInteger = (value, label, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} must be an integer from 1 through ${maximum}`);
  }
};

const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} is required`);
};

const validateEventDraft = (event) => {
  if (!isRecord(event)) throw new TypeError("Journal event must be an object");
  if (Object.hasOwn(event, "schema") || Object.hasOwn(event, "sequence")) {
    throw new TypeError("Journal schema and sequence are store-owned");
  }
  const allowedFields = eventFields.get(event.type);
  if (!allowedFields) throw new TypeError(`Unsupported event type: ${event.type}`);
  assertExactFields(event, allowedFields, `${event.type} event`);
  if (typeof event.at !== "string" || Number.isNaN(Date.parse(event.at))) {
    throw new TypeError("Journal events require an ISO timestamp");
  }
  switch (event.type) {
    case "grant.recorded":
      assertExactFields(event.runIdentity, new Set(immutableRunIdentityKeys), "grant runIdentity");
      for (const key of ["runId", "specId", "approvedScopeHash", "target", "classification"]) {
        requireText(event.runIdentity?.[key], `grant runIdentity.${key}`);
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
      assertExactFields(event.taskRef, new Set(["threadId", "hostId"]), "dispatch taskRef");
      requireText(event.issueId, "dispatch issueId");
      requirePositiveInteger(event.attempt, "dispatch attempt", 3);
      requireText(event.taskRef?.threadId, "dispatch taskRef.threadId");
      requireText(event.taskRef?.hostId, "dispatch taskRef.hostId");
      break;
    case "retry.recorded":
      requireText(event.issueId, "retry issueId");
      requirePositiveInteger(event.attempt, "retry attempt", 3);
      requireText(event.reason, "retry reason");
      break;
    case "remediation.recorded":
      requireText(event.issueId, "remediation issueId");
      requireText(event.fingerprint, "remediation fingerprint");
      requirePositiveInteger(event.cycle, "remediation cycle", 1);
      requireText(event.adapter, "remediation adapter");
      break;
    case "pause.transitioned":
    case "stop.transitioned":
      requirePositiveInteger(event.revision, "transition revision");
      break;
    default:
      throw new TypeError(`Unsupported event type: ${event.type}`);
  }
};

const validateEventSemantics = (events, event) => {
  if (event.type === "grant.recorded") {
    const previous = events.findLast(({ type }) => type === "grant.recorded");
    if (previous) {
      if (immutableRunIdentityKeys.some((key) => previous.runIdentity[key] !== event.runIdentity[key])) {
        throw new TypeError("A renewed grant must preserve the Run identity");
      }
      if ((previous.maxParallel ?? defaultMaxParallel) !== (event.maxParallel ?? defaultMaxParallel)) {
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
    const previousAttempt = events
      .filter(({ type, issueId }) => type === "dispatch.recorded" && issueId === event.issueId)
      .reduce((maximum, item) => Math.max(maximum, item.attempt), 0);
    if (event.attempt !== previousAttempt + 1) {
      throw new TypeError(`Expected next dispatch attempt ${previousAttempt + 1}`);
    }
  }
  if (event.type === "retry.recorded") {
    const dispatched = events.some((item) => (
      item.type === "dispatch.recorded" && item.issueId === event.issueId && item.attempt === event.attempt
    ));
    const duplicate = events.some((item) => (
      item.type === "retry.recorded" && item.issueId === event.issueId && item.attempt === event.attempt
    ));
    if (!dispatched || duplicate) throw new TypeError("Retry facts require one matching dispatch attempt");
  }
  if (event.type === "remediation.recorded") {
    const duplicate = events.some((item) => (
      item.type === "remediation.recorded"
      && item.issueId === event.issueId
      && item.fingerprint === event.fingerprint
    ));
    if (duplicate) throw new TypeError("Only one remediation cycle is allowed per exact fingerprint");
  }
  if (["pause.transitioned", "stop.transitioned"].includes(event.type)) {
    const expectedCommand = event.type === "pause.transitioned" ? "PAUSE" : "STOP";
    const latestControl = events.findLast(({ type }) => type === "control.revised");
    const duplicate = events.some((item) => item.type === event.type && item.revision === event.revision);
    if (duplicate || latestControl?.command !== expectedCommand || latestControl.revision !== event.revision) {
      throw new TypeError(`Transition requires one matching ${expectedCommand} control revision`);
    }
  }
};

export function createRunStore({ gitCommonDir }) {
  const controlRoot = join(resolve(gitCommonDir), "matt-workflow-control");
  const runsRoot = join(controlRoot, "runs");
  const cleanupPath = join(controlRoot, "cleanup.jsonl");
  const cleanupLock = join(controlRoot, "cleanup.lock");
  const closeWritersRoot = join(controlRoot, "close-writers");

  const pathsFor = (runId) => {
    assertSafeRunId(runId);
    const runDir = join(runsRoot, runId);
    return {
      runDir,
      events: join(runDir, "events.jsonl"),
      status: join(runDir, "status.json"),
      lock: join(runDir, "engine.lock"),
    };
  };

  const readEvents = (runId) => {
    const { events: eventsPath } = pathsFor(runId);
    if (!existsSync(eventsPath)) return [];
    const lines = readFileSync(eventsPath, "utf8").split(/\r?\n/gu).filter(Boolean);
    const events = [];
    for (const [index, line] of lines.entries()) {
      const event = JSON.parse(line);
      assertNoToken(event);
      if (!isRecord(event) || event.schema !== EVENT_SCHEMA || event.sequence !== index + 1
        || !allowedEventTypes.has(event.type)) {
        throw new Error(`Invalid journal event at sequence ${index + 1}`);
      }
      const { schema: _schema, sequence: _sequence, ...draft } = event;
      validateEventDraft(draft);
      validateEventSemantics(events, draft);
      events.push(event);
    }
    return events;
  };

  const readStatus = (runId) => {
    const { status } = pathsFor(runId);
    if (!existsSync(status)) return null;
    const projection = JSON.parse(readFileSync(status, "utf8"));
    assertNoToken(projection);
    if (projection.schema !== STATUS_SCHEMA) throw new Error("Invalid status projection schema");
    return projection;
  };

  const readCleanupRecords = () => {
    if (!existsSync(cleanupPath)) return [];
    return readFileSync(cleanupPath, "utf8")
      .split(/\r?\n/gu)
      .filter(Boolean)
      .map((line, index) => {
        const record = JSON.parse(line);
        if (record.schema !== CLEANUP_SCHEMA || record.sequence !== index + 1) {
          throw new Error(`Invalid cleanup record at sequence ${index + 1}`);
        }
        return record;
      });
  };

  const previewCleanup = ({ now, runs }) => {
    const evaluatedAt = Date.parse(now);
    if (!Number.isFinite(evaluatedAt) || !Array.isArray(runs)) {
      throw new TypeError("Cleanup preview requires an ISO time and normalized Run evidence");
    }
    const seenRunIds = new Set();
    for (const run of runs) {
      if (!isRecord(run)) throw new TypeError("Cleanup evidence entries must be objects");
      assertSafeRunId(run.runId);
      if (seenRunIds.has(run.runId)) {
        throw new TypeError(`Cleanup evidence contains duplicate runId ${run.runId}`);
      }
      seenRunIds.add(run.runId);
    }
    const knownRuns = [...runs].sort((left, right) => compareRunIds(left.runId, right.runId));
    const terminal = knownRuns
      .filter((run) => ["SUCCEEDED", "STOPPED"].includes(run.state) && Number.isFinite(Date.parse(run.terminalAt)))
      .sort((left, right) => Date.parse(right.terminalAt) - Date.parse(left.terminalAt)
        || compareRunIds(left.runId, right.runId));
    const newestTen = new Set(terminal.slice(0, 10).map(({ runId }) => runId));
    const eligible = [];
    const skipped = [];

    for (const run of knownRuns) {
      assertSafeRunId(run.runId);
      const { runDir, lock } = pathsFor(run.runId);
      let reason;
      if (!existsSync(runDir)) reason = "run_directory_absent";
      else if (!["SUCCEEDED", "STOPPED"].includes(run.state)) reason = "non_terminal";
      else if (!Number.isFinite(Date.parse(run.terminalAt))) reason = "terminal_state_uncertain";
      else if (run.engineLock !== "RELEASED" || existsSync(lock)) reason = "engine_active_or_uncertain";
      else if (run.activeTasks !== "ABSENT") reason = "tasks_active_or_uncertain";
      else if (evaluatedAt - Date.parse(run.terminalAt) <= 30 * 86_400_000) reason = "within_30_days";
      else if (newestTen.has(run.runId)) reason = "newest_10_terminal_runs";

      if (reason) {
        skipped.push({ runId: run.runId, reason });
      } else {
        eligible.push({
          runId: run.runId,
          specId: run.specId,
          state: run.state,
          terminalAt: run.terminalAt,
          reason: "older_than_30_days_and_outside_newest_10",
        });
      }
    }
    return { schema: CLEANUP_PREVIEW_SCHEMA, evaluatedAt: now, eligible, skipped };
  };

  const applyCleanup = ({ now, runs }) => {
    mkdirSync(controlRoot, { recursive: true });
    try {
      mkdirSync(cleanupLock);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("CLEANUP_WRITER_LOCKED");
      throw error;
    }
    const removed = [];
    let preview;
    try {
      preview = previewCleanup({ now, runs });
      let sequence = readCleanupRecords().length;
      for (const eligible of preview.eligible) {
        const record = {
          schema: CLEANUP_SCHEMA,
          sequence: ++sequence,
          runId: eligible.runId,
          specId: eligible.specId,
          terminalState: eligible.state,
          deletionTime: now,
          retentionReason: eligible.reason,
        };
        durableAppend(cleanupPath, `${JSON.stringify(record)}\n`);
        rmSync(pathsFor(eligible.runId).runDir, { recursive: true, force: false });
        removed.push(eligible.runId);
      }
    } finally {
      rmdirSync(cleanupLock);
    }
    return { schema: "dag-run-cleanup-result:v1", evaluatedAt: now, removed, skipped: preview.skipped };
  };

  const acquireWriter = (runId) => {
    const paths = pathsFor(runId);
    if (existsSync(cleanupLock)) throw new Error("CLEANUP_IN_PROGRESS");
    mkdirSync(paths.runDir, { recursive: true });
    try {
      mkdirSync(paths.lock);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("RUN_WRITER_LOCKED");
      throw error;
    }
    if (existsSync(cleanupLock) || !existsSync(paths.lock)) {
      try {
        rmdirSync(paths.lock);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      throw new Error("CLEANUP_IN_PROGRESS");
    }
    let active = true;
    const requireActive = () => {
      if (!active) throw new Error("RUN_WRITER_RELEASED");
    };

    return {
      append(eventDraft) {
        requireActive();
        assertNoToken(eventDraft);
        if (!allowedEventTypes.has(eventDraft.type)) {
          throw new TypeError(`Unsupported event type: ${eventDraft.type}`);
        }
        const normalizedDraft = eventDraft.type === "grant.recorded" && eventDraft.maxParallel === undefined
          ? { ...eventDraft, maxParallel: defaultMaxParallel }
          : eventDraft;
        validateEventDraft(normalizedDraft);
        const events = readEvents(runId);
        validateEventSemantics(events, normalizedDraft);
        const event = {
          ...normalizedDraft,
          schema: EVENT_SCHEMA,
          sequence: events.length + 1,
        };
        durableAppend(paths.events, `${JSON.stringify(event)}\n`);
        return event;
      },

      rebuildStatus(currentFacts) {
        requireActive();
        assertNoToken(currentFacts);
        const projection = reduceRun({ ...currentFacts, journal: readEvents(runId) });
        assertNoToken(projection);
        const temporary = `${paths.status}.tmp-${process.pid}-${randomUUID()}`;
        try {
          const descriptor = openSync(temporary, "wx");
          try {
            writeAll(descriptor, `${JSON.stringify(projection, null, 2)}\n`);
            fsyncSync(descriptor);
          } finally {
            closeSync(descriptor);
          }
          renameSync(temporary, paths.status);
        } finally {
          if (existsSync(temporary)) unlinkSync(temporary);
        }
        return projection;
      },

      release() {
        requireActive();
        rmdirSync(paths.lock);
        active = false;
      },
    };
  };

  const acquireCloseWriter = ({ target, runId }) => {
    requireText(target, "close writer target");
    assertSafeRunId(runId);
    const targetKey = createHash("sha256").update(target).digest("hex");
    const lock = join(closeWritersRoot, `${targetKey}.lock`);
    const owner = join(lock, "owner");
    mkdirSync(closeWritersRoot, { recursive: true });
    try {
      mkdirSync(lock);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("TARGET_CLOSE_WRITER_LOCKED");
      throw error;
    }
    try {
      const descriptor = openSync(owner, "wx");
      try {
        writeAll(descriptor, `${runId}\n`);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    } catch (error) {
      rmSync(lock, { recursive: true, force: true });
      throw error;
    }
    let active = true;
    return {
      target,
      runId,
      release() {
        if (!active) throw new Error("TARGET_CLOSE_WRITER_RELEASED");
        unlinkSync(owner);
        rmdirSync(lock);
        active = false;
      },
    };
  };

  const readCloseWriter = (target) => {
    requireText(target, "close writer target");
    const targetKey = createHash("sha256").update(target).digest("hex");
    const lock = join(closeWritersRoot, `${targetKey}.lock`);
    if (!existsSync(lock)) return null;
    try {
      const runId = readFileSync(join(lock, "owner"), "utf8").trim();
      assertSafeRunId(runId);
      return runId;
    } catch {
      return "UNKNOWN";
    }
  };

  return {
    acquireWriter,
    acquireCloseWriter,
    readCloseWriter,
    readEvents,
    readStatus,
    readCleanupRecords,
    previewCleanup,
    applyCleanup,
  };
}

const compareRunIds = (left, right) => String(left).localeCompare(String(right), "en");
