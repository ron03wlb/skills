import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { delegatedInput, discoverLocalCodexTasks } from "../../skills/personal/run-issue-workflow/scripts/codex-task-discovery.mjs";

test("local task hints require exact native delegation input, never a title or quoted conversation", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-task-discovery-"));
  const date = new Date();
  const directory = join(root, String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0"));
  mkdirSync(directory, { recursive: true });
  const prompt = "Workflow lane exact\nExecute the approved Issue.";
  const output = `<codex_delegation>\n  <source_thread_id>parent</source_thread_id>\n  <input>${prompt}</input>\n</codex_delegation>`;
  const item = { type: "function_call_output", namespace: "codex_app", name: "create_thread", output };
  const write = (id, payload) => writeFileSync(join(directory, `rollout-${id}.jsonl`), [
    { type: "session_meta", payload: { id, cwd: `/worktrees/${id}`, thread_source: "agent_created_thread" } },
    { type: "response_item", payload },
  ].map(JSON.stringify).join("\n") + "\n{partial");
  try {
    write("exact", item);
    write("quoted", { type: "message", content: output });
    write("wrong-owner", { ...item, namespace: "untrusted" });
    assert.deepEqual(await discoverLocalCodexTasks({ prompt, since: date.toISOString(), sessionsDirectory: root }), [{ threadId: "exact", hostId: "local", cwd: "/worktrees/exact" }]);
    assert.equal(delegatedInput({ ...item, output: { text: output, truncated: true } }), null);
    assert.equal(delegatedInput({ ...item, output: { text: output, truncated: false } }), prompt);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
