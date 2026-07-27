import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildChangeSpecEnvelope,
  buildExecutionContractEnvelope,
  createEnvelope,
  extractWorkflowConfig,
  hashCanonicalJson,
  resolveSourceLocator,
  validatePreIssueDelegation,
  validatePreview,
  validateWikiPage,
  verifyEnvelope,
} from "../../scripts/ron-workflow/ron-wiki.mjs";

const script = fileURLToPath(
  new URL("../../scripts/ron-workflow/ron-wiki.mjs", import.meta.url),
);
const validPage = fileURLToPath(
  new URL("./fixtures/valid-page.md", import.meta.url),
);

function run(command, input, options = {}) {
  return spawnSync(process.execPath, [script, command], {
    cwd: options.cwd,
    encoding: "utf8",
    input: `${JSON.stringify(input)}\n`,
  });
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

class FakeTracker {
  #issues = new Map();
  #nextIssue = 1;
  #nextComment = 1;

  createIssue(repository, title) {
    const issue = `${repository}#${this.#nextIssue++}`;
    this.#issues.set(issue, { title, state: "open", comments: new Map() });
    return issue;
  }

  postComment(issue, body) {
    const current = this.#issues.get(issue);
    assert.ok(current);
    const id = `comment-${this.#nextComment++}`;
    current.comments.set(id, body);
    return id;
  }

  readComment(issue, id) {
    return this.#issues.get(issue)?.comments.get(id);
  }

  close(issue) {
    this.#issues.get(issue).state = "closed";
  }

  state(issue) {
    return this.#issues.get(issue)?.state;
  }
}

function workflowConfigMarkdown(baselineState) {
  const config = {
    schema: "ron-workflow-config:v1",
    ron_workflow: "v1",
    mode: "full",
    interaction: { policy: "exception_only" },
    wiki: {
      contract_schema: "ron-wiki:v1",
      root: "wiki",
      baseline_state: baselineState,
      page_contract: "ron-wiki-page:v1",
      sources_contract: "wiki-sources:v1",
      resolver_profile: "ron-source-resolvers:v1",
      external_resolvers: [],
      context_mode: "staging",
      mutation_policy: "closeout_only",
      protocol: {
        name: "ron-wiki-protocol",
        commit: "a".repeat(40),
        hash: "b".repeat(64),
      },
      engine: { state: "absent", identity: null },
      validators: {
        page: "ron-wiki page-validate",
        sources: "ron-wiki source-resolve",
        links: "test -n links",
        build: null,
      },
      support_write_set: ["wiki/index.md"],
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

test("CLI maps valid, invalid, and not-verifiable proofs to stable exits", () => {
  const pageResult = run("page-validate", {
    markdown: readFileSync(validPage, "utf8"),
  });
  assert.equal(pageResult.status, 0, pageResult.stderr);
  assert.equal(JSON.parse(pageResult.stdout).status, "valid");

  const invalidResult = run("config-validate", {
    markdown: "# free text is not config\n",
  });
  assert.equal(invalidResult.status, 2);
  assert.equal(JSON.parse(invalidResult.stdout).status, "invalid");

  const unsupportedRoot = mkdtempSync(join(tmpdir(), "ron-wiki-cli-"));
  try {
    mkdirSync(join(unsupportedRoot, "src"));
    writeFileSync(join(unsupportedRoot, "src/example.rs"), "fn example() {}\n");
    const unsupportedResult = run("source-resolve", {
      repository_root: unsupportedRoot,
      locator: {
        path: "src/example.rs",
        kind: "symbol",
        value: "example",
      },
    });
    assert.equal(unsupportedResult.status, 3);
    assert.equal(
      JSON.parse(unsupportedResult.stdout).status,
      "not-verifiable",
    );

    mkdirSync(join(unsupportedRoot, "wiki"));
    writeFileSync(
      join(unsupportedRoot, "wiki/index.md"),
      "# Wiki\n\n[Missing](missing.md)\n",
    );
    const brokenLinks = run("links-validate", {
      repository_root: unsupportedRoot,
      wiki_root: "wiki",
    });
    assert.equal(brokenLinks.status, 4);
    assert.equal(JSON.parse(brokenLinks.stdout).status, "findings");
  } finally {
    rmSync(unsupportedRoot, { recursive: true, force: true });
  }
});

test("CLI proofs leave a temporary Git repository and its refs unchanged", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ron-wiki-forward-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "wiki"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  cpSync(validPage, join(root, "wiki/orders.md"));
  writeFileSync(
    join(root, "wiki/index.md"),
    "# Wiki\n\n[Orders](orders.md#current-behavior)\n",
  );
  writeFileSync(
    join(root, "src/orders.ts"),
    "export function createOrder() { return true; }\n",
  );
  writeFileSync(
    join(root, "src/orders.test.ts"),
    'test("rejects fulfilled cancellation", () => {});\n',
  );

  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Ron Wiki Test"]);
  git(root, ["config", "user.email", "wiki-test@example.invalid"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture"]);
  const beforeHead = git(root, ["rev-parse", "HEAD"]);
  const beforeStatus = git(root, ["status", "--porcelain=v1"]);

  const pageResult = run(
    "page-validate",
    { markdown: readFileSync(join(root, "wiki/orders.md"), "utf8") },
    { cwd: root },
  );
  assert.equal(pageResult.status, 0, pageResult.stderr);

  const linksResult = run(
    "links-validate",
    { repository_root: root, wiki_root: "wiki" },
    { cwd: root },
  );
  assert.equal(linksResult.status, 0, linksResult.stderr);
  assert.equal(JSON.parse(linksResult.stdout).links_checked, 1);

  for (const locator of [
    { path: "src/orders.ts", kind: "symbol", value: "createOrder" },
    {
      path: "src/orders.test.ts",
      kind: "test",
      value: "rejects fulfilled cancellation",
    },
  ]) {
    const sourceResult = run(
      "source-resolve",
      { repository_root: root, locator },
      { cwd: root },
    );
    assert.equal(sourceResult.status, 0, sourceResult.stderr);
  }

  assert.equal(git(root, ["rev-parse", "HEAD"]), beforeHead);
  assert.equal(git(root, ["status", "--porcelain=v1"]), beforeStatus);
  assert.equal(dirname(script).endsWith("scripts/ron-workflow"), true);
});

test("one fake-tracker Bootstrap flow advances only a complete reviewed baseline", (t) => {
  const root = mkdtempSync(join(tmpdir(), "ron-wiki-bootstrap-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs/agents"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "docs/agents/ron-workflow.md"),
    workflowConfigMarkdown("missing"),
  );
  writeFileSync(
    join(root, "src/orders.ts"),
    "export function createOrder() { return true; }\n",
  );
  writeFileSync(
    join(root, "src/orders.test.ts"),
    'test("rejects fulfilled cancellation", () => {});\n',
  );
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.name", "Ron Wiki Test"]);
  git(root, ["config", "user.email", "wiki-test@example.invalid"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "configured missing baseline"]);
  const targetIdentity = git(root, ["rev-parse", "HEAD"]);

  const preview = {
    schema: "workflow-wiki-bootstrap-preview:v1",
    preview_id: "bootstrap-1",
    created_at: "2026-07-26T11:00:00.000Z",
    target: {
      repository: "ron/example",
      branch: "main",
      identity: targetIdentity,
    },
    root: { path: "wiki", assessment: "needs-bootstrap" },
    baseline_state: "missing",
    boundedness: { state: "bounded", reason: "One business topic." },
    topics: [
      {
        id: "orders",
        page_path: "wiki/orders.md",
        purpose: "Describe current order behavior.",
        scope: "Creation and cancellation.",
        dependencies: [],
        source_seeds: [
          { path: "src/orders.ts", kind: "symbol", value: "createOrder" },
        ],
      },
    ],
    batches: [{ id: "batch-1", topics: ["orders"] }],
    contracts: {
      page: "ron-wiki-page:v1",
      sources: "wiki-sources:v1",
      resolvers: "ron-source-resolvers:v1",
    },
    validators: ["ron-wiki page-validate", "ron-wiki source-resolve"],
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
      commit: "a".repeat(40),
      hash: "b".repeat(64),
    },
    engine: { state: "absent", identity: null },
  };
  validatePreview(preview);
  const previewEnvelope = createEnvelope(
    "workflow-wiki-bootstrap-preview:v1",
    JSON.stringify(preview),
  );
  const previewHash = verifyEnvelope(
    previewEnvelope,
    "workflow-wiki-bootstrap-preview:v1",
  ).payload_sha256;

  const delegation = {
    schema: "workflow-clean-path-delegation:v1",
    delegation_id: "delegation-1",
    status: "active",
    origin: "direct-human",
    approver: "ron",
    approved_at: "2026-07-26T11:01:00.000Z",
    preview: { kind: "bootstrap", id: "bootstrap-1", payload_sha256: previewHash },
    repository: "ron/example",
    target: { branch: "main", identity: targetIdentity },
    target_refresh: "denied",
    scope: {
      code_paths: [],
      artifact_paths: [".worktrees/bootstrap-1/.wiki-staging"],
      wiki_paths: ["wiki/index.md", "wiki/orders.md"],
      config_paths: ["docs/agents/ron-workflow.md"],
    },
    grants: ["publish_bootstrap_spec"],
    downstream_capabilities: ["execute", "close_standalone"],
    validators: ["ron-wiki page-validate", "ron-wiki source-resolve"],
    review_axes: ["standards", "spec", "wiki"],
    excludes: preview.excludes,
  };
  validatePreIssueDelegation(delegation);
  const rootDelegationProcess = run(
    "delegation-envelope-create",
    { delegation },
    { cwd: root },
  );
  assert.equal(
    rootDelegationProcess.status,
    0,
    rootDelegationProcess.stdout,
  );
  const rootDelegationEnvelope = JSON.parse(rootDelegationProcess.stdout);
  const rootDelegationHash = verifyEnvelope(
    rootDelegationEnvelope.envelope,
    "workflow-clean-path-delegation:v1",
  ).payload_sha256;

  const tracker = new FakeTracker();
  const issue = tracker.createIssue("ron/example", "Bootstrap Canonical Wiki");
  const spec = buildChangeSpecEnvelope({
    spec_id: "spec-1",
    issue,
    created_at: "2026-07-26T11:02:00.000Z",
    wiki_impact: "semantic",
    wiki_operation: "bootstrap",
    wiki_baseline_requirement: "missing-with-bootstrap-preview",
    wiki_preview_id: "bootstrap-1",
    wiki_preview_payload_sha256: previewHash,
    wiki_context: ["orders"],
    wiki_dispositions: [
      { topic: "orders", claim: "current behavior", disposition: "add" },
    ],
    explicit_overrides: ["none"],
    acceptance: ["The complete reviewed baseline is ready on main."],
    verification_seams: ["Wiki page and source contracts"],
    out_of_scope: ["publication"],
    supersedes: null,
    sections: {
      problem: "No reviewed baseline exists.",
      solution: "Create one complete baseline.",
      user_stories: "1. Ron can initialize the Wiki once.",
      implementation_decisions: "Use one Bootstrap Standalone.",
      testing_decisions: "Validate page and source contracts.",
      proof_boundaries: "No push or publication.",
      further_notes: "The target remains missing until closeout.",
    },
  });
  const specComment = tracker.postComment(issue, spec.envelope);
  assert.equal(
    verifyEnvelope(
      tracker.readComment(issue, specComment),
      "workflow-change-spec:v1",
    ).payload_sha256,
    spec.payload_sha256,
  );

  const contract = buildExecutionContractEnvelope({
    contract_id: "contract-1",
    issue,
    issue_type: "standalone",
    parent: null,
    spec_id: "spec-1",
    spec_comment_id: specComment,
    spec_payload_sha256: spec.payload_sha256,
    outcome: "Create one complete Canonical Wiki baseline.",
    acceptance: ["The complete reviewed baseline is ready on main."],
    verification_seams: ["Wiki page and source contracts"],
    verification_commands: ["ron-wiki page-validate"],
    target_branch: "main",
    target_identity: targetIdentity,
    lane_id: "bootstrap-1",
    lane_predecessor: null,
    blocked_by: [],
    owned_paths: [
      ".worktrees/bootstrap-1/.wiki-staging",
      "wiki/index.md",
      "wiki/orders.md",
      "docs/agents/ron-workflow.md",
    ],
    wiki_impact: "semantic",
    wiki_operation: "bootstrap",
    wiki_baseline_requirement: "missing-with-bootstrap-preview",
    wiki_preview_id: "bootstrap-1",
    wiki_preview_payload_sha256: previewHash,
    wiki_dispositions_sha256: "c".repeat(64),
    risk: "high",
    review_profile: "full",
    expected_proof_state: "implemented_on_lane",
    excludes: preview.excludes,
    supersedes: null,
  });
  const contractComment = tracker.postComment(issue, contract.envelope);
  assert.equal(
    verifyEnvelope(
      tracker.readComment(issue, contractComment),
      "workflow-execution-contract:v1",
    ).payload_sha256,
    contract.payload_sha256,
  );

  const grantProcess = run(
    "grant-derive",
    {
      delegation,
      delegation_payload_sha256: rootDelegationHash,
      record_id: "grant-1",
      issue,
      spec: {
        id: "spec-1",
        comment_id: specComment,
        payload_sha256: spec.payload_sha256,
        preview_id: "bootstrap-1",
        preview_payload_sha256: previewHash,
      },
      contract: {
        id: "contract-1",
        comment_id: contractComment,
        payload_sha256: contract.payload_sha256,
        issue,
        issue_type: "standalone",
        spec_id: "spec-1",
        spec_comment_id: specComment,
        spec_payload_sha256: spec.payload_sha256,
        wiki_operation: "bootstrap",
        wiki_baseline_requirement: "missing-with-bootstrap-preview",
        wiki_preview_id: "bootstrap-1",
        wiki_preview_payload_sha256: previewHash,
        owned_paths_sha256: hashCanonicalJson([
          ".worktrees/bootstrap-1/.wiki-staging",
          "wiki/index.md",
          "wiki/orders.md",
          "docs/agents/ron-workflow.md",
        ]),
      },
      coordinator: "codex",
      derived_at: "2026-07-26T11:03:00.000Z",
      capabilities: ["execute", "close_standalone"],
      exact_paths: [
        ".worktrees/bootstrap-1/.wiki-staging",
        "wiki/index.md",
        "wiki/orders.md",
        "docs/agents/ron-workflow.md",
      ],
      wiki_operation: "bootstrap",
      wiki_baseline_requirement: "missing-with-bootstrap-preview",
    },
    { cwd: root },
  );
  assert.equal(grantProcess.status, 0, grantProcess.stdout);
  const grantResult = JSON.parse(grantProcess.stdout);
  const grant = grantResult.grant;
  const grantComment = tracker.postComment(issue, grantResult.envelope);
  const grantPayloadHash = verifyEnvelope(
    tracker.readComment(issue, grantComment),
    "workflow-authorization:v1",
  ).payload_sha256;

  git(root, ["switch", "-qc", "lane/wiki-bootstrap"]);
  mkdirSync(join(root, "wiki"), { recursive: true });
  cpSync(validPage, join(root, "wiki/orders.md"));
  writeFileSync(join(root, "wiki/index.md"), "# Canonical Wiki\n\n- Orders\n");
  writeFileSync(
    join(root, "docs/agents/ron-workflow.md"),
    workflowConfigMarkdown("ready"),
  );
  const page = readFileSync(join(root, "wiki/orders.md"), "utf8");
  const pageResult = validateWikiPage(page);
  for (const source of pageResult.sources) resolveSourceLocator(root, source);
  git(root, ["add", "wiki", "docs/agents/ron-workflow.md"]);
  git(root, ["commit", "-qm", "bootstrap canonical wiki"]);
  const candidate = git(root, ["rev-parse", "HEAD"]);

  const closeoutPreviewProcess = run(
    "closeout-preview-create",
    {
      preview_id: "closeout-preview-1",
      created_at: "2026-07-26T11:04:00.000Z",
      mode: "standalone",
      issue,
      spec: {
        id: "spec-1",
        comment_id: specComment,
        payload_sha256: spec.payload_sha256,
      },
      contract: {
        id: "contract-1",
        comment_id: contractComment,
        payload_sha256: contract.payload_sha256,
      },
      child_contracts_payload_sha256: null,
      root_delegation: {
        delegation_id: "delegation-1",
        payload_sha256: rootDelegationHash,
      },
      source_authorization: {
        record_id: "grant-1",
        payload_sha256: grantPayloadHash,
      },
      evidence_payload_sha256: "8".repeat(64),
      lane: { id: "bootstrap-1", identity: candidate },
      target: { branch: "main", identity: targetIdentity },
      wiki_impact: "semantic",
      wiki_operation: "bootstrap",
      wiki_baseline_requirement: "missing-with-bootstrap-preview",
      wiki_preview_id: "bootstrap-1",
      wiki_preview_payload_sha256: previewHash,
      ledger: {
        schema: "workflow-wiki-reconciliation-ledger:v1",
        rows: [
          {
            id: "orders-baseline",
            topic: "orders",
            claim: "Current order behavior is documented.",
            prior_state: "absent",
            disposition: "add",
            source_locators: [
              {
                path: "src/orders.js",
                kind: "symbol",
                value: "createOrder",
              },
            ],
            conformance: "aligned",
            wiki_action: "add",
            wiki_path: "wiki/orders.md",
          },
        ],
      },
      semantic_write_set: ["wiki/orders.md"],
      support_write_set: [
        "wiki/index.md",
        "docs/agents/ron-workflow.md",
      ],
      protocol: {
        name: "ron-wiki-protocol",
        commit: "a".repeat(40),
        hash: "b".repeat(64),
      },
      staging_path: ".worktrees/bootstrap-1/.wiki-staging",
      verification_commands: [
        "ron-wiki page-validate",
        "ron-wiki source-resolve",
      ],
      review_axes: ["standards", "spec", "wiki"],
      capability: "close_standalone",
      target_refresh: "denied",
      repair: {
        wiki_waves: 2,
        wiki_authority: "human-grant-required",
        code_findings: "repair-leaf-only",
      },
      excludes: preview.excludes,
    },
    { cwd: root },
  );
  assert.equal(
    closeoutPreviewProcess.status,
    0,
    closeoutPreviewProcess.stdout,
  );
  const closeoutPreviewResult = JSON.parse(closeoutPreviewProcess.stdout);
  const closeoutGrantProcess = run(
    "closeout-grant-derive",
    {
      root_delegation: delegation,
      root_delegation_payload_sha256: rootDelegationHash,
      source_authorization: grant,
      source_authorization_payload_sha256: grantPayloadHash,
      preview: closeoutPreviewResult.preview,
      preview_payload_sha256: closeoutPreviewResult.payload_sha256,
      record_id: "closeout-grant-1",
      coordinator: "codex",
      derived_at: "2026-07-26T11:05:00.000Z",
    },
    { cwd: root },
  );
  assert.equal(
    closeoutGrantProcess.status,
    0,
    closeoutGrantProcess.stdout,
  );
  const closeoutGrant = JSON.parse(closeoutGrantProcess.stdout).grant;
  assert.deepEqual(closeoutGrant.grants, ["close_standalone"]);
  assert.equal(closeoutGrant.binds.lane_sha, candidate);

  git(root, ["switch", "-q", "main"]);
  git(root, ["merge", "--ff-only", "-q", "lane/wiki-bootstrap"]);
  assert.equal(git(root, ["rev-parse", "HEAD"]), candidate);
  assert.equal(
    extractWorkflowConfig(
      readFileSync(join(root, "docs/agents/ron-workflow.md"), "utf8"),
    ).wiki.baseline_state,
    "ready",
  );
  assert.equal(validateWikiPage(readFileSync(join(root, "wiki/orders.md"), "utf8")).status, "valid");
  tracker.close(issue);
  assert.equal(tracker.state(issue), "closed");
});
