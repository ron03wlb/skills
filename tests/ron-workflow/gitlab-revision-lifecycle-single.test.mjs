import assert from "node:assert/strict";
import test from "node:test";

import { selectRevisionLifecycle as selectGitHubRevisionLifecycle } from "../../skills/personal/run-issue-workflow/scripts/github-revision-lifecycle.mjs";
import { selectRevisionLifecycle as selectGitLabRevisionLifecycle } from "../../skills/personal/run-issue-workflow/scripts/gitlab-revision-lifecycle.mjs";
import { bodyDigest } from "../../skills/personal/run-issue-workflow/scripts/gitlab-workflow-records.mjs";
import { deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

// Issue 134: Spec #126 delivered the GitLab Tracker Run sources carrying the structural gap Issue #132
// repaired for the GitHub module. The GitLab selector proved a previous operation only through a previous
// MULTI publication plus its matching `decomposition:v1`, so a Single-Issue Spec — which never publishes a
// decomposition — had no proof at all: `one()` threw on the empty match set and the caller's per-Issue
// catch at the `selectRevisionLifecycle` call turned the entire Issue read into an unexplained
// `issue_evidence_unresolved` contradiction. A legitimately revised Single-Issue Spec could therefore not
// start its Run on a GitLab-bound repository. A note that binds a superseded publication of this same
// Single-Issue Spec is neither current completion evidence nor provable historical evidence, so it must be
// excluded from `lifecycle`: the node then reads no current completion evidence, the reducer plans the
// dispatch for the revised authority, and the recorded candidate, topic and worktree stay discoverable
// from Git for the lane the Run does dispatch.
//
// Both selectors consume the same snapshot contract, so every case below drives the GitHub and GitLab
// selectors with identical inputs and asserts that the two agree. The GitHub results are additionally
// pinned to the behaviours Issue #132 froze, so agreement cannot be reached by moving both selectors.
const repositoryId = "github:example/repo";
const specId = "I_1";
const issueId = "I_2";
const target = "main";

const publication = (classification, scope, seal, identity) => ({
  identity,
  bodySha256: bodyDigest(`${identity} body`),
  record: { kind: "spec_publication", repositoryId,
    authority: { specId, target, classification, approvedScopeHash: scope, planningSeal: seal, decompositionIdentity: null } },
});
const blockedNote = (operation, extra = {}, reasonCode = "ac8_environment_absent") => ({
  identity: "IC_blocked",
  bodySha256: bodyDigest("blocked note"),
  record: { kind: "implementation_blocked", issueId, specId, target, reasonCode,
    repairWaveCount: 0, operationIdentity: operation, ...extra },
});
const operationFor = scope => deriveExecuteIssueOperationIdentity({ repositoryId, specId, issueId,
  approvedPublicationIdentity: scope });
const issueWith = records => ({ node_id: issueId, state: "open", body: "child body", records });

const drive = (snapshot, issue) => {
  const select = selector => selector({ snapshot: structuredClone(snapshot), issue: structuredClone(issue), repositoryId });
  return { github: select(selectGitHubRevisionLifecycle), gitlab: select(selectGitLabRevisionLifecycle) };
};
const driveStop = (snapshot, issue) => {
  const attempt = selector => {
    try {
      selector({ snapshot: structuredClone(snapshot), issue: structuredClone(issue), repositoryId });
      return null;
    } catch (error) {
      return error;
    }
  };
  const github = attempt(selectGitHubRevisionLifecycle);
  const gitlab = attempt(selectGitLabRevisionLifecycle);
  assert.ok(github, "the GitHub selector must stop on this case");
  assert.ok(gitlab, "the GitLab selector must stop on this case");
  assert.equal(gitlab.message, github.message, "both selectors must stop for the same reason");
  return github;
};

// A Single-Issue Spec that was revised after a blocked attempt: its earlier publication carries no
// decomposition, so the earlier note can never be proven through the MULTI lifecycle.
const revisedSingle = () => {
  const oldScope = bodyDigest("old single body");
  const currentScope = bodyDigest("revised single body");
  const previous = publication("SINGLE", oldScope, "a".repeat(40), "IC_old");
  const current = publication("SINGLE", currentScope, "b".repeat(40), "IC_new");
  return { oldScope, current,
    snapshot: { authority: current.record.authority, spec: { records: [previous, current] },
      publication: current, decomposition: null } };
};

// A proven Multi-Issue previous lifecycle: one previous MULTI publication, its decomposition and the
// matching `to-tickets` handoff, plus the current revised publication and its decomposition.
const revisedMulti = () => {
  const oldScope = bodyDigest("old multi parent");
  const currentScope = bodyDigest("revised multi parent");
  const previous = publication("MULTI", oldScope, "a".repeat(40), "IC_old");
  const decomposition = { identity: "IC_dec", bodySha256: bodyDigest("decomposition body"),
    record: { kind: "decomposition:v1", parent: specId, target, approvedScopeHash: oldScope, planningSeal: "a".repeat(40),
      decompositionMapping: { "1/01": issueId } } };
  const handoff = { identity: "IC_hand", bodySha256: bodyDigest("handoff body"),
    record: { kind: "producer_handoff", producerCommand: "to-tickets", specId, target,
      approvedScopeHash: oldScope, upstreamPublicationIdentity: "IC_old",
      decompositionIdentity: "IC_dec", decompositionDigest: decomposition.bodySha256 } };
  const current = publication("MULTI", currentScope, "b".repeat(40), "IC_new");
  return { oldScope,
    snapshot: { authority: current.record.authority, spec: { records: [previous, decomposition, handoff, current] },
      publication: current,
      decomposition: { identity: "IC_dec_new", record: { kind: "decomposition:v1", decompositionMapping: { "1/01": issueId } } } } };
};

test("the two selectors agree that a stale candidate-bearing note on a revised Single-Issue Spec does not bind this Run", () => {
  const { oldScope, snapshot } = revisedSingle();
  const issue = issueWith([blockedNote(operationFor(oldScope), {
    candidate: "c".repeat(40), topic: "issue/126", worktree: "/home/ron/code/skills-issue-lanes/issue-126",
  })]);

  const { github, gitlab } = drive(snapshot, issue);

  assert.deepEqual(gitlab, github);
  assert.deepEqual(gitlab.lifecycle, []);
  assert.deepEqual(gitlab.historicalBlocks, []);
  assert.equal(gitlab.adoptedCompletion, null);
  assert.deepEqual(gitlab.previousAuthorities, []);
});

test("the two selectors agree that a superseded pre-execution revision blocker on a Single-Issue Spec never throws", () => {
  const { oldScope, snapshot } = revisedSingle();
  const issue = issueWith([blockedNote(operationFor(oldScope), {}, "scope_revision_required")]);

  const { github, gitlab } = drive(snapshot, issue);

  assert.deepEqual(gitlab, github);
  assert.deepEqual(gitlab.lifecycle, []);
  assert.deepEqual(gitlab.historicalBlocks, []);
});

test("the two selectors agree on a current-publication note and a legacy note", () => {
  const scope = bodyDigest("single body");
  const current = publication("SINGLE", scope, "b".repeat(40), "IC_new");
  const legacy = { identity: "IC_legacy", bodySha256: bodyDigest("legacy"),
    record: { kind: "implementation_complete", issueId, specId, target } };
  const snapshot = { authority: current.record.authority, spec: { records: [current] }, publication: current, decomposition: null };

  const { github, gitlab } = drive(snapshot, issueWith([blockedNote(operationFor(scope)), legacy]));

  assert.deepEqual(gitlab, github);
  assert.deepEqual(gitlab.lifecycle.map(item => item.identity).sort(), ["IC_blocked", "IC_legacy"]);
});

test("the two selectors agree that a proven pre-execution revision blocker on a Multi-Issue Spec is still historical", () => {
  const { oldScope, snapshot } = revisedMulti();
  const note = blockedNote(operationFor(oldScope), { planningSeal: "a".repeat(40) }, "scope_revision_required");

  const { github, gitlab } = drive(snapshot, issueWith([note]));

  assert.deepEqual(gitlab, github);
  assert.deepEqual(gitlab.lifecycle, []);
  assert.deepEqual(gitlab.historicalBlocks.map(item => item.identity), ["IC_blocked"]);
  assert.equal(gitlab.historicalBlocks[0].previous.publication.identity, "IC_old");
  assert.deepEqual(gitlab.previousAuthorities.map(item => item.handoff.identity), ["IC_hand"]);
});

test("the two selectors agree that a candidate-bearing previous blocked note on a Multi-Issue Spec still stops", () => {
  const { oldScope, snapshot } = revisedMulti();

  const stopped = driveStop(snapshot, issueWith([
    blockedNote(operationFor(oldScope), { planningSeal: "a".repeat(40), candidate: "c".repeat(40) }),
  ]));

  assert.match(stopped.message, /unresolved lane evidence/u);
});

test("the two selectors agree that an ambiguous Multi-Issue previous lifecycle still stops", () => {
  const { oldScope, snapshot } = revisedMulti();
  const extra = { identity: "IC_dec_b", bodySha256: bodyDigest("second decomposition body"),
    record: { kind: "decomposition:v1", parent: specId, target, approvedScopeHash: oldScope, planningSeal: "a".repeat(40) } };
  snapshot.spec.records.splice(2, 0, extra);

  const stopped = driveStop(snapshot, issueWith([
    blockedNote(operationFor(oldScope), { planningSeal: "a".repeat(40), candidate: "c".repeat(40) }),
  ]));

  assert.match(stopped.message, /Previous lifecycle publication: expected one exact record/u);
});

test("the two selectors agree that a foreign or unprovable identity still stops", () => {
  const { snapshot } = revisedMulti();

  const stopped = driveStop(snapshot, issueWith([blockedNote(operationFor("unpublished authority"), { candidate: "c".repeat(40) })]));

  assert.match(stopped.message, /Previous lifecycle publication: expected one exact record/u);
});
