import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildChangeSpecEnvelope,
  buildCleanPathDelegationEnvelope,
  buildCloseoutPreviewEnvelope,
  buildExecutionContractEnvelope,
  buildAuthorizationEnvelope,
  createEnvelope,
  deriveCloseoutGrant,
  deriveIssueGrant,
  extractWorkflowConfig,
  hashCanonicalJson,
  resolveSourceLocator,
  validateCloseoutPreview,
  validatePreIssueDelegation,
  validatePreview,
  validateReconciliationLedger,
  validateWikiLinks,
  validateWikiPage,
  validateWikiExecutionBinding,
  verifyEnvelope,
} from "../../scripts/ron-workflow/ron-wiki.mjs";

const validConfig = {
  schema: "ron-workflow-config:v1",
  ron_workflow: "v1",
  mode: "full",
  interaction: { policy: "exception_only" },
  wiki: {
    contract_schema: "ron-wiki:v1",
    root: "wiki",
    baseline_state: "missing",
    page_contract: "ron-wiki-page:v1",
    sources_contract: "wiki-sources:v1",
    resolver_profile: "ron-source-resolvers:v1",
    external_resolvers: [],
    context_mode: "staging",
    mutation_policy: "closeout_only",
    protocol: {
      name: "ron-wiki-protocol",
      commit: "0123456789abcdef0123456789abcdef01234567",
      hash: "a".repeat(64),
    },
    engine: { state: "absent", identity: null },
    validators: {
      page: "node page.mjs",
      sources: "node sources.mjs",
      links: "node links.mjs",
      build: null,
    },
    support_write_set: [],
    publication: "disabled",
  },
  target: { branch: "main", integration: "fast-forward-only" },
  lane: { worktree_root: ".worktrees", naming: "ron-{issue}" },
  excludes: [
    "push",
    "remote-merge",
    "deploy",
    "branch-deletion",
    "live-provider-actions",
  ],
};

function configMarkdown(config = validConfig) {
  return [
    "# Ron workflow",
    "",
    "<!-- ron-workflow-config:v1:begin -->",
    "```json",
    JSON.stringify(config, null, 2),
    "```",
    "<!-- ron-workflow-config:v1:end -->",
    "",
  ].join("\n");
}

