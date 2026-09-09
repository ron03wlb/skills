import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";

const digest = value => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

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
