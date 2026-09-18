// The GitLab Tracker Run sources (Issue 126, AC-1 through AC-5).
//
// A configured GitLab project must answer the same owning-source surface the GitHub composition answers,
// derive the same Run facts, and keep the provider-neutral facts in the existing Run store. These tests
// drive the sibling composition over a real Git repository and a configured
// `docs/agents/gitlab-producer.json` binding, with the `glab` transport injected, and compare the facts it
// derives against the facts the GitHub composition derives for the structurally identical fixture: one
// Single-Issue and one Multi-Issue Spec whose dependant is gated behind a blocker.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { createRunAuthorityAdapters } from "../../skills/personal/run-issue-workflow/scripts/delivery-authority.mjs";
import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import { createGitLabWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/gitlab-workflow-sources.mjs";
import { bodyDigest, renderWorkflowRecord } from "../../skills/personal/run-issue-workflow/scripts/gitlab-workflow-records.mjs";
import { planNativeRound } from "../../skills/personal/run-issue-workflow/scripts/native-round-loop.mjs";
import { createNativeRunComposition, startRun } from "../../skills/personal/run-issue-workflow/scripts/run-entry.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { runWorkflowCommand } from "../../skills/personal/run-issue-workflow/scripts/workflow-command.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity, deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const AT = "2026-09-18T06:00:00.000Z";
const TARGET = "main";
const REPOSITORY_NAME = "example/repo";
const GITHUB_REPOSITORY_ID = `github:${REPOSITORY_NAME}`;
const BASE_URL = "https://gitlab.example";
const HOST = "gitlab.example";
const PROJECT = "group/sub/project";
const PROJECT_URL = `${BASE_URL}/${PROJECT}`;
const GITLAB_REPOSITORY_ID = `gitlab:${HOST}/${PROJECT}`;
const PROJECT_ID = 31;
const OWNER_ID = 7;
const SPEC_BODY = "# Settled Spec\n\nfixture multi parent\n";
const REQUIRED_ACTIONS = [
  { action: "task-create", scope: "one native task per selected child" },
  { action: "local-close", scope: "integrate and clean owned worktrees" },
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();

// One retained installation: the exact trusted layout `selectWorkflowVersion` verifies.
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

// The same structure for both providers: one Spec, one blocker child and one dependant child, the
// dependant gated by the published body graph. The child bodies are byte-identical across the two
// fixtures — the canonical `## Parent` cell that stands in for a native hierarchy link is inert for the
// GitHub composition — so the derived facts can be compared fact for fact.
const fixture = async (t, { tracker, classification = "MULTI" }) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `run-sources-${tracker}-`)));
  const repository = join(root, "repo");
  const agentRoot = join(root, "agent");
  const cacheDirectory = join(root, ".codex/workflow-packages");
  mkdirSync(repository, { recursive: true });
  mkdirSync(join(agentRoot, ".pi/agent/subagent-runs"), { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const identity = (iid) => tracker === "gitlab" ? `${PROJECT_URL}/-/issues/${iid}` : `I_${iid}`;
  const specId = identity(1);
  const blockerId = tracker === "gitlab" ? `${PROJECT_URL}/-/issues/2` : "I_blocker";
  const dependantId = tracker === "gitlab" ? `${PROJECT_URL}/-/issues/3` : "I_dependant";
  const childBody = (label) => `## Parent\n${specId}\n\n## Target\n${TARGET}\n\nfixture ${label} child\n`;
  const blockerBody = childBody("blocker");
  const dependantBody = childBody("dependant");
  const approvedScopeHash = bodyDigest(SPEC_BODY);

  git(repository, "init", "-b", TARGET);
  git(repository, "config", "user.name", "Fixture");
  git(repository, "config", "user.email", "fixture@example.invalid");
  git(repository, "remote", "add", "origin",
    tracker === "gitlab" ? `${PROJECT_URL}.git` : `https://github.com/${REPOSITORY_NAME}.git`);
  writeFileSync(join(repository, "README.md"), "baseline\n");
  if (tracker === "gitlab") {
    mkdirSync(join(repository, "docs/agents"), { recursive: true });
    writeFileSync(join(repository, "docs/agents/gitlab-producer.json"),
      `${JSON.stringify({ schema: "gitlab-producer:v1", baseUrl: BASE_URL, project: PROJECT }, null, 2)}\n`);
  }
  git(repository, "add", "-A");
  git(repository, "commit", "-m", "baseline");
  const seal = git(repository, "rev-parse", "HEAD");
  const version = buildInstallation(cacheDirectory);
  const repositoryId = tracker === "gitlab" ? GITLAB_REPOSITORY_ID : GITHUB_REPOSITORY_ID;

  const decomposition = {
    kind: "decomposition:v1",
    repositoryId,
    parent: specId,
    target: TARGET,
    planningSeal: seal,
    approvedScopeHash,
    decompositionMapping: classification === "MULTI" ? { "1/01": blockerId, "1/02": dependantId } : null,
    childBodyDigests: classification === "MULTI"
      ? { [blockerId]: bodyDigest(blockerBody), [dependantId]: bodyDigest(dependantBody) }
      : null,
    blockerEdges: classification === "MULTI" ? [{ blocker: blockerId, blocked: dependantId }] : [],
    readyFrontier: classification === "MULTI" ? [blockerId] : [specId],
  };
  // The native note identities the tracker read will report: the publication, the decomposition and the
  // handoff are the first three notes of the Spec, exactly as the GitLab producers append them.
  const noteIdentity = (id) => tracker === "gitlab" ? `${specId}#note_${id}` : `IC_fixture_${id}`;
  const publicationIdentity = noteIdentity(1);
  const decompositionIdentity = noteIdentity(2);
  const handoffIdentity = noteIdentity(3);
  const checkpointIdentity = bindProducerCheckpointOperationIdentity({
    repositoryId,
    specId,
    producerCommand: classification === "SINGLE" ? "to-spec" : "to-tickets",
    profileVersion: "v2",
    target: TARGET,
    baseline: seal,
    bindings: {
      approvedScopeIdentity: approvedScopeHash,
      classification,
      planningSeal: seal,
      upstream: { handoffIdentity, publicationIdentity },
    },
  });
  const checkpoints = createWorkflowControlStore({ gitCommonDir: join(repository, ".git") });
  const transaction = checkpoints.createCheckpoint(checkpointIdentity);
  const decompositionDigest = bodyDigest(renderWorkflowRecord(decomposition));
  const decompositionReadBack = { decompositionIdentity, decompositionDigest };
  const readyStateReadBack = { frontier: decomposition.readyFrontier };
  const publication = {
    kind: "spec_publication",
    repositoryId,
    authority: { specId, target: TARGET, planningSeal: seal, classification, approvedScopeHash, decompositionIdentity: null },
    trackerIdentity: specId,
    transactionIdentity: transaction.transactionId,
    preparation: { requiredActions: REQUIRED_ACTIONS, trackerPublication: { required: "READ_WRITE_READBACK" }, sql: [] },
  };
  const handoffRecord = {
    kind: "producer_handoff",
    repositoryId,
    authority: { specId, target: TARGET, planningSeal: seal, classification, approvedScopeHash, decompositionIdentity: classification === "MULTI" ? decompositionIdentity : null },
    approvedScopeHash,
    producerCommand: classification === "SINGLE" ? "to-spec" : "to-tickets",
    trackerIdentity: specId,
    publicationIdentity,
    decompositionIdentity: classification === "MULTI" ? decompositionIdentity : null,
    decompositionDigest: classification === "MULTI" ? decompositionDigest : undefined,
    decompositionMapping: decomposition.decompositionMapping,
    blockerEdges: decomposition.blockerEdges,
    upstream: { handoffIdentity, publicationIdentity },
    operationReceipt: { transactionIdentity: transaction.transactionId, decompositionReadBack, readyStateReadBack },
    recordIdentities: classification === "MULTI" ? [publicationIdentity, decompositionIdentity] : [publicationIdentity],
    checkpointIdentity,
    transactionIdentity: transaction.transactionId,
    preparation: { approvals: REQUIRED_ACTIONS.map((action) => ({ ...action, authority: "human:planning" })), preparedSql: [] },
  };
  const publicationReadBack = {
    publicationIdentity,
    publicationDigest: bodyDigest(renderWorkflowRecord(publication)),
    trackerIdentity: specId,
    version: `sha256:${sha256(renderWorkflowRecord(publication))}`,
    approvedScopeIdentity: approvedScopeHash,
    target: TARGET,
    planningSeal: seal,
    classification,
  };
  if (classification === "SINGLE") {
    checkpoints.advanceCheckpoint({ identity: checkpointIdentity, stage: "planning_seal.read_back", receipt: { target: TARGET, planningSeal: seal, state: "reused" } });
    checkpoints.advanceCheckpoint({ identity: checkpointIdentity, stage: "publication.read_back", receipt: publicationReadBack });
  } else {
    checkpoints.advanceCheckpoint({ identity: checkpointIdentity, stage: "decomposition.read_back", receipt: decompositionReadBack });
    checkpoints.advanceCheckpoint({ identity: checkpointIdentity, stage: "ready_state.read_back", receipt: readyStateReadBack });
  }
  checkpoints.advanceCheckpoint({
    identity: checkpointIdentity,
    stage: "handoff.completed",
    receipt: { handoffIdentity, handoffDigest: bodyDigest(renderWorkflowRecord(handoffRecord)) },
  });
  const published = classification === "MULTI" ? [publication, decomposition, handoffRecord] : [publication, handoffRecord];

  // --- the two tracker stubs ------------------------------------------------------------------
  const iidOf = (identityValue) => {
    if (identityValue === specId) return 1;
    if (identityValue === blockerId) return 2;
    if (identityValue === dependantId) return 3;
    return Number(String(identityValue).slice(2));
  };
  const issues = new Map([
    [1, { identity: specId, body: SPEC_BODY, closed: false, notes: [], stateChanges: [] }],
    [2, { identity: blockerId, body: blockerBody, closed: false, notes: [], stateChanges: [] }],
    [3, { identity: dependantId, body: dependantBody, closed: false, notes: [], stateChanges: [] }],
  ]);
  issues.get(1).notes = published.map((record, index) => ({ id: index + 1, record }));
  const calls = [];
  const writes = [];
  const blockers = { [blockerId]: [], [dependantId]: [blockerId] };

  const gitLabRow = (iid) => {
    const issue = issues.get(iid);
    return {
      id: 1000 + iid,
      iid,
      project_id: PROJECT_ID,
      issue_type: "issue",
      web_url: issue.identity,
      title: `fixture ${iid}`,
      description: issue.body,
      labels: ["ready-for-agent"],
      state: issue.closed ? "closed" : "opened",
      updated_at: "2026-09-01T00:00:00Z",
      author: { id: OWNER_ID },
    };
  };
  const noteRow = (note) => ({
    id: note.id,
    noteable_iid: note.iid,
    noteable_type: "Issue",
    system: false,
    author: { id: OWNER_ID },
    body: renderWorkflowRecord(note.record),
    created_at: "2026-09-01T00:00:00Z",
  });
  const page = (rows, url) => {
    const number = Number(url.searchParams.get("page") ?? 1);
    return rows.slice((number - 1) * 100, number * 100);
  };
  const transport = async ({ method = "GET", path }) => {
    calls.push({ method, path });
    if (method !== "GET") {
      writes.push({ method, path });
      throw new Error(`The Run composition must never write to the tracker (${method} ${path})`);
    }
    const url = new URL(path, "https://fixture/");
    const route = url.pathname;
    if (route === `/projects/${encodeURIComponent(PROJECT)}`) {
      return { id: PROJECT_ID, path_with_namespace: PROJECT, web_url: PROJECT_URL };
    }
    if (route === "/user") return { id: OWNER_ID };
    if (route === `/projects/${PROJECT_ID}/members/all/${OWNER_ID}`) return { id: OWNER_ID, access_level: 40 };
    const notesRoute = route.match(new RegExp(`^/projects/${PROJECT_ID}/issues/(\\d+)/notes(?:/(\\d+))?$`, "u"));
    if (notesRoute) {
      const iid = Number(notesRoute[1]);
      const rows = issues.get(iid).notes.map((note) => noteRow({ ...note, iid }));
      if (notesRoute[2]) return rows.find((row) => row.id === Number(notesRoute[2]));
      return page(rows, url);
    }
    const eventsRoute = route.match(new RegExp(`^/projects/${PROJECT_ID}/issues/(\\d+)/resource_state_events$`, "u"));
    if (eventsRoute) return page(issues.get(Number(eventsRoute[1])).stateChanges, url);
    const issueRoute = route.match(new RegExp(`^/projects/${PROJECT_ID}/issues/(\\d+)$`, "u"));
    if (issueRoute) return gitLabRow(Number(issueRoute[1]));
    throw new Error(`Unexpected fixture request ${method} ${path}`);
  };

  const commandRunner = (name, args, options) => {
    if (name !== "gh") return runWorkflowCommand(name, args, options);
    const path = args[1];
    if (path === "graphql") {
      const id = args.find((value) => value.startsWith("id=")).slice(3);
      return JSON.stringify({
        data: { node: { id, number: iidOf(id), repository: { nameWithOwner: REPOSITORY_NAME } } },
      });
    }
    const iid = Number(path.match(/issues\/(\d+)/u)[1]);
    const issue = issues.get(iid);
    let response = { node_id: issue.identity, number: iid, state: issue.closed ? "closed" : "open", body: issue.body };
    if (path.includes("/comments")) {
      response = issue.notes.map((note) => ({
        node_id: noteIdentity(note.id),
        author_association: "OWNER",
        created_at: "2026-09-01T00:00:00Z",
        body: renderWorkflowRecord(note.record),
      }));
    } else if (path.endsWith("/parent")) response = { node_id: specId };
    else if (path.includes("/dependencies/blocked_by")) response = (blockers[issue.identity] ?? []).map((node_id) => ({ node_id }));
    else if (path.includes("/events?")) response = issue.stateChanges;
    return JSON.stringify([response]);
  };

  const store = createRunStore({ gitCommonDir: join(repository, ".git") });
  const tasks = { read: () => null };
  const sources = await (tracker === "gitlab" ? createGitLabWorkflowSources : createGitHubWorkflowSources)({
    repository,
    repositoryName: REPOSITORY_NAME,
    configuration: { schema: "gitlab-producer:v1", baseUrl: BASE_URL, project: PROJECT },
    transport,
    commandRunner,
    store,
    tasks,
    workflowVersion: null,
    installationCacheDirectory: null,
  });
  const adapters = createRunAuthorityAdapters({ sources: sources.sources, store, tasks });
  const request = { specId };

  return {
    tracker,
    root,
    repository,
    agentRoot,
    transport,
    repositoryId,
    store,
    sources,
    adapters,
    request,
    seal,
    version,
    cacheDirectory,
    specId,
    blockerId,
    dependantId,
    approvedScopeHash,
    calls,
    writes,
    decomposition,
    readyStateReadBack,
    identities: { publication: publicationIdentity, decomposition: decompositionIdentity, handoff: handoffIdentity },
    trackerState: issues,
    addNote: ({ iid, id, record }) => { issues.get(iid).notes.push({ id, record }); },
    closeIssue: ({ iid }) => { issues.get(iid).closed = true; issues.get(iid).stateChanges.push({ id: 100 + iid, state: "closed", created_at: "2026-09-18T06:01:00.000Z", resource_type: "Issue" }); },
  };
};

// Provider identities replaced by placeholders, so two structurally identical fixtures compare fact for
// fact; the Run id is dropped because it is derived from the provider repository identity itself.
const normalize = (f, value) => {
  let text = JSON.stringify(value);
  // The native record identities first: a GitLab note identity embeds its Issue's web URL, so replacing
  // the Issue identity first would split it.
  for (const [identity, placeholder] of [
    [f.identities.decomposition, "<decomposition-note>"],
    [f.identities.handoff, "<handoff-note>"],
    [f.identities.publication, "<publication-note>"],
    [f.specId, "<spec>"],
    [f.blockerId, "<blocker>"],
    [f.dependantId, "<dependant>"],
  ]) {
    text = text.replaceAll(identity, placeholder);
  }
  return JSON.parse(text);
};

const readFacts = async (f) => {
  const tracker = await f.sources.sources.tracker.read(f.request);
  const current = await f.adapters.reconcile({ request: f.request, tracker, journal: [] });
  return { tracker, current, target: current.authorityReadBack.target };
};

test("the GitLab composition answers the required owning-source surface and reaches no GitHub module", async (t) => {
  const f = await fixture(t, { tracker: "gitlab" });
  const { sources } = f.sources;
  for (const [owner, method] of [
    ["repository", "readIdentity"],
    ["tracker", "read"],
    ["reconciliation", "read"],
    ["target", "read"],
    ["checkpoint", "read"],
    ["handoff", "read"],
    ["writer", "readHealth"],
    ["selector", "listNonTerminalRuns"],
  ]) {
    assert.equal(typeof sources[owner]?.[method], "function", `the composition must answer ${owner}.${method}`);
  }
  for (const method of ["readIssue", "readIssueState", "metrics", "readCleanupRuns", "targetRead"]) {
    assert.equal(typeof f.sources[method], "function", `the composition-level ${method} read is part of the surface`);
  }
  assert.equal(await sources.repository.readIdentity({ request: f.request }), GITLAB_REPOSITORY_ID);
  assert.equal(f.sources.gitCommonDir, realpathSync(join(f.repository, ".git")));

  // No GitHub-only module is reached from the GitLab composition, at any depth.
  const scripts = resolve(join(import.meta.dirname, "../../skills/personal/run-issue-workflow/scripts"));
  const graph = new Set();
  const visit = (file) => {
    if (graph.has(file)) return;
    graph.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(/from\s+"(\.[^"]+)"/gu)) {
      visit(resolve(dirname(file), match[1]));
    }
  };
  visit(join(scripts, "gitlab-workflow-sources.mjs"));
  visit(join(scripts, "gitlab-workflow-records.mjs"));
  const reached = [...graph].map((file) => file.slice(scripts.length + 1)).sort();
  assert.deepEqual(reached.filter((file) => file.startsWith("github-")), [],
    `the GitLab composition must reach no GitHub-only module; reached ${reached.join(", ")}`);
  assert.equal(reached.includes("github-workflow-sources.mjs"), false);
});

