import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createGitHubToTicketsAdapters } from "../../skills/personal/run-issue-workflow/scripts/github-to-tickets-adapters.mjs";
import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import { inspectGitHubToTickets, invokeGitHubToTickets } from "../../skills/personal/run-issue-workflow/scripts/github-to-tickets-entry.mjs";
import { digest, createGhTransport } from "../../skills/personal/run-issue-workflow/scripts/github-producer-transport.mjs";
import { bodyDigest, readWorkflowRecords } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity, createProducerOperationCheckpoint,
  deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const REPOSITORY = "ron03wlb/skills";
const repositoryId = `github:${REPOSITORY}`;
const readyLabel = "ready-for-agent";
const parentNumber = 169;
const parentIdentity = "I_169";
const issueUrl = number => `https://github.com/${REPOSITORY}/issues/${number}`;
const childBody = ({ key, blockers = [], seal, parent = parentNumber }) => {
  const parentReference = `[Spec #${parent}](${issueUrl(parent)})`;
  const blockedBy = blockers.length ? blockers.map(reference => `- \`${reference}\``).join("\n") : "None.";
  return `## Parent\n\n${parentReference}\n\n## Decomposition key\n\n\`${key}\`\n\n## What to build\n\nDeliver ${key}.\n\n## Acceptance Criteria\n\n- **AC-1 - Complete:** The outcome is verified.\n\n## Implementation Plan\n\n### Step 1: Deliver\n\nImplement the outcome. **Covers: AC-1.**\n\n## Verification\n\n- Run the focused check. **Covers: AC-1.**\n\n## Blocked by\n\n${blockedBy}\n\n## Planning baseline\n\n- Commit: ${seal}\n- Seal: reused\n\n## Target\n\n\`target\`\n`;
};
const recordOf = body => JSON.parse(body.match(/^```workflow-record\n([\s\S]+)\n```$/u)[1]);

