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
