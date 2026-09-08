import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { acquireCloseIssueLeases } from "../../skills/engineering/close-issue/scripts/close-lease.mjs";
import { mergeCandidate, verifyIntegratedCandidate } from "../../skills/engineering/close-issue/scripts/merge-candidate.mjs";
import { deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

test("merged integration failure survives direct re-entry and blocks cleanup until the exact changed combination passes", async () => {
  const root = mkdtempSync(join(tmpdir(), "close-integration-failure-"));
  const repo = join(root, "repo"), topic = join(root, "issue");
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  execFileSync("git", ["init", "-b", "main", repo], { stdio: "ignore" });
  try {
    git(repo, "config", "user.name", "Fixture"); git(repo, "config", "user.email", "fixture@example.invalid");
    writeFileSync(join(repo, "behavior.txt"), "base"); git(repo, "add", "."); git(repo, "commit", "-m", "baseline");
    git(repo, "worktree", "add", "-b", "issue", topic, "main");
    writeFileSync(join(topic, "behavior.txt"), "broken"); git(topic, "commit", "-am", "candidate");
    const candidate = git(topic, "rev-parse", "HEAD");
    const store = createRunStore({ gitCommonDir: join(repo, ".git") });
    const leaseInput = { store, target: "main", repositoryId: "github:example/repo", specId: "spec", approvedPublicationIdentity: "scope", issueId: "issue" };
    const checks = [{ command: [process.execPath, "-e", "require('node:assert/strict').equal(require('node:fs').readFileSync('behavior.txt','utf8'),'fixed')"], environment: { node: process.version }, readExternalInputs: async () => ({}) }];
    let leases = acquireCloseIssueLeases(leaseInput);
    const operationId = deriveExecuteIssueOperationIdentity(leases.operationIdentity).key;
    mergeCandidate({ leases, targetWorktree: repo, candidate });
    const failed = await verifyIntegratedCandidate({ leases, targetWorktree: repo, candidate, issueId: "issue", operationId, checks });
    leases.release();
    assert.equal(failed.state, "FAIL");
    assert.equal(existsSync(topic), true);
    assert.equal(git(repo, "rev-parse", "HEAD"), candidate, "failure must retain the successful merge");
    leases = acquireCloseIssueLeases(leaseInput);
    try {
      const repeated = await verifyIntegratedCandidate({ leases, targetWorktree: repo, candidate, issueId: "issue", operationId, checks: checks.map(check => ({ ...check, run: () => { throw new Error("unchanged failure must not rerun"); } })) });
      assert.equal(repeated.state, "FAIL");
      await assert.rejects(verifyIntegratedCandidate({ leases, targetWorktree: repo, candidate, issueId: "issue", operationId, checks: [] }), /obligation/u);
    } finally { leases.release(); }
    writeFileSync(join(topic, "behavior.txt"), "fixed"); git(topic, "commit", "-am", "repair");
    const repaired = git(topic, "rev-parse", "HEAD");
    leases = acquireCloseIssueLeases(leaseInput);
    try {
      mergeCandidate({ leases, targetWorktree: repo, candidate: repaired });
      const passed = await verifyIntegratedCandidate({ leases, targetWorktree: repo, candidate: repaired, issueId: "issue", operationId, checks });
      assert.equal(passed.state, "PASS");
      assert.notEqual(passed.identity, failed.identity);
      git(repo, "worktree", "remove", topic);
      assert.equal(existsSync(topic), false);
    } finally { leases.release(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("real close conflict restores the target, keeps the original lane and reintegrates its verified new candidate", () => {
  const root = mkdtempSync(join(tmpdir(), "close-conflict-"));
  const repo = join(root, "repo");
  const topic = join(root, "issue");
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  execFileSync("git", ["init", "-b", "main", repo], { stdio: "ignore" });
  try {
    git(repo, "config", "user.name", "Fixture"); git(repo, "config", "user.email", "fixture@example.invalid");
    writeFileSync(join(repo, "behavior.txt"), "base\n"); git(repo, "add", "."); git(repo, "commit", "-m", "baseline");
    git(repo, "worktree", "add", "-b", "issue", topic, "main");
    writeFileSync(join(topic, "behavior.txt"), "issue requirement\n"); git(topic, "commit", "-am", "Issue behavior");
    const original = git(topic, "rev-parse", "HEAD");
    writeFileSync(join(repo, "behavior.txt"), "target requirement\n"); git(repo, "commit", "-am", "Target behavior");
    const target = git(repo, "rev-parse", "HEAD");
    const store = createRunStore({ gitCommonDir: join(repo, ".git") });
    const leaseInput = { store, target: "main", repositoryId: "github:example/repo", specId: "spec", approvedPublicationIdentity: "scope", issueId: "issue" };
    let leases = acquireCloseIssueLeases(leaseInput);
    const conflict = mergeCandidate({ leases, targetWorktree: repo, candidate: original });
    leases.release();
    assert.equal(conflict.state, "CONFLICT");
    assert.equal(conflict.targetRestored, true);
    assert.equal(git(repo, "rev-parse", "HEAD"), target);
    assert.equal(git(repo, "status", "--porcelain"), "");
    assert.equal(git(topic, "rev-parse", "HEAD"), original);
    assert.throws(() => git(topic, "merge", "--no-edit", target));
    writeFileSync(join(topic, "behavior.txt"), "target requirement\nissue requirement\n");
    git(topic, "add", "behavior.txt"); git(topic, "commit", "-m", "Resolve both approved requirements");
    const candidate = git(topic, "rev-parse", "HEAD");
    // Actual behavior check at the replacement candidate; review remains the execute owner boundary.
    execFileSync(process.execPath, ["-e", "const assert=require('node:assert/strict');const fs=require('node:fs');assert.equal(fs.readFileSync('behavior.txt','utf8'),'target requirement\\nissue requirement\\n')"], { cwd: topic });
    assert.equal(git(topic, "status", "--porcelain"), "");
    leases = acquireCloseIssueLeases(leaseInput);
    try {
      assert.equal(mergeCandidate({ leases, targetWorktree: repo, candidate }).state, "MERGED");
      const head = git(repo, "rev-parse", "HEAD");
      assert.equal(mergeCandidate({ leases, targetWorktree: repo, candidate }).state, "ALREADY_MERGED");
      assert.equal(git(repo, "rev-parse", "HEAD"), head, "a lost merge response cannot cause a second merge");
    } finally { leases.release(); }
    assert.match(git(repo, "worktree", "list", "--porcelain"), /branch refs\/heads\/issue/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
