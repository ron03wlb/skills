import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";

export const LEGACY_WORKFLOW_CHECKPOINT_SCHEMA = "workflow-checkpoint-transaction:v1";
export const WORKFLOW_CHECKPOINT_SCHEMA = "workflow-checkpoint-transaction:v2";
export const WORKFLOW_CHECKPOINT_WRITER_SCHEMA = "workflow-checkpoint-writer:v1";
export const WORKFLOW_CHECKPOINT_STAGES = Object.freeze([
  "plan.written",
  "checkpoint.committed",
  "attestation.read_back",
  "publication.read_back",
  "handoff.completed",
]);
const TO_SPEC_PUBLICATION_STAGES = Object.freeze([
  "planning_seal.read_back",
  "publication.read_back",
  "handoff.completed",
]);
const TO_TICKETS_CHECKPOINT_STAGES = Object.freeze([
  "plan.written",
  "checkpoint.committed",
  "attestation.read_back",
  "decomposition.read_back",
  "ready_state.read_back",
  "handoff.completed",
]);
const TO_TICKETS_PUBLICATION_STAGES = Object.freeze([
  "decomposition.read_back",
  "ready_state.read_back",
  "handoff.completed",
]);
export const WORKFLOW_CHECKPOINT_PROFILES = Object.freeze({
  "to-spec@v1": WORKFLOW_CHECKPOINT_STAGES,
  "to-spec@v2": TO_SPEC_PUBLICATION_STAGES,
  "to-tickets@v1": TO_TICKETS_CHECKPOINT_STAGES,
  "to-tickets@v2": TO_TICKETS_PUBLICATION_STAGES,
});

const legacyIdentityFields = new Set([
  "repositoryId",
  "producerCommand",
  "specOperationId",
  "target",
  "baseline",
  "initialTargetState",
  "planPath",
  "generatedContentIdentity",
]);
const identityFields = new Set([
  "repositoryId",
  "specId",
  "producerCommand",
  "operationId",
  "profileVersion",
  "target",
  "baseline",
  "bindings",
]);
const transactionFields = new Set(["schema", "scopeKey", "transactionId", "identity", "progress"]);
const writerOwnerFields = new Set(["schema", "operation", "scopeKey", "transactionId", "identity"]);
const legacyProgressFields = new Set(["stage", "result"]);
const progressFields = new Set(["stage", "receipt"]);
const gitObjectPattern = /^[a-f0-9]{40,64}$/u;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;

const fail = (code, evidence = []) => {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  return error;
};

const assertExactFields = (value, fields, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !fields.has(key));
  const missing = [...fields].find((key) => !Object.hasOwn(value, key));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
  if (missing) throw new TypeError(`${label} is missing field ${missing}`);
};

const assertSecretFree = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) throw new TypeError("Workflow control state must not contain cycles");
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|secret|password|credential)/iu.test(key)) {
      throw new TypeError(`Workflow control state must not contain secret field ${key}`);
    }
    assertSecretFree(child, seen);
  }
  seen.delete(value);
};

const canonicalize = (value, seen = new WeakSet()) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") {
    throw new TypeError("Workflow control state must contain only JSON-compatible values");
  }
  if (seen.has(value)) throw new TypeError("Workflow control state must not contain cycles");
  seen.add(value);
  let normalized;
  if (Array.isArray(value)) {
    normalized = value.map((child) => canonicalize(child, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Workflow control state must contain only plain JSON objects");
    }
    normalized = Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key], seen)]),
    );
  }
  seen.delete(value);
  return normalized;
};

const normalizeOpaqueObject = (value, label) => {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new TypeError(`${label} must be one non-empty object`);
  }
  assertSecretFree(value);
  return canonicalize(value);
};

const assertRelativePath = (path) => {
  if (!isText(path) || path.startsWith("/") || path.includes("\\")
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new TypeError("planPath must be one normalized repository-relative path");
  }
};