function fixture(t) {
  const repository = mkdtempSync(join(tmpdir(), "github-to-tickets-test-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git("init", "-b", "target");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repository, "source.txt"), "source\n");
  git("add", "source.txt");
  git("commit", "-m", "fixture");
  git("remote", "add", "origin", `https://github.com/${REPOSITORY}.git`);
  const seal = git("rev-parse", "HEAD");
  const parentBody = "# Approved Multi-Issue Spec\n\nDeliver two children.\n";
  let sequence = 200;
  const issues = new Map();
  const comments = new Map();
  const parents = new Map();
  const dependencies = new Map();
  const calls = [];
  const failures = { rejectNextDependency: false, unresolvedNativeProbe: false, failAfterWrite: false, rejectNextParentRead: false, unverifiedParentRead: false };
  const issue = (number, values = {}) => ({ id: 5000000000 + number, node_id: `I_${number}`, number,
    title: values.title ?? "Approved parent", body: values.body ?? parentBody,
    labels: (values.labels ?? []).map(name => ({ name })), state: values.state ?? "open",
    updated_at: `2026-09-11T00:00:${String(number % 60).padStart(2, "0")}Z`,
    html_url: issueUrl(number), sub_issues_summary: { total: 0, completed: 0, percent_completed: 0 },
    issue_dependencies_summary: { blocked_by: 0, total_blocked_by: 0, blocking: 0, total_blocking: 0 } });
  issues.set(parentNumber, issue(parentNumber, { labels: [readyLabel] }));
  comments.set(parentNumber, []);
  const addChild = (number, values = {}) => {
    const created = issue(number, values);
    issues.set(number, created);
    comments.set(number, []);
    return created;
  };
  const touch = current => { current.updated_at = `2026-09-12T00:00:${String(++sequence % 60).padStart(2, "0")}Z`; };
  const rowsOf = numbers => numbers.map(number => structuredClone(issues.get(number)));
  const respond = async request => {
    calls.push(structuredClone(request));
    if (request.graphql) {
      const found = [...issues.values()].find(row => row.node_id === request.graphql.variables?.id);
      return { node: found ? { id: found.node_id, number: found.number, repository: { nameWithOwner: REPOSITORY } } : null };
    }
    const { method = "GET", path, body } = request;
    const route = new URL(path, "https://fixture/").pathname;
    let result;
    if (route === `/repos/${REPOSITORY}`) result = [{ full_name: REPOSITORY, node_id: "R_1", html_url: `https://github.com/${REPOSITORY}` }];
    else if (route === "/user") result = [{ id: 7, login: "ron03wlb" }];
    else if (route === `/repos/${REPOSITORY}/labels`) result = { name: readyLabel };
    else if (route === `/repos/${REPOSITORY}/issues`) {
      if (method === "POST") {
        const created = issue(++sequence, { title: body.title, body: body.body });
        issues.set(created.number, created);
        comments.set(created.number, []);
        result = created;
      } else result = [...issues.values()].map(current => structuredClone(current));
    } else {
      const match = route.match(new RegExp(`^/repos/${REPOSITORY}/issues/(\\d+)(/comments|/parent|/sub_issues|/dependencies/(?:blocked_by|blocking))?$`, "u"));
      if (!match) throw new Error(`Unexpected fixture request ${method} ${path}`);
      const number = Number(match[1]);
      const current = issues.get(number);
      if (!current) throw new Error(`Unknown fixture Issue ${number}`);
      const sub = match[2];
      if (!sub) {
        if (method === "PATCH") {
          if (body.body !== undefined) current.body = body.body;
          if (body.labels !== undefined) current.labels = body.labels.map(name => ({ name }));
          touch(current);
        }
        result = current;
      } else if (sub === "/comments") {
        const rows = comments.get(number);
        if (method === "POST") {
          const created = { node_id: `IC_${++sequence}`, id: 6000 + sequence, body: body.body,
            author_association: "OWNER", user: { login: "ron03wlb" }, created_at: "2026-09-11T00:00:00Z" };
          rows.push(created);
          result = created;
        } else result = rows.map(row => structuredClone(row));
      } else if (sub === "/parent") {
        if (failures.unverifiedParentRead) {
          failures.unverifiedParentRead = false;
          throw Object.assign(new Error("fixture parent read without a verified result"), { code: "GITHUB_PRODUCER_TRANSPORT",
            httpStatus: null, outcome: "UNRESOLVED", requestId: null });
        }
        if (failures.rejectNextParentRead) {
          failures.rejectNextParentRead = false;
          throw Object.assign(new Error("fixture parent read failure"), { code: "GITHUB_PRODUCER_TRANSPORT",
            httpStatus: 500, outcome: "UNRESOLVED", requestId: "fixture-parent" });
        }
        const parent = parents.get(number);
        if (!parent) throw Object.assign(new Error("fixture: no parent"), { code: "GITHUB_PRODUCER_TRANSPORT",
          httpStatus: 404, outcome: "REJECTED", requestId: "fixture-parent-missing" });
        result = issues.get(parent);
      } else if (sub === "/sub_issues") {
        if (method === "GET" && failures.unresolvedNativeProbe) {
          throw Object.assign(new Error("fixture native probe failure"), { code: "GITHUB_PRODUCER_TRANSPORT",
            httpStatus: 500, outcome: "UNRESOLVED", requestId: "fixture-native-probe" });
        }
        if (method === "POST") {
          const child = [...issues.values()].find(row => row.id === body.sub_issue_id);
          if (!child) throw new Error(`Unknown sub-issue id ${body.sub_issue_id}`);
          parents.set(child.number, number);
          result = child;
        } else result = rowsOf([...parents.entries()].filter(([, parent]) => parent === number).map(([child]) => child));
      } else if (sub === "/dependencies/blocking") {
        result = rowsOf([...dependencies.entries()].filter(([, blockers]) => blockers.includes(number)).map(([child]) => child));
      } else if (method === "POST") {
        if (failures.rejectNextDependency) {
          failures.rejectNextDependency = false;
          throw Object.assign(new Error("fixture rejection"), { code: "GITHUB_PRODUCER_TRANSPORT",
            httpStatus: 422, outcome: "REJECTED", requestId: "fixture-dependency-rejection" });
        }
        const blocker = [...issues.values()].find(row => row.id === body.issue_id);
        if (!blocker) throw new Error(`Unknown dependency id ${body.issue_id}`);
        dependencies.set(number, [...new Set([...(dependencies.get(number) ?? []), blocker.number])]);
        result = blocker;
      } else result = rowsOf(dependencies.get(number) ?? []);
    }
    if (method !== "GET" && failures.failAfterWrite) {
      failures.failAfterWrite = false;
      throw new Error("lost response after application");
    }
    if (method === "GET") return Array.isArray(result) ? structuredClone(result) : [structuredClone(result)];
    return structuredClone(result);
  };
  const transport = respond;
  // The identical fixture API rendered the way the configured `gh` writes stdout: a `--include` envelope for
  // every request, wrapped in the slurp array for paginated reads, and a non-zero exit that still reports the
  // rejected envelope on stdout. Only an unanswered request carries no HTTP result at all.
  const ghExecute = respond => async (_command, args, options) => {
    if (args[1] === "graphql") {
      const variables = {}; let query = "";
      for (let index = 3; index < args.length; index += 2) {
        const [key, ...rest] = args[index].split("=");
        if (key === "query") query = rest.join("="); else variables[key] = rest.join("=");
      }
      return JSON.stringify({ data: await respond({ graphql: { query, variables } }) });
    }
    if (!args.includes("--include")) throw new Error(`Unexpected probe invocation ${args.join(" ")}`);
    const render = (status, value) =>
      `HTTP/2.0 ${status}\nx-github-request-id: FIXTURE-REQUEST\ncontent-type: application/json; charset=utf-8\n\n${JSON.stringify(value)}`;
    try {
      const result = await respond({ path: args[1], method: args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET",
        body: options.input === undefined ? undefined : JSON.parse(options.input) });
      return args.includes("--slurp") ? `[${render("200 OK", result)}]` : render("201 Created", result);
    } catch (error) {
      if (error.httpStatus === undefined) throw new Error(error.message);
      const rejected = render(`${error.httpStatus} Rejected`, { message: error.message, status: String(error.httpStatus) });
      throw Object.assign(new Error(error.message), { stdout: args.includes("--slurp") ? `[${rejected}]` : rejected });
    }
  };
  const ghTransport = () => createGhTransport({ repository, execute: ghExecute(respond) });
  const execute = (_command, args) => {
    if (args[0] === "api" && args[1] === "--paginate" && args[2] === "--slurp") return JSON.stringify([{ full_name: REPOSITORY }]);
    if (args[0] === "api" && args[1] === "user") return JSON.stringify({ id: 7, login: "ron03wlb" });
    throw new Error(`Unexpected probe invocation ${args.join(" ")}`);
  };
  const addRecord = (number, record) => {
    const created = { node_id: `IC_${++sequence}`, id: 6000 + sequence,
      body: `\`\`\`workflow-record\n${JSON.stringify(record, null, 2)}\n\`\`\``, author_association: "OWNER",
      user: { login: "ron03wlb" }, created_at: "2026-09-11T00:00:00Z" };
    comments.get(number).push(created);
    return { identity: created.node_id, bodySha256: bodyDigest(created.body) };
  };
  const gitCommonDir = realpathSync.native(resolve(repository, git("rev-parse", "--git-common-dir")));
  const store = createWorkflowControlStore({ gitCommonDir });
  const approvedScopeHash = bodyDigest(parentBody);
  const authority = { specId: parentIdentity, target: "target", planningSeal: seal, classification: "MULTI",
    approvedScopeHash, decompositionIdentity: null };
  const specIdentity = bindProducerCheckpointOperationIdentity({ repositoryId, specId: parentIdentity,
    producerCommand: "to-spec", profileVersion: "v2", target: "target", baseline: seal,
    bindings: { planningSeal: seal, classification: "MULTI", approvedScopeIdentity: approvedScopeHash,
      trackerIdentity: parentIdentity, relevantFacts: {} } });
  let transaction = createProducerOperationCheckpoint({ store, identity: specIdentity });
  transaction = store.advanceCheckpoint({ identity: specIdentity, stage: "planning_seal.read_back",
    receipt: { planningSeal: seal, state: "reused", target: "target" } });
  const publicationRecord = { kind: "spec_publication", repositoryId, operationKey: specIdentity.operationId,
    authority, trackerIdentity: parentIdentity, transactionIdentity: transaction.transactionId,
    version: digest("parent-version"), labels: [readyLabel] };
  const publication = addRecord(parentNumber, publicationRecord);
  const publicationReceipt = { publicationIdentity: publication.identity, publicationDigest: publication.bodySha256,
    trackerIdentity: parentIdentity, version: publicationRecord.version, approvedScopeIdentity: approvedScopeHash,
    target: "target", planningSeal: seal, classification: "MULTI" };
  transaction = store.advanceCheckpoint({ identity: specIdentity, stage: "publication.read_back", receipt: publicationReceipt });
  const handoffRecord = { kind: "producer_handoff", repositoryId, operationKey: specIdentity.operationId,
    producerCommand: "to-spec", specId: parentIdentity, target: "target", planningSeal: seal,
    classification: "MULTI", approvedScopeHash, decompositionIdentity: null, checkpointIdentity: specIdentity,
    transactionIdentity: transaction.transactionId, publicationIdentity: publication.identity,
    publicationDigest: publication.bodySha256, trackerIdentity: parentIdentity,
    recordIdentities: [publication.identity], preparation: null };
  const handoff = addRecord(parentNumber, handoffRecord);
  store.advanceCheckpoint({ identity: specIdentity, stage: "handoff.completed",
    receipt: { handoffIdentity: handoff.identity, handoffDigest: handoff.bodySha256 } });
  const writes = () => calls.filter(call => call.method && call.method !== "GET");
  const writeBinding = () => {
    mkdirSync(join(repository, "docs/agents"), { recursive: true });
    writeFileSync(join(repository, "docs/agents/github-producer.json"),
      `${JSON.stringify({ schema: "github-producer:v1", repository: REPOSITORY }, null, 2)}\n`, { flag: "wx" });
  };
  const options = { repository, configuration: { schema: "github-producer:v1", repository: REPOSITORY },
    transport, execute, specId: parentNumber, target: "target", upstreamHandoffIdentity: handoff.identity };
  return { repository, seal, gitCommonDir, store, issues, comments, parents, dependencies, calls, failures, transport, respond, ghTransport,
    execute, writes, writeBinding, addChild, addRecord, issue, options, publication, publicationRecord, handoff, handoffRecord,
    specIdentity, approvedScopeHash, parentBody };
}

async function start(f, options = {}) {
  const adapter = await createGitHubToTicketsAdapters({ ...f.options, ...options });
  assert.equal(adapter.upstream.readPublication().publicationIdentity, f.publication.identity);
  assert.equal(adapter.upstream.readHandoff({ publicationIdentity: f.publication.identity }).handoffIdentity, f.handoff.identity);
  const identity = adapter.checkpoint.identity({ baseline: f.seal });
  assert.equal((await adapter.checkpoint.create(identity)).nextStage, "decomposition.read_back");
  return { adapter, identity };
}

async function publishChildren(f, context, representation) {
  const keys = ["169/01", "169/02"];
  const first = { key: keys[0], title: "First child", body: childBody({ key: keys[0], seal: f.seal }) };
  const firstRead = await context.adapter.tracker.publishChild({ identity: context.identity, child: first,
    preflight: await context.adapter.tracker.discoverChildren({ keys, externalBlockers: [] }) });
  const second = { key: keys[1], title: "Second child",
    body: childBody({ key: keys[1], blockers: [issueUrl(firstRead.nativeIssueNumber)], seal: f.seal }) };
  const secondRead = await context.adapter.tracker.publishChild({ identity: context.identity, child: second,
    preflight: await context.adapter.tracker.discoverChildren({ keys, externalBlockers: [] }) });
  if (representation === "native") {
    await context.adapter.tracker.publishRelation({ identity: context.identity,
      relation: { kind: "blocker", childKey: second.key, child: secondRead.trackerIdentity,
        blocker: firstRead.trackerIdentity },
      preflight: await context.adapter.tracker.discoverChildren({ keys, externalBlockers: [] }) });
  }
  return { first, firstRead, second, secondRead, keys,
    mapping: { [first.key]: firstRead.trackerIdentity, [second.key]: secondRead.trackerIdentity },
    edges: [{ blocker: firstRead.trackerIdentity, blocked: secondRead.trackerIdentity }] };
}

const preflightFor = (context, keys, externalBlockers = []) =>
  context.adapter.tracker.discoverChildren({ keys, externalBlockers });

test("native representation publishes and reads the exact decomposition, frontier and composite handoff", async t => {
  const f = fixture(t);
  const context = await start(f);
  assert.equal(context.adapter.blockingRepresentation, "native");
  assert.equal(context.adapter.representationSelection.nativeParentRelation, true);
  assert.deepEqual(await context.adapter.tracker.discoverChildren({ keys: ["169/01", "169/02"], externalBlockers: [] }),
    { blockingRepresentation: "native", matches: { "169/01": [], "169/02": [] }, externalBlockers: [] });
  const children = await publishChildren(f, context, "native");
  assert.equal(f.parents.get(children.firstRead.nativeIssueNumber), parentNumber, "the child carries a native parent relation");
  assert.equal((await context.adapter.tracker.readChild({ ...children.second,
    trackerIdentity: children.secondRead.trackerIdentity })).nativeBlockers[0], children.firstRead.trackerIdentity);
  f.issues.get(children.firstRead.nativeIssueNumber).title = "Non-authoritative title edit";
  assert.equal((await context.adapter.tracker.readChild({ ...children.first, trackerIdentity: children.firstRead.trackerIdentity })).key,
    children.first.key, "titles are never child identity");
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: children.mapping, blockerEdges: children.edges, children: [children.first, children.second],
    preflight: await preflightFor(context, children.keys) });
  assert.deepEqual(decomposition, { decompositionIdentity: decomposition.decompositionIdentity,
    decompositionDigest: decomposition.decompositionDigest });
  const record = recordOf(f.comments.get(parentNumber).at(-1).body);
  assert.equal(record.kind, "decomposition:v1");
  assert.equal(record.parent, parentIdentity);
  assert.equal(record.repositoryId, repositoryId);
  assert.deepEqual(record.decompositionMapping, children.mapping);
  assert.deepEqual(record.blockerEdges, children.edges);
  assert.deepEqual(record.readyFrontier, [children.firstRead.trackerIdentity]);
  assert.equal(record.childBodyDigests[children.firstRead.trackerIdentity], bodyDigest(children.first.body));
  assert.equal(record.blockingRepresentation, "native");
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "decomposition.read_back", receipt: decomposition });
  const ready = await context.adapter.tracker.writeReadyState({ identity: context.identity });
  assert.deepEqual(ready.frontier, [children.firstRead.trackerIdentity]);
  assert.equal(ready.consistent, true);
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "ready_state.read_back", receipt: ready });
  const handoff = await context.adapter.handoff.append({ identity: context.identity });
  const completed = await context.adapter.checkpoint.advance({ identity: context.identity,
    stage: "handoff.completed", receipt: handoff });
  assert.equal(completed.state, "COMPLETED");
  assert.equal(f.issues.get(children.firstRead.nativeIssueNumber).labels.some(label => label.name === readyLabel), true);
  assert.equal(f.issues.get(children.secondRead.nativeIssueNumber).labels.some(label => label.name === readyLabel), false);
  assert.deepEqual(f.dependencies.get(children.secondRead.nativeIssueNumber),
    [children.firstRead.nativeIssueNumber], "the native blocking relation is published");
  const written = recordOf(f.comments.get(parentNumber).at(-1).body);
  assert.equal(written.kind, "producer_handoff");
  assert.equal(written.producerCommand, "to-tickets");
  assert.equal(written.decompositionIdentity, decomposition.decompositionIdentity);
  assert.equal(written.decompositionDigest, decomposition.decompositionDigest);
  assert.equal(written.publicationIdentity, decomposition.decompositionIdentity);
  assert.deepEqual(written.recordIdentities, [f.publication.identity, decomposition.decompositionIdentity]);
  assert.deepEqual(written.operationReceipt, { transactionIdentity: completed.transactionId,
    decompositionReadBack: decomposition, readyStateReadBack: ready });
  assert.deepEqual(written.upstream, { publicationIdentity: f.publication.identity, handoffIdentity: f.handoff.identity });
  const read = readWorkflowRecords(f.comments.get(parentNumber));
  assert.deepEqual(read.at(-1).record, written, "the composite handoff reads back through the installed record reader");
  const writeCount = f.writes().length;
  f.issues.get(children.firstRead.nativeIssueNumber).state = "closed";
  assert.deepEqual(await context.adapter.handoff.read({ identity: context.identity }), handoff,
    "a completed handoff stays readable after child lifecycle changes");
  await assert.rejects(() => context.adapter.tracker.writeReadyState({ identity: context.identity }),
    { code: "GITHUB_PRODUCER_CONFLICT" });
  assert.equal(f.writes().length, writeCount, "a completed ready-state receipt authorizes no later label write");
  await assert.rejects(() => createGitHubToTicketsAdapters({ ...f.options, readyLabel: "wontfix" }),
    { code: "GITHUB_PRODUCER_CONFLICT" },
    "a ready label the upstream publication does not bind is refused before mutation");
});

