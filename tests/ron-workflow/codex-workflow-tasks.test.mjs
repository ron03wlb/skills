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
  let messages = 0;
  let prompt;
  let waits = 0;
  const host = { async call(name, args) {
    if (name.endsWith("wait_threads")) {
      assert.equal(args.targets[0].afterCursor, waits++ ? "observed-cursor" : undefined);
      return { polls: [{ thread: { id: ref.threadId }, cursor: "observed-cursor" }] };
    }
    if (name.endsWith("send_message_to_thread")) { messages++; prompt = args.prompt; throw new Error("response lost"); }
    if (name.endsWith("create_thread")) { creates++; prompt = args.prompt; assert.equal(args.target.environment.type, "worktree"); throw new Error("response lost"); }
    if (name.endsWith("list_threads")) {
      assert.ok(args.limit <= 50, "current host limits list_threads to 50");
      return { threads: [{ id: ref.threadId, hostId: "local", projectId: "project", kind: "codex" }] };
    }
    if (name.endsWith("read_thread")) {
      assert.equal(args.includeOutputs, true);
      return { thread: { id: ref.threadId, hostId: "local", preview: "", status: { type: "idle" }, cwd: root },
        turns: [{ items: [{ type: "functionCallOutput", namespace: "codex_app", name: "create_thread",
          output: { text: `<codex_delegation>\n  <source_thread_id>parent</source_thread_id>\n  <input>${prompt}</input>\n</codex_delegation>`, truncated: false } }] }] };
    }
    throw new Error(`Unexpected ${name}`);
  } };
  const options = { host, store, project: { projectId: "project", hostId: "local" }, packageRoot: "/installed/version", issueNumber: async () => 1, sleep: async () => {} };
  try {
    assert.deepEqual(await createCodexWorkflowTasks(options).create({ issueId: "I_1", runIdentity }), ref, "owning-source discovery recovers a lost create response in the same invocation");
    const resumed = createCodexWorkflowTasks(options);
    assert.deepEqual(await resumed.findIssueLane({ issueId: "I_1", runIdentity }), [ref]);
    assert.deepEqual(await resumed.create({ issueId: "I_1", runIdentity }), ref);
    assert.equal(creates, 1);
    assert.equal((await resumed.read(ref)).state, "RESUMABLE");
    assert.equal((await resumed.wait([ref])).taskSettled, true);
    assert.equal((await resumed.wait([ref])).taskSettled, true);
    await resumed.message(ref, `Use $execute-issue to retry Issue I_1. Retry request: ${JSON.stringify({ runId: runIdentity.runId, issueId: "I_1", attempt: 2 })}`);
    assert.equal(messages, 1, "native accepted-message read-back suppresses a duplicate send");
    assert.match(prompt, /\/installed\/version\/skills\/engineering\/execute-issue\/SKILL.md/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
