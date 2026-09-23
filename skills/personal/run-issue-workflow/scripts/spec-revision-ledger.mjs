// Local, append-only authority for revisions to an already published delivery scope.
//
// Tracker records deliberately do not participate in this store: they remain locators for the
// delivery Issues, while this journal is the sole authority for a replacement scope.  A record is
// validated before it is appended and a head is only a replaceable projection of valid journal data.
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const SPEC_REVISION_SCHEMA = "spec_revision:v1";
export const REVISION_ACTIVATION_SCHEMA = "revision_activation:v1";
export const SPEC_REVISION_REQUEST_SCHEMA = "spec_revision_request:v1";
export const SPEC_REVISION_HEAD_SCHEMA = "spec_revision_head:v1";
export const BASE_SCOPE_SCHEMA = "base_run_scope:v1";

const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const gitObjectPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const compare = (left, right) => String(left).localeCompare(String(right), "en");

const fail = (code, message = code) => Object.assign(new Error(message), { code });
const assert = (condition, code, message) => {
  if (!condition) throw fail(code, message);
};
const exact = (value, keys, label) => {
  assert(isRecord(value), "REVISION_MALFORMED", `${label} must be an object`);
  const actual = Object.keys(value).sort(compare);
  const expected = [...keys].sort(compare);
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    "REVISION_MALFORMED", `${label} must contain exactly ${expected.join(", ")}`);
};
const secretFree = (value, seen = new WeakSet()) => {
  if (value === null || typeof value !== "object") return;
  assert(!seen.has(value), "REVISION_MALFORMED", "Revision data must not contain cycles");
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    assert(!/(?:token|secret|password|credential|authorization)/iu.test(key), "REVISION_SECRET", "Revision data must not persist credentials");
    secretFree(child, seen);
  }
  seen.delete(value);
};

// Canonical JSON deliberately preserves array order.  Child and edge order is validated below so
// request identity has one representation and cannot hide a reordered published graph.
export const canonicalJson = (value, seen = new WeakSet()) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  assert(value && typeof value === "object", "REVISION_MALFORMED", "Revision data must be JSON-compatible");
  assert(!seen.has(value), "REVISION_MALFORMED", "Revision data must not contain cycles");
  seen.add(value);
  let normalized;
  if (Array.isArray(value)) normalized = value.map((item) => canonicalJson(item, seen));
  else {
    const prototype = Object.getPrototypeOf(value);
    assert(prototype === Object.prototype || prototype === null, "REVISION_MALFORMED", "Revision data must use plain objects");
    normalized = Object.fromEntries(Object.keys(value).sort(compare).map((key) => [key, canonicalJson(value[key], seen)]));
  }
  seen.delete(value);
  return normalized;
};
export const revisionDigest = (value) => `sha256:${createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex")}`;

const requireText = (value, label) => assert(isText(value), "REVISION_MALFORMED", `${label} is required`);
const requireDigest = (value, label) => assert(sha256Pattern.test(value ?? ""), "REVISION_MALFORMED", `${label} must be a SHA-256 identity`);
const requireIso = (value, label) => assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value, "REVISION_MALFORMED", `${label} must be a canonical ISO instant`);
const sortedUnique = (items, label) => {
  assert(Array.isArray(items) && items.length > 0 && items.every(isText), "REVISION_MALFORMED", `${label} must be a non-empty Issue ID list`);
  assert(new Set(items).size === items.length && items.every((item, index) => index === 0 || compare(items[index - 1], item) < 0),
    "REVISION_MALFORMED", `${label} must be sorted and unique`);
};

export function deriveBaseScopeIdentity(runIdentity) {
  // A successor Grant may additionally bind its revisionIdentity. It is not part of the original
  // Run-ready scope identity, so retain the legacy immutable Run fields and reject no valid successor.
  assert(isRecord(runIdentity), "REVISION_MALFORMED", "base Run identity must be an object");
  const baseRunIdentity = Object.fromEntries([
    "runId", "specId", "approvedScopeHash", "target", "classification", "decompositionIdentity",
  ].map((key) => [key, runIdentity[key]]));
  exact(baseRunIdentity, ["runId", "specId", "approvedScopeHash", "target", "classification", "decompositionIdentity"], "base Run identity");
  for (const key of ["runId", "specId", "approvedScopeHash", "target", "classification"]) requireText(baseRunIdentity[key], `base Run identity.${key}`);
  assert(["SINGLE", "MULTI"].includes(baseRunIdentity.classification), "REVISION_MALFORMED", "base Run classification is invalid");
  assert((baseRunIdentity.classification === "SINGLE" && baseRunIdentity.decompositionIdentity === null)
    || (baseRunIdentity.classification === "MULTI" && isText(baseRunIdentity.decompositionIdentity)), "REVISION_MALFORMED", "base Run decomposition identity is invalid");
  return revisionDigest({ schema: BASE_SCOPE_SCHEMA, runIdentity: baseRunIdentity });
}

