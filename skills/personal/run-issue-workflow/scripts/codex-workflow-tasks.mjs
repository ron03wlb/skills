import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { join, resolve } from "node:path";
import { delegatedInput, discoverLocalCodexTasks } from "./codex-task-discovery.mjs";
import { modelEvidenceDigest, validateModelDecision, validateModelPolicy, astraSetting, confirmedModelUnavailable, creationUnavailable } from "./issue-model-policy.mjs";

export function unwrapCodexResult(result) {
  if (result?.isError) throw Object.assign(new Error(result.content?.find(({ type }) => type === "text")?.text ?? "Codex host tool failed"), { nativeResult: result });
  if (result?.structuredContent) return result.structuredContent;
  const body = result?.content?.find(({ type }) => type === "text")?.text;
  return body === undefined ? result : JSON.parse(body);
}
const userTexts = (snapshot) => (snapshot.turns ?? []).flatMap(({ items }) => (items ?? []).flatMap((item) =>
  item.type === "userMessage" ? item.content?.filter(({ type }) => type === "text").map(({ text }) => text) ?? []
    : item.type === "functionCallOutput" && delegatedInput(item) !== null ? [delegatedInput(item)] : []));
const markerFor = ({ runId, issueId }) => `Workflow lane ${createHash("sha256").update(JSON.stringify({ runId, issueId })).digest("hex")}`;
const uncertainNativeResult = result => [result?.type, result?.status].some(value => ["error", "failed", "response-accepted"].includes(value));

const workflowSourceBoundary = packageRoot => `Matt/Ron workflow owners and runtime remain pinned to ${packageRoot}, including its skills/ and shared docs/ references. Generic host support skills explicitly required by repository or higher-priority instructions use their installed sources from the current session's skill catalog; they do not replace a packaged workflow owner. Diagnose a truly missing dependency. Preserve original accepted task creation intents and identity across re-entry.`;

