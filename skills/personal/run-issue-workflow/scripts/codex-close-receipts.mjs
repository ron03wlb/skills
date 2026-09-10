import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";

const digest = value => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const exactKeys = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const messageRequestFields = {
  retry: ["runId", "issueId", "attempt"],
  repair: ["runId", "issueId", "candidate", "baseline", "wave", "requestIdentity"],
  recovery: ["runId", "issueId", "operationId", "requestIdentity", "phase", "wave", "failureIdentity"],
  upgrade: ["runId", "issueId", "requestIdentity", "candidate", "repairWaves", "yieldIdentity"],
  "recovery-handoff": ["runId", "issueId", "operationId"],
};
const validMessageIntent = value => {
  if (!exactKeys(value, ["kind", "request", "promptIdentity"])
    || !Object.hasOwn(messageRequestFields, value.kind)
    || !/^sha256:[a-f0-9]{64}$/u.test(value.promptIdentity)
    || !exactKeys(value.request, messageRequestFields[value.kind])
    || typeof value.request.runId !== "string" || !value.request.runId
    || typeof value.request.issueId !== "string" || !value.request.issueId) return false;
  if (value.kind === "retry") return Number.isInteger(value.request.attempt) && value.request.attempt >= 1;
  if (value.kind === "repair") return Number.isInteger(value.request.wave) && value.request.wave >= 1 && value.request.wave <= 10
    && /^[a-f0-9]{40,64}$/u.test(value.request.candidate) && /^[a-f0-9]{40,64}$/u.test(value.request.baseline)
    && /^sha256:[a-f0-9]{64}$/u.test(value.request.requestIdentity);
  if (value.kind === "recovery") return typeof value.request.operationId === "string" && Boolean(value.request.operationId)
    && /^sha256:[a-f0-9]{64}$/u.test(value.request.requestIdentity)
    && typeof value.request.phase === "string" && Boolean(value.request.phase)
    && (value.request.wave === null || Number.isInteger(value.request.wave) && value.request.wave >= 1 && value.request.wave <= 10)
    && typeof value.request.failureIdentity === "string" && Boolean(value.request.failureIdentity);
  if (value.kind === "upgrade") return /^sha256:[a-f0-9]{64}$/u.test(value.request.requestIdentity)
    && /^[a-f0-9]{40,64}$/u.test(value.request.candidate)
    && Number.isInteger(value.request.repairWaves) && value.request.repairWaves >= 2 && value.request.repairWaves < 10
    && /^sha256:[a-f0-9]{64}$/u.test(value.request.yieldIdentity);
  return typeof value.request.operationId === "string" && Boolean(value.request.operationId);
};
const messageOperationIdentity = value => digest({
  kind: value.kind,
  request: Object.fromEntries(messageRequestFields[value.kind].map(field => [field, value.request[field]])),
});
const recoveryDelaysMs = [5000, 15000, 30000];