test("a restart retry reuses the published children, record and handoff without a duplicate write", async t => {
  const f = fixture(t);
  const context = await start(f);
  const children = await publishChildren(f, context, "native");
  const replay = await createGitHubToTicketsAdapters(f.options);
  const childRetry = await replay.tracker.publishChild({ identity: context.identity, child: children.first,
    preflight: await preflightFor({ adapter: replay }, children.keys) });
  assert.equal(childRetry.trackerIdentity, children.firstRead.trackerIdentity, "a retried child publication reuses the Issue");
  const request = { identity: context.identity, decompositionMapping: children.mapping,
    blockerEdges: children.edges, children: [children.first, children.second],
    preflight: await preflightFor({ adapter: replay }, children.keys) };
  const decomposition = await replay.tracker.publishDecomposition(request);
  const recordsAfterDecomposition = f.comments.get(parentNumber).length;
  assert.deepEqual(await context.adapter.tracker.publishDecomposition({ ...request,
    preflight: await preflightFor(context, children.keys) }), decomposition,
  "a retried decomposition publication resolves to the existing record");
  assert.equal(f.comments.get(parentNumber).length, recordsAfterDecomposition, "a retried decomposition appends no second record");
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "decomposition.read_back", receipt: decomposition });
  const ready = await context.adapter.tracker.writeReadyState({ identity: context.identity });
  assert.deepEqual(await replay.tracker.writeReadyState({ identity: context.identity }), ready);
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "ready_state.read_back", receipt: ready });
  const handoff = await context.adapter.handoff.append({ identity: context.identity });
  assert.deepEqual(await replay.handoff.append({ identity: context.identity }), handoff);
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "handoff.completed", receipt: handoff });
  assert.equal(f.comments.get(parentNumber).length, recordsAfterDecomposition + 1, "a retry appends no second handoff or decomposition record");
  assert.equal([...f.issues.keys()].filter(number => number > parentNumber).length, 2, "a retry creates no second child");
  assert.equal(f.parents.size, 2, "a retry publishes no second native parent relation");
  assert.deepEqual(f.dependencies.get(children.secondRead.nativeIssueNumber),
    [children.firstRead.nativeIssueNumber], "a retry publishes no second native blocking relation");
});

test("a lost response after a child creation is resolved by read-back instead of a second child", async t => {
  const f = fixture(t);
  const context = await start(f);
  const key = "169/01";
  const child = { key, title: "First child", body: childBody({ key, seal: f.seal }) };
  f.failures.failAfterWrite = true;
  const published = await context.adapter.tracker.publishChild({ identity: context.identity, child,
    preflight: await preflightFor(context, [key]) });
  assert.equal(published.key, key);
  assert.equal([...f.issues.keys()].filter(number => number > parentNumber).length, 1, "exactly one child exists");
  assert.equal(context.adapter.tracker.readChildMutation({ identity: context.identity, child }).state, "UNRESOLVED",
    "the lost response is preserved as unresolved evidence, never as success");
  const retried = await context.adapter.tracker.publishChild({ identity: context.identity, child,
    preflight: await preflightFor(context, [key]) });
  assert.equal(retried.trackerIdentity, published.trackerIdentity, "a retry resolves the same Issue by read-back");
  assert.equal([...f.issues.keys()].filter(number => number > parentNumber).length, 1, "a retry creates no second child");
  assert.equal((await context.adapter.tracker.readChild({ ...child, trackerIdentity: published.trackerIdentity })).trackerIdentity,
    published.trackerIdentity);
});

