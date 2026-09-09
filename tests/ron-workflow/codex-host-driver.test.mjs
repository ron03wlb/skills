import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { PassThrough } from "node:stream";
import { createCodexHostBridge } from "../../skills/personal/run-issue-workflow/scripts/codex-host-bridge.mjs";

const source = readFileSync(new URL("../../skills/personal/run-issue-workflow/scripts/codex-host-driver.js", import.meta.url), "utf8");
const api = runInNewContext(source);
const plain = value => JSON.parse(JSON.stringify(value));
const frame = value => `workflow-host ${JSON.stringify(value)}\n`;
const request = { type: "tool", id: "original-id", name: "mcp__codex_app__list_threads", arguments: { limit: 100 } };

test("the same dependency-free source loads without Node globals", () => {
  assert.equal(typeof api.createDriver, "function");
  assert.equal(typeof api.parseTransport, "function");
});

for (const ending of ["\n", "\r\n"]) {
  test(`fragmentation, payload and observed column-80 repeated-character redraw survive ${JSON.stringify(ending)}`, () => {
    const message = { ...request, arguments: { text: "same  spaces 漢字 \\n \\u001b[31m", limit: 100 } };
    const line = frame(message).trimEnd(), split = 79;
    const raw = `\x1b[?25l\x1b[2J\x1b[H${line.slice(0, split)}\r\n\x1b[4;80H${line[split - 1]}${line.slice(split)}${ending}`;
    let buffer = "", frames = [];
    for (const char of raw) {
      const parsed = api.parseTransport(buffer + char);
      buffer = parsed.remaining;
      frames.push(...parsed.frames);
    }
    const last = api.parseTransport(buffer, true);
    frames.push(...last.frames);
    assert.equal(frames.filter(item => item.kind === "message").length, 1);
    assert.deepEqual(plain(frames.find(item => item.kind === "message").message), message);
    assert.equal(frames.map(item => item.raw).join(""), raw);
    assert.equal(last.remaining, "");
  });
}

test("unknown/malformed framing is observable and incomplete final data remains buffered", () => {
  for (const raw of ['workflow-host {oops}\n', frame({ type: "invented" }), '\x1b[99zworkflow-host {}\n']) {
    const parsed = api.parseTransport(raw, true);
    assert.equal(parsed.frames[0].kind, "diagnostic");
    assert.equal(parsed.frames[0].raw, raw);
  }
  const wrong = 'workflow-host {"type":"res\r\n\x1b[2;80HXult"}\n';
  assert.ok(api.parseTransport(wrong, true).frames.every(item => item.kind === "diagnostic"));
  const partial = 'workflow-host {"type":"res';
  assert.equal(api.parseTransport(partial, true).remaining, partial);
  const final = frame({ type: "result", result: { state: "UNAVAILABLE" } }).trimEnd();
  assert.equal(api.parseTransport(final, true).frames[0].raw, final);
  assert.equal(api.parseTransport(final, true).remaining, "");
});

function harness({ native, write, checkpoint } = {}) {
  const values = new Map(), writes = [], output = [];
  let durable;
  let calls = 0;
  values.set("workflow.host", api.createLane({ sessionId: 42, output: frame(request) }));
  const dependencies = {
    driverId: "first-cell", load: key => plain(values.get(key) ?? null),
    store: (key, value) => values.set(key, plain(value)), report: value => output.push(plain(value)),
    tools: {
      async mcp__codex_app__list_threads(args) { calls++; assert.equal(args.limit, 50); return native ? native() : { ok: true }; },
      async write_stdin(args) {
        assert.equal(args.session_id, 42);
        const message = args.chars ? JSON.parse(args.chars) : null;
        writes.push(message);
        if (write) return write(message);
        return { output: message?.id ? frame({ type: "response-accepted", id: message.id })
          : message?.inspectRequests ? frame({ type: "request-state", id: request.id, state: "pending", request }) : "" };
      },
    },
    persist: async value => { durable = plain(value); },
    setTimeout: fn => setTimeout(fn, 2), clearTimeout, heartbeatMs: 2, tickMs: 12, checkpoint,
  };
  return { values, writes, output, dependencies, driver: api.createDriver(dependencies),
    lane: () => values.get("workflow.host"), calls: () => calls, durable: () => durable };
}