export function createCodexWorkflowTasks({ host, store, project, packageRoot, issueNumber, sleep = setTimeout, discoverTasks = discoverLocalCodexTasks }) {
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
    const snapshot = await readHistory(ref, value => userTexts(value).some(text => /(?:Close request identity:|Retry request:|Repair request:|Recovery request:|Model upgrade request:)/u.test(text)));
    if (snapshot.thread?.id !== ref.threadId || snapshot.thread?.hostId !== ref.hostId) throw new Error("Task read-back identity differs");
    const type = snapshot.thread.status?.type;
    const prompt = userTexts(snapshot).find((text) => text.includes("Close request identity:"));
    let closeRequest;
    if (prompt) {
      const match = prompt.match(/Close request identity: (sha256:[a-f0-9]{64})\. Current close request evidence: (\{[^\n]+\})/u);
      if (!match) throw new Error("Task close request evidence is malformed");
      const evidence = JSON.parse(match[2]);
      const continuation = prompt.match(/^Close continuation: (\{.+\})$/mu);
      closeRequest = { state: "ACCEPTED", requestIdentity: match[1], runId: evidence.runIdentity.runId, issueId: evidence.issueId, evidence, ...(continuation ? { continuation: JSON.parse(continuation[1]) } : {}) };
    }
    const retryPrompt = userTexts(snapshot).find((text) => text.includes("Retry request: "));
    const retryMatch = retryPrompt?.match(/Retry request: (\{.+\})$/u);
    const retryRequest = retryMatch ? { state: "ACCEPTED", ...JSON.parse(retryMatch[1]) } : undefined;
    const repairPrompt = userTexts(snapshot).find(text => text.includes("Repair request: "));
    const repairMatch = repairPrompt?.match(/Repair request: (\{.+\})$/u);
    const repairRequest = repairMatch ? { state: "ACCEPTED", ...JSON.parse(repairMatch[1]) } : undefined;
    const modelMatch = userTexts(snapshot).find(text => text.includes("Model upgrade request: "))?.match(/Model upgrade request: (\{.+\})$/mu);
    const modelRequest = modelMatch ? { state: "ACCEPTED", ...JSON.parse(modelMatch[1]) } : undefined;
    const final = (snapshot.turns?.[0]?.items ?? []).findLast(item => item.type === "agentMessage" && item.phase === "final_answer")?.text;
    const modelYieldMatch = final?.match(/^Workflow model yield: (\{.+\})$/mu);
    const modelYield = modelYieldMatch ? JSON.parse(modelYieldMatch[1]) : undefined;
    const recoveryPrompt = userTexts(snapshot).find(text => text.includes("Recovery request: "));
    const recoveryMatch = recoveryPrompt?.match(/^Recovery request: (\{.+\})$/mu);
    const recoveryRequest = recoveryMatch ? { state: "ACCEPTED", ...JSON.parse(recoveryMatch[1]) } : undefined;
    const finals = (snapshot.turns ?? []).flatMap(turn => (turn.items ?? []).filter(item => item.type === "agentMessage" && item.phase === "final_answer").map(item => item.text));
    const closeResultMatch = finals.map(final => final?.match(/^Workflow close result: (\{.+\})$/mu)).find(Boolean);
    const closeResult = closeResultMatch ? JSON.parse(closeResultMatch[1]) : undefined;
    const recoveryResultMatch = finals.map(final => final?.match(/^Workflow recovery result: (\{.+\})$/mu)).find(Boolean);
    const recoveryResult = recoveryResultMatch ? JSON.parse(recoveryResultMatch[1]) : undefined;
    const settled = type === "idle" || type === "notLoaded" && snapshot.turns?.[0]?.status === "completed";
    return { state: type === "active" ? "RUNNING" : settled ? "RESUMABLE" : "UNKNOWN",
      closeRequest, retryRequest, repairRequest, modelRequest, modelYield, recoveryRequest, recoveryResult, closeResult, snapshot, cwd: snapshot.thread.cwd };
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
      const common = path => realpathSync.native(resolve(path, execFileSync("git", ["-C", path, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim()));
      if (cwd !== prepared.worktree || common(cwd) !== common(project.path)
        || !userTexts(snapshot).some(text => text.includes(marker))) throw new Error("Native prepared task ownership is unproven");
      refs.set(key, ref);
      return [ref];
    }
    const intent = store.readHostTask({ runId: runIdentity.runId, issueId });
    if (!intent) return [];
    if (creationUnavailable(store.readEvents(runIdentity.runId), issueId)) return [];
    const found = [];
    if (project.path && project.hostId === "local") {
      const since = intent.createdAt ?? store.readEvents(runIdentity.runId).find(({ type }) => type === "grant.recorded")?.at;
      const common = (cwd) => realpathSync.native(resolve(cwd, execFileSync("git", ["-C", cwd, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim()));
      for (const hint of await discoverTasks({ prompt: intent.prompt, since })) {
        const ref = { threadId: hint.threadId, hostId: hint.hostId };
        const snapshot = await readHistory(ref, value => userTexts(value).includes(intent.prompt));
        const cwd = snapshot.thread.cwd;
        if (cwd !== hint.cwd || common(cwd) !== common(project.path) || !userTexts(snapshot).includes(intent.prompt)) {
          throw new Error("Native discovered task ownership is unproven");
        }
        found.push(ref);
      }
      if (found.length) {
        if (found.length === 1) refs.set(key, found[0]);
        return found;
      }
    }
    const listing = await call("list_threads", { limit: 50 });
    for (const task of [...(listing.pinnedThreads ?? []), ...(listing.threads ?? [])]) {
      if (task.kind !== "codex" || task.projectId !== project.projectId || task.hostId !== project.hostId) continue;
      // This intent creates a worktree. A task in the saved checkout cannot own it.
      if (project.path && task.cwd === project.path) continue;
      const ref = { threadId: task.id, hostId: task.hostId };
      const snapshot = await readHistory(ref, value => value.thread.preview?.startsWith(`${key}\n`) || userTexts(value).includes(intent.prompt));
      if (snapshot.thread.preview?.startsWith(`${key}\n`) || userTexts(snapshot).includes(intent.prompt)) found.push(ref);
    }
    if (found.length === 0) throw new Error("TASK_CREATION_UNRESOLVED: preserve the recorded intent and inspect the host; do not create another task");
    if (found.length === 1) refs.set(key, found[0]);
    return found;
  };
  const create = async ({ issueId, runIdentity, modelInput, modelDecision, writer }) => {
    const key = markerFor({ runId: runIdentity.runId, issueId });
    const number = await issueNumber(issueId);
    if (host.disconnected) throw new Error("CODEX_HOST_DISCONNECTED");
    // Existing intents (including field-less historical intents) retain their original request.
    const previous = store.readHostTask({ runId: runIdentity.runId, issueId });
    if (previous) {
      if (creationUnavailable(store.readEvents(runIdentity.runId), issueId)) throw new Error("MODEL_UNAVAILABLE: native Astra rejection proved no task was submitted");
      const existing = await findIssueLane({ issueId, runIdentity });
      if (existing.length !== 1) throw new Error("ISSUE_LANE_AMBIGUOUS");
      return existing[0];
    }
    const policy = store.readEvents(runIdentity.runId).find(event => event.type === "grant.recorded")?.modelPolicy;
    let selection;
    if (policy) {
      validateModelPolicy(policy, runIdentity);
      if (!writer?.append) throw new Error("Model selection requires the owning Run writer");
      if (modelInput?.issueId !== issueId || modelInput.specId !== runIdentity.specId || modelInput.approvedScopeHash !== runIdentity.approvedScopeHash) throw new Error("Model input authority differs");
      selection = validateModelDecision(modelDecision, modelInput);
    }
    const prompt = `${key}\nUse the installed workflow's exact skill at ${join(packageRoot, "skills/engineering/execute-issue/SKILL.md")} to execute Issue #${number}.\nRead the current Issue and only its required linked scope. Run Grant: ${JSON.stringify(runIdentity)}. Read its grant.recorded event from the repository Git common directory before any mutation.\nUse this task's existing Git worktree as the sole Issue lane after verifying its common directory, target ancestry and ownership. Record this worktree and branch; do not create a second worktree. Target: ${runIdentity.target}. Complete implementation, required verification, independent review and implementation_complete read-back, then stop. A later close request owns integration and closure. No push or deployment. ${workflowSourceBoundary(packageRoot)}`;
    const nativeRequest = { title: `Workflow Issue ${number}`, prompt,
      target: { type: "project", projectId: project.projectId,
        environment: { type: "worktree", startingState: { type: "branch", branchName: runIdentity.target } } },
      ...(selection ? { model: selection.model, thinking: selection.thinking } : {}) };
    const reservation = store.reserveHostTask({ runId: runIdentity.runId, issueId, prompt,
      ...(selection ? { modelDecision: selection, nativeRequest } : {}) });
    if (!reservation.created) {
      const existing = await findIssueLane({ issueId, runIdentity });
      if (existing.length !== 1) throw new Error("ISSUE_LANE_AMBIGUOUS");
      return existing[0];
    }
    let created;
    const submit = async (request, phase) => {
      let result, unavailable = false;
      try { result = await call("create_thread", request); }
      catch (error) { unavailable = Boolean(selection) && confirmedModelUnavailable(error, request.model); result = { uncertain: !unavailable }; }
      const accepted = !uncertainNativeResult(result) && Boolean(result?.threadId && result.hostId || result?.clientThreadId);
      if (selection) writer.append({ type: "model.acceptance", at: new Date().toISOString(), issueId,
        requestIdentity: modelEvidenceDigest(request), model: request.model, thinking: request.thinking,
        phase, acceptance: unavailable ? "unavailable" : accepted ? "accepted" : "unknown",
        effectiveReadBack: "unavailable", evidence: unavailable ? "Native MODEL_UNAVAILABLE rejection explicitly confirms requestSubmitted=false."
          : accepted ? "Native task creation returned an accepted task/setup identity."
            : "Native creation result is uncertain; transport acknowledgement is not model acceptance." });
      return { ...result, accepted, unavailable, ...(!accepted && !unavailable ? { uncertain: true } : {}) };
    };
    created = await submit(nativeRequest, "creation");
    if (created.unavailable && selection.model !== "gpt-6-astra") {
      const replacement = { ...nativeRequest, ...astraSetting(selection) };
      writer.append({ type: "model.substitution", at: new Date().toISOString(), issueId, fromModel: selection.model,
        model: replacement.model, thinking: replacement.thinking, requestIdentity: modelEvidenceDigest(replacement),
        reason: "The selected model was explicitly unavailable before creation; substitute Astra directly under the approved policy." });
      created = await submit(replacement, "substitution");
    }
    if (created.unavailable) throw new Error("MODEL_UNAVAILABLE: Astra is unavailable; preserve this Issue and its original intent");
    if (created.accepted && created.threadId && created.hostId) {
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
    async ensureMaintenanceTask({ issueId, runIdentity, failure, originalTaskRef }) {
      const scope = failure.diagnosis?.maintenance;
      if (!scope || !["repositoryId", "sourceRepository", "target", "approvedScopeHash", "authority", "operationId"].every(key => typeof scope[key] === "string" && scope[key])) {
        throw new Error("Governing-workflow maintenance needs its exact canonical repository, target, scoped authority and operation");
      }
      if (!Number.isInteger(scope.repairWaveCount) || scope.repairWaveCount < 0 || scope.repairWaveCount >= 10) throw new Error("Maintenance cumulative repair budget is unproved or exhausted");
      const previous = await read(originalTaskRef);
      if (previous.state !== "RESUMABLE" || previous.cwd !== failure.worktree || previous.snapshot.turns?.[0]?.status !== "completed") throw new Error("Maintenance previous writer has not settled");
      const projects = (await call("list_projects", {})).projects ?? [];
      const matching = projects.filter(item => item.isGitRepository === true && item.hostId === project.hostId && item.path
        && realpathSync.native(item.path) === realpathSync.native(scope.sourceRepository));
      if (matching.length !== 1) throw new Error("Maintenance canonical source has no unique saved Git project");
      const maintenanceProject = matching[0];
      const purpose = `maintenance:${scope.operationId}`;
      const { repairWaveCount, ...scopeAuthority } = scope;
      const prompt = `Workflow maintenance ownership: ${JSON.stringify({ runId: runIdentity.runId, issueId, scope: scopeAuthority })}\nRead-only setup: preserve this isolated maintenance worktree and wait for the exact scoped maintenance request. Do not edit, commit, install or touch the product checkout during setup. ${workflowSourceBoundary(packageRoot)}`;
      if (host.disconnected) throw new Error("CODEX_HOST_DISCONNECTED");
      const reservation = store.reserveHostTask({ runId: runIdentity.runId, issueId, purpose, prompt });
      if (reservation.intent.prompt !== prompt) throw new Error("Existing maintenance operation has different failure/scope evidence; reconcile its owner instead of recreating it");
      let taskRef;
      if (reservation.created) {
        try {
          const created = await call("create_thread", { title: "Workflow maintenance", prompt, target: { type: "project", projectId: maintenanceProject.id ?? maintenanceProject.projectId,
            environment: { type: "worktree", startingState: { type: "branch", branchName: scope.target } } } });
          if (created.threadId && created.hostId) taskRef = { threadId: created.threadId, hostId: created.hostId };
        } catch { /* The persisted maintenance intent owns discovery after uncertainty. */ }
      }
      const nativeListing = taskRef ? {} : await call("list_threads", { limit: 50 });
      const listing = [...(nativeListing.pinnedThreads ?? []), ...(nativeListing.threads ?? [])];
      const hints = taskRef ? [taskRef] : listing.filter(item => item.kind === "codex" && item.hostId === project.hostId
        && item.projectId === (maintenanceProject.id ?? maintenanceProject.projectId)).map(item => ({ threadId: item.id, hostId: item.hostId }));
      if (!taskRef && project.hostId === "local") hints.push(...await discoverTasks({ prompt, since: reservation.intent.createdAt }));
      const matches = [];
      const common = cwd => realpathSync.native(resolve(cwd, execFileSync("git", ["-C", cwd, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim()));
      for (const ref of new Map(hints.map(ref => [ref.threadId, { threadId: ref.threadId, hostId: ref.hostId }])).values()) {
        const snapshot = await readHistory(ref, value => userTexts(value).includes(prompt));
        if (userTexts(snapshot).includes(prompt) && realpathSync.native(snapshot.thread.cwd) !== realpathSync.native(scope.sourceRepository)
          && realpathSync.native(snapshot.thread.cwd) !== realpathSync.native(failure.worktree)
          && common(snapshot.thread.cwd) === common(scope.sourceRepository)) matches.push(ref);
      }
      if (matches.length !== 1) throw new Error(`Maintenance task creation is unresolved (${matches.length} exact matches); preserve its intent`);
      if ((await read(originalTaskRef)).state !== "RESUMABLE") throw new Error("Maintenance previous writer became active");
      return { taskRef: matches[0], previousOwner: { taskRef: originalTaskRef, state: "SETTLED", worktree: failure.worktree, turnId: previous.snapshot.turns[0].id ?? null } };
    },
    async ensureRecoveryTask({ issueId, runIdentity, operationId, originalTaskRef, worktree }) {
      if (originalTaskRef?.hostId !== project.hostId || !worktree || !operationId) throw new Error("Recovery lane ownership is incomplete");
      const settledOwner = async () => {
        const previous = await read(originalTaskRef);
        if (previous.state !== "RESUMABLE" || previous.snapshot.turns?.[0]?.status !== "completed" || previous.cwd !== worktree) throw new Error("Recovery previous writer has not settled in the exact worktree");
        const common = path => realpathSync.native(resolve(path, execFileSync("git", ["-C", path, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim()));
        if (common(worktree) !== common(project.path)) throw new Error("Recovery repository common directory differs");
        return { taskRef: originalTaskRef, state: "SETTLED", worktree, turnId: previous.snapshot.turns[0].id ?? null };
      };
      await settledOwner();
      const purpose = `recovery:${operationId}`;
      const marker = `Workflow recovery ownership: ${JSON.stringify({ runId: runIdentity.runId, issueId, operationId, originalTaskRef, worktree })}`;
      const prompt = `${marker}\nThe coordinator is transferring this exact Issue worktree to an isolated repair task. Settle this turn without source edits, commits, closeout or installation. Preserve the original operation and worktree. Subsequent repair messages belong only to the recorded repair task. ${workflowSourceBoundary(packageRoot)}`;
      const reservation = store.reserveHostTask({ runId: runIdentity.runId, issueId, purpose, prompt });
      if (reservation.intent.prompt !== prompt) throw new Error("Recovery ownership intent differs; preserve the original request");
      const history = await readHistory(originalTaskRef, value => userTexts(value).includes(prompt));
      if (!userTexts(history).includes(prompt)) {
        // The immutable handoff intent precedes even this read-only settlement message.
        try { await call("send_message_to_thread", { ...originalTaskRef, prompt }); }
        catch { /* Read native history before deciding whether the handoff was accepted. */ }
        const accepted = await readHistory(originalTaskRef, value => userTexts(value).includes(prompt));
        if (!userTexts(accepted).includes(prompt)) throw new Error("Recovery ownership message outcome is unresolved");
        if ((await read(originalTaskRef)).state === "RUNNING") return { pending: true, waitingRef: originalTaskRef };
      }
      const previousOwner = await settledOwner();
      const discover = async () => {
        const listing = await call("list_threads", { limit: 50 });
        const hints = [...(listing.pinnedThreads ?? []), ...(listing.threads ?? [])].filter(item => item.kind === "codex" && item.hostId === project.hostId && item.cwd === worktree)
          .map(item => ({ threadId: item.id, hostId: item.hostId }));
        if (project.hostId === "local") hints.push(...await discoverTasks({ prompt, since: reservation.intent.createdAt }));
        const matches = [];
        for (const ref of new Map(hints.filter(ref => ref.threadId !== originalTaskRef.threadId).map(ref => [ref.threadId, { threadId: ref.threadId, hostId: ref.hostId }])).values()) {
          const snapshot = await readHistory(ref, value => userTexts(value).includes(prompt));
          if (snapshot.thread.cwd === worktree && userTexts(snapshot).includes(prompt)) matches.push(ref);
        }
        if (matches.length > 1) throw new Error("Recovery task ownership is ambiguous; preserve all matches");
        return matches[0];
      };
      let taskRef = await discover();
      const forkPurpose = `${purpose}:fork`;
      if (!taskRef) {
        if (host.disconnected) throw new Error("CODEX_HOST_DISCONNECTED");
        const fork = store.reserveHostTask({ runId: runIdentity.runId, issueId, purpose: forkPurpose, prompt });
        if (fork.created) {
          await settledOwner();
          try {
            const created = await call("fork_thread", { threadId: originalTaskRef.threadId, environment: { type: "same-directory" } });
            if (created.threadId) taskRef = { threadId: created.threadId, hostId: created.hostId ?? project.hostId };
          } catch { /* A lost response is reconciled; the fork intent forbids another creation. */ }
        }
        taskRef ??= await discover();
        if (!taskRef) return { pending: true, reason: "RECOVERY_TASK_SETUP_UNRESOLVED", waitingRef: originalTaskRef };
      }
      if (taskRef.threadId === originalTaskRef.threadId) throw new Error("Repair requires a separate task");
      const snapshot = await readHistory(taskRef, value => userTexts(value).includes(prompt));
      if (snapshot.thread.cwd !== worktree || !userTexts(snapshot).includes(prompt)) throw new Error("Recovery fork does not preserve the exact ownership handoff");
      await settledOwner();
      return { taskRef, previousOwner };
    },
    async upgrade({ ref, intent, runIdentity, writer }) {
      const stored = store.readEvents(runIdentity.runId).find(event => event.type === "model.upgrade" && event.issueId === intent.issueId);
      if (!stored || JSON.stringify(stored) !== JSON.stringify(intent) || ref.threadId !== intent.taskRef.threadId || ref.hostId !== intent.taskRef.hostId) {
        throw new Error("Upgrade requires the exact durable reservation and original task");
      }
      const marker = { runId: runIdentity.runId, issueId: intent.issueId, requestIdentity: intent.requestIdentity,
        candidate: intent.candidate, repairWaves: intent.repairWaves, yieldIdentity: intent.yieldIdentity };
      const prompt = `Use the exact installed skill ${join(packageRoot, "skills/engineering/execute-issue/SKILL.md")} to resume Issue #${await issueNumber(intent.issueId)} after its controlled model yield. Continue in the same worktree and topic from candidate ${intent.candidate}, with ${intent.repairWaves}/10 repair waves already consumed. The sole automatic upgrade is consumed. Preserve the unchanged Grant, ACs, exclusions and completed work; verify and independently review the next material repair, then publish implementation_complete only when proved. Model upgrade request: ${JSON.stringify(marker)}`;
      const snapshot = await readHistory(ref, value => userTexts(value).includes(prompt));
      if (userTexts(snapshot).includes(prompt)) return { observed: true, effectiveReadBack: "unavailable" };
      const receipts = store.readEvents(runIdentity.runId).filter(event => event.type === "model.acceptance" && event.requestIdentity === intent.requestIdentity);
      if (receipts.some(event => event.acceptance === "accepted") || receipts.length >= 3) throw new Error("Upgrade outcome unresolved; preserve the original continuation");
      const task = await read(ref);
      if (task.state !== "RESUMABLE" || task.cwd !== intent.worktree) throw new Error("Upgrade cannot race an active or unowned executor");
      const git = (...args) => execFileSync("git", ["-C", intent.worktree, ...args], { encoding: "utf8" }).trim();
      if (git("rev-parse", "HEAD") !== intent.candidate || git("branch", "--show-current") !== intent.topic || git("status", "--porcelain=v1")) throw new Error("Upgrade candidate or clean worktree changed");
      let result;
      try { result = await call("send_message_to_thread", { ...ref, prompt, model: intent.model, thinking: intent.thinking }); }
      catch { result = null; }
      const accepted = result?.threadId === ref.threadId && (result.hostId === undefined || result.hostId === ref.hostId)
        && !uncertainNativeResult(result);
      writer.append({ type: "model.acceptance", at: new Date().toISOString(), issueId: intent.issueId, requestIdentity: intent.requestIdentity,
        model: intent.model, thinking: intent.thinking, phase: "upgrade", acceptance: accepted ? "accepted" : "unknown",
        effectiveReadBack: "unavailable", evidence: accepted ? "Native continuation returned the original task identity."
          : "Continuation submission is uncertain; independently reconcile its original message before any resend." });
      if (accepted) return { accepted: true, effectiveReadBack: "unavailable" };
      const after = await readHistory(ref, value => userTexts(value).includes(prompt));
      if (userTexts(after).includes(prompt)) return { observed: true, effectiveReadBack: "unavailable" };
      throw new Error("Upgrade continuation outcome unresolved; preserve the original request");
    },
    async observePendingCreations({ runIdentity, issueIds }) {
      const observations = [];
      const dispatched = new Set(store.readEvents(runIdentity.runId).filter(event => event.type === "dispatch.recorded").map(event => event.issueId));
      for (const issueId of issueIds) {
        if (dispatched.has(issueId) || !store.readHostTask({ runId: runIdentity.runId, issueId })) continue;
        if (creationUnavailable(store.readEvents(runIdentity.runId), issueId)) continue;
        try { observations.push({ issueId, refs: await findIssueLane({ issueId, runIdentity }) }); }
        catch (error) { observations.push({ issueId, error: error.message }); }
      }
      return observations;
    },
    async message(ref, prompt) {
      const issue = prompt.match(/(?:close|retry|repair) (?:parent )?Issue (I_[A-Za-z0-9_-]+)/u);
      if (issue) prompt = prompt.replace(`Issue ${issue[1]}`, `Issue #${await issueNumber(issue[1])}`);
      const frozenPrompt = `Use the exact installed skill ${join(packageRoot, "skills/engineering", prompt.includes("$close-issue") ? "close-issue" : "execute-issue", "SKILL.md")}.\n${workflowSourceBoundary(packageRoot)}\n${prompt}`;
      const previous = await readHistory(ref, value => userTexts(value).includes(frozenPrompt));
      if (userTexts(previous).includes(frozenPrompt)) return;
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
