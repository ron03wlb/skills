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

export function acquireCloseIssueLeases({ store, target, operationId }) {
  requireMethod(store, "acquireRepositoryCloseLease");
  requireMethod(store, "acquireTargetMutationWriter");
  const exactTarget = requireIdentity(target, "target");
  const exactOperationId = requireIdentity(operationId, "operationId");
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
    target: exactTarget,
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
