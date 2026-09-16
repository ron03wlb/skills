import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  rmdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { planCloseContinuation } from "./delivery-authority.mjs";
import { createAutomaticHostCleanupPacket } from "./github-workflow-sources.mjs";
import { closeRequestIdentityFor } from "./run-coordinator.mjs";

export const workflowQualificationSchema = "workflow-repair-qualification:v1";
export const workflowFixtureRevision = "wsl-posix-v1";
export const workflowQualificationStages = Object.freeze([
  "posix-worktree-cleanup",
  "settled-host-cleanup-routing",
  "stable-close-identity",
]);
export const workflowQualificationFailureSignatures = Object.freeze({
  "posix-worktree-cleanup": "ordinary POSIX cleanup required process recovery",
  "settled-host-cleanup-routing": "HOST_CLEANUP_BLOCKED was terminal",
  "stable-close-identity": "controlRevision changed request identity",
});
// Objectives this WSL component fixture deliberately does not exercise. They are reported as
// unavailable rather than inferred from a fixture, blocker, dispatch or heartbeat, and no
// p95, unattended-reliability or time-saving claim may be derived from the fixture intervals.
export const unavailableQualificationObjectives = Object.freeze({
  nativeTaskTerminalRecognition: Object.freeze({
    state: "unavailable",
    reason:
      "The component fixture never starts a native Codex task, so the 60-second terminal-recognition objective has no live subject.",
  }),
  liveTaskNoProgressDiagnosis: Object.freeze({
    state: "unavailable",
    reason:
      "No live task can stall in the component fixture, so the 300-second no-progress diagnosis objective cannot be observed.",
  }),
  closeAcceptance: Object.freeze({
    state: "unavailable",
    reason:
      "The fixture performs no native close handoff, so the 30-second close-acceptance objective is not exercised.",
  }),
  trackerMutation: Object.freeze({
    state: "unavailable",
    reason:
      "The fixture reads no tracker and mutates no Issue, so tracker mutation is not exercised.",
  }),
  unattendedDelivery: Object.freeze({
    state: "unavailable",
    reason:
      "No unattended Run is delivered in the fixture, so unattended reliability is not measured.",
  }),
});

const fixturePath = fileURLToPath(import.meta.url);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};
const requireEvidence = (condition, message) => {
  if (!condition) throw new Error(message);
};

// The fixture bytes are hashed independently of the package version and of the declared
// fixture revision, so a changed qualification fixture can never reuse retained evidence.
export const workflowFixtureDigest = () =>
  `sha256:${sha256(readFileSync(fixturePath))}`;
export const workflowCapabilityIdentity = (descriptor) =>
  `sha256:${sha256(JSON.stringify(canonicalize(descriptor)))}`;

export function readWorkflowCapability() {
  let kernelRelease = null;
  try {
    kernelRelease =
      readFileSync("/proc/sys/kernel/osrelease", "utf8").trim() || null;
  } catch {
    kernelRelease = null;
  }
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    kernelRelease,
    wslDistro: process.env.WSL_DISTRO_NAME ?? null,
  };
}

const capabilityGap = (capability) => {
  if (capability?.platform !== "linux") {
    return "WSL qualification requires a Linux runtime";
  }
  if (!capability.kernelRelease) {
    return "The WSL kernel release is unreadable, so platform capability cannot be proven";
  }
  if (!capability.wslDistro) {
    return "The WSL distro marker is absent, so platform capability cannot be proven";
  }
  return null;
};

