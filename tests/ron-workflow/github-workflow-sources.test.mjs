import assert from "node:assert/strict";
import childProcess, { execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCoordinator } from "../../skills/personal/run-issue-workflow/scripts/run-coordinator.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { createCodexWorkflowTasks } from "../../skills/personal/run-issue-workflow/scripts/codex-workflow-tasks.mjs";
import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import { renderWorkflowRecord, bodyDigest } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";
import { reduceRunReadyHandoff } from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";

test("the GitHub source joins CLI tracker read-back to the real Git checkpoint and target", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "github-source-")));
  const oldPath = process.env.PATH;
  const originalExec = childProcess.execFileSync;
  const lane = `${root}-issue`;
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("remote", "add", "origin", "https://github.com/example/repo.git");
    writeFileSync(join(root, "README.md"), "fixture\n"); git("add", "README.md"); git("commit", "-m", "baseline");
    const seal = git("rev-parse", "HEAD");
    const body = "Approved single Spec";
    const authority = { specId: "I_1", target: "main", planningSeal: seal, classification: "SINGLE", approvedScopeHash: bodyDigest(body), decompositionIdentity: null };
    const identity = bindProducerCheckpointOperationIdentity({ repositoryId: "github:example/repo", specId: "I_1", producerCommand: "to-spec", profileVersion: "v2", target: "main", baseline: seal,
      bindings: { approvedScopeIdentity: authority.approvedScopeHash, classification: "SINGLE", planningSeal: seal } });
    const checkpoints = createWorkflowControlStore({ gitCommonDir: join(root, ".git") });
    const transaction = checkpoints.createCheckpoint(identity);
    for (const [stage, receipt] of [
      ["planning_seal.read_back", { planningSeal: seal, state: "reused" }],
      ["publication.read_back", { publicationIdentity: "IC_pub", trackerIdentity: "I_1" }],
      ["handoff.completed", { handoffIdentity: "IC_hand" }],
    ]) checkpoints.advanceCheckpoint({ identity, stage, receipt });
    const handoff = { kind: "producer_handoff", ...authority, producerCommand: "to-spec", checkpointIdentity: identity,
      transactionIdentity: transaction.transactionId, publicationIdentity: "IC_pub", trackerIdentity: "I_1", recordIdentities: ["IC_pub"] };
    const fixturePath = join(root, ".git", "tracker.json");
    const fixture = { body, node_id: "I_1", number: 1, state: "open", comments: [
      { node_id: "IC_pub", author_association: "OWNER", body: renderWorkflowRecord({ kind: "spec_publication", repositoryId: "github:example/repo", authority }) },
      { node_id: "IC_hand", author_association: "OWNER", body: renderWorkflowRecord(handoff) },
    ] };
    writeFileSync(fixturePath, JSON.stringify(fixture));
    const bin = join(root, ".git", "bin"); mkdirSync(bin);
    writeFileSync(join(bin, "gh"), `#!/usr/bin/env node\nconst fs=require('node:fs');const data=JSON.parse(fs.readFileSync(${JSON.stringify(fixturePath)},'utf8'));const route=process.argv[3];console.log(JSON.stringify(route==='graphql'?{data:{node:{id:'I_1',number:1,repository:{nameWithOwner:'example/repo'}}}}:route.includes('comments')?[data.comments]:route.includes('blocked_by')?[[]]:[data]));\n`);
    // Invoke the fixture through Node on every host; Windows does not execute Unix shebangs.
    chmodSync(join(bin, "gh"), 0o755);
    childProcess.execFileSync = (name, args, options) => name === "gh"
      ? originalExec(process.execPath, [join(bin, "gh"), ...args], options)
      : originalExec(name, args, options);
    syncBuiltinESMExports();
    const owner = createGitHubWorkflowSources({ repository: root, repositoryName: "example/repo", store: { listRunIds: () => ["unreadable"], readEvents() { throw new Error("Unreadable journal"); } }, tasks: { read: async () => ({ state: "RESUMABLE" }) } });
    const snapshot = await owner.sources.tracker.read({ specId: "1" });
    fixture.body = "Different unapproved scope";
    writeFileSync(fixturePath, JSON.stringify(fixture));
    await assert.rejects(owner.sources.tracker.read({ specId: "1" }), error =>
      error.code === "WORKFLOW_AUTHORITY_CONFLICT" && /Current approved Spec publication/u.test(error.message));
    fixture.body = body;
    writeFileSync(fixturePath, JSON.stringify(fixture));
    for (const [changedAuthority, repositoryId] of [
      [{ ...authority, specId: "I_foreign" }, "github:example/repo"],
      [authority, "github:other/repo"],
    ]) {
      fixture.comments[0].body = renderWorkflowRecord({ kind: "spec_publication", repositoryId, authority: changedAuthority });
      writeFileSync(fixturePath, JSON.stringify(fixture));
      await assert.rejects(owner.sources.tracker.read({ specId: "1" }), error =>
        error.code === "WORKFLOW_AUTHORITY_CONFLICT" && /Spec publication identity differs/u.test(error.message));
    }
    fixture.comments[0].body = renderWorkflowRecord({ kind: "spec_publication", repositoryId: "github:example/repo", authority });
    writeFileSync(fixturePath, JSON.stringify(fixture));
    const originalComments = structuredClone(fixture.comments);
    for (const mapping of [{}, { one: "I_2", two: "I_2" }]) {
      fixture.comments = [
        { ...originalComments[0], body: renderWorkflowRecord({ kind: "spec_publication", repositoryId: "github:example/repo", authority: { ...authority, classification: "MULTI" } }) },
        { ...originalComments[1], body: renderWorkflowRecord({ ...handoff, classification: "MULTI", producerCommand: "to-tickets" }) },
        { node_id: "IC_decomposition", author_association: "OWNER", body: renderWorkflowRecord({ kind: "decomposition:v1", parent: "I_1", approvedScopeHash: authority.approvedScopeHash, decompositionMapping: mapping }) },
      ];
      writeFileSync(fixturePath, JSON.stringify(fixture));
      await assert.rejects(owner.sources.tracker.read({ specId: "1" }), error =>
        error.code === "WORKFLOW_AUTHORITY_CONFLICT" && /Decomposition has no unique Issue mapping/u.test(error.message));
    }
    fixture.comments = originalComments;
    fixture.pull_request = {};
    writeFileSync(fixturePath, JSON.stringify(fixture));
    await assert.rejects(owner.sources.tracker.read({ specId: "1" }), error =>
      error.code === "WORKFLOW_AUTHORITY_CONFLICT" && /Tracker locator is not an Issue/u.test(error.message));
    delete fixture.pull_request;
    writeFileSync(fixturePath, JSON.stringify(fixture));
    for (const invalidComment of [
      { ...originalComments[0], body: "```workflow-record\ninvalid JSON\n```" },
      { ...originalComments[0], body: `${originalComments[0].body}\n${originalComments[0].body}` },
      { ...originalComments[0], author_association: "NONE" },
      { ...originalComments[0], node_id: undefined },
    ]) {
      fixture.comments = [invalidComment, originalComments[1]];
      writeFileSync(fixturePath, JSON.stringify(fixture));
      await assert.rejects(owner.sources.tracker.read({ specId: "1" }), error =>
        error.code === "WORKFLOW_AUTHORITY_CONFLICT" && /workflow (?:record|note)/iu.test(error.message));
    }
    fixture.comments = originalComments;
    writeFileSync(fixturePath, JSON.stringify(fixture));
    const current = await owner.sources.reconciliation.read({ tracker: snapshot, journal: [], request: {} });
    assert.equal(reduceRunReadyHandoff(current.runReadyAuthority).state, "READY");
    assert.equal(current.facts.run.targetHead, seal);
    assert.equal(current.facts.nodes[0].completionState, "NONE");
    const unfinished = await owner.sources.reconciliation.read({ tracker: snapshot, journal: [{ type: "dispatch.recorded", issueId: "I_1", taskRef: { threadId: "task", hostId: "local" } }], request: {} });
    assert.equal(unfinished.facts.nodes[0].taskState, "TRANSIENT_FAILURE");
    const cleanup = await owner.readCleanupRuns();
    assert.equal(cleanup.length, 1);
    assert.equal(cleanup[0].runId, "unreadable");
    assert.equal(cleanup[0].state, "UNKNOWN");
    assert.equal(cleanup[0].activeTasks, "UNKNOWN");
    const publication = { kind: "spec_publication", repositoryId: "github:example/repo", authority };
    const refresh = async (journal = []) => {
      fixture.comments[0].body = renderWorkflowRecord(publication);
      fixture.comments[1].body = renderWorkflowRecord(handoff);
      writeFileSync(fixturePath, JSON.stringify(fixture));
      return owner.sources.reconciliation.read({ tracker: await owner.sources.tracker.read({ specId: "1" }), journal, request: {} });
    };
    publication.preparation = { requiredActions: [{ action: "task-create", scope: "I_1" }], trackerPublication: { required: "READ_WRITE_READBACK" }, sql: [] };
    handoff.preparation = { approvals: [], preparedSql: [] };
    assert.equal(reduceRunReadyHandoff((await refresh()).runReadyAuthority).state, "INCOMPLETE", "missing concrete authorization precedes Run-ready");
    handoff.preparation.approvals.push({ action: "task-create", scope: "I_1", authority: "human-approval" });
    assert.equal(reduceRunReadyHandoff((await refresh()).runReadyAuthority).state, "READY");
    publication.preparation.trackerPublication.required = "ATOMIC_CAS";
    assert.equal(reduceRunReadyHandoff((await refresh()).runReadyAuthority).state, "INCOMPLETE", "GitHub read/write/read-back is never atomic CAS");
    publication.preparation.trackerPublication.required = "READ_WRITE_READBACK";

    const bootstrapHuman = { repositoryId: "github:example/repo", specId: "I_1", issueId: "I_1", target: "main", approvedScopeHash: authority.approvedScopeHash, decompositionIdentity: null,
      startAuthority: "human-approval", operations: ["workflow-install", "task-create", "task-message", "local-close", "tracker-write"].map(action => ({ action, scope: "I_1" })) };
    handoff.preparation.approvals = bootstrapHuman.operations.map(item => ({ ...item, authority: bootstrapHuman.startAuthority }));
    const bootstrapOwner = createGitHubWorkflowSources({ repository: root, repositoryName: "example/repo", store: { listRunIds: () => [] } });
    const bootstrapRead = () => bootstrapOwner.readBootstrapHandoff({ specId: "1", human: bootstrapHuman,
      control: { state: "ACTIVE", connected: true, authority: bootstrapHuman.startAuthority } });
    await refresh();
    const bootstrapExecution = await bootstrapRead();
    assert.equal(bootstrapExecution.state, "EXECUTE", JSON.stringify(bootstrapExecution));
    assert.equal((await bootstrapRead()).operationIdentity.key, bootstrapExecution.operationIdentity.key, "re-entry adopts the same maintenance operation");
    git("worktree", "add", "-b", "issue-one", lane, "main");
    writeFileSync(join(lane, "change.sql"), "-- reviewed prerequisite fixture; no database connection\n");
    const issueGit = (...args) => execFileSync("git", ["-C", lane, ...args], { encoding: "utf8" }).trim();
    issueGit("add", "change.sql"); issueGit("commit", "-m", "prerequisite candidate");
    const packet = { issueId: "I_1", artifact: "change.sql", environmentIdentity: "fixture-db", candidate: issueGit("rev-parse", "HEAD"), blob: issueGit("rev-parse", "HEAD:change.sql"),
      attestationIdentity: "IC_sql", owner: "human", recoveryPrepared: true, validation: "passed", standards: "clean", spec: "clean", outcome: "NO_OP", taskRef: { threadId: "task", hostId: "local" }, worktree: lane, topic: "issue-one" };
    publication.preparation.sql = [{ issueId: "I_1", artifact: packet.artifact, environmentIdentity: packet.environmentIdentity }];
    handoff.preparation.preparedSql = [packet];
    fixture.comments.push({ node_id: "IC_sql", author_association: "OWNER", body: `manual_prerequisite_complete:v2\nissue: I_1\ncandidate: ${packet.candidate}\nblob: ${packet.blob}\nartifact: change.sql\nenvironment_identity: fixture-db\noutcome: NO_OP\nattested_by: human` });
    const prepared = await refresh();
    assert.equal(reduceRunReadyHandoff(prepared.runReadyAuthority).state, "READY", JSON.stringify(prepared.runReadyAuthority));
    assert.deepEqual(prepared.preparedLanes.I_1, packet, "the ready source returns the exact original task/worktree");
    publication.preparation.sql[0].environmentIdentity = "different-db";
    const changedEnvironment = await refresh([{ type: "grant.recorded" }]);
    assert.equal(reduceRunReadyHandoff(changedEnvironment.runReadyAuthority).state, "READY", "a started Run keeps independent work available");
    assert.deepEqual(changedEnvironment.facts.contradictions[0].affectedNodes, ["I_1"]);
    publication.preparation.sql[0].environmentIdentity = "fixture-db";
    writeFileSync(join(lane, "change.sql"), "-- changed after attestation\n");
    const changedArtifact = await refresh([{ type: "grant.recorded" }]);
    assert.deepEqual(changedArtifact.facts.contradictions[0].affectedNodes, ["I_1"]);
    assert.match(changedArtifact.facts.contradictions[0].evidence[0], /artifact changed/u);
    writeFileSync(join(lane, "change.sql"), "-- reviewed prerequisite fixture; no database connection\n");

    // The legacy fixture is a real, clean Git contribution; reviews are explicitly fixture inputs.
    publication.preparation.sql = []; handoff.preparation.preparedSql = [];
    const completion = { kind: "implementation_complete", issueId: "I_1", specId: "I_1", target: "main", targetWorktree: root, topic: "issue-one", worktree: lane,
      baseline: seal, candidate: packet.candidate, planningSeal: seal, standards: "clean", spec: "clean", worktreeState: "clean", manualAttestations: [], verification: [{ command: "fixture check", result: "passed" }] };
    const completionComment = { node_id: "IC_done", author_association: "OWNER", body: renderWorkflowRecord(completion).replace("```workflow-record", "```json") };
    fixture.comments.push(completionComment);
    assert.equal((await refresh()).facts.nodes[0].completionState, "COMPLETE", "a uniquely proven unadopted legacy candidate is retained");
    const bootstrapClose = await bootstrapRead();
    assert.equal(bootstrapClose.state, "CLOSE", JSON.stringify(bootstrapClose));
    assert.equal(bootstrapClose.operationIdentity.key, bootstrapExecution.operationIdentity.key);
    const adoption = { kind: "workflow_operation_identity_contract_adopted:v1", repository: "example/repo", tracker: "github:example/repo", spec: "I_1", targetBranch: "main", legacyCompletionFrontier: [{ issue: "I_1", evidenceIdentity: "IC_done", bodySha256: bodyDigest(completionComment.body) }] };
    fixture.comments.push({ node_id: "IC_adopt", author_association: "OWNER", body: renderWorkflowRecord(adoption) });
    assert.equal((await refresh()).facts.nodes[0].completionState, "COMPLETE");
    completionComment.body += "\nchanged evidence";
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /compatibility frontier/u);
    assert.equal(issueGit("rev-parse", "HEAD"), packet.candidate, "compatibility never rewrites the existing contribution");
    completionComment.body = completionComment.body.replace("\nchanged evidence", "");
    await refresh();
    const runStore = createRunStore({ gitCommonDir: join(root, ".git") });
    const ref = { threadId: "existing-issue-task", hostId: "local" };
    let nativePrompt = "Implementation fixture completed";
    let nativeFinal = "";
    let nativeMessages = 0;
    const host = { async call(name, args) {
      if (name.endsWith("read_thread")) return { thread: { id: ref.threadId, hostId: ref.hostId, cwd: lane, status: { type: "idle" } },
        turns: [{ status: "completed", items: [{ type: "userMessage", content: [{ type: "text", text: nativePrompt }] },
          { type: "agentMessage", phase: "final_answer", text: nativeFinal }] }] };
      if (name.endsWith("send_message_to_thread")) {
        nativeMessages++; nativePrompt = args.prompt;
        if (nativeMessages === 1) {
          git("merge", "--ff-only", packet.candidate);
          git("worktree", "remove", lane);
          mkdirSync(lane); // Reproduce Windows partial removal: registration gone, empty directory remains.
          const request = JSON.parse(nativePrompt.match(/Current close request evidence: (\{.+\})/u)[1]);
          nativeFinal = `Workflow close result: ${JSON.stringify({ schema: "issue-close-result:v1", state: "HOST_CLEANUP_BLOCKED",
            runId: request.runIdentity.runId, issueId: request.issueId,
            requestIdentity: nativePrompt.match(/Close request identity: (sha256:[a-f0-9]+)/u)[1], authorityEvidence: request.authorityEvidence,
            reasonCode: "host_release_unavailable", observations: [{ code: "EBUSY", message: "Exact task helpers retain the empty directory" }] })}`;
        }
        else if (nativeMessages === 2) {
          assert.match(nativePrompt, /Close continuation: .*"attempt":1/u);
          assert.equal(existsSync(lane), false, "physical cleanup must precede tracker closure");
          fixture.state = "closed"; writeFileSync(fixturePath, JSON.stringify(fixture));
        } else throw new Error("Duplicate completed close mutation");
        throw new Error("response lost after accepted close action");
      }
      throw new Error(`Unexpected native action ${name}`);
    } };
    const nativeTasks = createCodexWorkflowTasks({ host, store: runStore, project: { path: root, projectId: "project", hostId: "local" }, packageRoot: "/fixture-installed", issueNumber: async () => 1, sleep: async () => {} });
    const liveOwners = createGitHubWorkflowSources({ repository: root, repositoryName: "example/repo", store: runStore, tasks: nativeTasks });
    const beforeClose = await refresh();
    const writer = runStore.acquireWriter(beforeClose.runIdentity.runId);
    writer.append({ type: "grant.recorded", at: "2026-09-06T00:00:00.000Z", runIdentity: beforeClose.runIdentity, maxParallel: 3 });
    writer.append({ type: "dispatch.recorded", at: "2026-09-06T00:00:00.000Z", issueId: "I_1", attempt: 1, taskRef: ref }); writer.release();
    const coordinatorOptions = { store: runStore, tasks: nativeTasks, tracker: liveOwners.sources.tracker,
      reconcile: args => liveOwners.sources.reconciliation.read(args), handoff: { read: async ({ current }) => current.runReadyAuthority }, now: () => "2026-09-06T00:00:00.000Z", sleep: async () => {} };
    const partial = await createCoordinator(coordinatorOptions).run({ specId: "I_1", mode: "step" });
    assert.equal(partial.nodes[0].close.candidateReachable, true);
    assert.equal(partial.nodes[0].close.worktreeState, "PRESENT");
    const pendingCleanup = await refresh();
    assert.equal(pendingCleanup.facts.nodes[0].completionState, "COMPLETE");
    assert.deepEqual(pendingCleanup.facts.contradictions, []);
    writeFileSync(join(lane, "unowned.txt"), "must preserve\n");
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /ownership differs/u);
    rmSync(join(lane, "unowned.txt"));
    git("branch", "-f", "issue-one", seal);
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /ownership differs/u);
    git("branch", "-f", "issue-one", packet.candidate);
    rmdirSync(lane); symlinkSync(root, lane, "junction");
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /ownership differs/u);
    rmSync(lane); symlinkSync(`${root}-missing`, lane, "junction");
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /ownership differs/u, "a dangling link is not physical absence");
    rmSync(lane); mkdirSync(lane);
    const blocked = await createCoordinator(coordinatorOptions).run({ specId: "I_1", mode: "step" });
    assert.equal(blocked.run.state, "BLOCKED", JSON.stringify(blocked));
    assert.equal(blocked.diagnoses[0].reasonCode, "host_release_unavailable");
    assert.equal(blocked.diagnoses[0].nextOwner, "close-issue");
    assert.equal(blocked.nodes[0].close.completionState, "COMPLETE");
    assert.equal(fixture.state, "open");
    assert.equal(nativeMessages, 1, "a known host limitation does not spend three more cleanup attempts");
    assert.equal(git("rev-parse", "HEAD"), packet.candidate);
    assert.equal(runStore.readTargetMutationWriterLock("main"), null);
    assert.equal(runStore.observeRepositoryCloseLease().state, "ABSENT");
    rmdirSync(lane); // An owning-source physical change, not a cached success or implementation replay.
    const resumed = await createCoordinator(coordinatorOptions).run({ specId: "I_1", mode: "step" });
    assert.equal(resumed.run.state, "SUCCEEDED", JSON.stringify(resumed));
    assert.equal((await createCoordinator(coordinatorOptions).run({ specId: "I_1", mode: "step" })).run.state, "SUCCEEDED");
    assert.equal(nativeMessages, 2, "one original action plus one bounded continuation; lost replies cause no duplicate sends");
    assert.equal(runStore.readEvents(beforeClose.runIdentity.runId).filter(event => event.type === "dispatch.recorded").length, 1);
    fixture.body += " changed scope"; writeFileSync(fixturePath, JSON.stringify(fixture));
    await assert.rejects(owner.sources.tracker.read({ specId: "1" }), /Current approved Spec publication/u);
    assert.equal(git("status", "--porcelain"), "");
  } finally { childProcess.execFileSync = originalExec; syncBuiltinESMExports(); process.env.PATH = oldPath; rmSync(lane, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
});