test("slow native calls retain original ID, continue heartbeats, preserve controls and forward once", async () => {
  const h = harness({ native: async () => { await sleep(35); return { ok: true }; } });
  h.values.set("workflow.control", { control: "PAUSE", runId: "exact-run" });
  for (let i = 0; i < 20 && h.lane().requests[0]?.state !== "forwarded"; i++) await h.driver.tick();
  assert.equal(h.calls(), 1);
  assert.ok(h.writes.filter(item => item?.heartbeat).length > 2);
  assert.deepEqual(h.writes.filter(item => item?.control), [{ control: "PAUSE", runId: "exact-run" }]);
  assert.deepEqual(h.writes.filter(item => item?.id), [{ id: request.id, result: { ok: true } }]);
  assert.deepEqual(h.lane().requests[0].history, ["received", "dispatched", "returned", "forwarding", "forwarded"]);
});

for (const boundary of ["received", "dispatched", "returned", "forwarding"]) {
  test(`interruption at ${boundary} preserves identity without replaying uncertain native work`, async () => {
    let injected = false;
    const h = harness({ checkpoint: state => { if (!injected && state === boundary) { injected = true; throw new Error("INTERRUPTED"); } } });
    await assert.rejects(h.driver.tick(), /INTERRUPTED/);
    assert.equal(h.lane().requests[0].id, request.id);
    assert.equal(h.lane().requests[0].state, boundary);
    const second = api.createDriver({ ...h.dependencies, driverId: "second-cell", checkpoint: undefined });
    await assert.rejects(second.tick(), /active driver/);
    second.resume({ previousDriverId: "first-cell", stoppedEvidence: "original functions cell confirmed terminated" });
    await second.tick();
    assert.equal(h.calls(), boundary === "dispatched" ? 0 : 1);
    if (boundary === "dispatched") {
      assert.equal(h.lane().requests[0].state, "dispatched");
      assert.ok(h.output.some(item => item.type === "reconciliation-required"));
      await assert.rejects(second.reconcileNative({ id: request.id, result: {} }), /owner evidence/);
      await second.reconcileNative({ id: request.id, result: { recovered: true }, ownerEvidence: { requestId: request.id, observation: "original task/intent read-back" } });
      await second.tick();
      assert.equal(h.calls(), 0);
    }
  });
}

test("lost forwarding acknowledgement reconciles from the original bridge before redelivery", async () => {
  let accepted = false;
  const h = harness({ write: message => {
    if (message?.id) { accepted = true; throw new Error("response lost"); }
    if (message?.inspectRequests) return { output: frame({ type: "request-state", id: request.id, state: accepted ? "accepted" : "pending", request }) };
    return { output: "" };
  } });
  await h.driver.tick();
  assert.equal(h.lane().requests[0].state, "forwarding");
  await h.driver.tick();
  assert.equal(h.lane().requests[0].state, "forwarded");
  assert.equal(h.calls(), 1);
  assert.equal(h.writes.filter(item => item?.id).length, 1);
});

test("exit drains final frames, retains partial bytes, session identity and a pending native outcome", async () => {
  const terminal = { type: "result", result: { state: "UNAVAILABLE" } };
  const h = harness({ native: async () => { await sleep(20); return { actual: true }; }, write: () => ({ output: frame(terminal) + 'workflow-host {"partial":', exit_code: 0 }) });
  await h.driver.tick();
  await sleep(25);
  await h.driver.tick();
  assert.equal(h.lane().sessionId, 42);
  assert.equal(h.lane().active, false);
  assert.equal(h.lane().exitCode, 0);
  assert.equal(h.lane().buffer, 'workflow-host {"partial":');
  assert.equal(h.lane().requests[0].state, "returned");
  assert.ok(h.output.some(item => item.type === "result" && item.result.state === "UNAVAILABLE"));
  assert.equal(h.writes.filter(item => item?.id).length, 0);
});

