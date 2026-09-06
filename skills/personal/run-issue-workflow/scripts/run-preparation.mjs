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
