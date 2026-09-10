import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCodexWorkflowTasks } from "../../skills/personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { modelDecisionInput, ISSUE_MODEL_POLICY_VERSION } from "../../skills/personal/run-issue-workflow/scripts/issue-model-policy.mjs";
import { planCloseContinuation } from "../../skills/personal/run-issue-workflow/scripts/close-continuation.mjs";
const readOpenIssueState = async issueId => ({ issueId, state: "OPEN" });

test("close submission refreshes tracker after delayed native history and skips an Issue closed during that read", async () => {
  for (const stateAfterRead of ["CLOSED", "OPEN"]) {
    const root = mkdtempSync(join(tmpdir(), "close-send-freshness-"));
    const store = createRunStore({ gitCommonDir: join(root, ".git") });
    const ref = { threadId: "worker", hostId: "local" };
    let enterRead, finishRead, trackerState = "OPEN", sends = 0;
    const entered = new Promise(resolve => { enterRead = resolve; });
    const released = new Promise(resolve => { finishRead = resolve; });
    const observations = [];
    const tasks = createCodexWorkflowTasks({ store, runId: "run", project: {}, packageRoot: "/installed", issueNumber: async () => 1,
      readIssueState: async issueId => { observations.push("tracker"); return { issueId, state: trackerState }; },
      host: { async call(name) {
        if (name.endsWith("send_message_to_thread")) { observations.push("send"); sends++; return { threadId: ref.threadId }; }
        observations.push("history"); enterRead(); await released;
        return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type: "idle" } },
          turns: [{ id: "settled-close-with-omitted-history", status: "completed", items: [] }] };
      } } });
    const prompt = `Use $close-issue to close Issue I_1. Close request identity: sha256:${"a".repeat(64)}. Current close request evidence: ${JSON.stringify({ runIdentity: { runId: "run" }, issueId: "I_1", trackerState: "OPEN", candidateReachable: true, worktreeState: "ABSENT" })}\nClose continuation: ${JSON.stringify({ attempt: 1, progressIdentity: `sha256:${"b".repeat(64)}` })}`;
    try {
      const pending = tasks.message(ref, prompt);
      await entered; trackerState = stateAfterRead; finishRead();
      const result = await pending;
      assert.deepEqual(observations, stateAfterRead === "CLOSED" ? ["history", "tracker"] : ["history", "tracker", "send"]);
      assert.equal(sends, stateAfterRead === "CLOSED" ? 0 : 1);
      if (stateAfterRead === "CLOSED") {
        assert.deepEqual(result, { reconcileRequired: true, reasonCode: "issue_already_closed", issueId: "I_1" });
        assert.equal(existsSync(join(root, ".git", "matt-workflow-control", "runs", "run")), false, "a skipped close creates no receipt or Run authority");
      } else assert.equal(result, undefined, "missing native final still permits the remaining close for an open Issue with physical cleanup proved");
    } finally { finishRead(); rmSync(root, { recursive: true, force: true }); }
  }
});

