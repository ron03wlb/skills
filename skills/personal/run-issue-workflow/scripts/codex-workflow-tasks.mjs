import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { join, resolve } from "node:path";
import { delegatedInput, discoverLocalCodexTasks } from "./codex-task-discovery.mjs";

export function unwrapCodexResult(result) {
  if (result?.isError) throw new Error(result.content?.find(({ type }) => type === "text")?.text ?? "Codex host tool failed");
  if (result?.structuredContent) return result.structuredContent;
  const body = result?.content?.find(({ type }) => type === "text")?.text;
  return body === undefined ? result : JSON.parse(body);
}
const userTexts = (snapshot) => (snapshot.turns ?? []).flatMap(({ items }) => (items ?? []).flatMap((item) =>
  item.type === "userMessage" ? item.content?.filter(({ type }) => type === "text").map(({ text }) => text) ?? []
    : item.type === "functionCallOutput" && delegatedInput(item) !== null ? [delegatedInput(item)] : []));
const markerFor = ({ runId, issueId }) => `Workflow lane ${createHash("sha256").update(JSON.stringify({ runId, issueId })).digest("hex")}`;

export function createCodexWorkflowTasks({ host, store, project, packageRoot, issueNumber, sleep = setTimeout }) {
  const refs = new Map();
  const cursors = new Map();
  const call = async (name, args) => {
    const delays = [1000, 5000, 15000];
    for (let attempt = 0; ; attempt += 1) {
      try { return unwrapCodexResult(await host.call(`mcp__codex_app__${name}`, args)); }
      catch (error) {
        if (!["read_thread", "list_threads", "wait_threads"].includes(name) || attempt === delays.length
          || !/timeout|temporar|unavailable|connection|response lost|rate.?limit|network/iu.test(error.message)) throw error;
        await sleep(delays[attempt]);
      }
    }
  };
  const readHistory = async (ref, predicate) => {
    let snapshot = await call("read_thread", { ...ref, turnLimit: 2, includeOutputs: true, maxOutputCharsPerItem: 16000 });
    const cursorsSeen = new Set();
    for (let page = 0; ; page += 1) {
      if (snapshot.thread?.id !== ref.threadId || snapshot.thread?.hostId !== ref.hostId) throw new Error("Task read-back identity differs");
      if (predicate(snapshot) || !snapshot.page?.hasMore) return snapshot;
      const cursor = snapshot.page.nextCursor;
      if (!cursor || cursorsSeen.has(cursor) || page >= 99) throw new Error("Task history is unresolved; preserve the existing lane");
      cursorsSeen.add(cursor);
      const older = await call("read_thread", { ...ref, cursor, turnLimit: 10, includeOutputs: true, maxOutputCharsPerItem: 16000 });
      if (older.thread?.id !== ref.threadId || older.thread?.hostId !== ref.hostId) throw new Error("Task history identity differs");
      snapshot = { ...snapshot, page: older.page, turns: [...(snapshot.turns ?? []), ...(older.turns ?? [])] };
    }
  };
  const read = async (ref) => {
    const snapshot = await call("read_thread", { ...ref, turnLimit: 2, includeOutputs: true, maxOutputCharsPerItem: 16000 });
    if (snapshot.thread?.id !== ref.threadId || snapshot.thread?.hostId !== ref.hostId) throw new Error("Task read-back identity differs");
    const type = snapshot.thread.status?.type;
    const prompt = userTexts(snapshot).find((text) => text.includes("Close request identity:"));
    let closeRequest;
    if (prompt) {
      const match = prompt.match(/Close request identity: (sha256:[a-f0-9]{64})\. Current close request evidence: (.+)$/u);
      if (!match) throw new Error("Task close request evidence is malformed");
      const evidence = JSON.parse(match[2]);
      closeRequest = { state: "ACCEPTED", requestIdentity: match[1], runId: evidence.runIdentity.runId, issueId: evidence.issueId, evidence };
    }
    const retryPrompt = userTexts(snapshot).find((text) => text.includes("Retry request: "));
    const retryMatch = retryPrompt?.match(/Retry request: (\{.+\})$/u);
    const retryRequest = retryMatch ? { state: "ACCEPTED", ...JSON.parse(retryMatch[1]) } : undefined;
    const repairPrompt = userTexts(snapshot).find(text => text.includes("Repair request: "));
    const repairMatch = repairPrompt?.match(/Repair request: (\{.+\})$/u);
    const repairRequest = repairMatch ? { state: "ACCEPTED", ...JSON.parse(repairMatch[1]) } : undefined;
    const final = (snapshot.turns?.[0]?.items ?? []).findLast(item => item.type === "agentMessage" && item.phase === "final_answer")?.text;
    const closeResultMatch = final?.match(/^Workflow close result: (\{.+\})$/mu);
    const closeResult = closeResultMatch ? JSON.parse(closeResultMatch[1]) : undefined;
    return { state: type === "active" ? "RUNNING" : type === "idle" ? "RESUMABLE" : "UNKNOWN",
      closeRequest, retryRequest, repairRequest, closeResult, snapshot, cwd: snapshot.thread.cwd };
  };
  const findIssueLane = async ({ issueId, runIdentity, prepared }) => {
    const key = markerFor({ runId: runIdentity.runId, issueId });
    const journaled = store.readEvents(runIdentity.runId).filter((event) => event.type === "dispatch.recorded" && event.issueId === issueId);
    if (journaled.length) return [journaled.at(-1).taskRef];
    if (refs.has(key)) return [refs.get(key)];
    if (prepared) {
      const ref = prepared.taskRef;
      if (!ref?.threadId || ref.hostId !== project.hostId) throw new Error("Prepared task identity is unproven");
      const marker = `Workflow prerequisite lane: ${JSON.stringify({ issueId, specId: runIdentity.specId, target: runIdentity.target, approvedScopeHash: runIdentity.approvedScopeHash })}`;
      const snapshot = await readHistory(ref, value => userTexts(value).some(text => text.includes(marker)));
      const cwd = snapshot.thread.cwd;
      const common = path => realpathSync(resolve(path, execFileSync("git", ["-C", path, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim()));
      if (cwd !== prepared.worktree || common(cwd) !== common(project.path)
        || !userTexts(snapshot).some(text => text.includes(marker))) throw new Error("Native prepared task ownership is unproven");
      refs.set(key, ref);
      return [ref];
    }
    const intent = store.readHostTask({ runId: runIdentity.runId, issueId });
    if (!intent) return [];
    const listing = await call("list_threads", { limit: 50 });
    const found = [];
    for (const task of [...(listing.pinnedThreads ?? []), ...(listing.threads ?? [])]) {
      if (task.kind !== "codex" || task.projectId !== project.projectId || task.hostId !== project.hostId) continue;
      const ref = { threadId: task.id, hostId: task.hostId };
      const snapshot = await readHistory(ref, value => value.thread.preview?.startsWith(`${key}\n`) || userTexts(value).includes(intent.prompt));
      if (snapshot.thread.preview?.startsWith(`${key}\n`) || userTexts(snapshot).includes(intent.prompt)) found.push(ref);
    }
    if (found.length === 0 && project.path && project.hostId === "local") {
      const since = intent.createdAt ?? store.readEvents(runIdentity.runId).find(({ type }) => type === "grant.recorded")?.at;
      const common = (cwd) => realpathSync(resolve(cwd, execFileSync("git", ["-C", cwd, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim()));
      for (const hint of await discoverLocalCodexTasks({ prompt: intent.prompt, since })) {
        const ref = { threadId: hint.threadId, hostId: hint.hostId };
        const snapshot = await readHistory(ref, value => userTexts(value).includes(intent.prompt));
        const cwd = snapshot.thread.cwd;
        if (cwd === hint.cwd && common(cwd) === common(project.path) && userTexts(snapshot).includes(intent.prompt)) found.push(ref);
      }
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
    let created;
    try { created = await call("create_thread", { title: `Workflow Issue ${number}`, prompt,
      target: { type: "project", projectId: project.projectId,
        environment: { type: "worktree", startingState: { type: "branch", branchName: runIdentity.target } } } }); }
    catch { created = { uncertain: true }; }
    if (created.threadId && created.hostId) {
      const ref = { threadId: created.threadId, hostId: created.hostId };
      refs.set(key, ref);
      return ref;
    }
    // clientThreadId is a setup operation, never a task reference.
    if (created.clientThreadId || created.uncertain) {
      for (const delay of [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000]) {
        await sleep(delay);
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
      const issue = prompt.match(/(?:close|retry|repair) (?:parent )?Issue (I_[A-Za-z0-9_-]+)/u);
      if (issue) prompt = prompt.replace(`Issue ${issue[1]}`, `Issue #${await issueNumber(issue[1])}`);
      const frozenPrompt = `Use the exact installed skill ${join(packageRoot, "skills/engineering", prompt.includes("$close-issue") ? "close-issue" : "execute-issue", "SKILL.md")}.\n${prompt}`;
      for (const delay of [1000, 5000, 15000]) {
        try { await call("send_message_to_thread", { ...ref, prompt: frozenPrompt }); return; }
        catch (error) {
          // Even a failed response may have accepted the message. Never resend without native read-back.
          await sleep(delay);
          const snapshot = await readHistory(ref, value => userTexts(value).includes(frozenPrompt));
          if (userTexts(snapshot).includes(frozenPrompt)) return;
          if (snapshot.thread.status?.type !== "idle") throw new Error("Message outcome is unresolved; preserve the running task", { cause: error });
        }
      }
      throw new Error("Task message retry budget exhausted after native read-back");
    },
    async wait(taskRefs) {
      const result = await call("wait_threads", { targets: taskRefs.map((ref) => ({ ...ref, ...(cursors.has(ref.threadId) ? { afterCursor: cursors.get(ref.threadId) } : {}) })), timeoutMs: 30000 });
      // Fresh task status is authoritative; a wait timeout or commentary is not completion.
      for (const target of result.polls ?? result.results ?? result.threads ?? []) {
        const threadId = target.thread?.id ?? target.threadId;
        if (threadId && target.cursor) cursors.set(threadId, target.cursor);
      }
      const states = await Promise.all(taskRefs.map(read));
      return { coordinatorActive: !host.disconnected, taskSettled: states.every(({ state }) => state === "RESUMABLE"),
        ...(states.length === 1 && states[0].closeRequest ? { closeRequestIdentity: states[0].closeRequest.requestIdentity } : {}) };
    },
  };
}
