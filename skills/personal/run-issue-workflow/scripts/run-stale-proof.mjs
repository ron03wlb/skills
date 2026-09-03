const staleProofFields = new Set([
  "previousCoordinatorInstanceId",
  "previousGeneration",
  "coordinatorState",
  "reconciled",
  "evidence",
  "abandonedOperationIds",
]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;

export const validateStaleOwnerProof = (proof) => {
  if (!isRecord(proof)) throw new TypeError("stale-owner proof must be an object");
  const unknown = Object.keys(proof).find((key) => !staleProofFields.has(key));
  if (unknown) throw new TypeError(`stale-owner proof contains unknown field ${unknown}`);
  if (!isText(proof.previousCoordinatorInstanceId)) {
    throw new TypeError("stale-owner previousCoordinatorInstanceId is required");
  }
  if (!isText(proof.previousGeneration)) {
    throw new TypeError("stale-owner previousGeneration is required");
  }
  if (proof.coordinatorState !== "INACTIVE" || proof.reconciled !== true
    || !Array.isArray(proof.evidence) || proof.evidence.length === 0 || !proof.evidence.every(isText)
    || !Array.isArray(proof.abandonedOperationIds)
    || !proof.abandonedOperationIds.every(isText)
    || new Set(proof.abandonedOperationIds).size !== proof.abandonedOperationIds.length) {
    throw new TypeError("Reclaim requires reconciled INACTIVE coordinator evidence");
  }
  return proof;
};

export const isExactStaleOwnerProof = (proof) => {
  try {
    validateStaleOwnerProof(proof);
    return true;
  } catch {
    return false;
  }
};