// This is intentionally the complete authority snapshot, not a patch to a mutable Spec body.
export function validateScopeSnapshot(snapshot) {
  exact(snapshot, ["parent", "children", "blockerEdges"], "revision scopeSnapshot");
  exact(snapshot.parent, ["specId", "target", "planningSeal", "baseline", "authorityIdentity", "approvedScopeHash", "decompositionIdentity", "classification"], "revision scopeSnapshot.parent");
  const parent = snapshot.parent;
  for (const key of ["specId", "target", "planningSeal", "authorityIdentity", "approvedScopeHash", "classification"]) requireText(parent[key], `scope parent.${key}`);
  assert(gitObjectPattern.test(parent.baseline ?? ""), "REVISION_MALFORMED", "scope parent.baseline must be a Git object");
  assert(["SINGLE", "MULTI"].includes(parent.classification), "REVISION_MALFORMED", "scope parent.classification is invalid");
  assert((parent.classification === "SINGLE" && parent.decompositionIdentity === null)
    || (parent.classification === "MULTI" && isText(parent.decompositionIdentity)), "REVISION_MALFORMED", "scope parent.decompositionIdentity is invalid");
  assert(Array.isArray(snapshot.children) && snapshot.children.length > 0, "REVISION_MALFORMED", "scopeSnapshot.children is required");
  const childIds = [];
  for (const child of snapshot.children) {
    exact(child, ["issueId", "contractDigest"], "revision child");
    requireText(child.issueId, "revision child.issueId");
    requireDigest(child.contractDigest, "revision child.contractDigest");
    childIds.push(child.issueId);
  }
  assert(new Set(childIds).size === childIds.length && childIds.every((id, index) => index === 0 || compare(childIds[index - 1], id) < 0),
    "REVISION_MALFORMED", "scopeSnapshot.children must be sorted by unique Issue ID");
  assert(Array.isArray(snapshot.blockerEdges), "REVISION_MALFORMED", "scopeSnapshot.blockerEdges must be an array");
  let last = null;
  const edgeKeys = new Set();
  for (const edge of snapshot.blockerEdges) {
    exact(edge, ["blocker", "blocked"], "published blocker edge");
    requireText(edge.blocker, "published blocker edge.blocker");
    requireText(edge.blocked, "published blocker edge.blocked");
    assert(childIds.includes(edge.blocker) && childIds.includes(edge.blocked), "REVISION_UNKNOWN_ISSUE", "A published blocker edge references an Issue outside scopeSnapshot.children");
    assert(edge.blocker !== edge.blocked, "REVISION_CYCLE", "A published blocker edge cannot be self-referential");
    const key = `${edge.blocker}\0${edge.blocked}`;
    assert(!edgeKeys.has(key) && (last === null || compare(last, key) < 0), "REVISION_MALFORMED", "scopeSnapshot.blockerEdges must be sorted and unique");
    edgeKeys.add(key); last = key;
  }
  // Prove the immutable published graph is acyclic before a closure can authorize work from it.
  const childrenByBlocker = new Map(childIds.map((id) => [id, []]));
  for (const edge of snapshot.blockerEdges) childrenByBlocker.get(edge.blocker).push(edge.blocked);
  const seen = new Set(), visiting = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw fail("REVISION_CYCLE", "Published blocker edges contain a cycle");
    if (seen.has(id)) return;
    visiting.add(id);
    for (const next of childrenByBlocker.get(id)) visit(next);
    visiting.delete(id); seen.add(id);
  };
  childIds.forEach(visit);
  secretFree(snapshot);
  return canonicalJson(snapshot);
}

