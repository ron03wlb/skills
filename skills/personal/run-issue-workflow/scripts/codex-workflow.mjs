import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  createCodexWorkflowTasks,
  unwrapCodexResult,
} from "./codex-workflow-tasks.mjs";
import { createGitHubWorkflowSources } from "./github-workflow-sources.mjs";
import { createRunStore } from "./run-store.mjs";
import {
  closeContinuationSuffix,
  deriveExecuteIssueOperationIdentity,
  deriveRunOperationIdentity,
  planCloseContinuation,
} from "./delivery-authority.mjs";
import { closeRequestIdentityFor } from "./run-coordinator.mjs";
import { createWorkflowRuntime } from "./run-workflow.mjs";
import { bodyDigest } from "./github-workflow-records.mjs";
import { recoverPendingHostCleanup } from "../../../engineering/close-issue/scripts/pending-host-cleanup.mjs";
import { verifyIntegratedCandidate } from "../../../engineering/close-issue/scripts/merge-candidate.mjs";
import { runWorkflowCommand } from "./workflow-command.mjs";

export { assessRecoveryCompatibility } from "./delivery-authority.mjs";

export const supportsCompletedRunReentry = true;

export function readCodexHostIntegrationEnvironment(declared) {
  if (
    !declared ||
    typeof declared !== "object" ||
    Array.isArray(declared) ||
    !Object.keys(declared).length
  ) {
    throw new TypeError("Declared integration environment is required");
  }
  return {
    schema: "codex-host-integration-environment:v1",
    declared: structuredClone(declared),
    host: {
      runtime: process.version,
      platform: process.platform,
      arch: process.arch,
      executable: realpathSync.native(process.execPath),
    },
  };
}

export function createCodexHostCleanupOwner({
  store,
  tasks,
  repositoryId,
  readCurrentIntegrationEnvironment = readCodexHostIntegrationEnvironment,
}) {
  if (
    !store ||
    typeof tasks?.read !== "function" ||
    typeof repositoryId !== "string" ||
    !repositoryId
  ) {
    throw new TypeError(
      "Codex host cleanup owner requires its store, task reader and repository identity",
    );
  }
  if (typeof readCurrentIntegrationEnvironment !== "function")
    throw new TypeError("Current integration environment reader is required");
  return async ({ issueId, runIdentity, pending }) => {
    if (
      !runIdentity ||
      !pending?.completion ||
      !Array.isArray(pending.integrationChecks)
    ) {
      throw new Error(
        "Automatic host cleanup requires its exact integration obligation",
      );
    }
    const completion = pending.completion;
    if (issueId !== completion.issueId)
      throw new Error(
        "Automatic host cleanup Issue identity differs from its completion",
      );
    const integrationCheckDescriptors = pending.integrationChecks.map(
      (check) => {
        if (
          !check ||
          JSON.stringify(Object.keys(check).sort()) !==
            JSON.stringify(
              [
                "command",
                "configFiles",
                "environment",
                "externalInputs",
              ].sort(),
            ) ||
          !Array.isArray(check.command) ||
          !check.command.length ||
          !check.command.every((value) => typeof value === "string") ||
          !Array.isArray(check.configFiles) ||
          !check.configFiles.every((value) => typeof value === "string") ||
          !check.environment ||
          typeof check.environment !== "object" ||
          Array.isArray(check.environment) ||
          !Object.keys(check.environment).length ||
          JSON.stringify(check.externalInputs) !==
            JSON.stringify({ kind: "none" })
        ) {
          throw new Error(
            "Automatic host cleanup received a malformed integration check",
          );
        }
        return structuredClone(check);
      },
    );
    const readIntegrationChecks = () =>
      integrationCheckDescriptors.map((check) => {
        const environment = readCurrentIntegrationEnvironment(
          structuredClone(check.environment),
        );
        if (
          !environment ||
          typeof environment !== "object" ||
          Array.isArray(environment) ||
          !Object.keys(environment).length
        ) {
          throw new Error(
            "Automatic host cleanup could not read its current integration environment",
          );
        }
        return {
          command: check.command,
          configFiles: check.configFiles,
          environment,
          readExternalInputs: async () => ({}),
        };
      });
    return recoverPendingHostCleanup({
      leaseInput: {
        store,
        target: runIdentity.target,
        repositoryId,
        specId: runIdentity.specId,
        approvedPublicationIdentity: runIdentity.approvedScopeHash,
        issueId: completion.issueId,
      },
      completion,
      taskRef: pending.taskRef,
      failure: pending.failure,
      readTask: async (taskRef) =>
        (await tasks.read(taskRef, { runId: runIdentity.runId })).snapshot,
      verifyIntegration: (leases) =>
        verifyIntegratedCandidate({
          leases,
          targetWorktree: completion.targetWorktree,
          candidate: completion.candidate,
          issueId: completion.issueId,
          operationId: deriveExecuteIssueOperationIdentity(
            leases.operationIdentity,
          ).key,
          checks: readIntegrationChecks(),
        }),
    });
  };
}

