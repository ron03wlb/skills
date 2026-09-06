import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

export const CODEX_HOST_TOOLS = Object.freeze([
  "mcp__codex_app__list_projects",
  "mcp__codex_app__list_threads",
  "mcp__codex_app__create_thread",
  "mcp__codex_app__read_thread",
  "mcp__codex_app__wait_threads",
  "mcp__codex_app__send_message_to_thread",
  "mcp__codex_app__open_in_codex",
]);

// Only the active Codex task forwards these requests to its available desktop tools.
export function createCodexHostBridge({ input = process.stdin, output = process.stdout, idleTimeoutMs = 90000 } = {}) {
  const reader = createInterface({ input, terminal: false });
  const pending = new Map();
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
      if (!request) throw new Error("Unknown desktop response");
      pending.delete(message.id);
      if (message.error) request.reject(new Error(String(message.error)));
      else if (Object.hasOwn(message, "result")) request.resolve(message.result);
      else request.reject(new Error("Desktop response has no result"));
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
        pending.set(id, { resolve, reject });
        emit({ type: "tool", id, name, arguments: args });
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
