import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runLegacyCompatibilityRequest } from "./workflow-control-store-legacy.mjs";

export const LEGACY_COMPATIBILITY_MAX_BYTES = 256 * 1024;

export function runLegacyCompatibilityEntry(input) {
  if (Buffer.byteLength(input) > LEGACY_COMPATIBILITY_MAX_BYTES)
    throw new Error(`Legacy compatibility input exceeds ${LEGACY_COMPATIBILITY_MAX_BYTES} bytes`);
  let request;
  try {
    request = JSON.parse(input);
  } catch (error) {
    throw new TypeError(`Legacy compatibility input is not JSON: ${error.message}`);
  }
  const output = `${JSON.stringify(runLegacyCompatibilityRequest(request))}\n`;
  if (Buffer.byteLength(output) > LEGACY_COMPATIBILITY_MAX_BYTES)
    throw new Error(`Legacy compatibility output exceeds ${LEGACY_COMPATIBILITY_MAX_BYTES} bytes`);
  return output;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(runLegacyCompatibilityEntry(readFileSync(0, "utf8")));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