test("duplicate IDs with conflicting content and disallowed tools never dispatch", async () => {
  const h = harness(), lane = h.lane();
  lane.buffer = frame({ ...request, name: "mcp__codex_app__consume_usage_reset" });
  h.values.set("workflow.host", lane);
  await h.driver.tick();
  assert.equal(h.calls(), 0);
  assert.equal(h.lane().requests[0].state, "received");
  const next = h.lane(); next.buffer = frame(request); h.values.set("workflow.host", next);
  await h.driver.tick();
  assert.equal(h.calls(), 0);
  assert.ok(h.lane().diagnostics.some(item => item.reason === "Conflicting request identity"));
});

test("a still-pending response is redelivered only after original-owner read-back, without native replay", async () => {
  let delivery = 0;
  const h = harness({ write: message => {
    if (message?.id) {
      if (++delivery === 1) throw new Error("write interrupted before delivery");
      return { output: frame({ type: "response-accepted", id: request.id }) };
    }
    return { output: message?.inspectRequests ? frame({ type: "request-state", id: request.id, state: "pending", request }) : "" };
  } });
  await h.driver.tick(); await h.driver.tick();
  assert.equal(h.calls(), 1);
  assert.equal(delivery, 2);
  const redelivery = h.writes.findLastIndex(item => item?.id);
  assert.equal(h.writes[redelivery - 1].inspectRequests, true);
  assert.equal(h.lane().requests[0].state, "forwarded");
});

test("a second concurrent tick cannot duplicate a pending native request", async () => {
  const h = harness({ native: () => sleep(20) });
  const first = h.driver.tick();
  await assert.rejects(h.driver.tick(), /active driver/);
  await first;
  assert.equal(h.calls(), 1);
});

test("the documented loader and run entry use the same tested source", async () => {
  const markdown = readFileSync(new URL("../../skills/personal/run-issue-workflow/references/codex-host-driver.md", import.meta.url), "utf8");
  const snippets = [...markdown.replaceAll("\r\n", "\n").matchAll(/```js\n([\s\S]*?)\n```/gu)].map(match => match[1]);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const values = new Map();
  await new AsyncFunction("tools", "store", snippets[0])({ exec_command: async () => ({ exit_code: 0, output: source }) }, (key, value) => values.set(key, value));
  assert.equal(values.get("workflow.driverSource"), source);
  values.set("workflow.host", api.createLane({ sessionId: 7, output: frame({ type: "result", result: { state: "PRESERVED" } }), exit_code: 0 }));
  const reports = [];
  await new AsyncFunction("tools", "load", "store", "text", "setTimeout", "clearTimeout", "yield_control", snippets[1].replaceAll("<absolute-Git-common-directory>", "C:/fixture/.git"))(
    { exec_command: async () => ({ exit_code: 0 }) }, key => values.get(key), (key, value) => values.set(key, value), value => reports.push(value), setTimeout, clearTimeout, async () => {},
  );
  assert.ok(reports.some(item => item.type === "result" && item.result.state === "PRESERVED"));
});

test("observed live Windows prefixes and OSC title preserve exact workflow bytes", () => {
  const setup = '\x1b[?9001h\x1b[?1004h\x1b[?25l\x1b[2J\x1b[m\x1b[H';
  const title = '\x1b]0;C:\\host\\pwsh.exe\x07\x1b[?25h';
  const parsed = api.parseTransport(setup + frame(request).replaceAll("\n", "\r\n") + title);
  assert.deepEqual(plain(parsed.frames[0].message), request);
  assert.equal(parsed.frames[1].kind, "terminal");
  assert.equal(parsed.remaining, "");
});

