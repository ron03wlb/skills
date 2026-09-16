import assert from "node:assert/strict";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  installWorkflow,
  readWorkflowInstallationEvidence,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-installation.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import {
  bindProducerCheckpointOperationIdentity,
  deriveRunOperationIdentity,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";
import {
  bodyDigest,
  renderWorkflowRecord,
} from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { runWorkflowCommand } from "../../skills/personal/run-issue-workflow/scripts/workflow-command.mjs";

const scriptsPath = "skills/personal/run-issue-workflow/scripts";
const git = (root, ...args) =>
  runWorkflowCommand("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const initialize = (root) => {
  mkdirSync(root, { recursive: true });
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "core.autocrlf", "false");
};
const note = (node_id, record) => ({
  node_id,
  created_at: "2026-09-08T00:00:00Z",
  author_association: "OWNER",
  body: renderWorkflowRecord(record),
});
const closure = (number) => ({
  node_id: `IE_closed_${number}`,
  event: "closed",
  created_at: "2026-09-08T00:02:00Z",
});

// Real installed packages, Git, checkpoints, journals and reconciliation; only external CLI/host I/O is substituted.
function fixture({ legacyRuntime = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "installed-entry-")));
  const source = join(root, "source");
  const repository = join(root, "consumer");
  const cacheDirectory = join(root, "packages");
  initialize(source);
  initialize(repository);
  cpSync(
    fileURLToPath(new URL(`../../${scriptsPath}`, import.meta.url)),
    join(source, scriptsPath),
    { recursive: true },
  );
  const verificationPath =
    "skills/engineering/execute-issue/scripts/verification-cache.mjs";
  mkdirSync(join(source, "skills/engineering/execute-issue/scripts"), {
    recursive: true,
  });
  cpSync(
    fileURLToPath(new URL(`../../${verificationPath}`, import.meta.url)),
    join(source, verificationPath),
  );
  const closeScriptsPath = "skills/engineering/close-issue/scripts";
  mkdirSync(join(source, closeScriptsPath), { recursive: true });
  cpSync(
    fileURLToPath(new URL(`../../${closeScriptsPath}`, import.meta.url)),
    join(source, closeScriptsPath),
    { recursive: true },
  );
  const referencesPath = "skills/personal/run-issue-workflow/references";
  mkdirSync(join(source, referencesPath), { recursive: true });
  cpSync(
    fileURLToPath(
      new URL(`../../${referencesPath}/codex-host-driver.md`, import.meta.url),
    ),
    join(source, referencesPath, "codex-host-driver.md"),
  );
  if (legacyRuntime)
    writeFileSync(
      join(source, scriptsPath, "codex-workflow.mjs"),
      `${legacyRuntime === "recovery-v0" ? "export const supportsCompletedRunReentry = true;\n" : ""}export async function runCodexWorkflow() { throw new Error('Legacy runtime must not execute an existing Run'); }\nexport const prepareCodexWorkflow = runCodexWorkflow;\n`,
    );
  writeFileSync(
    join(source, "skills/personal/run-issue-workflow/SKILL.md"),
    "Fixture package v1\n",
  );
  git(source, "add", "skills");
  git(source, "commit", "-m", "package v1");
  const install = () =>
    installWorkflow({
      sourceRepository: source,
      sourceCommit: git(source, "rev-parse", "HEAD"),
      cacheDirectory,
      skillDirectory: join(root, "entry"),
    });
  const retained = install();
  git(
    repository,
    "remote",
    "add",
    "origin",
    "https://github.com/example/repo.git",
  );
  mkdirSync(join(repository, "docs/agents"), { recursive: true });
  writeFileSync(
    join(repository, "docs/agents/workflow-host.json"),
    JSON.stringify({
      schema: "codex-workflow-host:v1",
      repository: "example/repo",
    }),
  );
  git(repository, "add", "docs");
  git(repository, "commit", "-m", "baseline");
  const seal = git(repository, "rev-parse", "HEAD");
  const store = createRunStore({ gitCommonDir: join(repository, ".git") });
  const checkpoints = createWorkflowControlStore({
    gitCommonDir: join(repository, ".git"),
  });
  const issues = new Map();
  const taskStates = new Map();
  const readHooks = new Map();
  const calls = [];
  const commandCalls = [];
  const commandRunner = (name, args, options) => {
    commandCalls.push({ name, args: [...args] });
    if (name !== "gh") return runWorkflowCommand(name, args, options);
    if (args[0] === "issue" && args[1] === "view") {
      const issue = issues.get(Number(args[2]));
      return JSON.stringify({ id: issue.node_id, body: issue.body });
    }
    assert.equal(args[0], "api");
    if (args[1] === "graphql") {
      const id = args.find((arg) => arg.startsWith("id=")).slice(3);
      const issue = [...issues.values()].find((issue) => issue.node_id === id);
      return JSON.stringify({
        data: {
          node: issue
            ? {
                id,
                number: issue.number,
                repository: { nameWithOwner: "example/repo" },
              }
            : null,
        },
      });
    }
    const [, number, suffix = ""] =
      args[1].match(/^repos\/example\/repo\/issues\/(\d+)(.*)$/u) ?? [];
    assert.ok(number, `Unexpected tracker route: ${args[1]}`);
    const issue = issues.get(Number(number));
    if (!suffix) readHooks.get(issue.number)?.();
    let response = issue;
    if (suffix.startsWith("/comments")) response = issue.comments;
    else if (suffix.startsWith("/events")) response = issue.events;
    else if (suffix.includes("blocked_by"))
      response = (issue.blockers ?? []).map((id) => ({ node_id: id }));
    else if (suffix === "/parent") response = { node_id: issue.parent };
    return JSON.stringify([response]);
  };
  const host = {
    controls: {
      async connect() {
        return { async close() {} };
      },
    },
    metrics: () => ({}),
    async call(name, args) {
      calls.push({ name, args });
      if (name.endsWith("list_projects"))
        return {
          projects: [
            {
              id: "project",
              path: repository,
              isGitRepository: true,
              hostId: "local",
            },
          ],
        };
      if (name.endsWith("open_in_codex")) return {};
      if (name.endsWith("read_thread"))
        return {
          thread: {
            id: args.threadId,
            hostId: "local",
            status: { type: taskStates.get(args.threadId) ?? "idle" },
          },
          turns: [{ status: "completed", items: [] }],
        };
      assert.fail(`Unexpected native work: ${name}`);
    },
  };
  const addCompleted = (
    number = 1,
    multi = false,
    recordRun = true,
    workflowVersion = retained.version,
  ) => {
    const specId = `I_${number}`;
    const body = `Approved single Spec ${number}`;
    const authority = {
      specId,
      target: "main",
      planningSeal: seal,
      classification: multi ? "MULTI" : "SINGLE",
      approvedScopeHash: bodyDigest(body),
      decompositionIdentity: multi ? `IC_decomp_${number}` : null,
    };
    const completion = (id, n) =>
      note(`IC_done_${n}`, {
        kind: "implementation_complete",
        issueId: id,
        specId,
        target: "main",
        targetWorktree: repository,
        topic: `issue-${n}`,
        worktree: join(root, `absent-${n}`),
        baseline: seal,
        candidate: seal,
        planningSeal: seal,
        standards: "clean",
        spec: "clean",
        worktreeState: "clean",
        manualAttestations: [],
        workflowArtifacts: [],
        verification: [{ command: "fixture check", result: "passed" }],
      });
    const children = multi
      ? [number + 100, number + 200].map((n, index) => ({
          node_id: `I_${n}`,
          number: n,
          parent: specId,
          body: `Part of ${specId}, child ${index}`,
          state: "closed",
          events: [closure(n)],
          blockers: index ? [`I_${number + 100}`] : [],
          comments: [completion(`I_${n}`, n)],
        }))
      : [];
    for (const child of children) issues.set(child.number, child);
    const decomposition = multi
      ? note(authority.decompositionIdentity, {
          kind: "decomposition:v1",
          parent: specId,
          target: "main",
          planningSeal: seal,
          approvedScopeHash: authority.approvedScopeHash,
          decompositionMapping: Object.fromEntries(
            children.map((child, i) => [`${number}/${i}`, child.node_id]),
          ),
          childBodyDigests: Object.fromEntries(
            children.map((child) => [child.node_id, bodyDigest(child.body)]),
          ),
          blockerEdges: [
            { blocker: children[0].node_id, blocked: children[1].node_id },
          ],
          readyFrontier: [children[0].node_id],
        })
      : null;
    const producerCommand = multi ? "to-tickets" : "to-spec";
    const identity = bindProducerCheckpointOperationIdentity({
      repositoryId: "github:example/repo",
      specId,
      producerCommand,
      profileVersion: "v2",
      target: "main",
      baseline: seal,
      bindings: {
        approvedScopeIdentity: authority.approvedScopeHash,
        classification: authority.classification,
        planningSeal: seal,
        ...(multi
          ? {
              upstream: {
                publicationIdentity: `IC_pub_${number}`,
                handoffIdentity: `IC_upstream_${number}`,
              },
            }
          : {}),
      },
    });
    const tx = checkpoints.createCheckpoint(identity);
    const stages = multi
      ? [
          [
            "decomposition.read_back",
            {
              decompositionIdentity: decomposition.node_id,
              decompositionDigest: bodyDigest(decomposition.body),
            },
          ],
          ["ready_state.read_back", { frontier: [children[0].node_id] }],
          ["handoff.completed", { handoffIdentity: `IC_hand_${number}` }],
        ]
      : [
          ["planning_seal.read_back", { planningSeal: seal, state: "reused" }],
          [
            "publication.read_back",
            {
              publicationIdentity: `IC_pub_${number}`,
              trackerIdentity: specId,
            },
          ],
          ["handoff.completed", { handoffIdentity: `IC_hand_${number}` }],
        ];
    for (const [stage, receipt] of stages)
      checkpoints.advanceCheckpoint({ identity, stage, receipt });
    const issue = {
      node_id: specId,
      number,
      body,
      state: "closed",
      events: [closure(number)],
      comments: [
        note(`IC_pub_${number}`, {
          kind: "spec_publication",
          repositoryId: "github:example/repo",
          authority,
        }),
        note(`IC_hand_${number}`, {
          kind: "producer_handoff",
          ...authority,
          producerCommand,
          checkpointIdentity: identity,
          transactionIdentity: tx.transactionId,
          publicationIdentity: `IC_pub_${number}`,
          trackerIdentity: specId,
          recordIdentities: multi
            ? [`IC_pub_${number}`, decomposition.node_id]
            : [`IC_pub_${number}`],
          ...(multi
            ? {
                upstreamPublicationIdentity: `IC_pub_${number}`,
                upstreamHandoffIdentity: `IC_upstream_${number}`,
                decompositionDigest: bodyDigest(decomposition.body),
                decompositionMapping: JSON.parse(
                  decomposition.body.split("\n").slice(1, -1).join("\n"),
                ).decompositionMapping,
                blockerEdges: [
                  {
                    blocker: children[0].node_id,
                    blocked: children[1].node_id,
                  },
                ],
                operationReceipt: {
                  transactionIdentity: tx.transactionId,
                  decompositionReadBack: stages[0][1],
                  readyStateReadBack: stages[1][1],
                },
              }
            : {}),
        }),
        ...(multi ? [decomposition] : [completion(specId, number)]),
      ],
    };
    issues.set(number, issue);
    const { planningSeal: _ignored, ...runFields } = authority;
    const runIdentity = {
      ...runFields,
      runId: deriveRunOperationIdentity({
        repositoryId: "github:example/repo",
        specId,
        approvedPublicationIdentity: authority.approvedScopeHash,
      }).key,
    };
    if (recordRun) {
      const writer = store.acquireWriter(runIdentity.runId);
      writer.append({
        type: "grant.recorded",
        at: "2026-09-08T00:00:00.000Z",
        runIdentity,
        maxParallel: 3,
        workflowVersion,
      });
      for (const member of multi ? children : [issue])
        writer.append({
          type: "dispatch.recorded",
          at: "2026-09-08T00:00:00.000Z",
          issueId: member.node_id,
          attempt: 1,
          taskRef: { threadId: `task-${member.number}`, hostId: "local" },
        });
      writer.release();
    }
    return { issue, runIdentity };
  };
  return {
    root,
    source,
    repository,
    cacheDirectory,
    retained,
    store,
    issues,
    calls,
    commandCalls,
    commandRunner,
    host,
    taskStates,
    readHooks,
    addCompleted,
    install,
    async entry(options = {}) {
      const { runInstalledEntry } = await import(
        pathToFileURL(join(retained.root, scriptsPath, "installed-entry.mjs"))
          .href
      );
      return runInstalledEntry({ repository, host, commandRunner, ...options });
    },
    async snapshot(runIdentity) {
      const { prepareCodexWorkflow } = await import(
        pathToFileURL(join(retained.root, scriptsPath, "codex-workflow.mjs"))
          .href
      );
      const lane = await prepareCodexWorkflow({
        repository,
        host,
        runIdentity,
        specId: runIdentity.specId,
        workflowVersion: retained.version,
        packageRoot: retained.root,
        commandRunner,
      });
      try {
        return await lane.run({ mode: "snapshot" });
      } finally {
        await lane.close();
      }
    },
    close() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("installed packages bind a newly authorized model policy and contain its executable owners", async () => {
  const f = fixture();
  try {
    const { runIdentity } = f.addCompleted(1, false, false);
    const policyOwner = await import(
      pathToFileURL(
        join(f.retained.root, scriptsPath, "issue-model-policy.mjs"),
      ).href
    );
    const repairOwner = await import(
      pathToFileURL(
        join(f.retained.root, scriptsPath, "model-repair-evidence.mjs"),
      ).href
    );
    assert.equal(typeof repairOwner.validateRepairYield, "function");
    const policy = {
      version: policyOwner.ISSUE_MODEL_POLICY_VERSION,
      specId: runIdentity.specId,
      target: runIdentity.target,
      approvedScopeHash: runIdentity.approvedScopeHash,
      authorization:
        "Approved Terra/Sol/Astra pool and one bounded upgrade for this exact scope",
    };
    const first = await f.entry({ specId: "1", modelRouting: { policy } });
    assert.equal(
      first.status.run.state,
      "SUCCEEDED",
      JSON.stringify(first.status),
    );
    assert.ok(
      f.commandCalls.some(
        ({ name, args }) =>
          name === "gh" && args[1] === "repos/example/repo/issues/1",
      ),
    );
    assert.ok(
      f.commandCalls.some(
        ({ name, args }) =>
          name === "gh" &&
          args[1] === "repos/example/repo/issues/1/comments?per_page=100",
      ),
    );
    assert.deepEqual(first.workflowRuntime.packageVersion, f.retained.version);
    assert.equal(first.workflowRuntime.packageRoot, f.retained.root);
    assert.match(
      first.workflowRuntime.manifestSha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.deepEqual(
      f.store.readEvents(runIdentity.runId).map(({ type }) => type),
      ["grant.recorded"],
      "a historical completion without an exact task dispatch cannot manufacture delivery progression",
    );
    assert.deepEqual(
      f.store.readEvents(runIdentity.runId)[0].modelPolicy,
      policy,
    );
    await f.entry({ specId: "1" });
    assert.deepEqual(
      f.store.readEvents(runIdentity.runId)[0].modelPolicy,
      policy,
      "terminal re-entry preserves membership without repeating the input",
    );
    assert.ok(
      f.calls.every(({ name }) => !/create_thread|send_message/u.test(name)),
    );
  } finally {
    f.close();
  }
});

test("explicit completed Spec re-entry preserves the original Run and Grant across a compatible package update", async () => {
  const f = fixture();
  try {
    const { runIdentity } = f.addCompleted();
    const first = await f.entry({ specId: "1", runId: runIdentity.runId });
    assert.equal(
      first.status.run.state,
      "SUCCEEDED",
      JSON.stringify(first.status),
    );
    const prefix = f.store.readEvents(runIdentity.runId);
    writeFileSync(
      join(f.source, "skills/personal/run-issue-workflow/SKILL.md"),
      "Fixture package v2\n",
    );
    git(f.source, "add", "skills");
    git(f.source, "commit", "-m", "package v2");
    const current = f.install();
    const again = await f.entry({
      specId: "1",
      modelRouting: {
        policy: {
          version: "issue-model-policy:v1",
          specId: runIdentity.specId,
          target: runIdentity.target,
          approvedScopeHash: runIdentity.approvedScopeHash,
          authorization:
            "New model policy requested after this legacy Run already existed",
        },
      },
    });
    assert.equal(
      again.status.run.state,
      "SUCCEEDED",
      JSON.stringify(again.status),
    );
    assert.deepEqual(again.workflowRuntime.packageVersion, current.version);
    assert.equal(again.workflowRuntime.packageRoot, current.root);
    assert.equal(again.status.run.runId, runIdentity.runId);
    const events = f.store.readEvents(runIdentity.runId);
    assert.deepEqual(events.slice(0, prefix.length), prefix);
    assert.deepEqual(
      events.slice(prefix.length).map(({ type }) => type),
      ["runtime.observed"],
    );
    assert.deepEqual(events.at(-1).workflowVersion, current.version);
    assert.deepEqual(events[0].workflowVersion, f.retained.version);
    assert.equal(
      events[0].modelPolicy,
      undefined,
      "a new runtime and input never enroll a legacy Run",
    );
    const manifestPath = join(current.root, ".workflow-version.json");
    const manifestBytes = readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes);
    manifest.version.sourceRepository = join(f.root, "foreign-current-source");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    try {
      const fallback = await f.entry({ specId: "I_1" });
      assert.equal(fallback.status.run.state, "SUCCEEDED");
      assert.deepEqual(
        fallback.workflowRuntime.packageVersion,
        f.retained.version,
      );
      assert.deepEqual(
        f.store.readEvents(runIdentity.runId).at(-1).workflowVersion,
        f.retained.version,
        "returning to the verified retained runtime is observed too",
      );
    } finally {
      writeFileSync(manifestPath, manifestBytes);
    }
    const restored = await f.entry({ specId: "1" });
    assert.equal(restored.status.run.state, "SUCCEEDED");
    assert.deepEqual(restored.workflowRuntime.packageVersion, current.version);
    assert.deepEqual(
      f.store
        .readEvents(runIdentity.runId)
        .filter(({ type }) => type === "runtime.observed")
        .map(({ workflowVersion }) => workflowVersion),
      [current.version, f.retained.version, current.version],
    );
    assert.equal(f.store.listRunIds().length, 1);
    assert.equal(git(f.repository, "status", "--porcelain=v1"), "");
    assert.ok(
      f.calls.every(
        ({ name }) => !/create_thread|send_message|wait_threads/u.test(name),
      ),
    );
  } finally {
    f.close();
  }
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
    const before = [completed, active].map(({ runIdentity }) =>
      f.store.readEvents(runIdentity.runId),
    );
    const result = await f.entry({ specIds: ["1", "2"], maxWorkers: 1 });
    assert.equal(result.state, "SUCCEEDED", JSON.stringify(result));
    assert.ok(observations >= 4);
    const after = [completed, active].map(({ runIdentity }) =>
      f.store.readEvents(runIdentity.runId),
    );
    assert.deepEqual(
      after[0],
      before[0],
      "the already completed member remains unchanged",
    );
    assert.deepEqual(
      after[1].slice(0, before[1].length),
      before[1],
      "the active member preserves its original Run prefix",
    );
    const appended = after[1].slice(before[1].length);
    assert.deepEqual(
      appended.map(({ type }) => type),
      [
        "task.outcome",
        "delivery.observed",
        "delivery.observed",
        "delivery.observed",
        "delivery.observed",
      ],
    );
    assert.equal(appended[0].receipt.disposition, "SUCCEEDED");
    assert.deepEqual(
      appended.slice(1).map(({ stage }) => stage),
      [
        "COMPLETION_PUBLISHED",
        "NATIVE_TERMINAL_OBSERVED",
        "EVIDENCE_VALIDATED",
        "CLOSE_INELIGIBLE",
      ],
    );
    assert.ok(
      f.calls.every(
        ({ name }) => !/create_thread|send_message|wait_threads/u.test(name),
      ),
    );
  } finally {
    f.close();
  }
});

