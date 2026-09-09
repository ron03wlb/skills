# Active Codex host driver

Use after the human starts the selected Run. The installed entry owns authority, task creation and Run reconciliation. This driver only forwards its requests through the current task's available tools. Keep the selected immutable package for the whole session.

## Load and drive

Load the verified package's `scripts/codex-host-driver.js` **before** launching the installed entry, so initial requests receive prompt heartbeats. It is a dependency-free JavaScript expression, shared by the Node bridge and deterministic tests. The current `functions.exec` host provides `Function`, `load`, `store`, timers and tools; it provides no Node `process`, `require`, filesystem imports or URL global. Read the source through the available shell tool. Substitute the exact verified package path below; shell-quote it as a PowerShell literal.

```js
const loaded = await tools.exec_command({
  cmd: "Get-Content -Raw -LiteralPath '<verified-package>/skills/personal/run-issue-workflow/scripts/codex-host-driver.js'",
  max_output_tokens: 16000,
});
if (loaded.exit_code !== 0) throw new Error("Driver source unavailable; preserve the original Run");
store("workflow.driverSource", loaded.output);
const driverApi = new Function("return (\n" + loaded.output + "\n);")();
```

Before process launch, inspect `load("workflow.host")`. An active original session, active driver cell or unresolved native request requires that original owner to reconcile first. Keep its state; never overwrite it to start another coordinator. After confirmed process exit and original-owner reconciliation, archive that state under a distinct store key before the installed entry resumes the same Run. A startup/package failure uses [approved pre-Run maintenance](../../../../docs/agents/references/approved-pre-run-workflow-maintenance.md) only under its existing authority.

Launch the selected installed `scripts/installed-entry.mjs <consumer-repository> [Spec-ID or comma-separated Spec batch] [Run-ID]` with `tools.exec_command`, `tty:true`, `yield_time_ms:1000` and the consumer `workdir`. Shell-quote each argument. The entry owns raw-mode restoration. Immediately save the returned session and all output using `store("workflow.host", driverApi.createLane({sessionId: result.session_id, output: result.output, exit_code: result.exit_code}))`. If launch already exited without a session ID, preserve its entire result separately and parse its output with `driverApi.parseTransport(result.output, true)`; exit code alone proves no workflow completion.

In one active `functions.exec` cell, run:

```js
const api = new Function("return (\n" + load("workflow.driverSource") + "\n);")();
const driver = api.createDriver({
  driverId: "host-cell-" + Date.now(), tools, load, store, report: text, setTimeout, clearTimeout,
  persist: api.createCheckpointWriter({tools, path: "<absolute-Git-common-directory>/workflow-host/<original-session>.json"}),
  readControl: api.createControlReader({tools, path: "<absolute-Git-common-directory>/workflow-host/<original-session>-control.json"}),
});
await driver.run(yield_control);
```

Use one exact checkpoint path under the consumer Git common directory, unique to the original session. The writer uses available PowerShell file operations, waits for atomic publication before dispatch/forwarding, and fails closed on write errors. It stores only request/session identities, progress and pending-control metadata. Native arguments/results, panel URLs, raw frames and terminal payloads remain in the active cell: the existing bridge-token secret boundary also applies to checkpoint files.

Collect yields with `functions.wait` from that same cell. Keep it alive while its session or native Promise is pending; report meaningful progress at least once a minute. The tested implementation owns the allowlist, the host's 50-task read limit and bounded transport reads. A separate timer sends non-mutating heartbeats during native calls, durable checkpoint writes and control-file reads; physical stdin writes remain serialized. Native responses larger than 6,000 characters travel as ordered fragments under the original request ID. The bridge accepts only the complete matching count, length and identity, then acknowledges the reconstructed response. Responses above 16 MiB of characters retain their original outcome and require diagnosis instead of payload truncation. Tool payloads and raw malformed frames stay in stored state; summaries omit them.

## Controls and interrupted requests

An active `functions.exec` cell reads a snapshot of `store`; concurrent cells cannot update its controls. For the documented driver, write `{id:"<unique-control-ID>",control:"PAUSE",runId:"<exact-Run-ID>"}` to its exact control JSON file through the shell tool (likewise RESUME, STOP or REFRESH). The driver freshly reads that file each heartbeat and deduplicates the ID against its durable control history. Wait for the actual `control-result` before replacing it with another ID. Preserve the same ID on a write retry. Batch controls require the exact Run ID; a single Run may omit it. `workflow.control` remains available only to an embedding caller using the in-cell control adapter. The driver saves controls before consuming the queue and retains sending/returned states and actual control results. An uncertain control remains pending; reconcile the original Run status before deciding another action.

The driver preserves received, dispatched, returned, forwarding and acknowledged-forwarded states under each original request ID. It records state before dispatch or transport writes. The bridge acknowledges responses and answers read-only `inspectRequests` messages over the existing stdin transport. Pass `requestIds` for unresolved accepted receipts; the bridge also returns pending requests but never echoes all accepted history. Lost forwarding is reconciled against that original bridge: accepted results are acknowledged locally; a still-pending request permits redelivery of its saved result, including identical partial fragments, never another native call.

The current host does not retain an interrupted active cell's uncommitted `store` updates. After confirmed cell termination, load the exact disk checkpoint with the shell tool and save `api.restoreCheckpoint(JSON.parse(output))` as `workflow.host` before resuming. The restored driver queries the original bridge to recover request payloads; a saved returned state without its actual payload requires owner reconciliation. Omitted partial bytes stay observable as a count and require original-owner inspection, never synthetic workflow output.

After a driver cell is **confirmed stopped**, reuse the same session with a new driver instance and `driver.resume({previousDriverId, stoppedEvidence})`, naming the exact prior driver ID and observed stopped-cell evidence. An active or pending original cell must continue through `functions.wait`; a slow call is not evidence of disconnection. If its native outcome is uncertain, the driver preserves `dispatched` and reports `reconciliation-required`. Read the original task/creation intent/message or other owning evidence before supplying the recovered actual outcome through `await driver.reconcileNative({id, result, ownerEvidence:{requestId:id, observation}})` (or an observed `error`). Missing evidence cannot authorize replay. This interface records the caller's owner read-back; it cannot itself prove a native mutation did or did not occur. No automatic native retry or exactly-once delivery is claimed.

If the original coordinator exits or disconnects, retain its session, terminal result, native outcomes, malformed diagnostics and partial buffer. Drain final complete frames even after exit. `error`, `UNAVAILABLE`, disconnect and exit code alone are not completion. The entry stops dispatching and releases its writer after its existing 90-second heartbeat timeout; already-dispatched workers may finish. When synchronous repository work delays the event loop, the watchdog allows one I/O turn to consume an already-buffered heartbeat before confirming expiry. Errors and metrics distinguish `idle-timeout`, `input-eof`, `input-error` and `output-error` without copying native stream error payloads. A permanently stalled host tool or event loop is not repaired by this driver. The installed entry owns subsequent Run/package selection once the original coordinator and uncertain calls are reconciled.
