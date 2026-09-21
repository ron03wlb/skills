import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs, { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";

import { installWorkflow } from "../../skills/personal/run-issue-workflow/scripts/workflow-installation.mjs";
import {
  applyInstallationMaintenance,
  previewInstallationMaintenance,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-installation-maintenance.mjs";

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), "workflow-maintenance-"));
  const source = join(root, "source");
  const cacheDirectory = join(root, ".codex", "workflow-packages");
  const skillDirectories = [".codex", ".agents", ".claude"].map((name) => join(root, name, "skills", "run-issue-workflow"));
  mkdirSync(join(source, "skills", "personal"), { recursive: true });
  cpSync(new URL("../../skills/personal/run-issue-workflow", import.meta.url), join(source, "skills/personal/run-issue-workflow"), { recursive: true });
  for (const path of [
    "docs/agents/run-preparation.md",
    "docs/agents/references/approved-pre-run-workflow-maintenance.md",
    "docs/agents/references/workflow-stop-diagnosis.md",
  ]) {
    mkdirSync(join(source, path, ".."), { recursive: true });
    cpSync(new URL(`../../${path}`, import.meta.url), join(source, path));
  }
  git(source, "init", "-b", "main");
  git(source, "config", "user.name", "Fixture");
  git(source, "config", "user.email", "fixture@example.invalid");
  const commit = (name) => {
    writeFileSync(join(source, "skills/personal/run-issue-workflow/version-marker.txt"), `${name}\n`);
    git(source, "add", ".");
    git(source, "commit", "-m", name);
    return git(source, "rev-parse", "HEAD");
  };
  const install = (sourceCommit) => installWorkflow({ sourceRepository: source, sourceCommit, cacheDirectory, skillDirectories });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, source, cacheDirectory, skillDirectories, commit, install };
};

const maintenanceScenario = (t) => {
  const item = fixture(t);
  const versions = [];
  for (let index = 1; index <= 4; index += 1) versions.push(item.install(item.commit(`fault-v${index}`)).version.id);
  mkdirSync(join(item.cacheDirectory, "qualification"));
  writeFileSync(join(item.cacheDirectory, "qualification", "retired.json"), "{}\n");
  const foreignTarget = join(item.root, "foreign-skill-copy");
  const foreignBackup = join(item.cacheDirectory, "backups", "foreign", "entry");
  mkdirSync(foreignTarget);
  mkdirSync(join(foreignBackup, ".."), { recursive: true });
  fs.symlinkSync(foreignTarget, foreignBackup, "dir");
  const optionalRunsRoot = join(item.root, "optional-runs");
  const terminalRun = join(optionalRunsRoot, "terminal");
  const activeRun = join(optionalRunsRoot, "active");
  mkdirSync(terminalRun, { recursive: true });
  mkdirSync(activeRun, { recursive: true });
  writeFileSync(join(terminalRun, "run.json"), `${JSON.stringify({ status: "completed" })}\n`);
  writeFileSync(join(activeRun, "run.json"), `${JSON.stringify({ status: "running" })}\n`);
  const preview = previewInstallationMaintenance({
    cacheDirectory: item.cacheDirectory,
    skillDirectories: item.skillDirectories,
    optionalRunsRoot,
  });
  return { ...item, versions, foreignBackup, foreignTarget, terminalRun, activeRun, preview };
};

const assertMaintenanceReadBack = (item) => {
  const catalog = JSON.parse(readFileSync(join(item.cacheDirectory, "installation.json"), "utf8"));
  assert.ok(catalog.versions.every(({ id }) => fs.existsSync(join(item.cacheDirectory, "versions", id))));
  assert.ok(item.skillDirectories.every((path) => fs.realpathSync(path).includes(catalog.current)));
  assert.equal(fs.realpathSync(item.foreignBackup), item.foreignTarget);
  assert.equal(fs.existsSync(item.terminalRun), false);
  assert.equal(fs.existsSync(item.activeRun), true);
  assert.equal(fs.existsSync(join(item.cacheDirectory, "maintenance", "pending.json")), false);
};

