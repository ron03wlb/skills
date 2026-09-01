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
import { dirname, join, resolve } from "node:path";

export const WORKFLOW_CHECKPOINT_SCHEMA = "workflow-checkpoint-transaction:v1";
export const WORKFLOW_CHECKPOINT_STAGES = Object.freeze([
  "plan.written",
  "checkpoint.committed",
  "attestation.read_back",
  "publication.read_back",
  "handoff.completed",
]);

const identityFields = new Set([
  "repositoryId",
  "producerCommand",
  "specOperationId",
  "target",
  "baseline",
  "initialTargetState",
  "planPath",
  "generatedContentIdentity",
]);
const transactionFields = new Set(["schema", "scopeKey", "transactionId", "identity", "progress"]);
const progressFields = new Set(["stage", "result"]);
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
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|secret|password|credential)/iu.test(key)) {
      throw new TypeError(`Workflow control state must not contain secret field ${key}`);
    }
    assertSecretFree(child, seen);
  }
};

const assertRelativePath = (path) => {
  if (!isText(path) || path.startsWith("/") || path.includes("\\")
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new TypeError("planPath must be one normalized repository-relative path");
  }
};

const normalizeIdentity = (identity) => {
  assertExactFields(identity, identityFields, "workflow checkpoint identity");
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
  const normalized = Object.fromEntries([...identityFields].map((field) => [field, identity[field]]));
  assertSecretFree(normalized);
  return normalized;
};

const stableJson = (value) => JSON.stringify(value);
const digest = (value) => createHash("sha256").update(stableJson(value)).digest("hex");
const scopeFor = (identity) => ({
  repositoryId: identity.repositoryId,
  specOperationId: identity.specOperationId,
});
const scopeKeyFor = (identity) => `sha256:${digest(scopeFor(identity))}`;
const transactionIdFor = (identity) => `sha256:${digest(identity)}`;

const resultFields = (stage) => new Set(stage === "plan.written"
  ? ["path", "contentIdentity"]
  : stage === "checkpoint.committed"
    ? ["commit"]
    : stage === "attestation.read_back"
      ? ["recordIdentity"]
      : stage === "publication.read_back"
        ? ["publicationIdentity"]
        : ["handoffIdentity"]);

const validateStageResult = (stage, result, identity) => {
  assertExactFields(result, resultFields(stage), `${stage} result`);
  assertSecretFree(result);
  if (stage === "plan.written") {
    if (result.path !== identity.planPath || result.contentIdentity !== identity.generatedContentIdentity) {
      throw fail("WORKFLOW_CHECKPOINT_RESULT_MISMATCH", ["Plan result differs from bound path or content identity."]);
    }
  } else if (stage === "checkpoint.committed") {
    if (!gitObjectPattern.test(result.commit)) throw new TypeError("checkpoint commit must be one Git object identity");
  } else if (!Object.values(result).every(isText)) {
    throw new TypeError(`${stage} result identity is required`);
  }
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
  if (!Array.isArray(transaction.progress) || transaction.progress.length > WORKFLOW_CHECKPOINT_STAGES.length) {
    throw new TypeError("Workflow checkpoint progress is invalid");
  }
  transaction.progress.forEach((entry, index) => {
    assertExactFields(entry, progressFields, `workflow checkpoint progress ${index + 1}`);
    if (entry.stage !== WORKFLOW_CHECKPOINT_STAGES[index]) {
      throw new TypeError("Workflow checkpoint progress must be one ordered prefix");
    }
    validateStageResult(entry.stage, entry.result, identity);
  });
  assertSecretFree(transaction);
  return { ...transaction, identity };
};

