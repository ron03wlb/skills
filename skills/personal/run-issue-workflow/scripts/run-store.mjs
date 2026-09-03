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
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { reduceRun, STATUS_SCHEMA } from "./run-core.mjs";
import {
  EVENT_SCHEMA,
  normalizeEventDraft,
  RUN_EVENT_TYPES,
  requireIsoInstant,
  validateEventDraft,
  validateEventSemantics,
  validateJournal,
} from "./run-journal.mjs";
import { validateStaleOwnerProof } from "./run-stale-proof.mjs";

export { EVENT_SCHEMA, RUN_EVENT_TYPES };
export const CLEANUP_SCHEMA = "dag-run-cleanup:v1";
export const CLEANUP_PREVIEW_SCHEMA = "dag-run-cleanup-preview:v1";
export const LOCK_OWNER_SCHEMA = "dag-run-lock-owner:v1";

const runIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
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

const syncDirectory = (directory) => {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch (error) {
    // Node cannot fsync directory handles on Windows; file fsync still precedes every metadata change.
    if (!(process.platform === "win32" && error?.code === "EPERM")) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

const syncParent = (path) => syncDirectory(dirname(path));

const durableAppend = (path, text) => {
  const descriptor = openSync(path, "a");
  try {
    writeAll(descriptor, text);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  syncParent(path);
};

const requireText = (value, label) => {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} is required`);
};

const isText = (value) => typeof value === "string" && value.length > 0;

export function createRunStore({ gitCommonDir, coordinatorInstanceId = randomUUID() }) {
  requireText(coordinatorInstanceId, "coordinatorInstanceId");
  const controlRoot = join(resolve(gitCommonDir), "matt-workflow-control");
  const runsRoot = join(controlRoot, "runs");
  const cleanupPath = join(controlRoot, "cleanup.jsonl");
  const cleanupLock = join(controlRoot, "cleanup.lock");
  // Keep the legacy directory so existing close-writer leases remain visible to every generic caller.
  const targetMutationWritersRoot = join(controlRoot, "close-writers");
  const repositoryCloseLeaseLock = join(controlRoot, "repository-close.lock");
  const repositoryCloseLeasePaths = {
    lock: repositoryCloseLeaseLock,
    owner: join(repositoryCloseLeaseLock, "owner.json"),
    reclaimLock: join(controlRoot, "repository-close-reclaim.lock"),
    operationRoot: repositoryCloseLeaseLock,
    operationPrefix: "operation",
  };

  const writeLockOwner = (ownerPath, owner) => {
    const descriptor = openSync(ownerPath, "wx");
    try {
      writeAll(descriptor, `${JSON.stringify(owner)}\n`);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    syncParent(ownerPath);
  };

  const replaceLockOwner = (ownerPath, owner) => {
    const temporary = `${ownerPath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      writeLockOwner(temporary, owner);
      renameSync(temporary, ownerPath);
      syncParent(ownerPath);
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

  const gateTakeoverPath = (lockPath) => `${lockPath}.takeover.lock`;
  const gateTakeoverStalePath = (lockPath) => `${gateTakeoverPath(lockPath)}.stale-claim`;
  const gateStateExists = (lockPath) => existsSync(lockPath)
    || existsSync(gateTakeoverPath(lockPath))
    || existsSync(gateTakeoverStalePath(lockPath));

  const releaseOwnedDirectory = (lockPath, owner) => {
    const stalePath = `${lockPath}.stale-claim`;
    const ownedPath = existsSync(lockPath) ? lockPath : existsSync(stalePath) ? stalePath : null;
    if (ownedPath === null) return;
    const current = readLockOwner(join(ownedPath, "owner.json"), owner.kind);
    if (current.runId !== owner.runId || current.coordinatorInstanceId !== owner.coordinatorInstanceId
      || current.generation !== owner.generation || current.target !== owner.target) {
      throw new Error("RECLAIM_GATE_LEASE_FENCED");
    }
    const releaseClaim = `${ownedPath}.release-${owner.generation}`;
    renameSync(ownedPath, releaseClaim);
    const claimed = readLockOwner(join(releaseClaim, "owner.json"), owner.kind);
    if (claimed.runId !== owner.runId || claimed.coordinatorInstanceId !== owner.coordinatorInstanceId
      || claimed.generation !== owner.generation || claimed.target !== owner.target) {
      if (!existsSync(ownedPath)) {
        renameSync(releaseClaim, ownedPath);
        syncParent(ownedPath);
      }
      throw new Error("RECLAIM_GATE_LEASE_FENCED");
    }
    rmSync(releaseClaim, { recursive: true, force: false });
    syncParent(ownedPath);
  };

  const acquireTakeoverClaim = ({ lockPath, owner, staleProof }) => {
    const takeoverPath = gateTakeoverPath(lockPath);
    const stalePath = gateTakeoverStalePath(lockPath);
    let movedToStale = false;
    if (existsSync(takeoverPath) && existsSync(stalePath)) {
      if (!staleProof) throw new Error("RECLAIM_GATE_TAKEOVER_LOCKED");
      validateStaleOwnerProof(staleProof);
      const current = readLockOwner(join(takeoverPath, "owner.json"), owner.kind);
      if (current.runId !== owner.runId || current.target !== owner.target
        || current.coordinatorInstanceId !== staleProof.previousCoordinatorInstanceId
        || current.generation !== staleProof.previousGeneration
        || staleProof.abandonedOperationIds.length !== 0) {
        throw new Error("RECLAIM_GATE_TAKEOVER_STALE_PROOF_MISMATCH");
      }
      rmSync(stalePath, { recursive: true, force: false });
      syncParent(stalePath);
    }
    if (existsSync(takeoverPath)) {
      if (!staleProof) throw new Error("RECLAIM_GATE_TAKEOVER_LOCKED");
      try {
        renameSync(takeoverPath, stalePath);
        movedToStale = true;
        syncParent(takeoverPath);
      } catch (error) {
        if (["EEXIST", "ENOTEMPTY", "ENOENT", "EPERM"].includes(error?.code)) {
          throw new Error("RECLAIM_GATE_TAKEOVER_LOCKED");
        }
        throw error;
      }
    }
    if (existsSync(stalePath)) {
      if (!staleProof) throw new Error("RECLAIM_GATE_TAKEOVER_LOCKED");
      try {
        validateStaleOwnerProof(staleProof);
        const previous = readLockOwner(join(stalePath, "owner.json"), owner.kind);
        if (previous.runId !== owner.runId || previous.target !== owner.target
          || previous.coordinatorInstanceId !== staleProof.previousCoordinatorInstanceId
          || previous.generation !== staleProof.previousGeneration
          || staleProof.abandonedOperationIds.length !== 0) {
          throw new Error("RECLAIM_GATE_TAKEOVER_STALE_PROOF_MISMATCH");
        }
      } catch (error) {
        if (movedToStale && existsSync(stalePath) && !existsSync(takeoverPath)) {
          renameSync(stalePath, takeoverPath);
          syncParent(takeoverPath);
        }
        throw error;
      }
    }
    const candidate = `${takeoverPath}.candidate-${process.pid}-${randomUUID()}`;
    mkdirSync(candidate, { recursive: false });
    try {
      writeLockOwner(join(candidate, "owner.json"), owner);
      renameSync(candidate, takeoverPath);
      syncParent(takeoverPath);
    } catch (error) {
      rmSync(candidate, { recursive: true, force: true });
      if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(error?.code)) {
        throw new Error("RECLAIM_GATE_TAKEOVER_LOCKED");
      }
      throw error;
    }
    if (existsSync(stalePath)) {
      rmSync(stalePath, { recursive: true, force: false });
      syncParent(stalePath);
    }
    return () => releaseOwnedDirectory(takeoverPath, owner);
  };

  const acquireRecoverableGate = ({ lockPath, owner, staleProof, claimStaleProof }) => {
    const claimOwner = {
      ...owner,
      kind: `${owner.kind}-takeover`,
      generation: randomUUID(),
    };
    const releaseTakeover = acquireTakeoverClaim({
      lockPath,
      owner: claimOwner,
      staleProof: claimStaleProof,
    });
    try {
      if (existsSync(lockPath)) {
        if (!staleProof) throw new Error("RECLAIM_GATE_LOCKED");
        validateStaleOwnerProof(staleProof);
        const previous = readLockOwner(join(lockPath, "owner.json"), owner.kind);
        if (previous.runId !== owner.runId || previous.target !== owner.target
          || previous.coordinatorInstanceId !== staleProof.previousCoordinatorInstanceId
          || previous.generation !== staleProof.previousGeneration
          || staleProof.abandonedOperationIds.length !== 0) {
          throw new Error("RECLAIM_GATE_STALE_PROOF_MISMATCH");
        }
        replaceLockOwner(join(lockPath, "owner.json"), owner);
      } else {
        const candidate = `${lockPath}.candidate-${process.pid}-${randomUUID()}`;
        mkdirSync(candidate, { recursive: false });
        try {
          writeLockOwner(join(candidate, "owner.json"), owner);
          renameSync(candidate, lockPath);
          syncParent(lockPath);
        } finally {
          if (existsSync(candidate)) rmSync(candidate, { recursive: true, force: true });
        }
      }
    } finally {
      releaseTakeover();
    }
    return () => releaseOwnedDirectory(lockPath, owner);
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
      operationRoot: join(runDir, "engine.lock"),
      operationPrefix: "operation",
    };
  };

  const targetMutationPathsFor = (target) => {
    requireText(target, "close writer target");
    const targetKey = createHash("sha256").update(target).digest("hex");
    const lock = join(targetMutationWritersRoot, `${targetKey}.lock`);
    return {
      lock,
      owner: join(lock, "owner.json"),
      reclaimLock: join(targetMutationWritersRoot, `${targetKey}.reclaim.lock`),
      operationRoot: lock,
      operationPrefix: "operation",
    };
  };

  const retireLease = ({ paths, kind, runId, target, generation }) => {
    const retirement = `${paths.lock}.release-${generation}`;
    renameSync(paths.lock, retirement);
    syncParent(paths.lock);
    const retired = readLockOwner(join(retirement, "owner.json"), kind);
    if (retired.runId !== runId || retired.target !== target
      || retired.coordinatorInstanceId !== coordinatorInstanceId
      || retired.generation !== generation) {
      if (!existsSync(paths.lock)) {
        renameSync(retirement, paths.lock);
        syncParent(paths.lock);
      }
      throw new Error("LOCK_LEASE_FENCED");
    }
    rmSync(retirement, { recursive: true, force: false });
    syncParent(paths.lock);
  };

  const installLease = ({ paths, owner, lockedError, preflight, postflight }) => {
    const before = preflight?.();
    if (before) throw new Error(before);
    mkdirSync(dirname(paths.lock), { recursive: true });
    const candidate = `${paths.lock}.candidate-${process.pid}-${randomUUID()}`;
    mkdirSync(candidate, { recursive: false });
    try {
      writeLockOwner(join(candidate, "owner.json"), owner);
      try {
        renameSync(candidate, paths.lock);
        syncParent(paths.lock);
      } catch (error) {
        if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(error?.code)) throw new Error(lockedError);
        throw error;
      }
      const after = postflight?.();
      if (after) {
        const current = readLockOwner(join(paths.lock, "owner.json"), owner.kind);
        if (current.runId !== owner.runId || current.coordinatorInstanceId !== owner.coordinatorInstanceId
          || current.generation !== owner.generation || current.target !== owner.target) {
          throw new Error("LOCK_LEASE_FENCED");
        }
        retireLease({
          paths,
          kind: owner.kind,
          runId: owner.runId,
          target: owner.target,
          generation: owner.generation,
        });
        throw new Error(after);
      }
      return owner.generation;
    } finally {
      if (existsSync(candidate)) rmSync(candidate, { recursive: true, force: true });
    }
  };

  const operationLocks = (paths, generation) => {
    if (!existsSync(paths.operationRoot)) return [];
    const prefix = `${paths.operationPrefix}.${generation}.`;
    return readdirSync(paths.operationRoot)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".lock"))
      .map((name) => join(paths.operationRoot, name));
  };

  const removeProvenAbandonedOperations = (paths, generation, staleProof, errorCode) => {
    const operations = operationLocks(paths, generation);
    const actualIds = operations.map((path) => basename(path)).sort();
    const provenIds = [...staleProof.abandonedOperationIds].sort();
    if (actualIds.length !== provenIds.length
      || actualIds.some((operationId, index) => operationId !== provenIds[index])) {
      throw new Error(errorCode);
    }
    // Reconciliation must name the exact abandoned critical sections; an unproven marker stays fenced.
    for (const operation of operations) rmSync(operation, { recursive: true, force: false });
    if (operations.length > 0) syncDirectory(paths.operationRoot);
  };

  const hasOperationLocks = (paths) => existsSync(paths.operationRoot)
    && readdirSync(paths.operationRoot).some((name) => (
      name.startsWith(`${paths.operationPrefix}.`) && name.endsWith(".lock")
    ));

  const withLease = ({ paths, kind, runId, target, generation }, operation) => {
    if (gateStateExists(paths.reclaimLock)) throw new Error("LOCK_LEASE_FENCED");
    const marker = join(
      paths.operationRoot,
      `${paths.operationPrefix}.${generation}.${randomUUID()}.lock`,
    );
    mkdirSync(marker);
    syncDirectory(paths.operationRoot);
    try {
      if (gateStateExists(paths.reclaimLock)) throw new Error("LOCK_LEASE_FENCED");
      const owner = readLockOwner(kind === "engine" ? paths.lockOwner : paths.owner, kind);
      if (owner.runId !== runId || owner.generation !== generation
        || owner.coordinatorInstanceId !== coordinatorInstanceId
        || (kind === "close" && owner.target !== target)) {
        throw new Error("LOCK_LEASE_FENCED");
      }
      return operation();
    } finally {
      rmSync(marker, { recursive: true, force: true });
      syncDirectory(existsSync(paths.operationRoot) ? paths.operationRoot : dirname(paths.operationRoot));
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
    const seenRunIds = new Set();
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
        if (seenRunIds.has(record.runId)) {
          throw new Error(`Duplicate cleanup audit for Run ${record.runId}`);
        }
        seenRunIds.add(record.runId);
        requireText(record.specId, `cleanup record ${index + 1} specId`);
        if (!["SUCCEEDED", "STOPPED"].includes(record.terminalState)) {
          throw new Error(`Invalid cleanup record evidence at sequence ${index + 1}`);
        }
        requireIsoInstant(record.deletionTime, `cleanup record ${index + 1} deletionTime`);
        if (record.retentionReason !== "older_than_30_days_and_outside_newest_10") {
          throw new Error(`Invalid cleanup retention reason at sequence ${index + 1}`);
        }
        return record;
      });
  };

  const previewCleanup = ({ now, runs, protectedRunIds = [] }) => {
    let evaluatedAt;
    try {
      evaluatedAt = requireIsoInstant(now, "Cleanup preview time");
    } catch (error) {
      throw new TypeError(`Cleanup preview requires an ISO time: ${error.message}`);
    }
    if (!Array.isArray(runs)) {
      throw new TypeError("Cleanup preview requires an ISO time and normalized Run evidence");
    }
    if (!Array.isArray(protectedRunIds)) {
      throw new TypeError("Cleanup preview protected Run IDs must be an array");
    }
    const protectedRuns = new Set(protectedRunIds.map((runId) => {
      assertSafeRunId(runId);
      return runId;
    }));
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
      if (run.terminalAt !== null) requireIsoInstant(run.terminalAt, "cleanup evidence terminalAt");
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
      .filter((run) => !protectedRuns.has(run.runId)
        && existsSync(pathsFor(run.runId).runDir)
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
      if (protectedRuns.has(run.runId)) reason = "selected_run";
      else if (!existsSync(runDir)) reason = "run_directory_absent";
      else if (!["SUCCEEDED", "STOPPED"].includes(run.state)) reason = "non_terminal";
      else if (!Number.isFinite(Date.parse(run.terminalAt))) reason = "terminal_state_uncertain";
      else if (run.engineLock !== "RELEASED" || existsSync(lock) || gateStateExists(paths.reclaimLock)
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

  const applyCleanup = ({ now, runs, protectedRunIds = [], cleanupStaleProof, cleanupClaimStaleProof }) => {
    mkdirSync(controlRoot, { recursive: true });
    let releaseCleanup;
    try {
      releaseCleanup = acquireRecoverableGate({
        lockPath: cleanupLock,
        staleProof: cleanupStaleProof,
        claimStaleProof: cleanupClaimStaleProof,
        owner: {
          schema: LOCK_OWNER_SCHEMA,
          kind: "cleanup",
          runId: "cleanup",
          coordinatorInstanceId,
          generation: randomUUID(),
        },
      });
    } catch (error) {
      if (["RECLAIM_GATE_LOCKED", "RECLAIM_GATE_TAKEOVER_LOCKED"].includes(error?.message)) {
        throw new Error("CLEANUP_WRITER_LOCKED");
      }
      throw error;
    }
    const removed = [];
    const skippedDuringApply = [];
    let preview;
    try {
      preview = previewCleanup({ now, runs, protectedRunIds });
      const records = readCleanupRecords();
      let sequence = records.length;
      for (const eligible of preview.eligible) {
        const paths = pathsFor(eligible.runId);
        if (existsSync(paths.lock) || gateStateExists(paths.reclaimLock) || hasOperationLocks(paths)) {
          skippedDuringApply.push({ runId: eligible.runId, reason: "engine_active_or_uncertain" });
          continue;
        }
        const expectedRecord = {
          schema: CLEANUP_SCHEMA,
          sequence: sequence + 1,
          runId: eligible.runId,
          specId: eligible.specId,
          terminalState: eligible.state,
          deletionTime: now,
          retentionReason: eligible.reason,
        };
        const priorRecord = records.find(({ runId }) => runId === eligible.runId);
        if (priorRecord) {
          if (priorRecord.specId !== expectedRecord.specId
            || priorRecord.terminalState !== expectedRecord.terminalState
            || priorRecord.retentionReason !== expectedRecord.retentionReason) {
            throw new Error(`Cleanup audit conflicts for Run ${eligible.runId}`);
          }
        } else {
          sequence += 1;
          durableAppend(cleanupPath, `${JSON.stringify({ ...expectedRecord, sequence })}\n`);
        }
        rmSync(paths.runDir, { recursive: true, force: false });
        syncDirectory(runsRoot);
        removed.push(eligible.runId);
      }
    } finally {
      releaseCleanup();
    }
    return {
      schema: "dag-run-cleanup-result:v1",
      evaluatedAt: now,
      removed,
      skipped: [...preview.skipped, ...skippedDuringApply],
    };
  };

  const writerHandle = (runId, paths, generation) => {
    let active = true;
    const requireActive = () => {
      if (!active) throw new Error("RUN_WRITER_RELEASED");
    };
    const persistStatus = (projection) => {
      assertNoToken(projection);
      if (projection?.schema !== STATUS_SCHEMA) throw new TypeError("Invalid status projection schema");
      if (projection?.run?.runId !== runId) {
        throw new TypeError(`Status projection runId must match writer Run ${runId}`);
      }
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
        syncParent(paths.status);
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
      }
      return projection;
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
          return persistStatus(projection);
        });
      },

      publishStatus(projection) {
        requireActive();
        return withLease(
          { paths, kind: "engine", runId, generation },
          () => persistStatus(projection),
        );
      },

      release() {
        requireActive();
        return withLease({ paths, kind: "engine", runId, generation }, () => {
          retireLease({ paths, kind: "engine", runId, generation });
          active = false;
        });
      },
    };
  };

  const installWriterLock = (runId, paths) => {
    const generation = randomUUID();
    return installLease({
      paths,
      owner: {
        schema: LOCK_OWNER_SCHEMA,
        kind: "engine",
        runId,
        coordinatorInstanceId,
        generation,
      },
      lockedError: "RUN_WRITER_LOCKED",
      preflight: () => (gateStateExists(cleanupLock)
        ? "CLEANUP_IN_PROGRESS"
        : gateStateExists(paths.reclaimLock) ? "RUN_WRITER_RECLAIM_IN_PROGRESS" : null),
      postflight: () => (gateStateExists(cleanupLock)
        ? "CLEANUP_IN_PROGRESS"
        : gateStateExists(paths.reclaimLock) ? "RUN_WRITER_RECLAIM_IN_PROGRESS" : null),
    });
  };

  const acquireWriter = (runId) => {
    const paths = pathsFor(runId);
    const generation = installWriterLock(runId, paths);
    return writerHandle(runId, paths, generation);
  };

  const reclaimLease = ({
    paths,
    kind,
    target,
    runId,
    staleProof,
    gateStaleProof,
    gateClaimStaleProof,
    guard,
    staleMismatchError,
    operationError,
  }) => {
    validateStaleOwnerProof(staleProof);
    const before = guard?.();
    if (before) throw new Error(before);
    mkdirSync(dirname(paths.lock), { recursive: true });
    const gateGeneration = randomUUID();
    const releaseGate = acquireRecoverableGate({
      lockPath: paths.reclaimLock,
      staleProof: gateStaleProof,
      claimStaleProof: gateClaimStaleProof,
      owner: {
        schema: LOCK_OWNER_SCHEMA,
        kind: `${kind}-reclaim`,
        ...(target === undefined ? {} : { target }),
        runId,
        coordinatorInstanceId,
        generation: gateGeneration,
      },
    });
    let generation;
    try {
      const after = guard?.();
      if (after) throw new Error(after);
      const ownerPath = kind === "engine" ? paths.lockOwner : paths.owner;
      const previous = readLockOwner(ownerPath, kind);
      if (previous.runId !== runId || previous.target !== target
        || previous.coordinatorInstanceId !== staleProof.previousCoordinatorInstanceId
        || previous.generation !== staleProof.previousGeneration) {
        throw new Error(staleMismatchError);
      }
      removeProvenAbandonedOperations(paths, previous.generation, staleProof, operationError);
      generation = randomUUID();
      replaceLockOwner(ownerPath, {
        schema: LOCK_OWNER_SCHEMA,
        kind,
        ...(target === undefined ? {} : { target }),
        runId,
        coordinatorInstanceId,
        generation,
      });
    } finally {
      releaseGate();
    }
    return generation;
  };

  const readWriterLock = (runId) => {
    const paths = pathsFor(runId);
    if (!existsSync(paths.lock)) return null;
    try {
      const owner = readLockOwner(paths.lockOwner, "engine");
      if (owner.runId !== runId) throw new TypeError("Engine lock owner does not match its storage Run");
      return {
        ...owner,
        activeOperationIds: operationLocks(paths, owner.generation).map((path) => basename(path)).sort(),
      };
    } catch {
      return { schema: LOCK_OWNER_SCHEMA, kind: "engine", runId, state: "UNKNOWN" };
    }
  };

  const reclaimWriter = ({ runId, staleProof, gateStaleProof, gateClaimStaleProof }) => {
    const paths = pathsFor(runId);
    const generation = reclaimLease({
      paths,
      kind: "engine",
      runId,
      staleProof,
      gateStaleProof,
      gateClaimStaleProof,
      guard: () => (gateStateExists(cleanupLock) ? "CLEANUP_IN_PROGRESS" : null),
      staleMismatchError: "RUN_WRITER_STALE_PROOF_MISMATCH",
      operationError: "RUN_WRITER_OPERATION_ACTIVE_OR_UNPROVEN",
    });
    return writerHandle(runId, paths, generation);
  };

  const repositoryCloseLeaseHandle = (operationId, generation) => {
    let active = true;
    return {
      operationId,
      assertCurrent() {
        if (!active) throw new Error("REPOSITORY_CLOSE_LEASE_RELEASED");
        return withLease({
          paths: repositoryCloseLeasePaths,
          kind: "repository-close",
          runId: operationId,
          generation,
        }, () => true);
      },
      release() {
        if (!active) throw new Error("REPOSITORY_CLOSE_LEASE_RELEASED");
        return withLease({
          paths: repositoryCloseLeasePaths,
          kind: "repository-close",
          runId: operationId,
          generation,
        }, () => {
          retireLease({
            paths: repositoryCloseLeasePaths,
            kind: "repository-close",
            runId: operationId,
            generation,
          });
          active = false;
        });
      },
    };
  };

  const acquireRepositoryCloseLease = ({ operationId }) => {
    assertSafeRunId(operationId);
    const generation = randomUUID();
    installLease({
      paths: repositoryCloseLeasePaths,
      owner: {
        schema: LOCK_OWNER_SCHEMA,
        kind: "repository-close",
        runId: operationId,
        coordinatorInstanceId,
        generation,
      },
      lockedError: "REPOSITORY_CLOSE_LEASE_LOCKED",
      preflight: () => (gateStateExists(repositoryCloseLeasePaths.reclaimLock)
        ? "REPOSITORY_CLOSE_LEASE_RECLAIM_IN_PROGRESS" : null),
      postflight: () => (gateStateExists(repositoryCloseLeasePaths.reclaimLock)
        ? "REPOSITORY_CLOSE_LEASE_RECLAIM_IN_PROGRESS" : null),
    });
    return repositoryCloseLeaseHandle(operationId, generation);
  };

  const readRepositoryCloseLeaseLock = () => {
    if (!existsSync(repositoryCloseLeasePaths.lock)) return null;
    try {
      const owner = readLockOwner(repositoryCloseLeasePaths.owner, "repository-close");
      return {
        ...owner,
        operationId: owner.runId,
        activeOperationIds: operationLocks(repositoryCloseLeasePaths, owner.generation)
          .map((path) => basename(path)).sort(),
      };
    } catch {
      return { schema: LOCK_OWNER_SCHEMA, kind: "repository-close", state: "UNKNOWN" };
    }
  };

  const observeRepositoryCloseLease = ({ expectedOwner } = {}) => {
    const normalizeOwner = (lock) => (
      isText(lock?.operationId) && lock.operationId !== "UNKNOWN"
        && isText(lock?.coordinatorInstanceId) && isText(lock?.generation)
        ? {
            operationId: lock.operationId,
            coordinatorInstanceId: lock.coordinatorInstanceId,
            generation: lock.generation,
          }
        : null
    );
    if (expectedOwner !== undefined && normalizeOwner(expectedOwner) === null) {
      throw new TypeError("Expected repository close lease owner is malformed");
    }
    const lock = readRepositoryCloseLeaseLock();
    if (lock === null) return { state: "ABSENT", owner: null };
    const owner = normalizeOwner(lock);
    if (owner === null) return { state: "UNKNOWN", owner: null };
    if (expectedOwner === undefined) return { state: "PRESENT", owner };
    const same = owner.operationId === expectedOwner.operationId
      && owner.coordinatorInstanceId === expectedOwner.coordinatorInstanceId
      && owner.generation === expectedOwner.generation;
    return { state: same ? "MATCH" : "CHANGED", owner };
  };

  const reclaimRepositoryCloseLease = ({
    operationId,
    staleProof,
    gateStaleProof,
    gateClaimStaleProof,
  }) => {
    assertSafeRunId(operationId);
    const generation = reclaimLease({
      paths: repositoryCloseLeasePaths,
      kind: "repository-close",
      runId: operationId,
      staleProof,
      gateStaleProof,
      gateClaimStaleProof,
      staleMismatchError: "REPOSITORY_CLOSE_LEASE_STALE_PROOF_MISMATCH",
      operationError: "REPOSITORY_CLOSE_LEASE_OPERATION_ACTIVE_OR_UNPROVEN",
    });
    return repositoryCloseLeaseHandle(operationId, generation);
  };

  const acquireCloseWriter = ({ target, runId }) => {
    assertSafeRunId(runId);
    const paths = targetMutationPathsFor(target);
    const generation = randomUUID();
    installLease({
      paths,
      owner: {
        schema: LOCK_OWNER_SCHEMA,
        kind: "close",
        target,
        runId,
        coordinatorInstanceId,
        generation,
      },
      lockedError: "TARGET_CLOSE_WRITER_LOCKED",
      preflight: () => (gateStateExists(paths.reclaimLock)
        ? "TARGET_CLOSE_WRITER_RECLAIM_IN_PROGRESS" : null),
      postflight: () => (gateStateExists(paths.reclaimLock)
        ? "TARGET_CLOSE_WRITER_RECLAIM_IN_PROGRESS" : null),
    });
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
          retireLease({ paths, kind: "close", target, runId, generation });
          active = false;
        });
      },
    };
  };

  const readCloseWriterLock = (target) => {
    const paths = targetMutationPathsFor(target);
    if (!existsSync(paths.lock)) return null;
    try {
      const owner = readLockOwner(paths.owner, "close");
      if (owner.target !== target) throw new TypeError("Close lock target hash collision");
      return {
        ...owner,
        activeOperationIds: operationLocks(paths, owner.generation).map((path) => basename(path)).sort(),
      };
    } catch {
      return { schema: LOCK_OWNER_SCHEMA, kind: "close", target, state: "UNKNOWN" };
    }
  };

  const readCloseWriter = (target) => {
    const owner = readCloseWriterLock(target);
    if (owner === null) return null;
    return owner.runId ?? "UNKNOWN";
  };

  const asTargetMutationHandle = (writer) => ({
    target: writer.target,
    operationId: writer.runId,
    assertCurrent: () => writer.assertCurrent(),
    release: () => writer.release(),
  });

  const acquireTargetMutationWriter = ({ target, operationId }) => asTargetMutationHandle(
    acquireCloseWriter({ target, runId: operationId }),
  );

  const readTargetMutationWriterLock = (target) => {
    const owner = readCloseWriterLock(target);
    if (owner === null) return null;
    return {
      ...owner,
      kind: owner.kind === "close" ? "target-mutation" : owner.kind,
      operationId: owner.runId ?? "UNKNOWN",
    };
  };

  const readTargetMutationWriter = (target) => {
    const owner = readTargetMutationWriterLock(target);
    if (owner === null) return null;
    return owner.operationId;
  };

  const observeTargetMutationWriter = ({ target, expectedOwner } = {}) => {
    requireText(target, "target mutation writer observation target");
    const normalizeOwner = (lock) => {
      const operationId = lock?.operationId ?? lock?.runId;
      return isText(operationId) && operationId !== "UNKNOWN"
        && isText(lock?.coordinatorInstanceId) && isText(lock?.generation)
        ? { operationId, coordinatorInstanceId: lock.coordinatorInstanceId, generation: lock.generation }
        : null;
    };
    if (expectedOwner !== undefined) {
      const normalizedExpected = normalizeOwner(expectedOwner);
      if (normalizedExpected === null) throw new TypeError("Expected target mutation writer owner is malformed");
    }
    const lock = readTargetMutationWriterLock(target);
    if (lock === null) return { state: "ABSENT", owner: null };
    const owner = normalizeOwner(lock);
    if (owner === null) return { state: "UNKNOWN", owner: null };
    if (expectedOwner === undefined) return { state: "PRESENT", owner };
    const same = owner.operationId === expectedOwner.operationId
      && owner.coordinatorInstanceId === expectedOwner.coordinatorInstanceId
      && owner.generation === expectedOwner.generation;
    return { state: same ? "MATCH" : "CHANGED", owner };
  };

  const readGate = (lockPath, kind, fallback) => {
    const takeoverPath = gateTakeoverPath(lockPath);
    const stalePath = gateTakeoverStalePath(lockPath);
    if (existsSync(takeoverPath) || existsSync(stalePath)) {
      try {
        return {
          schema: LOCK_OWNER_SCHEMA,
          kind,
          ...fallback,
          state: "TAKEOVER_ACTIVE",
          gateOwner: existsSync(lockPath) ? readLockOwner(join(lockPath, "owner.json"), kind) : null,
          claimOwner: readLockOwner(
            join(existsSync(takeoverPath) ? takeoverPath : stalePath, "owner.json"),
            `${kind}-takeover`,
          ),
        };
      } catch {
        return { schema: LOCK_OWNER_SCHEMA, kind, ...fallback, state: "UNKNOWN" };
      }
    }
    if (!existsSync(lockPath)) return null;
    try {
      return readLockOwner(join(lockPath, "owner.json"), kind);
    } catch {
      return { schema: LOCK_OWNER_SCHEMA, kind, ...fallback, state: "UNKNOWN" };
    }
  };

  const readWriterReclaimLock = (runId) => {
    const paths = pathsFor(runId);
    return readGate(paths.reclaimLock, "engine-reclaim", { runId });
  };

  const readCloseWriterReclaimLock = (target) => {
    const paths = targetMutationPathsFor(target);
    return readGate(paths.reclaimLock, "close-reclaim", { target });
  };

  const readCleanupLock = () => readGate(cleanupLock, "cleanup", { runId: "cleanup" });

  const reclaimCloseWriter = ({ target, runId, staleProof, gateStaleProof, gateClaimStaleProof }) => {
    assertSafeRunId(runId);
    const paths = targetMutationPathsFor(target);
    const generation = reclaimLease({
      paths,
      kind: "close",
      target,
      runId,
      staleProof,
      gateStaleProof,
      gateClaimStaleProof,
      staleMismatchError: "TARGET_CLOSE_WRITER_STALE_PROOF_MISMATCH",
      operationError: "TARGET_CLOSE_WRITER_OPERATION_ACTIVE_OR_UNPROVEN",
    });
    return closeWriterHandle(target, runId, paths, generation);
  };

  const reclaimTargetMutationWriter = ({
    target,
    operationId,
    staleProof,
    gateStaleProof,
    gateClaimStaleProof,
  }) => asTargetMutationHandle(reclaimCloseWriter({
    target,
    runId: operationId,
    staleProof,
    gateStaleProof,
    gateClaimStaleProof,
  }));

  const readTargetMutationWriterReclaimLock = (target) => readCloseWriterReclaimLock(target);

  return {
    acquireWriter,
    reclaimWriter,
    readWriterLock,
    readWriterReclaimLock,
    acquireRepositoryCloseLease,
    reclaimRepositoryCloseLease,
    observeRepositoryCloseLease,
    acquireTargetMutationWriter,
    reclaimTargetMutationWriter,
    readTargetMutationWriter,
    readTargetMutationWriterLock,
    observeTargetMutationWriter,
    readTargetMutationWriterReclaimLock,
    acquireCloseWriter,
    reclaimCloseWriter,
    readCloseWriter,
    readCloseWriterLock,
    readCloseWriterReclaimLock,
    readCleanupLock,
    readEvents,
    readStatus,
    readCleanupRecords,
    previewCleanup,
    applyCleanup,
  };
}

const compareRunIds = (left, right) => String(left).localeCompare(String(right), "en");
