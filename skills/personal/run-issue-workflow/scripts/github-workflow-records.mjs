import { createHash } from "node:crypto";

export const bodyDigest = (body) => `sha256:${createHash("sha256").update(body).digest("hex")}`;
const kinds = new Set(["spec_publication", "producer_handoff", "decomposition:v1", "implementation_complete", "implementation_blocked"]);

// Serialization of the existing owners' payloads, not an additional source of authority.
export function renderWorkflowRecord(record) {
  if (!kinds.has(record?.kind)) throw new Error("Unsupported workflow record kind");
  return `\`\`\`workflow-record\n${JSON.stringify(record, null, 2)}\n\`\`\``;
}

export function readWorkflowRecords(comments) {
  return comments.flatMap((comment) => {
    if (!comment.body.includes("```workflow-record")) return [];
    const blocks = [...comment.body.matchAll(/^```workflow-record\r?\n([\s\S]*?)^```\s*$/gmu)];
    if (blocks.length !== 1) throw new Error("A workflow note must contain exactly one record");
    if (!["OWNER", "MEMBER", "COLLABORATOR"].includes(comment.author_association)) {
      throw new Error("Workflow note lacks a trusted repository author");
    }
    let record;
    try { record = JSON.parse(blocks[0][1]); } catch { throw new Error("Malformed workflow record JSON"); }
    if (!kinds.has(record?.kind) || !comment.node_id) throw new Error("Malformed workflow record identity or kind");
    return [{ identity: comment.node_id, bodySha256: bodyDigest(comment.body), record }];
  });
}
