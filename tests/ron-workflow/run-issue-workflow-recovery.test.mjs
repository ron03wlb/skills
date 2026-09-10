import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maintainLeaseHealth, readLeaseHealth, readLeaseHealthEvidence } from "../../skills/personal/run-issue-workflow/scripts/lease-health.mjs";
import { sameCloseWaitAuthority } from "../../skills/personal/run-issue-workflow/scripts/run-target-writer-wait.mjs";

test("normal target and close progress retain wait authority while candidate and scope changes do not", () => {
  const before = {
    runIdentity: { runId: "run", approvedScopeHash: "scope", target: "main" },
    grant: { runIdentity: { runId: "run" }, maxParallel: 3 }, controlRevision: 0,
    target: { state: "CLEAN", head: "a".repeat(40), trackerAvailable: true, parentTrackerState: "OPEN", parentTrackerIdentity: "parent" },
    issues: [{ issueId: "13", trackerState: "OPEN", completionState: "COMPLETE", candidateReachable: false, worktreeState: "PRESENT", authorityEvidence: { targetHead: "a".repeat(40), candidateCommit: "c".repeat(40), trackerIdentity: "issue", completionEvidenceId: "note", completionBodySha256: "digest", worktreeIdentity: "lane" } }],
  };
  const after = structuredClone(before);
  after.target.head = "b".repeat(40);
  after.issues[0].authorityEvidence.targetHead = after.target.head;
  after.issues[0].candidateReachable = true;
  after.issues[0].worktreeState = "ABSENT";
  after.issues[0].trackerState = "CLOSED";
  assert.equal(sameCloseWaitAuthority(before, after), true);
  after.target.state = "DIRTY";
  assert.equal(sameCloseWaitAuthority(before, after), true, "dirt affects integration readiness, not the immutable grant");
  after.issues[0].authorityEvidence.candidateCommit = "d".repeat(40);
  assert.equal(sameCloseWaitAuthority(before, after), false);
  after.issues[0].authorityEvidence.candidateCommit = "c".repeat(40);
  after.runIdentity.approvedScopeHash = "new-scope";
  assert.equal(sameCloseWaitAuthority(before, after), false);
});

test("lease health needs a live process and fresh exact-generation evidence and never reclaims", () => {
  const root = mkdtempSync(join(tmpdir(), "lease-health-"));
  const owner = { operationId: "close", coordinatorInstanceId: "owner", generation: "one" };
  writeFileSync(join(root, "owner.json"), JSON.stringify(owner));
  const health = maintainLeaseHealth(root, owner, { now: () => 10000 });
  try {
    assert.equal(readLeaseHealth(root, owner, { now: () => 11000 }), "HEALTHY");
    assert.equal(readLeaseHealth(root, owner, { now: () => 26000 }), "UNKNOWN");
    assert.equal(readLeaseHealth(root, owner, { now: () => 11000, alive() { throw new Error("dead"); } }), "UNKNOWN");
    assert.deepEqual(readLeaseHealthEvidence(root, owner, { now: () => 11000, alive() {
      throw Object.assign(new Error("process absent"), { code: "ESRCH" });
    } }), { state: "INACTIVE", reason: "PROCESS_CONFIRMED_ABSENT", owner });
    assert.equal(readLeaseHealth(root, { ...owner, generation: "two" }, { now: () => 11000 }), "UNKNOWN");
    assert.deepEqual(readLeaseHealthEvidence(root, owner, { now: () => 26000 }), {
      state: "UNKNOWN", reason: "HEARTBEAT_AGE_OR_CLOCK_UNKNOWN", owner,
    });
    assert.deepEqual(readLeaseHealthEvidence(root, { ...owner, generation: "two" }, { now: () => 11000 }), {
      state: "UNKNOWN", reason: "OWNER_CHANGED", owner: { ...owner, generation: "two" },
    });
  } finally { health.stop(); rmSync(root, { recursive: true }); }
});