const normalizeLegacyIdentity = (identity) => {
  assertExactFields(identity, legacyIdentityFields, "legacy workflow checkpoint identity");
  for (const field of ["repositoryId", "producerCommand", "specOperationId", "target"]) {
    if (!isText(identity[field])) throw new TypeError(`${field} is required`);
  }
  if (!gitObjectPattern.test(identity.baseline)) throw new TypeError("baseline must be one Git object identity");
  if (identity.initialTargetState !== "CLEAN") {
    throw new TypeError("initialTargetState must be CLEAN");
  }
  assertRelativePath(identity.planPath);
  if (!sha256Pattern.test(identity.generatedContentIdentity)) {
    throw new TypeError("generatedContentIdentity must be one SHA-256 identity");
  }
  const normalized = Object.fromEntries([...legacyIdentityFields].map((field) => [field, identity[field]]));
  assertSecretFree(normalized);
  return normalized;
};

const profileKeyFor = ({ producerCommand, profileVersion }) => `${producerCommand}@${profileVersion}`;
const profileStagesFor = (identity) => {
  const stages = WORKFLOW_CHECKPOINT_PROFILES[profileKeyFor(identity)];
  if (!stages) throw new TypeError("Unsupported workflow checkpoint profile");
  return stages;
};

const normalizeIdentity = (identity) => {
  assertExactFields(identity, identityFields, "workflow checkpoint identity");
  for (const field of [
    "repositoryId",
    "specId",
    "producerCommand",
    "operationId",
    "profileVersion",
    "target",
  ]) {
    if (!isText(identity[field])) throw new TypeError(`${field} is required`);
  }
  profileStagesFor(identity);
  if (!gitObjectPattern.test(identity.baseline)) throw new TypeError("baseline must be one Git object identity");
  const normalized = {
    repositoryId: identity.repositoryId,
    specId: identity.specId,
    producerCommand: identity.producerCommand,
    operationId: identity.operationId,
    profileVersion: identity.profileVersion,
    target: identity.target,
    baseline: identity.baseline,
    bindings: normalizeOpaqueObject(identity.bindings, "bindings"),
  };
  assertSecretFree(normalized);
  return normalized;
};

const identityKind = (identity) => (isRecord(identity) && Object.hasOwn(identity, "specOperationId")
  ? "legacy"
  : "current");
const normalizeAnyIdentity = (identity) => (identityKind(identity) === "legacy"
  ? normalizeLegacyIdentity(identity)
  : normalizeIdentity(identity));

const stableJson = (value) => JSON.stringify(value);
const digest = (value) => createHash("sha256").update(stableJson(value)).digest("hex");
const legacyScopeFor = (identity) => ({
  repositoryId: identity.repositoryId,
  specOperationId: identity.specOperationId,
});
const scopeFor = (identity) => ({
  repositoryId: identity.repositoryId,
  specId: identity.specId,
  producerCommand: identity.producerCommand,
  operationId: identity.operationId,
});
const legacyScopeKeyFor = (identity) => `sha256:${digest(legacyScopeFor(identity))}`;
const scopeKeyFor = (identity) => `sha256:${digest(canonicalize(scopeFor(identity)))}`;
const transactionIdFor = (identity) => `sha256:${digest(canonicalize(identity))}`;
const legacyTransactionIdFor = (identity) => `sha256:${digest(identity)}`;
const legacySame = (left, right) => stableJson(left) === stableJson(right);
const same = (left, right) => stableJson(canonicalize(left)) === stableJson(canonicalize(right));

const legacyIdentityForOperation = (identity) => ({
  repositoryId: identity.repositoryId,
  producerCommand: identity.producerCommand,
  specOperationId: `${identity.specId}:${identity.operationId}`,
});
const legacyScopeKeyForOperation = (identity) => legacyScopeKeyFor(legacyIdentityForOperation(identity));

