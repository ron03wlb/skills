import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCodexWorkflowTasks } from "../../skills/personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

test("a lost task creation response reuses its exact discovered lane without a second create", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-task-"));
  execFileSync("git", ["init", root], { stdio: "ignore" });
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const runIdentity = { runId: "run-1", specId: "I_1", target: "main", classification: "SINGLE", approvedScopeHash: "approved", decompositionIdentity: null };
  const ref = { threadId: "task-1", hostId: "local" };
  let creates = 0;
  let prompt;
  const host = { async call(name, args) {
    if (name.endsWith("create_thread")) { creates++; prompt = args.prompt; assert.equal(args.target.environment.type, "worktree"); throw new Error("response lost"); }
    if (name.endsWith("list_threads")) return { threads: [{ id: ref.threadId, hostId: "local", projectId: "project", kind: "codex" }] };
    if (name.endsWith("read_thread")) return { thread: { id: ref.threadId, hostId: "local", preview: prompt, status: { type: "idle" }, cwd: root }, turns: [] };
    throw new Error(`Unexpected ${name}`);
  } };
  const options = { host, store, project: { projectId: "project", hostId: "local" }, packageRoot: "/installed/version", issueNumber: async () => 1 };
  try {
    await assert.rejects(createCodexWorkflowTasks(options).create({ issueId: "I_1", runIdentity }), /response lost/u);
    const resumed = createCodexWorkflowTasks(options);
    assert.deepEqual(await resumed.findIssueLane({ issueId: "I_1", runIdentity }), [ref]);
    assert.deepEqual(await resumed.create({ issueId: "I_1", runIdentity }), ref);
    assert.equal(creates, 1);
    assert.equal((await resumed.read(ref)).state, "RESUMABLE");
    assert.match(prompt, /\/installed\/version\/skills\/engineering\/execute-issue\/SKILL.md/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
