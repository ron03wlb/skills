// The tracker-only completion receipt: exact authority, prose binding, explicit no-candidate state,
// clean Spec outcome, read-only verification, and no repository or prerequisite artifacts.
import test from "node:test";
import assert from "node:assert/strict";

import {
  assertTrackerOnlyCompletion,
  TRACKER_ONLY_COMPLETION_MODE,
} from "../../skills/personal/run-issue-workflow/scripts/tracker-only-completion.mjs";
import { workflowNoteProseDigest } from "../../skills/personal/run-issue-workflow/scripts/gitlab-workflow-records.mjs";
import { deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const expected = Object.freeze({
  repositoryId: "gitlab:gitlab.example/group/project",
  specId: "https://gitlab.example/group/project/-/issues/186",
  issueId: "https://gitlab.example/group/project/-/issues/186",
  target: "feature/ron/#24846",
  approvedPublicationIdentity: "https://gitlab.example/group/project/-/issues/186#note_47992",
  planningSeal: "e99e9aab3be262daa66411bd0e76f09c651249db",
  outcomeKind: "authority_drift_register:v1",
});
const prose = "Final authority and drift register.";
const proseSha256 = workflowNoteProseDigest(prose);

const record = (overrides = {}) => ({
  kind: "implementation_complete",
  completionMode: TRACKER_ONLY_COMPLETION_MODE,
  repositoryId: expected.repositoryId,
  issueId: expected.issueId,
  specId: expected.specId,
  target: expected.target,
  operationIdentity: deriveExecuteIssueOperationIdentity(expected),
  planningSeal: expected.planningSeal,
  planningSealState: "reused",
  baseline: null,
  candidate: null,
  topic: null,
  worktree: null,
  reviewBasis: null,
  trackerOutcome: { kind: expected.outcomeKind, proseSha256 },
  manualAttestations: [],
  workflowArtifacts: [],
  standards: "not-applicable",
  spec: "clean",
  verification: [{ command: "read published authority sources", result: "PASS — register reconciled" }],
  repairWaveCount: 0,
  materialPlanDeviations: [],
  worktreeState: "not-applicable",
  ...overrides,
});
const completion = (overrides = {}) => ({
  identity: `${expected.issueId}#note_50000`,
  bodySha256: `sha256:${"a".repeat(64)}`,
  proseSha256,
  record: record(),
  ...overrides,
});

test("accepts one exact prose-bound tracker-only completion", () => {
  const receipt = assertTrackerOnlyCompletion({ completion: completion(), expected });
  assert.equal(receipt.mode, TRACKER_ONLY_COMPLETION_MODE);
  assert.equal(receipt.proseSha256, proseSha256);
  assert.deepEqual(receipt.operationIdentity, deriveExecuteIssueOperationIdentity(expected));
});

test("rejects repository state, prose drift, and failed verification", () => {
  assert.throws(
    () => assertTrackerOnlyCompletion({ completion: completion({ record: record({ unexpected: true }) }), expected }),
    /unknown field unexpected/u,
  );
  assert.throws(
    () => assertTrackerOnlyCompletion({ completion: completion({ record: record({ candidate: "a".repeat(40) }) }), expected }),
    /candidate must be null/u,
  );
  assert.throws(
    () => assertTrackerOnlyCompletion({ completion: completion({ proseSha256: `sha256:${"b".repeat(64)}` }), expected }),
    /prose evidence differs/u,
  );
  assert.throws(
    () => assertTrackerOnlyCompletion({ completion: completion({ record: record({ verification: [{ command: "read sources", result: "FAIL" }] }) }), expected }),
    /verification is incomplete/u,
  );
});

test("rejects authority and operation identity drift", () => {
  assert.throws(
    () => assertTrackerOnlyCompletion({ completion: completion(), expected: { ...expected, target: "other" } }),
    /authority differs/u,
  );
  assert.throws(
    () => assertTrackerOnlyCompletion({ completion: completion({ record: record({ operationIdentity: { ...deriveExecuteIssueOperationIdentity(expected), key: `workflow-op-v1-${"0".repeat(64)}` } }) }), expected }),
    /immutable inputs/u,
  );
});
