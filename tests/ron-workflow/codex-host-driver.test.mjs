import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

const markdown = readFileSync(new URL("../../skills/personal/run-issue-workflow/references/codex-host-driver.md", import.meta.url), "utf8");
const extract = text => text.replaceAll("\r\n", "\n").split("```js\n")[1].split("\n```")[0];
const Driver = Object.getPrototypeOf(async function () {}).constructor;

async function drive({ exitWhilePending = false, lineEnding = "\n" } = {}) {
  const source = extract(markdown.replaceAll("\r\n", "\n").replaceAll("\n", lineEnding));
  const request = { type: "tool", id: "exact-request", name: "mcp__codex_app__list_projects", arguments: {} };
  const values = new Map([["workflow.host", { sessionId: 42, buffer: `workflow-host ${JSON.stringify(request)}\n` }]]);
  const writes = [], output = [];
  let calls = 0;
  const result = { content: [{ type: "text", text: "actual native result" }] };
  const terminal = { type: "result", result: { state: "PRESERVED" } };
  const tools = {
    async mcp__codex_app__list_projects() {
      calls += 1;
      values.set("workflow.control", { control: "PAUSE", runId: "exact-run" });
      await sleep(35);
      return result;
    },
    async write_stdin({ session_id, chars }) {
      assert.equal(session_id, 42);
      if (chars) writes.push(JSON.parse(chars));
      const last = writes.at(-1);
      if (last?.id === request.id || exitWhilePending && calls && last?.control === "PAUSE") {
        return { output: `workflow-host ${JSON.stringify(terminal)}\n`, exit_code: 0 };
      }
      return { output: "" };
    },
  };
  await new Driver("tools", "load", "store", "text", "yield_control", "setTimeout", "clearTimeout", source)(
    tools, key => values.get(key), (key, value) => values.set(key, value), value => output.push(value), async () => {},
    (callback, milliseconds) => { assert.equal(milliseconds, 15000); return setTimeout(callback, 2); }, clearTimeout,
  );
  return { calls, writes, output, result, terminal, lane: values.get("workflow.host") };
}

for (const lineEnding of ["\n", "\r\n"]) {
test("documented driver keeps a slow native request alive, sends queued control and forwards its result once", async () => {
  const observed = await drive({ lineEnding });
  assert.equal(observed.calls, 1);
  assert.ok(observed.writes.filter(item => item.heartbeat).length > 1);
  assert.deepEqual(observed.writes.filter(item => item.control), [{ control: "PAUSE", runId: "exact-run" }]);
  assert.deepEqual(observed.writes.filter(item => item.id), [{ id: "exact-request", result: observed.result }]);
  assert.ok(observed.output.some(item => item === observed.terminal || JSON.stringify(item) === JSON.stringify(observed.terminal)));
  assert.equal(observed.lane.sessionId, null);
  assert.equal(observed.lane.buffer, "");
});

test("documented driver drains terminal output after host exit without replaying a pending native request", async () => {
  const observed = await drive({ exitWhilePending: true, lineEnding });
  assert.equal(observed.calls, 1);
  assert.deepEqual(observed.writes.filter(item => item.id), []);
  assert.ok(observed.output.some(item => item.type === "result" && item.result.state === "PRESERVED"));
  assert.equal(observed.lane.sessionId, null);
  assert.equal(observed.lane.buffer, "");
});

}
