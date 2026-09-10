import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";
import { join, resolve } from "node:path";
import { delegatedInput, discoverLocalCodexTasks } from "./codex-task-discovery.mjs";
import { createCodexCloseReceipts, createCodexMessageReceipts } from "./codex-close-receipts.mjs";
import { completedCloseCleanup } from "./close-continuation.mjs";
import { modelEvidenceDigest, validateModelDecision, validateModelPolicy, astraSetting, confirmedModelUnavailable, creationUnavailable } from "./issue-model-policy.mjs";
import { BOUNDED_OBSERVATION_RECOVERY_DELAYS_MS, createBoundedObservationFault } from "./run-store.mjs";

export function unwrapCodexResult(result) {
  if (result?.isError) throw Object.assign(new Error(result.content?.find(({ type }) => type === "text")?.text ?? "Codex host tool failed"), { nativeResult: result });
  if (result?.structuredContent) return result.structuredContent;
  const body = result?.content?.find(({ type }) => type === "text")?.text;
  return body === undefined ? result : JSON.parse(body);
}
const userTexts = (snapshot) => (snapshot.turns ?? []).flatMap(({ items }) => (items ?? []).flatMap((item) =>
  item.type === "userMessage" ? item.content?.filter(({ type }) => type === "text").map(({ text }) => text) ?? []
    : item.type === "functionCallOutput" && delegatedInput(item) !== null ? [delegatedInput(item)] : []));
const ownerHistory = snapshot => ({ ...snapshot, turns: (snapshot.turns ?? []).map(turn => ({ ...turn,
  items: (turn.items ?? []).filter(item => item.type === "userMessage" || item.type === "agentMessage" && item.phase === "final_answer"
    || item.type === "functionCallOutput" && delegatedInput(item) !== null),
})) });
const markerFor = ({ runId, issueId }) => `Workflow lane ${createHash("sha256").update(JSON.stringify({ runId, issueId })).digest("hex")}`;
const promptIdentityFor = prompt => `sha256:${createHash("sha256").update(JSON.stringify(prompt)).digest("hex")}`;
const uncertainNativeResult = result => [result?.type, result?.status].some(value => ["error", "failed", "response-accepted"].includes(value));
const closeRequestFrom = prompt => {
  if (!prompt) return undefined;
  const match = prompt.match(/Close request identity: (sha256:[a-f0-9]{64})\. Current close request evidence: (\{[^\n]+\})/u);
  if (!match) throw new Error("Task close request evidence is malformed");
  const evidence = JSON.parse(match[2]);
  const continuation = prompt.match(/^Close continuation: (\{.+\})$/mu);
  return { state: "ACCEPTED", requestIdentity: match[1], runId: evidence.runIdentity.runId, issueId: evidence.issueId, evidence,
    ...(continuation ? { continuation: JSON.parse(continuation[1]) } : {}) };
};
const assertCloseOutcomeIdentity = (result, request) => {
  if (result.runId !== request.runId || result.issueId !== request.issueId
    || result.requestIdentity !== request.requestIdentity) throw new Error("Native close outcome identity differs from its accepted request");
};
const taskRequestFrom = prompt => {
  if (!prompt) return undefined;
  const match = [
    ["retry", /Retry request: (\{.+\})$/mu],
    ["repair", /Repair request: (\{.+\})$/mu],
    ["recovery", /Recovery request: (\{.+\})$/mu],
    ["upgrade", /Model upgrade request: (\{.+\})$/mu],
    ["recovery-handoff", /Workflow recovery ownership: (\{.+\})$/mu],
  ].map(([kind, pattern]) => [kind, prompt.match(pattern)]).find(([, value]) => value);
  if (!match) return undefined;
  const [kind, parsed] = match;
  const request = JSON.parse(parsed[1]);
  const fields = {
    retry: ["runId", "issueId", "attempt"],
    repair: ["runId", "issueId", "candidate", "baseline", "wave", "requestIdentity"],
    recovery: ["runId", "issueId", "operationId", "requestIdentity", "phase", "wave", "failureIdentity"],
    upgrade: ["runId", "issueId", "requestIdentity", "candidate", "repairWaves", "yieldIdentity"],
    "recovery-handoff": ["runId", "issueId", "operationId"],
  }[kind];
  if (request === null || typeof request !== "object" || Array.isArray(request)
    || Object.keys(request).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(request, key))
    || typeof request.runId !== "string" || !request.runId || typeof request.issueId !== "string" || !request.issueId) {
    throw new Error(`Task ${kind} request evidence is malformed`);
  }
  if (kind === "retry" && (!Number.isInteger(request.attempt) || request.attempt < 1)) {
    throw new Error("Task retry request evidence is malformed");
  }
  if (kind === "repair" && (!Number.isInteger(request.wave) || request.wave < 1 || request.wave > 10
    || !/^[a-f0-9]{40,64}$/u.test(request.candidate) || !/^[a-f0-9]{40,64}$/u.test(request.baseline)
    || !/^sha256:[a-f0-9]{64}$/u.test(request.requestIdentity))) {
    throw new Error("Task repair request evidence is malformed");
  }
  if (kind === "recovery" && (typeof request.operationId !== "string" || !request.operationId
    || !/^sha256:[a-f0-9]{64}$/u.test(request.requestIdentity)
    || typeof request.phase !== "string" || !request.phase
    || request.wave !== null && (!Number.isInteger(request.wave) || request.wave < 1 || request.wave > 10)
    || typeof request.failureIdentity !== "string" || !request.failureIdentity)) {
    throw new Error("Task recovery request evidence is malformed");
  }
  if (kind === "upgrade" && (!/^sha256:[a-f0-9]{64}$/u.test(request.requestIdentity)
    || !/^[a-f0-9]{40,64}$/u.test(request.candidate)
    || !Number.isInteger(request.repairWaves) || request.repairWaves < 2 || request.repairWaves >= 10
    || !/^sha256:[a-f0-9]{64}$/u.test(request.yieldIdentity))) {
    throw new Error("Task upgrade request evidence is malformed");
  }
  if (kind === "recovery-handoff" && (typeof request.operationId !== "string" || !request.operationId)) {
    throw new Error("Task recovery handoff request evidence is malformed");
  }
  return { kind, request, promptIdentity: promptIdentityFor(prompt) };
};

