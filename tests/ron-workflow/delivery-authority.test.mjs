import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import * as authority from "../../skills/personal/run-issue-workflow/scripts/delivery-authority.mjs";

const repository = resolve(import.meta.dirname, "../..");
const scripts = join(repository, "skills/personal/run-issue-workflow/scripts");
const barrel = "delivery-authority.mjs";

// Modules the Issue names as the Codex host boundary: transport, task lifecycle and presentation.
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
    const name = file.replace(/\.mjs$/u, ".mjs");
    if (visited.has(name)) continue;
    visited.add(name);
    for (const next of relativeImports(name)) {
      if (next.endsWith(".mjs")) pending.push(next);
    }
  }
  return visited;
};

test("the delivery authority surface resolves to real exports of one bundle-local entry", () => {
  assert.deepEqual(Object.keys(authority.AUTHORITY_SURFACE).sort(), [
    "approved-scope-and-decomposition",
    "closeout-authority-and-writer-serialization",
    "cooperative-pause-graceful-stop-and-diagnosis",
    "issue-execution-and-dispatch-budgets",
    "material-repair-budget-and-model-policy",
    "operation-identity",
    "run-identity-and-grant",
  ]);

  const unresolved = [];
  for (const [semantic, names] of Object.entries(authority.AUTHORITY_SURFACE)) {
    assert.ok(names.length > 0, `${semantic} declares no owning export`);
    for (const name of names) {
      if (!(name in authority)) unresolved.push(`${semantic} -> ${name}`);
    }
  }
  assert.deepEqual(unresolved, [], "every declared authority semantic must resolve to its export");
});

test("the bundle-local authority entry reaches no Codex host, task-lifecycle or presentation code", () => {
  const closure = authorityClosure();
  assert.ok(closure.has("journal-event-schema.mjs"), "the authority entry owns the journal event schemas");
  assert.ok(closure.has("recovery-compatibility.mjs"), "the authority entry owns recovery compatibility");
  assert.ok(!closure.has("run-store.mjs"), "the host run store is not authority code");

  const reachableHost = [...closure].filter(isHostModule).sort();
  assert.deepEqual(reachableHost, [], "authority code must not depend on the host boundary");
});

test("no production module outside the entry imports an authority module directly", () => {
  const closure = authorityClosure();
  const ownerModules = new Set([...closure].filter((name) => name !== barrel));
  const offenders = [];
  for (const file of readdirSync(scripts).filter((name) => name.endsWith(".mjs"))) {
    if (file === barrel || ownerModules.has(file)) continue;
    for (const next of relativeImports(file)) {
      if (ownerModules.has(next)) offenders.push(`${file} -> ${next}`);
    }
  }
  assert.deepEqual(offenders, [], "the bundle-local entry is the only authority seam");
});

test("moved decisions live in authority code instead of the Codex host boundary", () => {
  assert.equal(typeof authority.assessRecoveryCompatibility, "function");
  assert.equal(typeof authority.validateTaskOutcomeReceipt, "function");
  assert.equal(typeof authority.validateDeliveryProgress, "function");
  assert.equal(typeof authority.createTaskOutcomeReceipt, "function");

  const composition = readFileSync(join(scripts, "codex-workflow.mjs"), "utf8");
  assert.doesNotMatch(composition, /export function assessRecoveryCompatibility/u);
  assert.match(composition, /export \{ assessRecoveryCompatibility \} from "\.\/delivery-authority\.mjs";/u);

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
