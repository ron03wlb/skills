import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { createCodexHostBridge } from "../../skills/personal/run-issue-workflow/scripts/codex-host-bridge.mjs";

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
