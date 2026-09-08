import { randomUUID } from "node:crypto";
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
  let closed = false;
  const controls = new Map();
  let toolCalls = 0;
  const startedAt = Date.now();
  let idleTimer;
  const armIdleTimer = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => close(), idleTimeoutMs); idleTimer.unref?.(); };
  const emit = (value) => output.write(`workflow-host ${JSON.stringify(value)}\n`);
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(idleTimer);
    for (const control of controls.values()) control.onDisconnect?.(new Error("CODEX_HOST_DISCONNECTED"));
    for (const request of pending.values()) request.reject(new Error("CODEX_HOST_DISCONNECTED"));
    pending.clear();
    reader.close();
  };
  armIdleTimer();
  reader.on("close", close);
  input.on("error", close);
  output.on("error", close);
  reader.on("line", async (line) => {
    try {
      const message = JSON.parse(line);
      armIdleTimer();
      if (message.heartbeat === true) return;
      if (message.inspectRequests === true) {
        for (const [id, entry] of pending) emit({ type: "request-state", id, state: "pending", request: entry.message });
        for (const [id, entry] of accepted) emit({ type: "request-state", id, state: "accepted", request: entry.message });
        return;
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
      if (previous) {
        if (previous.response !== response) throw new Error("Conflicting desktop response for original request");
        emit({ type: "response-accepted", id: message.id }); return;
      }
      if (!request) throw new Error("Unknown desktop response");
      accepted.set(message.id, { message: request.message, response });
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
    metrics: () => ({ toolCalls, elapsedMs: Date.now() - startedAt, tokens: "unavailable" }),
    close,
  };
}
