import { deriveExecuteIssueOperationIdentity } from "./workflow-operation-identity.mjs";

const actions = new Set(["workflow-install", "task-create", "task-message", "local-close", "tracker-write"]);
const key = value => JSON.stringify([value.action, value.scope]);
const validAction = value => actions.has(value?.action) && typeof value.scope === "string" && value.scope.length > 0;
const sha = value => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value);

// This is the existing planning owner's inventory, carried in its publication/handoff.
// It does not issue a Run Grant or authorize SQL execution.
export function assessRunPreparation({ requiredActions, approvals, trackerPublication, sql = [], preparedSql = [] }) {
  if (!Array.isArray(requiredActions) || !requiredActions.every(validAction)
    || new Set(requiredActions.map(key)).size !== requiredActions.length
    || !Array.isArray(approvals) || !approvals.every(value => validAction(value) && typeof value.authority === "string" && value.authority.length > 0)) {
    return { state: "UNKNOWN", reason: "Planning authorization inventory is incomplete", questions: [], sql: "UNKNOWN" };
  }
  if (!trackerPublication || trackerPublication.required !== undefined && !["ATOMIC_CAS", "READ_WRITE_READBACK"].includes(trackerPublication.required)
    || !["ATOMIC_CAS", "READ_WRITE_READBACK"].includes(trackerPublication.observed)
    || trackerPublication.required === "ATOMIC_CAS" && trackerPublication.observed !== "ATOMIC_CAS") {
    return { state: "INCOMPLETE", reason: "Required tracker publication capability is unavailable; resolve the publication plan before Run-ready", questions: [], sql: "UNKNOWN" };
  }
  const approved = new Set(approvals.map(key));
  const questions = requiredActions.filter(action => !approved.has(key(action)));
  if (!Array.isArray(sql) || !Array.isArray(preparedSql) || new Set(sql.map(item => item.issueId)).size !== sql.length) {
    return { state: "UNKNOWN", reason: "Manual prerequisite declarations are ambiguous", questions, sql: "UNKNOWN" };
  }
  const missing = [];
  for (const declaration of sql) {
    const packet = preparedSql.filter(item => item.issueId === declaration.issueId);
    if (packet.length !== 1 || !declaration.environmentIdentity || typeof declaration.artifact !== "string"
      || declaration.artifact.startsWith("/") || declaration.artifact.split(/[\\/]/u).some(part => !part || part === "." || part === "..")
      || packet[0].environmentIdentity !== declaration.environmentIdentity || packet[0].artifact !== declaration.artifact
      || !sha(packet[0].candidate) || !sha(packet[0].blob) || !packet[0].attestationIdentity
      || !packet[0].owner || packet[0].validation !== "passed" || packet[0].standards !== "clean" || packet[0].spec !== "clean"
      || !["APPLIED", "NO_OP"].includes(packet[0].outcome) || packet[0].recoveryPrepared !== true) missing.push(declaration.issueId);
  }
  return { state: questions.length || missing.length ? "INCOMPLETE" : "READY", questions,
    sql: sql.length === 0 ? "N/A" : missing.length ? "PENDING" : "ATTESTED", missingPrerequisites: missing };
}

export function readManualAttestation(comment, packet) {
  if (!comment || comment.node_id !== packet.attestationIdentity
    || !["OWNER", "MEMBER", "COLLABORATOR"].includes(comment.author_association)) return false;
  const lines = comment.body.trim().split(/\r?\n/u);
  if (lines.shift() !== "manual_prerequisite_complete:v2") return false;
  const fields = {};
  for (const line of lines) {
    const match = line.match(/^([a-z_]+): (.+)$/u);
    if (!match || Object.hasOwn(fields, match[1])) return false;
    fields[match[1]] = match[2];
  }
  return Object.keys(fields).length === 7 && fields.issue === packet.issueId
    && fields.candidate === packet.candidate && fields.blob === packet.blob
    && fields.artifact === packet.artifact && fields.environment_identity === packet.environmentIdentity
    && fields.outcome === packet.outcome && fields.attested_by === "human";
}

// A read-only projection of existing human, planning and leaf evidence, never a Grant.
// The active host reads human/control evidence anew before each maintenance action.
export function assessBootstrapHandoff({ human, control, repositoryId, authority, readiness, approvals, node, blockers, hasRunGrant, contradictions = [] }) {
  const blocked = reason => ({ state: "BLOCKED", reason, nextOwner: "run-preparation" });
  if (!human || !authority || !node || !Array.isArray(approvals) || !Array.isArray(blockers)
    || !Array.isArray(contradictions) || hasRunGrant !== false) return blocked("Pre-Run maintenance ownership is unproven");
  if (control?.state !== "ACTIVE" || control.connected !== true || control.authority !== human.startAuthority
    || typeof human.startAuthority !== "string" || !human.startAuthority) return blocked("Current human Start or control does not permit continuation");
  for (const [field, observed] of Object.entries({ repositoryId, specId: authority.specId, target: authority.target,
    approvedScopeHash: authority.approvedScopeHash, decompositionIdentity: authority.decompositionIdentity, issueId: node.issueId })) {
    if (human[field] !== observed || observed === undefined) return blocked("Human maintenance handoff differs: " + field);
  }
  if (readiness?.state !== "READY" || contradictions.length || !blockers.every(item => item?.trackerState === "CLOSED")) {
    return blocked("Current producer, Issue or blocker evidence is not ready");
  }
  // Exact concrete operations come from the human handoff and match current producer approval sources.
  if (!Array.isArray(human.operations) || !human.operations.every(validAction)
    || new Set(human.operations.map(key)).size !== human.operations.length
    || ![...actions].every(action => human.operations.some(item => item.action === action))
    || !human.operations.every(item => approvals.some(approval => key(approval) === key(item)
      && approval.authority === human.startAuthority))) return blocked("Exact maintenance operations lack current human approval");
  let operationIdentity;
  try { operationIdentity = deriveExecuteIssueOperationIdentity({ repositoryId, specId: authority.specId,
    approvedPublicationIdentity: authority.approvedScopeHash, issueId: node.issueId }); }
  catch { return blocked("Maintenance operation identity is malformed"); }
  const result = { operationIdentity, human, issueId: node.issueId };
  if (node.completionState === "BLOCKED" || node.trackerState === "UNKNOWN" || node.worktreeState === "UNKNOWN"
    || node.taskState !== "NONE") return blocked("Preserve the original maintenance lane until its current owner settles");
  if (node.completionState === "COMPLETE") {
    if (node.trackerState === "CLOSED") return node.candidateReachable && node.worktreeState === "ABSENT"
      ? { ...result, state: "CONTINUE", nextOwner: "run-issue-workflow" } : blocked("Closed maintenance has incomplete delivery evidence");
    if (node.trackerState !== "OPEN" || !node.candidateReachable && node.worktreeState === "ABSENT") return blocked("Maintenance candidate ownership is unproven");
    return { ...result, state: "CLOSE", nextOwner: "close-issue" };
  }
  if (node.completionState !== "NONE" || node.trackerState !== "OPEN" || node.candidateReachable) return blocked("Maintenance execution state is contradictory");
  return { ...result, state: "EXECUTE", nextOwner: "execute-issue" };
}
