import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  readWorkflowRecords,
  renderWorkflowNote,
  renderWorkflowRecord,
  workflowNoteProseDigest,
} from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";

const hash = (body) => `sha256:${createHash("sha256").update(body).digest("hex")}`;
const note = (body, overrides = {}) => ({ node_id: "IC_1", body, author_association: "OWNER", ...overrides });
test("workflow records preserve exact native note identity and digest without trusting prose", () => {
  const record = { kind: "implementation_blocked", issueId: "I_1", reason: "Needs evidence" };
  const body = renderWorkflowRecord(record);
  assert.deepEqual(readWorkflowRecords([note(body)]), [{ identity: "IC_1", bodySha256: hash(body), proseSha256: null, createdAt: null, record }]);
  assert.deepEqual(readWorkflowRecords([note("The implementation_complete work is discussed here.")]), []);
  assert.throws(() => readWorkflowRecords([note(body, { author_association: "NONE" })]), /trusted repository author/u);
  assert.throws(() => readWorkflowRecords([note("```workflow-record\n{broken}\n```")]), /Malformed/u);
  assert.throws(() => readWorkflowRecords([note(`${body}\n${body}`)]), /one record/u);
  assert.throws(() => readWorkflowRecords([note(`${body}\nTrailing outcome.`)]), /one record/u);
  const jsonBody = body.replace("```workflow-record", "```json");
  assert.throws(() => readWorkflowRecords([note(`${jsonBody}\nTrailing outcome.`)]), /one record/u);
  assert.deepEqual(readWorkflowRecords([note("```json\n{\"example\":true}\n```\nTrailing prose.")]), []);
});

test("workflow records bind trimmed human-readable prose without trusting it as authority", () => {
  const record = { kind: "implementation_complete", repositoryId: "github:example/repo", issueId: "I_1" };
  const prose = "  Final tracker outcome.  \n";
  const body = renderWorkflowNote(record, prose);
  assert.deepEqual(readWorkflowRecords([note(body)]), [{
    identity: "IC_1",
    bodySha256: hash(body),
    proseSha256: workflowNoteProseDigest(prose),
    createdAt: null,
    record,
  }]);
  assert.throws(() => renderWorkflowNote(record, "text\n```workflow-record\n{}\n```"), /another workflow record/u);
  assert.throws(() => renderWorkflowNote({
    ...record,
    completionMode: "tracker_only:v1",
    trackerOutcome: { proseSha256: workflowNoteProseDigest("Expected prose.") },
  }, prose), /prose digest differs/u);
});
