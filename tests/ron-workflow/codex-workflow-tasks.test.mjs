import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCodexWorkflowTasks } from "../../skills/personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

test("host loss before submission leaves no creation intent to strand on re-entry", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-unsent-task-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const runIdentity = { runId: "run-1", specId: "I_1", target: "main", classification: "SINGLE", approvedScopeHash: "approved", decompositionIdentity: null };
  let calls = 0;
  const host = { disconnected: false, async call() { calls++; throw new Error("CODEX_HOST_DISCONNECTED"); } };
  const tasks = createCodexWorkflowTasks({ host, store, project: { projectId: "project", hostId: "local" }, packageRoot: "/installed/version",
    issueNumber: async () => { host.disconnected = true; return 1; }, sleep: async () => {} });
  try {
    await assert.rejects(tasks.create({ issueId: "I_1", runIdentity }), /DISCONNECTED/u);
    assert.equal(store.readHostTask({ runId: runIdentity.runId, issueId: "I_1" }), null);
    assert.equal(calls, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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
    assert.match(prompt.replaceAll("\\", "/"), /\/installed\/version\/skills\/engineering\/execute-issue\/SKILL.md/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("exact local creation hints recover without reading unrelated coordinator history", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-exact-task-"));
  execFileSync("git", ["init", root], { stdio: "ignore" });
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const runIdentity = { runId: "run-1", specId: "I_1", target: "main" };
  const prompt = "exact immutable creation input";
  store.reserveHostTask({ runId: runIdentity.runId, issueId: "I_1", prompt });
  const ref = { threadId: "worker", hostId: "local" };
  const calls = [];
  const options = { store, project: { projectId: "project", hostId: "local", path: root }, packageRoot: "/installed/version", issueNumber: async () => 1,
    discoverTasks: async ({ prompt: input }) => { assert.equal(input, prompt); return [{ ...ref, cwd: root }]; },
    host: { async call(name, args) {
      calls.push(name);
      assert.equal(name, "mcp__codex_app__read_thread", "exact hints must precede broad history discovery");
      assert.equal(args.threadId, ref.threadId);
      return { thread: { id: ref.threadId, hostId: ref.hostId, cwd: root, status: { type: "idle" } },
        turns: [{ items: [{ type: "userMessage", content: [{ type: "text", text: prompt }] }] }] };
    } } };
  try {
    assert.deepEqual(await createCodexWorkflowTasks(options).findIssueLane({ issueId: "I_1", runIdentity }), [ref]);
    assert.deepEqual(calls, ["mcp__codex_app__read_thread"]);
    const mismatch = { ...options, discoverTasks: async () => [{ ...ref, cwd: root + "-wrong" }] };
    await assert.rejects(createCodexWorkflowTasks(mismatch).findIssueLane({ issueId: "I_1", runIdentity }), /ownership/u,
      "local discovery cannot substitute for exact current native and Git ownership");
    const duplicate = { ...options, discoverTasks: async () => [{ ...ref, cwd: root }, { threadId: "other", hostId: "local", cwd: root }],
      host: { async call(name, args) { const result = await options.host.call(name, { ...args, threadId: ref.threadId }); result.thread.id = args.threadId; return result; } } };
    assert.equal((await createCodexWorkflowTasks(duplicate).findIssueLane({ issueId: "I_1", runIdentity })).length, 2,
      "multiple exact native matches remain ambiguous for the coordinator");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("worktree creation recovery skips the saved checkout's unrelated active tasks", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-unready-task-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const runIdentity = { runId: "run-1", specId: "I_1", target: "main" };
  store.reserveHostTask({ runId: runIdentity.runId, issueId: "I_1", prompt: "exact input" });
  const tasks = createCodexWorkflowTasks({ store, project: { projectId: "project", hostId: "local", path: root },
    discoverTasks: async () => [], host: { async call(name) {
      assert.equal(name, "mcp__codex_app__list_threads", "the saved checkout cannot be the created worktree");
      return { threads: [{ id: "coordinator", hostId: "local", projectId: "project", kind: "codex", cwd: root, status: "active" }] };
    } } });
  try { await assert.rejects(tasks.findIssueLane({ issueId: "I_1", runIdentity }), /TASK_CREATION_UNRESOLVED/u); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("an unloaded native task with a completed latest turn is settled without replaying its work", async () => {
  let type = "notLoaded";
  let status = "completed";
  const ref = { threadId: "worker", hostId: "local" };
  const tasks = createCodexWorkflowTasks({ project: {}, host: { async call() {
    return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type } }, turns: [{ status, items: [] }] };
  } } });
  assert.equal((await tasks.read(ref)).state, "RESUMABLE");
  status = "inProgress";
  assert.equal((await tasks.read(ref)).state, "UNKNOWN", "unloaded does not prove unfinished work settled");
  status = "completed"; type = "active";
  assert.equal((await tasks.read(ref)).state, "RUNNING", "active native state takes precedence over older completion");
});
