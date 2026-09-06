# Active Codex host driver

Read only after the human explicitly starts the selected Run, including its Issue tasks and later messages to those tasks. The entry itself verifies producer handoff and scope before requesting a task. This driver calls only the current task's available desktop tools; it is not an App Server client or a daemon.

Launch the installed `scripts/installed-entry.mjs <consumer-repository> [Spec-ID] [Run-ID]` through `tools.exec_command` with `tty:true`, `yield_time_ms:1000`, and the consumer as `workdir`. Shell-quote each path or ID. Save its `session_id` and `output` using `store("workflow.host", {sessionId: result.session_id, buffer: result.output})`. Always preserve the session for subsequent ticks; do not launch a second coordinator while it is active.

Run this unchanged tick in `functions.exec`. It returns compact status only; full tool payloads remain transport data and are not reprinted into the coordinator context. An explicit text control is set with `store("workflow.control", "PAUSE")` (or `RESUME`, `STOP`, `REFRESH`) before the next tick. Continue ticks while the host session exists, reporting meaningful progress at least once a minute. If the app or coordinator disconnects, the entry stops dispatching and releases its writer after 90 seconds without a heartbeat. Worker tasks may still finish their already-dispatched work.

```js
const lane = load("workflow.host");
if (!lane?.sessionId) throw new Error("No active installed workflow session");
const allowed = new Set([
  "mcp__codex_app__list_projects", "mcp__codex_app__list_threads",
  "mcp__codex_app__create_thread", "mcp__codex_app__read_thread",
  "mcp__codex_app__wait_threads", "mcp__codex_app__send_message_to_thread",
  "mcp__codex_app__open_in_codex",
]);
const accept = (result) => {
  lane.buffer += result.output ?? "";
  if (result.exit_code !== undefined) lane.sessionId = null;
};
const control = load("workflow.control");
store("workflow.control", null);
accept(await tools.write_stdin({session_id: lane.sessionId,
  chars: JSON.stringify(control ? {control} : {heartbeat:true}) + "\n",
  yield_time_ms: 1000, max_output_tokens: 16000}));
const until = Date.now() + 40000;
while ((lane.sessionId || lane.buffer.includes("\n")) && Date.now() < until) {
  const newline = lane.buffer.indexOf("\n");
  if (newline < 0) {
    accept(await tools.write_stdin({session_id:lane.sessionId, chars:"", yield_time_ms:1000, max_output_tokens:16000}));
    continue;
  }
  const line = lane.buffer.slice(0,newline).replace(/\r$/u,"");
  lane.buffer = lane.buffer.slice(newline+1);
  if (!line.startsWith("workflow-host ")) { if (line.trim()) text({transport:line}); continue; }
  const message = JSON.parse(line.slice("workflow-host ".length));
  if (message.type !== "tool") { text(message); continue; }
  if (!allowed.has(message.name) || typeof tools[message.name] !== "function") {
    throw new Error("Installed host requested an unavailable or unsupported tool");
  }
  let response;
  try { response = {id:message.id,result:await tools[message.name](message.arguments)}; }
  catch (error) { response = {id:message.id,error:error.message}; }
  accept(await tools.write_stdin({session_id:lane.sessionId, chars:JSON.stringify(response)+"\n", yield_time_ms:1000, max_output_tokens:16000}));
}
store("workflow.host", lane);
text({active:Boolean(lane.sessionId)});
```

When the process exits, consume any remaining complete `workflow-host` lines in its buffer and report its exact terminal result. `error` or `UNAVAILABLE` is not completion. Keep Run and task IDs for the next invocation; the entry selects the recorded package before resuming. Do not renew a stopped Run or grant new scope through a text control.
