import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTHORITY_SURFACE,
  createIssueExecutionBudgetController,
  createRunAuthorityAdapters,
  deriveExecuteIssueOperationIdentity,
  deriveRunOperationIdentity,
  modelDecisionInput,
  nextRepairWave,
  planCloseContinuation,
  planControl,
  reduceRun,
  reduceRunReadyHandoff,
} from "../../skills/personal/run-issue-workflow/scripts/delivery-authority.mjs";
import { createRunAuthorityAdapters as createRunAuthorityAdaptersSource } from "../../skills/personal/run-issue-workflow/scripts/run-authority-adapters.mjs";
import {
  planControl as planControlSource,
  reduceRun as reduceRunSource,
  reduceRunReadyHandoff as reduceRunReadyHandoffSource,
} from "../../skills/personal/run-issue-workflow/scripts/run-core.mjs";
import {
  deriveExecuteIssueOperationIdentity as deriveExecuteIssueOperationIdentitySource,
  deriveRunOperationIdentity as deriveRunOperationIdentitySource,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";
import { createIssueExecutionBudgetController as createIssueExecutionBudgetControllerSource } from "../../skills/personal/run-issue-workflow/scripts/issue-execution-budget.mjs";
import { modelDecisionInput as modelDecisionInputSource } from "../../skills/personal/run-issue-workflow/scripts/issue-model-policy.mjs";
import { nextRepairWave as nextRepairWaveSource } from "../../skills/personal/run-issue-workflow/scripts/recovery-evidence.mjs";
import { planCloseContinuation as planCloseContinuationSource } from "../../skills/personal/run-issue-workflow/scripts/close-continuation.mjs";

test("delivery authority is one trusted bundle-local seam without duplicate decisions", () => {
  assert.deepEqual(AUTHORITY_SURFACE, [
    "run-identity-and-grant",
    "operation-identity",
    "approved-scope-and-decomposition",
    "issue-execution-and-dispatch-budgets",
    "material-repair-budget-and-model-policy",
    "closeout-authority-and-writer-serialization",
    "cooperative-pause-graceful-stop-and-diagnosis",
  ]);

  assert.equal(createRunAuthorityAdapters, createRunAuthorityAdaptersSource);
  assert.equal(reduceRunReadyHandoff, reduceRunReadyHandoffSource);
  assert.equal(reduceRun, reduceRunSource);
  assert.equal(planControl, planControlSource);
  assert.equal(deriveRunOperationIdentity, deriveRunOperationIdentitySource);
  assert.equal(deriveExecuteIssueOperationIdentity, deriveExecuteIssueOperationIdentitySource);
  assert.equal(createIssueExecutionBudgetController, createIssueExecutionBudgetControllerSource);
  assert.equal(modelDecisionInput, modelDecisionInputSource);
  assert.equal(nextRepairWave, nextRepairWaveSource);
  assert.equal(planCloseContinuation, planCloseContinuationSource);

  const host = readFileSync("skills/personal/run-issue-workflow/scripts/codex-workflow.mjs", "utf8");
  const runtime = readFileSync("skills/personal/run-issue-workflow/scripts/run-workflow.mjs", "utf8");
  assert.match(host, /from "\.\/delivery-authority\.mjs"/u);
  assert.doesNotMatch(host, /from "\.\/workflow-operation-identity\.mjs"/u);
  assert.doesNotMatch(host, /from "\.\/run-journal\.mjs"/u);
  assert.doesNotMatch(host, /from "\.\/recovery-evidence\.mjs"/u);
  assert.match(runtime, /from "\.\/delivery-authority\.mjs"/u);
  assert.doesNotMatch(runtime, /from "\.\/run-authority-adapters\.mjs"/u);
});
