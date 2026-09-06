import assert from "node:assert/strict";
import test from "node:test";
import { readPlanningBaseline } from "../../skills/engineering/to-spec/scripts/planning-entry.mjs";

const request = {
  repositoryId: "github:example/project", specId: "17", target: "main",
  approvedScopeIdentity: "scope:approved", trackerVersion: "v4", baseline: "a".repeat(40),
  relevantFacts: { "CONTEXT.md:Order": "an accepted order" }, acceptedChanges: [],
};
const observed = { ...request, head: "b".repeat(40) };
const adapter = (current = observed, lane = null) => ({
  readCurrent: async () => current,
  readLane: async () => { assert.ok(lane, "tracker-only work must not ask for a lane"); return lane; },
});

test("tracker-only revision reuses a compatible current baseline without a planning worktree", async () => {
  assert.deepEqual(await readPlanningBaseline({ request, adapter: adapter() }), {
    disposition: "COMPATIBLE", baseline: "b".repeat(40), requiresPlanningLane: false,
  });
});

test("a changed tracker version, scope, or target stops before publication", async () => {
  for (const field of ["repositoryId", "specId", "target", "approvedScopeIdentity", "trackerVersion"]) {
    await assert.rejects(readPlanningBaseline({ request, adapter: adapter({ ...observed, [field]: "other" }) }), new RegExp(field));
  }
  assert.deepEqual(await readPlanningBaseline({ request, adapter: adapter({ ...observed, relevantFacts: { "CONTEXT.md:Order": "a settled order" } }) }), {
    disposition: "DRIFTED", owningSource: "CONTEXT.md:Order",
    expected: "an accepted order", observed: "a settled order",
  });
});

test("accepted document writes require the exact registered isolated lane and content", async () => {
  const changes = [{ path: "docs/adr/0001-order.md", contentIdentity: "sha256:accepted" }];
  const laneRequest = { ...request, acceptedChanges: changes, lane: { taskId: "task-1", worktree: "/tmp/planning-17" } };
  const lane = { ...laneRequest.lane, repositoryId: request.repositoryId, specId: request.specId, target: "main", baseline: request.baseline, registered: true, isolated: true, acceptedChanges: changes };
  const run = (currentLane, input = laneRequest) => readPlanningBaseline({ request: input, adapter: adapter(observed, currentLane) });
  assert.equal((await run(lane)).requiresPlanningLane, true);
  await assert.rejects(run(lane, { ...laneRequest, lane: null }), /planning lane/);
  for (const field of ["taskId", "worktree", "repositoryId", "specId", "target", "baseline"]) {
    await assert.rejects(run({ ...lane, [field]: "other" }), new RegExp(field));
  }
  await assert.rejects(run({ ...lane, registered: false }), /registered isolated/);
  await assert.rejects(run({ ...lane, isolated: false }), /registered isolated/);
  await assert.rejects(run({ ...lane, acceptedChanges: [{ ...changes[0], contentIdentity: "changed" }] }), /accepted content/);
});

test("missing declarations and unreadable source facts cannot silently choose tracker-only", async () => {
  await assert.rejects(readPlanningBaseline({ request: { ...request, acceptedChanges: undefined }, adapter: adapter() }), /acceptedChanges/);
  await assert.rejects(readPlanningBaseline({ request, adapter: adapter({ ...observed, relevantFacts: {} }) }), /unreadable.*CONTEXT/);
});