export function impactClosure({ scopeSnapshot, directAffectedIssueIds }) {
  const scope = validateScopeSnapshot(scopeSnapshot);
  sortedUnique(directAffectedIssueIds, "directAffectedIssueIds");
  const known = new Set(scope.children.map(({ issueId }) => issueId));
  for (const issueId of directAffectedIssueIds) assert(known.has(issueId), "REVISION_UNKNOWN_ISSUE", `Direct affected Issue ${issueId} is not in the immutable scope snapshot`);
  const downstream = new Map([...known].map((id) => [id, []]));
  for (const edge of scope.blockerEdges) downstream.get(edge.blocker).push(edge.blocked);
  const closure = new Set(directAffectedIssueIds);
  const queue = [...directAffectedIssueIds];
  for (let index = 0; index < queue.length; index += 1) {
    for (const blocked of downstream.get(queue[index])) if (!closure.has(blocked)) {
      closure.add(blocked); queue.push(blocked);
    }
  }
  return Object.freeze([...closure].sort(compare));
}

const requestFields = ["schema", "specId", "target", "predecessorRunId", "previousRevisionIdentity", "scopeSnapshot", "directAffectedIssueIds", "adoptedCompletions"];
const validateAdoptions = (adoptions, scope) => {
  assert(Array.isArray(adoptions), "REVISION_MALFORMED", "adoptedCompletions must be an array");
  const known = new Set(scope.children.map(({ issueId }) => issueId));
  let last = null;
  for (const adoption of adoptions) {
    exact(adoption, ["issueId", "completionIdentity", "completionBodyDigest", "childContractDigest", "priorAuthorityIdentity", "integrationEvidenceIdentity"], "completion adoption");
    for (const key of Object.keys(adoption)) requireText(adoption[key], `completion adoption.${key}`);
    requireDigest(adoption.completionBodyDigest, "completion adoption.completionBodyDigest");
    requireDigest(adoption.childContractDigest, "completion adoption.childContractDigest");
    requireDigest(adoption.integrationEvidenceIdentity, "completion adoption.integrationEvidenceIdentity");
    assert(known.has(adoption.issueId), "REVISION_UNKNOWN_ISSUE", "Completion adoption is outside scopeSnapshot.children");
    assert(last === null || compare(last, adoption.issueId) < 0, "REVISION_MALFORMED", "adoptedCompletions must be sorted and unique");
    const child = scope.children.find(({ issueId }) => issueId === adoption.issueId);
    assert(child.contractDigest === adoption.childContractDigest, "REVISION_ADOPTION_CONFLICT", "Completion adoption child contract differs from scope snapshot");
    last = adoption.issueId;
  }
};

export function validateRevisionRequest(request) {
  exact(request, requestFields, "revision request");
  assert(request.schema === SPEC_REVISION_REQUEST_SCHEMA, "REVISION_MALFORMED", "Unsupported revision request schema");
  for (const key of ["specId", "target", "predecessorRunId", "previousRevisionIdentity"]) requireText(request[key], `revision request.${key}`);
  requireDigest(request.previousRevisionIdentity, "revision request.previousRevisionIdentity");
  const scopeSnapshot = validateScopeSnapshot(request.scopeSnapshot);
  assert(scopeSnapshot.parent.specId === request.specId && scopeSnapshot.parent.target === request.target,
    "REVISION_SCOPE_CONFLICT", "Revision request Spec or target differs from its complete scope snapshot");
  sortedUnique(request.directAffectedIssueIds, "directAffectedIssueIds");
  const impactClosureIssueIds = impactClosure({ scopeSnapshot, directAffectedIssueIds: request.directAffectedIssueIds });
  validateAdoptions(request.adoptedCompletions, scopeSnapshot);
  secretFree(request);
  return canonicalJson({ ...request, scopeSnapshot, impactClosureIssueIds });
}

const revisionPayload = (record) => ({
  schema: record.schema,
  type: record.type,
  createdAt: record.createdAt,
  specId: record.specId,
  target: record.target,
  predecessorRunId: record.predecessorRunId,
  previousRevisionIdentity: record.previousRevisionIdentity,
  scopeSnapshot: record.scopeSnapshot,
  directAffectedIssueIds: record.directAffectedIssueIds,
  impactClosureIssueIds: record.impactClosureIssueIds,
  adoptedCompletions: record.adoptedCompletions,
});
const requestPayload = (request) => ({
  schema: request.schema,
  specId: request.specId,
  target: request.target,
  predecessorRunId: request.predecessorRunId,
  previousRevisionIdentity: request.previousRevisionIdentity,
  scopeSnapshot: request.scopeSnapshot,
  directAffectedIssueIds: request.directAffectedIssueIds,
  adoptedCompletions: request.adoptedCompletions,
});
export const revisionRequestIdentity = (request) => {
  // validateRevisionRequest returns a derived closure for consumers; it is not caller authority and
  // therefore is intentionally excluded from the retry identity.
  const { impactClosureIssueIds: _derivedClosure, ...rawRequest } = request;
  return revisionDigest(requestPayload(validateRevisionRequest(rawRequest)));
};

