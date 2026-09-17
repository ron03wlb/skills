import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { createGitHubWorkflowSources } from "./github-workflow-sources.mjs";

const [repository, specId] = process.argv.slice(2);
if (!repository || !specId)
  throw new Error("Usage: inspect-model-inputs.mjs <repository> <Spec ID>");
const git = (...args) =>
  execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
const remote = git("remote", "get-url", "origin").replace(/\.git$/u, "");
const match = remote.match(/github\.com[/:]([\w.-]+\/[\w.-]+)$/u);
if (!match)
  throw new Error("Cannot derive the configured repository from the checkout origin");
const sources = createGitHubWorkflowSources({
  repository: realpathSync(repository),
  repositoryName: match[1],
});
process.stdout.write(
  `${JSON.stringify(await sources.readModelInputs(specId), null, 2)}\n`,
);
