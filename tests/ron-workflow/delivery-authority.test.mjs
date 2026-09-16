import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import * as authority from "../../skills/personal/run-issue-workflow/scripts/delivery-authority.mjs";

const repository = resolve(import.meta.dirname, "../..");
const scripts = join(repository, "skills/personal/run-issue-workflow/scripts");
const barrel = "delivery-authority.mjs";

// The exhaustive authority closure. Adding a module here is a deliberate ownership decision, so a new
// host, task-lifecycle or presentation dependency cannot enter the bundle-local surface unnoticed.
const expectedAuthorityModules = [
  "close-continuation.mjs",
  "issue-execution-budget.mjs",
  "issue-model-policy.mjs",
  "journal-event-schema.mjs",
  "model-repair-evidence.mjs",
  "recovery-compatibility.mjs",
  "recovery-evidence.mjs",
  "run-authority-adapters.mjs",
  "run-core.mjs",
  "run-journal.mjs",
  "run-stale-proof.mjs",
  "run-target-writer-wait.mjs",
  "workflow-operation-identity.mjs",
];

const productionModules = () =>
  readdirSync(scripts).filter((name) => name.endsWith(".mjs") || name.endsWith(".js"));

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

test("every listed authority semantic names authority modules that the entry reaches", () => {
  const closure = authorityClosure();
  assert.deepEqual(Object.keys(authority.AUTHORITY_SURFACE).sort(), [
    "approved-scope-and-decomposition",
    "closeout-authority-and-writer-serialization",
    "cooperative-pause-graceful-stop-and-diagnosis",
    "issue-execution-and-dispatch-budgets",
    "material-repair-budget-and-model-policy",
    "operation-identity",
    "run-identity-and-grant",
  ]);

  const unreachable = [];
  for (const [semantic, modules] of Object.entries(authority.AUTHORITY_SURFACE)) {
    assert.ok(modules.length > 0, `${semantic} names no owning module`);
    for (const module of modules) {
      if (!existsSync(join(scripts, module))) unreachable.push(`${semantic} -> ${module} (absent)`);
      else if (!closure.has(module)) unreachable.push(`${semantic} -> ${module} (outside the closure)`);
    }
  }
  assert.deepEqual(unreachable, [], "each named owner must be reachable from the bundle-local entry");
});

test("the authority closure is exactly the intended authority modules", () => {
  assert.deepEqual([...authorityClosure()].filter((name) => name !== barrel).sort(), expectedAuthorityModules);
});

test("no production module of this package outside the entry imports an authority module directly", () => {
  const ownerModules = new Set([...authorityClosure()].filter((name) => name !== barrel));
  const offenders = [];
  for (const file of productionModules()) {
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

  // The installed composition surface reaches this decision through the entry; a local reimplementation
  // in the Codex host boundary would restore the coupling this Issue removed.
  const composition = readFileSync(join(scripts, "codex-workflow.mjs"), "utf8");
  assert.doesNotMatch(composition, /function assessRecoveryCompatibility/u);
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
