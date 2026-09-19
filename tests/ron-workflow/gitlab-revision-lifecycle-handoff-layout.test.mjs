import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { selectRevisionLifecycle as selectGitHubRevisionLifecycle } from "../../skills/personal/run-issue-workflow/scripts/github-revision-lifecycle.mjs";
import { selectRevisionLifecycle as selectGitLabRevisionLifecycle } from "../../skills/personal/run-issue-workflow/scripts/gitlab-revision-lifecycle.mjs";
import {
  bodyDigest,
  readWorkflowRecords,
  renderWorkflowRecord,
} from "../../skills/personal/run-issue-workflow/scripts/gitlab-workflow-records.mjs";
import { deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

// Issue 141: the GitLab composite `to-tickets` handoff nests its authority fields under `authority`,
// keeps the decomposition digest inside the decomposition read-back receipt it carries, and writes none
// of `specId`, `target`, `classification`, `approvedScopeHash`, `decompositionIdentity` or
// `decompositionDigest` on its top level (`gitlab-to-tickets-adapters.mjs` `handoffAppend`). The GitLab
// revision selector compared every one of those fields on the record's top level, so each comparison was
// made against `undefined`, the filter matched nothing, and `one()` threw `Previous decomposition
// handoff` for a GitLab Multi-Issue Spec whose previous operation had published a decomposition — no
// GitLab Multi-Issue Spec could ever be revised.
//
// The sibling Run readers already read this layout: `normalizeWorkflowHandoff` in
// `gitlab-workflow-sources.mjs` resolves the authority fields from `authority` when it is present and
// from the record's own top level otherwise, and the composite handoff check in `run-core.mjs` resolves
// the decomposition digest from the operation's decomposition read-back receipt when the record carries
// no digest member. These cases drive that exact record — rendered by the GitLab record owner and read
// back through the GitLab record reader, so the fixture is the layout the producer writes rather than a
// hand-built approximation — and assert the GitLab selector now selects it while every refusal stays.
const repositoryId = "github:example/repo";
const specId = "I_1";
const issueId = "I_2";
const target = "main";
const specLocator = "https://gitlab.example.com/group/project/-/issues/1";
const note = (id) => `${specLocator}#note_${id}`;
const previousSeal = "a".repeat(40);
const currentSeal = "b".repeat(40);
const transactionIdentity = "sha256:1".padEnd(71, "0");

const previousScope = bodyDigest("old multi parent");
const currentScope = bodyDigest("revised multi parent");

const previousPublicationRecord = {
  kind: "spec_publication",
  repositoryId,
  authority: { specId, target, classification: "MULTI", approvedScopeHash: previousScope,
    planningSeal: previousSeal, decompositionIdentity: null },
};
const decompositionRecord = {
  kind: "decomposition:v1",
  repositoryId,
  parent: specId,
  target,
  approvedScopeHash: previousScope,
  planningSeal: previousSeal,
  decompositionMapping: { "1/01": issueId },
  readyFrontier: [],
};
const currentPublicationRecord = {
  kind: "spec_publication",
  repositoryId,
  authority: { specId, target, classification: "MULTI", approvedScopeHash: currentScope,
    planningSeal: currentSeal, decompositionIdentity: null },
};
// The decomposition record's own tracker read-back digest: the GitLab record reader digests the note
// body the GitLab record owner renders, which is also what the producer stores in its operation receipt.
const decompositionBodySha256 = bodyDigest(renderWorkflowRecord(decompositionRecord));

// The composite handoff exactly as `gitlab-to-tickets-adapters.mjs` writes it. Its authority block
// carries the fields the selector compares and its operation receipt carries the decomposition digest.
const gitlabHandoffRecord = (decompositionDigest = decompositionBodySha256) => ({
  schema: "gitlab-to-tickets-record:v1",
  kind: "producer_handoff",
  repositoryId,
  operationKey: "workflow-op-v1-handoff",
  producerCommand: "to-tickets",
  authority: { specId, target, planningSeal: previousSeal, classification: "MULTI",
    approvedScopeHash: previousScope, decompositionIdentity: note(2) },
  checkpointIdentity: { repositoryId, specId, producerCommand: "to-tickets", profileVersion: "v2", target,
    baseline: previousSeal, operationId: "workflow-op-v1-handoff",
    bindings: { approvedScopeIdentity: previousScope, classification: "MULTI", planningSeal: previousSeal,
      trackerIdentity: specId } },
  transactionIdentity,
  trackerIdentity: specId,
  upstreamPublicationIdentity: note(1),
  upstreamHandoffIdentity: note(1),
  operationReceipt: { transactionIdentity,
    decompositionReadBack: { decompositionIdentity: note(2), decompositionDigest },
    readyStateReadBack: { frontier: [] } },
  decompositionMapping: { "1/01": issueId },
  blockerEdges: [],
  recordIdentities: [note(1), note(2)],
  preparation: null,
});

const asGitLabNote = (id, record) => ({ id, body: renderWorkflowRecord(record), system: false,
  noteable_type: "Issue", noteable_iid: 1, author: { id: 7 }, created_at: "2026-01-01T00:00:00Z" });

// The Spec's records come from the GitLab record reader, so identities and body digests are the ones the
// GitLab tracker read produces.
const readSpecRecords = async (handoffRecord) => readWorkflowRecords({
  notes: [previousPublicationRecord, decompositionRecord, handoffRecord, currentPublicationRecord]
    .map((record, index) => asGitLabNote(index + 1, record)),
  repositoryId,
  issueIdentity: specLocator,
  issueIid: 1,
  assertAuthor: async () => true,
});

const operationFor = (scope) => deriveExecuteIssueOperationIdentity({ repositoryId, specId, issueId,
  approvedPublicationIdentity: scope });
const blockedNote = (operation) => ({
  identity: `${specLocator}#note_9`,
  bodySha256: bodyDigest("blocked note"),
  record: { kind: "implementation_blocked", issueId, specId, target, reasonCode: "scope_revision_required",
    repairWaveCount: 0, planningSeal: previousSeal, operationIdentity: operation },
});
const issueWith = (records) => ({ node_id: issueId, state: "open", body: "child body", records });

// A revised Multi-Issue Spec: one previous MULTI publication, its decomposition and its composite
// `to-tickets` handoff, then the current revised publication and its decomposition.
const revisionSnapshot = ([previous, decomposition, handoff, current]) => ({
  authority: current.record.authority,
  spec: { records: [previous, decomposition, handoff, current] },
  publication: current,
  decomposition: { identity: note(4),
    record: { kind: "decomposition:v1", decompositionMapping: { "1/01": issueId } } },
});

const gitlabLayoutSnapshot = async (handoffRecord = gitlabHandoffRecord()) => {
  const records = await readSpecRecords(handoffRecord);
  return { records, snapshot: revisionSnapshot(records) };
};

const drive = (selector, snapshot, issue) => selector({
  snapshot: structuredClone(snapshot), issue: structuredClone(issue), repositoryId,
});
const driveStop = (selector, snapshot, issue) => {
  try {
    drive(selector, snapshot, issue);
    return null;
  } catch (error) {
    return error;
  }
};
const selection = (result) => ({
  lifecycle: result.lifecycle.map(item => item.identity),
  historicalBlocks: result.historicalBlocks.map(item => item.identity),
  previousAuthorities: result.previousAuthorities.map(item => ({
    publication: item.publication.identity,
    decomposition: item.decomposition.identity,
    handoff: item.handoff.identity,
  })),
});
const blockedIssue = () => issueWith([blockedNote(operationFor(previousScope))]);

test("the GitLab selector selects a previous to-tickets handoff written in the GitLab record layout", async () => {
  const { records, snapshot } = await gitlabLayoutSnapshot();
  const handoff = records[2];
  // The regression guard: if this record ever grows a flat authority member the case stops proving the
  // layout the producer writes, which is the only reason the selector used to fail.
  for (const field of ["specId", "target", "classification", "approvedScopeHash", "decompositionIdentity",
    "decompositionDigest"]) {
    assert.equal(Object.hasOwn(handoff.record, field), false, `the composite handoff carries no top-level ${field}`);
  }
  assert.equal(records[1].bodySha256, decompositionBodySha256);
  assert.equal(handoff.record.authority.specId, specId);
  assert.equal(handoff.record.operationReceipt.decompositionReadBack.decompositionDigest, records[1].bodySha256);

  const result = drive(selectGitLabRevisionLifecycle, snapshot, blockedIssue());

  assert.deepEqual(result.lifecycle, []);
  assert.deepEqual(selection(result).historicalBlocks, [`${specLocator}#note_9`]);
  assert.deepEqual(selection(result).previousAuthorities, [{
    publication: note(1), decomposition: note(2), handoff: note(3),
  }]);
  assert.equal(result.previousAuthorities[0].handoff.bodySha256, handoff.bodySha256);
});

test("the GitLab selector still stops when the resolved decomposition digest disagrees with its decomposition record", async () => {
  const { snapshot } = await gitlabLayoutSnapshot(gitlabHandoffRecord(bodyDigest("another decomposition body")));

  const stopped = driveStop(selectGitLabRevisionLifecycle, snapshot, blockedIssue());

  assert.ok(stopped, "a handoff naming a digest the decomposition record does not carry must stop");
  assert.match(stopped.message, /Previous decomposition handoff/u);
});

test("the GitLab selector still stops on a foreign or unprovable GitLab-layout handoff", async () => {
  const foreign = [
    { label: "another Spec", authority: { specId: "I_other" } },
    { label: "another target", authority: { target: "release" } },
    { label: "another publication", upstreamPublicationIdentity: note(8) },
    { label: "another decomposition", authority: { decompositionIdentity: note(8) } },
    { label: "another approved scope", authority: { approvedScopeHash: bodyDigest("other parent") } },
  ];
  for (const { label, authority, ...flat } of foreign) {
    const record = gitlabHandoffRecord();
    Object.assign(record, flat);
    if (authority) record.authority = { ...record.authority, ...authority };
    const { records } = await gitlabLayoutSnapshot(record);
    const snapshot = revisionSnapshot([records[0], records[1], records[2], records[3]]);

    const stopped = driveStop(selectGitLabRevisionLifecycle, snapshot, blockedIssue());

    assert.ok(stopped, `a handoff naming ${label} must stop`);
    assert.match(stopped.message, /Previous decomposition handoff/u);
  }
});

test("the GitLab selector selects the same handoff when the same facts are carried flat", async () => {
  const { records, snapshot } = await gitlabLayoutSnapshot();
  const flat = {
    identity: records[2].identity,
    bodySha256: records[2].bodySha256,
    record: { kind: "producer_handoff", producerCommand: "to-tickets", specId, target,
      approvedScopeHash: previousScope, upstreamPublicationIdentity: note(1), decompositionIdentity: note(2),
      decompositionDigest: records[1].bodySha256 },
  };

  const gitlab = drive(selectGitLabRevisionLifecycle,
    revisionSnapshot([records[0], records[1], flat, records[3]]), blockedIssue());
  const github = drive(selectGitHubRevisionLifecycle,
    revisionSnapshot([records[0], records[1], flat, records[3]]), blockedIssue());

  assert.deepEqual(selection(gitlab), selection(github));
  assert.deepEqual(selection(gitlab), selection(drive(selectGitLabRevisionLifecycle, snapshot, blockedIssue())));
});

// Recorded remaining difference between the two selectors, with its reason: the GitHub producer writes
// the flat layout (`github-to-tickets-adapters.mjs`), so `github-revision-lifecycle.mjs` keeps reading
// that layout and stays byte-unchanged (AC-2). A GitLab composite handoff is therefore readable only by
// the GitLab selector, which is what makes a GitLab Multi-Issue revision selectable while the GitHub
// selector's frozen behaviour stays exactly where the GitHub suites pinned it.
test("the GitHub selector reads only the flat layout the GitHub producer writes", async () => {
  const { snapshot } = await gitlabLayoutSnapshot();

  const stopped = driveStop(selectGitHubRevisionLifecycle, snapshot, blockedIssue());

  assert.ok(stopped, "the GitHub selector refuses a record it cannot prove");
  assert.match(stopped.message, /Previous decomposition handoff/u);
  const source = readFileSync(
    join(import.meta.dirname, "../../skills/personal/run-issue-workflow/scripts/github-revision-lifecycle.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /operationReceipt/u,
    "the GitHub selector must not gain the GitLab-layout tolerance this repair added to the GitLab selector");
});
