import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  INSTALLED_READINESS_SEAMS,
  readInstalledReadinessProof,
} from "../../skills/personal/run-issue-workflow/scripts/installed-readiness-proof.mjs";
import {
  installWorkflow,
  readWorkflowInstallationEvidence,
  selectWorkflowVersion,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-installation.mjs";
import { runWorkflowCommand } from "../../skills/personal/run-issue-workflow/scripts/workflow-command.mjs";

const repository = resolve(import.meta.dirname, "../..");
const proofPath = join(
  repository,
  "skills/personal/run-issue-workflow/scripts/installed-readiness-proof.mjs",
);
const installationOwner =
  "skills/personal/run-issue-workflow/scripts/workflow-installation.mjs";

const hostAssets = [
  "deliver-tracker-spec.json",
  "workflows/deliver-tracker-spec/helpers/controller.mjs",
  "scripts/pi-workflow-host.mjs",
];
function copyHostAssets(repository) {
  for (const path of hostAssets) {
    const target = join(repository, "skills/personal/run-issue-workflow", path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(
      target,
      readFileSync(
        new URL(
          `../../skills/personal/run-issue-workflow/${path}`,
          import.meta.url,
        ),
      ),
    );
  }
}

// One retained installation of the reviewed candidate: the trusted layout the installation owner
// verifies, with a package-owned installed entry that answers only the capability probe. The retired live
// qualification is fatal here, so a proof that fell back to it would be visible in the recorded spawns.
// The faults are the owner's own capability verdicts: an unknown, an unreadable and an incomplete probe.
const installedEntryFixture = `
const version = process.argv[3];
const mode = process.argv[2];
const fault = process.env.WORKFLOW_QUALIFICATION_FAULT ?? null;
const capability = { platform: process.platform, arch: process.arch, node: process.version,
  kernelRelease: "6.18.33.2-microsoft-standard-WSL2", wslDistro: "Ubuntu", posixCleanup: true };
if (mode === "--qualification-identity") {
  if (fault === "unknown-capability") { process.stderr.write("capability unknown\\n"); process.exitCode = 1; }
  else if (fault === "unreadable-capability") process.stdout.write("not json");
  else if (fault === "incomplete-capability") process.stdout.write(JSON.stringify({ state: "READY", capability: { platform: process.platform } }));
  else process.stdout.write(JSON.stringify({ state: "READY", packageVersionId: version, capability }));
} else if (mode === "--qualify-repair-package") {
  process.stderr.write("the retired live qualification must never be required again\\n");
  process.exitCode = 1;
}
export const installed = true;
`;

function buildInstalledWorkflow() {
  const root = mkdtempSync(join(tmpdir(), "installed-readiness-proof-"));
  const sourceRepository = join(root, "source");
  const cacheDirectory = join(root, ".codex", "workflow-packages");
  const codexEntry = join(root, ".codex", "skills", "run-issue-workflow");
  const agentsEntry = join(root, ".agents", "skills", "run-issue-workflow");
  mkdirSync(
    join(sourceRepository, "skills/personal/run-issue-workflow/scripts"),
    { recursive: true },
  );
  writeFileSync(
    join(sourceRepository, "skills/personal/run-issue-workflow/SKILL.md"),
    "Reviewed workflow\n",
  );
  writeFileSync(
    join(
      sourceRepository,
      "skills/personal/run-issue-workflow/scripts/installed-entry.mjs",
    ),
    installedEntryFixture,
  );
  copyHostAssets(sourceRepository);
  mkdirSync(join(sourceRepository, "docs/agents/references"), {
    recursive: true,
  });
  writeFileSync(
    join(sourceRepository, "docs/agents/run-preparation.md"),
    "Preparation owner\n",
  );
  writeFileSync(
    join(
      sourceRepository,
      "docs/agents/references/approved-pre-run-workflow-maintenance.md",
    ),
    "Maintenance owner\n",
  );
  writeFileSync(
    join(sourceRepository, "docs/agents/references/workflow-stop-diagnosis.md"),
    "Diagnosis owner\n",
  );
  const git = (...args) =>
    execFileSync("git", ["-C", sourceRepository, ...args], {
      encoding: "utf8",
    }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("add", ".");
  git("-c", "commit.gpgsign=false", "commit", "-m", "reviewed candidate");
  const candidate = git("rev-parse", "HEAD");
  const version = installWorkflow({
    sourceRepository,
    sourceCommit: candidate,
    cacheDirectory,
    skillDirectory: codexEntry,
  }).version;
  installWorkflow({
    sourceRepository,
    sourceCommit: candidate,
    cacheDirectory,
    skillDirectory: agentsEntry,
  });
  const spawned = [];
  const commandRunner = (name, args, options) => {
    spawned.push([name, ...args]);
    return runWorkflowCommand(name, args, options);
  };
  const read = (expectedSourceCommit = candidate) =>
    readInstalledReadinessProof({
      cacheDirectory,
      expectedSourceCommit,
      selectVersion: (options) => selectWorkflowVersion(options),
      readEvidence: (options) =>
        readWorkflowInstallationEvidence({ ...options, commandRunner }),
    });
  const link = (target, path) => {
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
    symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
  };
  return {
    root,
    cacheDirectory,
    candidate,
    version,
    codexEntry,
    agentsEntry,
    spawned,
    read,
    link,
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("the proof reports every required seam and one READY verdict from the installed version's own evidence", () => {
  const fixture = buildInstalledWorkflow();
  const {
    cacheDirectory,
    candidate,
    version,
    codexEntry,
    agentsEntry,
    spawned,
    read,
    remove,
  } = fixture;
  try {
    const report = read();
    // AC-1: the verdict is reduced from a re-read of the installed version's own evidence.
    assert.equal(report.schema, "installed-readiness-proof:v1");
    assert.equal(report.verdict, "READY");
    assert.equal(report.blocker, null);
    assert.equal(report.cacheDirectory, cacheDirectory);
    assert.equal(report.expectedSourceCommit, candidate);
    assert.equal(report.evidence.schema, "codex-workflow-effective-evidence:v3");
    assert.deepEqual(
      report.seams.map(({ seam }) => seam),
      [...INSTALLED_READINESS_SEAMS],
    );
    assert.deepEqual(
      report.seams.map(({ state }) => state),
      ["PRESENT", "PRESENT", "PRESENT", "PRESENT"],
    );
    const [versionSeam, manifestSeam, entrySeam, capabilitySeam] = report.seams;
    assert.equal(versionSeam.observed.version.id, version.id);
    assert.equal(versionSeam.observed.version.sourceCommit, candidate);
    assert.equal(versionSeam.observed.packageVersionId, version.id);
    assert.equal(versionSeam.observed.expectedSourceCommit, candidate);
    assert.equal(
      manifestSeam.observed.manifestSha256,
      report.evidence.manifestSha256,
    );
    assert.match(manifestSeam.observed.manifestSha256, /^sha256:[a-f0-9]{64}$/u);
    assert.deepEqual(
      entrySeam.observed.entries.map(({ path }) => path),
      [codexEntry, agentsEntry],
    );
    assert.ok(
      entrySeam.observed.entries.every(
        ({ target, packageVersionId }) =>
          packageVersionId === version.id &&
          target ===
            join(
              cacheDirectory,
              "versions",
              version.id,
              "skills/personal/run-issue-workflow",
            ),
      ),
      "every resolved entry names the exact installed package version",
    );
    assert.deepEqual(
      capabilitySeam.observed.capability,
      report.evidence.capability,
    );
    assert.equal(capabilitySeam.observed.capability.posixCleanup, true);
    // Every seam names its owning source: the installation owner, or the installed entry's own probe.
    assert.match(
      versionSeam.owner,
      /workflow-installation\.mjs#selectWorkflowVersion$/u,
    );
    assert.match(manifestSeam.owner, /workflow-installation\.mjs#verifyPackage$/u);
    assert.match(
      entrySeam.owner,
      /workflow-installation\.mjs#readWorkflowInstallationEvidence$/u,
    );
    assert.match(
      capabilitySeam.owner,
      /installed-entry\.mjs --qualification-identity$/u,
    );
    // The seam's owning source names the probe exactly once, with its own flag.
    assert.equal(
      capabilitySeam.owner.match(/--qualification-identity/gu).length,
      1,
    );
    // One capability probe proves the read; the retired live qualification is never invoked and no
    // retained sample is read or written.
    assert.equal(spawned.length, 1);
    assert.match(spawned[0].join(" "), /--qualification-identity/u);
    assert.equal(
      spawned.some((argv) => argv.includes("--qualify-repair-package")),
      false,
    );
    assert.equal(existsSync(join(cacheDirectory, "qualification")), false);
  } finally {
    remove();
  }
});

test("an unchanged installation returns the same report and the same verdict on a second run", () => {
  const fixture = buildInstalledWorkflow();
  const { read, remove } = fixture;
  try {
    const first = read();
    const second = read();
    assert.deepEqual(second, first, "a re-read reports the same evidence");
    assert.equal(
      JSON.stringify(second),
      JSON.stringify(first),
      "a re-read of an unchanged installation is byte-identical",
    );
    assert.equal(second.verdict, "READY");
  } finally {
    remove();
  }
});

test("a broken managed entry returns one attributable, owner-named not-ready verdict", () => {
  const fixture = buildInstalledWorkflow();
  const {
    cacheDirectory,
    codexEntry,
    agentsEntry,
    spawned,
    read,
    link,
    remove,
  } = fixture;
  try {
    const preserved = `${agentsEntry}.preserved`;
    renameSync(agentsEntry, preserved);
    for (const [entryName, breakEntry] of [
      [
        "a foreign target",
        () => {
          mkdirSync(join(cacheDirectory, "foreign"));
          link(join(cacheDirectory, "foreign"), agentsEntry);
        },
      ],
      [
        "a misdirected target",
        () => {
          const otherVersion = join(
            cacheDirectory,
            "versions",
            "f".repeat(64),
            "skills/personal/run-issue-workflow",
          );
          mkdirSync(otherVersion, { recursive: true });
          link(otherVersion, agentsEntry);
        },
      ],
      [
        "a missing entry",
        () => {
          if (existsSync(agentsEntry)) rmSync(agentsEntry, { recursive: true });
        },
      ],
    ]) {
      breakEntry();
      const report = read();
      assert.equal(report.verdict, "NOT_READY", entryName);
      assert.notEqual(report.blocker, null, `${entryName} names its blocker`);
      assert.deepEqual(
        report.seams.map(({ state }) => state),
        ["PRESENT", "PRESENT", "MISSING", "UNKNOWN"],
        entryName,
      );
      assert.equal(report.blocker.seam, "environment-resolved-managed-entries");
      assert.equal(report.blocker.code, "installed_managed_entries_unproven");
      assert.equal(report.blocker.owner, installationOwner);
      assert.match(report.blocker.reason, /managed entry/iu);
      assert.match(report.blocker.action, /install-workflow\.mjs/u);
      assert.equal(
        report.evidence,
        null,
        "a withheld installation boundary returns no receipt",
      );
      assert.equal(
        spawned.length,
        0,
        "a withheld installation boundary never reaches the capability probe",
      );
      assert.deepEqual(
        read(),
        report,
        `re-running the proof over the same unchanged ${entryName} repeats the verdict`,
      );
    }
    if (existsSync(agentsEntry)) rmSync(agentsEntry, { recursive: true });
    renameSync(preserved, agentsEntry);
    assert.equal(read().verdict, "READY");
    assert.equal(existsSync(codexEntry), true);
  } finally {
    remove();
  }
});

test("an installed version that is not the reviewed source commit returns one owner-named verdict", () => {
  const fixture = buildInstalledWorkflow();
  const { spawned, read, remove } = fixture;
  try {
    const report = read("f".repeat(40));
    assert.equal(report.verdict, "NOT_READY");
    assert.deepEqual(
      report.seams.map(({ state }) => state),
      ["MISSING", "PRESENT", "UNKNOWN", "UNKNOWN"],
    );
    assert.equal(report.blocker.seam, "selected-package-version");
    assert.equal(report.blocker.code, "installed_package_version_unproven");
    assert.equal(report.blocker.owner, installationOwner);
    assert.match(report.blocker.reason, /reviewed source commit/u);
    assert.match(report.blocker.action, /install-workflow\.mjs/u);
    assert.equal(
      spawned.length,
      0,
      "no capability probe runs for a version the reviewed commit does not bind",
    );
    // AC-2: re-running the proof over the same unchanged unbound version repeats the verdict.
    assert.deepEqual(read("f".repeat(40)), report);
  } finally {
    remove();
  }
});

test("an unprovable capability returns one attributable blocker naming its owning source", () => {
  const fixture = buildInstalledWorkflow();
  const { spawned, read, remove } = fixture;
  try {
    for (const [fault, state] of [
      ["unknown-capability", "UNKNOWN"],
      ["unreadable-capability", "UNKNOWN"],
      ["incomplete-capability", "MISSING"],
    ]) {
      const readUnderFault = () => {
        process.env.WORKFLOW_QUALIFICATION_FAULT = fault;
        try {
          return read();
        } finally {
          delete process.env.WORKFLOW_QUALIFICATION_FAULT;
        }
      };
      const report = readUnderFault();
      assert.equal(
        report.verdict,
        "NOT_READY",
        `the ${fault} fault must not reach READY`,
      );
      assert.deepEqual(
        report.seams.map(({ state: seamState }) => seamState),
        ["PRESENT", "PRESENT", "UNKNOWN", state],
      );
      assert.equal(report.blocker.seam, "installed-capability-probe");
      assert.equal(
        report.blocker.code,
        "installed_workflow_capability_unproven",
      );
      assert.equal(report.blocker.state, state);
      assert.match(
        report.blocker.owner,
        /installed-entry\.mjs --qualification-identity$/u,
      );
      assert.match(report.blocker.action, /re-read the installed evidence/u);
      assert.match(report.blocker.reason, /\S/u);
      // The failing capability seam names the same owning source as its blocker, exactly once.
      const capabilitySeam = report.seams.find(
        ({ seam: seamName }) => seamName === "installed-capability-probe",
      );
      assert.equal(capabilitySeam.owner, report.blocker.owner, fault);
      assert.equal(
        capabilitySeam.owner.match(/--qualification-identity/gu).length,
        1,
        `${fault}: the owning source names the probe once`,
      );
      // AC-2: re-running the proof over the same unchanged unprovable capability repeats the verdict.
      assert.deepEqual(readUnderFault(), report, fault);
      assert.equal(
        spawned.some((argv) => argv.includes("--qualify-repair-package")),
        false,
        "an unprovable capability never falls back to a live qualification run",
      );
      assert.equal(
        existsSync(join(fixture.cacheDirectory, "qualification")),
        false,
      );
    }
  } finally {
    remove();
  }
});

test("the documented command re-runs unchanged to the same verdict", () => {
  const fixture = buildInstalledWorkflow();
  const { cacheDirectory, candidate, remove } = fixture;
  const run = (expectedSourceCommit, ...extra) => {
    const [flags, options] = extra.length > 0 && typeof extra.at(-1) === "object"
      ? [extra.slice(0, -1), extra.at(-1)]
      : [extra, {}];
    return execFileSync(
      process.execPath,
      [
        proofPath,
        "--cache-directory",
        cacheDirectory,
        "--expected-source-commit",
        expectedSourceCommit,
        ...flags,
      ],
      { encoding: "utf8", ...options },
    );
  };
  try {
    const human = run(candidate);
    assert.match(human, /seam selected-package-version: PRESENT/u);
    assert.match(human, /seam installed-capability-probe: PRESENT/u);
    assert.match(human, /verdict: READY/u);
    const first = run(candidate, "--json");
    const second = run(candidate, "--json");
    assert.equal(
      second,
      first,
      "an unchanged installation returns the same report",
    );
    const report = JSON.parse(first);
    assert.equal(report.verdict, "READY");
    assert.deepEqual(
      report.seams.map(({ state }) => state),
      ["PRESENT", "PRESENT", "PRESENT", "PRESENT"],
    );
    let failure = null;
    let repeatedFailure = null;
    try {
      run("f".repeat(40), "--json");
    } catch (error) {
      failure = error;
    }
    try {
      run("f".repeat(40), "--json");
    } catch (error) {
      repeatedFailure = error;
    }
    assert.notEqual(failure, null, "a not-ready read exits non-zero");
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /installed_package_version_unproven/u);
    assert.match(failure.stderr, /Smallest human action:/u);
    const notReady = JSON.parse(failure.stdout);
    assert.equal(notReady.verdict, "NOT_READY");
    assert.equal(
      repeatedFailure?.status,
      1,
      "the not-ready verdict repeats at the documented command as well",
    );
    assert.equal(repeatedFailure?.stdout, failure.stdout);
    assert.equal(repeatedFailure?.stderr, failure.stderr);
    // The same command against an unprovable capability reports the seam's owning source once, and that
    // owning source is the blocker's own owner string.
    let faultedFailure = null;
    try {
      run(candidate, "--json", {
        env: { ...process.env, WORKFLOW_QUALIFICATION_FAULT: "unknown-capability" },
      });
    } catch (error) {
      faultedFailure = error;
    }
    assert.notEqual(faultedFailure, null, "an unprovable capability exits non-zero");
    assert.equal(faultedFailure.status, 1);
    assert.match(
      faultedFailure.stderr,
      /installed_workflow_capability_unproven/u,
    );
    const faulted = JSON.parse(faultedFailure.stdout);
    assert.equal(faulted.verdict, "NOT_READY");
    assert.equal(
      faulted.blocker.code,
      "installed_workflow_capability_unproven",
    );
    const faultedSeam = faulted.seams.find(
      ({ seam }) => seam === "installed-capability-probe",
    );
    assert.equal(faultedSeam.owner, faulted.blocker.owner);
    assert.equal(faultedSeam.owner.match(/--qualification-identity/gu).length, 1);
  } finally {
    remove();
  }
});