const normalizeWriterOwner = (owner) => {
  assertExactFields(owner, writerOwnerFields, "workflow checkpoint writer owner");
  if (owner.schema !== WORKFLOW_CHECKPOINT_WRITER_SCHEMA) {
    throw new TypeError("Unsupported workflow checkpoint writer schema");
  }
  if (!["create", "advance"].includes(owner.operation)) {
    throw new TypeError("Workflow checkpoint writer operation is invalid");
  }
  const identity = normalizeAnyIdentity(owner.identity);
  const legacy = identityKind(identity) === "legacy";
  const expectedScopeKey = legacy ? legacyScopeKeyFor(identity) : scopeKeyFor(identity);
  const expectedTransactionId = legacy ? legacyTransactionIdFor(identity) : transactionIdFor(identity);
  if (owner.scopeKey !== expectedScopeKey || owner.transactionId !== expectedTransactionId) {
    throw new TypeError("Workflow checkpoint writer identity digest mismatch");
  }
  assertSecretFree(owner);
  return { ...owner, identity };
};

const writerOwnerFor = (identity, operation) => normalizeWriterOwner({
  schema: WORKFLOW_CHECKPOINT_WRITER_SCHEMA,
  operation,
  scopeKey: identityKind(identity) === "legacy" ? legacyScopeKeyFor(identity) : scopeKeyFor(identity),
  transactionId: identityKind(identity) === "legacy"
    ? legacyTransactionIdFor(identity)
    : transactionIdFor(identity),
  identity,
});

const legacyResultFields = (stage) => new Set(stage === "plan.written"
  ? ["path", "contentIdentity"]
  : stage === "checkpoint.committed"
    ? ["commit"]
    : stage === "attestation.read_back"
      ? ["recordIdentity"]
      : stage === "publication.read_back"
        ? ["publicationIdentity"]
        : ["handoffIdentity"]);

const validateLegacyStageResult = (stage, result, identity) => {
  assertExactFields(result, legacyResultFields(stage), `${stage} result`);
  assertSecretFree(result);
  if (stage === "plan.written") {
    if (result.path !== identity.planPath || result.contentIdentity !== identity.generatedContentIdentity) {
      throw fail("WORKFLOW_CHECKPOINT_RESULT_MISMATCH", [
        "Plan result differs from bound path or content identity.",
      ]);
    }
  } else if (stage === "checkpoint.committed") {
    if (!gitObjectPattern.test(result.commit)) throw new TypeError("checkpoint commit must be one Git object identity");
  } else if (!Object.values(result).every(isText)) {
    throw new TypeError(`${stage} result identity is required`);
  }
};

const validateLegacyTransaction = (transaction) => {
  assertExactFields(transaction, transactionFields, "legacy workflow checkpoint transaction");
  if (transaction.schema !== LEGACY_WORKFLOW_CHECKPOINT_SCHEMA) {
    throw new TypeError("Unsupported legacy workflow checkpoint schema");
  }
  const identity = normalizeLegacyIdentity(transaction.identity);
  if (transaction.scopeKey !== legacyScopeKeyFor(identity)
    || transaction.transactionId !== legacyTransactionIdFor(identity)) {
    throw new TypeError("Legacy workflow checkpoint identity digest mismatch");
  }
  if (!Array.isArray(transaction.progress) || transaction.progress.length > WORKFLOW_CHECKPOINT_STAGES.length) {
    throw new TypeError("Legacy workflow checkpoint progress is invalid");
  }
  transaction.progress.forEach((entry, index) => {
    assertExactFields(entry, legacyProgressFields, `legacy workflow checkpoint progress ${index + 1}`);
    if (entry.stage !== WORKFLOW_CHECKPOINT_STAGES[index]) {
      throw new TypeError("Legacy workflow checkpoint progress must be one ordered prefix");
    }
    validateLegacyStageResult(entry.stage, entry.result, identity);
  });
  assertSecretFree(transaction);
  return { ...transaction, identity };
};

