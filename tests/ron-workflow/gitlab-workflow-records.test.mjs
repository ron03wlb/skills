// The GitLab workflow record encoding: native note identity, exact body digest, live Developer trust, and
// the refusal of malformed, duplicated, foreign, changed, untrusted or unresolved evidence.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendWorkflowRecord,
  bodyDigest,
  legacyCompletionAllowed,
  readWorkflowRecords,
  renderWorkflowRecord,
  workflowRecordKey,
} from "../../skills/personal/run-issue-workflow/scripts/gitlab-workflow-records.mjs";

const BASE_URL = "https://gitlab.example";
const PROJECT = "group/sub/project";
const PROJECT_URL = `${BASE_URL}/${PROJECT}`;
const REPOSITORY_ID = `gitlab:gitlab.example/${PROJECT}`;
const ISSUE_IID = 169;
const ISSUE_IDENTITY = `${PROJECT_URL}/-/issues/${ISSUE_IID}`;

const developer = { id: 7, access_level: 40 };
const reporter = { id: 8, access_level: 20 };
const author = async (id) => {
  if (id === developer.id) return;
  if (id === reporter.id) throw new Error("Record author is not a project Developer or higher");
  throw new Error("Record author is not a project Developer or higher");
};

const completionRecord = (overrides = {}) => ({
  kind: "implementation_complete",
  repositoryId: REPOSITORY_ID,
  issueId: ISSUE_IDENTITY,
  specId: ISSUE_IDENTITY,
  target: "features/ron",
  candidate: "a".repeat(40),
  standards: "clean",
  spec: "clean",
  verification: [{ command: "node --test tests/ron-workflow/", result: "PASS" }],
  ...overrides,
});

const note = (id, record, { authorId = developer.id, body = null } = {}) => ({
  id,
  noteable_iid: ISSUE_IID,
  noteable_type: "Issue",
  system: false,
  author: { id: authorId },
  body: body ?? renderWorkflowRecord(record),
  created_at: "2026-09-18T06:00:00.000Z",
});

const read = (notes, overrides = {}) => readWorkflowRecords({
  notes,
  repositoryId: REPOSITORY_ID,
  issueIdentity: ISSUE_IDENTITY,
  issueIid: ISSUE_IID,
  assertAuthor: author,
  ...overrides,
});

test("a record is identified by its native note id and the exact SHA-256 of its body", async () => {
  const record = completionRecord();
  const records = await read([note(41, record)]);
  assert.equal(records.length, 1);
  assert.equal(records[0].noteId, 41);
  assert.equal(records[0].identity, `${ISSUE_IDENTITY}#note_41`);
  assert.equal(records[0].bodySha256, bodyDigest(renderWorkflowRecord(record)));
  assert.deepEqual(records[0].record, record);
  assert.equal(records[0].createdAt, "2026-09-18T06:00:00.000Z");
});

test("a note without a workflow record contributes nothing", async () => {
  assert.deepEqual(await read([{ id: 5, system: false, author: { id: developer.id }, body: "plain description" }]), []);
  assert.deepEqual(await read([{ id: 6, system: true, author: { id: developer.id }, body: renderWorkflowRecord(completionRecord()) }]), []);
});

test("only a Developer or higher authored record is accepted, and a Reporter stops the read", async () => {
  await assert.rejects(() => read([note(42, completionRecord(), { authorId: reporter.id })]),
    /not a project Developer or higher/u);
  const trusted = await read([note(43, completionRecord())]);
  assert.equal(trusted.length, 1);
});

test("a malformed, duplicated, foreign or changed record stops the read", async () => {
  await assert.rejects(() => read([{ ...note(44, completionRecord()), body: "```workflow-record\n{ oops }\n```" }]),
    /Malformed workflow record JSON/u);
  await assert.rejects(() => read([{
    ...note(45, completionRecord()),
    body: `${renderWorkflowRecord(completionRecord())}\n${renderWorkflowRecord(completionRecord({ target: "other" }))}`,
  }]), /exactly one record/u);
  await assert.rejects(() => read([note(46, completionRecord({ repositoryId: "gitlab:gitlab.example/other/project" }))]),
    /belongs to another repository/u);
  await assert.rejects(() => read([note(47, completionRecord())], {
    reReadNote: async () => ({ id: 47, body: "changed after the list read" }),
  }), /changed during read-back/u);
  await assert.rejects(() => read([{ id: 48, system: false, author: { id: developer.id }, body: renderWorkflowRecord(completionRecord()), noteable_iid: 170, noteable_type: "Issue" }]),
    /another noteable/u);
  await assert.rejects(() => read([{ system: false, noteable_iid: ISSUE_IID, noteable_type: "Issue", author: { id: developer.id }, body: renderWorkflowRecord(completionRecord()) }]),
    /no native note id/u);
});

