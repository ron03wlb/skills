import assert from "node:assert/strict";
import test from "node:test";
import { planCloseContinuation } from "../../skills/personal/run-issue-workflow/scripts/close-continuation.mjs";

test("missing parent close outcome permits only fully proved child closeout", () => {
  const requestIdentity = `sha256:${"a".repeat(64)}`;
  const requestEvidence = { runIdentity: { runId: "run", classification: "MULTI", specId: "parent" }, issueId: "parent",
    childCloseStates: [{ issueId: "child", completionState: "COMPLETE", trackerState: "CLOSED", candidateReachable: true, worktreeState: "ABSENT" }] };
  const task = { state: "RESUMABLE", snapshot: { turns: [{ status: "completed" }] }, closeOutcomeUnavailable: true,
    closeRequest: { runId: "run", issueId: "parent", requestIdentity } };
  assert.equal(planCloseContinuation({ task, requestIdentity, requestEvidence }).needed, true);
  for (const change of [{ trackerState: "OPEN" }, { candidateReachable: false }, { worktreeState: "PRESENT" }, { completionState: "NONE" }]) {
    assert.equal(planCloseContinuation({ task, requestIdentity, requestEvidence: { ...requestEvidence,
      childCloseStates: [{ ...requestEvidence.childCloseStates[0], ...change }] } }).blocked.reasonCode, "close_outcome_unavailable");
  }
});

test("durable integration failure suppresses redispatch across dialogue and target movement", () => {
  const requestIdentity = `sha256:${"c".repeat(64)}`;
  const requestEvidence = { runIdentity: { runId: "run" }, issueId: "issue", targetHead: "a".repeat(40),
    authorityEvidence: { candidateCommit: "b".repeat(40) }, candidateReachable: true, worktreeState: "PRESENT",
    integrationVerification: { state: "FAIL", identity: "sha256:failure", issueId: "issue", candidate: "b".repeat(40), targetHead: "a".repeat(40), results: [{ command: ["test"], state: "FAIL", evidence: "exit 1" }] } };
  const task = { state: "RESUMABLE", snapshot: { turns: [{ status: "completed", items: [] }] }, closeRequest: { runId: "run", issueId: "issue", requestIdentity } };
  const result = planCloseContinuation({ task, requestIdentity, requestEvidence });
  assert.equal(result.needed, false); assert.equal(result.blocked.reasonCode, "integration_verification_failed");
  assert.equal(planCloseContinuation({ task, requestIdentity, requestEvidence: { ...requestEvidence, targetHead: "c".repeat(40) } }).needed, false);
  assert.equal(planCloseContinuation({ task, requestIdentity, requestEvidence: { ...requestEvidence, integrationVerification: { ...requestEvidence.integrationVerification, state: "UNKNOWN" } } }).blocked.reasonCode, "integration_verification_unknown");
  assert.equal(planCloseContinuation({ task, requestIdentity, requestEvidence: { ...requestEvidence, integrationVerification: { ...requestEvidence.integrationVerification, state: "PASS" } } }).needed, true);
});

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
  const failedRecovery = { ...task, closeResult: { ...task.closeResult, reasonCode: "host_helper_recovery_failed" } };
  const preserved = planCloseContinuation({ task: failedRecovery, requestIdentity, requestEvidence });
  assert.equal(preserved.needed, false, "a failed helper batch must not redispatch another cleanup message");
  assert.equal(preserved.blocked.reasonCode, "host_helper_recovery_failed");
  assert.equal(planCloseContinuation({ task: failedRecovery, requestIdentity,
    requestEvidence: { ...requestEvidence, worktreeState: "ABSENT" } }).attempt, 1, "later physical cleanup permits only remaining closeout");
  for (const change of [{ runId: "foreign" }, { issueId: "foreign" }, { requestIdentity: "foreign" },
    { authorityEvidence: { ...authorityEvidence, completionBodySha256: "changed" } }, { observations: [] }]) {
    assert.throws(() => planCloseContinuation({ task: { ...task, closeResult: { ...task.closeResult, ...change } }, requestIdentity, requestEvidence }), /Host cleanup result/u);
  }
  task.state = "RUNNING";
  assert.deepEqual(planCloseContinuation({ task, requestIdentity, requestEvidence }), { needed: false });
});
