import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
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
const cleanupEvidenceFields = new Set([
  "runId",
  "specId",
  "state",
  "terminalAt",
  "engineLock",
  "activeTasks",
]);
const cleanupRecordFields = new Set([
  "schema",
  "sequence",
  "runId",
  "specId",
  "terminalState",
  "deletionTime",
  "retentionReason",
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

  const replaceLockOwner = (ownerPath, owner) => {
    const temporary = `${ownerPath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      writeLockOwner(temporary, owner);
      renameSync(temporary, ownerPath);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  };

  const readLockOwner = (ownerPath, kind) => {
    const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
    const allowed = new Set(["schema", "kind", "runId", "coordinatorInstanceId", "generation"]);
    if (kind.startsWith("close")) allowed.add("target");
    assertExactFields(owner, allowed, `${kind} lock owner`);
    if (owner.schema !== LOCK_OWNER_SCHEMA || owner.kind !== kind) {
      throw new TypeError(`Invalid ${kind} lock owner schema`);
    }
    assertSafeRunId(owner.runId);
    requireText(owner.coordinatorInstanceId, `${kind} lock coordinatorInstanceId`);
    requireText(owner.generation, `${kind} lock generation`);
    if (kind.startsWith("close")) requireText(owner.target, "close lock target");
    return owner;
  };

  const acquireRecoverableGate = ({ lockPath, owner, staleProof }) => {
    if (existsSync(lockPath)) {
      if (!staleProof) throw new Error("RECLAIM_GATE_LOCKED");
      validateStaleProof(staleProof);
      const previous = readLockOwner(join(lockPath, "owner.json"), owner.kind);
      if (previous.coordinatorInstanceId !== staleProof.previousCoordinatorInstanceId) {
        throw new Error("RECLAIM_GATE_STALE_PROOF_MISMATCH");
      }
      rmSync(lockPath, { recursive: true, force: false });
    }
    const candidate = `${lockPath}.candidate-${process.pid}-${randomUUID()}`;
    mkdirSync(candidate, { recursive: false });
    try {
      writeLockOwner(join(candidate, "owner.json"), owner);
      renameSync(candidate, lockPath);
    } catch (error) {
      rmSync(candidate, { recursive: true, force: true });
      if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(error?.code)) {
        throw new Error("RECLAIM_GATE_LOCKED");
      }
      throw error;
    }
    return () => {
      if (!existsSync(lockPath)) return;
      const current = readLockOwner(join(lockPath, "owner.json"), owner.kind);
      if (current.runId !== owner.runId || current.coordinatorInstanceId !== owner.coordinatorInstanceId
        || current.generation !== owner.generation || current.target !== owner.target) {
        throw new Error("RECLAIM_GATE_LEASE_FENCED");
      }
      rmSync(lockPath, { recursive: true, force: false });
    };
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
      operationRoot: runDir,
      operationPrefix: "engine-operation",
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
      operationRoot: closeWritersRoot,
      operationPrefix: `${targetKey}.operation`,
    };
  };

  const operationLocks = (paths, generation) => {
    if (!existsSync(paths.operationRoot)) return [];
    const prefix = `${paths.operationPrefix}.${generation}.`;
    return readdirSync(paths.operationRoot)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".lock"))
      .map((name) => join(paths.operationRoot, name));
  };

  const hasOperationLocks = (paths) => existsSync(paths.operationRoot)
    && readdirSync(paths.operationRoot).some((name) => (
      name.startsWith(`${paths.operationPrefix}.`) && name.endsWith(".lock")
    ));

  const withLease = ({ paths, kind, runId, target, generation }, operation) => {
    if (existsSync(paths.reclaimLock)) throw new Error("LOCK_LEASE_FENCED");
    const marker = join(
      paths.operationRoot,
      `${paths.operationPrefix}.${generation}.${randomUUID()}.lock`,
    );
    mkdirSync(marker);
    try {
      if (existsSync(paths.reclaimLock)) throw new Error("LOCK_LEASE_FENCED");
      const owner = readLockOwner(kind === "engine" ? paths.lockOwner : paths.owner, kind);
      if (owner.runId !== runId || owner.generation !== generation
        || owner.coordinatorInstanceId !== coordinatorInstanceId
        || (kind === "close" && owner.target !== target)) {
        throw new Error("LOCK_LEASE_FENCED");
      }
      return operation();
    } finally {
      rmSync(marker, { recursive: true, force: true });
    }
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
        assertExactFields(record, cleanupRecordFields, `cleanup record ${index + 1}`);
        if (record.schema !== CLEANUP_SCHEMA || record.sequence !== index + 1) {
          throw new Error(`Invalid cleanup record at sequence ${index + 1}`);
        }
        assertSafeRunId(record.runId);
        requireText(record.specId, `cleanup record ${index + 1} specId`);
        if (!["SUCCEEDED", "STOPPED"].includes(record.terminalState)
          || typeof record.deletionTime !== "string" || Number.isNaN(Date.parse(record.deletionTime))) {
          throw new Error(`Invalid cleanup record evidence at sequence ${index + 1}`);
        }
        requireText(record.retentionReason, `cleanup record ${index + 1} retentionReason`);
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
      assertExactFields(run, cleanupEvidenceFields, "cleanup evidence entry");
      assertSafeRunId(run.runId);
      requireText(run.specId, "cleanup evidence specId");
      requireText(run.state, "cleanup evidence state");
      if (run.terminalAt !== null && typeof run.terminalAt !== "string") {
        throw new TypeError("cleanup evidence terminalAt must be a timestamp or null");
      }
      if (!["RELEASED", "HELD", "UNKNOWN"].includes(run.engineLock)
        || !["ABSENT", "PRESENT", "UNKNOWN"].includes(run.activeTasks)) {
        throw new TypeError("cleanup evidence activity state is invalid");
      }
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
      const paths = pathsFor(run.runId);
      const { runDir, lock } = paths;
      let reason;
      if (!existsSync(runDir)) reason = "run_directory_absent";
      else if (!["SUCCEEDED", "STOPPED"].includes(run.state)) reason = "non_terminal";
      else if (!Number.isFinite(Date.parse(run.terminalAt))) reason = "terminal_state_uncertain";
      else if (run.engineLock !== "RELEASED" || existsSync(lock) || existsSync(paths.reclaimLock)
        || hasOperationLocks(paths)) reason = "engine_active_or_uncertain";
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

  const writerHandle = (runId, paths, generation) => {
    let active = true;
    const requireActive = () => {
      if (!active) throw new Error("RUN_WRITER_RELEASED");
    };

    return {
      append(eventDraft) {
        requireActive();
        return withLease({ paths, kind: "engine", runId, generation }, () => {
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
        });
      },

      rebuildStatus(currentFacts) {
        requireActive();
        return withLease({ paths, kind: "engine", runId, generation }, () => {
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
        });
      },

      release() {
        requireActive();
        return withLease({ paths, kind: "engine", runId, generation }, () => {
          unlinkSync(paths.lockOwner);
          rmdirSync(paths.lock);
          active = false;
        });
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
    const generation = randomUUID();
    try {
      writeLockOwner(paths.lockOwner, {
        schema: LOCK_OWNER_SCHEMA,
        kind: "engine",
        runId,
        coordinatorInstanceId,
        generation,
      });
    } catch (error) {
      rmSync(paths.lock, { recursive: true, force: true });
      throw error;
    }
    if (existsSync(cleanupLock) || existsSync(paths.reclaimLock) || !existsSync(paths.lockOwner)) {
      rmSync(paths.lock, { recursive: true, force: true });
      throw new Error(existsSync(cleanupLock) ? "CLEANUP_IN_PROGRESS" : "RUN_WRITER_RECLAIM_IN_PROGRESS");
    }
    return generation;
  };

  const acquireWriter = (runId) => {
    const paths = pathsFor(runId);
    const generation = installWriterLock(runId, paths);
    return writerHandle(runId, paths, generation);
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

  const reclaimWriter = ({ runId, staleProof, gateStaleProof }) => {
    const paths = pathsFor(runId);
    validateStaleProof(staleProof);
    if (existsSync(cleanupLock)) throw new Error("CLEANUP_IN_PROGRESS");
    mkdirSync(paths.runDir, { recursive: true });
    const gateGeneration = randomUUID();
    const releaseGate = acquireRecoverableGate({
      lockPath: paths.reclaimLock,
      staleProof: gateStaleProof,
      owner: {
        schema: LOCK_OWNER_SCHEMA,
        kind: "engine-reclaim",
        runId,
        coordinatorInstanceId,
        generation: gateGeneration,
      },
    });
    let generation;
    try {
      if (existsSync(cleanupLock)) throw new Error("CLEANUP_IN_PROGRESS");
      const previous = readLockOwner(paths.lockOwner, "engine");
      if (previous.runId !== runId
        || previous.coordinatorInstanceId !== staleProof.previousCoordinatorInstanceId) {
        throw new Error("RUN_WRITER_STALE_PROOF_MISMATCH");
      }
      for (const marker of operationLocks(paths, previous.generation)) {
        rmSync(marker, { recursive: true, force: true });
      }
      generation = randomUUID();
      replaceLockOwner(paths.lockOwner, {
        schema: LOCK_OWNER_SCHEMA,
        kind: "engine",
        runId,
        coordinatorInstanceId,
        generation,
      });
    } finally {
      releaseGate();
    }
    return writerHandle(runId, paths, generation);
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
    const generation = randomUUID();
    try {
      writeLockOwner(paths.owner, {
        schema: LOCK_OWNER_SCHEMA,
        kind: "close",
        target,
        runId,
        coordinatorInstanceId,
        generation,
      });
    } catch (error) {
      rmSync(paths.lock, { recursive: true, force: true });
      throw error;
    }
    if (existsSync(paths.reclaimLock)) {
      rmSync(paths.lock, { recursive: true, force: true });
      throw new Error("TARGET_CLOSE_WRITER_RECLAIM_IN_PROGRESS");
    }
    return closeWriterHandle(target, runId, paths, generation);
  };

  const closeWriterHandle = (target, runId, paths, generation) => {
    let active = true;
    return {
      target,
      runId,
      assertCurrent() {
        if (!active) throw new Error("TARGET_CLOSE_WRITER_RELEASED");
        return withLease({ paths, kind: "close", target, runId, generation }, () => true);
      },
      release() {
        if (!active) throw new Error("TARGET_CLOSE_WRITER_RELEASED");
        return withLease({ paths, kind: "close", target, runId, generation }, () => {
          unlinkSync(paths.owner);
          rmdirSync(paths.lock);
          active = false;
        });
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

  const reclaimCloseWriter = ({ target, runId, staleProof, gateStaleProof }) => {
    assertSafeRunId(runId);
    validateStaleProof(staleProof);
    const paths = closePathsFor(target);
    mkdirSync(closeWritersRoot, { recursive: true });
    const gateGeneration = randomUUID();
    const releaseGate = acquireRecoverableGate({
      lockPath: paths.reclaimLock,
      staleProof: gateStaleProof,
      owner: {
        schema: LOCK_OWNER_SCHEMA,
        kind: "close-reclaim",
        target,
        runId,
        coordinatorInstanceId,
        generation: gateGeneration,
      },
    });
    let generation;
    try {
      const previous = readLockOwner(paths.owner, "close");
      if (previous.target !== target || previous.runId !== runId
        || previous.coordinatorInstanceId !== staleProof.previousCoordinatorInstanceId) {
        throw new Error("TARGET_CLOSE_WRITER_STALE_PROOF_MISMATCH");
      }
      for (const marker of operationLocks(paths, previous.generation)) {
        rmSync(marker, { recursive: true, force: true });
      }
      generation = randomUUID();
      replaceLockOwner(paths.owner, {
        schema: LOCK_OWNER_SCHEMA,
        kind: "close",
        target,
        runId,
        coordinatorInstanceId,
        generation,
      });
    } finally {
      releaseGate();
    }
    return closeWriterHandle(target, runId, paths, generation);
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
