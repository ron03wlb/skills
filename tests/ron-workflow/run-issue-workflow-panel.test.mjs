import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  createRunPanelControl,
  startRunPanelBridge,
} from "../../skills/personal/run-issue-workflow/scripts/run-panel-bridge.mjs";
import {
  renderRunPanel,
  statusDigest,
} from "../../skills/personal/run-issue-workflow/scripts/run-panel.mjs";

const status = ({
  state = "RUNNING",
  controlRevision = 0,
  controlCommand = null,
  controlRequestId = null,
  controlRequestRevision = null,
  controlRequestCommand = null,
  nodes = [],
} = {}) => ({
  schema: "dag-run-status:v1",
  run: {
    runId: "run-16",
    specId: "12",
    state,
    controlRevision,
    controlCommand,
    controlRequestId,
    controlRequestRevision,
    controlRequestCommand,
  },
  nodes,
  frontier: { ready: [], active: [], closeable: [] },
  legalActions: [],
  legalControls: ["PAUSE", "STOP", "REFRESH"],
  diagnoses: [],
});

test("panel controls append one revisioned event and make duplicates read-only", async () => {
  let current = status();
  const appended = [];
  const submit = createRunPanelControl({
    readStatus: () => current,
    appendEvent: (event) => appended.push(event),
    rebuildStatus: () => {
      current = status({ state: "PAUSING", controlRevision: 1, controlCommand: "PAUSE" });
      return current;
    },
    now: () => "2026-08-30T01:00:00.000Z",
  });

  assert.deepEqual(await submit("PAUSE"), {
    accepted: true,
    changed: true,
    revision: 1,
    status: current,
  });
  assert.deepEqual(appended, [{
    type: "control.revised",
    at: "2026-08-30T01:00:00.000Z",
    revision: 1,
    command: "PAUSE",
  }]);

  assert.deepEqual(await submit("PAUSE"), {
    accepted: true,
    changed: false,
    revision: 1,
    status: current,
  });
  assert.equal(appended.length, 1);

  assert.deepEqual(await submit("START"), {
    accepted: false,
    changed: false,
    revision: 1,
    reason: "unsupported_control",
    status: current,
  });
  assert.equal(appended.length, 1);
});

test("text controls bind their original request ID to the durable revision", async () => {
  let current = status();
  const appended = [];
  const submit = createRunPanelControl({ readStatus: () => current, appendEvent: event => appended.push(event),
    rebuildStatus: () => { const latest = appended.at(-1); current = status({ state: "PAUSING",
      controlRevision: latest.revision, controlCommand: "PAUSE", controlRequestId: latest.requestId,
      controlRequestRevision: latest.requestRevision ?? latest.revision, controlRequestCommand: latest.command }); return current; },
    now: () => "2026-09-10T00:00:00.000Z" });
  await submit("PAUSE", { id: "control-1", revision: 1 });
  assert.equal(appended[0].requestId, "control-1");
  const replay = await submit("PAUSE", { id: "control-1", revision: 1 });
  assert.equal(replay.reconciled, true);
  assert.equal(replay.changed, false);
  assert.equal(appended.length, 1);
  const idempotent = await submit("PAUSE", { id: "control-2", revision: 2 });
  assert.equal(appended[1].requestId, "control-2");
  assert.equal(appended[1].type, "control.reconciled");
  assert.equal(appended[1].revision, 1);
  assert.equal(appended[1].requestRevision, 2);
  assert.equal(idempotent.changed, false);
  assert.equal(idempotent.reconciled, true);
  const repeatedIdempotent = await submit("PAUSE", { id: "control-2", revision: 2 });
  assert.equal(repeatedIdempotent.reconciled, true);
  assert.equal(appended.length, 2);
});

test("text control revision is checked inside the serialized journal owner", async () => {
  let current = status({ state: "PAUSING", controlRevision: 1, controlCommand: "PAUSE" });
  const appended = [];
  const submit = createRunPanelControl({ readStatus: () => current, appendEvent: event => appended.push(event),
    rebuildStatus: () => { throw new Error("stale control must not rebuild state"); },
    now: () => "2026-09-10T00:00:00.000Z" });
  const result = await submit("STOP", { id: "control-before-pause", revision: 1 });
  assert.equal(result.reason, "stale_control_revision");
  assert.equal(result.revision, 1);
  assert.deepEqual(appended, []);
});

test("panel controls serialize concurrent duplicates and reject out-of-state commands", async () => {
  let current = status();
  const appended = [];
  const submit = createRunPanelControl({
    readStatus: () => current,
    appendEvent: async (event) => appended.push(event),
    rebuildStatus: () => {
      current = status({ state: "PAUSING", controlRevision: 1, controlCommand: "PAUSE" });
      return current;
    },
    now: () => "2026-08-30T01:00:00.000Z",
  });

  const results = await Promise.all([submit("PAUSE"), submit("PAUSE")]);
  assert.deepEqual(results.map(({ changed, revision }) => ({ changed, revision })), [
    { changed: true, revision: 1 },
    { changed: false, revision: 1 },
  ]);
  assert.equal(appended.length, 1);

  current = status({ state: "SUCCEEDED", controlRevision: 1, controlCommand: "PAUSE" });
  assert.deepEqual(await submit("STOP"), {
    accepted: false,
    changed: false,
    revision: 1,
    reason: "illegal_control",
    status: current,
  });
  assert.equal(appended.length, 1);
});

