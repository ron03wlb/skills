import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const script = resolve("skills/engineering/close-issue/scripts/preservation.mjs");

function createGitFixture(prefix) {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  const rawGit = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  const git = (...args) => rawGit(...args).trim();
  git("init", "-b", "target");
  git("config", "user.name", "Preservation Test");
  git("config", "user.email", "preservation@example.test");
  return { repo, git };
}

function createInspectionFixture(t, prefix) {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-transport-`));
  const { repo, git } = createGitFixture(`${prefix}-repo-`);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  return { root, repo, git };
}

function sameFilesystemEntry(left, right) {
  try {
    const leftStat = lstatSync(left, { bigint: true });
    const rightStat = lstatSync(right, { bigint: true });
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

function inspect(root, repo, input) {
  const inputPath = join(root, `input-${randomUUID()}.json`);
  const outputPath = join(root, `output-${randomUUID()}.json`);
  writeFileSync(inputPath, JSON.stringify(input), "utf8");
  const processResult = spawnSync(process.execPath, [script, "inspect", inputPath, outputPath], { encoding: "utf8" });
  return {
    processResult,
    output: existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : null,
    outputPath,
  };
}

test("inspection preserves canonical dirty and hook evidence across a safe fast-forward", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-safe");

  writeFileSync(join(repo, "tracked-local.txt"), "baseline\n", "utf8");
  git("add", "tracked-local.txt");
  git("commit", "-m", "baseline");
  const targetBefore = git("rev-parse", "HEAD");

  git("checkout", "-b", "candidate");
  writeFileSync(join(repo, "candidate.txt"), "candidate\n", "utf8");
  git("add", "candidate.txt");
  git("commit", "-m", "candidate");
  const integrationCandidate = git("rev-parse", "HEAD");
  git("checkout", "target");

  writeFileSync(join(repo, "tracked-local.txt"), "unstaged local edit\n", "utf8");
  writeFileSync(join(repo, "staged-local.txt"), "staged local edit\n", "utf8");
  git("add", "staged-local.txt");
  writeFileSync(join(repo, "未追蹤.txt"), "本機內容\n", "utf8");

  const baseInput = {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    targetBefore,
    integrationCandidate,
  };
  const before = inspect(root, repo, { ...baseInput, expectedTarget: targetBefore });
  assert.equal(before.processResult.status, 0, before.processResult.stderr);
  assert.equal(before.processResult.stdout, "");
  assert.equal(before.output.schema, "closeout-preservation-inspection:v1");
  assert.equal(before.output.status, "SAFE");
  assert.equal(before.output.reasonCode, "SAFE");
  assert.equal(before.output.observedTarget, targetBefore);
  assert.deepEqual(before.output.dirty.counts, { staged: 1, unstaged: 1, untracked: 1 });
  assert.deepEqual(before.output.collision, { present: false, count: 0 });

  writeFileSync(join(repo, "未追蹤.txt"), "已變更內容\n", "utf8");
  const contentChanged = inspect(root, repo, { ...baseInput, expectedTarget: targetBefore });
  assert.equal(contentChanged.processResult.status, 0, contentChanged.processResult.stderr);
  assert.notEqual(contentChanged.output.dirty.sha256, before.output.dirty.sha256);
  writeFileSync(join(repo, "未追蹤.txt"), "本機內容\n", "utf8");
  const restored = inspect(root, repo, { ...baseInput, expectedTarget: targetBefore });
  assert.deepEqual(restored.output.dirty, before.output.dirty);

  git("merge", "--ff-only", integrationCandidate);
  const after = inspect(root, repo, { ...baseInput, expectedTarget: integrationCandidate });
  assert.equal(after.processResult.status, 0, after.processResult.stderr);
  assert.equal(after.output.observedTarget, integrationCandidate);
  assert.deepEqual(after.output.dirty, before.output.dirty);
  assert.deepEqual(after.output.hook, before.output.hook);
  assert.doesNotMatch(JSON.stringify(after.output), /Issue|executionState|candidate|phase|rawPath|fileContent/u);
});

test("inspection classifies dirty/candidate rename and case-insensitive path-prefix collisions without publishing paths", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-collision");

  writeFileSync(join(repo, "old.txt"), "baseline\n", "utf8");
  writeFileSync(join(repo, "local-old.txt"), "local baseline\n", "utf8");
  git("add", "old.txt", "local-old.txt");
  git("commit", "-m", "baseline");
  const targetBefore = git("rev-parse", "HEAD");
  git("checkout", "-b", "candidate");
  git("mv", "old.txt", "renamed.txt");
  writeFileSync(join(repo, "local-old.txt"), "candidate edits dirty rename source\n", "utf8");
  writeFileSync(join(repo, "Config"), "candidate path\n", "utf8");
  git("add", ".");
  git("commit", "-m", "rename candidate");
  const integrationCandidate = git("rev-parse", "HEAD");
  git("checkout", "target");
  git("config", "core.ignorecase", "true");

  writeFileSync(join(repo, "old.txt"), "dirty rename source\n", "utf8");
  writeFileSync(join(repo, "renamed.txt"), "dirty rename destination\n", "utf8");
  git("mv", "local-old.txt", "local-new.txt");
  mkdirSync(join(repo, "config"));
  writeFileSync(join(repo, "config", "local.txt"), "dirty descendant\n", "utf8");

  const result = inspect(root, repo, {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: targetBefore,
    targetBefore,
    integrationCandidate,
  });
  assert.equal(result.processResult.status, 3, result.processResult.stderr);
  assert.equal(result.processResult.stdout, "");
  assert.equal(result.output.status, "COLLISION");
  assert.equal(result.output.reasonCode, "DIRTY_CANDIDATE_PATH_COLLISION");
  assert.equal(result.output.collision.present, true);
  assert.equal(result.output.collision.count >= 4, true);
  assert.doesNotMatch(JSON.stringify(result.output), /old\.txt|renamed\.txt|config|local\.txt/iu);
});

test("inspection returns classified identity and hook evidence without authorizing continuation", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-blocked");

  writeFileSync(join(repo, "base.txt"), "base\n", "utf8");
  git("add", "base.txt");
  git("commit", "-m", "baseline");
  const targetBefore = git("rev-parse", "HEAD");
  git("checkout", "-b", "candidate");
  writeFileSync(join(repo, "candidate.txt"), "candidate\n", "utf8");
  git("add", "candidate.txt");
  git("commit", "-m", "candidate");
  const integrationCandidate = git("rev-parse", "HEAD");
  git("checkout", "target");

  const hookPath = resolve(repo, git("rev-parse", "--git-path", "hooks/post-merge"));
  mkdirSync(dirname(hookPath), { recursive: true });
  writeFileSync(hookPath, "#!/bin/sh\necho first\n", "utf8");
  const input = {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: integrationCandidate,
    targetBefore,
    integrationCandidate,
  };
  const blocked = inspect(root, repo, input);
  assert.equal(blocked.processResult.status, 4, blocked.processResult.stderr);
  assert.equal(blocked.output.status, "BLOCKED");
  assert.equal(blocked.output.reasonCode, "TARGET_IDENTITY_MISMATCH");
  assert.equal(blocked.output.hook.present, true);
  const firstHook = blocked.output.hook.fingerprintSha256;

  writeFileSync(hookPath, "#!/bin/sh\necho second\n", "utf8");
  const changed = inspect(root, repo, input);
  assert.equal(changed.processResult.status, 4, changed.processResult.stderr);
  assert.notEqual(changed.output.hook.fingerprintSha256, firstHook);
});

test("inspection includes unmerged paths in a classified blocked result", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-unmerged");

  writeFileSync(join(repo, "base.txt"), "base\n", "utf8");
  git("add", "base.txt");
  git("commit", "-m", "baseline");
  git("checkout", "-b", "other");
  writeFileSync(join(repo, "base.txt"), "other\n", "utf8");
  git("add", "base.txt");
  git("commit", "-m", "other");
  git("checkout", "target");
  writeFileSync(join(repo, "base.txt"), "target\n", "utf8");
  git("add", "base.txt");
  git("commit", "-m", "target");
  const target = git("rev-parse", "HEAD");
  assert.throws(() => git("merge", "other"));

  const result = inspect(root, repo, {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: target,
    targetBefore: target,
    integrationCandidate: target,
  });
  assert.equal(result.processResult.status, 4, result.processResult.stderr);
  assert.equal(result.output.status, "BLOCKED");
  assert.equal(result.output.reasonCode, "UNMERGED_TARGET_STATE");
  assert.deepEqual(result.output.dirty.counts, { staged: 1, unstaged: 1, untracked: 0 });
});

test("file transport rejects stale output and does not publish incomplete evidence", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-transport");
  writeFileSync(join(repo, "base.txt"), "base\n", "utf8");
  git("add", "base.txt");
  git("commit", "-m", "baseline");
  const baseline = git("rev-parse", "HEAD");
  const validInput = {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: baseline,
    targetBefore: baseline,
    integrationCandidate: baseline,
  };
  const inputPath = join(root, "input.json");
  const staleOutput = join(root, "stale.json");
  writeFileSync(inputPath, JSON.stringify(validInput), "utf8");
  writeFileSync(staleOutput, "stale evidence\n", "utf8");

  const stale = spawnSync(process.execPath, [script, "inspect", inputPath, staleOutput], { encoding: "utf8" });
  assert.equal(stale.status, 2);
  assert.equal(readFileSync(staleOutput, "utf8"), "stale evidence\n");
  assert.match(stale.stderr, /must not already exist/u);

  const missingParentOutput = join(root, "missing", "output.json");
  const incomplete = spawnSync(process.execPath, [script, "inspect", inputPath, missingParentOutput], { encoding: "utf8" });
  assert.equal(incomplete.status, 2);
  assert.equal(existsSync(missingParentOutput), false);
  assert.equal(readdirSync(root).some((name) => name.includes(".tmp-")), false);

  const interruptedOutput = join(root, "interrupted-output.json");
  const preloadPath = join(root, "interrupt-publication.cjs");
  writeFileSync(preloadPath, `
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const originalLinkSync = fs.linkSync;
fs.linkSync = function (source, destination) {
  if (destination === process.env.PRESERVATION_INTERRUPT_OUTPUT) throw new Error("simulated publication interruption");
  return originalLinkSync.apply(this, arguments);
};
syncBuiltinESMExports();
`, "utf8");
  const interrupted = spawnSync(process.execPath, [script, "inspect", inputPath, interruptedOutput], {
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: `--require=${preloadPath.replaceAll("\\", "/")}`,
      PRESERVATION_INTERRUPT_OUTPUT: interruptedOutput,
    },
  });
  assert.equal(interrupted.status, 2);
  assert.match(interrupted.stderr, /simulated publication interruption/u);
  assert.equal(existsSync(interruptedOutput), false);
  assert.equal(readdirSync(root).some((name) => name.startsWith("interrupted-output.json.tmp-")), false);

  const competingOutput = join(root, "competing-output.json");
  const competingPreloadPath = join(root, "competing-publication.cjs");
  writeFileSync(competingPreloadPath, `
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const originalLinkSync = fs.linkSync;
fs.linkSync = function (source, destination) {
  if (destination === process.env.PRESERVATION_COMPETING_OUTPUT) fs.writeFileSync(destination, "competing evidence\\n", "utf8");
  return originalLinkSync.apply(this, arguments);
};
syncBuiltinESMExports();
`, "utf8");
  const competing = spawnSync(process.execPath, [script, "inspect", inputPath, competingOutput], {
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: `--require=${competingPreloadPath.replaceAll("\\", "/")}`,
      PRESERVATION_COMPETING_OUTPUT: competingOutput,
    },
  });
  assert.equal(competing.status, 2);
  assert.equal(readFileSync(competingOutput, "utf8"), "competing evidence\n");
  assert.equal(readdirSync(root).some((name) => name.startsWith("competing-output.json.tmp-")), false);

  const bomInput = join(root, "bom-input.json");
  const bomOutput = join(root, "bom-output.json");
  writeFileSync(bomInput, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(validInput), "utf8")]));
  const bom = spawnSync(process.execPath, [script, "inspect", bomInput, bomOutput], { encoding: "utf8" });
  assert.equal(bom.status, 2);
  assert.match(bom.stderr, /without BOM/u);
  assert.equal(existsSync(bomOutput), false);
});

test("inspection rejects a preservation snapshot that changes while it is being observed", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-drift");
  writeFileSync(join(repo, "tracked.txt"), "baseline\n", "utf8");
  git("add", "tracked.txt");
  git("commit", "-m", "baseline");
  const baseline = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "tracked.txt"), "first local state\n", "utf8");

  const inputPath = join(root, "input.json");
  const outputPath = join(root, "output.json");
  const preloadPath = join(root, "mutate-between-snapshots.cjs");
  writeFileSync(inputPath, JSON.stringify({
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: baseline,
    targetBefore: baseline,
    integrationCandidate: baseline,
  }), "utf8");
  writeFileSync(preloadPath, `
const childProcess = require("node:child_process");
const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");
const originalExecFileSync = childProcess.execFileSync;
let changed = false;
childProcess.execFileSync = function (file, args) {
  const result = originalExecFileSync.apply(this, arguments);
  if (!changed && file === "git" && args.includes("--git-path") && args.includes("hooks/post-merge")) {
    changed = true;
    fs.writeFileSync(process.env.PRESERVATION_MUTATE_PATH, "second local state\\n", "utf8");
  }
  return result;
};
syncBuiltinESMExports();
`, "utf8");

  const result = spawnSync(process.execPath, [script, "inspect", inputPath, outputPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_OPTIONS: `--require=${preloadPath.replaceAll("\\", "/")}`,
      PRESERVATION_MUTATE_PATH: join(repo, "tracked.txt"),
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /changed during inspection/u);
  assert.equal(existsSync(outputPath), false);
});

test("inspection combines filesystem and repository case semantics", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-filesystem-case");
  if (!sameFilesystemEntry(join(repo, ".git"), join(repo, ".GIT"))) {
    t.skip("fixture filesystem is case-sensitive");
    return;
  }

  git("commit", "--allow-empty", "-m", "baseline");
  const targetBefore = git("rev-parse", "HEAD");
  git("checkout", "-b", "candidate");
  writeFileSync(join(repo, "Config"), "candidate\n", "utf8");
  git("add", "Config");
  git("commit", "-m", "candidate");
  const integrationCandidate = git("rev-parse", "HEAD");
  git("checkout", "target");
  git("config", "core.ignorecase", "false");
  mkdirSync(join(repo, "config"));
  writeFileSync(join(repo, "config", "local.txt"), "local\n", "utf8");

  const result = inspect(root, repo, {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: targetBefore,
    targetBefore,
    integrationCandidate,
  });
  assert.equal(result.processResult.status, 3, result.processResult.stderr);
  assert.equal(result.output.reasonCode, "DIRTY_CANDIDATE_PATH_COLLISION");
});

test("inspection fingerprints dirty submodule worktree content", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-submodule");
  const { repo: submodule, git: subGit } = createGitFixture("close-preservation-nested-repo-");
  t.after(() => rmSync(submodule, { recursive: true, force: true }));
  writeFileSync(join(submodule, "nested.txt"), "nested baseline\n", "utf8");
  subGit("add", "nested.txt");
  subGit("commit", "-m", "nested baseline");

  git("-c", "protocol.file.allow=always", "submodule", "add", submodule, "nested");
  git("commit", "-m", "baseline");
  const targetBefore = git("rev-parse", "HEAD");
  git("checkout", "-b", "candidate");
  writeFileSync(join(repo, "candidate.txt"), "candidate\n", "utf8");
  git("add", "candidate.txt");
  git("commit", "-m", "candidate");
  const integrationCandidate = git("rev-parse", "HEAD");
  git("checkout", "target");
  git("config", "submodule.nested.ignore", "all");

  const input = {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: targetBefore,
    targetBefore,
    integrationCandidate,
  };
  writeFileSync(join(repo, "nested", "nested.txt"), "first nested edit\n", "utf8");
  const first = inspect(root, repo, input);
  assert.equal(first.processResult.status, 0, first.processResult.stderr);
  assert.deepEqual(first.output.dirty.counts, { staged: 0, unstaged: 1, untracked: 0 });
  writeFileSync(join(repo, "nested", "nested.txt"), "second nested edit\n", "utf8");
  const second = inspect(root, repo, input);
  assert.equal(second.processResult.status, 0, second.processResult.stderr);
  assert.notEqual(second.output.dirty.sha256, first.output.dirty.sha256);
});

test("inspection fingerprints dangling symlink targets when the filesystem supports them", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-symlink");
  git("commit", "--allow-empty", "-m", "baseline");
  const baseline = git("rev-parse", "HEAD");
  const linkPath = join(repo, "local-link");
  try {
    symlinkSync("missing-first", linkPath, "file");
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      t.skip("fixture filesystem does not permit symlinks");
      return;
    }
    throw error;
  }
  const input = {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: baseline,
    targetBefore: baseline,
    integrationCandidate: baseline,
  };
  const first = inspect(root, repo, input);
  assert.equal(first.processResult.status, 0, first.processResult.stderr);
  unlinkSync(linkPath);
  symlinkSync("missing-second", linkPath, "file");
  const second = inspect(root, repo, input);
  assert.equal(second.processResult.status, 0, second.processResult.stderr);
  assert.notEqual(second.output.dirty.sha256, first.output.dirty.sha256);
});

test("inspection rejects a dangling symlink as a pre-existing final output", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-dangling-output");
  git("commit", "--allow-empty", "-m", "baseline");
  const baseline = git("rev-parse", "HEAD");
  const inputPath = join(root, "input.json");
  const outputPath = join(root, "output.json");
  writeFileSync(inputPath, JSON.stringify({
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: baseline,
    targetBefore: baseline,
    integrationCandidate: baseline,
  }), "utf8");
  try {
    symlinkSync("missing-output-target", outputPath, "file");
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      t.skip("fixture filesystem does not permit symlinks");
      return;
    }
    throw error;
  }

  const result = spawnSync(process.execPath, [script, "inspect", inputPath, outputPath], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /must not already exist/u);
  assert.equal(lstatSync(outputPath).isSymbolicLink(), true);
});

test("inspection keeps POSIX backslashes as filename characters", (t) => {
  if (process.platform === "win32") {
    t.skip("Windows does not permit backslashes in filenames");
    return;
  }
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-backslash");
  git("commit", "--allow-empty", "-m", "baseline");
  const targetBefore = git("rev-parse", "HEAD");
  git("checkout", "-b", "candidate");
  mkdirSync(join(repo, "a"));
  writeFileSync(join(repo, "a", "b"), "candidate\n", "utf8");
  git("add", "a/b");
  git("commit", "-m", "candidate");
  const integrationCandidate = git("rev-parse", "HEAD");
  git("checkout", "target");
  const dirtyPath = join(repo, "a\\b");
  writeFileSync(dirtyPath, "first local state\n", "utf8");
  const input = {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: targetBefore,
    targetBefore,
    integrationCandidate,
  };
  const first = inspect(root, repo, input);
  assert.equal(first.processResult.status, 0, first.processResult.stderr);
  assert.equal(first.output.collision.present, false);
  writeFileSync(dirtyPath, "second local state\n", "utf8");
  const second = inspect(root, repo, input);
  assert.notEqual(second.output.dirty.sha256, first.output.dirty.sha256);
});

test("inspection fingerprints equal-content hook symlink retargeting when supported", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-hook-symlink");
  git("commit", "--allow-empty", "-m", "baseline");
  const baseline = git("rev-parse", "HEAD");
  const hookPath = resolve(repo, git("rev-parse", "--git-path", "hooks/post-merge"));
  const firstTarget = join(dirname(hookPath), "post-merge-first");
  const secondTarget = join(dirname(hookPath), "post-merge-second");
  writeFileSync(firstTarget, "same hook content\n", "utf8");
  writeFileSync(secondTarget, "same hook content\n", "utf8");
  try {
    symlinkSync(firstTarget, hookPath, "file");
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      t.skip("fixture filesystem does not permit symlinks");
      return;
    }
    throw error;
  }
  const input = {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: baseline,
    targetBefore: baseline,
    integrationCandidate: baseline,
  };
  const first = inspect(root, repo, input);
  unlinkSync(hookPath);
  symlinkSync(secondTarget, hookPath, "file");
  const second = inspect(root, repo, input);
  assert.notEqual(second.output.hook.fingerprintSha256, first.output.hook.fingerprintSha256);
});

test("inspection disables configured fsmonitor side effects", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-fsmonitor");
  writeFileSync(join(repo, "tracked.txt"), "baseline\n", "utf8");
  git("add", "tracked.txt");
  git("commit", "-m", "baseline");
  const baseline = git("rev-parse", "HEAD");
  const marker = join(root, "fsmonitor-invoked");
  const hookPath = join(root, "fsmonitor-hook");
  writeFileSync(hookPath, `#!/bin/sh\nprintf invoked > '${marker.replaceAll("'", "'\\''").replaceAll("\\", "/")}'\nprintf 'token\\0'\n`, "utf8");
  chmodSync(hookPath, 0o755);
  git("config", "core.fsmonitor", hookPath.replaceAll("\\", "/"));

  const result = inspect(root, repo, {
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: baseline,
    targetBefore: baseline,
    integrationCandidate: baseline,
  });
  assert.equal(result.processResult.status, 0, result.processResult.stderr);
  assert.equal(existsSync(marker), false);
});