// Evidence only, scoped to the existing Run and native task. This is neither a
// Grant nor task state; current native status and close authority remain required.
export function createCodexCloseReceipts({ gitCommonDir, runId, taskRef }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(runId) || runId === "." || runId === ".."
    || !taskRef?.threadId || !taskRef.hostId) throw new Error("Close receipt ownership is unproven");
  const identity = { runId, taskRef: { threadId: taskRef.threadId, hostId: taskRef.hostId } };
  const path = join(gitCommonDir, "matt-workflow-control", "runs", runId, `close-messages-${digest(identity.taskRef).slice(7)}.jsonl`);
  const entries = () => {
    if (!existsSync(path)) return [];
    const text = readFileSync(path, "utf8");
    if (!text.endsWith("\n")) throw new Error("Close receipt write is incomplete; preserve its request");
    return text.trimEnd().split("\n").map((line, index) => {
      const record = JSON.parse(line);
      if (record.schema !== "codex-close-message:v1" || record.sequence !== index + 1
        || digest(record.owner) !== digest(identity) || !["intent", "accepted", "outcome"].includes(record.phase)) {
        throw new Error("Close receipt identity differs");
      }
      return record;
    });
  };
  const append = record => {
    const previous = entries();
    if (previous.some(item => item.phase === record.phase && digest(item.value) === digest(record.value))) return;
    mkdirSync(dirname(path), { recursive: true });
    const descriptor = openSync(path, "a", 0o600);
    try {
      const bytes = Buffer.from(JSON.stringify({ schema: "codex-close-message:v1", sequence: previous.length + 1,
        owner: identity, ...record }) + "\n", "utf8");
      let offset = 0;
      while (offset < bytes.length) {
        const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
        if (!written) throw new Error("Close receipt write did not complete");
        offset += written;
      }
      fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
  };
  const read = () => {
    const records = entries();
    const intent = records.findLast(record => record.phase === "intent")?.value;
    if (!intent) return null;
    if (intent.promptIdentity !== digest(intent.prompt)) throw new Error("Close receipt prompt identity differs");
    const accepted = records.findLast(record => record.phase === "accepted" && record.value.promptIdentity === intent.promptIdentity)?.value;
    const outcome = records.findLast(record => record.phase === "outcome" && record.value.promptIdentity === intent.promptIdentity)?.value;
    if (accepted && (accepted.threadId !== taskRef.threadId || !["native-response", "native-history"].includes(accepted.source))) {
      throw new Error("Close receipt native acceptance differs");
    }
    if (outcome && !accepted) throw new Error("Close outcome has no accepted owner");
    return { ...intent, accepted, outcome };
  };
  return {
    read,
    reserve(prompt) {
      const promptIdentity = digest(prompt);
      const existing = entries().find(record => record.phase === "intent" && record.value.promptIdentity === promptIdentity);
      if (existing) return { created: false, ...existing.value };
      const value = { prompt, promptIdentity };
      append({ phase: "intent", value });
      return { created: true, ...value };
    },
    accept(promptIdentity, source) {
      if (read()?.promptIdentity !== promptIdentity) throw new Error("Close acceptance differs from its reserved request");
      if (read().accepted) return;
      append({ phase: "accepted", value: { promptIdentity, source, threadId: taskRef.threadId } });
    },
    observe(promptIdentity, result) {
      if (read()?.promptIdentity !== promptIdentity || !read().accepted) throw new Error("Close outcome differs from its accepted request");
      if (read().outcome && digest(read().outcome.result) !== digest(result)) throw new Error("Accepted close has contradictory native outcomes");
      append({ phase: "outcome", value: { promptIdentity, result } });
    },
  };
}