function fixtureRepository(t) {
  const root = mkdtempSync(join(tmpdir(), "ron-wiki-core-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "wiki"), { recursive: true });
  return root;
}

const bootstrapPreview = {
  schema: "workflow-wiki-bootstrap-preview:v1",
  preview_id: "wiki-bootstrap-1",
  created_at: "2026-07-26T09:00:00.000Z",
  target: {
    repository: "ron/example",
    branch: "main",
    identity: "b".repeat(40),
  },
  root: {
    path: "wiki",
    assessment: "needs-bootstrap",
  },
  baseline_state: "missing",
  boundedness: {
    state: "bounded",
    reason: "Two current business topics.",
  },
  topics: [
    {
      id: "orders",
      page_path: "wiki/orders.md",
      purpose: "Describe the current order flow.",
      scope: "Current order creation and cancellation.",
      dependencies: [],
      source_seeds: [
        {
          path: "src/orders.ts",
          kind: "symbol",
          value: "createOrder",
        },
      ],
    },
  ],
  batches: [{ id: "batch-1", topics: ["orders"] }],
  contracts: {
    page: "ron-wiki-page:v1",
    sources: "wiki-sources:v1",
    resolvers: "ron-source-resolvers:v1",
  },
  validators: ["node validate-page.mjs", "node validate-sources.mjs"],
  excludes: [
    "push",
    "remote-merge",
    "deploy",
    "branch-deletion",
    "live-provider-actions",
    "legacy-data-deletion",
  ],
  publication: "disabled",
  protocol: {
    name: "ron-wiki-protocol",
    commit: "c".repeat(40),
    hash: "d".repeat(64),
  },
  engine: { state: "absent", identity: null },
};

const preIssueDelegation = {
  schema: "workflow-clean-path-delegation:v1",
  delegation_id: "delegation-1",
  status: "active",
  origin: "direct-human",
  approver: "ron",
  approved_at: "2026-07-26T09:05:00.000Z",
  preview: {
    kind: "bootstrap",
    id: "wiki-bootstrap-1",
    payload_sha256: "e".repeat(64),
  },
  repository: "ron/example",
  target: {
    branch: "main",
    identity: "b".repeat(40),
  },
  target_refresh: "denied",
  scope: {
    code_paths: [],
    artifact_paths: [".worktrees/ron-42/.wiki-staging"],
    wiki_paths: ["wiki/index.md", "wiki/orders.md"],
    config_paths: ["docs/agents/ron-workflow.md"],
  },
  grants: ["publish_bootstrap_spec"],
  downstream_capabilities: ["execute", "close_standalone"],
  validators: ["node validate-page.mjs", "node validate-sources.mjs"],
  review_axes: ["standards", "spec", "wiki"],
  excludes: [
    "push",
    "remote-merge",
    "deploy",
    "branch-deletion",
    "live-provider-actions",
    "legacy-data-deletion",
  ],
};

const alignedLedger = {
  schema: "workflow-wiki-reconciliation-ledger:v1",
  rows: [
    {
      id: "orders-cancellation",
      topic: "orders",
      claim: "Orders can be cancelled before fulfillment.",
      prior_state: "present",
      disposition: "change",
      source_locators: [
        {
          path: "src/orders.ts",
          kind: "symbol",
          value: "cancelOrder",
        },
        {
          path: "src/orders.test.ts",
          kind: "test",
          value: "cancels an order",
        },
      ],
      conformance: "aligned",
      wiki_action: "update",
      wiki_path: "wiki/orders.md",
    },
  ],
};

const closeoutDelegation = {
  schema: "workflow-authorization:v1",
  record_id: "grant-standalone-1",
  status: "active",
  approver: "ron",
  approved_at: "2026-07-26T09:10:00.000Z",
  origin: "derived-clean-path",
  derived_by: "codex",
  derived_at: "2026-07-26T09:10:00.000Z",
  delegated_from: "delegation-1",
  delegated_from_kind: "pre-issue-record",
  delegated_from_payload_sha256: hashCanonicalJson(preIssueDelegation),
  binds: {
    issue: "ron/example#42",
    spec_id: "spec-1",
    spec_comment_id: "comment-1",
    spec_payload_sha256: "f".repeat(64),
    contract_id: "contract-1",
    contract_comment_id: "comment-2",
    contract_payload_sha256: "9".repeat(64),
    target_branch: "main",
    target_identity: "b".repeat(40),
    scope_ceiling_sha256: "7".repeat(64),
    wiki_operation: "bootstrap",
    wiki_baseline_requirement: "missing-with-bootstrap-preview",
    wiki_preview_id: "wiki-bootstrap-1",
    wiki_preview_payload_sha256: "e".repeat(64),
    exact_paths: [
      ".worktrees/ron-42/.wiki-staging",
      "wiki/index.md",
      "wiki/orders.md",
      "docs/agents/ron-workflow.md",
    ],
  },
  grants: ["execute", "close_standalone"],
  validators: ["node validate-page.mjs", "node validate-sources.mjs"],
  review_axes: ["standards", "spec", "wiki"],
  excludes: [
    "push",
    "remote-merge",
    "deploy",
    "branch-deletion",
    "live-provider-actions",
    "legacy-data-deletion",
  ],
  preconditions: ["all bound inputs remain current"],
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

const closeoutPreviewInput = {
  preview_id: "closeout-preview-1",
  created_at: "2026-07-26T09:20:00.000Z",
  mode: "standalone",
  issue: "ron/example#42",
  spec: {
    id: "spec-1",
    comment_id: "comment-1",
    payload_sha256: "f".repeat(64),
  },
  contract: {
    id: "contract-1",
    comment_id: "comment-2",
    payload_sha256: "9".repeat(64),
  },
  child_contracts_payload_sha256: null,
  root_delegation: {
    delegation_id: "delegation-1",
    payload_sha256: hashCanonicalJson(preIssueDelegation),
  },
  source_authorization: {
    record_id: "grant-standalone-1",
    payload_sha256: hashCanonicalJson(closeoutDelegation),
  },
  evidence_payload_sha256: "8".repeat(64),
  lane: { id: "lane-42", identity: "1".repeat(40) },
  target: { branch: "main", identity: "b".repeat(40) },
  wiki_impact: "semantic",
  wiki_operation: "bootstrap",
  wiki_baseline_requirement: "missing-with-bootstrap-preview",
  wiki_preview_id: "wiki-bootstrap-1",
  wiki_preview_payload_sha256: "e".repeat(64),
  ledger: alignedLedger,
  semantic_write_set: ["wiki/orders.md"],
  support_write_set: [
    "wiki/index.md",
    "docs/agents/ron-workflow.md",
  ],
  protocol: {
    name: "ron-wiki-protocol",
    commit: "c".repeat(40),
    hash: "d".repeat(64),
  },
  staging_path: ".worktrees/ron-42/.wiki-staging",
  verification_commands: [
    "node validate-page.mjs",
    "node validate-sources.mjs",
  ],
  review_axes: ["standards", "spec", "wiki"],
  capability: "close_standalone",
  target_refresh: "denied",
  repair: {
    wiki_waves: 2,
    wiki_authority: "human-grant-required",
    code_findings: "repair-leaf-only",
  },
  excludes: [
    "push",
    "remote-merge",
    "deploy",
    "branch-deletion",
    "live-provider-actions",
    "legacy-data-deletion",
  ],
};

function closeoutDerivationForRoot(root, previewInput = closeoutPreviewInput) {
  const rootHash = hashCanonicalJson(root);
  const sourceAuthorization = structuredClone(closeoutDelegation);
  sourceAuthorization.delegated_from_payload_sha256 = rootHash;
  sourceAuthorization.excludes = [...root.excludes];
  const sourceHash = hashCanonicalJson(sourceAuthorization);
  const boundPreviewInput = structuredClone(previewInput);
  boundPreviewInput.root_delegation.payload_sha256 = rootHash;
  boundPreviewInput.source_authorization.payload_sha256 = sourceHash;
  const result = buildCloseoutPreviewEnvelope(boundPreviewInput);
  return {
    root_delegation: root,
    root_delegation_payload_sha256: rootHash,
    source_authorization: sourceAuthorization,
    source_authorization_payload_sha256: sourceHash,
    preview: result.preview,
    preview_payload_sha256: result.payload_sha256,
  };
}

test("extractWorkflowConfig accepts exactly one strict JSON machine block", () => {
  assert.deepEqual(extractWorkflowConfig(configMarkdown()), validConfig);
});

test("extractWorkflowConfig refuses free text and duplicate machine blocks", () => {
  assert.throws(
    () => extractWorkflowConfig("# ron_workflow: v1\nwiki: ready\n"),
    { code: "invalid" },
  );

  assert.throws(
    () => extractWorkflowConfig(configMarkdown() + configMarkdown()),
    { code: "invalid" },
  );
});

test("extractWorkflowConfig enforces the Wiki baseline contract", () => {
  const invalid = structuredClone(validConfig);
  invalid.wiki.baseline_state = "bootstrapping";

  assert.throws(
    () => extractWorkflowConfig(configMarkdown(invalid)),
    { code: "invalid" },
  );

  const readyWithoutRoot = structuredClone(validConfig);
  readyWithoutRoot.wiki.baseline_state = "ready";
  readyWithoutRoot.wiki.root = null;
  assert.throws(
    () => extractWorkflowConfig(configMarkdown(readyWithoutRoot)),
    { code: "invalid" },
  );
});

test("workflow envelopes normalize payload bytes and verify their hash", () => {
  const envelope = createEnvelope(
    "workflow-change-spec:v1",
    "spec_id: spec-1\r\nstatus: specified\r\n\r\n",
  );

  assert.match(envelope, /payload_sha256: [a-f0-9]{64}\n$/);
  const verified = verifyEnvelope(envelope, "workflow-change-spec:v1");
  assert.equal(verified.marker, "workflow-change-spec:v1");
  assert.equal(verified.payload, "spec_id: spec-1\nstatus: specified\n");
  assert.match(verified.payload_sha256, /^[a-f0-9]{64}$/);
});

test("workflow envelopes reject tampering and marker drift", () => {
  const envelope = createEnvelope(
    "workflow-change-spec:v1",
    "spec_id: spec-1\nstatus: specified\n",
  );

  assert.throws(
    () =>
      verifyEnvelope(
        envelope.replace("status: specified", "status: changed"),
        "workflow-change-spec:v1",
      ),
    { code: "invalid" },
  );

  assert.throws(
    () => verifyEnvelope(envelope, "workflow-authorization:v1"),
    { code: "invalid" },
  );
});

test("Wiki execution bindings permit Wiki-optional semantic delivery", () => {
  assert.deepEqual(
    validateWikiExecutionBinding({
      issue_type: "standalone",
      wiki_impact: "semantic",
      wiki_operation: "none",
      wiki_baseline_requirement: "not-applicable",
      wiki_preview_id: null,
      wiki_preview_payload_sha256: null,
    }),
    {
      issue_type: "standalone",
      wiki_impact: "semantic",
      wiki_operation: "none",
      wiki_baseline_requirement: "not-applicable",
      wiki_preview_id: null,
      wiki_preview_payload_sha256: null,
    },
  );

  assert.deepEqual(
    validateWikiExecutionBinding({
      issue_type: "standalone",
      wiki_impact: "semantic",
      wiki_operation: "bootstrap",
      wiki_baseline_requirement: "missing-with-bootstrap-preview",
      wiki_preview_id: "wiki-bootstrap-1",
      wiki_preview_payload_sha256: "e".repeat(64),
    }),
    {
      issue_type: "standalone",
      wiki_impact: "semantic",
      wiki_operation: "bootstrap",
      wiki_baseline_requirement: "missing-with-bootstrap-preview",
      wiki_preview_id: "wiki-bootstrap-1",
      wiki_preview_payload_sha256: "e".repeat(64),
    },
  );

  assert.throws(
    () =>
      validateWikiExecutionBinding({
        issue_type: "leaf",
        wiki_impact: "semantic",
        wiki_operation: "bootstrap",
        wiki_baseline_requirement: "missing-with-bootstrap-preview",
        wiki_preview_id: "wiki-bootstrap-1",
        wiki_preview_payload_sha256: "e".repeat(64),
      }),
    { code: "invalid" },
  );

  assert.throws(
    () =>
      validateWikiExecutionBinding({
        issue_type: "standalone",
        wiki_impact: "semantic",
        wiki_operation: "reconcile",
        wiki_baseline_requirement: "missing-with-bootstrap-preview",
        wiki_preview_id: null,
        wiki_preview_payload_sha256: null,
      }),
    { code: "invalid" },
  );

  assert.equal(
    validateWikiExecutionBinding({
      issue_type: "standalone",
      wiki_impact: "semantic",
      wiki_operation: "reconcile",
      wiki_baseline_requirement: "ready",
      wiki_preview_id: "wiki-sync-1",
      wiki_preview_payload_sha256: "a".repeat(64),
    }).wiki_preview_id,
    "wiki-sync-1",
  );
});

test("validatePreview accepts a bounded Bootstrap Preview and rejects partial authority", () => {
  assert.deepEqual(validatePreview(bootstrapPreview), bootstrapPreview);

  const invalid = structuredClone(bootstrapPreview);
  invalid.batches = [];
  assert.throws(() => validatePreview(invalid), { code: "invalid" });

  const unexpected = structuredClone(bootstrapPreview);
  unexpected.topics[0].page_path = "../outside.md";
  assert.throws(() => validatePreview(unexpected), { code: "invalid" });
});

test("pre-Issue delegation binds one Preview and one publish capability", () => {
  assert.deepEqual(
    validatePreIssueDelegation(preIssueDelegation),
    preIssueDelegation,
  );
  assert.deepEqual(
    verifyEnvelope(
      buildCleanPathDelegationEnvelope(preIssueDelegation).envelope,
      "workflow-clean-path-delegation:v1",
    ).payload_sha256,
    hashCanonicalJson(preIssueDelegation),
  );

  const invalid = structuredClone(preIssueDelegation);
  invalid.grants.push("execute");
  assert.throws(() => validatePreIssueDelegation(invalid), {
    code: "invalid",
  });

  const missingApprover = structuredClone(preIssueDelegation);
  delete missingApprover.approver;
  assert.throws(() => validatePreIssueDelegation(missingApprover), {
    code: "invalid",
  });

  const refreshableTarget = structuredClone(preIssueDelegation);
  refreshableTarget.target_refresh =
    "same-branch-fast-forward-revalidate";
  assert.throws(() => validatePreIssueDelegation(refreshableTarget), {
    code: "invalid",
  });
});

test("deriveIssueGrant keeps capabilities and paths inside the human ceiling", () => {
  const input = {
    delegation: preIssueDelegation,
    delegation_payload_sha256: hashCanonicalJson(preIssueDelegation),
    record_id: "grant-1",
    issue: "ron/example#42",
    spec: {
      id: "spec-1",
      comment_id: "comment-1",
      payload_sha256: "f".repeat(64),
      preview_id: "wiki-bootstrap-1",
      preview_payload_sha256: "e".repeat(64),
    },
    contract: {
      id: "contract-1",
      comment_id: "comment-2",
      payload_sha256: "9".repeat(64),
      issue: "ron/example#42",
      issue_type: "standalone",
      spec_id: "spec-1",
      spec_comment_id: "comment-1",
      spec_payload_sha256: "f".repeat(64),
      wiki_operation: "bootstrap",
      wiki_baseline_requirement: "missing-with-bootstrap-preview",
      wiki_preview_id: "wiki-bootstrap-1",
      wiki_preview_payload_sha256: "e".repeat(64),
      owned_paths_sha256: hashCanonicalJson([
        ".worktrees/ron-42/.wiki-staging",
        "wiki/index.md",
        "wiki/orders.md",
        "docs/agents/ron-workflow.md",
      ]),
    },
    coordinator: "codex",
    derived_at: "2026-07-26T09:10:00.000Z",
    capabilities: ["execute", "close_standalone"],
    exact_paths: [
      ".worktrees/ron-42/.wiki-staging",
      "wiki/index.md",
      "wiki/orders.md",
      "docs/agents/ron-workflow.md",
    ],
    wiki_operation: "bootstrap",
    wiki_baseline_requirement: "missing-with-bootstrap-preview",
  };
  const grant = deriveIssueGrant(input);

  assert.equal(grant.origin, "derived-clean-path");
  assert.equal(grant.delegated_from, "delegation-1");
  assert.deepEqual(grant.grants, ["execute", "close_standalone"]);
  assert.equal(grant.binds.wiki_preview_id, "wiki-bootstrap-1");
  assert.equal(grant.binds.contract_id, "contract-1");
  assert.equal(grant.delegation.clean_path, "denied");
  assert.deepEqual(grant.delegation.derive_exact_grants, []);
  assert.equal(
    verifyEnvelope(
      buildAuthorizationEnvelope(grant).envelope,
      "workflow-authorization:v1",
    ).payload_sha256,
    hashCanonicalJson(grant),
  );

  const staleRootHash = structuredClone(input);
  staleRootHash.delegation_payload_sha256 = "0".repeat(64);
  assert.throws(() => deriveIssueGrant(staleRootHash), { code: "scope" });

  const outsideScope = structuredClone(input);
  outsideScope.record_id = "grant-2";
  outsideScope.exact_paths = ["src/unapproved.ts"];
  assert.throws(() => deriveIssueGrant(outsideScope), { code: "scope" });

  const outsideRepository = structuredClone(input);
  outsideRepository.record_id = "grant-3";
  outsideRepository.issue = "other/example#42";
  assert.throws(() => deriveIssueGrant(outsideRepository), { code: "scope" });

  const mismatchedContract = structuredClone(input);
  mismatchedContract.record_id = "grant-4";
  mismatchedContract.contract.spec_id = "other-spec";
  assert.throws(() => deriveIssueGrant(mismatchedContract), { code: "scope" });

  const mismatchedPreviewKind = structuredClone(input);
  mismatchedPreviewKind.record_id = "grant-5";
  mismatchedPreviewKind.delegation.preview.kind = "sync";
  mismatchedPreviewKind.delegation.grants = ["publish_wiki_repair_spec"];
  assert.throws(() => deriveIssueGrant(mismatchedPreviewKind), {
    code: "scope",
  });
});

test("Closeout Preview builder binds the aligned ledger and exact write sets", () => {
  const result = buildCloseoutPreviewEnvelope(closeoutPreviewInput);

  assert.deepEqual(validateCloseoutPreview(result.preview), result.preview);
  assert.deepEqual(validatePreview(result.preview), result.preview);
  assert.equal(
    verifyEnvelope(
      result.envelope,
      "workflow-closeout-preview:v1",
    ).payload_sha256,
    result.payload_sha256,
  );
  assert.equal(
    result.preview.ledger_payload_sha256,
    hashCanonicalJson(alignedLedger),
  );
  assert.equal(
    result.preview.semantic_write_set_sha256,
    hashCanonicalJson(["wiki/orders.md"]),
  );

  const driftedLedger = structuredClone(result.preview);
  driftedLedger.ledger.rows[0].conformance = "deviation";
  assert.throws(() => validateCloseoutPreview(driftedLedger), {
    code: "findings",
  });

  const wikiOptional = structuredClone(closeoutPreviewInput);
  wikiOptional.wiki_operation = "none";
  wikiOptional.wiki_baseline_requirement = "not-applicable";
  wikiOptional.wiki_preview_id = null;
  wikiOptional.wiki_preview_payload_sha256 = null;
  wikiOptional.ledger = null;
  wikiOptional.semantic_write_set = [];
  wikiOptional.support_write_set = [];
  wikiOptional.protocol = null;
  wikiOptional.review_axes = ["standards", "spec"];
  wikiOptional.repair.wiki_waves = 0;
  const noWikiResult = buildCloseoutPreviewEnvelope(wikiOptional);
  assert.equal(noWikiResult.preview.ledger, null);
  assert.deepEqual(noWikiResult.preview.review_axes, ["standards", "spec"]);

  const invalidWikiRepair = structuredClone(wikiOptional);
  invalidWikiRepair.repair.wiki_waves = 1;
  assert.throws(() => buildCloseoutPreviewEnvelope(invalidWikiRepair), {
    code: "invalid",
  });
});

test("Closeout Grant derivation binds the Preview and rejects ceiling drift", () => {
  const input = {
    ...closeoutDerivationForRoot(preIssueDelegation),
    record_id: "closeout-grant-1",
    coordinator: "codex",
    derived_at: "2026-07-26T09:21:00.000Z",
  };
  const grant = deriveCloseoutGrant(input);

  assert.deepEqual(grant.grants, ["close_standalone"]);
  assert.equal(
    grant.binds.closeout_preview_sha256,
    input.preview_payload_sha256,
  );
  assert.equal(grant.binds.lane_sha, "1".repeat(40));
  assert.equal(grant.delegation.clean_path, "denied");
  assert.equal(grant.delegated_from, "delegation-1");
  assert.equal(
    grant.binds.source_authorization_payload_sha256,
    input.source_authorization_payload_sha256,
  );
  assert.ok(grant.binds.exact_paths.includes(closeoutPreviewInput.staging_path));

  const outsideCeiling = structuredClone(closeoutPreviewInput);
  outsideCeiling.support_write_set.push("wiki/unapproved.md");
  const outsideResult = buildCloseoutPreviewEnvelope(outsideCeiling);
  assert.throws(
    () =>
      deriveCloseoutGrant({
        ...input,
        preview: outsideResult.preview,
        preview_payload_sha256: outsideResult.payload_sha256,
      }),
    { code: "scope" },
  );

  const stalePreview = structuredClone(input.preview);
  stalePreview.target.identity = "2".repeat(40);
  assert.throws(
    () => deriveCloseoutGrant({ ...input, preview: stalePreview }),
    { code: "scope" },
  );

  const movedTargetRoot = structuredClone(preIssueDelegation);
  movedTargetRoot.target.identity = "2".repeat(40);
  assert.throws(
    () =>
      deriveCloseoutGrant({
        ...closeoutDerivationForRoot(movedTargetRoot),
        record_id: "closeout-grant-moved-target",
        coordinator: "codex",
        derived_at: "2026-07-26T09:21:00.000Z",
      }),
    { code: "scope" },
  );

  const missingCapability = structuredClone(preIssueDelegation);
  missingCapability.downstream_capabilities = ["execute"];
  assert.throws(
    () =>
      deriveCloseoutGrant({
        ...closeoutDerivationForRoot(missingCapability),
        record_id: "closeout-grant-missing-capability",
        coordinator: "codex",
        derived_at: "2026-07-26T09:21:00.000Z",
      }),
    { code: "scope" },
  );

  const stagingOverflow = structuredClone(preIssueDelegation);
  stagingOverflow.scope.artifact_paths = [];
  assert.throws(
    () =>
      deriveCloseoutGrant({
        ...closeoutDerivationForRoot(stagingOverflow),
        record_id: "closeout-grant-staging-overflow",
        coordinator: "codex",
        derived_at: "2026-07-26T09:21:00.000Z",
      }),
    { code: "scope" },
  );

  const removedExclusion = structuredClone(preIssueDelegation);
  removedExclusion.excludes.push("network");
  assert.throws(
    () =>
      deriveCloseoutGrant({
        ...closeoutDerivationForRoot(removedExclusion),
        record_id: "closeout-grant-removed-exclusion",
        coordinator: "codex",
        derived_at: "2026-07-26T09:21:00.000Z",
      }),
    { code: "scope" },
  );
});

test("Parent Closeout binds aggregate child contracts without an executable contract", () => {
  const rootAuthorization = structuredClone(closeoutDelegation);
  rootAuthorization.record_id = "root-parent-1";
  rootAuthorization.origin = "direct-human";
  delete rootAuthorization.derived_by;
  delete rootAuthorization.derived_at;
  delete rootAuthorization.delegated_from;
  delete rootAuthorization.delegated_from_kind;
  delete rootAuthorization.delegated_from_payload_sha256;
  delete rootAuthorization.binds.contract_id;
  delete rootAuthorization.binds.contract_comment_id;
  delete rootAuthorization.binds.contract_payload_sha256;
  rootAuthorization.binds.child_contracts_payload_sha256 = "4".repeat(64);
  rootAuthorization.binds.aggregate_evidence_payload_sha256 = "8".repeat(64);
  rootAuthorization.binds.wiki_operation = "reconcile";
  rootAuthorization.binds.wiki_baseline_requirement = "ready";
  rootAuthorization.binds.wiki_preview_id = null;
  rootAuthorization.binds.wiki_preview_payload_sha256 = null;
  rootAuthorization.grants = ["close_parent"];
  rootAuthorization.delegation = {
    clean_path: "bounded",
    derive_exact_grants: ["close_parent"],
    target_refresh: "denied",
    nested_clean_path: "denied",
    nested_delegation: "denied",
  };

  const previewInput = structuredClone(closeoutPreviewInput);
  previewInput.preview_id = "closeout-preview-parent-1";
  previewInput.mode = "parent";
  previewInput.contract = null;
  previewInput.child_contracts_payload_sha256 = "4".repeat(64);
  previewInput.root_delegation = {
    record_id: rootAuthorization.record_id,
    payload_sha256: hashCanonicalJson(rootAuthorization),
  };
  previewInput.source_authorization = null;
  previewInput.wiki_operation = "reconcile";
  previewInput.wiki_baseline_requirement = "ready";
  previewInput.wiki_preview_id = null;
  previewInput.wiki_preview_payload_sha256 = null;
  previewInput.capability = "close_parent";

  const result = buildCloseoutPreviewEnvelope(previewInput);
  const grant = deriveCloseoutGrant({
    root_delegation: rootAuthorization,
    root_delegation_payload_sha256:
      hashCanonicalJson(rootAuthorization),
    source_authorization: null,
    source_authorization_payload_sha256: null,
    preview: result.preview,
    preview_payload_sha256: result.payload_sha256,
    record_id: "closeout-grant-parent-1",
    coordinator: "codex",
    derived_at: "2026-07-26T09:22:00.000Z",
  });

  assert.deepEqual(grant.grants, ["close_parent"]);
  assert.equal(grant.delegated_from, "root-parent-1");
  assert.equal(grant.binds.source_authorization_payload_sha256, null);
  assert.equal(grant.binds.wiki_operation, "reconcile");
  assert.equal(grant.binds.wiki_baseline_requirement, "ready");

  const fakeParentContract = structuredClone(rootAuthorization);
  fakeParentContract.binds.contract_id = "parent-must-not-have-contract";
  const fakePreviewInput = structuredClone(previewInput);
  fakePreviewInput.root_delegation.payload_sha256 =
    hashCanonicalJson(fakeParentContract);
  const fakePreview = buildCloseoutPreviewEnvelope(fakePreviewInput);
  assert.throws(
    () =>
      deriveCloseoutGrant({
        root_delegation: fakeParentContract,
        root_delegation_payload_sha256:
          hashCanonicalJson(fakeParentContract),
        source_authorization: null,
        source_authorization_payload_sha256: null,
        preview: fakePreview.preview,
        preview_payload_sha256: fakePreview.payload_sha256,
        record_id: "closeout-grant-parent-invalid",
        coordinator: "codex",
        derived_at: "2026-07-26T09:22:00.000Z",
      }),
    { code: "invalid" },
  );
});

test("source resolvers find one exact Markdown heading and JSON pointer", (t) => {
  const root = fixtureRepository(t);
  writeFileSync(
    join(root, "wiki/orders.md"),
    [
      "# Orders",
      "",
      "```md",
      "# Not a real heading",
      "```",
      "",
      "## Cancellation rules",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "config/app.json"),
    JSON.stringify({ orders: { retry: { limit: 3 } } }, null, 2),
  );

  assert.equal(
    resolveSourceLocator(root, {
      path: "wiki/orders.md",
      kind: "heading",
      value: "Cancellation rules",
    }).line,
    7,
  );
  assert.equal(
    resolveSourceLocator(root, {
      path: "config/app.json",
      kind: "json-pointer",
      value: "/orders/retry/limit",
    }).line,
    null,
  );
});

test("source resolvers support config keys and declaration-aware symbols/tests", (t) => {
  const root = fixtureRepository(t);
  writeFileSync(
    join(root, "config/app.yaml"),
    ["orders:", "  retry:", "    limit: 3", ""].join("\n"),
  );
  writeFileSync(
    join(root, "src/orders.py"),
    [
      "# def create_order():",
      "def create_order():",
      "    return True",
      "",
      "class OrderTests:",
      "    def test_cancel(self):",
      "        assert True",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src/orders.ts"),
    [
      "// function createOrder() {}",
      "export function createOrder() {",
      "  return true;",
      "}",
      "test(\"cancels an order\", () => {});",
      "",
    ].join("\n"),
  );

  assert.equal(
    resolveSourceLocator(root, {
      path: "config/app.yaml",
      kind: "config-key",
      value: "orders.retry.limit",
    }).line,
    3,
  );
  assert.equal(
    resolveSourceLocator(root, {
      path: "src/orders.py",
      kind: "symbol",
      value: "create_order",
    }).line,
    2,
  );
  assert.equal(
    resolveSourceLocator(root, {
      path: "src/orders.py",
      kind: "test",
      value: "OrderTests.test_cancel",
    }).line,
    6,
  );
  assert.equal(
    resolveSourceLocator(root, {
      path: "src/orders.ts",
      kind: "symbol",
      value: "createOrder",
    }).line,
    2,
  );
  assert.equal(
    resolveSourceLocator(root, {
      path: "src/orders.ts",
      kind: "test",
      value: "cancels an order",
    }).line,
    5,
  );
});

test("source resolvers fail closed on unsupported, comment-only, and ambiguous targets", (t) => {
  const root = fixtureRepository(t);
  writeFileSync(join(root, "src/comment.ts"), "// function hidden() {}\n");
  writeFileSync(
    join(root, "src/duplicate.ts"),
    "function duplicate() {}\nfunction duplicate() {}\n",
  );
  writeFileSync(
    join(root, "src/block-comment.ts"),
    "/*\nfunction hiddenBlock() {}\n*/\n",
  );
  writeFileSync(
    join(root, "src/template.ts"),
    "const text = `\nfunction hiddenTemplate() {}\n`;\n",
  );
  writeFileSync(
    join(root, "src/docstring.py"),
    '"""\ndef hidden_docstring():\n    pass\n"""\n',
  );
  writeFileSync(
    join(root, "config/block.yaml"),
    "description: |\n  hidden: value\nvisible: value\n",
  );
  writeFileSync(
    join(root, "config/multiline.toml"),
    'description = """\nhidden = true\n"""\nvisible = true\n',
  );
  writeFileSync(join(root, "src/unknown.rs"), "fn only_here() {}\n");

  assert.throws(
    () =>
      resolveSourceLocator(root, {
        path: "src/comment.ts",
        kind: "symbol",
        value: "hidden",
      }),
    { code: "not-verifiable" },
  );
  assert.equal(
    resolveSourceLocator(root, {
      path: "config/block.yaml",
      kind: "config-key",
      value: "visible",
    }).line,
    3,
  );
  assert.throws(
    () =>
      resolveSourceLocator(root, {
        path: "src/block-comment.ts",
        kind: "symbol",
        value: "hiddenBlock",
      }),
    { code: "not-verifiable" },
  );
  assert.throws(
    () =>
      resolveSourceLocator(root, {
        path: "src/docstring.py",
        kind: "symbol",
        value: "hidden_docstring",
      }),
    { code: "not-verifiable" },
  );
  assert.throws(
    () =>
      resolveSourceLocator(root, {
        path: "src/template.ts",
        kind: "symbol",
        value: "hiddenTemplate",
      }),
    { code: "not-verifiable" },
  );
  assert.throws(
    () =>
      resolveSourceLocator(root, {
        path: "config/block.yaml",
        kind: "config-key",
        value: "hidden",
      }),
    { code: "not-verifiable" },
  );
  assert.throws(
    () =>
      resolveSourceLocator(root, {
        path: "config/multiline.toml",
        kind: "config-key",
        value: "hidden",
      }),
    { code: "not-verifiable" },
  );
  assert.equal(
    resolveSourceLocator(root, {
      path: "config/multiline.toml",
      kind: "config-key",
      value: "visible",
    }).line,
    4,
  );
  assert.throws(
    () =>
      resolveSourceLocator(root, {
        path: "src/duplicate.ts",
        kind: "symbol",
        value: "duplicate",
      }),
    { code: "not-verifiable" },
  );
  assert.throws(
    () =>
      resolveSourceLocator(root, {
        path: "src/unknown.rs",
        kind: "symbol",
        value: "only_here",
      }),
    { code: "not-verifiable" },
  );
});

test("reconciliation ledger derives semantic writes only from an aligned mapping", () => {
  assert.deepEqual(validateReconciliationLedger(alignedLedger), {
    status: "clean",
    semantic_write_set: ["wiki/orders.md"],
    findings: [],
  });

  const deviation = structuredClone(alignedLedger);
  deviation.rows[0].conformance = "deviation";
  assert.equal(validateReconciliationLedger(deviation).status, "findings");

  const unverified = structuredClone(alignedLedger);
  unverified.rows[0].conformance = "unverified";
  assert.equal(
    validateReconciliationLedger(unverified).status,
    "not-verifiable",
  );

  const mismatchedAction = structuredClone(alignedLedger);
  mismatchedAction.rows[0].wiki_action = "add";
  assert.throws(
    () => validateReconciliationLedger(mismatchedAction),
    { code: "invalid" },
  );
});

test("Sync Preview accepts only a clean aligned ledger and exact write ceiling", () => {
  const preview = {
    schema: "workflow-wiki-sync-preview:v1",
    preview_id: "wiki-sync-1",
    created_at: "2026-07-26T10:00:00.000Z",
    target: {
      repository: "ron/example",
      branch: "main",
      identity: "1".repeat(40),
    },
    baseline_state: "ready",
    prior_wiki_identity: "2".repeat(40),
    boundedness: {
      state: "bounded",
      reason: "One affected topic.",
    },
    drift_evidence: ["wiki/orders.md differs from the aligned ledger action"],
    ledger: alignedLedger,
    semantic_write_set_ceiling: ["wiki/orders.md"],
    support_write_set_ceiling: ["wiki/index.md"],
    validators: ["node validate-page.mjs", "node validate-sources.mjs"],
    excludes: [
      "push",
      "remote-merge",
      "deploy",
      "branch-deletion",
      "live-provider-actions",
      "legacy-data-deletion",
    ],
    publication: "disabled",
    protocol: {
      name: "ron-wiki-protocol",
      commit: "3".repeat(40),
      hash: "4".repeat(64),
    },
    engine: { state: "absent", identity: null },
  };

  assert.deepEqual(validatePreview(preview), preview);

  const exceeded = structuredClone(preview);
  exceeded.semantic_write_set_ceiling = [];
  assert.throws(() => validatePreview(exceeded), { code: "scope" });

  const finding = structuredClone(preview);
  finding.ledger.rows[0].conformance = "deviation";
  assert.throws(() => validatePreview(finding), { code: "findings" });
});

test("shared Change Spec builder produces one deterministic verified envelope", () => {
  const input = {
    spec_id: "spec-1",
    issue: "ron/example#42",
    created_at: "2026-07-26T10:10:00.000Z",
    wiki_impact: "semantic",
    wiki_operation: "bootstrap",
    wiki_baseline_requirement: "missing-with-bootstrap-preview",
    wiki_preview_id: "wiki-bootstrap-1",
    wiki_preview_payload_sha256: "e".repeat(64),
    wiki_context: ["orders"],
    wiki_dispositions: [
      { topic: "orders", claim: "current flow", disposition: "add" },
    ],
    explicit_overrides: ["none"],
    acceptance: ["A complete reviewed Wiki baseline exists."],
    verification_seams: ["Canonical Wiki page and source contracts"],
    out_of_scope: ["publication"],
    supersedes: null,
    sections: {
      problem: "The repository has no reviewed business baseline.",
      solution: "Create one complete reviewed Canonical Wiki baseline.",
      user_stories: "1. As Ron, I can run `/wiki` once to initialize it.",
      implementation_decisions: "Use one Bootstrap Standalone Issue.",
      testing_decisions: "Verify the page, source, and closeout contracts.",
      proof_boundaries: "No push, publication, or engine authority.",
      further_notes: "The target remains missing until atomic closeout.",
    },
  };

  const first = buildChangeSpecEnvelope(input);
  const second = buildChangeSpecEnvelope(structuredClone(input));
  assert.deepEqual(second, first);
  assert.equal(
    verifyEnvelope(first.envelope, "workflow-change-spec:v1").payload_sha256,
    first.payload_sha256,
  );
  assert.match(first.payload, /wiki_operation: "bootstrap"/);

  const duplicateDisposition = structuredClone(input);
  duplicateDisposition.wiki_dispositions.push({
    topic: "orders",
    claim: "current flow",
    disposition: "change",
  });
  assert.throws(() => buildChangeSpecEnvelope(duplicateDisposition), {
    code: "invalid",
  });

  const noImpact = structuredClone(input);
  noImpact.wiki_impact = "none";
  noImpact.wiki_operation = "none";
  noImpact.wiki_baseline_requirement = "not-applicable";
  noImpact.wiki_preview_id = null;
  noImpact.wiki_preview_payload_sha256 = null;
  noImpact.wiki_context = [];
  assert.throws(() => buildChangeSpecEnvelope(noImpact), { code: "invalid" });

  const wikiOptional = structuredClone(input);
  wikiOptional.wiki_operation = "none";
  wikiOptional.wiki_baseline_requirement = "not-applicable";
  wikiOptional.wiki_preview_id = null;
  wikiOptional.wiki_preview_payload_sha256 = null;
  wikiOptional.wiki_context = [];
  wikiOptional.wiki_dispositions = [];
  assert.match(
    buildChangeSpecEnvelope(wikiOptional).payload,
    /wiki_operation: "none"/,
  );
});

test("shared execution-contract builder binds the Spec, Preview, and exact paths", () => {
  const input = {
    contract_id: "contract-1",
    issue: "ron/example#42",
    issue_type: "standalone",
    parent: null,
    spec_id: "spec-1",
    spec_comment_id: "comment-1",
    spec_payload_sha256: "f".repeat(64),
    outcome: "Create one complete reviewed Canonical Wiki baseline.",
    acceptance: ["The local target contains a complete ready baseline."],
    verification_seams: ["Canonical Wiki page and source contracts"],
    verification_commands: [
      "node scripts/ron-workflow/ron-wiki.mjs page-validate",
    ],
    target_branch: "main",
    target_identity: "b".repeat(40),
    lane_id: "wiki-bootstrap-1",
    lane_predecessor: null,
    blocked_by: [],
    owned_paths: [
      "wiki/index.md",
      "wiki/orders.md",
      "docs/agents/ron-workflow.md",
    ],
    wiki_impact: "semantic",
    wiki_operation: "bootstrap",
    wiki_baseline_requirement: "missing-with-bootstrap-preview",
    wiki_preview_id: "wiki-bootstrap-1",
    wiki_preview_payload_sha256: "e".repeat(64),
    wiki_dispositions_sha256: "8".repeat(64),
    risk: "high",
    review_profile: "full",
    expected_proof_state: "implemented_on_lane",
    excludes: [
      "push",
      "remote-merge",
      "deploy",
      "branch-deletion",
      "live-provider-actions",
      "legacy-data-deletion",
    ],
    supersedes: null,
  };
  const contract = buildExecutionContractEnvelope(input);

  assert.equal(
    verifyEnvelope(
      contract.envelope,
      "workflow-execution-contract:v1",
    ).payload_sha256,
    contract.payload_sha256,
  );
  assert.match(contract.payload, /wiki_preview_id: "wiki-bootstrap-1"/);

  const missingDispositions = structuredClone(input);
  missingDispositions.wiki_dispositions_sha256 = null;
  assert.throws(
    () => buildExecutionContractEnvelope(missingDispositions),
    { code: "invalid" },
  );

  const wikiOptional = structuredClone(input);
  wikiOptional.wiki_operation = "none";
  wikiOptional.wiki_baseline_requirement = "not-applicable";
  wikiOptional.wiki_preview_id = null;
  wikiOptional.wiki_preview_payload_sha256 = null;
  wikiOptional.wiki_dispositions_sha256 = null;
  assert.match(
    buildExecutionContractEnvelope(wikiOptional).payload,
    /wiki_dispositions_sha256: null/,
  );
});

test("Wiki page validator enforces sections, claim mappings, and one Sources object", () => {
  const page = readFileSync(
    new URL("./fixtures/valid-page.md", import.meta.url),
    "utf8",
  );
  const result = validateWikiPage(page);
  assert.equal(result.status, "valid");
  assert.deepEqual(
    result.sources.map((source) => source.id),
    ["S1", "S2"],
  );

  assert.throws(
    () =>
      validateWikiPage(
        page.replace(
          "Only pending orders can be cancelled. [S2]",
          "Only pending orders can be cancelled.",
        ),
      ),
    { code: "invalid" },
  );
  assert.throws(
    () => validateWikiPage(page.replace('"id": "S2"', '"id": "S1"')),
    { code: "invalid" },
  );
  assert.throws(
    () => validateWikiPage(`${page}\n${page.match(/```json[\s\S]*?```/u)[0]}\n`),
    { code: "invalid" },
  );

  const statesBlock = [
    "## States and exceptions",
    "",
    "Fulfilled orders reject cancellation. [S2]",
    "",
  ].join("\n");
  const wrongOrder = page
    .replace(statesBlock, "")
    .replace("## Sources", `${statesBlock}## Sources`);
  assert.throws(() => validateWikiPage(wrongOrder), { code: "invalid" });
});

test("Wiki link validator resolves local Markdown links and fails closed", (t) => {
  const root = fixtureRepository(t);
  mkdirSync(join(root, "wiki", "flows"), { recursive: true });
  writeFileSync(
    join(root, "wiki", "index.md"),
    [
      "# Wiki",
      "",
      "[Order flow](flows/orders.md#current-behavior)",
      "",
      "[External reference](https://example.com/reference)",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "wiki", "flows", "orders.md"),
    ["# Orders", "", "## Current behavior", "", "Pending orders are cancellable.", ""].join(
      "\n",
    ),
  );

  const clean = validateWikiLinks(root, "wiki");
  assert.equal(clean.status, "valid");
  assert.deepEqual(clean.files, ["wiki/flows/orders.md", "wiki/index.md"]);
  assert.equal(clean.links_checked, 1);

  writeFileSync(
    join(root, "wiki", "broken.md"),
    [
      "# Broken",
      "",
      "[Missing](missing.md)",
      "",
      "[Escaping](../src/orders.ts)",
      "",
    ].join("\n"),
  );
  assert.throws(
    () => validateWikiLinks(root, "wiki"),
    (error) => {
      assert.equal(error.code, "findings");
      assert.deepEqual(
        error.details.findings.map((finding) => finding.reason).sort(),
        ["missing-target", "outside-wiki-root"].sort(),
      );
      return true;
    },
  );
});
