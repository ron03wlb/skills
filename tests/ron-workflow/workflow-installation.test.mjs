import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs, { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { installWorkflow, selectWorkflowVersion } from "../../skills/personal/run-issue-workflow/scripts/workflow-installation.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

test("Run renewal preserves its journaled workflow version across coordinator re-entry", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-version-run-"));
  execFileSync("git", ["init", "-b", "main", root], { stdio: "ignore" });
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const runIdentity = { runId: "version-run", specId: "17", approvedScopeHash: "approved",
    target: "main", classification: "SINGLE", decompositionIdentity: null };
  const workflowVersion = { id: "a".repeat(64), sourceCommit: "b".repeat(40),
    sourceRepository: "/trusted/skills", protocolVersion: 1 };
  const event = { type: "grant.recorded", at: "2026-09-06T04:00:00.000Z", runIdentity, workflowVersion };
  let writer = store.acquireWriter(runIdentity.runId);
  try {
    writer.append(event);
    writer.release();
    writer = store.acquireWriter(runIdentity.runId);
    assert.throws(() => writer.append({ ...event, workflowVersion: { ...workflowVersion, id: "c".repeat(64) } }), /preserve.*workflow version/u);
    writer.append(event);
    assert.equal(store.readEvents(runIdentity.runId).length, 2);
    assert.deepEqual(store.readEvents(runIdentity.runId)[1].workflowVersion, workflowVersion);
  } finally {
    writer.release();
    rmSync(root, { recursive: true, force: true });
  }
});

