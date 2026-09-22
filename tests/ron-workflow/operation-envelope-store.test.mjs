import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  OPERATION_ENVELOPE_SCHEMA,
  createOperationEnvelopeStore,
  envelopeIdFor,
} from "../../skills/personal/run-issue-workflow/scripts/operation-envelope-store.mjs";

const identity = Object.freeze({
  repositoryId: "github:example/project",
  specId: "I_17",
  operationId: "workflow-op-vnext-17",
  target: "main",
});
const intent = Object.freeze({
  title: "Decision",
  body: "# Decision\n\nKeep the read-back boundary.\n",
  bodyDigest: "sha256:1f4a54f164460ba2c66377f8be06063a6a17b3635c093cd112a59641e6eb790a",
  contentType: "text/markdown",
  effects: [{ action: "tracker-write", scope: "Issue I_17" }],
});
const receipt = Object.freeze({
  stage: "tracker.read_back",
  owner: "tracker",
  readBack: { publicationIdentity: "IC_17", bodyDigest: intent.bodyDigest },
});

function fixture(t) {
  const gitCommonDir = mkdtempSync(join(tmpdir(), "operation-envelope-store-"));
  t.after(() => rmSync(gitCommonDir, { recursive: true, force: true }));
  return { gitCommonDir, store: createOperationEnvelopeStore({ gitCommonDir }) };
}

test("persists canonical body before receipts and reads it back by identity", t => {
  const { gitCommonDir, store } = fixture(t);
  const created = store.create({ identity, intent, maintenanceIssue: "I_88" });
  assert.equal(created.schema, OPERATION_ENVELOPE_SCHEMA);
  assert.equal(created.envelopeId, envelopeIdFor(identity));
  assert.equal(created.intent.body, intent.body);
  assert.equal(created.maintenanceIssue, "I_88");
  assert.deepEqual(store.read(identity), created);
  const path = join(gitCommonDir, "matt-workflow-control", "operation-envelopes", `${created.envelopeId.slice(7)}.json`);
  assert.equal(existsSync(path), true);
  assert.match(readFileSync(path, "utf8"), /Keep the read-back boundary/u);
});

test("creation and the same receipt are idempotent but changed canonical content or receipts fail", t => {
  const { store } = fixture(t);
  const created = store.create({ identity, intent, workspace: { path: "docs/adr/0387.md", clean: true } });
  assert.deepEqual(store.create({ identity, intent, workspace: { clean: true, path: "docs/adr/0387.md" } }), created);
  assert.throws(() => store.create({ identity, intent: { ...intent, body: "# Changed\n", bodyDigest: "sha256:fa8549bc791b513f06435d4e2b912b37bfed2e8388ad5edd89c33a9fee467f7a" }, workspace: { path: "docs/adr/0387.md", clean: true } }), /content differs/u);
  const advanced = store.appendReceipt({ identity, receipt });
  assert.equal(advanced.receipts.length, 1);
  assert.deepEqual(store.appendReceipt({ identity, receipt }), advanced);
  assert.throws(() => store.appendReceipt({ identity, receipt: { ...receipt, readBack: { publicationIdentity: "IC_changed", bodyDigest: intent.bodyDigest } } }), /receipt differs/u);
});

test("rejects body digest mismatch, secret-bearing content, and receipts after completion", t => {
  const { store } = fixture(t);
  assert.throws(() => store.create({ identity, intent: { ...intent, bodyDigest: "sha256:" + "0".repeat(64) } }), /digest differs/u);
  assert.throws(() => store.create({ identity: { ...identity, token: "nope" }, intent }), /token/u);
  store.create({ identity, intent });
  const completed = store.complete({ identity, receipt: { stage: "handoff.read_back", owner: "tracker", readBack: { handoffIdentity: "IC_18" } } });
  assert.equal(completed.state, "COMPLETED");
  assert.throws(() => store.appendReceipt({ identity, receipt }), /Completed/u);
  assert.deepEqual(store.complete({ identity, receipt: { stage: "handoff.read_back", owner: "tracker", readBack: { handoffIdentity: "IC_18" } } }), completed);
});
