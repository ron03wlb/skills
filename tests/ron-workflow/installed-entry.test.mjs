import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installWorkflow } from "../../skills/personal/run-issue-workflow/scripts/workflow-installation.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity, deriveRunOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";
import { bodyDigest, renderWorkflowRecord } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";

const scriptsPath = "skills/personal/run-issue-workflow/scripts";
const originalExec = childProcess.execFileSync;
const git = (root, ...args) => originalExec("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const initialize = root => {
  mkdirSync(root, { recursive: true });
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "core.autocrlf", "false");
};
const note = (node_id, record) => ({ node_id, created_at: "2026-09-08T00:00:00Z", author_association: "OWNER", body: renderWorkflowRecord(record) });
const closure = number => ({ node_id: `IE_closed_${number}`, event: "closed", created_at: "2026-09-08T00:02:00Z" });

// Real installed packages, Git, checkpoints, journals and reconciliation; only external CLI/host I/O is substituted.
function fixture({ legacyRuntime = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "installed-entry-")));
  const source = join(root, "source");
  const repository = join(root, "consumer");
  const cacheDirectory = join(root, "packages");
  initialize(source); initialize(repository);
  cpSync(fileURLToPath(new URL(`../../${scriptsPath}`, import.meta.url)), join(source, scriptsPath), { recursive: true });
  if (legacyRuntime) writeFileSync(join(source, scriptsPath, "codex-workflow.mjs"), "export async function runCodexWorkflow() { throw new Error('Legacy runtime must not execute an existing Run'); }\nexport const prepareCodexWorkflow = runCodexWorkflow;\n");
  writeFileSync(join(source, "skills/personal/run-issue-workflow/SKILL.md"), "Fixture package v1\n");
  git(source, "add", "skills"); git(source, "commit", "-m", "package v1");
  const install = () => installWorkflow({ sourceRepository: source, sourceCommit: git(source, "rev-parse", "HEAD"), cacheDirectory, skillDirectory: join(root, "entry") });
  const retained = install();
  git(repository, "remote", "add", "origin", "https://github.com/example/repo.git");
  mkdirSync(join(repository, "docs/agents"), { recursive: true });
  writeFileSync(join(repository, "docs/agents/workflow-host.json"), JSON.stringify({ schema: "codex-workflow-host:v1", repository: "example/repo" }));
  git(repository, "add", "docs"); git(repository, "commit", "-m", "baseline");
  const seal = git(repository, "rev-parse", "HEAD");
  const store = createRunStore({ gitCommonDir: join(repository, ".git") });
  const checkpoints = createWorkflowControlStore({ gitCommonDir: join(repository, ".git") });
  const issues = new Map();
  const taskStates = new Map();
  const readHooks = new Map();
  const calls = [];
  const host = {
    controls: { async connect() { return { async close() {} }; } },
    metrics: () => ({}),
    async call(name, args) {
      calls.push({ name, args });
      if (name.endsWith("list_projects")) return { projects: [{ id: "project", path: repository, isGitRepository: true, hostId: "local" }] };
      if (name.endsWith("open_in_codex")) return {};
      if (name.endsWith("read_thread")) return { thread: { id: args.threadId, hostId: "local", status: { type: taskStates.get(args.threadId) ?? "idle" } }, turns: [{ status: "completed", items: [] }] };
      assert.fail(`Unexpected native work: ${name}`);
    },
  };
  childProcess.execFileSync = (name, args, options) => {
    if (name !== "gh") return originalExec(name, args, options);
    if (args[0] === "issue" && args[1] === "view") {
      const issue = issues.get(Number(args[2]));
      return JSON.stringify({ id: issue.node_id, body: issue.body });
    }
    assert.equal(args[0], "api");
    if (args[1] === "graphql") {
      const id = args.find(arg => arg.startsWith("id=")).slice(3);
      const issue = [...issues.values()].find(issue => issue.node_id === id);
      return JSON.stringify({ data: { node: issue ? { id, number: issue.number, repository: { nameWithOwner: "example/repo" } } : null } });
    }
    const [, number, suffix = ""] = args[1].match(/^repos\/example\/repo\/issues\/(\d+)(.*)$/u) ?? [];
    assert.ok(number, `Unexpected tracker route: ${args[1]}`);
    const issue = issues.get(Number(number));
    if (!suffix) readHooks.get(issue.number)?.();
    const response = suffix.startsWith("/comments") ? issue.comments : suffix.startsWith("/events") ? issue.events : suffix.includes("blocked_by") ? (issue.blockers ?? []).map(id => ({ node_id: id }))
      : suffix === "/parent" ? { node_id: issue.parent } : issue;
    return JSON.stringify([response]);
  };
  syncBuiltinESMExports();
  const addCompleted = (number = 1, multi = false) => {
    const specId = `I_${number}`;
    const body = `Approved single Spec ${number}`;
    const authority = { specId, target: "main", planningSeal: seal, classification: multi ? "MULTI" : "SINGLE", approvedScopeHash: bodyDigest(body), decompositionIdentity: multi ? `IC_decomp_${number}` : null };
    const completion = (id, n) => note(`IC_done_${n}`, { kind: "implementation_complete", issueId: id, specId, target: "main", targetWorktree: repository,
      topic: `issue-${n}`, worktree: join(root, `absent-${n}`), baseline: seal, candidate: seal, planningSeal: seal,
      standards: "clean", spec: "clean", worktreeState: "clean", manualAttestations: [], workflowArtifacts: [],
      verification: [{ command: "fixture check", result: "passed" }] });
    const children = multi ? [number + 100, number + 200].map((n, index) => ({ node_id: `I_${n}`, number: n, parent: specId,
      body: `Part of ${specId}, child ${index}`, state: "closed", events: [closure(n)], blockers: index ? [`I_${number + 100}`] : [], comments: [completion(`I_${n}`, n)] })) : [];
    for (const child of children) issues.set(child.number, child);
    const decomposition = multi ? note(authority.decompositionIdentity, { kind: "decomposition:v1", parent: specId, target: "main", planningSeal: seal,
      approvedScopeHash: authority.approvedScopeHash, decompositionMapping: Object.fromEntries(children.map((child, i) => [`${number}/${i}`, child.node_id])),
      childBodyDigests: Object.fromEntries(children.map(child => [child.node_id, bodyDigest(child.body)])),
      blockerEdges: [{ blocker: children[0].node_id, blocked: children[1].node_id }], readyFrontier: [children[0].node_id] }) : null;
    const producerCommand = multi ? "to-tickets" : "to-spec";
    const identity = bindProducerCheckpointOperationIdentity({ repositoryId: "github:example/repo", specId, producerCommand, profileVersion: "v2", target: "main", baseline: seal,
      bindings: { approvedScopeIdentity: authority.approvedScopeHash, classification: authority.classification, planningSeal: seal,
        ...(multi ? { upstream: { publicationIdentity: `IC_pub_${number}`, handoffIdentity: `IC_upstream_${number}` } } : {}) } });
    const tx = checkpoints.createCheckpoint(identity);
    const stages = multi ? [
      ["decomposition.read_back", { decompositionIdentity: decomposition.node_id, decompositionDigest: bodyDigest(decomposition.body) }],
      ["ready_state.read_back", { frontier: [children[0].node_id] }],
      ["handoff.completed", { handoffIdentity: `IC_hand_${number}` }],
    ] : [
      ["planning_seal.read_back", { planningSeal: seal, state: "reused" }],
      ["publication.read_back", { publicationIdentity: `IC_pub_${number}`, trackerIdentity: specId }],
      ["handoff.completed", { handoffIdentity: `IC_hand_${number}` }],
    ];
    for (const [stage, receipt] of stages) checkpoints.advanceCheckpoint({ identity, stage, receipt });
    const issue = { node_id: specId, number, body, state: "closed", events: [closure(number)], comments: [
      note(`IC_pub_${number}`, { kind: "spec_publication", repositoryId: "github:example/repo", authority }),
      note(`IC_hand_${number}`, { kind: "producer_handoff", ...authority, producerCommand, checkpointIdentity: identity,
        transactionIdentity: tx.transactionId, publicationIdentity: `IC_pub_${number}`, trackerIdentity: specId,
        recordIdentities: multi ? [`IC_pub_${number}`, decomposition.node_id] : [`IC_pub_${number}`],
        ...(multi ? { upstreamPublicationIdentity: `IC_pub_${number}`, upstreamHandoffIdentity: `IC_upstream_${number}`,
          decompositionDigest: bodyDigest(decomposition.body), decompositionMapping: JSON.parse(decomposition.body.split("\n").slice(1, -1).join("\n")).decompositionMapping,
          blockerEdges: [{ blocker: children[0].node_id, blocked: children[1].node_id }],
          operationReceipt: { transactionIdentity: tx.transactionId, decompositionReadBack: stages[0][1], readyStateReadBack: stages[1][1] } } : {}) }),
      ...(multi ? [decomposition] : [completion(specId, number)]),
    ] };
    issues.set(number, issue);
    const { planningSeal: ignored, ...runFields } = authority;
    const runIdentity = { ...runFields, runId: deriveRunOperationIdentity({ repositoryId: "github:example/repo", specId, approvedPublicationIdentity: authority.approvedScopeHash }).key };
    const writer = store.acquireWriter(runIdentity.runId);
    writer.append({ type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity, maxParallel: 3, workflowVersion: retained.version });
    for (const member of multi ? children : [issue]) writer.append({ type: "dispatch.recorded", at: "2026-09-08T00:00:00.000Z", issueId: member.node_id,
      attempt: 1, taskRef: { threadId: `task-${member.number}`, hostId: "local" } });
    writer.release();
    return { issue, runIdentity };
  };
  return { root, source, repository, cacheDirectory, retained, store, issues, calls, host, taskStates, readHooks, addCompleted, install,
    async entry(options = {}) {
      const { runInstalledEntry } = await import(pathToFileURL(join(retained.root, scriptsPath, "installed-entry.mjs")).href);
      return runInstalledEntry({ repository, host, ...options });
    },
    async snapshot(runIdentity) {
      const { prepareCodexWorkflow } = await import(pathToFileURL(join(retained.root, scriptsPath, "codex-workflow.mjs")).href);
      const lane = await prepareCodexWorkflow({ repository, host, runIdentity, specId: runIdentity.specId, workflowVersion: retained.version, packageRoot: retained.root });
      try { return await lane.run({ mode: "snapshot" }); } finally { await lane.close(); }
    },
    close() { childProcess.execFileSync = originalExec; syncBuiltinESMExports(); rmSync(root, { recursive: true, force: true }); },
  };
}

