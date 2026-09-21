import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

export function readPlatformDescriptor({
  platform = process.platform,
  arch = process.arch,
  node = process.version,
  readKernel = () => readFileSync("/proc/sys/kernel/osrelease", "utf8").trim(),
  env = process.env,
} = {}) {
  let kernelRelease = null;
  try { kernelRelease = readKernel(); } catch {}
  return {
    platform,
    arch,
    node,
    kernelRelease,
    wslDistro: env.WSL_DISTRO_NAME ?? null,
  };
}

export function provePosixCleanup({ temporaryRoot = tmpdir() } = {}) {
  const root = mkdtempSync(join(temporaryRoot, "run-issue-capability-"));
  try {
    const link = join(root, "link");
    symlinkSync(root, link, process.platform === "win32" ? "junction" : "dir");
    rmSync(link);
    return true;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function readInstalledCapability({
  packageVersionId,
  packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.."),
  readPlatform = readPlatformDescriptor,
  probeCleanup = provePosixCleanup,
} = {}) {
  if (!/^[a-f0-9]{64}$/u.test(packageVersionId ?? ""))
    throw new TypeError("Capability requires the exact installed package version");
  const manifestPath = join(packageRoot, ".workflow-version.json");
  const manifestBytes = readFileSync(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes);
  } catch {
    return { state: "UNKNOWN", reason: "The selected package manifest is unreadable" };
  }
  if (manifest?.schema !== "codex-workflow-version:v1" || manifest.version?.id !== packageVersionId)
    return { state: "UNKNOWN", reason: "The selected package manifest does not bind the requested version" };
  const platform = readPlatform();
  if (platform.platform !== "linux")
    return { state: "UNKNOWN", reason: "Workflow capability requires a Linux runtime" };
  if (typeof platform.kernelRelease !== "string" || !/microsoft|wsl/iu.test(platform.kernelRelease))
    return { state: "UNKNOWN", reason: "The WSL kernel release is unreadable or unrecognised" };
  if (typeof platform.wslDistro !== "string" || platform.wslDistro.length === 0)
    return { state: "UNKNOWN", reason: "The WSL distro marker is unavailable" };
  let posixCleanup;
  try { posixCleanup = probeCleanup() === true; } catch { posixCleanup = false; }
  if (!posixCleanup)
    return { state: "UNKNOWN", reason: "Ordinary POSIX worktree cleanup could not be proven" };
  const capability = { ...platform, posixCleanup };
  const manifestSha256 = sha256(manifestBytes);
  return {
    state: "READY",
    packageVersionId,
    manifestSha256,
    capabilityIdentity: sha256(JSON.stringify({ packageVersionId, manifestSha256, capability })),
    capability,
  };
}