test("inspection does not classify a Git ancestry command failure", (t) => {
  const { root, repo, git } = createInspectionFixture(t, "close-preservation-ancestry-error");
  git("commit", "--allow-empty", "-m", "baseline");
  const baseline = git("rev-parse", "HEAD");
  const inputPath = join(root, "input.json");
  const outputPath = join(root, "output.json");
  const preloadPath = join(root, "fail-ancestry.cjs");
  writeFileSync(inputPath, JSON.stringify({
    schema: "closeout-preservation-inspection-input:v1",
    worktree: repo,
    expectedTarget: baseline,
    targetBefore: baseline,
    integrationCandidate: baseline,
  }), "utf8");
  writeFileSync(preloadPath, `
const childProcess = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
const originalExecFileSync = childProcess.execFileSync;
childProcess.execFileSync = function (file, args) {
  if (file === "git" && args.includes("merge-base")) {
    const error = new Error("simulated ancestry command failure");
    error.status = 128;
    throw error;
  }
  return originalExecFileSync.apply(this, arguments);
};
syncBuiltinESMExports();
`, "utf8");
  const result = spawnSync(process.execPath, [script, "inspect", inputPath, outputPath], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: `--require=${preloadPath.replaceAll("\\", "/")}` },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /simulated ancestry command failure/u);
  assert.equal(existsSync(outputPath), false);
});