for (const boundary of ["received", "dispatched", "returned", "forwarding"]) {
  test(`durable ${boundary} survives loss of every active-cell store update`, async () => {
    const h = harness({ checkpoint: state => { if (state === boundary) throw new Error("CELL_TERMINATED"); } });
    await assert.rejects(h.driver.tick(), /CELL_TERMINATED/);
    assert.equal(h.durable().requests[0].state, boundary);
    h.values.clear();
    h.values.set("workflow.host", plain(api.restoreCheckpoint(h.durable())));
    const resumed = api.createDriver({ ...h.dependencies, checkpoint: undefined, driverId: "recovered-cell" });
    resumed.resume({ previousDriverId: "first-cell", stoppedEvidence: "confirmed cell termination" });
    await resumed.tick();
    assert.equal(h.calls(), boundary === "dispatched" ? 0 : 1);
    if (["returned", "forwarding"].includes(boundary)) {
      assert.equal(h.writes.filter(item => item?.id).length, 0, "omitted response content requires original-owner recovery");
      await resumed.reconcileNative({ id: request.id, result: { recovered: true }, ownerEvidence: { requestId: request.id, observation: "original native task read-back" } });
      await resumed.tick();
      assert.equal(h.writes.filter(item => item?.id).length, 1);
      assert.equal(h.calls(), 1);
    }
  });
}

test("durable checkpoints exclude bridge credentials and all native payloads", () => {
  const secret = "fixture-bridge-secret", lane = api.createLane({ sessionId: 1, output: `raw ${secret}` });
  lane.requests.push({ id: "original-panel", request: { type: "tool", id: "original-panel", name: "mcp__codex_app__open_in_codex",
    arguments: { target: { url: `http://localhost/?token=${secret}` } } }, state: "returned", history: ["received", "dispatched", "returned"],
    response: { result: { content: [{ text: secret }] } }, raw: secret, ownerEvidence: { observation: secret } });
  lane.diagnostics.push({ raw: secret, reason: secret });
  lane.pendingIo = { kind: "response", state: "sending", message: { result: secret }, error: secret };
  lane.terminal = { type: "error", message: secret };
  const serialized = JSON.stringify(api.checkpointState(lane));
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("http:"), false);
  assert.equal(JSON.parse(serialized).requests[0].id, "original-panel");
});

test("failed checkpoint publication prevents native dispatch", async () => {
  const h = harness();
  const driver = api.createDriver({ ...h.dependencies, persist: async () => { throw new Error("disk unavailable"); } });
  await assert.rejects(driver.tick(), /disk unavailable/);
  assert.equal(h.calls(), 0);
});

test("an unavailable allowed host tool returns its original unsupported outcome to the adapter", async () => {
  const h = harness();
  const lane = h.lane();
  lane.buffer = frame({ ...request, name: "mcp__codex_app__wait_threads", arguments: { targets: [], timeoutMs: 15000 } });
  h.values.set("workflow.host", lane);
  await h.driver.tick();
  assert.equal(h.calls(), 0);
  assert.deepEqual(h.writes.filter(message => message?.id), [{ id: request.id,
    error: "Unsupported desktop tool: mcp__codex_app__wait_threads" }]);
  assert.equal(h.lane().requests[0].state, "forwarded");
});

test("fresh file controls retain exact Run identity and do not replay the same ID after restore", async () => {
  const h = harness();
  let queued = null;
  const driver = api.createDriver({ ...h.dependencies, readControl: async () => queued });
  await driver.tick();
  queued = { id: "control-1", control: "PAUSE", runId: "exact-run" };
  await driver.tick(); await driver.tick();
  assert.deepEqual(h.writes.filter(item => item?.control), [{ control: "PAUSE", runId: "exact-run" }]);
  h.values.set("workflow.host", api.restoreCheckpoint(h.durable()));
  const resumed = api.createDriver({ ...h.dependencies, driverId: "new-cell", readControl: async () => queued });
  resumed.resume({ previousDriverId: "first-cell", stoppedEvidence: "cell ended" });
  await resumed.tick();
  assert.equal(h.writes.filter(item => item?.control).length, 1);
});

