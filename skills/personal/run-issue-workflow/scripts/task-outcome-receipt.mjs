import { createHash } from "node:crypto";

export const TASK_OUTCOME_RECEIPT_SCHEMA = "workflow-task-outcome:v1";
export const MAX_TASK_OUTCOME_RECEIPT_BYTES = 16 * 1024;
export const MAX_HOST_ENCODED_RESPONSE_BYTES = 1024 * 1024;
export const MAX_HISTORY_RESPONSE_BYTES = 256 * 1024;
export const MAX_HISTORY_READS = 4;

const receiptFields = new Set([
  "schema", "identity", "runId", "issueId", "operationId", "requestIdentity", "taskRef",
  "producer", "phase", "disposition", "candidate", "evidence", "effects", "failureFingerprint",
  "progress", "budget", "nativeRevision",
]);
const inputFields = new Set([...receiptFields].filter(field => !["schema", "identity"].includes(field)));
const producerFields = new Set(["name", "revision", "packageVersion"]);
const taskRefFields = new Set(["threadId", "hostId"]);
const evidenceFields = new Set(["kind", "locator", "digest"]);
const effectsFields = new Set(["pending", "accepted"]);
const progressFields = new Set(["executionStartedAt", "lastVerifiedProgressAt", "terminalObservedAt"]);
const budgetFields = new Set([
  "encodedResponseBytes", "maxEncodedResponseBytes", "fullHistoryReads", "maxFullHistoryReads",
]);
const dispositions = new Set([
  "RUNNING", "SUCCEEDED", "FAILED", "NEEDS_ATTENTION", "UNKNOWN",
  "RESPONSE_BUDGET_EXCEEDED", "CONFLICT",
]);
const evidenceKinds = new Set([
  "native-progress", "native-settlement", "native-attention", "native-failure", "missing-evidence", "tracker-completion",
]);
const isoInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const sha256 = /^sha256:[a-f0-9]{64}$/u;
const operationIdentity = /^workflow-op-v1-[a-f0-9]{64}$/u;
const revision = /^(?:[a-f0-9]{40}|[a-f0-9]{64}|unavailable)$/u;
const candidate = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const assertExact = (value, fields, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const unknown = Object.keys(value).find(field => !fields.has(field));
  const missing = [...fields].find(field => !Object.hasOwn(value, field));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
  if (missing) throw new TypeError(`${label} is missing field ${missing}`);
};
const requireText = (value, label, maximum = 512) => {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${label} must be bounded non-empty text`);
  }
};
const requireInstantOrNull = (value, label) => {
  if (value !== null && (!isoInstant.test(value) || new Date(value).toISOString() !== value)) {
    throw new TypeError(`${label} must be a canonical ISO instant or null`);
  }
};
const requireNonNegative = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
};
const canonicalize = value => Array.isArray(value) ? value.map(canonicalize)
  : isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
    : value;
const digest = value => `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;

export const encodedBytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");

export function validateTaskOutcomeReceipt(receipt) {
  assertExact(receipt, receiptFields, "task outcome receipt");
  if (receipt.schema !== TASK_OUTCOME_RECEIPT_SCHEMA || !sha256.test(receipt.identity)) {
    throw new TypeError("Task outcome receipt schema or identity is invalid");
  }
  for (const field of ["runId", "issueId", "operationId", "requestIdentity", "phase"]) {
    requireText(receipt[field], `task outcome ${field}`);
  }
  if (!operationIdentity.test(receipt.operationId)) throw new TypeError("Task outcome operationId is invalid");
  assertExact(receipt.taskRef, taskRefFields, "task outcome taskRef");
  requireText(receipt.taskRef.threadId, "task outcome threadId");
  requireText(receipt.taskRef.hostId, "task outcome hostId");
  assertExact(receipt.producer, producerFields, "task outcome producer");
  requireText(receipt.producer.name, "task outcome producer name", 64);
  if (!revision.test(receipt.producer.revision) || !revision.test(receipt.producer.packageVersion)) {
    throw new TypeError("Task outcome producer revision and package version must be exact digests or unavailable");
  }
  if (!dispositions.has(receipt.disposition)) throw new TypeError("Task outcome disposition is unsupported");
  if (receipt.candidate !== null && !candidate.test(receipt.candidate)) throw new TypeError("Task outcome candidate is invalid");
  if (!Array.isArray(receipt.evidence) || receipt.evidence.length === 0 || receipt.evidence.length > 8) {
    throw new TypeError("Task outcome evidence must contain one through eight locators");
  }
  for (const item of receipt.evidence) {
    assertExact(item, evidenceFields, "task outcome evidence");
    if (!evidenceKinds.has(item.kind)) throw new TypeError("Task outcome evidence kind is unsupported");
    requireText(item.locator, "task outcome evidence locator", 1024);
    if (!/^(?:codex-task|codex-host|github-issue):\/\//u.test(item.locator) || !sha256.test(item.digest)) {
      throw new TypeError("Task outcome evidence requires a safe locator and digest");
    }
  }
  assertExact(receipt.effects, effectsFields, "task outcome effects");
  for (const field of effectsFields) {
    if (!Array.isArray(receipt.effects[field]) || receipt.effects[field].length > 16
      || receipt.effects[field].some(value => !sha256.test(value))) {
      throw new TypeError(`Task outcome effects.${field} must be bounded identity text`);
    }
  }
  if (receipt.effects.pending.some(value => receipt.effects.accepted.includes(value))) {
    throw new TypeError("Task outcome effect cannot be both pending and accepted");
  }
  if (receipt.failureFingerprint !== null && !sha256.test(receipt.failureFingerprint)) {
    throw new TypeError("Task outcome failure fingerprint must be a digest or null");
  }
  assertExact(receipt.progress, progressFields, "task outcome progress");
  for (const field of progressFields) requireInstantOrNull(receipt.progress[field], `task outcome progress.${field}`);
  const terminal = ["SUCCEEDED", "FAILED"].includes(receipt.disposition);
  const failed = ["FAILED", "NEEDS_ATTENTION", "UNKNOWN", "RESPONSE_BUDGET_EXCEEDED"].includes(receipt.disposition);
  if (terminal !== (receipt.progress.terminalObservedAt !== null)
    || failed !== (receipt.failureFingerprint !== null)) {
    throw new TypeError("Task outcome disposition differs from its terminal or failure evidence");
  }
  assertExact(receipt.budget, budgetFields, "task outcome budget");
  for (const field of budgetFields) requireNonNegative(receipt.budget[field], `task outcome budget.${field}`);
  const responseOverflow = receipt.disposition === "RESPONSE_BUDGET_EXCEEDED";
  const responseBudgetInvalid = responseOverflow
    ? receipt.budget.encodedResponseBytes <= receipt.budget.maxEncodedResponseBytes
    : receipt.budget.encodedResponseBytes > receipt.budget.maxEncodedResponseBytes;
  if (responseBudgetInvalid || receipt.budget.fullHistoryReads > receipt.budget.maxFullHistoryReads) {
    throw new TypeError("Task outcome exceeds its declared observation budget");
  }
  if (responseOverflow && !receipt.evidence.some(item => item.kind === "missing-evidence")) {
    throw new TypeError("Response budget overflow requires missing-evidence attribution");
  }
  if (receipt.nativeRevision !== null && !sha256.test(receipt.nativeRevision)) {
    throw new TypeError("Task outcome nativeRevision must be an opaque digest or null");
  }
  const { identity, ...identityInput } = receipt;
  if (digest(identityInput) !== identity) throw new TypeError("Task outcome receipt identity differs from its exact body");
  if (encodedBytes(receipt) > MAX_TASK_OUTCOME_RECEIPT_BYTES) throw new TypeError("Task outcome receipt exceeds its byte budget");
  return receipt;
}

export function createTaskOutcomeReceipt(input) {
  assertExact(input, inputFields, "task outcome input");
  const body = { schema: TASK_OUTCOME_RECEIPT_SCHEMA, ...input };
  const receipt = { ...body, identity: digest(body) };
  return validateTaskOutcomeReceipt(receipt);
}

export function responseBudgetError({ operation, locator, encodedResponseBytes, maxEncodedResponseBytes = MAX_HOST_ENCODED_RESPONSE_BYTES }) {
  const evidence = { operation, locator, encodedResponseBytes, maxEncodedResponseBytes };
  const error = new Error(`Encoded native response for ${operation} exceeds ${maxEncodedResponseBytes} bytes; inspect ${locator}`);
  error.code = "NATIVE_RESPONSE_BUDGET_EXCEEDED";
  error.failureFingerprint = digest(evidence);
  error.missingEvidence = { locator, digest: error.failureFingerprint };
  error.encodedResponseBytes = encodedResponseBytes;
  error.maxEncodedResponseBytes = maxEncodedResponseBytes;
  return error;
}
