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
  unlinkSync,
  writeSync,
} from "node:fs";
import { join, resolve } from "node:path";

export const OPERATION_ENVELOPE_SCHEMA = "workflow-operation-envelope:v1";
export const OPERATION_ENVELOPE_WRITER_SCHEMA = "workflow-operation-envelope-writer:v1";

const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = value => typeof value === "string" && value.length > 0;
const stableJson = value => JSON.stringify(value);
const sha256 = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;

const assertExactFields = (value, fields, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const unknown = Object.keys(value).find(key => !fields.has(key));
  const missing = [...fields].find(key => !Object.hasOwn(value, key));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
  if (missing) throw new TypeError(`${label} is missing field ${missing}`);
};

const canonicalize = (value, seen = new WeakSet()) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") throw new TypeError("Operation envelope state must be JSON-compatible");
  if (seen.has(value)) throw new TypeError("Operation envelope state must not contain cycles");
  seen.add(value);
  const normalized = Array.isArray(value)
    ? value.map(child => canonicalize(child, seen))
    : (() => {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Operation envelope state must contain plain objects");
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key], seen)]));
    })();
  seen.delete(value);
  return normalized;
};

const assertSecretFree = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) throw new TypeError("Operation envelope state must not contain cycles");
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|secret|password|credential)/iu.test(key)) throw new TypeError(`Operation envelope state must not contain ${key}`);
    assertSecretFree(child, seen);
  }
  seen.delete(value);
};

const normalizeOpaqueRecord = (value, label) => {
  if (!isRecord(value) || Object.keys(value).length === 0) throw new TypeError(`${label} must be one non-empty object`);
  assertSecretFree(value);
  return canonicalize(value);
};

export const envelopeIdFor = identity => sha256(stableJson(normalizeOpaqueRecord(identity, "Operation identity")));

const normalizeIntent = intent => {
  assertExactFields(intent, new Set(["title", "body", "bodyDigest", "contentType", "effects"]), "Operation envelope intent");
  if (intent.title !== null && !isText(intent.title)) throw new TypeError("Operation envelope title must be text or null");
  if (typeof intent.body !== "string") throw new TypeError("Operation envelope body must be text");
  if (!digestPattern.test(intent.bodyDigest) || intent.bodyDigest !== sha256(intent.body)) {
    throw new TypeError("Operation envelope body digest differs from canonical body");
  }
  if (!isText(intent.contentType)) throw new TypeError("Operation envelope content type is required");
  if (!Array.isArray(intent.effects)) throw new TypeError("Operation envelope effects must be explicit");
  assertSecretFree(intent);
  return canonicalize(intent);
};

const normalizeWorkspace = workspace => {
  if (workspace === null) return null;
  return normalizeOpaqueRecord(workspace, "Operation envelope workspace");
};

const normalizeReceipt = receipt => {
  assertExactFields(receipt, new Set(["stage", "owner", "readBack"]), "Operation envelope receipt");
  if (!isText(receipt.stage) || !isText(receipt.owner)) throw new TypeError("Operation envelope receipt stage and owner are required");
  return { stage: receipt.stage, owner: receipt.owner, readBack: normalizeOpaqueRecord(receipt.readBack, "Operation envelope receipt read-back") };
};

const same = (left, right) => stableJson(canonicalize(left)) === stableJson(canonicalize(right));

const normalizeEnvelope = envelope => {
  assertExactFields(envelope, new Set(["schema", "envelopeId", "identity", "intent", "workspace", "maintenanceIssue", "receipts", "state"]), "Operation envelope");
  if (envelope.schema !== OPERATION_ENVELOPE_SCHEMA) throw new TypeError("Unsupported operation envelope schema");
  const identity = normalizeOpaqueRecord(envelope.identity, "Operation identity");
  const envelopeId = envelopeIdFor(identity);
  if (envelope.envelopeId !== envelopeId) throw new TypeError("Operation envelope identity digest mismatch");
  const intent = normalizeIntent(envelope.intent);
  const workspace = normalizeWorkspace(envelope.workspace);
  if (envelope.maintenanceIssue !== null && !isText(envelope.maintenanceIssue)) throw new TypeError("Operation envelope maintenance Issue must be text or null");
  if (!Array.isArray(envelope.receipts)) throw new TypeError("Operation envelope receipts must be an array");
  const receipts = envelope.receipts.map(normalizeReceipt);
  if (new Set(receipts.map(({ stage }) => stage)).size !== receipts.length) throw new TypeError("Operation envelope receipts must have unique stages");
  if (!["INCOMPLETE", "COMPLETED"].includes(envelope.state)) throw new TypeError("Operation envelope state is invalid");
  assertSecretFree(envelope);
  return { schema: OPERATION_ENVELOPE_SCHEMA, envelopeId, identity, intent, workspace, maintenanceIssue: envelope.maintenanceIssue, receipts, state: envelope.state };
};

