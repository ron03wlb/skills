import assert from "node:assert/strict";
import test from "node:test";

import { selectRevisionLifecycle } from "../../skills/personal/run-issue-workflow/scripts/github-revision-lifecycle.mjs";
import { bodyDigest } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";
import { deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

// Issue 132: a revised Single-Issue Spec whose earlier operation left a blocked note could not be read at
// all. The selector proves a previous operation only through a previous MULTI publication plus its
// decomposition, so a Single-Issue Spec has no proof and `one()` threw on the empty match set, which made
// the whole Issue read unresolvable. A note that binds a superseded publication of this same Single-Issue
// Spec is neither current completion evidence nor provable historical evidence, so it must not bind this
// Run's authority: the node reads no current completion evidence, the reducer plans the dispatch, and the
// candidate, topic and worktree stay discoverable from Git for that lane.
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

test("a stale blocked note on a revised Single-Issue Spec does not bind this Run", () => {
  const oldScope = bodyDigest("old single body");
  const currentScope = bodyDigest("revised single body");
  const previous = publication("SINGLE", oldScope, "a".repeat(40), "IC_old");
  const current = publication("SINGLE", currentScope, "b".repeat(40), "IC_new");
  const note = blockedNote(operationFor(oldScope), {
    candidate: "c".repeat(40), topic: "issue/126", worktree: "/home/ron/code/skills-issue-lanes/issue-126",
  });
  const result = selectRevisionLifecycle({
    snapshot: { authority: current.record.authority, spec: { records: [previous, current] }, publication: current, decomposition: null },
    issue: { node_id: issueId, state: "open", body: "child body", records: [note] },
    repositoryId,
  });

  assert.deepEqual(result.lifecycle, []);
  assert.deepEqual(result.historicalBlocks, []);
  assert.equal(result.adoptedCompletion, null);
  assert.deepEqual(result.previousAuthorities, []);
});

test("a pre-execution revision blocker on a Single-Issue Spec is superseded evidence too, never a throw", () => {
  const oldScope = bodyDigest("old single body");
  const currentScope = bodyDigest("revised single body");
  const previous = publication("SINGLE", oldScope, "a".repeat(40), "IC_old");
  const current = publication("SINGLE", currentScope, "b".repeat(40), "IC_new");
  const result = selectRevisionLifecycle({
    snapshot: { authority: current.record.authority, spec: { records: [previous, current] }, publication: current, decomposition: null },
    issue: { node_id: issueId, state: "open", body: "child body",
      records: [blockedNote(operationFor(oldScope), {}, "scope_revision_required")] },
    repositoryId,
  });

  assert.deepEqual(result.lifecycle, []);
  assert.deepEqual(result.historicalBlocks, []);
});

test("a note bound to the current publication and a legacy note keep their existing handling", () => {
  const scope = bodyDigest("single body");
  const current = publication("SINGLE", scope, "b".repeat(40), "IC_new");
  const legacy = { identity: "IC_legacy", bodySha256: bodyDigest("legacy"), record: { kind: "implementation_complete", issueId, specId, target } };
  const result = selectRevisionLifecycle({
    snapshot: { authority: current.record.authority, spec: { records: [current] }, publication: current, decomposition: null },
    issue: { node_id: issueId, state: "open", body: "child body",
      records: [blockedNote(operationFor(scope)), legacy] },
    repositoryId,
  });

  assert.deepEqual(result.lifecycle.map(item => item.identity).sort(), ["IC_blocked", "IC_legacy"]);
});

test("an ambiguous Multi-Issue previous lifecycle still stops instead of being treated as current", () => {
  const oldScope = bodyDigest("old multi parent");
  const currentScope = bodyDigest("revised multi parent");
  const previous = publication("MULTI", oldScope, "a".repeat(40), "IC_old");
  const current = publication("MULTI", currentScope, "b".repeat(40), "IC_new");
  const decomposition = identity => ({ identity, bodySha256: bodyDigest(identity),
    record: { kind: "decomposition:v1", parent: specId, target, approvedScopeHash: oldScope, planningSeal: "a".repeat(40) } });
  const note = blockedNote(operationFor("IC_old"), { candidate: "c".repeat(40) });

  // Two decompositions of the same previous publication both match the note's approved publication
  // identity, so the previous lifecycle is ambiguous and must keep stopping.
  assert.throws(() => selectRevisionLifecycle({
    snapshot: { authority: current.record.authority, spec: { records: [previous, decomposition("IC_dec_a"), decomposition("IC_dec_b"), current] },
      publication: current, decomposition: null },
    issue: { node_id: issueId, state: "open", body: "child body", records: [note] },
    repositoryId,
  }), /Previous lifecycle publication: expected one exact record/u);
});
