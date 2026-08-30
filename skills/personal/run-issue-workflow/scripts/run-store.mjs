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

import { reduceRun, STATUS_SCHEMA } from "./run-core.mjs";
import {
  EVENT_SCHEMA,
  normalizeEventDraft,
  RUN_EVENT_TYPES,
  validateEventDraft,
  validateEventSemantics,
  validateJournal,
} from "./run-journal.mjs";

export { EVENT_SCHEMA, RUN_EVENT_TYPES };
export const CLEANUP_SCHEMA = "dag-run-cleanup:v1";
export const CLEANUP_PREVIEW_SCHEMA = "dag-run-cleanup-preview:v1";
export const LOCK_OWNER_SCHEMA = "dag-run-lock-owner:v1";

const runIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const staleProofFields = new Set([
  "previousCoordinatorInstanceId",
  "coordinatorState",
  "reconciled",
  "evidence",
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

const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} is required`);
};

const isText = (value) => typeof value === "string" && value.length > 0;

const validateStaleProof = (proof) => {
  assertExactFields(proof, staleProofFields, "stale-owner proof");
  requireText(proof.previousCoordinatorInstanceId, "stale-owner previousCoordinatorInstanceId");
  if (proof.coordinatorState !== "INACTIVE" || proof.reconciled !== true
    || !Array.isArray(proof.evidence) || proof.evidence.length === 0 || !proof.evidence.every(isText)) {
    throw new TypeError("Reclaim requires reconciled INACTIVE coordinator evidence");
  }
};

export function createRunStore({ gitCommonDir, coordinatorInstanceId = randomUUID() }) {
  requireText(coordinatorInstanceId, "coordinatorInstanceId");
  const controlRoot = join(resolve(gitCommonDir), "matt-workflow-control");
  const runsRoot = join(controlRoot, "runs");
  const cleanupPath = join(controlRoot, "cleanup.jsonl");
  const cleanupLock = join(controlRoot, "cleanup.lock");
  const closeWritersRoot = join(controlRoot, "close-writers");

  const writeLockOwner = (ownerPath, owner) => {
    const descriptor = openSync(ownerPath, "wx");
    try {
      writeAll(descriptor, `${JSON.stringify(owner)}\n`);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  };

  const readLockOwner = (ownerPath, kind) => {
    const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
    const allowed = new Set(["schema", "kind", "runId", "coordinatorInstanceId"]);
    if (kind === "close") allowed.add("target");
    assertExactFields(owner, allowed, `${kind} lock owner`);
    if (owner.schema !== LOCK_OWNER_SCHEMA || owner.kind !== kind) {
      throw new TypeError(`Invalid ${kind} lock owner schema`);
    }
    assertSafeRunId(owner.runId);
    requireText(owner.coordinatorInstanceId, `${kind} lock coordinatorInstanceId`);
    if (kind === "close") requireText(owner.target, "close lock target");
    return owner;
  };

  const pathsFor = (runId) => {
    assertSafeRunId(runId);
    const runDir = join(runsRoot, runId);
    return {
      runDir,
      events: join(runDir, "events.jsonl"),
      status: join(runDir, "status.json"),
      lock: join(runDir, "engine.lock"),
      lockOwner: join(runDir, "engine.lock", "owner.json"),
      reclaimLock: join(runDir, "engine-reclaim.lock"),
    };
  };

  const closePathsFor = (target) => {
    requireText(target, "close writer target");
    const targetKey = createHash("sha256").update(target).digest("hex");
    const lock = join(closeWritersRoot, `${targetKey}.lock`);
    return {
      lock,
      owner: join(lock, "owner.json"),
      reclaimLock: join(closeWritersRoot, `${targetKey}.reclaim.lock`),
    };
  };

  const readEvents = (runId) => {
    const { events: eventsPath } = pathsFor(runId);
    if (!existsSync(eventsPath)) return [];
    const lines = readFileSync(eventsPath, "utf8").split(/\r?\n/gu).filter(Boolean);
    const events = lines.map((line) => {
      const event = JSON.parse(line);
      assertNoToken(event);
      return event;
    });
    validateJournal(events, { storageRunId: runId });
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
      .filter((run) => existsSync(pathsFor(run.runId).runDir)
        && ["SUCCEEDED", "STOPPED"].includes(run.state)
        && Number.isFinite(Date.parse(run.terminalAt)))
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

  const writerHandle = (runId, paths) => {
    let active = true;
    const requireActive = () => {
      if (!active) throw new Error("RUN_WRITER_RELEASED");
    };

    return {
      append(eventDraft) {
        requireActive();
        assertNoToken(eventDraft);
        const normalizedDraft = normalizeEventDraft(eventDraft);
        validateEventDraft(normalizedDraft);
        const events = readEvents(runId);
        validateEventSemantics(events, normalizedDraft, { storageRunId: runId });
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
        unlinkSync(paths.lockOwner);
        rmdirSync(paths.lock);
        active = false;
      },
    };
  };

  const installWriterLock = (runId, paths) => {
    if (existsSync(cleanupLock)) throw new Error("CLEANUP_IN_PROGRESS");
    if (existsSync(paths.reclaimLock)) throw new Error("RUN_WRITER_RECLAIM_IN_PROGRESS");
    mkdirSync(paths.runDir, { recursive: true });
    try {
      mkdirSync(paths.lock);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("RUN_WRITER_LOCKED");
      throw error;
    }
    try {
      writeLockOwner(paths.lockOwner, {
        schema: LOCK_OWNER_SCHEMA,
        kind: "engine",
        runId,
        coordinatorInstanceId,
      });
    } catch (error) {
      rmSync(paths.lock, { recursive: true, force: true });
      throw error;
    }
    if (existsSync(cleanupLock) || existsSync(paths.reclaimLock) || !existsSync(paths.lockOwner)) {
      rmSync(paths.lock, { recursive: true, force: true });
      throw new Error(existsSync(cleanupLock) ? "CLEANUP_IN_PROGRESS" : "RUN_WRITER_RECLAIM_IN_PROGRESS");
    }
  };

  const acquireWriter = (runId) => {
    const paths = pathsFor(runId);
    installWriterLock(runId, paths);
    return writerHandle(runId, paths);
  };

  const readWriterLock = (runId) => {
    const paths = pathsFor(runId);
    if (!existsSync(paths.lock)) return null;
    try {
      const owner = readLockOwner(paths.lockOwner, "engine");
      if (owner.runId !== runId) throw new TypeError("Engine lock owner does not match its storage Run");
      return owner;
    } catch {
      return { schema: LOCK_OWNER_SCHEMA, kind: "engine", runId, state: "UNKNOWN" };
    }
  };

  const reclaimWriter = ({ runId, staleProof }) => {
    const paths = pathsFor(runId);
    validateStaleProof(staleProof);
    mkdirSync(paths.runDir, { recursive: true });
    try {
      mkdirSync(paths.reclaimLock);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("RUN_WRITER_RECLAIM_IN_PROGRESS");
      throw error;
    }
    try {
      const previous = readLockOwner(paths.lockOwner, "engine");
      if (previous.runId !== runId
        || previous.coordinatorInstanceId !== staleProof.previousCoordinatorInstanceId) {
        throw new Error("RUN_WRITER_STALE_PROOF_MISMATCH");
      }
      rmSync(paths.lock, { recursive: true, force: false });
      mkdirSync(paths.lock);
      writeLockOwner(paths.lockOwner, {
        schema: LOCK_OWNER_SCHEMA,
        kind: "engine",
        runId,
        coordinatorInstanceId,
      });
    } finally {
      rmdirSync(paths.reclaimLock);
    }
    return writerHandle(runId, paths);
  };

  const acquireCloseWriter = ({ target, runId }) => {
    assertSafeRunId(runId);
    const paths = closePathsFor(target);
    mkdirSync(closeWritersRoot, { recursive: true });
    if (existsSync(paths.reclaimLock)) throw new Error("TARGET_CLOSE_WRITER_RECLAIM_IN_PROGRESS");
    try {
      mkdirSync(paths.lock);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("TARGET_CLOSE_WRITER_LOCKED");
      throw error;
    }
    try {
      writeLockOwner(paths.owner, {
        schema: LOCK_OWNER_SCHEMA,
        kind: "close",
        target,
        runId,
        coordinatorInstanceId,
      });
    } catch (error) {
      rmSync(paths.lock, { recursive: true, force: true });
      throw error;
    }
    if (existsSync(paths.reclaimLock)) {
      rmSync(paths.lock, { recursive: true, force: true });
      throw new Error("TARGET_CLOSE_WRITER_RECLAIM_IN_PROGRESS");
    }
    return closeWriterHandle(target, runId, paths);
  };

  const closeWriterHandle = (target, runId, paths) => {
    let active = true;
    return {
      target,
      runId,
      release() {
        if (!active) throw new Error("TARGET_CLOSE_WRITER_RELEASED");
        unlinkSync(paths.owner);
        rmdirSync(paths.lock);
        active = false;
      },
    };
  };

  const readCloseWriterLock = (target) => {
    const paths = closePathsFor(target);
    if (!existsSync(paths.lock)) return null;
    try {
      const owner = readLockOwner(paths.owner, "close");
      if (owner.target !== target) throw new TypeError("Close lock target hash collision");
      return owner;
    } catch {
      return { schema: LOCK_OWNER_SCHEMA, kind: "close", target, state: "UNKNOWN" };
    }
  };

  const readCloseWriter = (target) => {
    const owner = readCloseWriterLock(target);
    if (owner === null) return null;
    return owner.runId ?? "UNKNOWN";
  };

  const reclaimCloseWriter = ({ target, runId, staleProof }) => {
    assertSafeRunId(runId);
    validateStaleProof(staleProof);
    const paths = closePathsFor(target);
    mkdirSync(closeWritersRoot, { recursive: true });
    try {
      mkdirSync(paths.reclaimLock);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("TARGET_CLOSE_WRITER_RECLAIM_IN_PROGRESS");
      throw error;
    }
    try {
      const previous = readLockOwner(paths.owner, "close");
      if (previous.target !== target || previous.runId !== runId
        || previous.coordinatorInstanceId !== staleProof.previousCoordinatorInstanceId) {
        throw new Error("TARGET_CLOSE_WRITER_STALE_PROOF_MISMATCH");
      }
      rmSync(paths.lock, { recursive: true, force: false });
      mkdirSync(paths.lock);
      writeLockOwner(paths.owner, {
        schema: LOCK_OWNER_SCHEMA,
        kind: "close",
        target,
        runId,
        coordinatorInstanceId,
      });
    } finally {
      rmdirSync(paths.reclaimLock);
    }
    return closeWriterHandle(target, runId, paths);
  };

  return {
    acquireWriter,
    reclaimWriter,
    readWriterLock,
    acquireCloseWriter,
    reclaimCloseWriter,
    readCloseWriter,
    readCloseWriterLock,
    readEvents,
    readStatus,
    readCleanupRecords,
    previewCleanup,
    applyCleanup,
  };
}

const compareRunIds = (left, right) => String(left).localeCompare(String(right), "en");
