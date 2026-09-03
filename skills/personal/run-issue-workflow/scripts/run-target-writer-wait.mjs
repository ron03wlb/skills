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
  "authorityEvidence",
]);
const authorityEvidenceFields = new Set([
  "trackerIdentity",
  "targetHead",
  "candidateCommit",
  "completionEvidenceId",
  "completionBodySha256",
  "worktreeIdentity",
]);
const gitObjectPattern = /^[a-f0-9]{40,64}$/u;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;

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

export const validateCloseAuthorityEvidence = (evidence, label = "close authority evidence") => {
  assertExactFields(evidence, authorityEvidenceFields, label);
  for (const key of ["trackerIdentity", "completionEvidenceId", "worktreeIdentity"]) {
    if (!isText(evidence[key])) throw new TypeError(`${label}.${key} is required`);
  }
  for (const key of ["targetHead", "candidateCommit"]) {
    if (!gitObjectPattern.test(evidence[key])) throw new TypeError(`${label}.${key} must be a Git object id`);
  }
  if (!sha256Pattern.test(evidence.completionBodySha256)) {
    throw new TypeError(`${label}.completionBodySha256 must be an exact SHA-256 identity`);
  }
  return evidence;
};

const copyCloseAuthorityEvidence = (evidence) => ({
  trackerIdentity: evidence.trackerIdentity,
  targetHead: evidence.targetHead,
  candidateCommit: evidence.candidateCommit,
  completionEvidenceId: evidence.completionEvidenceId,
  completionBodySha256: evidence.completionBodySha256,
  worktreeIdentity: evidence.worktreeIdentity,
});

export const createCloseWaitEvidence = ({
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
    .map((node) => {
      const close = node.close ?? node;
      const authorityEvidence = node.closeAuthorityEvidence ?? close.authorityEvidence ?? null;
      return {
        issueId: node.issueId,
        trackerState: close.trackerState,
        completionState: close.completionState,
        candidateReachable: close.candidateReachable,
        worktreeState: close.worktreeState,
        authorityEvidence: authorityEvidence === null
          ? null
          : copyCloseAuthorityEvidence(authorityEvidence),
      };
    }),
});

export const validateCloseWaitEvidence = (evidence) => {
  assertExactFields(evidence, evidenceFields, "close-wait pre-wait evidence");
  validateRunIdentity(evidence.runIdentity, "close-wait pre-wait runIdentity");
  assertExactFields(evidence.grant, grantFields, "close-wait pre-wait Grant");
  validateRunIdentity(evidence.grant.runIdentity, "close-wait pre-wait Grant runIdentity");
  if (!Number.isInteger(evidence.grant.maxParallel) || evidence.grant.maxParallel < 1) {
    throw new TypeError("close-wait pre-wait Grant maxParallel must be a positive integer");
  }
  assertExactFields(evidence.target, targetFields, "close-wait pre-wait target");
  if (!["CLEAN", "DIRTY", "UNKNOWN"].includes(evidence.target.state)) {
    throw new TypeError("close-wait pre-wait target state is invalid");
  }
  if (evidence.target.trackerAvailable !== null && typeof evidence.target.trackerAvailable !== "boolean") {
    throw new TypeError("close-wait pre-wait trackerAvailable must be boolean or null");
  }
  if (evidence.target.parentTrackerState !== null && !isText(evidence.target.parentTrackerState)) {
    throw new TypeError("close-wait pre-wait parentTrackerState must be text or null");
  }
  if (!Number.isInteger(evidence.controlRevision) || evidence.controlRevision < 0) {
    throw new TypeError("close-wait pre-wait controlRevision must be a non-negative integer");
  }
  if (!Array.isArray(evidence.issues) || evidence.issues.length === 0) {
    throw new TypeError("close-wait pre-wait issues are required");
  }
  for (const issue of evidence.issues) {
    assertExactFields(issue, issueFields, "close-wait pre-wait issue");
    for (const key of ["issueId", "trackerState", "completionState", "worktreeState"]) {
      if (!isText(issue[key])) throw new TypeError(`close-wait pre-wait issue.${key} is required`);
    }
    if (issue.candidateReachable !== null && typeof issue.candidateReachable !== "boolean") {
      throw new TypeError("close-wait pre-wait issue.candidateReachable must be boolean or null");
    }
    if (issue.completionState === "COMPLETE") {
      validateCloseAuthorityEvidence(issue.authorityEvidence, "close-wait pre-wait issue.authorityEvidence");
    } else if (issue.authorityEvidence !== null) {
      validateCloseAuthorityEvidence(issue.authorityEvidence, "close-wait pre-wait issue.authorityEvidence");
    }
  }
  if (new Set(evidence.issues.map(({ issueId }) => issueId)).size !== evidence.issues.length) {
    throw new TypeError("close-wait pre-wait issues must be unique");
  }
  return evidence;
};

export const sameCloseWaitEvidence = (left, right) => (
  JSON.stringify(canonicalFact(left)) === JSON.stringify(canonicalFact(right))
);

// Frozen compatibility aliases for callers that still name the target-writer wait.
export const createTargetWriterWaitEvidence = createCloseWaitEvidence;
export const validateTargetWriterWaitEvidence = validateCloseWaitEvidence;
export const sameTargetWriterWaitEvidence = sameCloseWaitEvidence;
