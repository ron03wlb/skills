import assert from "node:assert/strict";
import test from "node:test";

import { runWorkflowRepairQualification } from "../../skills/personal/run-issue-workflow/scripts/workflow-repair-qualification.mjs";

test("the package-owned qualification replays all original failed stages through current workflow bytes",
  { skip: process.platform !== "win32", timeout: 180000 }, async () => {
    const packageVersionId = "a".repeat(64);
    const results = await runWorkflowRepairQualification({ packageVersionId });
    assert.deepEqual(results.map(result => result.stage), [
      "settled-host-cleanup-routing", "stable-close-identity", "interrupted-helper-continuation",
    ]);
    assert.ok(results.every(result => result.packageVersionId === packageVersionId && result.result === "PASS"));
  });