test("an installed entry update preserves a running workflow's exact executable version", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-install-"));
  const sourceRepository = join(root, "source");
  const cacheDirectory = join(root, "packages");
  const skillDirectory = join(root, "skills", "run-issue-workflow");
  const entry = "skills/personal/run-issue-workflow/scripts/installed-entry.mjs";
  mkdirSync(join(sourceRepository, "skills/personal/run-issue-workflow/scripts"), { recursive: true });
  const git = (...args) => execFileSync("git", ["-C", sourceRepository, ...args], { encoding: "utf8" }).trim();
  mkdirSync(join(sourceRepository, "docs/agents"), { recursive: true });
  writeFileSync(join(sourceRepository, "docs/agents/run-preparation.md"), "Shared planning preparation contract\n");
  const maintenanceReference = "docs/agents/references/approved-pre-run-workflow-maintenance.md";
  mkdirSync(join(sourceRepository, "docs/agents/references"));
  writeFileSync(join(sourceRepository, maintenanceReference), "Approved maintenance owner\n");
  const commit = (version) => {
    writeFileSync(join(sourceRepository, entry), `console.log(${JSON.stringify(version)});\n`);
    writeFileSync(join(sourceRepository, "skills/personal/run-issue-workflow/SKILL.md"), `---\nname: run-issue-workflow\ndescription: Run approved work.\n---\n${version}\n`);
    git("add", "skills", "docs/agents/run-preparation.md", maintenanceReference);
    git("-c", "user.name=Workflow Test", "-c", "user.email=workflow@example.test", "commit", "-m", version);
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-b", "main");
    const first = installWorkflow({ sourceRepository, sourceCommit: commit("v1"), cacheDirectory, skillDirectory });
    assert.equal(readFileSync(join(first.root, maintenanceReference), "utf8"), "Approved maintenance owner\n");
    assert.equal(execFileSync(process.execPath, [join(skillDirectory, "scripts/installed-entry.mjs")], { encoding: "utf8" }).trim(), "v1");
    const secondCommit = commit("v2");
    const originalSymlink = fs.symlinkSync;
    let failed = false;
    fs.symlinkSync = (...args) => {
      if (!failed && args[1] === skillDirectory) { failed = true; throw new Error("Simulated new-entry failure"); }
      return originalSymlink(...args);
    };
    syncBuiltinESMExports();
    try {
      assert.throws(() => installWorkflow({ sourceRepository, sourceCommit: secondCommit, cacheDirectory, skillDirectory }), (error) => {
        assert.equal(error.recovery.restoredPreviousEntry, true);
        assert.equal(JSON.parse(readFileSync(error.recovery.recoveryPath)).previousTarget, join(first.root, "skills/personal/run-issue-workflow"));
        return /Simulated new-entry failure.*installation recovery/u.test(error.message);
      });
    } finally { fs.symlinkSync = originalSymlink; syncBuiltinESMExports(); }
    assert.equal(execFileSync(process.execPath, [join(skillDirectory, "scripts/installed-entry.mjs")], { encoding: "utf8" }).trim(), "v1");
    assert.equal(selectWorkflowVersion({ cacheDirectory }).state, "UNAVAILABLE");
    assert.equal(selectWorkflowVersion({ cacheDirectory, recordedVersion: first.version }).state, "AVAILABLE");
    // An intervening unknown entry must survive the same-command recovery attempt.
    fs.unlinkSync(skillDirectory); fs.symlinkSync(sourceRepository, skillDirectory, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => installWorkflow({ sourceRepository, sourceCommit: secondCommit, cacheDirectory, skillDirectory }), /public link.*now points/u);
    assert.equal(fs.readlinkSync(skillDirectory), sourceRepository);
    fs.unlinkSync(skillDirectory); fs.symlinkSync(join(first.root, "skills/personal/run-issue-workflow"), skillDirectory, process.platform === "win32" ? "junction" : "dir");
    const second = installWorkflow({ sourceRepository, sourceCommit: secondCommit, cacheDirectory, skillDirectory });
    assert.equal(second.recovered, true);
    assert.equal(readFileSync(join(second.root, "docs/agents/run-preparation.md"), "utf8"), "Shared planning preparation contract\n");
    assert.equal(fs.existsSync(join(cacheDirectory, "installation-pending.json")), false);
    assert.notEqual(first.version.id, second.version.id);
    assert.equal(execFileSync(process.execPath, [join(skillDirectory, "scripts/installed-entry.mjs")], { encoding: "utf8" }).trim(), "v2");
    const backups = fs.readdirSync(join(root, "skills")).sort();
    const repeated = installWorkflow({ sourceRepository, sourceCommit: secondCommit, cacheDirectory, skillDirectory });
    assert.equal(repeated.reused, true);
    assert.equal(repeated.version.id, second.version.id);
    assert.deepEqual(fs.readdirSync(join(root, "skills")).sort(), backups);
    const scripts = join(second.root, "skills/personal/run-issue-workflow/scripts");
    const outside = join(root, "outside-scripts");
    fs.cpSync(scripts, outside, { recursive: true });
    fs.renameSync(scripts, scripts + ".preserved");
    fs.symlinkSync(outside, scripts, process.platform === "win32" ? "junction" : "dir");
    assert.equal(selectWorkflowVersion({ cacheDirectory }).state, "UNAVAILABLE", "unchanged bytes outside the package remain rejected");
    fs.unlinkSync(scripts); fs.renameSync(scripts + ".preserved", scripts);
    const resumed = selectWorkflowVersion({ cacheDirectory, recordedVersion: first.version });
    assert.equal(resumed.state, "AVAILABLE");
    assert.equal(execFileSync(process.execPath, [join(resumed.root, entry)], { encoding: "utf8" }).trim(), "v1");
    writeFileSync(join(resumed.root, entry), "console.log('tampered');\n");
    const unavailable = selectWorkflowVersion({ cacheDirectory, recordedVersion: first.version });
    assert.equal(unavailable.state, "UNAVAILABLE");
    assert.equal(unavailable.version.sourceCommit, first.version.sourceCommit);
    assert.match(unavailable.reason, /content/u);
    assert.match(readFileSync(join(resumed.root, entry), "utf8"), /tampered/u);
    writeFileSync(join(second.root, "docs/agents/run-preparation.md"), "tampered shared authority\n");
    assert.equal(selectWorkflowVersion({ cacheDirectory, recordedVersion: second.version }).state, "UNAVAILABLE");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the exact install command recovers repeated interruptions before the catalog or backup exists", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-install-recovery-"));
  const sourceRepository = join(root, "source");
  const entry = "skills/personal/run-issue-workflow/scripts/installed-entry.mjs";
  mkdirSync(join(sourceRepository, "skills/personal/run-issue-workflow/scripts"), { recursive: true });
  const git = (...args) => execFileSync("git", ["-C", sourceRepository, ...args], { encoding: "utf8" }).trim();
  const originalRename = fs.renameSync;
  const originalSymlink = fs.symlinkSync;
  const originalWrite = fs.writeFileSync;
  try {
    git("init", "-b", "main");
    writeFileSync(join(sourceRepository, entry), "console.log('installed');\n");
    writeFileSync(join(sourceRepository, "skills/personal/run-issue-workflow/SKILL.md"), "Workflow entry\n");
    git("add", "skills");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "entry");
    const sourceCommit = git("rev-parse", "HEAD");
    const earlyOptions = { sourceRepository, sourceCommit, cacheDirectory: join(root, "early-cache"), skillDirectory: join(root, "early-entry") };
    fs.writeFileSync = (path, ...args) => {
      if (path.startsWith(join(earlyOptions.cacheDirectory, "installation-pending."))) {
        originalWrite(path, "{partial");
        throw new Error("Interrupted before durable intent");
      }
      return originalWrite(path, ...args);
    };
    syncBuiltinESMExports();
    assert.throws(() => installWorkflow(earlyOptions), /Interrupted before durable intent/u);
    assert.deepEqual(fs.readdirSync(earlyOptions.cacheDirectory), []);
    fs.writeFileSync = originalWrite; syncBuiltinESMExports();
    installWorkflow(earlyOptions);
    assert.equal(selectWorkflowVersion({ cacheDirectory: earlyOptions.cacheDirectory }).state, "AVAILABLE");
    const killedOptions = { sourceRepository, sourceCommit, cacheDirectory: join(root, "killed-cache"), skillDirectory: join(root, "killed-entry") };
    const installerUrl = new URL("../../skills/personal/run-issue-workflow/scripts/workflow-installation.mjs", import.meta.url).href;
    const killedScript = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { installWorkflow } from ${JSON.stringify(installerUrl)};
      const originalLink = fs.linkSync;
      fs.linkSync = (...args) => { originalLink(...args); process.kill(process.pid, 'SIGKILL'); };
      syncBuiltinESMExports();
      installWorkflow(${JSON.stringify(killedOptions)});
    `;
    assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e", killedScript], { stdio: "ignore" }), (error) => process.platform === "win32" ? error.status === 1 : error.signal === "SIGKILL");
    const killedLock = `${killedOptions.cacheDirectory}.install-lock`;
    const killedPending = readFileSync(join(killedOptions.cacheDirectory, "installation-pending.json"), "utf8");
    assert.throws(() => installWorkflow(killedOptions), (error) => error.message.includes(killedLock) && /Prove no active installer.*preserve and move.*same exact install/u.test(error.message));
    assert.equal(readFileSync(join(killedOptions.cacheDirectory, "installation-pending.json"), "utf8"), killedPending);
    assert.equal(fs.existsSync(killedOptions.skillDirectory), false);
    // The child is reaped: apply the explicitly named operator repair, preserving its lock.
    fs.renameSync(killedLock, `${killedLock}.preserved`);
    assert.equal(installWorkflow(killedOptions).recovered, true);
    assert.equal(selectWorkflowVersion({ cacheDirectory: killedOptions.cacheDirectory }).state, "AVAILABLE");
    for (const previousEntry of [false, true]) {
      const cacheDirectory = join(root, `cache-${previousEntry}`);
      const skillDirectory = join(root, `entry-${previousEntry}`);
      if (previousEntry) fs.symlinkSync(sourceRepository, skillDirectory, process.platform === "win32" ? "junction" : "dir");
      const options = { sourceRepository, sourceCommit, cacheDirectory, skillDirectory, replaceLinkTarget: sourceRepository };
      fs.renameSync = (from, to) => {
        if (previousEntry ? from === skillDirectory : to === join(cacheDirectory, "installation.json")) throw new Error("Interrupted initial installation");
        return originalRename(from, to);
      };
      syncBuiltinESMExports();
      assert.throws(() => installWorkflow(options), /Interrupted initial installation/u);
      fs.renameSync = originalRename;
      fs.symlinkSync = (...args) => {
        if (args[1] === skillDirectory) throw new Error("Interrupted recovery");
        return originalSymlink(...args);
      };
      syncBuiltinESMExports();
      assert.throws(() => installWorkflow(options), /Interrupted recovery/u);
      fs.symlinkSync = originalSymlink; syncBuiltinESMExports();
      const recovered = installWorkflow(options);
      assert.equal(recovered.recovered, true);
      assert.equal(selectWorkflowVersion({ cacheDirectory }).state, "AVAILABLE");
      assert.equal(execFileSync(process.execPath, [join(skillDirectory, "scripts/installed-entry.mjs")], { encoding: "utf8" }).trim(), "installed");
      if (previousEntry) assert.equal(fs.readlinkSync(recovered.backup), sourceRepository);
      assert.equal(fs.existsSync(join(cacheDirectory, "installation-pending.json")), false);
    }
  } finally {
    fs.renameSync = originalRename; fs.symlinkSync = originalSymlink; fs.writeFileSync = originalWrite; syncBuiltinESMExports();
    rmSync(root, { recursive: true, force: true });
  }
});

test("installation preserves an unknown local skill before touching its contents", () => {
  const root = mkdtempSync(join(tmpdir(), "unknown-install-"));
  try {
    execFileSync("git", ["init", root], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "baseline"], { stdio: "ignore" });
    const sourceCommit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const skillDirectory = join(root, "unknown-skill");
    mkdirSync(skillDirectory); writeFileSync(join(skillDirectory, "SKILL.md"), "user-owned\n");
    assert.throws(() => installWorkflow({ sourceRepository: root, sourceCommit, cacheDirectory: join(root, "cache"), skillDirectory }), /Unknown installed skill/u);
    assert.equal(readFileSync(join(skillDirectory, "SKILL.md"), "utf8"), "user-owned\n");
    const cacheDirectory = join(root, "bad-catalog"); mkdirSync(cacheDirectory);
    writeFileSync(join(cacheDirectory, "installation.json"), JSON.stringify({ schema: "codex-workflow-installation:v1", current: "../../outside", versions: [{ id: "../../outside", sourceCommit, sourceRepository: root, protocolVersion: 1 }] }));
    assert.throws(() => installWorkflow({ sourceRepository: root, sourceCommit, cacheDirectory, skillDirectory }), /version/u);
    assert.equal(readFileSync(join(skillDirectory, "SKILL.md"), "utf8"), "user-owned\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