test("body representation publishes no native relation and refuses a native-blocker mismatch", async t => {
  const f = fixture(t);
  const context = await start(f, { blockingRepresentation: "body" });
  assert.equal(context.adapter.blockingRepresentation, "body");
  const children = await publishChildren(f, context, "body");
  assert.equal(f.parents.size, 0, "body representation publishes no native parent relation");
  assert.equal(f.dependencies.size, 0, "body representation publishes no native blocking relation");
  const bodyRelationPreflight = await preflightFor(context, children.keys);
  await assert.rejects(() => context.adapter.tracker.publishRelation({ identity: context.identity,
    relation: { kind: "blocker", childKey: children.second.key, child: children.secondRead.trackerIdentity,
      blocker: children.firstRead.trackerIdentity },
    preflight: bodyRelationPreflight }), { code: "GITHUB_PRODUCER_CONFLICT" });
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: children.mapping, blockerEdges: children.edges, children: [children.first, children.second],
    preflight: await preflightFor(context, children.keys) });
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "decomposition.read_back", receipt: decomposition });
  const ready = await context.adapter.tracker.writeReadyState({ identity: context.identity });
  assert.deepEqual(ready.frontier, [children.firstRead.trackerIdentity]);
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "ready_state.read_back", receipt: ready });
  const handoff = await context.adapter.handoff.append({ identity: context.identity });
  assert.match(handoff.handoffIdentity, /^IC_[0-9]+$/u);

  const other = fixture(t);
  const native = await start(other);
  const nativeChildren = await publishChildren(other, native, "native");
  const bodyMode = await createGitHubToTicketsAdapters({ ...other.options, blockingRepresentation: "body" });
  const nativePreflight = await bodyMode.tracker.discoverChildren({ keys: nativeChildren.keys, externalBlockers: [] });
  await assert.rejects(() => bodyMode.tracker.publishDecomposition({ identity: native.identity,
    decompositionMapping: nativeChildren.mapping, blockerEdges: nativeChildren.edges,
    children: [nativeChildren.first, nativeChildren.second],
    preflight: nativePreflight }),
  { code: "GITHUB_PRODUCER_CONFLICT" }, "body representation cannot retain native blocking relations");
});

test("the full decomposition path completes through the real transport over a gh-shaped CLI", async t => {
  const f = fixture(t);
  // Every read below goes through the real transport: unenveloped GET output is what made the absent-parent
  // read unverified, so this test fails whenever a rejection cannot be attributed to its exact status.
  const context = await start(f, { transport: f.ghTransport() });
  assert.equal(context.adapter.blockingRepresentation, "native");
  const children = await publishChildren(f, context, "native");
  assert.equal(f.parents.get(children.firstRead.nativeIssueNumber), parentNumber, "the native parent relation is published");
  assert.deepEqual(f.dependencies.get(children.secondRead.nativeIssueNumber), [children.firstRead.nativeIssueNumber],
    "the native blocking relation is published");
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: children.mapping, blockerEdges: children.edges, children: [children.first, children.second],
    preflight: await preflightFor(context, children.keys) });
  assert.equal(recordOf(f.comments.get(parentNumber).at(-1).body).kind, "decomposition:v1");
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "decomposition.read_back", receipt: decomposition });
  const ready = await context.adapter.tracker.writeReadyState({ identity: context.identity });
  assert.deepEqual(ready.frontier, [children.firstRead.trackerIdentity]);
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "ready_state.read_back", receipt: ready });
  const handoff = await context.adapter.handoff.append({ identity: context.identity });
  assert.equal(f.issues.get(children.firstRead.nativeIssueNumber).labels.some(label => label.name === readyLabel), true);
  assert.deepEqual((await context.adapter.handoff.read({ identity: context.identity })), handoff);
  const written = recordOf(f.comments.get(parentNumber).at(-1).body);
  assert.equal(written.kind, "producer_handoff");
  assert.equal(written.decompositionIdentity, decomposition.decompositionIdentity);
  assert.deepEqual(readWorkflowRecords(f.comments.get(parentNumber)).at(-1).record, written,
    "the composite handoff reads back through the installed record reader");
});

test("a child without a native parent is readable in both blocking representations", async t => {
  for (const representation of ["native", "body"]) {
    const f = fixture(t);
    const context = await start(f, { blockingRepresentation: representation });
    const key = "169/01";
    const child = { key, title: "First child", body: childBody({ key, seal: f.seal }) };
    const existing = f.addChild(180, { title: child.title, body: child.body });
    assert.equal(f.parents.has(existing.number), false, "the fixture child has no native parent yet");
    const published = await context.adapter.tracker.publishChild({ identity: context.identity, child,
      preflight: await preflightFor(context, [key]) });
    assert.ok(f.calls.some(call => typeof call.path === "string" && call.path.endsWith(`/issues/${existing.number}/parent`)),
      "the absent-parent read was exercised");
    assert.equal(published.trackerIdentity, existing.node_id, "the parentless child reads back by its key");
    assert.equal(published.key, key);
    assert.deepEqual(published.blockers, []);
    assert.equal(published.parent ?? null, representation === "native" ? parentIdentity : null);
    assert.equal(f.parents.get(existing.number) ?? null, representation === "native" ? parentNumber : null,
      "only the native representation publishes the parent relation");
  }
});

test("a parent read without a verified HTTP result is never read as an absent native parent", async t => {
  const f = fixture(t);
  const context = await start(f, { blockingRepresentation: "body" });
  const key = "169/01";
  const child = { key, title: "First child", body: childBody({ key, seal: f.seal }) };
  f.failures.unverifiedParentRead = true;
  const preflight = await preflightFor(context, [key]);
  await assert.rejects(() => context.adapter.tracker.publishChild({ identity: context.identity, child, preflight }),
  error => error.code === "GITHUB_PRODUCER_TRANSPORT" && error.httpStatus === null && error.outcome === "UNRESOLVED",
  "an unverified read result is never tolerated as an absent native parent");
  assert.equal(f.parents.size, 0, "no parent relation is fabricated from an unverified read");
});

test("External blockers require one complete read-only preflight before child or relation mutation", async t => {
  const f = fixture(t);
  const external = f.addChild(190, { title: "External blocker", body: "External work" });
  const context = await start(f);
  const key = "169/01";
  const child = { key, title: "Externally blocked child",
    body: childBody({ key, blockers: [issueUrl(external.number)], seal: f.seal }) };
  const before = f.writes().length;
  await assert.rejects(() => context.adapter.tracker.publishChild({ identity: context.identity, child }),
    { code: "GITHUB_PRODUCER_CONFLICT" });
  assert.equal(f.writes().length, before);
  const preflight = await preflightFor(context, [key], [issueUrl(external.number)]);
  assert.equal(preflight.externalBlockers[0].trackerIdentity, external.node_id);
  const published = await context.adapter.tracker.publishChild({ identity: context.identity, child, preflight });
  const mapping = { [key]: published.trackerIdentity };
  const edges = [{ blocker: external.node_id, blocked: published.trackerIdentity }];
  const externalRelation = { kind: "blocker", childKey: key, child: published.trackerIdentity, blocker: external.node_id };
  await context.adapter.tracker.publishRelation({ identity: context.identity, relation: externalRelation,
    preflight: await preflightFor(context, [key], [issueUrl(external.number)]) });
  assert.deepEqual(f.dependencies.get(published.nativeIssueNumber), [external.number],
    "an External blocker edge is published natively in native representation");
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: mapping, blockerEdges: edges, children: [child],
    preflight: await preflightFor(context, [key], [issueUrl(external.number)]) });
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "decomposition.read_back", receipt: decomposition });
  const ready = await context.adapter.tracker.writeReadyState({ identity: context.identity });
  assert.deepEqual(ready.frontier, [], "an open External blocker keeps the child out of the frontier");
  const reversed = { key, title: "Wrong order", body: childBody({ key,
    blockers: [issueUrl(external.number + 1), issueUrl(external.number)], seal: f.seal }) };
  await assert.rejects(() => context.adapter.tracker.readChild({ ...reversed, trackerIdentity: published.trackerIdentity }),
    { code: "GITHUB_PRODUCER_CONFLICT" });
});