export async function prepareCodexWorkflow({
  repository,
  specId,
  runIdentity,
  workflowVersion,
  compatibleRecordedVersion,
  packageRoot,
  host,
  modelRouting,
  commandRunner = runWorkflowCommand,
}) {
  let configuration;
  try {
    configuration = JSON.parse(
      readFileSync(join(repository, "docs/agents/workflow-host.json"), "utf8"),
    );
  } catch (error) {
    throw error;
  }
  if (configuration.schema !== "codex-workflow-host:v1")
    throw new Error("Unknown static workflow host configuration");
  const projectsResult = unwrapCodexResult(
    await host.call("mcp__codex_app__list_projects", {}),
  );
  const commonDirectory = (path) =>
    realpathSync(
      resolve(
        path,
        commandRunner("git", ["-C", path, "rev-parse", "--git-common-dir"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      ),
    );
  const consumerCommon = commonDirectory(repository);
  const projects = (projectsResult.projects ?? []).filter((project) => {
    if (!project.path || !project.isGitRepository || project.hostId !== "local")
      return false;
    try {
      return commonDirectory(project.path) === consumerCommon;
    } catch {
      return false;
    }
  });
  if (projects.length !== 1 || projects[0].isGitRepository !== true)
    throw new Error("One saved Git project must match the consumer repository");
  const project = {
    ...projects[0],
    projectId: projects[0].id ?? projects[0].projectId,
    hostId: projects[0].hostId ?? "local",
  };
  let tasks;
  const taskSource = { read: (...args) => tasks.read(...args) };
  let store;
  const storeSource = {
    readLeaseHealth: (...args) => store.readLeaseHealth(...args),
    listRunIds: () => store.listRunIds(),
    readStatus: (...args) => store.readStatus(...args),
    readEvents: (...args) => store.readEvents(...args),
    readWriterLock: (...args) => store.readWriterLock(...args),
    readHostTask: (...args) => store.readHostTask(...args),
  };
  const owners = createGitHubWorkflowSources({
    repository,
    repositoryName: configuration.repository,
    store: storeSource,
    tasks: taskSource,
    workflowVersion,
    installationCacheDirectory: resolve(packageRoot, "../.."),
    commandRunner,
  });
  store = createRunStore({ gitCommonDir: owners.gitCommonDir });
  const selectedIssue = await owners.readIssue(specId);
  const effectiveRunIdentity = runIdentity ?? {
    runId: deriveRunOperationIdentity({
      repositoryId: `github:${configuration.repository}`,
      specId: selectedIssue.node_id,
      approvedPublicationIdentity: bodyDigest(selectedIssue.body),
    }).key,
  };
  const pendingControls = [];
  let executionDeadlineAt = null;
  const observationSignal = async () => {
    const runStatus = store.readStatus(effectiveRunIdentity.runId);
    const control =
      pendingControls[0]?.command ??
      (["PAUSING", "PAUSED", "STOPPING", "STOPPED"].includes(
        runStatus?.run?.state,
      )
        ? (runStatus.run.controlCommand ?? runStatus.run.state)
        : null);
    return {
      ...(control ? { control } : {}),
      ...(executionDeadlineAt !== null && Date.now() >= executionDeadlineAt
        ? { deadline: new Date(executionDeadlineAt).toISOString() }
        : {}),
    };
  };
  tasks = createCodexWorkflowTasks({
    host,
    store,
    project,
    packageRoot,
    runId: effectiveRunIdentity.runId,
    repositoryId: `github:${configuration.repository}`,
    workflowVersion,
    issueNumber: owners.issueNumber,
    readIssueState: owners.readIssueState,
    readObservationSignal: observationSignal,
  });
  const runtime = createWorkflowRuntime({
    store,
    tasks,
    workflowVersion,
    compatibleRecordedVersion,
    authoritySources: owners.sources,
    controls: host.controls,
    browser: {
      open: (url) =>
        host.call("mcp__codex_app__open_in_codex", {
          target: { type: "browser", url },
        }),
    },
    cleanup: { listRuns: owners.readCleanupRuns },
    now: () => new Date().toISOString(),
    sleep: (ms) => setTimeout(ms),
    leaf: {
      recoverHostCleanup: createCodexHostCleanupOwner({
        store,
        tasks,
        repositoryId: `github:${configuration.repository}`,
      }),
      async closeParent({
        issueId,
        runIdentity: identity,
        requestIdentity,
        requestEvidence,
        step,
      }) {
        const dispatch = store
          .readEvents(identity.runId)
          .findLast(({ type }) => type === "dispatch.recorded");
        if (!dispatch)
          throw new Error("Parent close requires the existing Run task");
        const task = await tasks.read(dispatch.taskRef, {
          runId: identity.runId,
        });
        const acceptedEquivalent =
          task.closeRequest?.runId === identity.runId &&
          task.closeRequest.issueId === issueId &&
          task.closeRequest.evidence &&
          closeRequestIdentityFor(task.closeRequest.evidence) ===
            requestIdentity;
        if (
          task.closeRequest?.state === "ACCEPTED" &&
          task.closeRequest.issueId === issueId &&
          task.closeRequest.requestIdentity !== requestIdentity &&
          !acceptedEquivalent
        )
          throw new Error("Parent close authority changed");
        const effectiveIdentity = acceptedEquivalent
          ? task.closeRequest.requestIdentity
          : requestIdentity;
        const continuation = planCloseContinuation({
          task,
          requestIdentity: effectiveIdentity,
          requestEvidence,
        });
        if (continuation.blocked)
          throw new Error(
            `${continuation.blocked.reasonCode}: ${continuation.blocked.evidence.map((item) => item.message).join("; ")}`,
          );
        if (continuation.exhausted)
          throw new Error(
            "Parent close continuation budget exhausted without progress; preserve its existing task",
          );
        if (continuation.needed)
          await setTimeout([5000, 15000, 30000][continuation.attempt - 1]);
        if (
          (task.closeRequest?.requestIdentity !== requestIdentity &&
            !acceptedEquivalent) ||
          continuation.needed
        ) {
          const delivery = await tasks.message(
            dispatch.taskRef,
            `Use $close-issue to close parent Issue ${issueId} under the same read-back DAG Run Grant. Close request identity: ${effectiveIdentity}. Current close request evidence: ${JSON.stringify(requestEvidence)}${closeContinuationSuffix(continuation)}`,
          );
          if (
            delivery?.reconcileRequired &&
            delivery.reasonCode === "issue_already_closed" &&
            delivery.issueId === issueId
          )
            return { settled: false, coordinatorActive: true };
        }
        if (step) return { settled: false };
        const waited = await tasks.wait([dispatch.taskRef]);
        return {
          settled: waited.taskSettled,
          coordinatorActive: waited.coordinatorActive,
          requestIdentity:
            acceptedEquivalent &&
            waited.closeRequestIdentity === task.closeRequest.requestIdentity
              ? requestIdentity
              : waited.closeRequestIdentity,
        };
      },
    },
  });
  let latest;
  let connection;
  return {
    specId: selectedIssue.node_id,
    async run(options = {}) {
      if (options.executionDeadlineAt !== undefined) {
        executionDeadlineAt = Date.parse(options.executionDeadlineAt);
        if (!Number.isFinite(executionDeadlineAt))
          throw new TypeError("executionDeadlineAt must be one ISO instant");
      } else executionDeadlineAt = null;
      latest = await runtime.run({
        specId: selectedIssue.node_id,
        ...(runIdentity ? { runIdentity } : {}),
        modelRouting,
        ...options,
        controlQueue: pendingControls,
      });
      if (options.mode && !connection && latest.status.run.runId)
        connection = await host.controls.connect({
          readStatus: async () => store.readStatus(latest.status.run.runId),
          submitControl: (command) =>
            new Promise((resolve, reject) =>
              pendingControls.push({ command, resolve, reject }),
            ),
          onDisconnect: (error) => {
            for (const pending of pendingControls.splice(0))
              pending.reject(error);
          },
        });
      return latest.status;
    },
    async close() {
      await connection?.close();
      for (const pending of pendingControls.splice(0))
        pending.reject(new Error("Batch control connection ended"));
    },
    result: () => ({
      status: latest.status,
      panel: latest.panel,
      metrics: {
        ...host.metrics(),
        ...owners.metrics(),
        humanInterventions: "unavailable",
      },
    }),
  };
}

export async function runCodexWorkflow(options) {
  const lane = await prepareCodexWorkflow(options);
  try {
    await lane.run();
    return lane.result();
  } finally {
    await lane.close();
  }
}
