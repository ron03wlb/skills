import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPlanningBaseline } from "../../../engineering/to-spec/scripts/planning-entry.mjs";
import { createWorkflowControlStore } from "./workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity, createProducerOperationCheckpoint, deriveSpecReservationOperationIdentity } from "./delivery-authority.mjs";
import { connectGitHubProducer, conflict, digest, gitRead, proveGhCapability, withProducerLock } from "./github-producer-transport.mjs";
import { mutateOnce, readMutation } from "./github-producer-mutations.mjs";
import { createGitPlanningSeal } from "./git-planning-seal.mjs";
import { bodyDigest, readWorkflowRecords, renderWorkflowRecord } from "./github-workflow-records.mjs";

const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const text = (value, label) => { if (typeof value !== "string" || !value.trim()) throw conflict(`${label} is required`); return value; };
const nodeIdPattern = /^I_[A-Za-z0-9_-]+$/u;

export async function createGitHubProducerAdapters(options) {
  const connection = await connectGitHubProducer(options);
  const { repository, repositoryName, repositoryId, api, list, node } = connection;
  const { target } = options;
  const publication = structuredClone(options.publication);
  text(target, "target");
  gitRead(repository, "check-ref-format", `refs/heads/${target}`);
  text(publication?.title, "publication title");
  text(publication?.body, "publication body");
  if (!["SINGLE", "MULTI"].includes(publication.classification)) throw conflict("Producer must supply SINGLE or MULTI classification");
  const readyLabel = publication.readyLabel ?? "ready-for-agent";
  if (!/^[^,\r\n]+$/u.test(readyLabel)) throw conflict("One exact ready label is required");
  const capability = options.capability ?? await proveGhCapability({ repository, repositoryName, execute: options.execute });
  if (capability?.state !== "PROVEN") throw conflict("An exact proven publish capability is required");
  const approvedScopeHash = bodyDigest(publication.body);
  const approvedScopeIdentity = digest(JSON.stringify({ title: publication.title, body: publication.body,
    classification: publication.classification, readyLabel }));
  const checkpoints = createWorkflowControlStore({ gitCommonDir: connection.gitCommonDir });
  let issueNodeId = null;
  let number = null;
  let reservationOperation = null;

  const locate = async locator => {
    const raw = String(locator);
    const urlMatch = raw.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/([1-9][0-9]*)$/u);
    if (urlMatch) {
      if (urlMatch[1] !== repositoryName) throw conflict("Issue locator is outside the configured repository or is malformed");
      return Number(urlMatch[2]);
    }
    if (/^[1-9][0-9]*$/u.test(raw) && Number.isSafeInteger(Number(raw))) return Number(raw);
    if (nodeIdPattern.test(raw)) { const found = await node(raw); issueNodeId = found.nodeId; return found.number; }
    throw conflict("Issue locator is outside the configured repository or is malformed");
  };
  const specId = () => { if (!issueNodeId) throw conflict("Read the selected Issue to bind its immutable node identity"); return issueNodeId; };
  const planningWriter = () => createGitPlanningSeal({ repository, repositoryId, specId: specId(), target, gitCommonDir: connection.gitCommonDir });
  const head = () => gitRead(repository, "rev-parse", "--verify", `refs/heads/${target}^{commit}`);
  const ancestry = new Set();
  const factObjects = new Map();
  const assertAncestor = (commit, targetHead = head()) => {
    if (!/^[a-f0-9]{40,64}$/u.test(commit ?? "")) throw conflict("Invalid Planning Seal or baseline SHA");
    const key = `${commit}:${targetHead}`;
    if (!ancestry.has(key)) { gitRead(repository, "merge-base", "--is-ancestor", commit, targetHead); ancestry.add(key); }
  };
  const labelNames = labels => labels.map(label => typeof label === "string" ? label : label?.name).filter(Boolean);
  const validateIssue = issue => {
    if (!nodeIdPattern.test(issue?.node_id ?? "") || !Number.isSafeInteger(issue.number) || issue.number < 1
      || issue.html_url !== `https://github.com/${repositoryName}/issues/${issue.number}` || Boolean(issue.pull_request)
      || !Array.isArray(issue.labels) || typeof issue.updated_at !== "string" || !["open", "closed"].includes(issue.state)) throw conflict("Native GitHub Issue identity is unreadable or differs");
    return issue;
  };
  const snapshot = async () => {
    if (!number) throw conflict("Reserve or select one Issue before this operation");
    const issue = validateIssue((await api(`repos/${repositoryName}/issues/${number}`))[0] ?? {});
    if (issue.number !== number) throw conflict("GitHub returned a different Issue");
    issueNodeId = issue.node_id;
    const labels = labelNames(issue.labels);
    const version = digest(JSON.stringify({ nodeId: issue.node_id, number, repositoryId, title: issue.title,
      body: issue.body ?? "", labels: [...labels].sort(), state: issue.state, updatedAt: issue.updated_at }));
    return { issue, trackerIdentity: issue.node_id, nativeIssueNumber: issue.number, version, body: issue.body ?? "", labels };
  };
  const read = async () => ({ ...await snapshot(), comments: await list(`repos/${repositoryName}/issues/${number}/comments?per_page=100`) });
  const normalizeLabels = labels => {
    if (!Array.isArray(labels) || labels.some(label => typeof label !== "string" || !label)) throw conflict("Exact expected labels are required");
    return [...new Set(labels)].sort();
  };
  const assertPublished = (current, labels) => {
    if (current.body !== publication.body || current.issue.title !== publication.title || !current.labels.includes(readyLabel)
      || !same(normalizeLabels(current.labels), normalizeLabels(labels))
      || current.issue.state !== "open") throw conflict("Published Issue body, title, labels or state differs");
  };
  const factsAtHead = (facts, targetHead = head()) => {
    const paths = Object.keys(facts);
    for (const path of paths) {
      if (!path || path.startsWith("/") || /[\\:\x00-\x1f]/u.test(path) || path.split("/").some(part => ["", ".", ".."].includes(part))) throw conflict("Relevant fact must be a normalized repository-relative file path");
    }
    const missing = paths.filter(path => !factObjects.has(`${targetHead}:${path}`));
    if (missing.length) {
      const rows = gitRead(repository, "ls-tree", "-r", "-z", targetHead, "--", ...missing).split("\0").filter(Boolean);
      const observed = new Map(rows.map(row => {
        const offset = row.indexOf("\t");
        const object = row.slice(0, offset).match(/^\d+ blob ([a-f0-9]{40,64})$/u)?.[1];
        return [row.slice(offset + 1), object];
      }));
      for (const path of missing) {
        if (!observed.get(path)) throw conflict(`Relevant fact is not a file: ${path}`);
        factObjects.set(`${targetHead}:${path}`, `git-blob:${observed.get(path)}`);
      }
    }
    return Object.fromEntries(paths.map(path => [path, factObjects.get(`${targetHead}:${path}`)]));
  };
  const baseline = async request => {
    if (!Array.isArray(request.acceptedChanges)) throw conflict("acceptedChanges must be explicit");
    assertAncestor(request.baseline);
    return readPlanningBaseline({ request: { ...request, repositoryId, specId: specId(), target, approvedScopeIdentity }, adapter: {
      readLane: lane => planningWriter().readLane(lane),
      async readCurrent() {
        const current = await snapshot();
        const currentHead = head();
        return { repositoryId, specId: current.trackerIdentity, target, head: currentHead, approvedScopeIdentity,
          trackerVersion: current.version, relevantFacts: factsAtHead(request.relevantFacts, currentHead) };
      },
    } });
  };
  const identity = ({ baseline: baselineSha, relevantFacts, sealOperationId }) => {
    if (!relevantFacts || typeof relevantFacts !== "object" || Array.isArray(relevantFacts)) throw conflict("Explicit relevantFacts are required");
    return bindProducerCheckpointOperationIdentity({ repositoryId, specId: specId(), producerCommand: "to-spec", profileVersion: "v2",
      target, baseline: baselineSha, bindings: { planningSeal: baselineSha, classification: publication.classification,
        approvedScopeIdentity, trackerIdentity: specId(), relevantFacts, ...(sealOperationId ? { sealOperationId } : {}) } });
  };
  const validateIdentity = input => {
    const expected = identity({ baseline: input?.baseline, relevantFacts: input?.bindings?.relevantFacts, sealOperationId: input?.bindings?.sealOperationId });
    if (!same(input, expected)) throw conflict("Checkpoint binding differs from the selected repository, Spec, target or publication");
    const currentHead = head();
    assertAncestor(input.baseline, currentHead);
    if (!same(factsAtHead(input.bindings.relevantFacts, currentHead), input.bindings.relevantFacts)) throw conflict("Relevant planning source changed; return to to-spec baseline revalidation");
    if (input.bindings.sealOperationId && planningWriter().read({ operationId: input.bindings.sealOperationId }).planningSeal !== input.baseline) throw conflict("Planning Seal receipt differs from checkpoint baseline");
    return input;
  };
  const sealRead = ({ identity: input }) => {
    validateIdentity(input);
    if (input.bindings.sealOperationId) return planningWriter().read({ operationId: input.bindings.sealOperationId });
    return { target, planningSeal: input.bindings.planningSeal, state: "reused" };
  };
  const sealWrite = async request => {
    const receipt = await planningWriter().write({ request, revalidate: () => baseline(request) });
    const factPaths = { ...request.relevantFacts, ...Object.fromEntries(request.acceptedChanges.map(change => [change.path, "sealed"])) };
    return { ...receipt, relevantFacts: factsAtHead(factPaths, receipt.planningSeal) };
  };
  const getTransaction = input => {
    validateIdentity(input);
    const tx = checkpoints.readCheckpoint(input);
    if (!tx || tx.schema !== "workflow-checkpoint-transaction:v2") throw conflict("An exact current producer transaction is required; preserve legacy operations for their owner");
    return tx;
  };
  const authority = input => ({ specId: specId(), target, planningSeal: input.bindings.planningSeal,
    classification: publication.classification, approvedScopeHash, decompositionIdentity: null });
  const findRecord = async (kind, operationKey) => {
    let entries;
    try { entries = readWorkflowRecords(await list(`repos/${repositoryName}/issues/${number}/comments?per_page=100`)); }
    catch (error) { throw conflict(error.message); }
    const candidates = [];
    for (const entry of entries) {
      if (entry.record.kind !== kind || entry.record.operationKey !== operationKey) continue;
      if (entry.record.repositoryId !== repositoryId) throw conflict("Producer record repository differs");
      candidates.push(entry);
    }
    if (candidates.length > 1) throw conflict("Multiple records claim the same producer operation");
    if (!candidates[0]) return null;
    const [found] = candidates;
    return { record: found.record, identity: found.identity, digest: found.bodySha256 };
  };
  const appendRecord = async (record, retryRejected = false) => mutateOnce(connection, {
    key: `${record.operationKey}:${record.kind}`, payload: record, retryRejected,
    observe: async () => {
      const found = await findRecord(record.kind, record.operationKey);
      if (found && !same(found.record, record)) throw conflict("Producer record content differs");
      return found;
    },
    write: async () => { await api(`repos/${repositoryName}/issues/${number}/comments`, "POST", { body: renderWorkflowRecord(record) }); },
  });
  const publicationRead = async input => {
    const tx = getTransaction(input);
    const found = await findRecord("spec_publication", input.operationId);
    if (!found) return null;
    if (!same(found.record.authority, authority(input)) || found.record.transactionIdentity !== tx.transactionId
      || found.record.trackerIdentity !== specId() || typeof found.record.version !== "string") throw conflict("Publication record bindings differ");
    assertPublished(await snapshot(), found.record.labels);
    return { publicationIdentity: found.identity, publicationDigest: found.digest, trackerIdentity: specId(), version: found.record.version,
      approvedScopeIdentity, target, planningSeal: input.bindings.planningSeal, classification: publication.classification };
  };
  const reserve = async ({ mode = "primary", proposedSpecIdentity, retryRejected = false }) => {
    if (mode === "revision") return read();
    if (mode !== "primary") throw conflict("Unknown reservation mode");
    const operation = deriveSpecReservationOperationIdentity({ repositoryId, proposedSpecIdentity });
    if (number) {
      if (reservationOperation === operation.key) return read();
      throw conflict("Primary reservation must not replace an existing Issue");
    }
    const marker = `<!-- github-spec-reservation:${operation.key} -->`;
    const body = `Reserved draft; publication and Run handoff are incomplete.\n\n${marker}`;
    return withProducerLock(connection, operation.key, async () => {
      const reservationRoot = join(connection.gitCommonDir, "matt-workflow-control", "github-producer-reservations");
      const reservationPath = join(reservationRoot, `${operation.key}.json`);
      if (existsSync(reservationPath)) {
        const saved = (() => { try { return JSON.parse(readFileSync(reservationPath, "utf8")); } catch { throw conflict("Reservation receipt is unreadable"); } })();
        if (saved.operationKey !== operation.key || saved.repositoryId !== repositoryId) throw conflict("Reservation receipt identity differs");
        number = saved.nativeIssueNumber;
        const current = await read();
        if (current.trackerIdentity !== saved.trackerIdentity) throw conflict("Reserved native Issue identity changed");
        reservationOperation = operation.key;
        return current;
      }
      const issue = await mutateOnce(connection, { key: operation.key, payload: { title: publication.title, body }, retryRejected,
        observe: async () => {
          const matches = (await list(`repos/${repositoryName}/issues?state=all&per_page=100`))
            .filter(item => !item.pull_request && item.body?.includes(marker)).map(validateIssue);
          if (matches.length > 1) throw conflict("Duplicate Spec reservations");
          if (matches[0] && (matches[0].body !== body || matches[0].title !== publication.title || matches[0].state !== "open")) throw conflict("Reservation was modified; select its exact Issue for the owning operation");
          return matches[0] ?? null;
        },
        write: async () => { await api(`repos/${repositoryName}/issues`, "POST", { title: publication.title, body }); },
      });
      number = issue.number;
      mkdirSync(reservationRoot, { recursive: true });
      writeFileSync(reservationPath, JSON.stringify({ operationKey: operation.key, repositoryId,
        trackerIdentity: issue.node_id, nativeIssueNumber: issue.number }), { flag: "wx", flush: true });
      reservationOperation = operation.key;
      return read();
    });
  };
  const publicationMutation = ({ identity: input, expectedVersion, expectedLabels }) => {
    getTransaction(input);
    text(expectedVersion, "expectedVersion");
    return { key: `${input.operationId}:issue-body`, payload: { body: publication.body, title: publication.title,
      labels: normalizeLabels([...normalizeLabels(expectedLabels), readyLabel]), expectedVersion, trackerIdentity: specId() } };
  };
  const publish = async ({ identity: input, expectedVersion, expectedLabels, retryRejected = false }) => withProducerLock(connection, specId(), async () => {
    const tx = getTransaction(input);
    if (!same(tx.progress[0]?.receipt, sealRead({ identity: input }))) throw conflict("Planning Seal read-back must precede publication");
    const existing = await publicationRead(input);
    if (existing) return existing;
    const names = (await list(`repos/${repositoryName}/labels?per_page=100`)).map(label => label.name);
    if (!names.includes(readyLabel)) throw conflict("Configured ready label does not exist; producer cannot create labels");
    text(expectedVersion, "expectedVersion");
    const beforeLabels = normalizeLabels(expectedLabels);
    const labels = normalizeLabels([...beforeLabels, readyLabel]);
    const result = await mutateOnce(connection, { ...publicationMutation({ identity: input, expectedVersion, expectedLabels }), retryRejected,
      observe: async attempted => {
        const current = await snapshot();
        if (attempted && current.body === publication.body && current.issue.title === publication.title && current.labels.includes(readyLabel)) {
          assertPublished(current, labels); return current;
        }
        if (current.version !== expectedVersion || current.issue.state !== "open") throw conflict("Issue version or state changed before publication");
        if (!same(normalizeLabels(current.labels), beforeLabels)) throw conflict("Expected labels differ from the selected Issue version");
        return null;
      },
      write: async () => {
        validateIdentity(input);
        // GitHub REST does not provide this adapter with atomic CAS. Check again immediately before PATCH.
        if ((await snapshot()).version !== expectedVersion) throw conflict("Issue version changed before PATCH");
        await api(`repos/${repositoryName}/issues/${number}`, "PATCH", { title: publication.title, body: publication.body, labels });
      },
    });
    const record = { kind: "spec_publication", repositoryId, operationKey: input.operationId, authority: authority(input),
      trackerIdentity: specId(), transactionIdentity: tx.transactionId, version: result.version, labels, capability,
      ...(publication.preparation ? { preparation: publication.preparation } : {}) };
    await appendRecord(record, retryRejected);
    return publicationRead(input);
  });
  const handoffRead = async ({ identity: input }) => {
    const tx = getTransaction(input);
    const pub = await publicationRead(input);
    if (!pub || !same(tx.progress[1]?.receipt, pub)) throw conflict("Exact publication read-back must precede handoff");
    const found = await findRecord("producer_handoff", input.operationId);
    if (!found) return null;
    const record = found.record;
    if (!same(record.checkpointIdentity, input) || record.transactionIdentity !== tx.transactionId
      || record.publicationIdentity !== pub.publicationIdentity || record.publicationDigest !== pub.publicationDigest
      || record.specId !== specId() || record.target !== target || record.planningSeal !== input.bindings.planningSeal
      || record.classification !== publication.classification || record.approvedScopeHash !== approvedScopeHash
      || record.producerCommand !== "to-spec" || record.trackerIdentity !== specId()) throw conflict("Handoff record bindings differ");
    return { handoffIdentity: found.identity, handoffDigest: found.digest };
  };
  const handoffAppend = async ({ identity: input, preparation = null, retryRejected = false }) => withProducerLock(connection, specId(), async () => {
    const tx = getTransaction(input);
    const pub = await publicationRead(input);
    if (!pub || !same(tx.progress[1]?.receipt, pub)) throw conflict("Publication checkpoint is incomplete");
    const record = { kind: "producer_handoff", repositoryId, operationKey: input.operationId,
      producerCommand: "to-spec", ...authority(input), checkpointIdentity: input, transactionIdentity: tx.transactionId,
      trackerIdentity: specId(), publicationIdentity: pub.publicationIdentity, publicationDigest: pub.publicationDigest,
      recordIdentities: [pub.publicationIdentity], preparation };
    await appendRecord(record, retryRejected);
    return handoffRead({ identity: input });
  });
  const advance = async ({ identity: input, stage, receipt }) => {
    const observed = stage === "planning_seal.read_back" ? sealRead({ identity: input })
      : stage === "publication.read_back" ? await publicationRead(input)
        : stage === "handoff.completed" ? await handoffRead({ identity: input }) : null;
    if (!observed || !same(observed, receipt)) throw conflict("Stage receipt is not the exact owner read-back");
    return checkpoints.advanceCheckpoint({ identity: input, stage, receipt });
  };
  if (options.specId !== undefined) { number = await locate(options.specId); await snapshot(); }
  return { repositoryId, repositoryName, publicationMode: "READ_WRITE_READBACK", approvedScopeIdentity, capability,
    planning: { readBaseline: baseline, registerLane: request => planningWriter().register(request), readLane: lane => planningWriter().readLane(lane) },
    planningSeal: { read: sealRead, write: sealWrite },
    tracker: { read, reserve, publish, readPublication: publicationRead,
      readMutation: request => readMutation(connection, publicationMutation(request)) },
    checkpoint: { identity, read: input => { validateIdentity(input); return checkpoints.readCheckpoint(input); },
      create: async input => {
        validateIdentity(input);
        if (!checkpoints.readCheckpoint(input) && (await findRecord("spec_publication", input.operationId) || await findRecord("producer_handoff", input.operationId))) {
          throw conflict("Downstream producer records exist without their transaction; preserve the evidence");
        }
        return createProducerOperationCheckpoint({ store: checkpoints, identity: input });
      }, advance },
    handoff: { read: handoffRead, append: handoffAppend } };
}
