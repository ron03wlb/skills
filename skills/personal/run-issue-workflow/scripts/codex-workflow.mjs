import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { createCodexWorkflowTasks, unwrapCodexResult } from "./codex-workflow-tasks.mjs";
import { createGitHubWorkflowSources } from "./github-workflow-sources.mjs";
import { createRunStore } from "./run-store.mjs";
import { createWorkflowRuntime } from "./run-workflow.mjs";

export async function runCodexWorkflow({ repository, specId, runIdentity, workflowVersion, packageRoot, host }) {
  const configuration = JSON.parse(readFileSync(join(repository, "docs/agents/workflow-host.json"), "utf8"));
  if (configuration.schema !== "codex-workflow-host:v1") throw new Error("Unknown static workflow host configuration");
  const projectsResult = unwrapCodexResult(await host.call("mcp__codex_app__list_projects", {}));
  const commonDirectory = (path) => realpathSync(resolve(path, execFileSync("git", ["-C", path, "rev-parse", "--git-common-dir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()));
  const consumerCommon = commonDirectory(repository);
  const projects = (projectsResult.projects ?? []).filter((project) => {
    if (!project.path || !project.isGitRepository || project.hostId !== "local") return false;
    try { return commonDirectory(project.path) === consumerCommon; } catch { return false; }
  });
  if (projects.length !== 1 || projects[0].isGitRepository !== true) throw new Error("One saved Git project must match the consumer repository");
  const project = { ...projects[0], projectId: projects[0].id ?? projects[0].projectId, hostId: projects[0].hostId ?? "local" };
  let tasks;
  const taskSource = { read: (...args) => tasks.read(...args) };
  let store;
  const storeSource = { listRunIds: () => store.listRunIds(), readStatus: (...args) => store.readStatus(...args), readEvents: (...args) => store.readEvents(...args) };
  const owners = createGitHubWorkflowSources({ repository, repositoryName: configuration.repository, store: storeSource, tasks: taskSource });
  store = createRunStore({ gitCommonDir: owners.gitCommonDir });
  const selectedIssue = await owners.readIssue(specId);
  tasks = createCodexWorkflowTasks({ host, store, project, packageRoot, issueNumber: owners.issueNumber });
  const runtime = createWorkflowRuntime({ store, tasks, workflowVersion, authoritySources: owners.sources,
    controls: host.controls,
    browser: { open: (url) => host.call("mcp__codex_app__open_in_codex", { target: { type: "browser", url } }) },
    cleanup: { async listRuns() { return []; } },
    now: () => new Date().toISOString(), sleep: (ms) => setTimeout(ms),
    leaf: { async closeParent({ issueId, runIdentity: identity, requestIdentity, requestEvidence }) {
      const dispatch = store.readEvents(identity.runId).findLast(({ type }) => type === "dispatch.recorded");
      if (!dispatch) throw new Error("Parent close requires the existing Run task");
      await tasks.message(dispatch.taskRef, `Use $close-issue to close parent Issue ${issueId} under the same read-back DAG Run Grant. Close request identity: ${requestIdentity}. Current close request evidence: ${JSON.stringify(requestEvidence)}`);
      const waited = await tasks.wait([dispatch.taskRef]);
      return { settled: waited.taskSettled, requestIdentity: waited.closeRequestIdentity };
    } },
  });
  const result = await runtime.run({ specId: selectedIssue.node_id, ...(runIdentity ? { runIdentity } : {}) });
  return { status: result.status, panel: result.panel, metrics: { ...host.metrics(), ...owners.metrics(), humanInterventions: "unavailable" } };
}
