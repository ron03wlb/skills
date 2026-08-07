import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_BEGIN = "<!-- ron-workflow-config:v1:begin -->";
const CONFIG_END = "<!-- ron-workflow-config:v1:end -->";
const PAYLOAD_BEGIN = "<!-- workflow-payload:begin -->";
const PAYLOAD_END = "<!-- workflow-payload:end -->";
const REQUIRED_EXCLUDES = [
  "push",
  "remote-merge",
  "deploy",
  "branch-deletion",
  "live-provider-actions",
];
const CLEAN_PATH_EXCLUDES = [...REQUIRED_EXCLUDES, "legacy-data-deletion"];

export class WorkflowError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new WorkflowError(code, message, details);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function requireObject(value, name) {
  if (!isPlainObject(value)) fail("invalid", `${name} must be an object`);
  return value;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    fail("invalid", `${name} must be a non-empty string`);
  }
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    fail("invalid", `${name} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

function requireArray(value, name) {
  if (!Array.isArray(value)) fail("invalid", `${name} must be an array`);
  return value;
}

function assertRepositoryPath(value, name) {
  requireString(value, name);
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    fail("invalid", `${name} must be a normalized repository-relative path`);
  }
  return value;
}

function assertUniqueStrings(values, name, { repositoryPaths = false } = {}) {
  requireArray(values, name);
  const seen = new Set();
  for (const value of values) {
    if (repositoryPaths) assertRepositoryPath(value, name);
    else requireString(value, name);
    if (seen.has(value)) fail("invalid", `${name} contains a duplicate`);
    seen.add(value);
  }
}

export function validateWorkflowConfig(config) {
  requireObject(config, "config");
  if (config.schema !== "ron-workflow-config:v1") {
    fail("invalid", "unsupported Ron workflow config schema");
  }
  if (config.ron_workflow !== "v1") {
    fail("invalid", "unsupported Ron workflow version");
  }
  requireEnum(config.mode, ["full", "degraded"], "mode");

  const interaction = requireObject(config.interaction, "interaction");
  if (interaction.policy !== "exception_only") {
    fail("invalid", "interaction.policy must be exception_only");
  }

  const wiki = requireObject(config.wiki, "wiki");
  if (wiki.contract_schema !== "ron-wiki:v1") {
    fail("invalid", "unsupported Wiki contract schema");
  }
  if (wiki.root !== null) assertRepositoryPath(wiki.root, "wiki.root");
  requireEnum(wiki.baseline_state, ["missing", "ready"], "wiki.baseline_state");
  if (wiki.baseline_state === "ready" && wiki.root === null) {
    fail("invalid", "a ready Wiki baseline requires a canonical root");
  }
  if (wiki.page_contract !== "ron-wiki-page:v1") {
    fail("invalid", "unsupported Wiki page contract");
  }
  if (wiki.sources_contract !== "wiki-sources:v1") {
    fail("invalid", "unsupported Wiki sources contract");
  }
  if (wiki.resolver_profile !== "ron-source-resolvers:v1") {
    fail("invalid", "unsupported Wiki resolver profile");
  }
  requireArray(wiki.external_resolvers, "wiki.external_resolvers");
  const externalResolverNames = new Set();
  for (const [index, resolver] of wiki.external_resolvers.entries()) {
    requireObject(resolver, `wiki.external_resolvers[${index}]`);
    requireString(resolver.name, `wiki.external_resolvers[${index}].name`);
    if (externalResolverNames.has(resolver.name)) {
      fail("invalid", "external resolver names must be unique");
    }
    externalResolverNames.add(resolver.name);
    requireSha256(
      resolver.sha256,
      `wiki.external_resolvers[${index}].sha256`,
    );
    assertUniqueStrings(
      resolver.kinds,
      `wiki.external_resolvers[${index}].kinds`,
    );
    for (const kind of resolver.kinds) {
      requireEnum(
        kind,
        ["symbol", "test", "config-key", "json-pointer", "heading"],
        `wiki.external_resolvers[${index}].kinds`,
      );
    }
    assertUniqueStrings(
      resolver.extensions,
      `wiki.external_resolvers[${index}].extensions`,
    );
    requireString(
      resolver.command,
      `wiki.external_resolvers[${index}].command`,
    );
    if (resolver.read_only !== true) {
      fail("invalid", "external resolvers must be declared read-only");
    }
  }
  if (wiki.context_mode !== "staging") {
    fail("invalid", "wiki.context_mode must be staging");
  }
  if (wiki.mutation_policy !== "closeout_only") {
    fail("invalid", "wiki.mutation_policy must be closeout_only");
  }

  const protocol = requireObject(wiki.protocol, "wiki.protocol");
  requireString(protocol.name, "wiki.protocol.name");
  if (!/^[a-f0-9]{40,64}$/u.test(protocol.commit)) {
    fail("invalid", "wiki.protocol.commit must be an exact hexadecimal identity");
  }
  if (!/^[a-f0-9]{64}$/u.test(protocol.hash)) {
    fail("invalid", "wiki.protocol.hash must be a SHA-256 value");
  }

  const engine = requireObject(wiki.engine, "wiki.engine");
  requireEnum(engine.state, ["absent", "candidate", "verified"], "wiki.engine.state");
  if (engine.state === "absent" && engine.identity !== null) {
    fail("invalid", "an absent engine must have a null identity");
  }
  if (engine.state !== "absent") {
    requireString(engine.identity, "wiki.engine.identity");
  }

  const validators = requireObject(wiki.validators, "wiki.validators");
  requireString(validators.page, "wiki.validators.page");
  requireString(validators.sources, "wiki.validators.sources");
  requireString(validators.links, "wiki.validators.links");
  if (validators.build !== null) {
    requireString(validators.build, "wiki.validators.build");
  }
  assertUniqueStrings(wiki.support_write_set, "wiki.support_write_set", {
    repositoryPaths: true,
  });
  if (wiki.publication !== "disabled") {
    fail("invalid", "wiki.publication must be disabled");
  }

  const target = requireObject(config.target, "target");
  requireString(target.branch, "target.branch");
  if (target.integration !== "fast-forward-only") {
    fail("invalid", "target.integration must be fast-forward-only");
  }

  const lane = requireObject(config.lane, "lane");
  requireString(lane.worktree_root, "lane.worktree_root");
  requireString(lane.naming, "lane.naming");

  assertUniqueStrings(config.excludes, "excludes");
  for (const excluded of REQUIRED_EXCLUDES) {
    if (!config.excludes.includes(excluded)) {
      fail("invalid", `excludes must contain ${excluded}`);
    }
  }

  return config;
}

function countOccurrences(text, needle) {
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

export function extractWorkflowConfig(markdown) {
  if (typeof markdown !== "string") {
    fail("invalid", "Ron workflow document must be text");
  }
  const normalized = markdown.replace(/\r\n?/gu, "\n");
  if (
    countOccurrences(normalized, CONFIG_BEGIN) !== 1 ||
    countOccurrences(normalized, CONFIG_END) !== 1
  ) {
    fail("invalid", "Ron workflow document must contain exactly one config block");
  }

  const begin = normalized.indexOf(CONFIG_BEGIN);
  const end = normalized.indexOf(CONFIG_END);
  if (end <= begin) fail("invalid", "Ron workflow config markers are out of order");

  const block = normalized.slice(begin + CONFIG_BEGIN.length, end);
  const match = block.match(/^\s*```json\n([\s\S]*?)\n```\s*$/u);
  if (!match) {
    fail("invalid", "Ron workflow config block must contain one strict JSON fence");
  }

  let config;
  try {
    config = JSON.parse(match[1]);
  } catch (error) {
    fail("invalid", "Ron workflow config JSON is invalid", {
      cause: error.message,
    });
  }
  return validateWorkflowConfig(config);
}

export function canonicalizePayload(payload) {
  if (typeof payload !== "string") fail("invalid", "payload must be text");
  const normalized = payload.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
  if (normalized.includes(PAYLOAD_BEGIN) || normalized.includes(PAYLOAD_END)) {
    fail("invalid", "payload cannot contain workflow delimiters");
  }
  return `${normalized}\n`;
}

export function hashPayload(payload) {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJsonValue(value[key])]),
  );
}

export function hashCanonicalJson(value) {
  return hashPayload(`${JSON.stringify(canonicalJsonValue(value))}\n`);
}

function requireSha256(value, name) {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    fail("invalid", `${name} must be a SHA-256 value`);
  }
  return value;
}

function requireIdentity(value, name) {
  if (!/^[a-f0-9]{40,64}$/u.test(value)) {
    fail("invalid", `${name} must be an exact hexadecimal identity`);
  }
  return value;
}

function requireNull(value, name) {
  if (value !== null) fail("invalid", `${name} must be null`);
}

function validateLocatorShape(locator, name = "locator") {
  requireObject(locator, name);
  assertRepositoryPath(locator.path, `${name}.path`);
  requireEnum(
    locator.kind,
    ["symbol", "test", "config-key", "json-pointer", "heading"],
    `${name}.kind`,
  );
  requireString(locator.value, `${name}.value`);
  if (
    locator.line_hint !== undefined &&
    (!Number.isInteger(locator.line_hint) || locator.line_hint < 1)
  ) {
    fail("invalid", `${name}.line_hint must be a positive integer`);
  }
  return locator;
}

export function validateWikiExecutionBinding(binding) {
  requireObject(binding, "Wiki execution binding");
  requireEnum(
    binding.issue_type,
    ["leaf", "standalone", "parent"],
    "issue_type",
  );
  requireEnum(binding.wiki_impact, ["semantic", "none"], "wiki_impact");
  requireEnum(
    binding.wiki_operation,
    ["none", "bootstrap", "reconcile"],
    "wiki_operation",
  );
  requireEnum(
    binding.wiki_baseline_requirement,
    ["not-applicable", "missing-with-bootstrap-preview", "ready"],
    "wiki_baseline_requirement",
  );

  if (binding.wiki_operation === "none") {
    if (binding.wiki_baseline_requirement !== "not-applicable") {
      fail("invalid", "none requires no Wiki baseline");
    }
    requireNull(binding.wiki_preview_id, "wiki_preview_id");
    requireNull(
      binding.wiki_preview_payload_sha256,
      "wiki_preview_payload_sha256",
    );
  } else if (binding.wiki_operation === "bootstrap") {
    if (
      binding.issue_type !== "standalone" ||
      binding.wiki_impact !== "semantic" ||
      binding.wiki_baseline_requirement !==
        "missing-with-bootstrap-preview"
    ) {
      fail(
        "invalid",
        "bootstrap requires one semantic Standalone on a missing baseline",
      );
    }
    requireString(binding.wiki_preview_id, "wiki_preview_id");
    requireSha256(
      binding.wiki_preview_payload_sha256,
      "wiki_preview_payload_sha256",
    );
  } else {
    if (
      binding.wiki_impact !== "semantic" ||
      binding.wiki_baseline_requirement !== "ready"
    ) {
      fail("invalid", "reconcile requires semantic impact and ready baseline");
    }
    const hasPreviewId = binding.wiki_preview_id !== null;
    const hasPreviewHash = binding.wiki_preview_payload_sha256 !== null;
    if (hasPreviewId !== hasPreviewHash) {
      fail("invalid", "reconcile Preview ID and hash must appear together");
    }
    if (hasPreviewId) {
      requireString(binding.wiki_preview_id, "wiki_preview_id");
      requireSha256(
        binding.wiki_preview_payload_sha256,
        "wiki_preview_payload_sha256",
      );
    }
  }

  return binding;
}

function validateTarget(target, name = "target") {
  requireObject(target, name);
  requireString(target.branch, `${name}.branch`);
  requireIdentity(target.identity, `${name}.identity`);
  if (target.repository !== undefined) {
    requireString(target.repository, `${name}.repository`);
  }
}

function validateProtocol(protocol, name = "protocol") {
  requireObject(protocol, name);
  requireString(protocol.name, `${name}.name`);
  requireIdentity(protocol.commit, `${name}.commit`);
  requireSha256(protocol.hash, `${name}.hash`);
}

function validateEngine(engine, name = "engine") {
  requireObject(engine, name);
  requireEnum(engine.state, ["absent", "candidate", "verified"], `${name}.state`);
  if (engine.state === "absent") requireNull(engine.identity, `${name}.identity`);
  else requireString(engine.identity, `${name}.identity`);
}

function requireCleanPathExcludes(excludes) {
  assertUniqueStrings(excludes, "excludes");
  for (const excluded of CLEAN_PATH_EXCLUDES) {
    if (!excludes.includes(excluded)) {
      fail("invalid", `excludes must contain ${excluded}`);
    }
  }
}

function validateBootstrapPreview(preview) {
  requireString(preview.preview_id, "preview_id");
  requireString(preview.created_at, "created_at");
  validateTarget(preview.target);
  requireString(preview.target.repository, "target.repository");

  const root = requireObject(preview.root, "root");
  assertRepositoryPath(root.path, "root.path");
  requireEnum(
    root.assessment,
    ["adoptable", "needs-bootstrap"],
    "root.assessment",
  );
  if (preview.baseline_state !== "missing") {
    fail("invalid", "Bootstrap Preview requires a missing baseline");
  }

  const boundedness = requireObject(preview.boundedness, "boundedness");
  requireEnum(
    boundedness.state,
    ["bounded", "not-bounded"],
    "boundedness.state",
  );
  requireString(boundedness.reason, "boundedness.reason");

  requireArray(preview.topics, "topics");
  const topicIds = new Set();
  const topicPaths = new Set();
  for (const [index, topic] of preview.topics.entries()) {
    requireObject(topic, `topics[${index}]`);
    requireString(topic.id, `topics[${index}].id`);
    assertRepositoryPath(topic.page_path, `topics[${index}].page_path`);
    requireString(topic.purpose, `topics[${index}].purpose`);
    requireString(topic.scope, `topics[${index}].scope`);
    assertUniqueStrings(topic.dependencies, `topics[${index}].dependencies`);
    requireArray(topic.source_seeds, `topics[${index}].source_seeds`);
    topic.source_seeds.forEach((locator, locatorIndex) =>
      validateLocatorShape(
        locator,
        `topics[${index}].source_seeds[${locatorIndex}]`,
      ),
    );
    if (topicIds.has(topic.id) || topicPaths.has(topic.page_path)) {
      fail("invalid", "Bootstrap Preview topics must have unique IDs and paths");
    }
    topicIds.add(topic.id);
    topicPaths.add(topic.page_path);
  }

  requireArray(preview.batches, "batches");
  if (boundedness.state === "bounded") {
    if (preview.topics.length === 0 || preview.batches.length === 0) {
      fail("invalid", "a bounded Bootstrap Preview needs topics and batches");
    }
    const batched = new Set();
    for (const [index, batch] of preview.batches.entries()) {
      requireObject(batch, `batches[${index}]`);
      requireString(batch.id, `batches[${index}].id`);
      assertUniqueStrings(batch.topics, `batches[${index}].topics`);
      if (batch.topics.length === 0) {
        fail("invalid", "Bootstrap batches cannot be empty");
      }
      for (const topicId of batch.topics) {
        if (!topicIds.has(topicId) || batched.has(topicId)) {
          fail("invalid", "Bootstrap batches must cover each known topic once");
        }
        batched.add(topicId);
      }
    }
    if (batched.size !== topicIds.size) {
      fail("invalid", "Bootstrap batches must cover every topic");
    }
  }

  const contracts = requireObject(preview.contracts, "contracts");
  if (
    contracts.page !== "ron-wiki-page:v1" ||
    contracts.sources !== "wiki-sources:v1" ||
    contracts.resolvers !== "ron-source-resolvers:v1"
  ) {
    fail("invalid", "Bootstrap Preview contract versions are unsupported");
  }
  assertUniqueStrings(preview.validators, "validators");
  if (preview.validators.length === 0) {
    fail("invalid", "Bootstrap Preview requires validators");
  }
  requireCleanPathExcludes(preview.excludes);
  if (preview.publication !== "disabled") {
    fail("invalid", "Bootstrap Preview publication must be disabled");
  }
  validateProtocol(preview.protocol);
  validateEngine(preview.engine);
}

export function validateReconciliationLedger(ledger) {
  requireObject(ledger, "reconciliation ledger");
  if (ledger.schema !== "workflow-wiki-reconciliation-ledger:v1") {
    fail("invalid", "unsupported reconciliation ledger schema");
  }
  requireArray(ledger.rows, "ledger.rows");
  if (ledger.rows.length === 0) {
    fail("invalid", "reconciliation ledger requires at least one row");
  }

  const expectedActions = {
    inherit: "none",
    add: "add",
    change: "update",
    remove: "remove",
  };
  const rowIds = new Set();
  const semanticWriteSet = new Set();
  const findings = [];
  let hasUnverified = false;

  for (const [index, row] of ledger.rows.entries()) {
    requireObject(row, `ledger.rows[${index}]`);
    requireString(row.id, `ledger.rows[${index}].id`);
    if (rowIds.has(row.id)) fail("invalid", "ledger row IDs must be unique");
    rowIds.add(row.id);
    requireString(row.topic, `ledger.rows[${index}].topic`);
    requireString(row.claim, `ledger.rows[${index}].claim`);
    requireString(row.prior_state, `ledger.rows[${index}].prior_state`);
    requireEnum(
      row.disposition,
      ["inherit", "add", "change", "remove"],
      `ledger.rows[${index}].disposition`,
    );
    requireArray(row.source_locators, `ledger.rows[${index}].source_locators`);
    if (row.source_locators.length === 0) {
      fail("invalid", "every ledger row requires source locators");
    }
    row.source_locators.forEach((locator, locatorIndex) =>
      validateLocatorShape(
        locator,
        `ledger.rows[${index}].source_locators[${locatorIndex}]`,
      ),
    );
    requireEnum(
      row.conformance,
      ["aligned", "deviation", "unverified"],
      `ledger.rows[${index}].conformance`,
    );
    requireEnum(
      row.wiki_action,
      ["none", "add", "update", "remove"],
      `ledger.rows[${index}].wiki_action`,
    );
    if (row.wiki_action !== expectedActions[row.disposition]) {
      fail("invalid", "ledger disposition and Wiki action do not match");
    }
    assertRepositoryPath(row.wiki_path, `ledger.rows[${index}].wiki_path`);

    if (row.conformance !== "aligned") {
      findings.push({ id: row.id, conformance: row.conformance });
      if (row.conformance === "unverified") hasUnverified = true;
    } else if (row.wiki_action !== "none") {
      semanticWriteSet.add(row.wiki_path);
    }
  }

  if (hasUnverified) {
    return {
      status: "not-verifiable",
      semantic_write_set: [],
      findings,
    };
  }
  if (findings.length > 0) {
    return {
      status: "findings",
      semantic_write_set: [],
      findings,
    };
  }
  return {
    status: "clean",
    semantic_write_set: [...semanticWriteSet].sort(),
    findings: [],
  };
}

function equalStringSets(left, right) {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function validateSyncPreview(preview) {
  requireString(preview.preview_id, "preview_id");
  requireString(preview.created_at, "created_at");
  validateTarget(preview.target);
  requireString(preview.target.repository, "target.repository");
  if (preview.baseline_state !== "ready") {
    fail("invalid", "Sync Preview requires a ready baseline");
  }
  requireIdentity(preview.prior_wiki_identity, "prior_wiki_identity");

  const boundedness = requireObject(preview.boundedness, "boundedness");
  if (boundedness.state !== "bounded") {
    fail("invalid", "Sync Preview may publish only bounded drift");
  }
  requireString(boundedness.reason, "boundedness.reason");
  assertUniqueStrings(preview.drift_evidence, "drift_evidence");
  if (preview.drift_evidence.length === 0) {
    fail("invalid", "Sync Preview requires drift evidence");
  }

  const ledgerResult = validateReconciliationLedger(preview.ledger);
  if (ledgerResult.status === "findings") {
    fail("findings", "Sync Preview ledger contains a deviation", {
      findings: ledgerResult.findings,
    });
  }
  if (ledgerResult.status === "not-verifiable") {
    fail("not-verifiable", "Sync Preview ledger is unverified", {
      findings: ledgerResult.findings,
    });
  }

  assertUniqueStrings(
    preview.semantic_write_set_ceiling,
    "semantic_write_set_ceiling",
    { repositoryPaths: true },
  );
  assertUniqueStrings(
    preview.support_write_set_ceiling,
    "support_write_set_ceiling",
    { repositoryPaths: true },
  );
  if (
    !equalStringSets(
      preview.semantic_write_set_ceiling,
      ledgerResult.semantic_write_set,
    )
  ) {
    fail("scope", "Sync Preview semantic ceiling must equal ledger writes");
  }
  assertUniqueStrings(preview.validators, "validators");
  if (preview.validators.length === 0) {
    fail("invalid", "Sync Preview requires validators");
  }
  requireCleanPathExcludes(preview.excludes);
  if (preview.publication !== "disabled") {
    fail("invalid", "Sync Preview publication must be disabled");
  }
  validateProtocol(preview.protocol);
  validateEngine(preview.engine);
}

function validateWorkflowReference(reference, name) {
  requireObject(reference, name);
  requireString(reference.id, `${name}.id`);
  requireString(reference.comment_id, `${name}.comment_id`);
  requireSha256(reference.payload_sha256, `${name}.payload_sha256`);
}

function validateRootReference(reference, mode) {
  requireObject(reference, "root_delegation");
  if (mode === "standalone") {
    requireString(reference.delegation_id, "root_delegation.delegation_id");
    if (reference.record_id !== undefined) {
      fail("invalid", "Standalone root delegation cannot use record_id");
    }
  } else {
    requireString(reference.record_id, "root_delegation.record_id");
    if (reference.delegation_id !== undefined) {
      fail("invalid", "Parent root authorization cannot use delegation_id");
    }
  }
  requireSha256(
    reference.payload_sha256,
    "root_delegation.payload_sha256",
  );
}

export function validateCloseoutPreview(preview) {
  requireObject(preview, "Closeout Preview");
  if (preview.schema !== "workflow-closeout-preview:v1") {
    fail("invalid", "unsupported Closeout Preview schema");
  }
  requireString(preview.preview_id, "preview_id");
  requireString(preview.created_at, "created_at");
  requireEnum(preview.mode, ["parent", "standalone"], "mode");
  requireString(preview.issue, "issue");
  validateWorkflowReference(preview.spec, "spec");
  validateRootReference(preview.root_delegation, preview.mode);
  if (preview.mode === "standalone") {
    validateWorkflowReference(preview.contract, "contract");
    requireNull(
      preview.child_contracts_payload_sha256,
      "child_contracts_payload_sha256",
    );
    const sourceAuthorization = requireObject(
      preview.source_authorization,
      "source_authorization",
    );
    requireString(
      sourceAuthorization.record_id,
      "source_authorization.record_id",
    );
    requireSha256(
      sourceAuthorization.payload_sha256,
      "source_authorization.payload_sha256",
    );
  } else {
    requireNull(preview.contract, "contract");
    requireSha256(
      preview.child_contracts_payload_sha256,
      "child_contracts_payload_sha256",
    );
    requireNull(preview.source_authorization, "source_authorization");
  }
  requireSha256(preview.evidence_payload_sha256, "evidence_payload_sha256");

  const lane = requireObject(preview.lane, "lane");
  requireString(lane.id, "lane.id");
  requireIdentity(lane.identity, "lane.identity");
  validateTarget(preview.target);

  validateWikiExecutionBinding({
    issue_type: preview.mode,
    wiki_impact: preview.wiki_impact,
    wiki_operation: preview.wiki_operation,
    wiki_baseline_requirement: preview.wiki_baseline_requirement,
    wiki_preview_id: preview.wiki_preview_id,
    wiki_preview_payload_sha256: preview.wiki_preview_payload_sha256,
  });

  let ledgerResult;
  if (preview.wiki_operation === "none") {
    requireNull(preview.ledger, "ledger");
    ledgerResult = { status: "clean", semantic_write_set: [], findings: [] };
  } else {
    ledgerResult = validateReconciliationLedger(preview.ledger);
    if (ledgerResult.status === "findings") {
      fail("findings", "Closeout Preview ledger contains a deviation", {
        findings: ledgerResult.findings,
      });
    }
    if (ledgerResult.status === "not-verifiable") {
      fail("not-verifiable", "Closeout Preview ledger is unverified", {
        findings: ledgerResult.findings,
      });
    }
  }
  if (
    preview.ledger_payload_sha256 !== hashCanonicalJson(preview.ledger)
  ) {
    fail("scope", "Closeout Preview ledger hash has drifted");
  }

  assertUniqueStrings(
    preview.semantic_write_set,
    "semantic_write_set",
    { repositoryPaths: true },
  );
  assertUniqueStrings(preview.support_write_set, "support_write_set", {
    repositoryPaths: true,
  });
  if (
    !equalStringSets(
      preview.semantic_write_set,
      ledgerResult.semantic_write_set,
    )
  ) {
    fail("scope", "Closeout Preview semantic writes must equal ledger writes");
  }
  if (
    preview.wiki_operation !== "none" &&
    preview.semantic_write_set.length === 0
  ) {
    fail("invalid", "semantic closeout requires a semantic write");
  }
  if (
    preview.wiki_operation === "none" &&
    (preview.semantic_write_set.length !== 0 ||
      preview.support_write_set.length !== 0)
  ) {
    fail("scope", "no-impact closeout cannot write Wiki paths");
  }
  if (
    preview.semantic_write_set_sha256 !==
    hashCanonicalJson(preview.semantic_write_set)
  ) {
    fail("scope", "Closeout Preview semantic write-set hash has drifted");
  }
  if (
    preview.support_write_set_sha256 !==
    hashCanonicalJson(preview.support_write_set)
  ) {
    fail("scope", "Closeout Preview support write-set hash has drifted");
  }

  if (preview.wiki_operation === "none") {
    requireNull(preview.protocol, "protocol");
  } else {
    validateProtocol(preview.protocol);
  }
  assertRepositoryPath(preview.staging_path, "staging_path");
  assertUniqueStrings(
    preview.verification_commands,
    "verification_commands",
  );
  if (preview.verification_commands.length === 0) {
    fail("invalid", "Closeout Preview requires verification commands");
  }
  assertUniqueStrings(preview.review_axes, "review_axes");
  for (const axis of preview.review_axes) {
    requireEnum(axis, ["standards", "spec", "wiki"], "review_axes");
  }
  if (
    !preview.review_axes.includes("standards") ||
    !preview.review_axes.includes("spec") ||
    (preview.wiki_operation !== "none" &&
      !preview.review_axes.includes("wiki"))
  ) {
    fail("invalid", "Closeout Preview is missing a required review axis");
  }

  const expectedCapability =
    preview.mode === "parent" ? "close_parent" : "close_standalone";
  if (preview.capability !== expectedCapability) {
    fail("invalid", `Closeout Preview requires ${expectedCapability}`);
  }
  if (preview.target_refresh !== "denied") {
    fail("invalid", "Closeout Preview target refresh policy is unsupported");
  }

  const repair = requireObject(preview.repair, "repair");
  if (
    !Number.isInteger(repair.wiki_waves) ||
    repair.wiki_waves < 0 ||
    repair.wiki_waves > 2
  ) {
    fail("invalid", "Closeout Preview permits at most two Wiki repair waves");
  }
  if (preview.wiki_operation === "none" && repair.wiki_waves !== 0) {
    fail("invalid", "Wiki-free closeout cannot include Wiki repair waves");
  }
  if (repair.wiki_authority !== "human-grant-required") {
    fail("invalid", "Wiki repair requires a separate human Grant");
  }
  if (repair.code_findings !== "repair-leaf-only") {
    fail("invalid", "code findings require a Repair Leaf");
  }
  requireCleanPathExcludes(preview.excludes);
  return preview;
}

export function buildCloseoutPreviewEnvelope(input) {
  requireObject(input, "Closeout Preview input");
  const preview = {
    schema: "workflow-closeout-preview:v1",
    ...input,
    ledger_payload_sha256: hashCanonicalJson(input.ledger),
    semantic_write_set_sha256: hashCanonicalJson(input.semantic_write_set),
    support_write_set_sha256: hashCanonicalJson(input.support_write_set),
  };
  validateCloseoutPreview(preview);
  const payload = `${JSON.stringify(canonicalJsonValue(preview))}\n`;
  return {
    preview,
    payload,
    payload_sha256: hashPayload(payload),
    envelope: createEnvelope("workflow-closeout-preview:v1", payload),
  };
}

export function validatePreview(preview) {
  requireObject(preview, "Preview");
  if (preview.schema === "workflow-wiki-bootstrap-preview:v1") {
    validateBootstrapPreview(preview);
    return preview;
  }
  if (preview.schema === "workflow-wiki-sync-preview:v1") {
    validateSyncPreview(preview);
    return preview;
  }
  if (preview.schema === "workflow-closeout-preview:v1") {
    return validateCloseoutPreview(preview);
  }
  fail("invalid", "unsupported Wiki Preview schema");
}

export function validatePreIssueDelegation(delegation) {
  requireObject(delegation, "pre-Issue delegation");
  if (delegation.schema !== "workflow-clean-path-delegation:v1") {
    fail("invalid", "unsupported pre-Issue delegation schema");
  }
  requireString(delegation.delegation_id, "delegation_id");
  if (delegation.status !== "active") {
    fail("invalid", "pre-Issue delegation must be active");
  }
  if (delegation.origin !== "direct-human") {
    fail("invalid", "pre-Issue delegation must be human-originated");
  }
  requireString(delegation.approver, "approver");
  requireString(delegation.approved_at, "approved_at");

  const preview = requireObject(delegation.preview, "preview");
  requireEnum(preview.kind, ["bootstrap", "sync"], "preview.kind");
  requireString(preview.id, "preview.id");
  requireSha256(preview.payload_sha256, "preview.payload_sha256");
  requireString(delegation.repository, "repository");
  validateTarget(delegation.target);
  if (delegation.target_refresh !== "denied") {
    fail("invalid", "pre-Issue delegation must deny target refresh");
  }

  const scope = requireObject(delegation.scope, "scope");
  for (const key of [
    "code_paths",
    "artifact_paths",
    "wiki_paths",
    "config_paths",
  ]) {
    assertUniqueStrings(scope[key], `scope.${key}`, { repositoryPaths: true });
  }
  if (scope.wiki_paths.length + scope.config_paths.length === 0) {
    fail("invalid", "pre-Issue delegation requires a Wiki or config ceiling");
  }

  assertUniqueStrings(delegation.grants, "grants");
  const publishCapability =
    preview.kind === "bootstrap"
      ? "publish_bootstrap_spec"
      : "publish_wiki_repair_spec";
  if (
    delegation.grants.length !== 1 ||
    delegation.grants[0] !== publishCapability
  ) {
    fail("invalid", `pre-Issue delegation may grant only ${publishCapability}`);
  }
  assertUniqueStrings(
    delegation.downstream_capabilities,
    "downstream_capabilities",
  );
  if (delegation.downstream_capabilities.length === 0) {
    fail("invalid", "root delegation requires downstream capabilities");
  }
  requireSubset(
    delegation.downstream_capabilities,
    ["execute", "close_standalone"],
    "downstream_capabilities",
  );
  assertUniqueStrings(delegation.validators, "validators");
  if (delegation.validators.length === 0) {
    fail("invalid", "pre-Issue delegation requires validators");
  }
  assertUniqueStrings(delegation.review_axes, "review_axes");
  if (delegation.review_axes.length === 0) {
    fail("invalid", "pre-Issue delegation requires review axes");
  }
  for (const axis of delegation.review_axes) {
    requireEnum(axis, ["standards", "spec", "wiki"], "review_axes");
  }
  requireCleanPathExcludes(delegation.excludes);
  return delegation;
}

function buildCanonicalEnvelope(marker, value) {
  const payload = `${JSON.stringify(canonicalJsonValue(value))}\n`;
  return {
    payload,
    payload_sha256: hashPayload(payload),
    envelope: createEnvelope(marker, payload),
  };
}

export function buildCleanPathDelegationEnvelope(delegation) {
  validatePreIssueDelegation(delegation);
  return {
    delegation,
    ...buildCanonicalEnvelope(
      "workflow-clean-path-delegation:v1",
      delegation,
    ),
  };
}

export function buildAuthorizationEnvelope(authorization) {
  requireObject(authorization, "Authorization Record");
  if (authorization.schema !== "workflow-authorization:v1") {
    fail("invalid", "unsupported Authorization Record schema");
  }
  requireString(authorization.record_id, "record_id");
  return {
    authorization,
    ...buildCanonicalEnvelope("workflow-authorization:v1", authorization),
  };
}

function requireSubset(values, ceiling, name) {
  const allowed = new Set(ceiling);
  for (const value of values) {
    if (!allowed.has(value)) fail("scope", `${name} exceeds its human ceiling`);
  }
}

export function deriveIssueGrant(input) {
  requireObject(input, "Issue Grant derivation");
  const delegation = validatePreIssueDelegation(input.delegation);
  requireSha256(
    input.delegation_payload_sha256,
    "delegation_payload_sha256",
  );
  if (
    input.delegation_payload_sha256 !== hashCanonicalJson(delegation)
  ) {
    fail("scope", "root delegation payload hash has drifted");
  }
  requireString(input.record_id, "record_id");
  requireString(input.issue, "issue");
  if (!input.issue.startsWith(`${delegation.repository}#`)) {
    fail("scope", "Issue repository exceeds the human delegation");
  }
  requireString(input.coordinator, "coordinator");
  requireString(input.derived_at, "derived_at");

  const spec = requireObject(input.spec, "spec");
  requireString(spec.id, "spec.id");
  requireString(spec.comment_id, "spec.comment_id");
  requireSha256(spec.payload_sha256, "spec.payload_sha256");
  if (
    spec.preview_id !== delegation.preview.id ||
    spec.preview_payload_sha256 !== delegation.preview.payload_sha256
  ) {
    fail("scope", "Change Spec does not match the delegated Preview");
  }
  const contract = requireObject(input.contract, "contract");
  requireString(contract.id, "contract.id");
  requireString(contract.comment_id, "contract.comment_id");
  requireSha256(contract.payload_sha256, "contract.payload_sha256");
  requireString(contract.issue, "contract.issue");
  requireEnum(contract.issue_type, ["standalone"], "contract.issue_type");
  requireString(contract.spec_id, "contract.spec_id");
  requireString(contract.spec_comment_id, "contract.spec_comment_id");
  requireSha256(
    contract.spec_payload_sha256,
    "contract.spec_payload_sha256",
  );
  requireEnum(
    contract.wiki_operation,
    ["bootstrap", "reconcile"],
    "contract.wiki_operation",
  );
  requireEnum(
    contract.wiki_baseline_requirement,
    ["missing-with-bootstrap-preview", "ready"],
    "contract.wiki_baseline_requirement",
  );
  requireString(contract.wiki_preview_id, "contract.wiki_preview_id");
  requireSha256(
    contract.wiki_preview_payload_sha256,
    "contract.wiki_preview_payload_sha256",
  );
  requireSha256(contract.owned_paths_sha256, "contract.owned_paths_sha256");
  const delegatedWikiBinding =
    delegation.preview.kind === "bootstrap"
      ? {
          operation: "bootstrap",
          baselineRequirement: "missing-with-bootstrap-preview",
        }
      : { operation: "reconcile", baselineRequirement: "ready" };
  if (
    contract.issue !== input.issue ||
    contract.spec_id !== spec.id ||
    contract.spec_comment_id !== spec.comment_id ||
    contract.spec_payload_sha256 !== spec.payload_sha256 ||
    contract.wiki_operation !== delegatedWikiBinding.operation ||
    contract.wiki_baseline_requirement !==
      delegatedWikiBinding.baselineRequirement ||
    contract.wiki_operation !== input.wiki_operation ||
    contract.wiki_baseline_requirement !== input.wiki_baseline_requirement ||
    contract.wiki_preview_id !== delegation.preview.id ||
    contract.wiki_preview_payload_sha256 !==
      delegation.preview.payload_sha256
  ) {
    fail("scope", "execution contract does not match the delegated Issue flow");
  }

  assertUniqueStrings(input.capabilities, "capabilities");
  if (input.capabilities.length === 0) {
    fail("invalid", "derived Issue Grant requires a capability");
  }
  requireSubset(
    input.capabilities,
    delegation.downstream_capabilities,
    "capabilities",
  );

  assertUniqueStrings(input.exact_paths, "exact_paths", {
    repositoryPaths: true,
  });
  const scopePaths = Object.values(delegation.scope).flat();
  requireSubset(input.exact_paths, scopePaths, "exact_paths");
  if (contract.owned_paths_sha256 !== hashCanonicalJson(input.exact_paths)) {
    fail("scope", "execution contract owned paths do not match the Grant");
  }

  const binding = validateWikiExecutionBinding({
    issue_type: "standalone",
    wiki_impact: "semantic",
    wiki_operation: input.wiki_operation,
    wiki_baseline_requirement: input.wiki_baseline_requirement,
    wiki_preview_id: delegation.preview.id,
    wiki_preview_payload_sha256: delegation.preview.payload_sha256,
  });

  const scopeHash = hashCanonicalJson(delegation.scope);
  return {
    schema: "workflow-authorization:v1",
    record_id: input.record_id,
    status: "active",
    approver: delegation.approver,
    approved_at: delegation.approved_at,
    origin: "derived-clean-path",
    derived_by: input.coordinator,
    derived_at: input.derived_at,
    delegated_from: delegation.delegation_id,
    delegated_from_kind: "pre-issue-record",
    delegated_from_payload_sha256: input.delegation_payload_sha256,
    binds: {
      issue: input.issue,
      spec_id: spec.id,
      spec_comment_id: spec.comment_id,
      spec_payload_sha256: spec.payload_sha256,
      contract_id: contract.id,
      contract_comment_id: contract.comment_id,
      contract_payload_sha256: contract.payload_sha256,
      target_branch: delegation.target.branch,
      target_identity: delegation.target.identity,
      scope_ceiling_sha256: scopeHash,
      wiki_operation: binding.wiki_operation,
      wiki_baseline_requirement: binding.wiki_baseline_requirement,
      wiki_preview_id: binding.wiki_preview_id,
      wiki_preview_payload_sha256: binding.wiki_preview_payload_sha256,
      exact_paths: [...input.exact_paths],
    },
    grants: [...input.capabilities],
    validators: [...delegation.validators],
    review_axes: [...delegation.review_axes],
    excludes: [...delegation.excludes],
    preconditions: [
      "matching Issue, Spec, Preview, target, paths, validators, and exclusions",
      "no findings, ambiguity, unverified proof, or new capability",
    ],
    delegation: {
      clean_path: "denied",
      derive_exact_grants: [],
      target_refresh: "denied",
      nested_clean_path: "denied",
      nested_delegation: "denied",
    },
    supersedes: null,
    revokes: null,
  };
}