const writeAll = (descriptor, text) => {
  const content = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < content.length) {
    const written = writeSync(descriptor, content, offset, content.length - offset, null);
    if (written <= 0) throw new Error("Unable to complete durable operation envelope write");
    offset += written;
  }
};

const syncDirectory = directory => {
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

const writeDurable = (path, value) => {
  const descriptor = openSync(path, "wx");
  try {
    writeAll(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

export function createOperationEnvelopeStore({ gitCommonDir }) {
  if (!isText(gitCommonDir)) throw new TypeError("gitCommonDir is required");
  const root = join(resolve(gitCommonDir), "matt-workflow-control", "operation-envelopes");
  const writerRoot = join(resolve(gitCommonDir), "matt-workflow-control", "operation-envelope-writers");
  const fileFor = envelopeId => join(root, `${envelopeId.slice("sha256:".length)}.json`);
  const lockFor = envelopeId => join(writerRoot, `${envelopeId.slice("sha256:".length)}.lock`);

  const readFile = path => {
    try {
      return normalizeEnvelope(JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      throw new Error(`Operation envelope state is unreadable at ${path}: ${error.message}`, { cause: error });
    }
  };
  const read = identity => {
    const envelopeId = envelopeIdFor(identity);
    const path = fileFor(envelopeId);
    if (!existsSync(path)) return null;
    const envelope = readFile(path);
    if (!same(envelope.identity, identity)) throw new Error("Stored operation envelope identity differs");
    return envelope;
  };
  const withWriter = (identity, operation) => {
    const envelopeId = envelopeIdFor(identity);
    const lock = lockFor(envelopeId);
    mkdirSync(writerRoot, { recursive: true });
    try {
      mkdirSync(lock);
      writeDurable(join(lock, "owner.json"), { schema: OPERATION_ENVELOPE_WRITER_SCHEMA, envelopeId });
      syncDirectory(lock);
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw new Error(`Operation envelope writer lock exists at ${lock}`);
      throw error;
    }
    try {
      return operation(envelopeId);
    } finally {
      rmSync(lock, { recursive: true, force: false });
      syncDirectory(writerRoot);
    }
  };
  const persist = envelope => {
    const path = fileFor(envelope.envelopeId);
    const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
    try {
      writeDurable(temporary, envelope);
      renameSync(temporary, path);
      syncDirectory(root);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return read(envelope.identity);
  };

  return Object.freeze({
    read,
    create({ identity, intent, workspace = null, maintenanceIssue = null }) {
      const normalizedIdentity = normalizeOpaqueRecord(identity, "Operation identity");
      const proposed = normalizeEnvelope({ schema: OPERATION_ENVELOPE_SCHEMA, envelopeId: envelopeIdFor(normalizedIdentity),
        identity: normalizedIdentity, intent, workspace, maintenanceIssue, receipts: [], state: "INCOMPLETE" });
      mkdirSync(root, { recursive: true });
      return withWriter(normalizedIdentity, () => {
        const existing = read(normalizedIdentity);
        if (existing) {
          if (!same(existing.intent, proposed.intent) || !same(existing.workspace, proposed.workspace)
            || existing.maintenanceIssue !== proposed.maintenanceIssue) {
            throw new Error("Stored operation envelope content differs");
          }
          return existing;
        }
        const path = fileFor(proposed.envelopeId);
        writeDurable(path, proposed);
        syncDirectory(root);
        return read(normalizedIdentity);
      });
    },
    appendReceipt({ identity, receipt }) {
      const normalizedIdentity = normalizeOpaqueRecord(identity, "Operation identity");
      const normalizedReceipt = normalizeReceipt(receipt);
      return withWriter(normalizedIdentity, () => {
        const current = read(normalizedIdentity);
        if (!current) throw new Error("Operation envelope was not found");
        const existing = current.receipts.find(item => item.stage === normalizedReceipt.stage);
        if (existing) {
          if (!same(existing, normalizedReceipt)) throw new Error("Operation envelope receipt differs");
          return current;
        }
        if (current.state === "COMPLETED") throw new Error("Completed operation envelope cannot accept another receipt");
        return persist(normalizeEnvelope({ ...current, receipts: [...current.receipts, normalizedReceipt] }));
      });
    },
    complete({ identity, receipt }) {
      const normalizedIdentity = normalizeOpaqueRecord(identity, "Operation identity");
      const normalizedReceipt = normalizeReceipt(receipt);
      return withWriter(normalizedIdentity, () => {
        const current = read(normalizedIdentity);
        if (!current) throw new Error("Operation envelope was not found");
        const existing = current.receipts.find(item => item.stage === normalizedReceipt.stage);
        if (existing && !same(existing, normalizedReceipt)) throw new Error("Operation envelope receipt differs");
        const receipts = existing ? current.receipts : [...current.receipts, normalizedReceipt];
        if (current.state === "COMPLETED") return current;
        return persist(normalizeEnvelope({ ...current, receipts, state: "COMPLETED" }));
      });
    },
  });
}
