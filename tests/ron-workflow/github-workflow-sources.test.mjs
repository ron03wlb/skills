import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import { renderWorkflowRecord, bodyDigest } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";
import { reduceRunReadyHandoff } from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";

test("the GitHub source joins CLI tracker read-back to the real Git checkpoint and target", async () => {
  const root = mkdtempSync(join(tmpdir(), "github-source-"));
  const oldPath = process.env.PATH;
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
    const owner = createGitHubWorkflowSources({ repository: root, repositoryName: "example/repo", store: {}, tasks: {} });
    const snapshot = await owner.sources.tracker.read({ specId: "1" });
    const current = await owner.sources.reconciliation.read({ tracker: snapshot, journal: [], request: {} });
    assert.equal(reduceRunReadyHandoff(current.runReadyAuthority).state, "READY");
    assert.equal(current.facts.run.targetHead, seal);
    assert.equal(current.facts.nodes[0].completionState, "NONE");
    fixture.body += " changed scope"; writeFileSync(fixturePath, JSON.stringify(fixture));
    await assert.rejects(owner.sources.tracker.read({ specId: "1" }), /Current approved Spec publication/u);
    assert.equal(git("status", "--porcelain"), "");
  } finally { process.env.PATH = oldPath; rmSync(root, { recursive: true, force: true }); }
});