test("the GitLab read derives the owner's authority, the body-graph blockers and the same facts as GitHub", async (t) => {
  for (const classification of ["SINGLE", "MULTI"]) {
    const gitlab = await fixture(t, { tracker: "gitlab", classification });
    const github = await fixture(t, { tracker: "github", classification });
    const gitlabRead = await readFacts(gitlab);
    const githubRead = await readFacts(github);

    assert.equal(gitlabRead.tracker.authority.specId, gitlab.specId);
    assert.equal(gitlabRead.tracker.authority.target, TARGET);
    assert.equal(gitlabRead.tracker.authority.classification, classification);
    assert.equal(gitlabRead.tracker.authority.approvedScopeHash, bodyDigest(SPEC_BODY));
    assert.equal(gitlabRead.tracker.handoff.record.producerCommand, classification === "SINGLE" ? "to-spec" : "to-tickets");
    assert.equal(gitlabRead.target.state, "CLEAN");
    assert.equal(await gitlab.sources.sources.repository.readIdentity({}), GITLAB_REPOSITORY_ID);

    const nodes = Object.fromEntries(gitlabRead.current.facts.nodes.map((node) => [node.issueId, node]));
    const ready = classification === "MULTI" ? gitlab.blockerId : gitlab.specId;
    if (classification === "MULTI") {
      assert.deepEqual(nodes[gitlab.blockerId].blockers, []);
      assert.deepEqual(nodes[gitlab.dependantId].blockers, [gitlab.blockerId]);
      assert.deepEqual(gitlabRead.current.runReadyAuthority.readyFrontier, [gitlab.blockerId]);
      assert.equal(gitlabRead.current.runReadyAuthority.blockerEdges.length, 1);
    } else {
      assert.deepEqual(Object.keys(nodes), [gitlab.specId]);
    }
    assert.equal(nodes[ready].trackerState, "OPEN");
    assert.equal(nodes[ready].completionState, "NONE");
    assert.equal(nodes[ready].candidateReachable, false);

    assert.deepEqual(gitlab.writes, [], "the Run host performs no tracker mutation");
    assert.deepEqual(
      gitlab.calls.filter((call) => /dependencies|links|parent\/?$/u.test(call.path)).map((call) => call.path),
      [],
      "no native blocking relation or Issue hierarchy capability is probed",
    );

    // Fact-for-fact parity with the GitHub composition over the structurally identical fixture.
    const gitlabFacts = normalize(gitlab, gitlabRead.current.facts);
    const githubFacts = normalize(github, githubRead.current.facts);
    // Two fixtures are two repositories: the Run id is derived from the provider repository identity and
    // the target head is the fixture's own commit, so neither is a provider-derived fact.
    delete gitlabFacts.run.runId;
    delete githubFacts.run.runId;
    delete gitlabFacts.run.targetHead;
    delete githubFacts.run.targetHead;
    assert.deepEqual(gitlabFacts, githubFacts,
      `the GitLab-derived facts must equal the GitHub-derived facts for a ${classification} Spec`);
    assert.equal(normalize(gitlab, gitlabRead.current.runReadyAuthority).trackerVersion,
      normalize(github, githubRead.current.runReadyAuthority).trackerVersion);
  }
});

