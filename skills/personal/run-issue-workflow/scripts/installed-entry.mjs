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

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cacheDirectory = resolve(packageRoot, "../..");
const emit = (value) => process.stdout.write(`workflow-host ${JSON.stringify(value)}\n`);

async function selectInstalledLane({ repository, specId, runId, host, prepareOnly = false }) {
  repository = realpathSync(repository);
  const common = realpathSync(resolve(repository, execFileSync("git", ["-C", repository, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim()));
  const store = createRunStore({ gitCommonDir: common });
  let approvedScopeHash;
  if (specId && /^[1-9][0-9]*$/u.test(specId)) {
    const configuration = JSON.parse(readFileSync(join(repository, "docs/agents/workflow-host.json"), "utf8"));
    const issue = JSON.parse(execFileSync("gh", ["issue", "view", specId, "--repo", configuration.repository, "--json", "id,body"], { encoding: "utf8" }));
    specId = issue.id;
    approvedScopeHash = bodyDigest(issue.body);
  }
  let previousGrant;
  if (runId) previousGrant = store.readEvents(runId).findLast(({ type }) => type === "grant.recorded");
  else {
    const active = store.listRunIds().flatMap((id) => {
      if (["SUCCEEDED", "STOPPED"].includes(store.readStatus(id)?.run.state)) return [];
      const grant = store.readEvents(id).findLast(({ type }) => type === "grant.recorded");
      return grant ? [grant] : [];
    });
    if (!specId && active.length !== 1) return { state: "SELECTION_REQUIRED", runs: active.map(({ runIdentity }) => runIdentity) };
    const matching = specId ? active.filter(({ runIdentity }) => runIdentity.specId === specId && (!approvedScopeHash || runIdentity.approvedScopeHash === approvedScopeHash)) : active;
    if (matching.length > 1) return { state: "SELECTION_REQUIRED", runs: matching.map(({ runIdentity }) => runIdentity) };
    previousGrant = matching[0];
  }
  if (specId && previousGrant && previousGrant.runIdentity.specId !== specId) {
    return { state: "UNAVAILABLE", reason: "Selected Run and Spec differ; preserve both" };
  }
  if (runId && !previousGrant) return { state: "UNAVAILABLE", reason: "Selected Run has no recorded grant; preserve its files" };
  if (previousGrant && !previousGrant.workflowVersion) return { state: "UNAVAILABLE", reason: "Selected Run has no proven package version; preserve its evidence for compatibility reconciliation" };
  const selected = selectWorkflowVersion({ cacheDirectory, recordedVersion: previousGrant?.workflowVersion });
  if (selected.state !== "AVAILABLE") return selected;
  const current = selectWorkflowVersion({ cacheDirectory });
  const compatible = previousGrant && current.state === "AVAILABLE"
    && current.version.protocolVersion === selected.version.protocolVersion
    && current.version.sourceRepository === selected.version.sourceRepository;
  const runtime = compatible ? current : selected;
  const composition = await import(pathToFileURL(join(runtime.root, "skills/personal/run-issue-workflow/scripts/codex-workflow.mjs")).href);
  const options = { repository, specId: previousGrant?.runIdentity.specId ?? specId,
    runIdentity: previousGrant?.runIdentity, workflowVersion: runtime.version,
    compatibleRecordedVersion: compatible ? previousGrant.workflowVersion : undefined, packageRoot: runtime.root, host };
  if (prepareOnly) {
    if (typeof composition.prepareCodexWorkflow !== "function") return { state: "UNAVAILABLE", reason: "This retained package has no compatible batch entry; preserve its Run" };
    return composition.prepareCodexWorkflow(options);
  }
  return composition.runCodexWorkflow(options);
}

export async function runInstalledEntry({ repository, specId, runId, host, specIds, maxWorkers = 3 }) {
  if (!specIds && typeof specId === "string" && specId.includes(",")) specIds = specId.split(",");
  if (!specIds) return selectInstalledLane({ repository, specId, runId, host });
  if (runId || specIds.length === 0 || new Set(specIds).size !== specIds.length) throw new Error("Batch entry requires explicit distinct Specs and no ambiguous Run ID");
  const lanes = [];
  try {
    for (const id of specIds) {
      try {
        const lane = await selectInstalledLane({ repository, specId: id, host, prepareOnly: true });
        lanes.push(typeof lane.run === "function" ? lane : { specId: id, run: async () => ({ run: { state: "UNAVAILABLE", specId: id }, reason: lane.reason, nodes: [], legalActions: [] }) });
      } catch (error) { lanes.push({ specId: id, run: async () => ({ run: { state: "UNAVAILABLE", specId: id }, reason: error.message, nodes: [], legalActions: [] }) }); }
    }
    return await runBatch({ lanes, maxWorkers, sleep, connected: () => !host.disconnected });
  } finally { for (const lane of lanes) await lane.close?.(); }

}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repository, specId, runId] = process.argv.slice(2);
  if (!repository) throw new Error("Usage: installed-entry.mjs <repository> [Spec number or comma-separated Spec batch] [Run ID]");
  if (process.stdin.isTTY) execFileSync("stty", ["-echo", "-icanon", "min", "1", "time", "0"], { stdio: "inherit" });
  const host = createCodexHostBridge();
  try {
    const result = await runInstalledEntry({ repository, specId: specId || undefined, runId: runId || undefined, host });
    emit({ type: "result", result, metrics: host.metrics() });
  } catch (error) {
    emit({ type: "error", message: error.message, metrics: host.metrics(), recovery: "Preserve the Run and tasks; resume this installed entry from observed state." });
    process.exitCode = 1;
  } finally { host.close(); }
}