test("one installation transaction updates three discovery entries and rolls all of them back on failure", (t) => {
  const item = fixture(t);
  const first = item.install(item.commit("v1"));
  const firstTarget = join(first.root, "skills/personal/run-issue-workflow");
  assert.deepEqual(item.skillDirectories.map((path) => fs.realpathSync(path)), item.skillDirectories.map(() => firstTarget));
  for (const entry of item.skillDirectories) {
    assert.deepEqual(readdirSync(join(entry, "..")), ["run-issue-workflow"]);
  }

  const secondCommit = item.commit("v2");
  const originalSymlink = fs.symlinkSync;
  let replacementFailed = false;
  fs.symlinkSync = (...args) => {
    if (!replacementFailed && args[1] === item.skillDirectories[1] && String(args[0]).includes("/versions/")) {
      replacementFailed = true;
      throw new Error("second entry replacement failed");
    }
    return originalSymlink(...args);
  };
  syncBuiltinESMExports();
  try {
    assert.throws(() => item.install(secondCommit), /second entry replacement failed/u);
  } finally {
    fs.symlinkSync = originalSymlink;
    syncBuiltinESMExports();
  }
  assert.deepEqual(item.skillDirectories.map((path) => fs.realpathSync(path)), item.skillDirectories.map(() => firstTarget));
  assert.equal(readdirSync(join(item.root, ".agents", "skills")).some((name) => name.includes(".before-")), false);
  const pending = JSON.parse(readFileSync(join(item.cacheDirectory, "installation-pending.json"), "utf8"));
  assert.equal(pending.entries.length, 3);
  assert.ok(pending.entries.every(({ backup }) => backup === null || backup.startsWith(join(item.cacheDirectory, "backups"))));

  const recovered = item.install(secondCommit);
  assert.equal(recovered.recovered, true);
  assert.ok(item.skillDirectories.every((path) => fs.realpathSync(path) === join(recovered.root, "skills/personal/run-issue-workflow")));
});

test("maintenance preview keeps current, journal references and two rollback versions, then applies once", (t) => {
  const item = fixture(t);
  const versions = [];
  for (let index = 1; index <= 5; index += 1) versions.push(item.install(item.commit(`v${index}`)).version.id);
  const journalRoot = join(item.root, "journals");
  mkdirSync(journalRoot);
  writeFileSync(join(journalRoot, "run.jsonl"), `${JSON.stringify({ type: "grant.recorded", workflowVersion: { id: versions[0] } })}\n`);
  mkdirSync(join(item.cacheDirectory, "qualification"));
  writeFileSync(join(item.cacheDirectory, "qualification", "retired.json"), "{}\n");
  const foreignTarget = join(item.root, "foreign-skill-copy");
  const foreignBackup = join(item.cacheDirectory, "backups", "foreign", "entry");
  mkdirSync(foreignTarget);
  mkdirSync(join(foreignBackup, ".."), { recursive: true });
  fs.symlinkSync(foreignTarget, foreignBackup, "dir");
  const optionalRunsRoot = join(item.root, "optional-runs");
  const terminalRun = join(optionalRunsRoot, "terminal");
  mkdirSync(terminalRun, { recursive: true });
  writeFileSync(join(terminalRun, "run.json"), `${JSON.stringify({ status: "completed" })}\n`);

  const preview = previewInstallationMaintenance({
    cacheDirectory: item.cacheDirectory,
    skillDirectories: item.skillDirectories,
    journalRoots: [journalRoot],
    optionalRunsRoot: relative(process.cwd(), optionalRunsRoot),
  });
  assert.deepEqual(preview.keep.map(({ id }) => id).sort(), [versions[0], versions[2], versions[3], versions[4]].sort());
  assert.deepEqual(preview.removeVersions.map(({ id }) => id), [versions[1]]);
  assert.deepEqual(preview.preserveForeignBackupLinks, [{
    path: foreignBackup,
    target: foreignTarget,
    versionId: null,
    reason: "foreign or unrecognized backup target",
  }]);
  assert.equal(preview.optionalRunsRoot, resolve(optionalRunsRoot));
  assert.deepEqual(preview.removeOptionalRuns.map(({ id }) => id), ["terminal"]);
  assert.match(preview.previewId, /^sha256:[a-f0-9]{64}$/u);

  const receipt = applyInstallationMaintenance({ cacheDirectory: item.cacheDirectory, previewId: preview.previewId });
  assert.deepEqual(receipt.deletedVersionIds, [versions[1]]);
  assert.equal(receipt.retiredQualificationRemoved, true);
  assert.deepEqual(receipt.deletedOptionalRuns.map(({ id }) => id), ["terminal"]);
  assert.equal(fs.existsSync(terminalRun), false);
  assert.equal(fs.existsSync(join(item.cacheDirectory, "versions", versions[1])), false);
  assert.equal(fs.realpathSync(foreignBackup), foreignTarget);
  assert.ok(item.skillDirectories.every((path) => fs.realpathSync(path).includes(versions[4])));
  const repeated = applyInstallationMaintenance({ cacheDirectory: item.cacheDirectory, previewId: preview.previewId });
  assert.equal(repeated.reused, true);
});

