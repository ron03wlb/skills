import assert from "node:assert/strict";
import test from "node:test";
import { planCloseContinuation } from "../../skills/personal/run-issue-workflow/scripts/close-continuation.mjs";

test("native close continuation retains its bounded no-progress budget and yields to active work", () => {
  const requestIdentity = `sha256:${"a".repeat(64)}`;
  const requestEvidence = { runIdentity: { runId: "run" }, issueId: "issue", targetHead: "a".repeat(40), trackerState: "OPEN", candidateReachable: true, worktreeState: "PRESENT" };
  const task = { state: "RESUMABLE", snapshot: { turns: [{ status: "completed" }] }, closeRequest: { state: "ACCEPTED", runId: "run", issueId: "issue", requestIdentity } };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const next = planCloseContinuation({ task: structuredClone(task), requestIdentity, requestEvidence });
    assert.equal(next.attempt, attempt); assert.equal(next.exhausted, false);
    task.closeRequest.continuation = { attempt, progressIdentity: next.progressIdentity };
  }
  assert.equal(planCloseContinuation({ task: structuredClone(task), requestIdentity, requestEvidence }).exhausted, true);
  assert.equal(planCloseContinuation({ task, requestIdentity, requestEvidence: { ...requestEvidence, worktreeState: "ABSENT" } }).attempt, 1, "observable cleanup progress resumes the remaining tracker action");
  task.state = "RUNNING";
  assert.deepEqual(planCloseContinuation({ task, requestIdentity, requestEvidence }), { needed: false });
});

test("exact host cleanup failure stops unchanged continuation but physical absence permits closure", () => {
  const requestIdentity = `sha256:${"b".repeat(64)}`;
  const authorityEvidence = { candidateCommit: "a".repeat(40), completionEvidenceId: "IC_done", completionBodySha256: "sha256:done", worktreeIdentity: "sha256:owned" };
  const requestEvidence = { runIdentity: { runId: "run" }, issueId: "issue", trackerState: "OPEN", candidateReachable: true, worktreeState: "PRESENT", authorityEvidence };
  const task = { state: "RESUMABLE", snapshot: { turns: [{ status: "completed" }] },
    closeRequest: { runId: "run", issueId: "issue", requestIdentity },
    closeResult: { schema: "issue-close-result:v1", state: "HOST_CLEANUP_BLOCKED", runId: "run", issueId: "issue", requestIdentity,
      authorityEvidence, reasonCode: "host_release_unavailable", observations: [{ code: "EBUSY", message: "Exact directory remains held" }] } };
  const stopped = planCloseContinuation({ task, requestIdentity, requestEvidence });
  assert.equal(stopped.needed, false);
  assert.equal(stopped.blocked.reasonCode, "host_release_unavailable");
  assert.deepEqual(stopped.blocked.evidence, task.closeResult.observations);
  assert.deepEqual(task.closeRequest, { runId: "run", issueId: "issue", requestIdentity }, "no retry budget is spent");
  assert.equal(planCloseContinuation({ task, requestIdentity, requestEvidence: { ...requestEvidence, targetHead: "b".repeat(40) } }).blocked.reasonCode, "host_release_unavailable", "target movement cannot replay cleanup");
  assert.equal(planCloseContinuation({ task, requestIdentity, requestEvidence: { ...requestEvidence, worktreeState: "ABSENT" } }).attempt, 1);
  for (const change of [{ runId: "foreign" }, { issueId: "foreign" }, { requestIdentity: "foreign" },
    { authorityEvidence: { ...authorityEvidence, completionBodySha256: "changed" } }, { observations: [] }]) {
    assert.throws(() => planCloseContinuation({ task: { ...task, closeResult: { ...task.closeResult, ...change } }, requestIdentity, requestEvidence }), /Host cleanup result/u);
  }
  task.state = "RUNNING";
  assert.deepEqual(planCloseContinuation({ task, requestIdentity, requestEvidence }), { needed: false });
});
