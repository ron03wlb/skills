import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const commit = (version) => {
    writeFileSync(join(sourceRepository, entry), `console.log(${JSON.stringify(version)});\n`);
    writeFileSync(join(sourceRepository, "skills/personal/run-issue-workflow/SKILL.md"), `---\nname: run-issue-workflow\ndescription: Run approved work.\n---\n${version}\n`);
    git("add", "skills");
    git("-c", "user.name=Workflow Test", "-c", "user.email=workflow@example.test", "commit", "-m", version);
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-b", "main");
    const first = installWorkflow({ sourceRepository, sourceCommit: commit("v1"), cacheDirectory, skillDirectory });
    assert.equal(execFileSync(process.execPath, [join(skillDirectory, "scripts/installed-entry.mjs")], { encoding: "utf8" }).trim(), "v1");
    const second = installWorkflow({ sourceRepository, sourceCommit: commit("v2"), cacheDirectory, skillDirectory });
    assert.notEqual(first.version.id, second.version.id);
    assert.equal(execFileSync(process.execPath, [join(skillDirectory, "scripts/installed-entry.mjs")], { encoding: "utf8" }).trim(), "v2");
    const resumed = selectWorkflowVersion({ cacheDirectory, recordedVersion: first.version });
    assert.equal(resumed.state, "AVAILABLE");
    assert.equal(execFileSync(process.execPath, [join(resumed.root, entry)], { encoding: "utf8" }).trim(), "v1");
    writeFileSync(join(resumed.root, entry), "console.log('tampered');\n");
    const unavailable = selectWorkflowVersion({ cacheDirectory, recordedVersion: first.version });
    assert.equal(unavailable.state, "UNAVAILABLE");
    assert.equal(unavailable.version.sourceCommit, first.version.sourceCommit);
    assert.match(unavailable.reason, /content/u);
    assert.match(readFileSync(join(resumed.root, entry), "utf8"), /tampered/u);
  } finally {
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
  } finally { rmSync(root, { recursive: true, force: true }); }
});
