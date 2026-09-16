import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import * as authority from "../../skills/personal/run-issue-workflow/scripts/delivery-authority.mjs";

const repository = resolve(import.meta.dirname, "../..");
const scripts = join(repository, "skills/personal/run-issue-workflow/scripts");
const barrel = "delivery-authority.mjs";

// The Codex host boundary of this delivery package: host transport, task lifecycle, and presentation.
// Other packages keep their own entry points, so this seam invariant is package-scoped.
const hostModules = new Set([
  "run-store.mjs",
  "run-coordinator.mjs",
  "run-workflow.mjs",
  "run-panel.mjs",
  "run-panel-bridge.mjs",
  "delivery-progress.mjs",
  "lease-health.mjs",
  "run-batch.mjs",
  "run-preparation.mjs",
  "workflow-installation.mjs",
  "workflow-control-store.mjs",
  "workflow-repair-qualification.mjs",
  "installed-entry.mjs",
  "workflow-command.mjs",
]);
const hostModulePattern = /^(?:codex-|github-|gitlab-|run-panel)/u;
const isHostModule = name => hostModules.has(name) || hostModulePattern.test(name);

const relativeImports = (file) => {
  const source = readFileSync(join(scripts, file), "utf8");
  return [...source.matchAll(/from\s+"(\.[^"]+)"/gu)].map((match) => match[1].replace(/^\.\//u, ""));
};

const authorityClosure = () => {
  const visited = new Set();
  const pending = [barrel];
  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    for (const next of relativeImports(file)) {
      if (next.endsWith(".mjs")) pending.push(next);
    }
  }
  return visited;
};

test("every listed authority semantic names exactly one resolving primary export", () => {
  assert.deepEqual(Object.keys(authority.AUTHORITY_SURFACE).sort(), [
    "approved-scope-and-decomposition",
    "closeout-authority-and-writer-serialization",
    "cooperative-pause-graceful-stop-and-diagnosis",
    "issue-execution-and-dispatch-budgets",
    "material-repair-budget-and-model-policy",
    "operation-identity",
    "run-identity-and-grant",
  ]);

  const seen = new Map();
  const unresolved = [];
  const duplicated = [];
  for (const [semantic, names] of Object.entries(authority.AUTHORITY_SURFACE)) {
    assert.ok(names.length > 0, `${semantic} declares no owning export`);
    for (const name of names) {
      if (!(name in authority)) unresolved.push(`${semantic} -> ${name}`);
      if (seen.has(name)) duplicated.push(`${name} (${seen.get(name)}, ${semantic})`);
      seen.set(name, semantic);
    }
  }
  assert.deepEqual(unresolved, [], "every declared authority semantic must resolve to its export");
  assert.deepEqual(duplicated, [], "one primary semantic per authority export");
});

test("the bundle-local authority entry reaches no Codex host, task-lifecycle or presentation code", () => {
  const closure = authorityClosure();
  assert.ok(closure.has("journal-event-schema.mjs"), "the authority entry owns the journal event schemas");
  assert.ok(closure.has("recovery-compatibility.mjs"), "the authority entry owns recovery compatibility");
  assert.ok(!closure.has("run-store.mjs"), "the host run store is not authority code");

  const reachableHost = [...closure].filter(isHostModule).sort();
  assert.deepEqual(reachableHost, [], "authority code must not depend on the host boundary");
});

test("no production module of this package outside the entry imports an authority module directly", () => {
  const ownerModules = new Set([...authorityClosure()].filter((name) => name !== barrel));
  const offenders = [];
  for (const file of readdirSync(scripts).filter((name) => name.endsWith(".mjs"))) {
    if (file === barrel || ownerModules.has(file)) continue;
    for (const next of relativeImports(file)) {
      if (ownerModules.has(next)) offenders.push(`${file} -> ${next}`);
    }
  }
  assert.deepEqual(offenders, [], "the bundle-local entry is this package's only authority seam");
});

test("moved decisions live in authority code instead of the Codex host boundary", () => {
  assert.equal(typeof authority.assessRecoveryCompatibility, "function");
  assert.equal(typeof authority.validateTaskOutcomeReceipt, "function");
  assert.equal(typeof authority.validateDeliveryProgress, "function");
  assert.equal(typeof authority.createTaskOutcomeReceipt, "function");

  const journal = readFileSync(join(scripts, "run-journal.mjs"), "utf8");
  assert.match(journal, /from "\.\/journal-event-schema\.mjs"/u);
  assert.doesNotMatch(journal, /task-outcome-receipt|delivery-progress/u);

  assert.equal(existsSync(join(scripts, "task-outcome-receipt.mjs")), false);
});

test("the authority entry preserves every budget and policy constant verbatim", () => {
  assert.equal(authority.ISSUE_EXECUTION_LIMIT_MS, 6 * 60 * 60 * 1000);
  assert.equal(authority.DEFAULT_MAX_PARALLEL, 3);
  assert.equal(authority.MAX_TASK_OUTCOME_RECEIPT_BYTES, 16 * 1024);
  assert.equal(authority.MAX_HOST_ENCODED_RESPONSE_BYTES, 1024 * 1024);
});
