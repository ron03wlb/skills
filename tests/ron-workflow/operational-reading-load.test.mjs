import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("Issue 67 keeps both operational entries bounded and every selected reading path lower", () => {
  const result = JSON.parse(execFileSync("node", ["scripts/measure-operational-reading-load.mjs"], { encoding: "utf8" }));
  assert.equal(result.baseline, "9714cce428597f9ec5edc4b3665d2c0d1f9d7697");
  assert.match(result.convention, /Whitespace-delimited.*full UTF-8.*count once/u);
  assert.ok(result.entries.toSpec <= 1200, `to-spec is ${result.entries.toSpec} words`);
  assert.ok(result.entries.closeIssue <= 1200, `close-issue is ${result.entries.closeIssue} words`);
  assert.deepEqual(result.scenarios.map(({ name }) => name), [
    "fresh-single-publication",
    "fresh-multi-publication",
    "executable-close",
    "parent-only-close",
  ]);
  for (const scenario of result.scenarios) {
    assert.equal(new Set(scenario.baselinePaths).size, scenario.baselinePaths.length, `${scenario.name} duplicates a baseline file`);
    assert.equal(new Set(scenario.candidatePaths).size, scenario.candidatePaths.length, `${scenario.name} duplicates a candidate file`);
    assert.ok(scenario.candidateWords < scenario.baselineWords, `${scenario.name}: ${scenario.candidateWords} is not below ${scenario.baselineWords}`);
  }
});
