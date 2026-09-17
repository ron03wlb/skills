// The Run Grant is the Run's single approval boundary: `/run-issue-workflow` must ask the human once for
// the declared operations the planning handoff left unapproved, record that approval on the Grant it
// already creates, and then continue without returning the human to the planning owner.
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import { bodyDigest, renderWorkflowRecord } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { createRunAuthorityAdapters } from "../../skills/personal/run-issue-workflow/scripts/run-authority-adapters.mjs";
import { reduceRunReadyHandoff } from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";
import { PREPARATION_ACTIONS as JOURNAL_PREPARATION_ACTIONS } from "../../skills/personal/run-issue-workflow/scripts/run-journal.mjs";
import { PREPARATION_ACTIONS as OWNER_PREPARATION_ACTIONS } from "../../skills/personal/run-issue-workflow/scripts/run-preparation.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { runWorkflowCommand } from "../../skills/personal/run-issue-workflow/scripts/workflow-command.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const runIdentity = {
  runId: "workflow-op-v1-fixture",
  specId: "I_1",
  target: "main",
  approvedScopeHash: `sha256:${"a".repeat(64)}`,
  classification: "MULTI",
  decompositionIdentity: "IC_dec",
};
const grantDraft = (approvals) => ({
  type: "grant.recorded",
  at: "2026-09-17T00:00:00.000Z",
  runIdentity,
  maxParallel: 3,
  ...(approvals === undefined ? {} : { approvals }),
});