test("explicit completed Spec re-entry preserves the original Run and Grant across a compatible package update", async () => {
  const f = fixture();
  try {
    const { runIdentity } = f.addCompleted();
    const first = await f.entry({ specId: "1", runId: runIdentity.runId });
    assert.equal(first.status.run.state, "SUCCEEDED", JSON.stringify(first.status));
    const prefix = f.store.readEvents(runIdentity.runId);
    writeFileSync(join(f.source, "skills/personal/run-issue-workflow/SKILL.md"), "Fixture package v2\n");
    git(f.source, "add", "skills"); git(f.source, "commit", "-m", "package v2");
    const current = f.install();
    const again = await f.entry({ specId: "1" });
    assert.equal(again.status.run.state, "SUCCEEDED", JSON.stringify(again.status));
    assert.equal(again.status.run.runId, runIdentity.runId);
    const events = f.store.readEvents(runIdentity.runId);
    assert.deepEqual(events.slice(0, prefix.length), prefix);
    assert.deepEqual(events.slice(prefix.length).map(({ type }) => type), ["runtime.observed"]);
    assert.deepEqual(events.at(-1).workflowVersion, current.version);
    assert.deepEqual(events[0].workflowVersion, f.retained.version);
    const manifestPath = join(current.root, ".workflow-version.json");
    const manifestBytes = readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes);
    manifest.version.sourceRepository = join(f.root, "foreign-current-source");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    try {
      const fallback = await f.entry({ specId: "I_1" });
      assert.equal(fallback.status.run.state, "SUCCEEDED");
      assert.deepEqual(f.store.readEvents(runIdentity.runId).at(-1).workflowVersion, f.retained.version, "returning to the verified retained runtime is observed too");
    } finally { writeFileSync(manifestPath, manifestBytes); }
    const restored = await f.entry({ specId: "1" });
    assert.equal(restored.status.run.state, "SUCCEEDED");
    assert.deepEqual(f.store.readEvents(runIdentity.runId).filter(({ type }) => type === "runtime.observed").map(({ workflowVersion }) => workflowVersion),
      [current.version, f.retained.version, current.version]);
    assert.equal(f.store.listRunIds().length, 1);
    assert.equal(git(f.repository, "status", "--porcelain=v1"), "");
    assert.ok(f.calls.every(({ name }) => !/create_thread|send_message|wait_threads/u.test(name)));
  } finally { f.close(); }
});

