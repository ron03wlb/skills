import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createGitLabToTicketsAdapters } from "../../skills/personal/run-issue-workflow/scripts/gitlab-to-tickets-adapters.mjs";
import { inspectGitLabToTickets, readGitLabBlockingRepresentation } from "../../skills/personal/run-issue-workflow/scripts/gitlab-to-tickets-entry.mjs";
import { digest } from "../../skills/personal/run-issue-workflow/scripts/gitlab-producer-transport.mjs";
import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity, createProducerOperationCheckpoint,
  deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const configuration = { schema: "gitlab-producer:v1", baseUrl: "https://gitlab.example", project: "group/project" };
const projectUrl = `${configuration.baseUrl}/${configuration.project}`;
const repositoryId = `gitlab:${new URL(configuration.baseUrl).host}/${configuration.project}`;
const parentIdentity = `${projectUrl}/-/issues/169`;
const readyLabel = "ready-for-agent";
const iidFromIdentity = identity => Number(identity.slice(identity.lastIndexOf("/") + 1));

function childBody({ key, blockers, seal }) {
  return `## Parent\n\n${parentIdentity}.\n\n## Decomposition key\n\n\`${key}\`\n\n## What to build\n\nDeliver ${key}.\n\n## Acceptance Criteria\n\n- **AC-1 - Complete:** The outcome is verified.\n\n## Implementation Plan\n\n### Step 1: Deliver\n\nImplement the outcome. **Covers: AC-1.**\n\n## Verification\n\n- Run the focused check. **Covers: AC-1.**\n\n## Blocked by\n\n${blockers.length ? blockers.map(value => `- \`${value}\``).join("\n") : "None."}\n\n## Planning baseline\n\n- Commit: ${seal}\n- Seal: reused\n\n## Target\n\ntarget\n`;
}