function requireDeniedDelegation(authorization) {
  const policy = requireObject(
    authorization.delegation,
    "authorization.delegation",
  );
  assertUniqueStrings(
    policy.derive_exact_grants,
    "authorization.delegation.derive_exact_grants",
  );
  if (
    policy.clean_path !== "denied" ||
    policy.derive_exact_grants.length !== 0 ||
    policy.target_refresh !== "denied" ||
    policy.nested_clean_path !== "denied" ||
    policy.nested_delegation !== "denied"
  ) {
    fail("scope", "derived Authorization must not delegate");
  }
}

function validateCloseoutCeilings(authority, preview, exactPaths) {
  assertUniqueStrings(authority.validators, "authority.validators");
  assertUniqueStrings(authority.review_axes, "authority.review_axes");
  requireCleanPathExcludes(authority.excludes);
  requireSubset(
    [
      preview.staging_path,
      ...preview.semantic_write_set,
      ...preview.support_write_set,
    ],
    exactPaths,
    "Closeout paths",
  );
  requireSubset(
    preview.verification_commands,
    authority.validators,
    "Closeout validators",
  );
  requireSubset(
    preview.review_axes,
    authority.review_axes,
    "Closeout review axes",
  );
  requireSubset(
    authority.excludes,
    preview.excludes,
    "Closeout exclusion preservation",
  );
}

