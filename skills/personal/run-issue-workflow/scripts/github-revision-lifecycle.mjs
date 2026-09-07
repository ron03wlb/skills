import { bodyDigest } from "./github-workflow-records.mjs";
import { assertWorkflowOperationIdentity, deriveExecuteIssueOperationIdentity } from "./workflow-operation-identity.mjs";

const one = (items, label) => {
  if (items.length !== 1) throw new Error(`${label}: expected one exact record`);
  return items[0];
};

// Select evidence only. The caller still owns live Git, task and journal checks.
export function selectRevisionLifecycle({ snapshot, issue, repositoryId }) {
  const { authority, spec, publication, decomposition } = snapshot;
  const current = [authority.approvedScopeHash, publication.identity, decomposition?.identity];
  const all = issue.records.filter(({ record }) => ["implementation_complete", "implementation_blocked"].includes(record.kind));
  const historicalBlocks = [];
  const previousAuthorities = new Map();
  const priorAuthority = (item) => {
    const operation = item.record.operationIdentity;
    assertWorkflowOperationIdentity(operation, deriveExecuteIssueOperationIdentity({ repositoryId,
      specId: authority.specId, issueId: issue.node_id, approvedPublicationIdentity: operation?.approvedPublicationIdentity }));
    if (item.record.issueId !== issue.node_id || item.record.specId !== authority.specId || item.record.target !== authority.target) {
      throw new Error("Lifecycle identity or target differs");
    }
    const previous = spec.records.slice(0, spec.records.indexOf(publication));
    const publications = previous.filter(({ record }) => record.kind === "spec_publication" && record.repositoryId === repositoryId
      && record.authority?.specId === authority.specId && record.authority.target === authority.target
      && record.authority.classification === "MULTI");
    const matches = publications.flatMap(pub => previous.filter(({ record }) => record.kind === "decomposition:v1"
      && record.parent === authority.specId && record.approvedScopeHash === pub.record.authority.approvedScopeHash
      && record.target === authority.target && record.planningSeal === pub.record.authority.planningSeal)
      .filter(dec => [pub.identity, pub.record.authority.approvedScopeHash, dec.identity].includes(operation.approvedPublicationIdentity))
      .map(dec => ({ publication: pub, decomposition: dec })));
    const proven = one(matches, "Previous lifecycle publication");
    const handoff = one(previous.filter(({ record }) => record.kind === "producer_handoff" && record.producerCommand === "to-tickets"
      && record.specId === authority.specId && record.target === authority.target
      && record.approvedScopeHash === proven.publication.record.authority.approvedScopeHash
      && record.upstreamPublicationIdentity === proven.publication.identity
      && record.decompositionIdentity === proven.decomposition.identity
      && record.decompositionDigest === proven.decomposition.bodySha256), "Previous decomposition handoff");
    previousAuthorities.set(handoff.identity, { ...proven, handoff });
    const key = one(Object.keys(decomposition?.record.decompositionMapping ?? {}).filter(key => decomposition.record.decompositionMapping[key] === issue.node_id), "Current child key");
    if (proven.decomposition.record.decompositionMapping?.[key] !== issue.node_id
      || Object.values(proven.decomposition.record.decompositionMapping).filter(id => id === issue.node_id).length !== 1
      || item.record.planningSeal !== proven.publication.record.authority.planningSeal) throw new Error("Previous lifecycle child or Planning Seal differs");
    return proven;
  };
  const lifecycle = all.filter(item => {
    const operation = item.record.operationIdentity;
    if (!operation) return true; // Legacy evidence keeps its existing conservative handling.
    assertWorkflowOperationIdentity(operation, deriveExecuteIssueOperationIdentity({ repositoryId,
      specId: authority.specId, issueId: issue.node_id, approvedPublicationIdentity: operation.approvedPublicationIdentity }));
    if (current.includes(operation.approvedPublicationIdentity)) return true;
    if (item.record.kind !== "implementation_blocked") return true;
    const previous = priorAuthority(item);
    // Only a pre-execution scope-revision blocker can be historical automatically.
    // A candidate, lane or other failure still needs its owning recovery workflow.
    if (item.record.reasonCode !== "scope_revision_required"
      || ["worktree", "topic", "candidate", "taskRef"].some(key => item.record[key] != null)) throw new Error("Previous operation has unresolved lane evidence");
    historicalBlocks.push({ ...item, previous });
    return false;
  });
  const adoptions = decomposition?.record.adoptedCompletions ?? [];
  if (!Array.isArray(adoptions) || adoptions.some(item => !item || typeof item.issueId !== "string")
    || new Set(adoptions.map(item => item.issueId)).size !== adoptions.length
    || adoptions.some(item => !Object.values(decomposition.record.decompositionMapping).includes(item.issueId))) throw new Error("Malformed or duplicate completion adoption");
  const adoption = adoptions.find(item => item.issueId === issue.node_id);
  let adoptedCompletion = null;
  if (adoption) {
    const expectedFields = ["issueId", "publicationIdentity", "decompositionIdentity", "childBodyDigest", "completionIdentity", "completionBodySha256"];
    if (Object.keys(adoption).length !== expectedFields.length || expectedFields.some(key => typeof adoption[key] !== "string" || !adoption[key])) throw new Error("Malformed completion adoption");
    adoptedCompletion = one(all.filter(item => item.identity === adoption.completionIdentity
      && item.bodySha256 === adoption.completionBodySha256 && item.record.kind === "implementation_complete"), "Adopted completion");
    if (all.at(-1) !== adoptedCompletion || issue.state !== "closed"
      || current.includes(adoptedCompletion.record.operationIdentity?.approvedPublicationIdentity)) throw new Error("Adoption requires the latest closed previous completion");
    const previous = priorAuthority(adoptedCompletion);
    if (previous.publication.identity !== adoption.publicationIdentity || previous.decomposition.identity !== adoption.decompositionIdentity
      || adoption.childBodyDigest !== bodyDigest(issue.body)
      || previous.decomposition.record.childBodyDigests?.[issue.node_id] !== adoption.childBodyDigest
      || decomposition.record.childBodyDigests?.[issue.node_id] !== adoption.childBodyDigest) throw new Error("Adopted child contract or previous publication changed");
    const blockers = dec => (dec.record.blockerEdges ?? []).filter(edge => edge.blocked === issue.node_id).map(edge => edge.blocker).sort();
    if (JSON.stringify(blockers(previous.decomposition)) !== JSON.stringify(blockers(decomposition))) throw new Error("Adopted child blockers changed");
  }
  return { lifecycle, historicalBlocks, adoptedCompletion, previousAuthorities: [...previousAuthorities.values()] };
}