function fixture(t) {
  const repository = mkdtempSync(join(tmpdir(), "gitlab-to-tickets-test-"));
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
  git("remote", "add", "origin", `${projectUrl}.git`);
  const seal = git("rev-parse", "HEAD");
  const parentBody = "# Approved Multi-Issue Spec\n\nDeliver two children.\n";
  let sequence = 200;
  const issues = new Map();
  const notes = new Map([[169, []]]);
  const links = new Map();
  const calls = [];
  const failures = { rejectNextLink: false, failReadAfterNextLinkWrite: false, rejectNextLinkRead: false };
  const issue = (iid, values = {}) => ({ id: 1000 + iid, iid, project_id: 31, issue_type: "issue",
    web_url: `${projectUrl}/-/issues/${iid}`, title: values.title ?? "Approved parent",
    description: values.description ?? parentBody, labels: values.labels ?? [], state: values.state ?? "opened",
    updated_at: `2026-09-11T00:00:${String(iid % 60).padStart(2, "0")}Z`, author: { id: 7 } });
  issues.set(169, issue(169));
  const responseIssue = current => structuredClone(current);
  const transport = async request => {
    const { method = "GET", path, body } = request;
    calls.push(structuredClone(request));
    if (path === `projects/${encodeURIComponent(configuration.project)}`) {
      return { id: 31, path_with_namespace: configuration.project, web_url: projectUrl };
    }
    if (path === "user") return { id: 7 };
    if (path === "projects/31/members/all/7") return { id: 7, access_level: 40 };
    const url = new URL(path, "https://fixture/");
    const route = url.pathname;
    if (route === "/projects/31/labels") return [{ name: readyLabel }];
    if (route === "/projects/31/issues") {
      if (method === "POST") {
        const created = issue(++sequence, { title: body.title, description: body.description });
        issues.set(created.iid, created);
        notes.set(created.iid, []);
        return responseIssue(created);
      }
      const search = url.searchParams.get("search") ?? "";
      return [...issues.values()].filter(current => current.description.includes(search)).map(responseIssue);
    }
    const match = route.match(/^\/projects\/31\/issues\/(\d+)(?:\/(notes|links)(?:\/(\d+))?)?$/u);
    if (!match) throw new Error(`Unexpected fixture request ${method} ${path}`);
    const iid = Number(match[1]);
    const current = issues.get(iid);
    if (!current) throw new Error(`Unknown fixture Issue ${iid}`);
    if (!match[2]) {
      if (method === "PUT") {
        if (body.description !== undefined) current.description = body.description;
        if (body.title !== undefined) current.title = body.title;
        if (body.add_labels) current.labels = [...new Set([...current.labels, body.add_labels])];
        if (body.remove_labels) current.labels = current.labels.filter(label => label !== body.remove_labels);
        current.updated_at = `2026-09-12T00:00:${String(++sequence % 60).padStart(2, "0")}Z`;
      }
      return responseIssue(current);
    }
    if (match[2] === "notes") {
      const rows = notes.get(iid);
      if (match[3]) return structuredClone(rows.find(note => note.id === Number(match[3])));
      if (method === "POST") {
        const note = { id: 4000 + ++sequence, noteable_iid: iid, noteable_type: "Issue",
          system: false, author: { id: 7 }, body: body.body };
        rows.push(note);
        return structuredClone(note);
      }
      return structuredClone(rows);
    }
    const rows = links.get(iid) ?? [];
    links.set(iid, rows);
    if (method === "POST") {
      if (failures.rejectNextLink) {
        failures.rejectNextLink = false;
        throw Object.assign(new Error("fixture rejection"), { code: "GITLAB_PRODUCER_TRANSPORT",
          httpStatus: 400, requestId: "fixture-link-rejection", outcome: "REJECTED" });
      }
      const target = issues.get(Number(body.target_issue_iid));
      rows.push({ ...responseIssue(target), link_type: body.link_type });
      if (failures.failReadAfterNextLinkWrite) {
        failures.failReadAfterNextLinkWrite = false;
        failures.rejectNextLinkRead = true;
      }
      return structuredClone(rows.at(-1));
    }
    if (failures.rejectNextLinkRead) {
      failures.rejectNextLinkRead = false;
      throw Object.assign(new Error("fixture read-back failure"), { code: "GITLAB_PRODUCER_TRANSPORT",
        httpStatus: 500, requestId: "fixture-link-readback", outcome: "UNRESOLVED" });
    }
    return structuredClone(rows);
  };

  const addRecord = (record) => {
    const note = { id: 4000 + ++sequence, noteable_iid: 169, noteable_type: "Issue", system: false,
      author: { id: 7 }, body: `\`\`\`workflow-record\n${JSON.stringify(record, null, 2)}\n\`\`\`` };
    notes.get(169).push(note);
    return { identity: `${parentIdentity}#note_${note.id}`, digest: digest(note.body) };
  };
  const addIssueRecord = (iid, record) => {
    const note = { id: 4000 + ++sequence, noteable_iid: iid, noteable_type: "Issue", system: false,
      author: { id: 7 }, body: `\`\`\`workflow-record\n${JSON.stringify(record, null, 2)}\n\`\`\`` };
    notes.get(iid).push(note);
    return { identity: `${projectUrl}/-/issues/${iid}#note_${note.id}`, digest: digest(note.body) };
  };
  const approvedScopeIdentity = digest(JSON.stringify({ title: "Approved parent", body: parentBody,
    classification: "MULTI", readyLabel }));
  const authority = { specId: parentIdentity, target: "target", planningSeal: seal,
    classification: "MULTI", approvedScopeHash: digest(parentBody), decompositionIdentity: null };
  const checkpointIdentity = bindProducerCheckpointOperationIdentity({ repositoryId, specId: parentIdentity,
    producerCommand: "to-spec", profileVersion: "v2", target: "target", baseline: seal,
    bindings: { planningSeal: seal, classification: "MULTI", approvedScopeIdentity,
      trackerIdentity: parentIdentity, relevantFacts: {} } });
  const gitCommonDir = realpathSync.native(resolve(repository, git("rev-parse", "--git-common-dir")));
  const store = createWorkflowControlStore({ gitCommonDir });
  let transaction = createProducerOperationCheckpoint({ store, identity: checkpointIdentity });
  const sealReceipt = { target: "target", planningSeal: seal, state: "reused" };
  transaction = store.advanceCheckpoint({ identity: checkpointIdentity, stage: "planning_seal.read_back", receipt: sealReceipt });
  const publicationRecord = { schema: "gitlab-producer-record:v1", kind: "spec_publication", repositoryId,
    operationKey: checkpointIdentity.operationId, authority, trackerIdentity: parentIdentity,
    transactionIdentity: transaction.transactionId, version: digest("parent-version"), labels: [] };
  const publication = addRecord(publicationRecord);
  const publicationReceipt = { publicationIdentity: publication.identity, publicationDigest: publication.digest,
    trackerIdentity: parentIdentity, version: publicationRecord.version, approvedScopeIdentity,
    target: "target", planningSeal: seal, classification: "MULTI" };
  transaction = store.advanceCheckpoint({ identity: checkpointIdentity, stage: "publication.read_back", receipt: publicationReceipt });
  const handoffRecord = { schema: "gitlab-producer-record:v1", kind: "producer_handoff", repositoryId,
    operationKey: checkpointIdentity.operationId, producerCommand: "to-spec", authority,
    checkpointIdentity, transactionIdentity: transaction.transactionId, trackerIdentity: parentIdentity,
    publicationIdentity: publication.identity, publicationDigest: publication.digest,
    recordIdentities: [publication.identity], preparation: null };
  const handoff = addRecord(handoffRecord);
  store.advanceCheckpoint({ identity: checkpointIdentity, stage: "handoff.completed",
    receipt: { handoffIdentity: handoff.identity, handoffDigest: handoff.digest } });
  const writes = () => calls.filter(call => call.method && call.method !== "GET");
  const addIssue = (iid, values) => {
    const created = issue(iid, values);
    issues.set(iid, created);
    notes.set(iid, []);
    return created;
  };
  return { repository, seal, gitCommonDir, issues, notes, links, calls, failures, transport, writes, addIssue,
    addRecord, addIssueRecord, store, publication, handoff, approvedScopeIdentity, authority,
    options: { repository, configuration, transport, specId: 169, target: "target", upstreamHandoffIdentity: handoff.identity } };
}