test("a rejected native blocking relation retains exact partial evidence and resumes by read-back", async t => {
  const f = fixture(t);
  const context = await start(f, { blockingRepresentation: "native" });
  const children = await publishChildren(f, context, "body");
  await assert.rejects(() => context.adapter.tracker.readChild({ ...children.second,
    trackerIdentity: children.secondRead.trackerIdentity }), { code: "GITHUB_PRODUCER_CONFLICT" });
  const relation = { kind: "blocker", childKey: children.second.key,
    child: children.secondRead.trackerIdentity, blocker: children.firstRead.trackerIdentity };
  f.failures.rejectNextDependency = true;
  const relationPreflight = await preflightFor(context, children.keys);
  await assert.rejects(() => context.adapter.tracker.publishRelation({ identity: context.identity, relation,
    preflight: relationPreflight }), { code: "GITHUB_PRODUCER_REJECTED" });
  const partial = context.adapter.tracker.readPartialRelations({ identity: context.identity })[0];
  assert.equal(partial.outcome, "REJECTED");
  assert.equal(partial.readBack.state, "ABSENT");
  assert.equal(context.adapter.tracker.readRelationMutation({ identity: context.identity, relation }).state, "REJECTED");
  const recovered = await context.adapter.tracker.publishRelation({ identity: context.identity, relation,
    preflight: await preflightFor(context, children.keys), retryRejected: true });
  assert.equal(recovered.kind, "blocker");
  assert.equal((await context.adapter.tracker.readChild({ ...children.second,
    trackerIdentity: children.secondRead.trackerIdentity })).nativeBlockers[0], children.firstRead.trackerIdentity);
  assert.deepEqual(await context.adapter.tracker.readRelation({ relation }), recovered);
});

test("a rejected native relation with exact ABSENT read-back can adopt verified body representation", async t => {
  const f = fixture(t);
  const native = await start(f, { blockingRepresentation: "native" });
  const children = await publishChildren(f, native, "body");
  const relation = { kind: "blocker", childKey: children.second.key,
    child: children.secondRead.trackerIdentity, blocker: children.firstRead.trackerIdentity };
  f.failures.rejectNextDependency = true;
  const relationPreflight = await preflightFor(native, children.keys);
  await assert.rejects(() => native.adapter.tracker.publishRelation({ identity: native.identity, relation,
    preflight: relationPreflight }), { code: "GITHUB_PRODUCER_REJECTED" });
  assert.equal(native.adapter.tracker.readPartialRelations({ identity: native.identity })[0].readBack.state, "ABSENT");
  const body = await createGitHubToTicketsAdapters({ ...f.options, blockingRepresentation: "body" });
  assert.deepEqual(body.checkpoint.identity({ baseline: f.seal }), native.identity,
    "representation is not part of the operation identity");
  const decomposition = await body.tracker.publishDecomposition({ identity: native.identity,
    decompositionMapping: children.mapping, blockerEdges: children.edges, children: [children.first, children.second],
    preflight: await body.tracker.discoverChildren({ keys: children.keys, externalBlockers: [] }) });
  assert.match(decomposition.decompositionIdentity, /^IC_[0-9]+$/u);
  assert.equal(f.dependencies.size, 0, "the adopted body decomposition publishes no native blocking relation");
});

test("an unrelated operation or record is never treated as conflicting, and an unknown action mutates nothing", async t => {
  const f = fixture(t);
  f.writeBinding();
  f.addRecord(parentNumber, { kind: "implementation_blocked", issueId: f.issue(190).node_id, specId: "I_190",
    reasonCode: "target_dirty" });
  const context = await start(f);
  const keys = ["169/01"];
  const child = { key: keys[0], title: "First child", body: childBody({ key: keys[0], seal: f.seal }) };
  const published = await context.adapter.tracker.publishChild({ identity: context.identity, child,
    preflight: await preflightFor(context, keys) });
  assert.equal(published.key, keys[0]);
  assert.equal(await context.adapter.tracker.readDecomposition(context.identity), null);
  const before = f.writes().length;
  await assert.rejects(() => invokeGitHubToTickets({ repository: f.repository, input: { action: "publish-everything" },
    transport: f.transport, execute: f.execute }), { code: "GITHUB_PRODUCER_CONFLICT" });
  const invoked = await invokeGitHubToTickets({ repository: f.repository, transport: f.transport, execute: f.execute,
    input: { action: "decomposition-read", specId: parentNumber, target: "target",
      upstreamHandoffIdentity: f.handoff.identity, request: context.identity } });
  assert.equal(invoked, null);
  await assert.rejects(() => invokeGitHubToTickets({ repository: f.repository, transport: f.transport, execute: f.execute,
    input: { action: "identity", specId: parentNumber, target: "other-target",
      upstreamHandoffIdentity: f.handoff.identity, request: { baseline: f.seal } } }),
  { code: "GITHUB_PRODUCER_CONFLICT" });
  assert.equal(f.writes().length, before, "refused invocations mutate nothing");
  assert.equal(readFileSync(join(f.repository, "source.txt"), "utf8"), "source\n");
});

test("a missing binding and an unprovable representation each refuse before mutation", async t => {
  const f = fixture(t);
  assert.deepEqual(await inspectGitHubToTickets({ repository: f.repository, transport: f.transport, execute: f.execute }),
    { state: "MISSING", owningSource: join(f.repository, "docs/agents/github-producer.json"),
      nextAction: "Explicitly run github-producer-entry.mjs configure for this repository." });
  await assert.rejects(() => invokeGitHubToTickets({ repository: f.repository, transport: f.transport, execute: f.execute,
    input: { action: "identity", specId: parentNumber, target: "target",
      upstreamHandoffIdentity: f.handoff.identity, request: { baseline: f.seal } } }),
  { code: "GITHUB_PRODUCER_CONFLICT" });
  f.writeBinding();
  const inspected = await inspectGitHubToTickets({ repository: f.repository, transport: f.transport, execute: f.execute });
  assert.equal(inspected.state, "PRESENT");
  assert.equal(inspected.support.producer, "to-tickets@v2");
  assert.equal(inspected.support.parentFallback, "canonical-body");
  assert.equal(inspected.repositoryId, repositoryId);

  const broken = fixture(t);
  broken.failures.unresolvedNativeProbe = true;
  await assert.rejects(() => createGitHubToTicketsAdapters({ ...broken.options, specId: parentNumber }),
    { code: "GITHUB_PRODUCER_CONFLICT" });
  assert.equal(broken.writes().length, 0, "an unproven representation refuses before any mutation");
});

test("downstream records without their transaction stop creation and are preserved", async t => {
  const f = fixture(t);
  const adapter = await createGitHubToTicketsAdapters(f.options);
  const identity = adapter.checkpoint.identity({ baseline: f.seal });
  const intentRoot = join(f.gitCommonDir, "matt-workflow-control", "github-producer-intents");
  mkdirSync(intentRoot, { recursive: true });
  writeFileSync(join(intentRoot, "retained.json"), JSON.stringify({ schema: "github-producer-intent:v1",
    key: `${identity.operationId}:child:retained`, fingerprint: digest("retained") }));
  await assert.rejects(() => adapter.checkpoint.create(identity), { code: "GITHUB_PRODUCER_CONFLICT" });
  assert.equal(readFileSync(join(intentRoot, "retained.json"), "utf8").includes("child:retained"), true);
});