// Ordinary POSIX cleanup is the one capability this fixture can actually prove: a worktree
// removed while a native process still owns its directory entry, with no process recovery.
export async function probePosixWorktreeCleanup() {
  if (process.platform !== "linux") {
    throw new Error("WSL qualification requires a Linux runtime");
  }
  const root = mkdtempSync(join(tmpdir(), "workflow-wsl-qualification-"));
  const worktree = join(root, "issue");
  mkdirSync(worktree);
  let child;
  try {
    child = spawn(
      process.execPath,
      ["-e", "process.stdin.resume();process.stdout.write('ready')"],
      { cwd: worktree, stdio: ["pipe", "pipe", "ignore"] },
    );
    await once(child.stdout, "data");
    rmdirSync(worktree);
    process.kill(child.pid, 0);
  } finally {
    if (child?.exitCode === null) {
      const exited = once(child, "exit");
      child.stdin.end();
      await exited;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

// The lightweight identity is everything a reuse decision needs without replaying the
// stages: the exact package, the installed fixture bytes, the runtime and the proven
// platform capability. An unprovable capability stays UNKNOWN and can never be retained.
export async function readWorkflowQualificationIdentity({
  packageVersionId,
  readCapability = readWorkflowCapability,
  probePosixCleanup = probePosixWorktreeCleanup,
} = {}) {
  if (!/^[a-f0-9]{64}$/u.test(packageVersionId)) {
    throw new TypeError(
      "Qualification requires the exact installed package version",
    );
  }
  const capability = readCapability();
  const gap = capabilityGap(capability);
  if (gap) return { state: "UNKNOWN", reason: gap };
  try {
    await probePosixCleanup();
  } catch (error) {
    return {
      state: "UNKNOWN",
      reason: `POSIX worktree cleanup could not be proven: ${error.message}`,
    };
  }
  const descriptor = {
    platform: capability.platform,
    arch: capability.arch,
    node: capability.node,
    kernelRelease: capability.kernelRelease,
    wslDistro: capability.wslDistro,
    posixCleanup: true,
  };
  return {
    state: "READY",
    capability: descriptor,
    boundInputs: {
      packageVersionId,
      fixtureRevision: workflowFixtureRevision,
      fixtureDigest: workflowFixtureDigest(),
      runtime: `${capability.platform}-${capability.arch}`,
      capabilityIdentity: workflowCapabilityIdentity(descriptor),
    },
  };
}

const stageResult = ({ stage, failureSignature, command, boundInputs }) => ({
  stage,
  failureSignature,
  command,
  result: "PASS",
  packageVersionId: boundInputs.packageVersionId,
  fixtureRevision: boundInputs.fixtureRevision,
  fixtureDigest: boundInputs.fixtureDigest,
  runtime: boundInputs.runtime,
  capabilityIdentity: boundInputs.capabilityIdentity,
});

function qualifySettledRouting({ command, boundInputs }) {
  const candidate = "a".repeat(40),
    worktree = resolve("workflow-qualification-issue");
  const issueId = "qualification-issue",
    specId = "qualification-spec",
    runId = "qualification-run";
  const taskRef = { threadId: "qualification-task", hostId: "local" };
  const authorityEvidence = {
    candidateCommit: candidate,
    completionEvidenceId: "completion",
    completionBodySha256: "sha256:completion",
    worktreeIdentity: "sha256:worktree",
  };
  const requestEvidence = {
    runIdentity: { runId },
    issueId,
    candidateReachable: true,
    worktreeState: "PRESENT",
    authorityEvidence,
  };
  const requestIdentity = closeRequestIdentityFor(requestEvidence);
  const check = {
    command: [process.execPath, "-e", ""],
    configFiles: [],
    environment: { runtime: process.version },
    externalInputs: { kind: "none" },
  };
  const integrationRecord = {
    obligation: [{ command: check.command, configFiles: check.configFiles }],
    current: {
      state: "PASS",
      identity: `sha256:${"b".repeat(64)}`,
      results: [
        {
          inputs: {
            environment: check.environment,
            external: {},
            configuration: [],
          },
        },
      ],
    },
  };
  const result = {
    schema: "issue-close-result:v1",
    state: "HOST_CLEANUP_BLOCKED",
    runId,
    issueId,
    requestIdentity,
    authorityEvidence,
    candidate,
    targetHead: candidate,
    candidateReachable: true,
    integrationVerification: {
      state: "PASS",
      identity: integrationRecord.current.identity,
      checks: [check],
    },
    worktree,
    taskRef,
    directoryState: "EMPTY_UNREGISTERED",
    capability: {
      state: "UNAVAILABLE",
      operation: null,
      helperOwnership: "UNAVAILABLE",
      respawnProtection: "UNAVAILABLE",
      reason: "No exact host release operation is available",
    },
    reasonCode: "host_release_unavailable",
    observations: [{ code: "EBUSY", message: "qualified cleanup blocker" }],
  };
  const task = {
    state: "RESUMABLE",
    snapshot: { turns: [{ status: "completed" }] },
    closeRequest: { runId, issueId, requestIdentity },
    closeResult: result,
  };
  const continuation = planCloseContinuation({
    task,
    requestIdentity,
    requestEvidence,
  });
  requireEvidence(
    continuation.blocked?.reasonCode === "host_release_unavailable",
    "Settled host cleanup did not reach its recovery boundary",
  );
  const packet = createAutomaticHostCleanupPacket({
    result,
    taskCwd: worktree,
    originalTaskRef: taskRef,
    integrationRecord,
    record: { candidate, worktree, topic: "qualification-topic" },
    target: {
      head: candidate,
      worktree: resolve("workflow-qualification-target"),
    },
    targetName: "main",
    issueId,
    specId,
  });
  requireEvidence(
    packet?.failure?.code === "EBUSY" &&
      packet.failure.message === result.observations[0].message,
    "Production host cleanup observations did not form the recovery packet",
  );
  requireEvidence(
    packet.integrationChecks.length === 1 &&
      packet.integrationChecks[0].command === check.command,
    "Configured integration checks were not retained by host cleanup routing",
  );
  return stageResult({
    stage: "settled-host-cleanup-routing",
    failureSignature:
      workflowQualificationFailureSignatures["settled-host-cleanup-routing"],
    command,
    boundInputs,
  });
}

function qualifyStableIdentity({ command, boundInputs }) {
  const evidence = {
    runIdentity: { runId: "qualification-run" },
    issueId: "qualification-issue",
    candidate: "a".repeat(40),
    baseline: "b".repeat(40),
    controlRevision: 0,
    targetHead: "c".repeat(40),
    candidateReachable: false,
    worktreeState: "PRESENT",
  };
  requireEvidence(
    closeRequestIdentityFor(evidence) ===
      closeRequestIdentityFor({ ...evidence, controlRevision: 7 }),
    "Mutable control revision changed the logical close request identity",
  );
  requireEvidence(
    closeRequestIdentityFor(evidence) !==
      closeRequestIdentityFor({ ...evidence, candidate: "d".repeat(40) }),
    "Immutable candidate identity did not change the logical close request identity",
  );
  return stageResult({
    stage: "stable-close-identity",
    failureSignature:
      workflowQualificationFailureSignatures["stable-close-identity"],
    command,
    boundInputs,
  });
}

async function qualifyPosixWorktreeCleanup({
  command,
  boundInputs,
  probePosixCleanup,
}) {
  await probePosixCleanup();
  return stageResult({
    stage: "posix-worktree-cleanup",
    failureSignature:
      workflowQualificationFailureSignatures["posix-worktree-cleanup"],
    command,
    boundInputs,
  });
}

export async function runWorkflowRepairQualification({
  packageVersionId,
  command = "runWorkflowRepairQualification",
  runs = 3,
  readCapability = readWorkflowCapability,
  probePosixCleanup = probePosixWorktreeCleanup,
  now = () => new Date().toISOString(),
  monotonic = () => process.hrtime.bigint(),
} = {}) {
  if (!Number.isInteger(runs) || runs < 1) {
    throw new TypeError("Qualification requires a positive integer run count");
  }
  const identity = await readWorkflowQualificationIdentity({
    packageVersionId,
    readCapability,
    probePosixCleanup,
  });
  if (identity.state !== "READY") return identity;
  const { boundInputs } = identity;
  const observations = [];
  for (let run = 1; run <= runs; run += 1) {
    const startedAt = monotonic();
    const stages = [
      qualifySettledRouting({ command, boundInputs }),
      qualifyStableIdentity({ command, boundInputs }),
      await qualifyPosixWorktreeCleanup({
        command,
        boundInputs,
        probePosixCleanup,
      }),
    ];
    observations.push({
      run,
      stages,
      observedAt: now(),
      durationMs: Number(monotonic() - startedAt) / 1e6,
    });
  }
  return {
    schema: workflowQualificationSchema,
    boundInputs,
    observations,
  };
}
