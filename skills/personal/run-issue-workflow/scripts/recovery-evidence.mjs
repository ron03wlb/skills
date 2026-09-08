import { createHash } from "node:crypto";
import { assertWorkflowOperationIdentity } from "./workflow-operation-identity.mjs";

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const recoveryDigest = value => `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
const text = value => typeof value === "string" && value.length > 0;
export const sameRecoveryTask = (a, b) => text(a?.threadId) && a.threadId === b?.threadId && a.hostId === b?.hostId;
export const RECOVERY_CLASSES = Object.freeze(["UNDIAGNOSED", "ISSUE_DEFECT", "ENVIRONMENT", "WORKFLOW_DEFECT", "REQUIREMENT_CONFLICT", "CAPABILITY_UNAVAILABLE", "OUTCOME_UNKNOWN"]);
export const WINDOWS_GRADLE_LOOPBACK_FINGERPRINT = "windows:Selector.open():java.io.IOException: Unable to establish loopback connection";

export function bindTechnicalFailure(facts) {
  for (const field of ["runId", "issueId", "operationId", "candidate", "targetHead", "worktree", "topic", "owningSource", "observedResult"]) {
    if (!text(facts?.[field])) throw new Error(`Technical failure lacks exact ${field}`);
  }
  if (!Array.isArray(facts.command) || !facts.command.length || !facts.command.every(text)) throw new Error("Technical failure lacks the failed command or operation");
  const { diagnosis, identity, repairWaveCount, ...basis } = facts;
  const expected = recoveryDigest(basis);
  if (identity !== undefined && identity !== expected) throw new Error("Technical failure fingerprint differs");
  if (diagnosis && (!RECOVERY_CLASSES.includes(diagnosis.classification) || !text(diagnosis.reason)
    || !text(diagnosis.source))) throw new Error("Technical failure diagnosis lacks owning source and observed evidence");
  return { ...basis, repairWaveCount: repairWaveCount ?? null, identity: expected, ...(diagnosis ? { diagnosis } : {}) };
}

export function readRepairProgress({ records, issueId, operationId, count }) {
  let previous;
  for (const { record } of records) {
    if (record.kind !== "implementation_progress" || record.issueId !== issueId) continue;
    if (!text(record.operationIdentity?.key)) throw new Error("Material repair progress has no proven operation");
    if (record.operationIdentity.key !== operationId) continue;
    assertWorkflowOperationIdentity(record.operationIdentity, { key: operationId, issueId });
    if (!Number.isInteger(record.repairWaveCount) || record.repairWaveCount < 0 || record.repairWaveCount > 10
      || previous !== undefined && record.repairWaveCount < previous) throw new Error("Material repair progress is malformed or resets the operation budget");
    previous = record.repairWaveCount;
  }
  if (count != null && (!Number.isInteger(count) || count < 0 || count > 10)) throw new Error("Completion repair count is malformed");
  return previous === undefined ? count ?? null : Math.max(count ?? 0, previous);
}

export function nextRecoveryPhase(failure) {
  bindTechnicalFailure(failure);
  const classification = failure.diagnosis?.classification ?? "UNDIAGNOSED";
  if (classification === "UNDIAGNOSED") return "DIAGNOSE";
  if (classification === "OUTCOME_UNKNOWN" && !failure.diagnosis.readBackAttempted) return "READBACK";
  if (classification === "ENVIRONMENT") {
    if (failure.diagnosis.fingerprint === WINDOWS_GRADLE_LOOPBACK_FINGERPRINT && !failure.diagnosis.remediationAttempted) return "ENVIRONMENT";
    if (!failure.diagnosis.readBackAttempted && !failure.diagnosis.remediationAttempted) return "READBACK";
  }
  if (classification === "ISSUE_DEFECT" && failure.diagnosis.scopeCompatible === true) return "REPAIR";
  if (classification === "WORKFLOW_DEFECT" && failure.diagnosis.scopeCompatible === true) return "MAINTENANCE";
  return null;
}

export function nextRepairWave({ failure, journal }) {
  const count = failure.repairWaveCount;
  if (!Number.isInteger(count) || count < 0 || count > 10) throw new Error("Prior material repair count is unproved; preserve the operation");
  const recorded = journal.filter(item => item.issueId === failure.issueId && (item.type === "repair.recorded"
    || item.type === "recovery.intent" && item.phase === "REPAIR")).map(item => item.wave);
  const previous = Math.max(count, 0, ...recorded);
  if (previous >= 10) throw new Error("Persistent ten-wave material repair budget exhausted");
  return previous + 1;
}

export function validateRecoveryIntent(event) {
  const failure = bindTechnicalFailure(event.failure);
  if (event.issueId !== failure.issueId || !["DIAGNOSE", "READBACK", "ENVIRONMENT", "REPAIR", "MAINTENANCE"].includes(event.phase)
    || event.phase !== nextRecoveryPhase(failure) || !text(event.originalTaskRef?.threadId) || !text(event.originalTaskRef?.hostId)
    || event.requestIdentity !== recoveryDigest({ failure, phase: event.phase, wave: event.wave })) throw new Error("Recovery intent differs from failure, phase or ownership");
  if (["REPAIR", "MAINTENANCE"].includes(event.phase) ? !Number.isInteger(event.wave) || event.wave < 1 || event.wave > 10 : event.wave !== null) throw new Error("Recovery wave is invalid for this phase");
}

export function validateRepairCompletion({ failure, transfer, completion, previousCompletion, ancestor }) {
  if (!failure || !transfer || transfer.phase !== "REPAIR" || transfer.failureIdentity !== failure.identity || !sameRecoveryTask(transfer.originalTaskRef, failure.ownerTaskRef)
    || completion?.record?.recovery?.failureIdentity !== failure.identity
    || completion.record.recovery.requestIdentity !== transfer.requestIdentity
    || !sameRecoveryTask(completion.record.recovery.taskRef, transfer.taskRef)
    || completion.record.operationIdentity?.key !== failure.operationId
    || completion.record.recovery.previousCompletionIdentity !== (previousCompletion?.identity ?? null)
    || completion.record.recovery.previousCompletionBodySha256 !== (previousCompletion?.bodySha256 ?? null)
    || (previousCompletion?.identity ?? null) !== failure.completionIdentity || (previousCompletion?.bodySha256 ?? null) !== failure.completionBodySha256
    || completion.record.candidate === failure.candidate || completion.record.worktree !== failure.worktree
    || completion.record.topic !== failure.topic || !Number.isInteger(completion.record.repairWaveCount)
    || completion.record.repairWaveCount < transfer.wave || completion.record.repairWaveCount > 10
    || !completion.record.verification?.some(item => JSON.stringify(item.argv) === JSON.stringify(failure.command) && /^(PASS|SUCCEEDED)\b/u.test(item.result))
    || !ancestor(failure.candidate, completion.record.candidate) || !ancestor(failure.targetHead, completion.record.candidate)) {
    throw new Error("Repair completion lacks exact failure, owner, completion or Git lineage");
  }
  return { failureIdentity: failure.identity, requestIdentity: transfer.requestIdentity, previousCandidate: failure.candidate,
    previousCompletionIdentity: previousCompletion?.identity ?? null, candidate: completion.record.candidate, taskRef: transfer.taskRef };
}

export function nextMaintenanceWave({ failure, journal }) {
  const scope = failure.diagnosis?.maintenance;
  if (!Number.isInteger(scope?.repairWaveCount) || scope.repairWaveCount < 0 || scope.repairWaveCount > 10 || !text(scope.operationId)) throw new Error("Maintenance operation budget is unproved");
  const previous = Math.max(scope.repairWaveCount, 0, ...journal.filter(event => event.type === "recovery.intent" && event.phase === "MAINTENANCE"
    && event.failure.diagnosis.maintenance.operationId === scope.operationId).map(event => event.wave));
  if (previous >= 10) throw new Error("Maintenance ten-wave repair budget exhausted");
  return previous + 1;
}

export function validateMaintenanceResult({ result, intent, installed }) {
  const scope = intent.failure.diagnosis.maintenance;
  const proof = result?.maintenance;
  if (result?.requestIdentity !== intent.requestIdentity || result.failureIdentity !== intent.failure.identity || !proof
    || proof.repositoryId !== scope.repositoryId || proof.target !== scope.target || proof.operationId !== scope.operationId
    || proof.standards !== "clean" || proof.spec !== "clean" || !Array.isArray(proof.verification) || !proof.verification.length
    || !proof.verification.every(item => text(item.command) && /^(PASS|SUCCEEDED)\b/u.test(item.result))
    || !Number.isInteger(proof.repairWaveCount) || proof.repairWaveCount < intent.wave || proof.repairWaveCount > 10 || proof.installation?.authority !== scope.installationAuthority
    || !text(scope.installationAuthority) || installed?.state !== "AVAILABLE" || proof.packageVersion?.id !== installed.version.id
    || proof.candidate !== installed.version.sourceCommit || installed.version.sourceRepository !== scope.sourceRepository
    || proof.installation.packageVersionId !== installed.version.id) throw new Error("Maintenance result lacks scoped review, budget, package or authorized installation read-back");
  return proof;
}