function addPriorDecomposition(f, { key, childIdentity, body }) {
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
    receipt: { target: "target", planningSeal: f.seal, state: "reused" } });
  const priorPublicationRecord = { schema: "gitlab-producer-record:v1", kind: "spec_publication", repositoryId,
    operationKey: priorSpecIdentity.operationId, authority: priorAuthority, trackerIdentity: parentIdentity,
    transactionIdentity: specTransaction.transactionId, version: digest("prior-parent-version"), labels: [] };
  const priorPublication = f.addRecord(priorPublicationRecord);
  specTransaction = f.store.advanceCheckpoint({ identity: priorSpecIdentity, stage: "publication.read_back",
    receipt: { publicationIdentity: priorPublication.identity, publicationDigest: priorPublication.digest,
      trackerIdentity: parentIdentity, version: priorPublicationRecord.version, approvedScopeIdentity: priorApprovedScopeIdentity,
      target: "target", planningSeal: f.seal, classification: "MULTI" } });
  const priorSpecHandoffRecord = { schema: "gitlab-producer-record:v1", kind: "producer_handoff", repositoryId,
    operationKey: priorSpecIdentity.operationId, producerCommand: "to-spec", authority: priorAuthority,
    checkpointIdentity: priorSpecIdentity, transactionIdentity: specTransaction.transactionId,
    trackerIdentity: parentIdentity, publicationIdentity: priorPublication.identity,
    publicationDigest: priorPublication.digest, recordIdentities: [priorPublication.identity], preparation: null };
  const priorSpecHandoff = f.addRecord(priorSpecHandoffRecord);
  f.store.advanceCheckpoint({ identity: priorSpecIdentity, stage: "handoff.completed",
    receipt: { handoffIdentity: priorSpecHandoff.identity, handoffDigest: priorSpecHandoff.digest } });
  const identity = bindProducerCheckpointOperationIdentity({ repositoryId, specId: parentIdentity,
    producerCommand: "to-tickets", profileVersion: "v2", target: "target", baseline: f.seal,
    bindings: { planningSeal: f.seal, classification: "MULTI", approvedScopeIdentity: priorApprovedScopeIdentity,
      trackerIdentity: parentIdentity, upstreamPublicationIdentity: priorPublication.identity,
      upstreamHandoffIdentity: priorSpecHandoff.identity, readyLabel } });
  let transaction = createProducerOperationCheckpoint({ store: f.store, identity });
  const mapping = { [key]: childIdentity };
  const decompositionRecord = { schema: "gitlab-to-tickets-record:v1", kind: "decomposition:v1", repositoryId,
    operationKey: identity.operationId, checkpointIdentity: identity, transactionIdentity: transaction.transactionId,
    parent: parentIdentity, target: "target", planningSeal: f.seal, approvedScopeHash: priorScopeHash,
    approvedScopeIdentity: priorApprovedScopeIdentity, upstreamPublicationIdentity: priorPublication.identity,
    upstreamHandoffIdentity: priorSpecHandoff.identity, blockingRepresentation: "body", decompositionMapping: mapping,
    blockerEdges: [], childBodyDigests: { [childIdentity]: digest(body) } };
  const decomposition = f.addRecord(decompositionRecord);
  const decompositionReceipt = { decompositionIdentity: decomposition.identity, decompositionDigest: decomposition.digest,
    decompositionMapping: mapping, blockerEdges: [] };
  transaction = f.store.advanceCheckpoint({ identity, stage: "decomposition.read_back", receipt: decompositionReceipt });
  const readyReceipt = { readyFrontier: [childIdentity], states: [{ trackerIdentity: childIdentity,
    state: "opened", ready: true, expectedReady: true }], consistent: true };
  transaction = f.store.advanceCheckpoint({ identity, stage: "ready_state.read_back", receipt: readyReceipt });
  const authority = { specId: parentIdentity, target: "target", planningSeal: f.seal, classification: "MULTI",
    approvedScopeHash: priorScopeHash, decompositionIdentity: decomposition.identity };
  const handoffRecord = { schema: "gitlab-to-tickets-record:v1", kind: "producer_handoff", repositoryId,
    operationKey: identity.operationId, producerCommand: "to-tickets", authority, checkpointIdentity: identity,
    transactionIdentity: transaction.transactionId, trackerIdentity: parentIdentity,
    upstreamPublicationIdentity: priorPublication.identity, upstreamHandoffIdentity: priorSpecHandoff.identity,
    operationReceipt: { transactionIdentity: transaction.transactionId, decompositionReadBack: decompositionReceipt,
      readyStateReadBack: readyReceipt }, decompositionMapping: mapping, blockerEdges: [],
    recordIdentities: [priorPublication.identity, decomposition.identity], preparation: null };
  const handoff = f.addRecord(handoffRecord);
  f.store.advanceCheckpoint({ identity, stage: "handoff.completed",
    receipt: { handoffIdentity: handoff.identity, handoffDigest: handoff.digest } });
  return { identity, publication: priorPublication, specHandoff: priorSpecHandoff, decomposition, handoff, mapping };
}

