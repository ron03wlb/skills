import { createHash } from "node:crypto";

export const WORKFLOW_OPERATION_IDENTITY_SCHEMA = "workflow-operation-identity:v1";

const operationInputFields = new Set([
  "repositoryId",
  "specId",
  "approvedPublicationIdentity",
  "producer",
  "stage",
  "issueId",
]);
const reservationInputFields = new Set(["repositoryId", "proposedSpecIdentity"]);
const receiptFields = new Set(["schema", "key", ...operationInputFields]);
const canonicalRepositoryPattern = /^[a-z][a-z0-9+.-]*:[^\s]+$/u;
const operationKeyPattern = /^workflow-op-v1-[a-f0-9]{64}$/u;
const stagesByProducer = Object.freeze({
  "to-spec": new Set(["publication"]),
  "to-tickets": new Set(["decomposition"]),
  "run-issue-workflow": new Set(["run"]),
  "execute-issue": new Set(["implementation"]),
  "close-issue": new Set(["closeout"]),
  "verify-target-before-push": new Set(["aggregate-verification"]),
});
const issueScopedProducers = new Set(["execute-issue", "close-issue"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;

const assertExactFields = (value, fields, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const unknown = Object.keys(value).find((key) => !fields.has(key));
  const missing = [...fields].find((key) => !Object.hasOwn(value, key));
  if (unknown) throw new TypeError(`${label} contains unknown field ${unknown}`);
  if (missing) throw new TypeError(`${label} is missing field ${missing}`);
};

const assertRepositoryId = (repositoryId) => {
  if (!isText(repositoryId) || !canonicalRepositoryPattern.test(repositoryId)) {
    throw new TypeError("repositoryId must be one canonical repository identity");
  }
};

const digest = (identity) => createHash("sha256")
  .update(JSON.stringify(identity))
  .digest("hex");

const normalizeOperationInput = (input) => {
  assertExactFields(input, operationInputFields, "workflow operation identity input");
  assertRepositoryId(input.repositoryId);
  for (const field of ["specId", "approvedPublicationIdentity", "producer", "stage"]) {
    if (!isText(input[field])) throw new TypeError(`${field} is required`);
  }
  const stages = stagesByProducer[input.producer];
  if (!stages?.has(input.stage)) {
    throw new TypeError(`Unsupported workflow operation producer and stage ${input.producer}:${input.stage}`);
  }
  if (issueScopedProducers.has(input.producer)) {
    if (!isText(input.issueId)) throw new TypeError("issueId is required for Issue-scoped workflow operations");
  } else if (input.issueId !== null) {
    throw new TypeError("issueId must be null for Spec-scoped workflow operations");
  }
  return {
    repositoryId: input.repositoryId,
    specId: input.specId,
    approvedPublicationIdentity: input.approvedPublicationIdentity,
    producer: input.producer,
    stage: input.stage,
    issueId: input.issueId,
  };
};

const receiptFor = (identity) => Object.freeze({
  schema: WORKFLOW_OPERATION_IDENTITY_SCHEMA,
  key: `workflow-op-v1-${digest(identity)}`,
  ...identity,
});

export function deriveWorkflowOperationIdentity(input) {
  return receiptFor(normalizeOperationInput(input));
}

const deriveSpecScopedOperation = (input, producer, stage) => deriveWorkflowOperationIdentity({
  repositoryId: input.repositoryId,
  specId: input.specId,
  approvedPublicationIdentity: input.approvedPublicationIdentity,
  producer,
  stage,
  issueId: null,
});

const deriveIssueScopedOperation = (input, producer, stage) => deriveWorkflowOperationIdentity({
  repositoryId: input.repositoryId,
  specId: input.specId,
  approvedPublicationIdentity: input.approvedPublicationIdentity,
  producer,
  stage,
  issueId: input.issueId,
});

export function deriveToSpecPublicationOperationIdentity(input) {
  return deriveSpecScopedOperation(input, "to-spec", "publication");
}

export function deriveToTicketsOperationIdentity(input) {
  return deriveSpecScopedOperation(input, "to-tickets", "decomposition");
}

export function deriveRunOperationIdentity(input) {
  return deriveSpecScopedOperation(input, "run-issue-workflow", "run");
}

export function deriveExecuteIssueOperationIdentity(input) {
  return deriveIssueScopedOperation(input, "execute-issue", "implementation");
}

export function deriveCloseIssueOperationIdentity(input) {
  return deriveIssueScopedOperation(input, "close-issue", "closeout");
}

export function deriveAggregateVerificationOperationIdentity(input) {
  return deriveSpecScopedOperation(input, "verify-target-before-push", "aggregate-verification");
}

export function deriveSpecReservationOperationIdentity(input) {
  assertExactFields(input, reservationInputFields, "Spec reservation operation identity input");
  assertRepositoryId(input.repositoryId);
  if (!isText(input.proposedSpecIdentity)) {
    throw new TypeError("proposedSpecIdentity is required");
  }
  return receiptFor({
    repositoryId: input.repositoryId,
    specId: null,
    approvedPublicationIdentity: input.proposedSpecIdentity,
    producer: "to-spec",
    stage: "reservation",
    issueId: null,
  });
}

export function bindProducerCheckpointOperationIdentity(identity) {
  if (!isRecord(identity)) throw new TypeError("Producer checkpoint identity must be an object");
  if (identity.profileVersion !== "v2") {
    throw new TypeError("Only a current-profile producer checkpoint can bind a new operation identity");
  }
  if (!isRecord(identity.bindings)) throw new TypeError("Producer checkpoint bindings must be an object");
  const input = {
    repositoryId: identity.repositoryId,
    specId: identity.specId,
    approvedPublicationIdentity: identity.bindings.approvedScopeIdentity,
  };
  const operationIdentity = identity.producerCommand === "to-spec"
    ? deriveToSpecPublicationOperationIdentity(input)
    : identity.producerCommand === "to-tickets"
      ? deriveToTicketsOperationIdentity(input)
      : (() => { throw new TypeError("Unsupported producer checkpoint operation"); })();
  if (Object.hasOwn(identity.bindings, "operationIdentity")) {
    const existing = assertWorkflowOperationIdentity(
      identity.bindings.operationIdentity,
      operationIdentity,
    );
    if (identity.operationId !== existing.key) {
      throw new TypeError("Producer checkpoint operation identity key mismatch");
    }
    return identity;
  }
  return {
    ...identity,
    operationId: operationIdentity.key,
    bindings: { ...identity.bindings, operationIdentity },
  };
}

export function createProducerOperationCheckpoint({ store, identity }) {
  if (typeof store?.readCheckpoint !== "function" || typeof store?.createCheckpoint !== "function") {
    throw new TypeError("Producer checkpoint adapter requires readCheckpoint() and createCheckpoint()");
  }
  if (identity?.profileVersion === "v2"
    && isRecord(identity.bindings)
    && Object.hasOwn(identity.bindings, "operationIdentity")) {
    return store.createCheckpoint(bindProducerCheckpointOperationIdentity(identity));
  }
  const existing = store.readCheckpoint(identity);
  if (existing) return store.createCheckpoint(identity);
  if (identity?.profileVersion !== "v2") return store.createCheckpoint(identity);
  return store.createCheckpoint(bindProducerCheckpointOperationIdentity(identity));
}

export function assertWorkflowOperationIdentity(receipt, expected = {}) {
  assertExactFields(receipt, receiptFields, "workflow operation identity receipt");
  if (receipt.schema !== WORKFLOW_OPERATION_IDENTITY_SCHEMA) {
    throw new TypeError("Unsupported workflow operation identity schema");
  }
  if (!operationKeyPattern.test(receipt.key)) {
    throw new TypeError("Workflow operation key is malformed");
  }
  const identity = receipt.stage === "reservation"
    ? deriveSpecReservationOperationIdentity({
      repositoryId: receipt.repositoryId,
      proposedSpecIdentity: receipt.approvedPublicationIdentity,
    })
    : deriveWorkflowOperationIdentity(Object.fromEntries(
      [...operationInputFields].map((field) => [field, receipt[field]]),
    ));
  if (receipt.key !== identity.key
    || [...receiptFields].some((field) => receipt[field] !== identity[field])) {
    throw new TypeError("Workflow operation identity receipt does not match its immutable inputs");
  }
  for (const [field, value] of Object.entries(expected)) {
    if (!receiptFields.has(field)) throw new TypeError(`Unknown expected workflow operation field ${field}`);
    if (receipt[field] !== value) {
      throw new TypeError(`Workflow operation identity ${field} mismatch`);
    }
  }
  return identity;
}
