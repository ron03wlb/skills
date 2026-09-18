// The Start path owns two things the rest of the Run depends on: the one Grant that authorizes the Run,
// and the installation it selects its package version from. A handoff whose planning owner already
// approved every declared operation used to record no Grant at all, so the reducer stopped the Run with
// `grant_missing`; and the entry never supplied the installation cache, so version selection returned
// UNAVAILABLE and the Run's maintenance path was dead. These tests drive the entry's own `startRun`
// against a real tracker fixture and a real retained installation built in a temporary cache.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import { bodyDigest, renderWorkflowRecord } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { installationCacheDirectoryFor, startRun } from "../../skills/personal/run-issue-workflow/scripts/run-entry.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { runWorkflowCommand } from "../../skills/personal/run-issue-workflow/scripts/workflow-command.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const SPEC_BODY = "fixture multi parent";
const CHILD_BODY = "fixture child";
const REQUIRED_ACTIONS = [
  { action: "task-create", scope: "one native task per selected child" },
  { action: "local-close", scope: "integrate and clean owned worktrees" },
];

// One retained installation: the exact trusted layout `selectWorkflowVersion` verifies, with the content
// manifest and catalog the installer itself writes.
const buildInstallation = (cacheDirectory) => {
  const files = [
    { path: "skills/personal/run-issue-workflow/SKILL.md", mode: "100644", sha256: sha256("Retained workflow\n") },
  ];
  const sourceCommit = "b".repeat(40);
  const version = {
    id: sha256(JSON.stringify({ sourceCommit, files })),
    sourceCommit,
    sourceRepository: "/trusted/skills",
    protocolVersion: 1,
  };
  const root = join(cacheDirectory, "versions", version.id);
  mkdirSync(join(root, "skills/personal/run-issue-workflow"), { recursive: true });
  writeFileSync(join(root, "skills/personal/run-issue-workflow/SKILL.md"), "Retained workflow\n");
  writeFileSync(join(root, ".workflow-version.json"), JSON.stringify({ schema: "codex-workflow-version:v1", version, files }));
  mkdirSync(cacheDirectory, { recursive: true });
  writeFileSync(join(cacheDirectory, "installation.json"), JSON.stringify({
    schema: "codex-workflow-installation:v1",
    current: version.id,
    versions: [version],
  }));
  return version;
};

// One repository whose tracker carries a complete Multi-Issue producer handoff, with the declared
// operations the `handoffApprovals` argument says the planning owner already approved.
const startFixture = async (t, { handoffApprovals, declaredPrerequisite = false }) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "run-entry-")));
  const cacheDirectory = join(root, ".codex/workflow-packages");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("remote", "add", "origin", "https://github.com/example/repo.git");
  writeFileSync(join(root, "README.md"), "baseline\n");
  git("add", "README.md");
  git("commit", "-m", "baseline");
  const seal = git("rev-parse", "HEAD");
  const version = buildInstallation(cacheDirectory);
  const repositoryId = "github:example/repo";
  const comment = (identity, record) => ({ node_id: identity, author_association: "OWNER", body: renderWorkflowRecord(record) });
  const decomposition = {
    kind: "decomposition:v1",
    parent: "I_1",
    target: "main",
    planningSeal: seal,
    approvedScopeHash: bodyDigest(SPEC_BODY),
    decompositionMapping: { "1/01": "I_2" },
    childBodyDigests: { I_2: bodyDigest(CHILD_BODY) },
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
      approvedScopeIdentity: bodyDigest(SPEC_BODY),
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
    approvedScopeHash: bodyDigest(SPEC_BODY),
    producerCommand: "to-tickets",
    decompositionIdentity: "IC_dec",
    decompositionDigest,
    decompositionMapping: decomposition.decompositionMapping,
    blockerEdges: decomposition.blockerEdges,
    upstreamPublicationIdentity: "IC_pub",
    upstreamHandoffIdentity: "IC_hand",
    operationReceipt: { transactionIdentity: transaction.transactionId, decompositionReadBack, readyStateReadBack },
    recordIdentities: ["IC_pub", "IC_dec"],
    checkpointIdentity,
    transactionIdentity: transaction.transactionId,
    preparation: { approvals: handoffApprovals, preparedSql: [] },
  };
  const fixtures = {
    1: {
      node_id: "I_1",
      number: 1,
      state: "open",
      body: SPEC_BODY,
      comments: [
        comment("IC_pub", { kind: "spec_publication", repositoryId,
          authority: { specId: "I_1", target: "main", planningSeal: seal, classification: "MULTI",
            approvedScopeHash: bodyDigest(SPEC_BODY), decompositionIdentity: null },
          preparation: { requiredActions: REQUIRED_ACTIONS, trackerPublication: { required: "READ_WRITE_READBACK" },
            ...(declaredPrerequisite
              ? { sql: [{ issueId: "I_2", environmentIdentity: "fixture-env", artifact: "docs/prereq.md" }] }
              : {}) } }),
        comment("IC_dec", decomposition),
        comment("IC_hand", handoff),
      ],
    },
    2: { node_id: "I_2", number: 2, state: "open", body: CHILD_BODY, comments: [] },
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
  const journal = () => {
    const observed = createRunStore({ gitCommonDir: join(root, ".git") });
    const [runId, ...others] = observed.listRunIds();
    assert.deepEqual(others, [], "one Start owns one stored Run");
    return runId === undefined ? [] : observed.readEvents(runId);
  };
  const run = async (options = {}) => startRun({
    cwd: root,
    specId: "1",
    cacheDirectory,
    commandRunner,
    ...options,
  });
  return { root, seal, cacheDirectory, version, commandRunner, journal, run };
};

