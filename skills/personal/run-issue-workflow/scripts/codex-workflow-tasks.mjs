import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { join } from "node:path";

export function unwrapCodexResult(result) {
  if (result?.isError) throw new Error(result.content?.find(({ type }) => type === "text")?.text ?? "Codex host tool failed");
  if (result?.structuredContent) return result.structuredContent;
  const body = result?.content?.find(({ type }) => type === "text")?.text;
  return body === undefined ? result : JSON.parse(body);
}
const userTexts = (snapshot) => (snapshot.turns ?? []).flatMap(({ items }) => (items ?? [])
  .filter(({ type }) => type === "userMessage").flatMap(({ content }) => content?.filter(({ type }) => type === "text").map(({ text }) => text) ?? []));
const markerFor = ({ runId, issueId }) => `Workflow lane ${createHash("sha256").update(JSON.stringify({ runId, issueId })).digest("hex")}`;

export function createCodexWorkflowTasks({ host, store, project, packageRoot, issueNumber }) {
  const refs = new Map();
  const cursors = new Map();
  const call = async (name, args) => unwrapCodexResult(await host.call(`mcp__codex_app__${name}`, args));
  const read = async (ref) => {
    const snapshot = await call("read_thread", { ...ref, turnLimit: 2, includeOutputs: false, maxOutputCharsPerItem: 16000 });
    if (snapshot.thread?.id !== ref.threadId || snapshot.thread?.hostId !== ref.hostId) throw new Error("Task read-back identity differs");
    const type = snapshot.thread.status?.type;
    const prompt = userTexts(snapshot).find((text) => text.includes("Close request identity:"));
    let closeRequest;
    if (prompt) {
      const match = prompt.match(/Close request identity: (sha256:[a-f0-9]{64})\. Current close request evidence: (.+)$/u);
      if (!match) throw new Error("Task close request evidence is malformed");
      const evidence = JSON.parse(match[2]);
      closeRequest = { state: "ACCEPTED", requestIdentity: match[1], runId: evidence.runIdentity.runId, issueId: evidence.issueId };
    }
    const retryPrompt = userTexts(snapshot).find((text) => text.includes("Retry request: "));
    const retryMatch = retryPrompt?.match(/Retry request: (\{.+\})$/u);
    const retryRequest = retryMatch ? { state: "ACCEPTED", ...JSON.parse(retryMatch[1]) } : undefined;
    return { state: type === "active" ? "RUNNING" : type === "idle" ? "RESUMABLE" : "UNKNOWN",
      closeRequest, retryRequest, snapshot, cwd: snapshot.thread.cwd };
  };
  const findIssueLane = async ({ issueId, runIdentity }) => {
    const key = markerFor({ runId: runIdentity.runId, issueId });
    const journaled = store.readEvents(runIdentity.runId).filter((event) => event.type === "dispatch.recorded" && event.issueId === issueId);
    if (journaled.length) return [journaled.at(-1).taskRef];
    if (refs.has(key)) return [refs.get(key)];
    const intent = store.readHostTask({ runId: runIdentity.runId, issueId });
    if (!intent) return [];
    const listing = await call("list_threads", { limit: 50 });
    const found = [];
    for (const task of [...(listing.pinnedThreads ?? []), ...(listing.threads ?? [])]) {
      if (task.kind !== "codex" || task.projectId !== project.projectId || task.hostId !== project.hostId) continue;
      const ref = { threadId: task.id, hostId: task.hostId };
      const { snapshot } = await read(ref);
      if (snapshot.thread.preview?.startsWith(`${key}\n`)) found.push(ref);
    }
    if (found.length === 0) throw new Error("TASK_CREATION_UNRESOLVED: preserve the recorded intent and inspect the host; do not create another task");
    if (found.length === 1) refs.set(key, found[0]);
    return found;
  };
  const create = async ({ issueId, runIdentity }) => {
    const key = markerFor({ runId: runIdentity.runId, issueId });
    const number = await issueNumber(issueId);
    const prompt = `${key}\nUse the installed workflow's exact skill at ${join(packageRoot, "skills/engineering/execute-issue/SKILL.md")} to execute Issue #${number}.\nRead the current Issue and only its required linked scope. Run Grant: ${JSON.stringify(runIdentity)}. Read its grant.recorded event from the repository Git common directory before any mutation.\nUse this task's existing Git worktree as the sole Issue lane after verifying its common directory, target ancestry and ownership. Record this worktree and branch; do not create a second worktree. Target: ${runIdentity.target}. Complete implementation, required verification, independent review and implementation_complete read-back, then stop. A later close request owns integration and closure. No push or deployment. All workflow skills and references must come from ${packageRoot}/skills for this Run's pinned version.`;
    const reservation = store.reserveHostTask({ runId: runIdentity.runId, issueId, prompt });
    if (!reservation.created) {
      const existing = await findIssueLane({ issueId, runIdentity });
      if (existing.length !== 1) throw new Error("ISSUE_LANE_AMBIGUOUS");
      return existing[0];
    }
    const created = await call("create_thread", { title: `Workflow Issue ${number}`, prompt,
      target: { type: "project", projectId: project.projectId,
        environment: { type: "worktree", startingState: { type: "branch", branchName: runIdentity.target } } } });
    if (created.threadId && created.hostId) {
      const ref = { threadId: created.threadId, hostId: created.hostId };
      refs.set(key, ref);
      return ref;
    }
    // clientThreadId is a setup operation, never a task reference.
    if (created.clientThreadId) {
      for (const delay of [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000]) {
        await setTimeout(delay);
        try {
          const existing = await findIssueLane({ issueId, runIdentity });
          if (existing.length !== 1) throw new Error("ISSUE_LANE_AMBIGUOUS");
          return existing[0];
        } catch (error) {
          if (!error.message.startsWith("TASK_CREATION_UNRESOLVED:")) throw error;
        }
      }
    }
    throw new Error("TASK_SETUP_PENDING: retain the accepted creation intent and resume after host setup");
  };
  return {
    findIssueLane, create, read,
    async message(ref, prompt) {
      const issue = prompt.match(/(?:close|retry) (?:parent )?Issue (I_[A-Za-z0-9_-]+)/u);
      if (issue) prompt = prompt.replace(`Issue ${issue[1]}`, `Issue #${await issueNumber(issue[1])}`);
      const frozenPrompt = `Use the exact installed skill ${join(packageRoot, "skills/engineering", prompt.includes("$close-issue") ? "close-issue" : "execute-issue", "SKILL.md")}.\n${prompt}`;
      await call("send_message_to_thread", { ...ref, prompt: frozenPrompt });
    },
    async wait(taskRefs) {
      const result = await call("wait_threads", { targets: taskRefs.map((ref) => ({ ...ref, ...(cursors.has(ref.threadId) ? { afterCursor: cursors.get(ref.threadId) } : {}) })), timeoutMs: 30000 });
      // Fresh task status is authoritative; a wait timeout or commentary is not completion.
      for (const target of result.results ?? result.threads ?? []) {
        if (target.threadId && target.cursor) cursors.set(target.threadId, target.cursor);
      }
      const states = await Promise.all(taskRefs.map(read));
      return { coordinatorActive: !host.disconnected, taskSettled: states.every(({ state }) => state === "RESUMABLE"),
        ...(states.length === 1 && states[0].closeRequest ? { closeRequestIdentity: states[0].closeRequest.requestIdentity } : {}) };
    },
  };
}