function addPriorDecomposition(f, { key, childNumber, body }) {
  const priorApprovedScopeIdentity = digest(`prior:${key}`);
  const priorScopeHash = digest("prior approved parent body");
  const priorAuthority = { specId: parentIdentity, target: "target", planningSeal: f.seal,
    classification: "MULTI", approvedScopeHash: priorScopeHash, decompositionIdentity: null };
  const priorSpecIdentity = bindProducerCheckpointOperationIdentity({ repositoryId, specId: parentIdentity,
    producerCommand: "to-spec", profileVersion: "v2", target: "target", baseline: f.seal,
    bindings: { planningSeal: f.seal, classification: "MULTI", approvedScopeIdentity: priorApprovedScopeIdentity,
      trackerIdentity: parentIdentity, relevantFacts: {} } });
  let specTransaction = createProducerOperationCheckpoint({ store: f.store, identity: priorSpecIdentity });
  specTransaction = f.store.advanceCheckpoint({ identity: priorSpecIdentity, stage: "planning_seal.read_back",
    receipt: { planningSeal: f.seal, state: "reused", target: "target" } });
  const priorPublication = f.addRecord(parentNumber, { kind: "spec_publication", repositoryId,
    operationKey: priorSpecIdentity.operationId, authority: priorAuthority, trackerIdentity: parentIdentity,
    transactionIdentity: specTransaction.transactionId, version: digest("prior-parent-version"), labels: [readyLabel] });
  specTransaction = f.store.advanceCheckpoint({ identity: priorSpecIdentity, stage: "publication.read_back",
    receipt: { publicationIdentity: priorPublication.identity, publicationDigest: priorPublication.bodySha256,
      trackerIdentity: parentIdentity, version: digest("prior-parent-version"),
      approvedScopeIdentity: priorApprovedScopeIdentity, target: "target", planningSeal: f.seal,
      classification: "MULTI" } });
  const priorSpecHandoff = f.addRecord(parentNumber, { kind: "producer_handoff", repositoryId,
    operationKey: priorSpecIdentity.operationId, producerCommand: "to-spec", specId: parentIdentity, target: "target",
    planningSeal: f.seal, classification: "MULTI", approvedScopeHash: priorScopeHash, decompositionIdentity: null,
    checkpointIdentity: priorSpecIdentity, transactionIdentity: specTransaction.transactionId,
    publicationIdentity: priorPublication.identity, publicationDigest: priorPublication.bodySha256,
    trackerIdentity: parentIdentity, recordIdentities: [priorPublication.identity], preparation: null });
  f.store.advanceCheckpoint({ identity: priorSpecIdentity, stage: "handoff.completed",
    receipt: { handoffIdentity: priorSpecHandoff.identity, handoffDigest: priorSpecHandoff.bodySha256 } });
  const identity = bindProducerCheckpointOperationIdentity({ repositoryId, specId: parentIdentity,
    producerCommand: "to-tickets", profileVersion: "v2", target: "target", baseline: f.seal,
    bindings: { planningSeal: f.seal, classification: "MULTI", approvedScopeIdentity: priorApprovedScopeIdentity,
      trackerIdentity: parentIdentity,
      upstream: { publicationIdentity: priorPublication.identity, handoffIdentity: priorSpecHandoff.identity },
      readyLabel } });
  let transaction = createProducerOperationCheckpoint({ store: f.store, identity });
  const childIdentity = f.issues.get(childNumber).node_id;
  const mapping = { [key]: childIdentity };
  const decomposition = f.addRecord(parentNumber, { kind: "decomposition:v1", repositoryId, operationKey: identity.operationId,
    checkpointIdentity: identity, transactionIdentity: transaction.transactionId, parent: parentIdentity, target: "target",
    planningSeal: f.seal, approvedScopeHash: priorScopeHash, approvedScopeIdentity: priorApprovedScopeIdentity,
    upstreamPublicationIdentity: priorPublication.identity, upstreamHandoffIdentity: priorSpecHandoff.identity,
    blockingRepresentation: "native", decompositionMapping: mapping, blockerEdges: [],
    childBodyDigests: { [childIdentity]: bodyDigest(body) }, readyFrontier: [childIdentity] });
  const decompositionReceipt = { decompositionIdentity: decomposition.identity, decompositionDigest: decomposition.bodySha256 };
  transaction = f.store.advanceCheckpoint({ identity, stage: "decomposition.read_back", receipt: decompositionReceipt });
  const readyReceipt = { frontier: [childIdentity],
    states: [{ trackerIdentity: childIdentity, state: "open", ready: true, expectedReady: true }], consistent: true };
  transaction = f.store.advanceCheckpoint({ identity, stage: "ready_state.read_back", receipt: readyReceipt });
  const handoff = f.addRecord(parentNumber, { kind: "producer_handoff", repositoryId, operationKey: identity.operationId,
    specId: parentIdentity, target: "target", planningSeal: f.seal, classification: "MULTI",
    approvedScopeHash: priorScopeHash, decompositionIdentity: decomposition.identity, producerCommand: "to-tickets",
    checkpointIdentity: identity, transactionIdentity: transaction.transactionId, trackerIdentity: parentIdentity,
    publicationIdentity: decomposition.identity, upstreamPublicationIdentity: priorPublication.identity,
    upstreamHandoffIdentity: priorSpecHandoff.identity,
    upstream: { publicationIdentity: priorPublication.identity, handoffIdentity: priorSpecHandoff.identity },
    operationReceipt: { transactionIdentity: transaction.transactionId, decompositionReadBack: decompositionReceipt,
      readyStateReadBack: readyReceipt }, decompositionDigest: decomposition.bodySha256, decompositionMapping: mapping,
    blockerEdges: [], recordIdentities: [priorPublication.identity, decomposition.identity], preparation: null });
  f.store.advanceCheckpoint({ identity, stage: "handoff.completed",
    receipt: { handoffIdentity: handoff.identity, handoffDigest: handoff.bodySha256 } });
  return { identity, publication: priorPublication, specHandoff: priorSpecHandoff, decomposition, handoff, mapping };
}

function addPartialDecomposition(f, { key, title, body, completedSpec = true, lineageSeal = f.seal }) {
  const approvedScopeIdentity = digest(`partial:${key}`);
  const authority = { specId: parentIdentity, target: "target", planningSeal: lineageSeal,
    classification: "MULTI", approvedScopeHash: digest(`partial scope:${key}`), decompositionIdentity: null };
  const specIdentity = bindProducerCheckpointOperationIdentity({ repositoryId, specId: parentIdentity,
    producerCommand: "to-spec", profileVersion: "v2", target: "target", baseline: f.seal,
    bindings: { planningSeal: f.seal, classification: "MULTI", approvedScopeIdentity,
      trackerIdentity: parentIdentity, relevantFacts: {} } });
  let specTransaction = createProducerOperationCheckpoint({ store: f.store, identity: specIdentity });
  if (completedSpec) specTransaction = f.store.advanceCheckpoint({ identity: specIdentity, stage: "planning_seal.read_back",
    receipt: { planningSeal: f.seal, state: "reused", target: "target" } });
  const publication = f.addRecord(parentNumber, { kind: "spec_publication", repositoryId,
    operationKey: specIdentity.operationId, authority, trackerIdentity: parentIdentity,
    transactionIdentity: specTransaction.transactionId, version: digest(`partial version:${key}`), labels: [] });
  const publicationReceipt = { publicationIdentity: publication.identity, publicationDigest: publication.bodySha256,
    trackerIdentity: parentIdentity, version: digest(`partial version:${key}`), approvedScopeIdentity,
    target: "target", planningSeal: f.seal, classification: "MULTI" };
  if (completedSpec) specTransaction = f.store.advanceCheckpoint({ identity: specIdentity,
    stage: "publication.read_back", receipt: publicationReceipt });
  const handoff = f.addRecord(parentNumber, { kind: "producer_handoff", repositoryId,
    operationKey: specIdentity.operationId, producerCommand: "to-spec", specId: parentIdentity,
    target: "target", planningSeal: lineageSeal, classification: "MULTI", approvedScopeHash: authority.approvedScopeHash,
    decompositionIdentity: null, checkpointIdentity: specIdentity, transactionIdentity: specTransaction.transactionId,
    publicationIdentity: publication.identity, publicationDigest: publication.bodySha256, trackerIdentity: parentIdentity,
    recordIdentities: [publication.identity], preparation: null });
  if (completedSpec) f.store.advanceCheckpoint({ identity: specIdentity, stage: "handoff.completed",
    receipt: { handoffIdentity: handoff.identity, handoffDigest: handoff.bodySha256 } });
  const identity = bindProducerCheckpointOperationIdentity({ repositoryId, specId: parentIdentity,
    producerCommand: "to-tickets", profileVersion: "v2", target: "target", baseline: f.seal,
    bindings: { planningSeal: f.seal, classification: "MULTI", approvedScopeIdentity,
      trackerIdentity: parentIdentity, upstream: { publicationIdentity: publication.identity,
        handoffIdentity: handoff.identity }, readyLabel } });
  const transaction = createProducerOperationCheckpoint({ store: f.store, identity });
  const child = f.addChild(180, { title, body });
  const payload = { key, title, body, parent: parentIdentity };
  const mutationKey = `${identity.operationId}:child:${key}`;
  const fingerprint = digest(JSON.stringify(payload));
  const root = join(f.gitCommonDir, "matt-workflow-control", "github-producer-intents");
  const stem = join(root, digest(`${repositoryId}:${mutationKey}`).slice(7));
  mkdirSync(root, { recursive: true });
  writeFileSync(`${stem}.json`, JSON.stringify({ schema: "github-producer-intent:v1", key: mutationKey, fingerprint }));
  mkdirSync(`${stem}.attempts`);
  writeFileSync(join(`${stem}.attempts`, "000001.attempt.json"), JSON.stringify({
    schema: "github-producer-attempt:v1", key: mutationKey, fingerprint, attempt: 1 }));
  writeFileSync(join(`${stem}.attempts`, "000001.result.json"), JSON.stringify({
    schema: "github-producer-result:v1", key: mutationKey, fingerprint, attempt: 1,
    state: "ACKNOWLEDGED", httpStatus: 201, requestId: "fixture-partial" }));
  return { child, identity, transaction, publication, handoff };
}

