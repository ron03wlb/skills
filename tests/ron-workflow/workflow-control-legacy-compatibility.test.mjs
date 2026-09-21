import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createWorkflowControlStore } from "../../skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs";

const currentIdentity = {
  repositoryId: "github:example/repo",
  specId: "1",
  producerCommand: "to-spec",
  operationId: "operation-1",
  profileVersion: "v2",
  target: "main",
  baseline: "a".repeat(40),
  bindings: { approvedScopeIdentity: `sha256:${"b".repeat(64)}` },
};
const legacyIdentity = {
  repositoryId: "github:example/repo",
  producerCommand: "to-spec",
  specOperationId: "1:operation-1",
  target: "main",
  baseline: "a".repeat(40),
  initialTargetState: "CLEAN",
  planPath: "docs/plans/spec-1.md",
  generatedContentIdentity: `sha256:${"b".repeat(64)}`,
};

test("current checkpoint operations never start legacy compatibility", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-current-no-legacy-"));
  const gitCommonDir = join(root, ".git");
  mkdirSync(gitCommonDir);
  let calls = 0;
  const store = createWorkflowControlStore({
    gitCommonDir,
    legacyCompatibility: () => { calls += 1; },
  });
  try {
    const created = store.createCheckpoint(currentIdentity);
    assert.equal(created.schema, "workflow-checkpoint-transaction:v2");
    assert.equal(store.readCheckpoint(currentIdentity).transactionId, created.transactionId);
    assert.equal(calls, 0);
    assert.equal(store.readCheckpoint(legacyIdentity), null);
    assert.equal(calls, 1, "legacy compatibility starts only after a legacy identity is detected");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
