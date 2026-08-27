import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  const root = mkdtempSync(join(tmpdir(), "close-preservation-safe-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { repo, git } = createGitFixture("close-preservation-repo-");
  t.after(() => rmSync(repo, { recursive: true, force: true }));

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
  const root = mkdtempSync(join(tmpdir(), "close-preservation-collision-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { repo, git } = createGitFixture("close-preservation-repo-");
  t.after(() => rmSync(repo, { recursive: true, force: true }));

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
  const root = mkdtempSync(join(tmpdir(), "close-preservation-blocked-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { repo, git } = createGitFixture("close-preservation-repo-");
  t.after(() => rmSync(repo, { recursive: true, force: true }));

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
  const root = mkdtempSync(join(tmpdir(), "close-preservation-unmerged-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { repo, git } = createGitFixture("close-preservation-repo-");
  t.after(() => rmSync(repo, { recursive: true, force: true }));

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
  const root = mkdtempSync(join(tmpdir(), "close-preservation-transport-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { repo, git } = createGitFixture("close-preservation-repo-");
  t.after(() => rmSync(repo, { recursive: true, force: true }));
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

  const bomInput = join(root, "bom-input.json");
  const bomOutput = join(root, "bom-output.json");
  writeFileSync(bomInput, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(validInput), "utf8")]));
  const bom = spawnSync(process.execPath, [script, "inspect", bomInput, bomOutput], { encoding: "utf8" });
  assert.equal(bom.status, 2);
  assert.match(bom.stderr, /without BOM/u);
  assert.equal(existsSync(bomOutput), false);
});
