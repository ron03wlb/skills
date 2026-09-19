// The composed native path (Issue 124, AC-1 through AC-5).
//
// `/run-issue-workflow`'s Start entry used to emit a pi-workflow host round and plan it with
// `planHostRound`, so the default path depended on a materialization ADR-0080 demoted to optional. These
// tests drive the entry's own composition with injected ports over a real tracker fixture and a real Git
// repository: the round it emits is the one `native-round-loop.mjs` consumes, its authorized actions are
// materialized through `native-lane-runner.mjs`, lanes are observed through `native-lane-evidence.mjs`,
// a close lane stays serialized, and a dependant is released by the loop's own three-condition
// re-derivation after its blocker closes — never by the producer's `ready_state` projection.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { reduceRun } from "../../skills/personal/run-issue-workflow/scripts/delivery-authority.mjs";
import { bodyDigest, renderWorkflowRecord } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { LANE_TOOL_CEILING } from "../../skills/personal/run-issue-workflow/scripts/issue-lane.mjs";
import { LANE_STANDING_RULES } from "../../skills/personal/run-issue-workflow/scripts/native-lane-runner.mjs";
import { runNativeRoundLoop } from "../../skills/personal/run-issue-workflow/scripts/native-round-loop.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { createNativeRunReader, startRun } from "../../skills/personal/run-issue-workflow/scripts/run-entry.mjs";
import { runWorkflowCommand } from "../../skills/personal/run-issue-workflow/scripts/workflow-command.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity, deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const AT = "2026-09-18T06:00:00.000Z";
const REPOSITORY_NAME = "example/repo";
const REPOSITORY_ID = `github:${REPOSITORY_NAME}`;
const SPEC_ID = "I_1";
const BLOCKER_ID = "I_blocker";
const DEPENDANT_ID = "I_dependant";
const TARGET = "main";
const SPEC_BODY = "fixture multi parent";
const BLOCKER_BODY = "fixture blocker child";
const DEPENDANT_BODY = "fixture dependant child";
const APPROVED_PUBLICATION = bodyDigest(SPEC_BODY);
const REQUIRED_ACTIONS = [
  { action: "task-create", scope: "one native task per selected child" },
  { action: "local-close", scope: "integrate and clean owned worktrees" },
];
const AGENT_CEILING = [...LANE_TOOL_CEILING];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();
const entrySource = readFileSync(join(import.meta.dirname, "../../skills/personal/run-issue-workflow/scripts/run-entry.mjs"), "utf8");

