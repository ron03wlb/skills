import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { createCodexWorkflowTasks, unwrapCodexResult } from "./codex-workflow-tasks.mjs";
import { createGitHubWorkflowSources } from "./github-workflow-sources.mjs";
import { createRunStore } from "./run-store.mjs";
import { planCloseContinuation, closeContinuationSuffix } from "./close-continuation.mjs";
import { closeRequestIdentityFor } from "./run-coordinator.mjs";
import { createWorkflowRuntime } from "./run-workflow.mjs";
import { validateJournal } from "./run-journal.mjs";
import { recoveryDigest } from "./recovery-evidence.mjs";

export const supportsCompletedRunReentry = true;

export function assessRecoveryCompatibility({ journal, taskIntents }) {
  try {
    validateJournal(journal);
    const grant = journal.find(event => event.type === "grant.recorded");
    if (!grant) throw new Error("Recorded Grant is missing");
    for (const intent of taskIntents) {
      if (intent.runId !== grant.runIdentity.runId || typeof intent.issueId !== "string" || typeof intent.prompt !== "string") throw new Error("Original native task intent is malformed or foreign");
    }
    // The current reducers retain legacy dispatch/conflict records and require explicit ownership
    // transfers for new recovery. Parsing the exact journal exercises both semantic contracts.
    return { compatible: true, contract: "isolated-technical-recovery:v1", journalIdentity: recoveryDigest(journal),
      taskIntentIdentity: recoveryDigest(taskIntents), preserves: ["original-grant", "operation", "legacy-receipts", "task-intents", "cumulative-budget", "exclusive-writer"] };
  } catch (error) { return { compatible: false, reason: error.message, nextOwner: "workflow-maintenance" }; }
}

export async function prepareCodexWorkflow({ repository, specId, runIdentity, workflowVersion, compatibleRecordedVersion, packageRoot, host, modelRouting }) {
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
  const storeSource = { readLeaseHealth: (...args) => store.readLeaseHealth(...args), listRunIds: () => store.listRunIds(), readStatus: (...args) => store.readStatus(...args), readEvents: (...args) => store.readEvents(...args), readWriterLock: (...args) => store.readWriterLock(...args), readHostTask: (...args) => store.readHostTask(...args) };
  const owners = createGitHubWorkflowSources({ repository, repositoryName: configuration.repository, store: storeSource, tasks: taskSource,
    workflowVersion, installationCacheDirectory: resolve(packageRoot, "../..") });
  store = createRunStore({ gitCommonDir: owners.gitCommonDir });
  const selectedIssue = await owners.readIssue(specId);
  tasks = createCodexWorkflowTasks({ host, store, project, packageRoot, issueNumber: owners.issueNumber });
  const runtime = createWorkflowRuntime({ store, tasks, workflowVersion, compatibleRecordedVersion, authoritySources: owners.sources,
    controls: host.controls,
    browser: { open: (url) => host.call("mcp__codex_app__open_in_codex", { target: { type: "browser", url } }) },
    cleanup: { listRuns: owners.readCleanupRuns },
    now: () => new Date().toISOString(), sleep: (ms) => setTimeout(ms),
    leaf: { async closeParent({ issueId, runIdentity: identity, requestIdentity, requestEvidence, step }) {
      const dispatch = store.readEvents(identity.runId).findLast(({ type }) => type === "dispatch.recorded");
      if (!dispatch) throw new Error("Parent close requires the existing Run task");
      const task = await tasks.read(dispatch.taskRef);
      const acceptedEquivalent = task.closeRequest?.runId === identity.runId && task.closeRequest.issueId === issueId
        && task.closeRequest.evidence && closeRequestIdentityFor(task.closeRequest.evidence) === requestIdentity;
      if (task.closeRequest?.state === "ACCEPTED" && task.closeRequest.issueId === issueId && task.closeRequest.requestIdentity !== requestIdentity && !acceptedEquivalent) throw new Error("Parent close authority changed");
      const effectiveIdentity = acceptedEquivalent ? task.closeRequest.requestIdentity : requestIdentity;
      const continuation = planCloseContinuation({ task, requestIdentity: effectiveIdentity, requestEvidence });
      if (continuation.exhausted) throw new Error("Parent close continuation budget exhausted without progress; preserve its existing task");
      if (continuation.needed) await setTimeout([5000, 15000, 30000][continuation.attempt - 1]);
      if (task.closeRequest?.requestIdentity !== requestIdentity && !acceptedEquivalent || continuation.needed) await tasks.message(dispatch.taskRef, `Use $close-issue to close parent Issue ${issueId} under the same read-back DAG Run Grant. Close request identity: ${effectiveIdentity}. Current close request evidence: ${JSON.stringify(requestEvidence)}${closeContinuationSuffix(continuation)}`);
      if (step) return { settled: false };
      const waited = await tasks.wait([dispatch.taskRef]);
      return { settled: waited.taskSettled, coordinatorActive: waited.coordinatorActive,
        requestIdentity: acceptedEquivalent && waited.closeRequestIdentity === task.closeRequest.requestIdentity ? requestIdentity : waited.closeRequestIdentity };
    } },
  });
  let latest;
  const pendingControls = [];
  let connection;
  return {
    specId: selectedIssue.node_id,
    async run(options = {}) {
      latest = await runtime.run({ specId: selectedIssue.node_id, ...(runIdentity ? { runIdentity } : {}), modelRouting, ...options, controlQueue: pendingControls });
      if (options.mode && !connection && latest.status.run.runId) connection = await host.controls.connect({
        readStatus: async () => store.readStatus(latest.status.run.runId),
        submitControl: command => new Promise((resolve, reject) => pendingControls.push({ command, resolve, reject })),
        onDisconnect: error => { for (const pending of pendingControls.splice(0)) pending.reject(error); },
      });
      return latest.status;
    },
    async close() { await connection?.close(); for (const pending of pendingControls.splice(0)) pending.reject(new Error("Batch control connection ended")); },
    result: () => ({ status: latest.status, panel: latest.panel, metrics: { ...host.metrics(), ...owners.metrics(), humanInterventions: "unavailable" } }),
  };
}

export async function runCodexWorkflow(options) {
  const lane = await prepareCodexWorkflow(options);
  try { await lane.run(); return lane.result(); } finally { await lane.close(); }
}
