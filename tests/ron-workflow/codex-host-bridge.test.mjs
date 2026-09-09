import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { CODEX_HOST_RELEASE_CAPABILITY, createCodexHostBridge } from "../../skills/personal/run-issue-workflow/scripts/codex-host-bridge.mjs";

test("the desktop bridge exchanges tool responses and text controls through its active input", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  output.on("data", (chunk) => messages.push(JSON.parse(chunk.toString().trim().replace(/^workflow-host /u, ""))));
  const bridge = createCodexHostBridge({ input, output });
  const pending = bridge.call("mcp__codex_app__list_projects", {});
  assert.equal(messages[0].type, "tool");
  assert.equal(messages[0].name, "mcp__codex_app__list_projects");
  input.write(`${JSON.stringify({ id: messages[0].id, result: { projects: [{ projectId: "project-1" }] } })}\n`);
  assert.deepEqual(await pending, { projects: [{ projectId: "project-1" }] });
  const commands = [];
  const control = await bridge.controls.connect({
    readStatus: async () => ({ run: { state: "RUNNING" } }),
    submitControl: async (command) => { commands.push(command); return { accepted: true }; },
  });
  input.write('{"control":"PAUSE"}\n');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(commands, ["PAUSE"]);
  assert.equal(messages.at(-1).type, "control-result");
  await control.close();
  bridge.close();
});

test("disconnected desktop transport fails pending work and cannot invoke unrelated account tools", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const bridge = createCodexHostBridge({ input, output });
  await assert.rejects(bridge.call("mcp__codex_app__consume_usage_reset", {}), /unsupported/i);
  assert.equal(CODEX_HOST_RELEASE_CAPABILITY.state, "UNAVAILABLE");
  assert.equal(CODEX_HOST_RELEASE_CAPABILITY.operation, null);
  for (const name of ["mcp__codex_app__release_helpers", "mcp__codex_app__handoff_thread", "mcp__codex_app__set_thread_archived"]) {
    await assert.rejects(bridge.call(name, { threadId: "exact-idle-task" }), /unsupported/i);
  }
  const pending = bridge.call("mcp__codex_app__list_threads", { limit: 100 });
  input.end();
  await assert.rejects(pending, /disconnected/i);
  await assert.rejects(bridge.call("mcp__codex_app__list_threads", {}), /disconnected/i);
  bridge.close();
});

test("host disconnection wakes an active text controller", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const bridge = createCodexHostBridge({ input, output });
  let failure;
  await bridge.controls.connect({
    readStatus: async () => ({ run: { state: "PAUSED" } }),
    onDisconnect: (error) => { failure = error; },
  });
  input.end();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(failure?.message ?? "", /DISCONNECTED/u);
});

test("original owner preserves malformed responses, acknowledges delivery and reconciles lost acknowledgements", async () => {
  const input = new PassThrough(), output = new PassThrough(), messages = [];
  output.on("data", chunk => messages.push(JSON.parse(chunk.toString().trim().replace(/^workflow-host /u, ""))));
  const bridge = createCodexHostBridge({ input, output });
  try {
    const pending = bridge.call("mcp__codex_app__list_projects", {});
    const request = messages.at(-1);
    input.write(JSON.stringify({ id: request.id }) + "\n");
    input.write(JSON.stringify({ inspectRequests: true, requestIds: [request.id] }) + "\n");
    assert.equal(messages.at(-1).state, "pending");
    const response = { id: request.id, result: { original: true } };
    input.write(JSON.stringify(response) + "\n");
    assert.deepEqual(await pending, response.result);
    assert.equal(messages.at(-1).type, "response-accepted");
    input.write(JSON.stringify({ inspectRequests: true, requestIds: [request.id] }) + "\n");
    assert.equal(messages.at(-1).state, "accepted");
    assert.deepEqual(messages.at(-1).request, request);
    input.write(JSON.stringify(response) + "\n");
    assert.equal(messages.at(-1).type, "response-accepted");
    input.write(JSON.stringify({ ...response, result: { different: true } }) + "\n");
    assert.equal(messages.at(-1).type, "input-error");
  } finally { bridge.close(); }
});

