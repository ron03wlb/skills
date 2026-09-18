// GitLab workflow records.
//
// The GitLab encoding of the existing workflow record kinds. It adds no authority: it renders and reads
// the same `workflow-record` fenced JSON the GitHub encoding uses, and it identifies a record the way a
// GitLab note can be identified — its native note id plus the SHA-256 of its exact body — instead of a
// GitHub comment's node id and author association. Trust is a live project membership read, so only a
// current Developer or higher (`access_level >= 30`) authored record is accepted, and a note that is
// unreadable, malformed, duplicated, foreign, changed or untrusted stops the read instead of shrinking
// the evidence. Every write goes through the existing producer mutation owner, so an unresolved write is
// never reported as success.
import { createHash } from "node:crypto";

import { conflict } from "./gitlab-producer-transport.mjs";
import { mutateOnce } from "./gitlab-producer-mutations.mjs";

export const WORKFLOW_RECORD_FENCE = "workflow-record";
export const WORKFLOW_RECORD_KINDS = Object.freeze([
  "spec_publication",
  "producer_handoff",
  "decomposition:v1",
  "implementation_complete",
  "implementation_blocked",
  "implementation_progress",
  "implementation_repair_progress",
  "workflow_operation_identity_contract_adopted:v1",
  "workflow_artifacts_contract_adopted:v1",
]);
const kinds = new Set(WORKFLOW_RECORD_KINDS);
const blocks = /^```(?:workflow-record|json)\r?\n([\s\S]*?)^```\s*$/gmu;

export const bodyDigest = (body) => `sha256:${createHash("sha256").update(body).digest("hex")}`;

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

// Serialization of the existing owners' payloads, not an additional source of authority.
export function renderWorkflowRecord(record) {
  if (!kinds.has(record?.kind)) throw conflict("Unsupported workflow record kind");
  return `\`\`\`${WORKFLOW_RECORD_FENCE}\n${JSON.stringify(record, null, 2)}\n\`\`\``;
}

const noteIdentity = (note, index) => {
  if (!isRecord(note) || !Number.isSafeInteger(note.id) || note.id < 1) throw conflict(`Workflow note ${index} has no native note id`);
  return note.id;
};

// One exact native note read: identity plus the digest of the bytes it returned. The re-read port is the
// change detector — when the owning composition supplies it, a note whose bytes moved between the list
// read and its own read stops the whole read instead of contributing vacuous evidence.
const acceptNote = async ({ note, index, repositoryId, issueIdentity, issueIid, assertAuthor, reReadNote }) => {
  const noteId = noteIdentity(note, index);
  if (note.system === true) return null;
  const body = typeof note.body === "string" ? note.body : "";
  const found = [...body.matchAll(blocks)];
  // A note without a recognized record contributes nothing, whatever it is; only a note that claims a
  // record has to prove it belongs to this Issue.
  if (found.length === 0) return null;
  if (issueIid !== null && (note.noteable_type !== "Issue" || note.noteable_iid !== issueIid)) {
    throw conflict(`Workflow note ${noteId} belongs to another noteable`);
  }
  if (found.length !== 1) throw conflict("A workflow note must contain exactly one record");
  let record;
  try { record = JSON.parse(found[0][1]); }
  catch { throw conflict("Malformed workflow record JSON"); }
  if (!kinds.has(record?.kind)) throw conflict("Malformed workflow record identity or kind");
  if (record.repositoryId !== repositoryId) throw conflict("Workflow record belongs to another repository");
  if (typeof assertAuthor !== "function") throw conflict("Workflow record trust cannot be read without the project membership owner");
  await assertAuthor(note.author?.id);
  if (typeof reReadNote === "function") {
    const fresh = await reReadNote(noteId);
    if (!isRecord(fresh) || fresh.id !== noteId || fresh.body !== note.body) throw conflict("Workflow note changed during read-back");
  }
  return Object.freeze({
    identity: `${issueIdentity}#note_${noteId}`,
    noteId,
    bodySha256: bodyDigest(note.body),
    createdAt: note.created_at ?? null,
    record,
  });
};