function validateStandaloneCloseoutRoot(root, rootHash, preview) {
  validatePreIssueDelegation(root);
  if (
    preview.root_delegation.delegation_id !== root.delegation_id ||
    preview.root_delegation.payload_sha256 !== rootHash
  ) {
    fail("scope", "Closeout Preview does not bind the human root delegation");
  }
  const expectedBinding =
    root.preview.kind === "bootstrap"
      ? {
          operation: "bootstrap",
          baseline: "missing-with-bootstrap-preview",
        }
      : { operation: "reconcile", baseline: "ready" };
  if (
    root.target.branch !== preview.target.branch ||
    root.target.identity !== preview.target.identity ||
    root.preview.id !== preview.wiki_preview_id ||
    root.preview.payload_sha256 !== preview.wiki_preview_payload_sha256 ||
    preview.wiki_operation !== expectedBinding.operation ||
    preview.wiki_baseline_requirement !== expectedBinding.baseline ||
    !root.downstream_capabilities.includes(preview.capability)
  ) {
    fail("scope", "Closeout Preview exceeds its human root delegation");
  }
  validateCloseoutCeilings(
    root,
    preview,
    Object.values(root.scope).flat(),
  );
  return {
    id: root.delegation_id,
    kind: "pre-issue-record",
    approver: root.approver,
    approved_at: root.approved_at,
    scope_ceiling_sha256: hashCanonicalJson(root.scope),
  };
}

