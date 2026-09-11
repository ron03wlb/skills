import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MAX_TASK_OUTCOME_RECEIPT_BYTES,
  TASK_OUTCOME_RECEIPT_SCHEMA,
  createTaskOutcomeReceipt,
  validateTaskOutcomeReceipt,
} from "../../skills/personal/run-issue-workflow/scripts/task-outcome-receipt.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

const input = {
  runId: "workflow-op-v1-" + "1".repeat(64),
  issueId: "I_issue",
  operationId: "workflow-op-v1-" + "2".repeat(64),
  requestIdentity: "dispatch:2",
  taskRef: { threadId: "thread-90", hostId: "local" },
  producer: {
    name: "codex-host",
    revision: "a".repeat(40),
    packageVersion: "b".repeat(64),
  },
  phase: "IMPLEMENTATION",
  disposition: "SUCCEEDED",
  candidate: null,
  evidence: [{
    kind: "native-settlement",
    locator: "codex-task://local/thread-90?revision=sha256:" + "6".repeat(64),
    digest: "sha256:" + "3".repeat(64),
  }],
  effects: { pending: [], accepted: [] },
  failureFingerprint: null,
  progress: {
    executionStartedAt: "2026-09-11T00:00:00.000Z",
    lastVerifiedProgressAt: "2026-09-11T00:04:00.000Z",
    terminalObservedAt: "2026-09-11T00:04:00.000Z",
  },
  budget: {
    encodedResponseBytes: 512,
    maxEncodedResponseBytes: 1_048_576,
    fullHistoryReads: 0,
    maxFullHistoryReads: 4,
  },
  nativeRevision: "sha256:" + "6".repeat(64),
};

test("task outcome receipt is versioned, exact, compact and identity-bound", () => {
  const receipt = createTaskOutcomeReceipt(input);
  assert.equal(receipt.schema, TASK_OUTCOME_RECEIPT_SCHEMA);
  assert.match(receipt.identity, /^sha256:[a-f0-9]{64}$/u);
  assert.ok(Buffer.byteLength(JSON.stringify(receipt), "utf8") <= MAX_TASK_OUTCOME_RECEIPT_BYTES);
  assert.deepEqual(validateTaskOutcomeReceipt(receipt), receipt);
  assert.equal(createTaskOutcomeReceipt(input).identity, receipt.identity);
  assert.equal(JSON.stringify(receipt).includes("raw-host-cursor"), false);
});

test("task outcome receipt rejects payload fields and oversize locator text before publication", () => {
  const receipt = createTaskOutcomeReceipt(input);
  assert.throws(() => validateTaskOutcomeReceipt({ ...receipt, workerOutput: "do this" }), /unknown field workerOutput/u);
  assert.throws(() => createTaskOutcomeReceipt({ ...input, effects: { pending: ["run these instructions"], accepted: [] } }),
    /effects\.pending/iu);
  assert.throws(() => createTaskOutcomeReceipt({ ...input, nativeRevision: "raw-host-cursor" }), /opaque digest/u);
  assert.throws(() => createTaskOutcomeReceipt({ ...input, disposition: "RUNNING",
    progress: { ...input.progress, terminalObservedAt: null }, failureFingerprint: "sha256:" + "8".repeat(64) }),
  /terminal or failure evidence/iu);
  assert.throws(() => createTaskOutcomeReceipt({ ...input,
    effects: { pending: ["sha256:" + "9".repeat(64)], accepted: ["sha256:" + "9".repeat(64)] } }),
  /both pending and accepted/iu);
  assert.throws(() => createTaskOutcomeReceipt({
    ...input,
    evidence: [{ ...input.evidence[0], locator: `codex-task://local/${"x".repeat(MAX_TASK_OUTCOME_RECEIPT_BYTES)}` }],
  }), /locator|byte budget/iu);
});

test("task outcome receipt distinguishes exceptional dispositions and missing evidence", () => {
  const receipt = createTaskOutcomeReceipt({
    ...input,
    disposition: "RESPONSE_BUDGET_EXCEEDED",
    failureFingerprint: "sha256:" + "4".repeat(64),
    evidence: [{
      kind: "missing-evidence",
      locator: "codex-host://response/thread-90",
      digest: "sha256:" + "5".repeat(64),
    }],
    progress: { ...input.progress, terminalObservedAt: null },
    budget: { ...input.budget, encodedResponseBytes: 512, maxEncodedResponseBytes: 256 },
  });
  assert.equal(receipt.disposition, "RESPONSE_BUDGET_EXCEEDED");
  assert.equal(receipt.evidence[0].kind, "missing-evidence");
  assert.throws(() => createTaskOutcomeReceipt({
    ...input,
    disposition: "RESPONSE_BUDGET_EXCEEDED",
    failureFingerprint: "sha256:" + "4".repeat(64),
    evidence: [{ kind: "missing-evidence", locator: "codex-host://response/thread-90",
      digest: "sha256:" + "5".repeat(64) }],
    progress: { ...input.progress, terminalObservedAt: null },
    budget: { ...input.budget, encodedResponseBytes: 512, maxEncodedResponseBytes: 256,
      fullHistoryReads: 5, maxFullHistoryReads: 4 },
  }), /observation budget/iu);
});

test("existing Run journal persists one exact task outcome receipt and rejects tampering", () => {
  const root = mkdtempSync(join(tmpdir(), "task-outcome-journal-"));
  const store = createRunStore({ gitCommonDir: join(root, ".git") });
  const writer = store.acquireWriter(input.runId);
  const receipt = createTaskOutcomeReceipt(input);
  try {
    const runIdentity = { runId: input.runId, specId: "I_spec", approvedScopeHash: "sha256:scope",
      target: "features/ron", classification: "SINGLE", decompositionIdentity: null };
    writer.append({ type: "grant.recorded", at: "2026-09-11T00:00:00.000Z", runIdentity,
      workflowVersion: { id: input.producer.packageVersion, sourceCommit: input.producer.revision,
        sourceRepository: "C:/installed/skills", protocolVersion: 1 } });
    const dispatch = writer.append({ type: "dispatch.recorded", at: "2026-09-11T00:00:01.000Z",
      issueId: input.issueId, attempt: 1, taskRef: input.taskRef });
    writer.append({ type: "execution.started", at: input.progress.executionStartedAt, issueId: input.issueId,
      phase: input.phase, phaseIdentity: `dispatch:${dispatch.sequence}`, taskRef: input.taskRef });
    writer.append({ type: "task.outcome", at: input.progress.terminalObservedAt, receipt });
    assert.deepEqual(store.readEvents(input.runId).at(-1).receipt, receipt);
    const regressed = createTaskOutcomeReceipt({ ...input, disposition: "RUNNING",
      progress: { ...input.progress, terminalObservedAt: null }, nativeRevision: "sha256:" + "7".repeat(64) });
    assert.throws(() => writer.append({ type: "task.outcome", at: "2026-09-11T00:05:00.000Z",
      receipt: regressed }), /monotonic settlement/iu);
    assert.throws(() => writer.append({ type: "task.outcome", at: input.progress.terminalObservedAt,
      receipt: { ...receipt, issueId: "foreign" } }), /identity|differs/iu);
  } finally {
    writer.release();
    rmSync(root, { recursive: true, force: true });
  }
});
