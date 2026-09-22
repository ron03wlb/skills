import { createHash } from "node:crypto";

export const bodyDigest = (body) => `sha256:${createHash("sha256").update(body).digest("hex")}`;
const normalizeNoteProse = (prose) => {
  if (typeof prose !== "string" || prose.trim().length === 0) throw new Error("Workflow note prose must be non-empty text");
  const normalized = prose.trim();
  if (/^```(?:workflow-record|json)\b/mu.test(normalized)) throw new Error("Workflow note prose cannot contain another workflow record");
  return normalized;
};
export const workflowNoteProseDigest = (prose) => bodyDigest(normalizeNoteProse(prose));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const kinds = new Set(["spec_publication", "producer_handoff", "decomposition:v1", "implementation_complete", "implementation_blocked", "implementation_progress", "implementation_repair_progress", "workflow_operation_identity_contract_adopted:v1", "workflow_artifacts_contract_adopted:v1"]);

// Serialization of the existing owners' payloads, not an additional source of authority.
export function renderWorkflowRecord(record) {
  if (!kinds.has(record?.kind)) throw new Error("Unsupported workflow record kind");
  return `\`\`\`workflow-record\n${JSON.stringify(record, null, 2)}\n\`\`\``;
}

export function renderWorkflowNote(record, prose = null) {
  const rendered = renderWorkflowRecord(record);
  if (prose === null) {
    if (record?.completionMode === "tracker_only:v1") throw new Error("Tracker-only workflow notes require prose");
    return rendered;
  }
  const normalized = normalizeNoteProse(prose);
  if (record?.completionMode === "tracker_only:v1"
    && record?.trackerOutcome?.proseSha256 !== bodyDigest(normalized)) {
    throw new Error("Tracker-only workflow note prose digest differs");
  }
  return `${normalized}\n\n${rendered}`;
}

export function readWorkflowRecords(comments) {
  return comments.flatMap((comment) => {
    const candidates = [...comment.body.matchAll(/^```(?:workflow-record|json)\r?\n([\s\S]*?)^```/gmu)];
    const claimsWorkflowRecord = comment.body.includes("```workflow-record")
      || candidates.some((candidate) => {
        try { return kinds.has(JSON.parse(candidate[1])?.kind); }
        catch { return false; }
      });
    if (!claimsWorkflowRecord) return [];
    const openings = [...comment.body.matchAll(/^```(?:workflow-record|json)\r?\n/gmu)];
    if (openings.length > 1) throw new Error("A workflow note must contain exactly one record");
    const blocks = [...comment.body.matchAll(/^```(?:workflow-record|json)\r?\n([\s\S]*?)^```\s*(?![\s\S])/gmu)];
    if (blocks.length !== 1) throw new Error("A workflow note must contain exactly one record");
    if (!["OWNER", "MEMBER", "COLLABORATOR"].includes(comment.author_association)) {
      throw new Error("Workflow note lacks a trusted repository author");
    }
    let record;
    try { record = JSON.parse(blocks[0][1]); } catch { throw new Error("Malformed workflow record JSON"); }
    if (!kinds.has(record?.kind) || !comment.node_id) throw new Error("Malformed workflow record identity or kind");
    const prose = comment.body.slice(0, blocks[0].index).trim();
    return [{ identity: comment.node_id, bodySha256: bodyDigest(comment.body),
      proseSha256: prose.length === 0 ? null : bodyDigest(prose),
      createdAt: comment.created_at ?? null, record }];
  });
}

export function legacyCompletionAllowed({ records, kind, repositoryName, specId, target, completion }) {
  const adoptions = records.filter(item => item.record.kind === kind).map(item => item.record);
  if (adoptions.length === 0) return true; // A truly unadopted scope keeps its existing contract.
  const first = adoptions[0];
  if (adoptions.some(record => JSON.stringify(canonical(record)) !== JSON.stringify(canonical(first)))
    || first.repository !== repositoryName || first.tracker !== `github:${repositoryName}`
    || first.spec !== specId || first.targetBranch !== target || !Array.isArray(first.legacyCompletionFrontier)) return false;
  const frontier = first.legacyCompletionFrontier;
  if (new Set(frontier.map(item => item.issue)).size !== frontier.length || frontier.some(item =>
    typeof item.issue !== "string" || typeof item.evidenceIdentity !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(item.bodySha256))) return false;
  return frontier.some(item => item.issue === completion.record.issueId
    && item.evidenceIdentity === completion.identity && item.bodySha256 === completion.bodySha256);
}