const toView = (transaction) => {
  const complete = transaction.progress.length === WORKFLOW_CHECKPOINT_STAGES.length;
  return {
    ...transaction,
    state: complete ? "COMPLETED" : "INCOMPLETE",
    nextStage: complete ? null : WORKFLOW_CHECKPOINT_STAGES[transaction.progress.length],
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

const same = (left, right) => stableJson(left) === stableJson(right);

export function createWorkflowControlStore({ gitCommonDir }) {
  if (!isText(gitCommonDir)) throw new TypeError("gitCommonDir is required");
  const controlRoot = join(resolve(gitCommonDir), "matt-workflow-control");
  const transactionsRoot = join(controlRoot, "workflow-checkpoints");
  const writersRoot = join(controlRoot, "workflow-checkpoint-writers");

  const fileFor = (scopeKey) => join(transactionsRoot, `${scopeKey.slice("sha256:".length)}.json`);
  const scopeHashFor = (scopeKey) => scopeKey.slice("sha256:".length);
  const targetKeyFor = ({ repositoryId, target }) => digest({ repositoryId, target });
  const lockFor = (scopeKey) => join(writersRoot, `${scopeHashFor(scopeKey)}.lock`);
  const targetGateFor = (identity) => join(writersRoot, `target-${targetKeyFor(identity)}.lock`);
  const temporaryPrefixFor = (scopeKey, identity) => join(
    writersRoot,
    `${scopeHashFor(scopeKey)}.target-${targetKeyFor(identity)}.tmp-`,
  );

  const readFile = (path) => {
    try {
      return validateTransaction(JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      if (error?.code?.startsWith("WORKFLOW_CHECKPOINT_")) throw error;
      throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", [String(error?.message ?? error)]);
    }
  };

  const assertScopeStorageUnambiguous = (scopeKey) => {
    if (!existsSync(writersRoot)) return;
    const path = fileFor(scopeKey);
    const lock = lockFor(scopeKey);
    const temporaryPrefix = `${scopeHashFor(scopeKey)}.target-`;
    const ambiguous = readdirSync(writersRoot)
      .map((name) => join(writersRoot, name))
      .filter((entry) => entry === lock || (
        entry.startsWith(join(writersRoot, temporaryPrefix)) && entry.includes(".tmp-")
      ));
    if (ambiguous.length > 0) {
      throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", ambiguous.map((entry) => `Incomplete state: ${entry}`));
    }
    if (existsSync(path)) readFile(path);
  };

  const readCheckpoint = (inputIdentity) => {
    const identity = normalizeIdentity(inputIdentity);
    const scopeKey = scopeKeyFor(identity);
    assertScopeStorageUnambiguous(scopeKey);
    const path = fileFor(scopeKey);
    if (!existsSync(path)) return null;
    const transaction = readFile(path);
    if (!same(transaction.identity, identity)) {
      throw fail("WORKFLOW_CHECKPOINT_IDENTITY_MISMATCH", [
        `Stored transaction ${transaction.transactionId} does not match the requested retry identity.`,
      ]);
    }
    return toView(transaction);
  };

  const classifyPersisted = ({ repositoryId, target }) => {
    const transactions = [];
    const evidence = [];
    if (existsSync(transactionsRoot)) {
      for (const name of readdirSync(transactionsRoot)) {
        const path = join(transactionsRoot, name);
        if (!name.endsWith(".json")) {
          evidence.push(`Unrecognized workflow checkpoint transaction state: ${path}`);
          continue;
        }
        try {
          const transaction = readFile(path);
          if (transaction.identity.repositoryId === repositoryId && transaction.identity.target === target) {
            transactions.push(toView(transaction));
          }
        } catch (error) {
          evidence.push(...(error.evidence ?? [String(error.message)]));
        }
      }
    }
    return { transactions, evidence };
  };

  const transientEvidenceFor = ({ repositoryId, target }) => {
    if (!existsSync(writersRoot)) return [];
    const targetKey = targetKeyFor({ repositoryId, target });
    const evidence = [];
    for (const name of readdirSync(writersRoot)) {
      const path = join(writersRoot, name);
      const targetGateMatch = /^target-([a-f0-9]{64})\.lock$/u.exec(name);
      if (targetGateMatch) {
        if (targetGateMatch[1] === targetKey) evidence.push(`Target checkpoint creation is active: ${path}`);
        continue;
      }
      const temporaryMatch = /^([a-f0-9]{64})\.target-([a-f0-9]{64})\.tmp-/u.exec(name);
      if (temporaryMatch) {
        if (temporaryMatch[2] === targetKey) evidence.push(`Partial checkpoint persistence is present: ${path}`);
        continue;
      }
      const writerMatch = /^([a-f0-9]{64})\.lock$/u.exec(name);
      if (writerMatch) {
        const transactionPath = join(transactionsRoot, `${writerMatch[1]}.json`);
        try {
          const transaction = readFile(transactionPath);
          if (transaction.identity.repositoryId === repositoryId && transaction.identity.target === target) {
            evidence.push(`Checkpoint advancement is active: ${path}`);
          }
        } catch (error) {
          evidence.push(...(error.evidence ?? [String(error.message)]));
        }
        continue;
      }
      evidence.push(`Unrecognized workflow checkpoint writer state: ${path}`);
    }
    return evidence;
  };

  const classifyCheckpoints = ({ repositoryId, target }) => {
    if (!isText(repositoryId) || !isText(target)) {
      throw new TypeError("repositoryId and target are required");
    }
    const { transactions, evidence: persistedEvidence } = classifyPersisted({ repositoryId, target });
    const evidence = [...persistedEvidence, ...transientEvidenceFor({ repositoryId, target })];
    if (evidence.length > 0) return { state: "UNKNOWN", transactions, evidence };
    const incomplete = transactions.filter(({ state }) => state === "INCOMPLETE");
    if (incomplete.length > 1) {
      return {
        state: "UNKNOWN",
        transactions,
        evidence: ["Multiple incomplete workflow checkpoint transactions target the same repository and branch."],
      };
    }
    return {
      state: incomplete.length === 1 ? "INCOMPLETE" : transactions.length > 0 ? "COMPLETED" : "ABSENT",
      transactions,
      evidence: [],
    };
  };

  const acquireTargetCreationGate = (identity) => {
    mkdirSync(writersRoot, { recursive: true });
    const gate = targetGateFor(identity);
    try {
      mkdirSync(gate);
      syncDirectory(writersRoot);
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error?.code)) {
        throw fail("WORKFLOW_CHECKPOINT_WRITER_LOCKED", [`Target creation gate exists at ${gate}.`]);
      }
      throw error;
    }
    return () => {
      rmSync(gate, { recursive: true, force: false });
      syncDirectory(writersRoot);
    };
  };

  const createCheckpoint = (inputIdentity) => {
    const identity = normalizeIdentity(inputIdentity);
    const scopeKey = scopeKeyFor(identity);
    mkdirSync(transactionsRoot, { recursive: true });
    const releaseTargetGate = acquireTargetCreationGate(identity);
    try {
      assertScopeStorageUnambiguous(scopeKey);
      const existing = readCheckpoint(identity);
      if (existing) return existing;
      const classification = classifyPersisted({
        repositoryId: identity.repositoryId,
        target: identity.target,
      });
      if (classification.evidence.length > 0) {
        throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", classification.evidence);
      }
      if (classification.transactions.some(({ state }) => state === "INCOMPLETE")) {
        throw fail("WORKFLOW_CHECKPOINT_CONFLICT", [
          "Another incomplete workflow checkpoint transaction already targets this repository and branch.",
        ]);
      }
      const transaction = {
        schema: WORKFLOW_CHECKPOINT_SCHEMA,
        scopeKey,
        transactionId: transactionIdFor(identity),
        identity,
        progress: [],
      };
      const path = fileFor(scopeKey);
      const temporary = `${temporaryPrefixFor(scopeKey, identity)}${process.pid}-${randomUUID()}`;
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
      const persisted = readCheckpoint(identity);
      if (!persisted) throw fail("WORKFLOW_CHECKPOINT_STATE_UNKNOWN", ["Atomic checkpoint creation was not readable."]);
      return persisted;
    } finally {
      releaseTargetGate();
    }
  };

  const advanceCheckpoint = ({ identity: inputIdentity, stage, result }) => {
    const identity = normalizeIdentity(inputIdentity);
    if (!WORKFLOW_CHECKPOINT_STAGES.includes(stage)) throw new TypeError(`Unknown workflow checkpoint stage ${stage}`);
    validateStageResult(stage, result, identity);
    const scopeKey = scopeKeyFor(identity);
    const lock = lockFor(scopeKey);
    mkdirSync(transactionsRoot, { recursive: true });
    mkdirSync(writersRoot, { recursive: true });
    assertScopeStorageUnambiguous(scopeKey);
    try {
      mkdirSync(lock);
      syncDirectory(writersRoot);
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error?.code)) {
        throw fail("WORKFLOW_CHECKPOINT_WRITER_LOCKED", [`Checkpoint writer lock exists at ${lock}.`]);
      }
      throw error;
    }
    try {
      const path = fileFor(scopeKey);
      if (!existsSync(path)) throw fail("WORKFLOW_CHECKPOINT_NOT_FOUND");
      const transaction = readFile(path);
      if (!same(transaction.identity, identity)) throw fail("WORKFLOW_CHECKPOINT_IDENTITY_MISMATCH");
      const stageIndex = WORKFLOW_CHECKPOINT_STAGES.indexOf(stage);
      if (stageIndex < transaction.progress.length) {
        if (!same(transaction.progress[stageIndex].result, result)) {
          throw fail("WORKFLOW_CHECKPOINT_RESULT_MISMATCH");
        }
        return toView(transaction);
      }
      if (stageIndex !== transaction.progress.length) throw fail("WORKFLOW_CHECKPOINT_STAGE_OUT_OF_ORDER");
      const advanced = validateTransaction({
        ...transaction,
        progress: [...transaction.progress, { stage, result }],
      });
      const temporary = `${temporaryPrefixFor(scopeKey, identity)}${process.pid}-${randomUUID()}`;
      try {
        writeDurableFile(temporary, `${JSON.stringify(advanced, null, 2)}\n`);
        renameSync(temporary, path);
        syncDirectory(transactionsRoot);
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
        syncDirectory(writersRoot);
      }
      return toView(readFile(path));
    } finally {
      rmSync(lock, { recursive: true, force: false });
      syncDirectory(writersRoot);
    }
  };

  return { createCheckpoint, readCheckpoint, advanceCheckpoint, classifyCheckpoints };
}
