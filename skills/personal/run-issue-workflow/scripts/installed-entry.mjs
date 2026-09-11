import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bodyDigest } from "./github-workflow-records.mjs";
import { createCodexHostBridge } from "./codex-host-bridge.mjs";
import { selectWorkflowVersion } from "./workflow-installation.mjs";
import { runBatch } from "./run-batch.mjs";
import { setTimeout as sleep } from "node:timers/promises";
import { createRunStore } from "./run-store.mjs";
import { createGitHubWorkflowSources } from "./github-workflow-sources.mjs";
import { deriveRunOperationIdentity } from "./workflow-operation-identity.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cacheDirectory = resolve(packageRoot, "../..");
export function configureHostInput(input = process.stdin) {
  if (!input.isTTY) return () => {};
  if (typeof input.setRawMode !== "function") throw new Error("TTY input cannot enable native raw mode");
  const previous = input.isRaw === true;
  input.setRawMode(true);
  return () => input.setRawMode(previous);
}

const emit = (value) => process.stdout.write(`workflow-host ${JSON.stringify(value)}\n`);
const attachWorkflowRuntime = (error, workflowRuntime) => {
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.workflowRuntime ??= workflowRuntime;
  return failure;
};

async function selectInstalledLane({ repository, specId, runId, host, prepareOnly = false, modelRouting }) {
  repository = realpathSync(repository);
  const common = realpathSync(resolve(repository, execFileSync("git", ["-C", repository, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim()));
  const store = createRunStore({ gitCommonDir: common });
  let previousGrant;
  if (runId) {
    previousGrant = store.readEvents(runId).findLast(({ type }) => type === "grant.recorded");
    if (!previousGrant) return { state: "UNAVAILABLE", reason: "Selected Run has no recorded grant; preserve its files" };
    specId ??= previousGrant.runIdentity.specId;
  }
  let approvedScopeHash;
  let operationIdentity;
  if (specId) {
    const configuration = JSON.parse(readFileSync(join(repository, "docs/agents/workflow-host.json"), "utf8"));
    const owners = createGitHubWorkflowSources({ repository, repositoryName: configuration.repository });
    const issue = await owners.readIssue(specId);
    specId = issue.node_id;
    approvedScopeHash = bodyDigest(issue.body);
    operationIdentity = deriveRunOperationIdentity({ repositoryId: `github:${configuration.repository}`, specId, approvedPublicationIdentity: approvedScopeHash });
  }
  if (!runId) {
    const candidates = store.listRunIds().flatMap((id) => {
      // Terminal projections filter discovery only; explicit selection reconciles the original authority.
      if (!specId && ["SUCCEEDED", "STOPPED"].includes(store.readStatus(id)?.run.state)) return [];
      const grant = store.readEvents(id).findLast(({ type }) => type === "grant.recorded");
      return grant ? [grant] : [];
    });
    if (!specId && candidates.length !== 1) return { state: "SELECTION_REQUIRED", runs: candidates.map(({ runIdentity }) => runIdentity) };
    const matching = specId ? candidates.filter(({ runIdentity }) => runIdentity.runId === operationIdentity.key
      || runIdentity.specId === specId && runIdentity.approvedScopeHash === approvedScopeHash) : candidates;
    if (matching.length > 1) return { state: "SELECTION_REQUIRED", runs: matching.map(({ runIdentity }) => runIdentity) };
    previousGrant = matching[0];
  }
  if (specId && previousGrant && (previousGrant.runIdentity.specId !== specId
    || previousGrant.runIdentity.approvedScopeHash !== approvedScopeHash
    || previousGrant.runIdentity.runId.startsWith("workflow-op-v1-") && previousGrant.runIdentity.runId !== operationIdentity.key)) {
    return { state: "UNAVAILABLE", reason: "Selected Run and current Spec operation identity or scope differ; preserve both" };
  }
  if (previousGrant && !previousGrant.workflowVersion) return { state: "UNAVAILABLE", reason: "Selected Run has no proven package version; preserve its evidence for compatibility reconciliation" };
  const selected = selectWorkflowVersion({ cacheDirectory, recordedVersion: previousGrant?.workflowVersion });
  if (selected.state !== "AVAILABLE") return selected;
  const current = selectWorkflowVersion({ cacheDirectory });
  const compatible = previousGrant && current.state === "AVAILABLE"
    && current.version.protocolVersion === selected.version.protocolVersion
    && current.version.sourceRepository === selected.version.sourceRepository;
  const runtime = compatible ? current : selected;
  const workflowRuntime = { packageVersion: runtime.version, packageRoot: runtime.root,
    manifestSha256: runtime.manifestSha256 };
  let composition;
  try { composition = await import(pathToFileURL(join(runtime.root, "skills/personal/run-issue-workflow/scripts/codex-workflow.mjs")).href); }
  catch (error) { throw attachWorkflowRuntime(error, workflowRuntime); }
  // Protocol/source compatibility alone does not prove the runtime has this entry's replay gates.
  // A disposable terminal snapshot cannot decide whether missing support is safe.
  if (previousGrant && composition.supportsCompletedRunReentry !== true) {
    if (current.state !== "AVAILABLE") return { ...current, workflowRuntime };
    return { state: "UNAVAILABLE", reason: "Selected runtime does not support completed Run re-entry",
      recovery: "Restore a reviewed compatible runtime with completed Run re-entry support; preserve the original Run, Grant and retained package before retrying this entry.", workflowRuntime };
  }
  if (previousGrant) {
    const journal = store.readEvents(previousGrant.runIdentity.runId);
    const issueIds = [...new Set(journal.filter(event => event.issueId).map(event => event.issueId))];
    const taskIntents = issueIds.map(issueId => store.readHostTask({ runId: previousGrant.runIdentity.runId, issueId })).filter(Boolean);
    let compatibility;
    try { compatibility = composition.assessRecoveryCompatibility?.({ journal, taskIntents }); }
    catch (error) { throw attachWorkflowRuntime(error, workflowRuntime); }
    if (compatibility?.compatible !== true) return { state: "UNAVAILABLE", reason: compatibility?.reason ?? "Runtime cannot prove recovery evidence and task ownership compatibility",
      nextOwner: "workflow-maintenance", recovery: "Preserve the same Run, Grant, retained package and accepted task intents; use the scoped maintenance owner to supply a reviewed compatible runtime.", workflowRuntime };
  }
  const options = { repository, specId: previousGrant?.runIdentity.specId ?? specId,
    runIdentity: previousGrant?.runIdentity, workflowVersion: runtime.version,
    compatibleRecordedVersion: compatible ? previousGrant.workflowVersion : undefined, packageRoot: runtime.root, host, modelRouting };
  if (prepareOnly) {
    if (typeof composition.prepareCodexWorkflow !== "function") return { state: "UNAVAILABLE", reason: "This retained package has no compatible batch entry; preserve its Run", workflowRuntime };
    let lane;
    try { lane = await composition.prepareCodexWorkflow(options); }
    catch (error) { throw attachWorkflowRuntime(error, workflowRuntime); }
    let versionId = runtime.version.id;
    let effectiveRuntime = workflowRuntime;
    let closedLane;
    let unavailableStatus;
    let delegatedLane = false;
    let lastStatus;
    const closeLane = async () => {
      const closing = lane;
      if (closedLane === closing) return;
      closedLane = closing;
      try { await closing.close?.(); }
      catch (error) { throw attachWorkflowRuntime(error, effectiveRuntime); }
    };
    return { specId: lane.specId, get workflowRuntime() { return effectiveRuntime; },
      async run(request) {
        if (unavailableStatus) return unavailableStatus;
        if (delegatedLane) {
          let delegatedStatus;
          try { delegatedStatus = await lane.run(request); }
          catch (error) {
            const delegatedFailure = attachWorkflowRuntime(error, lane.workflowRuntime ?? effectiveRuntime);
            effectiveRuntime = delegatedFailure.workflowRuntime;
            unavailableStatus = { ...lastStatus,
              run: { ...lastStatus?.run, state: "UNAVAILABLE", specId: lastStatus?.run?.specId ?? lane.specId },
              workflowRuntime: effectiveRuntime, capacityUnknown: true, error: delegatedFailure.message };
            throw delegatedFailure;
          }
          effectiveRuntime = delegatedStatus.workflowRuntime ?? lane.workflowRuntime ?? effectiveRuntime;
          const effectiveStatus = { ...delegatedStatus, workflowRuntime: effectiveRuntime };
          lastStatus = effectiveStatus;
          if (delegatedStatus.run?.state === "UNAVAILABLE") unavailableStatus = {
            ...effectiveStatus, capacityUnknown: true,
          };
          return unavailableStatus ?? effectiveStatus;
        }
        let status;
        try { status = await lane.run(request); }
        catch (error) { throw attachWorkflowRuntime(error, effectiveRuntime); }
        lastStatus = { ...status, workflowRuntime: effectiveRuntime };
        if (status.diagnoses?.some(item => item.reasonCode === "workflow_runtime_reentry_required")
          && !host.disconnected && !["PAUSED", "PAUSING", "STOPPED", "STOPPING", "UNAVAILABLE"].includes(status.run.state)) {
          const installed = selectWorkflowVersion({ cacheDirectory });
          if (installed.state === "AVAILABLE" && installed.version.id !== versionId) {
            try { await closeLane(); }
            catch (error) {
              effectiveRuntime = error.workflowRuntime ?? effectiveRuntime;
              unavailableStatus = { ...status, run: { ...status.run, state: "UNAVAILABLE" },
                workflowRuntime: effectiveRuntime, capacityUnknown: true, error: error.message };
              throw error;
            }
            let renewed;
            try { renewed = await selectInstalledLane({ repository, specId, runId: status.run.runId, host, prepareOnly: true }); }
            catch (error) {
              effectiveRuntime = error.workflowRuntime ?? effectiveRuntime;
              versionId = installed.version.id;
              unavailableStatus = { ...status, run: { ...status.run, state: "UNAVAILABLE" },
                workflowRuntime: effectiveRuntime, capacityUnknown: true, error: error.message };
              throw error;
            }
            if (typeof renewed.run !== "function") {
              effectiveRuntime = renewed.workflowRuntime ?? effectiveRuntime;
              versionId = installed.version.id;
              unavailableStatus = { ...status, run: { ...status.run, state: "UNAVAILABLE" },
                workflowRuntime: effectiveRuntime, capacityUnknown: true, reason: renewed.reason };
              return unavailableStatus;
            }
            lane = renewed; delegatedLane = true; versionId = installed.version.id;
            effectiveRuntime = renewed.workflowRuntime;
            let renewedStatus;
            try { renewedStatus = await lane.run({ ...request, mode: "snapshot" }); }
            catch (error) {
              const renewedFailure = attachWorkflowRuntime(error, lane.workflowRuntime ?? effectiveRuntime);
              effectiveRuntime = renewedFailure.workflowRuntime;
              unavailableStatus = { ...status, run: { ...status.run, state: "UNAVAILABLE" },
                workflowRuntime: effectiveRuntime, capacityUnknown: true, error: renewedFailure.message };
              throw renewedFailure;
            }
            effectiveRuntime = renewedStatus.workflowRuntime ?? lane.workflowRuntime ?? effectiveRuntime;
            const effectiveStatus = { ...renewedStatus, workflowRuntime: effectiveRuntime };
            lastStatus = effectiveStatus;
            if (renewedStatus.run?.state === "UNAVAILABLE") unavailableStatus = {
              ...effectiveStatus, capacityUnknown: true,
            };
            return unavailableStatus ?? effectiveStatus; // Reconcile before the next shared-capacity allocation.
          }
        }
        return { ...status, workflowRuntime: effectiveRuntime };
      },
      close: closeLane,
    };
  }
  let result;
  try { result = await composition.runCodexWorkflow(options); }
  catch (error) { throw attachWorkflowRuntime(error, workflowRuntime); }
  if (result.status?.diagnoses?.some(item => item.reasonCode === "workflow_runtime_reentry_required")) {
    const installed = selectWorkflowVersion({ cacheDirectory });
    if (installed.state === "AVAILABLE" && installed.version.id !== runtime.version.id && !host.disconnected
      && !["PAUSED", "PAUSING", "STOPPED", "STOPPING", "UNAVAILABLE"].includes(result.status.run.state)) {
      try {
        const renewed = await selectInstalledLane({ repository, specId, runId: result.status.run.runId, host });
        return renewed?.workflowRuntime ? renewed : { ...renewed, workflowRuntime };
      } catch (error) { throw attachWorkflowRuntime(error, workflowRuntime); }
    }
  }
  return { ...result, workflowRuntime };
}

export async function runInstalledEntry({ repository, specId, runId, host, specIds, maxWorkers = 3, modelRouting }) {
  if (!specIds && typeof specId === "string" && specId.includes(",")) specIds = specId.split(",");
  if (!specIds) return selectInstalledLane({ repository, specId, runId, host, modelRouting });
  if (runId || specIds.length === 0 || new Set(specIds).size !== specIds.length) throw new Error("Batch entry requires explicit distinct Specs and no ambiguous Run ID");
  const lanes = [];
  for (const id of specIds) {
    try {
      const lane = await selectInstalledLane({ repository, specId: id, host, prepareOnly: true, modelRouting: modelRouting?.[id] });
      lanes.push(typeof lane.run === "function" ? lane : { specId: id, workflowRuntime: lane.workflowRuntime,
        run: async () => ({ run: { state: "UNAVAILABLE", specId: id }, workflowRuntime: lane.workflowRuntime,
          capacityUnknown: true, reason: lane.reason, nodes: [], legalActions: [] }) });
    } catch (error) { lanes.push({ specId: id, workflowRuntime: error.workflowRuntime,
      run: async () => ({ run: { state: "UNAVAILABLE", specId: id }, workflowRuntime: error.workflowRuntime,
        capacityUnknown: true, reason: error.message, nodes: [], legalActions: [] }) }); }
  }
  let result;
  let failure;
  let primaryResultFailure = false;
  const cleanupFailures = [];
  try { result = await runBatch({ lanes, maxWorkers, sleep, connected: () => !host.disconnected }); }
  catch (error) { failure = error; }
  const primaryStatus = result?.runs?.find(status => status?.error || status?.run?.state === "UNAVAILABLE");
  for (const lane of lanes) {
    try { await lane.close?.(); }
    catch (error) {
      const cleanupFailure = attachWorkflowRuntime(error, lane.workflowRuntime);
      cleanupFailures.push({ specId: lane.specId, error: cleanupFailure.message,
        workflowRuntime: cleanupFailure.workflowRuntime });
      if (!primaryStatus) failure ??= cleanupFailure;
    }
  }
  if (!failure && primaryStatus && cleanupFailures.length > 0) {
    failure = attachWorkflowRuntime(new Error(primaryStatus.error ?? primaryStatus.reason ?? "Workflow lane unavailable"),
      primaryStatus.workflowRuntime);
    primaryResultFailure = true;
  }
  if (failure) {
    failure.workflowResult ??= result;
    if (cleanupFailures.length > 0) failure.cleanupFailures ??= cleanupFailures;
    const selectedRuntime = lanes.find(lane => lane.workflowRuntime)?.workflowRuntime;
    throw !primaryResultFailure && selectedRuntime ? attachWorkflowRuntime(failure, selectedRuntime) : failure;
  }
  return result;

}

export async function runInstalledRepairQualification({ packageVersionId }) {
  const entryPath = fileURLToPath(import.meta.url);
  const command = JSON.stringify([process.execPath, entryPath, "--qualify-repair-package", packageVersionId]);
  const qualification = await import("./workflow-repair-qualification.mjs");
  return qualification.runWorkflowRepairQualification({ packageVersionId, command });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repository, specId, runId, modelRoutingPath] = process.argv.slice(2);
  if (repository === "--qualify-repair-package") {
    try { process.stdout.write(JSON.stringify(await runInstalledRepairQualification({ packageVersionId: specId }))); }
    catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
  } else {
    let host;
    let restoreInput = () => {};
    try {
      if (!repository) throw new Error("Usage: installed-entry.mjs <repository> [Spec number or comma-separated Spec batch] [Run ID] [model-routing JSON path]");
      restoreInput = configureHostInput();
      host = createCodexHostBridge();
      const modelRouting = modelRoutingPath ? JSON.parse(readFileSync(modelRoutingPath, "utf8")) : undefined;
      const result = await runInstalledEntry({ repository, specId: specId || undefined, runId: runId || undefined, host, modelRouting });
      emit({ type: "result", result, metrics: host.metrics() });
    } catch (error) {
      emit({ type: "error", message: error.message, ...(error.workflowRuntime ? { workflowRuntime: error.workflowRuntime } : {}),
        ...(error.workflowResult ? { workflowResult: error.workflowResult } : {}),
        ...(error.cleanupFailures ? { cleanupFailures: error.cleanupFailures } : {}),
        metrics: host?.metrics() ?? { toolCalls: 0 }, recovery: "Preserve the Run and tasks; resume this installed entry from observed state." });
      process.exitCode = 1;
    } finally { host?.close(); restoreInput(); process.stdin.pause(); }
  }
}
