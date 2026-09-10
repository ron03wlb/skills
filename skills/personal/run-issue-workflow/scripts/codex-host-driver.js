// An expression, loaded unchanged by Function in Codex and by node:vm in tests.
(() => {
  const allowed = Object.freeze([
    "mcp__codex_app__list_projects", "mcp__codex_app__list_threads",
    "mcp__codex_app__create_thread", "mcp__codex_app__read_thread",
    "mcp__codex_app__fork_thread",
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
      requests: [], settledRequestCount: 0, frames: [], diagnostics: [], controls: [], runStatus: null, driver: null, pendingIo: null,
      fault: null, faults: [] };
  }

  const safeOwner = owner => {
    if (!record(owner) || !["task-create", "task-message", "task-fork"].includes(owner.kind)
      || Object.entries(owner).some(([key, value]) => !["kind", "runId", "issueId", "threadId", "requestKind", "receiptIdentity"].includes(key)
        || typeof value !== "string" || !value)
      || !["runId", "issueId", "receiptIdentity"].every(key => typeof owner[key] === "string" && owner[key])
      || owner.kind === "task-message" && (!["close", "retry", "repair", "recovery", "upgrade", "recovery-handoff"].includes(owner.requestKind)
        || typeof owner.threadId !== "string" || !owner.threadId)
      || owner.kind === "task-fork" && (typeof owner.threadId !== "string" || !owner.threadId)
      || !/^sha256:[a-f0-9]{64}$/u.test(owner.receiptIdentity)
        && !/^run:[a-zA-Z0-9._-]{1,128}:issue:[a-zA-Z0-9_-]{1,128}:retry:[1-9][0-9]*$/u.test(owner.receiptIdentity)
        && !/^run:[a-zA-Z0-9._-]{1,128}:issue:[a-zA-Z0-9_-]{1,128}:recovery-handoff:[a-zA-Z0-9._-]{1,128}$/u.test(owner.receiptIdentity)) return null;
    return copy(owner);
  };
  const safeControlResult = result => !record(result) ? null : Object.fromEntries(
    ["accepted", "changed", "revision", "reconciled", "reason"].filter(key => ["string", "number", "boolean"].includes(typeof result[key]))
      .map(key => [key, result[key]]),
  );
  function ownerForRequest(message) {
    const supplied = safeOwner(message?.owner);
    if (supplied) return supplied;
    if (message?.name === "mcp__codex_app__send_message_to_thread") {
      const prompt = message.arguments?.prompt;
      const matched = typeof prompt === "string" && [
        ["close", /Close request identity: (sha256:[a-f0-9]{64})\. Current close request evidence: (\{[^\n]+\})/u],
        ["retry", /Retry request: (\{.+\})$/mu],
        ["repair", /Repair request: (\{.+\})$/mu],
        ["recovery", /Recovery request: (\{.+\})$/mu],
        ["upgrade", /Model upgrade request: (\{.+\})$/mu],
        ["recovery-handoff", /Workflow recovery ownership: (\{.+\})$/mu],
      ].map(([kind, pattern]) => [kind, prompt.match(pattern)]).find(([, match]) => match);
      if (!matched) return null;
      try {
        const [requestKind, match] = matched;
        const request = JSON.parse(match[requestKind === "close" ? 2 : 1]);
        const receiptIdentity = requestKind === "close" ? match[1]
          : request.requestIdentity ?? `run:${request.runId}:issue:${request.issueId}:${requestKind}:${request.operationId ?? request.attempt ?? request.wave ?? "owner"}`;
        return safeOwner({ kind: "task-message", threadId: message.arguments.threadId, requestKind,
          runId: request.runIdentity?.runId ?? request.runId, issueId: request.issueId, receiptIdentity });
      } catch { return null; }
    }
    if (message?.name === "mcp__codex_app__create_thread") {
      const prompt = message.arguments?.prompt;
      const lane = typeof prompt === "string" ? prompt.match(/^Workflow lane ([a-f0-9]{64})$/mu) : null;
      const grant = typeof prompt === "string" ? prompt.match(/Run Grant: (\{[^\n]+\})\. Read its grant\.recorded/u) : null;
      if (!lane || !grant) return null;
      try {
        const authority = JSON.parse(grant[1]);
        return safeOwner({ kind: "task-create", runId: authority.runId, issueId: `lane:${lane[1]}`,
          receiptIdentity: `sha256:${lane[1]}` });
      } catch { return null; }
    }
    return null;
  }

  // Durable receipts carry identity/progress only. Native payloads, panel URLs,
  // terminal bytes and returned tool content may contain the bridge credential.
  const partialBytes = lane => lane.buffer.length + (lane.omittedPartialBytes ?? 0);
  function checkpointState(lane) {
    const settled = lane.requests.filter(request => request.settled === true);
    const retainedSettled = new Set(settled.slice(-100));
    const retainedRequests = lane.requests.filter(request => request.settled !== true || retainedSettled.has(request));
    return { schema: "codex-host-checkpoint:v1", sessionId: lane.sessionId, active: lane.active,
      exitCode: lane.exitCode, driverId: lane.driver?.id, partialBytes: partialBytes(lane),
      settledRequestCount: lane.settledRequestCount ?? settled.length,
      requests: retainedRequests.map(({ id, request, owner, state, history, conflict, settled }) => ({ id,
        name: allowed.includes(request.name) ? request.name : "unsupported", state, history: [...history], conflict: Boolean(conflict),
        ...(owner ? { owner: copy(owner) } : {}),
        ...(settled ? { settled: true } : {}) })),
      controls: lane.controls.map(({ message, state, sourceId, recoveryRounds, nextObservationAt, result }) => ({
        message: { control: message.control, ...(message.runId === undefined ? {} : { runId: message.runId }),
          ...(message.id === undefined ? {} : { id: message.id }), ...(message.revision === undefined ? {} : { revision: message.revision }) },
        state, sourceId, recoveryRounds: recoveryRounds ?? 0,
        ...(nextObservationAt === undefined ? {} : { nextObservationAt }), ...(result === undefined ? {} : { result: safeControlResult(result) }) })),
      runStatus: lane.runStatus ? copy(lane.runStatus) : null,
      diagnostics: lane.diagnostics.map(() => ({ reason: "Retained transport diagnostic; raw bytes stay in the original cell" })),
      pendingIo: lane.pendingIo ? { kind: lane.pendingIo.kind, state: lane.pendingIo.state,
        ...(lane.pendingIo.requestId ? { requestId: lane.pendingIo.requestId } : {}) } : null,
      fault: lane.fault ? copy(lane.fault) : null,
      faults: copy(lane.faults ?? (lane.fault ? [lane.fault] : [])) };
  }

  function restoreCheckpoint(saved) {
    if (saved?.schema !== "codex-host-checkpoint:v1") throw new Error("Unknown host checkpoint");
    const lane = createLane({ sessionId: saved.sessionId, ...(saved.active ? {} : { exit_code: saved.exitCode }) });
    lane.driver = saved.driverId ? { id: saved.driverId } : null;
    lane.requests = saved.requests.map(item => ({ ...item, request: { type: "tool", id: item.id, name: item.name }, payloadMissing: true }));
    lane.settledRequestCount = saved.settledRequestCount ?? lane.requests.filter(item => item.settled).length;
    lane.controls = saved.controls;
    lane.runStatus = saved.runStatus ?? null;
    lane.diagnostics = saved.diagnostics;
    lane.pendingIo = saved.pendingIo;
    lane.fault = saved.fault ?? null;
    lane.faults = saved.faults ?? (saved.fault ? [saved.fault] : []);
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
      if (Object.keys(message).some(key => !["id", "control", "runId", "revision"].includes(key))
        || typeof message.id !== "string" || !message.id || !["PAUSE", "RESUME", "STOP", "REFRESH"].includes(message.control)
        || typeof message.runId !== "string" || !message.runId
        || !Number.isInteger(message.revision) || message.revision < 1) throw new Error("Malformed host control; retain its original file");
      return message;
    };
  }

  function createDriver({ driverId, tools, load, store, report, setTimeout, clearTimeout,
    persist, readControl = async () => load("workflow.control"), heartbeatMs = 15000, tickMs = 15000,
    transportWaitMs = 1000, hostOverheadMs = 5000, checkpoint = () => {}, now = Date.now,
    settledRetentionLimit = 100 }) {
    if (!driverId) throw new Error("The original functions cell identity is required");
    if (typeof persist !== "function") throw new Error("A durable checkpoint writer is required");
    if (!Number.isInteger(settledRetentionLimit) || settledRetentionLimit < 1 || settledRetentionLimit > 100) {
      throw new TypeError("Settled driver retention must be between one and 100 requests");
    }
    const native = new Map();
    let lane;
    let ticking = false, owned = false;
    let persisted = Promise.resolve();
    let activeWrite = null;
    let pulseTimer, pulsePending, pulsing = false;
    let reportVersion = 0, lastDriverSignature = null, lastStatusSignature = null;
    const reportSignatures = new Map();
    const recoveryDelaysMs = [5000, 15000, 30000];
    const save = () => store("workflow.host", copy(lane));
    const publish = value => { reportVersion += 1; report(value); };
    const publishDelta = (key, value) => {
      const signature = JSON.stringify(value);
      if (reportSignatures.get(key) === signature) return false;
      reportSignatures.set(key, signature); publish(value); return true;
    };
    const requestIdFor = message => message?.id ?? message?.responseChunk?.id
      ?? (Array.isArray(message?.settleRequests) && message.settleRequests.length === 1 ? message.settleRequests[0] : null);
    const findFault = identity => lane.faults?.find(fault => fault.identity === identity) ?? null;
    const retainFault = fault => {
      lane.faults ??= [];
      const index = lane.faults.findIndex(item => item.identity === fault.identity);
      if (index < 0) lane.faults.push(fault); else lane.faults[index] = fault;
      lane.fault = fault;
      return fault;
    };
    const clearFault = identity => {
      lane.faults = (lane.faults ?? []).filter(fault => fault.identity !== identity);
      lane.fault = lane.faults.at(-1) ?? null;
    };
    const settleRequest = request => {
      if (request.settled) return;
      request.settled = true;
      request.request = { type: "tool", id: request.id, name: request.request?.name };
      delete request.raw; delete request.response; delete request.ownerEvidence;
      lane.settledRequestCount = (lane.settledRequestCount ?? 0) + 1;
      const retainedSettled = lane.requests.filter(item => item.settled);
      if (retainedSettled.length > settledRetentionLimit) {
        const remove = new Set(retainedSettled.slice(0, retainedSettled.length - settledRetentionLimit));
        lane.requests = lane.requests.filter(item => !remove.has(item));
      }
    };
    const faultFor = (scope, kind, requestId = null, changes = {}) => {
      const identity = `${scope}:${lane.sessionId}:${kind}:${requestId ?? "session"}`;
      const previous = findFault(identity);
      const recoveryRounds = changes.recoveryRounds ?? previous?.recoveryRounds ?? 0;
      const state = changes.state ?? previous?.state ?? "unresolved";
      const nextObservationAt = changes.nextObservationAt ?? previous?.nextObservationAt
        ?? Number(now()) + recoveryDelaysMs[recoveryRounds];
      return {
      identity,
      kind: scope,
      ...(requestId ? { requestId } : {}),
      state,
      recoveryRounds,
      recoveryDelaysMs,
      ...(state === "unresolved" ? { nextObservationAt } : {}),
      receiptRefs: requestId ? [requestId, lane.requests.find(item => item.id === requestId)?.owner?.receiptIdentity].filter(Boolean) : [],
    }; };
    const beginRecoveryObservation = async (scope, kind, requestId, flushFault = true) => {
      const identity = `${scope}:${lane.sessionId}:${kind}:${requestId ?? "session"}`;
      const fault = findFault(identity);
      if (!fault) return { observe: true, recoveryRounds: 0 };
      if (fault.state === "exhausted" || Number(now()) < fault.nextObservationAt) {
        return { observe: false, recoveryRounds: fault.recoveryRounds, state: fault.state };
      }
      const recoveryRounds = fault.recoveryRounds + 1;
      retainFault(faultFor(scope, kind, requestId, { recoveryRounds, state: "unresolved",
        nextObservationAt: Number(now()) + (recoveryDelaysMs[recoveryRounds] ?? 0) }));
      save(); if (flushFault) await flush();
      return { observe: true, recoveryRounds };
    };
    const retainPendingFault = async (scope, kind, requestId, recoveryRounds, flushFault = true) => {
      const exhausted = recoveryRounds >= recoveryDelaysMs.length;
      const fault = retainFault(faultFor(scope, kind, requestId, { recoveryRounds, state: exhausted ? "exhausted" : "unresolved",
        nextObservationAt: Number(now()) + (recoveryDelaysMs[recoveryRounds] ?? 0) }));
      save(); if (flushFault) await flush();
      return fault;
    };
    const observe = async pending => {
      let timer;
      const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ state: "pending" }), transportWaitMs + hostOverheadMs); });
      try { return await Promise.race([pending, timeout]); }
      finally { clearTimeout(timer); }
    };
    const pauseObservationCycle = () => new Promise(resolve => setTimeout(resolve, Math.min(heartbeatMs, 1000)));
    const physicalWrite = async message => {
      if (!lane.active) return { output: "" };
      const result = await tools.write_stdin({ session_id: lane.sessionId,
        chars: message ? JSON.stringify(message) + "\n" : "", yield_time_ms: transportWaitMs, max_output_tokens: 16000 });
      lane.buffer += result.output ?? "";
      if (result.exit_code !== undefined) { lane.active = false; lane.exitCode = result.exit_code; }
      save();
      return result;
    };
    const beginWrite = (message, kind) => {
      const body = JSON.stringify(message);
      const requestId = requestIdFor(message);
      if (kind !== "heartbeat") {
        lane.pendingIo = { kind, state: "sending", ...(requestId ? { requestId } : {}) }; save();
      }
      const owner = { kind, requestId, message, promise: null, outcome: null };
      owner.promise = (async () => {
        let result;
        if (kind === "response" && body.length > 6000) {
          const chunks = [];
          for (let offset = 0; offset < body.length;) {
            let size = Math.min(6000, body.length - offset);
            while (JSON.stringify(body.slice(offset, offset + size)).length > 11000) size = Math.floor(size / 2);
            chunks.push(body.slice(offset, offset + size)); offset += size;
          }
          for (let index = 0; index < chunks.length && lane.active; index++) {
            result = await physicalWrite({ responseChunk: { id: message.id, index, count: chunks.length, length: body.length, data: chunks[index] } });
          }
        } else result = await physicalWrite(message);
        return { state: "returned", result };
      })().catch(() => ({ state: "failed" })).then(outcome => { owner.outcome = outcome; return outcome; });
      activeWrite = owner;
      return activeWrite;
    };
    const schedulePulse = () => {
      pulseTimer = setTimeout(() => {
        if (!pulsing || !lane.active) return;
        pulsePending = (async () => {
          if (activeWrite) {
            publishDelta("transport", { type: "transport-observation", sessionId: lane.sessionId, kind: activeWrite.kind, state: "pending" });
            return;
          }
          await write({ heartbeat: true }, "heartbeat");
        })().finally(() => { if (pulsing && lane.active) schedulePulse(); });
      }, heartbeatMs);
    };
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
      publish({ type: "transport-diagnostic", reason });
    };
    const reportFrame = message => {
      if (message.type === "status") {
        const status = message.status;
        if (status?.run?.runId && Number.isInteger(status.run.controlRevision)) {
          lane.runStatus = { runId: status.run.runId, controlRevision: status.run.controlRevision,
            ...(status.run.controlCommand ? { controlCommand: status.run.controlCommand } : {}) };
          save();
        }
        const compact = { type: "status",
          run: status?.run ? { runId: status.run.runId, state: status.run.state, controlRevision: status.run.controlRevision,
            ...(status.run.controlCommand ? { controlCommand: status.run.controlCommand } : {}) } : undefined,
          nodes: status?.nodes?.map(node => ({ issueId: node.issueId, state: node.state,
            ...(node.task?.state ? { taskState: node.task.state } : {}),
            ...(node.close?.completionState ? { completionState: node.close.completionState } : {}) })),
          actions: status?.legalActions?.map(({ type, issueId }) => ({ type, issueId })),
          diagnoses: status?.diagnoses?.map(({ reasonCode, limitationClass, affectedNodes, nextOwner }) => (
            { reasonCode, limitationClass, affectedNodes, nextOwner })) };
        const signature = JSON.stringify(compact);
        if (signature !== lastStatusSignature) { lastStatusSignature = signature; publish(compact); }
      } else publish(message);
    };
    const receive = async (message, raw) => {
      const found = lane.requests.find(item => item.id === message.id);
      if (found) {
        const recoveredOwner = ownerForRequest(message);
        const ownerMatches = !found.owner || recoveredOwner
          && Object.keys(found.owner).length === Object.keys(recoveredOwner).length
          && Object.keys(found.owner).every(key => found.owner[key] === recoveredOwner[key]);
        if (found.payloadMissing && found.request.name === message.name && ownerMatches) {
          found.request = message; found.owner ??= recoveredOwner; found.payloadMissing = false; save();
        } else if (JSON.stringify(found.request) !== JSON.stringify(message)) {
          found.conflict = true; diagnostic("Conflicting request identity", { raw, id: message.id });
        }
        return found;
      }
      const owner = ownerForRequest(message);
      const request = { id: message.id, request: message, ...(owner ? { owner } : {}), raw, state: "received", history: ["received"] };
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
            if (request.state === "forwarded" && message.state === "accepted" && message.request === undefined) {
              clearFault(`transport:${lane.sessionId}:settlement:${request.id}`);
              settleRequest(request); save(); await flush();
            }
            if (["forwarding", "returned"].includes(request.state) && message.state === "accepted") {
              clearFault(`transport:${lane.sessionId}:response:${request.id}`);
              await transition(request, "forwarded");
            }
            // Redelivery is only the already-returned response, after original-owner pending evidence.
            if (request.state === "forwarding" && message.state === "pending") {
              clearFault(`transport:${lane.sessionId}:response:${request.id}`);
              await transition(request, "returned");
            }
          } else diagnostic("Unknown original-owner request state", { raw: item.raw });
        } else {
          if (message.type === "control-result") {
            const control = lane.controls.find(value => value.state === "sending"
              && (message.id === undefined ? value.sourceId === undefined : value.sourceId === message.id)
              && value.message.control === message.command && (value.message.runId ?? null) === (message.runId ?? null)
              && (message.revision === undefined ? value.message.revision === undefined : value.message.revision === message.revision));
            if (control && message.result?.reason !== "control_outcome_unresolved") {
              control.state = "returned"; control.result = message.result;
            }
            if (message.result?.status?.run?.runId && Number.isInteger(message.result.status.run.controlRevision)) {
              lane.runStatus = { runId: message.result.status.run.runId,
                controlRevision: message.result.status.run.controlRevision,
                ...(message.result.status.run.controlCommand ? { controlCommand: message.result.status.run.controlCommand } : {}) };
            }
          }
          if (message.type === "result" || message.type === "error") lane.terminal = message;
          save(); reportFrame(message);
        }
        lane.frames.shift(); save();
      }
    };
    const write = async (message, kind) => {
      if (!lane.active) return false;
      const body = JSON.stringify(message);
      const transportFaultIdentity = `transport:${lane.sessionId}:${kind}:${requestIdFor(message) ?? "session"}`;
      if (kind === "response" && body.length > 16 * 1024 * 1024) {
        throw new Error("Native response exceeds bounded transport capacity; preserve its original outcome");
      }
      const exhaustedFault = !activeWrite ? findFault(transportFaultIdentity) : null;
      if (exhaustedFault?.state === "exhausted") {
        publishDelta("transport", { type: "transport-uncertain", sessionId: lane.sessionId,
          kind, state: "exhausted", faultIdentity: exhaustedFault.identity });
        return false;
      }
      if (!activeWrite && lane.pendingIo?.ownerSettled) {
        if (kind === "reconcile") {
          lane.pendingIo = null; save();
        } else {
          const failedIdentity = `transport:${lane.sessionId}:${lane.pendingIo.kind}:${lane.pendingIo.requestId ?? "session"}`;
          let fault = findFault(failedIdentity);
          if (!fault || fault.state !== "exhausted") {
            fault = retainFault(faultFor("transport", lane.pendingIo.kind, lane.pendingIo.requestId, { state: "exhausted" }));
            save(); await flush();
          }
          publishDelta("transport", { type: "transport-uncertain", sessionId: lane.sessionId,
            kind: lane.pendingIo.kind, state: "exhausted", faultIdentity: fault.identity });
          return false;
        }
      } else if (!activeWrite && lane.pendingIo) {
        lane.pendingIo.state = "uncertain";
        const fault = retainFault(faultFor("transport", lane.pendingIo.kind, lane.pendingIo.requestId)); save(); await flush();
        publish({ type: "reconciliation-required", id: lane.pendingIo.requestId,
          reason: "Original physical write owner is absent; reconcile its late outcome before another write" });
        return false;
      }
      const current = activeWrite ?? beginWrite(message, kind);
      if (current.kind !== kind || current.requestId !== requestIdFor(message)) {
        publishDelta("transport", { type: "transport-observation", sessionId: lane.sessionId, kind: current.kind, state: "pending" });
        return false;
      }
      const recovery = current.outcome ? { observe: true, recoveryRounds: findFault(transportFaultIdentity)?.recoveryRounds ?? 0 }
        : await beginRecoveryObservation("transport", kind, current.requestId);
      if (!recovery.observe) {
        await pauseObservationCycle();
        publishDelta("transport", { type: "transport-observation", sessionId: lane.sessionId, kind,
          state: recovery.state ?? "pending", recoveryRounds: recovery.recoveryRounds });
        return false;
      }
      const observed = current.outcome ?? await observe(current.promise);
      if (observed.state === "pending") {
        if (lane.pendingIo) lane.pendingIo.state = "observing";
        const fault = await retainPendingFault("transport", kind, current.requestId, recovery.recoveryRounds);
        publishDelta("transport", { type: "transport-observation", sessionId: lane.sessionId, kind, state: "pending",
          waitMs: transportWaitMs, hostOverheadMs, faultIdentity: fault.identity, recoveryRounds: fault.recoveryRounds,
          faultState: fault.state });
        return false;
      }
      activeWrite = null;
      if (observed.state === "failed") {
        if (lane.pendingIo) { lane.pendingIo.state = "uncertain"; lane.pendingIo.ownerSettled = true; }
        const fault = retainFault(faultFor("transport", kind, current.requestId, { state: "exhausted" })); save();
        await flush();
        publishDelta("transport", { type: "transport-uncertain", sessionId: lane.sessionId, kind, faultIdentity: fault.identity });
        return false;
      }
      lane.pendingIo = null;
      const recoveredFault = findFault(transportFaultIdentity) !== null;
      clearFault(transportFaultIdentity);
      reportSignatures.delete("transport");
      save(); await drain();
      if (kind !== "heartbeat" || recoveredFault) await flush();
      return true;
    };
    const heartbeat = async () => {
      const queued = await readControl();
      if (queued && (!queued.id || !lane.controls.some(item => item.sourceId === queued.id))) {
        const revision = queued.revision ?? (queued.id && lane.runStatus?.runId === queued.runId ? lane.runStatus.controlRevision + 1 : undefined);
        const message = typeof queued === "string" ? { control: queued } : { control: queued.control,
          ...(queued.runId === undefined ? {} : { runId: queued.runId }), ...(queued.id === undefined ? {} : { id: queued.id }),
          ...(revision === undefined ? {} : { revision }) };
        lane.controls.push({ message, state: "queued", sourceId: queued.id, recoveryRounds: 0 }); save(); await flush(); store("workflow.control", null);
      }
      const control = lane.controls.find(value => value.state === "queued");
      if (control) {
        control.state = "sending";
        if (control.sourceId && Number.isInteger(control.message.revision)) control.nextObservationAt = Date.now() + 5000;
        save(); await write(control.message, "control");
      }
      else {
        const unresolved = lane.controls.find(value => value.state === "sending" && value.sourceId && Number.isInteger(value.message.revision)
          && (value.nextObservationAt ?? 0) <= Date.now() && (value.recoveryRounds ?? 0) < 3);
        if (unresolved) {
          const round = unresolved.recoveryRounds ?? 0;
          unresolved.recoveryRounds = round + 1;
          if (round < 2) unresolved.nextObservationAt = Date.now() + [15000, 30000][round];
          else delete unresolved.nextObservationAt;
          save(); await flush();
          await write({ inspectControl: { id: unresolved.sourceId, runId: unresolved.message.runId,
            command: unresolved.message.control, revision: unresolved.message.revision } }, "control-inspection");
        } else await write({ heartbeat: true }, "heartbeat");
      }
    };
    const callNative = async request => {
      const message = request.request;
      if (request.payloadMissing) {
        publish({ type: "reconciliation-required", id: request.id, reason: "Original native request payload is unavailable" }); return;
      }
      if (!allowed.includes(message.name)) {
        publish({ type: "reconciliation-required", id: request.id, reason: "Unsupported native request is outside the allowlist" }); return;
      }
      if (typeof tools[message.name] !== "function") {
        request.response = { id: request.id, error: `Unsupported desktop tool: ${message.name}` };
        await transition(request, "returned");
        return;
      }
      const args = message.name === "mcp__codex_app__list_threads" && message.arguments.limit > 50
        ? { ...message.arguments, limit: 50 } : message.arguments;
      await transition(request, "dispatched");
      // Persist the actual return immediately, even if a concurrent transport write is pending.
      const pending = Promise.resolve().then(() => tools[message.name](args)).then(
        result => ({ id: request.id, result }), error => ({ id: request.id, error: String(error.message ?? error) }),
      ).then(async response => {
        const current = lane.requests.find(item => item.id === request.id);
        clearFault(`native:${lane.sessionId}:call:${request.id}`);
        reportSignatures.delete(`native:${request.id}`);
        current.response = response; await transition(current, "returned");
      });
      native.set(request.id, pending);
    };
    const tick = async () => {
      claim(); await drain(); await flush();
      if (activeWrite && !await write(activeWrite.message, activeWrite.kind)) return;
      const deadline = Date.now() + tickMs;
      // An interrupted write may have returned output just before consumption was interrupted.
      if (lane.pendingIo?.result) { lane.pendingIo = null; save(); }
      if (lane.active && (lane.needsInspection || lane.requests.some(item => item.state === "forwarding") || lane.pendingIo?.state === "uncertain")) {
        const unresolved = lane.requests.filter(item => item.state !== "forwarded").map(item => item.id);
        if (lane.pendingIo?.kind === "settlement" && lane.pendingIo.requestId && !unresolved.includes(lane.pendingIo.requestId)) {
          unresolved.push(lane.pendingIo.requestId);
        }
        for (let offset = 0; offset === 0 || offset < unresolved.length; offset += 100) {
          if (!await write({ inspectRequests: true, requestIds: unresolved.slice(offset, offset + 100) }, "reconcile")) return;
        }
        lane.needsInspection = false; save();
      }
      for (const request of lane.requests) {
        if (request.conflict) continue;
        if (request.state === "received" && lane.active) await callNative(request);
        if (request.state === "dispatched" && !native.has(request.id)) {
          publish({ type: "reconciliation-required", id: request.id, reason: "Original native outcome is uncertain; read its task/intent owner before retry" });
        }
        const pending = native.get(request.id);
        if (pending) {
          const recovery = await beginRecoveryObservation("native", "call", request.id);
          if (!recovery.observe) await pauseObservationCycle();
          while (recovery.observe && request.state === "dispatched" && Date.now() < deadline) {
            let timer;
            await Promise.race([pending, new Promise(resolve => { timer = setTimeout(resolve, heartbeatMs); })]);
            clearTimeout(timer);
            if (request.state === "dispatched") await heartbeat();
          }
          if (request.state === "dispatched") {
            const fault = recovery.observe
              ? await retainPendingFault("native", "call", request.id, recovery.recoveryRounds)
              : findFault(`native:${lane.sessionId}:call:${request.id}`);
            publishDelta(`native:${request.id}`, { type: "native-observation", id: request.id, state: "pending",
              waitMs: tickMs, faultIdentity: fault.identity, recoveryRounds: fault.recoveryRounds, faultState: fault.state });
          }
          if (request.state === "returned") { await pending; native.delete(request.id); }
        }
        if (request.state === "returned" && lane.active) {
          if (!request.response) publish({ type: "reconciliation-required", id: request.id, reason: "Native payload was intentionally excluded from disk; recover the original owner outcome" });
          else {
            await transition(request, "forwarding");
            if (!await write(request.response, "response")) return;
          }
        }
        if (request.state === "forwarded" && !request.settled && lane.active) {
          const settlementFault = findFault(`transport:${lane.sessionId}:settlement:${request.id}`);
          if (settlementFault?.state !== "exhausted") {
            if (!await write({ settleRequests: [request.id] }, "settlement")) return;
            settleRequest(request);
            save(); await flush();
          }
        }
        if (Date.now() >= deadline) break;
      }
      if (lane.active) await heartbeat();
      await drain(); await flush();
      const driverDelta = { type: "driver", active: lane.active, sessionId: lane.sessionId,
        pending: lane.requests.filter(item => item.state !== "forwarded").map(({ id, state }) => ({ id, state })),
        partialBytes: partialBytes(lane) };
      const signature = JSON.stringify(driverDelta);
      if (signature !== lastDriverSignature) { lastDriverSignature = signature; publish(driverDelta); }
      return signature;
    };
    const boundedTick = async () => {
      if (ticking) throw new Error("Original active driver tick is still pending");
      ticking = true;
      try { await tick(); } finally { ticking = false; }
    };
    const withPulse = async action => {
      if (owned) throw new Error("Original active driver is still pending");
      owned = true;
      let completed = false;
      try {
        claim(); pulsing = true; schedulePulse();
        await action();
        completed = true;
      } finally {
        pulsing = false; clearTimeout(pulseTimer);
        try {
          await pulsePending;
          // The final pulse may return EOF after the last drain. Retain and
          // consume its terminal frames before the active driver returns.
          if (completed && !lane.active) { await drain(); await flush(); }
        } finally { owned = false; }
      }
    };
    return {
      tick: () => withPulse(boundedTick),
      async run(yieldControl) {
        await withPulse(async () => {
          let observedVersion = reportVersion;
          do {
            await boundedTick();
            if (reportVersion !== observedVersion) { observedVersion = reportVersion; await yieldControl(); }
          } while (lane.active || native.size);
        });
      },
      resume({ previousDriverId, stoppedEvidence }) {
        read();
        if (!stoppedEvidence || lane.driver?.id !== previousDriverId) throw new Error("Exact original driver and stopped evidence required");
        if (lane.pendingIo) {
          lane.pendingIo = { ...lane.pendingIo, state: "uncertain", ownerSettled: true };
          lane.needsInspection = true;
        }
        lane.driver = { id: driverId, previousDriverId, stoppedEvidence }; save();
      },
      async reconcileNative({ id, result, error, ownerEvidence }) {
        claim();
        const request = lane.requests.find(item => item.id === id);
        if (!ownerEvidence?.observation || ownerEvidence.requestId !== id || !["dispatched", "returned"].includes(request?.state)
          || request?.owner && ownerEvidence.receiptIdentity !== request.owner.receiptIdentity
          || native.has(id) || (result === undefined) === (error === undefined)) throw new Error("Exact original request owner evidence and outcome required");
        request.ownerEvidence = copy(ownerEvidence);
        request.response = result === undefined ? { id, error } : { id, result }; await transition(request, "returned");
      },
    };
  }
  return Object.freeze({ allowed, parseTransport, createLane, createDriver, checkpointState, restoreCheckpoint, createCheckpointWriter, createControlReader, ownerForRequest });
})()