test("the entry resolves the installation cache that owns an installed package", () => {
  const entry = "/cache/versions/" + "a".repeat(64) + "/skills/personal/run-issue-workflow/scripts/run-entry.mjs";
  assert.equal(
    installationCacheDirectoryFor(pathToFileURL(entry).href),
    "/cache",
    "an installed package two levels above its version root is the cache the entry must read",
  );
});

test("a fresh Run whose handoff approved every declared operation records exactly one Grant with the resolved package version and no approvals member", async (t) => {
  const fixture = await startFixture(t, {
    handoffApprovals: REQUIRED_ACTIONS.map((action) => ({ ...action, authority: "human:planning" })),
  });
  const composed = [];
  const result = await fixture.run({
    createSources: (options) => {
      composed.push(options);
      return createGitHubWorkflowSources(options);
    },
  });

  assert.equal(result.outcome, "READY", JSON.stringify(result.diagnosis ?? result.plan));
  assert.equal(result.reusedGrant, false);
  assert.equal(result.questions, undefined, "nothing was left unapproved, so nothing may be asked");
  assert.deepEqual(result.recordedGrant, { approvedActions: [] });
  assert.equal(result.plan.disposition, "DISPATCH");
  const grants = fixture.journal().filter(({ type }) => type === "grant.recorded");
  assert.equal(grants.length, 1, "a fresh Run records exactly one Grant");
  assert.equal(
    Object.hasOwn(grants[0], "approvals"),
    false,
    "an empty approvals array would claim an approval set the human never gave",
  );
  assert.deepEqual(grants[0].workflowVersion, fixture.version, "the Grant binds the resolved package version");
  assert.equal(grants[0].maxParallel, 3);

  assert.equal(composed.length, 1, "the start path composes its own sources once");
  assert.equal(composed[0].installationCacheDirectory, fixture.cacheDirectory);
  assert.deepEqual(composed[0].workflowVersion, fixture.version);

  const reentered = await fixture.run();
  assert.equal(reentered.reusedGrant, true);
  assert.equal(reentered.outcome, "READY");
  assert.equal(fixture.journal().filter(({ type }) => type === "grant.recorded").length, 1, "re-entry never appends a second Grant");
});

test("the handoff's own approvals are reused, so only an unapproved operation is asked for and recorded", async (t) => {
  const fixture = await startFixture(t, {
    handoffApprovals: [{ ...REQUIRED_ACTIONS[0], authority: "human:planning" }],
  });

  const asked = await fixture.run();
  assert.equal(asked.outcome, "APPROVAL_REQUIRED");
  assert.deepEqual(asked.questions, [REQUIRED_ACTIONS[1]], "the handoff-approved operation is never re-asked");
  assert.deepEqual(fixture.journal(), [], "no Grant is recorded before the human approves the declaration");

  const approved = await fixture.run({ approval: "human:start" });
  assert.equal(approved.outcome, "READY", JSON.stringify(approved.diagnosis ?? approved.plan));
  assert.deepEqual(approved.questions, [REQUIRED_ACTIONS[1]]);
  assert.deepEqual(approved.recordedGrant, { approvedActions: ["local-close"] });
  const grants = fixture.journal().filter(({ type }) => type === "grant.recorded");
  assert.equal(grants.length, 1);
  assert.deepEqual(grants[0].approvals, [{ ...REQUIRED_ACTIONS[1], authority: "human:start" }]);
});

test("a fresh Run whose preparation gap belongs to the planning owner records no Grant", async (t) => {
  const fixture = await startFixture(t, {
    handoffApprovals: REQUIRED_ACTIONS.map((action) => ({ ...action, authority: "human:planning" })),
    declaredPrerequisite: true,
  });
  const result = await fixture.run({ approval: "human:start" });

  assert.equal(result.outcome, "NOT_READY");
  assert.equal(result.questions, undefined, "an unattestable Manual prerequisite is not a question for the human to approve");
  assert.equal(result.diagnosis.reasonCode, "run_preparation_pending");
  assert.equal(result.diagnosis.nextOwner, "to-tickets");
  assert.deepEqual(fixture.journal(), [], "a planning-owned gap never records a Grant");
});

test("an installation the start path cannot resolve fails closed instead of recording a Grant", async (t) => {
  const fixture = await startFixture(t, {
    handoffApprovals: REQUIRED_ACTIONS.map((action) => ({ ...action, authority: "human:planning" })),
  });
  await assert.rejects(
    () => fixture.run({ cacheDirectory: join(fixture.root, "absent-cache") }),
    /Workflow version is UNAVAILABLE/u,
  );
  assert.deepEqual(fixture.journal(), []);
});
