import { isAbsolute, normalize } from "node:path";

export const LEGACY_COMPATIBILITY_REQUEST_SCHEMA = "workflow-control-legacy-request:v1";
export const LEGACY_COMPATIBILITY_RESPONSE_SCHEMA = "workflow-control-legacy-response:v1";
const operations = new Set(["normalize_identity", "validate_transaction", "validate_stage_result"]);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const assertSecretFree = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) throw new TypeError("Legacy compatibility payload must not contain cycles");
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|secret|password|credential)/iu.test(key))
      throw new TypeError(`Legacy compatibility payload contains secret field ${key}`);
    assertSecretFree(child, seen);
  }
  seen.delete(value);
};

export function runLegacyCompatibilityRequest(request) {
  if (!isRecord(request) || request.schema !== LEGACY_COMPATIBILITY_REQUEST_SCHEMA)
    throw new TypeError("Legacy compatibility request has an unsupported schema");
  const fields = Object.keys(request).sort();
  if (JSON.stringify(fields) !== JSON.stringify(["checkpointPath", "operation", "payload", "schema"]))
    throw new TypeError("Legacy compatibility request fields differ");
  if (!operations.has(request.operation)) throw new TypeError("Legacy compatibility operation is unsupported");
  if (typeof request.checkpointPath !== "string" || !isAbsolute(request.checkpointPath)
    || normalize(request.checkpointPath) !== request.checkpointPath)
    throw new TypeError("Legacy compatibility requires one exact normalized checkpoint path");
  if (!isRecord(request.payload)) throw new TypeError("Legacy compatibility payload must be an object");
  assertSecretFree(request.payload);
  return {
    schema: LEGACY_COMPATIBILITY_RESPONSE_SCHEMA,
    operation: request.operation,
    checkpointPath: request.checkpointPath,
    payload: request.payload,
  };
}
