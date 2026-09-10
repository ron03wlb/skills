import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const driverSource = readFileSync(new URL("./codex-host-driver.js", import.meta.url), "utf8");
export const { allowed: CODEX_HOST_TOOLS } = new Function(`return (\n${driverSource}\n);`)();

// This bridge exposes no helper-release operation or safe-cwd/respawn guarantee.
// Archive/handoff are not release APIs. Change this only with a proven host contract.
export const CODEX_HOST_RELEASE_CAPABILITY = Object.freeze({
  state: "UNAVAILABLE",
  operation: null,
  helperOwnership: "UNAVAILABLE",
  respawnProtection: "UNAVAILABLE",
  reason: "The exposed Codex desktop bridge has no supported exact-task helper release or safe-current-directory lifecycle.",
});

// Only the active Codex task forwards these requests to its available desktop tools.
export function createCodexHostBridge({ input = process.stdin, output = process.stdout, idleTimeoutMs = 90000,
  settledReceiptLimit = 1024 } = {}) {
  if (!Number.isInteger(settledReceiptLimit) || settledReceiptLimit < 1 || settledReceiptLimit > 4096) {
    throw new TypeError("Settled receipt limit must be between one and 4096");
  }
  const reader = createInterface({ input, terminal: false });
  const pending = new Map();
  const accepted = new Map();
  const fragments = new Map();
  let closed = false;
  const controls = new Map();
  let toolCalls = 0;
  let settledRequests = 0;
  const startedAt = Date.now();
  const idleConfirmationMs = Math.min(1000, idleTimeoutMs);
  let idleTimer, idleCheck;
  let lastInputAt = startedAt, disconnect;
  const digest = value => createHash("sha256").update(value).digest("hex");
  const armIdleTimer = () => {
    lastInputAt = Date.now(); clearTimeout(idleTimer); clearTimeout(idleCheck);
    idleTimer = setTimeout(() => {
      // Synchronous Git/CLI work can delay both timers and stdin polling. Give
      // an already-buffered heartbeat bounded time to reach readline before loss.
      idleCheck = setTimeout(() => {
        if (Date.now() - lastInputAt >= idleTimeoutMs) close("idle-timeout");
      }, idleConfirmationMs);
      idleCheck.unref?.();
    }, idleTimeoutMs);
    idleTimer.unref?.();
  };
  const emit = (value) => output.write(`workflow-host ${JSON.stringify(value)}\n`);
  const selectControl = runId => runId ? controls.get(runId) : controls.size === 1 ? [...controls.values()][0] : null;
  const controlResult = async ({ id, runId, command, revision, inspect = false }) => {
    const control = selectControl(runId);
    if (!control) throw new Error("Select one active Run ID for control");
    if (id !== undefined && (typeof id !== "string" || !id)
      || revision !== undefined && (!Number.isInteger(revision) || revision < 1)) throw new Error("Malformed control identity");
    if (revision === undefined) {
      if (inspect) throw new Error("Control inspection requires its original revision");
      return control.submitControl(command);
    }
    const status = await control.readStatus();
    const currentRevision = status?.run?.controlRevision;
    if (!Number.isInteger(currentRevision) || currentRevision < 0) throw new Error("Current Run control revision is unavailable");
    const recorded = typeof control.readControl === "function" ? await control.readControl(revision, id) : null;
    if (recorded) {
      const recordedRequestRevision = recorded.type === "control.reconciled" ? recorded.requestRevision : recorded.revision;
      if (recordedRequestRevision !== revision || recorded.command !== command
        || id !== undefined && recorded.requestId !== id) {
        return { accepted: false, changed: false, revision: currentRevision, reason: "stale_control_revision", status };
      }
      if (!inspect && currentRevision > revision) {
        return { accepted: false, changed: false, revision: currentRevision, reason: "stale_control_revision", status };
      }
      return { accepted: true, changed: recorded.type !== "control.reconciled",
        revision: recorded.type === "control.reconciled" ? currentRevision : revision, reconciled: true, status };
    }
    if (inspect) {
      return currentRevision >= revision
        ? { accepted: false, changed: false, revision: currentRevision, reason: "stale_control_revision", status }
        : { accepted: false, changed: false, revision: currentRevision, reason: "control_outcome_unresolved", status };
    }
    if (currentRevision + 1 !== revision) {
      return { accepted: false, changed: false, revision: currentRevision, reason: "stale_control_revision", status };
    }
    const result = await control.submitControl(command, { id, revision });
    if (result?.changed && result.revision !== revision) throw new Error("Applied control revision differs from its original identity");
    return result;
  };
  const close = (reason = "owner-close") => {
    if (closed) return;
    closed = true;
    disconnect = { reason, idleMs: Date.now() - lastInputAt, pendingRequests: pending.size };
    clearTimeout(idleTimer);
    clearTimeout(idleCheck);
    // Keep the coordinator's established sentinel; structured reason is diagnostic.
    const failure = () => Object.assign(new Error("CODEX_HOST_DISCONNECTED"), { reason });
    for (const control of controls.values()) control.onDisconnect?.(failure());
    for (const request of pending.values()) request.reject(failure());
    pending.clear();
    fragments.clear();
    reader.close();
  };
  armIdleTimer();
  reader.on("close", () => close("input-eof"));
  reader.on("error", () => close("input-error"));
  input.on("error", () => close("input-error"));
  output.on("error", () => close("output-error"));
  reader.on("line", async (line) => {
    try {
      let message;
      try { message = JSON.parse(line); } catch { throw new Error("Malformed desktop input"); }
      armIdleTimer();
      if (message.heartbeat === true) return;
      if (message.settleRequests !== undefined) {
        if (!Array.isArray(message.settleRequests) || message.settleRequests.length > 100
          || message.settleRequests.some(id => typeof id !== "string")) throw new Error("Malformed settled request selection");
        for (const id of new Set(message.settleRequests)) {
          const entry = accepted.get(id);
          if (entry && !entry.settled) {
            entry.message = null; entry.settled = true; settledRequests += 1;
            while ([...accepted.values()].filter(value => value.settled).length > settledReceiptLimit) {
              const oldest = [...accepted].find(([, value]) => value.settled)?.[0];
              if (oldest === undefined) break;
              accepted.delete(oldest);
            }
          }
        }
        return;
      }
      if (message.inspectRequests === true) {
        if (message.requestIds !== undefined && (!Array.isArray(message.requestIds)
          || message.requestIds.length > 100 || message.requestIds.some(id => typeof id !== "string"))) throw new Error("Malformed original request selection");
        for (const [id, entry] of pending) emit({ type: "request-state", id, state: "pending", request: entry.message });
        // Accepted history can contain large prompts. Echo only explicitly unresolved IDs.
        for (const id of new Set(message.requestIds ?? [])) {
          const entry = accepted.get(id);
          if (entry) emit({ type: "request-state", id, state: "accepted", ...(entry.message ? { request: entry.message } : {}) });
        }
        return;
      }
      if (message.inspectControl !== undefined) {
        const value = message.inspectControl;
        if (!value || typeof value.command !== "string" || !["PAUSE", "RESUME", "STOP", "REFRESH"].includes(value.command)) {
          throw new Error("Malformed control inspection");
        }
        const result = await controlResult({ id: value.id, runId: value.runId, command: value.command,
          revision: value.revision, inspect: true });
        emit({ type: "control-result", id: value.id, runId: value.runId, command: value.command, revision: value.revision, result });
        return;
      }
      if (message.responseChunk !== undefined) {
        const { id, index, count, length, data } = message.responseChunk ?? {};
        if (typeof id !== "string" || !pending.has(id) && !accepted.has(id)
          || !Number.isInteger(index) || !Number.isInteger(count) || index < 0 || index >= count
          || count > 32768 || !Number.isInteger(length) || length < 1 || length > 16 * 1024 * 1024
          || typeof data !== "string" || data.length < 1 || data.length > 6000) throw new Error("Malformed response fragment");
        let entry = fragments.get(id);
        if (!entry) { entry = { count, length, chunks: [], received: 0 }; fragments.set(id, entry); }
        if (entry.count !== count || entry.length !== length || index > entry.chunks.length
          || index < entry.chunks.length && entry.chunks[index] !== data) throw new Error("Conflicting response fragment");
        if (index === entry.chunks.length) { entry.chunks.push(data); entry.received += data.length; }
        if (entry.received > length) throw new Error("Response fragment length differs");
        if (entry.chunks.length !== count) return;
        if (entry.received !== length) throw new Error("Response fragment length differs");
        try { message = JSON.parse(entry.chunks.join("")); } catch { throw new Error("Malformed response fragments"); }
        if (message.id !== id) throw new Error("Response fragment identity differs");
        fragments.delete(id);
      }
      if (typeof message.control === "string") {
        const selected = selectControl(message.runId);
        if (!selected) throw new Error("Select one active Run ID for control");
        const result = message.control === "REFRESH"
          ? { accepted: true, changed: false, status: await selected.readStatus() }
          : await controlResult({ id: message.id, runId: message.runId, command: message.control, revision: message.revision });
        emit({ type: "control-result", ...(message.id === undefined ? {} : { id: message.id }), runId: message.runId,
          command: message.control, ...(message.revision === undefined ? {} : { revision: message.revision }), result });
        return;
      }
      const request = pending.get(message.id);
      const previous = accepted.get(message.id);
      const hasResult = Object.hasOwn(message, "result"), hasError = Object.hasOwn(message, "error");
      if (hasResult === hasError || hasError && (typeof message.error !== "string" || !message.error)) {
        throw new Error("Desktop response must have exactly one result or error");
      }
      const response = JSON.stringify(hasResult ? { result: message.result } : { error: message.error });
      const responseDigest = digest(response);
      if (previous) {
        if (previous.responseDigest !== responseDigest) throw new Error("Conflicting desktop response for original request");
        emit({ type: "response-accepted", id: message.id }); return;
      }
      if (!request) throw new Error("Unknown desktop response");
      accepted.set(message.id, { message: request.message, responseDigest, settled: false });
      pending.delete(message.id);
      emit({ type: "response-accepted", id: message.id });
      if (hasError) request.reject(new Error(message.error));
      else request.resolve(message.result);
    } catch (error) {
      emit({ type: "input-error", message: error.message });
    }
  });
  return {
    async call(name, args, owner) {
      if (!CODEX_HOST_TOOLS.includes(name)) throw new Error(`Unsupported desktop tool: ${name}`);
      if (closed) throw new Error("CODEX_HOST_DISCONNECTED");
      if (owner !== undefined && (owner === null || typeof owner !== "object" || Array.isArray(owner)
        || Object.entries(owner).some(([key, value]) => !["kind", "runId", "issueId", "threadId", "requestKind", "receiptIdentity"].includes(key)
          || typeof value !== "string" || !value)
        || !["task-create", "task-message", "task-fork"].includes(owner.kind)
        || !["runId", "issueId", "receiptIdentity"].every(key => typeof owner[key] === "string" && owner[key])
        || owner.kind === "task-message" && (!["close", "retry", "repair", "recovery", "upgrade", "recovery-handoff"].includes(owner.requestKind)
          || typeof owner.threadId !== "string" || !owner.threadId)
        || owner.kind === "task-fork" && (typeof owner.threadId !== "string" || !owner.threadId)
        || !/^sha256:[a-f0-9]{64}$/u.test(owner.receiptIdentity))) throw new Error("Malformed native request owner reference");
      toolCalls += 1;
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const message = { type: "tool", id, name, arguments: args, ...(owner === undefined ? {} : { owner }) };
        pending.set(id, { resolve, reject, message });
        emit(message);
      });
    },
    controls: {
      async connect(connection) {
        if (closed) throw new Error("CODEX_HOST_DISCONNECTED");
        const status = await connection.readStatus();
        const key = status?.run?.runId ?? "single";
        if (controls.has(key)) throw new Error("Run controls already connected");
        controls.set(key, connection);
        emit({ type: "status", status });
        return { async close() { if (controls.get(key) === connection) controls.delete(key); } };
      },
    },
    get disconnected() { return closed; },
    metrics: () => ({ toolCalls, elapsedMs: Date.now() - startedAt, tokens: "unavailable",
      settledRequests,
      retainedSettledReceipts: [...accepted.values()].filter(entry => entry.settled).length,
      retainedSettledPayloadBytes: [...accepted.values()].filter(entry => entry.settled)
        .reduce((total, entry) => total + (entry.message ? JSON.stringify(entry.message).length : 0), 0),
      ...(disconnect ? { disconnect } : {}) }),
    close,
  };
}
