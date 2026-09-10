import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCodexHostCleanupOwner, readCodexHostIntegrationEnvironment } from "../../skills/personal/run-issue-workflow/scripts/codex-workflow.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

test("Codex host environment evidence separates persisted declaration from current runtime", () => {
  const declared = { runtime: "persisted-runtime" };
  const current = readCodexHostIntegrationEnvironment(declared);
  assert.deepEqual(current, { schema: "codex-host-integration-environment:v1", declared,
    host: { runtime: process.version, platform: process.platform, arch: process.arch,
      executable: realpathSync.native(process.execPath) } });
  assert.notStrictEqual(current.declared, declared);
});

test("Codex close owner recovers one exact settled empty worktree before tracker continuation", async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "codex-close-owner-")));
  const repository = join(root, "repository"), worktree = join(root, "issue");
  try {
    execFileSync("git", ["init", "-b", "main", repository], { stdio: "ignore" });
    const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "candidate");
    const candidate = git("rev-parse", "HEAD");
    git("branch", "issue"); mkdirSync(worktree);
    const taskRef = { threadId: "issue-task", hostId: "local" };
    let reads = 0;
    const tasks = { async read(ref) {
      reads++;
      assert.deepEqual(ref, taskRef);
      return { snapshot: { thread: { id: taskRef.threadId, hostId: taskRef.hostId, cwd: worktree, status: { type: "idle" } },
        turns: [{ status: "completed" }] } };
    } };
    const store = createRunStore({ gitCommonDir: join(repository, ".git") });
    const runIdentity = { runId: "run", specId: "issue", approvedScopeHash: "scope", target: "main" };
    const currentEnvironment = { schema: "codex-host-integration-environment:v1",
      declared: { runtime: "persisted-runtime" }, host: { runtime: process.version, platform: process.platform, arch: process.arch } };
    let environmentReads = 0;
    const recover = createCodexHostCleanupOwner({ store, tasks, repositoryId: "github:example/repo",
      readCurrentIntegrationEnvironment(declared) {
        environmentReads++;
        assert.deepEqual(declared, { runtime: "persisted-runtime" });
        return currentEnvironment;
      } });
    const pending = {
      completion: { issueId: "issue", specId: "issue", target: "main", targetWorktree: repository,
        topic: "issue", worktree, candidate },
      taskRef, failure: { code: "EACCES", message: "fixture sharing violation" },
      integrationChecks: [{ command: [process.execPath, "-e", ""], configFiles: [], environment: { runtime: "persisted-runtime" },
        externalInputs: { kind: "none" } }],
    };
    await assert.rejects(recover({ issueId: "foreign", runIdentity, pending }), /Issue identity/u);
    assert.equal(existsSync(worktree), true, "foreign action identity has no filesystem effect");
    const result = await recover({ issueId: "issue", runIdentity, pending });
    assert.equal(result.state, "HOST_CLEANUP_RECOVERED", JSON.stringify(result));
    assert.equal(result.directoryState, "ABSENT");
    assert.equal(existsSync(worktree), false);
    assert.ok(reads >= 3, "task ownership is read before and after physical cleanup");
    assert.equal(store.observeRepositoryCloseLease().state, "ABSENT");
    assert.equal(store.readTargetMutationWriterLock("main"), null);
    assert.equal(git("rev-parse", "HEAD"), candidate);
    assert.ok(environmentReads >= 1, "the recovery owner reads current environment instead of replaying persisted input");
    const verificationRoot = join(repository, ".git", "workflow-verification");
    const operationDirectory = join(verificationRoot, readdirSync(verificationRoot)[0]);
    const verification = JSON.parse(readFileSync(join(operationDirectory, readdirSync(operationDirectory)[0]), "utf8"));
    assert.deepEqual(verification.current.results[0].inputs.environment, currentEnvironment);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