function validateStandaloneIssueAuthorization(
  authorization,
  authorizationHash,
  root,
  rootHash,
  preview,
) {
  requireObject(authorization, "source Authorization");
  if (authorization.schema !== "workflow-authorization:v1") {
    fail("invalid", "unsupported source Authorization schema");
  }
  requireString(authorization.record_id, "source Authorization record_id");
  if (
    authorization.status !== "active" ||
    authorization.origin !== "derived-clean-path"
  ) {
    fail("scope", "source Authorization is not a current derived Issue Grant");
  }
  if (
    preview.source_authorization.record_id !== authorization.record_id ||
    preview.source_authorization.payload_sha256 !== authorizationHash ||
    authorization.delegated_from !== root.delegation_id ||
    authorization.delegated_from_kind !== "pre-issue-record" ||
    authorization.delegated_from_payload_sha256 !== rootHash
  ) {
    fail("scope", "Issue Grant is not a sibling from the bound human root");
  }
  const binds = requireObject(authorization.binds, "source Authorization binds");
  assertUniqueStrings(binds.exact_paths, "source Authorization exact_paths", {
    repositoryPaths: true,
  });
  if (
    binds.issue !== preview.issue ||
    binds.spec_id !== preview.spec.id ||
    binds.spec_comment_id !== preview.spec.comment_id ||
    binds.spec_payload_sha256 !== preview.spec.payload_sha256 ||
    binds.contract_id !== preview.contract.id ||
    binds.contract_comment_id !== preview.contract.comment_id ||
    binds.contract_payload_sha256 !== preview.contract.payload_sha256 ||
    binds.target_branch !== preview.target.branch ||
    (binds.target_sha ?? binds.target_identity) !== preview.target.identity ||
    binds.wiki_operation !== preview.wiki_operation ||
    binds.wiki_baseline_requirement !== preview.wiki_baseline_requirement ||
    binds.wiki_preview_id !== preview.wiki_preview_id ||
    binds.wiki_preview_payload_sha256 !==
      preview.wiki_preview_payload_sha256 ||
    !authorization.grants.includes(preview.capability)
  ) {
    fail("scope", "Closeout Preview exceeds its bound Issue Grant");
  }
  requireDeniedDelegation(authorization);
  requireSubset(
    root.excludes,
    authorization.excludes,
    "Issue Grant exclusion preservation",
  );
  validateCloseoutCeilings(authorization, preview, binds.exact_paths);
}

function validateParentCloseoutRoot(root, rootHash, preview) {
  requireObject(root, "Parent root Authorization");
  if (root.schema !== "workflow-authorization:v1") {
    fail("invalid", "unsupported Parent root Authorization schema");
  }
  requireString(root.record_id, "Parent root record_id");
  if (root.status !== "active" || root.origin !== "direct-human") {
    fail("scope", "Parent closeout requires a current human root");
  }
  requireString(root.approver, "Parent root approver");
  requireString(root.approved_at, "Parent root approved_at");
  if (
    preview.root_delegation.record_id !== root.record_id ||
    preview.root_delegation.payload_sha256 !== rootHash
  ) {
    fail("scope", "Parent Preview does not bind its human root");
  }
  const binds = requireObject(root.binds, "Parent root binds");
  for (const field of [
    "contract_id",
    "contract_comment_id",
    "contract_payload_sha256",
  ]) {
    if (binds[field] !== undefined && binds[field] !== null) {
      fail("invalid", "Parent root must not bind an executable contract");
    }
  }
  requireSha256(
    binds.child_contracts_payload_sha256,
    "Parent root child contracts hash",
  );
  requireSha256(
    binds.aggregate_evidence_payload_sha256,
    "Parent root aggregate evidence hash",
  );
  requireSha256(
    binds.scope_ceiling_sha256,
    "Parent root scope ceiling hash",
  );
  assertUniqueStrings(binds.exact_paths, "Parent root exact_paths", {
    repositoryPaths: true,
  });
  if (
    binds.issue !== preview.issue ||
    binds.spec_id !== preview.spec.id ||
    binds.spec_comment_id !== preview.spec.comment_id ||
    binds.spec_payload_sha256 !== preview.spec.payload_sha256 ||
    binds.child_contracts_payload_sha256 !==
      preview.child_contracts_payload_sha256 ||
    binds.aggregate_evidence_payload_sha256 !==
      preview.evidence_payload_sha256 ||
    binds.target_branch !== preview.target.branch ||
    (binds.target_sha ?? binds.target_identity) !== preview.target.identity ||
    binds.wiki_operation !== preview.wiki_operation ||
    binds.wiki_baseline_requirement !== preview.wiki_baseline_requirement ||
    binds.wiki_preview_id !== preview.wiki_preview_id ||
    binds.wiki_preview_payload_sha256 !==
      preview.wiki_preview_payload_sha256
  ) {
    fail("scope", "Parent Preview exceeds its human root");
  }
  assertUniqueStrings(root.grants, "Parent root grants");
  const policy = requireObject(root.delegation, "Parent root delegation");
  assertUniqueStrings(
    policy.derive_exact_grants,
    "Parent root derive_exact_grants",
  );
  if (
    !root.grants.includes(preview.capability) ||
    policy.clean_path !== "bounded" ||
    !policy.derive_exact_grants.includes(preview.capability) ||
    policy.target_refresh !== "denied" ||
    policy.nested_clean_path !== "denied" ||
    policy.nested_delegation !== "denied"
  ) {
    fail("scope", "Parent root cannot derive this exact Closeout Grant");
  }
  validateCloseoutCeilings(root, preview, binds.exact_paths);
  return {
    id: root.record_id,
    kind: "issue-root-record",
    approver: root.approver,
    approved_at: root.approved_at,
    scope_ceiling_sha256: binds.scope_ceiling_sha256,
  };
}