const appendGrant = (approvals) => {
  const root = mkdtempSync(join(tmpdir(), "grant-approval-"));
  try {
    const store = createRunStore({ gitCommonDir: root });
    const writer = store.acquireWriter(runIdentity.runId);
    try {
      writer.append(grantDraft(approvals));
      return store.readEvents(runIdentity.runId)[0].approvals;
    } finally {
      writer.release();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("the persisted Grant approval vocabulary cannot drift from the preparation owner", () => {
  assert.deepEqual([...JOURNAL_PREPARATION_ACTIONS].sort(), [...OWNER_PREPARATION_ACTIONS].sort());
});

test("one Run Grant records the human's approval of a declared operation and refuses anything else", () => {
  const approval = { action: "local-close", scope: "integrate and clean owned worktrees", authority: "human:start" };
  assert.equal(appendGrant(undefined), undefined);
  assert.deepEqual(appendGrant([approval]), [approval]);
  assert.throws(() => appendGrant([{ ...approval, action: "publish-everything" }]), /declared operation/u);
  assert.throws(() => appendGrant([{ action: "local-close", authority: "human:start" }]), /declared operation/u);
  assert.throws(() => appendGrant([{ ...approval, authority: "" }]), /declared operation/u);
  assert.throws(() => appendGrant([approval, approval]), /repeat/u);
  assert.throws(() => appendGrant([]), /declared operation/u);
});

// `handoffIdentity` selects which field of the composite to-tickets handoff carries its own
// decomposition record identity: the documented flat `decompositionIdentity`, or the producer's own
// `publicationIdentity` that a hand-encoded GitHub publication used instead.
const runReadyWithSpelling = async (handoffIdentity) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "grant-run-ready-")));
  const git = (...args) => runWorkflowCommand("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("remote", "add", "origin", "https://github.com/example/repo.git");
    writeFileSync(join(root, "README.md"), "baseline\n");
    git("add", "README.md");
    git("commit", "-m", "baseline");
    const seal = git("rev-parse", "HEAD");
    const repositoryId = "github:example/repo";
    const specBody = "fixture multi parent";
    const childBody = "fixture child";
    const requiredActions = [
      { action: "task-create", scope: "one native task per selected child" },
      { action: "local-close", scope: "integrate and clean owned worktrees" },
    ];
    const missing = requiredActions[1];
    const comment = (identity, record) => ({ node_id: identity, author_association: "OWNER", body: renderWorkflowRecord(record) });
    const decomposition = {
      kind: "decomposition:v1",
      parent: "I_1",
      target: "main",
      planningSeal: seal,
      approvedScopeHash: bodyDigest(specBody),
      decompositionMapping: { "1/01": "I_2" },
      childBodyDigests: { I_2: bodyDigest(childBody) },
      blockerEdges: [],
      readyFrontier: ["I_2"],
    };
    const checkpointIdentity = bindProducerCheckpointOperationIdentity({
      repositoryId,
      specId: "I_1",
      producerCommand: "to-tickets",
      profileVersion: "v2",
      target: "main",
      baseline: seal,
      bindings: {
        approvedScopeIdentity: bodyDigest(specBody),
        classification: "MULTI",
        planningSeal: seal,
        upstream: { handoffIdentity: "IC_hand", publicationIdentity: "IC_pub" },
      },
    });
    const decompositionDigest = bodyDigest(renderWorkflowRecord(decomposition));
    const decompositionReadBack = { decompositionIdentity: "IC_dec", decompositionDigest };
    const readyStateReadBack = { frontier: decomposition.readyFrontier };
    const checkpoints = createWorkflowControlStore({ gitCommonDir: join(root, ".git") });
    const transaction = checkpoints.createCheckpoint(checkpointIdentity);
    checkpoints.advanceCheckpoint({ identity: checkpointIdentity, stage: "decomposition.read_back", receipt: decompositionReadBack });
    checkpoints.advanceCheckpoint({ identity: checkpointIdentity, stage: "ready_state.read_back", receipt: readyStateReadBack });
    checkpoints.advanceCheckpoint({ identity: checkpointIdentity, stage: "handoff.completed",
      receipt: { handoffIdentity: "IC_hand", handoffDigest: bodyDigest("handoff") } });
    const handoff = {
      kind: "producer_handoff",
      specId: "I_1",
      target: "main",
      planningSeal: seal,
      classification: "MULTI",
      approvedScopeHash: bodyDigest(specBody),
      producerCommand: "to-tickets",
      decompositionDigest,
      decompositionMapping: decomposition.decompositionMapping,
      blockerEdges: decomposition.blockerEdges,
      upstreamPublicationIdentity: "IC_pub",
      upstreamHandoffIdentity: "IC_hand",
      operationReceipt: { transactionIdentity: transaction.transactionId, decompositionReadBack, readyStateReadBack },
      recordIdentities: ["IC_pub", "IC_dec"],
      checkpointIdentity,
      transactionIdentity: transaction.transactionId,
      [handoffIdentity]: "IC_dec",
      preparation: { approvals: [{ ...requiredActions[0], authority: "human:prior" }], preparedSql: [] },
    };
    const fixtures = {
      1: {
        node_id: "I_1",
        number: 1,
        state: "open",
        body: specBody,
        comments: [
          comment("IC_pub", { kind: "spec_publication", repositoryId,
            authority: { specId: "I_1", target: "main", planningSeal: seal, classification: "MULTI",
              approvedScopeHash: bodyDigest(specBody), decompositionIdentity: null },
            preparation: { requiredActions, trackerPublication: { required: "READ_WRITE_READBACK" } } }),
          comment("IC_dec", decomposition),
          comment("IC_hand", handoff),
        ],
      },
      2: { node_id: "I_2", number: 2, state: "open", body: childBody, comments: [] },
    };
    const commandRunner = (name, args, options) => {
      if (name !== "gh") return runWorkflowCommand(name, args, options);
      if (args[1] === "graphql") {
        const id = args.find((value) => value.startsWith("id=")).slice(3);
        return JSON.stringify({ data: { node: { id, number: Number(id.slice(2)), repository: { nameWithOwner: "example/repo" } } } });
      }
      const path = args[1];
      const issue = fixtures[Number(path.match(/issues\/(\d+)/u)[1])];
      let response = issue;
      if (path.includes("/comments")) response = issue.comments;
      else if (path.endsWith("/parent")) response = fixtures[1];
      else if (path.includes("/dependencies/blocked_by") || path.includes("/events?")) response = [];
      return JSON.stringify([response]);
    };
    const owner = createGitHubWorkflowSources({
      repository: root,
      repositoryName: "example/repo",
      store: { listRunIds: () => [], readEvents: () => [] },
      tasks: { read: async () => null },
      commandRunner,
    });
    const readyFacts = async (journal) => {
      const tracker = await owner.sources.tracker.read({ specId: "1" });
      const adapters = createRunAuthorityAdapters({
        sources: owner.sources,
        store: { observeRepositoryCloseLease: () => ({ state: "ABSENT" }), observeTargetMutationWriter: () => ({ state: "ABSENT" }) },
      });
      const current = await adapters.reconcile({ request: {}, tracker, journal });
      const facts = await adapters.handoff.read({ request: {}, tracker, current });
      return reduceRunReadyHandoff(facts);
    };
    const before = await readyFacts([]);
    assert.equal(before.state, "INCOMPLETE", handoffIdentity);
    assert.equal(before.reasonCode, "run_preparation_pending");
    assert.equal(before.nextOwner, "to-tickets");
    return await readyFacts([grantDraft([{ ...missing, authority: "human:start" }])]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("a Grant carrying the missing approvals turns Run-ready from INCOMPLETE into READY for either composite handoff spelling", async () => {
  for (const handoffIdentity of ["decompositionIdentity", "publicationIdentity"]) {
    const reduced = await runReadyWithSpelling(handoffIdentity);
    assert.equal(reduced.state, "READY", `${handoffIdentity}: ${JSON.stringify(reduced.evidence)}`);
  }
});