export function createRevisionRecord({ request, createdAt, activationAt = createdAt }) {
  const normalized = validateRevisionRequest(request);
  requireIso(createdAt, "revision createdAt");
  requireIso(activationAt, "revision activationAt");
  const record = {
    schema: SPEC_REVISION_SCHEMA,
    type: SPEC_REVISION_SCHEMA,
    createdAt,
    activationAt,
    specId: normalized.specId,
    target: normalized.target,
    predecessorRunId: normalized.predecessorRunId,
    previousRevisionIdentity: normalized.previousRevisionIdentity,
    scopeSnapshot: normalized.scopeSnapshot,
    directAffectedIssueIds: normalized.directAffectedIssueIds,
    impactClosureIssueIds: normalized.impactClosureIssueIds,
    adoptedCompletions: normalized.adoptedCompletions,
  };
  const revisionIdentity = revisionDigest(revisionPayload(record));
  // A hash cannot contain itself. The revision identity excludes the two linkage fields, then the
  // deterministic activation hash is stored in the revision and repeated by the activation record.
  const activationIdentity = revisionDigest(activationPayload({
    schema: REVISION_ACTIVATION_SCHEMA, type: REVISION_ACTIVATION_SCHEMA, createdAt: activationAt,
    revisionIdentity, predecessorRunId: record.predecessorRunId, impactClosureIssueIds: record.impactClosureIssueIds,
  }));
  return Object.freeze({ ...record, revisionIdentity, activationIdentity, requestIdentity: revisionRequestIdentity(request) });
}

const activationPayload = (activation) => ({
  schema: activation.schema,
  type: activation.type,
  createdAt: activation.createdAt,
  revisionIdentity: activation.revisionIdentity,
  predecessorRunId: activation.predecessorRunId,
  impactClosureIssueIds: activation.impactClosureIssueIds,
});
export function createRevisionActivation({ revision, createdAt }) {
  validateRevisionRecord(revision);
  requireIso(createdAt, "revision activation createdAt");
  assert(createdAt === revision.activationAt, "REVISION_ACTIVATION_CONFLICT", "Revision activation time differs from its revision record");
  const activation = {
    schema: REVISION_ACTIVATION_SCHEMA,
    type: REVISION_ACTIVATION_SCHEMA,
    createdAt,
    revisionIdentity: revision.revisionIdentity,
    predecessorRunId: revision.predecessorRunId,
    impactClosureIssueIds: revision.impactClosureIssueIds,
  };
  return Object.freeze({ ...activation, activationIdentity: revision.activationIdentity });
}