test("a closed blocker releases its dependant from the composition's own GitLab reads", async (t) => {
  const f = await fixture(t, { tracker: "gitlab", classification: "MULTI" });
  const before = await readFacts(f);
  assert.equal(before.current.facts.nodes.find((node) => node.issueId === f.dependantId).completionState, "NONE");

  // The blocker's implementation: a real worktree, a real candidate integrated into the target, and the
  // completion note published while the Issue is still open.
  const worktree = join(dirname(f.repository), "worktrees", "issue-blocker");
  mkdirSync(dirname(worktree), { recursive: true });
  git(f.repository, "worktree", "add", "-b", "issue/blocker", worktree, f.seal);
  writeFileSync(join(worktree, "blocker.txt"), "candidate\n");
  git(worktree, "add", "blocker.txt");
  git(worktree, "commit", "-m", "implement the blocker");
  const candidate = git(worktree, "rev-parse", "HEAD");
  git(f.repository, "merge", "--ff-only", "issue/blocker");
  f.addNote({
    iid: 2,
    id: 90,
    record: {
      kind: "implementation_complete",
      repositoryId: GITLAB_REPOSITORY_ID,
      issueId: f.blockerId,
      specId: f.specId,
      target: TARGET,
      targetWorktree: f.repository,
      topic: "issue/blocker",
      worktree,
      baseline: f.seal,
      candidate,
      planningSeal: f.seal,
      planningSealState: "reused",
      operationIdentity: deriveExecuteIssueOperationIdentity({
        repositoryId: GITLAB_REPOSITORY_ID,
        specId: f.specId,
        approvedPublicationIdentity: f.approvedScopeHash,
        issueId: f.blockerId,
      }),
      manualAttestations: [],
      workflowArtifacts: [],
      standards: "clean",
      spec: "clean",
      verification: [{ command: "node --test tests/ron-workflow/*.test.mjs", result: "PASS — fixture candidate verification" }],
      repairWaveCount: 0,
      worktreeState: "clean",
    },
  });

  const completed = await readFacts(f);
  const blocker = completed.current.facts.nodes.find((node) => node.issueId === f.blockerId);
  assert.equal(blocker.completionState, "COMPLETE");
  assert.equal(blocker.candidateReachable, true);
  assert.equal(blocker.worktreeState, "PRESENT");

  const composition = createNativeRunComposition({
    repository: f.repository,
    repositoryId: GITLAB_REPOSITORY_ID,
    specId: f.specId,
    runId: "workflow-op-v1-fixture",
    store: f.store,
    sources: f.sources,
    adapters: f.adapters,
    readReadyState: () => f.readyStateReadBack,
    readSubagentRun: () => ({ state: "ABSENT" }),
    now: () => AT,
  });
  const readPlan = async (at) => planNativeRound({
    round: await composition.readRound({ at }),
    at,
    agentCeiling: composition.agentCeiling,
    repositoryId: GITLAB_REPOSITORY_ID,
    approvedPublicationIdentity: f.approvedScopeHash,
  });

  // The release conditions are re-derived, never read from the producer's one-shot projection: while the
  // worktree is still registered and the Issue is still open, the dependant stays gated.
  const gated = await readPlan(AT);
  assert.equal(gated.frontier.gated.includes(f.dependantId), true, "the dependant stays gated while its blocker is open");
  assert.equal(gated.frontier.nodes.find((node) => node.issueId === f.dependantId).blockers[0].conditions.blockerClosed, false);
  assert.equal(gated.readyState.consulted, false, "the producer projection is never consulted");
  assert.deepEqual(gated.readyState.projection, f.readyStateReadBack);

  // Once the exact worktree is absent and the Issue is closed, the same reads release the dependant.
  git(f.repository, "worktree", "remove", "--force", worktree);
  rmSync(worktree, { recursive: true, force: true });
  f.closeIssue({ iid: 2 });
  const released = await readPlan("2026-09-18T06:05:00.000Z");
  assert.equal(released.frontier.ready.includes(f.dependantId), true, "the dependant is released");
  assert.deepEqual(released.frontier.gated, []);
  assert.deepEqual(released.frontier.unproven, []);
  const releaseEdge = released.frontier.nodes.find((node) => node.issueId === f.dependantId).blockers[0];
  assert.deepEqual(releaseEdge.conditions, { blockerClosed: true, candidateReachable: true, worktreeAbsent: true });
  const closed = (await readFacts(f)).current.facts.nodes.find((node) => node.issueId === f.blockerId);
  assert.equal(closed.trackerState, "CLOSED");
  assert.equal(closed.candidateReachable, true);
  assert.equal(closed.worktreeState, "ABSENT");
});