async function start(f, blockingRepresentation) {
  const adapter = await createGitLabToTicketsAdapters({ ...f.options, blockingRepresentation });
  const publication = adapter.upstream.readPublication();
  assert.equal(adapter.upstream.readHandoff({ publicationIdentity: publication.publicationIdentity }).handoffIdentity,
    f.options.upstreamHandoffIdentity);
  const identity = adapter.checkpoint.identity({ baseline: f.seal });
  assert.equal((await adapter.checkpoint.create(identity)).nextStage, "decomposition.read_back");
  return { adapter, identity };
}

async function publishChildren(f, context, blockingRepresentation) {
  const keys = [`${parentIdentity}/01`, `${parentIdentity}/02`];
  const first = { key: `${parentIdentity}/01`, title: "First child",
    body: childBody({ key: `${parentIdentity}/01`, blockers: [], seal: f.seal }) };
  const firstRead = await context.adapter.tracker.publishChild({ identity: context.identity, child: first,
    preflight: await context.adapter.tracker.discoverChildren({ keys, externalBlockers: [] }) });
  const second = { key: `${parentIdentity}/02`, title: "Second child",
    body: childBody({ key: `${parentIdentity}/02`, blockers: [firstRead.trackerIdentity], seal: f.seal }) };
  const secondRead = await context.adapter.tracker.publishChild({ identity: context.identity, child: second,
    preflight: await context.adapter.tracker.discoverChildren({ keys, externalBlockers: [] }) });
  if (blockingRepresentation === "native") {
    await context.adapter.tracker.publishRelation({ identity: context.identity,
      relation: { kind: "blocker", childKey: second.key, child: secondRead.trackerIdentity, blocker: firstRead.trackerIdentity },
      preflight: await context.adapter.tracker.discoverChildren({ keys, externalBlockers: [] }) });
  }
  return { first, firstRead, second, secondRead, keys,
    mapping: { [first.key]: firstRead.trackerIdentity, [second.key]: secondRead.trackerIdentity },
    edges: [{ blocker: firstRead.trackerIdentity, blocked: secondRead.trackerIdentity }] };
}

