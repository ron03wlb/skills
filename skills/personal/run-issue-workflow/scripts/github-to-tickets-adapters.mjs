import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { createWorkflowControlStore } from "./workflow-control-store.mjs";
import { createRunStore } from "./run-store.mjs";
import { assertWorkflowOperationIdentity, bindProducerCheckpointOperationIdentity, createProducerOperationCheckpoint,
  deriveExecuteIssueOperationIdentity } from "./delivery-authority.mjs";
import { connectGitHubProducer, conflict, digest, gitRead, proveGhCapability, withProducerLock } from "./github-producer-transport.mjs";
import { mutateOnce, readMutation } from "./github-producer-mutations.mjs";
import { bodyDigest, readWorkflowRecords, renderWorkflowRecord } from "./github-workflow-records.mjs";

const schema = "github-to-tickets-record:v1";
const partialSchema = "github-to-tickets-partial:v1";
const sha = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const nodeIdPattern = /^I_[A-Za-z0-9_-]+$/u;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const requireText = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw conflict(`${label} is required`);
  return value;
};
const noEmbeddedRecord = value => {
  if (/```(?:workflow-record|json)/u.test(value)) {
    throw conflict("Producer content must not embed another workflow record or JSON authority payload");
  }
};
const normalizeLabels = labels => {
  const names = labels.map(label => typeof label === "string" ? label : label?.name);
  if (names.some(name => typeof name !== "string" || !name)) throw conflict("Exact labels are required");
  return [...new Set(names)].sort();
};
const normalizeExpectedLabels = labels => {
  if (!Array.isArray(labels) || labels.some(label => typeof label !== "string" || !label)) {
    throw conflict("Exact expected labels are required");
  }
  return [...new Set(labels)].sort();
};
const bodyMatches = (actual, expected) => actual === expected
  || expected.endsWith("\n") && actual === expected.slice(0, -1);

function section(body, heading) {
  const lines = body.replace(/\r\n/gu, "\n").split("\n");
  const marker = `## ${heading}`;
  const indexes = lines.flatMap((line, index) => line === marker ? [index] : []);
  if (indexes.length !== 1) throw conflict(`Canonical child must contain one ${marker} section`);
  const end = lines.findIndex((line, index) => index > indexes[0] && line.startsWith("## "));
  return lines.slice(indexes[0] + 1, end < 0 ? lines.length : end).join("\n").trim();
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

// Step 1: prove which child/parent representation this host exposes before any mutation.
export async function selectGitHubChildRepresentation({ connection, parentNumber, parentIssue }) {
  const summary = parentIssue?.sub_issues_summary;
  const dependencies = parentIssue?.issue_dependencies_summary;
  if (!summary || !Number.isSafeInteger(summary.total)
    || !dependencies || !Number.isSafeInteger(dependencies.total_blocked_by)) {
    return { state: "PRESENT", representation: "body", nativeParentRelation: false,
      reason: "The configured repository does not expose native sub-issue and dependency summaries." };
  }
  const { repositoryName, list } = connection;
  try {
    await list(`repos/${repositoryName}/issues/${parentNumber}/sub_issues`);
    await list(`repos/${repositoryName}/issues/${parentNumber}/dependencies/blocked_by`);
  } catch (error) {
    if (error.code === "GITHUB_PRODUCER_TRANSPORT" && error.outcome === "REJECTED") {
      return { state: "PRESENT", representation: "body", nativeParentRelation: false,
        reason: `Native sub-issue or dependency reads are rejected (HTTP ${error.httpStatus}).` };
    }
    throw conflict("Native sub-issue and dependency reads are unresolved; neither representation can be proven");
  }
  return { state: "PRESENT", representation: "native", nativeParentRelation: true,
    reason: "Native sub-issue and dependency reads are proven available." };
}

export async function createGitHubToTicketsAdapters(options) {
  const connection = await connectGitHubProducer(options);
  const { repository, repositoryName, repositoryId, api, list, node, gitCommonDir } = connection;
  const target = requireText(options.target, "target");
  gitRead(repository, "check-ref-format", `refs/heads/${target}`);
  const readyLabel = options.readyLabel ?? "ready-for-agent";
  if (!/^[^,\r\n]+$/u.test(readyLabel)) throw conflict("One exact ready label is required");
  if (options.blockingRepresentation !== undefined && !["body", "native"].includes(options.blockingRepresentation)) {
    throw conflict("blockingRepresentation must be explicitly configured as body or native");
  }
  const capability = options.capability ?? await proveGhCapability({ repository, repositoryName, execute: options.execute });
  if (capability?.state !== "PROVEN") throw conflict("An exact proven publish capability is required");
  const checkpoints = createWorkflowControlStore({ gitCommonDir });
  const runs = createRunStore({ gitCommonDir, coordinatorInstanceId: "github-to-tickets-read-only-lifecycle" });

  const head = () => gitRead(repository, "rev-parse", "--verify", `refs/heads/${target}^{commit}`);
  const assertAncestor = (commit, descendant = head()) => {
    if (!sha.test(commit ?? "")) throw conflict("Invalid Planning Seal or baseline SHA");
    gitRead(repository, "merge-base", "--is-ancestor", commit, descendant);
  };
  const issueUrl = number => `https://github.com/${repositoryName}/issues/${number}`;
  const validateIssue = issue => {
    if (!nodeIdPattern.test(issue?.node_id ?? "") || !Number.isSafeInteger(issue.number) || issue.number < 1
      || !Number.isSafeInteger(issue.id) || issue.id < 1
      || issue.html_url !== issueUrl(issue.number) || Boolean(issue.pull_request)
      || !Array.isArray(issue.labels) || typeof issue.updated_at !== "string" || !["open", "closed"].includes(issue.state)) {
      throw conflict("Native GitHub Issue identity is unreadable or differs");
    }
    return issue;
  };
  const resolveLocator = async locator => {
    const raw = String(locator);
    const urlMatch = raw.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/([1-9][0-9]*)$/u);
    if (urlMatch) {
      if (urlMatch[1] !== repositoryName) throw conflict("Issue locator is outside the configured repository or is malformed");
      return { number: Number(urlMatch[2]) };
    }
    if (/^[1-9][0-9]*$/u.test(raw) && Number.isSafeInteger(Number(raw))) return { number: Number(raw) };
    if (nodeIdPattern.test(raw)) {
      const found = await node(raw);
      if (found.nodeId !== raw || !Number.isSafeInteger(found.number)) throw conflict("Issue node is outside the configured repository");
      return { nodeId: found.nodeId, number: found.number };
    }
    throw conflict("Issue locator is outside the configured repository or is malformed");
  };
  const snapshot = async locator => {
    const resolved = await resolveLocator(locator);
    const issue = validateIssue((await api(`repos/${repositoryName}/issues/${resolved.number}`))[0] ?? {});
    if (issue.number !== resolved.number || (resolved.nodeId && issue.node_id !== resolved.nodeId)) {
      throw conflict("GitHub returned a different Issue");
    }
    const labels = normalizeLabels(issue.labels);
    const version = digest(JSON.stringify({ nodeId: issue.node_id, number: issue.number, nativeIssueId: issue.id,
      repositoryId, title: issue.title, body: issue.body ?? "", labels, state: issue.state, updatedAt: issue.updated_at }));
    return { issue, trackerIdentity: issue.node_id, nativeIssueNumber: issue.number, nativeIssueId: issue.id, version,
      title: issue.title, body: issue.body ?? "", labels, state: issue.state };
  };
  if (options.specId === undefined || options.specId === null) throw conflict("specId is required");
  const parent = await snapshot(options.specId);
  const parentIdentity = parent.trackerIdentity;
  const parentNumber = parent.nativeIssueNumber;
  const selection = await selectGitHubChildRepresentation({ connection, parentNumber, parentIssue: parent.issue });
  if (selection.state !== "PRESENT") throw conflict("No child/parent representation could be proven for this repository");
  const blockingRepresentation = options.blockingRepresentation ?? selection.representation;
  if (blockingRepresentation === "native" && selection.representation !== "native") {
    throw conflict("Declared-native representation is unprovable on this repository");
  }

  const commentEntries = async number => {
    let rows;
    try { rows = await list(`repos/${repositoryName}/issues/${number}/comments?per_page=100`); } catch (error) {
      throw error.code === "GITHUB_PRODUCER_TRANSPORT" ? error : conflict("GitHub comment read failed");
    }
    try { return readWorkflowRecords(rows); } catch (error) { throw conflict(error.message); }
  };
  const oneEntry = (entries, predicate, label) => {
    const matches = entries.filter(predicate);
    if (matches.length > 1) throw conflict(`Multiple records claim ${label}`);
    return matches[0] ?? null;
  };

  const upstream = await (async () => {
    const handoffIdentity = requireText(options.upstreamHandoffIdentity, "upstreamHandoffIdentity");
    const entries = await commentEntries(parentNumber);
    const handoff = oneEntry(entries, entry => entry.identity === handoffIdentity, "the upstream handoff");
    if (!handoff || handoff.record.kind !== "producer_handoff") throw conflict("The upstream to-spec handoff is missing");
    const handoffRecord = handoff.record;
    if (handoffRecord.repositoryId !== repositoryId || handoffRecord.producerCommand !== "to-spec"
      || handoffRecord.specId !== parentIdentity || handoffRecord.trackerIdentity !== parentIdentity
      || handoffRecord.target !== target || handoffRecord.classification !== "MULTI"
      || handoffRecord.decompositionIdentity !== null || !sha.test(handoffRecord.planningSeal ?? "")
      || !sha256Pattern.test(handoffRecord.publicationDigest ?? "")
      || !sha256Pattern.test(handoffRecord.transactionIdentity ?? "")
      || handoffRecord.checkpointIdentity?.producerCommand !== "to-spec"
      || handoffRecord.checkpointIdentity?.profileVersion !== "v2") {
      throw conflict("Upstream to-spec handoff bindings differ");
    }
    const publication = oneEntry(entries, entry => entry.identity === handoffRecord.publicationIdentity, "the upstream publication");
    if (!publication || publication.record.kind !== "spec_publication") throw conflict("The upstream to-spec publication is missing");
    const publicationRecord = publication.record;
    if (publication.bodySha256 !== handoffRecord.publicationDigest
      || publicationRecord.repositoryId !== repositoryId
      || publicationRecord.trackerIdentity !== parentIdentity
      || publicationRecord.transactionIdentity !== handoffRecord.transactionIdentity
      || publicationRecord.authority?.specId !== parentIdentity
      || publicationRecord.authority?.target !== target
      || publicationRecord.authority?.classification !== "MULTI"
      || publicationRecord.authority?.decompositionIdentity !== null
      || !sha256Pattern.test(publicationRecord.authority?.approvedScopeHash ?? "")
      || typeof publicationRecord.version !== "string") {
      throw conflict("Upstream publication and handoff records differ");
    }
    const labels = normalizeExpectedLabels(publicationRecord.labels ?? []);
    if (!labels.includes(readyLabel)) throw conflict("The upstream publication does not bind the selected ready label");
    if (bodyDigest(parent.body) !== publicationRecord.authority.approvedScopeHash
      || !same(parent.labels, labels) || parent.state !== "open") {
      throw conflict("Current parent body, scope, labels, or state differs from the approved upstream publication");
    }
    const checkpointIdentity = bindProducerCheckpointOperationIdentity(handoffRecord.checkpointIdentity);
    const transaction = checkpoints.readCheckpoint(checkpointIdentity);
    if (!transaction || transaction.schema !== "workflow-checkpoint-transaction:v2" || transaction.state !== "COMPLETED"
      || transaction.transactionId !== handoffRecord.transactionIdentity
      || transaction.progress[1]?.receipt?.publicationIdentity !== publication.identity
      || transaction.progress[1]?.receipt?.publicationDigest !== publication.bodySha256
      || transaction.progress[2]?.receipt?.handoffIdentity !== handoff.identity
      || transaction.progress[2]?.receipt?.handoffDigest !== handoff.bodySha256) {
      throw conflict("Upstream to-spec transaction is incomplete or differs");
    }
    assertAncestor(handoffRecord.planningSeal);
    return {
      publication: { specId: parentIdentity, trackerIdentity: parentIdentity, nativeIssueNumber: parentNumber,
        publicationIdentity: publication.identity, publicationDigest: publication.bodySha256,
        bodyVersion: publicationRecord.version, target, planningSeal: handoffRecord.planningSeal,
        classification: "MULTI", approvedScopeHash: publicationRecord.authority.approvedScopeHash,
        approvedScopeIdentity: publicationRecord.authority.approvedScopeHash,
        nextCommand: `/to-tickets ${issueUrl(parentNumber)}` },
      handoff: { handoffIdentity: handoff.identity, handoffDigest: handoff.bodySha256,
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
        trackerIdentity: parentIdentity,
        upstream: { publicationIdentity: upstream.publication.publicationIdentity,
          handoffIdentity: upstream.handoff.handoffIdentity },
        readyLabel } });
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

  const findRecord = async (kind, operationKey, number = parentNumber) => {
    const entries = await commentEntries(number);
    const candidates = entries.filter(entry => entry.record.kind === kind && entry.record.operationKey === operationKey
      && entry.record.repositoryId === repositoryId);
    if (candidates.length > 1) throw conflict("Multiple records claim the same to-tickets operation");
    const found = candidates[0];
    return found ? { record: found.record, identity: found.identity, digest: found.bodySha256 } : null;
  };
  const appendRecord = async (record, retryRejected = false) => mutateOnce(connection, {
    key: `${record.operationKey}:${record.kind}`, payload: record, retryRejected,
    observe: async () => {
      const found = await findRecord(record.kind, record.operationKey);
      if (found && !same(found.record, record)) throw conflict("to-tickets record content differs");
      return found;
    },
    write: async () => { await api(`repos/${repositoryName}/issues/${parentNumber}/comments`, "POST", { body: renderWorkflowRecord(record) }); },
  });

  const blockerReferences = body => {
    const value = section(body, "Blocked by");
    if (value === "None.") return [];
    const lines = value.split("\n");
    const references = lines.map(line => line.match(/^- `([^`]+)`$/u)?.[1]);
    if (references.some(reference => !reference) || new Set(references).size !== references.length) {
      throw conflict("Blocked by must contain unique canonical Issue-reference bullets or exactly None.");
    }
    if (!same(references, [...references].sort())) throw conflict("Blocked by Issue references must use canonical reference order");
    return references.map(reference => {
      const urlMatch = reference.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/([1-9][0-9]*)$/u);
      if (urlMatch) {
        if (urlMatch[1] !== repositoryName) throw conflict("Blocked by reference is outside the configured repository");
        return { reference, kind: "number", number: Number(urlMatch[2]) };
      }
      if (nodeIdPattern.test(reference)) return { reference, kind: "node", nodeId: reference };
      throw conflict("Blocked by reference must be one canonical Issue URL or immutable node identity");
    });
  };
  const parseChild = child => {
    requireText(child?.key, "Decomposition key");
    requireText(child?.title, "child title");
    requireText(child?.body, "child body");
    noEmbeddedRecord(child.body);
    if (decompositionKey(child.body) !== child.key) throw conflict("Child body Decomposition key differs");
    const parentReference = section(child.body, "Parent").replace(/\s+/gu, " ").trim();
    if (![parentIdentity, issueUrl(parentNumber), `[Spec #${parentNumber}](${issueUrl(parentNumber)})`].includes(parentReference)) {
      throw conflict("Child body parent differs");
    }
    const targetReference = section(child.body, "Target").replace(/^`([^`]+)`$/u, "$1").trim();
    if (targetReference !== target) throw conflict("Child body target differs");
    const planningSeal = section(child.body, "Planning baseline").match(/^- Commit: ([a-f0-9]{40}|[a-f0-9]{64})$/mu)?.[1];
    if (!planningSeal) throw conflict("Child body Planning baseline is malformed");
    return { key: child.key, title: child.title, body: child.body, references: blockerReferences(child.body),
      planningSeal, bodyDigest: bodyDigest(child.body) };
  };
  const validateChild = (child, planningSeal = upstream.publication.planningSeal) => {
    const parsed = parseChild(child);
    if (parsed.planningSeal !== planningSeal) throw conflict("Child body Planning baseline differs");
    return parsed;
  };
  // The canonical body graph addresses Issues by URL or immutable node identity; native evidence uses node identities.
  const resolveReference = async reference => {
    if (reference.kind === "number") {
      const current = await snapshot(reference.number);
      return { nodeId: current.trackerIdentity, number: current.nativeIssueNumber };
    }
    const found = await node(reference.nodeId);
    if (found.nodeId !== reference.nodeId) throw conflict("Blocked by node identity is outside the configured repository");
    return { nodeId: found.nodeId, number: found.number };
  };
  const declaredBlockers = async parsed => {
    const resolved = [];
    for (const reference of parsed.references) resolved.push(await resolveReference(reference));
    const nodeIds = resolved.map(row => row.nodeId);
    if (new Set(nodeIds).size !== nodeIds.length) throw conflict("Blocked by references must resolve to unique Issues");
    return { nodeIds: [...nodeIds].sort(), numbers: [...new Set(resolved.map(row => row.number))].sort((left, right) => left - right) };
  };

  // Native relation reads address Issues by their repository number; identities stay immutable node IDs.
  // An absent native parent is the one attributable read rejection this seam tolerates; an unverified
  // read result stays an error so it is never mistaken for an absent relation.
  const nativeParentRow = childNumber => api(`repos/${repositoryName}/issues/${childNumber}/parent`).then(
    rows => rows[0] ?? null, error => {
      if (error.code === "GITHUB_PRODUCER_TRANSPORT" && error.outcome === "REJECTED" && error.httpStatus === 404) return null;
      throw error;
    });
  const nativeParent = async childNumber => {
    const row = await nativeParentRow(childNumber);
    if (!row) return null;
    return validateIssue(row);
  };
    const nativeBlockerRows = async childNumber => (await list(`repos/${repositoryName}/issues/${childNumber}/dependencies/blocked_by`))
    .map(validateIssue);
    const nativeBlockersFor = async childNumber => (await nativeBlockerRows(childNumber)).map(row => row.node_id).sort();
    const nativeBlockingFor = async childNumber => (await list(`repos/${repositoryName}/issues/${childNumber}/dependencies/blocking`))
        .map(validateIssue).map(row => row.node_id).sort();
    const nativeChildrenFor = async childNumber => (await list(`repos/${repositoryName}/issues/${childNumber}/sub_issues`))
        .map(validateIssue).map(row => row.node_id).sort();

  const readChildContract = async (child, { planningSeal = upstream.publication.planningSeal, native = "evidence" } = {}) => {
    const expected = validateChild(child, planningSeal);
    const current = await snapshot(child.trackerIdentity);
    if (!bodyMatches(current.body, expected.body)) throw conflict("Child canonical body differs");
    const declared = await declaredBlockers(expected);
    const blockerRows = await nativeBlockerRows(current.nativeIssueNumber);
    const parentRow = await nativeParent(current.nativeIssueNumber);
    if (blockingRepresentation === "body" && blockerRows.length) {
      throw conflict("Body representation cannot retain native blocking relations");
    }
    if (blockingRepresentation === "native" && native === "evidence") {
      const observed = blockerRows.map(row => row.node_id).sort();
      if (!same(observed, declared.nodeIds)) {
        throw conflict("Declared-native blocker evidence differs from the canonical child body");
      }
      if (parentRow?.node_id !== parentIdentity) {
        throw conflict("Declared-native parent evidence differs from the canonical child body");
      }
    }
    if (blockingRepresentation === "native" && native === "parent" && parentRow?.node_id !== parentIdentity) {
      throw conflict("Declared-native parent evidence differs from the canonical child body");
    }
    const receipt = { key: expected.key, trackerIdentity: current.trackerIdentity,
      nativeIssueId: current.nativeIssueId, nativeIssueNumber: current.nativeIssueNumber,
      bodyDigest: bodyDigest(current.body), version: current.version, state: current.state,
      labels: current.labels, blockers: declared.nodeIds };
    return blockingRepresentation === "native"
      ? { ...receipt, nativeBlockers: blockerRows.map(row => row.node_id).sort(), parent: parentRow?.node_id ?? null }
      : receipt;
  };
  const readChild = child => readChildContract(child);

  const preflightIssues = preflight => [...Object.values(preflight.matches).flat(), ...preflight.externalBlockers];
  const validatePreflight = async (preflight, { keys, blockers = [] }) => {
    if (!preflight || typeof preflight !== "object" || Array.isArray(preflight)
      || preflight.blockingRepresentation !== blockingRepresentation
      || !preflight.matches || typeof preflight.matches !== "object" || Array.isArray(preflight.matches)
      || !Array.isArray(preflight.externalBlockers)) throw conflict("Exact GitHub Decomposition preflight is required");
    const observedKeys = Object.keys(preflight.matches).sort();
    if (!same(observedKeys, [...keys].sort())) throw conflict("Decomposition preflight key set differs");
    const externalLocators = preflight.externalBlockers.map(blocker => blocker?.trackerIdentity);
    const observed = await discoverChildren({ keys: observedKeys, externalBlockers: externalLocators });
    if (!same(observed, preflight)) throw conflict("GitHub Decomposition preflight changed before mutation");
    const readable = new Set(preflightIssues(preflight).map(row => row.trackerIdentity));
    for (const blocker of blockers) {
      if (!readable.has(blocker)) throw conflict("A declared child blocker is absent from the complete preflight");
    }
    return preflight;
  };
  const declaredBlockerIdentities = (parsed, preflight) => {
    const rows = preflightIssues(preflight);
    const byNumber = new Map();
    for (const row of rows) {
      if (byNumber.has(row.nativeIssueNumber)) throw conflict("Decomposition preflight contains duplicate Issue numbers");
      byNumber.set(row.nativeIssueNumber, row.trackerIdentity);
    }
    const identities = parsed.references.map(reference => {
      if (reference.kind === "node") {
        if (!rows.some(row => row.trackerIdentity === reference.nodeId)) {
          throw conflict("A declared child blocker is absent from the complete preflight");
        }
        return reference.nodeId;
      }
      const identity = byNumber.get(reference.number);
      if (!identity) throw conflict("A declared child blocker is absent from the complete preflight");
      return identity;
    });
    if (new Set(identities).size !== identities.length) throw conflict("Declared child blockers must be unique");
    return [...identities].sort();
  };

  const findChildren = async key => {
    requireText(key, "Decomposition key");
    const marker = `\`${key}\``;
    const rows = await list(`repos/${repositoryName}/issues?state=all&per_page=100`);
    const matches = [];
    for (const row of rows) {
      if (row.pull_request) continue;
      const issue = validateIssue(row);
      if (!(issue.body ?? "").includes(marker)) continue;
      const current = await snapshot(issue.number);
      let observedKey;
      try { observedKey = decompositionKey(current.body); } catch { continue; }
      if (observedKey !== key) continue;
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
    const externalIdentities = [...new Set(externalBlockers.map(locator => String(locator)))].sort();
    if (externalIdentities.length !== externalBlockers.length) throw conflict("External blocker locators must be unique");
    const matches = {};
    for (const key of [...keys].sort()) matches[key] = (await findChildren(key)).map(current => ({ trackerIdentity: current.trackerIdentity,
      nativeIssueId: current.nativeIssueId, nativeIssueNumber: current.nativeIssueNumber, version: current.version, state: current.state }));
    const external = [];
    for (const locator of externalIdentities) {
      const current = await snapshot(locator);
      external.push({ trackerIdentity: current.trackerIdentity, nativeIssueId: current.nativeIssueId,
        nativeIssueNumber: current.nativeIssueNumber, version: current.version, state: current.state });
    }
    const childIdentities = new Set(Object.values(matches).flat().map(match => match.trackerIdentity));
    if (external.some(blocker => childIdentities.has(blocker.trackerIdentity))) {
      throw conflict("One Issue cannot be both an owned child and an External blocker");
    }
    return { blockingRepresentation, matches, externalBlockers: external };
  };

  const childDescriptor = (input, expected) => ({ key: `${input.operationId}:child:${expected.key}`,
    payload: { key: expected.key, title: expected.title, body: expected.body, parent: parentIdentity } });
  const parentRelationDescriptor = (input, childIdentity) => ({ key: `${input.operationId}:relation:parent:${childIdentity}`,
    payload: { kind: "parent", child: childIdentity, parent: parentIdentity } });
  const publishNativeParent = (input, childIdentity, retryRejected) => mutateOnce(connection, {
    ...parentRelationDescriptor(input, childIdentity), retryRejected,
    observe: async () => {
      const child = await snapshot(childIdentity);
      const observed = await nativeParent(child.nativeIssueNumber);
      if (observed && observed.node_id !== parentIdentity) {
        throw conflict("Existing native parent relation points elsewhere");
      }
      return observed ? { identity: `github-sub-issue:${childIdentity}:${parentIdentity}`, kind: "parent",
        child: childIdentity, parent: parentIdentity } : null;
    },
    write: async () => {
      assertDecompositionOpen(input);
      const child = await snapshot(childIdentity);
      if ((await nativeParent(child.nativeIssueNumber)) !== null) throw conflict("Child already has a native parent relation");
      await api(`repos/${repositoryName}/issues/${parentNumber}/sub_issues`, "POST", { sub_issue_id: child.nativeIssueId });
    },
  });
  const publishChild = async ({ identity: input, child, preflight, retryRejected = false }) => withProducerLock(connection, parentIdentity, async () => {
    assertDecompositionOpen(input);
    const expected = validateChild(child);
    const keys = Object.keys(preflight?.matches ?? {});
    if (!keys.includes(expected.key)) throw conflict("Child key is absent from the complete Decomposition preflight");
    const blockers = declaredBlockerIdentities(expected, preflight);
    await validatePreflight(preflight, { keys, blockers });
    const descriptor = childDescriptor(input, expected);
    const receipt = await mutateOnce(connection, { ...descriptor, retryRejected,
      observe: async () => {
        const matches = await findChildren(expected.key);
        if (matches.length > 1) throw conflict("Duplicate Issues claim one Decomposition key");
        if (!matches[0]) return null;
        return readChildContract({ ...expected, trackerIdentity: matches[0].trackerIdentity }, { native: "none" });
      },
      write: async () => {
        assertDecompositionOpen(input);
        await validatePreflight(preflight, { keys, blockers });
        await api(`repos/${repositoryName}/issues`, "POST", { title: expected.title, body: expected.body });
      },
    });
    if (blockingRepresentation !== "native") return receipt;
    await publishNativeParent(input, receipt.trackerIdentity, retryRejected);
    return readChildContract({ ...expected, trackerIdentity: receipt.trackerIdentity }, { native: "parent" });
  });
  const childUpdateDescriptor = (input, expected, previous) => ({
    key: `${input.operationId}:child-update:${expected.key}`,
    payload: { key: expected.key, trackerIdentity: previous.trackerIdentity,
      previousVersion: previous.version, previousBodyDigest: bodyDigest(previous.body),
      replacementBodyDigest: expected.bodyDigest,
      ...(previous.decompositionIdentity
        ? { decompositionIdentity: previous.decompositionIdentity }
        : { partialOperationId: previous.partialCheckpointIdentity.operationId,
          partialTransactionId: previous.partialTransactionId }),
    },
  });
  const updateChild = async ({ identity: input, child, previous, preflight,
    retryRejected = false }) => withProducerLock(connection, parentIdentity, async () => {
    assertDecompositionOpen(input);
    const expected = validateChild(child);
    previous = validatePreviousRevisionInput(previous);
    const keys = Object.keys(preflight?.matches ?? {});
    if (!keys.includes(expected.key)) throw conflict("Child key is absent from the complete Decomposition preflight");
    const blockers = declaredBlockerIdentities(expected, preflight);
    await validatePreflight(preflight, { keys, blockers });
    const matches = preflight.matches[expected.key];
    if (matches.length !== 1 || matches[0].trackerIdentity !== previous.trackerIdentity) {
      throw conflict("Approved child revision requires one exact existing Issue");
    }
    const descriptor = childUpdateDescriptor(input, expected, previous);
    return mutateOnce(connection, { ...descriptor, retryRejected,
      observe: async () => {
        const current = await snapshot(previous.trackerIdentity);
        if (bodyMatches(current.body, expected.body)) {
          return previous.decompositionIdentity
            ? readChild({ ...expected, trackerIdentity: current.trackerIdentity })
            : readChildContract({ ...expected, trackerIdentity: current.trackerIdentity }, { native: "none" });
        }
        await validateRevisionEvidence({ input, previous, expected, current, preflight });
        return null;
      },
      write: async () => {
        assertDecompositionOpen(input);
        await validatePreflight(preflight, { keys, blockers });
        const current = await snapshot(previous.trackerIdentity);
        await validateRevisionEvidence({ input, previous, expected, current, preflight });
        await api(`repos/${repositoryName}/issues/${current.nativeIssueNumber}`, "PATCH", { body: expected.body });
      },
    });
  });

  const relationDescriptor = relation => {
    if (!relation || typeof relation !== "object" || Array.isArray(relation)) throw conflict("One relation is required");
    if (relation.kind === "parent") {
      requireText(relation.child, "relation child identity");
      if (!nodeIdPattern.test(relation.child)) throw conflict("Relation child must be one immutable Issue identity");
      return { kind: "parent", child: relation.child, other: parentIdentity,
        key: `parent:${relation.child}`, payload: { kind: "parent", child: relation.child, parent: parentIdentity } };
    }
    if (relation.kind !== "blocker") throw conflict("Relation kind must be parent or blocker");
    if (blockingRepresentation !== "native") {
      throw conflict("Body blocker representation never publishes a native blocking relation");
    }
    requireText(relation.child, "blocking relation child identity");
    requireText(relation.blocker, "blocking relation blocker identity");
    requireText(relation.childKey, "blocking relation Decomposition key");
    if (!nodeIdPattern.test(relation.child) || !nodeIdPattern.test(relation.blocker)) {
      throw conflict("Relation endpoints must be immutable Issue identities");
    }
    if (relation.child === relation.blocker) throw conflict("Relation endpoints must differ");
    return { kind: "blocker", child: relation.child, other: relation.blocker, childKey: relation.childKey,
      key: `blocker:${relation.child}:${relation.blocker}`,
      payload: { kind: "blocker", child: relation.child, blocker: relation.blocker, childKey: relation.childKey } };
  };
  const relationMutationDescriptor = (operationId, descriptor) => ({
    key: `${operationId}:relation:${descriptor.key}`, payload: descriptor.payload,
  });
  const relationIdentity = descriptor => descriptor.kind === "parent"
    ? `github-sub-issue:${descriptor.child}:${parentIdentity}`
    : `github-blocked-by:${descriptor.child}:${descriptor.other}`;
  const observeRelation = async descriptor => {
    const current = await snapshot(descriptor.child);
    if (descriptor.kind === "parent") {
      const observed = await nativeParent(current.nativeIssueNumber);
      if (observed && observed.node_id !== parentIdentity) throw conflict("Existing native parent relation points elsewhere");
      return { relation: observed ? { identity: relationIdentity(descriptor), kind: "parent",
        child: descriptor.child, parent: parentIdentity } : null,
        readBack: { state: observed ? "PRESENT" : "ABSENT", childVersion: current.version,
          childDigest: bodyDigest(current.body), relationIdentity: observed ? relationIdentity(descriptor) : null } };
    }
    if (decompositionKey(current.body) !== descriptor.childKey) throw conflict("Blocking relation child key differs");
    const declared = await declaredBlockers(validateChild({
      key: descriptor.childKey, title: "declared", body: current.body }));
    if (!declared.nodeIds.includes(descriptor.other)) throw conflict("Native blocking relation differs from the canonical child body");
    const rows = await nativeBlockerRows(current.nativeIssueNumber);
    const matching = rows.filter(row => row.node_id === descriptor.other);
    if (matching.length > 1) throw conflict("Multiple native dependencies claim the same relation");
    return { relation: matching[0] ? { identity: relationIdentity(descriptor), kind: "blocker",
      child: descriptor.child, blocker: descriptor.other } : null,
      readBack: { state: matching[0] ? "PRESENT" : "ABSENT", childVersion: current.version,
        childDigest: bodyDigest(current.body), relationIdentity: matching[0] ? relationIdentity(descriptor) : null } };
  };
  const readExpectedRelation = async descriptor => (await observeRelation(descriptor)).relation;

  const partialRoot = join(gitCommonDir, "matt-workflow-control", "github-to-tickets-partials");
  const partialPath = (operationId, descriptor) => join(partialRoot, `${digest(`${operationId}:${descriptor.key}`).slice(7)}.json`);
  const recordPartial = (operationId, descriptor, mutation, readBack) => {
    const path = partialPath(operationId, descriptor);
    const value = { schema: partialSchema, repositoryId, operationId, representation: "native",
      relation: descriptor.payload, outcome: mutation.state === "REJECTED" ? "REJECTED" : "UNRESOLVED",
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
    return readdirSync(partialRoot).filter(name => name.endsWith(".json"))
      .map(name => JSON.parse(readFileSync(join(partialRoot, name), "utf8")))
      .filter(value => value.operationId === operationId).map(value => {
        if (value.schema !== partialSchema || value.repositoryId !== repositoryId
          || value.representation !== "native" || !["REJECTED", "UNRESOLVED"].includes(value.outcome)
          || !value.relation || !["parent", "blocker"].includes(value.relation.kind)
          || typeof value.relation.child !== "string" || !value.relation.child
          || value.relation.kind === "blocker" && (typeof value.relation.blocker !== "string"
            || typeof value.relation.childKey !== "string" || !value.relation.childKey)
          || typeof value.mutation?.key !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value.mutation.fingerprint ?? "")
          || !Number.isSafeInteger(value.mutation.attempt) || value.mutation.attempt < 0
          || !["REJECTED", "ACKNOWLEDGED", "UNRESOLVED"].includes(value.mutation.state)
          || !["ABSENT", "PRESENT", "UNKNOWN"].includes(value.readBack?.state)
          || value.readBack.state !== "UNKNOWN" && (!/^sha256:[a-f0-9]{64}$/u.test(value.readBack.childVersion ?? "")
            || !/^sha256:[a-f0-9]{64}$/u.test(value.readBack.childDigest ?? "")
            || !(value.readBack.relationIdentity === null || typeof value.readBack.relationIdentity === "string"))
          || value.readBack.state === "UNKNOWN" && typeof value.readBack.errorCode !== "string") {
          throw conflict("Partial native relation evidence is malformed");
        }
        // Retained relation evidence is reconstructed from its own payload so the body adoption path can
        // read it without the currently selected representation's publisher guard.
        const descriptor = value.relation.kind === "parent"
          ? { kind: "parent", child: value.relation.child, other: parentIdentity,
            key: `parent:${value.relation.child}`, payload: value.relation }
          : { kind: "blocker", child: value.relation.child, other: value.relation.blocker,
            childKey: value.relation.childKey, key: `blocker:${value.relation.child}:${value.relation.blocker}`,
            payload: value.relation };
        const expectedKey = `${operationId}:relation:${descriptor.key}`;
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
    const intentRoot = join(gitCommonDir, "matt-workflow-control", "github-producer-intents");
    const hasIntent = existsSync(intentRoot) && readdirSync(intentRoot).filter(name => name.endsWith(".json")).some(name => {
      const intent = JSON.parse(readFileSync(join(intentRoot, name), "utf8"));
      if (intent.schema !== "github-producer-intent:v1" || typeof intent.key !== "string") {
        throw conflict("GitHub mutation intent evidence is malformed");
      }
      return intent.key.startsWith(`${operationId}:`);
    });
    const hasPartial = existsSync(partialRoot) && readdirSync(partialRoot).filter(name => name.endsWith(".json")).some(name => {
      const partial = JSON.parse(readFileSync(join(partialRoot, name), "utf8"));
      if (partial.schema !== partialSchema || typeof partial.operationId !== "string") {
        throw conflict("GitHub partial relation evidence is malformed");
      }
      return partial.operationId === operationId;
    });
    return hasIntent || hasPartial;
  };

  const publishRelation = async ({ identity: input, relation, preflight, retryRejected = false }) => withProducerLock(connection, parentIdentity, async () => {
    const descriptor = relationDescriptor(relation);
    const transaction = getTransaction(input);
    if (descriptor.kind === "blocker" && transaction.nextStage !== "decomposition.read_back") {
      throw conflict("Blocking relations require the first unsatisfied decomposition.read_back stage");
    }
    if (descriptor.kind === "parent") {
      await validatePreflight(preflight, { keys: Object.keys(preflight?.matches ?? {}) });
    } else {
      const keys = Object.keys(preflight?.matches ?? {});
      await validatePreflight(preflight, { keys, blockers: [descriptor.other] });
      if (!Object.values(preflight.matches).flat().some(match => match.trackerIdentity === descriptor.child)) {
        throw conflict("Blocking relation child is absent from the owned-child preflight");
      }
      if (!preflightIssues(preflight).some(row => row.trackerIdentity === descriptor.other)) {
        throw conflict("Blocking relation blocker is absent from the complete preflight");
      }
    }
    const mutationDescriptor = relationMutationDescriptor(input.operationId, descriptor);
    try {
      return await mutateOnce(connection, { ...mutationDescriptor, retryRejected,
        observe: () => readExpectedRelation(descriptor),
        write: async () => {
          assertDecompositionOpen(input);
          const current = await snapshot(descriptor.child);
          if (descriptor.kind === "parent") {
            if ((await nativeParent(current.nativeIssueNumber)) !== null) throw conflict("Child already has a native parent relation");
            await api(`repos/${repositoryName}/issues/${parentNumber}/sub_issues`, "POST", { sub_issue_id: current.nativeIssueId });
            return;
          }
          const blocker = await snapshot(descriptor.other);
          await api(`repos/${repositoryName}/issues/${current.nativeIssueNumber}/dependencies/blocked_by`, "POST",
            { issue_id: blocker.nativeIssueId });
        },
      });
    } catch (error) {
      const mutation = readMutation(connection, mutationDescriptor);
      if (mutation.state !== "UNATTEMPTED") {
        let readBack;
        try { readBack = (await observeRelation(descriptor)).readBack; }
        catch (readError) { readBack = { state: "UNKNOWN", errorCode: readError.code ?? "GITHUB_TO_TICKETS_READBACK_FAILED" }; }
        recordPartial(input.operationId, descriptor, mutation, readBack);
      }
      throw error;
    }
  });
  const readRelation = ({ relation }) => readExpectedRelation(relationDescriptor(relation));

  const normalizeMapping = mapping => Object.fromEntries(Object.entries(mapping).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      requireText(key, "Decomposition key");
      if (!nodeIdPattern.test(value ?? "")) throw conflict("Decomposition mapping values must be immutable Issue identities");
      return [key, value];
    }));
  const readPriorDecomposition = async decompositionIdentity => {
    const entries = await commentEntries(parentNumber);
    const decomposition = oneEntry(entries, entry => entry.identity === decompositionIdentity, "the previous Decomposition");
    if (!decomposition || decomposition.record.kind !== "decomposition:v1") throw conflict("Previous Decomposition is missing");
    const record = decomposition.record;
    if (record.repositoryId !== repositoryId || record.parent !== parentIdentity || record.target !== target
      || typeof record.operationKey !== "string" || !record.operationKey
      || typeof record.upstreamPublicationIdentity !== "string" || typeof record.upstreamHandoffIdentity !== "string") {
      throw conflict("Previous Decomposition authority differs");
    }
    const publication = oneEntry(entries, entry => entry.identity === record.upstreamPublicationIdentity, "the previous publication");
    const upstreamHandoff = oneEntry(entries, entry => entry.identity === record.upstreamHandoffIdentity, "the previous upstream handoff");
    if (!publication || !upstreamHandoff || publication.record.kind !== "spec_publication"
      || upstreamHandoff.record.kind !== "producer_handoff") throw conflict("Previous Spec publication is missing");
    if (publication.record.authority?.specId !== parentIdentity
      || publication.record.authority?.target !== target
      || publication.record.authority?.classification !== "MULTI"
      || publication.record.authority?.planningSeal !== record.planningSeal
      || publication.record.authority?.approvedScopeHash !== record.approvedScopeHash
      || upstreamHandoff.record.publicationIdentity !== publication.identity
      || upstreamHandoff.record.publicationDigest !== publication.bodySha256
      || upstreamHandoff.record.transactionIdentity !== publication.record.transactionIdentity
      || upstreamHandoff.record.checkpointIdentity?.bindings?.approvedScopeIdentity !== record.approvedScopeIdentity) {
      throw conflict("Previous Spec publication and Decomposition differ");
    }
    const upstreamTransaction = checkpoints.readCheckpoint(upstreamHandoff.record.checkpointIdentity);
    if (!upstreamTransaction || upstreamTransaction.schema !== "workflow-checkpoint-transaction:v2"
      || upstreamTransaction.state !== "COMPLETED"
      || upstreamTransaction.transactionId !== upstreamHandoff.record.transactionIdentity
      || upstreamTransaction.progress[1]?.receipt?.publicationIdentity !== publication.identity
      || upstreamTransaction.progress[1]?.receipt?.publicationDigest !== publication.bodySha256
      || upstreamTransaction.progress[2]?.receipt?.handoffIdentity !== upstreamHandoff.identity
      || upstreamTransaction.progress[2]?.receipt?.handoffDigest !== upstreamHandoff.bodySha256) {
      throw conflict("Previous Spec producer transaction is incomplete or differs");
    }
    const handoff = await findRecord("producer_handoff", record.operationKey);
    if (!handoff || handoff.record.decompositionIdentity !== decomposition.identity
      || handoff.record.transactionIdentity !== record.transactionIdentity
      || !same(handoff.record.checkpointIdentity, record.checkpointIdentity)
      || handoff.record.upstreamPublicationIdentity !== publication.identity
      || !same(handoff.record.recordIdentities, [publication.identity, decomposition.identity])) {
      throw conflict("Previous Decomposition handoff is missing or differs");
    }
    const transaction = checkpoints.readCheckpoint(record.checkpointIdentity);
    if (!transaction || transaction.schema !== "workflow-checkpoint-transaction:v2"
      || transaction.state !== "COMPLETED" || transaction.transactionId !== record.transactionIdentity
      || transaction.progress[0]?.receipt?.decompositionIdentity !== decomposition.identity
      || transaction.progress[0]?.receipt?.decompositionDigest !== decomposition.bodySha256
      || transaction.progress[2]?.receipt?.handoffIdentity !== handoff.identity
      || transaction.progress[2]?.receipt?.handoffDigest !== handoff.digest) {
      throw conflict("Previous Decomposition transaction is incomplete or differs");
    }
    const mapping = normalizeMapping(record.decompositionMapping);
    return { decomposition, publication, upstreamHandoff, handoff, mapping,
      edges: validateGraph(mapping, record.blockerEdges) };
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
  const assertNoRunOwnership = prior => {
    const authorityValues = new Set([prior.publication.identity, prior.decomposition.identity,
      prior.decomposition.record.approvedScopeHash, prior.decomposition.record.approvedScopeIdentity].filter(Boolean));
    for (const runId of runs.listRunIds()) {
      const events = runs.readEvents(runId);
      const grant = events.findLast(event => event.type === "grant.recorded");
      const run = grant?.runIdentity;
      if (!run || run.specId !== parentIdentity) continue;
      const sameAuthority = [run.approvedPublicationIdentity, run.approvedScopeHash, run.decompositionIdentity]
        .some(value => authorityValues.has(value));
      if (sameAuthority) throw conflict("Previous revision retains a Run Grant or child dispatch owner");
    }
  };
  const validateCompletionAdoption = async ({ adoption, key, child, edges }) => {
    const prior = await readPriorDecomposition(adoption.decompositionIdentity);
    if (adoption.publicationIdentity !== prior.publication.identity
      || prior.mapping[key] !== child || prior.decomposition.record.childBodyDigests?.[child] !== adoption.childBodyDigest) {
      throw conflict("Adopted child is outside its previous publication");
    }
    const current = await snapshot(child);
    if (current.state !== "closed" || bodyDigest(current.body) !== adoption.childBodyDigest) {
      throw conflict("Adoption requires one unchanged closed child");
    }
    const parsed = parseChild({ key, title: current.title || "ignored", body: current.body });
    if (parsed.planningSeal !== prior.decomposition.record.planningSeal) {
      throw conflict("Adopted child Planning baseline differs from its previous publication");
    }
    const oldBlockers = prior.edges.filter(edge => edge.blocked === child).map(edge => edge.blocker).sort();
    const newBlockers = edges.filter(edge => edge.blocked === child).map(edge => edge.blocker).sort();
    if (!same((await declaredBlockers(parsed)).nodeIds, oldBlockers) || !same(oldBlockers, newBlockers)) {
      throw conflict("Adopted child incoming blockers changed");
    }
    const lifecycle = (await commentEntries(current.nativeIssueNumber))
      .filter(item => ["implementation_complete", "implementation_blocked"].includes(item.record.kind));
    const completion = lifecycle.find(item => item.identity === adoption.completionIdentity
      && item.bodySha256 === adoption.completionBodySha256 && item.record.kind === "implementation_complete");
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
    assertNoRunOwnership(prior);
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
    const completedFields = ["body", "decompositionIdentity", "trackerIdentity", "version"].sort();
    const partialFields = ["body", "partialCheckpointIdentity", "partialTransactionId", "title", "trackerIdentity", "version"].sort();
    if (!previous || typeof previous !== "object" || Array.isArray(previous)) {
      throw conflict("Previous child revision evidence is malformed");
    }
    const fields = Object.keys(previous).sort();
    if ((!same(fields, completedFields) && !same(fields, partialFields))
      || ["body", "trackerIdentity", "version"].some(field => typeof previous[field] !== "string" || !previous[field])) {
      throw conflict("Previous child revision evidence is malformed");
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(previous.version)) {
      throw conflict("Previous child revision version is malformed");
    }
    if (!nodeIdPattern.test(previous.trackerIdentity)) {
      throw conflict("Previous child revision identity is malformed");
    }
    if (same(fields, completedFields) && (typeof previous.decompositionIdentity !== "string" || !previous.decompositionIdentity)) {
      throw conflict("Previous child revision Decomposition identity is malformed");
    }
    if (same(fields, partialFields) && (typeof previous.title !== "string" || !previous.title
      || typeof previous.partialTransactionId !== "string" || !sha256Pattern.test(previous.partialTransactionId)
      || !previous.partialCheckpointIdentity || typeof previous.partialCheckpointIdentity !== "object"
      || Array.isArray(previous.partialCheckpointIdentity))) {
      throw conflict("Previous partial child revision evidence is malformed");
    }
    return previous;
  };
  const validatePartialRevisionEvidence = async ({ input, previous, expected, current }) => {
    let identity;
    try { identity = bindProducerCheckpointOperationIdentity(previous.partialCheckpointIdentity); }
    catch { throw conflict("Previous partial child checkpoint identity is malformed"); }
    if (!same(identity, previous.partialCheckpointIdentity)
      || identity.operationId === input.operationId || identity.repositoryId !== repositoryId
      || identity.specId !== parentIdentity || identity.producerCommand !== "to-tickets"
      || identity.target !== target || identity.bindings?.classification !== "MULTI"
      || identity.bindings?.trackerIdentity !== parentIdentity
      || identity.bindings?.approvedScopeIdentity === upstream.publication.approvedScopeIdentity
      || !identity.bindings?.upstream?.publicationIdentity || !identity.bindings?.upstream?.handoffIdentity) {
      throw conflict("Previous partial child checkpoint is outside the superseded parent scope");
    }
    const transaction = checkpoints.readCheckpoint(identity);
    if (!transaction || transaction.schema !== "workflow-checkpoint-transaction:v2"
      || transaction.transactionId !== previous.partialTransactionId || transaction.state !== "INCOMPLETE"
      || transaction.nextStage !== "decomposition.read_back" || transaction.progress.length !== 0) {
      throw conflict("Previous partial child transaction is not an unstarted decomposition");
    }
    if (await findRecord("decomposition:v1", identity.operationId)
      || await findRecord("producer_handoff", identity.operationId)) {
      throw conflict("Previous partial child already has parent decomposition evidence");
    }
    const entries = await commentEntries(parentNumber);
    const publication = oneEntry(entries, entry => entry.identity === identity.bindings.upstream.publicationIdentity,
      "the previous partial Spec publication");
    const handoff = oneEntry(entries, entry => entry.identity === identity.bindings.upstream.handoffIdentity,
      "the previous partial Spec handoff");
    if (!publication || publication.record.kind !== "spec_publication" || !handoff || handoff.record.kind !== "producer_handoff"
      || publication.record.authority?.specId !== parentIdentity || publication.record.authority?.target !== target
      || publication.record.authority?.classification !== "MULTI"
      || publication.record.authority?.planningSeal !== identity.bindings.planningSeal
      || handoff.record.producerCommand !== "to-spec" || handoff.record.specId !== parentIdentity
      || handoff.record.target !== target || handoff.record.classification !== "MULTI"
      || handoff.record.planningSeal !== identity.bindings.planningSeal
      || handoff.record.publicationIdentity !== publication.identity || handoff.record.publicationDigest !== publication.bodySha256) {
      throw conflict("Previous partial child publication lineage differs");
    }
    let specIdentity;
    try { specIdentity = bindProducerCheckpointOperationIdentity(handoff.record.checkpointIdentity); }
    catch { throw conflict("Previous partial Spec checkpoint identity is malformed"); }
    const specTransaction = checkpoints.readCheckpoint(specIdentity);
    if (!same(specIdentity, handoff.record.checkpointIdentity) || specIdentity.repositoryId !== repositoryId
      || specIdentity.specId !== parentIdentity || specIdentity.producerCommand !== "to-spec" || specIdentity.target !== target
      || specIdentity.bindings?.classification !== "MULTI" || specIdentity.bindings?.trackerIdentity !== parentIdentity
      || specIdentity.bindings?.approvedScopeIdentity !== identity.bindings.approvedScopeIdentity
      || specIdentity.bindings?.planningSeal !== identity.bindings.planningSeal
      || specTransaction?.schema !== "workflow-checkpoint-transaction:v2" || specTransaction.state !== "COMPLETED"
      || specTransaction.transactionId !== publication.record.transactionIdentity
      || handoff.record.transactionIdentity !== specTransaction.transactionId
      || publication.record.operationKey !== specIdentity.operationId || handoff.record.operationKey !== specIdentity.operationId
      || specTransaction.progress[0]?.receipt?.planningSeal !== identity.bindings.planningSeal
      || specTransaction.progress[1]?.receipt?.publicationIdentity !== publication.identity
      || specTransaction.progress[1]?.receipt?.publicationDigest !== publication.bodySha256
      || specTransaction.progress[2]?.receipt?.handoffIdentity !== handoff.identity
      || specTransaction.progress[2]?.receipt?.handoffDigest !== handoff.bodySha256) {
      throw conflict("Previous partial Spec transaction is incomplete or differs");
    }
    if (previous.trackerIdentity !== current.trackerIdentity || previous.version !== current.version
      || previous.body !== current.body || previous.title !== current.title || current.state !== "open"
      || current.labels.length !== 0 || (await nativeParent(current.nativeIssueNumber)) !== null
      || (await nativeBlockersFor(current.nativeIssueNumber)).length !== 0
      || (await nativeBlockingFor(current.nativeIssueNumber)).length !== 0
      || (await nativeChildrenFor(current.nativeIssueNumber)).length !== 0) {
      throw conflict("Previous partial child body, version, lifecycle, or relationship state changed");
    }
    const parsed = parseChild({ key: expected.key, title: previous.title, body: previous.body });
    if (parsed.planningSeal !== identity.bindings.planningSeal) {
      throw conflict("Previous partial child Planning baseline differs from its transaction");
    }
    const mutation = readMutation(connection, childDescriptor(identity, { key: expected.key, title: previous.title,
      body: previous.body }));
    if (mutation.state !== "ACKNOWLEDGED") {
      throw conflict("Previous partial child creation mutation is missing or unresolved");
    }
    const lifecycle = (await commentEntries(current.nativeIssueNumber)).filter(item => item.record.kind.startsWith("implementation_"));
    if (lifecycle.length !== 0) throw conflict("Previous partial child has execution lifecycle evidence");
    for (const runId of runs.listRunIds()) {
      const events = runs.readEvents(runId);
      const grant = events.findLast(event => event.type === "grant.recorded")?.runIdentity;
      if (grant?.specId === parentIdentity) {
        throw conflict("Previous partial child retains a Run Grant or dispatch owner");
      }
    }
    return identity;
  };
  const validateRevisionEvidence = async ({ input, previous, expected, current, preflight }) => {
    validatePreviousRevisionInput(previous);
    if (!previous.decompositionIdentity) {
      return validatePartialRevisionEvidence({ input, previous, expected, current });
    }
    if (previous.trackerIdentity !== current.trackerIdentity
      || previous.version !== current.version || previous.body !== current.body || current.state !== "open") {
      throw conflict("Previous child body, version, identity, or open state changed");
    }
    const prior = await readPriorDecomposition(previous.decompositionIdentity);
    if (prior.mapping[expected.key] !== current.trackerIdentity
      || prior.decomposition.record.childBodyDigests?.[current.trackerIdentity] !== bodyDigest(previous.body)) {
      throw conflict("Previous child is outside its completed Decomposition");
    }
    const parsed = parseChild({ key: expected.key, title: current.title || "ignored", body: previous.body });
    if (parsed.planningSeal !== prior.decomposition.record.planningSeal) {
      throw conflict("Previous child Planning baseline differs from its Decomposition");
    }
    const oldBlockers = prior.edges.filter(edge => edge.blocked === current.trackerIdentity).map(edge => edge.blocker).sort();
    if (!same((await declaredBlockers(parsed)).nodeIds, oldBlockers)) {
      throw conflict("Previous child blockers differ from its Decomposition");
    }
    if (blockingRepresentation === "native"
      && !same(declaredBlockerIdentities(expected, preflight), declaredBlockerIdentities(parsed, preflight))) {
      throw conflict("Declared-native child revision cannot rewrite blocker relationships");
    }
    const lifecycle = (await commentEntries(current.nativeIssueNumber))
      .filter(item => item.record.kind.startsWith("implementation_"));
    for (const item of lifecycle) {
      const record = item.record;
      if (record.kind !== "implementation_blocked" || record.reasonCode !== "scope_revision_required"
        || ["worktree", "topic", "candidate", "taskRef"].some(field => record[field] != null)) {
        throw conflict("Previous child has active or unknown execution-lane evidence");
      }
    }
    assertNoActiveRevisionLane(current.trackerIdentity, prior);
    return prior;
  };

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
      if (!nodeIdPattern.test(adoption.issueId)
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
  const decompositionReceipt = found => ({ decompositionIdentity: found.identity, decompositionDigest: found.digest });
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
    return result ? decompositionReceipt(result.found) : null;
  };
  const decomposeChildren = async ({ mapping, edges, preflight, adoptions, expected }) => {
    const adoptionByIssue = new Map(adoptions.map(adoption => [adoption.issueId, adoption]));
    const childBodyDigests = {};
    const states = new Map();
    for (const [key, childIdentity] of Object.entries(mapping)) {
      const child = expected.get(key);
      const blockers = edges.filter(edge => edge.blocked === childIdentity).map(edge => edge.blocker).sort();
      if (!same(declaredBlockerIdentities(child, preflight), blockers)) {
        throw conflict("Canonical child body and Decomposition blocker edges differ");
      }
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
        readBack = await readChildContract({ ...child, trackerIdentity: childIdentity },
          { planningSeal: adopted.prior.decomposition.record.planningSeal });
      } else {
        if (child.planningSeal !== upstream.publication.planningSeal) {
          throw conflict("Child body Planning baseline differs");
        }
        readBack = await readChild({ ...child, trackerIdentity: childIdentity });
      }
      childBodyDigests[childIdentity] = readBack.bodyDigest;
      states.set(childIdentity, current);
    }
    for (const edge of edges) {
      if (!states.has(edge.blocker)) states.set(edge.blocker, await snapshot(edge.blocker));
    }
    const readyFrontier = [...Object.values(mapping)].sort()
      .filter(identity => states.get(identity).state === "open"
        && edges.filter(edge => edge.blocked === identity)
          .every(edge => states.get(edge.blocker).state === "closed"));
    return { childBodyDigests, readyFrontier };
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
          || !edges.some(edge => edge.blocked === relation.child && edge.blocker === relation.blocker)
          || mapping[relation.childKey] !== relation.child) {
          throw conflict("Partial native relation evidence differs from verified body-mode adoption");
        }
      }
    }
    const { childBodyDigests, readyFrontier } = await decomposeChildren({ mapping, edges, preflight, adoptions, expected });
    return { schema, kind: "decomposition:v1", repositoryId, operationKey: input.operationId,
      checkpointIdentity: input, transactionIdentity: transaction.transactionId, parent: parentIdentity, target,
      planningSeal: upstream.publication.planningSeal, approvedScopeHash: upstream.publication.approvedScopeHash,
      approvedScopeIdentity: upstream.publication.approvedScopeIdentity,
      upstreamPublicationIdentity: upstream.publication.publicationIdentity,
      upstreamHandoffIdentity: upstream.handoff.handoffIdentity, blockingRepresentation,
      decompositionMapping: mapping, blockerEdges: edges, childBodyDigests, readyFrontier,
      ...(adoptions.length ? { adoptedCompletions: adoptions } : {}) };
  };
  const validatePublishedGraph = async record => {
    if (record.repositoryId !== repositoryId || record.parent !== parentIdentity || record.target !== target
      || record.planningSeal !== upstream.publication.planningSeal
      || record.approvedScopeHash !== upstream.publication.approvedScopeHash
      || record.blockingRepresentation !== blockingRepresentation) {
      throw conflict("Decomposition record authority or blocker representation differs");
    }
    const mapping = normalizeMapping(record.decompositionMapping);
    if (!same(mapping, record.decompositionMapping)) throw conflict("Decomposition mapping is not canonical");
    const edges = validateGraph(mapping, record.blockerEdges);
    if (!same(edges, record.blockerEdges)) throw conflict("Blocker edges are not canonical");
    if (!Array.isArray(record.readyFrontier) || !same(record.readyFrontier, [...record.readyFrontier].sort())
      || !record.readyFrontier.every(identity => Object.values(mapping).includes(identity))) {
      throw conflict("Published ready frontier is malformed");
    }
    const adoptions = normalizeAdoptions(record.adoptedCompletions, mapping);
    const adoptionByIssue = new Map(adoptions.map(adoption => [adoption.issueId, adoption]));
    const childBodyDigests = {};
    for (const [key, child] of Object.entries(mapping)) {
      const current = await snapshot(child);
      if (decompositionKey(current.body) !== key) throw conflict("Published child canonical contract differs");
      const adoption = adoptionByIssue.get(child);
      const parsed = parseChild({ key, title: current.title || "ignored", body: current.body });
      if (adoption) await validateCompletionAdoption({ adoption, key, child, edges });
      else if (parsed.planningSeal !== upstream.publication.planningSeal) {
        throw conflict("Published child Planning baseline differs");
      }
      const expectedBlockers = edges.filter(edge => edge.blocked === child).map(edge => edge.blocker).sort();
      if (!same(await declaredBlockers(parsed).then(declared => declared.nodeIds), expectedBlockers)) {
        throw conflict("Published child body blocker edges differ");
      }
      if (record.childBodyDigests?.[child] !== bodyDigest(current.body)) throw conflict("Published child body digest differs");
      childBodyDigests[child] = bodyDigest(current.body);
      const native = await nativeBlockersFor(current.nativeIssueNumber);
      if (blockingRepresentation === "native" && !same(native, expectedBlockers)) {
        throw conflict("Declared-native blocker evidence differs");
      }
      if (blockingRepresentation === "body" && native.length) {
        throw conflict("Body representation cannot retain native blocking relations");
      }
      if (blockingRepresentation === "native") {
        const observedParent = await nativeParent(current.nativeIssueNumber);
        if (observedParent?.node_id !== parentIdentity) throw conflict("Declared-native parent evidence differs");
      }
    }
    return { mapping, edges, childBodyDigests, adoptions };
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
      const expectedReady = current.state === "open" && blockers.every(blocker => snapshots.get(blocker)?.state === "closed");
      const ready = current.labels.includes(readyLabel);
      return { trackerIdentity, state: current.state, ready, expectedReady };
    });
    return { frontier: states.filter(state => state.expectedReady).map(state => state.trackerIdentity),
      states, consistent: states.every(state => state.ready === state.expectedReady) };
  };
  const readReadyState = input => observeReadyState(input);
  const readyMutation = ({ input, state, before }) => ({
    key: `${input.operationId}:ready:${state.trackerIdentity}:${state.expectedReady ? "add" : "remove"}`,
    payload: { trackerIdentity: state.trackerIdentity, readyLabel, expectedReady: state.expectedReady,
      beforeVersion: before.version, beforeLabels: before.labels },
  });
  const writeReadyState = async ({ identity: input, retryRejected = false }) => withProducerLock(connection, parentIdentity, async () => {
    const transaction = getTransaction(input);
    if (transaction.nextStage !== "ready_state.read_back") {
      throw conflict("Ready-state mutation requires the first unsatisfied ready_state.read_back stage");
    }
    const decomposition = await readDecompositionRecord(input);
    if (!decomposition || !same(transaction.progress[0]?.receipt, decompositionReceipt(decomposition.found))) {
      throw conflict("Decomposition checkpoint must precede ready-state mutation");
    }
    const labels = (await list(`repos/${repositoryName}/labels?per_page=100`)).map(label => label.name);
    if (!labels.includes(readyLabel)) throw conflict("Configured ready label does not exist; producer cannot create labels");
    const observed = await observeReadyState(input);
    for (const state of observed.states.filter(candidate => candidate.ready !== candidate.expectedReady)) {
      const before = await snapshot(state.trackerIdentity);
      const descriptor = readyMutation({ input, state, before });
      const expectedLabels = normalizeLabels(state.expectedReady
        ? [...before.labels, readyLabel] : before.labels.filter(label => label !== readyLabel));
      await mutateOnce(connection, { ...descriptor, retryRejected,
        observe: async attempted => {
          const current = await snapshot(state.trackerIdentity);
          if (current.labels.includes(readyLabel) === state.expectedReady) return current;
          if (attempted || current.version !== before.version || !same(current.labels, before.labels)) {
            throw conflict("Child ready state changed outside the owning mutation");
          }
          return null;
        },
        write: async () => {
          const current = await snapshot(state.trackerIdentity);
          if (current.version !== before.version || !same(current.labels, before.labels)) {
            throw conflict("Child ready state changed before update");
          }
          await api(`repos/${repositoryName}/issues/${current.nativeIssueNumber}`, "PATCH", { labels: expectedLabels });
        },
      });
    }
    const result = await observeReadyState(input);
    if (!result.consistent) throw conflict("Ready-state read-back differs from the published blocker graph");
    if (!same(result.frontier, decomposition.found.record.readyFrontier)) {
      throw conflict("Ready-state read-back differs from the published ready frontier");
    }
    return result;
  });

  const handoffRead = async ({ identity: input }) => {
    const transaction = getTransaction(input);
    const decomposition = await readDecompositionRecord(input);
    if (!decomposition || !same(transaction.progress[0]?.receipt, decompositionReceipt(decomposition.found))
      || !transaction.progress[1]?.receipt?.consistent) {
      throw conflict("Decomposition and ready-state checkpoints must precede handoff");
    }
    const found = await findRecord("producer_handoff", input.operationId);
    if (!found) return null;
    const record = found.record;
    if (record.producerCommand !== "to-tickets" || record.transactionIdentity !== transaction.transactionId
      || !same(record.checkpointIdentity, input)
      || record.specId !== parentIdentity || record.target !== target
      || record.planningSeal !== upstream.publication.planningSeal
      || record.classification !== "MULTI"
      || record.approvedScopeHash !== upstream.publication.approvedScopeHash
      || record.decompositionIdentity !== decomposition.found.identity
      || record.decompositionDigest !== decomposition.found.digest
      || record.trackerIdentity !== parentIdentity
      || record.publicationIdentity !== decomposition.found.identity
      || record.upstreamPublicationIdentity !== upstream.publication.publicationIdentity
      || record.upstreamHandoffIdentity !== upstream.handoff.handoffIdentity
      || !same(record.upstream, { publicationIdentity: upstream.publication.publicationIdentity,
        handoffIdentity: upstream.handoff.handoffIdentity })
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
    const ready = await readReadyState(input);
    if (!decomposition || !same(transaction.progress[0]?.receipt, decompositionReceipt(decomposition.found))
      || !ready.consistent || !same(transaction.progress[1]?.receipt, ready)) {
      throw conflict("Decomposition and ready-state checkpoints must precede handoff");
    }
    const record = { schema, kind: "producer_handoff", repositoryId, operationKey: input.operationId,
      specId: parentIdentity, target, planningSeal: upstream.publication.planningSeal, classification: "MULTI",
      approvedScopeHash: upstream.publication.approvedScopeHash, decompositionIdentity: decomposition.found.identity,
      producerCommand: "to-tickets", checkpointIdentity: input, transactionIdentity: transaction.transactionId,
      trackerIdentity: parentIdentity, publicationIdentity: decomposition.found.identity,
      upstreamPublicationIdentity: upstream.publication.publicationIdentity,
      upstreamHandoffIdentity: upstream.handoff.handoffIdentity,
      upstream: { publicationIdentity: upstream.publication.publicationIdentity,
        handoffIdentity: upstream.handoff.handoffIdentity },
      operationReceipt: { transactionIdentity: transaction.transactionId,
        decompositionReadBack: transaction.progress[0].receipt, readyStateReadBack: transaction.progress[1].receipt },
      decompositionDigest: decomposition.found.digest, decompositionMapping: decomposition.graph.mapping,
      blockerEdges: decomposition.graph.edges,
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

  return { repositoryId, repositoryName, publicationMode: "READ_WRITE_READBACK", blockingRepresentation,
    representationSelection: selection, capability,
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
        return readMutation(connection, childDescriptor(input, expected));
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
