import assert from "node:assert/strict";
import test from "node:test";
import { validateRepairYield } from "../../skills/personal/run-issue-workflow/scripts/model-repair-evidence.mjs";
import { deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const runIdentity = { runId: "run", specId: "I_1", target: "main", approvedScopeHash: "approved" };
const taskRef = { threadId: "worker", hostId: "local" };
const operationIdentity = deriveExecuteIssueOperationIdentity({ repositoryId: "github:owner/repo", specId: "I_1", issueId: "I_1", approvedPublicationIdentity: "approved" });
const finding = { identity: "F1", axis: "Spec", governingSource: "AC-1", summary: "A confirmed access-control defect remains", classification: "confirmed", inScope: true };
const handoff = () => ({ schema: "issue-model-yield:v1", runId: "run", issueId: "I_1", operationIdentity,
  target: "main", worktree: "/lane", topic: "topic", taskRef, candidate: "c".repeat(40), repairWaves: 2, writesStopped: true, finding: structuredClone(finding),
  waves: [1, 2].map(number => ({ number, before: (number === 1 ? "a" : "b").repeat(40), candidate: (number === 1 ? "b" : "c").repeat(40),
    progress: { identity: `IC_progress_${number}`, bodySha256: "sha256:" + String(number).repeat(64) },
    verification: [{ key: String(number).repeat(64), bodySha256: "sha256:" + String(number).repeat(64) }],
    reviews: ["Standards", "Spec"].map(axis => ({ reviewerId: axis, bodySha256: axis, axis })) })) });
const options = evidence => ({ evidence, runIdentity, issueId: "I_1", taskRef, operationIdentity,
  recordedRepairWaves: 0,
  executionProgress: evidence.waves.map(wave => ({ ...wave.progress, record: {
    kind: "implementation_repair_progress", operationIdentity, runId: "run", issueId: "I_1", specId: "I_1", target: "main",
    taskRef, worktree: "/lane", topic: "topic", before: wave.before, repairWaves: wave.number,
  } })),
  task: { state: "RESUMABLE", cwd: "/lane" },
  inspectGit: async () => ({ candidate: evidence.candidate, topic: "topic", clean: true, consecutive: true, changedWaves: [true, true] }),
  readVerification: async (reference, wave) => ({ schema: "issue-verification:v1", candidate: wave.candidate, exitCode: 0, command: ["node", "--test"], key: reference.key }),
  readReview: async (reference, wave) => ({ schema: "issue-repair-review:v1", reviewerId: reference.reviewerId, axis: reference.axis, candidate: wave.candidate, materialChange: true, findings: reference.axis === "Spec" ? [finding] : [] }),
});

test("upgrade evidence requires two consecutive material verified/reviewed waves and a stopped native writer", async () => {
  assert.equal((await validateRepairYield(options(handoff()))).repairWaves, 2);
  for (const mutate of [
    x => { x.task.state = "RUNNING"; },
    x => { x.evidence.writesStopped = false; },
    x => { x.evidence.waves[1].number = 3; },
    x => { x.evidence.finding.classification = "advisory"; },
    x => { x.evidence.finding.inScope = false; },
    x => { x.recordedRepairWaves = 10; },
    x => { x.recordedRepairWaves = 3; },
    x => { x.recordedRepairWaves = undefined; },
    x => { x.executionProgress = []; },
    x => { x.executionProgress.unshift({ ...x.executionProgress[0], identity: "IC_prior_wave_one",
      record: { ...x.executionProgress[0].record, before: "d".repeat(40) } }); },
    x => { x.executionProgress.push({ ...x.executionProgress[1], identity: "IC_later_wave_three",
      record: { ...x.executionProgress[1].record, before: "c".repeat(40), repairWaves: 3 } }); },
    x => { x.executionProgress[0].record.taskRef = { threadId: "foreign", hostId: "local" }; },
    x => { x.evidence.waves[1].progress.bodySha256 = "sha256:" + "f".repeat(64); },
    x => { x.inspectGit = async () => ({ clean: true, consecutive: true, candidate: x.evidence.candidate, topic: "topic", changedWaves: [true, false] }); },
    x => { x.readVerification = async () => ({ candidate: "b".repeat(40), exitCode: 1 }); },
    x => { x.readReview = async () => ({ candidate: x.evidence.candidate, findings: [] }); },
  ]) {
    const value = options(handoff()); mutate(value);
    await assert.rejects(validateRepairYield(value));
  }
});

test("ordinary repair re-entry preserves consumed earlier waves and exact repeated progress", async () => {
  const original = handoff();
  const later = { ...handoff(), candidate: "d".repeat(40), repairWaves: 3,
    waves: [original.waves[1], { ...original.waves[1], number: 3, before: "c".repeat(40), candidate: "d".repeat(40),
      progress: { identity: "IC_progress_3", bodySha256: "sha256:" + "3".repeat(64) } }],
  };
  const input = options(later);
  input.executionProgress.unshift(options(original).executionProgress[0]);
  input.executionProgress.push({ ...input.executionProgress[0], identity: "IC_identical_progress_copy" });
  assert.equal((await validateRepairYield(input)).repairWaves, 3);
  input.executionProgress = input.executionProgress.filter(item => item.record.repairWaves !== 1);
  await assert.rejects(validateRepairYield(input), /Prior execution repair progress is missing/u);
});
