import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  CONTROL_COMMANDS,
  NODE_STATES,
  planControl,
  REASON_CODES,
  reduceRunReadyHandoff,
  reduceRun,
  RUN_READY_FACT_SCHEMA,
  RUN_READY_RESULT_SCHEMA,
  RUN_STATES,
} from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { createTargetWriterWaitEvidence } from "../../skills/personal/run-issue-workflow/scripts/run-target-writer-wait.mjs";
import {
  createWorkflowControlStore,
  LEGACY_WORKFLOW_CHECKPOINT_SCHEMA,
  WORKFLOW_CHECKPOINT_PROFILES,
  WORKFLOW_CHECKPOINT_SCHEMA,
  WORKFLOW_CHECKPOINT_STAGES,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import {
  bindProducerCheckpointOperationIdentity,
  createProducerOperationCheckpoint,
  deriveAggregateVerificationOperationIdentity,
  deriveCloseIssueOperationIdentity,
  deriveExecuteIssueOperationIdentity,
  deriveSpecReservationOperationIdentity,
  deriveToSpecPublicationOperationIdentity,
  deriveWorkflowOperationIdentity,
  WORKFLOW_OPERATION_IDENTITY_SCHEMA,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const closeAuthorityEvidenceFor = (issueId, overrides = {}) => ({
  trackerIdentity: `github-issue:${issueId}:version:1`,
  targetHead: "a".repeat(40),
  candidateCommit: "b".repeat(40),
  completionEvidenceId: `github-comment:completion-${issueId}`,
  completionBodySha256: `sha256:${"d".repeat(64)}`,
  worktreeIdentity: `registered-worktree:issue-${issueId}`,
  ...overrides,
});

const withCloseAuthorityEvidence = (value) => value.completionState === "COMPLETE"
  ? { ...value, closeAuthorityEvidence: value.closeAuthorityEvidence ?? closeAuthorityEvidenceFor(value.issueId) }
  : value;

const node = (issueId, blockers = []) => ({
  issueId,
  blockers,
  trackerState: "OPEN",
  taskState: "NONE",
  completionState: "NONE",
  candidateReachable: false,
  worktreeState: "ABSENT",
});

const grant = {
  schema: "dag-run-event:v1",
  sequence: 1,
  type: "grant.recorded",
  at: "2026-08-30T00:00:00.000Z",
  runIdentity: {
    runId: "run-12",
    specId: "12",
    approvedScopeHash: "sha256:scope-12",
    target: "features/ron",
    classification: "MULTI",
    decompositionIdentity: "decomposition:12:01-05",
  },
  maxParallel: 3,
};

const grantFor = (classification = "SINGLE") => ({
  ...grant,
  runIdentity: {
    ...grant.runIdentity,
    classification,
    decompositionIdentity: classification === "MULTI" ? grant.runIdentity.decompositionIdentity : null,
  },
});

const dispatchEvent = (issueId, attempt = 1, sequence = 2) => ({
  schema: "dag-run-event:v1",
  sequence,
  type: "dispatch.recorded",
  at: `2026-08-30T00:0${sequence}:00.000Z`,
  issueId,
  attempt,
  taskRef: { threadId: `thread-${issueId}`, hostId: "local" },
});

const retryEvent = (issueId, attempt, sequence) => ({
  schema: "dag-run-event:v1",
  sequence,
  type: "retry.recorded",
  at: `2026-08-30T00:0${sequence}:00.000Z`,
  issueId,
  attempt,
  reason: "transient_terminal_failure",
  priorTaskRef: { threadId: `thread-${issueId}`, hostId: "local" },
  replacement: null,
});

const facts = (nodes) => ({
  schema: "dag-run-facts:v1",
  run: {
    runId: "run-12",
    specId: "12",
    approvedScopeHash: "sha256:scope-12",
    target: "features/ron",
    classification: "MULTI",
    decompositionIdentity: "decomposition:12:01-05",
    reconciled: true,
    trackerAvailable: true,
    targetState: "CLEAN",
    targetHead: "a".repeat(40),
    closeWriterRunId: null,
    closeWriterState: "ABSENT",
    parentTrackerState: "OPEN",
    parentTrackerIdentity: "github-issue:12:version:1",
  },
  nodes: nodes.map(withCloseAuthorityEvidence),
  contradictions: [],
  journal: [grant],
});

const preWaitEvidenceFor = (input) => {
  const status = reduceRun(input);
  const currentGrant = input.journal.findLast(({ type }) => type === "grant.recorded");
  return createTargetWriterWaitEvidence({
    runIdentity: input.run,
    grant: currentGrant,
    run: input.run,
    nodes: input.nodes,
    controlRevision: status.run.controlRevision,
  });
};

const createGitCommonDirFixture = (prefix) => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-b", "target"], { cwd: root, stdio: "ignore" });
  const relativeCommonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return { root, gitCommonDir: resolve(root, relativeCommonDir) };
};

const checkpointIdentity = (overrides = {}) => ({
  repositoryId: "github:ron03wlb/skills",
  producerCommand: "to-spec",
  specOperationId: "31:primary",
  target: "features/ron",
  baseline: "c9c9aafef8c0a59eb8535fdfe12640b51a947448",
  initialTargetState: "CLEAN",
  planPath: "superpowers/docs/plans/spec-31.md",
  generatedContentIdentity: `sha256:${"1".repeat(64)}`,
  ...overrides,
});

const checkpointIdentityV2 = (overrides = {}) => ({
  repositoryId: "github:ron03wlb/skills",
  specId: "31",
  producerCommand: "to-spec",
  operationId: "primary",
  profileVersion: "v1",
  target: "features/ron",
  baseline: "c9c9aafef8c0a59eb8535fdfe12640b51a947448",
  bindings: {
    planningSeal: "c9c9aafef8c0a59eb8535fdfe12640b51a947448",
    plan: {
      path: "superpowers/docs/plans/spec-31.md",
      contentIdentity: `sha256:${"1".repeat(64)}`,
    },
  },
  ...overrides,
});

const currentCheckpointIdentity = (overrides = {}) => {
  const identity = checkpointIdentityV2({ profileVersion: "v2", ...overrides });
  const operationIdentity = deriveWorkflowOperationIdentity({
    repositoryId: identity.repositoryId,
    specId: identity.specId,
    approvedPublicationIdentity: identity.bindings.approvedScopeIdentity,
    producer: identity.producerCommand,
    stage: identity.producerCommand === "to-spec" ? "publication" : "decomposition",
    issueId: null,
  });
  return {
    ...identity,
    operationId: operationIdentity.key,
    bindings: { ...identity.bindings, operationIdentity },
  };
};

const writeLegacyCheckpoint = ({ gitCommonDir, identity, progress = [] }) => {
  const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const scopeKey = `sha256:${digest({
    repositoryId: identity.repositoryId,
    specOperationId: identity.specOperationId,
  })}`;
  const transactionsRoot = join(gitCommonDir, "matt-workflow-control", "workflow-checkpoints");
  const path = join(transactionsRoot, `${scopeKey.slice("sha256:".length)}.json`);
  const transaction = {
    schema: LEGACY_WORKFLOW_CHECKPOINT_SCHEMA,
    scopeKey,
    transactionId: `sha256:${digest(identity)}`,
    identity,
    progress,
  };
  mkdirSync(transactionsRoot, { recursive: true });
  writeFileSync(path, `${JSON.stringify(transaction, null, 2)}\n`, "utf8");
  return path;
};

const writeStoredCurrentCheckpoint = ({ gitCommonDir, identity, progress = [] }) => {
  const canonicalize = (value) => (Array.isArray(value)
    ? value.map(canonicalize)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
      : value);
  const digest = (value) => createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
  const scopeKey = `sha256:${digest({
    repositoryId: identity.repositoryId,
    specId: identity.specId,
    producerCommand: identity.producerCommand,
    operationId: identity.operationId,
  })}`;
  const transactionsRoot = join(gitCommonDir, "matt-workflow-control", "workflow-checkpoints");
  const path = join(transactionsRoot, `${scopeKey.slice("sha256:".length)}.json`);
  const transaction = {
    schema: WORKFLOW_CHECKPOINT_SCHEMA,
    scopeKey,
    transactionId: `sha256:${digest(identity)}`,
    identity,
    progress,
  };
  mkdirSync(transactionsRoot, { recursive: true });
  writeFileSync(path, `${JSON.stringify(transaction, null, 2)}\n`, "utf8");
  return path;
};

test("operation identity is deterministic and isolates different Spec, Issue, approved revision, stage, and repository", () => {
  const input = {
    repositoryId: "github:ron03wlb/skills",
    specId: "43",
    approvedPublicationIdentity: `sha256:${"1".repeat(64)}`,
    producer: "execute-issue",
    stage: "implementation",
    issueId: "45",
  };
  const first = deriveWorkflowOperationIdentity(input);
  const retry = deriveWorkflowOperationIdentity({ ...input });

  assert.equal(first.schema, WORKFLOW_OPERATION_IDENTITY_SCHEMA);
  assert.match(first.key, /^workflow-op-v1-[a-f0-9]{64}$/u);
  assert.deepEqual(retry, first);
  for (const changed of [
    { specId: "44" },
    { issueId: "46" },
    { approvedPublicationIdentity: `sha256:${"2".repeat(64)}` },
    { producer: "close-issue", stage: "closeout" },
    { repositoryId: "github:ron03wlb/other" },
  ]) {
    assert.notEqual(deriveWorkflowOperationIdentity({ ...input, ...changed }).key, first.key);
  }
  assert.throws(
    () => deriveWorkflowOperationIdentity({ ...input, correlationId: "caller-defined" }),
    /unknown field correlationId/u,
  );
  assert.throws(
    () => deriveWorkflowOperationIdentity({ ...input, issueId: null }),
    /issueId is required/u,
  );
});

test("primary reservation operation identity uses only the immutable proposed-Spec identity before tracker read-back", () => {
  const reservation = deriveSpecReservationOperationIdentity({
    repositoryId: "github:ron03wlb/skills",
    proposedSpecIdentity: `sha256:${"3".repeat(64)}`,
  });
  const retry = deriveSpecReservationOperationIdentity({
    proposedSpecIdentity: `sha256:${"3".repeat(64)}`,
    repositoryId: "github:ron03wlb/skills",
  });

  assert.deepEqual(retry, reservation);
  assert.equal(reservation.specId, null);
  assert.equal(reservation.producer, "to-spec");
  assert.equal(reservation.stage, "reservation");
  assert.equal(reservation.approvedPublicationIdentity, `sha256:${"3".repeat(64)}`);
  assert.notEqual(
    deriveSpecReservationOperationIdentity({
      repositoryId: "github:ron03wlb/skills",
      proposedSpecIdentity: `sha256:${"4".repeat(64)}`,
    }).key,
    reservation.key,
  );
});

test("operation identity owner adapters bind execution, closeout, and aggregate receipts", () => {
  const common = {
    repositoryId: "github:ron03wlb/skills",
    specId: "43",
    approvedPublicationIdentity: `sha256:${"9".repeat(64)}`,
  };
  const execution = deriveExecuteIssueOperationIdentity({ ...common, issueId: "45" });
  const closeout = deriveCloseIssueOperationIdentity({ ...common, issueId: "45" });
  const aggregate = deriveAggregateVerificationOperationIdentity(common);

  assert.equal(execution.producer, "execute-issue");
  assert.equal(execution.stage, "implementation");
  assert.equal(closeout.producer, "close-issue");
  assert.equal(closeout.stage, "closeout");
  assert.equal(aggregate.producer, "verify-target-before-push");
  assert.equal(aggregate.stage, "aggregate-verification");
  assert.equal(aggregate.issueId, null);
  assert.notEqual(execution.key, closeout.key);
});

test("checkpoint receipt owner derives current operations outside the thin store", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-operation-receipt-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const proposed = checkpointIdentityV2({
      profileVersion: "v2",
      bindings: {
        approvedScopeIdentity: `sha256:${"5".repeat(64)}`,
        classification: "SINGLE",
        planningSeal: "c".repeat(40),
      },
    });
    const created = createProducerOperationCheckpoint({ store, identity: proposed });

    assert.deepEqual(createProducerOperationCheckpoint({ store, identity: proposed }), created);
    assert.equal(created.identity.operationId, created.identity.bindings.operationIdentity.key);
    assert.notEqual(created.identity.operationId, proposed.operationId);

    const mismatchedReceipt = deriveToSpecPublicationOperationIdentity({
      repositoryId: proposed.repositoryId,
      specId: "different-spec",
      approvedPublicationIdentity: proposed.bindings.approvedScopeIdentity,
    });
    const mismatched = {
      ...proposed,
      operationId: mismatchedReceipt.key,
      bindings: { ...proposed.bindings, operationIdentity: mismatchedReceipt },
    };
    assert.throws(
      () => bindProducerCheckpointOperationIdentity(mismatched),
      /identity.*mismatch/u,
    );
    assert.throws(
      () => createProducerOperationCheckpoint({ store, identity: mismatched }),
      /identity.*mismatch/u,
    );
    assert.strictEqual(mismatched.bindings.operationIdentity, mismatchedReceipt);

    const opaque = checkpointIdentityV2({
      specId: "99",
      operationId: "store-owned-opaque-operation",
      profileVersion: "v2",
      bindings: {
        approvedScopeIdentity: `sha256:${"6".repeat(64)}`,
        classification: "SINGLE",
        planningSeal: "d".repeat(40),
      },
    });
    assert.equal(store.createCheckpoint(opaque).identity.operationId, opaque.operationId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("operation identity enforcement preserves stored current and frozen profile-v1 resume evidence", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-operation-compatibility-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const storedCurrent = checkpointIdentityV2({
      operationId: "pre-identity-v2-operation",
      profileVersion: "v2",
      bindings: {
        approvedScopeIdentity: `sha256:${"8".repeat(64)}`,
        classification: "SINGLE",
        planningSeal: "f".repeat(40),
      },
    });
    writeStoredCurrentCheckpoint({ gitCommonDir, identity: storedCurrent });

    assert.equal(store.readCheckpoint(storedCurrent).state, "INCOMPLETE");
    assert.equal(store.createCheckpoint(storedCurrent).identity.operationId, "pre-identity-v2-operation");
    assert.equal(store.advanceCheckpoint({
      identity: storedCurrent,
      stage: "planning_seal.read_back",
      receipt: { planningSeal: "f".repeat(40), state: "reused" },
    }).nextStage, "publication.read_back");

    const frozenProfile = checkpointIdentityV2({ specId: "32", operationId: "frozen-profile-v1" });
    assert.throws(
      () => store.createCheckpoint(frozenProfile),
      (error) => error.code === "WORKFLOW_CHECKPOINT_PROFILE_CREATE_UNSUPPORTED",
    );
    writeStoredCurrentCheckpoint({ gitCommonDir, identity: frozenProfile });
    assert.equal(store.createCheckpoint(frozenProfile).nextStage, "plan.written");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const runReadyFacts = ({ classification = "SINGLE" } = {}) => {
  const producerCommand = classification === "SINGLE" ? "to-spec" : "to-tickets";
  const recordIdentities = classification === "SINGLE"
    ? ["IC_to_spec"]
    : ["IC_to_spec", "IC_to_tickets"];
  const decompositionIdentity = classification === "SINGLE" ? null : "IC_decomposition";
  const authority = {
    specId: "31",
    target: "features/ron",
    planningSeal: "c".repeat(40),
    classification,
    approvedScopeHash: `sha256:${"2".repeat(64)}`,
    decompositionIdentity,
  };
  return {
    schema: RUN_READY_FACT_SCHEMA,
    authority,
    targetState: "CLEAN",
    targetOwnership: "NONE",
    checkpoint: {
      state: "COMPLETED",
      producerCommand,
      profileVersion: "v1",
      transactionIdentity: `sha256:${"3".repeat(64)}`,
      specId: authority.specId,
      target: authority.target,
      planningSeal: authority.planningSeal,
      classification: authority.classification,
      approvedScopeHash: authority.approvedScopeHash,
      baseline: "a".repeat(40),
      initialTargetState: "CLEAN",
      planPath: "superpowers/docs/plans/spec-31.md",
      generatedContentIdentity: `sha256:${"4".repeat(64)}`,
      firstUnsatisfiedStage: null,
      handoffIdentity: `${producerCommand}:handoff:31`,
    },
    handoff: {
      identity: `${producerCommand}:handoff:31`,
      producerCommand,
      specId: authority.specId,
      target: authority.target,
      planningSeal: authority.planningSeal,
      classification,
      approvedScopeHash: authority.approvedScopeHash,
      recordIdentities,
      decompositionIdentity,
    },
    trackerRecordIdentities: recordIdentities,
    decompositionIdentity,
    evidence: [],
  };
};

const currentMultiRunReadyFacts = () => {
  const input = runReadyFacts({ classification: "MULTI" });
  const decompositionDigest = `sha256:${"5".repeat(64)}`;
  const decompositionMapping = {
    "37/01": "39",
    "37/02": "40",
    "37/03": "41",
  };
  const blockerEdges = [["39", "40"], ["40", "41"]];
  const readyFrontier = ["39"];
  const decompositionReadBack = {
    decompositionIdentity: input.decompositionIdentity,
    decompositionDigest,
  };
  const readyStateReadBack = { frontier: readyFrontier };
  delete input.checkpoint.initialTargetState;
  delete input.checkpoint.planPath;
  delete input.checkpoint.generatedContentIdentity;
  input.checkpoint.profileVersion = "v2";
  input.checkpoint.operationId = `decomposition:sha256:${"2".repeat(64)}`;
  input.checkpoint.bindings = {
    approvedScopeIdentity: input.authority.approvedScopeHash,
    classification: input.authority.classification,
    planningSeal: input.authority.planningSeal,
    upstream: {
      handoffIdentity: "to-spec:handoff:37",
      publicationIdentity: "tracker-version:37",
    },
  };
  input.checkpoint.stageReceipts = {
    decompositionReadBack,
    readyStateReadBack,
  };
  input.handoff = {
    ...input.handoff,
    upstreamPublicationIdentity: "tracker-version:37",
    upstreamHandoffIdentity: "to-spec:handoff:37",
    operationReceipt: {
      transactionIdentity: input.checkpoint.transactionIdentity,
      decompositionReadBack,
      readyStateReadBack,
    },
    decompositionDigest,
    decompositionMapping,
    blockerEdges,
    recordIdentities: ["tracker-version:37", input.decompositionIdentity],
  };
  input.trackerRecordIdentities = [...input.handoff.recordIdentities];
  input.decompositionDigest = decompositionDigest;
  input.decompositionMapping = decompositionMapping;
  input.blockerEdges = blockerEdges;
  input.readyFrontier = readyFrontier;
  return input;
};

const currentSingleRunReadyFacts = () => {
  const input = runReadyFacts({ classification: "SINGLE" });
  const publicationReadBack = {
    publicationIdentity: "tracker-version:31",
    trackerIdentity: "issue:31",
  };
  delete input.checkpoint.initialTargetState;
  delete input.checkpoint.planPath;
  delete input.checkpoint.generatedContentIdentity;
  input.checkpoint.profileVersion = "v2";
  input.checkpoint.operationId = "primary";
  input.checkpoint.bindings = {
    approvedScopeIdentity: input.authority.approvedScopeHash,
    classification: input.authority.classification,
    planningSeal: input.authority.planningSeal,
  };
  input.checkpoint.stageReceipts = {
    planningSealReadBack: {
      planningSeal: input.authority.planningSeal,
      state: "reused",
    },
    publicationReadBack,
  };
  input.handoff = {
    ...input.handoff,
    transactionIdentity: input.checkpoint.transactionIdentity,
    publicationIdentity: publicationReadBack.publicationIdentity,
    trackerIdentity: publicationReadBack.trackerIdentity,
    recordIdentities: [publicationReadBack.publicationIdentity],
  };
  input.trackerRecordIdentities = [...input.handoff.recordIdentities];
  return input;
};

test("Run-ready handoff reduces exact Single and Multi producer evidence to READY", () => {
  for (const classification of ["SINGLE", "MULTI"]) {
    const result = reduceRunReadyHandoff(runReadyFacts({ classification }));

    assert.equal(result.schema, RUN_READY_RESULT_SCHEMA);
    assert.equal(result.state, "READY");
    assert.equal(result.reasonCode, null);
    assert.equal(result.nextOwner, "run-issue-workflow");
    assert.equal(result.affectedScope.specId, "31");
    assert.equal(result.observed.producerCommand, classification === "SINGLE" ? "to-spec" : "to-tickets");
  }
});

test("Run-ready handoff consumes the current to-tickets composite receipt", () => {
  const result = reduceRunReadyHandoff(currentMultiRunReadyFacts());

  assert.equal(result.state, "READY");
  assert.equal(result.reasonCode, null);
  assert.equal(result.observed.checkpointProfileVersion, "v2");
  assert.equal(result.observed.handoffUpstreamPublicationIdentity, "tracker-version:37");
  assert.equal(result.observed.handoffUpstreamHandoffIdentity, "to-spec:handoff:37");
  assert.equal(result.observed.handoffDecompositionDigest, `sha256:${"5".repeat(64)}`);
});

test("Run-ready handoff consumes the current to-spec publication receipt", () => {
  const result = reduceRunReadyHandoff(currentSingleRunReadyFacts());

  assert.equal(result.state, "READY");
  assert.equal(result.reasonCode, null);
  assert.equal(result.observed.handoffTransactionIdentity, `sha256:${"3".repeat(64)}`);
  assert.equal(result.observed.handoffPublicationIdentity, "tracker-version:31");
});

test("Run-ready handoff rejects a current to-spec handoff that drifts from its transaction or publication", () => {
  const changedTransaction = currentSingleRunReadyFacts();
  changedTransaction.handoff.transactionIdentity = `sha256:${"9".repeat(64)}`;

  const changedPublication = currentSingleRunReadyFacts();
  changedPublication.handoff.publicationIdentity = "tracker-version:changed";

  const changedReceipt = currentSingleRunReadyFacts();
  changedReceipt.checkpoint.stageReceipts.publicationReadBack = {
    ...changedReceipt.checkpoint.stageReceipts.publicationReadBack,
    trackerIdentity: "issue:changed",
  };

  for (const input of [changedTransaction, changedPublication, changedReceipt]) {
    const result = reduceRunReadyHandoff(input);
    assert.equal(result.state, "UNKNOWN");
    assert.equal(result.reasonCode, "publication_handoff_identity_conflict");
  }
});

test("Run-ready handoff rejects a current composite receipt that drifts from tracker or operation read-back", () => {
  const changedMapping = currentMultiRunReadyFacts();
  changedMapping.handoff.decompositionMapping = { ...changedMapping.handoff.decompositionMapping, "37/03": "99" };

  const changedOperationReceipt = currentMultiRunReadyFacts();
  changedOperationReceipt.handoff.operationReceipt = {
    ...changedOperationReceipt.handoff.operationReceipt,
    readyStateReadBack: { frontier: [] },
  };

  const changedUpstream = currentMultiRunReadyFacts();
  changedUpstream.handoff.upstreamHandoffIdentity = "to-spec:handoff:changed";

  for (const input of [changedMapping, changedOperationReceipt, changedUpstream]) {
    const result = reduceRunReadyHandoff(input);
    assert.equal(result.state, "UNKNOWN");
    assert.equal(result.reasonCode, "composite_handoff_identity_conflict");
  }
});

test("Run-ready handoff returns the exact current to-tickets retry stage without owning target dirt", () => {
  for (const firstUnsatisfiedStage of [
    "decomposition.read_back",
    "ready_state.read_back",
    "handoff.completed",
  ]) {
    const input = currentMultiRunReadyFacts();
    input.checkpoint = {
      ...input.checkpoint,
      state: firstUnsatisfiedStage === "decomposition.read_back" ? "ACTIVE" : "INCOMPLETE",
      firstUnsatisfiedStage,
      handoffIdentity: null,
    };
    input.handoff = null;
    input.trackerRecordIdentities = [];
    input.decompositionIdentity = null;

    const result = reduceRunReadyHandoff(input);
    assert.equal(result.state, "INCOMPLETE");
    assert.equal(result.firstUnsatisfiedStage, firstUnsatisfiedStage);
    assert.equal(result.retryCommand, "/to-tickets 31");

    input.targetState = "DIRTY";
    input.targetOwnership = "UNOWNED";
    assert.equal(reduceRunReadyHandoff(input).state, "INCOMPLETE");
    input.targetOwnership = "EXACT_PRODUCER";
    assert.equal(reduceRunReadyHandoff(input).state, "UNKNOWN");
  }
});

test("Run-ready handoff returns actionable INCOMPLETE for one exact producer transaction", () => {
  const stagesByClassification = {
    SINGLE: [
      "plan.written",
      "checkpoint.committed",
      "attestation.read_back",
      "publication.read_back",
      "handoff.completed",
    ],
    MULTI: [
      "plan.written",
      "checkpoint.committed",
      "attestation.read_back",
      "decomposition.read_back",
      "ready_state.read_back",
      "handoff.completed",
    ],
  };
  for (const [classification, stages] of Object.entries(stagesByClassification)) {
    for (const [index, firstUnsatisfiedStage] of stages.entries()) {
      const input = runReadyFacts({ classification });
      input.checkpoint = {
        ...input.checkpoint,
        state: index === 0 ? "ACTIVE" : "INCOMPLETE",
        firstUnsatisfiedStage,
        handoffIdentity: null,
      };
      input.handoff = null;
      input.trackerRecordIdentities = [];
      input.decompositionIdentity = null;
      input.targetOwnership = input.targetState === "CLEAN" ? "NONE" : "EXACT_PRODUCER";

      const result = reduceRunReadyHandoff(input);

      assert.equal(result.state, "INCOMPLETE");
      assert.equal(result.reasonCode, "producer_incomplete");
      assert.equal(result.transactionIdentity, input.checkpoint.transactionIdentity);
      assert.equal(result.firstUnsatisfiedStage, firstUnsatisfiedStage);
      assert.equal(result.retryCommand, `/${input.checkpoint.producerCommand} 31`);
      assert.equal(result.nextOwner, input.checkpoint.producerCommand);
      assert.match(result.noAutomaticTransition, /Run does not resume or repair/u);
      assert.deepEqual(result.recoveryPredicates, [
        "transaction_is_inactive",
        "exact_retry_identity_matches",
        "producer_completes_handoff",
      ]);
    }
  }
});

test("Run-ready handoff returns stable UNKNOWN diagnoses for unowned or contradictory evidence", () => {
  const dirty = runReadyFacts();
  dirty.targetState = "DIRTY";
  dirty.targetOwnership = "UNOWNED";

  const wrongProducer = runReadyFacts({ classification: "MULTI" });
  wrongProducer.handoff.producerCommand = "to-spec";

  const missingHandoff = runReadyFacts();
  missingHandoff.checkpoint.state = "ABSENT";
  missingHandoff.handoff = null;

  const legacyPlan = runReadyFacts();
  legacyPlan.checkpoint.state = "LEGACY_PLAN_ONLY";
  legacyPlan.handoff = null;

  const trackerConflict = runReadyFacts({ classification: "MULTI" });
  trackerConflict.trackerRecordIdentities = ["IC_to_spec", "IC_changed"];

  const decompositionConflict = runReadyFacts({ classification: "MULTI" });
  decompositionConflict.decompositionIdentity = "IC_changed";

  const ambiguous = runReadyFacts();
  ambiguous.checkpoint.state = "MULTIPLE";

  for (const [input, reasonCode] of [
    [dirty, "target_dirty_without_owner"],
    [wrongProducer, "producer_handoff_identity_conflict"],
    [missingHandoff, "producer_handoff_missing"],
    [legacyPlan, "legacy_plan_only"],
    [trackerConflict, "tracker_record_identity_conflict"],
    [decompositionConflict, "decomposition_identity_conflict"],
    [ambiguous, "producer_evidence_ambiguous"],
    [{}, "invalid_run_ready_facts"],
  ]) {
    const result = reduceRunReadyHandoff(input);
    assert.equal(result.state, "UNKNOWN");
    assert.equal(result.reasonCode, reasonCode);
    assert.equal(result.nextOwner, "human");
    assert.match(result.noAutomaticTransition, /does not authorize/u);
    assert.ok(result.evidence.length > 0);
    assert.ok(result.recoveryPredicates.length > 0);
  }

  const wrongProducerResult = reduceRunReadyHandoff(wrongProducer);
  assert.equal(wrongProducerResult.observed.handoffProducerCommand, "to-spec");
  assert.equal(wrongProducerResult.observed.handoffTarget, "features/ron");
  assert.equal(wrongProducerResult.observed.handoffPlanningSeal, "c".repeat(40));
  assert.equal(wrongProducerResult.observed.handoffClassification, "MULTI");
  assert.equal(wrongProducerResult.observed.handoffApprovedScopeHash, `sha256:${"2".repeat(64)}`);
});

test("Run-ready handoff requires exact producer ownership for dirty incomplete state", () => {
  const input = runReadyFacts();
  input.checkpoint = {
    ...input.checkpoint,
    state: "INCOMPLETE",
    firstUnsatisfiedStage: "checkpoint.committed",
    handoffIdentity: null,
  };
  input.handoff = null;
  input.trackerRecordIdentities = [];
  input.targetState = "DIRTY";
  input.targetOwnership = "UNOWNED";

  assert.equal(reduceRunReadyHandoff(input).state, "UNKNOWN");
  input.targetOwnership = "EXACT_PRODUCER";
  assert.equal(reduceRunReadyHandoff(input).state, "INCOMPLETE");
});

test("workflow checkpoint producer profiles create only supported current transactions", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-checkpoint-profiles-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const toSpec = checkpointIdentityV2();
    const toTickets = checkpointIdentityV2({
      producerCommand: "to-tickets",
      operationId: `decomposition:sha256:${"2".repeat(64)}`,
      bindings: {
        approvedScopeIdentity: `sha256:${"2".repeat(64)}`,
        planningSeal: "c9c9aafef8c0a59eb8535fdfe12640b51a947448",
      },
    });
    const currentToSpec = currentCheckpointIdentity({
      baseline: "d".repeat(40),
      bindings: {
        approvedScopeIdentity: `sha256:${"3".repeat(64)}`,
        classification: "SINGLE",
        planningSeal: "d".repeat(40),
      },
    });
    const currentToTickets = currentCheckpointIdentity({
      producerCommand: "to-tickets",
      baseline: "e".repeat(40),
      bindings: {
        approvedScopeIdentity: `sha256:${"4".repeat(64)}`,
        classification: "MULTI",
        planningSeal: "e".repeat(40),
        upstream: {
          handoffIdentity: "IC_to_spec_handoff",
          publicationIdentity: "tracker-version:37",
          trackerIdentity: "issue:37",
        },
      },
    });

    assert.equal(WORKFLOW_CHECKPOINT_SCHEMA, "workflow-checkpoint-transaction:v2");
    assert.deepEqual(WORKFLOW_CHECKPOINT_PROFILES["to-spec@v1"], [
      "plan.written",
      "checkpoint.committed",
      "attestation.read_back",
      "publication.read_back",
      "handoff.completed",
    ]);
    assert.deepEqual(WORKFLOW_CHECKPOINT_PROFILES["to-tickets@v1"], [
      "plan.written",
      "checkpoint.committed",
      "attestation.read_back",
      "decomposition.read_back",
      "ready_state.read_back",
      "handoff.completed",
    ]);
    assert.deepEqual(WORKFLOW_CHECKPOINT_PROFILES["to-spec@v2"], [
      "planning_seal.read_back",
      "publication.read_back",
      "handoff.completed",
    ]);
    assert.deepEqual(WORKFLOW_CHECKPOINT_PROFILES["to-tickets@v2"], [
      "decomposition.read_back",
      "ready_state.read_back",
      "handoff.completed",
    ]);

    writeStoredCurrentCheckpoint({ gitCommonDir, identity: toSpec });
    writeStoredCurrentCheckpoint({ gitCommonDir, identity: toTickets });
    const specCheckpoint = store.createCheckpoint(toSpec);
    const ticketsCheckpoint = store.createCheckpoint(toTickets);
    const currentSpecCheckpoint = store.createCheckpoint(currentToSpec);
    const currentTicketsCheckpoint = store.createCheckpoint(currentToTickets);
    assert.equal(specCheckpoint.schema, WORKFLOW_CHECKPOINT_SCHEMA);
    assert.equal(specCheckpoint.nextStage, "plan.written");
    assert.deepEqual(Object.keys(specCheckpoint.identity.bindings), ["plan", "planningSeal"]);
    assert.equal(ticketsCheckpoint.schema, WORKFLOW_CHECKPOINT_SCHEMA);
    assert.equal(ticketsCheckpoint.nextStage, "plan.written");
    assert.equal(currentSpecCheckpoint.nextStage, "planning_seal.read_back");
    assert.deepEqual(Object.keys(currentSpecCheckpoint.identity.bindings), [
      "approvedScopeIdentity",
      "classification",
      "operationIdentity",
      "planningSeal",
    ]);
    assert.equal(currentTicketsCheckpoint.nextStage, "decomposition.read_back");
    assert.deepEqual(Object.keys(currentTicketsCheckpoint.identity.bindings), [
      "approvedScopeIdentity",
      "classification",
      "operationIdentity",
      "planningSeal",
      "upstream",
    ]);
    assert.throws(
      () => store.advanceCheckpoint({
        identity: currentToSpec,
        stage: "plan.written",
        receipt: { path: "superpowers/docs/plans/forbidden.md" },
      }),
      /Unknown workflow checkpoint stage plan\.written/u,
    );
    const sealed = store.advanceCheckpoint({
      identity: currentToSpec,
      stage: "planning_seal.read_back",
      receipt: { planningSeal: "d".repeat(40), state: "reused" },
    });
    assert.equal(sealed.nextStage, "publication.read_back");
    assert.deepEqual(store.createCheckpoint(currentToSpec), sealed);
    const publicationReceipt = { publicationIdentity: "tracker-version:2", trackerIdentity: "issue:31" };
    const published = store.advanceCheckpoint({
      identity: currentToSpec,
      stage: "publication.read_back",
      receipt: publicationReceipt,
    });
    assert.equal(published.nextStage, "handoff.completed");
    assert.deepEqual(store.advanceCheckpoint({
      identity: currentToSpec,
      stage: "publication.read_back",
      receipt: publicationReceipt,
    }), published);
    assert.throws(
      () => store.advanceCheckpoint({
        identity: currentToSpec,
        stage: "publication.read_back",
        receipt: { ...publicationReceipt, publicationIdentity: "tracker-version:drifted" },
      }),
      (error) => error.code === "WORKFLOW_CHECKPOINT_RESULT_MISMATCH",
    );
    const completed = store.advanceCheckpoint({
      identity: currentToSpec,
      stage: "handoff.completed",
      receipt: { handoffIdentity: "handoff:31:revision:2" },
    });
    assert.equal(completed.state, "COMPLETED");
    assert.equal(completed.nextStage, null);
    assert.throws(
      () => store.advanceCheckpoint({
        identity: currentToTickets,
        stage: "plan.written",
        receipt: { path: "superpowers/docs/plans/forbidden.md" },
      }),
      /Unknown workflow checkpoint stage plan\.written/u,
    );
    const decomposed = store.advanceCheckpoint({
      identity: currentToTickets,
      stage: "decomposition.read_back",
      receipt: {
        decompositionIdentity: "IC_decomposition",
        decompositionDigest: `sha256:${"5".repeat(64)}`,
      },
    });
    assert.equal(decomposed.nextStage, "ready_state.read_back");
    const ready = store.advanceCheckpoint({
      identity: currentToTickets,
      stage: "ready_state.read_back",
      receipt: { frontier: ["40"] },
    });
    assert.equal(ready.nextStage, "handoff.completed");
    const ticketsCompleted = store.advanceCheckpoint({
      identity: currentToTickets,
      stage: "handoff.completed",
      receipt: { handoffIdentity: "handoff:37:decomposition" },
    });
    assert.equal(ticketsCompleted.state, "COMPLETED");
    assert.equal(ticketsCompleted.nextStage, null);
    assert.notEqual(specCheckpoint.scopeKey, ticketsCheckpoint.scopeKey);
    assert.notEqual(specCheckpoint.scopeKey, currentSpecCheckpoint.scopeKey);
    assert.notEqual(ticketsCheckpoint.scopeKey, currentTicketsCheckpoint.scopeKey);
    assert.equal(Object.hasOwn(store, "classifyCheckpoints"), false);

    assert.throws(
      () => store.createCheckpoint(checkpointIdentityV2({ producerCommand: "caller-defined" })),
      /Unsupported workflow checkpoint profile/u,
    );
    assert.throws(
      () => store.createCheckpoint(checkpointIdentityV2({ profileVersion: "v3" })),
      /Unsupported workflow checkpoint profile/u,
    );
    assert.throws(
      () => store.createCheckpoint(checkpointIdentityV2({ stages: ["caller.stage"] })),
      /unknown field stages/u,
    );
    assert.throws(
      () => store.createCheckpoint(checkpointIdentityV2({ bindings: {} })),
      /non-empty object/u,
    );
    assert.throws(
      () => store.createCheckpoint(checkpointIdentityV2({ bindings: { apiToken: "do-not-store" } })),
      /secret field apiToken/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow checkpoint operations are exact, retryable, and isolated on one target", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-checkpoint-operations-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const first = checkpointIdentityV2({ profileVersion: "v2" });
    const created = store.createCheckpoint(first);

    assert.equal(created.state, "INCOMPLETE");
    assert.equal(created.nextStage, "planning_seal.read_back");
    assert.deepEqual(store.createCheckpoint(first), created);
    assert.deepEqual(store.readCheckpoint(first), created);
    assert.deepEqual(store.createCheckpoint(checkpointIdentityV2({
      profileVersion: "v2",
      bindings: {
        plan: {
          contentIdentity: `sha256:${"1".repeat(64)}`,
          path: "superpowers/docs/plans/spec-31.md",
        },
        planningSeal: "c9c9aafef8c0a59eb8535fdfe12640b51a947448",
      },
    })), created);
    for (const drift of [
      { profileVersion: "v2", target: "features/changed" },
      { profileVersion: "v2", baseline: "b".repeat(40) },
      { profileVersion: "v2", bindings: { planningSeal: "b".repeat(40) } },
    ]) {
      assert.throws(
        () => store.createCheckpoint(checkpointIdentityV2(drift)),
        (error) => error.code === "WORKFLOW_CHECKPOINT_IDENTITY_MISMATCH",
      );
    }
    const revision = checkpointIdentityV2({
      operationId: "revision:2",
      profileVersion: "v2",
      baseline: "b".repeat(40),
      bindings: { planningSeal: "b".repeat(40) },
    });
    const decomposition = checkpointIdentityV2({
      producerCommand: "to-tickets",
      operationId: "decomposition:approved-scope",
      profileVersion: "v2",
      bindings: { approvedScopeIdentity: "approved-scope" },
    });
    assert.equal(store.createCheckpoint(revision).state, "INCOMPLETE");
    assert.equal(store.createCheckpoint(decomposition).state, "INCOMPLETE");
    assert.equal(
      readdirSync(join(gitCommonDir, "matt-workflow-control", "workflow-checkpoints"))
        .filter((name) => name.endsWith(".json")).length,
      3,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow checkpoint writer locks only one exact operation", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-checkpoint-operation-lock-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const first = checkpointIdentityV2({ profileVersion: "v2" });
    const second = checkpointIdentityV2({ operationId: "revision:2", profileVersion: "v2" });
    const firstCheckpoint = store.createCheckpoint(first);
    const secondCheckpoint = store.createCheckpoint(second);
    const writersRoot = join(gitCommonDir, "matt-workflow-control", "workflow-checkpoint-writers");
    mkdirSync(writersRoot, { recursive: true });
    const firstLock = join(writersRoot, `${firstCheckpoint.scopeKey.slice("sha256:".length)}.lock`);
    mkdirSync(firstLock);

    assert.throws(
      () => store.readCheckpoint(first),
      (error) => error.code === "WORKFLOW_CHECKPOINT_STATE_UNKNOWN",
    );
    assert.deepEqual(store.readCheckpoint(second), secondCheckpoint);

    rmSync(firstLock, { recursive: true, force: false });
    assert.deepEqual(store.readCheckpoint(first), firstCheckpoint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow checkpoint ignores a legacy writer owned by another producer", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-checkpoint-legacy-writer-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const legacyIdentity = checkpointIdentity({ specOperationId: "36:primary" });
    const legacyPath = writeLegacyCheckpoint({ gitCommonDir, identity: legacyIdentity });
    const legacy = JSON.parse(readFileSync(legacyPath, "utf8"));
    const writersRoot = join(gitCommonDir, "matt-workflow-control", "workflow-checkpoint-writers");
    const legacyLock = join(writersRoot, `${legacy.scopeKey.slice("sha256:".length)}.lock`);
    mkdirSync(legacyLock, { recursive: true });
    writeFileSync(join(legacyLock, "owner.json"), `${JSON.stringify({
      schema: "workflow-checkpoint-writer:v1",
      operation: "advance",
      scopeKey: legacy.scopeKey,
      transactionId: legacy.transactionId,
      identity: legacyIdentity,
    }, null, 2)}\n`, "utf8");

    const current = checkpointIdentityV2({
      specId: "36",
      producerCommand: "to-tickets",
      profileVersion: "v2",
      bindings: { approvedScopeIdentity: "approved-scope" },
    });
    assert.equal(store.createCheckpoint(current).schema, WORKFLOW_CHECKPOINT_SCHEMA);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow checkpoint partial persistence blocks only its exact operation", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-checkpoint-operation-transient-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const first = checkpointIdentityV2({ profileVersion: "v2" });
    const second = checkpointIdentityV2({ operationId: "revision:2", profileVersion: "v2" });
    const firstCheckpoint = store.createCheckpoint(first);
    const secondCheckpoint = store.createCheckpoint(second);

    const writersRoot = join(gitCommonDir, "matt-workflow-control", "workflow-checkpoint-writers");
    const scopeHash = firstCheckpoint.scopeKey.slice("sha256:".length);
    const partial = join(writersRoot, `${scopeHash}.tmp-interrupted`);
    writeFileSync(partial, "partial", "utf8");

    assert.throws(
      () => store.readCheckpoint(first),
      (error) => error.code === "WORKFLOW_CHECKPOINT_STATE_UNKNOWN",
    );
    assert.deepEqual(store.readCheckpoint(second), secondCheckpoint);
    rmSync(partial);
    assert.deepEqual(store.readCheckpoint(first), firstCheckpoint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow checkpoint stage receipts are opaque, canonical, and profile ordered", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-checkpoint-receipts-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const identity = checkpointIdentityV2({
      producerCommand: "to-tickets",
      operationId: "decomposition:approved-scope",
      bindings: {
        planningSeal: "c9c9aafef8c0a59eb8535fdfe12640b51a947448",
        approvedScopeIdentity: "approved-scope",
      },
    });
    writeStoredCurrentCheckpoint({ gitCommonDir, identity });
    store.createCheckpoint(identity);

    assert.throws(
      () => store.advanceCheckpoint({
        identity,
        stage: "checkpoint.committed",
        receipt: { arbitrary: "receipt" },
      }),
      (error) => error.code === "WORKFLOW_CHECKPOINT_STAGE_OUT_OF_ORDER",
    );

    const receipts = [
      { nested: { z: 1, a: 2 }, arbitrary: "plan" },
      { arbitrary: "commit" },
      { arbitrary: "attestation" },
      { arbitrary: "decomposition" },
      { arbitrary: "ready" },
      { arbitrary: "handoff" },
    ];
    let current;
    WORKFLOW_CHECKPOINT_PROFILES["to-tickets@v1"].forEach((stage, index) => {
      current = store.advanceCheckpoint({ identity, stage, receipt: receipts[index] });
      assert.deepEqual(
        store.advanceCheckpoint({ identity, stage, receipt: receipts[index] }),
        current,
      );
    });

    assert.equal(current.state, "COMPLETED");
    assert.equal(current.nextStage, null);
    assert.deepEqual(current.progress[0].receipt, {
      arbitrary: "plan",
      nested: { a: 2, z: 1 },
    });
    assert.deepEqual(Object.keys(current.progress[0]), ["stage", "receipt"]);
    assert.deepEqual(
      store.advanceCheckpoint({
        identity,
        stage: "plan.written",
        receipt: { arbitrary: "plan", nested: { a: 2, z: 1 } },
      }),
      current,
    );
    assert.throws(
      () => store.advanceCheckpoint({
        identity,
        stage: "handoff.completed",
        receipt: { arbitrary: "changed" },
      }),
      (error) => error.code === "WORKFLOW_CHECKPOINT_RESULT_MISMATCH",
    );
    assert.throws(
      () => store.advanceCheckpoint({ identity, stage: "unknown.stage", receipt: { value: 1 } }),
      /Unknown workflow checkpoint stage/u,
    );
    assert.throws(
      () => store.advanceCheckpoint({ identity, stage: "handoff.completed", receipt: {} }),
      /non-empty object/u,
    );
    assert.throws(
      () => store.advanceCheckpoint({
        identity,
        stage: "handoff.completed",
        receipt: { apiToken: "must-not-persist" },
      }),
      /secret field apiToken/u,
    );
    assert.throws(
      () => store.advanceCheckpoint({
        identity,
        stage: "handoff.completed",
        result: { arbitrary: "legacy envelope" },
      }),
      /requires receipt/u,
    );
    assert.deepEqual(store.readCheckpoint(identity), current);
    assert.equal(
      readdirSync(join(gitCommonDir, "matt-workflow-control", "workflow-checkpoints"))
        .some((name) => name.includes(".tmp-")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow checkpoint malformed state fails closed without scanning unrelated receipts", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-checkpoint-malformed-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const first = checkpointIdentityV2({ profileVersion: "v2" });
    const second = checkpointIdentityV2({ operationId: "revision:2", profileVersion: "v2" });
    const firstCheckpoint = store.createCheckpoint(first);
    const secondCheckpoint = store.createCheckpoint(second);
    const transactionsRoot = join(
      gitCommonDir,
      "matt-workflow-control",
      "workflow-checkpoints",
    );
    const unrelatedMalformed = join(transactionsRoot, `${"f".repeat(64)}.json`);
    writeFileSync(unrelatedMalformed, "{partial", "utf8");
    assert.deepEqual(store.readCheckpoint(second), secondCheckpoint);

    const firstPath = join(
      transactionsRoot,
      `${firstCheckpoint.scopeKey.slice("sha256:".length)}.json`,
    );
    writeFileSync(firstPath, "{partial", "utf8");

    assert.throws(
      () => store.readCheckpoint(first),
      (error) => error.code === "WORKFLOW_CHECKPOINT_STATE_UNKNOWN",
    );
    assert.deepEqual(store.readCheckpoint(second), secondCheckpoint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow checkpoint legacy receipts stay v1 and exact incomplete to-spec resumes", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-checkpoint-legacy-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const completedIdentity = checkpointIdentity();
    const completedResults = [
      { path: completedIdentity.planPath, contentIdentity: completedIdentity.generatedContentIdentity },
      { commit: "a".repeat(40) },
      { recordIdentity: "IC_first" },
      { publicationIdentity: "issue:31:primary" },
      { handoffIdentity: "handoff:31:primary" },
    ];
    const completedPath = writeLegacyCheckpoint({
      gitCommonDir,
      identity: completedIdentity,
      progress: WORKFLOW_CHECKPOINT_STAGES.map((stage, index) => ({
        stage,
        result: completedResults[index],
      })),
    });
    const completedBytes = readFileSync(completedPath, "utf8");
    assert.equal(store.readCheckpoint(completedIdentity).state, "COMPLETED");
    assert.equal(store.createCheckpoint(completedIdentity).state, "COMPLETED");
    assert.equal(readFileSync(completedPath, "utf8"), completedBytes);

    assert.throws(
      () => store.createCheckpoint(checkpointIdentity({ specOperationId: "32:primary" })),
      (error) => error.code === "WORKFLOW_CHECKPOINT_LEGACY_CREATE_UNSUPPORTED",
    );

    const incompleteIdentity = checkpointIdentity({
      specOperationId: "33:primary",
      baseline: "b".repeat(40),
      planPath: "superpowers/docs/plans/spec-33.md",
      generatedContentIdentity: `sha256:${"2".repeat(64)}`,
    });
    const incompletePath = writeLegacyCheckpoint({
      gitCommonDir,
      identity: incompleteIdentity,
      progress: [{
        stage: "plan.written",
        result: {
          path: incompleteIdentity.planPath,
          contentIdentity: incompleteIdentity.generatedContentIdentity,
        },
      }],
    });
    const advancedLegacy = store.advanceCheckpoint({
      identity: incompleteIdentity,
      stage: "checkpoint.committed",
      result: { commit: "b".repeat(40) },
    });
    assert.equal(advancedLegacy.schema, LEGACY_WORKFLOW_CHECKPOINT_SCHEMA);
    assert.equal(advancedLegacy.nextStage, "attestation.read_back");
    assert.equal(JSON.parse(readFileSync(incompletePath, "utf8")).schema, LEGACY_WORKFLOW_CHECKPOINT_SCHEMA);

    const legacyResume = checkpointIdentityV2({
      specId: "33",
      baseline: incompleteIdentity.baseline,
      bindings: { legacyReceipt: incompleteIdentity.transactionId ?? "v1" },
    });
    const receiptCountBeforeResume = readdirSync(
      join(gitCommonDir, "matt-workflow-control", "workflow-checkpoints"),
    ).length;
    assert.equal(store.createCheckpoint(legacyResume).schema, LEGACY_WORKFLOW_CHECKPOINT_SCHEMA);
    assert.equal(
      readdirSync(join(gitCommonDir, "matt-workflow-control", "workflow-checkpoints")).length,
      receiptCountBeforeResume,
    );

    const currentIdentity = checkpointIdentityV2({ specId: "34", profileVersion: "v2" });
    store.createCheckpoint(currentIdentity);
    writeLegacyCheckpoint({
      gitCommonDir,
      identity: checkpointIdentity({ specOperationId: "34:primary" }),
    });
    assert.throws(
      () => store.readCheckpoint(currentIdentity),
      (error) => error.code === "WORKFLOW_CHECKPOINT_STATE_UNKNOWN",
    );

    const malformedIdentity = checkpointIdentity({ specOperationId: "35:primary" });
    const malformedPath = writeLegacyCheckpoint({ gitCommonDir, identity: malformedIdentity });
    const malformed = JSON.parse(readFileSync(malformedPath, "utf8"));
    delete malformed.identity.planPath;
    writeFileSync(malformedPath, `${JSON.stringify(malformed, null, 2)}\n`, "utf8");
    assert.throws(
      () => store.readCheckpoint(malformedIdentity),
      (error) => error.code === "WORKFLOW_CHECKPOINT_STATE_UNKNOWN",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow checkpoint legacy resume retains frozen producer-neutral v1 validation", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("workflow-checkpoint-legacy-producer-");
  try {
    const store = createWorkflowControlStore({ gitCommonDir });
    const identity = checkpointIdentity({
      producerCommand: "legacy-producer",
      specOperationId: "37:primary",
    });
    writeLegacyCheckpoint({
      gitCommonDir,
      identity,
      progress: [{
        stage: "plan.written",
        result: {
          path: identity.planPath,
          contentIdentity: identity.generatedContentIdentity,
        },
      }],
    });

    const advanced = store.advanceCheckpoint({
      identity,
      stage: "checkpoint.committed",
      result: { commit: "a".repeat(40) },
    });
    assert.equal(advanced.schema, LEGACY_WORKFLOW_CHECKPOINT_SCHEMA);
    assert.equal(advanced.nextStage, "attestation.read_back");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("target mutation writer serializes generic producers with legacy closeout on one target", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("target-mutation-writer-");
  try {
    const store = createRunStore({ gitCommonDir, coordinatorInstanceId: "coordinator-current" });
    const producerWriter = store.acquireTargetMutationWriter({
      target: "features/ron",
      operationId: "to-spec-31",
    });

    assert.equal(store.readTargetMutationWriter("features/ron"), "to-spec-31");
    assert.equal(store.readCloseWriter("features/ron"), "to-spec-31");
    assert.equal(store.readTargetMutationWriterLock("features/ron").operationId, "to-spec-31");
    assert.throws(
      () => store.acquireCloseWriter({ target: "features/ron", runId: "run-31" }),
      /TARGET_CLOSE_WRITER_LOCKED/u,
    );
    store.acquireTargetMutationWriter({
      target: "features/another",
      operationId: "to-spec-32",
    }).release();

    producerWriter.release();
    const closeWriter = store.acquireCloseWriter({ target: "features/ron", runId: "run-31" });
    assert.equal(store.readTargetMutationWriter("features/ron"), "run-31");
    closeWriter.release();
    assert.equal(store.readTargetMutationWriter("features/ron"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("target mutation writer observation distinguishes absence, match, change, and uncertainty", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("target-writer-observation-");
  const store = createRunStore({ gitCommonDir, coordinatorInstanceId: "writer-observer" });
  const writer = store.acquireTargetMutationWriter({
    target: "features/ron",
    operationId: "run-other-spec",
  });
  const lock = store.readTargetMutationWriterLock("features/ron");
  const expectedOwner = {
    operationId: lock.operationId,
    coordinatorInstanceId: lock.coordinatorInstanceId,
    generation: lock.generation,
  };

  try {
    assert.deepEqual(store.observeTargetMutationWriter({
      target: "features/ron",
      expectedOwner,
    }), { state: "MATCH", owner: expectedOwner });
    assert.deepEqual(store.observeTargetMutationWriter({
      target: "features/ron",
      expectedOwner: { ...expectedOwner, generation: "different-generation" },
    }), { state: "CHANGED", owner: expectedOwner });
    assert.deepEqual(store.observeTargetMutationWriter({ target: "features/ron" }), {
      state: "PRESENT",
      owner: expectedOwner,
    });
    writer.release();
    assert.deepEqual(store.observeTargetMutationWriter({
      target: "features/ron",
      expectedOwner,
    }), { state: "ABSENT", owner: null });
  } finally {
    if (store.readTargetMutationWriterLock("features/ron") !== null) writer.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository close lease serializes different targets while different repositories stay independent", () => {
  const repositoryA = createGitCommonDirFixture("repository-close-a-");
  const repositoryB = createGitCommonDirFixture("repository-close-b-");
  const ownerStore = createRunStore({
    gitCommonDir: repositoryA.gitCommonDir,
    coordinatorInstanceId: "repository-close-owner",
  });
  const contenderStore = createRunStore({
    gitCommonDir: repositoryA.gitCommonDir,
    coordinatorInstanceId: "repository-close-contender",
  });
  const independentStore = createRunStore({
    gitCommonDir: repositoryB.gitCommonDir,
    coordinatorInstanceId: "repository-close-independent",
  });

  try {
    const owner = ownerStore.acquireRepositoryCloseLease({ operationId: "close-44" });
    assert.equal(owner.assertCurrent(), true);
    assert.throws(
      () => contenderStore.acquireRepositoryCloseLease({ operationId: "close-46" }),
      /REPOSITORY_CLOSE_LEASE_LOCKED/u,
    );

    const independent = independentStore.acquireRepositoryCloseLease({ operationId: "close-47" });
    assert.equal(independent.assertCurrent(), true);
    independent.release();

    owner.release();
    const successor = contenderStore.acquireRepositoryCloseLease({ operationId: "close-46" });
    assert.equal(successor.assertCurrent(), true);
    successor.release();
  } finally {
    rmSync(repositoryA.root, { recursive: true, force: true });
    rmSync(repositoryB.root, { recursive: true, force: true });
  }
});

test("repository close lease observation distinguishes owner changes from unknown state", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("repository-close-observation-");
  const store = createRunStore({
    gitCommonDir,
    coordinatorInstanceId: "repository-close-observer",
  });

  try {
    assert.deepEqual(store.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
    const lease = store.acquireRepositoryCloseLease({ operationId: "close-44" });
    const present = store.observeRepositoryCloseLease();
    assert.equal(present.state, "PRESENT");
    assert.equal(present.owner.operationId, "close-44");
    assert.deepEqual(store.observeRepositoryCloseLease({ expectedOwner: present.owner }), {
      state: "MATCH",
      owner: present.owner,
    });
    assert.deepEqual(store.observeRepositoryCloseLease({
      expectedOwner: { ...present.owner, generation: "different-generation" },
    }), { state: "CHANGED", owner: present.owner });
    lease.release();

    const lock = join(gitCommonDir, "matt-workflow-control", "repository-close.lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "owner.json"), "{malformed", "utf8");
    assert.deepEqual(store.observeRepositoryCloseLease(), { state: "UNKNOWN", owner: null });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository close lease recovery requires exact stale-owner proof and fences the old handle", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("repository-close-recovery-");
  const oldStore = createRunStore({
    gitCommonDir,
    coordinatorInstanceId: "repository-close-old",
  });
  const newStore = createRunStore({
    gitCommonDir,
    coordinatorInstanceId: "repository-close-new",
  });

  try {
    const oldLease = oldStore.acquireRepositoryCloseLease({ operationId: "close-44" });
    const oldOwner = oldStore.observeRepositoryCloseLease().owner;
    const staleProof = {
      previousCoordinatorInstanceId: oldOwner.coordinatorInstanceId,
      previousGeneration: oldOwner.generation,
      coordinatorState: "INACTIVE",
      reconciled: true,
      evidence: ["Task read-back proves the previous closeout owner is inactive."],
      abandonedOperationIds: [],
    };

    assert.throws(() => newStore.reclaimRepositoryCloseLease({
      operationId: "close-44",
      staleProof: { ...staleProof, previousGeneration: "wrong-generation" },
    }), /REPOSITORY_CLOSE_LEASE_STALE_PROOF_MISMATCH/u);
    assert.deepEqual(oldStore.observeRepositoryCloseLease({ expectedOwner: oldOwner }), {
      state: "MATCH",
      owner: oldOwner,
    });

    const recovered = newStore.reclaimRepositoryCloseLease({
      operationId: "close-44",
      staleProof,
    });
    assert.equal(recovered.assertCurrent(), true);
    assert.throws(() => oldLease.assertCurrent(), /LOCK_LEASE_FENCED/u);
    assert.throws(() => oldLease.release(), /LOCK_LEASE_FENCED/u);
    recovered.release();
    assert.deepEqual(newStore.observeRepositoryCloseLease(), { state: "ABSENT", owner: null });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("two planning lanes isolate work, revalidate target movement, and serialize Planning Seal writes", () => {
  const parent = mkdtempSync(join(tmpdir(), "planning-lanes-"));
  const targetCheckout = join(parent, "target");
  const laneAPath = join(parent, "lane-a");
  const laneBPath = join(parent, "lane-b");
  mkdirSync(targetCheckout);
  const git = (args) => execFileSync("git", args, {
    cwd: targetCheckout,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  try {
    git(["init", "-b", "features/ron"]);
    git(["config", "user.name", "Ron Workflow Test"]);
    git(["config", "user.email", "workflow@example.invalid"]);
    git(["config", "core.autocrlf", "false"]);
    writeFileSync(join(targetCheckout, "CONTEXT.md"), "Order: a wager accepted by the platform.\n", "utf8");
    writeFileSync(join(targetCheckout, "notes.txt"), "baseline\n", "utf8");
    git(["add", "CONTEXT.md", "notes.txt"]);
    git(["commit", "-m", "baseline"]);
    const startingBaseline = git(["rev-parse", "HEAD"]);

    git(["worktree", "add", "-b", "planning/spec-a", laneAPath, startingBaseline]);
    git(["worktree", "add", "-b", "planning/spec-b", laneBPath, startingBaseline]);
    const lanes = [
      { task: "task-a", proposedSpec: "spec-a", target: "features/ron", baseline: startingBaseline, worktree: laneAPath },
      { task: "task-b", proposedSpec: "spec-b", target: "features/ron", baseline: startingBaseline, worktree: laneBPath },
    ];
    assert.notEqual(lanes[0].task, lanes[1].task);
    assert.notEqual(lanes[0].proposedSpec, lanes[1].proposedSpec);
    assert.notEqual(lanes[0].worktree, lanes[1].worktree);

    writeFileSync(join(laneAPath, "CONTEXT.md"), "Order: a wager accepted by the platform.\nLane A term.\n", "utf8");
    writeFileSync(join(laneBPath, "CONTEXT.md"), "Order: a wager accepted by the platform.\nLane B term.\n", "utf8");
    assert.match(readFileSync(join(laneAPath, "CONTEXT.md"), "utf8"), /Lane A term/u);
    assert.doesNotMatch(readFileSync(join(laneAPath, "CONTEXT.md"), "utf8"), /Lane B term/u);
    assert.match(readFileSync(join(laneBPath, "CONTEXT.md"), "utf8"), /Lane B term/u);
    assert.equal(readFileSync(join(targetCheckout, "CONTEXT.md"), "utf8"), "Order: a wager accepted by the platform.\n");

    const relevantContextAt = (revision) => git(["show", `${revision}:CONTEXT.md`]);
    const revalidate = (baseline, latest) => {
      const acceptedFact = relevantContextAt(baseline);
      const currentFact = relevantContextAt(latest);
      if (acceptedFact === currentFact) return { disposition: "compatible", baseline: latest };
      return {
        disposition: "Recoverable blocker",
        owningSource: "CONTEXT.md",
        observedEvidence: { baseline: acceptedFact, latest: currentFact },
        smallestHumanAction: "Confirm or revise the affected Order term",
        preservedStages: ["lane.bound", "decisions.accepted"],
        retry: "/to-spec",
      };
    };

    writeFileSync(join(targetCheckout, "notes.txt"), "compatible movement\n", "utf8");
    git(["add", "notes.txt"]);
    git(["commit", "-m", "compatible target movement"]);
    const compatibleHead = git(["rev-parse", "HEAD"]);
    assert.deepEqual(revalidate(startingBaseline, compatibleHead), {
      disposition: "compatible",
      baseline: compatibleHead,
    });

    writeFileSync(join(targetCheckout, "CONTEXT.md"), "Order: a settled wager.\n", "utf8");
    git(["add", "CONTEXT.md"]);
    git(["commit", "-m", "conflicting target movement"]);
    const conflictingHead = git(["rev-parse", "HEAD"]);
    assert.deepEqual(revalidate(startingBaseline, conflictingHead), {
      disposition: "Recoverable blocker",
      owningSource: "CONTEXT.md",
      observedEvidence: {
        baseline: "Order: a wager accepted by the platform.",
        latest: "Order: a settled wager.",
      },
      smallestHumanAction: "Confirm or revise the affected Order term",
      preservedStages: ["lane.bound", "decisions.accepted"],
      retry: "/to-spec",
    });

    const gitCommonDir = resolve(targetCheckout, git(["rev-parse", "--git-common-dir"]));
    const store = createRunStore({ gitCommonDir, coordinatorInstanceId: "planning-lane-test" });
    const laneAWriter = store.acquireTargetMutationWriter({
      target: "features/ron",
      operationId: "planning-seal-task-a-spec-a",
    });
    assert.equal(store.readTargetMutationWriter("features/ron"), "planning-seal-task-a-spec-a");
    assert.throws(
      () => store.acquireTargetMutationWriter({
        target: "features/ron",
        operationId: "planning-seal-task-b-spec-b",
      }),
      /TARGET_CLOSE_WRITER_LOCKED/u,
    );
    laneAWriter.release();
    store.acquireTargetMutationWriter({
      target: "features/ron",
      operationId: "planning-seal-task-b-spec-b",
    }).release();
    assert.equal(store.readTargetMutationWriter("features/ron"), null);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the versioned runtime interface publishes the accepted state machines", () => {
  assert.deepEqual(RUN_STATES, [
    "RECONCILING", "RUNNING", "WAITING_FOR_REPOSITORY_CLOSE_LEASE", "WAITING_FOR_TARGET_WRITER",
    "PAUSING", "PAUSED", "BLOCKED", "STOPPING", "STOPPED", "SUCCEEDED",
  ]);
  assert.deepEqual(NODE_STATES, [
    "PENDING", "READY", "DISPATCHED", "EXECUTING", "RETRYING",
    "IMPLEMENTATION_COMPLETE", "CLOSING", "SUCCEEDED", "BLOCKED", "FAILED",
  ]);
  assert.deepEqual(CONTROL_COMMANDS, ["PAUSE", "RESUME", "STOP"]);
  assert.equal(new Set(Object.values(REASON_CODES)).size, Object.values(REASON_CODES).length);
});

test("the same normalized evidence yields the same ready frontier", () => {
  const forward = reduceRun(facts([node("13"), node("14"), node("15", ["13", "14"])]));
  const reversed = reduceRun(facts([node("15", ["14", "13"]), node("14"), node("13")]));

  assert.deepEqual(reversed, forward);
  assert.equal(forward.run.state, "RUNNING");
  assert.equal(forward.run.maxParallel, 3);
  assert.deepEqual(
    forward.nodes.map(({ issueId, state }) => [issueId, state]),
    [["13", "READY"], ["14", "READY"], ["15", "PENDING"]],
  );
  assert.deepEqual(forward.frontier.ready, ["13", "14"]);
  assert.deepEqual(forward.legalActions, [
    { type: "dispatch_issue", issueId: "13", attempt: 1 },
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
  ]);

  const defaulted = reduceRun({
    ...facts([node("13"), node("14"), node("15"), node("16")]),
    journal: [{ ...grant, maxParallel: undefined }],
  });
  assert.equal(defaulted.run.maxParallel, 3);
  assert.equal(defaulted.legalActions.length, 3);
});

test("the status projection carries panel task and close evidence", () => {
  const journal = [
    grant,
    dispatchEvent("13", 1, 2),
    retryEvent("13", 1, 3),
    dispatchEvent("13", 2, 4),
    {
      schema: "dag-run-event:v1",
      sequence: 5,
      type: "remediation.recorded",
      at: "2026-08-30T00:05:00.000Z",
      issueId: "13",
      fingerprint: "windows:loopback",
      cycle: 1,
      adapter: "gradle-loopback-safe",
    },
  ];
  const status = reduceRun({
    ...facts([
      { ...node("13"), taskState: "EXECUTING", worktreeState: "PRESENT" },
      {
        ...node("14"),
        completionState: "COMPLETE",
        candidateReachable: true,
        worktreeState: "PRESENT",
      },
    ]),
    journal,
  });

  assert.deepEqual(status.nodes, [
    {
      issueId: "13",
      blockers: [],
      state: "EXECUTING",
      task: {
        ref: { threadId: "thread-13", hostId: "local" },
        state: "EXECUTING",
        attempt: 2,
        retryCount: 1,
        remediationCount: 1,
      },
      close: {
        completionState: "NONE",
        candidateReachable: false,
        worktreeState: "PRESENT",
        trackerState: "OPEN",
      },
    },
    {
      issueId: "14",
      blockers: [],
      state: "CLOSING",
      task: {
        ref: null,
        state: "NONE",
        attempt: 0,
        retryCount: 0,
        remediationCount: 0,
      },
      close: {
        completionState: "COMPLETE",
        candidateReachable: true,
        worktreeState: "PRESENT",
        trackerState: "OPEN",
      },
    },
  ]);
});

test("node lifecycle follows task, completion, Git, worktree, and tracker evidence", () => {
  const singleFacts = (nodeFacts, journal = [grantFor()]) => ({
    schema: "dag-run-facts:v1",
    run: {
      runId: "run-12",
      specId: "12",
      approvedScopeHash: "sha256:scope-12",
      target: "features/ron",
      classification: "SINGLE",
      decompositionIdentity: null,
      reconciled: true,
      trackerAvailable: true,
      targetState: "CLEAN",
      targetHead: "a".repeat(40),
      closeWriterRunId: null,
      closeWriterState: "ABSENT",
      parentTrackerState: "NOT_APPLICABLE",
      parentTrackerIdentity: null,
    },
    nodes: [withCloseAuthorityEvidence({ ...node("12"), ...nodeFacts })],
    contradictions: [],
    journal,
  });

  const dispatch = {
    schema: "dag-run-event:v1",
    sequence: 2,
    type: "dispatch.recorded",
    at: "2026-08-30T00:01:00.000Z",
    issueId: "12",
    attempt: 1,
    taskRef: { threadId: "thread-12", hostId: "local" },
  };
  const cases = [
    [{}, "READY"],
    [{ taskState: "DISPATCHED" }, "DISPATCHED"],
    [{ taskState: "EXECUTING" }, "EXECUTING"],
    [{ completionState: "COMPLETE", worktreeState: "PRESENT" }, "IMPLEMENTATION_COMPLETE"],
    [{ completionState: "COMPLETE", candidateReachable: true, worktreeState: "PRESENT" }, "CLOSING"],
    [{ completionState: "COMPLETE", candidateReachable: true, trackerState: "CLOSED" }, "SUCCEEDED"],
  ];

  for (const [nodeFacts, expectedState] of cases) {
    const journal = ["DISPATCHED", "EXECUTING"].includes(expectedState)
      ? [grantFor(), dispatch]
      : [grantFor()];
    const status = reduceRun(singleFacts(nodeFacts, journal));
    assert.equal(status.nodes[0].state, expectedState);
  }

  const complete = reduceRun(singleFacts({ completionState: "COMPLETE", worktreeState: "PRESENT" }));
  assert.deepEqual(complete.legalActions, [{ type: "close_issue", issueId: "12" }]);

  const succeeded = reduceRun(singleFacts({
    completionState: "COMPLETE",
    candidateReachable: true,
    trackerState: "CLOSED",
  }));
  assert.equal(succeeded.run.state, "SUCCEEDED");
  assert.deepEqual(succeeded.legalActions, []);
});

test("closeout requires exact tracker, target, candidate, completion, and worktree identities", () => {
  const missing = facts([{
    ...node("13"),
    completionState: "COMPLETE",
    worktreeState: "PRESENT",
  }]);
  missing.nodes[0].closeAuthorityEvidence = null;

  const status = reduceRun(missing);

  assert.equal(status.run.state, "BLOCKED");
  assert.equal(status.diagnoses[0].reasonCode, "insufficient_evidence");
  assert.match(status.diagnoses[0].evidence[0], /Issue 13 close authority evidence must be an object/u);
  assert.deepEqual(status.legalActions, []);

  const partialObjectId = facts([{
    ...node("13"),
    completionState: "COMPLETE",
    worktreeState: "PRESENT",
  }]);
  partialObjectId.nodes[0].closeAuthorityEvidence.candidateCommit = "b".repeat(41);
  const partialStatus = reduceRun(partialObjectId);
  assert.equal(partialStatus.run.state, "BLOCKED");
  assert.equal(partialStatus.diagnoses[0].reasonCode, "insufficient_evidence");
  assert.match(partialStatus.diagnoses[0].evidence[0], /candidateCommit must be a Git object id/u);
});

test("a failed branch blocks only its descendants while independent work remains legal", () => {
  const failed = {
    ...node("13"),
    taskState: "FAILED",
    failure: { kind: "SEMANTIC", evidence: ["implementation_blocked read back"] },
  };
  const succeeded = {
    ...node("14"),
    completionState: "COMPLETE",
    candidateReachable: true,
    trackerState: "CLOSED",
  };
  const status = reduceRun({
    ...facts([failed, succeeded, node("15", ["13"]), node("16", ["14"])]),
    journal: [grant, dispatchEvent("13")],
  });

  assert.equal(status.run.state, "RUNNING");
  assert.deepEqual(
    status.nodes.map(({ issueId, state }) => [issueId, state]),
    [["13", "FAILED"], ["14", "SUCCEEDED"], ["15", "BLOCKED"], ["16", "READY"]],
  );
  assert.deepEqual(status.legalActions, [{ type: "dispatch_issue", issueId: "16", attempt: 1 }]);
  assert.equal(status.diagnoses.find(({ reasonCode }) => reasonCode === "failed_dependency")?.affectedNodes[0], "15");
});

test("explicit contradictions fail closed with a structured stop diagnosis", () => {
  const status = reduceRun({
    ...facts([node("13"), node("14")]),
    contradictions: [{
      code: "candidate_and_tracker_disagree",
      evidence: ["Issue #13 is closed but its candidate is not reachable"],
      affectedNodes: ["13"],
    }],
  });

  assert.equal(status.run.state, "BLOCKED");
  assert.deepEqual(status.legalActions, []);
  assert.deepEqual(status.diagnoses[0], {
    reasonCode: "evidence_contradiction",
    limitationClass: "unresolved-evidence",
    evidence: ["Issue #13 is closed but its candidate is not reachable"],
    attemptedRecovery: [],
    retryCount: 0,
    noAutomaticTransition: "Contradictory authoritative evidence has no safe precedence.",
    affectedNodes: ["13"],
    unaffectedNodes: ["14"],
    nextOwner: "human",
    resumePredicates: ["resolve_contradiction:candidate_and_tracker_disagree"],
  });
});

test("missing authority and malformed DAG facts fail closed", () => {
  const cases = [
    [{ ...facts([node("13")]), schema: "dag-run-facts:v2" }, "invalid_fact_schema"],
    [{ ...facts([node("13")]), journal: [] }, "grant_missing"],
    [facts([]), "empty_dag"],
    [{ ...facts([node("13")]), journal: [{ ...grant, maxParallel: 0 }] }, "grant_invalid"],
    [{ ...facts([node("13")]), nodes: [null] }, "invalid_fact_schema"],
    [{ ...facts([node("13")]), contradictions: [{}] }, "invalid_fact_schema"],
    [{
      ...facts([{ ...node("13"), taskState: "ENVIRONMENT_FAILURE", failure: { fingerprint: Symbol("bad") } }]),
      journal: [grant, dispatchEvent("13")],
    }, "invalid_fact_schema"],
    [{
      ...facts([node("13")]),
      journal: [grant, { ...dispatchEvent("13"), attempt: "bad" }],
    }, "invalid_fact_schema"],
    [{
      ...facts([node("13")]),
      journal: [grant, {
        schema: "dag-run-event:v1",
        sequence: 2,
        type: "control.revised",
        at: "2026-08-30T00:01:00.000Z",
        revision: 1,
        command: "START",
      }],
    }, "invalid_fact_schema"],
    [{
      ...facts([{ ...node("13"), taskState: "ENVIRONMENT_FAILURE" }]),
      journal: [grant, dispatchEvent("13")],
    }, "insufficient_evidence"],
    [facts([node("13", ["missing"])]), "unknown_blocker"],
    [facts([node("13", ["14"]), node("14", ["13"])]), "dependency_cycle"],
    [{ ...facts([node("13"), node("13")]) }, "duplicate_node"],
    [{ ...facts([node("13")]), journal: [grant, dispatchEvent("999")] }, "journal_scope_conflict"],
  ];

  for (const [input, reasonCode] of cases) {
    const first = reduceRun(input);
    const second = reduceRun(input);
    assert.deepEqual(second, first);
    assert.equal(first.run.state, "BLOCKED");
    assert.deepEqual(first.legalActions, []);
    assert.equal(first.diagnoses[0].reasonCode, reasonCode);
  }

  const changedScope = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, approvedScopeHash: "sha256:changed-scope" },
  });
  assert.equal(changedScope.diagnoses[0].reasonCode, "grant_identity_conflict");

  const changedDecomposition = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, decompositionIdentity: "decomposition:changed" },
  });
  assert.equal(changedDecomposition.diagnoses[0].reasonCode, "grant_identity_conflict");

  const unsafeIdentity = facts([node("13")]);
  unsafeIdentity.run.runId = 1n;
  const sanitized = reduceRun(unsafeIdentity);
  assert.equal(sanitized.run.state, "BLOCKED");
  assert.doesNotThrow(() => JSON.stringify(sanitized));

  const invalidSingle = reduceRun({
    ...facts([node("12"), node("13")]),
    run: {
      ...facts([]).run,
      classification: "SINGLE",
      decompositionIdentity: null,
    },
    journal: [grantFor()],
  });
  assert.equal(invalidSingle.diagnoses[0].reasonCode, "invalid_fact_schema");

  const missingReconciliation = facts([node("13")]);
  delete missingReconciliation.run.reconciled;
  assert.equal(reduceRun(missingReconciliation).diagnoses[0].reasonCode, "invalid_fact_schema");
});

test("impossible owning-source combinations are reducer contradictions", () => {
  const closedWithoutCompletion = reduceRun(facts([{
    ...node("13"),
    trackerState: "CLOSED",
  }]));
  assert.equal(closedWithoutCompletion.run.state, "BLOCKED");
  assert.equal(closedWithoutCompletion.diagnoses[0].reasonCode, "evidence_contradiction");

  const missingCandidate = reduceRun(facts([{
    ...node("13"),
    completionState: "COMPLETE",
    worktreeState: "ABSENT",
  }]));
  assert.equal(missingCandidate.run.state, "BLOCKED");
  assert.equal(missingCandidate.diagnoses[0].reasonCode, "insufficient_evidence");

  const uncertain = reduceRun(facts([{ ...node("13"), worktreeState: "UNKNOWN" }]));
  assert.equal(uncertain.run.state, "BLOCKED");
  assert.equal(uncertain.diagnoses[0].reasonCode, "insufficient_evidence");

  const closedBeforeCleanup = reduceRun(facts([{
    ...node("13"),
    completionState: "COMPLETE",
    candidateReachable: true,
    worktreeState: "PRESENT",
    trackerState: "CLOSED",
  }]));
  assert.equal(closedBeforeCleanup.run.state, "BLOCKED");
  assert.equal(closedBeforeCleanup.diagnoses[0].reasonCode, "evidence_contradiction");

  const dispatchedWithoutReference = reduceRun(facts([{ ...node("13"), taskState: "DISPATCHED" }]));
  assert.equal(dispatchedWithoutReference.run.state, "BLOCKED");
  assert.equal(dispatchedWithoutReference.diagnoses[0].reasonCode, "insufficient_evidence");

  const dispatchWithoutTaskEvidence = reduceRun({
    ...facts([node("13")]),
    journal: [grant, dispatchEvent("13")],
  });
  assert.equal(dispatchWithoutTaskEvidence.run.state, "BLOCKED");
  assert.equal(dispatchWithoutTaskEvidence.diagnoses[0].reasonCode, "insufficient_evidence");
  assert.deepEqual(dispatchWithoutTaskEvidence.legalActions, []);

  const parentClosedEarly = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, parentTrackerState: "CLOSED" },
  });
  assert.equal(parentClosedEarly.run.state, "BLOCKED");
  assert.equal(parentClosedEarly.diagnoses[0].reasonCode, "evidence_contradiction");
});

test("dispatch, retry, remediation, and close writers stay within their budgets", () => {
  const twoActive = reduceRun({
    ...facts([
      { ...node("13"), taskState: "EXECUTING" },
      { ...node("14"), taskState: "DISPATCHED" },
      node("15"),
      node("16"),
    ]),
    journal: [grant, dispatchEvent("13", 1, 2), dispatchEvent("14", 1, 3)],
  });
  assert.deepEqual(twoActive.frontier.active, ["13", "14"]);
  assert.deepEqual(twoActive.legalActions, [{ type: "dispatch_issue", issueId: "15", attempt: 1 }]);

  const closeDoesNotConsumeExecution = reduceRun(facts([
    { ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" },
    node("14"),
  ]));
  assert.deepEqual(closeDoesNotConsumeExecution.legalActions, [
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
  ]);
  const closeAfterDispatch = reduceRun({
    ...facts([
      { ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" },
      { ...node("14"), taskState: "EXECUTING", worktreeState: "PRESENT" },
    ]),
    journal: [grant, dispatchEvent("14", 1, 2)],
  });
  assert.deepEqual(closeAfterDispatch.frontier.active, ["14"]);
  assert.deepEqual(closeAfterDispatch.legalActions, [{ type: "close_issue", issueId: "13" }]);

  const partialCloseDoesNotConsumeExecution = reduceRun(facts([
    { ...node("13"), completionState: "COMPLETE", candidateReachable: true, worktreeState: "PRESENT" },
    node("14"),
  ]));
  assert.deepEqual(partialCloseDoesNotConsumeExecution.legalActions, [
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
  ]);

  const retrying = reduceRun({
    ...facts([{ ...node("13"), taskState: "TRANSIENT_FAILURE" }]),
    journal: [grant, dispatchEvent("13", 1, 2)],
  });
  assert.equal(retrying.nodes[0].state, "RETRYING");
  assert.deepEqual(retrying.legalActions, [{ type: "dispatch_issue", issueId: "13", attempt: 2 }]);

  const prematureCompletion = reduceRun({
    ...facts([{
      ...node("13"),
      taskState: "EXECUTING",
      completionState: "COMPLETE",
      worktreeState: "PRESENT",
    }]),
    journal: [grant, dispatchEvent("13")],
  });
  assert.equal(prematureCompletion.run.state, "BLOCKED");
  assert.deepEqual(prematureCompletion.frontier.active, ["13"]);
  assert.deepEqual(prematureCompletion.frontier.closeable, []);
  assert.equal(prematureCompletion.diagnoses[0].reasonCode, "evidence_contradiction");

  const exhausted = reduceRun({
    ...facts([{ ...node("13"), taskState: "TRANSIENT_FAILURE" }]),
    journal: [
      grant,
      dispatchEvent("13", 1, 2),
      retryEvent("13", 1, 3),
      dispatchEvent("13", 2, 4),
      retryEvent("13", 2, 5),
      dispatchEvent("13", 3, 6),
    ],
  });
  assert.equal(exhausted.nodes[0].state, "FAILED");
  assert.equal(exhausted.run.state, "BLOCKED");
  assert.equal(exhausted.diagnoses[0].reasonCode, "dispatch_attempts_exhausted");
  assert.equal(exhausted.diagnoses[0].retryCount, 3);

  const environmentFailure = { ...node("13"), taskState: "ENVIRONMENT_FAILURE", failure: { fingerprint: "selector-loopback" } };
  const remediable = reduceRun({ ...facts([environmentFailure]), journal: [grant, dispatchEvent("13")] });
  assert.equal(remediable.nodes[0].state, "RETRYING");
  assert.deepEqual(remediable.legalActions, [{
    type: "remediate_environment",
    issueId: "13",
    attempt: 1,
    fingerprint: "selector-loopback",
    cycle: 1,
  }]);
  const remediationConsumesExecutionCapacity = reduceRun({
    ...facts([environmentFailure, node("14"), node("15"), node("16")]),
    journal: [grant, dispatchEvent("13")],
  });
  assert.deepEqual(remediationConsumesExecutionCapacity.legalActions, [
    { type: "remediate_environment", issueId: "13", attempt: 1, fingerprint: "selector-loopback", cycle: 1 },
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
    { type: "dispatch_issue", issueId: "15", attempt: 1 },
  ]);

  const unresolved = reduceRun({
    ...facts([environmentFailure]),
    journal: [grant, dispatchEvent("13"), {
      schema: "dag-run-event:v1",
      sequence: 3,
      type: "remediation.recorded",
      at: "2026-08-30T00:01:00.000Z",
      issueId: "13",
      fingerprint: "selector-loopback",
      cycle: 1,
      adapter: "gradle-loopback-safe",
    }],
  });
  assert.equal(unresolved.nodes[0].state, "FAILED");
  assert.equal(unresolved.diagnoses[0].reasonCode, "environment_unresolved");
  assert.deepEqual(unresolved.diagnoses[0].attemptedRecovery, [{
    adapter: "gradle-loopback-safe",
    attempt: 1,
    cycle: 1,
  }]);

  const laterAttemptJournal = [
    grant,
    dispatchEvent("13", 1, 2),
    {
      schema: "dag-run-event:v1",
      sequence: 3,
      type: "remediation.recorded",
      at: "2026-08-30T00:03:00.000Z",
      issueId: "13",
      fingerprint: "selector-loopback",
      cycle: 1,
      adapter: "gradle-loopback-safe",
    },
    retryEvent("13", 1, 4),
    dispatchEvent("13", 2, 5),
  ];
  const laterAttempt = reduceRun({ ...facts([environmentFailure]), journal: laterAttemptJournal });
  assert.equal(laterAttempt.nodes[0].state, "RETRYING");
  assert.deepEqual(laterAttempt.legalActions, [{
    type: "remediate_environment",
    issueId: "13",
    attempt: 2,
    fingerprint: "selector-loopback",
    cycle: 1,
  }]);

  const laterAttemptUnresolved = reduceRun({
    ...facts([environmentFailure]),
    journal: [...laterAttemptJournal, {
      schema: "dag-run-event:v1",
      sequence: 6,
      type: "remediation.recorded",
      at: "2026-08-30T00:06:00.000Z",
      issueId: "13",
      attempt: 2,
      fingerprint: "selector-loopback",
      cycle: 1,
      adapter: "gradle-loopback-safe",
    }],
  });
  assert.equal(laterAttemptUnresolved.nodes[0].state, "FAILED");
  assert.deepEqual(laterAttemptUnresolved.diagnoses[0].attemptedRecovery, [{
    adapter: "gradle-loopback-safe",
    attempt: 2,
    cycle: 1,
  }]);

  const partialCloseouts = reduceRun(facts([
    { ...node("13"), completionState: "COMPLETE", candidateReachable: true, worktreeState: "PRESENT" },
    { ...node("14"), completionState: "COMPLETE", candidateReachable: true, worktreeState: "PRESENT" },
  ]));
  assert.equal(partialCloseouts.run.state, "RUNNING");
  assert.deepEqual(partialCloseouts.legalActions, [{ type: "close_issue", issueId: "13" }]);

  const resumedCloseout = reduceRun(facts([{
    ...node("13"),
    completionState: "COMPLETE",
    candidateReachable: true,
    worktreeState: "ABSENT",
  }]));
  assert.equal(resumedCloseout.nodes[0].state, "CLOSING");
  assert.deepEqual(resumedCloseout.legalActions, [{ type: "close_issue", issueId: "13" }]);

  const targetCloseConflict = reduceRun({
    ...facts([{ ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" }]),
    run: { ...facts([]).run, closeWriterRunId: "another-run", closeWriterState: "ACTIVE" },
  });
  assert.equal(targetCloseConflict.run.state, "BLOCKED");
  assert.equal(targetCloseConflict.diagnoses[0].reasonCode, "close_writer_conflict");
  assert.deepEqual(targetCloseConflict.legalActions, []);

  const uncertainOwnClose = reduceRun({
    ...facts([{ ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" }]),
    run: { ...facts([]).run, closeWriterRunId: "run-12", closeWriterState: "UNKNOWN" },
  });
  assert.equal(uncertainOwnClose.run.state, "BLOCKED");
  assert.equal(uncertainOwnClose.diagnoses[0].reasonCode, "close_writer_conflict");

  const serializedCloseWithIndependentExecution = reduceRun({
    ...facts([
      { ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" },
      node("14"),
    ]),
    run: { ...facts([]).run, closeWriterRunId: "another-run", closeWriterState: "ACTIVE" },
  });
  assert.equal(serializedCloseWithIndependentExecution.run.state, "RUNNING");
  assert.deepEqual(serializedCloseWithIndependentExecution.legalActions, [
    { type: "dispatch_issue", issueId: "14", attempt: 1 },
  ]);

  const unrelatedExecution = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, closeWriterRunId: "another-run", closeWriterState: "ACTIVE" },
  });
  assert.equal(unrelatedExecution.run.state, "RUNNING");
  assert.deepEqual(unrelatedExecution.legalActions, [{ type: "dispatch_issue", issueId: "13", attempt: 1 }]);
});

test("a healthy target writer becomes a bounded wait after independent Issue dispatch", () => {
  const healthyOwner = {
    operationId: "run-other-spec",
    coordinatorInstanceId: "coordinator-other-spec",
    generation: "generation-other-spec",
  };
  const status = reduceRun({
    ...facts([
      { ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" },
      node("14"),
    ]),
    run: {
      ...facts([]).run,
      closeWriterRunId: healthyOwner.operationId,
      closeWriterState: "ACTIVE",
      closeWriterHealth: "HEALTHY",
      closeWriterOwner: healthyOwner,
    },
  });

  assert.equal(status.run.state, "RUNNING");
  assert.deepEqual(status.legalActions, [{ type: "dispatch_issue", issueId: "14", attempt: 1 }]);
  const afterDispatch = reduceRun({
    ...facts([
      { ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" },
      { ...node("14"), taskState: "EXECUTING", worktreeState: "PRESENT" },
    ]),
    run: {
      ...facts([]).run,
      closeWriterRunId: healthyOwner.operationId,
      closeWriterState: "ACTIVE",
      closeWriterHealth: "HEALTHY",
      closeWriterOwner: healthyOwner,
    },
    journal: [grant, dispatchEvent("14")],
  });
  assert.deepEqual(
    { ...afterDispatch.legalActions[0], preWaitEvidence: undefined },
    {
      type: "wait_target_writer",
      issueId: "13",
      owner: healthyOwner,
      timeoutMs: 30_000,
      preWaitEvidence: undefined,
    },
  );
  assert.deepEqual(afterDispatch.legalActions[0].preWaitEvidence.runIdentity, grant.runIdentity);
  assert.deepEqual(afterDispatch.legalActions[0].preWaitEvidence.grant, {
    runIdentity: grant.runIdentity,
    maxParallel: 3,
  });
  assert.deepEqual(afterDispatch.legalActions[0].preWaitEvidence.target, {
    state: "CLEAN",
    head: "a".repeat(40),
    trackerAvailable: true,
    parentTrackerState: "OPEN",
    parentTrackerIdentity: "github-issue:12:version:1",
  });
  assert.deepEqual(afterDispatch.legalActions[0].preWaitEvidence.issues.map(({ issueId }) => issueId), ["13", "14"]);
  assert.equal(afterDispatch.diagnoses.some(({ reasonCode }) => reasonCode === "close_writer_conflict"), false);
});

test("repository close contention waits after dispatch and unknown ownership blocks same-command recovery", () => {
  const owner = {
    operationId: `workflow-op-v1-${"d".repeat(64)}`,
    coordinatorInstanceId: "coordinator-other-close",
    generation: "generation-other-close",
  };
  const closeableAndActive = [
    { ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" },
    { ...node("14"), taskState: "EXECUTING", worktreeState: "PRESENT" },
  ];
  const waiting = reduceRun({
    ...facts(closeableAndActive),
    run: {
      ...facts([]).run,
      repositoryCloseLeaseOperationId: owner.operationId,
      repositoryCloseLeaseState: "ACTIVE",
      repositoryCloseLeaseHealth: "HEALTHY",
      repositoryCloseLeaseOwner: owner,
    },
    journal: [grant, dispatchEvent("14")],
  });

  assert.equal(waiting.run.state, "RUNNING");
  assert.deepEqual(
    { ...waiting.legalActions[0], preWaitEvidence: undefined },
    {
      type: "wait_repository_close_lease",
      issueId: "13",
      owner,
      timeoutMs: 30_000,
      preWaitEvidence: undefined,
    },
  );
  const started = {
    schema: "dag-run-event:v1",
    sequence: 3,
    type: "repository-close-wait.started",
    at: "2026-08-30T00:02:00.000Z",
    issueId: "13",
    target: grant.runIdentity.target,
    owner,
    timeoutMs: 30_000,
    preWaitEvidence: waiting.legalActions[0].preWaitEvidence,
  };
  const activeWait = reduceRun({
    ...facts(closeableAndActive),
    run: {
      ...facts([]).run,
      repositoryCloseLeaseOperationId: owner.operationId,
      repositoryCloseLeaseState: "ACTIVE",
      repositoryCloseLeaseHealth: "HEALTHY",
      repositoryCloseLeaseOwner: owner,
    },
    journal: [grant, dispatchEvent("14"), started],
  });
  assert.equal(activeWait.run.state, "WAITING_FOR_REPOSITORY_CLOSE_LEASE");
  assert.equal(activeWait.legalActions[0].type, "wait_repository_close_lease");

  const unknown = reduceRun({
    ...facts([{ ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" }]),
    run: {
      ...facts([]).run,
      repositoryCloseLeaseOperationId: "UNKNOWN",
      repositoryCloseLeaseState: "UNKNOWN",
    },
  });
  assert.equal(unknown.run.state, "BLOCKED");
  assert.equal(unknown.diagnoses.at(-1).reasonCode, "repository_close_lease_conflict");
  assert.deepEqual(unknown.legalActions, []);
  assert.equal(unknown.diagnoses.at(-1).operatorPacket.retryCommand, "/run-issue-workflow 12");
});

test("an unsettled target-writer event projects the bounded coordinator wait state", () => {
  const owner = {
    operationId: "run-other-spec",
    coordinatorInstanceId: "coordinator-other-spec",
    generation: "generation-other-spec",
  };
  const input = facts([
    { ...node("13"), completionState: "COMPLETE", worktreeState: "PRESENT" },
    node("14"),
  ]);
  input.run = {
    ...input.run,
    closeWriterRunId: owner.operationId,
    closeWriterState: "ACTIVE",
    closeWriterHealth: "HEALTHY",
    closeWriterOwner: owner,
  };
  const preWaitEvidence = preWaitEvidenceFor(input);
  input.journal = [...input.journal, {
    schema: "dag-run-event:v1",
    sequence: 2,
    type: "target-writer-wait.started",
    at: "2026-08-30T00:01:00.000Z",
    issueId: "13",
    target: "features/ron",
    owner,
    timeoutMs: 30_000,
    preWaitEvidence,
  }];

  const status = reduceRun(input);

  assert.equal(status.run.state, "WAITING_FOR_TARGET_WRITER");
  assert.deepEqual(status.legalActions, [{
    type: "wait_target_writer",
    issueId: "13",
    owner,
    timeoutMs: 30_000,
    preWaitEvidence,
  }]);
  assert.deepEqual(status.frontier.ready, ["14"]);
  assert.equal(planControl(status, "PAUSE", "2026-08-30T00:01:01.000Z").accepted, true);
  assert.equal(planControl(status, "STOP", "2026-08-30T00:01:01.000Z").accepted, true);
});

test("a Multi-Issue parent writer wait stays inside the Run journal scope", () => {
  const owner = {
    operationId: "run-other-spec",
    coordinatorInstanceId: "coordinator-other-spec",
    generation: "generation-other-spec",
  };
  const succeeded = (issueId) => ({
    ...node(issueId),
    trackerState: "CLOSED",
    completionState: "COMPLETE",
    candidateReachable: true,
    worktreeState: "ABSENT",
  });
  const input = facts([succeeded("13"), succeeded("14")]);
  input.run = {
    ...input.run,
    closeWriterRunId: owner.operationId,
    closeWriterState: "ACTIVE",
    closeWriterHealth: "HEALTHY",
    closeWriterOwner: owner,
  };

  const initial = reduceRun(input);
  assert.deepEqual(initial.legalActions, [{
    type: "wait_target_writer",
    issueId: "12",
    owner,
    timeoutMs: 30_000,
    preWaitEvidence: initial.legalActions[0].preWaitEvidence,
  }]);
  const preWaitEvidence = initial.legalActions[0].preWaitEvidence;

  const waiting = reduceRun({
    ...input,
    journal: [...input.journal, {
      schema: "dag-run-event:v1",
      sequence: 2,
      type: "target-writer-wait.started",
      at: "2026-08-30T00:01:00.000Z",
      issueId: "12",
      target: "features/ron",
      owner,
      timeoutMs: 30_000,
      preWaitEvidence,
    }],
  });

  assert.equal(waiting.run.state, "WAITING_FOR_TARGET_WRITER");
  assert.equal(waiting.diagnoses.some(({ reasonCode }) => reasonCode === "journal_scope_conflict"), false);
});

test("unknown target-writer ownership exposes same-command Recoverable recovery", () => {
  const input = facts([{
    ...node("13"),
    completionState: "COMPLETE",
    worktreeState: "PRESENT",
  }]);
  input.run = {
    ...input.run,
    closeWriterRunId: "UNKNOWN",
    closeWriterState: "UNKNOWN",
  };

  const status = reduceRun(input);
  const diagnosis = status.diagnoses.find(({ reasonCode }) => reasonCode === "close_writer_conflict");

  assert.equal(diagnosis.operatorPacket.disposition, "Recoverable blocker");
  assert.match(diagnosis.operatorPacket.owningSource, /target-writer lock/u);
  assert.equal(diagnosis.operatorPacket.retryCommand, "/run-issue-workflow 12");
  assert.deepEqual(diagnosis.operatorPacket.preservedStages.issues, [{
    issueId: "13",
    state: "IMPLEMENTATION_COMPLETE",
  }]);
});

test("changed target evidence after writer release exposes Recoverable recovery", () => {
  const owner = {
    operationId: "run-other-spec",
    coordinatorInstanceId: "coordinator-other-spec",
    generation: "generation-other-spec",
  };
  const input = facts([{
    ...node("13"),
    completionState: "COMPLETE",
    worktreeState: "PRESENT",
  }]);
  const preWaitEvidence = preWaitEvidenceFor(input);
  input.run = { ...input.run, targetState: "DIRTY" };
  input.journal = [...input.journal, {
    schema: "dag-run-event:v1",
    sequence: 2,
    type: "target-writer-wait.started",
    at: "2026-08-30T00:01:00.000Z",
    issueId: "13",
    target: "features/ron",
    owner,
    timeoutMs: 30_000,
    preWaitEvidence,
  }, {
    schema: "dag-run-event:v1",
    sequence: 3,
    type: "target-writer-wait.settled",
    at: "2026-08-30T00:01:01.000Z",
    waitSequence: 2,
    issueId: "13",
    target: "features/ron",
    owner,
    outcome: "RELEASED",
    evidence: ["The exact competing target writer is absent."],
  }];

  const status = reduceRun(input);
  const diagnosis = status.diagnoses.find(({ reasonCode }) => reasonCode === "target_dirty");

  assert.equal(diagnosis.operatorPacket.disposition, "Recoverable blocker");
  assert.match(diagnosis.operatorPacket.owningSource, /post-wait.*reconciliation/u);
  assert.equal(diagnosis.operatorPacket.retryCommand, "/run-issue-workflow 12");
});

test("Pause, Resume, and Stop are revisioned and idempotent with no Start control", () => {
  const running = reduceRun(facts([node("13")]));
  const pause = planControl(running, "PAUSE", "2026-08-30T00:01:00.000Z");
  assert.equal(pause.changed, true);
  assert.deepEqual(pause.event, {
    type: "control.revised",
    at: "2026-08-30T00:01:00.000Z",
    revision: 1,
    command: "PAUSE",
  });

  const pausing = reduceRun({ ...facts([node("13")]), journal: [grant, { ...pause.event, schema: "dag-run-event:v1", sequence: 2 }] });
  assert.equal(pausing.run.state, "PAUSING");
  assert.deepEqual(pausing.legalActions, [{ type: "settle_pause", revision: 1 }]);

  const paused = reduceRun({
    ...facts([node("13")]),
    journal: [
      grant,
      { ...pause.event, schema: "dag-run-event:v1", sequence: 2 },
      {
        schema: "dag-run-event:v1",
        sequence: 3,
        type: "pause.transitioned",
        at: "2026-08-30T00:02:00.000Z",
        revision: 1,
      },
    ],
  });
  assert.equal(paused.run.state, "PAUSED");
  assert.equal(planControl(paused, "PAUSE", "2026-08-30T00:03:00.000Z").changed, false);
  assert.equal(planControl(paused, "RESUME", "2026-08-30T00:03:00.000Z").event.revision, 2);
  assert.equal(planControl(paused, "START", "2026-08-30T00:03:00.000Z").accepted, false);

  const prematurePause = reduceRun({
    ...facts([{ ...node("13"), taskState: "EXECUTING" }]),
    journal: [
      grant,
      dispatchEvent("13", 1, 2),
      { ...pause.event, schema: "dag-run-event:v1", sequence: 3 },
      {
        schema: "dag-run-event:v1",
        sequence: 4,
        type: "pause.transitioned",
        at: "2026-08-30T00:02:00.000Z",
        revision: 1,
      },
    ],
  });
  assert.equal(prematurePause.run.state, "PAUSING");
  assert.deepEqual(prematurePause.frontier.active, ["13"]);

  const stop = planControl(paused, "STOP", "2026-08-30T00:04:00.000Z");
  assert.equal(stop.event.revision, 2);
  const stopping = reduceRun({
    ...facts([node("13")]),
    journal: [...pausedJournal(pause), { ...stop.event, schema: "dag-run-event:v1", sequence: 4 }],
  });
  assert.equal(stopping.run.state, "STOPPING");
  assert.deepEqual(stopping.legalActions, [{ type: "settle_stop", revision: 2 }]);

  const stopped = reduceRun({
    ...facts([node("13")]),
    journal: [
      ...pausedJournal(pause),
      { ...stop.event, schema: "dag-run-event:v1", sequence: 4 },
      {
        schema: "dag-run-event:v1",
        sequence: 5,
        type: "stop.transitioned",
        at: "2026-08-30T00:05:00.000Z",
        revision: 2,
      },
    ],
  });
  assert.equal(stopped.run.state, "STOPPED");
  assert.deepEqual(stopped.legalControls, ["REFRESH"]);

  const prematureStop = reduceRun({
    ...facts([{ ...node("13"), taskState: "EXECUTING" }]),
    journal: [
      grant,
      dispatchEvent("13", 1, 2),
      {
        schema: "dag-run-event:v1",
        sequence: 3,
        type: "control.revised",
        at: "2026-08-30T00:03:00.000Z",
        revision: 1,
        command: "STOP",
      },
      {
        schema: "dag-run-event:v1",
        sequence: 4,
        type: "stop.transitioned",
        at: "2026-08-30T00:04:00.000Z",
        revision: 1,
      },
    ],
  });
  assert.equal(prematureStop.run.state, "STOPPING");
  assert.deepEqual(prematureStop.frontier.active, ["13"]);

  const resumedButStillBlocked = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, targetState: "DIRTY" },
    journal: [grant, {
      schema: "dag-run-event:v1",
      sequence: 2,
      type: "control.revised",
      at: "2026-08-30T00:06:00.000Z",
      revision: 1,
      command: "RESUME",
    }],
  });
  const repeatedResume = planControl(resumedButStillBlocked, "RESUME", "2026-08-30T00:07:00.000Z");
  assert.equal(repeatedResume.changed, false);
  assert.equal(repeatedResume.revision, 1);
});

test("reconciliation, tracker, target, and parent gates fail closed at their owning seam", () => {
  const reconciling = reduceRun({
    ...facts([node("13")]),
    run: { ...facts([]).run, reconciled: false },
  });
  assert.equal(reconciling.run.state, "RECONCILING");
  assert.deepEqual(reconciling.legalActions, [{ type: "reconcile_run" }]);

  const gates = [
    [{ trackerAvailable: false }, "tracker_unavailable"],
    [{ targetState: "DIRTY" }, "target_dirty"],
    [{ targetState: "UNKNOWN" }, "target_state_uncertain"],
  ];
  for (const [runFacts, reasonCode] of gates) {
    const status = reduceRun({ ...facts([node("13")]), run: { ...facts([]).run, ...runFacts } });
    assert.equal(status.run.state, "BLOCKED");
    assert.equal(status.diagnoses[0].reasonCode, reasonCode);
    assert.deepEqual(status.legalActions, []);
  }

  const completedChild = {
    ...node("13"),
    completionState: "COMPLETE",
    candidateReachable: true,
    trackerState: "CLOSED",
  };
  const parentUnknown = reduceRun({
    ...facts([completedChild]),
    run: { ...facts([]).run, parentTrackerState: "UNKNOWN" },
  });
  assert.equal(parentUnknown.run.state, "BLOCKED");
  assert.equal(parentUnknown.diagnoses[0].reasonCode, "parent_state_uncertain");

  const parentOpen = reduceRun(facts([completedChild]));
  assert.deepEqual(parentOpen.legalActions, [{ type: "close_parent", issueId: "12" }]);
});

function pausedJournal(pause) {
  return [
    grant,
    { ...pause.event, schema: "dag-run-event:v1", sequence: 2 },
    {
      schema: "dag-run-event:v1",
      sequence: 3,
      type: "pause.transitioned",
      at: "2026-08-30T00:02:00.000Z",
      revision: 1,
    },
  ];
}

test("remediation journal authority is scoped to the exact dispatch attempt with legacy compatibility", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-remediation-attempt-");
  const store = createRunStore({ gitCommonDir });
  const writer = store.acquireWriter("remediation-attempt-run");
  const taskRef = { threadId: "thread-13", hostId: "local" };
  const appendRemediation = (event = {}) => writer.append({
    type: "remediation.recorded",
    at: "2026-08-30T00:02:00.000Z",
    issueId: "13",
    attempt: 1,
    fingerprint: "selector-loopback",
    cycle: 1,
    adapter: "gradle-loopback-safe",
    ...event,
  });

  try {
    writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: {
        ...grantFor("SINGLE").runIdentity,
        runId: "remediation-attempt-run",
      },
    });
    assert.throws(() => appendRemediation({ attempt: undefined }), /remediation attempt is required/iu);
    assert.throws(() => appendRemediation(), /preceding dispatch/u);
    writer.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:01:00.000Z",
      issueId: "13",
      attempt: 1,
      taskRef,
    });
    appendRemediation();
    assert.throws(() => appendRemediation(), /one remediation cycle.*attempt 1/iu);
    assert.throws(() => appendRemediation({ attempt: 2 }), /current dispatch attempt 1/iu);
    writer.append({
      type: "retry.recorded",
      at: "2026-08-30T00:03:00.000Z",
      issueId: "13",
      attempt: 1,
      reason: "transient_terminal_failure",
      priorTaskRef: taskRef,
      replacement: null,
    });
    writer.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:04:00.000Z",
      issueId: "13",
      attempt: 2,
      taskRef,
    });
    assert.throws(() => appendRemediation({ attempt: 1 }), /current dispatch attempt 2/iu);
    appendRemediation({ attempt: 2 });
    assert.throws(() => appendRemediation({ attempt: 2 }), /one remediation cycle.*attempt 2/iu);
    assert.deepEqual(
      store.readEvents("remediation-attempt-run")
        .filter(({ type }) => type === "remediation.recorded")
        .map(({ attempt }) => attempt ?? null),
      [1, 2],
    );

    const legacyRunId = "legacy-remediation-run";
    const legacyEvents = [
      {
        ...grantFor("SINGLE"),
        runIdentity: { ...grantFor("SINGLE").runIdentity, runId: legacyRunId },
      },
      {
        ...dispatchEvent("13", 1, 2),
        taskRef,
      },
      {
        schema: "dag-run-event:v1",
        sequence: 3,
        type: "remediation.recorded",
        at: "2026-08-30T00:02:00.000Z",
        issueId: "13",
        fingerprint: "selector-loopback",
        cycle: 1,
        adapter: "gradle-loopback-safe",
      },
    ];
    const legacyRunDirectory = join(
      gitCommonDir,
      "matt-workflow-control",
      "runs",
      legacyRunId,
    );
    mkdirSync(legacyRunDirectory, { recursive: true });
    writeFileSync(
      join(legacyRunDirectory, "events.jsonl"),
      `${legacyEvents.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8",
    );
    assert.deepEqual(
      store.readEvents(legacyRunId)
        .filter(({ type }) => type === "remediation.recorded")
        .map(({ attempt }) => attempt ?? null),
      [null],
    );
  } finally {
    writer.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("the single writer appends ordered control events and atomically rebuilds disposable status", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-store-");
  const store = createRunStore({ gitCommonDir });
  try {
    const badOrderWriter = store.acquireWriter("bad-order");
    assert.throws(() => badOrderWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:00:00.000Z",
      issueId: "13",
      attempt: 1,
      taskRef: { threadId: "thread-13", hostId: "local" },
    }), /first Run event/u);
    badOrderWriter.release();

    const mismatchedWriter = store.acquireWriter("mismatched-run");
    assert.throws(() => mismatchedWriter.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: grant.runIdentity,
    }), /storage Run/u);
    mismatchedWriter.release();

    const retryWriter = store.acquireWriter("retry-run");
    retryWriter.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: { ...grant.runIdentity, runId: "retry-run" },
    });
    retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:01:00.000Z",
      issueId: "13",
      attempt: 1,
      taskRef: { threadId: "thread-13", hostId: "local" },
    });
    assert.throws(() => retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      attempt: 2,
      taskRef: { threadId: "replacement-13", hostId: "local" },
    }), /matching retry fact/u);
    retryWriter.append({
      type: "retry.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      attempt: 1,
      reason: "transient_terminal_failure",
      priorTaskRef: { threadId: "thread-13", hostId: "local" },
      replacement: null,
    });
    retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:03:00.000Z",
      issueId: "13",
      attempt: 2,
      taskRef: { threadId: "thread-13", hostId: "local" },
    });
    retryWriter.append({
      type: "retry.recorded",
      at: "2026-08-30T00:04:00.000Z",
      issueId: "13",
      attempt: 2,
      reason: "proven_inactive_task",
      priorTaskRef: { threadId: "thread-13", hostId: "local" },
      replacement: {
        supersedesAttempt: 2,
        nextTaskRef: { threadId: "replacement-13", hostId: "local" },
        inactiveEvidence: ["Codex task read-back reports the prior task cannot continue."],
      },
    });
    assert.throws(() => retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:05:00.000Z",
      issueId: "13",
      attempt: 3,
      taskRef: { threadId: "thread-13", hostId: "local" },
    }), /not authorized/u);
    assert.throws(() => retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:05:00.000Z",
      issueId: "14",
      attempt: 1,
      taskRef: { threadId: "replacement-13", hostId: "local" },
    }), /cannot serve both Issue/u);
    retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:05:00.000Z",
      issueId: "13",
      attempt: 3,
      taskRef: { threadId: "replacement-13", hostId: "local" },
    });
    assert.throws(() => retryWriter.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:06:00.000Z",
      issueId: "14",
      attempt: 1,
      taskRef: { threadId: "replacement-13", hostId: "local" },
    }), /cannot serve both Issue/u);
    assert.throws(() => retryWriter.append({
      type: "retry.recorded",
      at: "2026-08-30T00:06:00.000Z",
      issueId: "13",
      attempt: 3,
      reason: "proven_inactive_task",
      priorTaskRef: { threadId: "replacement-13", hostId: "local" },
      replacement: {
        supersedesAttempt: 3,
        nextTaskRef: { threadId: "thread-13", hostId: "local" },
        inactiveEvidence: ["Codex task read-back reports the replacement cannot continue."],
      },
    }), /new to this Run/u);
    retryWriter.release();

    const writer = store.acquireWriter("run-12");
    assert.throws(() => store.acquireWriter("run-12"), /RUN_WRITER_LOCKED/u);
    assert.throws(() => writer.append({
      type: "grant.recorded",
      at: "0",
      runIdentity: grant.runIdentity,
    }), /canonical ISO instant/u);

    const storedGrant = writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: grant.runIdentity,
    });
    const storedDispatch = writer.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:01:00.000Z",
      issueId: "13",
      attempt: 1,
      taskRef: { threadId: "thread-13", hostId: "local" },
    });
    assert.equal(storedGrant.sequence, 1);
    assert.equal(storedGrant.maxParallel, 3);
    assert.equal(storedDispatch.sequence, 2);
    assert.deepEqual(store.readEvents("run-12"), [storedGrant, storedDispatch]);
    assert.throws(() => writer.append({ type: "run.started", at: "2026-08-30T00:02:00.000Z" }), /event type/u);
    assert.throws(() => writer.append({
      type: "control.revised",
      at: "2026-08-30T00:02:00.000Z",
      revision: 2,
      command: "PAUSE",
    }), /next control revision/u);
    assert.throws(() => writer.append({
      type: "control.revised",
      at: "2026-08-30T00:02:00.000Z",
      revision: 1,
      command: "START",
    }), /control command/u);
    assert.throws(() => writer.append({
      schema: "caller-owned",
      sequence: 99,
      type: "retry.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      attempt: 1,
      reason: "terminal_failure",
    }), /store-owned/u);
    assert.throws(() => writer.append({
      type: "dispatch.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      attempt: 3,
      taskRef: { threadId: "thread-13", hostId: "local" },
    }), /next dispatch attempt/u);
    assert.throws(() => writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:02:00.000Z",
      runIdentity: { ...grant.runIdentity, approvedScopeHash: "sha256:changed-scope" },
    }), /preserve the Run identity/u);
    assert.throws(() => writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:02:00.000Z",
      runIdentity: grant.runIdentity,
      maxParallel: 9,
    }), /maxParallel/u);
    assert.throws(() => writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:02:00.000Z",
      runIdentity: grant.runIdentity,
      credential: "must-not-persist",
    }), /unknown field/u);
    assert.throws(() => writer.append({
      type: "pause.transitioned",
      at: "2026-08-30T00:02:00.000Z",
      revision: 1,
    }), /matching PAUSE/u);
    assert.throws(() => writer.append({
      type: "retry.recorded",
      at: "2026-08-30T00:02:00.000Z",
      issueId: "13",
      controlToken: "must-not-persist",
    }), /token/u);
    assert.equal(store.readEvents("run-12").length, 2);

    const currentFacts = facts([{ ...node("13"), taskState: "EXECUTING" }]);
    delete currentFacts.journal;
    const status = writer.rebuildStatus(currentFacts);
    assert.equal(status.run.state, "RUNNING");
    assert.equal(status.nodes[0].state, "EXECUTING");
    assert.deepEqual(store.readStatus("run-12"), status);

    const statusPath = join(gitCommonDir, "matt-workflow-control", "runs", "run-12", "status.json");
    const beforeRejectedWrite = readFileSync(statusPath, "utf8");
    assert.throws(() => writer.rebuildStatus({
      ...currentFacts,
      run: { ...currentFacts.run, controlToken: "must-not-persist" },
    }), /token/u);
    assert.equal(readFileSync(statusPath, "utf8"), beforeRejectedWrite);
    assert.throws(() => writer.publishStatus({
      ...status,
      run: { ...status.run, runId: "run-13" },
    }), /writer Run run-12/u);
    assert.equal(readFileSync(statusPath, "utf8"), beforeRejectedWrite);

    writeFileSync(statusPath, "{corrupt", "utf8");
    assert.equal(writer.rebuildStatus(currentFacts).run.state, "RUNNING");
    assert.equal(readdirSync(join(gitCommonDir, "matt-workflow-control", "runs", "run-12")).some((name) => name.includes(".tmp-")), false);

    writer.append({
      type: "control.revised",
      at: "2026-08-30T00:03:00.000Z",
      revision: 1,
      command: "PAUSE",
    });
    assert.throws(() => writer.append({
      type: "control.revised",
      at: "2026-08-30T00:04:00.000Z",
      revision: 2,
      command: "PAUSE",
    }), /idempotent/u);

    writer.release();
    const runDirectory = join(gitCommonDir, "matt-workflow-control", "runs", "run-12");
    assert.equal(existsSync(join(runDirectory, "engine.lock")), false);
    assert.equal(readdirSync(runDirectory).some((name) => name.startsWith("engine.lock.release-")), false);

    const closeWriter = store.acquireCloseWriter({ target: "features/ron", runId: "run-12" });
    assert.equal(store.readCloseWriter("features/ron"), "run-12");
    assert.throws(
      () => store.acquireCloseWriter({ target: "features/ron", runId: "another-run" }),
      /TARGET_CLOSE_WRITER_LOCKED/u,
    );
    store.acquireCloseWriter({ target: "another-target", runId: "another-run" }).release();
    closeWriter.release();
    assert.equal(store.readCloseWriter("features/ron"), null);
    assert.equal(readdirSync(join(gitCommonDir, "matt-workflow-control", "close-writers"))
      .some((name) => name.includes(".release-")), false);
    store.acquireCloseWriter({ target: "features/ron", runId: "another-run" }).release();

    const controlRoot = join(gitCommonDir, "matt-workflow-control");
    const cleanupLock = join(controlRoot, "cleanup.lock");
    mkdirSync(controlRoot, { recursive: true });
    mkdirSync(cleanupLock);
    assert.throws(() => store.acquireWriter("cleanup-race"), /CLEANUP_IN_PROGRESS/u);
    rmdirSync(cleanupLock);
    store.acquireWriter("run-12").release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the Run journal pairs one bounded target-writer wait with its exact outcome", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-writer-wait-");
  const store = createRunStore({ gitCommonDir, coordinatorInstanceId: "writer-wait-test" });
  const writer = store.acquireWriter("run-12");
  const owner = {
    operationId: "run-other-spec",
    coordinatorInstanceId: "coordinator-other-spec",
    generation: "generation-other-spec",
  };

  try {
    const preWaitEvidence = preWaitEvidenceFor(facts([node("13")]));
    writer.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: grant.runIdentity,
      maxParallel: 3,
    });
    const started = writer.append({
      type: "target-writer-wait.started",
      at: "2026-08-30T00:01:00.000Z",
      issueId: "13",
      target: "features/ron",
      owner,
      timeoutMs: 30_000,
      preWaitEvidence,
    });
    assert.equal(started.sequence, 2);
    assert.throws(() => writer.append({
      type: "target-writer-wait.started",
      at: "2026-08-30T00:01:01.000Z",
      issueId: "13",
      target: "features/ron",
      owner,
      timeoutMs: 30_000,
      preWaitEvidence,
    }), /already active/u);

    const settled = writer.append({
      type: "target-writer-wait.settled",
      at: "2026-08-30T00:01:20.000Z",
      waitSequence: started.sequence,
      issueId: "13",
      target: "features/ron",
      owner,
      outcome: "RELEASED",
      evidence: ["The exact competing target writer is absent."],
    });
    assert.equal(settled.sequence, 3);
    assert.equal(store.readEvents("run-12").at(-1).outcome, "RELEASED");
  } finally {
    writer.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup retains recent and newest terminal Runs and deletes only after an audit append", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-");
  const store = createRunStore({ gitCommonDir });
  const now = "2026-08-30T00:00:00.000Z";
  const daysAgo = (days) => new Date(Date.parse(now) - days * 86_400_000).toISOString();
  const terminalRuns = Array.from({ length: 13 }, (_, index) => ({
    runId: `terminal-${String(index).padStart(2, "0")}`,
    specId: String(100 + index),
    state: index === 2 ? "STOPPED" : "SUCCEEDED",
    terminalAt: daysAgo(index === 0 ? 1 : 30 + index),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  const guardedRuns = [
    { runId: "running-old", specId: "200", state: "RUNNING", terminalAt: daysAgo(100), engineLock: "RELEASED", activeTasks: "ABSENT" },
    { runId: "locked-old", specId: "201", state: "SUCCEEDED", terminalAt: daysAgo(100), engineLock: "RELEASED", activeTasks: "ABSENT" },
    { runId: "tasks-old", specId: "202", state: "STOPPED", terminalAt: daysAgo(100), engineLock: "RELEASED", activeTasks: "PRESENT" },
    { runId: "uncertain-old", specId: "203", state: "SUCCEEDED", terminalAt: daysAgo(100), engineLock: "UNKNOWN", activeTasks: "UNKNOWN" },
    { runId: "reclaiming-old", specId: "204", state: "SUCCEEDED", terminalAt: daysAgo(100), engineLock: "RELEASED", activeTasks: "ABSENT" },
  ];
  try {
    for (const { runId } of [...terminalRuns, ...guardedRuns]) {
      const writer = store.acquireWriter(runId);
      if (runId !== "locked-old") writer.release();
    }
    mkdirSync(join(
      gitCommonDir,
      "matt-workflow-control",
      "runs",
      "reclaiming-old",
      "engine-reclaim.lock",
    ));

    const preview = store.previewCleanup({ now, runs: [...terminalRuns, ...guardedRuns] });
    assert.deepEqual(preview.eligible.map(({ runId }) => runId), ["terminal-10", "terminal-11", "terminal-12"]);
    assert.equal(preview.skipped.find(({ runId }) => runId === "terminal-00").reason, "within_30_days");
    assert.equal(preview.skipped.find(({ runId }) => runId === "terminal-09").reason, "newest_10_terminal_runs");
    assert.equal(preview.skipped.find(({ runId }) => runId === "running-old").reason, "non_terminal");
    assert.equal(preview.skipped.find(({ runId }) => runId === "locked-old").reason, "engine_active_or_uncertain");
    assert.equal(preview.skipped.find(({ runId }) => runId === "tasks-old").reason, "tasks_active_or_uncertain");
    assert.equal(preview.skipped.find(({ runId }) => runId === "uncertain-old").reason, "engine_active_or_uncertain");
    assert.equal(preview.skipped.find(({ runId }) => runId === "reclaiming-old").reason, "engine_active_or_uncertain");

    const applied = store.applyCleanup({ now, runs: [...terminalRuns, ...guardedRuns] });
    assert.deepEqual(applied.removed, ["terminal-10", "terminal-11", "terminal-12"]);
    for (const runId of applied.removed) {
      assert.equal(existsSync(join(gitCommonDir, "matt-workflow-control", "runs", runId)), false);
    }
    assert.deepEqual(store.readCleanupRecords().map(({ runId }) => runId), applied.removed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup append failure preserves every eligible Run directory", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-failure-");
  const store = createRunStore({ gitCommonDir });
  const now = "2026-08-30T00:00:00.000Z";
  const runs = Array.from({ length: 11 }, (_, index) => ({
    runId: `failure-${String(index).padStart(2, "0")}`,
    specId: String(300 + index),
    state: "SUCCEEDED",
    terminalAt: new Date(Date.parse(now) - (40 + index) * 86_400_000).toISOString(),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  const cleanupPath = join(gitCommonDir, "matt-workflow-control", "cleanup.jsonl");
  try {
    for (const { runId } of runs) store.acquireWriter(runId).release();
    writeFileSync(cleanupPath, "", "utf8");
    chmodSync(cleanupPath, 0o444);
    assert.throws(() => store.applyCleanup({ now, runs }));
    assert.equal(existsSync(join(gitCommonDir, "matt-workflow-control", "runs", "failure-10")), true);
  } finally {
    if (existsSync(cleanupPath)) chmodSync(cleanupPath, 0o666);
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup rejects duplicate Run evidence before destructive retention", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-duplicate-");
  const store = createRunStore({ gitCommonDir });
  const runId = "duplicate-run";
  const now = "2026-08-30T00:00:00.000Z";
  try {
    store.acquireWriter(runId).release();
    const runs = [
      {
        runId,
        specId: "400",
        state: "SUCCEEDED",
        terminalAt: "2026-06-01T00:00:00.000Z",
        engineLock: "RELEASED",
        activeTasks: "ABSENT",
      },
      {
        runId,
        specId: "400",
        state: "RUNNING",
        terminalAt: null,
        engineLock: "RELEASED",
        activeTasks: "PRESENT",
      },
    ];
    assert.throws(() => store.previewCleanup({ now, runs }), /duplicate runId/u);
    assert.throws(() => store.applyCleanup({ now, runs }), /duplicate runId/u);
    assert.equal(existsSync(join(gitCommonDir, "matt-workflow-control", "runs", runId)), true);
    assert.deepEqual(store.readCleanupRecords(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup requires complete Spec audit identity before destructive retention", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-spec-");
  const store = createRunStore({ gitCommonDir });
  const runId = "missing-spec-run";
  const now = "2026-08-30T00:00:00.000Z";
  try {
    store.acquireWriter(runId).release();
    const incomplete = [{
      runId,
      state: "SUCCEEDED",
      terminalAt: "2026-06-01T00:00:00.000Z",
      engineLock: "RELEASED",
      activeTasks: "ABSENT",
    }];
    assert.throws(() => store.previewCleanup({ now, runs: incomplete }), /specId/u);
    assert.throws(() => store.applyCleanup({ now, runs: incomplete }), /specId/u);
    assert.equal(existsSync(join(gitCommonDir, "matt-workflow-control", "runs", runId)), true);
    assert.deepEqual(store.readCleanupRecords(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup newest-ten floor ignores absent directories", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-absent-");
  const store = createRunStore({ gitCommonDir });
  const now = "2026-08-30T00:00:00.000Z";
  const daysAgo = (days) => new Date(Date.parse(now) - days * 86_400_000).toISOString();
  const existing = Array.from({ length: 11 }, (_, index) => ({
    runId: `existing-${String(index).padStart(2, "0")}`,
    specId: String(500 + index),
    state: "SUCCEEDED",
    terminalAt: daysAgo(40 + index),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  const absent = Array.from({ length: 10 }, (_, index) => ({
    runId: `absent-${String(index).padStart(2, "0")}`,
    specId: String(600 + index),
    state: "SUCCEEDED",
    terminalAt: daysAgo(index + 1),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  try {
    for (const { runId } of existing) store.acquireWriter(runId).release();
    const preview = store.previewCleanup({ now, runs: [...absent, ...existing] });
    assert.deepEqual(preview.eligible.map(({ runId }) => runId), ["existing-10"]);
    assert.equal(preview.skipped.filter(({ reason }) => reason === "newest_10_terminal_runs").length, 10);
    assert.equal(preview.skipped.filter(({ reason }) => reason === "run_directory_absent").length, 10);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cleanup recovers an exact stale lease and resumes append-before-delete idempotently", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-cleanup-reclaim-");
  const store = createRunStore({ gitCommonDir, coordinatorInstanceId: "cleanup-new" });
  const now = "2026-08-30T00:00:00.000Z";
  const runs = Array.from({ length: 11 }, (_, index) => ({
    runId: `recover-${String(index).padStart(2, "0")}`,
    specId: String(700 + index),
    state: "SUCCEEDED",
    terminalAt: new Date(Date.parse(now) - (40 + index) * 86_400_000).toISOString(),
    engineLock: "RELEASED",
    activeTasks: "ABSENT",
  }));
  const controlRoot = join(gitCommonDir, "matt-workflow-control");
  const runsRoot = join(controlRoot, "runs");
  const cleanupLock = join(controlRoot, "cleanup.lock");
  const cleanupTakeover = `${cleanupLock}.takeover.lock`;
  const cleanupTakeoverStale = `${cleanupTakeover}.stale-claim`;
  try {
    for (const { runId } of runs) mkdirSync(join(runsRoot, runId), { recursive: true });
    writeFileSync(join(controlRoot, "cleanup.jsonl"), `${JSON.stringify({
      schema: "dag-run-cleanup:v1",
      sequence: 1,
      runId: "recover-10",
      specId: "710",
      terminalState: "SUCCEEDED",
      deletionTime: now,
      retentionReason: "older_than_30_days_and_outside_newest_10",
    })}\n`, "utf8");
    mkdirSync(cleanupLock);
    writeFileSync(join(cleanupLock, "owner.json"), `${JSON.stringify({
      schema: "dag-run-lock-owner:v1",
      kind: "cleanup",
      runId: "cleanup",
      coordinatorInstanceId: "cleanup-old",
      generation: "cleanup-generation-old",
    })}\n`, "utf8");
    mkdirSync(cleanupTakeover);
    writeFileSync(join(cleanupTakeover, "owner.json"), `${JSON.stringify({
      schema: "dag-run-lock-owner:v1",
      kind: "cleanup-takeover",
      runId: "cleanup",
      coordinatorInstanceId: "cleanup-takeover-old",
      generation: "cleanup-takeover-generation-old",
    })}\n`, "utf8");
    mkdirSync(cleanupTakeoverStale);
    writeFileSync(join(cleanupTakeoverStale, "owner.json"), `${JSON.stringify({
      schema: "dag-run-lock-owner:v1",
      kind: "cleanup-takeover",
      runId: "cleanup",
      coordinatorInstanceId: "cleanup-takeover-archive",
      generation: "cleanup-takeover-generation-archive",
    })}\n`, "utf8");
    assert.equal(store.readCleanupLock().state, "TAKEOVER_ACTIVE");
    assert.equal(
      store.readCleanupLock().claimOwner.generation,
      "cleanup-takeover-generation-old",
    );
    assert.throws(() => store.applyCleanup({ now, runs }), /CLEANUP_WRITER_LOCKED/u);
    assert.throws(() => store.previewCleanup({ now: "0", runs }), /ISO time/u);
    assert.throws(() => store.previewCleanup({
      now,
      runs: runs.map((run, index) => (index === 0 ? { ...run, terminalAt: "0" } : run)),
    }), /canonical ISO instant/u);
    const applied = store.applyCleanup({
      now,
      runs,
      cleanupStaleProof: {
        previousCoordinatorInstanceId: "cleanup-old",
        previousGeneration: "cleanup-generation-old",
        coordinatorState: "INACTIVE",
        reconciled: true,
        evidence: ["Coordinator read-back proves cleanup-old is inactive."],
        abandonedOperationIds: [],
      },
      cleanupClaimStaleProof: {
        previousCoordinatorInstanceId: "cleanup-takeover-old",
        previousGeneration: "cleanup-takeover-generation-old",
        coordinatorState: "INACTIVE",
        reconciled: true,
        evidence: ["Coordinator read-back proves the takeover owner is inactive."],
        abandonedOperationIds: [],
      },
    });
    assert.deepEqual(applied.removed, ["recover-10"]);
    assert.equal(existsSync(join(runsRoot, "recover-10")), false);
    assert.equal(store.readCleanupRecords().length, 1);
    assert.equal(existsSync(cleanupLock), false);

    mkdirSync(cleanupLock);
    writeFileSync(join(cleanupLock, "owner.json"), "{corrupt", "utf8");
    assert.throws(() => store.applyCleanup({
      now,
      runs,
      cleanupStaleProof: {
        previousCoordinatorInstanceId: "cleanup-old",
        previousGeneration: "cleanup-generation-old",
        coordinatorState: "INACTIVE",
        reconciled: true,
        evidence: ["The malformed owner cannot authorize recovery."],
        abandonedOperationIds: [],
      },
    }));
    assert.equal(existsSync(cleanupLock), true);
    assert.equal(store.readCleanupLock().state, "UNKNOWN");
    assert.throws(() => store.applyCleanup({ now, runs }), /CLEANUP_WRITER_LOCKED/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit stale-owner proof can reclaim same-Run engine and close locks", () => {
  const { root, gitCommonDir } = createGitCommonDirFixture("dag-run-lock-reclaim-");
  const oldStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "coordinator-old" });
  const newStore = createRunStore({ gitCommonDir, coordinatorInstanceId: "coordinator-new" });
  const staleProofFor = (owner, abandonedOperationIds = []) => ({
    previousCoordinatorInstanceId: owner.coordinatorInstanceId,
    previousGeneration: owner.generation,
    coordinatorState: "INACTIVE",
    reconciled: true,
    evidence: ["Codex task read-back proves the previous coordinator is inactive."],
    abandonedOperationIds,
  });
  try {
    const oldWriter = oldStore.acquireWriter("reclaim-run");
    const oldOwner = oldStore.readWriterLock("reclaim-run");
    const staleProof = staleProofFor(oldOwner);
    assert.equal(oldOwner.coordinatorInstanceId, "coordinator-old");
    assert.throws(() => newStore.acquireWriter("reclaim-run"), /RUN_WRITER_LOCKED/u);
    assert.throws(() => newStore.reclaimWriter({
      runId: "reclaim-run",
      staleProof: { ...staleProof, previousCoordinatorInstanceId: "wrong-owner" },
    }), /STALE_PROOF_MISMATCH/u);
    const strandedGate = join(
      gitCommonDir,
      "matt-workflow-control",
      "runs",
      "reclaim-run",
      "engine-reclaim.lock",
    );
    mkdirSync(strandedGate);
    writeFileSync(join(strandedGate, "owner.json"), `${JSON.stringify({
      schema: "dag-run-lock-owner:v1",
      kind: "engine-reclaim",
      runId: "reclaim-run",
      coordinatorInstanceId: "coordinator-gate-old",
      generation: "gate-generation-old",
    })}\n`, "utf8");
    assert.equal(newStore.readWriterReclaimLock("reclaim-run").generation, "gate-generation-old");
    assert.throws(() => newStore.reclaimWriter({
      runId: "reclaim-run",
      staleProof,
      gateStaleProof: staleProofFor({
        coordinatorInstanceId: "coordinator-gate-old",
        generation: "wrong-gate-generation",
      }),
    }), /GATE_STALE_PROOF_MISMATCH/u);
    assert.equal(newStore.readWriterReclaimLock("reclaim-run").generation, "gate-generation-old");
    const adoptedWriter = newStore.reclaimWriter({
      runId: "reclaim-run",
      staleProof,
      gateStaleProof: {
        ...staleProofFor({
          coordinatorInstanceId: "coordinator-gate-old",
          generation: "gate-generation-old",
        }),
      },
    });
    assert.equal(newStore.readWriterLock("reclaim-run").coordinatorInstanceId, "coordinator-new");
    assert.throws(() => oldWriter.append({
      type: "grant.recorded",
      at: "2026-08-30T00:00:00.000Z",
      runIdentity: { ...grant.runIdentity, runId: "reclaim-run" },
      maxParallel: 3,
    }), /LOCK_LEASE_FENCED/u);
    assert.throws(() => oldWriter.release(), /LOCK_LEASE_FENCED/u);
    assert.equal(newStore.readWriterLock("reclaim-run").coordinatorInstanceId, "coordinator-new");
    adoptedWriter.release();

    const laterOldWriter = oldStore.acquireWriter("reclaim-run");
    assert.throws(() => newStore.reclaimWriter({ runId: "reclaim-run", staleProof }), /STALE_PROOF_MISMATCH/u);
    laterOldWriter.release();

    const operationWriter = oldStore.acquireWriter("operation-run");
    const operationOwner = oldStore.readWriterLock("operation-run");
    const operationId = `operation.${operationOwner.generation}.abandoned.lock`;
    mkdirSync(join(
      gitCommonDir,
      "matt-workflow-control",
      "runs",
      "operation-run",
      "engine.lock",
      operationId,
    ));
    assert.deepEqual(oldStore.readWriterLock("operation-run").activeOperationIds, [operationId]);
    assert.throws(() => newStore.reclaimWriter({
      runId: "operation-run",
      staleProof: staleProofFor(operationOwner),
    }), /OPERATION_ACTIVE_OR_UNPROVEN/u);
    const recoveredOperationWriter = newStore.reclaimWriter({
      runId: "operation-run",
      staleProof: staleProofFor(operationOwner, [operationId]),
    });
    assert.throws(() => operationWriter.release(), /LOCK_LEASE_FENCED/u);
    recoveredOperationWriter.release();

    const oldCloseWriter = oldStore.acquireCloseWriter({ target: "features/ron", runId: "reclaim-run" });
    const oldCloseOwner = oldStore.readCloseWriterLock("features/ron");
    const closeStaleProof = staleProofFor(oldCloseOwner);
    assert.equal(oldCloseOwner.coordinatorInstanceId, "coordinator-old");
    assert.throws(
      () => newStore.acquireCloseWriter({ target: "features/ron", runId: "reclaim-run" }),
      /TARGET_CLOSE_WRITER_LOCKED/u,
    );
    const adoptedCloseWriter = newStore.reclaimTargetMutationWriter({
      target: "features/ron",
      operationId: "reclaim-run",
      staleProof: closeStaleProof,
    });
    assert.equal(
      newStore.readTargetMutationWriterLock("features/ron").coordinatorInstanceId,
      "coordinator-new",
    );
    assert.throws(() => oldCloseWriter.assertCurrent(), /LOCK_LEASE_FENCED/u);
    assert.throws(() => oldCloseWriter.release(), /LOCK_LEASE_FENCED/u);
    assert.equal(
      newStore.readTargetMutationWriterLock("features/ron").coordinatorInstanceId,
      "coordinator-new",
    );
    adoptedCloseWriter.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
