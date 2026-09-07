import assert from "node:assert/strict";
import test from "node:test";
import { createRunAuthorityAdapters } from "../../skills/personal/run-issue-workflow/scripts/run-authority-adapters.mjs";

const a = "a".repeat(40), b = "b".repeat(40);
function fixture({ moving = false, dirty = false } = {}) {
  let reads = 0, trackerReads = 0;
  const snapshots = [];
  const sources = {
    repository: { readIdentity: async () => "repo" },
    tracker: { read: async () => ({ revision: ++trackerReads }) },
    reconciliation: { read: async ({ tracker }) => {
      reads++;
      const head = moving || reads === 1 ? a : b;
      const current = { runIdentity: { runId: "original", target: "main" },
        runReadyAuthority: { authority: { specId: "spec" } },
        facts: { run: { targetHead: head, targetState: "CLEAN" }, nodes: [{ issueId: "issue", completionState: "COMPLETE",
          candidateReachable: head === b, closeAuthorityEvidence: { targetHead: head, candidateCommit: a } }] } };
      if (reads > 1) assert.equal(tracker.revision, trackerReads, "retry refreshes tracker evidence too");
      snapshots.push(structuredClone(current));
      return current;
    } },
    target: { read: async () => ({ head: b, state: dirty ? "DIRTY" : "CLEAN", ownership: dirty ? "UNOWNED" : "NONE" }) },
    checkpoint: { read: async () => ({}) }, handoff: { read: async () => ({}) },
    writer: { readHealth: async () => { throw new Error("No writer expected"); } },
  };
  const store = { observeRepositoryCloseLease: () => ({ state: "ABSENT" }), observeTargetMutationWriter: () => ({ state: "ABSENT" }) };
  return { adapter: createRunAuthorityAdapters({ sources, store }), snapshots, counts: () => ({ reads, trackerReads }) };
}

test("target movement rebuilds node reachability and authority rather than relabeling stale facts", async () => {
  const f = fixture();
  const current = await f.adapter.reconcile({ request: { specId: "spec" }, tracker: { revision: 0 }, journal: [] });
  assert.equal(current.facts.run.targetHead, b);
  assert.equal(current.facts.nodes[0].closeAuthorityEvidence.targetHead, b);
  assert.equal(current.facts.nodes[0].candidateReachable, true);
  assert.deepEqual(f.counts(), { reads: 2, trackerReads: 1 });
  assert.equal(f.snapshots[0].facts.nodes[0].candidateReachable, false);
});

test("persistent movement exhausts a bounded read budget without returning mixed facts", async () => {
  const f = fixture({ moving: true });
  const current = await f.adapter.reconcile({ request: {}, tracker: {}, journal: [] });
  assert.equal(current.facts.run.targetState, "UNKNOWN");
  assert.equal(current.facts.run.targetHead, current.facts.nodes[0].closeAuthorityEvidence.targetHead);
  assert.equal(current.facts.contradictions[0].code, "target_changed_during_read");
  assert.deepEqual(current.facts.contradictions[0].affectedNodes, ["issue"]);
  assert.deepEqual(f.counts(), { reads: 3, trackerReads: 2 });
});

test("a target becoming dirty cannot be combined with clean reconciliation facts", async () => {
  const f = fixture({ dirty: true });
  const current = await f.adapter.reconcile({ request: {}, tracker: {}, journal: [] });
  assert.equal(current.facts.run.targetState, "UNKNOWN");
  assert.equal(current.authorityReadBack.target.ownership, "UNKNOWN");
  assert.equal(f.counts().reads, 3);
});