// One retained installation: the exact trusted layout `selectWorkflowVersion` verifies, with the content
// manifest and catalog the installer itself writes.
const buildInstallation = (cacheDirectory) => {
  const files = [
    { path: "skills/personal/run-issue-workflow/SKILL.md", mode: "100644", sha256: sha256("Retained workflow\n") },
  ];
  const version = {
    id: sha256(JSON.stringify({ sourceCommit: "b".repeat(40), files })),
    sourceCommit: "b".repeat(40),
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

// One native subagent run: the documented pointer record plus the run's own record, exactly the two
// sources `native-lane-evidence.mjs` reads for lane liveness.
const writeNativeRun = ({ agentRoot, laneRef, status, worktreePath = null }) => {
  const runsDir = `.pi/workflow-subagents/${laneRef}/task-1`;
  writeFileSync(join(agentRoot, ".pi/agent/subagent-runs", `${laneRef}.json`), JSON.stringify({
    schemaVersion: 1,
    runId: laneRef,
    cwd: agentRoot,
    runsDir,
    correlationId: `run#${laneRef}`,
    updatedAt: AT,
  }));
  mkdirSync(join(agentRoot, runsDir, laneRef), { recursive: true });
  writeFileSync(join(agentRoot, runsDir, laneRef, "run.json"), JSON.stringify({
    schemaVersion: 2,
    runId: laneRef,
    mode: "single",
    status,
    failureKind: null,
    latestAttemptId: "attempt_1",
    attempts: [{
      attemptId: "attempt_1",
      status,
      heartbeatAt: AT,
      workspace: { mode: worktreePath === null ? "shared" : "worktree", cwd: agentRoot, worktreePath },
    }],
  }));
  return laneRef;
};

// One repository whose tracker carries a complete Multi-Issue handoff: one ready child and one child
// gated behind it. The target branch, the blocker's Issue worktree and its completion note are real Git
// facts, because the release frontier's three conditions are read from the tracker and Git.
const nativeFixture = async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "run-entry-native-")));
  const repository = join(root, "repo");
  const agentRoot = join(root, "agent");
  const runsRoot = join(agentRoot, ".pi/agent/subagent-runs");
  const cacheDirectory = join(root, ".codex/workflow-packages");
  mkdirSync(repository, { recursive: true });
  mkdirSync(runsRoot, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  git(repository, "init", "-b", TARGET);
  git(repository, "config", "user.name", "Fixture");
  git(repository, "config", "user.email", "fixture@example.invalid");
  git(repository, "remote", "add", "origin", `https://github.com/${REPOSITORY_NAME}.git`);
  writeFileSync(join(repository, "README.md"), "baseline\n");
  git(repository, "add", "README.md");
  git(repository, "commit", "-m", "baseline");
  const seal = git(repository, "rev-parse", "HEAD");
  const version = buildInstallation(cacheDirectory);

  const fixtures = {
    1: { node_id: SPEC_ID, number: 1, state: "open", body: SPEC_BODY, comments: [] },
    2: { node_id: BLOCKER_ID, number: 2, state: "open", body: BLOCKER_BODY, comments: [] },
    3: { node_id: DEPENDANT_ID, number: 3, state: "open", body: DEPENDANT_BODY, comments: [] },
  };
  const blockers = { [BLOCKER_ID]: [], [DEPENDANT_ID]: [BLOCKER_ID] };
  const comment = (identity, record) => ({ node_id: identity, author_association: "OWNER", body: renderWorkflowRecord(record) });
  const decomposition = {
    kind: "decomposition:v1",
    parent: SPEC_ID,
    target: TARGET,
    planningSeal: seal,
    approvedScopeHash: APPROVED_PUBLICATION,
    decompositionMapping: { "1/01": BLOCKER_ID, "1/02": DEPENDANT_ID },
    childBodyDigests: { [BLOCKER_ID]: bodyDigest(BLOCKER_BODY), [DEPENDANT_ID]: bodyDigest(DEPENDANT_BODY) },
    blockerEdges: [{ blocker: BLOCKER_ID, blocked: DEPENDANT_ID }],
    readyFrontier: [BLOCKER_ID],
  };
  const checkpointIdentity = bindProducerCheckpointOperationIdentity({
    repositoryId: REPOSITORY_ID,
    specId: SPEC_ID,
    producerCommand: "to-tickets",
    profileVersion: "v2",
    target: TARGET,
    baseline: seal,
    bindings: {
      approvedScopeIdentity: APPROVED_PUBLICATION,
      classification: "MULTI",
      planningSeal: seal,
      upstream: { handoffIdentity: "IC_hand", publicationIdentity: "IC_pub" },
    },
  });
  const decompositionDigest = bodyDigest(renderWorkflowRecord(decomposition));
  const decompositionReadBack = { decompositionIdentity: "IC_dec", decompositionDigest };
  // The producer's one-shot ready-state projection: it named the blocker ready when it was published and
  // was never re-derived afterwards. Nothing in the composed path may release the dependant from it.
  const readyStateReadBack = { frontier: decomposition.readyFrontier };
  const checkpoints = createWorkflowControlStore({ gitCommonDir: join(repository, ".git") });
  const transaction = checkpoints.createCheckpoint(checkpointIdentity);
  checkpoints.advanceCheckpoint({ identity: checkpointIdentity, stage: "decomposition.read_back", receipt: decompositionReadBack });
  checkpoints.advanceCheckpoint({ identity: checkpointIdentity, stage: "ready_state.read_back", receipt: readyStateReadBack });
  checkpoints.advanceCheckpoint({
    identity: checkpointIdentity,
    stage: "handoff.completed",
    receipt: { handoffIdentity: "IC_hand", handoffDigest: bodyDigest("handoff") },
  });
  fixtures[1].comments.push(
    comment("IC_pub", {
      kind: "spec_publication",
      repositoryId: REPOSITORY_ID,
      authority: {
        specId: SPEC_ID,
        target: TARGET,
        planningSeal: seal,
        classification: "MULTI",
        approvedScopeHash: APPROVED_PUBLICATION,
        decompositionIdentity: null,
      },
      preparation: { requiredActions: REQUIRED_ACTIONS, trackerPublication: { required: "READ_WRITE_READBACK" }, sql: [] },
    }),
    comment("IC_dec", decomposition),
    comment("IC_hand", {
      kind: "producer_handoff",
      specId: SPEC_ID,
      target: TARGET,
      planningSeal: seal,
      classification: "MULTI",
      approvedScopeHash: APPROVED_PUBLICATION,
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
      preparation: { approvals: REQUIRED_ACTIONS.map((action) => ({ ...action, authority: "human:planning" })), preparedSql: [] },
    }),
  );

  const commandRunner = (name, args, options) => {
    if (name !== "gh") return runWorkflowCommand(name, args, options);
    if (args[1] === "graphql") {
      const id = args.find((value) => value.startsWith("id=")).slice(3);
      const known = Object.values(fixtures).find((entry) => entry.node_id === id);
      return JSON.stringify({
        data: {
          node: {
            id,
            number: known?.number ?? Number(id.slice(2)),
            repository: { nameWithOwner: REPOSITORY_NAME },
          },
        },
      });
    }
    const path = args[1];
    const issue = fixtures[Number(path.match(/issues\/(\d+)/u)[1])];
    let response = issue;
    if (path.includes("/comments")) response = issue.comments;
    else if (path.endsWith("/parent")) response = fixtures[1];
    else if (path.includes("/dependencies/blocked_by")) response = (blockers[issue.node_id] ?? []).map((node_id) => ({ node_id }));
    else if (path.includes("/events?")) response = [];
    return JSON.stringify([response]);
  };

  const store = () => createRunStore({ gitCommonDir: join(repository, ".git") });
  const journal = () => {
    const observed = store();
    const [stored, ...others] = observed.listRunIds();
    assert.deepEqual(others, [], "one Start owns one stored Run");
    return stored === undefined ? [] : observed.readEvents(stored);
  };
  const readSubagentRun = createNativeRunReader({ homeDir: agentRoot, runsRoot });
  // One entry invocation per stage, exactly as the coordinator re-enters it for each round.
  const start = (options = {}) => startRun({
    cwd: repository,
    specId: "1",
    cacheDirectory,
    homeDir: agentRoot,
    commandRunner,
    readSubagentRun,
    now: () => AT,
    ...options,
  });

  // The coordinator's own launch port: it records the native run the harness materialized, so the next
  // round observes that lane instead of creating a second one. It is the one port the entry never owns.
  const launches = [];
  const envelopes = [];
  const launch = async ({ lane }) => {
    launches.push(lane.id);
    envelopes.push(lane.launch);
    const worktreePath = join(root, "worktrees", lane.id);
    writeNativeRun({ agentRoot, laneRef: lane.laneRef, status: "running", worktreePath });
    return { settled: false, laneRef: lane.laneRef };
  };

  return {
    root,
    repository,
    agentRoot,
    version,
    seal,
    issues: fixtures,
    decomposition,
    readyStateReadBack,
    journal,
    store,
    start,
    launch,
    launches,
    envelopes,

    // The blocker's implementation: one real worktree, one real candidate integrated into the target, and
    // the completion note published while the Issue is still open.
    completeBlocker: ({ topic = "issue/blocker" } = {}) => {
      const worktree = join(root, "worktrees", "issue-blocker");
      mkdirSync(join(root, "worktrees"), { recursive: true });
      git(repository, "worktree", "add", "-b", topic, worktree, seal);
      writeFileSync(join(worktree, "blocker.txt"), "candidate\n");
      git(worktree, "add", "blocker.txt");
      git(worktree, "commit", "-m", "implement the blocker");
      const candidate = git(worktree, "rev-parse", "HEAD");
      git(repository, "merge", "--ff-only", topic);
      fixtures[2].comments.push(comment("IC_completion_blocker", {
        kind: "implementation_complete",
        issueId: BLOCKER_ID,
        specId: SPEC_ID,
        target: TARGET,
        targetWorktree: repository,
        topic,
        worktree,
        baseline: seal,
        candidate,
        planningSeal: seal,
        planningSealState: "reused",
        operationIdentity: deriveExecuteIssueOperationIdentity({
          repositoryId: REPOSITORY_ID,
          specId: SPEC_ID,
          approvedPublicationIdentity: APPROVED_PUBLICATION,
          issueId: BLOCKER_ID,
        }),
        manualAttestations: [],
        workflowArtifacts: [],
        standards: "clean",
        spec: "clean",
        verification: [{ command: "node --test tests/ron-workflow/*.test.mjs", result: "PASS — fixture candidate verification" }],
        repairWaveCount: 0,
        worktreeState: "clean",
      }));
      return { candidate, worktree, topic };
    },
    settleLane: ({ laneRef, worktreePath = null }) => writeNativeRun({ agentRoot, laneRef, status: "completed", worktreePath }),
    // The close lane's own effect: the exact clean worktree is removed and the Issue is closed.
    closeBlocker: ({ worktree }) => {
      git(repository, "worktree", "remove", "--force", worktree);
      rmSync(worktree, { recursive: true, force: true });
      fixtures[2].state = "closed";
    },
  };
};