test("bridge is loopback-only, token-authenticated, and exposes a fixed route allowlist", async (t) => {
  let snapshot = status();
  let statusReads = 0;
  const submitted = [];
  const bridge = await startRunPanelBridge({
    readStatus: () => {
      statusReads += 1;
      return snapshot;
    },
    submitControl: async (command, identity) => {
      submitted.push({ command, identity });
      return { accepted: true, changed: true, revision: 1, status: snapshot };
    },
    renderPanel: (value) => `<!doctype html><title>${value.run.runId}</title>`,
  });
  t.after(() => bridge.close());

  assert.equal(bridge.address.address, "127.0.0.1");
  assert.ok(bridge.address.port > 0);
  assert.match(bridge.token, /^[A-Za-z0-9_-]{40,}$/u);
  assert.equal(JSON.stringify(snapshot).includes(bridge.token), false);

  const missing = await fetch(`${bridge.origin}/api/status`);
  assert.equal(missing.status, 401);
  const wrong = await fetch(`${bridge.origin}/api/status`, {
    headers: { authorization: "Bearer wrong" },
  });
  assert.equal(wrong.status, 401);

  const panel = await fetch(bridge.panelUrl);
  assert.equal(panel.status, 200);
  assert.equal((await panel.text()).includes(bridge.token), false);

  const authenticated = { authorization: `Bearer ${bridge.token}` };
  const controlHeaders = (id) => ({ ...authenticated, "x-workflow-control-id": id,
    "x-workflow-control-revision": "1" });
  const current = await fetch(`${bridge.origin}/api/status`, { headers: authenticated });
  assert.equal(current.status, 200);
  assert.deepEqual(await current.json(), snapshot);
  const originalEtag = current.headers.get("etag");
  assert.equal(originalEtag, `"${statusDigest(snapshot)}"`);
  assert.equal(submitted.length, 0);

  const unchanged = await fetch(`${bridge.origin}/api/status`, {
    headers: { ...authenticated, "if-none-match": originalEtag },
  });
  assert.equal(unchanged.status, 304);
  assert.equal(submitted.length, 0);

  snapshot = status({ nodes: [{ issueId: "16", blockers: [], state: "EXECUTING" }] });
  const progressed = await fetch(`${bridge.origin}/api/status`, {
    headers: { ...authenticated, "if-none-match": originalEtag },
  });
  assert.equal(progressed.status, 200);
  assert.notEqual(progressed.headers.get("etag"), originalEtag);
  assert.equal(snapshot.run.controlRevision, 0);
  assert.equal(submitted.length, 0);

  const pause = await fetch(`${bridge.origin}/api/control/pause`, {
    method: "POST",
    headers: controlHeaders("panel-pause"),
  });
  assert.equal(pause.status, 200);
  assert.equal((await pause.json()).revision, 1);
  assert.deepEqual(submitted, [{ command: "PAUSE", identity: { id: "panel-pause", revision: 1 } }]);

  for (const [route, command] of [["resume", "RESUME"], ["stop", "STOP"]]) {
    const response = await fetch(`${bridge.origin}/api/control/${route}`, {
      method: "POST",
      headers: controlHeaders(`panel-${route}`),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).revision, 1);
    assert.deepEqual(submitted.at(-1), { command, identity: { id: `panel-${route}`, revision: 1 } });
  }

  const wrongMethod = await fetch(`${bridge.origin}/api/control/pause`, { headers: authenticated });
  assert.equal(wrongMethod.status, 404);

  const start = await fetch(`${bridge.origin}/api/control/start`, {
    method: "POST",
    headers: authenticated,
  });
  assert.equal(start.status, 404);
  assert.deepEqual(submitted.map(item => item.command), ["PAUSE", "RESUME", "STOP"]);

  const noIdentity = await fetch(`${bridge.origin}/api/control/pause`, {
    method: "POST",
    headers: authenticated,
  });
  assert.equal(noIdentity.status, 400);

  const body = await fetch(`${bridge.origin}/api/control/stop`, {
    method: "POST",
    headers: { ...controlHeaders("panel-body"), "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(body.status, 413);
  assert.deepEqual(submitted.map(item => item.command), ["PAUSE", "RESUME", "STOP"]);
  assert.ok(statusReads >= 4);
});

test("bridge shutdown changes no Run state", async () => {
  const snapshot = status();
  let reads = 0;
  let controls = 0;
  const bridge = await startRunPanelBridge({
    readStatus: () => {
      reads += 1;
      return snapshot;
    },
    submitControl: () => {
      controls += 1;
    },
    renderPanel: () => "<!doctype html><title>Run</title>",
  });

  await bridge.close();
  await bridge.close();
  assert.equal(reads, 0);
  assert.equal(controls, 0);
});

test("renderer projects the complete Run, DAG, task, close, and diagnosis snapshot", () => {
  const snapshot = {
    schema: "dag-run-status:v1",
    run: {
      runId: "run-<16>",
      specId: "12",
      approvedScopeHash: "scope-abc",
      target: "features/ron",
      classification: "Multi-Issue",
      decompositionIdentity: "12/04",
      state: "STOPPING",
      maxParallel: 3,
      controlRevision: 4,
      controlCommand: "STOP",
    },
    nodes: [{
      issueId: "16",
      blockers: ["13"],
      state: "BLOCKED",
      task: {
        ref: { threadId: "thread-16", hostId: "local" },
        state: "EXECUTING",
        attempt: 2,
        retryCount: 1,
        remediationCount: 1,
      },
      close: {
        completionState: "COMPLETE",
        candidateReachable: true,
        worktreeState: "PRESENT",
        trackerState: "OPEN",
      },
    }],
    frontier: { ready: ["17"], active: ["16"], closeable: ["15"] },
    legalActions: [],
    legalControls: ["STOP", "REFRESH"],
    diagnoses: [{
      reasonCode: "stopped_by_user",
      limitationClass: "instance-blocker",
      evidence: ["Grant revoked; no process was killed <exact>."],
      attemptedRecovery: ["workers allowed to settle", { adapter: "gradle-loopback-safe", cycle: 1 }],
      retryCount: 2,
      noAutomaticTransition: "Await explicit recovery.",
      affectedNodes: ["16"],
      unaffectedNodes: ["17"],
      nextOwner: "human",
      resumePredicates: ["new Grant is valid"],
    }],
  };
  const html = renderRunPanel(snapshot);

  assert.match(html, /run-&lt;16&gt;/u);
  assert.match(html, /data-run-id="run-&lt;16&gt;"/u);
  assert.match(html, /data-control-revision="4"/u);
  assert.match(html, /sessionStorage/u);
  assert.match(html, /x-workflow-control-id/u);
  assert.match(html, /x-workflow-control-revision/u);
  assert.match(html, /STOPPING/u);
  assert.match(html, /12\/04/u);
  assert.match(html, /#13.*→.*#16/su);
  assert.match(html, /thread-16/u);
  assert.match(html, /Attempts<\/dt><dd>2<\/dd>/u);
  assert.match(html, /Retries<\/dt><dd>1<\/dd>/u);
  assert.match(html, /Remediations<\/dt><dd>1<\/dd>/u);
  assert.match(html, /Candidate reachable<\/dt><dd>Yes<\/dd>/u);
  assert.match(html, /Ready.*#17/su);
  assert.match(html, /Running.*#16/su);
  assert.match(html, /Blocked.*#16/su);
  assert.match(html, /Closeable.*#15/su);
  assert.match(html, /Grant revoked; no process was killed &lt;exact&gt;\./u);
  assert.match(html, /\{&quot;adapter&quot;:&quot;gradle-loopback-safe&quot;,&quot;cycle&quot;:1\}/u);
  assert.match(html, /Affected.*#16/su);
  assert.match(html, /Unaffected.*#17/su);
  assert.match(html, /Next owner.*human/su);
  assert.match(html, /Resume predicates.*new Grant is valid/su);
  assert.match(html, /data-control="STOP"/u);
  assert.doesNotMatch(html, /data-control="PAUSE"/u);
  assert.match(html, /Bridge unreachable — displayed snapshot is stale\./u);
  assert.doesNotMatch(html, /<script>Grant revoked/u);
  assert.match(html, new RegExp(`data-status-digest="${statusDigest(snapshot)}"`, "u"));
});

test("renderer accepts representative lifecycle snapshots", () => {
  for (const stateName of ["RUNNING", "PAUSED", "BLOCKED", "STOPPED", "SUCCEEDED"]) {
    const html = renderRunPanel(status({ state: stateName }));
    assert.match(html, new RegExp(`<span class="state">${stateName}</span>`, "u"));
  }
});

test("documented terminal and diagnosed status examples stay renderable and token-free", () => {
  for (const [name, state] of [["status-succeeded", "SUCCEEDED"], ["status-diagnosed", "BLOCKED"]]) {
    const path = new URL(`../../skills/personal/run-issue-workflow/examples/${name}.json`, import.meta.url);
    const source = readFileSync(path, "utf8");
    const example = JSON.parse(source);
    assert.equal(example.schema, "dag-run-status:v1");
    assert.equal(example.run.state, state);
    assert.doesNotMatch(source, /token/iu);
    assert.match(renderRunPanel(example), new RegExp(`<span class="state">${state}</span>`, "u"));
  }
});