test("a mixed installed batch observes the existing active worker while retaining completed members", async () => {
  const f = fixture();
  try {
    const completed = f.addCompleted();
    await f.entry({ specId: "1" });
    const active = f.addCompleted(2);
    const completion = active.issue.comments.pop();
    active.issue.state = "open";
    active.issue.events = [];
    f.taskStates.set("task-2", "active");
    let observations = 0;
    f.readHooks.set(2, () => {
      if (++observations === 4) {
        active.issue.state = "closed";
        active.issue.comments.push(completion);
        f.taskStates.delete("task-2");
      }
    });
    const before = [completed, active].map(({ runIdentity }) => f.store.readEvents(runIdentity.runId));
    const result = await f.entry({ specIds: ["1", "2"], maxWorkers: 1 });
    assert.equal(result.state, "SUCCEEDED", JSON.stringify(result));
    assert.ok(observations >= 4);
    assert.deepEqual([completed, active].map(({ runIdentity }) => f.store.readEvents(runIdentity.runId)), before);
    assert.ok(f.calls.every(({ name }) => !/create_thread|send_message|wait_threads/u.test(name)));
  } finally { f.close(); }
});

test("an explicit Run alone cannot bypass the current canonical operation identity", async () => {
  const f = fixture();
  try {
    const { runIdentity } = f.addCompleted();
    const wrongRun = `workflow-op-v1-${"0".repeat(64)}`;
    const { schema, sequence, ...grant } = f.store.readEvents(runIdentity.runId)[0];
    const writer = f.store.acquireWriter(wrongRun);
    writer.append({ ...grant, runIdentity: { ...runIdentity, runId: wrongRun } });
    writer.release();
    const before = f.store.readEvents(wrongRun);
    const result = await f.entry({ runId: wrongRun });
    assert.equal(result.state, "UNAVAILABLE", JSON.stringify(result));
    assert.deepEqual(f.store.readEvents(wrongRun), before);
    assert.equal(f.calls.length, 0);
  } finally { f.close(); }
});

