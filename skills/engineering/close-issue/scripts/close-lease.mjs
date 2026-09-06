import { deriveCloseIssueOperationIdentity } from "../../../personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const requireMethod = (value, method) => {
  if (typeof value?.[method] !== "function") {
    throw new TypeError(`Close-issue lease store requires ${method}()`);
  }
};

const requireIdentity = (value, label) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`Close-issue ${label} must be a non-empty string`);
  }
  return value.trim();
};

export function acquireCloseIssueLeases(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Close-issue lease input must be an object");
  }
  const unknown = Object.keys(input).find((field) => !inputFields.has(field));
  const missing = [...inputFields].find((field) => !Object.hasOwn(input, field));
  if (unknown) throw new TypeError(`Close-issue lease input contains unknown field ${unknown}`);
  if (missing) throw new TypeError(`Close-issue lease input is missing field ${missing}`);
  const {
    store,
    target,
    repositoryId,
    specId,
    approvedPublicationIdentity,
    issueId,
  } = input;
  requireMethod(store, "acquireRepositoryCloseLease");
  requireMethod(store, "acquireTargetMutationWriter");
  const exactTarget = requireIdentity(target, "target");
  const operationIdentity = deriveCloseIssueOperationIdentity({
    repositoryId,
    specId,
    approvedPublicationIdentity,
    issueId,
  });
  const exactOperationId = operationIdentity.key;
  const repositoryLease = store.acquireRepositoryCloseLease({ operationId: exactOperationId });
  let targetWriter;

  try {
    targetWriter = store.acquireTargetMutationWriter({
      target: exactTarget,
      operationId: exactOperationId,
    });
  } catch (acquisitionError) {
    try {
      repositoryLease.release();
    } catch (releaseError) {
      throw new AggregateError(
        [acquisitionError, releaseError],
        "CLOSE_ISSUE_TARGET_ACQUIRE_AND_REPOSITORY_RELEASE_FAILED",
      );
    }
    throw acquisitionError;
  }

  let targetReleased = false;
  let repositoryReleased = false;
  return Object.freeze({
    operationId: exactOperationId,
    operationIdentity,
    target: exactTarget,
    gitCommonDir: store.gitCommonDir,
    assertCurrent() {
      if (targetReleased || repositoryReleased) throw new Error("CLOSE_ISSUE_LEASES_RELEASED");
      repositoryLease.assertCurrent();
      targetWriter.assertCurrent();
      return true;
    },
    release() {
      if (!targetReleased) {
        targetWriter.release();
        targetReleased = true;
      }
      if (!repositoryReleased) {
        repositoryLease.release();
        repositoryReleased = true;
      }
    },
  });
}

const inputFields = new Set([
  "store",
  "target",
  "repositoryId",
  "specId",
  "approvedPublicationIdentity",
  "issueId",
]);
