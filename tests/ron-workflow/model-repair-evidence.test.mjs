import assert from "node:assert/strict";
import test from "node:test";
import { validateRepairYield, readModelRepairBaseline } from "../../skills/personal/run-issue-workflow/scripts/model-repair-evidence.mjs";
import { readRepairProgress, nextRepairWave } from "../../skills/personal/run-issue-workflow/scripts/recovery-evidence.mjs";
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
    x => { x.executionProgress[0].record.repairWaveCount = 8; },
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

test("model and recovery readers share cumulative progress without sharing upgrade authority", async () => {
  const evidence = handoff();
  evidence.repairWaves = 7;
  evidence.waves = evidence.waves.map((wave, index) => ({ ...wave, number: index + 6,
    progress: { identity: `IC_progress_${index + 6}`, bodySha256: "sha256:" + String(index + 6).repeat(64) } }));
  const input = options(evidence);
  const priorRecovery = { identity: "IC_recovery_5", bodySha256: "sha256:" + "5".repeat(64),
    record: { kind: "implementation_progress", issueId: "I_1", operationIdentity, repairWaveCount: 5 } };
  const records = [priorRecovery, ...input.executionProgress];
  const retained = structuredClone(records);
  const source = { records, lifecycle: [], journal: [], issueId: "I_1", operationId: operationIdentity.key };
  input.recordedRepairWaves = readModelRepairBaseline(source);
  assert.equal(input.recordedRepairWaves, 5, "model-specific progress cannot manufacture its own earlier baseline");
  assert.equal((await validateRepairYield(input)).repairWaves, 7);
  const cumulative = readRepairProgress({ records, issueId: "I_1", operationId: operationIdentity.key, count: 2 });
  assert.equal(cumulative, 7, "recovery consumes the model execution owner's newer cumulative progress");
  assert.equal(readRepairProgress({ records: [...records, { ...records[1], identity: "IC_duplicate_model_progress" }],
    issueId: "I_1", operationId: operationIdentity.key, count: 2 }), 7, "an exact older model-progress copy is idempotent");
  assert.throws(() => readRepairProgress({ records: [...records, { ...records[1],
    record: { ...records[1].record, before: "d".repeat(40) } }], issueId: "I_1", operationId: operationIdentity.key, count: 2 }), /Conflicting execution progress/u);
  assert.equal(nextRepairWave({ failure: { issueId: "I_1", repairWaveCount: cumulative }, journal: [] }), 8);
  await assert.rejects(validateRepairYield({ ...input, executionProgress: input.executionProgress.slice(1) }), /progress is missing/u);
  await assert.rejects(validateRepairYield({ ...input, executionProgress: input.executionProgress.map(item => ({ ...item,
    record: { ...item.record, taskRef: { threadId: "foreign", hostId: "local" } } })) }), /identity or cumulative count differs/u);
  assert.equal(readModelRepairBaseline({ ...source, lifecycle: [{ record: { repairWaveCount: 8 } }] }), 8);
  assert.equal(readModelRepairBaseline({ ...source, journal: [{ type: "recovery.intent", issueId: "I_1", phase: "REPAIR", wave: 9 }] }), 9);
  const later = { ...priorRecovery, identity: "IC_recovery_8", record: { ...priorRecovery.record, repairWaveCount: 8 } };
  const laterBaseline = readModelRepairBaseline({ ...source, records: [...records, later] });
  await assert.rejects(validateRepairYield({ ...input, recordedRepairWaves: laterBaseline }), /cumulative repair budget/u);
  assert.throws(() => readModelRepairBaseline({ ...source, records: [{ ...priorRecovery,
    record: { ...priorRecovery.record, repairWaves: 4 } }] }), /conflicting/u);
  assert.deepEqual(records, retained, "neither consumer rewrites historical kinds, fields or body evidence");
});
