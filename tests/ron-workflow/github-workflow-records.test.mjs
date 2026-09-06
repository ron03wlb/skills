import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readWorkflowRecords, renderWorkflowRecord } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";

const hash = (body) => `sha256:${createHash("sha256").update(body).digest("hex")}`;
const note = (body, overrides = {}) => ({ node_id: "IC_1", body, author_association: "OWNER", ...overrides });
test("workflow records preserve exact native note identity and digest without trusting prose", () => {
  const record = { kind: "implementation_blocked", issueId: "I_1", reason: "Needs evidence" };
  const body = renderWorkflowRecord(record);
  assert.deepEqual(readWorkflowRecords([note(body)]), [{ identity: "IC_1", bodySha256: hash(body), record }]);
  assert.deepEqual(readWorkflowRecords([note("The implementation_complete work is discussed here.")]), []);
  assert.throws(() => readWorkflowRecords([note(body, { author_association: "NONE" })]), /trusted repository author/u);
  assert.throws(() => readWorkflowRecords([note("```workflow-record\n{broken}\n```")]), /Malformed/u);
  assert.throws(() => readWorkflowRecords([note(`${body}\n${body}`)]), /one record/u);
});