// One loop run over the composition the entry returned: the entry's read and append ports, the
// coordinator's launch port, and the identities the round's lane planning reads.
const runComposed = async (started, fixture, { maxRounds, sink = [] } = {}) => runNativeRoundLoop({
  readRound: started.nativeLoop.readRound,
  append: (event) => {
    sink.push(event);
    return started.nativeLoop.append(event);
  },
  launch: fixture.launch,
  repositoryId: started.nativeLoop.repositoryId,
  approvedPublicationIdentity: started.nativeLoop.approvedPublicationIdentity,
  agentCeiling: started.nativeLoop.agentCeiling,
  now: () => AT,
  maxRounds,
});

// ---------------------------------------------------------------------------------------------
// AC-1 — the entry composes the native path, not a pi-workflow host round
// ---------------------------------------------------------------------------------------------

test("the entry emits the round the native round loop consumes and plans it through the native planner", async (t) => {
  const fixture = await nativeFixture(t);
  const started = await fixture.start();

  assert.equal(started.outcome, "READY", JSON.stringify(started.diagnosis ?? started.plan));
  const { round } = started;

  // The round read is the input `native-round-loop.mjs` consumes: one fresh read of the journal, one
  // `dag-run-facts:v1` fact set carrying that same journal, and one native lane-evidence read.
  assert.equal(round.readAt, AT);
  assert.equal(round.facts.schema, "dag-run-facts:v1");
  assert.equal(round.laneEvidence.schema, "native-lane-evidence:v1");
  assert.deepEqual(round.laneEvidence.lanes, [], "a fresh Run has materialized no lane");
  assert.equal(round.journal, round.facts.journal, "the round carries one journal read");
  assert.equal(typeof round.closeLane, "function");
  // The producer's one-shot `ready_state` projection travels with the round as that read, and the plan
  // records what it did with it.
  assert.deepEqual(round.readyState, fixture.readyStateReadBack);

  // No pi-workflow host round: the shape the bundle's round input declares is gone from this path.
  for (const field of ["stageId", "lanes", "blockedHostRun", "recorded", "cwd", "homeDir", "gitCommonDir"]) {
    assert.equal(Object.hasOwn(round, field), false, `the native round read must not carry the host round field ${field}`);
  }
  assert.equal(started.plan.disposition, "DISPATCH");
  assert.equal(started.plan.maxParallel, 3);
  assert.deepEqual(started.plan.legalActions, ["dispatch_issue"]);
  assert.deepEqual(started.plan.lanes.map((lane) => lane.id), ["dispatch_I_blocker_1"]);
  assert.deepEqual(started.plan.lanes.map((lane) => lane.actionType), ["dispatch_issue"]);
  assert.equal(started.plan.lanes[0].issueId, BLOCKER_ID);
  assert.equal(started.plan.lanes[0].skill, "execute-issue");
  assert.deepEqual(started.plan.authorizedActions, ["dispatch_I_blocker_1"]);
  assert.equal(started.plan.stop, null);
  assert.deepEqual(started.plan.readyState, { consulted: false, projection: fixture.readyStateReadBack });
  assert.deepEqual(started.plan.frontier.ready, [BLOCKER_ID]);
  assert.deepEqual(started.plan.frontier.gated, [DEPENDANT_ID]);

  // The loop's ports are the entry's own composition; only the launch port belongs to the coordinator.
  assert.equal(started.nativeLoop.launchOwner, "coordinator");
  assert.equal(typeof started.nativeLoop.readRound, "function");
  assert.equal(typeof started.nativeLoop.append, "function");
  assert.equal(started.nativeLoop.repositoryId, REPOSITORY_ID);
  assert.equal(started.nativeLoop.approvedPublicationIdentity, APPROVED_PUBLICATION);
  assert.deepEqual(started.nativeLoop.agentCeiling, AGENT_CEILING);
  assert.deepEqual(fixture.journal().map(({ type }) => type), ["grant.recorded"], "planning a round dispatches nothing");
  assert.equal(fixture.launches.length, 0, "the entry never dispatches a lane");

  // The entry source proves the default path reaches no bundle helper and no pi-workflow host round. The
  // optional bundle stays in the repository; nothing here imports it.
  assert.doesNotMatch(entrySource, /host-runs\.mjs|blockedHostRun|planHostRound|host-lane-evidence|deliver-tracker-spec/iu);
  assert.doesNotMatch(entrySource, /\.pi\/workflows/iu);
});

