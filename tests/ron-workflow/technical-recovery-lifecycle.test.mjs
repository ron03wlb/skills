import assert from "node:assert/strict";
import test from "node:test";
import childProcess, { execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { renderWorkflowRecord, bodyDigest } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { bindProducerCheckpointOperationIdentity, deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

test("packaged sources and native task adapter carry a real failed merge verification through isolated repair and renewed close", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "technical-recovery-")));
  const repository = join(root, "repository"), lane = join(root, "issue"), packageRoot = join(root, "package");
  const originalExec = childProcess.execFileSync;
  const gitAt = (cwd, ...args) => originalExec("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const git = (...args) => gitAt(repository, ...args);
  try {
    for (const folder of ["personal/run-issue-workflow/scripts", "engineering/execute-issue/scripts", "engineering/close-issue/scripts"]) {
      cpSync(resolve("skills", folder), join(packageRoot, "skills", folder), { recursive: true });
    }
    const moduleAt = name => import(pathToFileURL(join(packageRoot, "skills", name)).href);
    const { createRunStore } = await moduleAt("personal/run-issue-workflow/scripts/run-store.mjs");
    const { createWorkflowControlStore } = await moduleAt("personal/run-issue-workflow/scripts/workflow-control-store.mjs");
    const { createGitHubWorkflowSources } = await moduleAt("personal/run-issue-workflow/scripts/github-workflow-sources.mjs");
    const { createCodexWorkflowTasks } = await moduleAt("personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs");
    const { createCoordinator } = await moduleAt("personal/run-issue-workflow/scripts/run-coordinator.mjs");
    const { withCloseIssueLeases } = await moduleAt("engineering/close-issue/scripts/close-lease.mjs");
    const { mergeCandidate, verifyIntegratedCandidate } = await moduleAt("engineering/close-issue/scripts/merge-candidate.mjs");
    originalExec("git", ["init", "-b", "main", repository], { stdio: "ignore" });
    git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("remote", "add", "origin", "https://github.com/example/repo.git");
    writeFileSync(join(repository, "behavior.txt"), "base"); git("add", "."); git("commit", "-m", "baseline");
    const baseline = git("rev-parse", "HEAD");
    git("worktree", "add", "-b", "issue", lane, "main");
    writeFileSync(join(lane, "behavior.txt"), "broken"); gitAt(lane, "commit", "-am", "original Issue candidate");
    const oldCandidate = gitAt(lane, "rev-parse", "HEAD");
    const common = join(repository, ".git"), store = createRunStore({ gitCommonDir: common });
    const body = "Settled requirements: behavior is fixed";
    const authority = { specId: "I_1", target: "main", planningSeal: baseline, classification: "SINGLE", approvedScopeHash: bodyDigest(body), decompositionIdentity: null };
    const identity = bindProducerCheckpointOperationIdentity({ repositoryId: "github:example/repo", specId: "I_1", producerCommand: "to-spec", profileVersion: "v2", target: "main", baseline,
      bindings: { approvedScopeIdentity: authority.approvedScopeHash, classification: "SINGLE", planningSeal: baseline } });
    const control = createWorkflowControlStore({ gitCommonDir: common });
    const transaction = control.createCheckpoint(identity);
    for (const [stage, receipt] of [["planning_seal.read_back", { planningSeal: baseline, state: "reused" }], ["publication.read_back", { publicationIdentity: "IC_pub", trackerIdentity: "I_1" }], ["handoff.completed", { handoffIdentity: "IC_hand" }]]) control.advanceCheckpoint({ identity, stage, receipt });
    const operationIdentity = deriveExecuteIssueOperationIdentity({ repositoryId: "github:example/repo", specId: "I_1", issueId: "I_1", approvedPublicationIdentity: authority.approvedScopeHash });
    const comment = (id, record) => ({ node_id: id, author_association: "OWNER", body: renderWorkflowRecord(record) });
    const completion = { kind: "implementation_complete", issueId: "I_1", specId: "I_1", target: "main", targetWorktree: repository, topic: "issue", worktree: lane,
      baseline, candidate: oldCandidate, planningSeal: baseline, operationIdentity, repairWaveCount: 3, workflowArtifacts: [],
      standards: "clean", spec: "clean", worktreeState: "clean", manualAttestations: [], verification: [{ command: "original unit fixture", result: "PASS" }] };
    const oldCompletion = comment("IC_done", completion);
    const fixture = { node_id: "I_1", number: 1, state: "open", body, comments: [
      comment("IC_pub", { kind: "spec_publication", repositoryId: "github:example/repo", authority }),
      comment("IC_hand", { kind: "producer_handoff", ...authority, producerCommand: "to-spec", checkpointIdentity: identity,
        transactionIdentity: transaction.transactionId, publicationIdentity: "IC_pub", trackerIdentity: "I_1", recordIdentities: ["IC_pub"] }), oldCompletion] };
    childProcess.execFileSync = (name, args, options) => {
      if (name !== "gh") return originalExec(name, args, options);
      const route = args[1];
      return JSON.stringify(route === "graphql" ? { data: { node: { id: "I_1", number: 1, repository: { nameWithOwner: "example/repo" } } } }
        : route.includes("comments") ? [fixture.comments] : /events\?|blocked_by/u.test(route) ? [[]] : [fixture]);
    };
    syncBuiltinESMExports();
    const originalRef = { threadId: "original", hostId: "local" }, repairRef = { threadId: "repair", hostId: "local" };
    const histories = new Map([["original", []]]);
    let closeMessages = 0, forks = 0, repairs = 0, runIdentity, repairRecord, activeOriginal = false;
    const argv = [process.execPath, "-e", "require('node:assert/strict').equal(require('node:fs').readFileSync('behavior.txt','utf8'),'fixed')"];
    const checks = [{ command: argv, environment: { node: process.version }, readExternalInputs: async () => ({}) }];
    const host = { async call(name, args) {
      if (name.endsWith("read_thread")) return { thread: { id: args.threadId, hostId: "local", cwd: lane, status: { type: activeOriginal && args.threadId === "original" ? "active" : "idle" } }, turns: histories.get(args.threadId) };
      if (name.endsWith("list_threads")) return { threads: forks ? [{ id: "repair", hostId: "local", kind: "codex", cwd: lane }] : [] };
      if (name.endsWith("fork_thread")) {
        forks++; histories.set("repair", structuredClone(histories.get("original")));
        throw new Error("response lost after exact same-directory fork");
      }
      if (name.endsWith("send_message_to_thread")) {
        const turn = { id: `turn-${histories.get(args.threadId).length}`, status: "completed", items: [{ type: "userMessage", content: [{ type: "text", text: args.prompt }] }] };
        histories.get(args.threadId).unshift(turn);
        const recovery = args.prompt.match(/^Recovery request: (\{.+\})$/mu);
        if (recovery) {
          assert.equal(args.threadId, "repair", "the original task never performs repair edits");
          const request = JSON.parse(recovery[1]);
          const failure = JSON.parse(args.prompt.match(/^Original failure and authority: (\{.+\})$/mu)[1]);
          if (request.phase === "DIAGNOSE") turn.items.push({ type: "agentMessage", phase: "final_answer", text: `Workflow recovery result: ${JSON.stringify({ requestIdentity: request.requestIdentity, failureIdentity: request.failureIdentity,
            diagnosis: { classification: "ISSUE_DEFECT", source: "behavior.txt", reason: "Concrete test proves settled behavior is broken", scopeCompatible: true } })}` });
          else {
            assert.equal(request.phase, "REPAIR"); assert.equal(request.wave, 4); repairs++;
            assert.equal(store.readEvents(runIdentity.runId).at(-1).type, "recovery.task");
            assert.equal(store.readTargetMutationWriterLock("main"), null);
            assert.equal(store.observeRepositoryCloseLease().state, "ABSENT");
            const capturedTarget = git("rev-parse", "main"); gitAt(lane, "merge", "--no-edit", capturedTarget);
            writeFileSync(join(lane, "behavior.txt"), "fixed"); gitAt(lane, "commit", "-am", "Repair settled Issue behavior");
            originalExec(argv[0], argv.slice(1), { cwd: lane });
            // Reviews are explicit fixture inputs. This test executes Git and verification, not an LLM review.
            repairRecord = { ...completion, baseline: capturedTarget, candidate: gitAt(lane, "rev-parse", "HEAD"), repairWaveCount: 4,
              verification: [{ command: argv.join(" "), argv, result: "PASS" }], recovery: { failureIdentity: failure.identity, requestIdentity: request.requestIdentity, taskRef: repairRef,
                previousCompletionIdentity: "IC_done", previousCompletionBodySha256: bodyDigest(oldCompletion.body) } };
            fixture.comments.push(comment("IC_repaired", repairRecord));
          }
        } else if (args.prompt.includes("Close request identity:")) {
          assert.equal(args.threadId, "original"); closeMessages++;
          const request = JSON.parse(args.prompt.match(/Current close request evidence: (\{.+\})/u)[1]);
          const candidate = request.authorityEvidence.candidateCommit;
          if (closeMessages === 2) { activeOriginal = true; assert.deepEqual((await refresh()).facts.contradictions, [], "the original close owner may run after repair settlement"); activeOriginal = false; }
          await withCloseIssueLeases({ store, target: "main", repositoryId: "github:example/repo", specId: "I_1", issueId: "I_1", approvedPublicationIdentity: authority.approvedScopeHash }, async leases => {
            mergeCandidate({ leases, targetWorktree: repository, candidate });
            const verification = await verifyIntegratedCandidate({ leases, targetWorktree: repository, candidate, issueId: "I_1", operationId: operationIdentity.key, checks });
            if (verification.state === "PASS") { git("worktree", "remove", lane); fixture.state = "closed"; }
          });
        }
        throw new Error("response lost after accepted action");
      }
      throw new Error(`Unexpected native call ${name}`);
    } };
    histories.get("original").push({ id: "execution", status: "completed", items: [] });
    const tasks = createCodexWorkflowTasks({ host, store, project: { path: repository, hostId: "local" }, packageRoot, issueNumber: async () => 1, sleep: async () => {}, discoverTasks: async () => [] });
    const owners = createGitHubWorkflowSources({ repository, repositoryName: "example/repo", store, tasks });
    const refresh = () => owners.sources.tracker.read({ specId: "I_1" }).then(tracker => owners.sources.reconciliation.read({ tracker, journal: runIdentity ? store.readEvents(runIdentity.runId) : [], request: {} }));
    runIdentity = (await refresh()).runIdentity;
    const writer = store.acquireWriter(runIdentity.runId);
    writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity, maxParallel: 3 });
    writer.append({ type: "dispatch.recorded", at: "2026-09-08T00:00:00.000Z", issueId: "I_1", attempt: 1, taskRef: originalRef }); writer.release();
    const options = { store, tasks, tracker: owners.sources.tracker, reconcile: args => owners.sources.reconciliation.read(args),
      handoff: { read: async ({ current }) => current.runReadyAuthority }, now: () => "2026-09-08T00:00:00.000Z", sleep: async () => {} };
    const step = () => createCoordinator(options).run({ specId: "I_1", mode: "step" });
    await step();
    assert.equal((await refresh()).facts.nodes[0].integrationVerification.state, "FAIL");
    assert.equal(existsSync(lane), true); assert.equal(fixture.state, "open"); assert.equal(git("rev-parse", "HEAD"), oldCandidate);
    await step(); // Settled handoff, lost fork response, diagnosis.
    const repairStatus = await step(); // Same isolated task, material repair, renewed completion.
    assert.equal(repairs, 1, JSON.stringify({failures: store.readEvents(runIdentity.runId).filter(e=>e.type === "action.failed"), forks, histories: [...histories.keys()], status: repairStatus.run})); assert.equal(closeMessages, 1);
    assert.equal((await refresh()).facts.nodes[0].repairLineage.previousCandidate, oldCandidate);
    const valid = fixture.comments.at(-1).body;
    fixture.comments.at(-1).body = renderWorkflowRecord({ ...repairRecord, recovery: { ...repairRecord.recovery, taskRef: originalRef } });
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /Repair completion/u);
    fixture.comments.at(-1).body = renderWorkflowRecord({ ...repairRecord, verification: [{ command: "different command", argv: ["skip"], result: "PASS" }] });
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /Repair completion/u);
    fixture.comments.at(-1).body = valid;
    const completed = await step();
    assert.equal(completed.run.state, "SUCCEEDED", JSON.stringify(completed));
    assert.equal((await step()).run.state, "SUCCEEDED");
    assert.equal(forks, 1); assert.equal(closeMessages, 2); assert.equal(fixture.state, "closed"); assert.equal(existsSync(lane), false);
    assert.equal(git("rev-parse", "main"), repairRecord.candidate);
    const journal = store.readEvents(runIdentity.runId);
    assert.equal(journal.filter(event => event.type === "grant.recorded").length, 1);
    assert.equal(journal.filter(event => event.type === "dispatch.recorded").length, 1);
    assert.equal(journal.filter(event => event.type === "repair.recorded").length, 0, "integration repair never fabricates conflict history");
    assert.deepEqual(journal.filter(event => event.type === "recovery.intent").map(event => event.wave), [null, 4]);
    assert.equal(store.readTargetMutationWriterLock("main"), null); assert.equal(store.observeRepositoryCloseLease().state, "ABSENT");
  } finally { childProcess.execFileSync = originalExec; syncBuiltinESMExports(); rmSync(root, { recursive: true, force: true }); }
});