export function validateRevisionRecord(record) {
  exact(record, ["schema", "type", "createdAt", "activationAt", "specId", "target", "predecessorRunId", "previousRevisionIdentity", "scopeSnapshot", "directAffectedIssueIds", "impactClosureIssueIds", "adoptedCompletions", "revisionIdentity", "activationIdentity", "requestIdentity"], "revision record");
  assert(record.schema === SPEC_REVISION_SCHEMA && record.type === SPEC_REVISION_SCHEMA, "REVISION_MALFORMED", "Unsupported revision record schema");
  const request = validateRevisionRequest({ schema: SPEC_REVISION_REQUEST_SCHEMA, specId: record.specId, target: record.target,
    predecessorRunId: record.predecessorRunId, previousRevisionIdentity: record.previousRevisionIdentity,
    scopeSnapshot: record.scopeSnapshot, directAffectedIssueIds: record.directAffectedIssueIds, adoptedCompletions: record.adoptedCompletions });
  requireIso(record.createdAt, "revision record.createdAt");
  requireIso(record.activationAt, "revision record.activationAt");
  assert(JSON.stringify(record.impactClosureIssueIds) === JSON.stringify(request.impactClosureIssueIds), "REVISION_SCOPE_CONFLICT", "Revision record impact closure differs from immutable published edges");
  requireDigest(record.revisionIdentity, "revision record.revisionIdentity");
  requireDigest(record.activationIdentity, "revision record.activationIdentity");
  requireDigest(record.requestIdentity, "revision record.requestIdentity");
  assert(record.revisionIdentity === revisionDigest(revisionPayload(record)), "REVISION_IDENTITY_CONFLICT", "Revision record identity does not match its canonical content");
  assert(record.activationIdentity === revisionDigest(activationPayload({ schema: REVISION_ACTIVATION_SCHEMA,
    type: REVISION_ACTIVATION_SCHEMA, createdAt: record.activationAt, revisionIdentity: record.revisionIdentity,
    predecessorRunId: record.predecessorRunId, impactClosureIssueIds: record.impactClosureIssueIds })),
  "REVISION_IDENTITY_CONFLICT", "Revision record activation identity does not match its canonical binding");
  assert(record.requestIdentity === revisionRequestIdentity(request), "REVISION_IDENTITY_CONFLICT", "Revision request identity does not match canonical request");
  return canonicalJson(record);
}
export function validateRevisionActivation(activation, revision) {
  exact(activation, ["schema", "type", "createdAt", "revisionIdentity", "predecessorRunId", "impactClosureIssueIds", "activationIdentity"], "revision activation");
  assert(activation.schema === REVISION_ACTIVATION_SCHEMA && activation.type === REVISION_ACTIVATION_SCHEMA, "REVISION_MALFORMED", "Unsupported revision activation schema");
  requireIso(activation.createdAt, "revision activation.createdAt");
  requireDigest(activation.revisionIdentity, "revision activation.revisionIdentity");
  requireDigest(activation.activationIdentity, "revision activation.activationIdentity");
  if (revision !== undefined) {
    validateRevisionRecord(revision);
    assert(activation.revisionIdentity === revision.revisionIdentity && activation.activationIdentity === revision.activationIdentity
      && activation.createdAt === revision.activationAt && activation.predecessorRunId === revision.predecessorRunId
      && JSON.stringify(activation.impactClosureIssueIds) === JSON.stringify(revision.impactClosureIssueIds),
    "REVISION_ACTIVATION_CONFLICT", "Revision activation does not bind its exact revision record");
  }
  assert(activation.activationIdentity === revisionDigest(activationPayload(activation)), "REVISION_IDENTITY_CONFLICT", "Revision activation identity does not match canonical content");
  return canonicalJson(activation);
}

const writeAll = (fd, text) => {
  const bytes = Buffer.from(text, "utf8"); let offset = 0;
  while (offset < bytes.length) { const written = writeSync(fd, bytes, offset, bytes.length - offset, null); if (written <= 0) throw new Error("Unable to complete durable write"); offset += written; }
};
const fsyncDir = (path) => { let fd; try { fd = openSync(path, "r"); fsyncSync(fd); } catch (error) { if (!(process.platform === "win32" && error?.code === "EPERM")) throw error; } finally { if (fd !== undefined) closeSync(fd); } };
const appendDurably = (path, value) => { const fd = openSync(path, "a"); try { writeAll(fd, `${JSON.stringify(value)}\n`); fsyncSync(fd); } finally { closeSync(fd); } fsyncDir(dirname(path)); };
const writeAtomically = (path, value) => { const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`; const fd = openSync(temporary, "wx"); try { writeAll(fd, `${JSON.stringify(value, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); } try { renameSync(temporary, path); fsyncDir(dirname(path)); } finally { if (existsSync(temporary)) unlinkSync(temporary); } };
const readJsonLines = (path) => existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((line, index) => { try { return JSON.parse(line); } catch { throw fail("REVISION_JOURNAL_CORRUPT", `Revision journal line ${index + 1} is not JSON`); } }) : [];
const keyFor = (specId) => createHash("sha256").update(specId).digest("hex");

