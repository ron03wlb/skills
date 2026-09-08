import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createGitHubWorkflowSources } from "./github-workflow-sources.mjs";

const [repository, specId] = process.argv.slice(2);
if (!repository || !specId) throw new Error("Usage: inspect-model-inputs.mjs <repository> <Spec ID>");
const configuration = JSON.parse(readFileSync(join(repository, "docs/agents/workflow-host.json"), "utf8"));
const sources = createGitHubWorkflowSources({ repository, repositoryName: configuration.repository });
process.stdout.write(JSON.stringify(await sources.readModelInputs(specId), null, 2) + "\n");