export function deriveCloseoutGrant(input) {
  requireObject(input, "Closeout Grant derivation");
  const preview = validateCloseoutPreview(input.preview);
  requireSha256(
    input.preview_payload_sha256,
    "preview_payload_sha256",
  );
  if (
    input.preview_payload_sha256 !== hashCanonicalJson(preview)
  ) {
    fail("scope", "Closeout Preview payload hash has drifted");
  }
  requireSha256(
    input.root_delegation_payload_sha256,
    "root_delegation_payload_sha256",
  );
  if (
    input.root_delegation_payload_sha256 !==
    hashCanonicalJson(input.root_delegation)
  ) {
    fail("scope", "human root payload hash has drifted");
  }
  let root;
  if (preview.mode === "standalone") {
    root = validateStandaloneCloseoutRoot(
      input.root_delegation,
      input.root_delegation_payload_sha256,
      preview,
    );
    requireSha256(
      input.source_authorization_payload_sha256,
      "source_authorization_payload_sha256",
    );
    if (
      input.source_authorization_payload_sha256 !==
      hashCanonicalJson(input.source_authorization)
    ) {
      fail("scope", "source Authorization payload hash has drifted");
    }
    validateStandaloneIssueAuthorization(
      input.source_authorization,
      input.source_authorization_payload_sha256,
      input.root_delegation,
      input.root_delegation_payload_sha256,
      preview,
    );
  } else {
    requireNull(input.source_authorization, "source_authorization");
    requireNull(
      input.source_authorization_payload_sha256,
      "source_authorization_payload_sha256",
    );
    root = validateParentCloseoutRoot(
      input.root_delegation,
      input.root_delegation_payload_sha256,
      preview,
    );
  }
  requireString(input.record_id, "record_id");
  requireString(input.coordinator, "coordinator");
  requireString(input.derived_at, "derived_at");

  return {
    schema: "workflow-authorization:v1",
    record_id: input.record_id,
    status: "active",
    approver: root.approver,
    approved_at: root.approved_at,
    origin: "derived-clean-path",
    derived_by: input.coordinator,
    derived_at: input.derived_at,
    delegated_from: root.id,
    delegated_from_kind: root.kind,
    delegated_from_payload_sha256:
      input.root_delegation_payload_sha256,
    binds: {
      issue: preview.issue,
      spec_id: preview.spec.id,
      spec_comment_id: preview.spec.comment_id,
      spec_payload_sha256: preview.spec.payload_sha256,
      contract_id: preview.contract?.id ?? null,
      contract_comment_id: preview.contract?.comment_id ?? null,
      contract_payload_sha256: preview.contract?.payload_sha256 ?? null,
      child_contracts_payload_sha256:
        preview.child_contracts_payload_sha256,
      target_branch: preview.target.branch,
      target_sha: preview.target.identity,
      lane_sha: preview.lane.identity,
      closeout_preview_sha256: input.preview_payload_sha256,
      evidence_sha256: preview.evidence_payload_sha256,
      source_authorization_payload_sha256:
        input.source_authorization_payload_sha256,
      scope_ceiling_sha256: root.scope_ceiling_sha256,
      wiki_operation: preview.wiki_operation,
      wiki_baseline_requirement:
        preview.wiki_baseline_requirement,
      wiki_preview_id: preview.wiki_preview_id,
      wiki_preview_payload_sha256:
        preview.wiki_preview_payload_sha256,
      wiki_semantic_write_set_sha256:
        preview.semantic_write_set_sha256,
      wiki_support_write_set_sha256:
        preview.support_write_set_sha256,
      exact_paths: [
        preview.staging_path,
        ...preview.semantic_write_set,
        ...preview.support_write_set,
      ],
    },
    grants: [preview.capability],
    validators: [...preview.verification_commands],
    review_axes: [...preview.review_axes],
    excludes: [...preview.excludes],
    preconditions: [
      "matching Issue, Spec, mode-specific contract aggregate, evidence, Lane, target, ledger, paths, validators, review axes, and exclusions",
      "no findings, ambiguity, unverified proof, target drift, or new capability",
    ],
    delegation: {
      clean_path: "denied",
      derive_exact_grants: [],
      target_refresh: "denied",
      nested_clean_path: "denied",
      nested_delegation: "denied",
    },
    supersedes: null,
    revokes: null,
  };
}

function resolvedResult(locator, line) {
  return {
    status: "resolved",
    path: locator.path,
    kind: locator.kind,
    value: locator.value,
    line,
  };
}

function requireUniqueMatch(matches, locator) {
  const uniqueLines = [...new Set(matches)];
  if (uniqueLines.length !== 1) {
    fail(
      "not-verifiable",
      uniqueLines.length === 0
        ? `source locator did not resolve: ${locator.kind} ${locator.value}`
        : `source locator is ambiguous: ${locator.kind} ${locator.value}`,
    );
  }
  return resolvedResult(locator, uniqueLines[0]);
}

function resolveHeading(text, locator) {
  const wanted = locator.value.trim().replace(/\s+/gu, " ");
  const matches = [];
  let fence = null;
  for (const [index, line] of text.split("\n").entries()) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const character = fenceMatch[1][0];
      if (fence === null) fence = character;
      else if (fence === character) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/u);
    if (
      match &&
      match[1].trim().replace(/\s+/gu, " ") === wanted
    ) {
      matches.push(index + 1);
    }
  }
  return requireUniqueMatch(matches, locator);
}

function decodeJsonPointerToken(token) {
  if (/~(?:[^01]|$)/u.test(token)) {
    fail("invalid", "JSON pointer contains an invalid escape");
  }
  return token.replace(/~1/gu, "/").replace(/~0/gu, "~");
}

function resolveJsonPointer(text, locator) {
  if (!locator.value.startsWith("/")) {
    fail("invalid", "json-pointer must begin with /");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail("not-verifiable", "json-pointer target is not strict JSON", {
      cause: error.message,
    });
  }
  const tokens = locator.value
    .slice(1)
    .split("/")
    .map(decodeJsonPointerToken);
  let current = value;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/u.test(token)) {
        fail("not-verifiable", "JSON pointer array index is invalid");
      }
      const index = Number(token);
      if (index >= current.length) {
        fail("not-verifiable", "JSON pointer does not resolve");
      }
      current = current[index];
    } else if (
      isPlainObject(current) &&
      Object.prototype.hasOwnProperty.call(current, token)
    ) {
      current = current[token];
    } else {
      fail("not-verifiable", "JSON pointer does not resolve");
    }
  }
  return resolvedResult(locator, null);
}

function walkDottedKey(value, key) {
  let current = value;
  for (const segment of key.split(".")) {
    if (
      !isPlainObject(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return false;
    }
    current = current[segment];
  }
  return true;
}

function advanceTripleQuoteState(line, state) {
  let current = state;
  let cursor = 0;
  while (cursor < line.length) {
    if (current !== null) {
      const end = line.indexOf(current, cursor);
      if (end === -1) break;
      cursor = end + current.length;
      current = null;
      continue;
    }
    const single = line.indexOf("'''", cursor);
    const double = line.indexOf('"""', cursor);
    const candidates = [single, double].filter((position) => position !== -1);
    if (candidates.length === 0) break;
    const start = Math.min(...candidates);
    current = start === single ? "'''" : '"""';
    cursor = start + current.length;
  }
  return current;
}

function resolveConfigKey(text, extension, locator) {
  const matches = [];
  if (extension === ".json") {
    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      fail("not-verifiable", "config-key target is not strict JSON", {
        cause: error.message,
      });
    }
    if (!walkDottedKey(value, locator.value)) {
      fail("not-verifiable", "config-key does not resolve");
    }
    return resolvedResult(locator, null);
  }

  const lines = text.split("\n");
  if (extension === ".yaml" || extension === ".yml") {
    if (/(^|\s)(<<:|[&*][A-Za-z0-9_-]+)/mu.test(text)) {
      fail("not-verifiable", "dynamic YAML keys are not supported");
    }
    const stack = [];
    let blockScalarIndent = null;
    for (const [index, line] of lines.entries()) {
      if (/^\s*(?:#|$)/u.test(line)) continue;
      if (line.includes("\t")) {
        fail("not-verifiable", "tab-indented YAML is not supported");
      }
      const lineIndent = line.match(/^ */u)[0].length;
      if (blockScalarIndent !== null) {
        if (lineIndent > blockScalarIndent) continue;
        blockScalarIndent = null;
      }
      const match = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:(?:\s*(.*))?$/u);
      if (!match) continue;
      const indent = match[1].length;
      while (stack.length > 0 && stack.at(-1).indent >= indent) stack.pop();
      const path = [...stack.map((entry) => entry.key), match[2]].join(".");
      if (path === locator.value) matches.push(index + 1);
      const remainder = match[3] ?? "";
      if (/^[>|][-+0-9]*(?:\s+#.*)?$/u.test(remainder)) {
        blockScalarIndent = indent;
        continue;
      }
      if (remainder.length === 0 || remainder.startsWith("#")) {
        stack.push({ indent, key: match[2] });
      }
    }
    return requireUniqueMatch(matches, locator);
  }

  if (extension === ".toml") {
    let section = [];
    let multilineString = null;
    for (const [index, line] of lines.entries()) {
      const startedInsideString = multilineString !== null;
      multilineString = advanceTripleQuoteState(line, multilineString);
      if (startedInsideString) continue;
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const sectionMatch = trimmed.match(/^\[([A-Za-z0-9_.-]+)\]$/u);
      if (sectionMatch) {
        section = sectionMatch[1].split(".");
        continue;
      }
      const keyMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*=/u);
      if (keyMatch) {
        const path = [...section, keyMatch[1]].join(".");
        if (path === locator.value) matches.push(index + 1);
      }
    }
    return requireUniqueMatch(matches, locator);
  }

  if (extension === ".env") {
    if (locator.value.includes(".")) {
      fail("not-verifiable", "nested .env keys are not supported");
    }
    for (const [index, line] of lines.entries()) {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u,
      );
      if (match?.[1] === locator.value) matches.push(index + 1);
    }
    return requireUniqueMatch(matches, locator);
  }

  fail("not-verifiable", `config-key does not support ${extension || "this file"}`);
}

