import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  readInstalledCapability,
  readPlatformDescriptor,
} from "../../skills/personal/run-issue-workflow/scripts/installed-capability.mjs";

const packageVersionId = "a".repeat(64);
const packageFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-capability-"));
  writeFileSync(join(root, ".workflow-version.json"), JSON.stringify({
    schema: "codex-workflow-version:v1",
    version: {
      id: packageVersionId,
      sourceCommit: "b".repeat(40),
      sourceRepository: "/trusted/source",
      protocolVersion: 1,
    },
    files: [{ path: "skills/personal/run-issue-workflow/SKILL.md", mode: "100644", sha256: "0".repeat(64) }],
  }));
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
};
const platform = {
  platform: "linux",
  arch: "x64",
  node: "v24.0.0",
  kernelRelease: "6.6.0-microsoft-standard-WSL2",
  wslDistro: "Ubuntu",
};

test("minimal installed capability binds the package manifest and platform descriptor", () => {
  const fixture = packageFixture();
  try {
    const result = readInstalledCapability({
      packageVersionId,
      packageRoot: fixture.root,
      readPlatform: () => platform,
      probeCleanup: () => true,
    });
    assert.equal(result.state, "READY");
    assert.equal(result.packageVersionId, packageVersionId);
    assert.match(result.manifestSha256, /^sha256:[a-f0-9]{64}$/u);
    assert.match(result.capabilityIdentity, /^sha256:[a-f0-9]{64}$/u);
    assert.deepEqual(result.capability, { ...platform, posixCleanup: true });
    const expected = `sha256:${createHash("sha256").update(JSON.stringify({
      packageVersionId,
      manifestSha256: result.manifestSha256,
      capability: result.capability,
    })).digest("hex")}`;
    assert.equal(result.capabilityIdentity, expected);
  } finally {
    fixture.remove();
  }
});

test("minimal capability stays UNKNOWN when runtime or cleanup is unproven", () => {
  const fixture = packageFixture();
  try {
    for (const [descriptor, reason] of [
      [{ ...platform, platform: "win32" }, /Linux runtime/u],
      [{ ...platform, kernelRelease: null }, /kernel release/u],
      [{ ...platform, wslDistro: null }, /distro marker/u],
    ]) {
      const result = readInstalledCapability({ packageVersionId, packageRoot: fixture.root, readPlatform: () => descriptor, probeCleanup: () => true });
      assert.equal(result.state, "UNKNOWN");
      assert.match(result.reason, reason);
    }
    const cleanup = readInstalledCapability({ packageVersionId, packageRoot: fixture.root, readPlatform: () => platform, probeCleanup: () => false });
    assert.equal(cleanup.state, "UNKNOWN");
    assert.match(cleanup.reason, /cleanup/u);
  } finally {
    fixture.remove();
  }
});

test("platform descriptor reports only runtime, WSL and distro facts", () => {
  assert.deepEqual(readPlatformDescriptor({
    platform: "linux",
    arch: "arm64",
    node: "v24",
    readKernel: () => "microsoft-standard-WSL2",
    env: { WSL_DISTRO_NAME: "Debian" },
  }), {
    platform: "linux",
    arch: "arm64",
    node: "v24",
    kernelRelease: "microsoft-standard-WSL2",
    wslDistro: "Debian",
  });
});