test("maintenance recovers every durable transaction boundary before retrying the same preview", async (t) => {
  const probe = maintenanceScenario(t);
  const itemCount = probe.preview.removeBackupLinks.length + probe.preview.removeVersions.length
    + (probe.preview.observed.qualification ? 1 : 0) + probe.preview.removeOptionalRuns.length;
  const phases = [
    "after_pending_intent",
    ...Array.from({ length: itemCount }, (_, index) => `after_quarantine:${index + 1}`),
    "before_catalog_commit",
    "after_catalog_commit",
    "before_receipt",
    "after_receipt",
    "during_purge:1",
  ];

  for (const phase of phases) {
    await t.test(phase, (child) => {
      const item = maintenanceScenario(child);
      let injected = false;
      const invoke = () => applyInstallationMaintenance({
        cacheDirectory: item.cacheDirectory,
        previewId: item.preview.previewId,
        onPhase: (observed) => {
          if (!injected && observed === phase) {
            injected = true;
            throw new Error(`fault at ${phase}`);
          }
        },
      });
      if (phase.startsWith("during_purge:")) {
        const interrupted = invoke();
        assert.ok(interrupted.retainedQuarantine?.length > 0);
      } else {
        assert.throws(invoke, new RegExp(`fault at ${phase.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"));
      }
      assert.equal(injected, true);
      const receipt = applyInstallationMaintenance({
        cacheDirectory: item.cacheDirectory,
        previewId: item.preview.previewId,
      });
      assert.equal(receipt.previewId, item.preview.previewId);
      assertMaintenanceReadBack(item);
      const repeated = applyInstallationMaintenance({ cacheDirectory: item.cacheDirectory, previewId: item.preview.previewId });
      assert.equal(repeated.reused, true);
    });
  }
});

test("maintenance recovery preserves pending evidence when quarantine identity drifts", (t) => {
  const item = maintenanceScenario(t);
  assert.throws(() => applyInstallationMaintenance({
    cacheDirectory: item.cacheDirectory,
    previewId: item.preview.previewId,
    onPhase: (phase) => {
      if (phase === "after_quarantine:1") throw new Error("stop after first quarantine");
    },
  }), /stop after first quarantine/u);
  const pendingPath = join(item.cacheDirectory, "maintenance", "pending.json");
  const pending = JSON.parse(readFileSync(pendingPath, "utf8"));
  rmSync(pending.items[0].quarantine, { recursive: true, force: true });
  mkdirSync(pending.items[0].quarantine);
  assert.throws(() => applyInstallationMaintenance({
    cacheDirectory: item.cacheDirectory,
    previewId: item.preview.previewId,
  }), /differs|refuses non-link/u);
  assert.equal(fs.existsSync(pendingPath), true);
  assert.equal(fs.existsSync(pending.items[0].quarantine), true);
});

test("committed recovery refuses drift before publishing a receipt", (t) => {
  const item = maintenanceScenario(t);
  assert.throws(() => applyInstallationMaintenance({
    cacheDirectory: item.cacheDirectory,
    previewId: item.preview.previewId,
    onPhase: (phase) => {
      if (phase === "after_catalog_commit") throw new Error("stop after catalog commit");
    },
  }), /stop after catalog commit/u);

  const pendingPath = join(item.cacheDirectory, "maintenance", "pending.json");
  const pending = JSON.parse(readFileSync(pendingPath, "utf8"));
  rmSync(pending.items[0].quarantine, { recursive: true, force: true });
  mkdirSync(pending.items[0].quarantine);

  assert.throws(() => applyInstallationMaintenance({
    cacheDirectory: item.cacheDirectory,
    previewId: item.preview.previewId,
  }), /committed-state quarantine drift/u);
  assert.equal(fs.existsSync(pendingPath), true);
  assert.equal(fs.existsSync(pending.items[0].quarantine), true);
  assert.equal(fs.existsSync(join(item.cacheDirectory, "maintenance", "receipts", `${item.preview.previewId.slice("sha256:".length)}.json`)), false);
});

test("maintenance shares the installer lock and preview drift writes no transaction", (t) => {
  const item = maintenanceScenario(t);
  const lock = `${item.cacheDirectory}.install-lock`;
  mkdirSync(lock);
  assert.throws(() => applyInstallationMaintenance({
    cacheDirectory: item.cacheDirectory,
    previewId: item.preview.previewId,
  }), /Installation lock is preserved/u);
  rmSync(lock, { recursive: true });

  writeFileSync(join(item.terminalRun, "run.json"), `${JSON.stringify({ status: "running" })}\n`);
  assert.throws(() => applyInstallationMaintenance({
    cacheDirectory: item.cacheDirectory,
    previewId: item.preview.previewId,
  }), /preview drifted/u);
  assert.equal(fs.existsSync(join(item.cacheDirectory, "maintenance", "pending.json")), false);
  assert.equal(fs.existsSync(item.terminalRun), true);
});
