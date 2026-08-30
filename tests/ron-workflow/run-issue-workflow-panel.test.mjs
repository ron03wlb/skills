import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createRunPanelControl,
  startRunPanelBridge,
} from "../../skills/personal/run-issue-workflow/scripts/run-panel-bridge.mjs";
import { renderRunPanel } from "../../skills/personal/run-issue-workflow/scripts/run-panel.mjs";

const status = ({
  state = "RUNNING",
  controlRevision = 0,
  controlCommand = null,
} = {}) => ({
  schema: "dag-run-status:v1",
  run: {
    runId: "run-16",
    specId: "12",
    state,
    controlRevision,
    controlCommand,
  },
  nodes: [],
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

test("bridge is loopback-only, token-authenticated, and exposes a fixed route allowlist", async (t) => {
  const snapshot = status();
  const submitted = [];
  const bridge = await startRunPanelBridge({
    readStatus: () => snapshot,
    submitControl: async (command) => {
      submitted.push(command);
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
  const current = await fetch(`${bridge.origin}/api/status`, { headers: authenticated });
  assert.equal(current.status, 200);
  assert.deepEqual(await current.json(), snapshot);

  const pause = await fetch(`${bridge.origin}/api/control/pause`, {
    method: "POST",
    headers: authenticated,
  });
  assert.equal(pause.status, 200);
  assert.equal((await pause.json()).revision, 1);
  assert.deepEqual(submitted, ["PAUSE"]);

  const start = await fetch(`${bridge.origin}/api/control/start`, {
    method: "POST",
    headers: authenticated,
  });
  assert.equal(start.status, 404);
  assert.deepEqual(submitted, ["PAUSE"]);

  const body = await fetch(`${bridge.origin}/api/control/stop`, {
    method: "POST",
    headers: { ...authenticated, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(body.status, 413);
  assert.deepEqual(submitted, ["PAUSE"]);
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
  const html = renderRunPanel({
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
      attemptedRecovery: ["workers allowed to settle"],
      retryCount: 2,
      noAutomaticTransition: "Await explicit recovery.",
      affectedNodes: ["16"],
      unaffectedNodes: ["17"],
      nextOwner: "human",
      resumePredicates: ["new Grant is valid"],
    }],
  });

  assert.match(html, /run-&lt;16&gt;/u);
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
  assert.match(html, /Affected.*#16/su);
  assert.match(html, /Unaffected.*#17/su);
  assert.match(html, /Next owner.*human/su);
  assert.match(html, /Resume predicates.*new Grant is valid/su);
  assert.match(html, /data-control="STOP"/u);
  assert.doesNotMatch(html, /data-control="PAUSE"/u);
  assert.match(html, /Bridge unreachable — displayed snapshot is stale\./u);
  assert.doesNotMatch(html, /<script>Grant revoked/u);
});
