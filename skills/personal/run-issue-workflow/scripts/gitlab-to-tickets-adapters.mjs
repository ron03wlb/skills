import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { createWorkflowControlStore } from "./workflow-control-store.mjs";
import { createRunStore } from "./run-store.mjs";
import { assertWorkflowOperationIdentity, bindProducerCheckpointOperationIdentity, createProducerOperationCheckpoint,
  deriveExecuteIssueOperationIdentity } from "./delivery-authority.mjs";
import { connectGitLabProducer, conflict, digest, gitRead, withProducerLock } from "./gitlab-producer-transport.mjs";
import { mutateOnce, readMutation } from "./gitlab-producer-mutations.mjs";

const upstreamSchema = "gitlab-producer-record:v1";
const schema = "gitlab-to-tickets-record:v1";
const sha = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const render = record => `\`\`\`workflow-record\n${JSON.stringify(record, null, 2)}\n\`\`\``;
const requireText = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw conflict(`${label} is required`);
  return value;
};
const noQuickActions = value => {
  if (/^\s*\/[a-z][\w-]*(?:\s|$)/mu.test(value)) {
    throw conflict("GitLab quick actions require separate authority and are not supported in producer content");
  }
};
const normalizeLabels = labels => {
  if (!Array.isArray(labels) || labels.some(label => typeof label !== "string" || !label)) {
    throw conflict("Exact labels are required");
  }
  return [...new Set(labels)].sort();
};
const bodyMatches = (actual, expected) => actual === expected
  || expected.endsWith("\n") && actual === expected.slice(0, -1);
const bodyHashMatches = (actual, expectedHash) => digest(actual) === expectedHash
  || !actual.endsWith("\n") && digest(`${actual}\n`) === expectedHash;

function section(body, heading) {
  const lines = body.replace(/\r\n/gu, "\n").split("\n");
  const marker = `## ${heading}`;
  const indexes = lines.flatMap((line, index) => line === marker ? [index] : []);
  if (indexes.length !== 1) throw conflict(`Canonical child must contain one ${marker} section`);
  const end = lines.findIndex((line, index) => index > indexes[0] && line.startsWith("## "));
  return lines.slice(indexes[0] + 1, end < 0 ? lines.length : end).join("\n").trim();
}

function blockerReferences(body) {
  const value = section(body, "Blocked by");
  if (value === "None.") return [];
  const lines = value.split("\n");
  const references = lines.map(line => line.match(/^- `([^`]+)`$/u)?.[1]);
  if (references.some(reference => !reference) || new Set(references).size !== references.length) {
    throw conflict("Blocked by must contain unique canonical Issue-reference bullets or exactly None.");
  }
  const canonicalReferences = [...references].sort();
  if (!same(references, canonicalReferences)) throw conflict("Blocked by Issue references must use canonical tracker-identity order");
  return canonicalReferences;
}

function decompositionKey(body) {
  const match = section(body, "Decomposition key").match(/^`([^`]+)`$/u);
  if (!match) throw conflict("Canonical child Decomposition key is malformed");
  return match[1];
}

function validateGraph(mapping, blockerEdges) {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || Object.keys(mapping).length === 0) {
    throw conflict("A complete non-empty Decomposition mapping is required");
  }
  if (!Array.isArray(blockerEdges)) throw conflict("blockerEdges must be an explicit array");
  const childIds = new Set(Object.values(mapping));
  if (childIds.size !== Object.keys(mapping).length) throw conflict("Decomposition mapping Issue identities must be unique");
  const edges = blockerEdges.map(edge => {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)
      || Object.keys(edge).sort().join(",") !== "blocked,blocker") throw conflict("Each blocker edge requires only blocker and blocked");
    requireText(edge.blocker, "blocker Issue identity");
    requireText(edge.blocked, "blocked Issue identity");
    if (!childIds.has(edge.blocked) || edge.blocker === edge.blocked) throw conflict("Blocker edge does not target one mapped child");
    return { blocker: edge.blocker, blocked: edge.blocked };
  }).sort((left, right) => `${left.blocked}\0${left.blocker}`.localeCompare(`${right.blocked}\0${right.blocker}`));
  if (new Set(edges.map(edge => `${edge.blocker}\0${edge.blocked}`)).size !== edges.length) {
    throw conflict("Blocker edges must be unique");
  }
  const owned = edges.filter(edge => childIds.has(edge.blocker));
  const visiting = new Set();
  const visited = new Set();
  const visit = node => {
    if (visiting.has(node)) throw conflict("Owned blocker graph must be acyclic");
    if (visited.has(node)) return;
    visiting.add(node);
    for (const edge of owned.filter(candidate => candidate.blocked === node)) visit(edge.blocker);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of childIds) visit(node);
  return edges;
}