test("the composed path materializes a ready lane through the native lane runner and observes it after", async (t) => {
  const fixture = await nativeFixture(t);
  const started = await fixture.start();
  assert.equal(started.outcome, "READY");

  const first = await runComposed(started, fixture, { maxRounds: 1 });
  assert.equal(first.outcome, "ROUND_LIMIT");
  assert.deepEqual(first.rounds[0].lanes, ["dispatch_I_blocker_1"]);
  assert.deepEqual(fixture.launches, ["dispatch_I_blocker_1"]);

  // The dispatch reservation is durable before the launch envelope exists, and it names the lane the
  // runner owns.
  const reserved = fixture.journal();
  assert.deepEqual(reserved.map(({ type }) => type), ["grant.recorded", "dispatch.recorded"]);
  assert.deepEqual(reserved[1].taskRef, { hostId: "pi-subagents", threadId: "dispatch_I_blocker_1" });

  // AC-2: the prompt the runner hands the worker carries the standing discipline, and the existing
  // one-skill and tool-ceiling guards bound that composed prompt.
  const [envelope] = fixture.envelopes;
  assert.equal(envelope.taskRef.threadId, "dispatch_I_blocker_1");
  assert.equal(envelope.skill, "execute-issue");
  assert.deepEqual(envelope.tools, AGENT_CEILING);
  assert.match(envelope.prompt, /^\S*Use \$execute-issue/mu);
  assert.match(envelope.prompt, /Standing rules for this lane:/u);
  assert.match(envelope.prompt, /Read the repository, the tracker and Git only; never scan or walk the host filesystem\./u);
  assert.match(envelope.prompt, /Stop and ask the coordinator when a harness fact you need is genuinely absent\./u);
  assert.equal((envelope.prompt.match(/\$[a-z][a-z0-9-]*/gu) ?? []).length, 1, "the composed prompt invokes exactly one contract skill");
  assert.deepEqual(envelope.standingRules, [...LANE_STANDING_RULES]);
  assert.equal(envelope.standingRules.length >= 1, true);

  // The next round observes the recorded lane: it creates no second lane and counts no second attempt.
  const second = await runComposed(await fixture.start(), fixture, { maxRounds: 2 });
  assert.equal(second.outcome, "WAITING");
  assert.equal(second.rounds.length, 1, "a round with nothing to materialize yields at once");
  assert.deepEqual(second.rounds[0].lanes, []);
  assert.deepEqual(second.rounds[0].readBacks, []);
  assert.equal(fixture.launches.length, 1);
  assert.equal(fixture.journal().filter(({ type }) => type === "dispatch.recorded").length, 1);
  assert.equal(
    second.frontier.nodes.find((entry) => entry.issueId === BLOCKER_ID).state,
    "READY",
  );
  const gated = second.frontier.nodes.find((entry) => entry.issueId === DEPENDANT_ID);
  assert.equal(gated.state, "GATED");
  assert.equal(gated.evidence.includes(`Issue ${BLOCKER_ID} is still open in the tracker.`), true);
});

