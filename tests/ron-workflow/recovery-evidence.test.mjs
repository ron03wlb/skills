import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { createCodexWorkflowTasks } from "../../skills/personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs";
import { bindTechnicalFailure, nextRepairWave, nextMaintenanceWave, validateMaintenanceResult } from "../../skills/personal/run-issue-workflow/scripts/recovery-evidence.mjs";

test("material recovery carries original and journaled counts; maintenance has one separate scoped budget", () => {
  const failure = { issueId: "I_1", repairWaveCount: 7, diagnosis: { maintenance: { operationId: "maintenance", repairWaveCount: 2 } } };
  assert.equal(nextRepairWave({ failure, journal: [{ type: "repair.recorded", issueId: "I_1", wave: 4 }, { type: "recovery.intent", issueId: "I_1", phase: "REPAIR", wave: 8 }] }), 9);
  assert.throws(() => nextRepairWave({ failure: { ...failure, repairWaveCount: null }, journal: [] }), /unproved/u);
  assert.throws(() => nextRepairWave({ failure: { ...failure, repairWaveCount: 10 }, journal: [] }), /exhausted/u);
  assert.equal(nextMaintenanceWave({ failure, journal: [{ type: "recovery.intent", phase: "MAINTENANCE", failure, wave: 5 }] }), 6);
});

test("native maintenance adopts one separate canonical worktree after lost setup and retains its operation across failures", async () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-task-")), source = join(root, "source"), product = join(root, "product"), lane = join(root, "maintenance");
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  execFileSync("git", ["init", "-b", "main", source], { stdio: "ignore" });
  execFileSync("git", ["init", "-b", "main", product], { stdio: "ignore" });
  git(source, "config", "user.name", "Fixture"); git(source, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(source, "README.md"), "source"); git(source, "add", "."); git(source, "commit", "-m", "source baseline");
  const store = createRunStore({ gitCommonDir: join(product, ".git") });
  const originalTaskRef = { threadId: "product", hostId: "local" };
  const scope = { repositoryId: "github:example/workflow", sourceRepository: source, target: "main", approvedScopeHash: "approved-scope", authority: "original-human-maintenance-approval", operationId: "maintenance-operation", repairWaveCount: 0 };
  const failure = { worktree: product, identity: "failure-1", diagnosis: { maintenance: scope } };
  const runIdentity = { runId: "original-run", specId: "I_1", target: "product-target" };
  let creates = 0, prompt;
  const host = { async call(name, args) {
    if (name.endsWith("list_projects")) return { projects: [{ id: "source-project", hostId: "local", path: source, isGitRepository: true }] };
    if (name.endsWith("create_thread")) {
      creates++; prompt = args.prompt;
      assert.equal(args.target.projectId, "source-project"); assert.equal(args.target.environment.type, "worktree");
      assert.ok(store.readHostTask({ runId: runIdentity.runId, issueId: "I_1", purpose: "maintenance:maintenance-operation" }));
      git(source, "worktree", "add", "-b", "maintenance", lane, "main");
      throw new Error("lost creation result");
    }
    if (name.endsWith("list_threads")) return { pinnedThreads: [{ id: "maintenance", hostId: "local", kind: "codex", projectId: "source-project" }] };
    if (name.endsWith("read_thread")) return { thread: { id: args.threadId, hostId: "local", cwd: args.threadId === "product" ? product : lane, status: { type: "idle" } },
      turns: [{ id: "settled", status: "completed", items: args.threadId === "product" ? [] : [{ type: "userMessage", content: [{ type: "text", text: prompt }] }] }] };
    throw new Error(name);
  } };
  const options = { host, store, project: { path: product, hostId: "local" }, packageRoot: "/retained", discoverTasks: async () => [] };
  try {
    const input = { issueId: "I_1", runIdentity, failure, originalTaskRef };
    const first = await createCodexWorkflowTasks(options).ensureMaintenanceTask(input);
    assert.equal(first.taskRef.threadId, "maintenance");
    assert.deepEqual((await createCodexWorkflowTasks(options).ensureMaintenanceTask({ ...input, failure: { ...failure, identity: "failure-2", diagnosis: { maintenance: { ...scope, repairWaveCount: 1 } } } })).taskRef, first.taskRef);
    assert.equal(creates, 1); assert.equal(git(source, "status", "--porcelain"), ""); assert.equal(git(product, "status", "--porcelain"), "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("maintenance installation evidence cannot invent authority, switch candidate or accept unverified package", () => {
  const scope = { repositoryId: "repo", target: "main", operationId: "maintenance", installationAuthority: "exact-approval", sourceRepository: "canonical-source" };
  const intent = { requestIdentity: "request", wave: 3, failure: { identity: "failure", diagnosis: { maintenance: scope } } };
  const installed = { state: "AVAILABLE", version: { id: "package", sourceCommit: "candidate", sourceRepository: "canonical-source" } };
  const result = { requestIdentity: "request", failureIdentity: "failure", maintenance: { repositoryId: "repo", target: "main", operationId: "maintenance", candidate: "candidate", packageVersion: installed.version,
    repairWaveCount: 3, standards: "clean", spec: "clean", verification: [{ command: "real check", result: "PASS" }], installation: { authority: "exact-approval", packageVersionId: "package" } } };
  assert.equal(validateMaintenanceResult({ result, intent, installed }), result.maintenance);
  for (const changed of [{ ...installed, state: "UNAVAILABLE" }, { ...installed, version: { ...installed.version, sourceCommit: "foreign" } }]) assert.throws(() => validateMaintenanceResult({ result, intent, installed: changed }), /installation read-back/u);
  assert.throws(() => validateMaintenanceResult({ result, intent: { ...intent, failure: { ...intent.failure, diagnosis: { maintenance: { ...scope, installationAuthority: null } } } }, installed }), /installation read-back/u);
});
