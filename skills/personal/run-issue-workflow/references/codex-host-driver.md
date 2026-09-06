# Active Codex host driver

Read only after the human explicitly starts the selected Run, including its Issue tasks and later messages to those tasks. The entry itself verifies producer handoff and scope before requesting a task. This driver calls only the current task's available desktop tools; it is not an App Server client or a daemon.

Launch the installed `scripts/installed-entry.mjs <consumer-repository> [Spec-ID or comma-separated Spec batch] [Run-ID]` through `tools.exec_command` with `tty:true`, `yield_time_ms:1000`, and the consumer as `workdir`. Shell-quote each path or ID. Save its `session_id` and `output` using `store("workflow.host", {sessionId: result.session_id, buffer: result.output})`. Always preserve the session for subsequent ticks; do not launch a second coordinator while it is active.

Run the driver below in one active `functions.exec` cell. It yields after each bounded tick; use `functions.wait` to collect progress from that same cell while doing independent work. Full tool payloads remain transport data and are not reprinted into the coordinator context. For batches, set `workflow.control` to `{control: "PAUSE", runId: "<exact-Run-ID>"}` (likewise Resume, Stop or Refresh). An unqualified batch control is rejected. A single-Run text control is set with `store("workflow.control", "PAUSE")` (or `RESUME`, `STOP`, `REFRESH`) before the next heartbeat. Keep this cell active while the host session exists and report meaningful progress at least once a minute. A pending native tool call receives heartbeats too: a slow read is not evidence that the coordinator disconnected. Each request is forwarded once and its actual result retains the original request ID. If the app or coordinator disconnects, the entry stops dispatching and releases its writer after 90 seconds without a heartbeat. Worker tasks may still finish their already-dispatched work.

The current host accepts at most 50 non-pinned tasks in `list_threads`. The driver bounds that read-only parameter for retained versions that requested more. It does not change Run identity, task creation, or evidence; an unresolved creation intent still prevents a duplicate task.

```js
const allowed = new Set([
  "mcp__codex_app__list_projects", "mcp__codex_app__list_threads",
  "mcp__codex_app__create_thread", "mcp__codex_app__read_thread",
  "mcp__codex_app__wait_threads", "mcp__codex_app__send_message_to_thread",
  "mcp__codex_app__open_in_codex",
]);
const report = (message) => {
  if (message.type !== "status") { text(message); return; }
  const status = message.status;
  text({type: "status", run: status.run, nodes: status.nodes,
    actions: status.legalActions?.map(({type, issueId}) => ({type, issueId})),
    diagnoses: status.diagnoses});
};
async function tick() {
  const lane = load("workflow.host");
  if (!lane?.sessionId) throw new Error("No active installed workflow session");
  const accept = (result) => {
    lane.buffer += result.output ?? "";
    if (result.exit_code !== undefined) lane.sessionId = null;
    store("workflow.host", lane);
  };
  const heartbeat = async () => {
    if (!lane.sessionId) return;
    const control = load("workflow.control");
    store("workflow.control", null);
    const message = control ? (typeof control === "string" ? {control} : control) : {heartbeat:true};
    accept(await tools.write_stdin({session_id: lane.sessionId,
      chars: JSON.stringify(message) + "\n", yield_time_ms:1000, max_output_tokens:16000}));
  };
  const callHost = async (name, args) => {
    const pending = Promise.resolve().then(() => tools[name](args))
      .then(result => ({settled:true, result}), error => ({settled:true, error}));
    while (true) {
      let timer;
      const outcome = await Promise.race([pending, new Promise(resolve => {
        timer = setTimeout(() => resolve({settled:false}), 15000);
      })]);
      clearTimeout(timer);
      if (outcome.settled) {
        if (Object.hasOwn(outcome, "error")) throw outcome.error;
        return outcome.result;
      }
      await heartbeat();
      if (!lane.sessionId) throw new Error("Host exited while native request was pending; preserve its identity");
    }
  };
  await heartbeat();
  const until = Date.now() + 35000;
  while ((lane.sessionId || lane.buffer.includes("\n")) && (Date.now() < until || !lane.sessionId)) {
    const newline = lane.buffer.indexOf("\n");
    if (newline < 0) {
      accept(await tools.write_stdin({session_id:lane.sessionId, chars:"", yield_time_ms:1000, max_output_tokens:16000}));
      continue;
    }
    const line = lane.buffer.slice(0,newline).replace(/\r$/u,"");
    lane.buffer = lane.buffer.slice(newline+1);
    if (!line.startsWith("workflow-host ")) { if (line.trim()) text({transport:line}); continue; }
    const message = JSON.parse(line.slice("workflow-host ".length));
    if (message.type !== "tool") { report(message); continue; }
    if (!lane.sessionId) { text({unansweredRequest:message.id, reason:"Host process exited"}); continue; }
    if (!allowed.has(message.name) || typeof tools[message.name] !== "function") {
      throw new Error("Installed host requested an unavailable or unsupported tool");
    }
    const args = message.name === "mcp__codex_app__list_threads" && message.arguments.limit > 50
      ? {...message.arguments, limit:50} : message.arguments;
    let response;
    try { response = {id:message.id, result:await callHost(message.name, args)}; }
    catch (error) { response = {id:message.id, error:error.message}; }
    if (lane.sessionId) accept(await tools.write_stdin({session_id:lane.sessionId,
      chars:JSON.stringify(response)+"\n", yield_time_ms:1000, max_output_tokens:16000}));
  }
  store("workflow.host", lane);
  text({active:Boolean(lane.sessionId)});
}
if (!load("workflow.host")?.sessionId) throw new Error("No active installed workflow session");
while (load("workflow.host")?.sessionId) {
  await tick();
  await yield_control();
}
```

On a human pause, submit `PAUSE` for each selected Run through the active cell and read back the control result before ending the driver when possible. If the cell is interrupted first, stop driving that session; the existing disconnect timeout preserves the Runs. Already accepted worker work may finish. Retain the exact session and Run identities for reconciliation, and never start another coordinator while the previous process remains active.

When the process exits, consume any remaining complete `workflow-host` lines in its buffer and report its exact terminal result. `error` or `UNAVAILABLE` is not completion. Keep Run and task IDs for the next invocation; the entry selects the recorded package before resuming. Do not renew a stopped Run or grant new scope through a text control.
