import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const repository = resolve(import.meta.dirname, "../..");

// The Codex-native installed entry was retired with the host boundary; the surviving installed-package
// fixtures keep exactly this command-isolation guarantee: no fixture may replace or import the
// process-global command implementation.
const migratedFixtures = [
  "github-revision-lifecycle.test.mjs",
];

test("surviving installed-package fixtures keep command isolation without process-global mutation", () => {
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
