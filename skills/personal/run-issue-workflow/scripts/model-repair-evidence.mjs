import { assertWorkflowOperationIdentity } from "./workflow-operation-identity.mjs";
import { modelEvidenceDigest } from "./issue-model-policy.mjs";

const sameTask = (left, right) => left?.threadId === right?.threadId && left?.hostId === right?.hostId;
const commit = value => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value);
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const confirmed = value => value?.classification === "confirmed" && value.inScope === true
  && ["Standards", "Spec"].includes(value.axis) && [value.identity, value.governingSource, value.summary].every(nonempty);

// Callbacks read reviewer-owned reports, execution-owned verification receipts and actual Git.
// A handoff's self-reported success fields alone cannot pass this boundary.
export async function validateRepairYield({ evidence, runIdentity, issueId, taskRef, operationIdentity,
  task, recordedRepairWaves, inspectGit, readVerification, readReview }) {
  if (evidence?.schema !== "issue-model-yield:v1" || evidence.runId !== runIdentity.runId || evidence.issueId !== issueId
    || evidence.target !== runIdentity.target || !sameTask(evidence.taskRef, taskRef)
    || task?.state !== "RESUMABLE" || evidence.writesStopped !== true || task.cwd !== evidence.worktree
    || !nonempty(evidence.topic) || !commit(evidence.candidate)) throw new Error("Model yield requires the same stopped native task and candidate lane");
  assertWorkflowOperationIdentity(evidence.operationIdentity, operationIdentity);
  if (!Number.isInteger(evidence.repairWaves) || evidence.repairWaves < 2 || evidence.repairWaves >= 10
    || !confirmed(evidence.finding)) throw new Error("Model yield lacks an in-scope Confirmed finding or remaining repair capacity");
  if (!Number.isInteger(recordedRepairWaves) || recordedRepairWaves < 0 || recordedRepairWaves >= 10
    || evidence.repairWaves < recordedRepairWaves) throw new Error("Model yield contradicts the recorded cumulative repair budget");
  const waves = evidence.waves;
  if (!Array.isArray(waves) || waves.length !== 2 || waves[0].number !== evidence.repairWaves - 1
    || waves[1].number !== evidence.repairWaves || waves[1].before !== waves[0].candidate
    || waves[1].candidate !== evidence.candidate || waves.some(wave => !commit(wave.before) || !commit(wave.candidate) || wave.before === wave.candidate)) {
    throw new Error("Model yield requires two consecutive complete repair waves");
  }
  const git = await inspectGit(evidence);
  if (!git.clean || !git.consecutive || git.topic !== evidence.topic || git.candidate !== evidence.candidate
    || git.changedWaves?.length !== 2 || !git.changedWaves.every(value => value === true)) throw new Error("Material code changes and clean fixed candidate are unproven");
  for (const wave of waves) {
    if (!Array.isArray(wave.verification) || !wave.verification.length) throw new Error("A repair wave requires renewed verification");
    for (const reference of wave.verification) {
      const receipt = await readVerification(reference, wave);
      if (receipt?.schema !== "issue-verification:v1" || receipt.key !== reference.key || receipt.candidate !== wave.candidate
        || receipt.exitCode !== 0 || !Array.isArray(receipt.command) || !receipt.command.length || !receipt.command.every(nonempty)) {
        throw new Error("Repair verification is not a passing candidate-bound owner receipt");
      }
    }
    if (!Array.isArray(wave.reviews) || wave.reviews.length !== 2
      || new Set(wave.reviews.map(value => value.axis)).size !== 2
      || new Set(wave.reviews.map(value => value.reviewerId)).size !== 2) throw new Error("Repair requires both independent review axes");
    for (const reference of wave.reviews) {
      if (!["Standards", "Spec"].includes(reference.axis) || !nonempty(reference.reviewerId)
        || reference.reviewerId === taskRef.threadId) throw new Error("Repair review must be independent of execution");
      const review = await readReview(reference, wave);
      if (review?.schema !== "issue-repair-review:v1" || review.candidate !== wave.candidate || review.axis !== reference.axis
        || review.reviewerId !== reference.reviewerId || review.materialChange !== true || !Array.isArray(review.findings)) throw new Error("Renewed independent review evidence is incomplete");
      if (reference.axis === evidence.finding.axis) {
        const matching = review.findings.filter(item => item.identity === evidence.finding.identity);
        if (matching.length !== 1 || !confirmed(matching[0])
          || modelEvidenceDigest(matching[0]) !== modelEvidenceDigest(evidence.finding)) throw new Error("The same Confirmed finding did not persist through both repair waves");
      }
    }
  }
  return { ...evidence, yieldIdentity: modelEvidenceDigest(evidence) };
}
