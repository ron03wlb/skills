import { installWorkflow } from "./workflow-installation.mjs";
const [sourceRepository, sourceCommit, cacheDirectory, skillDirectory, replaceLinkTarget] = process.argv.slice(2);
if (!skillDirectory) throw new Error("Usage: install-workflow.mjs <trusted-source-repository> <exact-commit> <cache-directory> <public-skill-directory> [exact-existing-link-target]");
console.log(JSON.stringify(installWorkflow({ sourceRepository, sourceCommit, cacheDirectory, skillDirectory, replaceLinkTarget }), null, 2));