test("the renderer writes the existing fence and refuses an unknown kind", () => {
  const rendered = renderWorkflowRecord(completionRecord());
  assert.match(rendered, /^```workflow-record\n\{/u);
  assert.match(rendered, /\n```$/u);
  assert.throws(() => renderWorkflowRecord({ kind: "invented" }), /Unsupported workflow record kind/u);
});

test("the legacy frontier admits only its exact listed evidence", () => {
  const completion = { identity: `${ISSUE_IDENTITY}#note_50`, bodySha256: bodyDigest("body") };
  const adoption = {
    kind: "workflow_operation_identity_contract_adopted:v1",
    repository: PROJECT,
    tracker: REPOSITORY_ID,
    spec: ISSUE_IDENTITY,
    targetBranch: "features/ron",
    legacyCompletionFrontier: [{ issue: ISSUE_IDENTITY, evidenceIdentity: completion.identity, bodySha256: completion.bodySha256 }],
  };
  const args = { kind: adoption.kind, repository: PROJECT, repositoryId: REPOSITORY_ID, specId: ISSUE_IDENTITY, target: "features/ron", completion: { record: { issueId: ISSUE_IDENTITY }, ...completion } };
  assert.equal(legacyCompletionAllowed({ ...args, records: [] }), true, "an unadopted scope keeps its contract");
  assert.equal(legacyCompletionAllowed({ ...args, records: [{ identity: "x", record: adoption }] }), true);
  assert.equal(legacyCompletionAllowed({ ...args, records: [{ identity: "x", record: adoption }], completion: { record: { issueId: ISSUE_IDENTITY }, identity: `${ISSUE_IDENTITY}#note_51`, bodySha256: bodyDigest("body") } }), false);
  assert.equal(legacyCompletionAllowed({ ...args, records: [{ identity: "x", record: { ...adoption, tracker: "gitlab:other/project" } }] }), false);
});

test("an append proves its own native note read-back and reuses an identical record", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gitlab-records-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const notes = [];
  const connection = {
    repositoryId: REPOSITORY_ID,
    gitCommonDir: root,
    userId: developer.id,
    assertAuthor: author,
    list: async () => notes,
    api: async (path, method, body) => {
      if (path.endsWith("/notes") && method === "POST") {
        const created = { id: notes.length + 100, noteable_iid: ISSUE_IID, noteable_type: "Issue", system: false, author: { id: developer.id }, body: body.body };
        notes.push(created);
        return created;
      }
      throw new Error(`Unexpected fixture request ${method} ${path}`);
    },
  };
  const record = completionRecord();
  const first = await appendWorkflowRecord({ connection, issueIid: ISSUE_IID, issueIdentity: ISSUE_IDENTITY, record });
  assert.equal(first.state, "APPENDED");
  assert.equal(first.identity, `${ISSUE_IDENTITY}#note_100`);
  assert.equal(first.bodySha256, bodyDigest(renderWorkflowRecord(record)));
  assert.equal(notes.length, 1);
  const again = await appendWorkflowRecord({ connection, issueIid: ISSUE_IID, issueIdentity: ISSUE_IDENTITY, record });
  assert.equal(again.identity, first.identity, "an identical record is reused, not appended twice");
  assert.equal(notes.length, 1);
  await assert.rejects(
    () => appendWorkflowRecord({ connection, issueIid: ISSUE_IID, issueIdentity: ISSUE_IDENTITY, record: completionRecord({ target: "other" }) }),
    /differs/u,
  );
});

test("an unresolved or rejected write is never reported as success", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gitlab-records-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const notes = [];
  const lost = {
    repositoryId: REPOSITORY_ID,
    gitCommonDir: root,
    userId: developer.id,
    assertAuthor: author,
    list: async () => notes,
    api: async () => { throw new Error("connection dropped after delivery"); },
  };
  await assert.rejects(
    () => appendWorkflowRecord({ connection: lost, issueIid: ISSUE_IID, issueIdentity: ISSUE_IDENTITY, record: completionRecord() }),
    /unresolved/u,
  );
  const rejected = {
    ...lost,
    gitCommonDir: mkdtempSync(join(tmpdir(), "gitlab-records-")),
    api: async () => {
      throw Object.assign(new Error("GitLab 415 request failed (HTTP 415)."), { code: "GITLAB_PRODUCER_TRANSPORT", httpStatus: 415, outcome: "REJECTED", requestId: "fixture" });
    },
  };
  t.after(() => rmSync(rejected.gitCommonDir, { recursive: true, force: true }));
  await assert.rejects(
    () => appendWorkflowRecord({ connection: rejected, issueIid: ISSUE_IID, issueIdentity: ISSUE_IDENTITY, record: completionRecord() }),
    /rejected the mutation/u,
  );
});

test("the record key binds one kind to its Issue and operation", () => {
  const record = completionRecord({ operationIdentity: { key: "workflow-op-v1-x" } });
  assert.equal(workflowRecordKey(record, ISSUE_IDENTITY), `implementation_complete|${ISSUE_IDENTITY}|workflow-op-v1-x`);
});
