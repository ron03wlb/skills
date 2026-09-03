const runIdentityFields = new Set([
  "runId",
  "specId",
  "approvedScopeHash",
  "target",
  "classification",
  "decompositionIdentity",
]);
const evidenceFields = new Set(["runIdentity", "grant", "target", "controlRevision", "issues"]);
const grantFields = new Set(["runIdentity", "maxParallel"]);
const targetFields = new Set(["state", "trackerAvailable", "parentTrackerState"]);
const issueFields = new Set([
  "issueId",
  "trackerState",
  "completionState",
  "candidateReachable",
  "worktreeState",
]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;

const assertExactFields = (value, allowed, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
};

const validateRunIdentity = (identity, label) => {
  assertExactFields(identity, runIdentityFields, label);
  for (const key of ["runId", "specId", "approvedScopeHash", "target", "classification"]) {
    if (!isText(identity[key])) throw new TypeError(`${label}.${key} is required`);
  }
  if (!["SINGLE", "MULTI"].includes(identity.classification)) {
    throw new TypeError(`${label}.classification must be SINGLE or MULTI`);
  }
  if (identity.classification === "MULTI") {
    if (!isText(identity.decompositionIdentity)) {
      throw new TypeError(`${label}.decompositionIdentity is required for MULTI`);
    }
  } else if (identity.decompositionIdentity !== null) {
    throw new TypeError(`${label}.decompositionIdentity must be null for SINGLE`);
  }
};

const canonicalFact = (value) => {
  if (Array.isArray(value)) return value.map(canonicalFact);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalFact(value[key])]));
  }
  return value;
};

const copyRunIdentity = (identity) => ({
  runId: identity.runId,
  specId: identity.specId,
  approvedScopeHash: identity.approvedScopeHash,
  target: identity.target,
  classification: identity.classification,
  decompositionIdentity: identity.decompositionIdentity,
});

export const createTargetWriterWaitEvidence = ({
  runIdentity,
  grant,
  run,
  nodes,
  controlRevision,
}) => ({
  runIdentity: copyRunIdentity(runIdentity),
  grant: {
    runIdentity: copyRunIdentity(grant.runIdentity),
    maxParallel: grant.maxParallel ?? 3,
  },
  target: {
    state: ["CLEAN", "DIRTY", "UNKNOWN"].includes(run.targetState) ? run.targetState : "UNKNOWN",
    trackerAvailable: typeof run.trackerAvailable === "boolean" ? run.trackerAvailable : null,
    parentTrackerState: isText(run.parentTrackerState) ? run.parentTrackerState : null,
  },
  controlRevision,
  issues: [...nodes]
    .sort((left, right) => String(left.issueId).localeCompare(String(right.issueId), "en"))
    .map((node) => ({
      issueId: node.issueId,
      trackerState: node.close.trackerState,
      completionState: node.close.completionState,
      candidateReachable: node.close.candidateReachable,
      worktreeState: node.close.worktreeState,
    })),
});

export const validateTargetWriterWaitEvidence = (evidence) => {
  assertExactFields(evidence, evidenceFields, "target-writer pre-wait evidence");
  validateRunIdentity(evidence.runIdentity, "target-writer pre-wait runIdentity");
  assertExactFields(evidence.grant, grantFields, "target-writer pre-wait Grant");
  validateRunIdentity(evidence.grant.runIdentity, "target-writer pre-wait Grant runIdentity");
  if (!Number.isInteger(evidence.grant.maxParallel) || evidence.grant.maxParallel < 1) {
    throw new TypeError("target-writer pre-wait Grant maxParallel must be a positive integer");
  }
  assertExactFields(evidence.target, targetFields, "target-writer pre-wait target");
  if (!["CLEAN", "DIRTY", "UNKNOWN"].includes(evidence.target.state)) {
    throw new TypeError("target-writer pre-wait target state is invalid");
  }
  if (evidence.target.trackerAvailable !== null && typeof evidence.target.trackerAvailable !== "boolean") {
    throw new TypeError("target-writer pre-wait trackerAvailable must be boolean or null");
  }
  if (evidence.target.parentTrackerState !== null && !isText(evidence.target.parentTrackerState)) {
    throw new TypeError("target-writer pre-wait parentTrackerState must be text or null");
  }
  if (!Number.isInteger(evidence.controlRevision) || evidence.controlRevision < 0) {
    throw new TypeError("target-writer pre-wait controlRevision must be a non-negative integer");
  }
  if (!Array.isArray(evidence.issues) || evidence.issues.length === 0) {
    throw new TypeError("target-writer pre-wait issues are required");
  }
  for (const issue of evidence.issues) {
    assertExactFields(issue, issueFields, "target-writer pre-wait issue");
    for (const key of ["issueId", "trackerState", "completionState", "worktreeState"]) {
      if (!isText(issue[key])) throw new TypeError(`target-writer pre-wait issue.${key} is required`);
    }
    if (issue.candidateReachable !== null && typeof issue.candidateReachable !== "boolean") {
      throw new TypeError("target-writer pre-wait issue.candidateReachable must be boolean or null");
    }
  }
  if (new Set(evidence.issues.map(({ issueId }) => issueId)).size !== evidence.issues.length) {
    throw new TypeError("target-writer pre-wait issues must be unique");
  }
  return evidence;
};

export const sameTargetWriterWaitEvidence = (left, right) => (
  JSON.stringify(canonicalFact(left)) === JSON.stringify(canonicalFact(right))
);
