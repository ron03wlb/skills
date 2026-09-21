import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readInstalledCapability } from "./installed-capability.mjs";

export function configureHostInput(input = process.stdin) {
  if (!input.isTTY) return () => {};
  if (typeof input.setRawMode !== "function") throw new Error("TTY input cannot enable native raw mode");
  const previous = input.isRaw === true;
  input.setRawMode(true);
  return () => input.setRawMode(previous);
}

export async function runInstalledCapabilityIdentity({ packageVersionId } = {}) {
  return readInstalledCapability({ packageVersionId });
}

// One-release compatibility alias. It executes the same minimal probe and retains no samples.
export const runInstalledRepairQualificationIdentity = runInstalledCapabilityIdentity;

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, packageVersionId] = process.argv.slice(2);
  if (["--capability-identity", "--qualification-identity"].includes(mode)) {
    try {
      const identity = await runInstalledCapabilityIdentity({ packageVersionId });
      process.stdout.write(JSON.stringify(identity));
      if (identity.state !== "READY") {
        process.stderr.write(`${identity.reason}\n`);
        process.exitCode = 1;
      }
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  } else if (mode === "--qualify-repair-package") {
    process.stderr.write("--qualify-repair-package is retired; use --capability-identity\n");
    process.exitCode = 2;
  } else {
    process.stderr.write("Usage: installed-entry.mjs --capability-identity <packageVersionId>\n");
    process.exitCode = 1;
  }
}