test("installed selection retains current scope, native identity, batch ownership and discovery gates", async t => {
  const f = fixture();
  try {
    assert.deepEqual(await f.entry(), { state: "SELECTION_REQUIRED", runs: [] });
    assert.equal((await f.entry({ runId: "missing-run" })).state, "UNAVAILABLE");
    const single = f.addCompleted();
    await f.entry({ specId: "1", runId: single.runIdentity.runId });
    await t.test("native identity reconciles completed authority without repeating work", async () => {
      const before = f.store.readEvents(single.runIdentity.runId);
      const result = await f.entry({ specId: "I_1" });
      assert.equal(result.status.run.state, "SUCCEEDED");
      assert.deepEqual(f.store.readEvents(single.runIdentity.runId), before);
      assert.equal((await f.entry()).state, "SELECTION_REQUIRED", "completed Runs are not no-argument candidates");
    });
    const multi = f.addCompleted(2, true);
    const other = f.addCompleted(3);
    await t.test("no-argument discovery rejects multiple and accepts one non-terminal projection", async () => {
      assert.equal((await f.entry()).state, "SELECTION_REQUIRED");
      const explicit = await f.entry({ specId: "2" });
      assert.equal(explicit.status.run.state, "SUCCEEDED", JSON.stringify(explicit.status));
      assert.equal(explicit.status.run.classification, "MULTI");
      assert.deepEqual(explicit.status.nodes.map(node => node.blockers), [[], ["I_102"]]);
      const unique = await f.entry();
      assert.equal(unique.status.run.runId, other.runIdentity.runId);
      assert.equal(unique.status.run.state, "SUCCEEDED");
    });
    await t.test("explicit numeric/native completed batch retains independent Run IDs and journals", async () => {
      const before = [single, multi].map(({ runIdentity }) => f.store.readEvents(runIdentity.runId));
      const result = await f.entry({ specIds: ["1", "I_2"], maxWorkers: 1 });
      assert.equal(result.state, "SUCCEEDED", JSON.stringify(result));
      assert.deepEqual(result.runs.map(({ run }) => run.runId), [single.runIdentity.runId, multi.runIdentity.runId]);
      assert.deepEqual([single, multi].map(({ runIdentity }) => f.store.readEvents(runIdentity.runId)), before);
      await assert.rejects(f.entry({ specIds: ["1", "I_1"] }), /distinct Specs/u);
    });
    await t.test("explicit Run mismatch and changed numeric/native scope preserve original authority", async () => {
      const before = f.store.readEvents(single.runIdentity.runId);
      assert.equal((await f.entry({ specId: "2", runId: single.runIdentity.runId })).state, "UNAVAILABLE");
      const body = single.issue.body;
      single.issue.body = "Changed unapproved scope";
      try {
        for (const specId of ["1", "I_1"]) {
          assert.equal((await f.entry({ specId, runId: single.runIdentity.runId })).state, "UNAVAILABLE");
          const result = await f.entry({ specId });
          assert.equal(result.status.run.state, "BLOCKED");
          assert.ok(result.status.diagnoses.some(({ reasonCode }) => reasonCode === "tracker_authority_conflict"));
        }
      } finally { single.issue.body = body; }
      assert.deepEqual(f.store.readEvents(single.runIdentity.runId), before);
      assert.equal(f.store.listRunIds().length, 3);
    });
    await t.test("an unavailable batch member cannot manufacture completion in another", async () => {
      const body = multi.issue.body;
      multi.issue.body = "Changed unapproved Multi scope";
      try {
        const result = await f.entry({ specIds: ["1", "2"] });
        assert.equal(result.state, "PRESERVED");
        assert.deepEqual(result.runs.map(({ run }) => run.state), ["SUCCEEDED", "BLOCKED"]);
      } finally { multi.issue.body = body; }
    });
    await t.test("changed completion observations do not replay a completed Run's close action", async () => {
      const before = f.calls.length;
      single.issue.state = "open";
      try {
        const result = await f.entry({ specIds: ["1", "2"] });
        assert.equal(result.state, "PRESERVED");
        assert.equal(result.runs[0].run.state, "BLOCKED");
        assert.equal(result.runs[1].run.state, "SUCCEEDED");
        const retry = await f.entry({ specId: "1" });
        assert.equal(retry.status.run.state, "BLOCKED", "re-entry retains the contradiction until owner evidence agrees");
        assert.ok(f.calls.slice(before).every(({ name }) => !/create_thread|send_message|wait_threads/u.test(name)), "completed selection must reconcile without replay");
      } finally { single.issue.state = "closed"; }
    });
    await t.test("ambiguous same-scope journals require selection without granting new authority", async () => {
      const writer = f.store.acquireWriter("legacy-duplicate");
      const { schema, sequence, ...grant } = f.store.readEvents(single.runIdentity.runId)[0];
      writer.append({ ...grant,
        runIdentity: { ...single.runIdentity, runId: "legacy-duplicate" } });
      writer.release();
      const before = f.store.readEvents(single.runIdentity.runId);
      assert.equal((await f.entry({ specId: "1" })).state, "SELECTION_REQUIRED");
      assert.deepEqual(f.store.readEvents(single.runIdentity.runId), before);
    });
    assert.ok(f.calls.every(({ name }) => !/create_thread|send_message|wait_threads/u.test(name)));
    assert.equal(git(f.repository, "status", "--porcelain=v1"), "");
  } finally { f.close(); }
});

