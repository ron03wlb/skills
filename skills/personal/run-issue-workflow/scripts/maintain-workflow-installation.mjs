import { applyInstallationMaintenance, previewInstallationMaintenance } from "./workflow-installation-maintenance.mjs";

const [command, cacheDirectory, ...argv] = process.argv.slice(2);
const options = { cacheDirectory, skillDirectories: [], journalRoots: [], activeReferenceRoots: [], optionalRunsRoot: null };
let previewId = null;
for (let index = 0; index < argv.length; index += 1) {
  const value = argv[index];
  if (value === "--entry") options.skillDirectories.push(argv[++index]);
  else if (value === "--journal-root") options.journalRoots.push(argv[++index]);
  else if (value === "--active-reference-root") options.activeReferenceRoots.push(argv[++index]);
  else if (value === "--optional-runs-root") options.optionalRunsRoot = argv[++index];
  else if (value === "--preview-id") previewId = argv[++index];
  else throw new Error(`Unknown maintenance option: ${value}`);
}
if (!cacheDirectory || !["preview", "apply"].includes(command)) {
  throw new Error("Usage: maintain-workflow-installation.mjs preview <cache> [--entry <path> ...] [--journal-root <path> ...] [--optional-runs-root <path>] | apply <cache> --preview-id <id>");
}
if (command === "preview") {
  if (options.skillDirectories.length === 0) delete options.skillDirectories;
  process.stdout.write(`${JSON.stringify(previewInstallationMaintenance(options), null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(applyInstallationMaintenance({ cacheDirectory, previewId }), null, 2)}\n`);
}
