import assert from "node:assert/strict";
import test from "node:test";
import { assessRunPreparation, readManualAttestation } from "../../skills/personal/run-issue-workflow/scripts/run-preparation.mjs";

test("planning asks only missing concrete approvals once and SQL absence adds no question", () => {
  const input = { requiredActions: [{ action: "task-create", scope: "I_1" }, { action: "local-close", scope: "repo:main:I_1" }],
    approvals: [{ action: "task-create", scope: "I_1", authority: "human:existing" }], trackerPublication: { required: "READ_WRITE_READBACK", observed: "READ_WRITE_READBACK" } };
  const before = assessRunPreparation(input);
  assert.equal(before.state, "INCOMPLETE");
  assert.deepEqual(before.questions, [input.requiredActions[1]]);
  input.approvals.push({ ...before.questions[0], authority: "human:new" });
  for (let reentry = 0; reentry < 3; reentry += 1) {
    assert.deepEqual(assessRunPreparation(input), { state: "READY", questions: [], sql: "N/A", missingPrerequisites: [] });
  }
  input.trackerPublication.required = "ATOMIC_CAS";
  assert.equal(assessRunPreparation(input).state, "INCOMPLETE", "unsupported CAS is discovered before Run-ready");
});

test("SQL readiness binds environment and exact committed content to the human outcome", () => {
  const packet = { issueId: "I_1", environmentIdentity: "staging-generation-4", artifact: "ops/update.sql", candidate: "a".repeat(40), blob: "b".repeat(40), attestationIdentity: "IC_1", outcome: "NO_OP", owner: "operator", validation: "passed", standards: "clean", spec: "clean", recoveryPrepared: true };
  const input = { requiredActions: [], approvals: [], trackerPublication: { observed: "READ_WRITE_READBACK" }, sql: [{ issueId: "I_1", artifact: packet.artifact, environmentIdentity: packet.environmentIdentity }], preparedSql: [packet] };
  const comment = { node_id: "IC_1", author_association: "OWNER", body: `manual_prerequisite_complete:v2\nissue: I_1\ncandidate: ${packet.candidate}\nblob: ${packet.blob}\nartifact: ${packet.artifact}\noutcome: NO_OP\nattested_by: human\nenvironment_identity: ${packet.environmentIdentity}` };
  assert.equal(assessRunPreparation(input).state, "READY");
  assert.equal(readManualAttestation(comment, packet), true);
  assert.equal(readManualAttestation(comment, { ...packet, blob: "c".repeat(40) }), false);
  assert.equal(readManualAttestation(comment, { ...packet, environmentIdentity: "production" }), false);
  input.sql[0].environmentIdentity = "staging-generation-5";
  assert.equal(assessRunPreparation(input).state, "INCOMPLETE");
});