test("body representation publishes exact decomposition, ready frontier and composite handoff without native blockers", async t => {
  const f = fixture(t);
  const context = await start(f, "body");
  assert.deepEqual(await context.adapter.tracker.discoverChildren({
    keys: [`${parentIdentity}/01`, `${parentIdentity}/02`], externalBlockers: [],
  }), { blockingRepresentation: "body", matches: { [`${parentIdentity}/01`]: [], [`${parentIdentity}/02`]: [] }, externalBlockers: [] });
  const children = await publishChildren(f, context, "body");
  f.issues.get(iidFromIdentity(children.firstRead.trackerIdentity)).title = "Non-authoritative title edit";
  assert.equal((await context.adapter.tracker.readChild({ ...children.first,
    trackerIdentity: children.firstRead.trackerIdentity })).key, children.first.key);
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: children.mapping, blockerEdges: children.edges, children: [children.first, children.second],
    preflight: await context.adapter.tracker.discoverChildren({ keys: children.keys, externalBlockers: [] }) });
  assert.deepEqual(decomposition.decompositionMapping, children.mapping);
  assert.deepEqual(decomposition.blockerEdges, children.edges);
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "decomposition.read_back", receipt: decomposition });
  const ready = await context.adapter.tracker.writeReadyState({ identity: context.identity });
  assert.deepEqual(ready.readyFrontier, [children.firstRead.trackerIdentity]);
  assert.equal(ready.consistent, true);
  await context.adapter.checkpoint.advance({ identity: context.identity, stage: "ready_state.read_back", receipt: ready });
  const handoff = await context.adapter.handoff.append({ identity: context.identity });
  const completed = await context.adapter.checkpoint.advance({ identity: context.identity, stage: "handoff.completed", receipt: handoff });
  assert.equal(completed.state, "COMPLETED");
  assert.equal((f.links.get(iidFromIdentity(children.secondRead.trackerIdentity)) ?? []).some(link => link.link_type === "is_blocked_by"), false);
  assert.equal(f.issues.get(iidFromIdentity(children.firstRead.trackerIdentity)).labels.includes(readyLabel), true);
  assert.equal(f.issues.get(iidFromIdentity(children.secondRead.trackerIdentity)).labels.includes(readyLabel), false);
  const writes = f.writes().length;
  f.issues.get(iidFromIdentity(children.firstRead.trackerIdentity)).state = "closed";
  assert.deepEqual(await context.adapter.handoff.read({ identity: context.identity }), handoff,
    "completed handoff remains readable after child lifecycle changes");
  await assert.rejects(() => context.adapter.tracker.writeReadyState({ identity: context.identity }),
    { code: "GITLAB_PRODUCER_CONFLICT" });
  assert.equal(f.writes().length, writes, "completed ready-state receipt authorizes no later label write");
  const otherLabel = await createGitLabToTicketsAdapters({ ...f.options, blockingRepresentation: "body", readyLabel: "wontfix" });
  assert.notDeepEqual(otherLabel.checkpoint.identity({ baseline: f.seal }), context.identity);
  assert.throws(() => otherLabel.checkpoint.read(context.identity), { code: "GITLAB_PRODUCER_CONFLICT" });
});