test("provider-neutral facts read through the existing Run store under the common Git directory", async (t) => {
  const f = await fixture(t, { tracker: "gitlab" });
  const writer = f.store.acquireWriter("workflow-op-v1-existing");
  writer.append({
    type: "grant.recorded",
    at: AT,
    runIdentity: {
      specId: f.specId,
      target: TARGET,
      classification: "MULTI",
      approvedScopeHash: bodyDigest(SPEC_BODY),
      decompositionIdentity: `${f.specId}#note_2`,
      runId: "workflow-op-v1-existing",
    },
    maxParallel: 3,
  });
  writer.release();

  const runs = await f.sources.sources.selector.listNonTerminalRuns({});
  assert.deepEqual(runs.map((run) => run.runIdentity.runId), ["workflow-op-v1-existing"]);

  const target = await f.sources.sources.target.read({ current: { runIdentity: { target: TARGET } } });
  assert.equal(target.head, git(f.repository, "rev-parse", TARGET));
  assert.equal(target.state, "CLEAN");

  const health = await f.sources.sources.writer.readHealth({
    current: { runIdentity: { target: TARGET } },
    leaseKind: "repository-close",
    owner: { operationId: "workflow-op-v1-existing", coordinatorInstanceId: "c", generation: 1 },
  });
  assert.ok(["HEALTHY", "INACTIVE", "UNKNOWN"].includes(health), `the writer health read must be the existing owner's, observed ${health}`);

  // No second journal, store, or lease kind: the common Git directory carries only the existing one.
  const control = readdirSync(join(f.repository, ".git", "matt-workflow-control")).sort();
  assert.ok(control.includes("runs"), "the existing Run store lives under the common Git directory");
  assert.deepEqual(control.filter((entry) => entry.startsWith("gitlab-") && !entry.startsWith("gitlab-producer")), []);
});

