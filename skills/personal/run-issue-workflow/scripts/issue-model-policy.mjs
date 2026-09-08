import { createHash } from "node:crypto";

export const ISSUE_MODEL_POLICY_VERSION = "issue-model-policy:v1";
export const ISSUE_MODELS = Object.freeze(["gpt-5.6-terra", "gpt-5.6-sol", "gpt-6-astra"]);
const efforts = ["low", "medium", "high", "xhigh", "max", "ultra"];
const floors = Object.freeze({
  "local-mechanical": 0,
  "business-logic": 1, "multistep-implementation": 1, "cross-module": 1,
  "authorization-security": 2, "financial-accounting": 2, "data-migration": 2,
  "concurrency-consistency": 2, "public-contract": 2, "cross-system-behavior": 2,
});
const text = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
};
export const modelEvidenceDigest = value => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

export function validateModelPolicy(policy, runIdentity = policy) {
  if (!policy || Object.keys(policy).some(key => !["version", "specId", "target", "approvedScopeHash", "authorization"].includes(key))
    || policy.version !== ISSUE_MODEL_POLICY_VERSION) throw new TypeError("Unsupported Issue model policy");
  text(policy.authorization, "Explicit model pool and escalation authorization");
  for (const key of ["specId", "target", "approvedScopeHash"]) {
    text(policy[key], `Model policy ${key}`);
    if (policy[key] !== runIdentity[key]) throw new TypeError("Model policy authority differs from the Run");
  }
  return policy;
}

export function modelDecisionInput({ issueId, specId, approvedScopeHash, issueBody, specBody }) {
  const input = { schema: "issue-model-input:v1", issueId, specId, approvedScopeHash, issueBody, specBody };
  for (const [key, value] of Object.entries(input)) text(value, key);
  return { ...input, inputIdentity: modelEvidenceDigest(input) };
}

export function validateModelSetting({ model, thinking }) {
  if (!ISSUE_MODELS.includes(model)) throw new TypeError("Unknown Issue model");
  if (!efforts.includes(thinking)) throw new TypeError("Unsupported reasoning effort");
}

export const astraSetting = ({ thinking }) => ({ model: "gpt-6-astra", thinking: efforts.indexOf(thinking) > 2 ? thinking : "high" });

export function automaticUpgrade(setting, repairWaves, consumed) {
  validateModelSetting(setting);
  if (!Number.isInteger(repairWaves) || repairWaves < 2 || repairWaves >= 10) throw new TypeError("Upgrade requires two completed waves and remaining original repair budget");
  if (consumed) return null;
  if (setting.model !== "gpt-6-astra") return astraSetting(setting);
  return setting.thinking === "high" ? { model: "gpt-6-astra", thinking: "xhigh" } : null;
}

// Native rejection must prove no task was submitted. Network/prose errors are ambiguous.
export function confirmedModelUnavailable(error, model) {
  const evidence = error?.nativeResult?.structuredContent;
  return evidence?.code === "MODEL_UNAVAILABLE" && evidence.model === model && evidence.requestSubmitted === false;
}

export function creationUnavailable(journal, issueId) {
  const last = journal.findLast(event => event.type === "model.acceptance" && event.issueId === issueId && event.phase !== "upgrade");
  return last?.model === "gpt-6-astra" && last.acceptance === "unavailable";
}

export function validateModelDecision(decision, input) {
  if (!input || modelDecisionInput(input).inputIdentity !== input.inputIdentity
    || decision?.inputIdentity !== input.inputIdentity) throw new TypeError("Model decision input identity differs");
  validateModelSetting(decision);
  text(decision.reason, "Model decision reason");
  const assessment = decision.assessment;
  const quote = values => {
    if (!Array.isArray(values) || !values.length || values.some(value => typeof value !== "string" || !value.trim()
      || ![input.issueBody, input.specBody].some(body => body.includes(value)))) throw new TypeError("Model assessment requires exact contract evidence");
  };
  for (const field of ["scope", "acceptanceCriteria", "affectedModules"]) quote(assessment?.[field]);
  if (!Array.isArray(assessment.characteristics) || !assessment.characteristics.length) throw new TypeError("Model characteristics are required");
  const names = new Set();
  const floor = Math.max(...assessment.characteristics.map(({ name, evidence }) => {
    if (!Object.hasOwn(floors, name) || names.has(name)) throw new TypeError("Unknown or duplicate model characteristic");
    names.add(name); quote(evidence); return floors[name];
  }));
  if (ISSUE_MODELS.indexOf(decision.model) < floor || efforts.indexOf(decision.thinking) < (floor === 0 ? 1 : 2)) {
    throw new TypeError("Model decision is below the applicable quality floor");
  }
  return structuredClone({ policyVersion: ISSUE_MODEL_POLICY_VERSION, inputIdentity: input.inputIdentity,
    model: decision.model, thinking: decision.thinking, reason: decision.reason, assessment, floor });
}

export function validateFrozenModelDecision(decision) {
  validateModelSetting(decision ?? {});
  text(decision.reason, "Frozen model reason");
  if (decision.policyVersion !== ISSUE_MODEL_POLICY_VERSION || !/^sha256:[a-f0-9]{64}$/u.test(decision.inputIdentity)
    || !Array.isArray(decision.assessment?.characteristics) || !decision.assessment.characteristics.length) throw new TypeError("Malformed frozen model decision");
  const floor = Math.max(...decision.assessment.characteristics.map(item => floors[item.name] ?? NaN));
  if (decision.floor !== floor || ISSUE_MODELS.indexOf(decision.model) < floor
    || efforts.indexOf(decision.thinking) < (floor === 0 ? 1 : 2)) throw new TypeError("Frozen model decision violates its quality floor");
}
