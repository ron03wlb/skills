import assert from "node:assert/strict";
import test from "node:test";
import { modelDecisionInput, validateModelDecision, automaticUpgrade } from "../../skills/personal/run-issue-workflow/scripts/issue-model-policy.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";

const input = modelDecisionInput({ issueId: "I_1", specId: "I_1", approvedScopeHash: "sha256:" + "a".repeat(64),
  issueBody: "Local rename. AC-1: preserve behavior. Module: formatter. Authorization and concurrency consistency.",
  specBody: "Local rename. AC-1: preserve behavior. Module: formatter. Authorization and concurrency consistency." });
const decision = (characteristics, model, thinking) => ({ inputIdentity: input.inputIdentity, model, thinking,
  reason: "Use the highest evidenced risk floor for this Issue.", assessment: {
    scope: ["Local rename"], acceptanceCriteria: ["AC-1: preserve behavior"], affectedModules: ["Module: formatter"],
    characteristics: characteristics.map(name => ({ name, evidence: [name === "local-mechanical" ? "Local rename" : "Authorization and concurrency consistency"] })),
  } });

test("dispatch validates the highest evidenced floor and supported settings", () => {
  assert.equal(validateModelDecision(decision(["local-mechanical"], "gpt-5.6-terra", "medium"), input).model, "gpt-5.6-terra");
  assert.throws(() => validateModelDecision(decision(["local-mechanical", "authorization-security"], "gpt-5.6-sol", "high"), input), /floor/u);
  assert.equal(validateModelDecision(decision(["authorization-security"], "gpt-6-astra", "high"), input).thinking, "high");
  assert.throws(() => validateModelDecision(decision(["local-mechanical"], "unknown", "high"), input), /model/u);
  assert.throws(() => validateModelDecision(decision(["local-mechanical"], "gpt-5.6-terra", "none"), input), /effort/u);
  assert.throws(() => validateModelDecision({ ...decision(["local-mechanical"], "gpt-5.6-terra", "medium"), reason: "" }, input), /reason/u);
  assert.throws(() => validateModelDecision({ ...decision(["local-mechanical"], "gpt-5.6-terra", "medium"), inputIdentity: "stale" }, input), /identity/u);
});

test("a renewed or observed Run cannot acquire or change policy membership", () => {
  const root = mkdtempSync(join(tmpdir(), "model-membership-"));
  const store = createRunStore({ gitCommonDir: root });
  const runIdentity = { runId: "run", specId: "I_1", target: "main", approvedScopeHash: "approved", classification: "SINGLE", decompositionIdentity: null };
  const grant = { type: "grant.recorded", at: "2026-09-08T00:00:00.000Z", runIdentity };
  const policy = { version: "issue-model-policy:v1", specId: "I_1", target: "main", approvedScopeHash: "approved", authorization: "Explicit approved model pool and upgrade" };
  const writer = store.acquireWriter("run");
  try {
    writer.append(grant);
    assert.throws(() => writer.append({ ...grant, modelPolicy: policy }), /membership/u);
    assert.equal(store.readEvents("run")[0].modelPolicy, undefined);
  } finally { writer.release(); rmSync(root, { recursive: true, force: true }); }
});

test("one automatic upgrade goes directly to Astra and never enlarges the repair budget", () => {
  assert.deepEqual(automaticUpgrade({ model: "gpt-5.6-terra", thinking: "medium" }, 2, false), { model: "gpt-6-astra", thinking: "high" });
  assert.deepEqual(automaticUpgrade({ model: "gpt-5.6-sol", thinking: "max" }, 8, false), { model: "gpt-6-astra", thinking: "max" });
  assert.deepEqual(automaticUpgrade({ model: "gpt-6-astra", thinking: "high" }, 2, false), { model: "gpt-6-astra", thinking: "xhigh" });
  for (const thinking of ["xhigh", "max", "ultra"]) assert.equal(automaticUpgrade({ model: "gpt-6-astra", thinking }, 2, false), null);
  assert.equal(automaticUpgrade({ model: "gpt-5.6-sol", thinking: "high" }, 2, true), null);
  assert.throws(() => automaticUpgrade({ model: "gpt-5.6-sol", thinking: "high" }, 10, false), /budget/u);
});
