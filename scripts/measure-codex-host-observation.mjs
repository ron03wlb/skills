import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { performance } from "node:perf_hooks";
import { runInNewContext } from "node:vm";

import { createCodexHostBridge } from "../skills/personal/run-issue-workflow/scripts/codex-host-bridge.mjs";
import { createCodexWorkflowTasks } from "../skills/personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs";

const startedAt = performance.now();
const heapBefore = process.memoryUsage().heapUsed;
const driverSource = readFileSync(new URL("../skills/personal/run-issue-workflow/scripts/codex-host-driver.js", import.meta.url), "utf8");
const driver = runInNewContext(driverSource);

const lane = driver.createLane({ sessionId: 85 });
lane.requests = Array.from({ length: 32 }, (_, index) => ({
  id: `request-${index}`,
  request: { name: "mcp__codex_app__read_thread" },
  state: "forwarded",
  history: ["received", "dispatched", "returned", "forwarding", "forwarded"],
}));
const checkpoint = driver.checkpointState(lane);
const checkpointBody = JSON.stringify(checkpoint);
const stringifySamples = [];
for (let index = 0; index < 1000; index += 1) {
  const sampleStartedAt = performance.now();
  JSON.stringify(checkpoint);
  stringifySamples.push(performance.now() - sampleStartedAt);
}
stringifySamples.sort((left, right) => left - right);

const input = new PassThrough();
const output = new PassThrough();
const messages = [];
output.on("data", chunk => {
  for (const line of chunk.toString().trim().split(/\r?\n/u)) {
    if (line) messages.push(JSON.parse(line.replace(/^workflow-host /u, "")));
  }
});
const bridge = createCodexHostBridge({ input, output });
for (let index = 0; index < 32; index += 1) {
  const pending = bridge.call("mcp__codex_app__send_message_to_thread", {
    threadId: `task-${index}`,
    prompt: "bounded-fixture-".repeat(512),
  });
  const request = messages.at(-1);
  input.write(`${JSON.stringify({ id: request.id, result: { accepted: true } })}\n`);
  await pending;
  input.write(`${JSON.stringify({ settleRequests: [request.id] })}\n`);
}
await new Promise(resolve => setImmediate(resolve));
const bridgeMetrics = bridge.metrics();
bridge.close();

const refs = Array.from({ length: 9 }, (_, index) => ({ threadId: `worker-${index + 1}`, hostId: "local" }));
let waitCalls = 0;
const observedBatches = [];
const tasks = createCodexWorkflowTasks({ project: {}, packageRoot: "/measurement", host: {
  async call(name, args) {
    if (!name.endsWith("wait_threads")) throw new Error(`Unexpected measurement call ${name}`);
    waitCalls += 1;
    observedBatches.push(args.targets);
    return { timedOut: true, polls: args.targets.map(target => ({
      threadId: target.threadId,
      cursor: `cursor-${target.threadId}-${waitCalls}`,
      status: "running",
      event: "unchanged",
    })) };
  },
} });
const taskObservations = [];
for (let index = 0; index < 3; index += 1) taskObservations.push((await tasks.wait(refs)).observation);

const heapAfter = process.memoryUsage().heapUsed;
const result = {
  schema: "codex-host-observation-measurement:v1",
  platform: `${process.platform}-${process.arch}`,
  runtime: process.version,
  workload: { checkpointRequests: 32, settledBridgeRequests: 32, taskRefs: refs.length, eventWaits: waitCalls },
  driver: {
    checkpointBytes: Buffer.byteLength(checkpointBody),
    stringifySamples: stringifySamples.length,
    meanStringifyMs: Number((stringifySamples.reduce((sum, value) => sum + value, 0) / stringifySamples.length).toFixed(4)),
    p95StringifyMs: Number(stringifySamples[Math.floor(stringifySamples.length * 0.95)].toFixed(4)),
  },
  bridge: bridgeMetrics,
  taskObservation: {
    maximumBatchSize: Math.max(...observedBatches.map(batch => batch.length)),
    rotatedPastFirstBatch: observedBatches[1]?.[0]?.threadId === "worker-9",
    cursorReuseObserved: observedBatches.slice(1).some(batch => batch.some(target => typeof target.afterCursor === "string")),
    nativeCalls: taskObservations.reduce((sum, item) => sum + item.nativeCalls, 0),
    returnedBytes: taskObservations.reduce((sum, item) => sum + item.returnedBytes, 0),
    fullHistoryReads: taskObservations.reduce((sum, item) => sum + item.fullHistoryReads, 0),
    modelRoundTrips: "unavailable",
    tokens: "unavailable",
  },
  heapDeltaBytes: heapAfter - heapBefore,
  actualElapsedMs: Number((performance.now() - startedAt).toFixed(2)),
  timingCoverage: {
    deterministicVirtualBackoff: "covered by focused tests",
    realWindowsLongSoak: "not performed",
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