const validateTransaction = (transaction) => {
  assertExactFields(transaction, transactionFields, "workflow checkpoint transaction");
  if (transaction.schema !== WORKFLOW_CHECKPOINT_SCHEMA) {
    throw new TypeError("Unsupported workflow checkpoint schema");
  }
  const identity = normalizeIdentity(transaction.identity);
  if (transaction.scopeKey !== scopeKeyFor(identity) || transaction.transactionId !== transactionIdFor(identity)) {
    throw new TypeError("Workflow checkpoint identity digest mismatch");
  }
  const stages = profileStagesFor(identity);
  if (!Array.isArray(transaction.progress) || transaction.progress.length > stages.length) {
    throw new TypeError("Workflow checkpoint progress is invalid");
  }
  const progress = transaction.progress.map((entry, index) => {
    assertExactFields(entry, progressFields, `workflow checkpoint progress ${index + 1}`);
    if (entry.stage !== stages[index]) {
      throw new TypeError("Workflow checkpoint progress must be one ordered profile prefix");
    }
    return {
      stage: entry.stage,
      receipt: normalizeOpaqueObject(entry.receipt, `${entry.stage} receipt`),
    };
  });
  assertSecretFree(transaction);
  return { ...transaction, identity, progress };
};

const toView = (transaction) => {
  const stages = transaction.schema === LEGACY_WORKFLOW_CHECKPOINT_SCHEMA
    ? WORKFLOW_CHECKPOINT_STAGES
    : profileStagesFor(transaction.identity);
  const complete = transaction.progress.length === stages.length;
  return {
    ...transaction,
    state: complete ? "COMPLETED" : "INCOMPLETE",
    nextStage: complete ? null : stages[transaction.progress.length],
  };
};

const writeAll = (descriptor, text) => {
  const content = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < content.length) {
    const written = writeSync(descriptor, content, offset, content.length - offset, null);
    if (written <= 0) throw new Error("Unable to complete durable workflow checkpoint write");
    offset += written;
  }
};

