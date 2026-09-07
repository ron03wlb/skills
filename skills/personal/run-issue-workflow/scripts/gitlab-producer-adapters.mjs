import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPlanningBaseline } from "../../../engineering/to-spec/scripts/planning-entry.mjs";
import { createWorkflowControlStore } from "./workflow-control-store.mjs";
import { bindProducerCheckpointOperationIdentity, createProducerOperationCheckpoint, deriveSpecReservationOperationIdentity } from "./workflow-operation-identity.mjs";
import { connectGitLabProducer, conflict, digest, gitRead, withProducerLock } from "./gitlab-producer-transport.mjs";
import { mutateOnce, readMutation } from "./gitlab-producer-mutations.mjs";

const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const schema = "gitlab-producer-record:v1";
const render = record => `\`\`\`workflow-record\n${JSON.stringify(record, null, 2)}\n\`\`\``;
const text = (value, label) => { if (typeof value !== "string" || !value.trim()) throw conflict(`${label} is required`); return value; };
const noQuickActions = value => { if (/^\s*\/[a-z][\w-]*(?:\s|$)/mu.test(value)) throw conflict("GitLab quick actions require separate authority and are not supported in producer content"); };

export async function createGitLabProducerAdapters(options) {
  const connection = await connectGitLabProducer(options);
  const { repository, repositoryId, projectId, projectUrl, api, list, assertAuthor } = connection;
  const { target } = options;
  const publication = structuredClone(options.publication);
  text(target, "target");
  gitRead(repository, "check-ref-format", `refs/heads/${target}`);
  text(publication?.title, "publication title");
  text(publication?.body, "publication body");
  noQuickActions(publication.body);
  if (!["SINGLE", "MULTI"].includes(publication.classification)) throw conflict("Producer must supply SINGLE or MULTI classification");
  const readyLabel = publication.readyLabel ?? "ready-for-agent";
  if (!/^[^,\r\n]+$/u.test(readyLabel)) throw conflict("One exact ready label is required");
  const approvedScopeHash = digest(publication.body);
  const approvedScopeIdentity = digest(JSON.stringify({ title: publication.title, body: publication.body,
    classification: publication.classification, readyLabel }));
  const checkpoints = createWorkflowControlStore({ gitCommonDir: connection.gitCommonDir });
  let iid = options.specId === undefined ? null : parseIid(options.specId);
  let reservationOperation = null;
  function parseIid(locator) {
    const raw = String(locator).startsWith(`${projectUrl}/-/issues/`) ? String(locator).slice(`${projectUrl}/-/issues/`.length) : String(locator);
    if (!/^[1-9][0-9]*$/u.test(raw) || !Number.isSafeInteger(Number(raw))) throw conflict("Issue locator is outside the configured project or is malformed");
    return Number(raw);
  }
  const specId = () => { if (!iid) throw conflict("Reserve or select one Issue before this operation"); return `${projectUrl}/-/issues/${iid}`; };
  const head = () => gitRead(repository, "rev-parse", "--verify", `refs/heads/${target}^{commit}`);
  const ancestry = new Set();
  const factObjects = new Map();
  const assertAncestor = (commit, targetHead = head()) => {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(commit ?? "")) throw conflict("Invalid Planning Seal or baseline SHA");
    const key = `${commit}:${targetHead}`;
    if (!ancestry.has(key)) { gitRead(repository, "merge-base", "--is-ancestor", commit, targetHead); ancestry.add(key); }
  };
  const validateIssue = issue => {
    if (issue.project_id !== projectId || !Number.isSafeInteger(issue.id) || issue.id < 1
      || !Number.isSafeInteger(issue.iid) || issue.iid < 1 || issue.web_url !== `${projectUrl}/-/issues/${issue.iid}`
      || issue.issue_type !== "issue" || !Array.isArray(issue.labels) || typeof issue.updated_at !== "string") throw conflict("Native GitLab Issue identity is unreadable or differs");
    return issue;
  };
  const snapshot = async () => {
    specId();
    const issue = validateIssue(await api(`/issues/${iid}`));
    if (issue.iid !== iid) throw conflict("GitLab returned a different Issue");
    const version = digest(JSON.stringify({ id: issue.id, iid, projectId, title: issue.title, body: issue.description,
      labels: [...issue.labels].sort(), state: issue.state, updatedAt: issue.updated_at }));
    return { issue, trackerIdentity: issue.web_url, nativeIssueId: issue.id, version, body: issue.description, labels: issue.labels };
  };
  const read = async () => ({ ...await snapshot(), comments: await list(`/issues/${iid}/notes`) });
  const normalizeLabels = labels => {
    if (!Array.isArray(labels) || labels.some(label => typeof label !== "string" || !label)) throw conflict("Exact expected labels are required");
    return [...new Set(labels)].sort();
  };
  const assertPublished = (current, labels) => {
    if (current.body !== publication.body || current.issue.title !== publication.title || !current.labels.includes(readyLabel)
      || !same(normalizeLabels(current.labels), normalizeLabels(labels))
      || current.issue.state !== "opened") throw conflict("Published Issue body, title, labels or state differs");
  };
  const factsAtHead = (facts, targetHead = head()) => Object.fromEntries(Object.keys(facts).map(path => {
    if (!path || path.startsWith("/") || /[\\:\x00-\x1f]/u.test(path) || path.split("/").some(part => ["", ".", ".."].includes(part))) throw conflict("Relevant fact must be a normalized repository-relative file path");
    const key = `${targetHead}:${path}`;
    if (!factObjects.has(key)) {
      const object = gitRead(repository, "rev-parse", "--verify", key);
      if (gitRead(repository, "cat-file", "-t", object) !== "blob") throw conflict("Relevant fact is not a file");
      factObjects.set(key, `git-blob:${object}`);
    }
    return [path, factObjects.get(key)];
  }));
  const baseline = async request => {
    if (!Array.isArray(request.acceptedChanges) || request.acceptedChanges.length) throw conflict("This binding supports tracker-only publication; use the owning planning writer for accepted document changes");
    assertAncestor(request.baseline);
    return readPlanningBaseline({ request: { ...request, repositoryId, specId: specId(), target, approvedScopeIdentity }, adapter: {
      async readCurrent() {
        const current = await snapshot();
        const currentHead = head();
        return { repositoryId, specId: current.trackerIdentity, target, head: currentHead, approvedScopeIdentity,
          trackerVersion: current.version, relevantFacts: factsAtHead(request.relevantFacts, currentHead) };
      },
    } });
  };
  const identity = ({ baseline: baselineSha, relevantFacts }) => {
    if (!relevantFacts || typeof relevantFacts !== "object" || Array.isArray(relevantFacts)) throw conflict("Explicit relevantFacts are required");
    return bindProducerCheckpointOperationIdentity({ repositoryId, specId: specId(), producerCommand: "to-spec", profileVersion: "v2",
      target, baseline: baselineSha, bindings: { planningSeal: baselineSha, classification: publication.classification,
        approvedScopeIdentity, trackerIdentity: specId(), relevantFacts } });
  };
  const validateIdentity = input => {
    const expected = identity({ baseline: input?.baseline, relevantFacts: input?.bindings?.relevantFacts });
    if (!same(input, expected)) throw conflict("Checkpoint binding differs from the selected repository, Spec, target or publication");
    const currentHead = head();
    assertAncestor(input.baseline, currentHead);
    if (!same(factsAtHead(input.bindings.relevantFacts, currentHead), input.bindings.relevantFacts)) throw conflict("Relevant planning source changed; return to to-spec baseline revalidation");
    return input;
  };
  const sealRead = ({ identity: input }) => {
    validateIdentity(input);
    return { target, planningSeal: input.bindings.planningSeal, state: "reused" };
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
    const notes = await list(`/issues/${iid}/notes`);
    const candidates = [];
    for (const note of notes) {
      if (!note.body?.includes(schema)) continue;
      const match = note.body.match(/^```workflow-record\n([\s\S]+)\n```$/u);
      if (!match) throw conflict("Malformed GitLab producer record");
      let record;
      try { record = JSON.parse(match[1]); } catch { throw conflict("Unreadable GitLab producer record"); }
      if (record.schema !== schema || record.repositoryId !== repositoryId) throw conflict("Producer record repository differs");
      if (record.kind !== kind || record.operationKey !== operationKey) continue;
      if (note.system || !Number.isSafeInteger(note.id) || note.noteable_iid !== iid || note.noteable_type !== "Issue") throw conflict("Native note identity differs");
      await assertAuthor(note.author?.id);
      const fresh = await api(`/issues/${iid}/notes/${note.id}`);
      if (!same(fresh, note)) throw conflict("Producer note changed during read-back");
      candidates.push({ record, identity: `${specId()}#note_${note.id}`, noteId: note.id, digest: digest(note.body) });
    }
    if (candidates.length > 1) throw conflict("Multiple records claim the same producer operation");
    return candidates[0] ?? null;
  };
  const appendRecord = async (record, retryRejected = false) => mutateOnce(connection, {
    key: `${record.operationKey}:${record.kind}`, payload: record, retryRejected,
    observe: async () => {
      const found = await findRecord(record.kind, record.operationKey);
      if (found && !same(found.record, record)) throw conflict("Producer record content differs");
      return found;
    },
    write: async () => { await assertAuthor(connection.userId); await api(`/issues/${iid}/notes`, "POST", { body: render(record) }); },
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
    if (iid) {
      if (reservationOperation === operation.key) return read();
      throw conflict("Primary reservation must not replace an existing Issue");
    }
    const marker = `<!-- gitlab-spec-reservation:${operation.key} -->`;
    const body = `Reserved draft; publication and Run handoff are incomplete.\n\n${marker}`;
    return withProducerLock(connection, operation.key, async () => {
      const reservationRoot = join(connection.gitCommonDir, "matt-workflow-control", "gitlab-producer-reservations");
      const reservationPath = join(reservationRoot, `${operation.key}.json`);
      if (existsSync(reservationPath)) {
        const saved = JSON.parse(readFileSync(reservationPath, "utf8"));
        if (saved.operationKey !== operation.key || saved.repositoryId !== repositoryId) throw conflict("Reservation receipt identity differs");
        iid = parseIid(saved.trackerIdentity);
        const current = await read();
        if (current.nativeIssueId !== saved.nativeIssueId) throw conflict("Reserved native Issue identity changed");
        reservationOperation = operation.key;
        return current;
      }
      const issue = await mutateOnce(connection, { key: operation.key, payload: { title: publication.title, body }, retryRejected,
        observe: async () => {
          const matches = (await list(`/issues?scope=all&state=all&search=${encodeURIComponent(marker)}&in=description`))
            .filter(item => item.description?.includes(marker)).map(validateIssue);
          if (matches.length > 1) throw conflict("Duplicate Spec reservations");
          if (matches[0]) {
            if (matches[0].description !== body || matches[0].title !== publication.title || matches[0].state !== "opened") throw conflict("Reservation was modified; select its exact Issue for the owning operation");
            await assertAuthor(matches[0].author?.id);
          }
          return matches[0];
        },
        write: async () => { await assertAuthor(connection.userId); await api("/issues", "POST", { title: publication.title, description: body }); },
      });
      iid = issue.iid;
      mkdirSync(reservationRoot, { recursive: true });
      writeFileSync(reservationPath, JSON.stringify({ operationKey: operation.key, repositoryId,
        trackerIdentity: issue.web_url, nativeIssueId: issue.id }), { flag: "wx", flush: true });
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
    const names = (await list("/labels")).map(label => label.name);
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
        if (current.version !== expectedVersion || current.issue.state !== "opened") throw conflict("Issue version or state changed before publication");
        if (!same(normalizeLabels(current.labels), beforeLabels)) throw conflict("Expected labels differ from the selected Issue version");
        return null;
      },
      write: async () => {
        await assertAuthor(connection.userId);
        validateIdentity(input);
        // GitLab REST does not provide this adapter with atomic CAS. Check again immediately before PUT.
        if ((await snapshot()).version !== expectedVersion) throw conflict("Issue version changed before PUT");
        await api(`/issues/${iid}`, "PUT", { title: publication.title, description: publication.body, add_labels: readyLabel });
      },
    });
    const record = { schema, kind: "spec_publication", repositoryId, operationKey: input.operationId, authority: authority(input),
      trackerIdentity: specId(), transactionIdentity: tx.transactionId, version: result.version, labels };
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
      || !same(record.authority, authority(input)) || record.trackerIdentity !== specId()) throw conflict("Handoff record bindings differ");
    return { handoffIdentity: found.identity, handoffDigest: found.digest };
  };
  const handoffAppend = async ({ identity: input, preparation = null, retryRejected = false }) => withProducerLock(connection, specId(), async () => {
    const tx = getTransaction(input);
    const pub = await publicationRead(input);
    if (!pub || !same(tx.progress[1]?.receipt, pub)) throw conflict("Publication checkpoint is incomplete");
    const record = { schema, kind: "producer_handoff", repositoryId, operationKey: input.operationId,
      producerCommand: "to-spec", authority: authority(input), checkpointIdentity: input, transactionIdentity: tx.transactionId,
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
  return { repositoryId, publicationMode: "READ_WRITE_READBACK", approvedScopeIdentity,
    planning: { readBaseline: baseline }, planningSeal: { read: sealRead },
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
