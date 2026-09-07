import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import { bodyDigest, renderWorkflowRecord } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { bindProducerCheckpointOperationIdentity, deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";

test("formal GitHub reconciliation carries an unchanged closed child and scopes pre-execution revision blockers", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "revision-source-")));
  const originalExec = childProcess.execFileSync;
  const git = (...args) => originalExec("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("remote", "add", "origin", "https://github.com/example/repo.git");
    writeFileSync(join(root, "README.md"), "baseline\n"); git("add", "README.md"); git("commit", "-m", "baseline");
    const seal = git("rev-parse", "HEAD");
    writeFileSync(join(root, "candidate.md"), "completed child\n"); git("add", "candidate.md"); git("commit", "-m", "completed child");
    const candidate = git("rev-parse", "HEAD");
    const repositoryId = "github:example/repo";
    const operation = scope => deriveExecuteIssueOperationIdentity({ repositoryId, specId: "I_1", issueId: "I_2", approvedPublicationIdentity: scope });
    const old = { specId: "I_1", target: "main", planningSeal: seal, classification: "MULTI", approvedScopeHash: bodyDigest("old parent"), decompositionIdentity: null };
    const current = { ...old, approvedScopeHash: bodyDigest("new parent"), planningSeal: candidate };
    const dec = { kind: "decomposition:v1", parent: "I_1", target: "main", planningSeal: seal, approvedScopeHash: old.approvedScopeHash,
      decompositionMapping: { "1/01": "I_2", "1/02": "I_3" }, childBodyDigests: { I_2: bodyDigest("unchanged child"), I_3: bodyDigest("old blocked child") }, blockerEdges: [{ blocker: "I_2", blocked: "I_3" }], readyFrontier: ["I_3"] };
    const complete = { kind: "implementation_complete", issueId: "I_2", specId: "I_1", target: "main", targetWorktree: root,
      topic: "old-child", worktree: join(root, "absent-lane"), baseline: seal, candidate, planningSeal: seal, operationIdentity: operation(old.approvedScopeHash),
      standards: "clean", spec: "clean", worktreeState: "clean", workflowArtifacts: [], manualAttestations: [], verification: [{ command: "fixture", result: "PASSED" }] };
    const comment = (identity, record) => ({ node_id: identity, author_association: "OWNER", body: renderWorkflowRecord(record) });
    const done = comment("IC_done", complete);
    const adoption = { issueId: "I_2", publicationIdentity: "IC_old_pub", decompositionIdentity: "IC_old_dec", childBodyDigest: dec.childBodyDigests.I_2,
      completionIdentity: done.node_id, completionBodySha256: bodyDigest(done.body) };
    const nextDec = { ...structuredClone(dec), planningSeal: candidate, approvedScopeHash: current.approvedScopeHash,
      childBodyDigests: { ...dec.childBodyDigests, I_3: bodyDigest("revised blocked child") }, adoptedCompletions: [adoption] };
    const checkpointIdentity = bindProducerCheckpointOperationIdentity({ repositoryId, specId: "I_1", producerCommand: "to-tickets", profileVersion: "v2", target: "main", baseline: candidate,
      bindings: { approvedScopeIdentity: current.approvedScopeHash, classification: "MULTI", planningSeal: candidate } });
    const blocked = { kind: "implementation_blocked", issueId: "I_3", specId: "I_1", target: "main", planningSeal: seal,
      reasonCode: "scope_revision_required", operationIdentity: deriveExecuteIssueOperationIdentity({ repositoryId, specId: "I_1", issueId: "I_3", approvedPublicationIdentity: old.approvedScopeHash }) };
    const fixtures = [null,
      { node_id: "I_1", number: 1, state: "open", body: "new parent", comments: [comment("IC_old_pub", { kind: "spec_publication", repositoryId, authority: old }), comment("IC_old_dec", dec),
        comment("IC_new_pub", { kind: "spec_publication", repositoryId, authority: current }), comment("IC_new_dec", nextDec),
        comment("IC_hand", { kind: "producer_handoff", ...current, producerCommand: "to-tickets", checkpointIdentity })] },
      { node_id: "I_2", number: 2, state: "closed", body: "unchanged child", comments: [done] },
      { node_id: "I_3", number: 3, state: "open", body: "revised blocked child", comments: [comment("IC_block", blocked)] }];
    const checkpoints = createWorkflowControlStore({ gitCommonDir: join(root, ".git") });
    const oldIdentity = bindProducerCheckpointOperationIdentity({ repositoryId, specId: "I_1", producerCommand: "to-tickets", profileVersion: "v2", target: "main", baseline: seal,
      bindings: { approvedScopeIdentity: old.approvedScopeHash, classification: "MULTI", planningSeal: seal } });
    const oldTx = checkpoints.createCheckpoint(oldIdentity);
    const decompositionReadBack = { decompositionIdentity: "IC_old_dec", decompositionDigest: bodyDigest(fixtures[1].comments[1].body) };
    const readyStateReadBack = { frontier: ["I_2"] };
    checkpoints.advanceCheckpoint({ identity: oldIdentity, stage: "decomposition.read_back", receipt: decompositionReadBack });
    checkpoints.advanceCheckpoint({ identity: oldIdentity, stage: "ready_state.read_back", receipt: readyStateReadBack });
    const oldHandoff = { kind: "producer_handoff", producerCommand: "to-tickets", ...old,
      upstreamPublicationIdentity: "IC_old_pub", ...decompositionReadBack, checkpointIdentity: oldIdentity,
      transactionIdentity: oldTx.transactionId, operationReceipt: { transactionIdentity: oldTx.transactionId, decompositionReadBack, readyStateReadBack } };
    fixtures[1].comments.splice(2, 0, comment("IC_old_hand", oldHandoff));
    childProcess.execFileSync = (name, args, options) => {
      if (name !== "gh") return originalExec(name, args, options);
      if (args[1] === "graphql") {
        const id = args.find(value => value.startsWith("id=")).slice(3);
        return JSON.stringify({ data: { node: { id, number: Number(id.slice(2)), repository: { nameWithOwner: "example/repo" } } } });
      }
      const path = args[1];
      const issue = fixtures[Number(path.match(/issues\/(\d+)/u)[1])];
      return JSON.stringify([path.includes("comments") ? issue.comments : path.endsWith("/parent") ? fixtures[1]
        : path.includes("blocked_by") ? issue.number === 3 ? [fixtures[2]] : [] : issue]);
    };
    syncBuiltinESMExports();
    let oldEvents = [];
    const owner = createGitHubWorkflowSources({ repository: root, repositoryName: "example/repo",
      store: { listRunIds: () => oldEvents.length ? ["old-run"] : [], readEvents: () => oldEvents }, tasks: { read: async () => ({ state: "RUNNING" }) } });
    const refresh = async (journal = []) => owner.sources.reconciliation.read({ tracker: await owner.sources.tracker.read({ specId: "1" }), journal, request: {} });
    const updateDec = () => { fixtures[1].comments[4] = comment("IC_new_dec", nextDec); };
    const expectRejected = async pattern => assert.ok((await refresh()).facts.contradictions.some(item => item.evidence.some(message => pattern.test(message))));
    await expectRejected(/Previous decomposition checkpoint/u);
    checkpoints.advanceCheckpoint({ identity: oldIdentity, stage: "handoff.completed", receipt: { handoffIdentity: "IC_old_hand" } });
    const result = await refresh();
    assert.deepEqual(result.facts.contradictions, []);
    assert.equal(result.facts.nodes[0].completionState, "COMPLETE");
    assert.equal(result.facts.nodes[0].candidateReachable, true);
    assert.equal(result.facts.nodes[0].worktreeState, "ABSENT");
    assert.equal(result.facts.nodes[1].completionState, "NONE");
    assert.deepEqual((await refresh()).facts, result.facts, "read-only re-entry is stable");
    fixtures[1].comments[2] = comment("IC_old_hand", { ...oldHandoff, transactionIdentity: "foreign" });
    await expectRejected(/Previous decomposition checkpoint/u);
    fixtures[1].comments[2] = comment("IC_old_hand", { ...oldHandoff, operationReceipt: {} });
    await expectRejected(/Previous decomposition checkpoint/u);
    fixtures[1].comments[2] = comment("IC_old_hand", oldHandoff);
    nextDec.adoptedCompletions = []; updateDec(); await expectRejected(/outside current proven authority/u);
    nextDec.adoptedCompletions = [adoption, adoption]; updateDec(); await expectRejected(/duplicate completion adoption/u);
    nextDec.adoptedCompletions = [adoption]; updateDec();
    fixtures[2].body += " changed"; await expectRejected(/contract changed/u); fixtures[2].body = "unchanged child";
    done.body += "\nchanged receipt"; await expectRejected(/Adopted completion/u); done.body = renderWorkflowRecord(complete);
    for (const field of ["publicationIdentity", "decompositionIdentity", "childBodyDigest", "completionIdentity", "completionBodySha256"]) {
      const value = adoption[field]; adoption[field] = "foreign"; updateDec(); await expectRejected(/Adopted/u); adoption[field] = value;
    }
    updateDec();
    fixtures[2].state = "open"; await expectRejected(/latest closed previous/u); fixtures[2].state = "closed";
    complete.candidate = git("commit-tree", git("rev-parse", "HEAD^{tree}"), "-p", seal, "-m", "unintegrated candidate");
    done.body = renderWorkflowRecord(complete); adoption.completionBodySha256 = bodyDigest(done.body); updateDec();
    await expectRejected(/not integrated/u);
    complete.candidate = candidate; done.body = renderWorkflowRecord(complete); adoption.completionBodySha256 = bodyDigest(done.body); updateDec();
    git("worktree", "add", "-b", complete.topic, complete.worktree, candidate);
    await expectRejected(/live ownership/u);
    git("worktree", "remove", complete.worktree);
    oldEvents = [{ type: "grant.recorded", runIdentity: { specId: "I_1", approvedScopeHash: old.approvedScopeHash } }];
    await expectRejected(/Previous revision has a Run Grant/u); oldEvents = [];
    const active = await refresh([{ type: "dispatch.recorded", issueId: "I_2", taskRef: { threadId: "live", hostId: "local" } }]);
    assert.match(active.facts.contradictions[0].evidence[0], /live ownership/u);
    fixtures[3].comments[0] = comment("IC_block", { ...blocked, worktree: "old-lane" }); await expectRejected(/unresolved lane/u);
    fixtures[3].comments[0] = comment("IC_block", { ...blocked, operationIdentity: { ...blocked.operationIdentity, key: "invalid" } }); await expectRejected(/malformed/u);
    fixtures[3].comments[0] = comment("IC_block", { ...blocked, operationIdentity: deriveExecuteIssueOperationIdentity({ repositoryId, specId: "I_1", issueId: "I_3", approvedPublicationIdentity: "unpublished" }) });
    await expectRejected(/Previous lifecycle publication/u);
    fixtures[3].comments[0] = comment("IC_block", { ...blocked, operationIdentity: deriveExecuteIssueOperationIdentity({ repositoryId, specId: "I_1", issueId: "I_3", approvedPublicationIdentity: current.approvedScopeHash }) });
    assert.equal((await refresh()).facts.nodes[1].completionState, "BLOCKED", "current-operation blocker remains active");
    assert.equal(git("status", "--porcelain"), "", "reader performs no Git writes");
  } finally {
    childProcess.execFileSync = originalExec;
    syncBuiltinESMExports();
    rmSync(root, { recursive: true, force: true });
  }
});