// Every workflow record one Issue's notes carry, in note order. A note without a recognized record
// contributes nothing; a note that carries one contributes exactly that record or stops the read.
export async function readWorkflowRecords({
  notes,
  repositoryId,
  issueIdentity,
  issueIid = null,
  assertAuthor,
  reReadNote = null,
} = {}) {
  if (!Array.isArray(notes)) throw conflict("GitLab notes must be one array read");
  if (typeof repositoryId !== "string" || !repositoryId) throw conflict("Workflow record reads need the repository identity");
  if (typeof issueIdentity !== "string" || !issueIdentity) throw conflict("Workflow record reads need the Issue identity");
  if (issueIid !== null && (!Number.isSafeInteger(issueIid) || issueIid < 1)) throw conflict("Workflow record reads need one native Issue iid");
  const records = [];
  for (const [index, note] of notes.entries()) {
    const accepted = await acceptNote({ note, index, repositoryId, issueIdentity, issueIid, assertAuthor, reReadNote });
    if (accepted !== null) records.push(accepted);
  }
  return Object.freeze(records);
}

// The legacy compatibility frontier. An adoption record binds the exact repository, tracker, Spec and
// target branch it was adopted for; only a completion listed by its exact native evidence and body digest
// may omit `operationIdentity`, and only after such a record exists.
export function legacyCompletionAllowed({ records, kind, repository, repositoryId, specId, target, completion }) {
  const adoptions = records.filter(item => item.record.kind === kind).map(item => item.record);
  if (adoptions.length === 0) return true; // A truly unadopted scope keeps its existing contract.
  const first = adoptions[0];
  if (adoptions.some(record => JSON.stringify(canonical(record)) !== JSON.stringify(canonical(first)))
    || first.repository !== repository || first.tracker !== repositoryId
    || first.spec !== specId || first.targetBranch !== target || !Array.isArray(first.legacyCompletionFrontier)) return false;
  const frontier = first.legacyCompletionFrontier;
  if (new Set(frontier.map(item => item.issue)).size !== frontier.length || frontier.some(item =>
    typeof item.issue !== "string" || typeof item.evidenceIdentity !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(item.bodySha256))) return false;
  return frontier.some(item => item.issue === completion.record.issueId
    && item.evidenceIdentity === completion.identity && item.bodySha256 === completion.bodySha256);
}

// The one record key a note append owns. Two records of the same kind and key are an ambiguity a human
// resolves; an identical record is the read-back of the same append.
export const workflowRecordKey = (record, issueIdentity) =>
  `${String(record?.kind ?? "")}|${String(record?.issueId ?? issueIdentity)}|${String(record?.operationIdentity?.key ?? record?.operationId ?? record?.runId ?? "")}`;

// The owning writer. It renders the record, appends it through the existing producer mutation owner, and
// proves the exact note by re-reading it: a rejected attempt is reported as rejected, and an attempt whose
// result cannot be read back is reported as unresolved — never as success.
export async function appendWorkflowRecord({
  connection,
  issueIid,
  issueIdentity,
  record,
  retryRejected = false,
} = {}) {
  if (!isRecord(connection) || typeof connection.api !== "function" || typeof connection.list !== "function") {
    throw conflict("Workflow record writes need one connected GitLab producer");
  }
  if (!Number.isSafeInteger(issueIid) || issueIid < 1) throw conflict("Workflow record writes need one native Issue iid");
  const body = renderWorkflowRecord(record);
  const key = workflowRecordKey(record, issueIdentity);
  const readBack = async () => {
    const found = await readWorkflowRecords({
      notes: await connection.list(`/issues/${issueIid}/notes`),
      repositoryId: connection.repositoryId,
      issueIdentity,
      issueIid,
      assertAuthor: connection.assertAuthor,
    });
    const candidates = found.filter(item => workflowRecordKey(item.record, issueIdentity) === key);
    if (candidates.length > 1) throw conflict("Multiple records claim the same workflow record key");
    if (candidates.length === 0) return null;
    const [existing] = candidates;
    if (JSON.stringify(existing.record) !== JSON.stringify(record)) throw conflict("An existing workflow record with this key differs");
    return Object.freeze({ state: "APPENDED", record: existing.record, identity: existing.identity, noteId: existing.noteId, bodySha256: existing.bodySha256 });
  };
  return mutateOnce(connection, {
    key,
    payload: record,
    retryRejected,
    observe: readBack,
    write: async () => {
      await connection.assertAuthor(connection.userId);
      const created = await connection.api(`/issues/${issueIid}/notes`, "POST", { body });
      if (!isRecord(created) || typeof created.body !== "string" || created.body !== body) {
        throw conflict("GitLab did not return the appended workflow note");
      }
    },
  });
}
