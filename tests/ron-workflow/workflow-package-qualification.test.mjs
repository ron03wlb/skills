import assert from "node:assert/strict";
import test from "node:test";

import { runWorkflowRepairQualification } from "../../skills/personal/run-issue-workflow/scripts/workflow-repair-qualification.mjs";

test("the package-owned qualification replays the WSL repair stages through current workflow bytes",
  { timeout: 180000 }, async () => {
    const packageVersionId = "a".repeat(64);
    const results = await runWorkflowRepairQualification({ packageVersionId });
    assert.deepEqual(results.map(result => result.stage), [
      "settled-host-cleanup-routing", "stable-close-identity", "posix-worktree-cleanup",
    ]);
    assert.ok(results.every(result => result.packageVersionId === packageVersionId && result.result === "PASS"));
  });