test("EOF drains complete ANSI and redraw frames without a final line separator", () => {
  const message = { type: "result", result: { state: "PRESERVED", detail: "a".repeat(90) } };
  const line = frame(message).trimEnd();
  const redraw = line.slice(0, 79) + '\r\n\x1b[4;80H' + line[78] + line.slice(79);
  for (const raw of ['\x1b[?25l' + line, redraw, '\x1b[?9001h' + redraw]) {
    const parsed = api.parseTransport(raw, true);
    assert.equal(parsed.remaining, "");
    assert.deepEqual(plain(parsed.frames[0].message), message);
    assert.equal(parsed.frames[0].raw, raw);
  }
  const partial = '\x1b[?25lworkflow-host {"type":"res';
  assert.equal(api.parseTransport(partial, true).remaining, partial);
});

test("malformed transport secrets remain transient and never enter public diagnostics", async () => {
  const h = harness(), secret = "fixture-secret-value";
  h.values.set("workflow.host", api.createLane({ sessionId: 42, output: `workflow-host ${secret}\n`, exit_code: 0 }));
  await h.driver.tick();
  assert.ok(h.lane().diagnostics.some(item => item.raw.includes(secret)));
  assert.equal(JSON.stringify(h.output).includes(secret), false);
  assert.equal(JSON.stringify(h.durable()).includes(secret), false);
});

test("unresolved omitted partial bytes survive repeated restore, checkpoint and reporting", async () => {
  const h = harness(), partial = 'workflow-host {"type":"res';
  let saved = api.checkpointState(api.createLane({ sessionId: 42, output: partial, exit_code: 0 }));
  for (let i = 0; i < 3; i++) saved = api.checkpointState(api.restoreCheckpoint(saved));
  assert.equal(saved.partialBytes, partial.length);
  h.values.set("workflow.host", api.restoreCheckpoint(saved));
  await h.driver.tick();
  assert.equal(h.durable().partialBytes, partial.length);
  assert.equal(h.output.at(-1).partialBytes, partial.length);
});

for (const slowBoundary of ["large response", "checkpoint", "control read", "post-report checkpoint"]) {
  test(`bridge stays connected during ${slowBoundary} without repeating native work`, async () => {
    const input = new PassThrough(), output = new PassThrough();
    let wire = "", calls = 0;
    output.on("data", chunk => { wire += chunk; });
    const take = () => { const result = wire; wire = ""; return result; };
    const bridge = createCodexHostBridge({ input, output, idleTimeoutMs: 100 });
    const payload = { text: "漢字😀 ".repeat(15000) };
    const outcome = bridge.call(request.name, { limit: 1 }).then(result => ({ result }), error => ({ error }));
    const values = new Map([["workflow.host", api.createLane({ sessionId: 42, output: take() })]]);
    const writes = [];
    let slowCheckpoint = slowBoundary === "checkpoint", slowControl = slowBoundary === "control read", reported = false;
    const driver = api.createDriver({ driverId: "bounded-probe", load: key => values.get(key), store: (key, value) => values.set(key, value),
      report: value => { if (value.type === "driver") reported = true; }, setTimeout, clearTimeout, heartbeatMs: 10, tickMs: 500,
      persist: async () => {
        if (slowCheckpoint || slowBoundary === "post-report checkpoint" && reported) { slowCheckpoint = false; await sleep(180); }
      },
      readControl: async () => { if (slowControl) { slowControl = false; await sleep(180); } return null; },
      tools: {
        async [request.name]() { calls++; return payload; },
        async write_stdin(args) {
          writes.push(args.chars);
          if (args.chars.length > 12000) await sleep(180);
          if (!bridge.disconnected) input.write(args.chars);
          await sleep(1);
          return { output: take(), ...(bridge.disconnected ? { exit_code: 0 } : {}) };
        },
      } });
    try {
      await driver.tick();
      const observed = await outcome;
      assert.equal(observed.error, undefined, "no heartbeat starvation at the reproduced boundary");
      assert.equal(bridge.disconnected, false, "the completed tick must not strand its still-active bridge");
      assert.deepEqual(plain(observed.result), payload);
      assert.equal(calls, 1);
      assert.ok(writes.every(value => value.length <= 12000), "native responses use bounded physical writes");
      assert.equal(values.get("workflow.host").requests[0].state, "forwarded");
      if (["checkpoint", "control read"].includes(slowBoundary)) assert.ok(writes.filter(value => JSON.parse(value).heartbeat).length >= 2);
    } finally { bridge.close(); input.destroy(); output.destroy(); }
  });
}