test("a batch installed entry reports each lane's effective package evidence", async () => {
  const f = fixture();
  try {
    f.addCompleted(1);
    f.addCompleted(2);
    const result = await f.entry({ specIds: ["1", "2"], maxWorkers: 1 });
    assert.equal(result.state, "SUCCEEDED", JSON.stringify(result));
    assert.ok(
      result.runs.every(
        (status) =>
          status.workflowRuntime?.packageVersion?.id ===
            f.retained.version.id &&
          status.workflowRuntime.packageRoot === f.retained.root &&
          /^sha256:[a-f0-9]{64}$/u.test(status.workflowRuntime.manifestSha256),
      ),
      "every batch lane exposes the effective package version, root and manifest digest",
    );
  } finally {
    f.close();
  }
});

test("a prior-format incomplete Run adopts recovery semantics without changing its Grant or accepted task intent", async () => {
  const f = fixture({ legacyRuntime: "recovery-v0" });
  try {
    const { issue, runIdentity } = f.addCompleted();
    const completion = issue.comments.pop();
    issue.state = "open";
    issue.events = [];
    f.taskStates.set("task-1", "active");
    const prompt =
      "Original accepted creation: every skill comes from the retained package";
    f.store.reserveHostTask({
      runId: runIdentity.runId,
      issueId: "I_1",
      prompt,
    });
    const originalIntent = f.store.readHostTask({
      runId: runIdentity.runId,
      issueId: "I_1",
    });
    const prefix = f.store.readEvents(runIdentity.runId);
    const rejected = await f.entry({ specId: "1" });
    assert.equal(rejected.state, "UNAVAILABLE");
    assert.equal(rejected.nextOwner, "workflow-maintenance");
    assert.deepEqual(
      rejected.workflowRuntime.packageVersion,
      f.retained.version,
    );
    assert.equal(rejected.workflowRuntime.packageRoot, f.retained.root);
    assert.match(
      rejected.workflowRuntime.manifestSha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
    const rejectedBatch = await f.entry({ specIds: ["1"], maxWorkers: 1 });
    assert.equal(rejectedBatch.state, "PRESERVED");
    assert.deepEqual(
      rejectedBatch.runs[0].workflowRuntime,
      rejected.workflowRuntime,
    );
    assert.deepEqual(
      f.calls,
      [],
      "matching protocol and completed-reentry support alone cannot invoke the old runtime",
    );
    cpSync(
      fileURLToPath(
        new URL(`../../${scriptsPath}/codex-workflow.mjs`, import.meta.url),
      ),
      join(f.source, scriptsPath, "codex-workflow.mjs"),
    );
    git(f.source, "add", "skills");
    git(
      f.source,
      "commit",
      "-m",
      "Reviewed runtime with recovery evidence reader",
    );
    const current = f.install();
    let observations = 0;
    f.readHooks.set(1, () => {
      if (++observations === 5) {
        issue.state = "closed";
        issue.comments.push(completion);
        f.taskStates.delete("task-1");
      }
    });
    const result = await f.entry({ specIds: ["1"], maxWorkers: 1 });
    assert.equal(result.state, "SUCCEEDED", JSON.stringify(result));
    const events = f.store.readEvents(runIdentity.runId);
    assert.deepEqual(events.slice(0, prefix.length), prefix);
    const appended = events.slice(prefix.length);
    assert.deepEqual(
      appended.map(({ type }) => type),
      [
        "runtime.observed",
        "task.outcome",
        "task.outcome",
        "delivery.observed",
        "delivery.observed",
        "delivery.observed",
        "delivery.observed",
      ],
    );
    assert.equal(
      appended.filter(({ type }) => type === "task.outcome").at(-1).receipt
        .disposition,
      "SUCCEEDED",
    );
    assert.deepEqual(
      appended
        .filter(({ type }) => type === "delivery.observed")
        .map(({ stage }) => stage),
      [
        "COMPLETION_PUBLISHED",
        "NATIVE_TERMINAL_OBSERVED",
        "EVIDENCE_VALIDATED",
        "CLOSE_INELIGIBLE",
      ],
    );
    assert.deepEqual(appended[0].workflowVersion, current.version);
    assert.deepEqual(
      f.store.readHostTask({ runId: runIdentity.runId, issueId: "I_1" }),
      originalIntent,
    );
    assert.equal(f.store.listRunIds().length, 1);
    assert.ok(
      f.calls.every(({ name }) => !/create_thread|send_message/u.test(name)),
    );
  } finally {
    f.close();
  }
});

test("selected package evidence survives thrown installed-entry preparation and execution", async () => {
  const f = fixture();
  try {
    f.addCompleted(1, false, false);
    writeFileSync(
      join(f.source, scriptsPath, "codex-workflow.mjs"),
      `
export const supportsCompletedRunReentry = true;
export async function prepareCodexWorkflow() { throw new Error("Fixture preparation failed"); }
export async function runCodexWorkflow() { throw new Error("Fixture execution failed"); }
`,
    );
    git(f.source, "add", "skills");
    git(f.source, "commit", "-m", "throw after package selection");
    const current = f.install();
    const { runInstalledEntry: runInstalledEntryBase } = await import(
      pathToFileURL(join(current.root, scriptsPath, "installed-entry.mjs")).href
    );
    const runInstalledEntry = (options) =>
      runInstalledEntryBase({ commandRunner: f.commandRunner, ...options });
    await assert.rejects(
      runInstalledEntry({
        repository: f.repository,
        host: f.host,
        specId: "1",
      }),
      (error) => {
        assert.match(error.message, /Fixture execution failed/u);
        assert.deepEqual(error.workflowRuntime.packageVersion, current.version);
        assert.equal(error.workflowRuntime.packageRoot, current.root);
        assert.match(
          error.workflowRuntime.manifestSha256,
          /^sha256:[a-f0-9]{64}$/u,
        );
        return true;
      },
    );
    const batch = await runInstalledEntry({
      repository: f.repository,
      host: f.host,
      specIds: ["1"],
    });
    assert.equal(batch.state, "PRESERVED");
    assert.equal(batch.runs[0].run.state, "UNAVAILABLE");
    assert.deepEqual(
      batch.runs[0].workflowRuntime.packageVersion,
      current.version,
    );
    assert.equal(batch.runs[0].workflowRuntime.packageRoot, current.root);
    assert.match(
      batch.runs[0].workflowRuntime.manifestSha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
  } finally {
    f.close();
  }
});

test("selected batch close failures retain runtime evidence and finish lane cleanup", async () => {
  const f = fixture();
  try {
    f.addCompleted(1, false, false);
    f.addCompleted(2, false, false);
    writeFileSync(
      join(f.source, scriptsPath, "codex-workflow.mjs"),
      `
export const supportsCompletedRunReentry = true;
export const closes = [];
export const calls = [];
export const fixtureState = { reenter: false, directUnavailable: process.env.WORKFLOW_FIXTURE_COMPOUND === "1" };
export async function prepareCodexWorkflow({ specId, host }) {
  let closed = false;
  let done = false;
  return {
    specId,
    async run({ mode }) {
      calls.push(specId + ":" + mode + ":" + closed);
      if (fixtureState.directUnavailable && specId === "I_1") return {
        run: { state: "UNAVAILABLE", specId }, nodes: [], legalActions: [],
        capacityUnknown: true, reason: "Fixture primary lane unavailable",
      };
      if (done) return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
      if (mode === "step" && fixtureState.reenter && specId === "I_1") {
        fixtureState.reenter = false;
        host.installCurrent();
        return { run: { state: "EXECUTING", specId, runId: "fixture-reentry-run" },
          diagnoses: [{ reasonCode: "workflow_runtime_reentry_required" }], nodes: [], legalActions: [] };
      }
      if (mode === "step") {
        done = true;
        return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
      }
      return { run: { state: "RUNNING", specId }, nodes: [], legalActions: [{ type: "close_issue" }] };
    },
    async close() {
      closes.push(specId);
      closed = true;
      if (!fixtureState.directUnavailable && specId === "I_1") throw new Error("Fixture selected lane close failed");
      if (fixtureState.directUnavailable && specId === "I_2") throw new Error("Fixture secondary CLI cleanup failed");
    },
  };
}
export async function runCodexWorkflow() { throw new Error("Fixture batch must use prepareCodexWorkflow"); }
`,
    );
    git(f.source, "add", "skills");
    git(f.source, "commit", "-m", "selected lane close failure fixture");
    const current = f.install();
    const entry = join(current.root, scriptsPath, "installed-entry.mjs");
    const compositionPath = join(
      current.root,
      scriptsPath,
      "codex-workflow.mjs",
    );
    const { runInstalledEntry: runInstalledEntryBase } = await import(
      pathToFileURL(entry).href
    );
    const runInstalledEntry = (options) =>
      runInstalledEntryBase({ commandRunner: f.commandRunner, ...options });
    const composition = await import(pathToFileURL(compositionPath).href);
    const assertRuntime = (error) => {
      assert.deepEqual(error.workflowRuntime.packageVersion, current.version);
      assert.equal(error.workflowRuntime.packageRoot, current.root);
      assert.match(
        error.workflowRuntime.manifestSha256,
        /^sha256:[a-f0-9]{64}$/u,
      );
    };

    await assert.rejects(
      runInstalledEntry({
        repository: f.repository,
        host: f.host,
        specIds: ["1", "2"],
        maxWorkers: 1,
      }),
      (error) => {
        assert.match(error.message, /Fixture selected lane close failed/u);
        assertRuntime(error);
        return true;
      },
    );
    assert.deepEqual(
      composition.closes,
      ["I_1", "I_2"],
      "a rejecting close cannot skip later selected lanes",
    );

    composition.closes.splice(0);
    await assert.rejects(
      runInstalledEntry({
        repository: f.repository,
        host: f.host,
        specIds: ["1", "2"],
        maxWorkers: 4,
      }),
      (error) => {
        assert.match(
          error.message,
          /Batch worker limit must be between one and three/u,
        );
        assertRuntime(error);
        return true;
      },
    );
    assert.deepEqual(
      composition.closes,
      ["I_1", "I_2"],
      "cleanup failure cannot replace the first batch failure or stop cleanup",
    );

    composition.closes.splice(0);
    await assert.rejects(
      runInstalledEntry({
        repository: f.repository,
        host: f.host,
        specIds: ["404", "1"],
        maxWorkers: 1,
      }),
      (error) => {
        assert.equal(
          error.workflowRuntime,
          undefined,
          "pre-selection primary failure cannot inherit another lane's runtime",
        );
        assert.ok(error.workflowResult);
        assert.equal(error.workflowResult.runs[0].workflowRuntime, undefined);
        assert.deepEqual(
          error.cleanupFailures.map((item) => [
            item.specId,
            item.error,
            item.workflowRuntime.packageVersion,
          ]),
          [["I_1", "Fixture selected lane close failed", current.version]],
        );
        return true;
      },
    );
    assert.deepEqual(composition.closes, ["I_1"]);

    const cliBin = join(f.root, "cli-bin");
    mkdirSync(cliBin);
    const cliGh = join(cliBin, "gh");
    writeFileSync(
      cliGh,
      `#!/usr/bin/env node
const issues = new Map(JSON.parse(process.env.WORKFLOW_FIXTURE_ISSUES));
const args = process.argv.slice(2);
if (args[0] === "issue" && args[1] === "view") {
  const issue = issues.get(Number(args[2]));
  process.stdout.write(JSON.stringify({ id: issue.node_id, body: issue.body }));
  process.exit(0);
}
if (args[0] !== "api") throw new Error("Unexpected gh command");
if (args[1] === "graphql") {
  const id = args.find(value => value.startsWith("id=")).slice(3);
  const issue = [...issues.values()].find(value => value.node_id === id);
  process.stdout.write(JSON.stringify({ data: { node: issue ? { id, number: issue.number, repository: { nameWithOwner: "example/repo" } } : null } }));
  process.exit(0);
}
const match = args[1].match(/^repos\\/example\\/repo\\/issues\\/(\\d+)(.*)$/u);
if (!match) throw new Error("Unexpected tracker route: " + args[1]);
const issue = issues.get(Number(match[1]));
const suffix = match[2];
let response = issue;
if (suffix.startsWith("/comments")) response = issue.comments;
else if (suffix.startsWith("/events")) response = issue.events;
else if (suffix.includes("blocked_by")) response = (issue.blockers ?? []).map(id => ({ node_id: id }));
else if (suffix === "/parent") response = { node_id: issue.parent };
process.stdout.write(JSON.stringify([response]));
`,
    );
    chmodSync(cliGh, 0o755);
    const cliHarness = `
import { pathToFileURL } from "node:url";
process.argv = [process.execPath, process.env.WORKFLOW_FIXTURE_ENTRY,
  process.env.WORKFLOW_FIXTURE_REPOSITORY, "1,2"];
await import(pathToFileURL(process.env.WORKFLOW_FIXTURE_ENTRY).href + "?cli-close-failure");
`;
    assert.throws(
      () =>
        runWorkflowCommand(
          process.execPath,
          ["--input-type=module", "-e", cliHarness],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              PATH: `${cliBin}${delimiter}${process.env.PATH}`,
              WORKFLOW_FIXTURE_ENTRY: entry,
              WORKFLOW_FIXTURE_REPOSITORY: f.repository,
              WORKFLOW_FIXTURE_ISSUES: JSON.stringify([...f.issues]),
              WORKFLOW_FIXTURE_COMPOUND: "1",
            },
          },
        ),
      (error) => {
        const line = error.stdout
          .split(/\r?\n/u)
          .find((value) => value.startsWith("workflow-host "));
        const emitted = JSON.parse(line.slice("workflow-host ".length));
        assert.equal(emitted.type, "error");
        assert.match(emitted.message, /Fixture primary lane unavailable/u);
        assert.deepEqual(
          emitted.workflowRuntime.packageVersion,
          current.version,
        );
        assert.equal(emitted.workflowRuntime.packageRoot, current.root);
        assert.match(
          emitted.workflowRuntime.manifestSha256,
          /^sha256:[a-f0-9]{64}$/u,
        );
        assert.equal(emitted.workflowResult.runs[0].run.state, "UNAVAILABLE");
        assert.match(
          emitted.workflowResult.runs[0].reason,
          /Fixture primary lane unavailable/u,
        );
        assert.deepEqual(
          emitted.cleanupFailures.map((item) => [item.specId, item.error]),
          [["I_2", "Fixture secondary CLI cleanup failed"]],
        );
        return true;
      },
    );

    composition.closes.splice(0);
    composition.calls.splice(0);
    composition.fixtureState.reenter = true;
    let installedDuringReentry;
    f.host.installCurrent = () => {
      writeFileSync(
        join(f.source, "skills/personal/run-issue-workflow/SKILL.md"),
        "Fixture package after re-entry request\n",
      );
      git(f.source, "add", "skills");
      git(f.source, "commit", "-m", "package selected during re-entry");
      installedDuringReentry = f.install();
    };
    const reentryFailure = await runInstalledEntry({
      repository: f.repository,
      host: f.host,
      specIds: ["1", "2"],
      maxWorkers: 1,
    });
    assert.equal(reentryFailure.state, "PRESERVED");
    assert.match(
      reentryFailure.runs[0].error,
      /Fixture selected lane close failed/u,
    );
    assertRuntime(reentryFailure.runs[0]);
    assert.ok(
      installedDuringReentry,
      "the lane reaches its runtime re-entry close boundary",
    );
    assert.deepEqual(
      composition.calls,
      [
        "I_1:snapshot:false",
        "I_2:snapshot:false",
        "I_1:step:false",
        "I_2:step:false",
        "I_2:snapshot:false",
      ],
      "another progressing lane must not let the next connected round overwrite a close rejection",
    );
    assert.deepEqual(
      composition.closes,
      ["I_1", "I_2"],
      "final batch cleanup cannot repeat an uncertain re-entry close effect",
    );

    writeFileSync(
      join(f.source, scriptsPath, "codex-workflow.mjs"),
      `
export const supportsCompletedRunReentry = true;
export const assessRecoveryCompatibility = () => ({ compatible: true });
export const fixtureState = { reenterOnStep: false };
export async function prepareCodexWorkflow({ specId, host, runIdentity }) {
  let done = false;
  return {
    specId,
    async run({ mode }) {
      if (done) return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
      if (mode === "step" && fixtureState.reenterOnStep && specId === "I_3") {
        fixtureState.reenterOnStep = false;
        host.installCurrent();
        return { run: { state: "EXECUTING", specId, runId: runIdentity.runId },
          diagnoses: [{ reasonCode: "workflow_runtime_reentry_required" }], nodes: [], legalActions: [] };
      }
      if (mode === "step") {
        done = true;
        return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
      }
      return { run: { state: "RUNNING", specId }, nodes: [], legalActions: [{ type: "close_issue" }] };
    },
    async close() {
      if (specId === "I_7") throw new Error("Fixture secondary cleanup failed");
    },
  };
}
export async function runCodexWorkflow() { throw new Error("Fixture batch must use prepareCodexWorkflow"); }
`,
    );
    git(f.source, "add", "skills");
    git(f.source, "commit", "-m", "step runtime re-entry fixture");
    const beforeStepReentry = f.install();
    f.addCompleted(3, false, true, beforeStepReentry.version);
    f.addCompleted(7, false, true, beforeStepReentry.version);
    const beforeStepComposition = await import(
      pathToFileURL(
        join(beforeStepReentry.root, scriptsPath, "codex-workflow.mjs"),
      ).href
    );
    beforeStepComposition.fixtureState.reenterOnStep = true;
    let installedDuringStepReentry;
    let installedDuringNestedStepReentry;
    f.host.installCurrent = () => {
      if (!installedDuringStepReentry) {
        writeFileSync(
          join(f.source, scriptsPath, "codex-workflow.mjs"),
          `
export const supportsCompletedRunReentry = true;
export const assessRecoveryCompatibility = () => ({ compatible: true });
export const fixtureState = { reenter: true };
export async function prepareCodexWorkflow({ specId, host, runIdentity }) {
  return { specId,
    async run() {
      if (fixtureState.reenter) {
        fixtureState.reenter = false;
        host.installCurrent();
        return { run: { state: "EXECUTING", specId, runId: runIdentity.runId },
          diagnoses: [{ reasonCode: "workflow_runtime_reentry_required" }], nodes: [], legalActions: [] };
      }
      return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
    },
    async close() {},
  };
}
export async function runCodexWorkflow() { throw new Error("Fixture batch must use prepareCodexWorkflow"); }
`,
        );
        git(f.source, "add", "skills");
        git(f.source, "commit", "-m", "intermediate renewed runtime fixture");
        installedDuringStepReentry = f.install();
        return;
      }
      writeFileSync(
        join(f.source, scriptsPath, "codex-workflow.mjs"),
        `
export const supportsCompletedRunReentry = true;
export const assessRecoveryCompatibility = () => ({ compatible: true });
export const fixtureState = { calls: [], throwOnce: true };
export async function prepareCodexWorkflow({ specId }) {
  return { specId,
    async run() {
      fixtureState.calls.push(specId);
      if (fixtureState.throwOnce) {
        fixtureState.throwOnce = false;
        throw "Fixture renewed selected execution failed";
      }
      return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
    },
    async close() {},
  };
}
export async function runCodexWorkflow() { throw new Error("Fixture batch must use prepareCodexWorkflow"); }
`,
      );
      git(f.source, "add", "skills");
      git(f.source, "commit", "-m", "nested renewed runtime failure fixture");
      installedDuringNestedStepReentry = f.install();
    };
    let stepReentryFailure;
    await assert.rejects(
      runInstalledEntry({
        repository: f.repository,
        host: f.host,
        specIds: ["3", "7"],
        maxWorkers: 1,
      }),
      (error) => {
        assert.match(
          error.message,
          /Fixture renewed selected execution failed/u,
        );
        assert.ok(
          error.workflowResult,
          "the primary lane result survives secondary cleanup rejection",
        );
        assert.equal(error.workflowResult.runs[0].run.state, "UNAVAILABLE");
        assert.match(
          error.workflowResult.runs[0].error,
          /Fixture renewed selected execution failed/u,
        );
        assert.deepEqual(
          error.cleanupFailures.map((item) => [item.specId, item.error]),
          [["I_7", "Fixture secondary cleanup failed"]],
        );
        stepReentryFailure = error.workflowResult;
        return true;
      },
    );
    assert.ok(
      installedDuringStepReentry && installedDuringNestedStepReentry,
      "the step reaches both renewed selected runtimes",
    );
    assert.deepEqual(
      stepReentryFailure.runs[0].workflowRuntime.packageVersion,
      installedDuringNestedStepReentry.version,
    );
    assert.equal(
      stepReentryFailure.runs[0].workflowRuntime.packageRoot,
      installedDuringNestedStepReentry.root,
    );
    assert.match(
      stepReentryFailure.runs[0].workflowRuntime.manifestSha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
    const stepReentryComposition = await import(
      pathToFileURL(
        join(
          installedDuringNestedStepReentry.root,
          scriptsPath,
          "codex-workflow.mjs",
        ),
      ).href
    );
    assert.deepEqual(
      stepReentryComposition.fixtureState.calls,
      ["I_3"],
      "another progressing lane must not let the next connected round retry a renewed runtime throw",
    );

    writeFileSync(
      join(f.source, scriptsPath, "codex-workflow.mjs"),
      `
export const supportsCompletedRunReentry = true;
export const assessRecoveryCompatibility = () => ({ compatible: true });
export const fixtureState = { reenterOnStep: false };
export async function prepareCodexWorkflow({ specId, host, runIdentity }) {
  let done = false;
  return {
    specId,
    async run({ mode }) {
      if (done) return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
      if (mode === "step" && fixtureState.reenterOnStep && specId === "I_8") {
        fixtureState.reenterOnStep = false;
        host.installCurrent();
        return { run: { state: "EXECUTING", specId, runId: runIdentity.runId },
          diagnoses: [{ reasonCode: "workflow_runtime_reentry_required" }], nodes: [], legalActions: [] };
      }
      if (mode === "step") {
        done = true;
        return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
      }
      return { run: { state: "RUNNING", specId }, nodes: [], legalActions: [{ type: "close_issue" }] };
    },
    async close() {},
  };
}
export async function runCodexWorkflow() { throw new Error("Fixture batch must use prepareCodexWorkflow"); }
`,
    );
    git(f.source, "add", "skills");
    git(f.source, "commit", "-m", "renewed unavailable status source fixture");
    const beforeRenewedUnavailable = f.install();
    f.addCompleted(8, false, true, beforeRenewedUnavailable.version);
    f.addCompleted(9, false, true, beforeRenewedUnavailable.version);
    const beforeRenewedUnavailableComposition = await import(
      pathToFileURL(
        join(beforeRenewedUnavailable.root, scriptsPath, "codex-workflow.mjs"),
      ).href
    );
    beforeRenewedUnavailableComposition.fixtureState.reenterOnStep = true;
    let intermediateRenewedUnavailable;
    let selectedRenewedUnavailable;
    f.host.installCurrent = () => {
      if (!intermediateRenewedUnavailable) {
        writeFileSync(
          join(f.source, scriptsPath, "codex-workflow.mjs"),
          `
export const supportsCompletedRunReentry = true;
export const assessRecoveryCompatibility = () => ({ compatible: true });
export const fixtureState = { reenter: true };
export async function prepareCodexWorkflow({ specId, host, runIdentity }) {
  return { specId,
    async run() {
      if (fixtureState.reenter) {
        fixtureState.reenter = false;
        host.installCurrent();
        return { run: { state: "EXECUTING", specId, runId: runIdentity.runId },
          diagnoses: [{ reasonCode: "workflow_runtime_reentry_required" }], nodes: [], legalActions: [] };
      }
      return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
    },
    async close() {},
  };
}
export async function runCodexWorkflow() { throw new Error("Fixture batch must use prepareCodexWorkflow"); }
`,
        );
        git(f.source, "add", "skills");
        git(
          f.source,
          "commit",
          "-m",
          "intermediate renewed unavailable fixture",
        );
        intermediateRenewedUnavailable = f.install();
        return;
      }
      writeFileSync(
        join(f.source, scriptsPath, "codex-workflow.mjs"),
        `
export const supportsCompletedRunReentry = true;
export const assessRecoveryCompatibility = () => ({ compatible: true });
export const fixtureState = { calls: [], unavailableOnce: true };
export async function prepareCodexWorkflow({ specId }) {
  return { specId,
    async run() {
      fixtureState.calls.push(specId);
      if (fixtureState.unavailableOnce) {
        fixtureState.unavailableOnce = false;
        return { run: { state: "UNAVAILABLE", specId }, nodes: [], legalActions: [],
          capacityUnknown: true, reason: "Fixture renewed execution unavailable" };
      }
      return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
    },
    async close() {},
  };
}
export async function runCodexWorkflow() { throw new Error("Fixture batch must use prepareCodexWorkflow"); }
`,
      );
      git(f.source, "add", "skills");
      git(
        f.source,
        "commit",
        "-m",
        "nested renewed unavailable status fixture",
      );
      selectedRenewedUnavailable = f.install();
    };
    const renewedUnavailable = await runInstalledEntry({
      repository: f.repository,
      host: f.host,
      specIds: ["8", "9"],
      maxWorkers: 1,
    });
    assert.equal(renewedUnavailable.state, "PRESERVED");
    assert.equal(renewedUnavailable.runs[0].run.state, "UNAVAILABLE");
    assert.match(
      renewedUnavailable.runs[0].reason,
      /Fixture renewed execution unavailable/u,
    );
    assert.deepEqual(
      renewedUnavailable.runs[0].workflowRuntime.packageVersion,
      selectedRenewedUnavailable.version,
    );
    assert.equal(
      renewedUnavailable.runs[0].workflowRuntime.packageRoot,
      selectedRenewedUnavailable.root,
    );
    const renewedUnavailableComposition = await import(
      pathToFileURL(
        join(
          selectedRenewedUnavailable.root,
          scriptsPath,
          "codex-workflow.mjs",
        ),
      ).href
    );
    assert.deepEqual(
      renewedUnavailableComposition.fixtureState.calls,
      ["I_8"],
      "another progressing lane must not let the next connected round overwrite renewed UNAVAILABLE",
    );

    writeFileSync(
      join(f.source, scriptsPath, "codex-workflow.mjs"),
      `
export const supportsCompletedRunReentry = true;
export const assessRecoveryCompatibility = () => ({ compatible: true });
export const fixtureState = { reenterOnStep: false, calls: [] };
export async function prepareCodexWorkflow({ specId, host, runIdentity }) {
  let closed = false;
  let done = false;
  return {
    specId,
    async run({ mode }) {
      fixtureState.calls.push(specId + ":" + mode + ":" + closed);
      if (done) return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
      if (mode === "step" && fixtureState.reenterOnStep) {
        fixtureState.reenterOnStep = false;
        host.installCurrent();
        return { run: { state: "EXECUTING", specId, runId: runIdentity.runId },
          diagnoses: [{ reasonCode: "workflow_runtime_reentry_required" }], nodes: [], legalActions: [] };
      }
      if (mode === "step") {
        done = true;
        return { run: { state: "SUCCEEDED", specId }, nodes: [], legalActions: [] };
      }
      return { run: { state: "RUNNING", specId }, nodes: [], legalActions: [{ type: "close_issue" }] };
    },
    async close() { closed = true; },
  };
}
export async function runCodexWorkflow() { throw new Error("Fixture batch must use prepareCodexWorkflow"); }
`,
    );
    git(f.source, "add", "skills");
    git(f.source, "commit", "-m", "recursive selection failure fixture");
    const beforeSelectionFailure = f.install();
    f.addCompleted(4, false, true, beforeSelectionFailure.version);
    f.addCompleted(6, false, true, beforeSelectionFailure.version);
    const beforeSelectionComposition = await import(
      pathToFileURL(
        join(beforeSelectionFailure.root, scriptsPath, "codex-workflow.mjs"),
      ).href
    );
    beforeSelectionComposition.fixtureState.reenterOnStep = true;
    let selectedImportFailure;
    f.host.installCurrent = () => {
      writeFileSync(
        join(f.source, scriptsPath, "codex-workflow.mjs"),
        'throw new Error("Fixture renewed package import failed");\n',
      );
      git(f.source, "add", "skills");
      git(f.source, "commit", "-m", "renewed package import failure fixture");
      selectedImportFailure = f.install();
    };
    const selectionFailure = await runInstalledEntry({
      repository: f.repository,
      host: f.host,
      specIds: ["4", "6"],
      maxWorkers: 1,
    });
    assert.equal(selectionFailure.state, "PRESERVED");
    assert.match(
      selectionFailure.runs[0].error,
      /Fixture renewed package import failed/u,
      JSON.stringify(selectionFailure),
    );
    assert.ok(
      selectedImportFailure,
      "the recursive selection reaches the renewed package before import fails",
    );
    assert.deepEqual(
      selectionFailure.runs[0].workflowRuntime.packageVersion,
      selectedImportFailure.version,
    );
    assert.equal(
      selectionFailure.runs[0].workflowRuntime.packageRoot,
      selectedImportFailure.root,
    );
    assert.match(
      selectionFailure.runs[0].workflowRuntime.manifestSha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.deepEqual(
      beforeSelectionComposition.fixtureState.calls,
      [
        "I_4:snapshot:false",
        "I_6:snapshot:false",
        "I_4:step:false",
        "I_6:step:false",
        "I_6:snapshot:false",
      ],
      "another progressing lane must not let the next connected round re-enter the closed old runtime",
    );

    writeFileSync(
      join(f.source, scriptsPath, "codex-workflow.mjs"),
      `
export const supportsCompletedRunReentry = true;
export const assessRecoveryCompatibility = () => ({ compatible: true });
export const fixtureState = { reenterOnStep: false, calls: [] };
export async function prepareCodexWorkflow({ specId, host, runIdentity }) {
  let closed = false;
  return {
    specId,
    async run({ mode }) {
      fixtureState.calls.push(mode + ":" + closed);
      if (mode === "step" && fixtureState.reenterOnStep) {
        fixtureState.reenterOnStep = false;
        host.installCurrent();
        return { run: { state: "EXECUTING", specId, runId: runIdentity.runId },
          diagnoses: [{ reasonCode: "workflow_runtime_reentry_required" }], nodes: [], legalActions: [] };
      }
      return { run: { state: "RUNNING", specId }, nodes: [], legalActions: [{ type: "close_issue" }] };
    },
    async close() { closed = true; },
  };
}
export async function runCodexWorkflow() { throw new Error("Fixture batch must use prepareCodexWorkflow"); }
`,
    );
    git(f.source, "add", "skills");
    git(f.source, "commit", "-m", "recursive unavailable selection fixture");
    const beforeUnavailableSelection = f.install();
    f.addCompleted(5, false, true, beforeUnavailableSelection.version);
    const beforeUnavailableComposition = await import(
      pathToFileURL(
        join(
          beforeUnavailableSelection.root,
          scriptsPath,
          "codex-workflow.mjs",
        ),
      ).href
    );
    beforeUnavailableComposition.fixtureState.reenterOnStep = true;
    let selectedUnavailable;
    f.host.installCurrent = () => {
      writeFileSync(
        join(f.source, scriptsPath, "codex-workflow.mjs"),
        `
export const supportsCompletedRunReentry = true;
export const assessRecoveryCompatibility = () => {
  return { compatible: false, reason: "Fixture renewed package incompatible" };
};
export async function prepareCodexWorkflow() { throw new Error("Incompatible fixture must not prepare"); }
export async function runCodexWorkflow() { throw new Error("Incompatible fixture must not run"); }
`,
      );
      git(f.source, "add", "skills");
      git(f.source, "commit", "-m", "renewed unavailable package fixture");
      selectedUnavailable = f.install();
    };
    const unavailableSelection = await runInstalledEntry({
      repository: f.repository,
      host: f.host,
      specIds: ["5"],
      maxWorkers: 1,
    });
    assert.equal(unavailableSelection.state, "PRESERVED");
    assert.equal(unavailableSelection.runs[0].run.state, "UNAVAILABLE");
    assert.match(
      unavailableSelection.runs[0].reason,
      /Fixture renewed package incompatible/u,
      JSON.stringify(unavailableSelection),
    );
    assert.ok(
      selectedUnavailable,
      "the recursive selection reads the renewed unavailable package",
    );
    assert.deepEqual(
      unavailableSelection.runs[0].workflowRuntime.packageVersion,
      selectedUnavailable.version,
    );
    assert.equal(
      unavailableSelection.runs[0].workflowRuntime.packageRoot,
      selectedUnavailable.root,
    );
    assert.match(
      unavailableSelection.runs[0].workflowRuntime.manifestSha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.deepEqual(
      beforeUnavailableComposition.fixtureState.calls,
      ["snapshot:false", "step:false"],
      "a connected next round must not re-enter the closed old runtime",
    );
  } finally {
    f.close();
  }
});

test("an explicit Run alone cannot bypass the current canonical operation identity", async () => {
  const f = fixture();
  try {
    const { runIdentity } = f.addCompleted();
    const wrongRun = `workflow-op-v1-${"0".repeat(64)}`;
    const {
      schema: _schema,
      sequence: _sequence,
      ...grant
    } = f.store.readEvents(runIdentity.runId)[0];
    const writer = f.store.acquireWriter(wrongRun);
    writer.append({
      ...grant,
      runIdentity: { ...runIdentity, runId: wrongRun },
    });
    writer.release();
    const before = f.store.readEvents(wrongRun);
    const result = await f.entry({ runId: wrongRun });
    assert.equal(result.state, "UNAVAILABLE", JSON.stringify(result));
    assert.equal(
      result.workflowRuntime,
      undefined,
      "a failure before package selection cannot invent effective-byte evidence",
    );
    assert.deepEqual(f.store.readEvents(wrongRun), before);
    assert.equal(f.calls.length, 0);
  } finally {
    f.close();
  }
});

test("the installed --qualify-repair-package sample validates through the selected package", async () => {
  const f = fixture();
  try {
    const cacheDirectory = join(f.root, ".codex", "workflow-packages");
    const codexEntry = join(f.root, ".codex", "skills", "run-issue-workflow");
    const agentsEntry = join(f.root, ".agents", "skills", "run-issue-workflow");
    const options = {
      sourceRepository: f.source,
      sourceCommit: f.retained.version.sourceCommit,
      cacheDirectory,
    };
    const installed = installWorkflow({
      ...options,
      skillDirectory: codexEntry,
    });
    installWorkflow({ ...options, skillDirectory: agentsEntry });
    const evidence = readWorkflowInstallationEvidence({
      cacheDirectory,
      skillDirectories: [codexEntry, agentsEntry],
      expectedSourceCommit: f.retained.version.sourceCommit,
    });
    assert.equal(evidence.schema, "codex-workflow-effective-evidence:v2");
    assert.equal(evidence.boundInputs.packageVersionId, installed.version.id);
    assert.equal(evidence.boundInputs.fixtureRevision, "wsl-posix-v1");
    assert.match(evidence.boundInputs.fixtureDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.match(
      evidence.boundInputs.capabilityIdentity,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.deepEqual(
      evidence.qualificationObservations.map(({ run }) => run),
      [1, 2, 3],
    );
    const stages = evidence.qualificationObservations.flatMap(
      ({ stages: observed }) => observed,
    );
    assert.equal(stages.length, 9);
    assert.deepEqual([...new Set(stages.map(({ stage }) => stage))].sort(), [
      "posix-worktree-cleanup",
      "settled-host-cleanup-routing",
      "stable-close-identity",
    ]);
    assert.ok(
      stages.every(
        (stage) =>
          stage.result === "PASS" &&
          stage.packageVersionId === evidence.boundInputs.packageVersionId &&
          stage.fixtureDigest === evidence.boundInputs.fixtureDigest &&
          stage.capabilityIdentity === evidence.boundInputs.capabilityIdentity,
      ),
    );
    const retainedPath = join(
      cacheDirectory,
      "qualification",
      `${installed.version.id}.json`,
    );
    const retained = JSON.parse(readFileSync(retainedPath, "utf8"));
    assert.equal(retained.schema, "workflow-repair-qualification:v1");
    assert.deepEqual(retained.boundInputs, evidence.boundInputs);
    assert.deepEqual(retained.observations, evidence.qualificationObservations);
    assert.deepEqual(
      readWorkflowInstallationEvidence({
        cacheDirectory,
        skillDirectories: [codexEntry, agentsEntry],
        expectedSourceCommit: f.retained.version.sourceCommit,
      }).qualificationObservations,
      evidence.qualificationObservations,
      "a matching retained sample is reused without a new qualification run",
    );
  } finally {
    f.close();
  }
});

// Every step is a top-level named test that owns its fixture: the nested t.test form and a
// shared lazily-built fixture both left this file's process alive on untouched HEAD, so each
// gate replays the minimal prefix its own assertions depend on and closes its own fixture.
const selectionBase = async () => {
  const f = fixture();
  try {
    assert.deepEqual(await f.entry(), {
      state: "SELECTION_REQUIRED",
      runs: [],
    });
    assert.equal(
      (await f.entry({ runId: "missing-run" })).state,
      "UNAVAILABLE",
    );
    const single = f.addCompleted();
    await f.entry({ specId: "1", runId: single.runIdentity.runId });
    return { f, single };
  } catch (error) {
    f.close();
    throw error;
  }
};
const selectionPeers = async () => {
  const state = await selectionBase();
  try {
    state.multi = state.f.addCompleted(2, true);
    state.other = state.f.addCompleted(3);
    return state;
  } catch (error) {
    state.f.close();
    throw error;
  }
};
// The completed batch journals step depends on both completed Runs having been observed once.
const selectionMultiObserved = async (state) => {
  const observed = await state.f.entry({ specId: "2" });
  assert.equal(observed.status.run.state, "SUCCEEDED");
  return state;
};

const selectionNativeIdentity = async ({ f, single }) => {
  const before = f.store.readEvents(single.runIdentity.runId);
  const result = await f.entry({ specId: "I_1" });
  assert.equal(result.status.run.state, "SUCCEEDED");
  assert.deepEqual(f.store.readEvents(single.runIdentity.runId), before);
  assert.equal(
    (await f.entry()).state,
    "SELECTION_REQUIRED",
    "completed Runs are not no-argument candidates",
  );
};

const selectionDiscovery = async ({ f, other }) => {
  assert.equal((await f.entry()).state, "SELECTION_REQUIRED");
  const explicit = await f.entry({ specId: "2" });
  assert.equal(
    explicit.status.run.state,
    "SUCCEEDED",
    JSON.stringify(explicit.status),
  );
  assert.equal(explicit.status.run.classification, "MULTI");
  assert.deepEqual(
    explicit.status.nodes.map((node) => node.blockers),
    [[], ["I_102"]],
  );
  const unique = await f.entry();
  assert.equal(unique.status.run.runId, other.runIdentity.runId);
  assert.equal(unique.status.run.state, "SUCCEEDED");
};

const selectionBatchJournals = async ({ f, single, multi }) => {
  const before = [single, multi].map(({ runIdentity }) =>
    f.store.readEvents(runIdentity.runId),
  );
  const result = await f.entry({ specIds: ["1", "I_2"], maxWorkers: 1 });
  assert.equal(result.state, "SUCCEEDED", JSON.stringify(result));
  assert.deepEqual(
    result.runs.map(({ run }) => run.runId),
    [single.runIdentity.runId, multi.runIdentity.runId],
  );
  assert.ok(
    result.runs.every(
      (status) =>
        status.workflowRuntime?.packageVersion?.id === f.retained.version.id &&
        status.workflowRuntime.packageRoot === f.retained.root &&
        /^sha256:[a-f0-9]{64}$/u.test(status.workflowRuntime.manifestSha256),
    ),
    "every batch lane exposes the effective package version, root and manifest digest",
  );
  assert.deepEqual(
    [single, multi].map(({ runIdentity }) =>
      f.store.readEvents(runIdentity.runId),
    ),
    before,
  );
  await assert.rejects(f.entry({ specIds: ["1", "I_1"] }), /distinct Specs/u);
};

const selectionScopeConflict = async ({ f, single }) => {
  const before = f.store.readEvents(single.runIdentity.runId);
  assert.equal(
    (await f.entry({ specId: "2", runId: single.runIdentity.runId })).state,
    "UNAVAILABLE",
  );
  const body = single.issue.body;
  single.issue.body = "Changed unapproved scope";
  try {
    for (const specId of ["1", "I_1"]) {
      assert.equal(
        (await f.entry({ specId, runId: single.runIdentity.runId })).state,
        "UNAVAILABLE",
      );
      const result = await f.entry({ specId });
      assert.equal(result.status.run.state, "BLOCKED");
      assert.ok(
        result.status.diagnoses.some(
          ({ reasonCode }) => reasonCode === "tracker_authority_conflict",
        ),
      );
    }
  } finally {
    single.issue.body = body;
  }
  assert.deepEqual(f.store.readEvents(single.runIdentity.runId), before);
  assert.equal(f.store.listRunIds().length, 3);
};

const selectionUnavailableBatchMember = async ({ f, multi }) => {
  const body = multi.issue.body;
  multi.issue.body = "Changed unapproved Multi scope";
  try {
    const result = await f.entry({ specIds: ["1", "2"] });
    assert.equal(result.state, "PRESERVED");
    assert.deepEqual(
      result.runs.map(({ run }) => run.state),
      ["SUCCEEDED", "BLOCKED"],
    );
  } finally {
    multi.issue.body = body;
  }
};

const selectionChangedCompletion = async ({ f, single }) => {
  const before = f.calls.length;
  single.issue.state = "open";
  try {
    const result = await f.entry({ specIds: ["1", "2"] });
    assert.equal(result.state, "PRESERVED");
    assert.equal(result.runs[0].run.state, "BLOCKED");
    assert.equal(result.runs[1].run.state, "SUCCEEDED");
    const retry = await f.entry({ specId: "1" });
    assert.equal(
      retry.status.run.state,
      "BLOCKED",
      "re-entry retains the contradiction until owner evidence agrees",
    );
    assert.ok(
      f.calls
        .slice(before)
        .every(
          ({ name }) => !/create_thread|send_message|wait_threads/u.test(name),
        ),
      "completed selection must reconcile without replay",
    );
  } finally {
    single.issue.state = "closed";
  }
};

const selectionAmbiguousJournals = async ({ f, single }) => {
  const writer = f.store.acquireWriter("legacy-duplicate");
  const {
    schema: _schema,
    sequence: _sequence,
    ...grant
  } = f.store.readEvents(single.runIdentity.runId)[0];
  writer.append({
    ...grant,
    runIdentity: { ...single.runIdentity, runId: "legacy-duplicate" },
  });
  writer.release();
  const before = f.store.readEvents(single.runIdentity.runId);
  assert.equal((await f.entry({ specId: "1" })).state, "SELECTION_REQUIRED");
  assert.deepEqual(f.store.readEvents(single.runIdentity.runId), before);
  assert.ok(
    f.calls.every(
      ({ name }) => !/create_thread|send_message|wait_threads/u.test(name),
    ),
  );
  assert.equal(git(f.repository, "status", "--porcelain=v1"), "");
};

test("installed selection retains current scope, native identity, batch ownership and discovery gates: native identity reconciles completed authority without repeating work", async () => {
  const state = await selectionBase();
  try {
    await selectionNativeIdentity(state);
  } finally {
    state.f.close();
  }
});

test("installed selection retains current scope, native identity, batch ownership and discovery gates: no-argument discovery rejects multiple and accepts one non-terminal projection", async () => {
  const state = await selectionPeers();
  try {
    await selectionDiscovery(state);
  } finally {
    state.f.close();
  }
});

test("installed selection retains current scope, native identity, batch ownership and discovery gates: explicit numeric/native completed batch retains independent Run IDs and journals", async () => {
  const state = await selectionMultiObserved(await selectionPeers());
  try {
    await selectionBatchJournals(state);
  } finally {
    state.f.close();
  }
});

test("installed selection retains current scope, native identity, batch ownership and discovery gates: explicit Run mismatch and changed numeric/native scope preserve original authority", async () => {
  const state = await selectionPeers();
  try {
    await selectionScopeConflict(state);
  } finally {
    state.f.close();
  }
});

test("installed selection retains current scope, native identity, batch ownership and discovery gates: an unavailable batch member cannot manufacture completion in another", async () => {
  const state = await selectionPeers();
  try {
    await selectionUnavailableBatchMember(state);
  } finally {
    state.f.close();
  }
});

test("installed selection retains current scope, native identity, batch ownership and discovery gates: changed completion observations do not replay a completed Run's close action", async () => {
  const state = await selectionPeers();
  try {
    await selectionChangedCompletion(state);
  } finally {
    state.f.close();
  }
});

test("installed selection retains current scope, native identity, batch ownership and discovery gates: ambiguous same-scope journals require selection without granting new authority", async () => {
  const state = await selectionBase();
  try {
    await selectionAmbiguousJournals(state);
  } finally {
    state.f.close();
  }
});

// The sequential pass proves what no single step can: the gates leave no replayed native
// work and no residue in the target repository.
test("installed selection gates: sequential selection leaves no replayed native work and a clean target", async () => {
  const state = await selectionPeers();
  try {
    await selectionNativeIdentity(state);
    await selectionDiscovery(state);
    await selectionBatchJournals(await selectionMultiObserved(state));
    await selectionScopeConflict(state);
    await selectionUnavailableBatchMember(state);
    await selectionChangedCompletion(state);
    await selectionAmbiguousJournals(state);
    assert.ok(
      state.f.calls.every(
        ({ name }) => !/create_thread|send_message|wait_threads/u.test(name),
      ),
    );
    assert.equal(git(state.f.repository, "status", "--porcelain=v1"), "");
  } finally {
    state.f.close();
  }
});

// Replay gates: the base observes the completed run once, so the captured journal is the
// stable owner history every later step must leave untouched.
const replayBase = async () => {
  const f = fixture();
  try {
    const single = f.addCompleted();
    const multi = f.addCompleted(2, true);
    const snapshotPath = join(
      f.repository,
      ".git/matt-workflow-control/runs",
      single.runIdentity.runId,
      "status.json",
    );
    await f.entry({ specId: "1" });
    const journal = f.store.readEvents(single.runIdentity.runId);
    return { f, single, multi, journal, snapshotPath };
  } catch (error) {
    f.close();
    throw error;
  }
};
const replayReopened = async ({ f, single, snapshotPath }) => {
  rmSync(snapshotPath);
  single.issue.state = "open";
  return f.snapshot(single.runIdentity);
};
const replayDirtyThenClean = async ({ f, single }) => {
  single.issue.state = "closed";
  await f.entry({ specId: "1" });
  single.issue.state = "open";
  const dirtyPath = join(f.repository, "unrelated.txt");
  writeFileSync(dirtyPath, "preserved target work\n");
  try {
    assert.equal((await f.entry({ specId: "1" })).status.run.state, "BLOCKED");
  } finally {
    rmSync(dirtyPath);
  }
  return f.snapshot(single.runIdentity);
};

const replayDeletedSnapshot = async (state) => {
  const { f } = state;
  const result = await replayReopened(state);
  assert.equal(result.run.state, "BLOCKED");
  assert.deepEqual(result.legalActions, []);
  assert.ok(
    result.diagnoses.some((d) =>
      d.resumePredicates.includes(
        "resolve_contradiction:completed_run_evidence_changed",
      ),
    ),
  );
  assert.equal((await f.entry({ specId: "1" })).status.run.state, "BLOCKED");
};

const replayDirtyToClean = async (state) => {
  const { f } = state;
  await replayReopened(state);
  const result = await replayDirtyThenClean(state);
  assert.equal(result.run.state, "BLOCKED");
  assert.deepEqual(result.legalActions, []);
  assert.equal((await f.entry({ specId: "1" })).status.run.state, "BLOCKED");
};

const replayCompletedParent = async ({ f, multi }) => {
  multi.issue.state = "open";
  const result = await f.snapshot(multi.runIdentity);
  assert.equal(result.run.state, "BLOCKED");
  assert.deepEqual(result.legalActions, []);
  assert.equal((await f.entry({ specId: "2" })).status.run.state, "BLOCKED");
};

const replayUnreadableClosure = async (state) => {
  const { f, single } = state;
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
  } finally {
    single.issue.events = events;
    publication.created_at = createdAt;
  }
};

const replayCurrentPartialClose = async (state) => {
  const { f, single, journal } = state;
  // The preceding replay steps rebuild from owner history only; it stays byte-for-byte intact.
  assert.deepEqual(f.store.readEvents(single.runIdentity.runId), journal);
  single.issue.events = [{ ...closure(1), created_at: "2026-09-07T00:00:00Z" }];
  const result = await f.snapshot(single.runIdentity);
  assert.deepEqual(result.legalActions, [
    { type: "close_issue", issueId: "I_1" },
  ]);
  // Owner history is byte-for-byte unchanged; proving this close eligible is itself the only
  // addition, and the product records it as a delivery observation rather than owner evidence.
  const after = f.store.readEvents(single.runIdentity.runId);
  assert.deepEqual(after.slice(0, journal.length), journal);
  assert.ok(
    after
      .slice(journal.length)
      .every(({ type }) => type === "delivery.observed"),
    "only the current close-eligibility observation may follow unchanged owner history",
  );
  assert.ok(
    f.calls.every(
      ({ name }) => !/create_thread|send_message|wait_threads/u.test(name),
    ),
  );
  assert.equal(git(f.repository, "status", "--porcelain=v1"), "");
};

test("completed replay gates rebuild from owner history across disposable snapshots and temporary blockers: a deleted success snapshot cannot replay a reopened member", async () => {
  const state = await replayBase();
  try {
    await replayDeletedSnapshot(state);
  } finally {
    state.f.close();
  }
});

test("completed replay gates rebuild from owner history across disposable snapshots and temporary blockers: dirty-to-clean target observations retain the same replay gate", async () => {
  const state = await replayBase();
  try {
    await replayDirtyToClean(state);
  } finally {
    state.f.close();
  }
});

test("completed replay gates rebuild from owner history across disposable snapshots and temporary blockers: a completed parent cannot repeat closeout without a prior snapshot", async () => {
  const state = await replayBase();
  try {
    await replayCompletedParent(state);
  } finally {
    state.f.close();
  }
});

test("completed replay gates rebuild from owner history across disposable snapshots and temporary blockers: unreadable or unordered closure evidence cannot authorize progress", async () => {
  const state = await replayBase();
  try {
    await replayReopened(state);
    await replayDirtyThenClean(state);
    await replayUnreadableClosure(state);
  } finally {
    state.f.close();
  }
});

test("completed replay gates rebuild from owner history across disposable snapshots and temporary blockers: closure before the current publication does not fence a current partial close", async () => {
  const state = await replayBase();
  try {
    await replayReopened(state);
    await replayDirtyThenClean(state);
    await replayCurrentPartialClose(state);
  } finally {
    state.f.close();
  }
});

test("completed replay gates: sequential owner-history replay leaves the journal unchanged", async () => {
  const state = await replayBase();
  const { f } = state;
  try {
    await replayDeletedSnapshot(state);
    await replayDirtyToClean(state);
    await replayCompletedParent(state);
    await replayReopened(state);
    await replayDirtyThenClean(state);
    await replayUnreadableClosure(state);
    await replayCurrentPartialClose(state);
    assert.ok(
      f.calls.every(
        ({ name }) => !/create_thread|send_message|wait_threads/u.test(name),
      ),
    );
    assert.equal(git(f.repository, "status", "--porcelain=v1"), "");
  } finally {
    f.close();
  }
});

test("a newer entry requires completed re-entry support in the selected runtime", async () => {
  const f = fixture({ legacyRuntime: true });
  try {
    const { issue, runIdentity } = f.addCompleted();
    const journal = f.store.readEvents(runIdentity.runId);
    cpSync(
      fileURLToPath(new URL(`../../${scriptsPath}`, import.meta.url)),
      join(f.source, scriptsPath),
      { recursive: true },
    );
    git(f.source, "add", "skills");
    git(
      f.source,
      "commit",
      "-m",
      "current runtime with completed re-entry reconciliation",
    );
    const current = f.install();
    const { runInstalledEntry: runInstalledEntryBase } = await import(
      pathToFileURL(join(current.root, scriptsPath, "installed-entry.mjs")).href
    );
    const runInstalledEntry = (options) =>
      runInstalledEntryBase({ commandRunner: f.commandRunner, ...options });
    const skillPath = join(
      current.root,
      "skills/personal/run-issue-workflow/SKILL.md",
    );
    const skillBytes = readFileSync(skillPath);
    issue.state = "open";
    writeFileSync(skillPath, "modified current package\n");
    try {
      const result = await runInstalledEntry({
        repository: f.repository,
        host: f.host,
        specId: "1",
      });
      assert.equal(result.state, "UNAVAILABLE");
      assert.match(result.recovery, /Restore this exact trusted package/u);
      assert.deepEqual(f.store.readEvents(runIdentity.runId), journal);
      assert.deepEqual(
        f.calls,
        [],
        "recovery precedes runtime invocation and host calls even without a terminal snapshot",
      );
    } finally {
      writeFileSync(skillPath, skillBytes);
    }
    issue.state = "closed";
    const restored = await runInstalledEntry({
      repository: f.repository,
      host: f.host,
      specId: "I_1",
    });
    assert.equal(restored.status.run.state, "SUCCEEDED");
    assert.deepEqual(
      f.store.readEvents(runIdentity.runId).slice(0, journal.length),
      journal,
    );
    assert.deepEqual(
      f.store
        .readEvents(runIdentity.runId)
        .findLast(({ type }) => type === "runtime.observed").workflowVersion,
      current.version,
    );
    installWorkflow({
      sourceRepository: f.source,
      sourceCommit: f.retained.version.sourceCommit,
      cacheDirectory: f.cacheDirectory,
      skillDirectory: join(f.root, "entry"),
    });
    issue.state = "open";
    const beforeDowngrade = f.store.readEvents(runIdentity.runId);
    const callsBefore = f.calls.length;
    const downgraded = await runInstalledEntry({
      repository: f.repository,
      host: f.host,
      specId: "1",
    });
    assert.equal(
      downgraded.state,
      "UNAVAILABLE",
      "verified source/protocol alone cannot prove completed re-entry support",
    );
    assert.match(downgraded.recovery, /compatible/u);
    assert.deepEqual(
      downgraded.workflowRuntime.packageVersion,
      f.retained.version,
    );
    assert.equal(downgraded.workflowRuntime.packageRoot, f.retained.root);
    assert.match(
      downgraded.workflowRuntime.manifestSha256,
      /^sha256:[a-f0-9]{64}$/u,
    );
    assert.deepEqual(f.store.readEvents(runIdentity.runId), beforeDowngrade);
    assert.equal(f.calls.length, callsBefore);
    assert.ok(
      f.calls.every(
        ({ name }) => !/create_thread|send_message|wait_threads/u.test(name),
      ),
    );
  } finally {
    f.close();
  }
});

const packageBase = async () => {
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
    return {
      f,
      runIdentity,
      prefix,
      entry,
      manifestPath,
      catalogPath,
      packageBytes,
      manifestBytes,
      catalogBytes,
    };
  } catch (error) {
    f.close();
    throw error;
  }
};

test("recorded package failures preserve evidence and STOPPED re-entry never renews authority: missing recorded package returns explicit recovery before runtime calls", async () => {
  const {
    f,
    runIdentity,
    prefix,
    entry,
    manifestPath,
    catalogPath,
    packageBytes,
    manifestBytes,
    catalogBytes,
  } = await packageBase();
  const fault = "missing";
  try {
    if (fault === "missing") renameSync(entry, `${entry}.preserved`);
    // Import the public entry before damaging its own file; ESM retains only the test harness handle.
    const result = await f.entry({ specId: "I_1" });
    assert.equal(result.state, "UNAVAILABLE", JSON.stringify(result));
    assert.match(result.recovery, /Restore this exact trusted package/u);
    assert.deepEqual(f.store.readEvents(runIdentity.runId), prefix);
    assert.equal(f.calls.length, 0);
  } finally {
    if (fault === "missing") renameSync(`${entry}.preserved`, entry);
    writeFileSync(entry, packageBytes);
    writeFileSync(manifestPath, manifestBytes);
    writeFileSync(catalogPath, catalogBytes);
    f.close();
  }
});

test("recorded package failures preserve evidence and STOPPED re-entry never renews authority: modified recorded package returns explicit recovery before runtime calls", async () => {
  const {
    f,
    runIdentity,
    prefix,
    entry,
    manifestPath,
    catalogPath,
    packageBytes,
    manifestBytes,
    catalogBytes,
  } = await packageBase();
  const fault = "modified";
  try {
    if (fault === "modified")
      writeFileSync(
        entry,
        "throw new Error('modified package must not execute');\n",
      );
    // Import the public entry before damaging its own file; ESM retains only the test harness handle.
    const result = await f.entry({ specId: "I_1" });
    assert.equal(result.state, "UNAVAILABLE", JSON.stringify(result));
    assert.match(result.recovery, /Restore this exact trusted package/u);
    assert.deepEqual(f.store.readEvents(runIdentity.runId), prefix);
    assert.equal(f.calls.length, 0);
  } finally {
    writeFileSync(entry, packageBytes);
    writeFileSync(manifestPath, manifestBytes);
    writeFileSync(catalogPath, catalogBytes);
    f.close();
  }
});

test("recorded package failures preserve evidence and STOPPED re-entry never renews authority: incompatible recorded package returns explicit recovery before runtime calls", async () => {
  const {
    f,
    runIdentity,
    prefix,
    entry,
    manifestPath,
    catalogPath,
    packageBytes,
    manifestBytes,
    catalogBytes,
  } = await packageBase();
  const fault = "incompatible";
  try {
    if (fault === "incompatible") {
      const manifest = JSON.parse(manifestBytes);
      manifest.version.protocolVersion = 2;
      writeFileSync(manifestPath, JSON.stringify(manifest));
    }
    // Import the public entry before damaging its own file; ESM retains only the test harness handle.
    const result = await f.entry({ specId: "I_1" });
    assert.equal(result.state, "UNAVAILABLE", JSON.stringify(result));
    assert.match(result.recovery, /Restore this exact trusted package/u);
    assert.deepEqual(f.store.readEvents(runIdentity.runId), prefix);
    assert.equal(f.calls.length, 0);
  } finally {
    writeFileSync(entry, packageBytes);
    writeFileSync(manifestPath, manifestBytes);
    writeFileSync(catalogPath, catalogBytes);
    f.close();
  }
});

test("recorded package failures preserve evidence and STOPPED re-entry never renews authority: foreign-source recorded package returns explicit recovery before runtime calls", async () => {
  const {
    f,
    runIdentity,
    prefix,
    entry,
    manifestPath,
    catalogPath,
    packageBytes,
    manifestBytes,
    catalogBytes,
  } = await packageBase();
  const fault = "foreign-source";
  try {
    if (fault === "foreign-source") {
      const manifest = JSON.parse(manifestBytes);
      manifest.version.sourceRepository = join(f.root, "foreign");
      writeFileSync(manifestPath, JSON.stringify(manifest));
    }
    // Import the public entry before damaging its own file; ESM retains only the test harness handle.
    const result = await f.entry({ specId: "I_1" });
    assert.equal(result.state, "UNAVAILABLE", JSON.stringify(result));
    assert.match(result.recovery, /Restore this exact trusted package/u);
    assert.deepEqual(f.store.readEvents(runIdentity.runId), prefix);
    assert.equal(f.calls.length, 0);
  } finally {
    writeFileSync(entry, packageBytes);
    writeFileSync(manifestPath, manifestBytes);
    writeFileSync(catalogPath, catalogBytes);
    f.close();
  }
});

test("recorded package failures preserve evidence and STOPPED re-entry never renews authority: STOPPED keeps the original Grant and remains excluded from no-argument entry", async () => {
  const { f, runIdentity } = await packageBase();
  try {
    f.issues.get(1).events = [];
    // Observe the completed lane once so its exact settlement receipts are the retained
    // owner history this stop records against; re-entry must not renew that authority.
    await f.entry({ specId: "1" });
    f.issues.get(1).state = "open";
    const writer = f.store.acquireWriter(runIdentity.runId);
    writer.append({
      type: "control.revised",
      at: "2026-09-08T00:01:00.000Z",
      revision: 1,
      command: "STOP",
    });
    writer.append({
      type: "stop.transitioned",
      at: "2026-09-08T00:01:01.000Z",
      revision: 1,
    });
    writer.release();
    const before = f.store.readEvents(runIdentity.runId);
    const result = await f.entry({ specId: "1" });
    assert.equal(
      result.status.run.state,
      "STOPPED",
      JSON.stringify(result.status),
    );
    assert.deepEqual(f.store.readEvents(runIdentity.runId), before);
    assert.equal((await f.entry()).state, "SELECTION_REQUIRED");
  } finally {
    f.close();
  }
});
