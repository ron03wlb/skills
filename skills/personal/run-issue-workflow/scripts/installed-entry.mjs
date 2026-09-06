import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bodyDigest } from "./github-workflow-records.mjs";
import { createCodexHostBridge } from "./codex-host-bridge.mjs";
import { selectWorkflowVersion } from "./workflow-installation.mjs";
import { createRunStore } from "./run-store.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cacheDirectory = resolve(packageRoot, "../..");
const emit = (value) => process.stdout.write(`workflow-host ${JSON.stringify(value)}\n`);

export async function runInstalledEntry({ repository, specId, runId, host }) {
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
  const composition = await import(pathToFileURL(join(selected.root, "skills/personal/run-issue-workflow/scripts/codex-workflow.mjs")).href);
  return composition.runCodexWorkflow({ repository, specId: previousGrant?.runIdentity.specId ?? specId,
    runIdentity: previousGrant?.runIdentity, workflowVersion: selected.version, packageRoot: selected.root, host });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repository, specId, runId] = process.argv.slice(2);
  if (!repository) throw new Error("Usage: installed-entry.mjs <repository> [Spec number] [Run ID]");
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