export async function createGitLabToTicketsAdapters(options) {
  const connection = await connectGitLabProducer(options);
  const { repository, repositoryId, projectId, projectUrl, api, list, assertAuthor } = connection;
  const target = requireText(options.target, "target");
  gitRead(repository, "check-ref-format", `refs/heads/${target}`);
  if (!["body", "native"].includes(options.blockingRepresentation)) {
    throw conflict("blockingRepresentation must be explicitly configured as body or native");
  }
  const blockingRepresentation = options.blockingRepresentation;
  const readyLabel = options.readyLabel ?? "ready-for-agent";
  if (!/^[^,\r\n]+$/u.test(readyLabel)) throw conflict("One exact ready label is required");
  const checkpoints = createWorkflowControlStore({ gitCommonDir: connection.gitCommonDir });
  const runs = createRunStore({ gitCommonDir: connection.gitCommonDir,
    coordinatorInstanceId: "gitlab-to-tickets-read-only-lifecycle" });

  function parseIid(locator) {
    const raw = String(locator).startsWith(`${projectUrl}/-/issues/`)
      ? String(locator).slice(`${projectUrl}/-/issues/`.length)
      : String(locator);
    if (!/^[1-9][0-9]*$/u.test(raw) || !Number.isSafeInteger(Number(raw))) {
      throw conflict("Issue locator is outside the configured project or is malformed");
    }
    return Number(raw);
  }
  const parentIid = parseIid(options.specId);
  const parentIdentity = `${projectUrl}/-/issues/${parentIid}`;
  const upstreamHandoffIdentity = requireText(options.upstreamHandoffIdentity, "upstreamHandoffIdentity");
  const issueIdentity = locator => `${projectUrl}/-/issues/${parseIid(locator)}`;
  const head = () => gitRead(repository, "rev-parse", "--verify", `refs/heads/${target}^{commit}`);
  const assertAncestor = (commit, descendant = head()) => {
    if (!sha.test(commit ?? "")) throw conflict("Invalid Planning Seal or baseline SHA");
    gitRead(repository, "merge-base", "--is-ancestor", commit, descendant);
  };

  const validateIssue = issue => {
    if (issue.project_id !== projectId || !Number.isSafeInteger(issue.id) || issue.id < 1
      || !Number.isSafeInteger(issue.iid) || issue.iid < 1
      || issue.web_url !== `${projectUrl}/-/issues/${issue.iid}` || issue.issue_type !== "issue"
      || typeof issue.title !== "string" || typeof issue.description !== "string"
      || !Array.isArray(issue.labels) || !["opened", "closed"].includes(issue.state)
      || typeof issue.updated_at !== "string") throw conflict("Native GitLab Issue identity is unreadable or differs");
    return issue;
  };
  const validateLinkedIssue = issue => {
    if (issue.project_id !== projectId || !Number.isSafeInteger(issue.id) || issue.id < 1
      || !Number.isSafeInteger(issue.iid) || issue.iid < 1
      || issue.web_url !== `${projectUrl}/-/issues/${issue.iid}`) {
      throw conflict("Native GitLab linked Issue identity is unreadable or differs");
    }
    return issue;
  };
  const snapshot = async locator => {
    const iid = parseIid(locator);
    const issue = validateIssue(await api(`/issues/${iid}`));
    if (issue.iid !== iid) throw conflict("GitLab returned a different Issue");
    const version = digest(JSON.stringify({ id: issue.id, iid, projectId, title: issue.title,
      body: issue.description, labels: normalizeLabels(issue.labels), state: issue.state, updatedAt: issue.updated_at }));
    return { issue, trackerIdentity: issue.web_url, nativeIssueId: issue.id, version,
      title: issue.title, body: issue.description, labels: normalizeLabels(issue.labels), state: issue.state };
  };
  const parentSnapshot = () => snapshot(parentIid);

  const noteIdentity = (iid, noteId) => `${projectUrl}/-/issues/${iid}#note_${noteId}`;
  const parseNoteIdentity = locator => {
    const match = String(locator).match(new RegExp(`^${projectUrl.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/-/issues/([1-9][0-9]*)#note_([1-9][0-9]*)$`, "u"));
    if (!match) throw conflict("GitLab note identity is outside the configured project or malformed");
    return { iid: Number(match[1]), noteId: Number(match[2]) };
  };
  const parseRecord = note => {
    const match = note.body?.match(/^```workflow-record\n([\s\S]+)\n```$/u);
    if (!match) throw conflict("Malformed GitLab workflow record");
    try { return JSON.parse(match[1]); } catch { throw conflict("Unreadable GitLab workflow record"); }
  };
  const readNoteRecord = async (identity, expectedSchema, expectedKind) => {
    const { iid, noteId } = parseNoteIdentity(identity);
    if (iid !== parentIid) throw conflict("Workflow record belongs to a different parent Issue");
    const note = await api(`/issues/${iid}/notes/${noteId}`);
    if (note.system || note.id !== noteId || note.noteable_iid !== iid || note.noteable_type !== "Issue") {
      throw conflict("Native GitLab note identity differs");
    }
    await assertAuthor(note.author?.id);
    const record = parseRecord(note);
    if (record.schema !== expectedSchema || record.kind !== expectedKind || record.repositoryId !== repositoryId) {
      throw conflict("Workflow record kind or repository differs");
    }
    return { record, identity: noteIdentity(iid, noteId), noteId, digest: digest(note.body) };
  };
  const readIssueWorkflowRecords = async locator => {
    const iid = parseIid(locator);
    const notes = await list(`/issues/${iid}/notes`);
    const records = [];
    for (const note of notes) {
      if (!note.body?.includes("```workflow-record")) continue;
      if (note.system || !Number.isSafeInteger(note.id) || note.noteable_iid !== iid || note.noteable_type !== "Issue") {
        throw conflict("Native GitLab workflow note identity differs");
      }
      await assertAuthor(note.author?.id);
      records.push({ record: parseRecord(note), identity: noteIdentity(iid, note.id), noteId: note.id,
        digest: digest(note.body) });
    }
    return records.sort((left, right) => left.noteId - right.noteId);
  };

  const upstream = await (async () => {
    const handoff = await readNoteRecord(upstreamHandoffIdentity, upstreamSchema, "producer_handoff");
    const handoffRecord = handoff.record;
    if (handoffRecord.producerCommand !== "to-spec" || handoffRecord.trackerIdentity !== parentIdentity
      || handoffRecord.authority?.specId !== parentIdentity || handoffRecord.authority?.target !== target
      || handoffRecord.authority?.classification !== "MULTI" || handoffRecord.authority?.decompositionIdentity !== null
      || handoffRecord.checkpointIdentity?.producerCommand !== "to-spec"
      || handoffRecord.checkpointIdentity?.profileVersion !== "v2") {
      throw conflict("Upstream to-spec handoff bindings differ");
    }
    const publication = await readNoteRecord(handoffRecord.publicationIdentity, upstreamSchema, "spec_publication");
    const publicationRecord = publication.record;
    if (publication.digest !== handoffRecord.publicationDigest
      || publicationRecord.operationKey !== handoffRecord.operationKey
      || publicationRecord.trackerIdentity !== parentIdentity
      || publicationRecord.transactionIdentity !== handoffRecord.transactionIdentity
      || !/^sha256:[a-f0-9]{64}$/u.test(publicationRecord.version ?? "")
      || !same(publicationRecord.authority, handoffRecord.authority)) {
      throw conflict("Upstream publication and handoff records differ");
    }
    const checkpointIdentity = bindProducerCheckpointOperationIdentity(handoffRecord.checkpointIdentity);
    const transaction = checkpoints.readCheckpoint(checkpointIdentity);
    if (!transaction || transaction.schema !== "workflow-checkpoint-transaction:v2" || transaction.state !== "COMPLETED"
      || transaction.transactionId !== handoffRecord.transactionIdentity
      || transaction.progress[1]?.receipt?.publicationIdentity !== publication.identity
      || transaction.progress[1]?.receipt?.publicationDigest !== publication.digest
      || transaction.progress[2]?.receipt?.handoffIdentity !== handoff.identity
      || transaction.progress[2]?.receipt?.handoffDigest !== handoff.digest) {
      throw conflict("Upstream to-spec transaction is incomplete or differs");
    }
    const parent = await parentSnapshot();
    if (!bodyHashMatches(parent.body, handoffRecord.authority.approvedScopeHash)
      || !same(parent.labels, normalizeLabels(publicationRecord.labels)) || parent.state !== "opened") {
      throw conflict("Current parent body, scope, or state differs from the approved upstream publication");
    }
    const planningSeal = handoffRecord.authority.planningSeal;
    assertAncestor(planningSeal);
    const approvedScopeIdentity = checkpointIdentity.bindings?.approvedScopeIdentity;
    if (!/^sha256:[a-f0-9]{64}$/u.test(approvedScopeIdentity ?? "")) {
      throw conflict("Upstream approved-scope identity is missing");
    }
    return {
      publication: { specId: parentIdentity, trackerIdentity: parentIdentity, publicationIdentity: publication.identity,
        publicationDigest: publication.digest, bodyVersion: publicationRecord.version, target, planningSeal,
        classification: "MULTI", approvedScopeIdentity, approvedScopeHash: handoffRecord.authority.approvedScopeHash,
        nextCommand: `/to-tickets ${parentIdentity}` },
      handoff: { handoffIdentity: handoff.identity, handoffDigest: handoff.digest,
        transactionIdentity: transaction.transactionId, checkpointIdentity, publicationIdentity: publication.identity,
        preparation: handoffRecord.preparation ?? null },
    };
  })();

  const identity = ({ baseline }) => {
    assertAncestor(baseline);
    assertAncestor(upstream.publication.planningSeal, baseline);
    return bindProducerCheckpointOperationIdentity({ repositoryId, specId: parentIdentity,
      producerCommand: "to-tickets", profileVersion: "v2", target, baseline,
      bindings: { planningSeal: upstream.publication.planningSeal, classification: "MULTI",
        approvedScopeIdentity: upstream.publication.approvedScopeIdentity,
        trackerIdentity: parentIdentity, upstreamPublicationIdentity: upstream.publication.publicationIdentity,
        upstreamHandoffIdentity: upstream.handoff.handoffIdentity, readyLabel } });
  };
  const validateIdentity = input => {
    const expected = identity({ baseline: input?.baseline });
    if (!same(input, expected)) throw conflict("Checkpoint binding differs from the selected repository, Spec, target, or upstream handoff");
    return input;
  };
  const getTransaction = input => {
    validateIdentity(input);
    const transaction = checkpoints.readCheckpoint(input);
    if (!transaction || transaction.schema !== "workflow-checkpoint-transaction:v2") {
      throw conflict("An exact current to-tickets producer transaction is required");
    }
    return transaction;
  };

  const assertDecompositionOpen = input => {
    const transaction = getTransaction(input);
    if (transaction.nextStage !== "decomposition.read_back") {
      throw conflict("Decomposition mutations require the first unsatisfied decomposition.read_back stage");
    }
    return transaction;
  };
  const parseChild = child => {
    requireText(child?.key, "Decomposition key");
    requireText(child?.title, "child title");
    requireText(child?.body, "child body");
    noQuickActions(child.body);
    if (decompositionKey(child.body) !== child.key) throw conflict("Child body Decomposition key differs");
    const parent = section(child.body, "Parent");
    if (![parentIdentity, `${parentIdentity}.`].includes(parent)) throw conflict("Child body parent differs");
    if (section(child.body, "Target") !== target) throw conflict("Child body target differs");
    const planningSeal = section(child.body, "Planning baseline").match(/^- Commit: ([a-f0-9]{40}|[a-f0-9]{64})$/mu)?.[1];
    if (!planningSeal) throw conflict("Child body Planning baseline is malformed");
    const blockers = blockerRefs(child.body).map(issueIdentity).sort();
    return { key: child.key, title: child.title, body: child.body, blockers, planningSeal, bodyDigest: digest(child.body) };
  };
  const validateChild = (child, planningSeal = upstream.publication.planningSeal) => {
    const parsed = parseChild(child);
    if (parsed.planningSeal !== planningSeal) throw conflict("Child body Planning baseline differs");
    return parsed;
  };
  function blockerRefs(body) {
    return blockerReferences(body);
  }
  const readLinks = async locator => {
    const iid = parseIid(locator);
    const links = await list(`/issues/${iid}/links`);
    return links.map(link => {
      if (!Number.isSafeInteger(link.id) || link.id < 1 || !["relates_to", "blocks", "is_blocked_by"].includes(link.link_type)) {
        throw conflict("Native GitLab Issue link identity is unreadable");
      }
      const targetIssue = validateLinkedIssue(link);
      return { identity: `gitlab-link:${projectId}:${iid}:${targetIssue.iid}:${link.link_type}`,
        source: issueIdentity(iid), target: targetIssue.web_url, linkType: link.link_type };
    });
  };
  const relationDescriptor = relation => {
    if (!relation || typeof relation !== "object" || Array.isArray(relation)) throw conflict("One relation is required");
    const kind = relation.kind;
    if (kind === "parent") throw conflict("This GitLab adapter has no native Issue hierarchy; the canonical Parent body section remains the fallback");
    if (kind !== "blocker") throw conflict("Relation kind must be blocker");
    const child = issueIdentity(relation.child);
    const other = issueIdentity(relation.blocker);
    const childKey = requireText(relation.childKey, "blocking relation Decomposition key");
    if (child === other) throw conflict("Relation endpoints must differ");
    if (blockingRepresentation !== "native") {
      throw conflict("Body blocker representation never publishes a native blocking relation");
    }
    const sourceIid = parseIid(child);
    const targetIid = parseIid(other);
    const linkType = "is_blocked_by";
    const key = `${kind}:${sourceIid}:${targetIid}:${linkType}`;
    const payload = { source: child, target: other, linkType, childKey };
    return { kind, child, other, sourceIid, targetIid, linkType, key, payload };
  };
  const relationMutationDescriptor = (operationId, descriptor) => ({
    key: `${operationId}:relation:${descriptor.key}`, payload: descriptor.payload,
  });
  const matchRelation = (links, descriptor) => {
    const matches = links.filter(link => link.target === descriptor.other && link.linkType === descriptor.linkType);
    if (matches.length > 1) throw conflict("Multiple native links claim the same relation");
    return matches[0] ?? null;
  };
  const assertRelationContract = async descriptor => {
    const current = await snapshot(descriptor.child);
    if (decompositionKey(current.body) !== descriptor.payload.childKey
      || !blockerRefs(current.body).map(issueIdentity).includes(descriptor.other)) {
      throw conflict("Native blocking relation differs from the canonical child body");
    }
    return current;
  };
  const observeExpectedRelation = async descriptor => {
    const current = await assertRelationContract(descriptor);
    const links = await readLinks(descriptor.child);
    const relation = matchRelation(links, descriptor);
    return { relation, readBack: { state: relation ? "PRESENT" : "ABSENT",
      childVersion: current.version, linksDigest: digest(JSON.stringify(canonical(links))),
      relationIdentity: relation?.identity ?? null } };
  };
  const readExpectedRelation = async descriptor => (await observeExpectedRelation(descriptor)).relation;

  const partialRoot = join(connection.gitCommonDir, "matt-workflow-control", "gitlab-to-tickets-partials");
  const partialPath = (operationId, descriptor) => join(partialRoot, `${digest(`${operationId}:${descriptor.key}`).slice(7)}.json`);
  const recordPartial = (operationId, descriptor, mutation, readBack) => {
    const path = partialPath(operationId, descriptor);
    const value = { schema: "gitlab-to-tickets-partial:v1", repositoryId, operationId,
      representation: "native", relation: descriptor.payload,
      outcome: mutation.state === "REJECTED" ? "REJECTED" : "UNRESOLVED",
      mutation: { key: mutation.key, fingerprint: mutation.fingerprint, attempt: mutation.attempt,
        state: mutation.state, result: mutation.result }, readBack };
    mkdirSync(partialRoot, { recursive: true });
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf8"));
      if (existing.schema !== value.schema || existing.repositoryId !== repositoryId
        || existing.operationId !== operationId || !same(existing.relation, descriptor.payload)) {
        throw conflict("Partial native relation evidence differs");
      }
      return;
    }
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", flush: true });
  };
  const readPartials = operationId => {
    if (!existsSync(partialRoot)) return [];
    return readdirSync(partialRoot).filter(name => name.endsWith(".json")).map(name => JSON.parse(readFileSync(join(partialRoot, name), "utf8")))
      .filter(value => value.operationId === operationId).map(value => {
        if (value.schema !== "gitlab-to-tickets-partial:v1" || value.repositoryId !== repositoryId
          || value.representation !== "native" || !["REJECTED", "UNRESOLVED"].includes(value.outcome)
          || !value.relation || value.relation.linkType !== "is_blocked_by"
          || typeof value.relation.childKey !== "string" || !value.relation.childKey
          || typeof value.mutation?.key !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value.mutation.fingerprint ?? "")
          || !Number.isSafeInteger(value.mutation.attempt) || value.mutation.attempt < 0
          || !["REJECTED", "ACKNOWLEDGED", "UNRESOLVED"].includes(value.mutation.state)
          || !["ABSENT", "PRESENT", "UNKNOWN"].includes(value.readBack?.state)
          || value.readBack.state !== "UNKNOWN" && (!/^sha256:[a-f0-9]{64}$/u.test(value.readBack.childVersion ?? "")
            || !/^sha256:[a-f0-9]{64}$/u.test(value.readBack.linksDigest ?? "")
            || !(value.readBack.relationIdentity === null || typeof value.readBack.relationIdentity === "string"))
          || value.readBack.state === "UNKNOWN" && typeof value.readBack.errorCode !== "string") {
          throw conflict("Partial native relation evidence is malformed");
        }
        const expectedKey = `${operationId}:relation:blocker:${parseIid(value.relation.source)}:${parseIid(value.relation.target)}:is_blocked_by`;
        const current = readMutation(connection, { key: value.mutation.key, payload: value.relation });
        if (value.mutation.key !== expectedKey || current.fingerprint !== value.mutation.fingerprint
          || current.attempt < value.mutation.attempt || current.state === "UNATTEMPTED"
          || (value.outcome === "REJECTED") !== (value.mutation.state === "REJECTED")) {
          throw conflict("Partial native relation mutation evidence differs");
        }
        return value;
      });
  };
  const hasLocalMutationEvidence = operationId => {
    const intentRoot = join(connection.gitCommonDir, "matt-workflow-control", "gitlab-producer-intents");
    const hasIntent = existsSync(intentRoot) && readdirSync(intentRoot).filter(name => name.endsWith(".json")).some(name => {
      const intent = JSON.parse(readFileSync(join(intentRoot, name), "utf8"));
      if (intent.schema !== "gitlab-producer-intent:v1" || typeof intent.key !== "string") {
        throw conflict("GitLab mutation intent evidence is malformed");
      }
      return intent.key.startsWith(`${operationId}:`);
    });
    const hasPartial = existsSync(partialRoot) && readdirSync(partialRoot).filter(name => name.endsWith(".json")).some(name => {
      const partial = JSON.parse(readFileSync(join(partialRoot, name), "utf8"));
      if (partial.schema !== "gitlab-to-tickets-partial:v1" || typeof partial.operationId !== "string") {
        throw conflict("GitLab partial relation evidence is malformed");
      }
      return partial.operationId === operationId;
    });
    return hasIntent || hasPartial;
  };

  const findChildren = async key => {
    requireText(key, "Decomposition key");
    const marker = `\`${key}\``;
    const rows = await list(`/issues?scope=all&state=all&search=${encodeURIComponent(marker)}&in=description`);
    const matches = [];
    for (const row of rows) {
      const issue = validateIssue(row);
      if (!issue.description?.includes(marker)) continue;
      const current = await snapshot(issue.iid);
      let observedKey;
      try { observedKey = decompositionKey(current.body); } catch { continue; }
      if (observedKey !== key) continue;
      await assertAuthor(issue.author?.id);
      matches.push(current);
    }
    return matches;
  };
  const discoverChildren = async ({ keys, externalBlockers }) => {
    if (!Array.isArray(keys) || keys.length === 0 || keys.some(key => typeof key !== "string" || !key)
      || new Set(keys).size !== keys.length) throw conflict("Expected Decomposition keys must be one nonempty unique array");
    if (!Array.isArray(externalBlockers) || externalBlockers.some(locator => typeof locator !== "string" || !locator)) {
      throw conflict("The complete External blocker locator set must be an explicit array");
    }
    const externalIdentities = [...new Set(externalBlockers.map(issueIdentity))].sort();
    if (externalIdentities.length !== externalBlockers.length) throw conflict("External blocker locators must be unique");
    const matches = {};
    for (const key of [...keys].sort()) matches[key] = (await findChildren(key)).map(current => ({
      trackerIdentity: current.trackerIdentity, nativeIssueId: current.nativeIssueId,
      version: current.version, state: current.state,
    }));
    const external = [];
    for (const locator of externalIdentities) {
      const current = await snapshot(locator);
      external.push({ trackerIdentity: current.trackerIdentity, nativeIssueId: current.nativeIssueId,
        version: current.version, state: current.state });
    }
    const childIdentities = new Set(Object.values(matches).flat().map(match => match.trackerIdentity));
    if (external.some(blocker => childIdentities.has(blocker.trackerIdentity))) {
      throw conflict("One Issue cannot be both an owned child and an External blocker");
    }
    return { blockingRepresentation, matches, externalBlockers: external };
  };
  const validatePreflight = async (preflight, { keys, blockers = [] }) => {
    if (!preflight || typeof preflight !== "object" || Array.isArray(preflight)
      || preflight.blockingRepresentation !== blockingRepresentation
      || !preflight.matches || typeof preflight.matches !== "object" || Array.isArray(preflight.matches)
      || !Array.isArray(preflight.externalBlockers)) throw conflict("Exact GitLab Decomposition preflight is required");
    const observedKeys = Object.keys(preflight.matches).sort();
    if (!same(observedKeys, [...keys].sort())) throw conflict("Decomposition preflight key set differs");
    const externalLocators = preflight.externalBlockers.map(blocker => blocker?.trackerIdentity);
    const observed = await discoverChildren({ keys: observedKeys, externalBlockers: externalLocators });
    if (!same(observed, preflight)) throw conflict("GitLab Decomposition preflight changed before mutation");
    const readable = new Set([
      ...Object.values(preflight.matches).flat().map(match => match.trackerIdentity),
      ...externalLocators,
    ]);
    for (const blocker of blockers) {
      if (!readable.has(issueIdentity(blocker))) throw conflict("A child blocker is absent from the complete preflight");
    }
    return preflight;
  };
  const readChildContract = async (child, { requireNative = true,
    planningSeal = upstream.publication.planningSeal } = {}) => {
    const expected = validateChild(child, planningSeal);
    const current = await snapshot(child.trackerIdentity);
    if (!bodyMatches(current.body, expected.body)) {
      throw conflict("Child canonical body differs");
    }
    const nativeBlockers = await nativeBlockersFor(current.trackerIdentity);
    if (requireNative && blockingRepresentation === "native" && !same(nativeBlockers, expected.blockers)) {
      throw conflict("Declared-native blocker evidence differs from the canonical child body");
    }
    if (blockingRepresentation === "body" && nativeBlockers.length) {
      throw conflict("Body representation cannot retain native blocking relations");
    }
    const receipt = { key: expected.key, trackerIdentity: current.trackerIdentity, nativeIssueId: current.nativeIssueId,
      bodyDigest: digest(current.body), version: current.version, state: current.state, labels: current.labels,
      blockers: expected.blockers };
    return blockingRepresentation === "native" ? { ...receipt, nativeBlockers } : receipt;
  };
  const readChild = child => readChildContract(child);
  const publishChild = async ({ identity: input, child, preflight, retryRejected = false }) => withProducerLock(connection, parentIdentity, async () => {
    assertDecompositionOpen(input);
    const expected = validateChild(child);
    const keys = Object.keys(preflight?.matches ?? {});
    if (!keys.includes(expected.key)) throw conflict("Child key is absent from the complete Decomposition preflight");
    await validatePreflight(preflight, { keys, blockers: expected.blockers });
    const descriptor = { key: `${input.operationId}:child:${expected.key}`,
      payload: { key: expected.key, title: expected.title, body: expected.body, parent: parentIdentity } };
    return mutateOnce(connection, { ...descriptor, retryRejected,
      observe: async () => {
        const matches = await findChildren(expected.key);
        if (matches.length > 1) throw conflict("Duplicate Issues claim one Decomposition key");
        if (!matches[0]) return null;
        return readChildContract({ ...expected, trackerIdentity: matches[0].trackerIdentity }, { requireNative: false });
      },
      write: async () => {
        await assertAuthor(connection.userId);
        assertDecompositionOpen(input);
        await validatePreflight(preflight, { keys, blockers: expected.blockers });
        await api("/issues", "POST", { title: expected.title, description: expected.body });
      },
    });
  });
  const childUpdateDescriptor = (input, expected, previous) => ({
    key: `${input.operationId}:child-update:${expected.key}`,
    payload: { key: expected.key, trackerIdentity: previous.trackerIdentity,
      previousVersion: previous.version, previousBodyDigest: digest(previous.body),
      replacementBodyDigest: expected.bodyDigest, decompositionIdentity: previous.decompositionIdentity },
  });
  const updateChild = async ({ identity: input, child, previous, preflight,
    retryRejected = false }) => withProducerLock(connection, parentIdentity, async () => {
    assertDecompositionOpen(input);
    const expected = validateChild(child);
    previous = validatePreviousRevisionInput(previous);
    const keys = Object.keys(preflight?.matches ?? {});
    if (!keys.includes(expected.key)) throw conflict("Child key is absent from the complete Decomposition preflight");
    await validatePreflight(preflight, { keys, blockers: expected.blockers });
    const matches = preflight.matches[expected.key];
    if (matches.length !== 1 || matches[0].trackerIdentity !== issueIdentity(previous?.trackerIdentity)) {
      throw conflict("Approved child revision requires one exact existing Issue");
    }
    const descriptor = childUpdateDescriptor(input, expected, previous);
    return mutateOnce(connection, { ...descriptor, retryRejected,
      observe: async () => {
        const current = await snapshot(previous.trackerIdentity);
        if (bodyMatches(current.body, expected.body)) {
          return readChild({ ...expected, trackerIdentity: current.trackerIdentity });
        }
        await validateRevisionEvidence({ previous, expected, current });
        return null;
      },
      write: async () => {
        await assertAuthor(connection.userId);
        assertDecompositionOpen(input);
        await validatePreflight(preflight, { keys, blockers: expected.blockers });
        const current = await snapshot(previous.trackerIdentity);
        await validateRevisionEvidence({ previous, expected, current });
        await api(`/issues/${parseIid(current.trackerIdentity)}`, "PUT", { description: expected.body });
      },
    });
  });
  const publishRelation = async ({ identity: input, relation, preflight, retryRejected = false }) => withProducerLock(connection, parentIdentity, async () => {
    assertDecompositionOpen(input);
    const descriptor = relationDescriptor(relation);
    const keys = Object.keys(preflight?.matches ?? {});
    await validatePreflight(preflight, { keys, blockers: [descriptor.other] });
    if (!Object.values(preflight.matches).flat().some(match => match.trackerIdentity === descriptor.child)) {
      throw conflict("Blocking relation child is absent from the owned-child preflight");
    }
    await assertRelationContract(descriptor);
    const mutationDescriptor = relationMutationDescriptor(input.operationId, descriptor);
    try {
      return await mutateOnce(connection, { ...mutationDescriptor, retryRejected,
        observe: () => readExpectedRelation(descriptor),
        write: async () => {
          await assertAuthor(connection.userId);
          assertDecompositionOpen(input);
          await validatePreflight(preflight, { keys, blockers: [descriptor.other] });
          await assertRelationContract(descriptor);
          await api(`/issues/${descriptor.sourceIid}/links`, "POST", {
            target_project_id: projectId, target_issue_iid: descriptor.targetIid, link_type: descriptor.linkType,
          });
        },
      });
    } catch (error) {
      const mutation = readMutation(connection, mutationDescriptor);
      if (mutation.state !== "UNATTEMPTED") {
        let readBack;
        try { readBack = (await observeExpectedRelation(descriptor)).readBack; }
        catch (readError) { readBack = { state: "UNKNOWN", errorCode: readError.code ?? "GITLAB_TO_TICKETS_READBACK_FAILED" }; }
        recordPartial(input.operationId, descriptor, mutation, readBack);
      }
      throw error;
    }
  });
  const readRelation = ({ relation }) => readExpectedRelation(relationDescriptor(relation));

  const findRecord = async (kind, operationKey) => {
    const notes = await list(`/issues/${parentIid}/notes`);
    const candidates = [];
    for (const note of notes) {
      if (!note.body?.includes(schema)) continue;
      const record = parseRecord(note);
      if (record.schema !== schema || record.repositoryId !== repositoryId) throw conflict("to-tickets record repository differs");
      if (record.kind !== kind || record.operationKey !== operationKey) continue;
      if (note.system || !Number.isSafeInteger(note.id) || note.noteable_iid !== parentIid || note.noteable_type !== "Issue") {
        throw conflict("Native to-tickets note identity differs");
      }
      await assertAuthor(note.author?.id);
      const fresh = await api(`/issues/${parentIid}/notes/${note.id}`);
      if (!same(fresh, note)) throw conflict("to-tickets note changed during read-back");
      candidates.push({ record, identity: noteIdentity(parentIid, note.id), noteId: note.id, digest: digest(note.body) });
    }
    if (candidates.length > 1) throw conflict("Multiple records claim the same to-tickets operation");
    return candidates[0] ?? null;
  };
  const appendRecord = async (record, retryRejected = false) => mutateOnce(connection, {
    key: `${record.operationKey}:${record.kind}`, payload: record, retryRejected,
    observe: async () => {
      const found = await findRecord(record.kind, record.operationKey);
      if (found && !same(found.record, record)) throw conflict("to-tickets record content differs");
      return found;
    },
    write: async () => {
      await assertAuthor(connection.userId);
      await api(`/issues/${parentIid}/notes`, "POST", { body: render(record) });
    },
  });
  const nativeBlockersFor = async child => (await readLinks(child))
    .filter(link => link.linkType === "is_blocked_by").map(link => link.target).sort();
  const normalizeMapping = mapping => Object.fromEntries(Object.entries(mapping).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [requireText(key, "Decomposition key"), issueIdentity(value)]));
  const decompositionAuthority = decompositionIdentity => ({ specId: parentIdentity, target,
    planningSeal: upstream.publication.planningSeal, classification: "MULTI",
    approvedScopeHash: upstream.publication.approvedScopeHash, decompositionIdentity });

  const normalizeAdoptions = (adoptions, mapping) => {
    if (adoptions == null) return [];
    if (!Array.isArray(adoptions)) throw conflict("Completion adoptions must be an explicit array");
    const fields = ["childBodyDigest", "completionBodySha256", "completionIdentity", "decompositionIdentity",
      "issueId", "publicationIdentity"].sort();
    const normalized = adoptions.map(adoption => {
      if (!adoption || typeof adoption !== "object" || Array.isArray(adoption)
        || !same(Object.keys(adoption).sort(), fields)
        || fields.some(field => typeof adoption[field] !== "string" || !adoption[field])) {
        throw conflict("Completion adoption is malformed");
      }
      if (issueIdentity(adoption.issueId) !== adoption.issueId
        || !/^sha256:[a-f0-9]{64}$/u.test(adoption.childBodyDigest)
        || !/^sha256:[a-f0-9]{64}$/u.test(adoption.completionBodySha256)
        || !Object.values(mapping).includes(adoption.issueId)) {
        throw conflict("Completion adoption identity or digest differs");
      }
      return { ...adoption };
    }).sort((left, right) => left.issueId.localeCompare(right.issueId));
    if (new Set(normalized.map(adoption => adoption.issueId)).size !== normalized.length) {
      throw conflict("Completion adoptions contain a duplicate child");
    }
    return normalized;
  };
  const readPriorDecomposition = async decompositionIdentity => {
    const decomposition = await readNoteRecord(decompositionIdentity, schema, "decomposition:v1");
    const record = decomposition.record;
    if (record.parent !== parentIdentity || record.target !== target
      || typeof record.operationKey !== "string" || !record.operationKey
      || typeof record.upstreamPublicationIdentity !== "string") {
      throw conflict("Previous Decomposition authority differs");
    }
    const publication = await readNoteRecord(record.upstreamPublicationIdentity, upstreamSchema, "spec_publication");
    const upstreamHandoff = await readNoteRecord(record.upstreamHandoffIdentity, upstreamSchema, "producer_handoff");
    if (publication.record.authority?.specId !== parentIdentity
      || publication.record.authority?.target !== target
      || publication.record.authority?.classification !== "MULTI"
      || publication.record.authority?.planningSeal !== record.planningSeal
      || publication.record.authority?.approvedScopeHash !== record.approvedScopeHash
      || upstreamHandoff.record.publicationIdentity !== publication.identity
      || upstreamHandoff.record.publicationDigest !== publication.digest
      || upstreamHandoff.record.transactionIdentity !== publication.record.transactionIdentity
      || upstreamHandoff.record.checkpointIdentity?.bindings?.approvedScopeIdentity !== record.approvedScopeIdentity) {
      throw conflict("Previous Spec publication and Decomposition differ");
    }
    const upstreamTransaction = checkpoints.readCheckpoint(upstreamHandoff.record.checkpointIdentity);
    if (!upstreamTransaction || upstreamTransaction.schema !== "workflow-checkpoint-transaction:v2"
      || upstreamTransaction.state !== "COMPLETED"
      || upstreamTransaction.transactionId !== upstreamHandoff.record.transactionIdentity
      || upstreamTransaction.progress[1]?.receipt?.publicationIdentity !== publication.identity
      || upstreamTransaction.progress[1]?.receipt?.publicationDigest !== publication.digest
      || upstreamTransaction.progress[2]?.receipt?.handoffIdentity !== upstreamHandoff.identity
      || upstreamTransaction.progress[2]?.receipt?.handoffDigest !== upstreamHandoff.digest) {
      throw conflict("Previous Spec producer transaction is incomplete or differs");
    }
    const handoff = await findRecord("producer_handoff", record.operationKey);
    if (!handoff || handoff.record.transactionIdentity !== record.transactionIdentity
      || !same(handoff.record.checkpointIdentity, record.checkpointIdentity)
      || handoff.record.upstreamPublicationIdentity !== publication.identity
      || !same(handoff.record.recordIdentities, [publication.identity, decomposition.identity])
      || handoff.record.authority?.decompositionIdentity !== decomposition.identity) {
      throw conflict("Previous Decomposition handoff is missing or differs");
    }
    const transaction = checkpoints.readCheckpoint(record.checkpointIdentity);
    if (!transaction || transaction.schema !== "workflow-checkpoint-transaction:v2"
      || transaction.state !== "COMPLETED" || transaction.transactionId !== record.transactionIdentity
      || transaction.progress[0]?.receipt?.decompositionIdentity !== decomposition.identity
      || transaction.progress[0]?.receipt?.decompositionDigest !== decomposition.digest
      || transaction.progress[2]?.receipt?.handoffIdentity !== handoff.identity
      || transaction.progress[2]?.receipt?.handoffDigest !== handoff.digest) {
      throw conflict("Previous Decomposition transaction is incomplete or differs");
    }
    return { decomposition, publication, upstreamHandoff, handoff, mapping: normalizeMapping(record.decompositionMapping),
      edges: validateGraph(normalizeMapping(record.decompositionMapping), record.blockerEdges) };
  };
  const assertNoRegisteredWorktree = completion => {
    if (!isAbsolute(completion.worktree ?? "") || typeof completion.topic !== "string" || !completion.topic) {
      throw conflict("Completed child worktree identity is malformed");
    }
    const key = value => resolve(value).replaceAll("\\", "/").toLowerCase();
    const expectedPath = key(completion.worktree);
    const entries = gitRead(repository, "worktree", "list", "--porcelain", "-z").split("\0").filter(Boolean);
    if (existsSync(completion.worktree)
      || entries.some(entry => entry.startsWith("worktree ") && key(entry.slice(9)) === expectedPath)
      || entries.includes(`branch refs/heads/${completion.topic}`)) {
      throw conflict("Previous completed child retains a registered worktree or topic owner");
    }
  };
  const assertNoRunOwnership = (childIdentity, prior) => {
    const authorityValues = new Set([prior.publication.identity, prior.decomposition.identity,
      prior.decomposition.record.approvedScopeHash, prior.decomposition.record.approvedScopeIdentity].filter(Boolean));
    for (const runId of runs.listRunIds()) {
      const events = runs.readEvents(runId);
      const grant = events.findLast(event => event.type === "grant.recorded");
      const run = grant?.runIdentity;
      if (!run || run.specId !== parentIdentity) continue;
      const sameAuthority = [run.approvedPublicationIdentity, run.approvedScopeHash, run.decompositionIdentity]
        .some(value => authorityValues.has(value));
      if (sameAuthority) {
        throw conflict("Previous revision retains a Run Grant or child dispatch owner");
      }
    }
  };
  const validateCompletionAdoption = async ({ adoption, key, child, edges }) => {
    const prior = await readPriorDecomposition(adoption.decompositionIdentity);
    if (adoption.publicationIdentity !== prior.publication.identity
      || prior.mapping[key] !== child || prior.decomposition.record.childBodyDigests?.[child] !== adoption.childBodyDigest) {
      throw conflict("Adopted child is outside its previous publication");
    }
    const current = await snapshot(child);
    if (current.state !== "closed" || digest(current.body) !== adoption.childBodyDigest) {
      throw conflict("Adoption requires one unchanged closed child");
    }
    const parsed = parseChild({ key, title: current.title || "ignored", body: current.body });
    if (parsed.planningSeal !== prior.decomposition.record.planningSeal) {
      throw conflict("Adopted child Planning baseline differs from its previous publication");
    }
    const oldBlockers = prior.edges.filter(edge => edge.blocked === child).map(edge => edge.blocker).sort();
    const newBlockers = edges.filter(edge => edge.blocked === child).map(edge => edge.blocker).sort();
    if (!same(parsed.blockers, oldBlockers) || !same(oldBlockers, newBlockers)) {
      throw conflict("Adopted child incoming blockers changed");
    }
    const lifecycle = (await readIssueWorkflowRecords(child))
      .filter(item => ["implementation_complete", "implementation_blocked"].includes(item.record.kind));
    const completion = lifecycle.find(item => item.identity === adoption.completionIdentity
      && item.digest === adoption.completionBodySha256 && item.record.kind === "implementation_complete");
    if (!completion || lifecycle.at(-1) !== completion) throw conflict("Adoption requires the latest exact completion note");
    const record = completion.record;
    const approvedPublicationIdentity = record.operationIdentity?.approvedPublicationIdentity;
    try {
      assertWorkflowOperationIdentity(record.operationIdentity, deriveExecuteIssueOperationIdentity({ repositoryId,
        specId: parentIdentity, issueId: child, approvedPublicationIdentity }));
    } catch {
      throw conflict("Adopted completion operation identity is malformed");
    }
    const allowedAuthorities = new Set([prior.publication.identity, prior.decomposition.identity,
      prior.decomposition.record.approvedScopeHash, prior.decomposition.record.approvedScopeIdentity].filter(Boolean));
    if (!allowedAuthorities.has(approvedPublicationIdentity)
      || record.issueId !== child || record.specId !== parentIdentity || record.target !== target
      || record.planningSeal !== prior.decomposition.record.planningSeal || !sha.test(record.candidate ?? "")
      || record.standards !== "clean" || record.spec !== "clean" || record.worktreeState !== "clean"
      || !Array.isArray(record.verification) || record.verification.length === 0
      || record.verification.some(check => !["PASS", "PASSED"].includes(check?.result))) {
      throw conflict("Adopted completion evidence differs from its previous authority");
    }
    assertAncestor(record.candidate);
    assertNoRegisteredWorktree(record);
    assertNoRunOwnership(child, prior);
    return { prior, current };
  };
  const assertNoActiveRevisionLane = (childIdentity, prior) => {
    const authorityValues = new Set([prior.publication.identity, prior.decomposition.identity,
      prior.decomposition.record.approvedScopeHash, prior.decomposition.record.approvedScopeIdentity].filter(Boolean));
    for (const runId of runs.listRunIds()) {
      const events = runs.readEvents(runId);
      const grant = events.findLast(event => event.type === "grant.recorded")?.runIdentity;
      if (!grant || grant.specId !== parentIdentity
        || ![grant.approvedPublicationIdentity, grant.approvedScopeHash, grant.decompositionIdentity]
          .some(value => authorityValues.has(value))) continue;
      if (events.some(event => event.type === "dispatch.recorded" && event.issueId === childIdentity)) {
        throw conflict("Previous child revision retains a Run dispatch owner");
      }
    }
  };
  const validatePreviousRevisionInput = previous => {
    const fields = ["body", "decompositionIdentity", "trackerIdentity", "version"].sort();
    if (!previous || typeof previous !== "object" || Array.isArray(previous)
      || !same(Object.keys(previous).sort(), fields)
      || fields.some(field => typeof previous[field] !== "string" || !previous[field])) {
      throw conflict("Previous child revision evidence is malformed");
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(previous.version)) {
      throw conflict("Previous child revision version is malformed");
    }
    issueIdentity(previous.trackerIdentity);
    parseNoteIdentity(previous.decompositionIdentity);
    return previous;
  };
  const validateRevisionEvidence = async ({ previous, expected, current }) => {
    validatePreviousRevisionInput(previous);
    if (issueIdentity(previous.trackerIdentity) !== current.trackerIdentity
      || previous.version !== current.version || previous.body !== current.body || current.state !== "opened") {
      throw conflict("Previous child body, version, identity, or open state changed");
    }
    const prior = await readPriorDecomposition(previous.decompositionIdentity);
    if (prior.mapping[expected.key] !== current.trackerIdentity
      || prior.decomposition.record.childBodyDigests?.[current.trackerIdentity] !== digest(previous.body)) {
      throw conflict("Previous child is outside its completed Decomposition");
    }
    const parsed = parseChild({ key: expected.key, title: current.title || "ignored", body: previous.body });
    if (parsed.planningSeal !== prior.decomposition.record.planningSeal) {
      throw conflict("Previous child Planning baseline differs from its Decomposition");
    }
    const oldBlockers = prior.edges.filter(edge => edge.blocked === current.trackerIdentity).map(edge => edge.blocker).sort();
    if (!same(parsed.blockers, oldBlockers)) throw conflict("Previous child blockers differ from its Decomposition");
    if (blockingRepresentation === "native" && !same(oldBlockers, expected.blockers)) {
      throw conflict("Declared-native child revision cannot rewrite blocker relationships");
    }
    const lifecycle = await readIssueWorkflowRecords(current.trackerIdentity);
    for (const item of lifecycle.filter(item => item.record.kind.startsWith("implementation_"))) {
      const record = item.record;
      if (record.kind !== "implementation_blocked" || record.reasonCode !== "scope_revision_required"
        || ["worktree", "topic", "candidate", "taskRef"].some(field => record[field] != null)) {
        throw conflict("Previous child has active or unknown execution-lane evidence");
      }
    }
    assertNoActiveRevisionLane(current.trackerIdentity, prior);
    return prior;
  };

  const validatePublishedGraph = async record => {
    if (record.parent !== parentIdentity || record.target !== target
      || record.planningSeal !== upstream.publication.planningSeal
      || record.approvedScopeHash !== upstream.publication.approvedScopeHash
      || record.approvedScopeIdentity !== upstream.publication.approvedScopeIdentity
      || record.upstreamPublicationIdentity !== upstream.publication.publicationIdentity
      || record.upstreamHandoffIdentity !== upstream.handoff.handoffIdentity
      || record.blockingRepresentation !== blockingRepresentation) {
      throw conflict("Decomposition record authority or blocker representation differs");
    }
    const mapping = normalizeMapping(record.decompositionMapping);
    if (!same(mapping, record.decompositionMapping)) throw conflict("Decomposition mapping is not canonical");
    const edges = validateGraph(mapping, record.blockerEdges);
    if (!same(edges, record.blockerEdges)) throw conflict("Blocker edges are not canonical");
    const adoptions = normalizeAdoptions(record.adoptedCompletions, mapping);
    const adoptionByIssue = new Map(adoptions.map(adoption => [adoption.issueId, adoption]));
    const childDigests = {};
    for (const [key, child] of Object.entries(mapping)) {
      const current = await snapshot(child);
      if (decompositionKey(current.body) !== key || ![parentIdentity, `${parentIdentity}.`].includes(section(current.body, "Parent"))
        || section(current.body, "Target") !== target) {
        throw conflict("Published child canonical contract differs");
      }
      const adoption = adoptionByIssue.get(child);
      const parsed = parseChild({ key, title: current.title || "ignored", body: current.body });
      if (adoption) await validateCompletionAdoption({ adoption, key, child, edges });
      else if (parsed.planningSeal !== upstream.publication.planningSeal) {
        throw conflict("Published child Planning baseline differs");
      }
      const expectedBlockers = edges.filter(edge => edge.blocked === child).map(edge => edge.blocker).sort();
      if (!same(parsed.blockers, expectedBlockers)) throw conflict("Published child body blocker edges differ");
      if (record.childBodyDigests?.[child] !== digest(current.body)) throw conflict("Published child body digest differs");
      childDigests[child] = digest(current.body);
      const native = await nativeBlockersFor(child);
      if (blockingRepresentation === "native" && !same(native, expectedBlockers)) {
        throw conflict("Declared-native blocker evidence differs");
      }
      if (blockingRepresentation === "body" && native.length) {
        throw conflict("Body representation cannot retain native blocking relations");
      }
    }
    return { mapping, edges, childDigests, adoptions };
  };
  const readDecompositionRecord = async input => {
    const transaction = getTransaction(input);
    const found = await findRecord("decomposition:v1", input.operationId);
    if (!found) return null;
    if (found.record.transactionIdentity !== transaction.transactionId
      || !same(found.record.checkpointIdentity, input)) throw conflict("Decomposition record checkpoint binding differs");
    const graph = await validatePublishedGraph(found.record);
    return { found, graph };
  };
  const readDecomposition = async input => {
    const result = await readDecompositionRecord(input);
    return result ? { decompositionIdentity: result.found.identity, decompositionDigest: result.found.digest,
      decompositionMapping: result.graph.mapping, blockerEdges: result.graph.edges } : null;
  };
  const buildDecompositionRecord = async ({ identity: input, decompositionMapping, blockerEdges, children, preflight,
    adoptedCompletions = null }) => {
    const transaction = assertDecompositionOpen(input);
    const mapping = normalizeMapping(decompositionMapping);
    const edges = validateGraph(mapping, blockerEdges);
    if (!Array.isArray(children) || children.length !== Object.keys(mapping).length) {
      throw conflict("Every mapped child requires one exact canonical contract");
    }
    const expected = new Map(children.map(child => {
      const normalized = parseChild(child);
      return [normalized.key, normalized];
    }));
    if (expected.size !== children.length || [...expected.keys()].some(key => !Object.hasOwn(mapping, key))) {
      throw conflict("Canonical child contracts and Decomposition mapping differ");
    }
    const childIdentities = new Set(Object.values(mapping));
    const adoptions = normalizeAdoptions(adoptedCompletions, mapping);
    const adoptionByIssue = new Map(adoptions.map(adoption => [adoption.issueId, adoption]));
    const externalBlockers = [...new Set(edges.filter(edge => !childIdentities.has(edge.blocker)).map(edge => edge.blocker))].sort();
    await validatePreflight(preflight, { keys: Object.keys(mapping), blockers: externalBlockers });
    if (!same(preflight.externalBlockers.map(blocker => blocker.trackerIdentity).sort(), externalBlockers)) {
      throw conflict("Decomposition preflight External blocker set differs from the complete graph");
    }
    for (const [key, childIdentity] of Object.entries(mapping)) {
      const matches = preflight.matches[key];
      if (matches.length !== 1 || matches[0].trackerIdentity !== childIdentity) {
        throw conflict("Decomposition mapping differs from the complete child preflight");
      }
    }
    const partials = readPartials(input.operationId);
    if (blockingRepresentation === "body" && partials.length) {
      if (await findRecord("decomposition:v1", input.operationId)) throw conflict("Completed decomposition cannot adopt body representation");
      for (const partial of partials) {
        const relation = partial.relation;
        if (partial.readBack.state !== "ABSENT"
          || !edges.some(edge => edge.blocked === relation.source && edge.blocker === relation.target)
          || mapping[relation.childKey] !== relation.source) {
          throw conflict("Partial native relation evidence differs from verified body-mode adoption");
        }
      }
    }
    const childBodyDigests = {};
    for (const [key, childIdentity] of Object.entries(mapping)) {
      const child = expected.get(key);
      const blockers = edges.filter(edge => edge.blocked === childIdentity).map(edge => edge.blocker).sort();
      if (!same(child.blockers, blockers)) throw conflict("Canonical child body and Decomposition blocker edges differ");
      const current = await snapshot(childIdentity);
      const adoption = adoptionByIssue.get(childIdentity);
      if (current.state === "closed" && !adoption) {
        throw conflict("A closed child requires explicit completion adoption before Decomposition publication");
      }
      if (current.state !== "closed" && adoption) throw conflict("Completion adoption requires a closed child");
      let readBack;
      if (adoption) {
        const adopted = await validateCompletionAdoption({ adoption, key, child: childIdentity, edges });
        if (child.bodyDigest !== adoption.childBodyDigest) throw conflict("Adopted canonical child body differs");
        readBack = await readChildContract({ ...child, trackerIdentity: childIdentity }, {
          planningSeal: adopted.prior.decomposition.record.planningSeal,
        });
      } else {
        if (child.planningSeal !== upstream.publication.planningSeal) {
          throw conflict("Child body Planning baseline differs");
        }
        readBack = await readChild({ ...child, trackerIdentity: childIdentity });
      }
      childBodyDigests[childIdentity] = readBack.bodyDigest;
      const native = await nativeBlockersFor(childIdentity);
      if (blockingRepresentation === "native" && !same(native, blockers)) throw conflict("Declared-native blocker relation is incomplete");
      if (blockingRepresentation === "body" && native.length) {
        throw conflict("Body representation cannot retain native blocking relations");
      }
    }
    return { schema, kind: "decomposition:v1", repositoryId, operationKey: input.operationId,
      checkpointIdentity: input, transactionIdentity: transaction.transactionId, parent: parentIdentity, target,
      planningSeal: upstream.publication.planningSeal, approvedScopeHash: upstream.publication.approvedScopeHash,
      approvedScopeIdentity: upstream.publication.approvedScopeIdentity,
      upstreamPublicationIdentity: upstream.publication.publicationIdentity,
      upstreamHandoffIdentity: upstream.handoff.handoffIdentity, blockingRepresentation,
      decompositionMapping: mapping, blockerEdges: edges, childBodyDigests,
      ...(adoptions.length ? { adoptedCompletions: adoptions } : {}) };
  };
  const publishDecomposition = async ({ retryRejected = false, ...request }) => withProducerLock(connection, parentIdentity, async () => {
    const record = await buildDecompositionRecord(request);
    await appendRecord(record, retryRejected);
    return readDecomposition(request.identity);
  });

  const observeReadyState = async input => {
    const decomposition = await readDecompositionRecord(input);
    if (!decomposition) throw conflict("Decomposition read-back is missing");
    const { mapping, edges } = decomposition.graph;
    const locators = [...new Set([...Object.values(mapping), ...edges.map(edge => edge.blocker)])];
    const snapshots = new Map();
    for (const locator of locators) snapshots.set(locator, await snapshot(locator));
    const states = Object.values(mapping).sort().map(trackerIdentity => {
      const current = snapshots.get(trackerIdentity);
      const blockers = edges.filter(edge => edge.blocked === trackerIdentity).map(edge => edge.blocker);
      const expectedReady = current.state === "opened" && blockers.every(blocker => snapshots.get(blocker)?.state === "closed");
      const ready = current.labels.includes(readyLabel);
      return { trackerIdentity, state: current.state, ready, expectedReady };
    });
    return { readyFrontier: states.filter(state => state.expectedReady).map(state => state.trackerIdentity),
      states, consistent: states.every(state => state.ready === state.expectedReady) };
  };
  const readReadyState = input => observeReadyState(input);
  const readyMutation = ({ input, state, before }) => ({
    key: `${input.operationId}:ready:${parseIid(state.trackerIdentity)}:${state.expectedReady ? "add" : "remove"}`,
    payload: { trackerIdentity: state.trackerIdentity, readyLabel, expectedReady: state.expectedReady,
      beforeVersion: before.version, beforeLabels: before.labels },
  });
  const writeReadyState = async ({ identity: input, retryRejected = false }) => withProducerLock(connection, parentIdentity, async () => {
    const transaction = getTransaction(input);
    if (transaction.nextStage !== "ready_state.read_back") {
      throw conflict("Ready-state mutation requires the first unsatisfied ready_state.read_back stage");
    }
    const decompositionReceipt = await readDecomposition(input);
    if (!decompositionReceipt || !same(transaction.progress[0]?.receipt, decompositionReceipt)) {
      throw conflict("Decomposition checkpoint must precede ready-state mutation");
    }
    const labels = (await list("/labels")).map(label => label.name);
    if (!labels.includes(readyLabel)) throw conflict("Configured ready label does not exist; producer cannot create labels");
    const observed = await observeReadyState(input);
    for (const state of observed.states.filter(candidate => candidate.ready !== candidate.expectedReady)) {
      const before = await snapshot(state.trackerIdentity);
      const descriptor = readyMutation({ input, state, before });
      await mutateOnce(connection, { ...descriptor, retryRejected,
        observe: async attempted => {
          const current = await snapshot(state.trackerIdentity);
          const ready = current.labels.includes(readyLabel);
          if (ready === state.expectedReady) return current;
          if (attempted || current.version !== before.version || !same(current.labels, before.labels)) {
            throw conflict("Child ready state changed outside the owning mutation");
          }
          return null;
        },
        write: async () => {
          await assertAuthor(connection.userId);
          const current = await snapshot(state.trackerIdentity);
          if (current.version !== before.version || !same(current.labels, before.labels)) {
            throw conflict("Child ready state changed before update");
          }
          await api(`/issues/${parseIid(state.trackerIdentity)}`, "PUT",
            state.expectedReady ? { add_labels: readyLabel } : { remove_labels: readyLabel });
        },
      });
    }
    const result = await observeReadyState(input);
    if (!result.consistent) throw conflict("Ready-state read-back differs from the published blocker graph");
    return result;
  });

  const handoffRead = async ({ identity: input }) => {
    const transaction = getTransaction(input);
    const decomposition = await readDecompositionRecord(input);
    const decompositionReceipt = await readDecomposition(input);
    if (!decomposition || !same(transaction.progress[0]?.receipt, decompositionReceipt)
      || !transaction.progress[1]?.receipt?.consistent) {
      throw conflict("Decomposition and ready-state checkpoints must precede handoff");
    }
    const found = await findRecord("producer_handoff", input.operationId);
    if (!found) return null;
    const record = found.record;
    const expectedAuthority = decompositionAuthority(decomposition.found.identity);
    if (record.producerCommand !== "to-tickets" || record.transactionIdentity !== transaction.transactionId
      || !same(record.checkpointIdentity, input) || !same(record.authority, expectedAuthority)
      || record.trackerIdentity !== parentIdentity
      || record.upstreamPublicationIdentity !== upstream.publication.publicationIdentity
      || record.upstreamHandoffIdentity !== upstream.handoff.handoffIdentity
      || !same(record.operationReceipt, { transactionIdentity: transaction.transactionId,
        decompositionReadBack: transaction.progress[0].receipt, readyStateReadBack: transaction.progress[1].receipt })
      || !same(record.decompositionMapping, decomposition.graph.mapping)
      || !same(record.blockerEdges, decomposition.graph.edges)
      || !same(record.recordIdentities, [upstream.publication.publicationIdentity, decomposition.found.identity])) {
      throw conflict("Composite to-tickets handoff bindings differ");
    }
    return { handoffIdentity: found.identity, handoffDigest: found.digest };
  };
  const handoffAppend = async ({ identity: input, preparation = null, retryRejected = false }) => withProducerLock(connection, parentIdentity, async () => {
    const transaction = getTransaction(input);
    const decomposition = await readDecompositionRecord(input);
    const decompositionReceipt = await readDecomposition(input);
    const ready = await readReadyState(input);
    if (!decomposition || !same(transaction.progress[0]?.receipt, decompositionReceipt)
      || !ready.consistent || !same(transaction.progress[1]?.receipt, ready)) {
      throw conflict("Decomposition and ready-state checkpoints must precede handoff");
    }
    const record = { schema, kind: "producer_handoff", repositoryId, operationKey: input.operationId,
      producerCommand: "to-tickets", authority: decompositionAuthority(decomposition.found.identity),
      checkpointIdentity: input, transactionIdentity: transaction.transactionId, trackerIdentity: parentIdentity,
      upstreamPublicationIdentity: upstream.publication.publicationIdentity,
      upstreamHandoffIdentity: upstream.handoff.handoffIdentity,
      operationReceipt: { transactionIdentity: transaction.transactionId,
        decompositionReadBack: transaction.progress[0].receipt, readyStateReadBack: transaction.progress[1].receipt },
      decompositionMapping: decomposition.graph.mapping, blockerEdges: decomposition.graph.edges,
      recordIdentities: [upstream.publication.publicationIdentity, decomposition.found.identity], preparation };
    await appendRecord(record, retryRejected);
    return handoffRead({ identity: input });
  });
  const advance = async ({ identity: input, stage, receipt }) => {
    const observed = stage === "decomposition.read_back" ? await readDecomposition(input)
      : stage === "ready_state.read_back" ? await readReadyState(input)
        : stage === "handoff.completed" ? await handoffRead({ identity: input }) : null;
    if (!observed || stage === "ready_state.read_back" && !observed.consistent || !same(observed, receipt)) {
      throw conflict("Stage receipt is not the exact owner read-back");
    }
    return checkpoints.advanceCheckpoint({ identity: input, stage, receipt });
  };

  return { repositoryId, publicationMode: "READ_WRITE_READBACK", blockingRepresentation,
    upstream: { readPublication: () => structuredClone(upstream.publication),
      readHandoff: ({ publicationIdentity }) => {
        if (publicationIdentity !== upstream.publication.publicationIdentity) throw conflict("Upstream publication identity differs");
        return structuredClone(upstream.handoff);
      } },
    checkpoint: { identity, read: input => { validateIdentity(input); return checkpoints.readCheckpoint(input); },
      create: async input => {
        validateIdentity(input);
        if (!checkpoints.readCheckpoint(input)
          && (hasLocalMutationEvidence(input.operationId)
            || await findRecord("decomposition:v1", input.operationId) || await findRecord("producer_handoff", input.operationId))) {
          throw conflict("Downstream to-tickets mutation or record evidence exists without its transaction; preserve the evidence");
        }
        return createProducerOperationCheckpoint({ store: checkpoints, identity: input });
      }, advance },
    tracker: { discoverChildren, readChild, publishChild, updateChild, readRelation, publishRelation,
      readDecomposition, publishDecomposition, readReadyState, writeReadyState,
      readChildMutation: ({ identity: input, child }) => {
        validateIdentity(input);
        const expected = validateChild(child);
        return readMutation(connection, { key: `${input.operationId}:child:${expected.key}`,
          payload: { key: expected.key, title: expected.title, body: expected.body, parent: parentIdentity } });
      },
      readChildUpdateMutation: ({ identity: input, child, previous }) => {
        validateIdentity(input);
        const expected = validateChild(child);
        previous = validatePreviousRevisionInput(previous);
        return readMutation(connection, childUpdateDescriptor(input, expected, previous));
      },
      readRelationMutation: ({ identity: input, relation }) => {
        validateIdentity(input);
        const descriptor = relationDescriptor(relation);
        return readMutation(connection, relationMutationDescriptor(input.operationId, descriptor));
      },
      readPartialRelations: ({ identity: input }) => { validateIdentity(input); return readPartials(input.operationId); } },
    handoff: { read: handoffRead, append: handoffAppend } };
}