// ---------------------------------------------------------------------------------------------
// AC-1/AC-2 — the same Start command runs a GitLab Spec
// ---------------------------------------------------------------------------------------------

test("the same Start command reaches READY on a bound GitLab repository", async (t) => {
  const f = await fixture(t, { tracker: "gitlab", classification: "MULTI" });
  const started = await startRun({
    cwd: f.repository,
    // The GitLab locator shape: the native iid resolves inside the configured project.
    specId: "1",
    cacheDirectory: f.cacheDirectory,
    homeDir: f.agentRoot,
    transport: f.transport,
    readSubagentRun: () => ({ state: "ABSENT" }),
    readRecordedLanes: () => [],
    now: () => AT,
  });
  assert.equal(started.outcome, "READY", JSON.stringify(started.diagnosis ?? started.plan));
  assert.equal(started.specId, f.specId);
  assert.equal(started.target, TARGET);
  assert.equal(started.nativeLoop.repositoryId, GITLAB_REPOSITORY_ID);
  assert.equal(started.ready.state, "READY");
  assert.equal(started.reusedGrant, false);
  assert.deepEqual(started.plan.legalActions, ["dispatch_issue"]);
  assert.equal(started.plan.lanes.length, 1);
  assert.equal(started.plan.lanes[0].issueId, f.blockerId);
  assert.equal(started.plan.lanes[0].actionType, "dispatch_issue");
  assert.equal(started.plan.lanes[0].skill, "execute-issue");
  assert.equal(started.plan.readyState.consulted, false, "the producer projection is carried, never consulted");
  assert.deepEqual(started.plan.frontier.ready.includes(f.blockerId), true);

  // The Grant this Start recorded binds the GitLab Run identity and the same trusted package version,
  // and the GitLab Run id is derived from the GitLab repository identity.
  const journal = f.store.readEvents(started.runId);
  const grants = journal.filter(({ type }) => type === "grant.recorded");
  assert.equal(grants.length, 1);
  assert.equal(grants[0].runIdentity.repositoryId ?? started.nativeLoop.repositoryId, GITLAB_REPOSITORY_ID);
  assert.equal(grants[0].runIdentity.specId, f.specId);
  assert.equal(grants[0].workflowVersion.id, f.version.id);
  assert.equal(started.plan.maxParallel, 3);
  assert.deepEqual(f.writes, [], "Start performs no tracker mutation");
});
