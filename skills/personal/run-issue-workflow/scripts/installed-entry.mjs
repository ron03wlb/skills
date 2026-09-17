import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const cacheDirectory = resolve(packageRoot, "../..");

// The installed entry no longer opens a Codex-native host boundary. The delivery host is the
// pi-workflow bundle launched by `/workflow run <bundle spec.json> "<round JSON>"`; this module keeps
// only the installed-package repair-qualification probes that the trusted installation evidence reads.
export function configureHostInput(input = process.stdin) {
  if (!input.isTTY) return () => {};
  if (typeof input.setRawMode !== "function")
    throw new Error("TTY input cannot enable native raw mode");
  const previous = input.isRaw === true;
  input.setRawMode(true);
  return () => input.setRawMode(previous);
}

export async function runInstalledRepairQualification({ packageVersionId }) {
  const entryPath = fileURLToPath(import.meta.url);
  const command = JSON.stringify([
    process.execPath,
    entryPath,
    "--qualify-repair-package",
    packageVersionId,
  ]);
  const qualification = await import("./workflow-repair-qualification.mjs");
  const result = await qualification.runWorkflowRepairQualification({
    packageVersionId,
    command,
  });
  if (result.state === "UNKNOWN") return result;
  // POSIX atomic publication: a complete retained sample becomes visible in one rename and
  // an interrupted writer can never leave a partially written sample behind.
  const directory = join(cacheDirectory, "qualification");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${result.boundInputs.packageVersionId}.json`);
  const temporary = `${path}.${randomUUID()}`;
  writeFileSync(temporary, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
  return result;
}

// The lightweight identity a reuse decision needs: exact package, installed fixture bytes,
// runtime and proven platform capability, without replaying the qualification stages.
export async function runInstalledRepairQualificationIdentity({
  packageVersionId,
}) {
  const qualification = await import("./workflow-repair-qualification.mjs");
  return qualification.readWorkflowQualificationIdentity({ packageVersionId });
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [repository, specId] = process.argv.slice(2);
  if (repository === "--qualify-repair-package") {
    try {
      const result = await runInstalledRepairQualification({
        packageVersionId: specId,
      });
      process.stdout.write(JSON.stringify(result));
      if (result.state === "UNKNOWN") {
        process.stderr.write(`${result.reason}\n`);
        process.exitCode = 1;
      }
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  } else if (repository === "--qualification-identity") {
    try {
      const identity = await runInstalledRepairQualificationIdentity({
        packageVersionId: specId,
      });
      process.stdout.write(JSON.stringify(identity));
      if (identity.state === "UNKNOWN") {
        process.stderr.write(`${identity.reason}\n`);
        process.exitCode = 1;
      }
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  } else {
    process.stderr.write(
      "Usage: installed-entry.mjs --qualification-identity <packageVersionId> | --qualify-repair-package <packageVersionId>\n",
    );
    process.exitCode = 1;
  }
}