test("native rejection remains explicit and the same pre-decomposition transaction can adopt verified body mode", async t => {
  const f = fixture(t);
  const native = await start(f, "native");
  const children = await publishChildren(f, native, "body");
  f.failures.rejectNextLink = true;
  const relation = { kind: "blocker", childKey: children.second.key,
    child: children.secondRead.trackerIdentity, blocker: children.firstRead.trackerIdentity };
  const preflight = await native.adapter.tracker.discoverChildren({ keys: children.keys, externalBlockers: [] });
  await assert.rejects(() => native.adapter.tracker.publishRelation({ identity: native.identity, relation, preflight }),
    { code: "GITLAB_PRODUCER_REJECTED" });
  assert.equal(native.adapter.blockingRepresentation, "native");
  assert.equal(native.adapter.tracker.readPartialRelations({ identity: native.identity })[0].outcome, "REJECTED");
  const body = await createGitLabToTicketsAdapters({ ...f.options, blockingRepresentation: "body" });
  assert.deepEqual(body.checkpoint.identity({ baseline: f.seal }), native.identity);
  const decomposition = await body.tracker.publishDecomposition({ identity: native.identity,
    decompositionMapping: children.mapping, blockerEdges: children.edges, children: [children.first, children.second],
    preflight: await body.tracker.discoverChildren({ keys: children.keys, externalBlockers: [] }) });
  assert.match(decomposition.decompositionIdentity, /#note_[0-9]+$/u);
  assert.equal((f.links.get(iidFromIdentity(children.secondRead.trackerIdentity)) ?? []).some(link => link.link_type === "is_blocked_by"), false);
});

test("native mode publishes and reads exact blocking evidence", async t => {
  const f = fixture(t);
  const context = await start(f, "native");
  const children = await publishChildren(f, context, "native");
  assert.throws(() => context.adapter.tracker.readRelation({ relation: { kind: "blocker",
    child: children.secondRead.trackerIdentity, blocker: children.firstRead.trackerIdentity } }),
  { code: "GITLAB_PRODUCER_CONFLICT" });
  const relation = await context.adapter.tracker.readRelation({ relation: { kind: "blocker", childKey: children.second.key,
    child: children.secondRead.trackerIdentity, blocker: children.firstRead.trackerIdentity } });
  assert.equal(relation.linkType, "is_blocked_by");
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: children.mapping, blockerEdges: children.edges, children: [children.first, children.second],
    preflight: await context.adapter.tracker.discoverChildren({ keys: children.keys, externalBlockers: [] }) });
  assert.match(decomposition.decompositionIdentity, /#note_[0-9]+$/u);
});

test("External blockers require a complete read-only preflight before child mutation", async t => {
  const f = fixture(t);
  const externalIdentity = f.addIssue(170, { title: "External blocker", description: "External work" }).web_url;
  const context = await start(f, "body");
  const key = `${parentIdentity}/01`;
  const child = { key, title: "Externally blocked child",
    body: childBody({ key, blockers: [externalIdentity], seal: f.seal }) };
  const before = f.writes().length;
  await assert.rejects(() => context.adapter.tracker.publishChild({ identity: context.identity, child }),
    { code: "GITLAB_PRODUCER_CONFLICT" });
  assert.equal(f.writes().length, before);
  const preflight = await context.adapter.tracker.discoverChildren({ keys: [key], externalBlockers: [externalIdentity] });
  assert.equal(preflight.externalBlockers[0].trackerIdentity, externalIdentity);
  const published = await context.adapter.tracker.publishChild({ identity: context.identity, child, preflight });
  const mapping = { [key]: published.trackerIdentity };
  const edges = [{ blocker: externalIdentity, blocked: published.trackerIdentity }];
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: mapping, blockerEdges: edges, children: [child],
    preflight: await context.adapter.tracker.discoverChildren({ keys: [key], externalBlockers: [externalIdentity] }) });
  assert.deepEqual(decomposition.blockerEdges, edges);

  f.addIssue(171, { title: "Second external blocker", description: "Other work" });
  const reversed = { key, title: "Wrong order", body: childBody({ key,
    blockers: [`${projectUrl}/-/issues/171`, externalIdentity], seal: f.seal }) };
  await assert.rejects(() => context.adapter.tracker.readChild({ ...reversed, trackerIdentity: published.trackerIdentity }),
    { code: "GITLAB_PRODUCER_CONFLICT" });
});

