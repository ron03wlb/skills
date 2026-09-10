import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";

import { openWindowsCleanupSession } from "../../../engineering/close-issue/scripts/windows-cleanup-session.mjs";
import { planCloseContinuation } from "./close-continuation.mjs";
import { createAutomaticHostCleanupPacket } from "./github-workflow-sources.mjs";
import { closeRequestIdentityFor } from "./run-coordinator.mjs";

const requireEvidence = (condition, message) => { if (!condition) throw new Error(message); };
const stageResult = ({ stage, failureSignature, command, packageVersionId }) => ({
  stage, failureSignature, command, result: "PASS", packageVersionId,
});

function qualifySettledRouting({ command, packageVersionId }) {
  const candidate = "a".repeat(40), worktree = resolve("workflow-qualification-issue");
  const issueId = "qualification-issue", specId = "qualification-spec", runId = "qualification-run";
  const taskRef = { threadId: "qualification-task", hostId: "local" };
  const authorityEvidence = { candidateCommit: candidate, completionEvidenceId: "completion",
    completionBodySha256: "sha256:completion", worktreeIdentity: "sha256:worktree" };
  const requestEvidence = { runIdentity: { runId }, issueId, candidateReachable: true, worktreeState: "PRESENT", authorityEvidence };
  const requestIdentity = closeRequestIdentityFor(requestEvidence);
  const check = { command: [process.execPath, "-e", ""], configFiles: [], environment: { runtime: process.version },
    externalInputs: { kind: "none" } };
  const integrationRecord = { obligation: [{ command: check.command, configFiles: check.configFiles }], current: {
    state: "PASS", identity: "sha256:integration", results: [{ inputs: {
      environment: check.environment, external: {}, configuration: [],
    } }],
  } };
  const result = { schema: "issue-close-result:v1", state: "HOST_CLEANUP_BLOCKED", runId, issueId, requestIdentity,
    authorityEvidence, candidate, targetHead: candidate, candidateReachable: true,
    integrationVerification: { state: "PASS", identity: integrationRecord.current.identity, checks: [check] },
    worktree, taskRef, directoryState: { registered: false, exists: true, empty: true, itemCount: 0 },
    reasonCode: "host_release_unavailable", observations: [{ code: "EBUSY", message: "qualified sharing violation" }] };
  const task = { state: "RESUMABLE", snapshot: { turns: [{ status: "completed" }] },
    closeRequest: { runId, issueId, requestIdentity }, closeResult: result };
  const continuation = planCloseContinuation({ task, requestIdentity, requestEvidence });
  requireEvidence(continuation.blocked?.reasonCode === "host_release_unavailable", "Settled host cleanup did not reach its recovery boundary");
  const packet = createAutomaticHostCleanupPacket({ result, taskCwd: worktree, originalTaskRef: taskRef,
    integrationRecord, record: { candidate, worktree, topic: "qualification-topic" },
    target: { head: candidate, worktree: resolve("workflow-qualification-target") }, targetName: "main", issueId, specId });
  requireEvidence(packet?.failure?.code === "EBUSY" && packet.failure.message === result.observations[0].message,
    "Production host cleanup observations did not form the recovery packet");
  requireEvidence(packet.integrationChecks.length === 1 && packet.integrationChecks[0].command === check.command,
    "Configured integration checks were not retained by host cleanup routing");
  return stageResult({ stage: "settled-host-cleanup-routing", failureSignature: "HOST_CLEANUP_BLOCKED was terminal",
    command, packageVersionId });
}

function qualifyStableIdentity({ command, packageVersionId }) {
  const evidence = { runIdentity: { runId: "qualification-run" }, issueId: "qualification-issue",
    candidate: "a".repeat(40), baseline: "b".repeat(40), controlRevision: 0,
    targetHead: "c".repeat(40), candidateReachable: false, worktreeState: "PRESENT" };
  requireEvidence(closeRequestIdentityFor(evidence) === closeRequestIdentityFor({ ...evidence, controlRevision: 7 }),
    "Mutable control revision changed the logical close request identity");
  requireEvidence(closeRequestIdentityFor(evidence) !== closeRequestIdentityFor({ ...evidence, candidate: "d".repeat(40) }),
    "Immutable candidate identity did not change the logical close request identity");
  return stageResult({ stage: "stable-close-identity", failureSignature: "controlRevision changed request identity",
    command, packageVersionId });
}