test("run keeps its heartbeat across a delayed yield and stops it when the run returns", async () => {
  const input = new PassThrough(), output = new PassThrough();
  let wire = "", calls = 0, writes = 0;
  output.on("data", chunk => { wire += chunk; });
  const take = () => { const result = wire; wire = ""; return result; };
  const bridge = createCodexHostBridge({ input, output, idleTimeoutMs: 100 });
  const values = new Map([["workflow.host", api.createLane({ sessionId: 42 })]]);
  const outcome = bridge.call(request.name, {}).then(result => ({ result }), error => ({ error }));
  const driver = api.createDriver({ driverId: "yield-probe", load: key => values.get(key), store: (key, value) => values.set(key, value),
    report: () => {}, setTimeout, clearTimeout, heartbeatMs: 10, tickMs: 500, persist: async () => {},
    tools: {
      async [request.name]() { calls++; return { observed: true }; },
      async write_stdin(args) {
        writes++;
        if (!bridge.disconnected) input.write(args.chars);
        await sleep(1);
        return { output: take(), ...(bridge.disconnected ? { exit_code: 0 } : {}) };
      },
    } });
  try {
    let yields = 0;
    await driver.run(async () => {
      if (++yields === 1) {
        await assert.rejects(driver.tick(), /Original active driver is still pending/u);
        await sleep(180);
        assert.equal(bridge.disconnected, false, "a pending yield remains part of the active driver lifetime");
      } else bridge.close();
    });
    assert.deepEqual(plain((await outcome).result), { observed: true });
    assert.equal(calls, 1);
    assert.equal(values.get("workflow.host").requests[0].state, "forwarded");
    const completedWrites = writes;
    await sleep(30);
    assert.equal(writes, completedWrites, "no detached heartbeat survives a completed run");
  } finally { bridge.close(); input.destroy(); output.destroy(); }
});

test("a terminal frame returned by the final in-flight heartbeat is drained before run exits", async () => {
  const terminal = { type: "result", result: { state: "PRESERVED" } };
  let heartbeats = 0, delayed = false;
  const h = harness({ write: async message => {
    if (message?.heartbeat) {
      if (++heartbeats === 1) return { output: "" };
      await sleep(20); return { output: frame(terminal), exit_code: 0 };
    }
    return { output: message?.id ? frame({ type: "response-accepted", id: message.id }) : "" };
  } });
  const driver = api.createDriver({ ...h.dependencies, readControl: async () => null,
    persist: async () => { if (heartbeats && !delayed) { delayed = true; await sleep(5); } } });
  await driver.run(async () => {});
  assert.equal(h.lane().active, false);
  assert.ok(h.output.some(value => value.type === "result" && value.result.state === "PRESERVED"));
  assert.equal(h.lane().buffer, "");
});

test("a response beyond transport capacity stops with its native outcome retained", async () => {
  const text = "x".repeat(16 * 1024 * 1024);
  const h = harness({ native: () => ({ text }) });
  await assert.rejects(h.driver.tick(), /exceeds bounded transport capacity/u);
  assert.equal(h.calls(), 1);
  assert.equal(h.writes.some(message => message?.id || message?.responseChunk), false);
  assert.equal(h.lane().requests[0].response.result.text.length, text.length);
  assert.equal(h.lane().requests[0].state, "forwarding");
});

