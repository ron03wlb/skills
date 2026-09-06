import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { assessRunPreparation, readManualAttestation } from "./run-preparation.mjs";
import { reduceRun } from "./run-core.mjs";
import { bodyDigest, readWorkflowRecords, legacyCompletionAllowed } from "./github-workflow-records.mjs";
import { bindProducerCheckpointOperationIdentity, deriveRunOperationIdentity, deriveExecuteIssueOperationIdentity, assertWorkflowOperationIdentity } from "./workflow-operation-identity.mjs";
import { createWorkflowControlStore } from "./workflow-control-store.mjs";

const one = (values, label) => {
  if (values.length !== 1) throw new Error(`${label}: expected one exact record, observed ${values.length}`);
  return values[0];
};
const sha = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

export function createGitHubWorkflowSources({ repository, repositoryName, store, tasks }) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repositoryName)) throw new Error("Static GitHub repository identity is required");
  repository = realpathSync(repository);
  let commandCalls = 0;
  const command = (name, args, options = {}) => {
    commandCalls += 1;
    return execFileSync(name, args, { cwd: repository, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, ...options }).trim();
  };
  const git = (...args) => command("git", args);
  const api = (path) => JSON.parse(command("gh", ["api", path, "--paginate", "--slurp"])).flat();
  const repositoryId = `github:${repositoryName}`;
  const remote = git("remote", "get-url", "origin").replace(/\.git$/u, "");
  if (![ `https://github.com/${repositoryName}`, `git@github.com:${repositoryName}`, `ssh://git@github.com/${repositoryName}` ].includes(remote)) {
    throw new Error("Configured repository does not match the checkout origin");
  }
  const gitCommonDir = realpathSync(resolve(repository, git("rev-parse", "--git-common-dir")));
  const checkpoints = createWorkflowControlStore({ gitCommonDir });
  const numbers = new Map();
  const issueNumber = async (locator) => {
    if (/^[1-9][0-9]*$/u.test(String(locator))) return Number(locator);
    if (!numbers.has(locator)) {
      const response = JSON.parse(command("gh", ["api", "graphql", "-f", "query=query($id: ID!) { node(id: $id) { ... on Issue { id number repository { nameWithOwner } } } }", "-f", `id=${locator}`]));
      const node = response.data?.node;
      if (node?.repository?.nameWithOwner !== repositoryName || !node.number) throw new Error("Issue node is outside the configured repository");
      numbers.set(locator, node.number);
    }
    return numbers.get(locator);
  };
  const readIssue = async (locator) => {
    const number = await issueNumber(locator);
    const issue = api(`repos/${repositoryName}/issues/${number}`)[0];
    if (issue.pull_request || !issue.node_id) throw new Error("Tracker locator is not an Issue");
    numbers.set(issue.node_id, number);
    const comments = api(`repos/${repositoryName}/issues/${number}/comments?per_page=100`);
    return { ...issue, comments, records: readWorkflowRecords(comments) };
  };
  const worktrees = () => git("worktree", "list", "--porcelain", "-z").split("\0\0").filter(Boolean).map((block) => {
    const fields = Object.fromEntries(block.split("\0").filter(Boolean).map((line) => {
      const split = line.indexOf(" "); return split < 0 ? [line, true] : [line.slice(0, split), line.slice(split + 1)];
    }));
    return fields;
  });
  const targetRead = (target) => {
    const registered = one(worktrees().filter(({ branch }) => branch === `refs/heads/${target}`), "Target worktree");
    const head = git("rev-parse", "--verify", `refs/heads/${target}^{commit}`);
    const dirty = command("git", ["-C", registered.worktree, "status", "--porcelain=v1", "--untracked-files=all"]);
    return { state: dirty ? "DIRTY" : "CLEAN", ownership: dirty ? "UNOWNED" : "NONE", head, worktree: registered.worktree };
  };
  const ancestor = (commit, target) => {
    if (!sha.test(commit)) throw new Error("Invalid Git candidate or Planning Seal");
    try { git("merge-base", "--is-ancestor", commit, target); return true; }
    catch (error) { if (error.status === 1) return false; throw error; }
  };
  const checkpointRead = (snapshot) => {
    const identity = bindProducerCheckpointOperationIdentity(snapshot.handoff.record.checkpointIdentity);
    if (identity.repositoryId !== repositoryId || identity.specId !== snapshot.spec.node_id) throw new Error("Producer checkpoint repository or Spec differs");
    const tx = checkpoints.readCheckpoint(identity);
    if (!tx) return { state: "ABSENT" };
    const receipts = Object.fromEntries(tx.progress.map(({ stage, receipt }) => [stage, receipt]));
    return { ...identity, state: tx.state, transactionIdentity: tx.transactionId,
      planningSeal: identity.bindings.planningSeal, classification: identity.bindings.classification,
      approvedScopeHash: identity.bindings.approvedScopeIdentity,
      firstUnsatisfiedStage: tx.nextStage, handoffIdentity: receipts["handoff.completed"]?.handoffIdentity,
      stageReceipts: { planningSealReadBack: receipts["planning_seal.read_back"],
        publicationReadBack: receipts["publication.read_back"], decompositionReadBack: receipts["decomposition.read_back"], readyStateReadBack: receipts["ready_state.read_back"] } };
  };
  const trackerRead = async (request) => {
    const spec = await readIssue(request.specId);
    const digest = bodyDigest(spec.body);
    const publication = one(spec.records.filter(({ record }) => record.kind === "spec_publication" && record.authority?.approvedScopeHash === digest), "Current approved Spec publication");
    let authority = publication.record.authority;
    if (authority.specId !== spec.node_id || publication.record.repositoryId !== repositoryId) throw new Error("Spec publication identity differs");
    const expectedProducer = authority.classification === "SINGLE" ? "to-spec" : "to-tickets";
    const handoff = one(spec.records.filter(({ record }) => record.kind === "producer_handoff" && record.approvedScopeHash === digest && record.producerCommand === expectedProducer), "Current producer handoff");
    const decomposition = authority.classification === "MULTI"
      ? one(spec.records.filter(({ record }) => record.kind === "decomposition:v1" && record.parent === spec.node_id && record.approvedScopeHash === digest), "Decomposition publication") : null;
    if (decomposition) authority = { ...authority, decompositionIdentity: decomposition.identity };
    const mapping = decomposition?.record.decompositionMapping ?? null;
    const ids = authority.classification === "SINGLE" ? [spec.node_id] : Object.values(mapping ?? {});
    if (ids.length === 0 || new Set(ids).size !== ids.length) throw new Error("Decomposition has no unique Issue mapping");
    const issueErrors = new Map();
    const issues = await Promise.all(ids.map(async id => {
      try { return id === spec.node_id ? spec : await readIssue(id); }
      catch (error) { issueErrors.set(id, error.message); return { node_id: id, state: "unknown", records: [], comments: [] }; }
    }));
    const blockerEdges = decomposition?.record.blockerEdges ?? [];
    const blockers = new Map();
    for (const issue of issues) {
      const expected = blockerEdges.filter(({ blocked }) => blocked === issue.node_id).map(({ blocker }) => blocker).sort();
      blockers.set(issue.node_id, expected);
      if (issueErrors.has(issue.node_id)) continue;
      try {
      if (decomposition) {
        if (decomposition.record.childBodyDigests?.[issue.node_id] !== bodyDigest(issue.body)) throw new Error(`Issue #${issue.number} contract changed since decomposition`);
        const parent = api(`repos/${repositoryName}/issues/${issue.number}/parent`)[0];
        if (parent.node_id !== spec.node_id) throw new Error(`Issue #${issue.number} parent differs`);
      }
      const native = api(`repos/${repositoryName}/issues/${issue.number}/dependencies/blocked_by`);
      const actual = native.map(({ node_id }) => node_id).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Published blockers differ for Issue #${issue.number}`);
      blockers.set(issue.node_id, actual);
      } catch (error) { issueErrors.set(issue.node_id, error.message); }
    }
    return { issueErrors, spec, publication, authority, handoff, decomposition, mapping, issues, blockers, blockerEdges };
  };
  const reconciliationRead = async ({ tracker: snapshot, journal, request }) => {
    const { authority } = snapshot;
    const operation = deriveRunOperationIdentity({ repositoryId, specId: authority.specId, approvedPublicationIdentity: authority.approvedScopeHash });
    const runIdentity = request.runIdentity ?? { ...authority, runId: operation.key };
    // planningSeal is authority evidence, not a member of the journal Run identity.
    const { planningSeal: ignoredSeal, ...selectedIdentity } = runIdentity;
    if (request.runIdentity && journal.length === 0) journal = store.readEvents(selectedIdentity.runId);
    const target = targetRead(authority.target);
    if (!ancestor(authority.planningSeal, target.head)) throw new Error("Planning Seal is not reachable from the selected target");
    const taskRefs = Object.fromEntries(journal.filter(({ type }) => type === "dispatch.recorded").map(({ issueId, taskRef }) => [issueId, taskRef]));
    const nodes = [];
    const contradictions = [];
    const preparedLanes = {};
    const declaration = snapshot.publication.record.preparation;
    const supplied = snapshot.handoff.record.preparation;
    const alreadyStarted = journal.some(event => event.type === "grant.recorded");
    let preparation = declaration ? assessRunPreparation({ ...declaration, approvals: supplied?.approvals,
      trackerPublication: { required: declaration.trackerPublication?.required, observed: "READ_WRITE_READBACK" }, preparedSql: supplied?.preparedSql ?? [] }) : undefined;
    if (alreadyStarted && preparation?.sql === "PENDING" && preparation.questions.length === 0) preparation = assessRunPreparation({ ...declaration, sql: [], preparedSql: [], approvals: supplied?.approvals, trackerPublication: { required: declaration.trackerPublication?.required, observed: "READ_WRITE_READBACK" } });
    if (!declaration && [snapshot.spec, ...snapshot.issues].some(issue => {
      const section = issue.body?.match(/^## Manual prerequisites?\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/mu)?.[1]?.trim();
      return section && !/^(?:N\/A|None|Not applicable)[.\s]*$/iu.test(section);
    })) preparation = { state: "INCOMPLETE", reason: "The declared Manual prerequisite needs its planning-owned environment and attestation handoff before Run-ready" };
    for (const issue of snapshot.issues) {
      try {
      if (snapshot.issueErrors?.has(issue.node_id)) throw new Error(snapshot.issueErrors.get(issue.node_id));
      const sql = declaration?.sql?.find(item => item.issueId === issue.node_id);
      if (sql) {
        const sqlReadiness = assessRunPreparation({ requiredActions: [], approvals: [], trackerPublication: { observed: "READ_WRITE_READBACK" }, sql: [sql], preparedSql: supplied?.preparedSql ?? [] });
        if (sqlReadiness.state !== "READY") throw new Error("Manual prerequisite artifact, environment or attestation is no longer ready");
        const packet = supplied.preparedSql.find(item => item.issueId === issue.node_id);
        if (!readManualAttestation(issue.comments.find(comment => comment.node_id === packet.attestationIdentity), packet)
          || git("cat-file", "-t", packet.candidate) !== "commit" || git("cat-file", "-t", packet.blob) !== "blob"
          || git("rev-parse", "--verify", `${packet.candidate}:${packet.artifact}`) !== packet.blob) throw new Error("Manual attestation or exact artifact content changed");
        const matches = worktrees().filter(item => item.worktree === packet.worktree && item.branch === `refs/heads/${packet.topic}`);
        const registered = matches.length === 0 && issue.state === "closed" && ancestor(packet.candidate, target.head)
          ? { HEAD: target.head } : one(matches, "Prepared Issue worktree");
        if (git("rev-parse", "--verify", `${registered.HEAD}:${packet.artifact}`) !== packet.blob
          || matches.length && command("git", ["-C", packet.worktree, "hash-object", "--", packet.artifact]) !== packet.blob) throw new Error("Applied Manual prerequisite artifact changed in the current Issue lane");
        if (!ancestor(packet.candidate, registered.HEAD)) throw new Error("Prepared candidate is no longer in the Issue lane");
        if (!taskRefs[issue.node_id] && issue.state !== "closed") {
          if (registered.HEAD !== packet.candidate || command("git", ["-C", packet.worktree, "status", "--porcelain=v1"])) throw new Error("Prepared Issue lane changed before dispatch");
          preparedLanes[issue.node_id] = packet;
        }
      }

      const lifecycle = issue.records.filter(({ record }) => ["implementation_complete", "implementation_blocked"].includes(record.kind));
      if (lifecycle.length === 0 && issue.comments.some(({ body }) => /\bimplementation_complete\b/u.test(body))) {
        throw new Error(`Issue #${issue.number} has unclassified legacy completion evidence; preserve its lane`);
      }
      const latest = lifecycle.at(-1);
      const completed = lifecycle.findLast(item => item.record.kind === "implementation_complete");
      const closeOnly = latest?.record.kind === "implementation_blocked" && ["target_dirty", "merge_conflict", "partial_close"].includes(latest.record.reasonCode);
      const completion = latest?.record.kind === "implementation_complete" || closeOnly ? completed : null;
      const task = taskRefs[issue.node_id] ? await tasks.read(taskRefs[issue.node_id]) : null;
      const repair = journal.findLast(event => event.type === "repair.recorded" && event.issueId === issue.node_id);
      const acceptedRepair = repair && repair.candidate === completion?.record.candidate
        && task?.repairRequest?.requestIdentity === repair.requestIdentity && task.repairRequest.runId === selectedIdentity.runId;
      const repairing = acceptedRepair && task.state === "RUNNING";
      const node = { issueId: issue.node_id, blockers: snapshot.blockers.get(issue.node_id),
        trackerState: issue.state.toUpperCase(), taskState: task?.state === "RUNNING" ? "EXECUTING" : task?.state === "RESUMABLE" ? "NONE" : task ? "UNKNOWN" : "NONE",
        completionState: completion ? "COMPLETE" : latest?.record.kind === "implementation_blocked" ? "BLOCKED" : "NONE",
        candidateReachable: false, worktreeState: "ABSENT" };
      if (completion && task?.closeRequest?.runId === selectedIdentity.runId
        && (task.closeRequest.issueId === issue.node_id || authority.classification === "MULTI" && task.closeRequest.issueId === authority.specId)) node.taskState = "NONE";
      if (repairing) { node.taskState = "EXECUTING"; node.completionState = "NONE"; }
      if (acceptedRepair && task.state === "RESUMABLE" && task.snapshot?.turns?.[0]?.status === "completed") throw new Error("Conflict repair settled without renewed completion; inspect the original lane's semantic or verification blocker");
      if (task?.state === "UNKNOWN") throw new Error(`Issue #${issue.number} task state is unknown`);
      if (task?.state === "RESUMABLE" && !latest) node.taskState = "TRANSIENT_FAILURE";
      if (completion) {
        const record = completion.record;
        if (record.issueId !== issue.node_id || record.specId !== authority.specId || record.target !== authority.target
          || record.standards !== "clean" || record.spec !== "clean" || record.worktreeState !== "clean"
          || !Array.isArray(record.verification) || record.verification.length === 0
          || !record.verification.every(item => typeof item.command === "string" && item.command.length > 0
            && typeof item.result === "string" && /^(?:PASS(?:ED)?|SUCCEEDED)\b/iu.test(item.result))
          || !Array.isArray(record.manualAttestations) || record.workflowArtifacts !== undefined && !Array.isArray(record.workflowArtifacts)) throw new Error("Completion contract is incomplete or mismatched");
        const legacy = kind => legacyCompletionAllowed({ records: snapshot.spec.records, kind, repositoryName, specId: authority.specId, target: authority.target, completion });
        if (record.workflowArtifacts === undefined && !legacy("workflow_artifacts_contract_adopted:v1")) throw new Error("Completion is outside the exact artifact compatibility frontier");
        if (record.operationIdentity) {
          const publication = record.operationIdentity.approvedPublicationIdentity;
          if (![authority.approvedScopeHash, snapshot.publication.identity, snapshot.decomposition?.identity].filter(Boolean).includes(publication)) throw new Error("Completion publication is outside current proven authority");
          assertWorkflowOperationIdentity(record.operationIdentity, deriveExecuteIssueOperationIdentity({ repositoryId, specId: authority.specId, approvedPublicationIdentity: publication, issueId: issue.node_id }));
        } else if (!legacy("workflow_operation_identity_contract_adopted:v1")) throw new Error("Completion is outside the exact operation compatibility frontier");
        if (sql) {
          const packet = supplied.preparedSql.find(item => item.issueId === issue.node_id);
          const consumed = record.manualAttestations.filter(item => item.identity === packet.attestationIdentity);
          if (consumed.length !== 1 || consumed[0].kind !== "manual_prerequisite_complete:v2"
            || consumed[0].issue !== issue.node_id || consumed[0].candidate !== packet.candidate
            || consumed[0].blob !== packet.blob || consumed[0].artifact !== packet.artifact
            || consumed[0].environmentIdentity !== packet.environmentIdentity || consumed[0].outcome !== packet.outcome) throw new Error("Completion does not consume the exact current Manual attestation");
        } else if (record.manualAttestations.length) throw new Error("Completion consumes undeclared Manual prerequisites");
        if (!record.planningSeal || !ancestor(record.planningSeal, record.baseline)) throw new Error("Completion Planning Seal is not proven at its recorded baseline");
        if (!ancestor(record.baseline, record.candidate)) throw new Error("Candidate does not contain its recorded baseline");
        const matching = worktrees().filter(({ worktree, branch }) => worktree === record.worktree && branch === `refs/heads/${record.topic}`);
        if (existsSync(record.worktree)) {
          if (matching.length !== 1 || realpathSync(resolve(record.worktree, command("git", ["-C", record.worktree, "rev-parse", "--git-common-dir"]))) !== gitCommonDir) throw new Error("Completion worktree ownership differs");
          if (!repairing && (matching[0].HEAD !== record.candidate || command("git", ["-C", record.worktree, "status", "--porcelain=v1"]))) throw new Error("Reviewed candidate or clean worktree changed");
          node.worktreeState = "PRESENT";
        } else if (matching.length) throw new Error("Completion worktree is missing but still registered");
        node.candidateReachable = ancestor(record.candidate, target.head);
        node.closeAuthorityEvidence = { trackerIdentity: `${issue.node_id}:${bodyDigest(issue.body)}`, targetHead: target.head,
          candidateCommit: record.candidate, completionEvidenceId: completion.identity, completionBodySha256: completion.bodySha256,
          worktreeIdentity: bodyDigest(JSON.stringify({ gitCommonDir, path: record.worktree, topic: record.topic })) };
      }
      const conflict = task?.closeResult;
      if (completion && !repairing && conflict?.schema === "issue-close-result:v1" && conflict.state === "CONFLICT"
        && conflict.issueId === issue.node_id && conflict.runId === selectedIdentity.runId && conflict.candidate === completion.record.candidate
        && conflict.requestIdentity === task.closeRequest?.requestIdentity && conflict.targetRestored === true) {
        if (target.state !== "CLEAN" || !ancestor(conflict.targetHead, target.head)) throw new Error("Conflict target restoration or current ownership is unproven");
        node.closeConflict = { candidate: conflict.candidate, targetHead: target.head };
      }
      nodes.push(node);
      } catch (error) {
        nodes.push({ issueId: issue.node_id, blockers: snapshot.blockers.get(issue.node_id), trackerState: "UNKNOWN", taskState: taskRefs[issue.node_id] ? "UNKNOWN" : "NONE", completionState: "NONE", candidateReachable: false, worktreeState: "UNKNOWN" });
        contradictions.push({ code: "issue_evidence_unresolved", affectedNodes: [issue.node_id], evidence: [error.message] });
        if (declaration?.sql?.some(item => item.issueId === issue.node_id) && !journal.some(event => event.type === "grant.recorded")) preparation = { state: "INCOMPLETE", reason: error.message };
      }
    }
    const handoff = { ...snapshot.handoff.record, identity: snapshot.handoff.identity };
    return { runIdentity: selectedIdentity, grant: { runIdentity: selectedIdentity, maxParallel: 3 }, planningSeal: authority.planningSeal, taskRefs, preparedLanes,
      runReadyAuthority: { schema: "run-ready-handoff-facts:v1", authority, preparation, checkpoint: checkpointRead(snapshot), handoff,
        targetState: target.state, targetOwnership: target.ownership, evidence: [],
        trackerRecordIdentities: snapshot.decomposition ? [snapshot.publication.identity, snapshot.decomposition.identity] : [snapshot.publication.identity],
        decompositionIdentity: authority.decompositionIdentity,
        ...(snapshot.decomposition ? { decompositionDigest: snapshot.decomposition.bodySha256, decompositionMapping: snapshot.mapping,
          blockerEdges: snapshot.blockerEdges, readyFrontier: snapshot.decomposition.record.readyFrontier } : {}) },
      facts: { schema: "dag-run-facts:v1", run: { ...selectedIdentity, reconciled: true, trackerAvailable: true,
        targetState: target.state, targetHead: target.head, closeWriterRunId: null, closeWriterState: "ABSENT",
        parentTrackerState: snapshot.spec.state.toUpperCase(), parentTrackerIdentity: snapshot.spec.node_id }, nodes, contradictions } };
  };
  const readCleanupRuns = async () => {
    const evidence = [];
    for (const runId of store.listRunIds()) {
      const row = { runId, specId: `unknown:${runId}`, state: "UNKNOWN", terminalAt: null, engineLock: "UNKNOWN", activeTasks: "UNKNOWN" };
      try {
        const journal = store.readEvents(runId);
        const grant = journal.findLast(({ type }) => type === "grant.recorded");
        if (!grant) { evidence.push(row); continue; }
        row.specId = grant.runIdentity.specId;
        row.engineLock = store.readWriterLock(runId) === null ? "RELEASED" : "HELD";
        // The projection is only a cheap candidate filter; it never proves terminal state.
        if (!["SUCCEEDED", "STOPPED"].includes(store.readStatus(runId)?.run.state)) { evidence.push(row); continue; }
        const request = { specId: row.specId, runIdentity: grant.runIdentity };
        const snapshot = await trackerRead(request);
        if (snapshot.authority.approvedScopeHash !== grant.runIdentity.approvedScopeHash) { evidence.push(row); continue; }
        const current = await reconciliationRead({ tracker: snapshot, journal, request });
        const states = await Promise.all(Object.values(current.taskRefs).map((ref) => tasks.read(ref)));
        const unresolvedIntent = snapshot.issues.some((issue) => !current.taskRefs[issue.node_id] && store.readHostTask({ runId, issueId: issue.node_id }));
        row.activeTasks = unresolvedIntent ? "UNKNOWN" : states.some(({ state }) => state === "RUNNING") ? "PRESENT"
          : states.every(({ state }) => state === "RESUMABLE") ? "ABSENT" : "UNKNOWN";
        row.state = reduceRun({ ...current.facts, journal }).run.state;
        const completedTimes = states.map(({ snapshot: task }) => task?.turns?.[0]?.completedAt);
        if (row.state === "SUCCEEDED") {
          const times = [snapshot.spec, ...snapshot.issues].map(({ closed_at }) => Date.parse(closed_at));
          if (times.every(Number.isFinite)) row.terminalAt = new Date(Math.max(...times)).toISOString();
        } else if (row.state === "STOPPED" && completedTimes.every((time) => Number.isFinite(time))) {
          const stop = journal.findLast(({ type, command }) => type === "control.revised" && command === "STOP");
          if (stop) row.terminalAt = new Date(Math.max(Date.parse(stop.at), ...completedTimes.map((time) => time < 1e12 ? time * 1000 : time))).toISOString();
        }
      } catch { /* Unreadable owning evidence is retained as UNKNOWN, never an empty inventory. */ }
      evidence.push(row);
    }
    return evidence;
  };
  return {
    gitCommonDir, issueNumber, readIssue, targetRead, readCleanupRuns, metrics: () => ({ commandCalls }),
    sources: {
      repository: { readIdentity: async () => repositoryId }, tracker: { read: trackerRead },
      reconciliation: { read: reconciliationRead }, target: { read: async ({ current }) => targetRead(current.runIdentity.target) },
      checkpoint: { read: async ({ tracker }) => checkpointRead(tracker) },
      handoff: { read: async ({ tracker }) => ({ ...tracker.handoff.record, identity: tracker.handoff.identity }) },
      writer: { readHealth: async ({ current, leaseKind, owner }) => store.readLeaseHealth({ leaseKind, target: current.runIdentity.target, owner }) },
      selector: { listNonTerminalRuns: async () => store.listRunIds().flatMap((runId) => {
        const status = store.readStatus(runId);
        if (["SUCCEEDED", "STOPPED"].includes(status?.run.state)) return [];
        const grant = store.readEvents(runId).findLast(({ type }) => type === "grant.recorded");
        return grant ? [{ runIdentity: grant.runIdentity }] : [];
      }) },
    },
  };
}