test("the composed path serializes one close lane and releases the dependant by re-derivation", async (t) => {
  const fixture = await nativeFixture(t);
  assert.equal((await fixture.start()).outcome, "READY");
  await runComposed(await fixture.start(), fixture, { maxRounds: 1 });
  assert.deepEqual(fixture.launches, ["dispatch_I_blocker_1"]);

  // The blocker's implementation completes: the lane settles, the candidate is integrated into the
  // target, and the completion note is published while the Issue is still open in the tracker.
  const completed = fixture.completeBlocker();
  fixture.settleLane({ laneRef: "dispatch_I_blocker_1", worktreePath: completed.worktree });

  // The close lane is the next legal action, and the dependant stays gated because its blocker is not
  // closed yet — the next round's own three-condition re-derivation, not the producer's projection.
  const closing = await fixture.start();
  assert.equal(closing.outcome, "READY", JSON.stringify(closing.diagnosis ?? closing.plan));
  assert.equal(closing.plan.disposition, "DISPATCH");
  assert.deepEqual(closing.plan.lanes.map((lane) => lane.id), ["close_I_blocker"]);
  assert.deepEqual(closing.plan.lanes.map((lane) => lane.actionType), ["close_issue"]);
  assert.equal(closing.plan.lanes[0].closeInvocation, 1);
  assert.deepEqual(closing.plan.lanes.map((lane) => lane.issueId), [BLOCKER_ID]);
  assert.deepEqual(closing.plan.deferred, [], "close lanes are not bounded by the execution slots");
  assert.deepEqual(closing.plan.frontier.ready, [BLOCKER_ID], "the dependant is not released before its blocker closes");
  // The producer's projection still names the blocker alone, and it is carried as superseded evidence.
  assert.deepEqual(closing.plan.readyState, { consulted: false, projection: fixture.readyStateReadBack });

  const closeRound = await runComposed(closing, fixture, { maxRounds: 2 });
  assert.equal(closeRound.outcome, "WAITING");
  assert.deepEqual(closeRound.rounds[0].lanes, ["close_I_blocker"]);
  assert.deepEqual(fixture.launches, ["dispatch_I_blocker_1", "close_I_blocker"]);

  // The close-lane invocation is recorded before the lane exists, through the delivery-progress owner,
  // and the following round reads that recorded lane back instead of materializing a second close owner.
  const intents = fixture.journal().filter(({ stage }) => stage === "CLOSE_DISPATCH_INTENT");
  assert.equal(intents.length, 1);
  assert.match(intents[0].requestIdentity, /#invocation-1$/u);
  assert.equal(intents[0].owner, "close-issue");
  assert.deepEqual(closeRound.rounds[1].lanes, []);
  assert.deepEqual(closeRound.rounds[1].readBacks, ["close_I_blocker"]);
  assert.equal(fixture.journal().filter(({ stage }) => stage === "CLOSE_DISPATCH_INTENT").length, 1);

  // The close lane's effect: the exact worktree is removed and the Issue is closed. The very next round
  // re-derives the release frontier from the three conditions and releases the dependant.
  fixture.closeBlocker({ worktree: completed.worktree });
  const releasing = await fixture.start();
  assert.equal(releasing.outcome, "READY", JSON.stringify(releasing.diagnosis ?? releasing.plan));
  assert.deepEqual(releasing.plan.lanes.map((lane) => lane.id), ["dispatch_I_dependant_1"]);
  assert.deepEqual(releasing.plan.lanes.map((lane) => lane.issueId), [DEPENDANT_ID]);
  assert.equal(releasing.plan.frontier.ready.includes(DEPENDANT_ID), true);
  assert.deepEqual(releasing.plan.frontier.gated, [], "the blocker's release edge is satisfied, not projected");
  assert.deepEqual(releasing.plan.frontier.unproven, []);
  // AC-3: the projection that named the blocker is unchanged and unread, and the dependant is released
  // from the freshly read blocker state instead.
  assert.deepEqual(releasing.plan.readyState, { consulted: false, projection: fixture.readyStateReadBack });
  assert.equal(JSON.stringify(fixture.readyStateReadBack).includes(DEPENDANT_ID), false);
  const released = releasing.round.facts.nodes.find((node) => node.issueId === BLOCKER_ID);
  assert.equal(released.trackerState, "CLOSED");
  assert.equal(released.candidateReachable, true);
  assert.equal(released.worktreeState, "ABSENT");

  // AC-4: the leaf contracts' material-work accounting and the Grant's bound are unchanged by the
  // composition — one execute-issue and one close-issue for a healthy Issue, ten waves at most.
  const releaseRound = await runComposed(releasing, fixture, { maxRounds: 1 });
  assert.equal(releaseRound.outcome, "ROUND_LIMIT");
  assert.deepEqual(releaseRound.rounds[0].lanes, ["dispatch_I_dependant_1"]);
  assert.equal(releaseRound.accounting.limit, 10);
  assert.deepEqual(releaseRound.accounting.healthyInvocations, { "execute-issue": 1, "close-issue": 1 });
  const blockerAccounting = releaseRound.accounting.issues[BLOCKER_ID];
  assert.equal(blockerAccounting.healthy, true);
  assert.equal(blockerAccounting.repairWaves, 0);
  assert.deepEqual(blockerAccounting.leafInvocations, { "execute-issue": 1, "close-issue": 1 });
  assert.deepEqual(blockerAccounting.repeatedWork, []);
  assert.equal(fixture.journal().find(({ type }) => type === "grant.recorded").maxParallel, 3);
});

// ---------------------------------------------------------------------------------------------
// AC-5 — the composed path's refusals
// ---------------------------------------------------------------------------------------------

test("a lane the composition cannot attribute to its Issue and attempt is refused before planning", async (t) => {
  const fixture = await nativeFixture(t);
  const started = await fixture.start({
    // The recorded lane names attempt 2 while it claims attempt 1 for the same Issue: a lane identified
    // by title, path or order would be attributed here, and this composition refuses instead.
    readRecordedLanes: () => [{
      laneRef: "dispatch_I_blocker_2",
      issueId: BLOCKER_ID,
      attempt: 1,
      runId: "dispatch_I_blocker_2",
      worktree: null,
      topic: null,
    }],
  });

  assert.equal(started.outcome, "LANE_EVIDENCE_UNATTRIBUTED");
  assert.equal(started.diagnosis.reasonCode, "lane_evidence_unattributed");
  assert.deepEqual(started.diagnosis.evidence, ["dispatch_I_blocker_2"]);
  assert.equal(started.plan, undefined, "an unattributable lane authorizes no round");
  assert.equal(fixture.launches.length, 0);
  assert.deepEqual(fixture.journal().map(({ type }) => type), ["grant.recorded"]);
});

test("a recorded lane whose native run proves nothing is refused instead of materialized", async (t) => {
  const fixture = await nativeFixture(t);
  const started = await fixture.start({
    // A lane the coordinator recorded but whose native subagent run record proves no liveness: the
    // composition reports UNKNOWN, and the round refuses rather than materializing a worker nobody can
    // attribute to that lane.
    readRecordedLanes: () => [{
      laneRef: "dispatch_I_blocker_1",
      issueId: BLOCKER_ID,
      attempt: 1,
      runId: "dispatch_I_blocker_1",
      worktree: null,
      topic: null,
    }],
  });

  assert.equal(started.outcome, "READY");
  assert.equal(started.plan.disposition, "BLOCKED");
  assert.equal(started.plan.stop.code, "lane_liveness_unknown");
  assert.deepEqual(started.plan.lanes, []);
  assert.deepEqual(started.plan.authorizedActions, []);
  assert.deepEqual(
    started.round.laneEvidence.lanes.map((lane) => [lane.laneRef, lane.state]),
    [["dispatch_I_blocker_1", "UNKNOWN"]],
  );
  const loop = await runComposed(started, fixture, { maxRounds: 1 });
  assert.equal(loop.outcome, "STOP");
  assert.deepEqual(loop.rounds[0].lanes, []);
  assert.equal(fixture.launches.length, 0);
  assert.deepEqual(fixture.journal().map(({ type }) => type), ["grant.recorded"], "a refused lane writes nothing");
});

test("a lost launch response with no native lane blocks the round instead of a second lane", async (t) => {
  const fixture = await nativeFixture(t);
  assert.equal((await fixture.start()).outcome, "READY");
  const [runId] = fixture.store().listRunIds();
  const writer = fixture.store().acquireWriter(runId);
  try {
    // The reservation is journaled and no native subagent run record ever proves a lane: a lost launch
    // response. The authority reports it rather than dispatching a second lane for the same attempt.
    writer.append({
      type: "dispatch.recorded",
      at: AT,
      issueId: BLOCKER_ID,
      attempt: 1,
      taskRef: { hostId: "pi-subagents", threadId: "dispatch_I_blocker_1" },
    });
  } finally {
    writer.release();
  }

  const started = await fixture.start();
  assert.equal(started.outcome, "READY");
  assert.equal(started.plan.disposition, "BLOCKED");
  assert.equal(started.plan.stop.code, "round_host_plan_stopped");
  // The authority's own diagnosis: a journaled dispatch the facts cannot attribute to a task is
  // insufficient evidence, so the round reports it instead of dispatching a second lane.
  const status = reduceRun(started.round.facts);
  assert.equal(status.diagnoses.some(({ reasonCode, evidence }) => reasonCode === "insufficient_evidence"
    && evidence.some((entry) => entry.includes("has a journaled dispatch but no authoritative task evidence"))), true);
  assert.deepEqual(status.legalActions, []);
  assert.deepEqual(
    started.round.laneEvidence.lanes.map((lane) => [lane.laneRef, lane.state]),
    [["dispatch_I_blocker_1", "UNKNOWN"]],
  );
  const loop = await runComposed(started, fixture, { maxRounds: 1 });
  assert.deepEqual(loop.rounds[0].lanes, []);
  assert.equal(fixture.launches.length, 0);
  assert.equal(fixture.journal().filter(({ type }) => type === "dispatch.recorded").length, 1);
});

// A Multi-Issue Run lanes its children only, so its parent Issue never carries a `dispatch.recorded`.
// The parent's close intent is journalable anyway, observed against the Grant's own bound decomposition
// identity (Issue 139, AC-1, AC-2): proven here on the very Run journal the composed path produced.
test("a Multi-Issue parent close intent is journalable on the Run that never dispatched its parent", async (t) => {
  const fixture = await nativeFixture(t);
  assert.equal((await fixture.start()).outcome, "READY");
  await runComposed(await fixture.start(), fixture, { maxRounds: 1 });
  assert.deepEqual(fixture.launches, ["dispatch_I_blocker_1"]);

  const [runId] = fixture.store().listRunIds();
  const journal = fixture.journal();
  const grant = journal.find(({ type }) => type === "grant.recorded");
  assert.equal(grant.runIdentity.classification, "MULTI");
  assert.equal(grant.runIdentity.specId, SPEC_ID);
  assert.equal(typeof grant.runIdentity.decompositionIdentity, "string");
  assert.notEqual(grant.runIdentity.decompositionIdentity, "");
  assert.deepEqual(
    journal.filter(({ type }) => type === "dispatch.recorded").map(({ issueId }) => issueId),
    [BLOCKER_ID],
    "the Run dispatched its child only, never the parent Issue",
  );

  const writer = fixture.store().acquireWriter(runId);
  try {
    const appended = writer.append({
      type: "delivery.observed",
      at: AT,
      issueId: SPEC_ID,
      operationId: `workflow-op-v1-${"c".repeat(64)}`,
      stage: "CLOSE_DISPATCH_INTENT",
      disposition: "INTENT_RECORDED",
      sourceAt: AT,
      owner: "close-issue",
      evidenceIdentity: null,
      requestIdentity: "close:#invocation-1",
      blockingPredicate: null,
    });
    assert.equal(appended.stage, "CLOSE_DISPATCH_INTENT");
  } finally {
    writer.release();
  }

  assert.deepEqual(
    fixture.journal().filter(({ stage }) => stage === "CLOSE_DISPATCH_INTENT").map(({ issueId }) => issueId),
    [SPEC_ID],
  );
});