test("a stalled physical write has bounded observation, preserves its owner and settles late without a second writer", async () => {
  let settleWrite;
  let responseWrites = 0;
  let clock = 0;
  const pendingWrite = new Promise(resolve => { settleWrite = resolve; });
  const h = harness({ write: message => {
    if (message?.id) {
      responseWrites += 1;
      return pendingWrite;
    }
    return { output: "" };
  } });
  const driver = api.createDriver({
    ...h.dependencies,
    heartbeatMs: 1000,
    tickMs: 5,
    transportWaitMs: 5,
    hostOverheadMs: 5,
    now: () => clock,
  });

  const started = Date.now();
  await driver.tick();
  assert.ok(Date.now() - started < 200, "the requested wait plus host overhead bounds one observation");
  assert.equal(responseWrites, 1);
  assert.equal(h.lane().pendingIo.state, "observing");
  assert.equal(h.lane().requests[0].state, "forwarding");
  assert.deepEqual(h.durable().fault, {
    identity: "transport:42:response:original-id",
    kind: "transport",
    requestId: "original-id",
    state: "unresolved",
    recoveryRounds: 0,
    recoveryDelaysMs: [5000, 15000, 30000],
    nextObservationAt: 5000,
    receiptRefs: ["original-id"],
  });

  await driver.tick();
  assert.equal(responseWrites, 1, "a bounded observation never starts a replacement physical writer");
  assert.equal(h.durable().fault.recoveryRounds, 0, "an unchanged early tick consumes no recovery round");
  for (const [at, round, state] of [[5000, 1, "unresolved"], [20000, 2, "unresolved"], [50000, 3, "exhausted"]]) {
    clock = at;
    await driver.tick();
    assert.equal(h.durable().fault.recoveryRounds, round);
    assert.equal(h.durable().fault.state, state);
  }
  clock = 100000;
  await driver.tick();
  assert.equal(h.durable().fault.recoveryRounds, 3, "an exhausted transport fault never multiplies its observation budget");
  settleWrite({ output: frame({ type: "response-accepted", id: request.id }) });
  await sleep(0);
  await driver.tick();
  assert.equal(responseWrites, 1);
  assert.equal(h.lane().requests[0].state, "forwarded");
  assert.equal(h.durable().fault, null);
});

test("a never-returning native call is observed within the tick budget and its late original result is retained", async () => {
  let settleNative;
  let clock = 0;
  const pendingNative = new Promise(resolve => { settleNative = resolve; });
  const h = harness({ native: () => pendingNative });
  const driver = api.createDriver({ ...h.dependencies, heartbeatMs: 1000, tickMs: 5,
    transportWaitMs: 5, hostOverheadMs: 5, now: () => clock });

  const started = Date.now();
  await driver.tick();
  assert.ok(Date.now() - started < 200);
  assert.equal(h.calls(), 1);
  assert.deepEqual(h.durable().fault, {
    identity: "native:42:call:original-id",
    kind: "native",
    requestId: "original-id",
    state: "unresolved",
    recoveryRounds: 0,
    recoveryDelaysMs: [5000, 15000, 30000],
    nextObservationAt: 5000,
    receiptRefs: ["original-id"],
  });
  await driver.tick();
  assert.equal(h.calls(), 1, "bounded native observation never replays the original tool call");
  for (const [at, round, state] of [[5000, 1, "unresolved"], [20000, 2, "unresolved"], [50000, 3, "exhausted"]]) {
    clock = at;
    await driver.tick();
    assert.equal(h.durable().fault.recoveryRounds, round);
    assert.equal(h.durable().fault.state, state);
  }
  clock = 100000;
  await driver.tick();
  assert.equal(h.durable().fault.recoveryRounds, 3);

  settleNative({ late: true });
  await sleep(0);
  await driver.tick();
  assert.equal(h.calls(), 1);
  assert.equal(h.lane().requests[0].state, "forwarded");
  assert.equal(h.durable().fault, null);
});