test("batch text controls require an exact Run and echo its identity", async () => {
  const input = new PassThrough(), output = new PassThrough(), messages = [], commands = [];
  output.on("data", chunk => messages.push(JSON.parse(chunk.toString().trim().replace(/^workflow-host /u, ""))));
  const bridge = createCodexHostBridge({ input, output });
  try {
    for (const runId of ["run-a", "run-b"]) await bridge.controls.connect({
      readStatus: async () => ({ run: { runId } }),
      submitControl: async command => { commands.push({ runId, command }); return { accepted: true }; },
    });
    input.write('{"control":"PAUSE"}\n');
    assert.equal(messages.at(-1).type, "input-error");
    input.write('{"control":"PAUSE","runId":"run-b"}\n');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(commands, [{ runId: "run-b", command: "PAUSE" }]);
    assert.equal(messages.at(-1).runId, "run-b");
  } finally { bridge.close(); }
});

test("request reconciliation excludes unrelated accepted history", async () => {
  const input = new PassThrough(), output = new PassThrough(), messages = [];
  output.on("data", chunk => messages.push(JSON.parse(chunk.toString().trim().replace(/^workflow-host /u, ""))));
  const bridge = createCodexHostBridge({ input, output });
  try {
    let selected;
    for (let i = 0; i < 70; i++) {
      const pending = bridge.call("mcp__codex_app__send_message_to_thread", { threadId: `task-${i}`, prompt: "x".repeat(16000) });
      selected = messages.at(-1).id;
      input.write(JSON.stringify({ id: selected, result: { accepted: true } }) + "\n");
      await pending;
    }
    messages.length = 0;
    input.write(JSON.stringify({ inspectRequests: true, requestIds: [selected] }) + "\n");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, selected);
    assert.equal(messages[0].state, "accepted");
  } finally { bridge.close(); }
});

for (const reason of ["idle-timeout", "input-eof", "input-error", "output-error"]) {
  test(`disconnect preserves the safe ${reason} category`, async () => {
    const input = new PassThrough(), output = new PassThrough();
    const bridge = createCodexHostBridge({ input, output, idleTimeoutMs: 30 });
    const pending = bridge.call("mcp__codex_app__list_projects", {}).catch(error => error);
    if (reason === "input-eof") input.end();
    else if (reason === "input-error") input.emit("error", new Error("secret input contents"));
    else if (reason === "output-error") output.emit("error", new Error("secret output contents"));
    else await sleep(50);
    const error = await pending;
    assert.match(error.message, /CODEX_HOST_DISCONNECTED/u);
    assert.equal(error.reason, reason);
    assert.equal(bridge.metrics().disconnect.reason, reason);
    assert.equal(JSON.stringify(bridge.metrics()).includes("secret"), false);
    bridge.close();
  });
}

test("fragment replay preserves one response and rejects missing, reordered or conflicting data", async () => {
  const input = new PassThrough(), output = new PassThrough(), messages = [];
  output.on("data", chunk => messages.push(JSON.parse(chunk.toString().trim().replace(/^workflow-host /u, ""))));
  const bridge = createCodexHostBridge({ input, output });
  try {
    const pending = bridge.call("mcp__codex_app__list_projects", {});
    const id = messages.at(-1).id, response = { id, result: { text: "漢字😀 ".repeat(500) } };
    const body = JSON.stringify(response), split = Math.floor(body.length / 2);
    const chunks = [body.slice(0, split), body.slice(split)];
    const send = (index, changes = {}) => input.write(JSON.stringify({ responseChunk: { id, index, count: 2, length: body.length, data: chunks[index], ...changes } }) + "\n");
    send(1);
    assert.equal(messages.at(-1).type, "input-error");
    send(0);
    send(0);
    send(0, { data: chunks[0].replace("result", "differ") });
    assert.equal(messages.at(-1).type, "input-error");
    input.write(JSON.stringify({ inspectRequests: true, requestIds: [id] }) + "\n");
    assert.equal(messages.at(-1).state, "pending", "a partial response is never accepted");
    send(1);
    assert.deepEqual(await pending, response.result);
    assert.equal(messages.at(-1).type, "response-accepted");
    send(0); send(1);
    assert.equal(messages.at(-1).type, "response-accepted", "the original completed response may be acknowledged again");
    input.write('{bad-secret-payload}\n');
    assert.equal(JSON.stringify(messages).includes("bad-secret-payload"), false);
  } finally { bridge.close(); }
});

