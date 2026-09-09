import { createHash } from "node:crypto";

export const completedCloseCleanup = evidence => evidence.worktreeState === "ABSENT" && evidence.candidateReachable === true
  || evidence.runIdentity?.classification === "MULTI" && evidence.issueId === evidence.runIdentity.specId
    && Array.isArray(evidence.childCloseStates) && evidence.childCloseStates.length > 0
    && evidence.childCloseStates.every(child => child.completionState === "COMPLETE" && child.trackerState === "CLOSED"
      && child.candidateReachable === true && child.worktreeState === "ABSENT");

// Native accepted prompts retain the bounded continuation budget across process re-entry.
export function planCloseContinuation({ task, requestIdentity, requestEvidence }) {
  if (task?.state !== "RESUMABLE" || task.snapshot?.turns?.[0]?.status !== "completed"
    || task.closeRequest?.requestIdentity !== requestIdentity
    || task.closeRequest.runId !== requestEvidence.runIdentity.runId
    || task.closeRequest.issueId !== requestEvidence.issueId) return { needed: false };
  const verification = requestEvidence.integrationVerification;
  if (verification) {
    if (verification.issueId !== requestEvidence.issueId || verification.candidate !== requestEvidence.authorityEvidence?.candidateCommit
      || !["PASS", "FAIL", "UNKNOWN"].includes(verification.state)) throw new Error("Integration verification identity differs from the close candidate");
    if (verification.state !== "PASS") return { needed: false, blocked: {
      reasonCode: verification.state === "FAIL" ? "integration_verification_failed" : "integration_verification_unknown",
      evidence: (verification.results ?? []).map(item => ({ code: item.state, message: `${JSON.stringify(item.command)}: ${item.evidence ?? "outcome unknown"}` })),
      verificationIdentity: verification.identity,
    } };
  }
  const cleanup = task.closeResult;
  if (task.closeOutcomeUnavailable && !completedCloseCleanup(requestEvidence)) {
    return { needed: false, blocked: { reasonCode: "close_outcome_unavailable", evidence: [
      { code: "native_history_unavailable", message: "The native host accepted this close request but its outcome is unavailable; preserve the original task until owning evidence or physical cleanup progress is read back." },
    ] } };
  }
  if (cleanup?.state === "HOST_CLEANUP_BLOCKED") {
    const authority = requestEvidence.authorityEvidence;
    if (cleanup.schema !== "issue-close-result:v1" || cleanup.runId !== requestEvidence.runIdentity.runId
      || cleanup.issueId !== requestEvidence.issueId || cleanup.requestIdentity !== requestIdentity
      || !["host_release_unavailable", "host_task_ownership_unproven", "host_cleanup_ownership_unproven", "host_cleanup_policy_rejected", "host_helper_recovery_failed"].includes(cleanup.reasonCode)
      || !["candidateCommit", "completionEvidenceId", "completionBodySha256", "worktreeIdentity"].every(key =>
        typeof authority?.[key] === "string" && authority[key].length > 0 && cleanup.authorityEvidence?.[key] === authority[key])
      || !Array.isArray(cleanup.observations) || !cleanup.observations.length
      || !cleanup.observations.every(item => typeof item.code === "string" && item.code && typeof item.message === "string" && item.message)) {
      throw new Error("Host cleanup result is malformed or differs from the exact close owner evidence");
    }
    if (requestEvidence.worktreeState === "PRESENT" && requestEvidence.candidateReachable === true) {
      return { needed: false, blocked: { reasonCode: cleanup.reasonCode, evidence: cleanup.observations } };
    }
  }
  const progress = {
    targetHead: requestEvidence.targetHead,
    trackerState: requestEvidence.trackerState ?? requestEvidence.parentTrackerState,
    candidateReachable: requestEvidence.candidateReachable,
    worktreeState: requestEvidence.worktreeState,
    children: requestEvidence.childCloseStates,
  };
  const progressIdentity = `sha256:${createHash("sha256").update(JSON.stringify(progress)).digest("hex")}`;
  const previous = task.closeRequest.continuation;
  if (previous && (!Number.isInteger(previous.attempt) || previous.attempt < 1 || previous.attempt > 3
    || !/^sha256:[a-f0-9]{64}$/u.test(previous.progressIdentity))) throw new Error("Close continuation evidence is malformed");
  const attempt = previous?.progressIdentity === progressIdentity ? previous.attempt + 1 : 1;
  return { needed: true, exhausted: attempt > 3, attempt, progressIdentity };
}

export const closeContinuationSuffix = continuation => continuation.needed
  ? `\nClose continuation: ${JSON.stringify({ attempt: continuation.attempt, progressIdentity: continuation.progressIdentity })}` : "";