test("concurrent native and transport faults retain independent recovery budgets", async () => {
  let clock = 0;
  const pending = new Promise(() => {});
  const h = harness({ native: () => pending, write: message => message?.heartbeat ? pending : { output: "" } });
  const driver = api.createDriver({ ...h.dependencies, heartbeatMs: 2, tickMs: 8,
    transportWaitMs: 2, hostOverheadMs: 2, now: () => clock });
  await driver.tick();
  assert.deepEqual(h.durable().faults.map(fault => fault.identity).sort(), [
    "native:42:call:original-id", "transport:42:heartbeat:session",
  ]);
  clock = 5000;
  await driver.tick();
  const rounds = Object.fromEntries(h.durable().faults.map(fault => [fault.identity, fault.recoveryRounds]));
  assert.equal(rounds["native:42:call:original-id"], 0, "a transport-only observation cannot consume or reset the native budget");
  assert.equal(rounds["transport:42:heartbeat:session"], 1);
});

test("a late heartbeat write clears its durable fault without starting another owner", async () => {
  let settleHeartbeat;
  const pendingHeartbeat = new Promise(resolve => { settleHeartbeat = resolve; });
  let heartbeatWrites = 0;
  const h = harness({ write: message => {
    if (!message?.heartbeat) return { output: "" };
    heartbeatWrites += 1;
    return pendingHeartbeat;
  } });
  h.values.set("workflow.host", api.createLane({ sessionId: 42 }));
  const driver = api.createDriver({ ...h.dependencies, heartbeatMs: 1_000_000, tickMs: 5,
    transportWaitMs: 2, hostOverheadMs: 2, setTimeout, clearTimeout });
  await driver.tick();
  assert.equal(heartbeatWrites, 1);
  assert.equal(h.durable().fault.identity, "transport:42:heartbeat:session");
  settleHeartbeat({ output: "" });
  await sleep(0);
  await driver.tick();
  assert.equal(heartbeatWrites, 2, "the late owner settles before the ordinary next heartbeat");
  assert.equal(h.durable().fault, null);
  assert.deepEqual(h.durable().faults, []);
});

test("settled driver checkpoint work retains only a bounded recent request window", () => {
  const lane = api.createLane({ sessionId: 42 });
  lane.settledRequestCount = 105;
  lane.requests = Array.from({ length: 105 }, (_, index) => ({ id: `settled-${index}`,
    request: { type: "tool", name: "mcp__codex_app__list_threads" }, state: "forwarded", history: ["forwarded"], settled: true }));
  lane.requests.push({ id: "unresolved", request, state: "dispatched", history: ["received", "dispatched"] });
  const checkpoint = api.checkpointState(lane);
  assert.equal(checkpoint.settledRequestCount, 105);
  assert.equal(checkpoint.requests.length, 101);
  assert.equal(checkpoint.requests.filter(item => item.state === "forwarded").length, 100);
  assert.equal(checkpoint.requests.some(item => item.id === "unresolved"), true);
  assert.equal(api.restoreCheckpoint(checkpoint).settledRequestCount, 105);
});

test("unchanged settled ticks do not emit another driver delta", async () => {
  const h = harness();
  await h.driver.tick();
  const reports = h.output.filter(item => item.type === "driver").length;
  await h.driver.tick();
  assert.equal(h.output.filter(item => item.type === "driver").length, reports);
});

test("status reporting ignores timestamps and emits only compact semantic changes", async () => {
  let sequence = 0;
  const h = harness({ write: message => {
    if (message?.heartbeat) return { output: frame({ type: "status", status: {
      run: { runId: "run", state: "RUNNING", controlRevision: 0, updatedAt: `tick-${sequence++}` },
      nodes: [{ issueId: "I_1", state: "EXECUTING", updatedAt: `tick-${sequence}` }],
      legalActions: [], diagnoses: [],
    } }) };
    return { output: message?.id ? frame({ type: "response-accepted", id: message.id }) : "" };
  } });
  await h.driver.tick();
  await h.driver.tick();
  const statuses = h.output.filter(item => item.type === "status");
  assert.equal(statuses.length, 1);
  assert.deepEqual(statuses[0].run, { runId: "run", state: "RUNNING", controlRevision: 0 });
  assert.deepEqual(statuses[0].nodes, [{ issueId: "I_1", state: "EXECUTING" }]);
});