test("completed replay gates rebuild from owner history across disposable snapshots and temporary blockers", async t => {
  const f = fixture();
  try {
    const single = f.addCompleted();
    const multi = f.addCompleted(2, true);
    const journal = f.store.readEvents(single.runIdentity.runId);
    const snapshotPath = join(f.repository, ".git/matt-workflow-control/runs", single.runIdentity.runId, "status.json");
    await f.entry({ specId: "1" });
    await t.test("a deleted success snapshot cannot replay a reopened member", async () => {
      rmSync(snapshotPath);
      single.issue.state = "open";
      const result = await f.snapshot(single.runIdentity);
      assert.equal(result.run.state, "BLOCKED");
      assert.deepEqual(result.legalActions, []);
      assert.ok(result.diagnoses.some(d => d.resumePredicates.includes("resolve_contradiction:completed_run_evidence_changed")));
      assert.equal((await f.entry({ specId: "1" })).status.run.state, "BLOCKED");
    });
    await t.test("dirty-to-clean target observations retain the same replay gate", async () => {
      single.issue.state = "closed";
      await f.entry({ specId: "1" });
      single.issue.state = "open";
      const dirtyPath = join(f.repository, "unrelated.txt");
      writeFileSync(dirtyPath, "preserved target work\n");
      try { assert.equal((await f.entry({ specId: "1" })).status.run.state, "BLOCKED"); }
      finally { rmSync(dirtyPath); }
      const result = await f.snapshot(single.runIdentity);
      assert.equal(result.run.state, "BLOCKED");
      assert.deepEqual(result.legalActions, []);
      assert.equal((await f.entry({ specId: "1" })).status.run.state, "BLOCKED");
    });
    await t.test("a completed parent cannot repeat closeout without a prior snapshot", async () => {
      multi.issue.state = "open";
      const result = await f.snapshot(multi.runIdentity);
      assert.equal(result.run.state, "BLOCKED");
      assert.deepEqual(result.legalActions, []);
      assert.equal((await f.entry({ specId: "2" })).status.run.state, "BLOCKED");
    });
    await t.test("unreadable or unordered closure evidence cannot authorize progress", async () => {
      const events = single.issue.events;
      const publication = single.issue.comments[0];
      const createdAt = publication.created_at;
      try {
        for (const history of [null, [{ ...closure(1), created_at: "unknown" }]]) {
          single.issue.events = history;
          const result = await f.snapshot(single.runIdentity);
          assert.equal(result.run.state, "BLOCKED");
          assert.deepEqual(result.legalActions, []);
        }
        single.issue.events = events;
        delete publication.created_at;
        assert.equal((await f.snapshot(single.runIdentity)).run.state, "BLOCKED");
      } finally { single.issue.events = events; publication.created_at = createdAt; }
    });
    await t.test("closure before the current publication does not fence a current partial close", async () => {
      single.issue.events = [{ ...closure(1), created_at: "2026-09-07T00:00:00Z" }];
      const result = await f.snapshot(single.runIdentity);
      assert.deepEqual(result.legalActions, [{ type: "close_issue", issueId: "I_1" }]);
    });
    assert.deepEqual(f.store.readEvents(single.runIdentity.runId), journal);
    assert.ok(f.calls.every(({ name }) => !/create_thread|send_message|wait_threads/u.test(name)));
    assert.equal(git(f.repository, "status", "--porcelain=v1"), "");
  } finally { f.close(); }
});