test("missing, foreign, unknown, or unavailable final tracker read cannot submit close", async () => {
  for (const readIssueState of [undefined, async () => ({ issueId: "I_foreign", state: "CLOSED" }),
    async issueId => ({ issueId, state: "UNKNOWN" }), async () => { throw new Error("tracker unavailable"); }]) {
    const root = mkdtempSync(join(tmpdir(), "close-send-unknown-"));
    let sends = 0;
    const tasks = createCodexWorkflowTasks({ store: createRunStore({ gitCommonDir: join(root, ".git") }), project: {}, packageRoot: "/installed",
      issueNumber: async () => 1, readIssueState, host: { async call(name) {
        if (name.endsWith("send_message_to_thread")) { sends++; return { threadId: "worker" }; }
        return { thread: { id: "worker", hostId: "local", status: { type: "idle" } }, turns: [{ status: "completed", items: [] }] };
      } } });
    const prompt = `Use $close-issue to close Issue I_1. Close request identity: sha256:${"a".repeat(64)}. Current close request evidence: ${JSON.stringify({ runIdentity: { runId: "run" }, issueId: "I_1", candidateReachable: true, worktreeState: "ABSENT" })}`;
    try {
      await assert.rejects(tasks.message({ threadId: "worker", hostId: "local" }, prompt), /tracker/iu);
      assert.equal(sends, 0);
      assert.equal(existsSync(join(root, ".git", "matt-workflow-control", "runs", "run")), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("native close acceptance survives omitted history and blocks unchanged redispatch across restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "close-acceptance-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const ref = { threadId: "worker", hostId: "local" };
  const requestIdentity = `sha256:${"a".repeat(64)}`;
  const evidence = { runIdentity: { runId: "run" }, issueId: "I_1", candidateReachable: true, worktreeState: "PRESENT" };
  const prompt = `Use $close-issue to close Issue I_1. Close request identity: ${requestIdentity}. Current close request evidence: ${JSON.stringify(evidence)}`;
  let sends = 0, sentPrompt, turnId = "implementation", result, omitInput = false;
  const options = { store, runId: "run", project: {}, packageRoot: "/installed", issueNumber: async () => 1, readIssueState: readOpenIssueState,
    host: { async call(name, args) {
      if (name.endsWith("send_message_to_thread")) { sends++; sentPrompt = args.prompt; turnId = "close"; return { threadId: ref.threadId }; }
      assert.equal(name, "mcp__codex_app__read_thread");
      if (sends) assert.equal(args.turnLimit, 1, "accepted close observation does not reread the large implementation turn");
      return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type: "idle" } },
        turns: [{ id: turnId, status: "completed", items: result ? [
          ...(!omitInput ? [{ type: "userMessage", content: [{ type: "text", text: sentPrompt }] }] : []),
          { type: "agentMessage", phase: "final_answer", text: `Workflow close result: ${JSON.stringify(result)}` },
        ] : turnId === "implementation" ? [{ type: "agentMessage", phase: "final_answer", text: "Implementation completed" }] : [] }] };
    } } };
  try {
    await createCodexWorkflowTasks(options).message(ref, prompt);
    const resumed = createCodexWorkflowTasks(options);
    const unknown = await resumed.read(ref);
    assert.equal(unknown.closeRequest?.requestIdentity, requestIdentity, "native accepted input survives missing returned items");
    omitInput = true;
    result = { schema: "issue-close-result:v1", state: "HOST_CLEANUP_BLOCKED", runId: "run", issueId: "I_1", requestIdentity };
    const unbound = await resumed.read(ref);
    assert.equal(unbound.closeResult, undefined, "a matching final without its owning prompt cannot establish same-turn outcome");
    assert.equal(unbound.closeOutcomeUnavailable, true);
    result = undefined; omitInput = false;
    assert.equal(planCloseContinuation({ task: unknown, requestIdentity, requestEvidence: evidence }).blocked.reasonCode, "close_outcome_unavailable");
    await resumed.message(ref, prompt);
    assert.equal(sends, 1, "same exact accepted native request is never sent twice");
    const authorityEvidence = { candidateCommit: "a".repeat(40), completionEvidenceId: "IC_done", completionBodySha256: "sha256:done", worktreeIdentity: "sha256:owned" };
    evidence.authorityEvidence = authorityEvidence;
    result = { schema: "issue-close-result:v1", state: "HOST_CLEANUP_BLOCKED", runId: "run", issueId: "I_1", requestIdentity,
      authorityEvidence, reasonCode: "host_helper_recovery_failed", observations: [{ code: "EBUSY", message: "Exact directory remains held" }] };
    await resumed.read(ref);
    result = undefined;
    const settled = await createCodexWorkflowTasks(options).read(ref);
    assert.equal(settled.closeResult?.state, "HOST_CLEANUP_BLOCKED", "retain the actual observed result when later native history omits it");
    assert.equal(planCloseContinuation({ task: settled, requestIdentity, requestEvidence: evidence }).blocked.reasonCode, "host_helper_recovery_failed");
    assert.equal(planCloseContinuation({ task: settled, requestIdentity, requestEvidence: { ...evidence, worktreeState: "ABSENT" } }).needed, true);
    omitInput = true;
    for (const change of [{ runId: "foreign-run" }, { issueId: "I_foreign" }, { requestIdentity: `sha256:${"f".repeat(64)}` }]) {
      result = { ...settled.closeResult, ...change };
      await assert.rejects(resumed.read(ref), /outcome identity differs/u,
        "a latest foreign native final cannot be hidden by a receipt when its input is omitted");
    }
    omitInput = false;
    result = { ...settled.closeResult, issueId: "I_foreign" };
    await assert.rejects(resumed.read(ref), /outcome identity differs/u, "a conflicting native result cannot replace retained owning evidence");
    result = settled.closeResult;
    sentPrompt = sentPrompt.replace('"issueId":"I_1"', '"issueId":"I_foreign"');
    await assert.rejects(resumed.read(ref), /native close request contradicts/u, "present contradictory native ownership cannot be replaced by a receipt");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("lost or transport-only close response with omitted history never resends to an idle task", async () => {
  for (const nativeResult of [undefined, { type: "response-accepted", threadId: "worker" }]) {
    const root = mkdtempSync(join(tmpdir(), "close-uncertain-"));
    const store = createRunStore({ gitCommonDir: join(root, ".git") });
    let sends = 0;
    const ref = { threadId: "worker", hostId: "local" };
    const options = { store, runId: "run", project: {}, packageRoot: "/installed", issueNumber: async () => 1, readIssueState: readOpenIssueState, sleep: async () => {},
      host: { async call(name) {
        if (name.endsWith("send_message_to_thread")) { sends++; if (!nativeResult) throw new Error("response lost"); return nativeResult; }
        return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type: "idle" } },
          turns: [{ id: sends ? "close" : "implementation", status: "completed", items: sends ? [] : [{ type: "agentMessage", phase: "final_answer", text: "Done" }] }] };
      } } };
    const prompt = `Use $close-issue to close Issue I_1. Close request identity: sha256:${"b".repeat(64)}. Current close request evidence: ${JSON.stringify({ runIdentity: { runId: "run" }, issueId: "I_1", worktreeState: "PRESENT" })}`;
    try {
      await assert.rejects(createCodexWorkflowTasks(options).message(ref, prompt), /outcome.*unresolved/iu);
      await assert.rejects(createCodexWorkflowTasks(options).message(ref, prompt), /outcome.*unresolved/iu);
      assert.equal(sends, 1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("owner history lookup has a fixed small page and output budget", async () => {
  const ref = { threadId: "worker", hostId: "local" };
  let reads = 0;
  const tasks = createCodexWorkflowTasks({ project: {}, host: { async call(name, args) {
    assert.equal(name, "mcp__codex_app__read_thread"); reads++;
    assert.ok(args.turnLimit <= 2); assert.ok(args.maxOutputCharsPerItem <= 8192);
    return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type: "idle" } },
      page: { hasMore: true, nextCursor: String(reads) }, turns: [{ id: String(reads), items: [] }] };
  } } });
  await assert.rejects(tasks.read(ref), /history.*unresolved/iu);
  assert.ok(reads <= 4);
});

test("legacy omitted close history permits only freshly proved remaining closeout", async () => {
  const root = mkdtempSync(join(tmpdir(), "legacy-close-history-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const ref = { threadId: "worker", hostId: "local" };
  let sends = 0;
  const tasks = createCodexWorkflowTasks({ store, project: {}, packageRoot: "/installed", issueNumber: async () => 1, readIssueState: readOpenIssueState,
    host: { async call(name) {
      if (name.endsWith("send_message_to_thread")) { sends++; return { threadId: ref.threadId }; }
      return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type: "idle" } },
        turns: [{ id: "legacy-close", status: "completed", items: [] }] };
    } } });
  const prompt = evidence => `Use $close-issue to close Issue I_1. Close request identity: sha256:${"c".repeat(64)}. Current close request evidence: ${JSON.stringify({ runIdentity: { runId: "run" }, issueId: "I_1", ...evidence })}`;
  try {
    await assert.rejects(tasks.message(ref, prompt({ worktreeState: "PRESENT", candidateReachable: true })), /outcome.*unresolved/iu);
    await assert.rejects(tasks.message(ref, prompt({ worktreeState: "ABSENT", candidateReachable: false })), /outcome.*unresolved/iu);
    assert.equal(sends, 0);
    await tasks.message(ref, prompt({ worktreeState: "ABSENT", candidateReachable: true }));
    assert.equal(sends, 1);
    const parent = { runIdentity: { runId: "run", specId: "I_parent", classification: "MULTI" }, issueId: "I_parent",
      childCloseStates: [{ issueId: "I_1", completionState: "COMPLETE", trackerState: "CLOSED", candidateReachable: true, worktreeState: "ABSENT" }] };
    await tasks.message(ref, `Use $close-issue to close parent Issue I_parent. Close request identity: sha256:${"f".repeat(64)}. Current close request evidence: ${JSON.stringify(parent)}`);
    assert.equal(sends, 2, "the existing task can close its parent after every child has fully closed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a newer close continuation cannot inherit another turn's outcome and a partial receipt fails closed", async () => {
  const root = mkdtempSync(join(tmpdir(), "close-turn-binding-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const ref = { threadId: "worker", hostId: "local" };
  const evidence = { runIdentity: { runId: "run" }, issueId: "I_1", worktreeState: "ABSENT", candidateReachable: true };
  const requestIdentity = `sha256:${"d".repeat(64)}`;
  let turns = [{ id: "implementation", status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: "Done" }] }];
  const options = { store, runId: "run", project: {}, packageRoot: "/installed", issueNumber: async () => 1, readIssueState: readOpenIssueState,
    host: { async call(name, args) {
      if (name.endsWith("send_message_to_thread")) {
        turns.unshift({ id: `close-${turns.length}`, status: "completed", items: [{ type: "userMessage", content: [{ type: "text", text: args.prompt }] }] });
        return { threadId: ref.threadId };
      }
      return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type: "idle" } }, turns: structuredClone(turns) };
    } } };
  const prompt = `Use $close-issue to close Issue I_1. Close request identity: ${requestIdentity}. Current close request evidence: ${JSON.stringify(evidence)}`;
  try {
    const tasks = createCodexWorkflowTasks(options);
    await tasks.message(ref, prompt);
    turns[0].items.push({ type: "agentMessage", phase: "final_answer", text: `Workflow close result: ${JSON.stringify({ schema: "issue-close-result:v1", state: "HOST_CLEANUP_BLOCKED", runId: "run", issueId: "I_1", requestIdentity })}` });
    await tasks.read(ref);
    await tasks.message(ref, `${prompt}\nClose continuation: ${JSON.stringify({ attempt: 1, progressIdentity: `sha256:${"e".repeat(64)}` })}`);
    turns[1].items.at(-1).text = `Workflow close result: ${JSON.stringify({ schema: "issue-close-result:v1", state: "HOST_CLEANUP_BLOCKED",
      runId: "older-run", issueId: "I_older", requestIdentity })}`;
    const current = await createCodexWorkflowTasks(options).read(ref);
    assert.equal(current.closeResult, undefined, "an older turn's final is neither the new continuation's outcome nor current contradictory authority");
    assert.equal(current.closeOutcomeUnavailable, true);
    const directory = join(root, ".git", "matt-workflow-control", "runs", "run");
    const receipt = readdirSync(directory).find(name => name.startsWith("close-messages-"));
    appendFileSync(join(directory, receipt), "{partial");
    await assert.rejects(createCodexWorkflowTasks(options).read(ref), /receipt write is incomplete/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("policy-bound creation freezes validated native settings and refuses a below-floor decision", async () => {
  const root = mkdtempSync(join(tmpdir(), "model-task-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const runIdentity = { runId: "model-run", specId: "I_1", target: "main", classification: "SINGLE", approvedScopeHash: "approved", decompositionIdentity: null };
  const policy = { version: ISSUE_MODEL_POLICY_VERSION, specId: "I_1", target: "main", approvedScopeHash: "approved", authorization: "Human approved this pool and one upgrade in task approval-1" };
  const writer = store.acquireWriter(runIdentity.runId);
  writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity, modelPolicy: policy });
  const input = modelDecisionInput({ issueId: "I_1", specId: "I_1", approvedScopeHash: "approved", issueBody: "Authorization. AC-1: protect access. Module: API.", specBody: "Authorization. AC-1: protect access. Module: API." });
  const decision = { inputIdentity: input.inputIdentity, model: "gpt-6-astra", thinking: "high", reason: "Authorization changes require Astra/high.",
    assessment: { scope: ["Authorization"], acceptanceCriteria: ["AC-1: protect access"], affectedModules: ["Module: API"], characteristics: [{ name: "authorization-security", evidence: ["Authorization"] }] } };
  const calls = [];
  const options = { host: { async call(name, args) {
    calls.push({ name, args });
    assert.deepEqual(store.readHostTask({ runId: runIdentity.runId, issueId: "I_1" }).nativeRequest, args, "intent is durable before native submission");
    return { threadId: "worker", hostId: "local" };
  } }, store, project: { projectId: "project", hostId: "local" }, packageRoot: "/installed", issueNumber: async () => 1 };
  try {
    const tasks = createCodexWorkflowTasks(options);
    await assert.rejects(tasks.create({ issueId: "I_1", runIdentity, modelInput: input, modelDecision: { ...decision, model: "gpt-5.6-terra" }, writer }), /floor/u);
    assert.equal(calls.length, 0);
    assert.equal(store.readHostTask({ runId: runIdentity.runId, issueId: "I_1" }), null);
    assert.deepEqual(await tasks.create({ issueId: "I_1", runIdentity, modelInput: input, modelDecision: decision, writer }), { threadId: "worker", hostId: "local" });
    assert.equal(calls[0].args.model, "gpt-6-astra");
    assert.equal(calls[0].args.thinking, "high");
    assert.equal(store.readHostTask({ runId: runIdentity.runId, issueId: "I_1" }).modelDecision.inputIdentity, input.inputIdentity);
    assert.equal(store.readEvents(runIdentity.runId).at(-1).acceptance, "accepted");
    assert.equal(store.readEvents(runIdentity.runId).at(-1).effectiveReadBack, "unavailable");
  } finally { writer.release(); rmSync(root, { recursive: true, force: true }); }
});

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

test("only a confirmed pre-creation model rejection substitutes Astra; transport acknowledgement proves nothing", async () => {
  for (const response of ["unavailable", "astra-unavailable", "acknowledgement", "ack-with-identity", "lost"]) {
    const root = mkdtempSync(join(tmpdir(), "model-substitution-"));
    const store = createRunStore({ gitCommonDir: join(root, ".git") });
    const runIdentity = { runId: "run", specId: "I_1", target: "main", classification: "SINGLE", approvedScopeHash: "approved", decompositionIdentity: null };
    const writer = store.acquireWriter("run");
    writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity,
      modelPolicy: { version: ISSUE_MODEL_POLICY_VERSION, specId: "I_1", target: "main", approvedScopeHash: "approved", authorization: "Explicit pool and bounded upgrade approval" } });
    const input = modelDecisionInput({ issueId: "I_1", specId: "I_1", approvedScopeHash: "approved", issueBody: "Rename. Preserve behavior. Formatter.", specBody: "Rename. Preserve behavior. Formatter." });
    const decision = { inputIdentity: input.inputIdentity, model: "gpt-5.6-terra", thinking: "xhigh", reason: "Mechanically bounded rename with extra reasoning for verification.",
      assessment: { scope: ["Rename"], acceptanceCriteria: ["Preserve behavior"], affectedModules: ["Formatter"], characteristics: [{ name: "local-mechanical", evidence: ["Rename"] }] } };
    const native = [];
    const tasks = createCodexWorkflowTasks({ store, project: { projectId: "project", hostId: "local" }, packageRoot: "/installed", issueNumber: async () => 1, sleep: async () => {},
      host: { async call(name, args) {
        if (name.endsWith("list_threads")) return { threads: [] };
        native.push(args);
        if (args.model === "gpt-6-astra") {
          assert.equal(store.readEvents("run").at(-1).type, "model.substitution", "reserve the final request before calling the host");
          if (response === "astra-unavailable") return { isError: true, structuredContent: { code: "MODEL_UNAVAILABLE", model: args.model, requestSubmitted: false } };
          return { threadId: "worker", hostId: "local" };
        }
        if (["unavailable", "astra-unavailable"].includes(response)) return { isError: true, structuredContent: { code: "MODEL_UNAVAILABLE", model: args.model, requestSubmitted: false } };
        if (response === "lost") throw new Error("response lost");
        return response === "ack-with-identity" ? { type: "response", status: "response-accepted", threadId: "transport-task", hostId: "local" }
          : { type: "response-accepted", id: "transport-only" };
      } } });
    try {
      if (response === "unavailable") {
        await tasks.create({ issueId: "I_1", runIdentity, modelInput: input, modelDecision: decision, writer });
        assert.deepEqual(native.map(({ model, thinking }) => ({ model, thinking })), [{ model: "gpt-5.6-terra", thinking: "xhigh" }, { model: "gpt-6-astra", thinking: "xhigh" }]);
      } else if (response === "astra-unavailable") {
        await assert.rejects(tasks.create({ issueId: "I_1", runIdentity, modelInput: input, modelDecision: decision, writer }), /MODEL_UNAVAILABLE/u);
        assert.deepEqual(await tasks.observePendingCreations({ runIdentity, issueIds: ["I_1"] }), [], "a proven unsubmitted task reserves no worker capacity");
        assert.deepEqual(await tasks.findIssueLane({ runIdentity, issueId: "I_1" }), []);
        await assert.rejects(tasks.create({ issueId: "I_1", runIdentity, writer }), /MODEL_UNAVAILABLE/u);
        assert.equal(native.length, 2, "ordinary re-entry cannot repeat a rejected request or reselect");
      } else {
        await assert.rejects(tasks.create({ issueId: "I_1", runIdentity, modelInput: input, modelDecision: decision, writer }), /TASK_SETUP_PENDING/u);
        assert.equal(native.length, 1);
        assert.equal(store.readEvents("run").at(-1).acceptance, "unknown");
      }
    } finally { writer.release(); rmSync(root, { recursive: true, force: true }); }
  }
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
    assert.match(prompt, /Matt\/Ron workflow owners and runtime/u);
    assert.match(prompt, /shared docs\/ references/u);
    assert.match(prompt, /Generic host support skills explicitly required/u);
    assert.match(prompt, /current session's skill catalog/u);
    const originalIntent = store.readHostTask({ runId: runIdentity.runId, issueId: "I_1" });
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
    assert.match(prompt, /Generic host support skills explicitly required/u, "continuations correct the boundary without editing accepted creation history");
    assert.deepEqual(store.readHostTask({ runId: runIdentity.runId, issueId: "I_1" }), originalIntent);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("accepted execution messages survive restart and omitted native history without retaining their raw prompt", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-message-receipt-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const ref = { threadId: "worker", hostId: "local" };
  const request = { runId: "run", issueId: "I_1", candidate: "a".repeat(40), baseline: "b".repeat(40), wave: 4,
    requestIdentity: `sha256:${"c".repeat(64)}` };
  const prompt = `Use $execute-issue to repair Issue I_1. secret-native-detail. Repair request: ${JSON.stringify(request)}`;
  let sends = 0;
  const options = { store, project: {}, packageRoot: "/installed", issueNumber: async () => 1,
    host: { async call(name, args) {
      if (name.endsWith("read_thread")) return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type: "idle" } }, turns: [{ status: "completed", items: [] }] };
      if (name.endsWith("send_message_to_thread")) { sends += 1; return { threadId: ref.threadId, hostId: ref.hostId }; }
      throw new Error(`Unexpected ${name}`);
    } } };
  try {
    await createCodexWorkflowTasks(options).message(ref, prompt);
    const resumed = createCodexWorkflowTasks(options);
    assert.deepEqual((await resumed.read(ref, { runId: "run" })).repairRequest, { state: "ACCEPTED", ...request });
    await resumed.message(ref, prompt);
    assert.equal(sends, 1, "an accepted owner receipt suppresses resend when native history omits the prompt");
    const receipt = readdirSync(join(root, ".git", "matt-workflow-control", "runs", "run"))
      .find(name => name.startsWith("task-messages-"));
    const receiptPath = join(root, ".git", "matt-workflow-control", "runs", "run", receipt);
    const contents = readFileSync(receiptPath, "utf8");
    assert.equal(contents.includes("secret-native-detail"), false, "general receipts retain allowlisted identity rather than raw prompts");
    assert.match(contents, /"kind":"repair"/u);
    const records = contents.trimEnd().split("\n").map(JSON.parse);
    appendFileSync(receiptPath, `${JSON.stringify({ ...records[1], sequence: 3,
      value: { ...records[1].value, prompt: "injected-native-payload" } })}\n`);
    await assert.rejects(resumed.read(ref, { runId: "run" }), /receipt identity differs/iu,
      "a receipt with non-allowlisted durable payload fields fails closed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an unresolved reserved execution message never resends or changes owner after a lost acknowledgement", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-message-unknown-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const ref = { threadId: "worker", hostId: "local" };
  const request = { runId: "run", issueId: "I_1", attempt: 2 };
  const prompt = `Use $execute-issue to retry Issue I_1. Retry request: ${JSON.stringify(request)}`;
  let sends = 0;
  const delays = [];
  const options = { store, project: {}, packageRoot: "/installed", issueNumber: async () => 1, sleep: async delay => delays.push(delay),
    host: { async call(name) {
      if (name.endsWith("read_thread")) return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type: "idle" } }, turns: [{ status: "completed", items: [] }] };
      if (name.endsWith("send_message_to_thread")) { sends += 1; throw new Error("response lost"); }
      throw new Error(`Unexpected ${name}`);
    } } };
  try {
    await assert.rejects(createCodexWorkflowTasks(options).message(ref, prompt), /outcome is unresolved/iu);
    await assert.rejects(createCodexWorkflowTasks(options).message(ref, prompt), /outcome is unresolved/iu);
    assert.equal(sends, 1, "UNKNOWN native acceptance never authorizes a second mutation");
    assert.deepEqual(delays, [5000, 15000, 30000], "the receipt persists one fixed recovery budget across adapter re-entry");
    assert.deepEqual((await createCodexWorkflowTasks(options).read(ref, { runId: "run" })).retryRequest, { state: "RESERVED", ...request });
    const changed = `Use $execute-issue to retry Issue I_1. Retry request: ${JSON.stringify({ ...request, attempt: 3 })}`;
    await assert.rejects(createCodexWorkflowTasks(options).message(ref, changed), /different unresolved request/iu);
    assert.equal(sends, 1);
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

test("isolated repair fork adopts a lost response after exact settled-owner handoff and survives restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "repair-fork-"));
  execFileSync("git", ["init", root], { stdio: "ignore" });
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const originalTaskRef = { threadId: "original", hostId: "local" }, repairRef = { threadId: "repair", hostId: "local" };
  const runIdentity = { runId: "run", issueId: "I_1", specId: "I_1", target: "main" };
  let forks = 0, messages = 0, marker, active = false, omitOriginalHistory = false;
  const host = { async call(name, args) {
    if (name.endsWith("send_message_to_thread")) { messages++; marker = args.prompt; return {}; }
    if (name.endsWith("fork_thread")) { forks++; assert.ok(store.readHostTask({ runId: "run", issueId: "I_1", purpose: "recovery:operation" })); throw new Error("response lost"); }
    if (name.endsWith("list_threads")) return { threads: forks ? [{ id: "repair", hostId: "local", kind: "codex", cwd: root }] : [] };
    if (name.endsWith("read_thread")) return { thread: { id: args.threadId, hostId: "local", cwd: root, status: { type: active && args.threadId === "original" ? "active" : "idle" } },
      turns: [{ id: "settled-turn", status: "completed", items: marker && !(omitOriginalHistory && args.threadId === "original")
        ? [{ type: "userMessage", content: [{ type: "text", text: marker }] }] : [] }] };
    throw new Error(name);
  } };
  const options = { host, store, project: { path: root, hostId: "local" }, packageRoot: "/pinned", issueNumber: async () => 1, sleep: async () => {}, discoverTasks: async () => [] };
  const input = { issueId: "I_1", runIdentity, operationId: "operation", originalTaskRef, worktree: root };
  try {
    const first = await createCodexWorkflowTasks(options).ensureRecoveryTask(input);
    assert.deepEqual(first.taskRef, repairRef);
    assert.deepEqual(first.previousOwner.taskRef, originalTaskRef);
    assert.equal(first.previousOwner.state, "SETTLED");
    const intent = store.readHostTask({ runId: "run", issueId: "I_1", purpose: "recovery:operation" });
    omitOriginalHistory = true;
    assert.deepEqual((await createCodexWorkflowTasks(options).ensureRecoveryTask(input)).taskRef, repairRef);
    assert.equal(forks, 1); assert.equal(messages, 1);
    assert.deepEqual(store.readHostTask({ runId: "run", issueId: "I_1", purpose: "recovery:operation" }), intent);
    active = true;
    await assert.rejects(createCodexWorkflowTasks(options).ensureRecoveryTask(input), /previous writer/u);
    assert.equal(forks, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an omitted recovery handoff outcome exhausts one durable observation budget without resend", async () => {
  const root = mkdtempSync(join(tmpdir(), "repair-handoff-omitted-"));
  execFileSync("git", ["init", root], { stdio: "ignore" });
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const originalTaskRef = { threadId: "original", hostId: "local" };
  const runIdentity = { runId: "run", issueId: "I_1", specId: "I_1", target: "main" };
  const delays = [];
  let sends = 0;
  const options = { store, project: { path: root, hostId: "local" }, packageRoot: "/pinned", issueNumber: async () => 1,
    sleep: async delay => delays.push(delay), discoverTasks: async () => [], host: { async call(name, args) {
      if (name.endsWith("read_thread")) return { thread: { id: args.threadId, hostId: "local", cwd: root, status: { type: "idle" } },
        turns: [{ id: "settled-turn", status: "completed", items: [] }] };
      if (name.endsWith("send_message_to_thread")) { sends += 1; throw new Error("response lost"); }
      throw new Error(`Unexpected ${name}`);
    } } };
  const input = { issueId: "I_1", runIdentity, operationId: "operation", originalTaskRef, worktree: root };
  try {
    await assert.rejects(createCodexWorkflowTasks(options).ensureRecoveryTask(input), /message outcome is unresolved/u);
    await assert.rejects(createCodexWorkflowTasks(options).ensureRecoveryTask(input), /message outcome is unresolved/u);
    assert.equal(sends, 1);
    assert.deepEqual(delays, [5000, 15000, 30000]);
    const receiptName = readdirSync(join(root, ".git", "matt-workflow-control", "runs", "run"))
      .find(name => name.startsWith("task-messages-"));
    const receipt = readFileSync(join(root, ".git", "matt-workflow-control", "runs", "run", receiptName), "utf8");
    assert.match(receipt, /"kind":"recovery-handoff"/u);
    assert.equal(receipt.includes("Subsequent repair messages"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a lost model continuation response reconciles the same task and never reserves a second upgrade", async () => {
  const root = mkdtempSync(join(tmpdir(), "model-upgrade-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-b", "topic"); git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "candidate");
  const candidate = git("rev-parse", "HEAD");
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const writer = store.acquireWriter("run");
  const runIdentity = { runId: "run", specId: "I_1", target: "main", classification: "SINGLE", approvedScopeHash: "approved", decompositionIdentity: null };
  const ref = { threadId: "worker", hostId: "local" };
  let prompt, sends = 0, active = true, omitHistory = false;
  const delays = [];
  const tasks = createCodexWorkflowTasks({ store, project: { path: root }, packageRoot: "/installed", issueNumber: async () => 1,
    sleep: async delay => delays.push(delay),
    host: { async call(name, args) {
      if (name.endsWith("read_thread")) return { thread: { id: ref.threadId, hostId: ref.hostId, cwd: root, status: { type: active ? "active" : "idle" } },
        turns: [{ status: "completed", items: prompt && !omitHistory ? [{ type: "userMessage", content: [{ type: "text", text: prompt }] }] : [] }] };
      assert.equal(name, "mcp__codex_app__send_message_to_thread");
      assert.equal(args.threadId, ref.threadId); assert.equal(args.model, "gpt-6-astra"); assert.equal(args.thinking, "xhigh");
      assert.match(args.prompt, /2\/10/u); assert.match(args.prompt, new RegExp(candidate));
      sends++; prompt = args.prompt; throw new Error("response lost after native acceptance");
    } } });
  try {
    writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity,
      modelPolicy: { version: ISSUE_MODEL_POLICY_VERSION, specId: "I_1", target: "main", approvedScopeHash: "approved", authorization: "Explicit model pool and bounded escalation approval" } });
    writer.append({ type: "dispatch.recorded", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", taskRef: ref, attempt: 1 });
    const draft = { type: "model.upgrade", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", taskRef: ref,
      candidate, worktree: root, topic: "topic", repairWaves: 2, model: "gpt-6-astra", thinking: "xhigh", reason: "Same confirmed finding after two verified material repairs",
      requestIdentity: "sha256:" + "a".repeat(64), yieldIdentity: "sha256:" + "b".repeat(64) };
    const intent = writer.append(draft);
    await assert.rejects(tasks.upgrade({ ref, intent, runIdentity, writer }), /active/u);
    assert.equal(sends, 0);
    active = false;
    assert.equal((await tasks.upgrade({ ref, intent, runIdentity, writer })).observed, true);
    omitHistory = true;
    assert.equal((await tasks.upgrade({ ref, intent, runIdentity, writer })).observed, true);
    assert.equal(sends, 1);
    assert.deepEqual(delays, [5000]);
    assert.equal(store.readEvents("run").at(-1).acceptance, "unknown", "message read-back is not independent effective-model evidence");
    assert.throws(() => writer.append(draft), /sole allowance/u);
  } finally { writer.release(); rmSync(root, { recursive: true, force: true }); }
});

test("an omitted model continuation outcome consumes one durable 5/15/30 budget without resend", async () => {
  const root = mkdtempSync(join(tmpdir(), "model-upgrade-omitted-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-b", "topic"); git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "candidate");
  const candidate = git("rev-parse", "HEAD");
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const writer = store.acquireWriter("run");
  const runIdentity = { runId: "run", specId: "I_1", target: "main", classification: "SINGLE", approvedScopeHash: "approved", decompositionIdentity: null };
  const ref = { threadId: "worker", hostId: "local" };
  const delays = [];
  let sends = 0;
  const options = { store, project: { path: root }, packageRoot: "/installed", issueNumber: async () => 1,
    sleep: async delay => delays.push(delay), host: { async call(name) {
      if (name.endsWith("read_thread")) return { thread: { id: ref.threadId, hostId: ref.hostId, cwd: root, status: { type: "idle" } },
        turns: [{ status: "completed", items: [] }] };
      if (name.endsWith("send_message_to_thread")) { sends += 1; throw new Error("response lost"); }
      throw new Error(name);
    } } };
  try {
    writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity,
      modelPolicy: { version: ISSUE_MODEL_POLICY_VERSION, specId: "I_1", target: "main", approvedScopeHash: "approved", authorization: "Explicit model pool and bounded escalation approval" } });
    writer.append({ type: "dispatch.recorded", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", taskRef: ref, attempt: 1 });
    const intent = writer.append({ type: "model.upgrade", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", taskRef: ref,
      candidate, worktree: root, topic: "topic", repairWaves: 2, model: "gpt-6-astra", thinking: "xhigh", reason: "Repeated confirmed finding",
      requestIdentity: "sha256:" + "a".repeat(64), yieldIdentity: "sha256:" + "b".repeat(64) });
    await assert.rejects(createCodexWorkflowTasks(options).upgrade({ ref, intent, runIdentity, writer }), /outcome unresolved/u);
    await assert.rejects(createCodexWorkflowTasks(options).upgrade({ ref, intent, runIdentity, writer }), /outcome unresolved/u);
    assert.equal(sends, 1);
    assert.deepEqual(delays, [5000, 15000, 30000]);
    const receiptName = readdirSync(join(root, ".git", "matt-workflow-control", "runs", "run"))
      .find(name => name.startsWith("task-messages-"));
    const receipt = readFileSync(join(root, ".git", "matt-workflow-control", "runs", "run", receiptName), "utf8");
    assert.match(receipt, /"kind":"upgrade"/u);
    assert.equal(receipt.trimEnd().split("\n").length, 4, "one intent and three observations exhaust the original owner");
  } finally { writer.release(); rmSync(root, { recursive: true, force: true }); }
});

test("message reconciliation and read transport share one 5/15/30 budget", async () => {
  const root = mkdtempSync(join(tmpdir(), "model-upgrade-shared-budget-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-b", "topic"); git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "candidate");
  const candidate = git("rev-parse", "HEAD");
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const writer = store.acquireWriter("run");
  const runIdentity = { runId: "run", specId: "I_1", target: "main", classification: "SINGLE", approvedScopeHash: "approved", decompositionIdentity: null };
  const ref = { threadId: "worker", hostId: "local" };
  const delays = [];
  let sends = 0, failedHistoryReads = 0;
  const options = { store, project: { path: root }, packageRoot: "/installed", issueNumber: async () => 1,
    sleep: async delay => delays.push(delay), host: { async call(name) {
      if (name.endsWith("read_thread") && sends === 0) return { thread: { id: ref.threadId, hostId: ref.hostId, cwd: root, status: { type: "idle" } },
        turns: [{ status: "completed", items: [] }] };
      if (name.endsWith("read_thread")) { failedHistoryReads += 1; throw new Error("temporary connection failure"); }
      if (name.endsWith("send_message_to_thread")) { sends += 1; throw new Error("response lost"); }
      throw new Error(name);
    } } };
  try {
    writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity,
      modelPolicy: { version: ISSUE_MODEL_POLICY_VERSION, specId: "I_1", target: "main", approvedScopeHash: "approved", authorization: "Explicit model pool and bounded escalation approval" } });
    writer.append({ type: "dispatch.recorded", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", taskRef: ref, attempt: 1 });
    const intent = writer.append({ type: "model.upgrade", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", taskRef: ref,
      candidate, worktree: root, topic: "topic", repairWaves: 2, model: "gpt-6-astra", thinking: "xhigh", reason: "Repeated confirmed finding",
      requestIdentity: "sha256:" + "a".repeat(64), yieldIdentity: "sha256:" + "b".repeat(64) });
    await assert.rejects(createCodexWorkflowTasks(options).upgrade({ ref, intent, runIdentity, writer }), /outcome unresolved/u);
    assert.equal(sends, 1);
    assert.equal(failedHistoryReads, 3, "each persisted owner round performs one transport attempt");
    assert.deepEqual(delays, [5000, 15000, 30000]);
    assert.deepEqual(store.listHostFaults("run"), [], "receipt reconciliation does not open a nested transport budget");
  } finally { writer.release(); rmSync(root, { recursive: true, force: true }); }
});

test("one read-only transport fault consumes exactly 5/15/30 recovery seconds across re-entry", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-fault-budget-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const ref = { threadId: "worker", hostId: "local" };
  const delays = [];
  let calls = 0;
  const options = {
    store,
    runId: "run-1",
    project: {},
    packageRoot: "/installed",
    issueNumber: async () => 1,
    sleep: async () => {},
    waitForObservationSignal: async ({ timeoutMs }) => { delays.push(timeoutMs); return null; },
    host: { async call(name) {
      assert.equal(name, "mcp__codex_app__wait_threads");
      calls += 1;
      throw new Error("temporary connection unavailable");
    } },
  };
  try {
    await assert.rejects(createCodexWorkflowTasks(options).wait([ref]), /recovery budget exhausted/iu);
    assert.deepEqual(delays, [5000, 15000, 30000]);
    assert.equal(calls, 4, "the initial observation plus three recovery rounds share one budget");
    const fault = store.readHostFault({ runId: "run-1", faultId: store.listHostFaults("run-1")[0].faultId });
    assert.equal(fault.state, "exhausted");
    assert.equal(fault.recoveryRounds, 3);

    await assert.rejects(createCodexWorkflowTasks(options).wait([ref]), /recovery budget exhausted/iu);
    assert.equal(calls, 4, "a recreated adapter cannot reset or multiply the exhausted budget");
    assert.deepEqual(delays, [5000, 15000, 30000]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a settled deterministic fault identity resumes its consumed budget after adapter re-entry", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-settled-fault-budget-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const ref = { threadId: "worker", hostId: "local" };
  const delays = [];
  let calls = 0;
  const options = {
    store,
    runId: "run-1",
    project: {},
    packageRoot: "/installed",
    waitForObservationSignal: async ({ timeoutMs }) => { delays.push(timeoutMs); return null; },
    host: { async call(name) {
      assert.equal(name, "mcp__codex_app__wait_threads");
      calls += 1;
      if (calls % 2 === 1) throw new Error("temporary connection unavailable");
      return { timedOut: true, polls: [{ threadId: ref.threadId, status: "running", event: "unchanged" }] };
    } },
  };
  try {
    await createCodexWorkflowTasks(options).wait([ref]);
    let fault = store.listHostFaults("run-1")[0];
    assert.equal(fault.state, "settled");
    assert.equal(fault.recoveryRounds, 1);
    await createCodexWorkflowTasks(options).wait([ref]);
    fault = store.readHostFault({ runId: "run-1", faultId: fault.faultId });
    assert.deepEqual(delays, [5000, 15000], "the stable identity continues with its next unconsumed delay");
    assert.equal(calls, 4);
    assert.equal(fault.state, "settled");
    assert.equal(fault.recoveryRounds, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("event waits rotate batches of eight, reuse cursors and read full history only for a material terminal event", async () => {
  const refs = Array.from({ length: 9 }, (_, index) => ({ threadId: `worker-${index + 1}`, hostId: "local" }));
  const batches = [];
  let waits = 0, reads = 0;
  const tasks = createCodexWorkflowTasks({ project: {}, packageRoot: "/installed", host: { async call(name, args) {
    if (name.endsWith("wait_threads")) {
      batches.push(args.targets);
      assert.ok(args.timeoutMs <= 60000);
      waits += 1;
      if (waits === 3) return { polls: [{ threadId: args.targets[0].threadId, cursor: "terminal-cursor", status: "completed", event: "completion" }] };
      return { timedOut: true, polls: args.targets.map(target => ({ threadId: target.threadId,
        cursor: `cursor-${target.threadId}`, status: "running", event: "unchanged" })) };
    }
    if (name.endsWith("read_thread")) {
      reads += 1;
      return { thread: { id: args.threadId, hostId: args.hostId, status: { type: "idle" } },
        turns: [{ id: "done", status: "completed", items: [{ type: "agentMessage", phase: "final_answer", text: "done" }] }] };
    }
    throw new Error(name);
  } } });

  const first = await tasks.wait(refs);
  const second = await tasks.wait(refs);
  const third = await tasks.wait(refs);
  assert.deepEqual(batches.map(batch => batch.length), [8, 8, 8]);
  assert.deepEqual(batches[0].map(({ threadId }) => threadId), refs.slice(0, 8).map(({ threadId }) => threadId));
  assert.equal(batches[1][0].threadId, "worker-9", "the next bounded batch rotates fairly");
  assert.equal(batches[1][1].afterCursor, "cursor-worker-1");
  assert.equal(reads, 1, "unchanged running polls never request full task history");
  assert.equal(first.observation.fullHistoryReads, 0);
  assert.equal(second.observation.kind, "unchanged");
  assert.equal(third.observation.kind, "changed");
  assert.equal(third.observation.fullHistoryReads, 1);
  assert.equal(third.observation.modelRoundTrips, "unavailable");
  assert.equal(third.observation.tokens, "unavailable");
  assert.ok(third.observation.returnedBytes > 0);
});

test("unsupported event notification falls back at 15/30/60 seconds and resets only after semantic change", async () => {
  const ref = { threadId: "worker", hostId: "local" };
  const delays = [];
  let state = "active", snapshots = 0, fullReads = 0;
  const tasks = createCodexWorkflowTasks({ project: {}, packageRoot: "/installed",
    waitForObservationSignal: async ({ timeoutMs }) => { delays.push(timeoutMs); return null; },
    host: { async call(name, args) {
      if (name.endsWith("wait_threads")) throw new Error("Unsupported desktop tool: wait_threads");
      if (name.endsWith("read_thread")) {
        if (args.includeOutputs) fullReads += 1; else snapshots += 1;
        return { thread: { id: args.threadId, hostId: args.hostId, status: { type: state } },
          turns: args.includeOutputs ? [{ id: "done", status: "completed", items: [] }] : [] };
      }
      throw new Error(name);
    } } });

  await tasks.wait([ref]);
  await tasks.wait([ref]);
  await tasks.wait([ref]);
  await tasks.wait([ref]);
  assert.deepEqual(delays, [15000, 30000, 60000, 60000]);
  state = "idle";
  const changed = await tasks.wait([ref]);
  await tasks.wait([ref]);
  assert.equal(changed.observation.kind, "changed");
  assert.equal(delays.at(-1), 15000, "a material state transition resets the next fallback interval");
  assert.equal(snapshots, 6);
  assert.equal(fullReads, 1, "only the material terminal transition fetches bounded full task history");
});

test("fallback task observation yields independently for a control or execution deadline", async () => {
  const ref = { threadId: "worker", hostId: "local" };
  for (const signal of [{ control: "PAUSE" }, { deadline: "2026-09-09T20:00:00.000Z" }]) {
    const delays = [];
    let checks = 0;
    const tasks = createCodexWorkflowTasks({ project: {}, packageRoot: "/installed",
      readObservationSignal: async () => (++checks === 1 && signal.control ? signal : null),
      waitForObservationSignal: async ({ timeoutMs }) => { delays.push(timeoutMs); return signal.deadline ? signal : null; },
      host: { async call(name) {
        if (name.endsWith("wait_threads")) throw new Error("wait_threads is not available");
        throw new Error(`Task history must not be read after ${signal.control ? "control" : "deadline"}`);
      } },
    });
    const observed = await tasks.wait([ref]);
    assert.equal(observed.observation.kind, "interrupted");
    assert.equal(observed.observation.signal, signal.control ? "control" : "deadline");
    assert.deepEqual(delays, signal.control ? [] : [15000]);
    assert.equal(observed.observation.fullHistoryReads, 0);
    assert.equal(observed.observation.nativeCalls, signal.control ? 0 : 1,
      "a queued control prevents the event call while a later deadline retains the unsupported probe metric");
  }
});

test("control interrupts wait_threads fault recovery before another native call", async () => {
  const ref = { threadId: "worker", hostId: "local" };
  const recoveryWindows = [];
  let calls = 0;
  const tasks = createCodexWorkflowTasks({ project: {}, packageRoot: "/installed", runId: "run",
    readObservationSignal: async () => null,
    waitForObservationSignal: async ({ timeoutMs }) => {
      recoveryWindows.push(timeoutMs);
      return { control: "STOP" };
    },
    host: { async call(name) {
      assert.equal(name, "mcp__codex_app__wait_threads");
      calls += 1;
      throw new Error("temporary connection failure");
    } },
  });
  const observed = await tasks.wait([ref]);
  assert.equal(observed.observation.kind, "interrupted");
  assert.equal(observed.observation.signal, "control");
  assert.deepEqual(recoveryWindows, [5000]);
  assert.equal(calls, 1, "the interrupted recovery never issues a second native call");
});

test("control interrupts fallback snapshot recovery before another read_thread call", async () => {
  const ref = { threadId: "worker", hostId: "local" };
  const recoveryWindows = [];
  const calls = [];
  let reads = 0;
  const tasks = createCodexWorkflowTasks({ project: {}, packageRoot: "/installed", runId: "run",
    sleep: async () => {},
    readObservationSignal: async () => null,
    waitForObservationSignal: async ({ timeoutMs }) => {
      recoveryWindows.push(timeoutMs);
      return timeoutMs === 5000 ? { control: "STOP" } : null;
    },
    host: { async call(name) {
      calls.push(name);
      if (name === "mcp__codex_app__wait_threads") throw new Error("Unsupported wait_threads");
      assert.equal(name, "mcp__codex_app__read_thread");
      reads += 1;
      if (reads === 1) throw new Error("temporary connection failure");
      return { thread: { id: ref.threadId, hostId: ref.hostId, status: { type: "active" } }, turns: [] };
    } },
  });
  const observed = await tasks.wait([ref]);
  assert.equal(observed.observation.kind, "interrupted");
  assert.equal(observed.observation.mode, "fallback");
  assert.equal(observed.observation.signal, "control");
  assert.deepEqual(recoveryWindows, [15000, 5000]);
  assert.deepEqual(calls, ["mcp__codex_app__wait_threads", "mcp__codex_app__read_thread"]);
});

test("deadline interrupts material full-history recovery before another read_thread call", async () => {
  const refs = [{ threadId: "worker-1", hostId: "local" }, { threadId: "worker-2", hostId: "local" }];
  const recoveryWindows = [];
  const calls = [];
  let reads = 0;
  const tasks = createCodexWorkflowTasks({ project: {}, packageRoot: "/installed", runId: "run",
    readObservationSignal: async () => null,
    waitForObservationSignal: async ({ timeoutMs }) => {
      recoveryWindows.push(timeoutMs);
      return { deadline: "2026-09-09T20:00:00.000Z" };
    },
    host: { async call(name, args) {
      calls.push(name);
      if (name === "mcp__codex_app__wait_threads") {
        return { polls: refs.map(ref => ({ threadId: ref.threadId, status: "completed", event: "completion" })) };
      }
      assert.equal(name, "mcp__codex_app__read_thread");
      if (args.threadId === refs[0].threadId) {
        return { thread: { id: refs[0].threadId, hostId: refs[0].hostId, status: { type: "idle" } }, turns: [] };
      }
      reads += 1;
      if (reads === 1) throw new Error("temporary connection failure");
      return { thread: { id: refs[1].threadId, hostId: refs[1].hostId, status: { type: "idle" } }, turns: [] };
    } },
  });
  const observed = await tasks.wait(refs);
  assert.equal(observed.observation.kind, "interrupted");
  assert.equal(observed.observation.mode, "event");
  assert.equal(observed.observation.signal, "deadline");
  assert.equal(observed.observation.fullHistoryReads, 1, "completed reads remain counted before a later batch member is interrupted");
  assert.deepEqual(recoveryWindows, [5000]);
  assert.deepEqual(calls, ["mcp__codex_app__wait_threads", "mcp__codex_app__read_thread", "mcp__codex_app__read_thread"]);
});

test("production composition binds the Run fault store and task observation signals", () => {
  const source = readFileSync(new URL("../../skills/personal/run-issue-workflow/scripts/codex-workflow.mjs", import.meta.url), "utf8");
  const coordinator = readFileSync(new URL("../../skills/personal/run-issue-workflow/scripts/run-coordinator.mjs", import.meta.url), "utf8");
  assert.match(source, /runId:\s*effectiveRunIdentity\.runId/u);
  assert.match(source, /readObservationSignal:\s*observationSignal/u);
  assert.match(source, /executionDeadlineAt/u);
  assert.match(coordinator, /observation\?\.signal === "deadline"/u);
});
