// An expression, loaded unchanged by Function in Codex and by node:vm in tests.
(() => {
  const allowed = Object.freeze([
    "mcp__codex_app__list_projects", "mcp__codex_app__list_threads",
    "mcp__codex_app__create_thread", "mcp__codex_app__read_thread",
    "mcp__codex_app__wait_threads", "mcp__codex_app__send_message_to_thread",
    "mcp__codex_app__open_in_codex",
  ]);
  const types = new Set(["tool", "status", "result", "error", "input-error", "control-result", "response-accepted", "request-state"]);
  const prefix = "workflow-host ";
  const decoration = /^(?:\x1b\[(?:\?(?:25|9001|1004)[lh]|[012]?J|H|[0-9;]*m|[0-9]+;[0-9]+H)|\x1b\]0;[^\x07]*\x07)+/u;
  const copy = value => JSON.parse(JSON.stringify(value));
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

  function parseTransport(input, ended = false) {
    const frames = [];
    const virtualNewline = ended && input && !input.endsWith("\n");
    let remaining = virtualNewline ? input + "\n" : input;
    while (remaining.includes("\n")) {
      let newline = remaining.indexOf("\n"), rawEnd = newline + 1;
      let line = remaining.slice(0, newline).replace(/\r$/u, "");
      // Only observed terminal setup sequences, outside serialized JSON payloads.
      line = line.replace(decoration, "");
      let malformed = false;
      while (line.startsWith(prefix)) {
        try { JSON.parse(line.slice(prefix.length)); break; } catch { /* A physical wrap may continue this frame. */ }
        const tail = remaining.slice(rawEnd);
        if (!ended && (!tail || /^\x1b(?:\[[0-9;]*H?)?$/u.test(tail))) return { frames, remaining };
        const redraw = tail.match(/^\x1b\[[0-9]+;80H([\s\S])/u);
        if (!redraw) break;
        if (redraw[1] !== line.at(-1)) { malformed = true; break; }
        newline = remaining.indexOf("\n", rawEnd + redraw[0].length);
        if (newline < 0) return { frames, remaining };
        line += remaining.slice(rawEnd + redraw[0].length, newline).replace(/\r$/u, "");
        rawEnd = newline + 1;
      }
      const atVirtualNewline = virtualNewline && rawEnd === remaining.length;
      const raw = remaining.slice(0, rawEnd - (atVirtualNewline ? 1 : 0));
      if (line === "" && raw.replace(/\r?\n$/u, "").replace(decoration, "") === "") {
        frames.push({ kind: "terminal", raw }); remaining = remaining.slice(rawEnd); continue;
      }
      let message;
      try {
        if (malformed || !line.startsWith(prefix)) throw new Error("Unknown transport framing");
        try { message = JSON.parse(line.slice(prefix.length)); }
        catch {
          if (atVirtualNewline) return { frames, remaining: remaining.slice(0, -1) };
          throw new Error("Malformed workflow JSON");
        }
        if (!record(message) || !types.has(message.type)) throw new Error("Unknown workflow frame");
        if (message.type === "tool" && (typeof message.id !== "string" || !message.id
          || typeof message.name !== "string" || !record(message.arguments))) throw new Error("Malformed tool request");
        frames.push({ kind: "message", message, raw });
      } catch (error) {
        frames.push({ kind: "diagnostic", reason: error.message, raw });
      }
      remaining = remaining.slice(rawEnd);
    }
    if (remaining && remaining.replace(decoration, "") === "") {
      frames.push({ kind: "terminal", raw: remaining }); remaining = "";
    }
    return { frames, remaining };
  }

  function createLane({ sessionId, output = "", exit_code } = {}) {
    if (sessionId == null) throw new Error("An original host session ID is required");
    return { schema: "codex-host-driver:v1", sessionId, active: exit_code === undefined,
      ...(exit_code === undefined ? {} : { exitCode: exit_code }), buffer: output,
      requests: [], frames: [], diagnostics: [], controls: [], driver: null, pendingIo: null };
  }

  // Durable receipts carry identity/progress only. Native payloads, panel URLs,
  // terminal bytes and returned tool content may contain the bridge credential.
  const partialBytes = lane => lane.buffer.length + (lane.omittedPartialBytes ?? 0);
  function checkpointState(lane) {
    return { schema: "codex-host-checkpoint:v1", sessionId: lane.sessionId, active: lane.active,
      exitCode: lane.exitCode, driverId: lane.driver?.id, partialBytes: partialBytes(lane),
      requests: lane.requests.map(({ id, request, state, history, conflict }) => ({ id,
        name: allowed.includes(request.name) ? request.name : "unsupported", state, history: [...history], conflict: Boolean(conflict) })),
      controls: lane.controls.map(({ message, state, sourceId }) => ({ message: { control: message.control, runId: message.runId }, state, sourceId })),
      diagnostics: lane.diagnostics.map(() => ({ reason: "Retained transport diagnostic; raw bytes stay in the original cell" })),
      pendingIo: lane.pendingIo ? { kind: lane.pendingIo.kind, state: lane.pendingIo.state } : null };
  }

  function restoreCheckpoint(saved) {
    if (saved?.schema !== "codex-host-checkpoint:v1") throw new Error("Unknown host checkpoint");
    const lane = createLane({ sessionId: saved.sessionId, ...(saved.active ? {} : { exit_code: saved.exitCode }) });
    lane.driver = saved.driverId ? { id: saved.driverId } : null;
    lane.requests = saved.requests.map(item => ({ ...item, request: { type: "tool", id: item.id, name: item.name }, payloadMissing: true }));
    lane.controls = saved.controls;
    lane.diagnostics = saved.diagnostics;
    lane.pendingIo = saved.pendingIo;
    lane.needsInspection = true;
    lane.omittedPartialBytes = saved.partialBytes;
    return lane;
  }

  function createCheckpointWriter({ tools, path }) {
    if (typeof path !== "string" || !/^[A-Za-z]:[\\/]/u.test(path) || !path.endsWith(".json")) throw new Error("Exact absolute Windows checkpoint path required");
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    const temporary = path + ".pending-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    return async snapshot => {
      const body = JSON.stringify(snapshot);
      for (let offset = 0; offset < body.length; offset += 6000) {
        const method = offset === 0 ? "WriteAllText" : "AppendAllText";
        const cmd = `[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName(${quote(path)})) | Out-Null; `
          + `[IO.File]::${method}(${quote(temporary)}, ${quote(body.slice(offset, offset + 6000))}, [Text.UTF8Encoding]::new($false))`;
        const result = await tools.exec_command({ cmd, max_output_tokens: 1000 });
        if (result.exit_code !== 0) throw new Error("Host checkpoint write failed; preserve original request state");
      }
      const result = await tools.exec_command({ cmd: `Move-Item -LiteralPath ${quote(temporary)} -Destination ${quote(path)} -Force -ErrorAction Stop`, max_output_tokens: 1000 });
      if (result.exit_code !== 0) throw new Error("Host checkpoint publish failed; preserve original request state");
    };
  }

  function createControlReader({ tools, path }) {
    if (typeof path !== "string" || !/^[A-Za-z]:[\\/]/u.test(path) || !path.endsWith(".json")) throw new Error("Exact absolute Windows control path required");
    const quoted = "'" + path.replaceAll("'", "''") + "'";
    return async () => {
      const result = await tools.exec_command({ cmd: `if (Test-Path -LiteralPath ${quoted}) { Get-Content -Raw -LiteralPath ${quoted} -ErrorAction Stop }`, max_output_tokens: 1000 });
      if (result.exit_code !== 0) throw new Error("Host control read failed");
      if (!result.output.trim()) return null;
      const message = JSON.parse(result.output);
      if (typeof message.id !== "string" || !message.id || !["PAUSE", "RESUME", "STOP", "REFRESH"].includes(message.control)
        || message.runId !== undefined && typeof message.runId !== "string") throw new Error("Malformed host control; retain its original file");
      return message;
    };
  }

  function createDriver({ driverId, tools, load, store, report, setTimeout, clearTimeout,
    persist, readControl = async () => load("workflow.control"), heartbeatMs = 15000, tickMs = 35000, checkpoint = () => {} }) {
    if (!driverId) throw new Error("The original functions cell identity is required");
    if (typeof persist !== "function") throw new Error("A durable checkpoint writer is required");
    const native = new Map();
    let lane;
    let ticking = false;
    let persisted = Promise.resolve();
    const save = () => store("workflow.host", copy(lane));
    const flush = () => {
      const snapshot = checkpointState(lane);
      persisted = persisted.then(() => persist(snapshot));
      return persisted;
    };
    const read = () => {
      lane = load("workflow.host");
      if (lane?.schema !== "codex-host-driver:v1") throw new Error("Preserve legacy host state; reconcile it before adopting this driver");
    };
    const claim = () => {
      read();
      if (lane.driver && lane.driver.id !== driverId) throw new Error("Original active driver must be confirmed stopped before resume");
      lane.driver = { id: driverId }; save();
    };
    const transition = async (request, state) => {
      request.state = state; request.history.push(state); save(); await flush(); checkpoint(state, copy(request));
    };
    const diagnostic = (reason, details = {}) => {
      lane.diagnostics.push({ reason, ...details }); save();
      report({ type: "transport-diagnostic", reason });
    };
    const reportFrame = message => {
      if (message.type === "status") {
        const status = message.status;
        report({ type: "status", run: status?.run, nodes: status?.nodes,
          actions: status?.legalActions?.map(({ type, issueId }) => ({ type, issueId })), diagnoses: status?.diagnoses });
      } else report(message);
    };
    const receive = async (message, raw) => {
      const found = lane.requests.find(item => item.id === message.id);
      if (found) {
        if (found.payloadMissing && found.request.name === message.name) {
          found.request = message; found.payloadMissing = false; save();
        } else if (JSON.stringify(found.request) !== JSON.stringify(message)) {
          found.conflict = true; diagnostic("Conflicting request identity", { raw, id: message.id });
        }
        return found;
      }
      const request = { id: message.id, request: message, raw, state: "received", history: ["received"] };
      lane.requests.push(request); save(); await flush(); checkpoint("received", copy(request));
      return request;
    };
    const drain = async () => {
      const parsed = parseTransport(lane.buffer, !lane.active);
      // Preserve every complete frame before consuming its raw transport bytes.
      lane.frames.push(...parsed.frames); lane.buffer = parsed.remaining; save();
      while (lane.frames.length) {
        const item = lane.frames[0], message = item.message;
        if (item.kind === "terminal") { (lane.terminalTransport ??= []).push(item.raw); save(); }
        else if (item.kind === "diagnostic") diagnostic(item.reason, { raw: item.raw });
        else if (message.type === "tool") await receive(message, item.raw);
        else if (message.type === "response-accepted") {
          const request = lane.requests.find(value => value.id === message.id);
          if (request?.state === "forwarding") await transition(request, "forwarded");
          else if (request?.state !== "forwarded") diagnostic("Unexpected delivery acknowledgement", { raw: item.raw });
        } else if (message.type === "request-state") {
          const request = message.request?.type === "tool" ? await receive(message.request, item.raw) : lane.requests.find(value => value.id === message.id);
          if (request && !request.conflict && message.id === request.id) {
            request.ownerState = message.state; save();
            if (["forwarding", "returned"].includes(request.state) && message.state === "accepted") await transition(request, "forwarded");
            // Redelivery is only the already-returned response, after original-owner pending evidence.
            if (request.state === "forwarding" && message.state === "pending") await transition(request, "returned");
          } else diagnostic("Unknown original-owner request state", { raw: item.raw });
        } else {
          if (message.type === "control-result") {
            const control = lane.controls.find(value => value.state === "sending" && value.message.control === message.command
              && (value.message.runId ?? null) === (message.runId ?? null));
            if (control) { control.state = "returned"; control.result = message.result; }
          }
          if (message.type === "result" || message.type === "error") lane.terminal = message;
          save(); reportFrame(message);
        }
        lane.frames.shift(); save();
      }
    };
    const write = async (message, kind) => {
      if (!lane.active) return false;
      lane.pendingIo = { kind, message, state: "sending" }; save(); await flush();
      let result;
      try {
        result = await tools.write_stdin({ session_id: lane.sessionId, chars: message ? JSON.stringify(message) + "\n" : "",
          yield_time_ms: 1000, max_output_tokens: 16000 });
      } catch (error) {
        lane.pendingIo.state = "uncertain"; lane.pendingIo.error = String(error.message ?? error); save();
        report({ type: "transport-uncertain", sessionId: lane.sessionId, kind }); return false;
      }
      // Save returned output before clearing the pending write or consuming any frames.
      lane.pendingIo.result = result; lane.buffer += result.output ?? "";
      if (result.exit_code !== undefined) { lane.active = false; lane.exitCode = result.exit_code; }
      save(); lane.pendingIo = null; save(); await drain(); await flush(); return true;
    };
    const heartbeat = async () => {
      const queued = await readControl();
      if (queued && (!queued.id || !lane.controls.some(item => item.sourceId === queued.id))) {
        const message = typeof queued === "string" ? { control: queued } : { control: queued.control, ...(queued.runId === undefined ? {} : { runId: queued.runId }) };
        lane.controls.push({ message, state: "queued", sourceId: queued.id }); save(); await flush(); store("workflow.control", null);
      }
      const control = lane.controls.find(value => value.state === "queued");
      if (control) { control.state = "sending"; save(); await write(control.message, "control"); }
      else await write({ heartbeat: true }, "heartbeat");
    };
    const callNative = async request => {
      const message = request.request;
      if (request.payloadMissing || !allowed.includes(message.name) || typeof tools[message.name] !== "function") {
        report({ type: "reconciliation-required", id: request.id, reason: "Unsupported or unavailable tool" }); return;
      }
      const args = message.name === "mcp__codex_app__list_threads" && message.arguments.limit > 50
        ? { ...message.arguments, limit: 50 } : message.arguments;
      await transition(request, "dispatched");
      // Persist the actual return immediately, even if a concurrent transport write is pending.
      const pending = Promise.resolve().then(() => tools[message.name](args)).then(
        result => ({ id: request.id, result }), error => ({ id: request.id, error: String(error.message ?? error) }),
      ).then(async response => {
        const current = lane.requests.find(item => item.id === request.id);
        current.response = response; await transition(current, "returned");
      });
      native.set(request.id, pending);
    };
    const tick = async () => {
      claim(); await drain(); await flush();
      const deadline = Date.now() + tickMs;
      // An interrupted write may have returned output just before consumption was interrupted.
      if (lane.pendingIo?.result) { lane.pendingIo = null; save(); }
      if (lane.active && (lane.needsInspection || lane.requests.some(item => item.state === "forwarding") || lane.pendingIo?.state === "uncertain")) {
        if (!await write({ inspectRequests: true }, "reconcile")) return;
        lane.needsInspection = false; save();
      }
      for (const request of lane.requests) {
        if (request.conflict) continue;
        if (request.state === "received" && lane.active) await callNative(request);
        if (request.state === "dispatched" && !native.has(request.id)) {
          report({ type: "reconciliation-required", id: request.id, reason: "Original native outcome is uncertain; read its task/intent owner before retry" });
        }
        const pending = native.get(request.id);
        if (pending) {
          while (request.state === "dispatched" && Date.now() < deadline) {
            let timer;
            await Promise.race([pending, new Promise(resolve => { timer = setTimeout(resolve, heartbeatMs); })]);
            clearTimeout(timer);
            if (request.state === "dispatched") await heartbeat();
          }
          if (request.state === "returned") { await pending; native.delete(request.id); }
        }
        if (request.state === "returned" && lane.active) {
          if (!request.response) report({ type: "reconciliation-required", id: request.id, reason: "Native payload was intentionally excluded from disk; recover the original owner outcome" });
          else {
            await transition(request, "forwarding");
            if (!await write(request.response, "response")) return;
          }
        }
        if (Date.now() >= deadline) break;
      }
      if (lane.active) await heartbeat();
      await drain(); await flush();
      report({ type: "driver", active: lane.active, sessionId: lane.sessionId,
        pending: lane.requests.filter(item => item.state !== "forwarded").map(({ id, state }) => ({ id, state })),
        partialBytes: partialBytes(lane) });
    };
    const boundedTick = async () => {
      if (ticking) throw new Error("Original active driver tick is still pending");
      ticking = true;
      try { await tick(); } finally { ticking = false; }
    };
    return {
      tick: boundedTick,
      async run(yieldControl) {
        do { await boundedTick(); await yieldControl(); } while (lane.active || native.size);
      },
      resume({ previousDriverId, stoppedEvidence }) {
        read();
        if (!stoppedEvidence || lane.driver?.id !== previousDriverId) throw new Error("Exact original driver and stopped evidence required");
        lane.driver = { id: driverId, previousDriverId, stoppedEvidence }; save();
      },
      async reconcileNative({ id, result, error, ownerEvidence }) {
        claim();
        const request = lane.requests.find(item => item.id === id);
        if (!ownerEvidence?.observation || ownerEvidence.requestId !== id || !["dispatched", "returned"].includes(request?.state)
          || native.has(id) || (result === undefined) === (error === undefined)) throw new Error("Exact original request owner evidence and outcome required");
        request.ownerEvidence = copy(ownerEvidence);
        request.response = result === undefined ? { id, error } : { id, result }; await transition(request, "returned");
      },
    };
  }
  return Object.freeze({ allowed, parseTransport, createLane, createDriver, checkpointState, restoreCheckpoint, createCheckpointWriter, createControlReader });
})()