export function createSpecRevisionLedger({ gitCommonDir }) {
  requireText(gitCommonDir, "gitCommonDir");
  const root = join(resolve(gitCommonDir), "matt-workflow-control", "spec-revisions");
  const pathsFor = (specId) => {
    requireText(specId, "specId"); const key = keyFor(specId);
    return { journal: join(root, `${key}.jsonl`), head: join(root, `${key}.head.json`), lock: join(root, `${key}.lock`) };
  };
  const read = (specId) => {
    const paths = pathsFor(specId); const records = readJsonLines(paths.journal);
    const revisions = new Map(), activations = new Map();
    for (const entry of records) {
      if (entry.schema === SPEC_REVISION_SCHEMA) { validateRevisionRecord(entry); assert(entry.specId === specId, "REVISION_JOURNAL_CORRUPT", "Journal record has a different Spec ID"); assert(!revisions.has(entry.revisionIdentity), "REVISION_JOURNAL_CORRUPT", "Journal has duplicate revision identity"); revisions.set(entry.revisionIdentity, entry); }
      else if (entry.schema === REVISION_ACTIVATION_SCHEMA) { validateRevisionActivation(entry); assert(!activations.has(entry.revisionIdentity), "REVISION_JOURNAL_CORRUPT", "Journal has duplicate revision activation"); activations.set(entry.revisionIdentity, entry); }
      else throw fail("REVISION_JOURNAL_CORRUPT", "Journal contains an unsupported entry");
    }
    for (const [id, activation] of activations) validateRevisionActivation(activation, revisions.get(id));
    let projection = null;
    if (existsSync(paths.head)) {
      try { projection = JSON.parse(readFileSync(paths.head, "utf8")); }
      catch { throw fail("REVISION_JOURNAL_CORRUPT", "Revision head projection is unreadable"); }
    }
    if (projection !== null) {
      exact(projection, ["schema", "specId", "revisionIdentity", "activationIdentity", "updatedAt"], "revision head projection");
      assert(projection.schema === SPEC_REVISION_HEAD_SCHEMA && projection.specId === specId, "REVISION_JOURNAL_CORRUPT", "Revision head projection is invalid");
      requireIso(projection.updatedAt, "revision head updatedAt");
      const revision = revisions.get(projection.revisionIdentity), activation = activations.get(projection.revisionIdentity);
      assert(revision && activation && activation.activationIdentity === projection.activationIdentity, "REVISION_JOURNAL_CORRUPT", "Revision head projection is not bound to journal entries");
    }
    return Object.freeze({ records: Object.freeze(records), revisions, activations, head: projection });
  };
  const acquire = (paths) => { mkdirSync(root, { recursive: true }); try { mkdirSync(paths.lock); fsyncDir(root); } catch (error) { if (error?.code === "EEXIST") throw fail("REVISION_HEAD_LOCKED", "Revision head is being updated by another coordinator"); throw error; } return () => { rmdirSync(paths.lock); fsyncDir(root); }; };
  const activate = ({ request, baseRevisionIdentity, createdAt = new Date().toISOString(), activationAt = createdAt }) => {
    const normalized = validateRevisionRequest(request); const paths = pathsFor(normalized.specId);
    requireDigest(baseRevisionIdentity, "baseRevisionIdentity");
    const release = acquire(paths);
    try {
      const state = read(normalized.specId);
      const existing = [...state.revisions.values()].find((record) => record.requestIdentity === revisionRequestIdentity(normalized));
      if (existing !== undefined) {
        const activation = state.activations.get(existing.revisionIdentity);
        assert(activation !== undefined, "REVISION_JOURNAL_CORRUPT", "Idempotent revision has no activation");
        return Object.freeze({ revision: existing, activation, reused: true, head: state.head });
      }
      const expectedPrevious = state.head?.revisionIdentity ?? baseRevisionIdentity;
      assert(normalized.previousRevisionIdentity === expectedPrevious, "REVISION_STALE_HEAD", "Revision request does not name the current local revision head");
      const revision = createRevisionRecord({ request, createdAt, activationAt });
      const activation = createRevisionActivation({ revision, createdAt: activationAt });
      // The journal comes first. A crash before the projection leaves an unactivated head candidate,
      // which is fail-closed; no older authority is overwritten.
      appendDurably(paths.journal, revision);
      appendDurably(paths.journal, activation);
      const head = { schema: SPEC_REVISION_HEAD_SCHEMA, specId: normalized.specId, revisionIdentity: revision.revisionIdentity,
        activationIdentity: activation.activationIdentity, updatedAt: activationAt };
      writeAtomically(paths.head, head);
      return Object.freeze({ revision, activation, reused: false, head: Object.freeze(head) });
    } finally { release(); }
  };
  return Object.freeze({ root, pathsFor, read, activate });
}