function indentation(line) {
  return line.match(/^[ \t]*/u)[0].replace(/\t/gu, "        ").length;
}

function pythonDeclarationMatches(text, locator) {
  const matches = [];
  const classes = [];
  let tripleQuote = null;
  for (const [index, line] of text.split("\n").entries()) {
    const startedInsideString = tripleQuote !== null;
    tripleQuote = advanceTripleQuoteState(line, tripleQuote);
    if (startedInsideString) continue;
    if (/^\s*(?:#|$)/u.test(line)) continue;
    const indent = indentation(line);
    while (classes.length > 0 && classes.at(-1).indent >= indent) classes.pop();

    const classMatch = line.match(/^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/u);
    if (classMatch) {
      if (locator.kind === "symbol" && classMatch[1] === locator.value) {
        matches.push(index + 1);
      }
      classes.push({ indent, name: classMatch[1] });
      continue;
    }

    const functionMatch = line.match(
      /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u,
    );
    if (!functionMatch) continue;
    const name = functionMatch[1];
    const qualified =
      classes.length > 0 ? `${classes.map((entry) => entry.name).join(".")}.${name}` : name;
    if (locator.kind === "symbol" && locator.value === qualified) {
      matches.push(index + 1);
    }
    if (
      locator.kind === "test" &&
      name.startsWith("test_") &&
      locator.value === qualified
    ) {
      matches.push(index + 1);
    }
  }
  return matches;
}

function countBraces(line) {
  const withoutComment = line.replace(/\/\/.*$/u, "");
  const withoutStrings = withoutComment.replace(
    /(["'`])(?:\\.|(?!\1).)*\1/gu,
    "",
  );
  return [...withoutStrings].reduce(
    (count, character) =>
      count + (character === "{" ? 1 : character === "}" ? -1 : 0),
    0,
  );
}

function javascriptDeclarationMatches(text, locator) {
  const matches = [];
  let braceDepth = 0;
  let currentClass = null;
  let classBodyDepth = null;
  let inBlockComment = false;
  let inTemplate = false;
  for (const [index, line] of text.split("\n").entries()) {
    let codeLine = line;
    if (inBlockComment) {
      const end = codeLine.indexOf("*/");
      if (end === -1) continue;
      codeLine = codeLine.slice(end + 2);
      inBlockComment = false;
    }
    while (codeLine.includes("/*")) {
      const start = codeLine.indexOf("/*");
      const end = codeLine.indexOf("*/", start + 2);
      if (end === -1) {
        codeLine = codeLine.slice(0, start);
        inBlockComment = true;
        break;
      }
      codeLine = `${codeLine.slice(0, start)} ${codeLine.slice(end + 2)}`;
    }

    const startedInsideTemplate = inTemplate;
    for (let offset = 0; offset < codeLine.length; offset += 1) {
      if (codeLine[offset] === "`" && codeLine[offset - 1] !== "\\") {
        inTemplate = !inTemplate;
      }
    }
    if (startedInsideTemplate) continue;

    const trimmed = codeLine.trim();
    if (trimmed.startsWith("//") || trimmed === "") {
      braceDepth += countBraces(codeLine);
      continue;
    }

    if (locator.kind === "test") {
      const testMatch = codeLine.match(
        /^\s*(?:test|it)(?:\.(?:only|skip|todo|concurrent))?\s*\(\s*(["'`])([^"'`]+)\1/u,
      );
      if (testMatch?.[2] === locator.value) matches.push(index + 1);
    } else {
      const declarationPatterns = [
        /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u,
        /^\s*(?:export\s+)?(?:default\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u,
        /^\s*(?:export\s+)?(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u,
      ];
      for (const pattern of declarationPatterns) {
        const match = codeLine.match(pattern);
        if (match?.[1] === locator.value) matches.push(index + 1);
      }

      if (currentClass !== null && braceDepth >= classBodyDepth) {
        const methodMatch = codeLine.match(
          /^\s*(?:(?:public|private|protected|static|async|readonly|abstract)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/u,
        );
        if (`${currentClass}.${methodMatch?.[1]}` === locator.value) {
          matches.push(index + 1);
        }
      }

      const classMatch = codeLine.match(
        /^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u,
      );
      if (classMatch && codeLine.includes("{")) {
        currentClass = classMatch[1];
        classBodyDepth = braceDepth + 1;
      }
    }

    braceDepth += countBraces(codeLine);
    if (currentClass !== null && braceDepth < classBodyDepth) {
      currentClass = null;
      classBodyDepth = null;
    }
  }
  return matches;
}

export function resolveSourceLocator(repositoryRoot, locator) {
  requireString(repositoryRoot, "repositoryRoot");
  validateLocatorShape(locator);

  let root;
  let file;
  try {
    root = realpathSync(repositoryRoot);
    file = realpathSync(resolve(root, locator.path));
  } catch (error) {
    fail("not-verifiable", "source locator path does not exist", {
      cause: error.message,
    });
  }
  if (!file.startsWith(`${root}${sep}`) || !statSync(file).isFile()) {
    fail("invalid", "source locator path escapes the repository or is not a file");
  }

  let text;
  try {
    text = readFileSync(file, "utf8").replace(/\r\n?/gu, "\n");
  } catch (error) {
    fail("not-verifiable", "source locator path is not readable UTF-8", {
      cause: error.message,
    });
  }
  const extension = extname(file).toLowerCase();

  if (locator.kind === "heading") {
    if (![".md", ".mdx"].includes(extension)) {
      fail("not-verifiable", "heading resolver supports Markdown and MDX only");
    }
    return resolveHeading(text, locator);
  }
  if (locator.kind === "json-pointer") {
    if (extension !== ".json") {
      fail("not-verifiable", "json-pointer resolver supports strict JSON only");
    }
    return resolveJsonPointer(text, locator);
  }
  if (locator.kind === "config-key") {
    return resolveConfigKey(
      text,
      basename(file) === ".env" ? ".env" : extension,
      locator,
    );
  }

  let matches;
  if (extension === ".py") {
    matches = pythonDeclarationMatches(text, locator);
  } else if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extension)) {
    matches = javascriptDeclarationMatches(text, locator);
  } else {
    fail(
      "not-verifiable",
      `${locator.kind} resolver does not support ${extension || "this file"}`,
    );
  }
  return requireUniqueMatch(matches, locator);
}

function requireStringArray(values, name, { allowEmpty = false } = {}) {
  assertUniqueStrings(values, name);
  if (!allowEmpty && values.length === 0) {
    fail("invalid", `${name} cannot be empty`);
  }
  return values;
}

function renderYamlScalar(value) {
  return value === null ? "null" : JSON.stringify(value);
}

function renderYamlList(name, values) {
  return [
    `${name}:`,
    ...values.map((value) => `  - ${renderYamlScalar(value)}`),
  ];
}

function requireSection(sections, key) {
  const value = requireString(sections[key], `sections.${key}`)
    .replace(/\r\n?/gu, "\n")
    .trim();
  if (value.includes(PAYLOAD_BEGIN) || value.includes(PAYLOAD_END)) {
    fail("invalid", `sections.${key} contains a workflow delimiter`);
  }
  return value;
}

export function buildChangeSpecEnvelope(input) {
  requireObject(input, "Change Spec input");
  requireString(input.spec_id, "spec_id");
  requireString(input.issue, "issue");
  requireString(input.created_at, "created_at");
  const issueType = input.issue_type ?? "standalone";
  const binding = validateWikiExecutionBinding({
    issue_type: issueType,
    wiki_impact: input.wiki_impact,
    wiki_operation: input.wiki_operation,
    wiki_baseline_requirement: input.wiki_baseline_requirement,
    wiki_preview_id: input.wiki_preview_id,
    wiki_preview_payload_sha256: input.wiki_preview_payload_sha256,
  });

  requireStringArray(input.wiki_context, "wiki_context", {
    allowEmpty: binding.wiki_operation === "none",
  });
  requireArray(input.wiki_dispositions, "wiki_dispositions");
  if (binding.wiki_operation !== "none" && input.wiki_dispositions.length === 0) {
    fail("invalid", "Wiki operations require dispositions");
  }
  if (binding.wiki_operation === "none" && input.wiki_dispositions.length !== 0) {
    fail("invalid", "Wiki-free Change Specs cannot contain dispositions");
  }
  const dispositionKeys = new Set();
  const dispositions = input.wiki_dispositions.map((disposition, index) => {
    requireObject(disposition, `wiki_dispositions[${index}]`);
    requireString(disposition.topic, `wiki_dispositions[${index}].topic`);
    requireString(disposition.claim, `wiki_dispositions[${index}].claim`);
    requireEnum(
      disposition.disposition,
      ["inherit", "add", "change", "remove"],
      `wiki_dispositions[${index}].disposition`,
    );
    const key = JSON.stringify([disposition.topic, disposition.claim]);
    if (dispositionKeys.has(key)) {
      fail("invalid", "Wiki dispositions must identify unique topic claims");
    }
    dispositionKeys.add(key);
    return JSON.stringify(canonicalJsonValue(disposition));
  });
  requireStringArray(input.explicit_overrides, "explicit_overrides");
  requireStringArray(input.acceptance, "acceptance");
  requireStringArray(input.verification_seams, "verification_seams");
  requireStringArray(input.out_of_scope, "out_of_scope");
  if (input.supersedes !== null) {
    requireString(input.supersedes, "supersedes");
  }
  const sections = requireObject(input.sections, "sections");

  const payload = [
    `spec_id: ${renderYamlScalar(input.spec_id)}`,
    "status: specified",
    `issue: ${renderYamlScalar(input.issue)}`,
    `created_at: ${renderYamlScalar(input.created_at)}`,
    `wiki_impact: ${renderYamlScalar(binding.wiki_impact)}`,
    `wiki_operation: ${renderYamlScalar(binding.wiki_operation)}`,
    `wiki_baseline_requirement: ${renderYamlScalar(
      binding.wiki_baseline_requirement,
    )}`,
    `wiki_preview_id: ${renderYamlScalar(binding.wiki_preview_id)}`,
    `wiki_preview_payload_sha256: ${renderYamlScalar(
      binding.wiki_preview_payload_sha256,
    )}`,
    ...renderYamlList("wiki_context", input.wiki_context),
    ...renderYamlList("wiki_dispositions", dispositions),
    ...renderYamlList("explicit_overrides", input.explicit_overrides),
    ...renderYamlList("acceptance", input.acceptance),
    ...renderYamlList("verification_seams", input.verification_seams),
    ...renderYamlList("out_of_scope", input.out_of_scope),
    `supersedes: ${renderYamlScalar(input.supersedes)}`,
    "",
    "## Problem",
    requireSection(sections, "problem"),
    "",
    "## Solution",
    requireSection(sections, "solution"),
    "",
    "## User Stories",
    requireSection(sections, "user_stories"),
    "",
    "## Implementation Decisions",
    requireSection(sections, "implementation_decisions"),
    "",
    "## Testing Decisions",
    requireSection(sections, "testing_decisions"),
    "",
    "## Proof Boundaries",
    requireSection(sections, "proof_boundaries"),
    "",
    "## Further Notes",
    requireSection(sections, "further_notes"),
    "",
  ].join("\n");
  const envelope = createEnvelope("workflow-change-spec:v1", payload);
  const verified = verifyEnvelope(envelope, "workflow-change-spec:v1");
  return {
    payload: verified.payload,
    payload_sha256: verified.payload_sha256,
    envelope,
  };
}

export function buildExecutionContractEnvelope(input) {
  requireObject(input, "execution contract input");
  requireString(input.contract_id, "contract_id");
  requireString(input.issue, "issue");
  requireEnum(input.issue_type, ["leaf", "standalone"], "issue_type");
  if (input.issue_type === "leaf") requireString(input.parent, "parent");
  else requireNull(input.parent, "parent");
  requireString(input.spec_id, "spec_id");
  requireString(input.spec_comment_id, "spec_comment_id");
  requireSha256(input.spec_payload_sha256, "spec_payload_sha256");
  requireString(input.outcome, "outcome");
  requireStringArray(input.acceptance, "acceptance");
  requireStringArray(input.verification_seams, "verification_seams");
  requireStringArray(input.verification_commands, "verification_commands");
  requireString(input.target_branch, "target_branch");
  const targetIdentity = input.target_identity ?? input.target_sha;
  requireIdentity(targetIdentity, "target_identity");
  requireString(input.lane_id, "lane_id");
  if (input.lane_predecessor !== null) {
    requireString(input.lane_predecessor, "lane_predecessor");
  }
  requireStringArray(input.blocked_by, "blocked_by", { allowEmpty: true });
  if (
    input.lane_predecessor !== null &&
    !input.blocked_by.includes(input.lane_predecessor)
  ) {
    fail("invalid", "lane predecessor must be a durable blocker");
  }
  assertUniqueStrings(input.owned_paths, "owned_paths", {
    repositoryPaths: true,
  });
  if (input.owned_paths.length === 0) {
    fail("invalid", "execution contract requires owned paths");
  }

  const binding = validateWikiExecutionBinding({
    issue_type: input.issue_type,
    wiki_impact: input.wiki_impact,
    wiki_operation: input.wiki_operation,
    wiki_baseline_requirement: input.wiki_baseline_requirement,
    wiki_preview_id: input.wiki_preview_id,
    wiki_preview_payload_sha256: input.wiki_preview_payload_sha256,
  });
  if (binding.wiki_operation !== "none") {
    requireSha256(input.wiki_dispositions_sha256, "wiki_dispositions_sha256");
  } else {
    requireNull(input.wiki_dispositions_sha256, "wiki_dispositions_sha256");
  }
  requireEnum(input.risk, ["low", "medium", "high"], "risk");
  requireEnum(input.review_profile, ["focused", "full"], "review_profile");
  if (input.expected_proof_state !== "implemented_on_lane") {
    fail("invalid", "expected proof state must be implemented_on_lane");
  }
  requireCleanPathExcludes(input.excludes);
  if (input.supersedes !== null) {
    requireString(input.supersedes, "supersedes");
  }

  const payload = [
    `contract_id: ${renderYamlScalar(input.contract_id)}`,
    `issue: ${renderYamlScalar(input.issue)}`,
    `issue_type: ${renderYamlScalar(input.issue_type)}`,
    `parent: ${renderYamlScalar(input.parent)}`,
    `spec_id: ${renderYamlScalar(input.spec_id)}`,
    `spec_comment_id: ${renderYamlScalar(input.spec_comment_id)}`,
    `spec_payload_sha256: ${renderYamlScalar(input.spec_payload_sha256)}`,
    `outcome: ${renderYamlScalar(input.outcome)}`,
    ...renderYamlList("acceptance", input.acceptance),
    ...renderYamlList("verification_seams", input.verification_seams),
    ...renderYamlList("verification_commands", input.verification_commands),
    `target_branch: ${renderYamlScalar(input.target_branch)}`,
    `target_sha: ${renderYamlScalar(targetIdentity)}`,
    `lane_id: ${renderYamlScalar(input.lane_id)}`,
    `lane_predecessor: ${renderYamlScalar(input.lane_predecessor)}`,
    ...renderYamlList("blocked_by", input.blocked_by),
    ...renderYamlList("owned_paths", input.owned_paths),
    `owned_paths_sha256: ${renderYamlScalar(
      hashCanonicalJson(input.owned_paths),
    )}`,
    `wiki_impact: ${renderYamlScalar(binding.wiki_impact)}`,
    `wiki_operation: ${renderYamlScalar(binding.wiki_operation)}`,
    `wiki_baseline_requirement: ${renderYamlScalar(
      binding.wiki_baseline_requirement,
    )}`,
    `wiki_preview_id: ${renderYamlScalar(binding.wiki_preview_id)}`,
    `wiki_preview_payload_sha256: ${renderYamlScalar(
      binding.wiki_preview_payload_sha256,
    )}`,
    `wiki_dispositions_sha256: ${renderYamlScalar(
      input.wiki_dispositions_sha256,
    )}`,
    `risk: ${renderYamlScalar(input.risk)}`,
    `review_profile: ${renderYamlScalar(input.review_profile)}`,
    `expected_proof_state: ${renderYamlScalar(
      input.expected_proof_state,
    )}`,
    ...renderYamlList("excludes", input.excludes),
    `supersedes: ${renderYamlScalar(input.supersedes)}`,
    "",
  ].join("\n");
  const envelope = createEnvelope("workflow-execution-contract:v1", payload);
  const verified = verifyEnvelope(envelope, "workflow-execution-contract:v1");
  return {
    payload: verified.payload,
    payload_sha256: verified.payload_sha256,
    envelope,
  };
}

function meaningfulBlocks(sectionText) {
  const visibleLines = [];
  let fence = false;
  for (const line of sectionText.split("\n")) {
    if (/^\s*```/u.test(line)) {
      fence = !fence;
      continue;
    }
    if (!fence) visibleLines.push(line);
  }

  const blocks = [];
  for (const paragraph of visibleLines.join("\n").split(/\n\s*\n/gu)) {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line !== "" &&
          !line.startsWith("#") &&
          !/^<!--.*-->$/u.test(line),
      );
    if (lines.length === 0) continue;
    if (lines.every((line) => /^[-*+]\s+/u.test(line))) {
      blocks.push(...lines);
    } else {
      blocks.push(lines.join(" "));
    }
  }
  return blocks;
}

export function validateWikiPage(markdown) {
  if (typeof markdown !== "string") fail("invalid", "Wiki page must be text");
  const normalized = markdown.replace(/\r\n?/gu, "\n");
  const h1s = [...normalized.matchAll(/^#\s+(.+)$/gmu)];
  if (h1s.length !== 1 || h1s[0].index !== 0) {
    fail("invalid", "Wiki page requires exactly one leading H1");
  }

  const headings = [
    ...normalized.matchAll(/^##\s+(.+?)\s*#*\s*$/gmu),
  ].map((match) => ({
    name: match[1].trim().replace(/\s+/gu, " "),
    start: match.index,
    bodyStart: match.index + match[0].length,
  }));
  const headingNames = headings.map((heading) => heading.name);
  const required = [
    "Purpose and scope",
    "Current behavior",
    "Rules and invariants",
    "Dependencies",
    "Sources",
  ];
  for (const name of required) {
    if (headingNames.filter((candidate) => candidate === name).length !== 1) {
      fail("invalid", `Wiki page requires exactly one ${name} section`);
    }
  }
  if (
    headingNames.filter((name) => name === "States and exceptions").length > 1
  ) {
    fail("invalid", "Wiki page contains duplicate States and exceptions sections");
  }
  const requiredPositions = required.map((name) => headingNames.indexOf(name));
  if (
    requiredPositions.some(
      (position, index) => index > 0 && position <= requiredPositions[index - 1],
    )
  ) {
    fail("invalid", "Wiki page contract sections are out of order");
  }
  const statesPosition = headingNames.indexOf("States and exceptions");
  if (
    statesPosition !== -1 &&
    (statesPosition <= headingNames.indexOf("Rules and invariants") ||
      statesPosition >= headingNames.indexOf("Dependencies"))
  ) {
    fail("invalid", "States and exceptions is out of contract order");
  }
  if (headingNames.at(-1) !== "Sources") {
    fail("invalid", "Sources must be the final H2 section");
  }

  const sections = new Map();
  for (const [index, heading] of headings.entries()) {
    const end = headings[index + 1]?.start ?? normalized.length;
    sections.set(heading.name, normalized.slice(heading.bodyStart, end).trim());
  }
  for (const name of required.filter((candidate) => candidate !== "Sources")) {
    if (meaningfulBlocks(sections.get(name)).length === 0) {
      fail("invalid", `${name} must contain meaningful content`);
    }
  }
  if (
    sections.has("States and exceptions") &&
    meaningfulBlocks(sections.get("States and exceptions")).length === 0
  ) {
    fail("invalid", "States and exceptions must contain meaningful content");
  }

  const claimSections = [
    "Current behavior",
    "Rules and invariants",
    "States and exceptions",
    "Dependencies",
  ];
  for (const name of claimSections) {
    if (!sections.has(name)) continue;
    for (const block of meaningfulBlocks(sections.get(name))) {
      if (!/\[S[1-9][0-9]*\]/u.test(block)) {
        fail("invalid", `${name} contains a claim without a source mapping`);
      }
    }
  }

  if ((normalized.match(/```json\s*$/gmu) ?? []).length !== 1) {
    fail("invalid", "Wiki page must contain exactly one Sources JSON object");
  }
  const sourcesMatch = sections
    .get("Sources")
    .match(/^```json\n([\s\S]*?)\n```$/u);
  if (!sourcesMatch) {
    fail("invalid", "Sources must contain only one strict JSON fence");
  }

  let sourcesObject;
  try {
    sourcesObject = JSON.parse(sourcesMatch[1]);
  } catch (error) {
    fail("invalid", "Sources JSON is invalid", { cause: error.message });
  }
  requireObject(sourcesObject, "Sources");
  if (sourcesObject.schema !== "wiki-sources:v1") {
    fail("invalid", "unsupported Sources schema");
  }
  requireArray(sourcesObject.sources, "Sources.sources");
  if (sourcesObject.sources.length === 0) {
    fail("invalid", "Sources requires at least one entry");
  }

  const sourceIds = new Set();
  for (const [index, source] of sourcesObject.sources.entries()) {
    requireObject(source, `Sources.sources[${index}]`);
    if (!/^S[1-9][0-9]*$/u.test(source.id)) {
      fail("invalid", "Source IDs must use S1-style page-local identifiers");
    }
    if (sourceIds.has(source.id)) fail("invalid", "Source IDs must be unique");
    sourceIds.add(source.id);
    validateLocatorShape(source, `Sources.sources[${index}]`);
  }

  const narrative = normalized.slice(0, headings.at(-1).start);
  const references = [
    ...narrative.matchAll(/\[(S[1-9][0-9]*)\]/gu),
  ].map((match) => match[1]);
  for (const reference of references) {
    if (!sourceIds.has(reference)) {
      fail("invalid", `claim references unknown Source ${reference}`);
    }
  }
  for (const sourceId of sourceIds) {
    if (!references.includes(sourceId)) {
      fail("invalid", `Source ${sourceId} is not referenced by a claim`);
    }
  }

  return {
    status: "valid",
    title: h1s[0][1].trim(),
    sources: sourcesObject.sources,
  };
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function repositoryPath(root, file) {
  return relative(root, file).split(sep).join("/");
}

function collectWikiMarkdownFiles(root, directory, files = []) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  } catch (error) {
    fail("not-verifiable", "Wiki root is not readable", {
      cause: error.message,
    });
  }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      fail("not-verifiable", "Wiki validation does not follow symbolic links", {
        path: repositoryPath(root, path),
      });
    }
    if (entry.isDirectory()) {
      collectWikiMarkdownFiles(root, path, files);
    } else if (
      entry.isFile() &&
      [".md", ".mdx"].includes(extname(entry.name).toLowerCase())
    ) {
      files.push(path);
    }
  }
  return files;
}

function extractWikiLinkTargets(markdown) {
  const targets = [];
  const inline =
    /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/gu;
  for (const match of markdown.matchAll(inline)) {
    targets.push(match[1] ?? match[2]);
  }
  const references =
    /^\s*\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|([^\s]+))/gmu;
  for (const match of markdown.matchAll(references)) {
    targets.push(match[1] ?? match[2]);
  }
  const wikiLinks = /!?\[\[([^\]\n]+)\]\]/gu;
  for (const match of markdown.matchAll(wikiLinks)) {
    targets.push(match[1].split("|", 1)[0].trim());
  }
  return targets;
}

function headingSlugs(markdown) {
  const counts = new Map();
  const slugs = new Set();
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
    const base = match[1]
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\p{Mark} _-]/gu, "")
      .replace(/\s+/gu, "-");
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

function decodedLinkPart(value, sourcePath, target) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    fail("not-verifiable", "Wiki link contains invalid percent encoding", {
      path: sourcePath,
      target,
      cause: error.message,
    });
  }
}