test("native post-write read-back failure retains exact partial evidence and resumes by read-back", async t => {
  const f = fixture(t);
  const context = await start(f, "native");
  const children = await publishChildren(f, context, "body");
  await assert.rejects(() => context.adapter.tracker.readChild({ ...children.second,
    trackerIdentity: children.secondRead.trackerIdentity }), { code: "GITLAB_PRODUCER_CONFLICT" });
  const relation = { kind: "blocker", childKey: children.second.key,
    child: children.secondRead.trackerIdentity, blocker: children.firstRead.trackerIdentity };
  f.failures.failReadAfterNextLinkWrite = true;
  const preflight = await context.adapter.tracker.discoverChildren({ keys: children.keys, externalBlockers: [] });
  await assert.rejects(() => context.adapter.tracker.publishRelation({ identity: context.identity, relation, preflight }),
    { code: "GITLAB_PRODUCER_TRANSPORT" });
  const partial = context.adapter.tracker.readPartialRelations({ identity: context.identity })[0];
  assert.equal(partial.mutation.state, "ACKNOWLEDGED");
  assert.equal(partial.readBack.state, "PRESENT");
  assert.match(partial.readBack.relationIdentity, /^gitlab-link:/u);
  const recovered = await context.adapter.tracker.publishRelation({ identity: context.identity, relation,
    preflight: await context.adapter.tracker.discoverChildren({ keys: children.keys, externalBlockers: [] }) });
  assert.equal(recovered.linkType, "is_blocked_by");
  assert.deepEqual((await context.adapter.tracker.readChild({ ...children.second,
    trackerIdentity: children.secondRead.trackerIdentity })).nativeBlockers, [children.firstRead.trackerIdentity]);
});

test("approved unfinished child revision updates only the exact old body and version", async t => {
  const f = fixture(t);
  const key = `${parentIdentity}/01`;
  const oldBody = childBody({ key, blockers: [], seal: f.seal });
  const child = f.addIssue(170, { title: "Existing child", description: oldBody });
  const prior = addPriorDecomposition(f, { key, childIdentity: child.web_url, body: oldBody });
  const context = await start(f, "body");
  const preflight = await context.adapter.tracker.discoverChildren({ keys: [key], externalBlockers: [] });
  const previous = { trackerIdentity: child.web_url, body: oldBody,
    version: preflight.matches[key][0].version, decompositionIdentity: prior.decomposition.identity };
  const replacement = { key, title: "Ignored replacement title",
    body: oldBody.replace(`Deliver ${key}.`, `Deliver revised ${key}.`) };
  const updated = await context.adapter.tracker.updateChild({ identity: context.identity, child: replacement,
    previous, preflight });
  assert.equal(updated.trackerIdentity, child.web_url);
  assert.equal(f.issues.get(170).description, replacement.body);
  assert.equal(f.issues.get(170).title, "Existing child", "title is not child authority");
  assert.equal(context.adapter.tracker.readChildUpdateMutation({ identity: context.identity,
    child: replacement, previous }).state, "ACKNOWLEDGED");
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: { [key]: child.web_url }, blockerEdges: [], children: [replacement],
    preflight: await context.adapter.tracker.discoverChildren({ keys: [key], externalBlockers: [] }) });
  assert.deepEqual(decomposition.decompositionMapping, { [key]: child.web_url });
});

test("closed child requires and validates exact completion adoption", async t => {
  const f = fixture(t);
  const key = `${parentIdentity}/01`;
  const body = childBody({ key, blockers: [], seal: f.seal });
  const child = f.addIssue(170, { title: "Completed child", description: body, state: "closed" });
  const prior = addPriorDecomposition(f, { key, childIdentity: child.web_url, body });
  const context = await start(f, "body");
  const preflight = await context.adapter.tracker.discoverChildren({ keys: [key], externalBlockers: [] });
  await assert.rejects(() => context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: { [key]: child.web_url }, blockerEdges: [], children: [{ key, title: child.title, body }],
    preflight }), { code: "GITLAB_PRODUCER_CONFLICT" });
  const operationIdentity = deriveExecuteIssueOperationIdentity({ repositoryId, specId: parentIdentity,
    issueId: child.web_url, approvedPublicationIdentity: prior.decomposition.identity });
  const completionRecord = { kind: "implementation_complete", operationIdentity, issueId: child.web_url,
    specId: parentIdentity, target: "target", planningSeal: f.seal, targetWorktree: f.repository,
    worktree: join(f.repository, "absent-completed-child"), topic: "completed-child", candidate: f.seal,
    standards: "clean", spec: "clean", worktreeState: "clean",
    verification: [{ command: "fixture", result: "PASSED" }] };
  const completion = f.addIssueRecord(170, completionRecord);
  const adoption = { issueId: child.web_url, publicationIdentity: prior.publication.identity,
    decompositionIdentity: prior.decomposition.identity, childBodyDigest: digest(body),
    completionIdentity: completion.identity, completionBodySha256: completion.digest };
  const decomposition = await context.adapter.tracker.publishDecomposition({ identity: context.identity,
    decompositionMapping: { [key]: child.web_url }, blockerEdges: [], children: [{ key, title: child.title, body }],
    adoptedCompletions: [adoption], preflight });
  assert.deepEqual(decomposition.decompositionMapping, { [key]: child.web_url });
});

