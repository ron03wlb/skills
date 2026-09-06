import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import { renderWorkflowRecord, bodyDigest } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";
import { reduceRunReadyHandoff } from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";

test("the GitHub source joins CLI tracker read-back to the real Git checkpoint and target", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "github-source-")));
  const oldPath = process.env.PATH;
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
    chmodSync(join(bin, "gh"), 0o755); process.env.PATH = `${bin}:${oldPath}`;
    const owner = createGitHubWorkflowSources({ repository: root, repositoryName: "example/repo", store: { listRunIds: () => ["unreadable"], readEvents() { throw new Error("Unreadable journal"); } }, tasks: { read: async () => ({ state: "RESUMABLE" }) } });
    const snapshot = await owner.sources.tracker.read({ specId: "1" });
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
    const adoption = { kind: "workflow_operation_identity_contract_adopted:v1", repository: "example/repo", tracker: "github:example/repo", spec: "I_1", targetBranch: "main", legacyCompletionFrontier: [{ issue: "I_1", evidenceIdentity: "IC_done", bodySha256: bodyDigest(completionComment.body) }] };
    fixture.comments.push({ node_id: "IC_adopt", author_association: "OWNER", body: renderWorkflowRecord(adoption) });
    assert.equal((await refresh()).facts.nodes[0].completionState, "COMPLETE");
    completionComment.body += "\nchanged evidence";
    assert.match((await refresh()).facts.contradictions[0].evidence[0], /compatibility frontier/u);
    assert.equal(issueGit("rev-parse", "HEAD"), packet.candidate, "compatibility never rewrites the existing contribution");
    fixture.body += " changed scope"; writeFileSync(fixturePath, JSON.stringify(fixture));
    await assert.rejects(owner.sources.tracker.read({ specId: "1" }), /Current approved Spec publication/u);
    assert.equal(git("status", "--porcelain"), "");
  } finally { process.env.PATH = oldPath; rmSync(lane, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
});
