import { createHash } from "node:crypto";

export const TASK_OUTCOME_RECEIPT_SCHEMA = "workflow-task-outcome:v1";
export const NATIVE_OBSERVATION_SCHEMA = "codex-native-observation:v1";
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
const nativeObservationFields = new Set([
  "schema", "identity", "requestIdentity", "producer", "observedAt", "bindings", "payload", "budget",
]);
const nativeBudgetFields = new Set(["encodedResponseBytes", "maxEncodedResponseBytes"]);
const nativeBindingFields = new Set([
  "runId", "issueId", "operationId", "requestIdentity", "taskRef", "phase", "candidate",
]);
const taskRefFields = new Set(["threadId", "hostId"]);
const evidenceFields = new Set(["kind", "locator", "digest"]);
const effectsFields = new Set(["pending", "accepted"]);
const progressFields = new Set(["executionStartedAt", "lastVerifiedProgressAt", "terminalObservedAt"]);
const budgetFields = new Set([
  "encodedResponseBytes", "maxEncodedResponseBytes", "fullHistoryReads", "maxFullHistoryReads",
]);
const dispositions = new Set([
  "RUNNING", "SUCCEEDED", "FAILED", "NEEDS_ATTENTION", "UNKNOWN",
  "RESPONSE_BUDGET_EXCEEDED", "CONFLICT", "UNCLASSIFIED",
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
const assertAllowed = (value, fields, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const unknown = Object.keys(value).find(field => !fields.has(field));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
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

export function validateNativeObservationEnvelope(envelope) {
  assertExact(envelope, nativeObservationFields, "native observation envelope");
  if (envelope.schema !== NATIVE_OBSERVATION_SCHEMA || !sha256.test(envelope.identity)) {
    throw new TypeError("Native observation schema or identity is invalid");
  }
  requireText(envelope.requestIdentity, "native observation requestIdentity");
  assertExact(envelope.producer, producerFields, "native observation producer");
  if (envelope.producer.name !== "codex-host-driver"
    || !revision.test(envelope.producer.revision) || !revision.test(envelope.producer.packageVersion)) {
    throw new TypeError("Native observation producer is not the trusted host adapter");
  }
  requireInstantOrNull(envelope.observedAt, "native observation observedAt");
  if (envelope.observedAt === null) throw new TypeError("Native observation requires its producer time");
  if (!Array.isArray(envelope.bindings) || envelope.bindings.length > 8) {
    throw new TypeError("Native observation bindings must be a bounded list");
  }
  for (const binding of envelope.bindings) {
    assertExact(binding, nativeBindingFields, "native observation binding");
    for (const field of ["runId", "issueId", "operationId", "requestIdentity", "phase"]) {
      requireText(binding[field], `native observation binding ${field}`);
    }
    if (!operationIdentity.test(binding.operationId)) throw new TypeError("Native observation operationId is invalid");
    assertExact(binding.taskRef, taskRefFields, "native observation taskRef");
    requireText(binding.taskRef.threadId, "native observation threadId");
    requireText(binding.taskRef.hostId, "native observation hostId");
    if (binding.candidate !== null && !candidate.test(binding.candidate)) throw new TypeError("Native observation candidate is invalid");
  }
  assertAllowed(envelope.payload, new Set(["timedOut", "polls", "results", "threads", "thread", "turns", "page", "error"]), "native observation payload");
  if (Object.hasOwn(envelope.payload, "timedOut") && typeof envelope.payload.timedOut !== "boolean") {
    throw new TypeError("Native observation timedOut must be boolean");
  }
  const entries = ["polls", "results", "threads"].flatMap(field => {
    const value = envelope.payload[field];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 8) throw new TypeError(`Native observation ${field} must be bounded`);
    return value;
  });
  if (envelope.payload.thread) entries.push({ thread: envelope.payload.thread,
    ...(envelope.payload.turns?.[0] ? { state: envelope.payload.turns[0].status } : {}),
    ...(envelope.payload.error ? { error: envelope.payload.error } : {}) });
  for (const entry of entries) {
    assertAllowed(entry, new Set(["thread", "threadId", "hostId", "cursor", "status", "state", "event", "needsAttention", "error"]), "native observation entry");
    for (const field of ["threadId", "hostId", "cursor", "state", "event"]) {
      if (entry[field] !== undefined) requireText(entry[field], `native observation ${field}`, 8192);
    }
    if (entry.status !== undefined) {
      if (typeof entry.status === "string") requireText(entry.status, "native observation status", 8192);
      else {
        assertAllowed(entry.status, new Set(["type"]), "native observation status");
        requireText(entry.status.type, "native observation status.type", 8192);
      }
    }
    if (entry.thread !== undefined) {
      assertAllowed(entry.thread, new Set(["id", "hostId", "status", "cwd", "preview"]), "native observation thread");
      for (const field of ["id", "hostId", "cwd", "preview"]) {
        if (entry.thread[field] !== undefined) requireText(entry.thread[field], `native observation thread.${field}`, 8192);
      }
      if (entry.thread.status !== undefined) {
        assertAllowed(entry.thread.status, new Set(["type"]), "native observation thread status");
        requireText(entry.thread.status.type, "native observation thread status type", 8192);
      }
    }
    if (entry.needsAttention !== undefined && typeof entry.needsAttention !== "boolean") throw new TypeError("Native observation needsAttention must be boolean");
    if (entry.error !== undefined) {
      assertAllowed(entry.error, new Set(["code", "locator", "encodedResponseBytes", "maxEncodedResponseBytes"]), "native observation error");
      requireText(entry.error.code, "native observation error code", 8192);
      if (entry.error.locator !== undefined) requireText(entry.error.locator, "native observation error locator", 1024);
      for (const field of ["encodedResponseBytes", "maxEncodedResponseBytes"]) {
        if (entry.error[field] !== undefined) requireNonNegative(entry.error[field], `native observation error.${field}`);
      }
      if (["native-history-budget-exceeded", "native-history-field-budget-exceeded"].includes(entry.error.code)
        && (!entry.error.locator || entry.error.encodedResponseBytes === undefined
          || entry.error.maxEncodedResponseBytes === undefined)) {
        throw new TypeError("Native history overflow lacks its attributable locator and byte budget");
      }
    }
  }
  if (envelope.payload.turns !== undefined && (!Array.isArray(envelope.payload.turns)
    || envelope.payload.turns.length > 2 || envelope.payload.turns.some(turn => !isRecord(turn)
      || Object.keys(turn).some(field => !new Set(["id", "status", "items"]).has(field))
      || turn.id !== undefined && (typeof turn.id !== "string" || turn.id.length > 8192)
      || typeof turn.status !== "string" || turn.status.length === 0 || turn.status.length > 8192
      || turn.items !== undefined && (!Array.isArray(turn.items) || turn.items.length > 32
        || turn.items.some(item => {
          if (!isRecord(item)) return true;
          if (item.type === "userMessage") return Object.keys(item).some(field => !new Set(["type", "content"]).has(field))
            || !Array.isArray(item.content) || item.content.length > 8 || item.content.some(part => !isRecord(part)
              || Object.keys(part).some(field => !new Set(["type", "text"]).has(field))
              || part.type !== "text" || typeof part.text !== "string" || part.text.length > 8192);
          if (item.type === "agentMessage") return Object.keys(item).some(field => !new Set(["type", "phase", "text"]).has(field))
            || item.phase !== "final_answer" || typeof item.text !== "string" || item.text.length > 8192;
          if (item.type === "functionCallOutput") return Object.keys(item).some(field =>
            !new Set(["type", "namespace", "name", "output"]).has(field)) || item.namespace !== "codex_app"
            || !["create_thread", "send_message_to_thread"].includes(item.name) || !isRecord(item.output)
            || Object.keys(item.output).some(field => !new Set(["text", "truncated"]).has(field))
            || item.output.truncated !== false || typeof item.output.text !== "string" || item.output.text.length > 8192;
          return true;
        }))))) {
    throw new TypeError("Native observation turns must be bounded owner history");
  }
  if (envelope.payload.page !== undefined && (!isRecord(envelope.payload.page)
    || Object.keys(envelope.payload.page).some(field => !new Set(["hasMore", "nextCursor"]).has(field))
    || typeof envelope.payload.page.hasMore !== "boolean"
    || envelope.payload.page.hasMore && envelope.payload.page.nextCursor === undefined
    || envelope.payload.page.nextCursor !== undefined && (typeof envelope.payload.page.nextCursor !== "string"
      || envelope.payload.page.nextCursor.length === 0 || envelope.payload.page.nextCursor.length > 8192))) {
    throw new TypeError("Native observation page is malformed");
  }
  assertExact(envelope.budget, nativeBudgetFields, "native observation budget");
  for (const field of nativeBudgetFields) requireNonNegative(envelope.budget[field], `native observation budget.${field}`);
  if (envelope.budget.encodedResponseBytes > envelope.budget.maxEncodedResponseBytes
    || envelope.budget.maxEncodedResponseBytes < 1
    || envelope.budget.maxEncodedResponseBytes > MAX_HOST_ENCODED_RESPONSE_BYTES) {
    throw new TypeError("Native observation exceeds its encoded response budget");
  }
  const { identity, ...identityInput } = envelope;
  if (digest(identityInput) !== identity) throw new TypeError("Native observation identity differs from its exact body");
  if (encodedBytes(envelope) !== envelope.budget.encodedResponseBytes) {
    throw new TypeError("Native observation encoded byte count differs from its exact body");
  }
  return envelope;
}

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
  if (receipt.producer.name !== "codex-workflow-tasks") throw new TypeError("Task outcome producer is not the trusted workflow adapter");
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
  if (receipt.evidence.some(item => item.kind === "tracker-completion") && receipt.candidate === null) {
    throw new TypeError("Tracker completion outcome requires its exact candidate");
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
  const failed = ["FAILED", "NEEDS_ATTENTION", "UNKNOWN", "RESPONSE_BUDGET_EXCEEDED", "UNCLASSIFIED"].includes(receipt.disposition);
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
