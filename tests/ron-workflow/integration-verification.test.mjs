import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIntegrationVerification } from "../../skills/engineering/execute-issue/scripts/verification-cache.mjs";

test("integration obligations preserve unknown outcomes, reevaluate changed inputs and reject incomplete PASS evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "integration-evidence-"));
  const binding = { gitCommonDir: root, operationId: "operation", issueId: "I_1", candidate: "a".repeat(40) };
  const owner = () => createIntegrationVerification(binding);
  let input = 1, calls = 0;
  const check = { command: ["check"], environment: { runtime: "fixture" }, readExternalInputs: async () => ({ input }),
    run: async () => { calls++; throw new Error("lost process result"); } };
  const verify = checks => owner().verify({ targetHead: "b".repeat(40), checks, repository: root, assertCurrent() {} });
  try {
    const unknown = await verify([check]);
    assert.equal(unknown.state, "UNKNOWN");
    assert.equal((await verify([check])).identity, unknown.identity);
    assert.equal(calls, 1, "restart must not assume the first command failed or rerun it");
    input++;
    check.run = async () => { calls++; return { exitCode: 0 }; };
    assert.equal((await verify([check])).state, "PASS");
    assert.equal(calls, 2, "changed relevant inputs require fresh evaluation");
    input++;
    check.readExternalInputs = async () => { throw new Error("external input unavailable before command"); };
    await assert.rejects(verify([check]), /external input unavailable/u);
    assert.equal(owner().read().current, undefined, "lost reevaluation must invalidate old PASS before reading inputs");
    check.readExternalInputs = async () => ({ input });
    await verify([check]);
    const directory = join(root, "workflow-verification", "operation");
    const file = join(directory, readdirSync(directory).find(name => name.endsWith(".json")));
    const retained = readFileSync(file, "utf8");
    const malformed = JSON.parse(retained); malformed.current.results = [];
    writeFileSync(file, JSON.stringify(malformed));
    assert.throws(() => owner().read(), /summary/u);
    writeFileSync(file, retained);
    const altered = JSON.parse(retained); altered.attempts[0].inputs.external.input = 999;
    writeFileSync(file, JSON.stringify(altered));
    assert.throws(() => owner().read(), /malformed/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