test("an exact unstarted partial child recovers once after a lost replacement response", async t => {
  const f = fixture(t);
  const key = "169/01";
  const oldBody = childBody({ key, seal: f.seal });
  const partial = addPartialDecomposition(f, { key, title: "Partial child", body: oldBody });
  const context = await start(f);
  const preflight = await preflightFor(context, [key]);
  const previous = { trackerIdentity: partial.child.node_id, title: partial.child.title, body: oldBody,
    version: preflight.matches[key][0].version, partialCheckpointIdentity: partial.identity,
    partialTransactionId: partial.transaction.transactionId };
  const replacement = { key, title: "Revised child", body: oldBody.replace(`Deliver ${key}.`, `Deliver revised ${key}.`) };
  const before = f.writes().filter(call => call.method === "PATCH").length;
  f.failures.failAfterWrite = true;
  const updated = await context.adapter.tracker.updateChild({ identity: context.identity, child: replacement,
    previous, preflight });
  assert.equal(updated.trackerIdentity, partial.child.node_id);
  assert.equal(f.issues.get(partial.child.number).body, replacement.body);
  await context.adapter.tracker.updateChild({ identity: context.identity, child: replacement, previous,
    preflight: await preflightFor(context, [key]) });
  assert.equal(f.writes().filter(call => call.method === "PATCH").length, before + 1,
    "exact read-back reconciles a lost response without a duplicate update");
  await context.adapter.tracker.publishRelation({ identity: context.identity,
    relation: { kind: "parent", child: partial.child.node_id }, preflight: await preflightFor(context, [key]) });
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: { [key]: partial.child.node_id }, blockerEdges: [], children: [replacement],
    preflight: await preflightFor(context, [key]) });
  assert.equal(decomposition.decompositionIdentity, decomposition.decompositionIdentity);
});

test("a partial child without a completed prior Spec transaction remains fail-closed", async t => {
  const f = fixture(t);
  const key = "169/01";
  const oldBody = childBody({ key, seal: f.seal });
  const partial = addPartialDecomposition(f, { key, title: "Partial child", body: oldBody, completedSpec: false });
  const context = await start(f);
  const preflight = await preflightFor(context, [key]);
  const previous = { trackerIdentity: partial.child.node_id, title: partial.child.title, body: oldBody,
    version: preflight.matches[key][0].version, partialCheckpointIdentity: partial.identity,
    partialTransactionId: partial.transaction.transactionId };
  await assert.rejects(() => context.adapter.tracker.updateChild({ identity: context.identity,
    child: { key, title: "Revised child", body: oldBody.replace(`Deliver ${key}.`, "Deliver revised child.") }, previous, preflight }),
  { code: "GITHUB_PRODUCER_CONFLICT" });
  assert.equal(f.writes().filter(call => call.method === "PATCH").length, 0);
});

test("a partial child with mismatched prior planning lineage remains fail-closed", async t => {
  const f = fixture(t);
  const key = "169/01";
  const oldBody = childBody({ key, seal: f.seal });
  const partial = addPartialDecomposition(f, { key, title: "Partial child", body: oldBody, lineageSeal: "other-seal" });
  const context = await start(f);
  const preflight = await preflightFor(context, [key]);
  const previous = { trackerIdentity: partial.child.node_id, title: partial.child.title, body: oldBody,
    version: preflight.matches[key][0].version, partialCheckpointIdentity: partial.identity,
    partialTransactionId: partial.transaction.transactionId };
  await assert.rejects(() => context.adapter.tracker.updateChild({ identity: context.identity,
    child: { key, title: "Revised child", body: oldBody.replace(`Deliver ${key}.`, "Deliver revised child.") }, previous, preflight }),
  { code: "GITHUB_PRODUCER_CONFLICT" });
  assert.equal(f.writes().filter(call => call.method === "PATCH").length, 0);
});

test("a partial child with lifecycle drift remains fail-closed", async t => {
  const f = fixture(t);
  const key = "169/01";
  const oldBody = childBody({ key, seal: f.seal });
  const partial = addPartialDecomposition(f, { key, title: "Partial child", body: oldBody });
  f.addRecord(partial.child.number, { kind: "implementation_blocked", reasonCode: "scope_revision_required" });
  const context = await start(f);
  const preflight = await preflightFor(context, [key]);
  const previous = { trackerIdentity: partial.child.node_id, title: partial.child.title, body: oldBody,
    version: preflight.matches[key][0].version, partialCheckpointIdentity: partial.identity,
    partialTransactionId: partial.transaction.transactionId };
  await assert.rejects(() => context.adapter.tracker.updateChild({ identity: context.identity,
    child: { key, title: "Revised child", body: oldBody.replace(`Deliver ${key}.`, "Deliver revised child.") }, previous, preflight }),
  { code: "GITHUB_PRODUCER_CONFLICT" });
  assert.equal(f.writes().filter(call => call.method === "PATCH").length, 0);
});

test("a partial child with an outbound native dependency remains fail-closed", async t => {
  const f = fixture(t);
  const key = "169/01";
  const oldBody = childBody({ key, seal: f.seal });
  const partial = addPartialDecomposition(f, { key, title: "Partial child", body: oldBody });
  const dependent = f.addChild(181, { title: "Dependent", body: "unrelated" });
  f.dependencies.set(dependent.number, [partial.child.number]);
  const context = await start(f);
  const preflight = await preflightFor(context, [key]);
  const previous = { trackerIdentity: partial.child.node_id, title: partial.child.title, body: oldBody,
    version: preflight.matches[key][0].version, partialCheckpointIdentity: partial.identity,
    partialTransactionId: partial.transaction.transactionId };
  await assert.rejects(() => context.adapter.tracker.updateChild({ identity: context.identity,
    child: { key, title: "Revised child", body: oldBody.replace(`Deliver ${key}.`, "Deliver revised child.") }, previous, preflight }),
  { code: "GITHUB_PRODUCER_CONFLICT" });
  assert.equal(f.writes().filter(call => call.method === "PATCH").length, 0);
});