const syncDirectory = (directory) => {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch (error) {
    if (!(process.platform === "win32" && error?.code === "EPERM")) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

const writeDurableFile = (path, text) => {
  const descriptor = openSync(path, "wx");
  try {
    writeAll(descriptor, text);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

export function createWorkflowControlStore({ gitCommonDir }) {
  if (!isText(gitCommonDir)) throw new TypeError("gitCommonDir is required");
  const controlRoot = join(resolve(gitCommonDir), "matt-workflow-control");
  const transactionsRoot = join(controlRoot, "workflow-checkpoints");
  const writersRoot = join(controlRoot, "workflow-checkpoint-writers");

  const scopeHashFor = (scopeKey) => scopeKey.slice("sha256:".length);
  const fileFor = (scopeKey) => join(transactionsRoot, `${scopeHashFor(scopeKey)}.json`);
  const lockFor = (scopeKey) => join(writersRoot, `${scopeHashFor(scopeKey)}.lock`);
  const temporaryPrefixFor = (scopeKey) => join(writersRoot, `${scopeHashFor(scopeKey)}.tmp-`);

  const readFile = (path) => {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed?.schema === LEGACY_WORKFLOW_CHECKPOINT_SCHEMA) return validateLegacyTransaction(parsed);
      if (parsed?.schema === WORKFLOW_CHECKPOINT_SCHEMA) return validateTransaction(parsed);
      throw new TypeError("Unsupported workflow checkpoint schema");
    } catch (error) {
      if (error?.code?.startsWith("WORKFLOW_CHECKPOINT_")) throw error;
      throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", [String(error?.message ?? error)]);
    }
  };

  const assertStorageUnambiguous = (scopeKeys, ignoredLock = null, ignoreLockOwner = null) => {
    if (!existsSync(writersRoot)) return;
    const ambiguous = [];
    const entries = readdirSync(writersRoot);
    for (const scopeKey of new Set(scopeKeys)) {
      const scopeHash = scopeHashFor(scopeKey);
      const lock = lockFor(scopeKey);
      if (lock !== ignoredLock && existsSync(lock)) {
        if (ignoreLockOwner) {
          try {
            const owner = normalizeWriterOwner(JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")));
            if (!ignoreLockOwner(owner, scopeKey)) ambiguous.push(lock);
          } catch (error) {
            throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", [
              `Unreadable workflow checkpoint writer owner at ${lock}: ${String(error?.message ?? error)}`,
            ]);
          }
        } else {
          ambiguous.push(lock);
        }
      }
      entries
        .filter((name) => name.startsWith(`${scopeHash}.`) && name.includes(".tmp-"))
        .forEach((name) => ambiguous.push(join(writersRoot, name)));
    }
    if (ambiguous.length > 0) {
      throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", ambiguous.map((entry) => `Incomplete state: ${entry}`));
    }
  };

  const acquireWriter = (identity, operation, scopeKey) => {
    mkdirSync(writersRoot, { recursive: true });
    const lock = lockFor(scopeKey);
    try {
      mkdirSync(lock);
      writeDurableFile(join(lock, "owner.json"), `${JSON.stringify(writerOwnerFor(identity, operation), null, 2)}\n`);
      syncDirectory(lock);
      syncDirectory(writersRoot);
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error?.code)) {
        throw fail("WORKFLOW_CHECKPOINT_WRITER_LOCKED", [`Checkpoint writer lock exists at ${lock}.`]);
      }
      throw error;
    }
    return {
      lock,
      release: () => {
        rmSync(lock, { recursive: true, force: false });
        syncDirectory(writersRoot);
      },
    };
  };

  const readLegacyCheckpoint = (identity, { ignoredLock = null } = {}) => {
    const scopeKey = legacyScopeKeyFor(identity);
    assertStorageUnambiguous([scopeKey], ignoredLock);
    const path = fileFor(scopeKey);
    if (!existsSync(path)) return null;
    const transaction = readFile(path);
    if (transaction.schema !== LEGACY_WORKFLOW_CHECKPOINT_SCHEMA) {
      throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", ["Legacy checkpoint key contains a non-legacy receipt."]);
    }
    if (!legacySame(transaction.identity, identity)) {
      throw fail("WORKFLOW_CHECKPOINT_IDENTITY_MISMATCH", [
        `Stored transaction ${transaction.transactionId} does not match the requested retry identity.`,
      ]);
    }
    return toView(transaction);
  };

  const readCurrentCheckpoint = (identity, { ignoredLock = null } = {}) => {
    const currentScopeKey = scopeKeyFor(identity);
    const legacyScopeKey = legacyScopeKeyForOperation(identity);
    const expectedLegacy = legacyIdentityForOperation(identity);
    const ignoreUnrelatedLegacyWriter = (owner, lockedScopeKey) => lockedScopeKey === legacyScopeKey
      && identityKind(owner.identity) === "legacy"
      && owner.identity.repositoryId === expectedLegacy.repositoryId
      && owner.identity.specOperationId === expectedLegacy.specOperationId
      && owner.identity.producerCommand !== expectedLegacy.producerCommand;
    assertStorageUnambiguous(
      [currentScopeKey, legacyScopeKey],
      ignoredLock,
      ignoreUnrelatedLegacyWriter,
    );
    const currentPath = fileFor(currentScopeKey);
    const legacyPath = fileFor(legacyScopeKey);
    const current = existsSync(currentPath) ? readFile(currentPath) : null;
    const legacy = existsSync(legacyPath) ? readFile(legacyPath) : null;

    if (current && current.schema !== WORKFLOW_CHECKPOINT_SCHEMA) {
      throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", ["Current checkpoint key contains a legacy receipt."]);
    }
    if (legacy && legacy.schema !== LEGACY_WORKFLOW_CHECKPOINT_SCHEMA) {
      throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", ["Legacy checkpoint key contains a current receipt."]);
    }
    if (current && !same(current.identity, identity)) {
      throw fail("WORKFLOW_CHECKPOINT_IDENTITY_MISMATCH", [
        `Stored transaction ${current.transactionId} conflicts with the requested operation identity.`,
      ]);
    }

    const matchingLegacy = legacy
      && legacy.identity.repositoryId === expectedLegacy.repositoryId
      && legacy.identity.producerCommand === expectedLegacy.producerCommand
      && legacy.identity.specOperationId === expectedLegacy.specOperationId;
    if (legacy && matchingLegacy
      && (legacy.identity.target !== identity.target || legacy.identity.baseline !== identity.baseline)) {
      throw fail("WORKFLOW_CHECKPOINT_IDENTITY_MISMATCH", [
        `Stored legacy transaction ${legacy.transactionId} conflicts with the requested operation identity.`,
      ]);
    }
    if (current && matchingLegacy) {
      throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", [
        "Both legacy and current receipts exist for the same workflow checkpoint operation.",
      ]);
    }
    if (current) return toView(current);
    if (matchingLegacy) return toView(legacy);
    return null;
  };

  const readCheckpoint = (inputIdentity) => {
    if (identityKind(inputIdentity) === "legacy") {
      return readLegacyCheckpoint(normalizeLegacyIdentity(inputIdentity));
    }
    return readCurrentCheckpoint(normalizeIdentity(inputIdentity));
  };

  const createCheckpoint = (inputIdentity) => {
    if (identityKind(inputIdentity) === "legacy") {
      const identity = normalizeLegacyIdentity(inputIdentity);
      const existing = readLegacyCheckpoint(identity);
      if (existing) return existing;
      throw fail("WORKFLOW_CHECKPOINT_LEGACY_CREATE_UNSUPPORTED", [
        "New workflow checkpoint transactions must use schema v2.",
      ]);
    }

    const identity = normalizeIdentity(inputIdentity);
    const scopeKey = scopeKeyFor(identity);
    mkdirSync(transactionsRoot, { recursive: true });
    readCurrentCheckpoint(identity);
    const writer = acquireWriter(identity, "create", scopeKey);
    try {
      const existing = readCurrentCheckpoint(identity, { ignoredLock: writer.lock });
      if (existing) return existing;
      const transaction = validateTransaction({
        schema: WORKFLOW_CHECKPOINT_SCHEMA,
        scopeKey,
        transactionId: transactionIdFor(identity),
        identity,
        progress: [],
      });
      const path = fileFor(scopeKey);
      const temporary = `${temporaryPrefixFor(scopeKey)}${process.pid}-${randomUUID()}`;
      try {
        writeDurableFile(temporary, `${JSON.stringify(transaction, null, 2)}\n`);
        try {
          linkSync(temporary, path);
          syncDirectory(transactionsRoot);
        } catch (error) {
          if (error?.code !== "EEXIST") throw error;
        }
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
        syncDirectory(writersRoot);
      }
      const persisted = readCurrentCheckpoint(identity, { ignoredLock: writer.lock });
      if (!persisted) throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", ["Atomic checkpoint creation was not readable."]);
      return persisted;
    } finally {
      writer.release();
    }
  };

  const persistAdvanced = ({ transaction, identity, scopeKey, writer }) => {
    const path = fileFor(scopeKey);
    const temporary = `${temporaryPrefixFor(scopeKey)}${process.pid}-${randomUUID()}`;
    try {
      writeDurableFile(temporary, `${JSON.stringify(transaction, null, 2)}\n`);
      renameSync(temporary, path);
      syncDirectory(transactionsRoot);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
      syncDirectory(writersRoot);
    }
    const persisted = identityKind(identity) === "legacy"
      ? readLegacyCheckpoint(identity, { ignoredLock: writer.lock })
      : readCurrentCheckpoint(identity, { ignoredLock: writer.lock });
    if (!persisted) throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", ["Advanced checkpoint was not readable."]);
    return persisted;
  };

  const advanceLegacyCheckpoint = ({ identity, stage, result }) => {
    if (!WORKFLOW_CHECKPOINT_STAGES.includes(stage)) throw new TypeError(`Unknown workflow checkpoint stage ${stage}`);
    validateLegacyStageResult(stage, result, identity);
    const scopeKey = legacyScopeKeyFor(identity);
    mkdirSync(transactionsRoot, { recursive: true });
    assertStorageUnambiguous([scopeKey]);
    const writer = acquireWriter(identity, "advance", scopeKey);
    try {
      const current = readLegacyCheckpoint(identity, { ignoredLock: writer.lock });
      if (!current) throw fail("WORKFLOW_CHECKPOINT_NOT_FOUND");
      const stageIndex = WORKFLOW_CHECKPOINT_STAGES.indexOf(stage);
      if (stageIndex < current.progress.length) {
        if (!legacySame(current.progress[stageIndex].result, result)) {
          throw fail("WORKFLOW_CHECKPOINT_RESULT_MISMATCH");
        }
        return current;
      }
      if (stageIndex !== current.progress.length) throw fail("WORKFLOW_CHECKPOINT_STAGE_OUT_OF_ORDER");
      const { state: _state, nextStage: _nextStage, ...transaction } = current;
      const advanced = validateLegacyTransaction({
        ...transaction,
        progress: [...current.progress, { stage, result }],
      });
      return persistAdvanced({ transaction: advanced, identity, scopeKey, writer });
    } finally {
      writer.release();
    }
  };

  const advanceCurrentCheckpoint = ({ identity, stage, receipt }) => {
    const stages = profileStagesFor(identity);
    if (!stages.includes(stage)) throw new TypeError(`Unknown workflow checkpoint stage ${stage}`);
    const normalizedReceipt = normalizeOpaqueObject(receipt, `${stage} receipt`);
    const scopeKey = scopeKeyFor(identity);
    mkdirSync(transactionsRoot, { recursive: true });
    readCurrentCheckpoint(identity);
    const writer = acquireWriter(identity, "advance", scopeKey);
    try {
      const current = readCurrentCheckpoint(identity, { ignoredLock: writer.lock });
      if (!current) throw fail("WORKFLOW_CHECKPOINT_NOT_FOUND");
      if (current.schema === LEGACY_WORKFLOW_CHECKPOINT_SCHEMA) {
        throw fail("WORKFLOW_CHECKPOINT_LEGACY_RESUME_REQUIRED", [
          "Resume the legacy transaction with its exact v1 identity and result contract.",
        ]);
      }
      const stageIndex = stages.indexOf(stage);
      if (stageIndex < current.progress.length) {
        if (!same(current.progress[stageIndex].receipt, normalizedReceipt)) {
          throw fail("WORKFLOW_CHECKPOINT_RESULT_MISMATCH");
        }
        return current;
      }
      if (stageIndex !== current.progress.length) throw fail("WORKFLOW_CHECKPOINT_STAGE_OUT_OF_ORDER");
      const { state: _state, nextStage: _nextStage, ...transaction } = current;
      const advanced = validateTransaction({
        ...transaction,
        progress: [...current.progress, { stage, receipt: normalizedReceipt }],
      });
      return persistAdvanced({ transaction: advanced, identity, scopeKey, writer });
    } finally {
      writer.release();
    }
  };

  const advanceCheckpoint = ({ identity: inputIdentity, stage, result, receipt }) => {
    if (identityKind(inputIdentity) === "legacy") {
      if (receipt !== undefined) throw new TypeError("Legacy workflow checkpoint advancement requires result");
      return advanceLegacyCheckpoint({
        identity: normalizeLegacyIdentity(inputIdentity),
        stage,
        result,
      });
    }
    if (result !== undefined) throw new TypeError("Workflow checkpoint v2 advancement requires receipt");
    return advanceCurrentCheckpoint({
      identity: normalizeIdentity(inputIdentity),
      stage,
      receipt,
    });
  };

  return { createCheckpoint, readCheckpoint, advanceCheckpoint };
}