test("a newer entry requires completed re-entry support in the selected runtime", async () => {
  const f = fixture({ legacyRuntime: true });
  try {
    const { issue, runIdentity } = f.addCompleted();
    const journal = f.store.readEvents(runIdentity.runId);
    cpSync(fileURLToPath(new URL(`../../${scriptsPath}`, import.meta.url)), join(f.source, scriptsPath), { recursive: true });
    git(f.source, "add", "skills"); git(f.source, "commit", "-m", "current runtime with completed re-entry reconciliation");
    const current = f.install();
    const { runInstalledEntry } = await import(pathToFileURL(join(current.root, scriptsPath, "installed-entry.mjs")).href);
    const skillPath = join(current.root, "skills/personal/run-issue-workflow/SKILL.md");
    const skillBytes = readFileSync(skillPath);
    issue.state = "open";
    writeFileSync(skillPath, "modified current package\n");
    try {
      const result = await runInstalledEntry({ repository: f.repository, host: f.host, specId: "1" });
      assert.equal(result.state, "UNAVAILABLE");
      assert.match(result.recovery, /Restore this exact trusted package/u);
      assert.deepEqual(f.store.readEvents(runIdentity.runId), journal);
      assert.deepEqual(f.calls, [], "recovery precedes runtime invocation and host calls even without a terminal snapshot");
    } finally { writeFileSync(skillPath, skillBytes); }
    issue.state = "closed";
    const restored = await runInstalledEntry({ repository: f.repository, host: f.host, specId: "I_1" });
    assert.equal(restored.status.run.state, "SUCCEEDED");
    assert.deepEqual(f.store.readEvents(runIdentity.runId).slice(0, journal.length), journal);
    assert.deepEqual(f.store.readEvents(runIdentity.runId).at(-1).workflowVersion, current.version);
    installWorkflow({ sourceRepository: f.source, sourceCommit: f.retained.version.sourceCommit,
      cacheDirectory: f.cacheDirectory, skillDirectory: join(f.root, "entry") });
    issue.state = "open";
    const beforeDowngrade = f.store.readEvents(runIdentity.runId);
    const callsBefore = f.calls.length;
    const downgraded = await runInstalledEntry({ repository: f.repository, host: f.host, specId: "1" });
    assert.equal(downgraded.state, "UNAVAILABLE", "verified source/protocol alone cannot prove completed re-entry support");
    assert.match(downgraded.recovery, /compatible/u);
    assert.deepEqual(f.store.readEvents(runIdentity.runId), beforeDowngrade);
    assert.equal(f.calls.length, callsBefore);
    assert.ok(f.calls.every(({ name }) => !/create_thread|send_message|wait_threads/u.test(name)));
  } finally { f.close(); }
});

