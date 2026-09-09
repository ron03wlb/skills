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
export function createCodexHostBridge({ input = process.stdin, output = process.stdout, idleTimeoutMs = 90000 } = {}) {
  const reader = createInterface({ input, terminal: false });
  const pending = new Map();
  const accepted = new Map();
  const fragments = new Map();
  let closed = false;
  const controls = new Map();
  let toolCalls = 0;
  const startedAt = Date.now();
  let idleTimer, idleCheck;
  let lastInputAt = startedAt, disconnect;
  const digest = value => createHash("sha256").update(value).digest("hex");
  const armIdleTimer = () => {
    lastInputAt = Date.now(); clearTimeout(idleTimer); clearImmediate(idleCheck);
    idleTimer = setTimeout(() => {
      // Synchronous Git/CLI work can delay both timers and stdin polling. Give
      // an already-buffered heartbeat one I/O turn before declaring host loss.
      idleCheck = setImmediate(() => { if (Date.now() - lastInputAt >= idleTimeoutMs) close("idle-timeout"); });
      idleCheck.unref?.();
    }, idleTimeoutMs);
    idleTimer.unref?.();
  };
  const emit = (value) => output.write(`workflow-host ${JSON.stringify(value)}\n`);
  const close = (reason = "owner-close") => {
    if (closed) return;
    closed = true;
    disconnect = { reason, idleMs: Date.now() - lastInputAt, pendingRequests: pending.size };
    clearTimeout(idleTimer);
    clearImmediate(idleCheck);
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
          if (entry) { entry.message = null; entry.settled = true; }
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
        const control = message.runId ? controls.get(message.runId) : controls.size === 1 ? [...controls.values()][0] : null;
        if (!control) throw new Error("Select one active Run ID for control");
        const result = message.control === "REFRESH"
          ? { accepted: true, changed: false, status: await control.readStatus() }
          : await control.submitControl(message.control);
        emit({ type: "control-result", runId: message.runId, command: message.control, result });
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
    async call(name, args) {
      if (!CODEX_HOST_TOOLS.includes(name)) throw new Error(`Unsupported desktop tool: ${name}`);
      if (closed) throw new Error("CODEX_HOST_DISCONNECTED");
      toolCalls += 1;
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const message = { type: "tool", id, name, arguments: args };
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
      settledRequests: [...accepted.values()].filter(entry => entry.settled).length,
      retainedSettledPayloadBytes: [...accepted.values()].filter(entry => entry.settled)
        .reduce((total, entry) => total + (entry.message ? JSON.stringify(entry.message).length : 0), 0),
      ...(disconnect ? { disconnect } : {}) }),
    close,
  };
}
