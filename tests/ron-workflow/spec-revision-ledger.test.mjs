import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BASE_SCOPE_SCHEMA,
  SPEC_REVISION_REQUEST_SCHEMA,
  createSpecRevisionLedger,
  deriveBaseScopeIdentity,
  impactClosure,
  revisionDigest,
} from "../../skills/personal/run-issue-workflow/scripts/spec-revision-ledger.mjs";

const commit = "a".repeat(40);
const digest = (value) => revisionDigest({ value });
const run = Object.freeze({ runId: "run-1", specId: "S_1", approvedScopeHash: "scope-1", target: "main", classification: "MULTI", decompositionIdentity: "decomposition-1" });
const scope = () => ({
  parent: { specId: "S_1", target: "main", planningSeal: commit, baseline: commit,
    authorityIdentity: "authority-1", approvedScopeHash: "scope-1", decompositionIdentity: "decomposition-1", classification: "MULTI" },
  children: [
    { issueId: "I_1", contractDigest: digest("I_1") },
    { issueId: "I_2", contractDigest: digest("I_2") },
    { issueId: "I_3", contractDigest: digest("I_3") },
    { issueId: "I_4", contractDigest: digest("I_4") },
  ],
  blockerEdges: [
    { blocker: "I_1", blocked: "I_2" },
    { blocker: "I_2", blocked: "I_3" },
  ],
});
const request = (previousRevisionIdentity, directAffectedIssueIds = ["I_1"]) => ({
  schema: SPEC_REVISION_REQUEST_SCHEMA, specId: "S_1", target: "main", predecessorRunId: "run-1",
  previousRevisionIdentity, scopeSnapshot: scope(), directAffectedIssueIds, adoptedCompletions: [],
});

test("revision closure uses only declared published blocker edges", () => {
  assert.deepEqual(impactClosure({ scopeSnapshot: scope(), directAffectedIssueIds: ["I_1"] }), ["I_1", "I_2", "I_3"]);
  assert.deepEqual(impactClosure({ scopeSnapshot: scope(), directAffectedIssueIds: ["I_4"] }), ["I_4"]);
  assert.throws(() => impactClosure({ scopeSnapshot: scope(), directAffectedIssueIds: ["unknown"] }), { code: "REVISION_UNKNOWN_ISSUE" });
});

test("ledger appends an immutable revision and atomically projects one current head", (t) => {
  const root = mkdtempSync(join(tmpdir(), "spec-revision-ledger-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ledger = createSpecRevisionLedger({ gitCommonDir: root });
  const at = "2026-10-01T00:00:00.000Z";
  const first = ledger.activate({ request: request(deriveBaseScopeIdentity(run)), baseRevisionIdentity: deriveBaseScopeIdentity(run), createdAt: at });
  assert.equal(first.reused, false);
  assert.deepEqual(first.revision.impactClosureIssueIds, ["I_1", "I_2", "I_3"]);
  assert.equal(first.activation.revisionIdentity, first.revision.revisionIdentity);
  assert.equal(first.activation.activationIdentity, first.revision.activationIdentity);
  assert.equal(ledger.read("S_1").head.revisionIdentity, first.revision.revisionIdentity);
  const replay = ledger.activate({ request: request(deriveBaseScopeIdentity(run)), baseRevisionIdentity: deriveBaseScopeIdentity(run), createdAt: at });
  assert.equal(replay.reused, true);
  assert.equal(replay.revision.revisionIdentity, first.revision.revisionIdentity);
  const paths = ledger.pathsFor("S_1");
  assert.equal(readFileSync(paths.journal, "utf8").trim().split("\n").length, 2, "idempotent retry never appends another record");
  assert.throws(() => ledger.activate({ request: request(deriveBaseScopeIdentity(run), ["I_4"]), baseRevisionIdentity: deriveBaseScopeIdentity(run), createdAt: at }), { code: "REVISION_STALE_HEAD" });
});

test("scope and request identities fail closed on malformed or inconsistent authority", () => {
  const base = deriveBaseScopeIdentity(run);
  assert.match(base, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(BASE_SCOPE_SCHEMA, "base_run_scope:v1");
  assert.throws(() => impactClosure({ scopeSnapshot: { ...scope(), blockerEdges: [{ blocker: "I_2", blocked: "I_1" }, { blocker: "I_1", blocked: "I_2" }] }, directAffectedIssueIds: ["I_1"] }), { code: "REVISION_MALFORMED" });
  const invalid = request(base);
  invalid.scopeSnapshot.parent.target = "other";
  const ledger = createSpecRevisionLedger({ gitCommonDir: mkdtempSync(join(tmpdir(), "spec-revision-invalid-")) });
  assert.throws(() => ledger.activate({ request: invalid, baseRevisionIdentity: base, createdAt: "2026-10-01T00:00:00.000Z" }), { code: "REVISION_SCOPE_CONFLICT" });
});