function fixturePaths(root) {
  const local = join(root, "local"), hostExe = join(local, "OpenAI", "Codex", "bin", "fixture", "codex.exe");
  const helperExe = join(local, "OpenAI", "Codex", "runtimes", "cua_node", "fixture", "bin", "node_repl.exe");
  for (const path of [hostExe, helperExe]) { mkdirSync(join(path, ".."), { recursive: true }); copyFileSync(process.execPath, path); }
  const unrelated = join(root, "unrelated"); mkdirSync(unrelated);
  return { hostExe, helperExe, unrelated, env: { ...process.env, LOCALAPPDATA: local } };
}

async function hostFixture(root, target) {
  const { hostExe, helperExe, unrelated, env } = fixturePaths(root);
  const helperCode = "process.stdin.resume();process.stdout.write('ready\\n');process.stdin.on('end',()=>process.exit());process.stdin.on('data',()=>process.exit());";
  const directories = [target, target, target, unrelated];
  const code = `const {spawn}=require('node:child_process');let children=[],ready=0;for(const cwd of ${JSON.stringify(directories)}){const child=spawn(${JSON.stringify(helperExe)},['-e',${JSON.stringify(helperCode)}],{cwd,detached:true,windowsHide:true,stdio:['pipe','pipe','ignore']});child.stdin.on('error',()=>{});children.push(child);child.stdout.once('data',()=>{if(++ready===${directories.length})console.log(JSON.stringify(children.map(c=>c.pid)))});}process.stdin.resume();const stop=()=>{for(const c of children)if(c.exitCode===null)c.stdin.end('stop\\n');setTimeout(()=>{for(const c of children)if(c.exitCode===null)c.kill();process.exit()},1000)};process.stdin.on('end',stop);process.stdin.on('data',stop);`;
  const host = spawn(hostExe, ["-e", code], { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
  const lines = createInterface({ input: host.stdout });
  const [line] = await once(lines, "line"), pids = JSON.parse(line), unrelatedPid = pids.pop();
  return { env, host, ownedPids: pids, unrelatedPid, async dispose() {
    lines.close();
    if (host.exitCode !== null || host.signalCode !== null) return;
    const exited = once(host, "exit"); host.stdin.end("stop\n"); await exited;
  } };
}

async function qualifyInterruptedContinuation({ command, packageVersionId }) {
  if (process.platform !== "win32") throw new Error("Installed interrupted-helper qualification requires Windows x64");
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "workflow-package-qualification-")));
  const worktree = join(root, "issue"); mkdirSync(worktree);
  let fixture, first, resumed;
  try {
    fixture = await hostFixture(root, worktree);
    first = await openWindowsCleanupSession({ worktree, cwd: root, env: fixture.env, inspectionTimeoutMs: 20000 });
    const original = first.proof.processes;
    const interrupted = await first.release(() => { throw new Error("Qualified interruption after durable progress"); });
    requireEvidence(interrupted.state === "UNKNOWN" && interrupted.outcomes.length === 1
      && interrupted.outcomes[0].State === "EXITED", "Installed cleanup did not retain its completed interrupted outcome");
    await first.close(); first = null;
    const completedPid = interrupted.outcomes[0].Pid;
    const remaining = original.filter(process => process.Pid !== completedPid);
    requireEvidence(remaining.length === 2, "Installed cleanup did not preserve the exact remaining helper set");
    for (const item of remaining) process.kill(item.Pid, 0);
    const started = Date.now();
    resumed = await openWindowsCleanupSession({ worktree, cwd: root, env: fixture.env,
      expectedProcesses: remaining, inspectionTimeoutMs: 20000 });
    const release = await resumed.release(() => {}, async () => delay(12000));
    requireEvidence(release.state === "RELEASED" && release.outcomes.length === remaining.length,
      "Installed cleanup did not release the exact interrupted remainder");
    requireEvidence(Date.now() - started >= 24000, "Installed cleanup did not outlive one bounded protocol-step window");
    requireEvidence(release.outcomes.every(outcome => outcome.State === "EXITED"), "Installed cleanup left a qualified helper unresolved");
    process.kill(fixture.host.pid, 0); process.kill(fixture.unrelatedPid, 0);
    return stageResult({ stage: "interrupted-helper-continuation",
      failureSignature: "fixed inspector lifetime lost remaining helpers", command, packageVersionId });
  } finally {
    await resumed?.close(); await first?.close(); await fixture?.dispose();
    rmSync(root, { recursive: true, force: true });
  }
}

export async function runWorkflowRepairQualification({ packageVersionId, command = "runWorkflowRepairQualification" }) {
  if (!/^[a-f0-9]{64}$/u.test(packageVersionId)) throw new TypeError("Qualification requires the exact installed package version");
  const settled = qualifySettledRouting({ command, packageVersionId });
  const stable = qualifyStableIdentity({ command, packageVersionId });
  const interrupted = await qualifyInterruptedContinuation({ command, packageVersionId });
  return [settled, stable, interrupted];
}