test("recorded package failures preserve evidence and STOPPED re-entry never renews authority", async t => {
  const f = fixture();
  try {
    const { runIdentity } = f.addCompleted();
    const prefix = f.store.readEvents(runIdentity.runId);
    const entry = join(f.retained.root, scriptsPath, "installed-entry.mjs");
    const manifestPath = join(f.retained.root, ".workflow-version.json");
    const catalogPath = join(f.cacheDirectory, "installation.json");
    const packageBytes = readFileSync(entry);
    const manifestBytes = readFileSync(manifestPath);
    const catalogBytes = readFileSync(catalogPath);
    await import(pathToFileURL(entry).href);
    for (const fault of ["missing", "modified", "incompatible", "foreign-source"]) {
      await t.test(`${fault} recorded package returns explicit recovery before runtime calls`, async () => {
        if (fault === "missing") renameSync(entry, `${entry}.preserved`);
        if (fault === "modified") writeFileSync(entry, "throw new Error('modified package must not execute');\n");
        if (["incompatible", "foreign-source"].includes(fault)) {
          const manifest = JSON.parse(manifestBytes);
          if (fault === "incompatible") manifest.version.protocolVersion = 2;
          else manifest.version.sourceRepository = join(f.root, "foreign");
          writeFileSync(manifestPath, JSON.stringify(manifest));
        }
        try {
          // Import the public entry before damaging its own file; ESM retains only the test harness handle.
          const result = await f.entry({ specId: "I_1" });
          assert.equal(result.state, "UNAVAILABLE", JSON.stringify(result));
          assert.match(result.recovery, /Restore this exact trusted package/u);
          assert.deepEqual(f.store.readEvents(runIdentity.runId), prefix);
          assert.equal(f.calls.length, 0);
        } finally {
          if (fault === "missing") renameSync(`${entry}.preserved`, entry);
          writeFileSync(entry, packageBytes); writeFileSync(manifestPath, manifestBytes); writeFileSync(catalogPath, catalogBytes);
        }
      });
    }
    await t.test("STOPPED keeps the original Grant and remains excluded from no-argument entry", async () => {
      f.issues.get(1).state = "open";
      f.issues.get(1).events = [];
      f.issues.get(1).comments.pop();
      const writer = f.store.acquireWriter(runIdentity.runId);
      writer.append({ type: "control.revised", at: "2026-09-08T00:01:00.000Z", revision: 1, command: "STOP" });
      writer.append({ type: "stop.transitioned", at: "2026-09-08T00:01:01.000Z", revision: 1 });
      writer.release();
      const before = f.store.readEvents(runIdentity.runId);
      const result = await f.entry({ specId: "1" });
      assert.equal(result.status.run.state, "STOPPED", JSON.stringify(result.status));
      assert.deepEqual(f.store.readEvents(runIdentity.runId), before);
      assert.equal((await f.entry()).state, "SELECTION_REQUIRED");
    });
  } finally { f.close(); }
});