function resolveWikiLinkTarget(root, wikiRoot, source, target) {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith("//")) {
    return { external: true };
  }

  const fragmentOffset = target.indexOf("#");
  const rawPath =
    fragmentOffset === -1 ? target : target.slice(0, fragmentOffset);
  const rawFragment =
    fragmentOffset === -1 ? "" : target.slice(fragmentOffset + 1);
  const queryOffset = rawPath.indexOf("?");
  const withoutQuery =
    queryOffset === -1 ? rawPath : rawPath.slice(0, queryOffset);
  const sourcePath = repositoryPath(root, source);
  const linkPath = decodedLinkPart(withoutQuery, sourcePath, target);
  const fragment = decodedLinkPart(rawFragment, sourcePath, target);

  if (linkPath.startsWith("/")) {
    return { finding: { path: sourcePath, target, reason: "outside-wiki-root" } };
  }

  const candidate = linkPath === "" ? source : resolve(dirname(source), linkPath);
  if (!isInside(wikiRoot, candidate)) {
    return { finding: { path: sourcePath, target, reason: "outside-wiki-root" } };
  }

  const candidates = [candidate];
  if (linkPath !== "" && extname(candidate) === "") {
    candidates.push(`${candidate}.md`, `${candidate}.mdx`);
  }
  let resolvedTarget;
  for (const path of candidates) {
    try {
      const real = realpathSync(path);
      if (
        isInside(wikiRoot, real) &&
        statSync(real).isFile() &&
        resolvedTarget === undefined
      ) {
        resolvedTarget = real;
      } else if (
        isInside(wikiRoot, real) &&
        statSync(real).isFile() &&
        resolvedTarget !== real
      ) {
        return {
          finding: {
            path: sourcePath,
            target,
            reason: "ambiguous-target",
          },
        };
      }
    } catch {
      // Try the next deterministic Markdown candidate.
    }
  }
  if (resolvedTarget === undefined) {
    return { finding: { path: sourcePath, target, reason: "missing-target" } };
  }

  if (fragment !== "") {
    let targetText;
    try {
      targetText = readFileSync(resolvedTarget, "utf8").replace(/\r\n?/gu, "\n");
    } catch (error) {
      fail("not-verifiable", "Wiki link target is not readable UTF-8", {
        path: repositoryPath(root, resolvedTarget),
        cause: error.message,
      });
    }
    if (!headingSlugs(targetText).has(fragment)) {
      return {
        finding: {
          path: sourcePath,
          target,
          reason: "missing-fragment",
        },
      };
    }
  }
  return { external: false };
}