test("fresh body mode rejects matching native blocker evidence and missing checkpoints reject local intents", async t => {
  const f = fixture(t);
  const native = await start(f, "native");
  const children = await publishChildren(f, native, "native");
  const body = await createGitLabToTicketsAdapters({ ...f.options, blockingRepresentation: "body" });
  const bodyPreflight = await body.tracker.discoverChildren({ keys: children.keys, externalBlockers: [] });
  await assert.rejects(() => body.tracker.publishDecomposition({ identity: native.identity,
    decompositionMapping: children.mapping, blockerEdges: children.edges, children: [children.first, children.second],
    preflight: bodyPreflight }),
  { code: "GITLAB_PRODUCER_CONFLICT" });

  const separate = fixture(t);
  const adapter = await createGitLabToTicketsAdapters({ ...separate.options, blockingRepresentation: "body" });
  const identity = adapter.checkpoint.identity({ baseline: separate.seal });
  const intentRoot = join(separate.gitCommonDir, "matt-workflow-control", "gitlab-producer-intents");
  mkdirSync(intentRoot, { recursive: true });
  writeFileSync(join(intentRoot, "retained.json"), JSON.stringify({ schema: "gitlab-producer-intent:v1",
    key: `${identity.operationId}:child:retained`, fingerprint: digest("retained") }));
  await assert.rejects(() => adapter.checkpoint.create(identity), { code: "GITLAB_PRODUCER_CONFLICT" });
});

test("upstream read accepts only GitLab's exact final-LF omission", async t => {
  const f = fixture(t);
  const parent = f.issues.get(169);
  parent.description = parent.description.slice(0, -1);
  const context = await start(f, "body");
  assert.equal(context.adapter.upstream.readPublication().approvedScopeHash, digest(`${parent.description}\n`));
});

test("inspection is read-only and missing blocker configuration stays UNKNOWN", async t => {
  const f = fixture(t);
  mkdirSync(join(f.repository, "docs/agents"), { recursive: true });
  writeFileSync(join(f.repository, "docs/agents/gitlab-producer.json"), `${JSON.stringify(configuration, null, 2)}\n`);
  writeFileSync(join(f.repository, "docs/agents/issue-tracker.md"), "# Issue tracker: GitLab\n\nBlocking representation: body\n");
  const beforeWrites = f.writes().length;
  const inspected = await inspectGitLabToTickets({ repository: f.repository, transport: f.transport });
  assert.equal(inspected.state, "PRESENT");
  assert.equal(inspected.support.producer, "to-tickets@v2");
  assert.equal(inspected.support.blockingRepresentation, "body");
  assert.equal(inspected.support.nativeParentRelation, false);
  assert.equal(f.writes().length, beforeWrites);
  writeFileSync(join(f.repository, "docs/agents/issue-tracker.md"), "# Issue tracker: GitLab\n");
  assert.equal(readGitLabBlockingRepresentation(f.repository).state, "UNKNOWN");
  assert.equal((await inspectGitLabToTickets({ repository: f.repository, transport: f.transport })).state, "UNKNOWN");
  assert.equal(f.writes().length, beforeWrites);
  assert.equal(readFileSync(join(f.repository, "docs/agents/gitlab-producer.json"), "utf8"), `${JSON.stringify(configuration, null, 2)}\n`);
});
