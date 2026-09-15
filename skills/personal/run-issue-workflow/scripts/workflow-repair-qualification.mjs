import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { planCloseContinuation } from "./close-continuation.mjs";
import { createAutomaticHostCleanupPacket } from "./github-workflow-sources.mjs";
import { closeRequestIdentityFor } from "./run-coordinator.mjs";

const fixtureRevision = "wsl-posix-v1";
const runtime = `${process.platform}-${process.arch}`;
const requireEvidence = (condition, message) => { if (!condition) throw new Error(message); };
const stageResult = ({ stage, failureSignature, command, packageVersionId }) => ({
  stage, failureSignature, command, result: "PASS", packageVersionId, fixtureRevision, runtime,
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
    state: "PASS", identity: `sha256:${"b".repeat(64)}`, results: [{ inputs: {
      environment: check.environment, external: {}, configuration: [],
    } }],
  } };
  const result = { schema: "issue-close-result:v1", state: "HOST_CLEANUP_BLOCKED", runId, issueId, requestIdentity,
    authorityEvidence, candidate, targetHead: candidate, candidateReachable: true,
    integrationVerification: { state: "PASS", identity: integrationRecord.current.identity, checks: [check] },
    worktree, taskRef, directoryState: "EMPTY_UNREGISTERED",
    capability: { state: "UNAVAILABLE", operation: null, helperOwnership: "UNAVAILABLE", respawnProtection: "UNAVAILABLE",
      reason: "No exact host release operation is available" },
    reasonCode: "host_release_unavailable", observations: [{ code: "EBUSY", message: "qualified cleanup blocker" }] };
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
  return stageResult({ stage: "settled-host-cleanup-routing", failureSignature: "HOST_CLEANUP_BLOCKED was terminal", command, packageVersionId });
}

function qualifyStableIdentity({ command, packageVersionId }) {
  const evidence = { runIdentity: { runId: "qualification-run" }, issueId: "qualification-issue",
    candidate: "a".repeat(40), baseline: "b".repeat(40), controlRevision: 0,
    targetHead: "c".repeat(40), candidateReachable: false, worktreeState: "PRESENT" };
  requireEvidence(closeRequestIdentityFor(evidence) === closeRequestIdentityFor({ ...evidence, controlRevision: 7 }),
    "Mutable control revision changed the logical close request identity");
  requireEvidence(closeRequestIdentityFor(evidence) !== closeRequestIdentityFor({ ...evidence, candidate: "d".repeat(40) }),
    "Immutable candidate identity did not change the logical close request identity");
  return stageResult({ stage: "stable-close-identity", failureSignature: "controlRevision changed request identity", command, packageVersionId });
}

async function qualifyPosixWorktreeCleanup({ command, packageVersionId }) {
  if (process.platform !== "linux") throw new Error("WSL qualification requires a Linux runtime");
  const root = mkdtempSync(join(tmpdir(), "workflow-wsl-qualification-"));
  const worktree = join(root, "issue"); mkdirSync(worktree);
  let child;
  try {
    child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdout.write('ready')"],
      { cwd: worktree, stdio: ["pipe", "pipe", "ignore"] });
    await once(child.stdout, "data");
    rmdirSync(worktree);
    process.kill(child.pid, 0);
  } finally {
    if (child?.exitCode === null) { const exited = once(child, "exit"); child.stdin.end(); await exited; }
    rmSync(root, { recursive: true, force: true });
  }
  return stageResult({ stage: "posix-worktree-cleanup", failureSignature: "ordinary POSIX cleanup required process recovery", command, packageVersionId });
}

export async function runWorkflowRepairQualification({ packageVersionId, command = "runWorkflowRepairQualification" }) {
  if (!/^[a-f0-9]{64}$/u.test(packageVersionId)) throw new TypeError("Qualification requires the exact installed package version");
  return [
    qualifySettledRouting({ command, packageVersionId }),
    qualifyStableIdentity({ command, packageVersionId }),
    await qualifyPosixWorktreeCleanup({ command, packageVersionId }),
  ];
}
