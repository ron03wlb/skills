import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runWorkflowCommand } from "../../skills/personal/run-issue-workflow/scripts/workflow-command.mjs";

const repository = resolve(import.meta.dirname, "../..");
const installedEntryTest = join(
  repository,
  "tests/ron-workflow/installed-entry.test.mjs",
);
// The complete installed-entry file proves this many top-level gates; every execution of the
// complete file bytes must retain all of them.
const expectedInstalledEntryTests = 29;
const migratedFixtures = [
  "installed-entry.test.mjs",
  "github-workflow-sources.test.mjs",
  "github-revision-lifecycle.test.mjs",
  "technical-recovery-lifecycle.test.mjs",
];
const runNodeTest = (paths) => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return runWorkflowCommand(process.execPath, ["--test", ...paths], {
    cwd: repository,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env,
    // Two complete executions take about two minutes here; a hung execution is killed
    // rather than blocking the whole suite with no diagnostic.
    timeout: 1_200_000,
  });
};
const summaryTotal = (output, label) => {
  const matches = [
    ...output.matchAll(new RegExp(`^ℹ ${label} (\\d+)$`, "gmu")),
  ];
  assert.ok(
    matches.length >= 1,
    `expected a ${label} summary in the run output`,
  );
  return matches.reduce((total, match) => total + Number(match[1]), 0);
};

test("the complete installed-entry file is repeatable without process-global command mutation", () => {
  // A repeated identical path may be deduplicated by the test runner, so the second execution
  // is discovered by its aggregate count and, when deduplicated, forced through a symlinked
  // copy: one command, the complete file bytes, twice.
  let output = runNodeTest([installedEntryTest, installedEntryTest]);
  if (summaryTotal(output, "tests") !== expectedInstalledEntryTests * 2) {
    const linkDirectory = mkdtempSync(
      join(tmpdir(), "installed-entry-repeat-"),
    );
    try {
      const link = join(linkDirectory, "installed-entry.test.mjs");
      symlinkSync(installedEntryTest, link, "file");
      output = runNodeTest([installedEntryTest, link]);
    } finally {
      rmSync(linkDirectory, { recursive: true, force: true });
    }
  }
  const expectedTotal = expectedInstalledEntryTests * 2;
  assert.equal(
    summaryTotal(output, "tests"),
    expectedTotal,
    `one command must execute the complete file twice; expected ${expectedTotal} tests`,
  );
  assert.equal(
    summaryTotal(output, "pass"),
    expectedTotal,
    `every execution must retain every assertion; expected ${expectedTotal} passes`,
  );
  assert.equal(
    summaryTotal(output, "fail"),
    0,
    "no execution may report a failure",
  );
  assert.equal(
    output.match(/^✔ /gmu)?.length ?? 0,
    expectedTotal,
    "every gate in both executions must report a pass",
  );
  for (const fixture of migratedFixtures) {
    const source = readFileSync(
      join(repository, "tests/ron-workflow", fixture),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /syncBuiltinESMExports/u,
      `${fixture} must not synchronize a mutated built-in export`,
    );
    assert.doesNotMatch(
      source,
      /childProcess\.execFileSync\s*=/u,
      `${fixture} must not replace the process-global command implementation`,
    );
    assert.doesNotMatch(
      source,
      /import\s+(?:\*\s+as\s+)?childProcess\b/u,
      `${fixture} must not import the process-global command implementation`,
    );
  }
});