const workflowSourceBoundary = packageRoot => `Matt/Ron workflow owners and runtime remain pinned to ${packageRoot}, including its skills/ and shared docs/ references. Generic host support skills explicitly required by repository or higher-priority instructions use their installed sources from the current session's skill catalog; they do not replace a packaged workflow owner. Diagnose a truly missing dependency. Preserve original accepted task creation intents and identity across re-entry.`;

export function createCodexWorkflowTasks({ host, store, project, packageRoot, issueNumber, readIssueState, runId, sleep = setTimeout,
  discoverTasks = discoverLocalCodexTasks, readObservationSignal = async () => null, waitForObservationSignal,
  monotonicNow = () => performance.now() }) {
  const refs = new Map();
  const cursors = new Map();
  const taskRuns = new Map();
  const transientFaults = new Map();
  const taskObservations = new Map();
  const executionStartEvidence = new Map();
  const fallbackRounds = new Map();
  let batchOffset = 0;
  let eventWaitSupported = true;
  let hostCallCount = 0;
  let hostReturnedBytes = 0;
  const waitSignal = waitForObservationSignal ?? (async ({ timeoutMs }) => {
    const expiresAt = Date.now() + timeoutMs;
    for (;;) {
      const signal = await readObservationSignal();
      if (signal?.control || signal?.deadline) return signal;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) return null;
      await sleep(Math.min(1000, remaining));
    }
  });
  const observationDeadline = budget => ({ deadline: new Date(Date.now() + Math.max(0, budgetRemaining(budget))).toISOString() });
  const budgetRemaining = budget => budget === null ? Number.POSITIVE_INFINITY : Math.max(0,
    budget.limitMs - Math.max(budget.simulatedElapsedMs, Math.max(0, monotonicNow() - budget.startedAt)));
  const waitWithinBudget = async (timeoutMs, budget) => {
    const remainingMs = budgetRemaining(budget);
    if (remainingMs <= 0) return observationDeadline(budget);
    const boundedMs = Math.min(timeoutMs, Math.ceil(remainingMs));
    const signal = await waitSignal({ timeoutMs: boundedMs, readSignal: readObservationSignal });
    if (!signal && budget !== null) budget.simulatedElapsedMs += boundedMs;
    return signal ?? (budgetRemaining(budget) <= 0 ? observationDeadline(budget) : null);
  };
  const receiptsFor = (ref, selectedRunId = taskRuns.get(ref.threadId) ?? runId) => {
    if (!selectedRunId || !store?.gitCommonDir) return null;
    taskRuns.set(ref.threadId, selectedRunId);
    return createCodexCloseReceipts({ gitCommonDir: store.gitCommonDir, runId: selectedRunId, taskRef: ref });
  };
  const messageReceiptsFor = (ref, selectedRunId = taskRuns.get(ref.threadId) ?? runId) => {
    if (!selectedRunId || !store?.gitCommonDir) return null;
    taskRuns.set(ref.threadId, selectedRunId);
    return createCodexMessageReceipts({ gitCommonDir: store.gitCommonDir, runId: selectedRunId, taskRef: ref });
  };
  const recoveryDelaysMs = BOUNDED_OBSERVATION_RECOVERY_DELAYS_MS;
  const faultCategory = error => [
    ["timeout", /timeout/iu], ["temporary", /temporar/iu], ["unavailable", /unavailable/iu],
    ["connection", /connection/iu], ["response-lost", /response lost/iu],
    ["rate-limit", /rate.?limit/iu], ["network", /network/iu],
  ].find(([, pattern]) => pattern.test(error.message))?.[0];
  const faultScope = (name, args) => ({ name,
    refs: name === "wait_threads" ? (args.targets ?? []).map(({ threadId, hostId }) => [threadId, hostId])
      : name === "read_thread" ? [[args.threadId, args.hostId]] : [["host", project?.hostId ?? null]],
  });
  const faultIdentity = (name, args, category) => `sha256:${createHash("sha256")
    .update(JSON.stringify({ runId: runId ?? "unbound", category, ...faultScope(name, args) })).digest("hex")}`;
  const readFault = faultId => store?.readHostFault && runId
    ? store.readHostFault({ runId, faultId }) : transientFaults.get(faultId) ?? null;
  const writeFault = value => {
    if (store?.writeHostFault && runId) return store.writeHostFault(value);
    transientFaults.set(value.faultId, value); return value;
  };
  const recordFault = ({ faultId, operation, category, state, recoveryRounds, receiptRefs }) => writeFault(
    createBoundedObservationFault({ runId: runId ?? "unbound", faultId, operation, category, state,
      recoveryRounds, receiptRefs, updatedAt: new Date().toISOString() }),
  );
  const exhaustedFault = fault => Object.assign(new Error(`Read-only host recovery budget exhausted for ${fault.operation} (${fault.faultId})`), { fault });
  const call = async (name, args, { interruptible = false, owner, retryReadOnly = true, observationBudget = null } = {}) => {
    const readOnly = retryReadOnly && ["read_thread", "list_threads", "wait_threads"].includes(name);
    let fault;
    if (readOnly) {
      for (const category of ["timeout", "temporary", "unavailable", "connection", "response-lost", "rate-limit", "network"]) {
        const candidate = readFault(faultIdentity(name, args, category));
        if (candidate?.state === "exhausted") throw exhaustedFault(candidate);
        if (candidate?.state === "unresolved") { fault = candidate; break; }
      }
    }
    for (;;) {
      if (fault) {
        if (fault.recoveryRounds >= recoveryDelaysMs.length) {
          fault = recordFault({ ...fault, state: "exhausted", receiptRefs: fault.receiptRefs });
          throw exhaustedFault(fault);
        }
        if (interruptible) {
          const signal = await waitWithinBudget(recoveryDelaysMs[fault.recoveryRounds], observationBudget);
          if (signal?.control || signal?.deadline) {
            throw Object.assign(new Error("Task observation recovery was interrupted by control or deadline"), { observationSignal: signal });
          }
        } else await sleep(recoveryDelaysMs[fault.recoveryRounds]);
        fault = recordFault({ ...fault, state: "unresolved", recoveryRounds: fault.recoveryRounds + 1,
          receiptRefs: fault.receiptRefs });
      }
      try {
        if (observationBudget !== null && budgetRemaining(observationBudget) <= 0) {
          throw Object.assign(new Error("Task observation reached its Issue execution deadline"), {
            observationSignal: observationDeadline(observationBudget),
          });
        }
        const effectiveArgs = observationBudget !== null && name === "wait_threads"
          ? { ...args, timeoutMs: Math.min(args.timeoutMs, Math.ceil(budgetRemaining(observationBudget))) }
          : args;
        hostCallCount += 1;
        const result = unwrapCodexResult(await host.call(`mcp__codex_app__${name}`, effectiveArgs, owner));
        hostReturnedBytes += JSON.stringify(result)?.length ?? 0;
        if (fault) recordFault({ ...fault, state: "settled", receiptRefs: fault.receiptRefs });
        if (observationBudget !== null && name === "wait_threads" && result?.timedOut) {
          observationBudget.simulatedElapsedMs += effectiveArgs.timeoutMs;
        }
        if (observationBudget !== null && budgetRemaining(observationBudget) <= 0) {
          throw Object.assign(new Error("Task observation reached its Issue execution deadline"), {
            observationSignal: observationDeadline(observationBudget),
          });
        }
        return result;
      } catch (error) {
        const category = readOnly ? faultCategory(error) : null;
        if (!category) throw error;
        const faultId = faultIdentity(name, args, category);
        if (fault && fault.faultId !== faultId) throw new Error("Host recovery evidence became contradictory; preserve both fault identities", { cause: error });
        if (!fault) {
          const previous = readFault(faultId);
          if (previous?.state === "exhausted") throw exhaustedFault(previous);
          if (previous && (previous.operation !== name || previous.category !== category)) {
            throw new Error("Host recovery identity contradicts its retained operation or category", { cause: error });
          }
          fault = previous
            ? recordFault({ ...previous, state: "unresolved",
              recoveryRounds: previous.state === "settled" ? 0 : previous.recoveryRounds,
              receiptRefs: previous.receiptRefs })
            : recordFault({ faultId, operation: name, category, state: "unresolved", recoveryRounds: 0,
              receiptRefs: faultScope(name, args).refs.flat().filter(Boolean) });
        }
        if (fault.recoveryRounds >= recoveryDelaysMs.length) {
          fault = recordFault({ ...fault, state: "exhausted", receiptRefs: fault.receiptRefs });
          throw exhaustedFault(fault);
        }
      }
    }
  };
  const readHistory = async (ref, predicate, { latestOnly = false, interruptible = false, retryReadOnly = true, observationBudget = null } = {}) => {
    let snapshot = ownerHistory(await call("read_thread", { ...ref, turnLimit: latestOnly ? 1 : 2,
      includeOutputs: true, maxOutputCharsPerItem: 8192 }, { interruptible, retryReadOnly, observationBudget }));
    const cursorsSeen = new Set();
    for (let page = 0; ; page += 1) {
      if (snapshot.thread?.id !== ref.threadId || snapshot.thread?.hostId !== ref.hostId) throw new Error("Task read-back identity differs");
      if (predicate(snapshot) || !snapshot.page?.hasMore) return snapshot;
      const cursor = snapshot.page.nextCursor;
      if (!cursor || cursorsSeen.has(cursor) || page >= 3) throw new Error("Task history is unresolved within its bounded read; preserve the existing lane");
      cursorsSeen.add(cursor);
      const older = ownerHistory(await call("read_thread", { ...ref, cursor, turnLimit: 2,
        includeOutputs: true, maxOutputCharsPerItem: 8192 }, { interruptible, retryReadOnly, observationBudget }));
      if (older.thread?.id !== ref.threadId || older.thread?.hostId !== ref.hostId) throw new Error("Task history identity differs");
      snapshot = { ...snapshot, page: older.page, turns: [...(snapshot.turns ?? []), ...(older.turns ?? [])] };
    }
  };
  const reconcileReservedMessage = async ({ ref, receipts, promptIdentity, prompt }) => {
    for (;;) {
      const current = receipts.read(promptIdentity);
      if (current?.accepted) return true;
      const observation = receipts.observe(promptIdentity);
      if (!observation) return false;
      await sleep(observation.delayMs);
      let snapshot;
      try {
        snapshot = await readHistory(ref, value => userTexts(value).includes(prompt), { retryReadOnly: false });
      } catch (error) {
        if (!faultCategory(error)) throw error;
        continue;
      }
      if (userTexts(snapshot).includes(prompt)) {
        receipts.accept(promptIdentity, "native-history");
        return true;
      }
    }
  };
  const acceptNativeMessage = ({ ref, receipts, promptIdentity, result }) => {
    const observedTaskRef = Object.fromEntries(["threadId", "hostId"]
      .filter(key => typeof result?.[key] === "string" && result[key]).map(key => [key, result[key]]));
    if (Object.entries(observedTaskRef).some(([key, value]) => value !== ref[key])) {
      receipts.conflict(promptIdentity, observedTaskRef);
      throw new Error("Conflicting native task identity; preserve the original message receipt");
    }
    if (uncertainNativeResult(result) || result?.threadId !== ref.threadId
      || result.hostId !== undefined && result.hostId !== ref.hostId) return false;
    receipts.accept(promptIdentity, "native-response");
    return true;
  };
  const read = async (ref, ownership = {}, { interruptible = false, observationBudget = null } = {}) => {
    const receipts = receiptsFor(ref, ownership.runId ?? taskRuns.get(ref.threadId) ?? runId);
    let receipt = receipts?.read();
    const messageReceipts = messageReceiptsFor(ref, ownership.runId ?? taskRuns.get(ref.threadId) ?? runId);
    let messageReceipt = messageReceipts?.read();
    const snapshot = await readHistory(ref, value => Boolean(receipt || messageReceipt) || userTexts(value).some(text => /(?:Close request identity:|Retry request:|Repair request:|Recovery request:|Model upgrade request:|Workflow recovery ownership:)/u.test(text)),
      { latestOnly: Boolean(receipt || messageReceipt), interruptible, observationBudget });
    if (snapshot.thread?.id !== ref.threadId || snapshot.thread?.hostId !== ref.hostId) throw new Error("Task read-back identity differs");
    const type = snapshot.thread.status?.type;
    const nativePrompt = userTexts(snapshot).find((text) => text.includes("Close request identity:"));
    if (receipt && userTexts(snapshot).includes(receipt.prompt) && !receipt.accepted) {
      receipts.accept(receipt.promptIdentity, "native-history"); receipt = receipts.read();
    }
    const closeRequest = closeRequestFrom(receipt?.accepted ? receipt.prompt : nativePrompt);
    const currentNativePrompt = userTexts({ turns: snapshot.turns.slice(0, 1) }).find(text => text.includes("Close request identity:"));
    if (receipt?.accepted && currentNativePrompt
      && modelEvidenceDigest(closeRequestFrom(currentNativePrompt)) !== modelEvidenceDigest(closeRequest)) {
      throw new Error("Current native close request contradicts its retained accepted owner; preserve both identities");
    }
    const nativeTaskRequests = userTexts(snapshot).map(taskRequestFrom).filter(Boolean);
    if (messageReceipt && nativeTaskRequests.some(item => item.promptIdentity === messageReceipt.promptIdentity)
      && !messageReceipt.accepted) {
      messageReceipts.accept(messageReceipt.promptIdentity, "native-history");
      messageReceipt = messageReceipts.read(messageReceipt.promptIdentity);
    }
    const currentTaskRequest = userTexts({ turns: snapshot.turns.slice(0, 1) }).map(taskRequestFrom).filter(Boolean)[0];
    if (messageReceipt?.accepted && currentTaskRequest && currentTaskRequest.kind === messageReceipt.kind
      && currentTaskRequest.request.runId === messageReceipt.request.runId
      && currentTaskRequest.request.issueId === messageReceipt.request.issueId
      && currentTaskRequest.promptIdentity !== messageReceipt.promptIdentity) {
      throw new Error("Current native task message contradicts its retained accepted owner; preserve both identities");
    }
    const taskRequest = messageReceipt
      ? { state: messageReceipt.accepted ? "ACCEPTED" : "RESERVED", ...messageReceipt.request, kind: messageReceipt.kind }
      : nativeTaskRequests[0] ? { state: "ACCEPTED", ...nativeTaskRequests[0].request, kind: nativeTaskRequests[0].kind } : undefined;
    const retryRequest = taskRequest?.kind === "retry" ? Object.fromEntries(Object.entries(taskRequest).filter(([key]) => key !== "kind")) : undefined;
    const repairRequest = taskRequest?.kind === "repair" ? Object.fromEntries(Object.entries(taskRequest).filter(([key]) => key !== "kind")) : undefined;
    const modelMatch = userTexts(snapshot).find(text => text.includes("Model upgrade request: "))?.match(/Model upgrade request: (\{.+\})$/mu);
    const modelRequest = taskRequest?.kind === "upgrade"
      ? Object.fromEntries(Object.entries(taskRequest).filter(([key]) => key !== "kind"))
      : modelMatch ? { state: "ACCEPTED", ...JSON.parse(modelMatch[1]) } : undefined;
    const final = (snapshot.turns?.[0]?.items ?? []).findLast(item => item.type === "agentMessage" && item.phase === "final_answer")?.text;
    const modelYieldMatch = final?.match(/^Workflow model yield: (\{.+\})$/mu);
    const modelYield = modelYieldMatch ? JSON.parse(modelYieldMatch[1]) : undefined;
    const recoveryRequest = taskRequest?.kind === "recovery" ? Object.fromEntries(Object.entries(taskRequest).filter(([key]) => key !== "kind")) : undefined;
    const finals = (snapshot.turns ?? []).flatMap(turn => (turn.items ?? []).filter(item => item.type === "agentMessage" && item.phase === "final_answer").map(item => item.text));
    const closeResultMatch = finals.map(final => final?.match(/^Workflow close result: (\{.+\})$/mu)).find(Boolean);
    let closeResult = closeResultMatch ? JSON.parse(closeResultMatch[1]) : undefined;
    if (receipt?.accepted) {
      // Omitted input cannot hide a present contradiction in the current turn.
      // Matching identity alone still cannot prove that turn owns this prompt.
      const currentMatch = final?.match(/^Workflow close result: (\{.+\})$/mu);
      if (currentMatch) assertCloseOutcomeIdentity(JSON.parse(currentMatch[1]), closeRequest);
      // A same-identity continuation may have an older outcome in another turn.
      // Only the turn containing this exact accepted prompt can add its result.
      const owningTurn = snapshot.turns.find(turn => userTexts({ turns: [turn] }).includes(receipt.prompt));
      const owningMatch = owningTurn?.items.findLast(item => item.type === "agentMessage" && item.phase === "final_answer")
        ?.text?.match(/^Workflow close result: (\{.+\})$/mu);
      closeResult = owningMatch ? JSON.parse(owningMatch[1]) : undefined;
      if (closeResult) {
        assertCloseOutcomeIdentity(closeResult, closeRequest);
        receipts.observe(receipt.promptIdentity, closeResult);
      }
      else closeResult = receipt.outcome?.result;
    }
    const recoveryResultMatch = finals.map(final => final?.match(/^Workflow recovery result: (\{.+\})$/mu)).find(Boolean);
    const recoveryResult = recoveryResultMatch ? JSON.parse(recoveryResultMatch[1]) : undefined;
    const settled = type === "idle" || type === "notLoaded" && snapshot.turns?.[0]?.status === "completed";
    return { state: type === "active" ? "RUNNING" : settled ? "RESUMABLE" : "UNKNOWN",
      closeRequest, retryRequest, repairRequest, modelRequest, modelYield, recoveryRequest, recoveryResult, closeResult,
      closeOutcomeUnavailable: Boolean(receipt && !closeResult), snapshot, cwd: snapshot.thread.cwd };
  };
  const findIssueLane = async ({ issueId, runIdentity, prepared }) => {
    const key = markerFor({ runId: runIdentity.runId, issueId });
    const journaled = store.readEvents(runIdentity.runId).filter((event) => event.type === "dispatch.recorded" && event.issueId === issueId);
    if (journaled.length) { taskRuns.set(journaled.at(-1).taskRef.threadId, runIdentity.runId); return [journaled.at(-1).taskRef]; }
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
      executionStartEvidence.set(existing[0].threadId, "OBSERVED");
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
      executionStartEvidence.set(existing[0].threadId, "OBSERVED");
      return existing[0];
    }
    let created;
    const submit = async (request, phase) => {
      let result, unavailable = false;
      try { result = await call("create_thread", request, { owner: { kind: "task-create", runId: runIdentity.runId, issueId,
        receiptIdentity: modelEvidenceDigest(request) } }); }
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
      executionStartEvidence.set(ref.threadId, "CURRENT_MONOTONIC");
      return ref;
    }
    // clientThreadId is a setup operation, never a task reference.
    if (created.clientThreadId || created.uncertain) {
      for (const delay of [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000]) {
        await sleep(delay);
        try {
          const existing = await findIssueLane({ issueId, runIdentity });
          if (existing.length !== 1) throw new Error("ISSUE_LANE_AMBIGUOUS");
          executionStartEvidence.set(existing[0].threadId, "CURRENT_MONOTONIC");
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
    executionStartEvidence(ref) { return executionStartEvidence.get(ref?.threadId) ?? "OBSERVED"; },
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
          const request = { title: "Workflow maintenance", prompt, target: { type: "project", projectId: maintenanceProject.id ?? maintenanceProject.projectId,
            environment: { type: "worktree", startingState: { type: "branch", branchName: scope.target } } } };
          const created = await call("create_thread", request, { owner: { kind: "task-create", runId: runIdentity.runId, issueId,
            receiptIdentity: modelEvidenceDigest({ purpose, request }) } });
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
      const handoffRequest = { runId: runIdentity.runId, issueId, operationId };
      const marker = `Workflow recovery ownership: ${JSON.stringify(handoffRequest)}`;
      const prompt = `${marker}\nThe coordinator is transferring this exact Issue worktree to an isolated repair task. Settle this turn without source edits, commits, closeout or installation. Preserve the original operation and worktree. Subsequent repair messages belong only to the recorded repair task. ${workflowSourceBoundary(packageRoot)}`;
      const reservation = store.reserveHostTask({ runId: runIdentity.runId, issueId, purpose, prompt });
      if (reservation.intent.prompt !== prompt) throw new Error("Recovery ownership intent differs; preserve the original request");
      const handoffIdentity = promptIdentityFor(prompt);
      const handoffReceipts = messageReceiptsFor(originalTaskRef, runIdentity.runId);
      let handoffReceipt = handoffReceipts?.read(handoffIdentity);
      if (!handoffReceipts) throw new Error("Recovery ownership receipt storage is unavailable");
      if (handoffReceipt && !handoffReceipt.accepted) {
        if (!await reconcileReservedMessage({ ref: originalTaskRef, receipts: handoffReceipts,
          promptIdentity: handoffIdentity, prompt })) throw new Error("Recovery ownership message outcome is unresolved");
        handoffReceipt = handoffReceipts.read(handoffIdentity);
      }
      if (!handoffReceipt) {
        const history = await readHistory(originalTaskRef, value => userTexts(value).includes(prompt));
        if (userTexts(history).includes(prompt)) {
          handoffReceipt = handoffReceipts.reserve({ kind: "recovery-handoff", request: handoffRequest, promptIdentity: handoffIdentity });
          handoffReceipts.accept(handoffIdentity, "native-history");
        } else {
          // The immutable handoff intent and receipt precede even this read-only settlement message.
          handoffReceipt = handoffReceipts.reserve({ kind: "recovery-handoff", request: handoffRequest, promptIdentity: handoffIdentity });
          let result, nativeError;
          try {
            result = await call("send_message_to_thread", { ...originalTaskRef, prompt }, { owner: { kind: "task-message", runId: runIdentity.runId,
              issueId, threadId: originalTaskRef.threadId, requestKind: "recovery-handoff", receiptIdentity: handoffIdentity } });
          } catch (error) { nativeError = error; }
          if (!acceptNativeMessage({ ref: originalTaskRef, receipts: handoffReceipts, promptIdentity: handoffIdentity, result })) {
            if (!await reconcileReservedMessage({ ref: originalTaskRef, receipts: handoffReceipts,
              promptIdentity: handoffIdentity, prompt })) throw new Error("Recovery ownership message outcome is unresolved", { cause: nativeError });
          }
        }
      }
      if ((await read(originalTaskRef, { runId: runIdentity.runId })).state === "RUNNING") return { pending: true, waitingRef: originalTaskRef };
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
            const created = await call("fork_thread", { threadId: originalTaskRef.threadId, environment: { type: "same-directory" } },
              { owner: { kind: "task-fork", runId: runIdentity.runId, issueId, threadId: originalTaskRef.threadId,
                receiptIdentity: modelEvidenceDigest({ purpose: forkPurpose, worktree, originalTaskRef }) } });
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
      const promptIdentity = promptIdentityFor(prompt);
      const messageReceipts = messageReceiptsFor(ref, runIdentity.runId);
      if (!messageReceipts) throw new Error("Upgrade continuation receipt storage is unavailable");
      const retained = messageReceipts.read(promptIdentity);
      if (retained?.accepted) return { observed: true, effectiveReadBack: "unavailable" };
      if (retained) {
        if (await reconcileReservedMessage({ ref, receipts: messageReceipts, promptIdentity, prompt })) {
          return { observed: true, effectiveReadBack: "unavailable" };
        }
        throw new Error("Upgrade continuation outcome unresolved; preserve the original request");
      }
      const snapshot = await readHistory(ref, value => userTexts(value).includes(prompt));
      if (userTexts(snapshot).includes(prompt)) {
        messageReceipts.reserve({ kind: "upgrade", request: marker, promptIdentity });
        messageReceipts.accept(promptIdentity, "native-history");
        return { observed: true, effectiveReadBack: "unavailable" };
      }
      const receipts = store.readEvents(runIdentity.runId).filter(event => event.type === "model.acceptance" && event.requestIdentity === intent.requestIdentity);
      if (receipts.length) throw new Error("Upgrade outcome unresolved; preserve the original continuation");
      const task = await read(ref);
      if (task.state !== "RESUMABLE" || task.cwd !== intent.worktree) throw new Error("Upgrade cannot race an active or unowned executor");
      const git = (...args) => execFileSync("git", ["-C", intent.worktree, ...args], { encoding: "utf8" }).trim();
      if (git("rev-parse", "HEAD") !== intent.candidate || git("branch", "--show-current") !== intent.topic || git("status", "--porcelain=v1")) throw new Error("Upgrade candidate or clean worktree changed");
      messageReceipts.reserve({ kind: "upgrade", request: marker, promptIdentity });
      let result;
      try { result = await call("send_message_to_thread", { ...ref, prompt, model: intent.model, thinking: intent.thinking },
        { owner: { kind: "task-message", runId: runIdentity.runId, issueId: intent.issueId, threadId: ref.threadId,
          requestKind: "upgrade", receiptIdentity: promptIdentity } }); }
      catch { result = null; }
      const accepted = acceptNativeMessage({ ref, receipts: messageReceipts, promptIdentity, result });
      writer.append({ type: "model.acceptance", at: new Date().toISOString(), issueId: intent.issueId, requestIdentity: intent.requestIdentity,
        model: intent.model, thinking: intent.thinking, phase: "upgrade", acceptance: accepted ? "accepted" : "unknown",
        effectiveReadBack: "unavailable", evidence: accepted ? "Native continuation returned the original task identity."
          : "Continuation submission is uncertain; independently reconcile its original message before any resend." });
      if (accepted) {
        return { accepted: true, effectiveReadBack: "unavailable" };
      }
      if (await reconcileReservedMessage({ ref, receipts: messageReceipts, promptIdentity, prompt })) {
        return { observed: true, initiatedHere: true, effectiveReadBack: "unavailable" };
      }
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
      const close = prompt.includes("Close request identity:") ? closeRequestFrom(prompt) : null;
      const receipts = close ? receiptsFor(ref, close.runId) : null;
      const issue = prompt.match(/(?:close|retry|repair) (?:parent )?Issue (I_[A-Za-z0-9_-]+)/u);
      if (issue) prompt = prompt.replace(`Issue ${issue[1]}`, `Issue #${await issueNumber(issue[1])}`);
      const frozenPrompt = `Use the exact installed skill ${join(packageRoot, "skills/engineering", prompt.includes("$close-issue") ? "close-issue" : "execute-issue", "SKILL.md")}.\n${workflowSourceBoundary(packageRoot)}\n${prompt}`;
      const taskRequest = close ? null : taskRequestFrom(frozenPrompt);
      if (!close && !taskRequest) throw new Error("Execution task message requires an allowlisted retry, repair, or recovery identity");
      const messageReceipts = taskRequest ? messageReceiptsFor(ref, taskRequest.request.runId) : null;
      const messageReceipt = messageReceipts?.read(taskRequest?.promptIdentity);
      if (messageReceipt?.accepted) {
        await read(ref, { runId: taskRequest.request.runId });
        return { observed: true };
      }
      if (messageReceipt) {
        if (await reconcileReservedMessage({ ref, receipts: messageReceipts,
          promptIdentity: messageReceipt.promptIdentity, prompt: frozenPrompt })) return { observed: true };
        throw new Error("Task message outcome is unresolved; preserve the reserved request");
      }
      const stored = receipts?.read();
      if (stored?.prompt === frozenPrompt && stored.accepted) return close ? undefined : { observed: true };
      const previous = await readHistory(ref, value => Boolean(stored) || userTexts(value).includes(frozenPrompt), { latestOnly: Boolean(stored) });
      if (userTexts(previous).includes(frozenPrompt)) {
        if (receipts) { const intent = receipts.reserve(frozenPrompt); receipts.accept(intent.promptIdentity, "native-history"); }
        if (messageReceipts) { const intent = messageReceipts.reserve(taskRequest); messageReceipts.accept(intent.promptIdentity, "native-history"); }
        return close ? undefined : { observed: true };
      }
      // Native history and continuation waits may outlive the tracker snapshot
      // that selected this action. Only suppress delivery here; the coordinator
      // still needs its complete fresh facts before it can report success.
      if (close) {
        if (typeof readIssueState !== "function") throw new Error("Close submission requires its current tracker state reader");
        const current = await readIssueState(close.issueId);
        if (current?.issueId !== close.issueId || !["OPEN", "CLOSED"].includes(current.state)) throw new Error("Close tracker state or identity is unproven");
        if (current.state === "CLOSED") return { reconcileRequired: true, reasonCode: "issue_already_closed", issueId: close.issueId };
      }
      if (close && previous.turns?.some(turn => turn.status === "completed" && !turn.items?.length)
        && !completedCloseCleanup(close.evidence)) {
        throw new Error("Close message outcome is unresolved because native history omitted the settled turn; preserve its owner");
      }
      if (close && previous.thread.status?.type === "active") throw new Error("Close task is active; preserve its accepted work");
      const reservation = receipts?.reserve(frozenPrompt);
      const messageReservation = messageReceipts?.reserve(taskRequest);
      if (reservation && !reservation.created) throw new Error("Close message outcome is unresolved; preserve the reserved request");
      if (messageReservation && !messageReservation.created) {
        if (await reconcileReservedMessage({ ref, receipts: messageReceipts,
          promptIdentity: messageReservation.promptIdentity, prompt: frozenPrompt })) return { observed: true };
        throw new Error("Task message outcome is unresolved; preserve the reserved request");
      }
      if (messageReservation) {
        let result, nativeError;
        try {
          result = await call("send_message_to_thread", { ...ref, prompt: frozenPrompt }, { owner: { kind: "task-message",
            runId: taskRequest.request.runId, issueId: taskRequest.request.issueId, threadId: ref.threadId,
            requestKind: taskRequest.kind, receiptIdentity: taskRequest.promptIdentity } });
        } catch (error) { nativeError = error; }
        if (acceptNativeMessage({ ref, receipts: messageReceipts, promptIdentity: messageReservation.promptIdentity, result })) {
          return { accepted: true };
        }
        if (await reconcileReservedMessage({ ref, receipts: messageReceipts,
          promptIdentity: messageReservation.promptIdentity, prompt: frozenPrompt })) return { observed: true, initiatedHere: true };
        throw new Error("Task message outcome is unresolved; preserve the reserved request", { cause: nativeError });
      }
      for (const delay of [1000, 5000, 15000]) {
        try {
          const accepted = await call("send_message_to_thread", { ...ref, prompt: frozenPrompt }, { owner: close ? { kind: "task-message",
            runId: close.runId, issueId: close.issueId, threadId: ref.threadId, requestKind: "close", receiptIdentity: close.requestIdentity } : undefined });
          if (close) {
            if (uncertainNativeResult(accepted) || accepted?.threadId !== ref.threadId
              || accepted.hostId !== undefined && accepted.hostId !== ref.hostId) throw new Error("Native close acceptance is unproven");
            receipts?.accept(reservation.promptIdentity, "native-response");
          }
          return close ? undefined : { accepted: true };
        }
        catch (error) {
          // Even a failed response may have accepted the message. Never resend without native read-back.
          await sleep(delay);
          const snapshot = await readHistory(ref, value => userTexts(value).includes(frozenPrompt));
          if (userTexts(snapshot).includes(frozenPrompt)) {
            receipts?.accept(reservation.promptIdentity, "native-history");
            return close ? undefined : { observed: true, initiatedHere: true };
          }
          if (close) throw new Error("Close message outcome is unresolved; preserve the reserved request", { cause: error });
          if (snapshot.thread.status?.type !== "idle") throw new Error("Message outcome is unresolved; preserve the running task", { cause: error });
        }
      }
      throw new Error("Task message retry budget exhausted after native read-back");
    },
    async waitForSignal(timeoutMs) {
      if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new TypeError("Observation signal wait requires a non-negative finite duration");
      return waitSignal({ timeoutMs, readSignal: readObservationSignal });
    },
    async wait(taskRefs, { timeoutMs } = {}) {
      if (!Array.isArray(taskRefs) || taskRefs.length === 0) throw new Error("Task observation requires at least one exact task reference");
      if (taskRefs.some(ref => typeof ref?.threadId !== "string" || typeof ref?.hostId !== "string")) {
        throw new Error("Task observation requires exact thread and host identities");
      }
      if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
        throw new TypeError("Task observation timeout must be a non-negative finite duration");
      }
      const boundedTimeoutMs = timeoutMs === undefined ? null : Math.max(0, Math.ceil(timeoutMs));
      const observationBudget = boundedTimeoutMs === null ? null : {
        limitMs: boundedTimeoutMs,
        startedAt: monotonicNow(),
        simulatedElapsedMs: 0,
      };
      const batchSize = Math.min(8, taskRefs.length);
      const batch = Array.from({ length: batchSize }, (_, index) => taskRefs[(batchOffset + index) % taskRefs.length]);
      batchOffset = (batchOffset + batchSize) % taskRefs.length;
      const targets = batch.map(ref => ({ ...ref, ...(cursors.has(ref.threadId) ? { afterCursor: cursors.get(ref.threadId) } : {}) }));
      const batchKey = batch.map(({ threadId, hostId }) => `${hostId}:${threadId}`).join("|");
      const callsBefore = hostCallCount, bytesBefore = hostReturnedBytes;
      let fullHistoryReads = 0;
      const interrupted = (mode, signal) => ({ coordinatorActive: !host.disconnected, taskSettled: false,
        observation: { kind: "interrupted", mode, signal: signal.control ? "control" : "deadline", batchSize: batch.length,
          fullHistoryReads, returnedBytes: hostReturnedBytes - bytesBefore, nativeCalls: hostCallCount - callsBefore,
          modelRoundTrips: "unavailable", tokens: "unavailable" } });
      let result, mode = "event";
      const observeCall = async action => {
        try { return { value: await action() }; }
        catch (error) {
          if (error.observationSignal) return { interruption: interrupted(mode, error.observationSignal) };
          throw error;
        }
      };
      if (eventWaitSupported) {
        const before = await readObservationSignal();
        if (before?.control || before?.deadline) return interrupted(mode, before);
        try {
          result = await call("wait_threads", { targets, timeoutMs: Math.min(15000, boundedTimeoutMs ?? 15000) },
            { interruptible: true, observationBudget });
        } catch (error) {
          if (error.observationSignal) return interrupted(mode, error.observationSignal);
          if (!/unsupported.*wait_threads|wait_threads.*(?:unsupported|not available)/iu.test(error.message)) throw error;
          eventWaitSupported = false;
        }
        const after = await readObservationSignal();
        if (after?.control || after?.deadline) return interrupted(mode, after);
      }
      const changed = [];
      if (!eventWaitSupported) {
        mode = "fallback";
        const round = fallbackRounds.get(batchKey) ?? 0;
        const before = await readObservationSignal();
        if (before?.control || before?.deadline) return interrupted(mode, before);
        const signaled = await waitWithinBudget(
          Math.min([15000, 30000, 60000][Math.min(round, 2)], boundedTimeoutMs ?? 60000),
          observationBudget,
        );
        if (signaled?.control || signaled?.deadline) return interrupted(mode, signaled);
        for (const ref of batch) {
          const snapshotAttempt = await observeCall(() => call("read_thread", { ...ref, turnLimit: 1,
            includeOutputs: false, maxOutputCharsPerItem: 1000 }, { interruptible: true, observationBudget }));
          if (snapshotAttempt.interruption) return snapshotAttempt.interruption;
          const snapshot = snapshotAttempt.value;
          if (snapshot.thread?.id !== ref.threadId || snapshot.thread?.hostId !== ref.hostId) throw new Error("Task snapshot identity differs");
          const status = String(snapshot.thread.status?.type ?? "unknown").toLowerCase();
          const terminal = ["idle", "notloaded", "completed", "failed", "error"].includes(status);
          const attention = status === "needs_attention";
          const anomaly = status === "unknown";
          const semantic = JSON.stringify({ status, terminal, attention });
          const previous = taskObservations.get(ref.threadId);
          if (previous !== undefined && previous.semantic !== semantic) changed.push({ threadId: ref.threadId, state: status });
          if (anomaly || (terminal || attention) && (previous?.semantic !== semantic || previous?.settled !== true)) {
            const stateAttempt = await observeCall(() => read(ref, {}, { interruptible: true, observationBudget }));
            if (stateAttempt.interruption) return stateAttempt.interruption;
            const state = stateAttempt.value; fullHistoryReads += 1;
            taskObservations.set(ref.threadId, { semantic, settled: state.state === "RESUMABLE",
              closeRequestIdentity: state.closeRequest?.requestIdentity });
          } else taskObservations.set(ref.threadId, { semantic, settled: previous?.settled === true,
            closeRequestIdentity: previous?.closeRequestIdentity });
        }
        fallbackRounds.set(batchKey, changed.length ? 0 : Math.min(round + 1, 2));
      } else {
        const observations = result.polls ?? result.results ?? result.threads ?? [];
        const refsById = new Map(batch.map(ref => [ref.threadId, ref]));
        for (const target of observations) {
          const threadId = target.thread?.id ?? target.threadId;
          const ref = refsById.get(threadId);
          if (!ref) continue;
          if (target.cursor) cursors.set(threadId, target.cursor);
          const status = String(target.thread?.status?.type ?? target.status?.type ?? target.status ?? target.state ?? "unknown").toLowerCase();
          const terminal = Boolean(target.finalText || target.final || target.event === "completion"
            || ["idle", "notloaded", "completed", "failed", "error"].includes(status));
          const attention = Boolean(target.needsAttention || target.event === "attention" || status === "needs_attention");
          const anomaly = status === "unknown" || Boolean(target.error);
          const semantic = JSON.stringify({ status, terminal, attention, error: Boolean(target.error) });
          const previous = taskObservations.get(threadId);
          if (terminal || attention || previous !== undefined && previous.semantic !== semantic) {
            changed.push({ threadId, state: terminal ? "terminal" : attention ? "attention" : status });
          }
          if (anomaly || (terminal || attention) && (previous?.semantic !== semantic || previous?.settled !== true)) {
            const stateAttempt = await observeCall(() => read(ref, {}, { interruptible: true, observationBudget }));
            if (stateAttempt.interruption) return stateAttempt.interruption;
            const state = stateAttempt.value; fullHistoryReads += 1;
            taskObservations.set(threadId, { semantic, settled: state.state === "RESUMABLE",
              closeRequestIdentity: state.closeRequest?.requestIdentity });
          } else {
            taskObservations.set(threadId, { semantic, settled: previous?.settled === true,
              closeRequestIdentity: previous?.closeRequestIdentity });
          }
        }
      }
      const cached = taskRefs.map(ref => taskObservations.get(ref.threadId));
      const closeRequestIdentity = taskRefs.length === 1 ? cached[0]?.closeRequestIdentity : undefined;
      return { coordinatorActive: !host.disconnected, taskSettled: cached.every(value => value?.settled === true),
        ...(closeRequestIdentity ? { closeRequestIdentity } : {}),
        observation: { kind: changed.length ? "changed" : "unchanged", mode, batchSize: batch.length,
          changed, fullHistoryReads, returnedBytes: hostReturnedBytes - bytesBefore, nativeCalls: hostCallCount - callsBefore,
          modelRoundTrips: "unavailable", tokens: "unavailable" } };
    },
  };
}
