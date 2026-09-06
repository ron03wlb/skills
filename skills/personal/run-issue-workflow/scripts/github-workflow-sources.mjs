import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { bodyDigest, readWorkflowRecords } from "./github-workflow-records.mjs";
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
    const issues = await Promise.all(ids.map((id) => id === spec.node_id ? spec : readIssue(id)));
    const blockerEdges = decomposition?.record.blockerEdges ?? [];
    const blockers = new Map();
    for (const issue of issues) {
      if (decomposition) {
        if (decomposition.record.childBodyDigests?.[issue.node_id] !== bodyDigest(issue.body)) throw new Error(`Issue #${issue.number} contract changed since decomposition`);
        const parent = api(`repos/${repositoryName}/issues/${issue.number}/parent`)[0];
        if (parent.node_id !== spec.node_id) throw new Error(`Issue #${issue.number} parent differs`);
      }
      const native = api(`repos/${repositoryName}/issues/${issue.number}/dependencies/blocked_by`);
      const actual = native.map(({ node_id }) => node_id).sort();
      const expected = blockerEdges.filter(({ blocked }) => blocked === issue.node_id).map(({ blocker }) => blocker).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Published blockers differ for Issue #${issue.number}`);
      blockers.set(issue.node_id, actual);
    }
    return { spec, publication, authority, handoff, decomposition, mapping, issues, blockers, blockerEdges };
  };
  const reconciliationRead = async ({ tracker: snapshot, journal, request }) => {
    const { authority } = snapshot;
    const operation = deriveRunOperationIdentity({ repositoryId, specId: authority.specId, approvedPublicationIdentity: authority.approvedScopeHash });
    const runIdentity = request.runIdentity ?? { ...authority, runId: operation.key };
    // planningSeal is authority evidence, not a member of the journal Run identity.
    const { planningSeal: ignoredSeal, ...selectedIdentity } = runIdentity;
    const target = targetRead(authority.target);
    if (!ancestor(authority.planningSeal, target.head)) throw new Error("Planning Seal is not reachable from the selected target");
    const taskRefs = Object.fromEntries(journal.filter(({ type }) => type === "dispatch.recorded").map(({ issueId, taskRef }) => [issueId, taskRef]));
    const nodes = [];
    for (const issue of snapshot.issues) {
      const lifecycle = issue.records.filter(({ record }) => ["implementation_complete", "implementation_blocked"].includes(record.kind));
      if (lifecycle.length === 0 && issue.comments.some(({ body }) => /\bimplementation_complete\b/u.test(body))) {
        throw new Error(`Issue #${issue.number} has unclassified legacy completion evidence; preserve its lane`);
      }
      const latest = lifecycle.at(-1);
      const completion = latest?.record.kind === "implementation_complete" ? latest : null;
      const task = taskRefs[issue.node_id] ? await tasks.read(taskRefs[issue.node_id]) : null;
      const node = { issueId: issue.node_id, blockers: snapshot.blockers.get(issue.node_id),
        trackerState: issue.state.toUpperCase(), taskState: task?.state === "RUNNING" ? "EXECUTING" : task?.state === "SETTLED" ? "NONE" : task ? "UNKNOWN" : "NONE",
        completionState: latest?.record.kind === "implementation_blocked" ? "BLOCKED" : completion ? "COMPLETE" : "NONE",
        candidateReachable: false, worktreeState: "ABSENT" };
      if (task?.state === "UNKNOWN") throw new Error(`Issue #${issue.number} task state is unknown`);
      if (task?.state === "SETTLED" && !latest) node.taskState = "FAILED";
      if (completion) {
        const record = completion.record;
        if (record.issueId !== issue.node_id || record.specId !== authority.specId || record.target !== authority.target
          || record.standards !== "clean" || record.spec !== "clean" || record.worktreeState !== "clean"
          || !Array.isArray(record.verification) || record.verification.length === 0
          || !Array.isArray(record.manualAttestations) || !Array.isArray(record.workflowArtifacts)) throw new Error("Completion contract is incomplete or mismatched");
        assertWorkflowOperationIdentity(record.operationIdentity, deriveExecuteIssueOperationIdentity({ repositoryId, specId: authority.specId, approvedPublicationIdentity: authority.approvedScopeHash, issueId: issue.node_id }));
        if (!ancestor(record.baseline, record.candidate)) throw new Error("Candidate does not contain its recorded baseline");
        const matching = worktrees().filter(({ worktree, branch }) => worktree === record.worktree && branch === `refs/heads/${record.topic}`);
        if (existsSync(record.worktree)) {
          if (matching.length !== 1 || realpathSync(resolve(record.worktree, command("git", ["-C", record.worktree, "rev-parse", "--git-common-dir"]))) !== gitCommonDir) throw new Error("Completion worktree ownership differs");
          if (matching[0].HEAD !== record.candidate || command("git", ["-C", record.worktree, "status", "--porcelain=v1"])) throw new Error("Reviewed candidate or clean worktree changed");
          node.worktreeState = "PRESENT";
        } else if (matching.length) throw new Error("Completion worktree is missing but still registered");
        node.candidateReachable = ancestor(record.candidate, target.head);
        node.closeAuthorityEvidence = { trackerIdentity: `${issue.node_id}:${bodyDigest(issue.body)}`, targetHead: target.head,
          candidateCommit: record.candidate, completionEvidenceId: completion.identity, completionBodySha256: completion.bodySha256,
          worktreeIdentity: bodyDigest(JSON.stringify({ gitCommonDir, path: record.worktree, topic: record.topic })) };
      }
      nodes.push(node);
    }
    const handoff = { ...snapshot.handoff.record, identity: snapshot.handoff.identity };
    return { runIdentity: selectedIdentity, grant: { runIdentity: selectedIdentity, maxParallel: 3 }, planningSeal: authority.planningSeal, taskRefs,
      runReadyAuthority: { schema: "run-ready-handoff-facts:v1", authority, checkpoint: checkpointRead(snapshot), handoff,
        targetState: target.state, targetOwnership: target.ownership, evidence: [],
        trackerRecordIdentities: snapshot.decomposition ? [snapshot.publication.identity, snapshot.decomposition.identity] : [snapshot.publication.identity],
        decompositionIdentity: authority.decompositionIdentity,
        ...(snapshot.decomposition ? { decompositionDigest: snapshot.decomposition.bodySha256, decompositionMapping: snapshot.mapping,
          blockerEdges: snapshot.blockerEdges, readyFrontier: snapshot.decomposition.record.readyFrontier } : {}) },
      facts: { schema: "dag-run-facts:v1", run: { ...selectedIdentity, reconciled: true, trackerAvailable: true,
        targetState: target.state, targetHead: target.head, closeWriterRunId: null, closeWriterState: "ABSENT",
        parentTrackerState: snapshot.spec.state.toUpperCase(), parentTrackerIdentity: snapshot.spec.node_id }, nodes, contradictions: [] } };
  };
  return {
    gitCommonDir, issueNumber, readIssue, targetRead, metrics: () => ({ commandCalls }),
    sources: {
      repository: { readIdentity: async () => repositoryId }, tracker: { read: trackerRead },
      reconciliation: { read: reconciliationRead }, target: { read: async ({ current }) => targetRead(current.runIdentity.target) },
      checkpoint: { read: async ({ tracker }) => checkpointRead(tracker) },
      handoff: { read: async ({ tracker }) => ({ ...tracker.handoff.record, identity: tracker.handoff.identity }) },
      writer: { readHealth: async () => "UNKNOWN" },
      selector: { listNonTerminalRuns: async () => store.listRunIds().flatMap((runId) => {
        const status = store.readStatus(runId);
        if (["SUCCEEDED", "STOPPED"].includes(status?.run.state)) return [];
        const grant = store.readEvents(runId).findLast(({ type }) => type === "grant.recorded");
        return grant ? [{ runIdentity: grant.runIdentity }] : [];
      }) },
    },
  };
}