export function validateWikiLinks(repositoryRoot, wikiRootPath) {
  requireString(repositoryRoot, "repositoryRoot");
  assertRepositoryPath(wikiRootPath, "wikiRoot");

  let root;
  let wikiRoot;
  try {
    root = realpathSync(repositoryRoot);
    wikiRoot = realpathSync(resolve(root, wikiRootPath));
  } catch (error) {
    fail("not-verifiable", "Wiki root does not exist", {
      cause: error.message,
    });
  }
  if (!isInside(root, wikiRoot) || !statSync(wikiRoot).isDirectory()) {
    fail("invalid", "Wiki root escapes the repository or is not a directory");
  }

  const files = collectWikiMarkdownFiles(root, wikiRoot).sort((left, right) =>
    repositoryPath(root, left).localeCompare(repositoryPath(root, right)),
  );
  const findings = [];
  let linksChecked = 0;
  for (const file of files) {
    let markdown;
    try {
      markdown = readFileSync(file, "utf8").replace(/\r\n?/gu, "\n");
    } catch (error) {
      fail("not-verifiable", "Wiki page is not readable UTF-8", {
        path: repositoryPath(root, file),
        cause: error.message,
      });
    }
    for (const target of extractWikiLinkTargets(markdown)) {
      const result = resolveWikiLinkTarget(root, wikiRoot, file, target);
      if (result.external) continue;
      linksChecked += 1;
      if (result.finding) findings.push(result.finding);
    }
  }
  findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.target.localeCompare(right.target) ||
      left.reason.localeCompare(right.reason),
  );
  if (findings.length > 0) {
    fail("findings", "Wiki links contain unresolved targets", { findings });
  }
  return {
    status: "valid",
    root: wikiRootPath,
    files: files.map((file) => repositoryPath(root, file)),
    links_checked: linksChecked,
  };
}

export function resolverCapabilities() {
  return {
    profile: "ron-source-resolvers:v1",
    bundled: {
      heading: [".md", ".mdx"],
      "json-pointer": [".json"],
      "config-key": [".json", ".yaml", ".yml", ".toml", ".env"],
      symbol: [".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
      test: [".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
    },
  };
}

export function runCliCommand(command, input = {}) {
  requireString(command, "command");
  requireObject(input, "CLI input");
  let result;
  switch (command) {
    case "config-validate":
      result = { status: "valid", config: extractWorkflowConfig(input.markdown) };
      break;
    case "envelope-create":
      result = {
        status: "valid",
        envelope: createEnvelope(input.marker, input.payload),
      };
      break;
    case "envelope-verify":
      result = {
        status: "valid",
        ...verifyEnvelope(input.envelope, input.marker),
      };
      break;
    case "binding-validate":
      result = {
        status: "valid",
        binding: validateWikiExecutionBinding(input.binding),
      };
      break;
    case "preview-validate":
      result = { status: "valid", preview: validatePreview(input.preview) };
      break;
    case "delegation-validate":
      result = {
        status: "valid",
        delegation: validatePreIssueDelegation(input.delegation),
      };
      break;
    case "delegation-envelope-create":
      result = {
        status: "valid",
        ...buildCleanPathDelegationEnvelope(input.delegation),
      };
      break;
    case "grant-derive": {
      const grant = deriveIssueGrant(input);
      const built = buildAuthorizationEnvelope(grant);
      result = {
        status: "valid",
        grant,
        payload: built.payload,
        payload_sha256: built.payload_sha256,
        envelope: built.envelope,
      };
      break;
    }
    case "closeout-preview-create":
      result = {
        status: "valid",
        ...buildCloseoutPreviewEnvelope(input),
      };
      break;
    case "closeout-grant-derive": {
      const grant = deriveCloseoutGrant(input);
      const built = buildAuthorizationEnvelope(grant);
      result = {
        status: "valid",
        grant,
        payload: built.payload,
        payload_sha256: built.payload_sha256,
        envelope: built.envelope,
      };
      break;
    }
    case "source-resolve":
      result = resolveSourceLocator(input.repository_root, input.locator);
      break;
    case "links-validate":
      result = validateWikiLinks(input.repository_root, input.wiki_root);
      break;
    case "page-validate":
      result = validateWikiPage(input.markdown);
      break;
    case "ledger-validate": {
      const ledger = validateReconciliationLedger(input.ledger);
      if (ledger.status === "findings") {
        fail("findings", "reconciliation ledger contains a deviation", ledger);
      }
      if (ledger.status === "not-verifiable") {
        fail("not-verifiable", "reconciliation ledger is unverified", ledger);
      }
      result = ledger;
      break;
    }
    case "change-spec-create":
      result = { status: "valid", ...buildChangeSpecEnvelope(input) };
      break;
    case "execution-contract-create":
      result = {
        status: "valid",
        ...buildExecutionContractEnvelope(input),
      };
      break;
    case "capabilities":
      result = { status: "valid", ...resolverCapabilities() };
      break;
    default:
      fail("invalid", `unsupported Ron Wiki command: ${command}`);
  }
  return result;
}

function workflowErrorExit(code) {
  if (code === "invalid") return 2;
  if (code === "not-verifiable") return 3;
  if (code === "findings" || code === "scope") return 4;
  return 1;
}

function runMain() {
  let input;
  try {
    const stdin = readFileSync(0, "utf8").trim();
    input = stdin === "" ? {} : JSON.parse(stdin);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        status: "invalid",
        error: "CLI input must be strict JSON",
        details: { cause: error.message },
      })}\n`,
    );
    process.exitCode = 2;
    return;
  }

  try {
    const result = runCliCommand(process.argv[2], input);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error instanceof WorkflowError) {
      process.stdout.write(
        `${JSON.stringify({
          status: error.code,
          error: error.message,
          details: error.details,
        })}\n`,
      );
      process.exitCode = workflowErrorExit(error.code);
      return;
    }
    process.stderr.write(
      `${JSON.stringify({
        status: "tool-failure",
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(realpathSync(invokedPath)).href
) {
  runMain();
}

export function createEnvelope(marker, payload) {
  requireString(marker, "marker");
  if (marker.includes("\n")) fail("invalid", "marker must be one line");
  const canonicalPayload = canonicalizePayload(payload);
  const payloadSha256 = hashPayload(canonicalPayload);
  return [
    marker,
    PAYLOAD_BEGIN,
    `${canonicalPayload}${PAYLOAD_END}`,
    `payload_sha256: ${payloadSha256}`,
    "",
  ].join("\n");
}

export function verifyEnvelope(envelope, expectedMarker) {
  if (typeof envelope !== "string") fail("invalid", "envelope must be text");
  requireString(expectedMarker, "expectedMarker");
  const normalized = envelope.replace(/\r\n?/gu, "\n");
  const prefix = `${expectedMarker}\n${PAYLOAD_BEGIN}\n`;
  const suffixPrefix = `${PAYLOAD_END}\npayload_sha256: `;
  if (!normalized.startsWith(prefix)) fail("invalid", "workflow marker mismatch");

  const suffixAt = normalized.indexOf(suffixPrefix, prefix.length);
  if (suffixAt === -1) fail("invalid", "workflow payload delimiters are missing");
  if (normalized.indexOf(suffixPrefix, suffixAt + 1) !== -1) {
    fail("invalid", "workflow envelope contains duplicate hash fields");
  }

  const payload = normalized.slice(prefix.length, suffixAt);
  if (canonicalizePayload(payload) !== payload) {
    fail("invalid", "workflow payload is not canonical");
  }

  const hashText = normalized.slice(suffixAt + suffixPrefix.length);
  const hashMatch = hashText.match(/^([a-f0-9]{64})\n$/u);
  if (!hashMatch) fail("invalid", "workflow payload hash field is invalid");

  const actual = hashPayload(payload);
  const expected = hashMatch[1];
  if (
    !timingSafeEqual(
      Buffer.from(actual, "ascii"),
      Buffer.from(expected, "ascii"),
    )
  ) {
    fail("invalid", "workflow payload hash mismatch");
  }

  return {
    marker: expectedMarker,
    payload,
    payload_sha256: expected,
  };
}