test("an approved unfinished child revision replaces only the exact old body and version", async t => {
  const f = fixture(t);
  const key = "169/01";
  const oldBody = childBody({ key, seal: f.seal });
  const child = f.addChild(180, { title: "Existing child", body: oldBody });
  const prior = addPriorDecomposition(f, { key, childNumber: child.number, body: oldBody });
  const context = await start(f);
  const preflight = await preflightFor(context, [key]);
  await context.adapter.tracker.publishRelation({ identity: context.identity,
    relation: { kind: "parent", child: child.node_id }, preflight });
  const previous = { trackerIdentity: child.node_id, body: oldBody, version: preflight.matches[key][0].version,
    decompositionIdentity: prior.decomposition.identity };
  const replacement = { key, title: "Ignored replacement title",
    body: oldBody.replace(`Deliver ${key}.`, `Deliver revised ${key}.`) };
  const updated = await context.adapter.tracker.updateChild({ identity: context.identity, child: replacement, previous, preflight });
  assert.equal(updated.trackerIdentity, child.node_id);
  assert.equal(f.issues.get(180).body, replacement.body);
  assert.equal(f.issues.get(180).title, "Existing child", "titles are not child authority");
  assert.equal(context.adapter.tracker.readChildUpdateMutation({ identity: context.identity, child: replacement, previous }).state,
    "ACKNOWLEDGED");
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: { [key]: child.node_id }, blockerEdges: [], children: [replacement],
    preflight: await preflightFor(context, [key]) });
  assert.equal(decomposition.decompositionIdentity, decomposition.decompositionIdentity);
  const replacementPreflight = await preflightFor(context, [key]);
  await assert.rejects(() => context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: { [key]: child.node_id }, blockerEdges: [],
    children: [{ ...replacement, body: oldBody }], preflight: replacementPreflight }),
  { code: "GITHUB_PRODUCER_CONFLICT" }, "a superseded child body is refused");
});

test("a closed child requires and validates exact completion adoption", async t => {
  const f = fixture(t);
  const key = "169/01";
  const body = childBody({ key, seal: f.seal });
  const child = f.addChild(180, { title: "Completed child", body, state: "closed" });
  const prior = addPriorDecomposition(f, { key, childNumber: child.number, body });
  const context = await start(f);
  const preflight = await preflightFor(context, [key]);
  await context.adapter.tracker.publishRelation({ identity: context.identity,
    relation: { kind: "parent", child: child.node_id }, preflight });
  await assert.rejects(() => context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: { [key]: child.node_id }, blockerEdges: [],
    children: [{ key, title: child.title, body }], preflight }), { code: "GITHUB_PRODUCER_CONFLICT" });
  const operationIdentity = deriveExecuteIssueOperationIdentity({ repositoryId, specId: parentIdentity,
    issueId: child.node_id, approvedPublicationIdentity: prior.decomposition.identity });
  const completion = f.addRecord(180, { kind: "implementation_complete", operationIdentity, issueId: child.node_id,
    specId: parentIdentity, target: "target", planningSeal: f.seal, targetWorktree: f.repository,
    worktree: join(f.repository, "absent-completed-child"), topic: "completed-child", candidate: f.seal,
    standards: "clean", spec: "clean", worktreeState: "clean",
    verification: [{ command: "fixture", result: "PASSED" }] });
  const adoption = { issueId: child.node_id, publicationIdentity: prior.publication.identity,
    decompositionIdentity: prior.decomposition.identity, childBodyDigest: bodyDigest(body),
    completionIdentity: completion.identity, completionBodySha256: completion.bodySha256 };
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: { [key]: child.node_id }, blockerEdges: [], children: [{ key, title: child.title, body }],
    adoptedCompletions: [adoption], preflight: await preflightFor(context, [key]) });
  assert.equal(decomposition.decompositionIdentity, decomposition.decompositionIdentity);
  const record = recordOf(f.comments.get(parentNumber).filter(comment => comment.body.includes(`"kind": "decomposition:v1"`)).at(-1).body);
  assert.deepEqual(record.adoptedCompletions, [adoption]);
});

// The repository's own Run reader, driven over the same tracker state the producer wrote.
function readerSources(f) {
  const commandRunner = (name, args, options) => {
    if (name !== "gh") return execFileSync(name, args, { encoding: "utf8", ...options }).trim();
    if (args[1] === "graphql") {
      const id = args.find(value => value.startsWith("id=")).slice(3);
      const found = [...f.issues.values()].find(row => row.node_id === id);
      return JSON.stringify({ data: { node: found ? { id: found.node_id, number: found.number,
        repository: { nameWithOwner: REPOSITORY } } : null } });
    }
    const path = args[1];
    const number = Number(path.match(/issues\/(\d+)/u)[1]);
    let response = f.issues.get(number);
    if (path.includes("/comments")) response = f.comments.get(number);
    else if (path.endsWith("/parent")) response = f.parents.has(number) ? f.issues.get(f.parents.get(number)) : null;
    else if (path.includes("/dependencies/blocked_by")) {
      response = (f.dependencies.get(number) ?? []).map(blocker => f.issues.get(blocker));
    }
    return JSON.stringify([response]);
  };
  return createGitHubWorkflowSources({ repository: f.repository, repositoryName: REPOSITORY,
    store: { listRunIds: () => [], readEvents: () => [] }, tasks: { read: async () => null }, commandRunner });
}

test("the repository's own Run reader accepts the published decomposition exactly", async t => {
  const f = fixture(t);
  f.writeBinding();
  f.addRecord(parentNumber, { kind: "implementation_blocked", issueId: "I_190", specId: "I_190",
    reasonCode: "target_dirty" });
  const context = await start(f);
  const children = await publishChildren(f, context, "native");
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: children.mapping, blockerEdges: children.edges, children: [children.first, children.second],
    preflight: await preflightFor(context, children.keys) });
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "decomposition.read_back", receipt: decomposition });
  const ready = await context.adapter.tracker.writeReadyState({ identity: context.identity });
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "ready_state.read_back", receipt: ready });
  const handoff = await context.adapter.handoff.append({ identity: context.identity });
  const completed = await context.adapter.checkpoint.advance({ identity: context.identity,
    stage: "handoff.completed", receipt: handoff });

  const sources = readerSources(f);
  const snapshot = await sources.sources.tracker.read({ specId: parentIdentity });
  assert.equal(snapshot.issueErrors.size, 0, "no unrelated operation or record is treated as conflicting");
  assert.equal(snapshot.authority.decompositionIdentity, decomposition.decompositionIdentity);
  assert.deepEqual(snapshot.mapping, children.mapping);
  assert.deepEqual(snapshot.blockerEdges, children.edges);
  assert.deepEqual(snapshot.decomposition.record.readyFrontier, [children.firstRead.trackerIdentity]);
  assert.deepEqual(snapshot.decomposition.record.childBodyDigests,
    { [children.firstRead.trackerIdentity]: bodyDigest(children.first.body),
      [children.secondRead.trackerIdentity]: bodyDigest(children.second.body) });
  assert.deepEqual(snapshot.blockers.get(children.secondRead.trackerIdentity), [children.firstRead.trackerIdentity]);
  assert.deepEqual(snapshot.blockers.get(children.firstRead.trackerIdentity), []);
  const checkpoint = await sources.sources.checkpoint.read({ tracker: snapshot });
  assert.equal(checkpoint.state, "COMPLETED");
  assert.equal(checkpoint.transactionIdentity, completed.transactionId);
  assert.equal(checkpoint.handoffIdentity, handoff.handoffIdentity);
  assert.equal(checkpoint.approvedScopeHash, snapshot.authority.approvedScopeHash,
    "the checkpoint binding owns the same approved scope the reader selected");
  assert.deepEqual(checkpoint.stageReceipts.decompositionReadBack, decomposition,
    "the decomposition stage receipt keeps the exact two-field shape the reader compares");
  assert.deepEqual(checkpoint.stageReceipts.readyStateReadBack, ready);
  const normalized = await sources.sources.handoff.read({ tracker: snapshot });
  assert.equal(normalized.decompositionIdentity, decomposition.decompositionIdentity);
  assert.equal(normalized.decompositionDigest, snapshot.decomposition.bodySha256);
  assert.deepEqual(normalized.recordIdentities, [f.publication.identity, decomposition.decompositionIdentity]);
  assert.deepEqual(normalized.operationReceipt,
    { transactionIdentity: completed.transactionId, decompositionReadBack: decomposition, readyStateReadBack: ready });
});
