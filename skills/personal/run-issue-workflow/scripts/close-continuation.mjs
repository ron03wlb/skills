import { createHash } from "node:crypto";

// Native accepted prompts retain the bounded continuation budget across process re-entry.
export function planCloseContinuation({ task, requestIdentity, requestEvidence }) {
  if (task?.state !== "RESUMABLE" || task.snapshot?.turns?.[0]?.status !== "completed"
    || task.closeRequest?.requestIdentity !== requestIdentity
    || task.closeRequest.runId !== requestEvidence.runIdentity.runId
    || task.closeRequest.issueId !== requestEvidence.issueId) return { needed: false };
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