// General execution continuations keep only their allowlisted marker fields and
// prompt digest. The complete prompt remains owned by native task history.
export function createCodexMessageReceipts({ gitCommonDir, runId, taskRef }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(runId) || runId === "." || runId === ".."
    || !taskRef?.threadId || !taskRef.hostId) throw new Error("Task message receipt ownership is unproven");
  const identity = { runId, taskRef: { threadId: taskRef.threadId, hostId: taskRef.hostId } };
  const path = join(gitCommonDir, "matt-workflow-control", "runs", runId, `task-messages-${digest(identity.taskRef).slice(7)}.jsonl`);
  const entries = () => {
    if (!existsSync(path)) return [];
    const text = readFileSync(path, "utf8");
    if (!text.endsWith("\n")) throw new Error("Task message receipt write is incomplete; preserve its request");
    const records = text.trimEnd().split("\n").map((line, index) => {
      const record = JSON.parse(line);
      const validValue = record.phase === "intent" ? validMessageIntent(record.value)
        : record.phase === "accepted" && exactKeys(record.value, ["promptIdentity", "source", "threadId"])
          && /^sha256:[a-f0-9]{64}$/u.test(record.value.promptIdentity)
          && ["native-response", "native-history"].includes(record.value.source)
          && record.value.threadId === taskRef.threadId
          || record.phase === "observation" && exactKeys(record.value, ["promptIdentity", "round", "delayMs"])
          && /^sha256:[a-f0-9]{64}$/u.test(record.value.promptIdentity)
          && Number.isInteger(record.value.round) && record.value.round >= 1 && record.value.round <= recoveryDelaysMs.length
          && record.value.delayMs === recoveryDelaysMs[record.value.round - 1];
      if (!exactKeys(record, ["schema", "sequence", "owner", "phase", "value"])
        || record.schema !== "codex-task-message:v1" || record.sequence !== index + 1
        || digest(record.owner) !== digest(identity) || !validValue) {
        throw new Error("Task message receipt identity differs");
      }
      return record;
    });
    const promptsByOperation = new Map();
    const operationsByPrompt = new Map();
    for (const record of records.filter(item => item.phase === "intent")) {
      const operationIdentity = messageOperationIdentity(record.value);
      const promptIdentity = record.value.promptIdentity;
      if (promptsByOperation.has(operationIdentity)
        && promptsByOperation.get(operationIdentity) !== promptIdentity) {
        throw new Error("Task message operation has conflicting prompt identity");
      }
      if (operationsByPrompt.has(promptIdentity)
        && operationsByPrompt.get(promptIdentity) !== operationIdentity) {
        throw new Error("Task message prompt identity belongs to another operation");
      }
      promptsByOperation.set(operationIdentity, promptIdentity);
      operationsByPrompt.set(promptIdentity, operationIdentity);
    }
    for (const [index, record] of records.entries()) {
      if (!["accepted", "observation"].includes(record.phase)) continue;
      const previous = records.slice(0, index);
      const promptIdentity = record.value.promptIdentity;
      if (!previous.some(item => item.phase === "intent" && item.value.promptIdentity === promptIdentity)
        || record.phase === "observation" && previous.some(item => item.phase === "accepted"
          && item.value.promptIdentity === promptIdentity)
        || record.phase === "observation" && record.value.round !== previous.filter(item => item.phase === "observation"
          && item.value.promptIdentity === promptIdentity).length + 1) {
        throw new Error("Task message receipt order differs");
      }
    }
    return records;
  };
  const append = record => {
    const previous = entries();
    if (previous.some(item => item.phase === record.phase && digest(item.value) === digest(record.value))) return;
    mkdirSync(dirname(path), { recursive: true });
    const descriptor = openSync(path, "a", 0o600);
    try {
      const bytes = Buffer.from(JSON.stringify({ schema: "codex-task-message:v1", sequence: previous.length + 1,
        owner: identity, ...record }) + "\n", "utf8");
      let offset = 0;
      while (offset < bytes.length) {
        const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
        if (!written) throw new Error("Task message receipt write did not complete");
        offset += written;
      }
      fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
  };
  const read = (promptIdentity) => {
    const records = entries();
    const intents = records.filter(record => record.phase === "intent"
      && (promptIdentity === undefined || record.value.promptIdentity === promptIdentity));
    const intent = intents.at(-1)?.value;
    if (!intent) return null;
    const accepted = records.findLast(record => record.phase === "accepted"
      && record.value.promptIdentity === intent.promptIdentity)?.value;
    const observations = records.filter(record => record.phase === "observation"
      && record.value.promptIdentity === intent.promptIdentity).map(record => record.value);
    if (observations.some((observation, index) => observation.round !== index + 1)
      || accepted && records.findIndex(record => record.phase === "accepted"
        && record.value.promptIdentity === intent.promptIdentity) < records.findLastIndex(record => record.phase === "observation"
          && record.value.promptIdentity === intent.promptIdentity)) {
      throw new Error("Task message recovery observations differ");
    }
    if (accepted && (accepted.threadId !== taskRef.threadId
      || !["native-response", "native-history"].includes(accepted.source))) {
      throw new Error("Task message receipt native acceptance differs");
    }
    return { ...intent, observations, accepted };
  };
  return {
    read,
    reserve({ kind, request, promptIdentity }) {
      const value = { kind, request, promptIdentity };
      if (!validMessageIntent(value)) throw new Error("Task message receipt intent is malformed");
      const records = entries();
      const operationIdentity = messageOperationIdentity(value);
      const operationIntent = records.find(record => record.phase === "intent"
        && messageOperationIdentity(record.value) === operationIdentity)?.value;
      if (operationIntent && operationIntent.promptIdentity !== promptIdentity) {
        throw new Error("Task message operation has conflicting prompt identity");
      }
      const promptIntent = records.find(record => record.phase === "intent"
        && record.value.promptIdentity === promptIdentity)?.value;
      if (promptIntent && messageOperationIdentity(promptIntent) !== operationIdentity) {
        throw new Error("Task message prompt identity belongs to another operation");
      }
      const existing = read(promptIdentity);
      if (existing) return { created: false, ...existing };
      const current = read();
      if (current && !current.accepted) {
        throw new Error("Task message has a different unresolved request; preserve its original owner");
      }
      append({ phase: "intent", value });
      return { created: true, ...value };
    },
    accept(promptIdentity, source) {
      const intent = read(promptIdentity);
      if (!intent) throw new Error("Task message acceptance has no reserved request");
      if (intent.accepted) return;
      append({ phase: "accepted", value: { promptIdentity, source, threadId: taskRef.threadId } });
    },
    observe(promptIdentity) {
      const intent = read(promptIdentity);
      if (!intent) throw new Error("Task message observation has no reserved request");
      if (intent.accepted || intent.observations.length >= recoveryDelaysMs.length) return null;
      const round = intent.observations.length + 1;
      const value = { promptIdentity, round, delayMs: recoveryDelaysMs[round - 1] };
      append({ phase: "observation", value });
      return value;
    },
  };
}
