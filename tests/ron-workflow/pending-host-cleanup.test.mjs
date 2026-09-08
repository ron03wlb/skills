import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireCloseIssueLeases } from "../../skills/engineering/close-issue/scripts/close-lease.mjs";
import { assessPendingHostCleanup } from "../../skills/engineering/close-issue/scripts/pending-host-cleanup.mjs";
import { CODEX_HOST_RELEASE_CAPABILITY } from "../../skills/personal/run-issue-workflow/scripts/codex-host-bridge.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

test("unavailable release preserves real integrated Git state, failures and both lease release paths", async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "host-cleanup-")));
  const repository = join(root, "repository"), worktree = join(root, "issue");
  mkdirSync(repository);
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  let leases, helper;
  try {
    git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "baseline");
    git("worktree", "add", "-b", "issue", worktree);
    execFileSync("git", ["-C", worktree, "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "candidate"], { stdio: "ignore" });
    const candidate = git("rev-parse", "issue");
    git("merge", "--ff-only", candidate); git("worktree", "remove", worktree); mkdirSync(worktree);
    const store = createRunStore({ gitCommonDir: join(repository, ".git") });
    const completion = { issueId: "issue", specId: "spec", target: "main", targetWorktree: repository, topic: "issue", worktree, candidate };
    const originalCompletion = JSON.stringify(completion);
    const taskRef = { threadId: "task", hostId: "local" };
    const snapshot = { thread: { id: "task", hostId: "local", cwd: worktree, status: { type: "idle" } }, turns: [{ status: "completed" }] };
    let failure = { code: "EBUSY", message: "Fixture directory sharing violation" };
    if (process.platform === "win32") {
      // Own the test child by its ChildProcess handle and stop it through stdin, never a PID list.
      helper = spawn(process.execPath, ["-e", 'process.stdout.write("ready"); process.stdin.resume(); process.stdin.on("end", () => process.exit(0));'],
        { cwd: worktree, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      await once(helper.stdout, "data");
      assert.throws(() => rmdirSync(worktree), error => {
        failure = { code: error.code, message: error.message };
        return ["EBUSY", "EPERM", "EACCES"].includes(error.code);
      }, "a real Windows child cwd retains the exact directory");
    }
    const takeLeases = () => acquireCloseIssueLeases({ store, target: "main", repositoryId: "github:example/repo", specId: "spec", approvedPublicationIdentity: "publication", issueId: "issue" });
    leases = takeLeases();
    const input = { leases, completion, taskRef, readTask: async ref => { assert.deepEqual(ref, taskRef); return structuredClone(snapshot); }, failure };
    const result = await assessPendingHostCleanup(input);
    assert.equal(result.state, "HOST_CLEANUP_BLOCKED");
    assert.equal(result.reasonCode, "host_release_unavailable", JSON.stringify(result));
    assert.deepEqual(result.capability, CODEX_HOST_RELEASE_CAPABILITY);
    assert.deepEqual(result.observations[0], failure);
    assert.equal(result.worktree, worktree);
    assert.equal(result.candidate, candidate);
    assert.equal(result.directoryState, "EMPTY_UNREGISTERED");
    assert.deepEqual(result.taskRef, taskRef);
    assert.equal(JSON.stringify(completion), originalCompletion);
    assert.equal(git("rev-parse", "HEAD"), candidate);
    assert.equal(git("rev-parse", "issue"), candidate);
    assert.ok(existsSync(worktree));
    leases.release();
    assert.equal(store.readTargetMutationWriterLock("main"), null);
    assert.equal(store.observeRepositoryCloseLease().state, "ABSENT");
    assert.throws(() => leases.assertCurrent(), /RELEASED/u);
    if (helper) { const exited = once(helper, "exit"); helper.stdin.end(); await exited; helper = null; }

    leases = takeLeases(); input.leases = leases;
    for (const [label, altered] of [
      ["running", { ...snapshot, thread: { ...snapshot.thread, status: { type: "active" } } }],
      ["foreign task", { ...snapshot, thread: { ...snapshot.thread, id: "foreign" } }],
      ["foreign cwd", { ...snapshot, thread: { ...snapshot.thread, cwd: repository } }],
      ["unknown", null],
      ["new turn", { ...snapshot, turns: [{ status: "inProgress" }] }],
    ]) {
      const blocked = await assessPendingHostCleanup({ ...input, readTask: async () => altered });
      assert.equal(blocked.state, "HOST_CLEANUP_BLOCKED", label);
      assert.equal(blocked.reasonCode, "host_task_ownership_unproven", label);
      assert.ok(existsSync(worktree));
    }
    const rejected = await assessPendingHostCleanup({ ...input, failure: { code: "POLICY_REJECTED", message: "Host policy denied removal" } });
    assert.equal(rejected.reasonCode, "host_cleanup_policy_rejected");
    assert.deepEqual(rejected.observations[0], { code: "POLICY_REJECTED", message: "Host policy denied removal" });
    writeFileSync(join(worktree, "foreign.txt"), "preserve");
    assert.equal((await assessPendingHostCleanup(input)).reasonCode, "host_cleanup_ownership_unproven");
    assert.equal(readFileSync(join(worktree, "foreign.txt"), "utf8"), "preserve");
    rmSync(join(worktree, "foreign.txt")); rmdirSync(worktree);
    symlinkSync(repository, worktree, "junction");
    assert.equal((await assessPendingHostCleanup(input)).reasonCode, "host_cleanup_ownership_unproven");
    rmSync(worktree); mkdirSync(worktree);
    // A fresh native read can race with a helper respawn or a changed path. No release is available.
    const raced = await assessPendingHostCleanup({ ...input, readTask: async () => { writeFileSync(join(worktree, "respawn.txt"), "preserve"); return snapshot; } });
    assert.equal(raced.reasonCode, "host_cleanup_ownership_unproven");
    assert.ok(existsSync(join(worktree, "respawn.txt")));
  } finally {
    if (helper) { const exited = once(helper, "exit"); helper.stdin.end(); await exited; }
    leases?.release();
    rmSync(root, { recursive: true, force: true });
  }
});
