import {
  assertWorkflowOperationIdentity,
  deriveExecuteIssueOperationIdentity,
} from "./delivery-authority.mjs";

export const TRACKER_ONLY_COMPLETION_MODE = "tracker_only:v1";

const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const recordFields = new Set([
  "kind", "completionMode", "repositoryId", "issueId", "specId", "target",
  "operationIdentity", "planningSeal", "planningSealState", "baseline", "candidate",
  "topic", "worktree", "reviewBasis", "trackerOutcome", "manualAttestations",
  "workflowArtifacts", "standards", "spec", "verification", "repairWaveCount",
  "materialPlanDeviations", "worktreeState",
]);
const trackerOutcomeFields = new Set(["kind", "proseSha256"]);
const verificationFields = new Set(["command", "result"]);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const isEmptyList = (value) => Array.isArray(value) && value.length === 0;
const passing = (result) => /^(?:PASS|PASSED|SUCCEEDED)\b/u.test(result);
const assertExactFields = (value, fields, label) => {
  const actual = Object.keys(value);
  const unknown = actual.find((field) => !fields.has(field));
  const missing = [...fields].find((field) => !Object.hasOwn(value, field));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
  if (missing) throw new TypeError(`${label} is missing field ${missing}`);
};

const requireExpected = (expected) => {
  if (!isRecord(expected)) throw new TypeError("Tracker-only completion needs expected authority");
  for (const field of ["repositoryId", "specId", "issueId", "target", "approvedPublicationIdentity", "planningSeal", "outcomeKind"]) {
    if (!isText(expected[field])) throw new TypeError(`Tracker-only completion expected ${field} is required`);
  }
  return expected;
};

export function assertTrackerOnlyCompletion({ completion, expected } = {}) {
  const authority = requireExpected(expected);
  if (!isRecord(completion) || !isRecord(completion.record)) {
    throw new TypeError("Tracker-only completion needs one read-back workflow record");
  }
  const { record } = completion;
  assertExactFields(record, recordFields, "Tracker-only completion record");
  if (record.kind !== "implementation_complete" || record.completionMode !== TRACKER_ONLY_COMPLETION_MODE) {
    throw new TypeError("Unsupported tracker-only completion record");
  }
  if (record.repositoryId !== authority.repositoryId || record.specId !== authority.specId
    || record.issueId !== authority.issueId || record.target !== authority.target) {
    throw new TypeError("Tracker-only completion authority differs");
  }
  assertWorkflowOperationIdentity(record.operationIdentity, deriveExecuteIssueOperationIdentity({
    repositoryId: authority.repositoryId,
    specId: authority.specId,
    issueId: authority.issueId,
    approvedPublicationIdentity: authority.approvedPublicationIdentity,
  }));
  if (record.planningSeal !== authority.planningSeal || record.planningSealState !== "reused") {
    throw new TypeError("Tracker-only completion Planning Seal differs");
  }
  for (const field of ["baseline", "candidate", "topic", "worktree", "reviewBasis"]) {
    if (record[field] !== null) throw new TypeError(`Tracker-only completion ${field} must be null`);
  }
  if (!isRecord(record.trackerOutcome)) throw new TypeError("Tracker-only completion outcome is incomplete");
  assertExactFields(record.trackerOutcome, trackerOutcomeFields, "Tracker-only completion outcome");
  if (record.trackerOutcome.kind !== authority.outcomeKind
    || !sha256Pattern.test(record.trackerOutcome.proseSha256)
    || completion.proseSha256 !== record.trackerOutcome.proseSha256) {
    throw new TypeError("Tracker-only completion prose evidence differs");
  }
  if (!isText(completion.identity) || !sha256Pattern.test(completion.bodySha256)) {
    throw new TypeError("Tracker-only completion read-back identity is incomplete");
  }
  if (!isEmptyList(record.manualAttestations) || !isEmptyList(record.workflowArtifacts)
    || !isEmptyList(record.materialPlanDeviations)) {
    throw new TypeError("Tracker-only completion cannot carry repository or prerequisite artifacts");
  }
  if (record.standards !== "not-applicable" || record.spec !== "clean"
    || record.worktreeState !== "not-applicable" || record.repairWaveCount !== 0) {
    throw new TypeError("Tracker-only completion review or worktree state differs");
  }
  if (!Array.isArray(record.verification) || record.verification.length === 0) {
    throw new TypeError("Tracker-only completion verification is incomplete");
  }
  for (const item of record.verification) {
    if (!isRecord(item)) throw new TypeError("Tracker-only completion verification is incomplete");
    assertExactFields(item, verificationFields, "Tracker-only verification");
    if (!isText(item.command) || !isText(item.result) || !passing(item.result)) {
      throw new TypeError("Tracker-only completion verification is incomplete");
    }
  }
  return Object.freeze({
    mode: TRACKER_ONLY_COMPLETION_MODE,
    identity: completion.identity,
    bodySha256: completion.bodySha256,
    proseSha256: completion.proseSha256,
    operationIdentity: record.operationIdentity,
    planningSeal: record.planningSeal,
  });
}
