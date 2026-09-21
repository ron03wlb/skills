import { installWorkflow } from "./workflow-installation.mjs";

const argv = process.argv.slice(2);
const positional = [];
const skillDirectories = [];
const replaceLinkTargets = {};
for (let index = 0; index < argv.length; index += 1) {
  const value = argv[index];
  if (value === "--entry") skillDirectories.push(argv[++index]);
  else if (value === "--replace") {
    const binding = argv[++index] ?? "";
    const split = binding.indexOf("=");
    if (split < 1) throw new Error("--replace requires <path>=<expected-target>");
    replaceLinkTargets[binding.slice(0, split)] = binding.slice(split + 1);
  } else positional.push(value);
}
const [sourceRepository, sourceCommit, cacheDirectory, legacyEntry, legacyReplace] = positional;
if (!sourceRepository || !sourceCommit || !cacheDirectory || (skillDirectories.length === 0 && !legacyEntry)) {
  throw new Error("Usage: install-workflow.mjs <trusted-source-repository> <exact-commit> <cache-directory> [legacy-entry [legacy-target]] [--entry <path> ...] [--replace <path>=<expected-target> ...]");
}
const entries = skillDirectories.length === 0 ? [legacyEntry] : skillDirectories;
if (legacyReplace && entries.length === 1) replaceLinkTargets[entries[0]] = legacyReplace;
console.log(JSON.stringify(installWorkflow({
  sourceRepository,
  sourceCommit,
  cacheDirectory,
  skillDirectories: entries,
  replaceLinkTargets,
}), null, 2));