test("buffered host heartbeat survives a synchronous bridge stall within the bounded confirmation grace", async () => {
  const bridgeUrl = new URL("../../skills/personal/run-issue-workflow/scripts/codex-host-bridge.mjs", import.meta.url).href;
  const source = `import { createCodexHostBridge } from ${JSON.stringify(bridgeUrl)};
    const bridge = createCodexHostBridge({ idleTimeoutMs: 100 });
    bridge.call('mcp__codex_app__list_projects', {}).catch(error => console.log('OUTCOME ' + error.message));
    console.log('BLOCKING');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    setTimeout(() => { console.log('DISCONNECTED ' + bridge.disconnected); bridge.close(); }, 30);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], { stdio: ["pipe", "pipe", "pipe"] });
  let output = "", sent = false;
  child.stdout.on("data", data => {
    output += data;
    if (!sent && output.includes("BLOCKING")) { sent = true; child.stdin.write('{"heartbeat":true}\n'); }
  });
  child.stderr.on("data", data => { output += data; });
  const code = await new Promise((resolve, reject) => { child.on("exit", resolve); child.on("error", reject); });
  assert.equal(code, 0, output);
  assert.equal(sent, true);
  assert.match(output, /DISCONNECTED false/u, "stdin already buffered during synchronous Git/tool work must get bounded time to reach readline");
});

test("settled requests retain duplicate/conflict evidence without retaining native payloads", async () => {
  const input = new PassThrough(), output = new PassThrough(), messages = [];
  output.on("data", chunk => messages.push(JSON.parse(chunk.toString().trim().replace(/^workflow-host /u, ""))));
  const bridge = createCodexHostBridge({ input, output });
  try {
    const pending = bridge.call("mcp__codex_app__send_message_to_thread", { threadId: "task", prompt: "secret-payload" });
    const request = messages.at(-1), response = { id: request.id, result: { accepted: true, secret: "native-secret" } };
    input.write(JSON.stringify(response) + "\n");
    await pending;
    input.write(JSON.stringify({ settleRequests: [request.id] }) + "\n");
    await new Promise(resolve => setImmediate(resolve));

    const metrics = bridge.metrics();
    assert.equal(metrics.settledRequests, 1);
    assert.equal(metrics.retainedSettledPayloadBytes, 0);
    assert.equal(JSON.stringify(metrics).includes("secret"), false);
    input.write(JSON.stringify(response) + "\n");
    assert.equal(messages.at(-1).type, "response-accepted");
    input.write(JSON.stringify({ ...response, result: { accepted: false } }) + "\n");
    assert.equal(messages.at(-1).type, "input-error");
  } finally { bridge.close(); }
});

test("settled bridge receipts have a fixed retention bound and evicted responses fail closed", async () => {
  const input = new PassThrough(), output = new PassThrough(), messages = [];
  output.on("data", chunk => messages.push(JSON.parse(chunk.toString().trim().replace(/^workflow-host /u, ""))));
  const bridge = createCodexHostBridge({ input, output, settledReceiptLimit: 2 });
  const responses = [];
  try {
    for (let index = 0; index < 3; index += 1) {
      const pending = bridge.call("mcp__codex_app__list_threads", { limit: index + 1 });
      const request = messages.at(-1), response = { id: request.id, result: { index } };
      responses.push(response);
      input.write(`${JSON.stringify(response)}\n`);
      await pending;
      input.write(`${JSON.stringify({ settleRequests: [request.id] })}\n`);
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.deepEqual(bridge.metrics(), { toolCalls: 3, elapsedMs: bridge.metrics().elapsedMs, tokens: "unavailable",
      settledRequests: 3, retainedSettledReceipts: 2, retainedSettledPayloadBytes: 0 });
    input.write(`${JSON.stringify(responses[0])}\n`);
    assert.equal(messages.at(-1).type, "input-error", "an evicted duplicate is rejected rather than accepted or replayed");
    input.write(`${JSON.stringify(responses[2])}\n`);
    assert.equal(messages.at(-1).type, "response-accepted", "the bounded recent window keeps exact duplicate evidence");
    input.write(`${JSON.stringify({ ...responses[2], result: { index: 99 } })}\n`);
    assert.equal(messages.at(-1).type, "input-error", "the bounded recent window keeps conflicting-response evidence");
  } finally { bridge.close(); }
});
