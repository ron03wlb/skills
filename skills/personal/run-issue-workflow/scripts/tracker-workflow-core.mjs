import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export const TRACKER_WORKFLOW_CORE_SCHEMA = "tracker-workflow-core:v1";
export const COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const automaticHostCleanupReasons = new Set(["host_release_unavailable", "host_task_ownership_unproven"]);
const negativeManualPrerequisite = /^(?:N\/A|None|Not applicable)(?![a-z0-9])/iu;
const controlVerificationLabel = /^\s*control(?: run)?\s*[:\u2014\u2013-]\s/iu;

export const authorityConflict = (message) => Object.assign(new Error(message), { code: "WORKFLOW_AUTHORITY_CONFLICT" });
export const exactlyOne = (values, label) => {
  if (values.length !== 1) throw authorityConflict(`${label}: expected one exact record, observed ${values.length}`);
  return values[0];
};
export const canonicalWorktreePath = (path) => existsSync(path) ? realpathSync.native(path) : resolve(path);
export const declaresManualPrerequisite = (section) => !negativeManualPrerequisite.test(section);
export const isAutomaticHostCleanupReason = (reasonCode) => automaticHostCleanupReasons.has(reasonCode);
export const isCompleteVerificationEvidence = (items) => Array.isArray(items)
  && items.length > 0
  && items.every((item) => typeof item.command === "string" && item.command.length > 0
    && typeof item.result === "string" && item.result.length > 0
    && (controlVerificationLabel.test(item.command) || /^(?:PASS(?:ED)?|SUCCEEDED)\b/iu.test(item.result)))
  && items.some((item) => !controlVerificationLabel.test(item.command)
    && /^(?:PASS(?:ED)?|SUCCEEDED)\b/iu.test(item.result));

export function createAutomaticHostCleanupPacket({
  result,
  taskCwd,
  originalTaskRef,
  integrationRecord,
  record,
  target,
  targetName,
  issueId,
  specId,
}) {
  const failure = result?.observations?.[0];
  const originalTaskMatches = originalTaskRef?.threadId === result?.taskRef?.threadId
    && originalTaskRef?.hostId === result?.taskRef?.hostId;
  const integrationChecks = integrationRecord?.current?.results?.map((attempt, index) => {
    const obligation = integrationRecord.obligation?.[index];
    const inputs = attempt.inputs;
    if (!Array.isArray(obligation?.command) || obligation.command.length === 0
      || !obligation.command.every((value) => typeof value === "string")
      || !Array.isArray(obligation.configFiles) || !obligation.configFiles.every((value) => typeof value === "string")
      || !inputs?.environment || typeof inputs.environment !== "object" || Array.isArray(inputs.environment)
      || Object.keys(inputs.environment).length === 0 || !isDeepStrictEqual(inputs.external, {})
      || !Array.isArray(inputs.configuration) || inputs.configuration.length !== obligation.configFiles.length
      || inputs.configuration.some((item, configIndex) => item?.file !== obligation.configFiles[configIndex]
        || !/^[a-f0-9]{64}$/u.test(item.digest))) return null;
    return {
      command: obligation.command,
      configFiles: obligation.configFiles,
      environment: inputs.environment,
      externalInputs: { kind: "none" },
    };
  });
  const integrationMatches = integrationRecord?.current?.state === "PASS"
    && Array.isArray(integrationChecks) && !integrationChecks.includes(null)
    && result?.integrationVerification?.state === "PASS"
    && Array.isArray(result.integrationVerification.checks)
    && isDeepStrictEqual(result.integrationVerification.checks, integrationChecks)
    && result.integrationVerification.identity === integrationRecord.current.identity;
  const resultMatches = result?.candidate === record.candidate
    && result.targetHead === target.head && result.candidateReachable === true
    && canonicalWorktreePath(result.worktree) === canonicalWorktreePath(record.worktree)
    && canonicalWorktreePath(taskCwd) === canonicalWorktreePath(record.worktree)
    && result.directoryState === "EMPTY_UNREGISTERED" && originalTaskMatches
    && isAutomaticHostCleanupReason(result.reasonCode)
    && ["EBUSY", "EPERM", "EACCES"].includes(failure?.code)
    && typeof failure.message === "string" && failure.message.length > 0;
  if (!resultMatches || !integrationMatches) return null;
  return {
    completion: {
      issueId,
      specId,
      target: targetName,
      targetWorktree: target.worktree,
      topic: record.topic,
      worktree: record.worktree,
      candidate: record.candidate,
    },
    taskRef: originalTaskRef,
    failure: { code: failure.code, message: failure.message },
    integrationChecks,
  };
}

export function normalizeWorkflowHandoff(snapshot) {
  const record = snapshot.handoff.record;
  const objectOf = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  const authority = objectOf(record.authority) ?? record;
  const upstream = objectOf(record.upstream) ?? {};
  const classification = authority.classification ?? record.classification;
  const publicationIdentity = record.publicationIdentity ?? authority.publicationIdentity ?? null;
  let decompositionIdentity = record.decompositionIdentity;
  if (decompositionIdentity === undefined) decompositionIdentity = authority.decompositionIdentity;
  if (decompositionIdentity === undefined && classification === "MULTI") decompositionIdentity = publicationIdentity;
  if (decompositionIdentity === undefined) decompositionIdentity = null;
  return {
    ...record,
    specId: authority.specId ?? record.specId,
    target: authority.target ?? record.target,
    planningSeal: authority.planningSeal ?? record.planningSeal,
    classification,
    approvedScopeHash: authority.approvedScopeHash ?? record.approvedScopeHash,
    publicationIdentity,
    decompositionIdentity,
    upstreamPublicationIdentity: record.upstreamPublicationIdentity ?? upstream.publicationIdentity ?? null,
    upstreamHandoffIdentity: record.upstreamHandoffIdentity ?? upstream.handoffIdentity ?? null,
    identity: snapshot.handoff.identity,
  };
}

export function createTrackerWorkflowCore({ provider, repositoryId, readIssue, readIssueState, providerAuthority } = {}) {
  if (!new Set(["github", "gitlab"]).has(provider)) throw new TypeError("Tracker workflow core requires one known provider");
  if (typeof repositoryId !== "string" || repositoryId.length === 0) throw new TypeError("Tracker workflow core requires a repository identity");
  if (typeof readIssue !== "function" || typeof readIssueState !== "function") throw new TypeError("Tracker workflow core requires provider tracker reads");
  if (providerAuthority === null || typeof providerAuthority !== "object") throw new TypeError("Tracker workflow core requires provider authority hooks");
  return Object.freeze({
    schema: TRACKER_WORKFLOW_CORE_SCHEMA,
    provider,
    repositoryId,
    readIssue,
    readIssueState,
    providerAuthority: Object.freeze({ ...providerAuthority }),
  });
}
