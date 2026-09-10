import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  assertWorkflowOperationIdentity,
  deriveExecuteIssueOperationIdentity,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

const read = (path) => readFileSync(path, "utf8").replace(/\r\n?/gu, "\n");
const plainMarkdown = (content) => content.replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1");
const readVerifyTargetContract = () => [
  read("skills/engineering/verify-target-before-push/SKILL.md"),
  read("skills/engineering/verify-target-before-push/references/aggregate-verification-interfaces.md"),
  read("skills/engineering/verify-target-before-push/references/aggregate-recovery-interfaces.md"),
].join("\n");
const readAskMattContract = () => [
  read("skills/engineering/ask-matt/SKILL.md"),
  read("skills/engineering/ask-matt/references/workflow-routes.md"),
].join("\n");
const readToTicketsContract = () => [
  read("skills/engineering/to-tickets/SKILL.md"),
  read("skills/engineering/to-tickets/references/decomposition-publication-interfaces.md"),
  read("skills/engineering/to-tickets/references/decomposition-contract.md"),
].join("\n");
const readRunIssueWorkflowContract = () => [
  read("skills/personal/run-issue-workflow/SKILL.md"),
  read("skills/personal/run-issue-workflow/references/run-ready-handoff.md"),
  read("skills/personal/run-issue-workflow/references/coordinator-lifecycle.md"),
  read("skills/personal/run-issue-workflow/references/recovery.md"),
].join("\n");
const readExecuteIssueContract = () => [
  read("skills/engineering/execute-issue/SKILL.md"),
  read("skills/engineering/execute-issue/references/operation-identity.md"),
  read("skills/engineering/execute-issue/references/manual-prerequisites.md"),
  read("skills/engineering/execute-issue/references/completion-evidence.md"),
  read("skills/engineering/execute-issue/references/technical-recovery.md"),
].join("\n");
const readToSpecContract = () => [
  read("skills/engineering/to-spec/SKILL.md"),
  read("skills/engineering/to-spec/references/spec-publication-interfaces.md"),
  read("skills/engineering/to-spec/references/single-issue-template.md"),
  read("skills/engineering/to-spec/references/multi-issue-template.md"),
].join("\n");
const readCloseIssueContract = () => [
  read("skills/engineering/close-issue/SKILL.md"),
  read("skills/engineering/close-issue/references/operation-identity.md"),
  read("skills/engineering/close-issue/references/completion-evidence.md"),
  read("skills/engineering/close-issue/references/close-coordination.md"),
  read("skills/engineering/close-issue/references/executable-closeout.md"),
  read("skills/engineering/close-issue/references/parent-closeout.md"),
].join("\n");

const workflowEntryBudgets = Object.freeze([
  {
    role: "Router",
    maxWords: 700,
    paths: ["skills/engineering/ask-matt/SKILL.md"],
  },
  {
    role: "Operational",
    maxWords: 1_500,
    paths: [
      "skills/engineering/to-spec/SKILL.md",
      "skills/engineering/to-tickets/SKILL.md",
      "skills/personal/run-issue-workflow/SKILL.md",
      "skills/engineering/execute-issue/SKILL.md",
      "skills/engineering/close-issue/SKILL.md",
    ],
  },
]);

test("Router and Operational Skill entry word budgets name every exact file and count", () => {
  const measurements = workflowEntryBudgets.flatMap(({ role, maxWords, paths }) => paths.map((path) => ({
    role,
    path,
    maxWords,
    words: read(path).trim().split(/\s+/u).length,
  })));
  const overages = measurements.filter(({ maxWords, words }) => words > maxWords);

  assert.deepEqual(
    overages,
    [],
    overages.map(({ role, path, maxWords, words }) => `${role} ${path}: ${words} words > ${maxWords}`).join("\n"),
  );
});

test("moved workflow detail has an exact conditional owner-local reference and single owner", () => {
  const boundaries = [
    {
      entry: "skills/engineering/ask-matt/SKILL.md",
      references: ["skills/engineering/ask-matt/references/workflow-routes.md"],
      trigger: /Read \[workflow route details\]\(references\/workflow-routes\.md\) only when selecting/iu,
    },
    {
      entry: "skills/engineering/to-tickets/SKILL.md",
      references: ["skills/engineering/to-tickets/references/decomposition-contract.md"],
      trigger: /read \[the decomposition contract\]\(references\/decomposition-contract\.md\) only when starting, resuming, reconciling/iu,
    },
    {
      entry: "skills/engineering/to-spec/SKILL.md",
      references: ["skills/engineering/to-spec/references/spec-publication-interfaces.md"],
      trigger: /Before the first `readPlanningBaseline`, read \[spec publication interfaces\]\(references\/spec-publication-interfaces\.md\).*primary mode.*`tracker\.reserve`.*revision mode.*`tracker\.read`/isu,
    },
    {
      entry: "skills/personal/run-issue-workflow/SKILL.md",
      references: [
        "skills/personal/run-issue-workflow/references/run-ready-handoff.md",
        "skills/personal/run-issue-workflow/references/coordinator-lifecycle.md",
        "skills/personal/run-issue-workflow/references/recovery.md",
      ],
      trigger: /read \[the Run-ready handoff contract\]\(references\/run-ready-handoff\.md\).*Only `READY` may continue.*read \[the coordinator lifecycle\]\(references\/coordinator-lifecycle\.md\) only when.*Read \[Run recovery\]\(references\/recovery\.md\) only after/isu,
    },
    {
      entry: "skills/engineering/execute-issue/SKILL.md",
      references: [
        "skills/engineering/execute-issue/references/operation-identity.md",
        "skills/engineering/execute-issue/references/manual-prerequisites.md",
        "skills/engineering/execute-issue/references/completion-evidence.md",
      ],
      trigger: /Read \[`references\/operation-identity\.md`\]\(references\/operation-identity\.md\) for every fresh or retried lane.*Read \[Manual prerequisites\]\(references\/manual-prerequisites\.md\) only when.*read \[implementation completion evidence\]\(references\/completion-evidence\.md\) only when/isu,
    },
    {
      entry: "skills/engineering/close-issue/SKILL.md",
      references: [
        "skills/engineering/close-issue/references/close-coordination.md",
        "skills/engineering/close-issue/references/executable-closeout.md",
        "skills/engineering/close-issue/references/parent-closeout.md",
      ],
      trigger: /Read \[close coordination\]\(references\/close-coordination\.md\) before any lease acquisition.*For executable actions.*\[executable closeout\]\(references\/executable-closeout\.md\).*For a Multi-Issue parent.*\[parent closeout\]\(references\/parent-closeout\.md\)/isu,
    },
  ];

  for (const { entry, references, trigger } of boundaries) {
    assert.match(read(entry), trigger, `${entry} omits an exact conditional-load trigger`);
    for (const reference of references) assert.equal(existsSync(reference), true, `${reference} is missing`);
  }

  const contractPaths = [
    ...boundaries.flatMap(({ entry, references }) => [entry, ...references]),
    "skills/engineering/to-tickets/references/decomposition-publication-interfaces.md",
  ];

  for (const { owner, detail } of [
    {
      owner: "skills/engineering/ask-matt/references/workflow-routes.md",
      detail: "If a frozen coverage failure finds eligible direct target contributions",
    },
    {
      owner: "skills/engineering/to-tickets/references/decomposition-contract.md",
      detail: "With no current record, write exactly one",
    },
    {
      owner: "skills/engineering/to-tickets/references/decomposition-contract.md",
      detail: "First search the exact operation for an existing valid incomplete transaction-v1 or `to-tickets@v1` receipt",
    },
    {
      owner: "skills/engineering/to-tickets/references/decomposition-publication-interfaces.md",
      detail: "A fresh `to-tickets@v2` operation gets its operation identity receipt",
    },
    {
      owner: "skills/engineering/to-tickets/references/decomposition-contract.md",
      detail: "Its ordered stages are `decomposition.read_back`, `ready_state.read_back`, and `handoff.completed`",
    },
    {
      owner: "skills/personal/run-issue-workflow/references/run-ready-handoff.md",
      detail: "A current producer never owns target dirt",
    },
    {
      owner: "skills/engineering/execute-issue/references/completion-evidence.md",
      detail: "Concurrent first `workflow_artifacts_contract_adopted:v1` completions may publish multiple payload-identical physical adoption records",
    },
    {
      owner: "skills/engineering/execute-issue/references/operation-identity.md",
      detail: "Before the first prospective completion in one exact repository, tracker, Spec, and Issue-target scope",
    },
  ]) {
    const observedOwners = contractPaths.filter((path) => read(path).includes(detail));
    assert.deepEqual(observedOwners, [owner], `${detail} must have exactly one workflow contract owner`);
    assert.equal(read(owner).split(detail).length - 1, 1, `${owner} must singly own ${detail}`);
  }

  const decompositionInterfaces = read("skills/engineering/to-tickets/references/decomposition-publication-interfaces.md");
  assert.doesNotMatch(
    decompositionInterfaces,
    /transaction-v1|to-tickets@v1|frozen exact resume behavior|Its ordered stages are `decomposition\.read_back`, `ready_state\.read_back`, and `handoff\.completed`/isu,
    "the adapter interface must not duplicate the decomposition contract's profile, compatibility, or ordered-stage rules",
  );
});

const createGitFixture = (prefix) => {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  const rawGit = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  const git = (...args) => rawGit(...args).trim();
  const isAncestor = (ancestor, descendant) => {
    try {
      git("merge-base", "--is-ancestor", ancestor, descendant);
      return true;
    } catch {
      return false;
    }
  };

  git("init", "-b", "target");
  git("config", "user.name", "Contract Test");
  git("config", "user.email", "contract@example.test");
  return { repo, rawGit, git, isAncestor };
};

const createPushReadyReceipt = ({
  target,
  baseline,
  head,
  members,
  coverage,
  commands,
  results,
  reconciliationRecords = [],
  directTargetContributions = [],
  successorDispositions = [],
}) => ({
  schema: "push_ready:v1",
  mode: "local-ahead",
  target,
  baseline,
  head,
  members,
  reconciliationRecords,
  directTargetContributions,
  coverage,
  standards: "clean",
  spec: "clean",
  commands,
  results,
  successorDispositions,
  worktree: "clean",
});

test("deterministic operation identity and receipt ownership stay synchronized across workflow seams", () => {
  const operationModule = read("skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs");
  const checkpointStore = read("skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs");
  const specInterfaces = read("skills/engineering/to-spec/references/spec-publication-interfaces.md");
  const ticketInterfaces = read("skills/engineering/to-tickets/references/decomposition-publication-interfaces.md");
  const executionInterfaces = read("skills/engineering/execute-issue/references/operation-identity.md");
  const closeInterfaces = read("skills/engineering/close-issue/references/operation-identity.md");
  const aggregateInterfaces = read("skills/engineering/verify-target-before-push/references/operation-identity.md");
  const run = readRunIssueWorkflowContract();
  const execute = readExecuteIssueContract();
  const close = readCloseIssueContract();
  const verify = read("skills/engineering/verify-target-before-push/SKILL.md");
  const runOperator = read("skills/personal/run-issue-workflow/OPERATOR.md");

  assert.match(operationModule, /workflow-operation-identity:v1.*repositoryId.*specId.*approvedPublicationIdentity.*producer.*stage.*issueId.*workflow-op-v1/isu);
  for (const adapter of [
    "bindProducerCheckpointOperationIdentity",
    "createProducerOperationCheckpoint",
    "deriveRunOperationIdentity",
    "deriveExecuteIssueOperationIdentity",
    "deriveCloseIssueOperationIdentity",
    "deriveAggregateVerificationOperationIdentity",
  ]) assert.match(operationModule, new RegExp(`export function ${adapter}`, "u"));
  assert.doesNotMatch(checkpointStore, /workflow-operation-identity|assertWorkflowOperationIdentity/iu);
  assert.match(checkpointStore, /profileVersion.*v1.*WORKFLOW_CHECKPOINT_PROFILE_CREATE_UNSUPPORTED/isu);
  assert.match(specInterfaces, /primary reservation.*proposed-Spec identity.*reserved tracker identity.*Spec-bound.*versioned operation identity/isu);
  assert.match(specInterfaces, /fresh.*`to-spec@v2`.*operation identity receipt.*repository.*Spec.*approved publication.*`to-spec`.*`publication`/isu);
  assert.match(ticketInterfaces, /fresh.*`to-tickets@v2`.*operation identity receipt.*repository.*Spec.*approved publication.*`to-tickets`.*`decomposition`/isu);
  assert.doesNotMatch(ticketInterfaces, /opaque operation identity/iu);

  assert.match(run, /repository identity.*versioned operation identity.*approved publication.*caller correlation.*never.*authority/isu);
  assert.match(runOperator, /canonical repository identity.*deterministic versioned operation identity.*immutable.*caller correlation never defines the Run/isu);
  assert.match(execute, /references\/operation-identity\.md.*deterministic operation identity.*implementation receipt owner/isu);
  assert.match(close, /references\/operation-identity\.md.*deterministic operation identity.*closeout operation owner/isu);
  assert.match(verify, /references\/operation-identity\.md.*deterministic operation identity.*aggregate receipt owner/isu);
  assert.match(executionInterfaces, /`execute-issue`.*`implementation`.*stable Issue/isu);
  assert.match(executionInterfaces, /does not rerun Run.*semantic.*implementation_complete.*downstream closeout does not rerun implementation.*review/isu);
  assert.match(executionInterfaces, /implementation_complete.*operationIdentity.*approved publication.*reviewed candidate/isu);
  assert.match(closeInterfaces, /`close-issue`.*`closeout`.*stable Issue.*implementation_complete.*does not rerun implementation.*review/isu);
  assert.match(closeInterfaces, /implementation_complete.*operationIdentity.*approved publication.*legacy/isu);
  assert.match(aggregateInterfaces, /`verify-target-before-push`.*selected Spec.*`aggregate-verification`/isu);
  assert.match(aggregateInterfaces, /completion receipt.*does not rerun Issue implementation.*review/isu);
  assert.match(execute, /completion note.*operationIdentity.*canonical repository.*approved publication.*stable Issue/isu);
  assert.match(close, /implementation_complete.*current receipt.*operationIdentity.*approved publication/isu);
  assert.match(verify, /current completion.*operationIdentity.*approved publication/isu);
  for (const contract of [execute, executionInterfaces, close, closeInterfaces, verify, aggregateInterfaces]) {
    assert.match(contract, /workflow_operation_identity_contract_adopted:v1.*legacyCompletionFrontier/isu);
  }

  for (const path of [
    "docs/engineering/to-spec.md",
    "docs/engineering/to-tickets.md",
    "docs/engineering/execute-issue.md",
    "docs/engineering/close-issue.md",
    "docs/engineering/verify-target-before-push.md",
  ]) {
    assert.match(read(path), /deterministic.*operation identity.*immutable/isu, `${path} omits deterministic operation identity`);
  }
  assert.match(read("CONTEXT.md"), /Producer operation identity.*versioned.*canonical repository.*stable Spec.*approved publication.*workflow stage.*stable Issue.*caller correlation.*never.*authority/isu);
});

test("completion operation identity adoption freezes exact legacy members and rejects later omissions", () => {
  const scope = {
    repository: "ron03wlb/skills",
    tracker: "github:ron03wlb/skills",
    spec: 43,
    targetBranch: "features/ron",
  };
  const operationInput = {
    repositoryId: "github:ron03wlb/skills",
    specId: "43",
    approvedPublicationIdentity: `sha256:${"8".repeat(64)}`,
  };
  const digest = (body) => createHash("sha256").update(body).digest("hex");
  const legacyBody = "legacy Issue 44 implementation_complete body";
  const legacy = {
    issue: "44",
    evidenceId: "github-comment:legacy-44",
    body: legacyBody,
  };
  const adoption = {
    kind: "workflow_operation_identity_contract_adopted:v1",
    ...scope,
    legacyCompletionFrontier: [{
      issue: legacy.issue,
      evidenceId: legacy.evidenceId,
      bodySha256: digest(legacyBody),
    }],
  };
  const located = (payload) => ({
    location: { tracker: scope.tracker, spec: scope.spec },
    payload,
  });
  const classify = (completion, adoptionRecords = []) => {
    const records = adoptionRecords
      .filter(({ location, payload }) => payload.kind === adoption.kind
        && location.tracker === scope.tracker
        && location.spec === scope.spec)
      .map(({ payload }) => payload);
    for (const record of records) {
      assert.deepEqual(
        Object.keys(record).sort(),
        ["kind", "legacyCompletionFrontier", "repository", "spec", "targetBranch", "tracker"],
        "malformed operation identity adoption record",
      );
      for (const field of ["repository", "tracker", "spec", "targetBranch"]) {
        assert.equal(record[field], scope[field], `mismatched operation identity adoption ${field}`);
      }
      assert.ok(Array.isArray(record.legacyCompletionFrontier), "unreadable operation identity legacy frontier");
      const seen = new Set();
      for (const entry of record.legacyCompletionFrontier) {
        assert.deepEqual(Object.keys(entry).sort(), ["bodySha256", "evidenceId", "issue"]);
        assert.match(entry.bodySha256, /^[a-f0-9]{64}$/u);
        const key = `${entry.issue}:${entry.evidenceId}`;
        assert.equal(seen.has(key), false, "duplicate operation identity legacy frontier entry");
        seen.add(key);
      }
    }
    const canonical = new Set(records.map((record) => JSON.stringify({
      ...record,
      legacyCompletionFrontier: [...record.legacyCompletionFrontier]
        .sort((a, b) => `${a.issue}:${a.evidenceId}`.localeCompare(`${b.issue}:${b.evidenceId}`)),
    })));
    assert.ok(canonical.size <= 1, "conflicting operation identity adoption records");
    if (Object.hasOwn(completion, "operationIdentity")) {
      assertWorkflowOperationIdentity(completion.operationIdentity, {
        ...operationInput,
        producer: "execute-issue",
        stage: "implementation",
        issueId: completion.issue,
      });
      return "current";
    }
    if (records.length === 0) return "unadopted-legacy";
    const bodySha256 = digest(completion.body);
    const listed = records[0].legacyCompletionFrontier.some((entry) => entry.issue === completion.issue
      && entry.evidenceId === completion.evidenceId
      && entry.bodySha256 === bodySha256);
    assert.equal(listed, true, "completion missing operationIdentity is not in the frozen frontier");
    return "frozen-legacy";
  };

  const current = {
    issue: "45",
    evidenceId: "github-comment:current-45",
    body: "current Issue 45 implementation_complete body",
    operationIdentity: deriveExecuteIssueOperationIdentity({ ...operationInput, issueId: "45" }),
  };
  assert.equal(classify(current, [located(adoption)]), "current");
  assert.equal(classify(legacy, [located(adoption)]), "frozen-legacy");
  assert.equal(classify(legacy), "unadopted-legacy");
  assert.throws(
    () => classify({ ...legacy, issue: "45", evidenceId: "github-comment:later-45" }, [located(adoption)]),
    /not in the frozen frontier/u,
  );
  assert.throws(
    () => classify({ ...legacy, body: `${legacy.body} edited` }, [located(adoption)]),
    /not in the frozen frontier/u,
  );
  assert.equal(classify(current, [located(adoption), located({ ...adoption })]), "current");
  assert.throws(
    () => classify(current, [located(adoption), located({ ...adoption, legacyCompletionFrontier: [] })]),
    /conflicting operation identity adoption records/u,
  );
  assert.throws(
    () => classify(current, [located({
      ...adoption,
      legacyCompletionFrontier: [
        adoption.legacyCompletionFrontier[0],
        adoption.legacyCompletionFrontier[0],
      ],
    })]),
    /duplicate operation identity legacy frontier entry/u,
  );
});

test("promoted skills, docs, READMEs, and plugin manifest stay in parity", () => {
  const manifest = JSON.parse(read(".claude-plugin/plugin.json")).skills.sort();
  const expected = [];

  for (const bucket of ["engineering", "productivity"]) {
    const bucketReadme = read(`skills/${bucket}/README.md`);
    for (const name of readdirSync(`skills/${bucket}`)) {
      const skillPath = `skills/${bucket}/${name}/SKILL.md`;
      if (!existsSync(skillPath)) continue;
      expected.push(`./skills/${bucket}/${name}`);
      assert.equal(existsSync(`docs/${bucket}/${name}.md`), true, `missing docs for ${name}`);
      assert.match(read("README.md"), new RegExp(`\\]\\(\\./skills/${bucket}/${name}/SKILL\\.md\\)`, "u"));
      assert.match(bucketReadme, new RegExp(`\\]\\(\\./${name}/SKILL\\.md\\)`, "u"));
      assert.equal(
        existsSync(`skills/${bucket}/${name}/agents/openai.yaml`),
        true,
        `missing OpenAI metadata for ${name}`,
      );
      const skill = read(skillPath);
      const metadata = read(`skills/${bucket}/${name}/agents/openai.yaml`);
      const userInvoked = /^disable-model-invocation:\s*true$/mu.test(skill);
      assert.equal(
        /^\s*allow_implicit_invocation:\s*false$/mu.test(metadata),
        userInvoked,
        `invocation metadata differs for ${name}`,
      );
      if (!userInvoked) {
        assert.doesNotMatch(skill, /^disable-model-invocation:/mu, `${name} must omit model-invocation policy`);
        assert.doesNotMatch(metadata, /^policy:/mu, `${name} must omit implicit-invocation policy`);
      }
    }
  }

  assert.deepEqual(manifest, expected.sort());

  const promotedNames = new Set(manifest.map((path) => path.split("/").at(-1)));
  for (const bucket of ["engineering", "productivity"]) {
    for (const name of readdirSync(`docs/${bucket}`)) {
      if (!name.endsWith(".md")) continue;
      for (const match of read(`docs/${bucket}/${name}`).matchAll(/https:\/\/aihero\.dev\/skills-([a-z0-9-]+)/gu)) {
        assert.equal(promotedNames.has(match[1]), true, `docs/${bucket}/${name} links to unknown skill ${match[1]}`);
      }
    }
  }
});

test("dependency loading separates host mechanism from invocation and selected-source authority", () => {
  const convention = read(".agents/invocation.md");
  assert.match(convention, /generic Skill tool.*available.*use it/isu);
  assert.match(convention, /otherwise.*host-supported named-skill.*read and follow.*SKILL\.md/isu);
  assert.match(convention, /absence of.*tool name.*another human invocation.*already authorized work/isu);
  assert.match(convention, /one named skill per invocation/iu);
  assert.match(convention, /missing or inaccessible content.*conflicting identities.*higher-priority host restrictions/isu);
  assert.match(convention, /Matt\/Ron owners and their references.*selected immutable package/isu);
  assert.match(convention, /generic helpers.*current host catalog/isu);
  assert.match(convention, /never silently substitute.*newer local/isu);
  assert.match(convention, /user-invoked skill.*never.*another skill.*fallback/isu);
  assert.match(convention, /disable-model-invocation: true/iu);
  assert.match(convention, /allow_implicit_invocation: false/iu);
});

test("grill-with-docs metadata and docs preserve both planning branches and the explicit handoff", () => {
  const skill = read("skills/engineering/grill-with-docs/SKILL.md");
  const metadata = read("skills/engineering/grill-with-docs/agents/openai.yaml");
  const docs = read("docs/engineering/grill-with-docs.md");
  assert.match(skill, /Read-only exploration and tracker-only settled scope need no worktree/u);
  assert.match(skill, /Before the first accepted glossary or ADR write.*Spec workflow lane/isu);
  assert.match(skill, /selected source and invocation restrictions.*same settled scope.*same lane identity/isu);
  assert.match(skill, /handoff packet containing the task identity, proposed Spec, target, current baseline.*empty change list.*owned worktree.*every accepted glossary or ADR path or hunk.*content identity/isu);
  assert.match(skill, /partial publication, uncommitted accepted decision, identity mismatch, or failed read-back preserves it/u);
  assert.match(metadata, /allow_implicit_invocation: false/u);
  assert.match(docs, /Read-only design and tracker-only scope.*no worktree/isu);
  assert.match(docs, /Accepted document writes.*exact registered worktree.*successful `to-spec` handoff read-back/isu);
  assert.match(docs, /generic Skill tool.*host-supported named-skill loading/isu);
  assert.match(docs, /task identity, proposed Spec, target,.*baseline.*accepted.*path or hunk.*content identity/isu);
  assert.match(docs, /explicitly run `\/to-spec` with that packet/iu);
  assert.doesNotMatch(docs, /closing message tends to be open-ended/u);
});

test("promoted README invocation groups match each skill's invocation policy", () => {
  const reference = read("README.md").split(/^## Reference$/mu)[1];
  assert.notEqual(reference, undefined, "top-level README needs its Reference index");

  for (const { path, content, prefix } of [
    { path: "README.md", content: reference, prefix: "" },
    ...["engineering", "productivity"].map((bucket) => ({
      path: `skills/${bucket}/README.md`,
      content: read(`skills/${bucket}/README.md`),
      prefix: `skills/${bucket}/`,
    })),
  ]) {
    const indexed = [];
    let group;
    for (const line of content.split("\n")) {
      const heading = line.match(/^(?:## |\*\*)(User-invoked|Model-invoked)(?:\*\*)?$/u);
      if (heading) group = heading[1];
      for (const match of line.matchAll(/\]\(\.\/([^)]*\/SKILL\.md)\)/gu)) {
        const skillPath = `${prefix}${match[1]}`;
        const expectedGroup = /^disable-model-invocation:\s*true$/mu.test(read(skillPath))
          ? "User-invoked"
          : "Model-invoked";
        assert.equal(group, expectedGroup, `${path} lists ${skillPath} in the wrong invocation group`);
        indexed.push(skillPath);
      }
    }
    const expected = JSON.parse(read(".claude-plugin/plugin.json")).skills
      .map((path) => `${path.slice(2)}/SKILL.md`)
      .filter((path) => path.startsWith(prefix));
    assert.deepEqual(indexed.sort(), expected.sort(), `${path} must classify every promoted skill once`);
  }
});

test("every bucket README indexes exactly its current skills", () => {
  for (const bucket of ["engineering", "productivity", "misc", "personal", "in-progress", "deprecated"]) {
    const directory = `skills/${bucket}`;
    const expected = readdirSync(directory).filter((name) => existsSync(`${directory}/${name}/SKILL.md`));
    const indexed = [...read(`${directory}/README.md`).matchAll(/\]\(\.\/([^/]+)\/SKILL\.md\)/gu)]
      .map((match) => match[1]);
    assert.deepEqual(indexed.sort(), expected.sort(), `${directory}/README.md has missing, stale, or duplicate skills`);
  }
});

test("daily-journal is a model-invoked personal skill without promotion", () => {
  const skillPath = "skills/personal/daily-journal/SKILL.md";
  const metadataPath = "skills/personal/daily-journal/agents/openai.yaml";

  assert.equal(existsSync(skillPath), true, "daily-journal needs one repository-owned skill");
  assert.equal(existsSync(metadataPath), true, "daily-journal needs Codex metadata");

  const skill = read(skillPath);
  const metadata = read(metadataPath);
  assert.doesNotMatch(skill, /^disable-model-invocation:/mu);
  assert.doesNotMatch(metadata, /^policy:/mu);
  assert.match(read("skills/personal/README.md"), /\[daily-journal\]\(\.\/daily-journal\/SKILL\.md\)/u);
  assert.match(read("skills/engineering/ask-matt/SKILL.md"), /daily reflection.*`\/daily-journal`/isu);
  assert.match(read("docs/engineering/ask-matt.md"), /daily reflection.*daily-journal/isu);

  const manifest = JSON.parse(read(".claude-plugin/plugin.json")).skills;
  assert.equal(manifest.includes("./skills/personal/daily-journal"), false);
  assert.doesNotMatch(read("README.md"), /skills\/personal\/daily-journal/u);
  assert.equal(existsSync("docs/personal/daily-journal.md"), false);
});

test("confirm-understanding requires a bounded evidence calibration before alignment", () => {
  const skill = read("skills/productivity/confirm-understanding/SKILL.md");
  const docs = read("docs/productivity/confirm-understanding.md");
  const metadata = read("skills/productivity/confirm-understanding/agents/openai.yaml");

  assert.match(skill, /^disable-model-invocation:\s*true$/mu);
  assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(skill, /Evidence Set.*scope.*Core Propositions/isu);
  const questionCaps = skill.match(/10 questions/giu) ?? [];
  assert.equal(questionCaps.length, 1, "question cap must have one owner");
  assert.match(skill, /hard cap of 10 questions.*narrow or split the scope/isu);
  assert.match(skill, /one Core Proposition/iu);
  const privateFeedbackRules = skill.match(/correctness feedback private/giu) ?? [];
  assert.equal(privateFeedbackRules.length, 1, "round secrecy must have one owner");
  assert.match(skill, /Every initial or repair calibration round follows one \*\*Round Protocol\*\*/iu);
  assert.match(skill, /If none can be derived.*record.*core Evidence Gap.*skip the question steps/isu);
  assert.match(skill, /This step is complete only when.*either.*at least one assessed Core Proposition.*or \(b\) no Core Proposition is assessable.*core Evidence Gap/isu);
  assert.doesNotMatch(skill.slice(skill.indexOf("## 1."), skill.indexOf("## 2.")), /`INCONCLUSIVE`|Alignment Record/u);
  assert.match(skill, /ALIGNED.*every assessed Core Proposition.*no core Evidence Gap/isu);
  assert.match(skill, /fresh question correctly.*seeing the answer never counts as alignment/isu);
  assert.match(skill, /`INCONCLUSIVE` if a core Evidence Gap exists or the first round is incomplete/iu);
  assert.match(skill, /stops during a repair round.*current `NOT_ALIGNED` status/isu);
  assert.match(docs, /inaccessible.*missing.*ambiguous.*contradictory.*no assessable Core Proposition/isu);
  assert.match(skill, /Writing a file.*separate action requiring explicit user authorization/isu);
});

test("code-review owns requested and material-risk review activation", () => {
  const riskTrigger = /material security, data, concurrency, migration, contract, or cross-module risk/iu;
  for (const path of [
    "skills/engineering/code-review/SKILL.md",
    "docs/engineering/code-review.md",
    "README.md",
    "skills/engineering/README.md",
    "skills/engineering/ask-matt/SKILL.md",
    "docs/engineering/ask-matt.md",
  ]) {
    assert.match(read(path), riskTrigger, path + " omits the material-risk review trigger");
  }

  const skill = read("skills/engineering/code-review/SKILL.md");
  const metadata = read("skills/engineering/code-review/agents/openai.yaml");
  assert.doesNotMatch(skill, /^disable-model-invocation:/mu);
  assert.match(skill, /fixed point/iu);
  assert.doesNotMatch(metadata, /^policy:/mu);
  assert.match(metadata, /risky diffs/iu);

  assert.match(skill, /committed candidate.*git diff <fixed-point>\.\.\.<candidate-sha>/isu);
  assert.match(skill, /WIP candidate.*git diff <fixed-point>.*git status --short.*in-scope untracked/isu);
  assert.match(skill, /work-in-progress.*use `HEAD` as the fixed point/isu);
  assert.match(skill, /non-empty.*tracked diff.*in-scope untracked/isu);
  const docs = read("docs/engineering/code-review.md");
  assert.match(docs, /empty candidate.*in-scope untracked/isu);
  assert.doesNotMatch(docs, /empty diff/iu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    const entry = read(path).match(/^- \*\*\[code-review\][^\n]*/mu)?.[0] ?? "";
    assert.match(entry, riskTrigger, path + " splits the code-review description across lines");
  }
});

test("code review advisory and confirmed code review finding route to Aggregate repair Issue during target verification", () => {
  const review = read("skills/engineering/code-review/SKILL.md");
  const reviewDocs = read("docs/engineering/code-review.md");
  const execute = readExecuteIssueContract();
  const executeDocs = read("docs/engineering/execute-issue.md");
  const verify = readVerifyTargetContract();
  const verifyDocs = read("docs/engineering/verify-target-before-push.md");
  const verifyMetadata = read("skills/engineering/verify-target-before-push/agents/openai.yaml");
  const router = readAskMattContract();
  const routerDocs = read("docs/engineering/ask-matt.md");

  assert.match(review, /Coordinator.*classif(?:y|ies).*observation.*Confirmed code review finding.*Code review advisory/isu);
  assert.match(review, /Confirmed code review finding.*exact.*repository or Spec evidence.*violation/isu);
  assert.match(review, /Code review advisory.*visible.*does not fail.*consume.*repair wave.*trigger repair/isu);
  assert.match(review, /advisory.*never.*persistent dismissal.*tracker waiver.*Git note.*SHA allowlist/isu);
  assert.match(review, /Standards.*Spec.*separate.*classif/isu);

  for (const consumer of [execute, executeDocs]) {
    assert.match(consumer, /Confirmed code review finding/iu);
    assert.match(consumer, /Code review advisory/iu);
  }
  assert.match(execute, /both axes.*no Confirmed code review finding.*clean/isu);
  assert.match(execute, /advisories.*do not.*fail.*repair.*repair wave.*durable waiver/isu);
  assert.match(execute, /smells.*preferences.*suggestions.*lack.*exact.*evidence.*advisories.*exact.*evidence.*Confirmed code review finding/isu);

  assert.match(verify, /only.*Confirmed code review finding.*withholds.*push readiness/isu);
  assert.match(verify, /Code review advisory.*visible.*does not block.*trigger repair.*waiver/isu);
  assert.match(verify, /confirmed.*finding.*affected Issue.*Spec.*same target branch/isu);
  assert.match(verify, /default.*new human-created Aggregate repair Issue/isu);
  assert.match(verify, /never creates or executes.*Aggregate repair Issue.*repairs product code.*reopens.*earlier Issue.*edits.*completion note/isu);
  for (const consumer of [verifyDocs, verifyMetadata, router, routerDocs]) {
    assert.match(consumer, /Confirmed code review finding/iu);
    assert.match(consumer, /Code review advisory/iu);
    assert.match(consumer, /Aggregate repair Issue/iu);
  }

  for (const consumer of [reviewDocs]) {
    assert.match(consumer, /Confirmed code review finding/iu);
    assert.match(consumer, /Code review advisory/iu);
  }
});

test("Wiki is one independent user-invoked documentation control", () => {
  const skill = read("skills/engineering/wiki/SKILL.md");
  const metadata = read("skills/engineering/wiki/agents/openai.yaml");
  const locatorDecision = read("docs/adr/0012-use-stable-wiki-source-locators.md");
  assert.match(skill, /disable-model-invocation: true/u);
  assert.match(metadata, /allow_implicit_invocation: false/u);
  assert.match(locatorDecision, /^status: accepted$/mu);
  assert.doesNotMatch(locatorDecision, /Ron config|Bootstrap and closeout/u);
  assert.doesNotMatch(skill, /TODO/u);
  for (const term of [
    "status",
    "explicit path",
    "unique existing Wiki root",
    "wiki/",
    "committed `HEAD`",
    "Sources",
    "semantic review",
    "10",
    "one local commit",
    "scripts/wiki-validate.mjs",
    "tracked or untracked changes",
  ]) {
    assert.equal(skill.includes(term), true, `Wiki skill omits ${term}`);
  }
  for (const staleTerm of [
    "ron-workflow-config",
    "Change Spec",
    "Grant",
    "Ron",
    "execute-issue",
    "close-issue",
    "Issue tracker",
  ]) {
    assert.equal(skill.includes(staleTerm), false, `Wiki skill still depends on ${staleTerm}`);
  }
});
test("planning lanes revalidate relevant facts before tracker work becomes executable", () => {
  const spec = readToSpecContract();
  const tickets = readToTicketsContract();
  const implement = read("skills/engineering/implement/SKILL.md");
  const execute = readExecuteIssueContract();
  const context = read("CONTEXT.md");
  const specDocs = read("docs/engineering/to-spec.md");
  const ticketsDocs = read("docs/engineering/to-tickets.md");
  const matt = readAskMattContract();
  const mattDocs = read("docs/engineering/ask-matt.md");
  const deliveryAdr = read("docs/adr/0022-use-issue-native-execution-and-closeout.md");
  const successorAdrPath = "docs/adr/0023-integrate-issues-independently-and-verify-before-push.md";
  assert.equal(existsSync(successorAdrPath), true, "delivery routing needs a successor ADR");
  const successorAdr = read(successorAdrPath);
  assert.match(deliveryAdr, /^status: superseded by ADR-0038$/mu, "ADR-0022 must defer to the current delivery workflow");
  assert.match(successorAdr, /^status: superseded by ADR-0038$/mu, "ADR-0023 must defer to the current delivery workflow");

  const grill = read("skills/engineering/grill-with-docs/SKILL.md");
  const domain = read("skills/engineering/domain-modeling/SKILL.md");
  const grillDocs = read("docs/engineering/grill-with-docs.md");
  const domainDocs = read("docs/engineering/domain-modeling.md");
  const interfaces = read("skills/engineering/to-spec/references/spec-publication-interfaces.md");

  assert.match(grill, /Spec workflow lane.*one Codex task.*one proposed Tracker Spec.*one target.*isolated planning worktree/isu);
  assert.match(grill, /same target.*without.*shared planning checkout.*global workflow lock.*cross-lane.*mutation/isu);
  assert.match(grill, /Load "grilling" and "domain-modeling" as separate named skills.*generic Skill tool.*otherwise.*host-supported.*SKILL\.md.*same lane identity/isu);
  assert.match(grill, /handoff packet.*tell the human to run `\/to-spec`.*dispose.*exact.*clean.*planning worktree.*successful.*handoff.*read-back/isu);
  assert.match(grill, /Recoverable blocker.*lane registry.*observed evidence.*smallest human action.*preserved stages.*same `\/grill-with-docs`/isu);
  assert.match(domain, /active Spec workflow lane.*accepted.*CONTEXT\.md.*ADR.*only.*planning worktree/isu);
  assert.match(domain, /lane identity.*mismatch.*Hard gate.*stop.*target checkout.*other lane/isu);
  assert.match(grillDocs + domainDocs, /one proposed (?:Tracker )?Spec.*target.*isolated planning worktree/isu);

  const specSeal = spec.indexOf("Revalidate the Planning baseline and select the Planning Seal");
  const specPublish = spec.indexOf("Publish and complete the handoff", specSeal);
  assert.equal(specSeal !== -1 && specPublish > specSeal, true, "to-spec must seal planning artifacts before publish");
  assert.match(spec, /planning lane.*Codex task.*proposed Tracker Spec.*target.*baseline.*planning worktree.*accepted glossary.*ADR.*path or hunk.*content identity/isu);
  assert.match(spec, /re-read only.*relevant glossary.*ADR.*source facts.*latest target/isu);
  assert.match(spec, /compatible.*target movement.*bind.*latest baseline/isu);
  assert.match(spec, /relevant semantic drift.*Recoverable blocker.*owning source.*observed evidence.*smallest human action.*preserved stages.*same `\/to-spec` retry/isu);
  assert.match(spec, /one exact accepted delta.*shared writer.*one scoped seal/isu);
  assert.match(spec, /no accepted.*delta.*reuse.*latest baseline.*no empty commit/isu);
  assert.doesNotMatch(spec, /operational plan.*commit only.*exact plan/isu);
  assert.match(spec, /revision mode.*tracker.read.*existing Spec.*version token/isu);
  assert.match(spec, /revision mode updates the same existing Spec.*Neither mode creates a replacement Spec/isu);
  assert.match(specDocs, /compatible target movement.*latest baseline.*semantic drift.*same `\/to-spec`/isu);
  assert.match(interfaces, /checkpoint adapter.*to-spec@v2.*planning_seal\.read_back.*publication\.read_back.*handoff\.completed/isu);
  assert.match(interfaces, /tracker adapter.*reserve.*read.*publish/isu);
  assert.match(interfaces, /handoff adapter.*append.*read/isu);
  assert.match(interfaces, /Hard gate.*Recoverable blocker.*advisory/isu);
  assert.match(spec, /read only the matching template.*references\/single-issue-template\.md.*references\/multi-issue-template\.md.*Do not load the unused/isu);
  const singleTemplate = read("skills/engineering/to-spec/references/single-issue-template.md");
  const multiTemplate = read("skills/engineering/to-spec/references/multi-issue-template.md");
  assert.match(singleTemplate, /Planning baseline.*Mode: <primary or revision>.*Commit:.*Seal:/su, "Single-Issue template omits revision lineage");
  assert.match(singleTemplate, /Shape: Single-Issue.*User Outcomes.*Acceptance Criteria.*Implementation Plan.*Verification.*`\/run-issue-workflow <Spec-ID>`/su);
  assert.match(multiTemplate, /Shape: Multi-Issue.*Overall Outcome.*Cross-Issue Constraints.*Decomposition Rationale.*`\/to-tickets <Spec-ID>`/su);
  assert.doesNotMatch(multiTemplate, /## Acceptance Criteria|## Implementation Plan|## Verification/u);
  assert.doesNotMatch(singleTemplate + multiTemplate, /extremely extensive|## User Stories|## Implementation Decisions/iu);
  assert.match(spec, /sole authority.*Single-Issue.*Multi-Issue/isu);
  assert.match(spec, /repository evidence.*automatic.*one blocking question.*recommendation/isu);
  assert.match(spec, /User Outcomes.*at most three/isu);
  assert.match(spec, /every Acceptance Criterion.*Implementation Plan step.*Verification.*every Implementation Plan step.*Acceptance Criterion/isu);
  assert.match(spec, /Single-Issue.*`\/run-issue-workflow <Spec-ID>`.*Multi-Issue.*`\/to-tickets <Spec-ID>`/isu);
  for (const [name, skill] of [["to-spec", spec], ["to-tickets", tickets]]) {
    assert.match(skill, /otherwise stop.*tell the human to invoke `\/setup-matt-pocock-skills`/isu, `${name} must not invoke a user-invoked setup skill`);
  }

  const ticketsInterfaces = read("skills/engineering/to-tickets/references/decomposition-publication-interfaces.md");
  const ticketsContract = read("skills/engineering/to-tickets/references/decomposition-contract.md");
  const ticketsSeal = tickets.indexOf("Validate the consumed Planning Seal");
  const ticketsPublish = tickets.indexOf("Publish Executable Issues", ticketsSeal);
  assert.equal(ticketsSeal !== -1 && ticketsPublish > ticketsSeal, true, "to-tickets must validate its consumed seal before publish");
  assert.match(tickets, /consume.*exact Planning Seal.*to-spec.*read-back.*exist locally.*ancestor.*target/isu);
  assert.match(tickets, /does not rerun.*planning.*generation.*review.*validation.*does not create.*successor Planning Seal/isu);
  assert.match(tickets, /public behavior, acceptance, target, or exclusion.*stop.*tell the human to invoke `\/to-spec`/isu);
  assert.match(tickets, /do not modify.*parent/isu);
  assert.match(ticketsInterfaces, /upstream adapter.*checkpoint adapter.*tracker adapter.*handoff adapter/isu);
  assert.match(ticketsContract, /to-tickets@v2.*decomposition\.read_back.*ready_state\.read_back.*handoff\.completed/isu);
  const childContract = tickets.match(/<child-contract>(.*?)<\/child-contract>/su)?.[1] ?? "";
  assert.match(childContract, /Parent.*Decomposition key.*What to build/su, "canonical child contract omits stable identity");
  assert.match(childContract, /Planning baseline.*Commit:.*Seal: <created, successor, or reused>/su, "canonical child contract has an incomplete Planning baseline");
  assert.match(childContract, /Acceptance Criteria.*Implementation Plan.*Verification.*Blocked by/su, "canonical child contract is not directly executable");
  assert.match(childContract, /Covers: AC-/u, "canonical child contract omits inline AC mapping");
  assert.doesNotMatch(tickets, /<local-issue-template>|<issue-template>/u, "tracker adapters must not fork the canonical child contract");
  assert.match(tickets, /Read each published Issue back.*Planning baseline.*blocking/isu);
  assert.match(tickets, /consume.*classification.*never reclassif.*Multi-Issue/isu);
  assert.doesNotMatch(tickets, /`\/execute-issue <Issue-ID>`/u);
  assert.match(tickets, /dependency-ready frontier.*`\/run-issue-workflow <Spec-ID>`/isu);
  assert.match(tickets, /does not need to know.*concurrent/isu);
  const realTrackerPublish = tickets.indexOf("- **A real issue tracker");
  const issueReadBack = tickets.indexOf("Read each published Issue back");
  assert.equal(issueReadBack > realTrackerPublish, true, "to-tickets must read back after selecting the publication mode");

  assert.match(execute, /Planning Seal.*ancestor of the execution baseline/isu);
  assert.match(execute, /seal-currency check.*not scope authority/isu);
  assert.match(execute, /never creates or repairs a Planning Seal/iu);
  assert.match(execute, /stop.*tell the human to invoke `\/to-spec` or `\/to-tickets`/isu);
  assert.match(context, /new seal commit.*only approved.*no relevant planning-artifact delta.*reuse/isu);

  const prerequisites = specDocs.match(/## Prerequisites\s+(.*?)\n## /su)?.[1] ?? "";
  assert.match(prerequisites, /setup-matt-pocock-skills/u, "to-spec docs have an empty Prerequisites section");
  assert.match(implement, /Standalone Spec.*explicit.*direct.*current branch/isu);
  assert.match(implement, /Tracker Spec.*published `\/to-spec` route/isu);
  assert.match(successorAdr, /supersedes:.*0022/iu);
  assert.match(successorAdr, /integration candidate.*push_ready/isu);
  for (const [path, content] of [
    ["skills/engineering/ask-matt/SKILL.md", matt],
    ["docs/engineering/ask-matt.md", mattDocs],
  ]) {
    assert.match(content, /to-spec.*sole.*Single-Issue.*Multi-Issue/isu, path + " duplicates or hides delivery classification");
    assert.match(content, /Single-Issue Tracker Spec.*`\/run-issue-workflow`.*Multi-Issue Tracker Spec.*`\/to-tickets`.*Standalone Spec.*`\/implement`/isu, path + " routes execution incorrectly");
  }

  for (const [path, page] of [["to-spec", specDocs], ["to-tickets", ticketsDocs], ["ask-matt", mattDocs]]) {
    const whatItDoes = page.match(/## What it does\s+(.*?)\n## /su)?.[1] ?? "";
    const paragraphs = whatItDoes.trim().split(/\n\s*\n/u).filter(Boolean);
    assert.equal(paragraphs.length <= 2, true, `${path} docs exceed two What-it-does paragraphs`);
  }


  const fixedHeadings = new Set(["What it does", "When to reach for it", "Prerequisites", "It's working if", "Where it fits"]);
  const issueMiddleHeadings = [...ticketsDocs.matchAll(/^## (.+)$/gmu)]
    .map((match) => match[1])
    .filter((heading) => !fixedHeadings.has(heading));
  assert.equal(issueMiddleHeadings.length <= 3, true, "to-tickets docs exceed three free-form middle sections");
  for (const path of [
    "docs/engineering/to-spec.md",
    "docs/engineering/to-tickets.md",
    "docs/engineering/execute-issue.md",
    "skills/engineering/ask-matt/SKILL.md",
    "docs/engineering/ask-matt.md",
    "README.md",
    "skills/engineering/README.md",
    "CONTEXT.md",
    "docs/adr/0022-use-issue-native-execution-and-closeout.md",
  ]) assert.match(read(path), /Planning Seal/u, `${path} omits the Planning Seal contract`);
});

test("to-spec owns minimal operation-scoped publication and Single-Issue Run handoff", () => {
  const spec = readToSpecContract();
  const metadata = read("skills/engineering/to-spec/agents/openai.yaml");
  const docs = read("docs/engineering/to-spec.md");
  const template = read("skills/engineering/to-spec/references/single-issue-template.md");
  const matt = readAskMattContract();
  const mattDocs = read("docs/engineering/ask-matt.md");
  const implement = read("skills/engineering/implement/SKILL.md");
  const implementDocs = read("docs/engineering/implement.md");

  const handoffEntry = spec.indexOf("Consume the planning lane handoff");
  const seal = spec.indexOf("Revalidate the Planning baseline and select the Planning Seal", handoffEntry);
  const checkpoint = spec.indexOf("Start or resume the Spec producer transaction", seal);
  const publication = spec.indexOf("Publish and complete the handoff", checkpoint);
  assert.equal(
    handoffEntry !== -1 && seal > handoffEntry && checkpoint > seal && publication > checkpoint,
    true,
    "to-spec must consume its lane, revalidate, checkpoint, and publish in order",
  );

  assert.match(spec, /fresh.*`to-spec@v2`.*operation identity receipt.*repository.*Spec.*approved publication.*producer.*`to-spec`.*`publication`/isu);
  assert.match(spec, /ordered stages.*`planning_seal\.read_back`.*`publication\.read_back`.*`handoff\.completed`/isu);
  assert.match(spec, /no target operational-plan.*file.*commit.*prospective `direct_target_contribution:v1`/isu);
  assert.match(spec, /existing valid incomplete.*transaction-v1.*`to-spec@v1`.*frozen.*exact resume.*no.*migrat.*rewrite/isu);
  assert.match(spec, /only one exact matching.*transaction.*resume.*first unsatisfied stage.*mismatch.*stop.*without.*duplicate.*attribut.*unrelated/isu);

  assert.match(spec, /primary mode.*`tracker\.reserve`.*read.*draft tracker identity.*version token.*retry.*revision mode.*`tracker\.read`.*existing Spec.*version token.*Bind.*tracker identity.*transaction.*publication/isu);
  assert.match(spec, /Publish only.*tracker identity.*version token.*bound.*transaction.*Primary mode.*reserved draft.*revision mode.*same existing Spec.*Neither.*replacement Spec/isu);
  assert.match(spec, /read back.*body.*classification.*Planning Seal.*target.*template.*label.*tracker identity/isu);
  assert.match(spec, /Recoverable blocker.*owning source.*observed evidence.*smallest human action.*preserved stages.*same `\/to-spec` retry/isu);

  assert.match(spec, /append.*one immutable `handoff\.completed`.*producer.*Spec.*target.*Planning Seal.*transaction identity.*publication identity.*classification.*approved-scope identity/isu);
  assert.match(spec, /Single-Issue.*only.*`\/run-issue-workflow <Spec-ID>`.*Multi-Issue.*only.*`\/to-tickets <Spec-ID>`/isu);
  assert.doesNotMatch(spec + docs + template, /\/execute-issue <Spec-ID>/u);
  assert.doesNotMatch(matt + mattDocs, /Single-Issue Tracker Spec (?:→|uses) (?:\[execute-issue|`\/execute-issue)/iu);

  assert.match(spec, /Hard gate.*wrong target.*duplicate.*misattributed publication.*durable state/isu);
  assert.match(spec, /advisory.*never block/isu);
  assert.match(metadata, /short_description:.*deterministic.*owner-derived identity/iu);
  assert.match(docs, /isolated planning lane.*operation-scoped.*`handoff\.completed`.*`\/run-issue-workflow <Spec-ID>`/isu);
  assert.match(matt, /Single-Issue Tracker Spec.*`\/run-issue-workflow <Spec-ID>`.*Multi-Issue Tracker Spec.*`\/to-tickets <Spec-ID>`/isu);
  assert.match(mattDocs, /Single-Issue Tracker Spec.*`\/run-issue-workflow`.*Multi-Issue Tracker Spec.*`\/to-tickets`/isu);
  assert.match(implement, /Tracker Spec.*published `\/to-spec` route/isu);
  assert.match(implementDocs, /Tracker Spec.*published.*to-spec.*route/isu);
  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.match(read(path), /to-spec.*isolated planning lane.*Run handoff/iu, `${path} omits the isolated to-spec route`);
  }
});

test("to-tickets consumes the completed to-spec handoff through a minimal current producer", () => {
  const tickets = readToTicketsContract();

  const upstream = tickets.indexOf("Consume the completed to-spec handoff");
  const checkpoint = tickets.indexOf("Start or resume the decomposition producer transaction", upstream);
  const publication = tickets.indexOf("Reconcile and Publish Executable Issues", checkpoint);
  assert.equal(
    upstream !== -1 && checkpoint > upstream && publication > checkpoint,
    true,
    "to-tickets must consume upstream authority and settle its current transaction before tracker publication",
  );

  assert.match(tickets, /completed `to-spec`.*handoff.*producer.*parent.*tracker identity.*target.*Planning Seal.*classification.*approved-scope identity.*publication identity/isu);
  assert.match(tickets, /read.*upstream.*owning source.*once.*never rerun.*generation.*review.*validation/isu);
  assert.match(tickets, /fresh ordinary decomposition.*`to-tickets@v2`.*owner-derived operation identity receipt.*tracker identity.*profile `v2`.*target.*baseline.*Planning Seal.*Multi-Issue.*approved-scope.*upstream publication.*handoff/isu);
  assert.match(tickets, /ordered stages.*`decomposition\.read_back`.*`ready_state\.read_back`.*`handoff\.completed`/isu);
  assert.match(tickets, /no target operational-plan.*file.*commit.*prospective `direct_target_contribution:v1`/isu);
  assert.match(tickets, /existing valid incomplete.*transaction-v1.*`to-tickets@v1`.*frozen.*exact resume.*no.*migrat.*rewrite/isu);
  assert.match(tickets, /exact.*operation.*only.*unrelated operations.*same target.*neither conflict nor block/isu);
  assert.match(tickets, /target-checkout dirt.*preserved.*not transaction authority/isu);
});

test("to-tickets reconciles one Issue decomposition before tracker mutation", () => {
  const tickets = readToTicketsContract();

  assert.match(tickets, /immutable `<Spec-ID>\/<NN>` Decomposition key.*titles are never identity/isu);
  const discovery = tickets.indexOf("Discover every tracker-supported identity source");
  const mutation = tickets.indexOf("Publish missing children");
  assert.equal(discovery !== -1 && mutation > discovery, true, "identity discovery must finish before publication mutation");
  assert.match(tickets, /## 5\. Reconcile and Publish Executable Issues/u);
  assert.match(tickets, /zero matches.*create exactly one.*one matching Issue.*reuse.*more than one.*stop without mutation/isu);
  assert.match(tickets, /body.*parent.*target.*Planning Seal.*executable contract.*native parent.*blocking relation.*all.*agree/isu);
  assert.match(tickets, /conflict.*stop without mutation.*never automatically repair/isu);
  assert.match(tickets, /owned blocker graph.*acyclic.*before any mutation/isu);
  assert.match(tickets, /External blocker.*readable.*never creates, edits, closes, or assumes ownership/isu);
  assert.match(tickets, /one canonical child contract.*Local tracker.*real issue tracker.*native parent.*blocking/isu);
  assert.match(tickets, /native relationship write or read-back failure.*bind.*exact child identity.*Decomposition key.*expected absent relationship.*failed read-back/isu);
  assert.match(tickets, /prior partial-publication state.*exact child.*key.*expected relation.*Complete.*only an absent native relationship.*conflicting relation.*stops without mutation/isu);
});


test("to-tickets keeps GitLab blocker representation portable and fail-closed", () => {
  const tickets = readToTicketsContract();
  const interfaces = read("skills/engineering/to-tickets/references/decomposition-publication-interfaces.md");
  const gitlab = read("skills/engineering/setup-matt-pocock-skills/issue-tracker-gitlab.md");
  const docs = read("docs/engineering/to-tickets.md");
  const childContract = tickets.match(/<child-contract>(.*?)<\/child-contract>/su)?.[1] ?? "";

  assert.match(gitlab, /^Blocking representation: body$/mu);
  assert.match(gitlab, /new GitLab tracker configuration.*`Blocking representation: body`.*without.*setup question.*mutation probe/isu);
  assert.match(gitlab, /existing GitLab configuration.*without this field.*`UNKNOWN`.*before child.*relation.*label.*parent-record mutation.*explicit `body` or `native` repair/isu);
  assert.match(gitlab, /generic HTTP 400.*never changes.*declared-native.*Recoverable blocker/isu);
  assert.match(interfaces, /discoverChildren.*`blockingRepresentation`.*exactly `body` or `native`.*missing.*`UNKNOWN`/isu);
  assert.match(interfaces, /publishChild.*canonical `## Blocked by`.*publishRelation.*native parent.*blocking relation in `native` representation.*never.*body-mode blocker publisher/isu);
  assert.match(interfaces, /Ordinary child read-back.*canonical body blocker edges.*stable tracker-identity order.*`native`.*native blocking relation evidence/isu);
  assert.match(tickets, /canonical child body.*`## Blocked by`.*`body` or `native`.*`blocked` label.*`relates_to`.*`ready-for-agent`.*published logical graph/isu);
  assert.match(childContract, /Render one stable Issue reference per bullet in canonical tracker-identity order.*With no blocker, render exactly:\s+None\./isu);
  assert.match(tickets, /newly configured `body` representation.*only before `decomposition\.read_back`.*prior partial native failure.*child identity.*Decomposition key.*canonical body.*expected logical blocker edge.*no conflicting native relation.*no `decomposition:v1` record/isu);
  assert.match(tickets, /Completed-stage adoption.*missing bound evidence.*body or edge mismatch.*conflicting native relation.*parent-record evidence.*stops without repair or duplicate mutation/isu);
  assert.match(tickets, /`body` representation.*no native blocking relation.*`native` representation.*native blocking relation/isu);
  assert.match(tickets, /canonical body edges and `decomposition:v1`.*complete directed graph.*both representations.*native evidence.*additional only in `native`/isu);
  assert.doesNotMatch(interfaces, /publishBlocker|readBlockingRepresentation|writeBlockerRepresentation/u);
  assert.doesNotMatch(tickets, /new checkpoint stage|producer profile|Run-coordinator compatibility branch/iu);
  assert.match(docs, /GitLab.*`Blocking representation: body`.*canonical `## Blocked by`/isu);
  assert.match(docs, /\| `body` \|.*no native blocking relation/iu);
  assert.match(docs, /\| `native` \|.*native mode verifies/iu);
  assert.match(docs, /\| Missing setting \|.*`UNKNOWN`.*explicit repair.*HTTP 400.*never picks a mode.*\| Prior partial native failure \|.*Verified recovery.*configured body.*evidence is consistent.*publication fails closed/isu);
});

test("to-tickets publishes one recoverable decomposition record and the exact ready frontier", () => {
  const tickets = readToTicketsContract();

  const allEvidence = tickets.indexOf("After every expected child and blocker edge passes read-back");
  const recordPublication = tickets.indexOf("Reconcile the parent publication record");
  assert.equal(allEvidence !== -1 && recordPublication > allEvidence, true, "the parent record must follow complete child and edge read-back");
  assert.match(tickets, /decomposition:v1.*parent.*Planning Seal.*target.*key-to-Issue mapping.*blocker edges/isu);
  assert.match(tickets, /no current record.*write exactly one.*one matching record.*reuse.*conflicting or multiple records.*stop without mutation/isu);
  assert.match(tickets, /record.*completeness.*never.*child identity/isu);
  assert.match(tickets, /failure before or during record publication.*recoverable partial publication by key.*fresh.*retry.*exact consumed Planning Seal.*frozen legacy.*profile-v1.*existing bound successor.*never.*cross.*operation/isu);
  assert.match(tickets, /bootstrap rerun.*reuse.*matching children.*publish only the missing parent record/isu);
  assert.match(tickets, /open child.*every owned and External blocker.*closed.*dependency-ready frontier/isu);
  assert.match(tickets, /blocked or closed children.*no ready label/isu);
  assert.match(tickets, /remove a stale ready label from every open blocked or closed child/iu);
  assert.match(tickets, /read.*record back.*before.*ready-for-agent/isu);
  assert.doesNotMatch(tickets, /`\/execute-issue <Issue-ID>`/u);
  assert.match(tickets, /never schedules.*tasks.*Codex.*Orca.*titles.*inferred blockers.*global queue/isu);
});

test("to-tickets appends one composite handoff and routes only the parent Run", () => {
  const tickets = readToTicketsContract();

  const recordReadBack = tickets.indexOf("Read the written or reused record back once");
  const readyReadBack = tickets.indexOf("Read every resulting child ready state back once", recordReadBack);
  const finalHandoff = tickets.indexOf("Append the composite Run handoff", readyReadBack);
  assert.equal(
    recordReadBack !== -1 && readyReadBack > recordReadBack && finalHandoff > readyReadBack,
    true,
    "the composite handoff must follow decomposition and ready-state read-back",
  );

  assert.match(tickets, /append or reuse.*one.*`handoff\.completed`.*upstream publication.*upstream handoff.*current operation.*receipt.*decomposition.*comment identity.*SHA-256.*body digest.*parent.*target.*Planning Seal.*mapping.*blocker edges.*Multi-Issue classification.*approved-scope identity/isu);
  assert.match(tickets, /no current matching handoff.*append exactly one.*one exact matching handoff.*reuse.*conflicting or multiple.*stop without mutation/isu);
  assert.match(tickets, /dependency-ready frontier.*without.*child `\/execute-issue` command.*end.*exactly `\/run-issue-workflow <Spec-ID>`/isu);
  assert.doesNotMatch(tickets, /`\/execute-issue <Issue-ID>`/u);
  assert.match(tickets, /transaction.*upstream publication.*upstream handoff.*child.*relation.*decomposition record.*label.*final handoff.*target.*scope.*identity failure.*exact partial state.*stop.*without rollback.*duplication.*scheduling.*task creation.*Run start.*implementation.*closeout.*push.*deploy/isu);
});

test("re-entrant to-tickets behavior stays synchronized across promoted surfaces", () => {
  const skill = readToTicketsContract();
  const docs = read("docs/engineering/to-tickets.md");
  const metadata = read("skills/engineering/to-tickets/agents/openai.yaml");
  const router = readAskMattContract();
  const routerDocs = read("docs/engineering/ask-matt.md");

  assert.match(skill, /^description: Consume one Multi-Issue Spec handoff.*minimal.*composite Run handoff\.$/mu);
  assert.match(metadata, /short_description: "Publish a deterministic composite Run handoff"/u);
  assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(docs, /completed `to-spec` handoff.*minimal operation-scoped transaction.*Decomposition key.*Decomposition publication record.*composite `handoff\.completed`.*`\/run-issue-workflow <Spec-ID>`/isu);
  assert.doesNotMatch(docs, /zero matches|one exact match|Publish missing children/iu);
  assert.doesNotMatch(skill + docs, /`\/execute-issue <Issue-ID>`/u);
  assert.match(router, /Multi-Issue Tracker Spec.*to-tickets.*completed `to-spec` handoff.*minimal.*transaction.*Decomposition publication record.*composite.*`\/run-issue-workflow <Spec-ID>`/isu);
  assert.match(routerDocs, /Multi-Issue Tracker Spec.*to-tickets.*completed `to-spec` handoff.*minimal.*transaction.*Decomposition publication record.*composite.*`\/run-issue-workflow`/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    const entry = read(path).match(/^- \*\*\[to-tickets\][^\n]*/mu)?.[0] ?? "";
    assert.match(entry, /minimal.*Decomposition publication record.*composite Run handoff/iu, `${path} has a stale to-tickets description`);
  }
});


test("pre-execute-issue owns the content-bound Prerequisite candidate and Operator SQL handoff", () => {
  const preExecute = read("skills/engineering/pre-execute-issue/SKILL.md");
  const preExecuteMetadata = read("skills/engineering/pre-execute-issue/agents/openai.yaml");
  const preExecuteDocs = read("docs/engineering/pre-execute-issue.md");
  const matt = readAskMattContract();
  const mattDocs = read("docs/engineering/ask-matt.md");

  assert.doesNotMatch(preExecute, /^disable-model-invocation:/mu);
  assert.doesNotMatch(preExecuteMetadata, /^policy:/mu);
  assert.match(preExecute, /^description:.*Use when.*directly.*active `execute-issue` lane/mu);
  assert.match(preExecuteDocs, /Type `\/pre-execute-issue <Issue-ID>`, or the planning producer or `execute-issue` automatically reaches it from an active authorized lane.*exact unresolved Manual prerequisite/iu);
  assert.match(preExecuteMetadata, /exact declared prerequisite.*content-bound.*`APPLIED` or `NO_OP`/isu);

  assert.match(preExecute, /direct `\/pre-execute-issue <Issue-ID>`.*active `execute-issue` handoff/isu);
  assert.match(preExecute, /Issue or linked Spec.*exact.*declared.*repository-relative artifact.*unchanged-scope late discovery/isu);
  assert.match(preExecute, /No declaration.*skip.*arbitrary `\.sql`.*never trigger/isu);
  assert.match(preExecute, /missing.*multiple.*ambiguous.*contradictory.*stop.*without.*worktree.*tracker/isu);

  assert.match(preExecute, /recorded Issue target.*unique Issue topic branch.*Issue worktree/isu);
  assert.match(preExecute, /create or reuse.*dirty.*mismatched.*ambiguous.*stop.*without cleanup.*unrelated/isu);
  assert.match(preExecute, /On retry.*existing `manual_prerequisite_complete:v2`.*candidate.*blob.*outcome.*worktree.*branch.*ancestry.*reuse.*never prepare or present/isu);
  assert.match(preExecute, /matching clean valid.*Prerequisite candidate.*full candidate commit.*Git blob.*repository-relative path.*validation.*Standards.*Spec/isu);
  assert.match(preExecute, /otherwise.*`prepare-prerequisite-artifact`.*matching.*candidate.*blob.*path.*validation.*clean review/isu);
  assert.match(preExecute, /present.*committed.*Operator SQL.*human.*never execute.*connect.*database.*recovery.*cleanup.*retry/isu);

  assert.match(preExecute, /exactly `APPLIED` or `NO_OP`.*generic success.*one focused.*clarification/isu);
  assert.match(preExecute, /manual_prerequisite_complete:v2.*issue:.*candidate:.*blob:.*artifact:.*outcome:/isu);
  assert.match(preExecute, /same Issue.*candidate.*blob.*normalized artifact path.*outcome.*reuse.*without writing a duplicate/isu);
  assert.match(preExecute, /legacy.*manual_prerequisite_complete:v1.*readable.*cannot authorize.*newly generated/isu);
  assert.match(preExecute, /error.*SQL failure.*missing.*other value.*no attestation.*no.*resume.*no.*retry/isu);
  assert.match(preExecute, /Tracker write or read-back failure.*unresolved persistence.*never claim/isu);

  assert.match(preExecute, /direct invocation.*stop.*after.*attestation.*no implementation authority/isu);
  assert.match(preExecute, /active.*same.*execution lane.*fresh.*Issue.*target.*artifact.*candidate.*blob.*branch.*worktree.*ancestry/isu);
  assert.match(preExecute, /never.*integrate.*close.*push.*deploy.*broaden.*external cleanup/isu);

  for (const path of [
    "docs/engineering/pre-execute-issue.md",
    "docs/engineering/ask-matt.md",
  ]) assert.doesNotMatch(read(path), /\]\((?:\.\/|\.\.\/)/u, `${path} has a relative published link`);

  assert.match(preExecuteDocs, /## What it does.*## When to reach for it.*## Prerequisites.*## Where it fits/isu);
  assert.match(preExecuteDocs, /exact declared prerequisite.*Prerequisite candidate.*Operator SQL.*`APPLIED`.*`NO_OP`/isu);
  assert.match(preExecuteDocs, /direct.*stops.*active.*same.*execution lane/isu);
  assert.match(matt, /published.*Issue.*`execute-issue` automatically invokes `pre-execute-issue`.*prepare.*Operator SQL.*content-bound.*Direct `\/pre-execute-issue <Issue-ID>`/isu);
  assert.match(matt, /same authorized lane.*Direct.*stops/isu);
  assert.match(mattDocs, /pre-execute-issue.*declared.*prerequisite.*attestation.*prepare.*Operator SQL.*content-bound/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    const readme = read(path);
    const modelHeading = path === "README.md" ? "\n**Model-invoked**\n" : "\n## Model-invoked\n";
    assert.match(readme.slice(readme.indexOf(modelHeading)), /pre-execute-issue.*prepare.*attest.*prerequisite/iu);
  }
});


test("execute-issue routes exact prerequisites and preserves content-bound attestations", () => {
  const execute = readExecuteIssueContract();
  const executeDocs = read("docs/engineering/execute-issue.md");
  const preExecuteDocs = read("docs/engineering/pre-execute-issue.md");
  const close = [
    read("skills/engineering/close-issue/SKILL.md"),
    read("skills/engineering/close-issue/references/completion-evidence.md"),
  ].join("\n");
  const closeDocs = read("docs/engineering/close-issue.md");
  const verify = readVerifyTargetContract();
  const verifyDocs = read("docs/engineering/verify-target-before-push.md");
  const router = readAskMattContract();
  const routerDocs = read("docs/engineering/ask-matt.md");
  const context = read("CONTEXT.md");

  assert.match(execute, /No declared Manual prerequisite preserves ordinary Issue execution/iu);
  assert.match(execute, /one exact declared artifact.*(?:without|has no).*matching valid attestation.*invoke.*model-invoked `pre-execute-issue`.*same.*direct-human or DAG-authorized lane/isu);
  assert.match(execute, /arbitrary `\.sql` files.*repository scanning.*never trigger/isu);
  assert.match(execute, /missing.*multiple.*ambiguous.*conflicting.*changed-scope declarations.*stop/isu);
  assert.doesNotMatch(execute, /give the exact command `\/pre-execute-issue <Issue-ID> <artifact-path>`/iu);

  assert.match(execute, /manual_prerequisite_complete:v2.*tracker-native.*identity.*Issue.*candidate.*Git blob.*artifact/isu);
  assert.match(execute, /manual_prerequisite_complete:v2.*`APPLIED`.*`NO_OP`.*outcome/isu);
  assert.match(execute, /legacy.*manual_prerequisite_complete:v1.*only.*legacy non-generated artifact.*cannot authorize.*generated/isu);
  assert.match(execute, /reuse.*same Issue topic branch and worktree.*Prerequisite candidate.*ancestor.*final implementation candidate/isu);
  assert.match(execute, /fresh.*Issue.*Spec.*target.*Planning Seal.*candidate.*blob.*branch.*worktree.*blocker.*scope.*ancestry.*Return only.*original lane/isu);
  assert.match(execute, /completion-time.*re-read every consumed Manual.*attestation.*tracker-native immutable identity.*Issue.*outcome.*v2.*Prerequisite candidate.*blob.*artifact.*ancestor.*v1.*exact legacy non-generated artifact path.*read back unchanged/isu);

  assert.match(execute, /Late prerequisite discovery.*coherent checkpoint commits.*behavior.*Acceptance Criteria.*target.*exclusions.*schema outcome.*ownership.*unchanged.*automatically invoke.*`pre-execute-issue`/isu);
  assert.match(execute, /Scope change.*`\/to-spec` or `\/to-tickets`.*without artifact preparation.*silent expansion/isu);
  assert.doesNotMatch(execute, /Late prerequisite discovery.*record\/read back `implementation_blocked`.*instruct the human/isu);

  assert.match(execute, /`manualAttestations`.*tracker-native.*identity.*Issue.*candidate.*blob.*artifact.*outcome.*explicit empty list/isu);
  for (const consumer of [close, verify]) {
    assert.match(consumer, /`manualAttestations`.*v2.*tracker-native.*identity.*Issue.*candidate.*blob.*artifact.*outcome.*Prerequisite candidate.*ancestor/isu);
    assert.match(consumer, /v1.*legacy non-generated artifact.*generated.*stop/isu);
  }

  assert.match(execute, /exact.*prerequisite.*same.*lane/isu);
  assert.match(executeDocs, /automatically.*pre-execute-issue.*same.*lane.*content-bound.*candidate.*blob.*outcome/isu);
  assert.match(preExecuteDocs, /execute-issue.*automatically.*one exact unresolved Manual prerequisite/isu);
  assert.match(plainMarkdown(preExecuteDocs), /Issue or linked Spec.*exact.*artifact.*unchanged-scope late-discovery handoff/isu);
  assert.match(router, /execute-issue.*automatically.*pre-execute-issue.*one exact.*attestation/isu);
  assert.match(routerDocs, /execute-issue.*automatically.*pre-execute-issue.*one exact.*attestation/isu);
  assert.match(closeDocs, /content-bound.*manual attestation.*candidate.*blob.*outcome.*ancestry/isu);
  assert.match(verifyDocs, /content-bound.*manual attestation.*candidate.*blob.*outcome.*ancestry/isu);
  assert.doesNotMatch(context, /`pre-execute-issue` never creates or reuses an \*\*Issue worktree\*\*/u);
  assert.doesNotMatch(context, /human may invoke `\/pre-execute-issue <Issue-ID> <artifact-path>`/u);
  assert.match(context, /`execute-issue` automatically invokes `pre-execute-issue`.*same authorized lane/isu);
});


test("prepare-prerequisite-artifact enforces prerequisite adapter Operator SQL and repair wave contracts", () => {
  const name = "prepare-prerequisite-artifact";
  const skill = read(`skills/engineering/${name}/SKILL.md`);
  const metadata = read(`skills/engineering/${name}/agents/openai.yaml`);
  const docs = read(`docs/engineering/${name}.md`);
  const router = readAskMattContract();
  const routerDocs = read("docs/engineering/ask-matt.md");

  assert.doesNotMatch(skill, /^disable-model-invocation:/mu);
  assert.doesNotMatch(metadata, /^policy:/mu);
  assert.match(skill, /^description:.*Use when.*prerequisite-preparation handoff/mu);
  assert.match(metadata, /model-invoked.*exact prerequisite.*Operator SQL/isu);
  assert.match(plainMarkdown(docs), /Type `\/prepare-prerequisite-artifact`, or the agent reaches for it automatically.*active prerequisite-preparation handoff/isu);

  assert.match(skill, /active prerequisite-preparation handoff.*exact Issue.*Issue target branch.*Issue worktree.*approved scope.*repository-relative artifact/isu);
  assert.match(skill, /unchanged.*Issue.*target.*worktree.*scope.*artifact.*before every material edit.*before (?:the )?candidate commit/isu);
  assert.match(skill, /repository-owned adapter.*not a skill.*not a human command/isu);
  assert.match(skill, /read-only `discover`.*artifact-writing `prepare`.*read-only `validate`/isu);
  assert.match(skill, /database product.*version.*target environment.*authoritative inputs.*diagnostics.*pass conditions/isu);
  assert.match(skill, /missing.*broken.*incomplete.*ambiguous.*contradictory.*stop.*without.*runtime setup.*infrastructure.*dialect guessing/isu);
  assert.match(skill, /only.*exact declared artifact.*created or repaired.*pre-existing unrelated.*staged.*unstaged.*untracked.*preserv/isu);

  assert.match(skill, /exactly three ordered sections.*preflight.*persistent exact backup.*authorized mutation.*postconditions/isu);
  assert.match(skill, /absent backup.*pre-mutation state.*first.*backup.*mutation.*integrity-valid existing backup.*complete postconditions.*`NO_OP`.*partial.*contradictory.*unproved.*abort/isu);
  assert.match(skill, /database-native fail-closed assertions.*diagnostic `SELECT`.*supplemental.*not.*operator-judgment/isu);
  assert.match(skill, /revalidate.*lock.*immediately before mutation.*explicit transaction.*commit.*postcondition.*error.*rolls back.*retaining.*backup/isu);
  assert.match(skill, /recovery statements.*commented.*inert.*UPDATE or DELETE.*exact backed-up rows.*INSERT.*stable keys.*DDL or transformation.*stops/isu);
  assert.match(skill, /exactly one terminal outcome.*`APPLIED`.*`NO_OP`.*missing.*other value.*unsuccessful/isu);
  assert.match(skill, /never deletes or overwrites.*backup.*no cleanup SQL/isu);
  assert.match(skill, /same logical backup name.*separately authorized new operation.*only after human cleanup.*fresh pre-mutation proof/isu);

  assert.match(skill, /after every material artifact edit.*`validate`.*independent Standards.*Spec review/isu);
  assert.match(skill, /share one maximum of ten material repair waves.*deterministic failure.*Confirmed code review finding/isu);
  assert.match(skill, /Code review advisories.*visible.*non-blocking.*tool failures.*no artifact edit.*do not consume.*wave/isu);
  assert.match(skill, /wave ten.*fail.*stop.*without.*ready/isu);

  assert.match(skill, /clean committed.*Prerequisite candidate.*full candidate commit.*Git blob.*repository-relative path/isu);
  assert.match(skill, /blob.*bind.*content.*without.*duplicate SHA-256/isu);
  assert.match(skill, /never execute SQL.*connect to or mutate.*database.*attest.*outcome.*run recovery.*cleanup.*integrate.*close.*push.*deploy.*tracker/isu);
  assert.match(skill, /consumer adapter.*product-specific SQL.*outside/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    const readme = read(path);
    const modelHeading = path === "README.md" ? "\n**Model-invoked**\n" : "\n## Model-invoked\n";
    assert.match(readme.slice(readme.indexOf(modelHeading)), /prepare-prerequisite-artifact.*Operator SQL/iu);
  }
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  assert.equal(plugin.skills.includes("./skills/engineering/prepare-prerequisite-artifact"), true);
  assert.match(router, /prepare-prerequisite-artifact.*model-invoked.*not a public route.*active prerequisite-preparation handoff/isu);
  assert.match(plainMarkdown(routerDocs), /prepare-prerequisite-artifact.*model-invoked.*not a public starting route.*Operator SQL/isu);
  assert.doesNotMatch(docs, /\]\((?:\.\/|\.\.\/)/u);
  assert.match(docs, /## What it does/u);
  assert.match(docs, /## When to reach for it/u);
  assert.match(docs, /## Where it fits/u);
});


test("direct target contribution attestation is exact, minimal, and model-invoked", () => {
  const name = "attest-target-contribution";
  const skill = read(`skills/engineering/${name}/SKILL.md`);
  const metadata = read(`skills/engineering/${name}/agents/openai.yaml`);
  const docs = read(`docs/engineering/${name}.md`);

  assert.doesNotMatch(skill, /^disable-model-invocation:/mu);
  assert.doesNotMatch(metadata, /^policy:/mu);
  assert.match(skill, /^description:.*Use when/mu);
  assert.match(skill, /^description:.*Use when \/verify-target-before-push/mu);
  assert.match(skill, /active `\/verify-target-before-push` recovery/iu);
  assert.match(metadata, /handed off by \/verify-target-before-push/iu);
  assert.match(plainMarkdown(docs), /agent reaches for it automatically/iu);
  assert.match(docs, /## Prerequisites.*configured Issue tracker.*active.*verify-target-before-push.*exact packet.*complete draft.*human.*confirmed/isu);
  assert.match(skill, /exact confirmed recovery packet.*owner.*target.*classification.*full commit SHAs.*per-commit purposes.*complete tracker comment draft/isu);
  assert.match(skill, /before mutation.*owner.*target.*commit.*diff.*eligibility.*ref drift.*stops without writing/isu);
  assert.match(skill, /explicit human-directed.*non-product workflow or governance maintenance.*outside an Executable Issue by design/isu);
  assert.match(skill, /active skill behavior.*runtime or source.*tests.*configuration.*dependencies.*migrations.*security.*data.*public APIs.*mixed commit.*partial-path.*ineligible/isu);
  assert.match(skill, /same owner, target, and classification.*one `direct_target_contribution:v1`/isu);
  assert.match(skill, /reuse.*exact matching record.*without.*duplicate/isu);
  assert.match(skill, /malformed.*duplicate.*conflicting.*mismatched.*unavailable.*partially written.*stops/isu);
  assert.match(skill, /direct_target_contribution:v1\s+owner: <Tracker Spec or Issue ID>\s+target: <Issue target branch>\s+classification: non-product-workflow-governance-maintenance\s+contributions:\s+- commit: <full SHA>\s+purpose: <human-confirmed purpose>\s+attested_by: human\s+statement: authorized for target-range coverage only/isu);
  assert.match(skill, /record contains only.*owner.*target.*classification.*contributions.*commit.*purpose.*attested_by.*statement/isu);
  assert.match(skill, /Tracker.*author.*timestamp.*tracker-owned/isu);
  assert.match(skill, /`B`.*`V`.*paths.*diff hashes.*review.*test results.*push readiness.*absent/isu);
  assert.match(skill, /append.*exact read-back/isu);
  assert.match(skill, /never.*Issue state.*labels.*Git.*product.*push.*remote-merge.*deploy/isu);
});


test("prospective checkpoint attestation is frozen-profile-only and preserves recovery", () => {
  const name = "attest-target-contribution";
  const skill = read(`skills/engineering/${name}/SKILL.md`);
  const metadata = read(`skills/engineering/${name}/agents/openai.yaml`);
  const docs = read(`docs/engineering/${name}.md`);
  const matt = readAskMattContract();
  const mattDocs = read("docs/engineering/ask-matt.md");

  assert.match(skill, /two exact caller routes.*confirmation-gated recovery.*producer-owned prospective/isu);
  assert.match(skill, /recovery.*active `\/verify-target-before-push`.*exact confirmed recovery packet.*human confirmed/isu);
  assert.match(skill, /prospective.*currently active.*explicitly human-invoked.*frozen transaction-v1.*`to-spec@v1`.*`to-tickets@v1`.*producer.*owner Spec.*target.*transaction identity.*checkpoint commit.*plan purpose.*baseline.*read-back expectations/isu);
  assert.match(skill, /Fresh `to-spec@v2` and `to-tickets@v2`.*no checkpoint-commit.*prospective-attestation stage/isu);
  assert.match(skill, /manual helper.*stale invocation.*inferred plan.*downstream Run.*cross-route substitution.*stops without writing/isu);
  assert.match(skill, /prospective.*no second human confirmation/isu);

  assert.match(skill, /resolve.*owner.*frozen target refs.*matching.*Workflow checkpoint transaction.*checkpoint stage.*whole commit/isu);
  assert.match(skill, /commit contains only.*exact generated Workflow plan checkpoint.*owned by.*transaction/isu);
  assert.match(skill, /modified content.*mixed commits.*active skill behavior.*runtime or source.*tests.*configuration.*dependencies.*unrelated paths.*ambiguous ownership.*missing ancestry.*identity drift.*ineligible/isu);
  assert.match(skill, /common.*owner.*target.*commit.*ancestry.*whole-diff.*ordered-history.*exact-reuse.*overlap.*read-back/isu);

  assert.match(skill, /exact matching record.*reuse.*immutable tracker identity/isu);
  assert.match(skill, /more than one.*same owner.*immutable disjoint.*checkpoint commit sets/isu);
  assert.match(skill, /duplicate commit membership.*partial overlap.*conflicting purpose.*mixed recovery.*prospective grouping.*malformed or edited history.*multiple plausible records.*unavailable history.*partial persistence.*stops/isu);
  assert.match(skill, /same existing `direct_target_contribution:v1`.*classification.*`attested_by: human`.*target-range-only/isu);
  assert.match(skill, /return.*exact reused or appended.*immutable tracker identity.*active caller/isu);
  assert.match(skill, /never creates commits or transactions.*resumes a producer.*publishes a Spec or decomposition.*starts Run/isu);

  assert.match(metadata, /human-confirmed coverage recovery.*prospective Workflow plan checkpoint.*frozen legacy\/profile-v1.*to-spec.*to-tickets.*fresh profile-v2 producers.*no such route.*no second confirmation/isu);
  assert.match(docs, /two caller routes.*confirmation-gated recovery.*producer-owned prospective checkpoint/isu);
  assert.match(docs, /standalone invocation.*stops/iu);
  assert.match(matt, /Fresh `to-spec` and `to-tickets`.*no target operational-plan checkpoint.*prospective contribution record.*frozen legacy and profile-v1.*attest-target-contribution/isu);
  assert.match(mattDocs, /Fresh `to-spec` and `to-tickets`.*no target operational-plan checkpoint.*prospective contribution record.*frozen legacy and profile-v1.*attest-target-contribution/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.match(read(path), /attest-target-contribution.*recovery.*frozen.*prospective.*workflow plan checkpoint/iu);
  }
});


test("record-closed-issue-reconciliation is exact, immutable, and model-invoked", () => {
  const name = "record-closed-issue-reconciliation";
  const skill = read(`skills/engineering/${name}/SKILL.md`);
  const metadata = read(`skills/engineering/${name}/agents/openai.yaml`);
  const docs = read(`docs/engineering/${name}.md`);

  assert.doesNotMatch(skill, /^disable-model-invocation:/mu);
  assert.doesNotMatch(metadata, /^policy:/mu);
  assert.match(skill, /^description:.*Use when \/verify-target-before-push/mu);
  assert.match(skill, /active `\/verify-target-before-push` recovery.*exact human-confirmed packet/isu);
  assert.match(metadata, /handed off by \/verify-target-before-push.*exact human confirmation/isu);
  assert.match(plainMarkdown(docs), /agent reaches for it automatically/iu);
  assert.match(docs, /## Prerequisites.*configured Issue tracker.*active.*verify-target-before-push.*complete.*draft.*human.*confirmed/isu);

  assert.match(skill, /confirmed packet.*affected Issue.*completion-note identity.*Issue target branch.*execution baseline.*candidate.*diagnostic fingerprint.*remedy Issue.*completion-note identity.*candidate.*complete tracker comment draft/isu);
  assert.match(skill, /affected Issue.*closed.*sole immutable completion note.*otherwise valid.*exactly one non-passing command.*candidate.*reachable from.*target.*not reachable from.*baseline.*worktree.*absent/isu);
  assert.match(skill, /diagnostic fingerprint.*command.*exit code.*failure count.*ordered failure identities.*source locators.*assertion or error identities/isu);
  assert.match(skill, /clean temporary worktrees.*exact affected baseline.*candidate.*identical.*fingerprint.*no additional candidate failure/isu);
  assert.match(skill, /exactly one closed remedy Issue.*explicitly own.*complete correction.*valid passing completion.*candidate.*reachable.*same.*target/isu);
  assert.match(skill, /before mutation.*affected.*remedy.*completion.*target.*refs.*diagnostics.*drift.*stops without writing/isu);

  assert.match(skill, /reuse one exact matching.*closed_issue_evidence_reconciliation:v1.*without.*duplicate/isu);
  assert.match(skill, /append.*affected closed Issue.*read.*back once/isu);
  assert.match(skill, /malformed.*duplicate.*edited.*conflicting.*drifting.*unavailable.*partial.*ambiguous.*stops/isu);
  assert.match(skill, /closed_issue_evidence_reconciliation:v1\s+affected:\s+issue: <affected Issue ID>\s+completion: <immutable completion-note identity>\s+target: <Issue target branch>\s+baseline: <full execution baseline SHA>\s+candidate: <full affected candidate SHA>\s+diagnostic:\s+command: <exact failed command>\s+exit_code: <non-zero integer>\s+failure_count: 1\s+failures:\s+- identity: <failure identity>\s+source: <source locator>\s+error: <assertion or error identity>\s+remedy:\s+issue: <remedy Issue ID>\s+completion: <immutable completion-note identity>\s+candidate: <full remedy candidate SHA>\s+authorized_by: human\s+statement: authorized for exact-target verification only/isu);
  assert.match(skill, /record contains only.*affected.*diagnostic.*remedy.*authorized_by.*statement/isu);
  assert.match(skill, /aggregate.*`B`.*`V`.*current verification results.*push readiness.*full logs.*output hashes.*worktree paths.*absent/isu);
  assert.match(skill, /never.*edit.*delete.*tracker history.*reopen.*attest-target-contribution.*implementation_complete.*review.*verification.*readiness.*push.*deploy/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.match(read(path), /record-closed-issue-reconciliation.*immutable.*closed Issue.*evidence/iu);
  }
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  assert.equal(plugin.skills.includes("./skills/engineering/record-closed-issue-reconciliation"), true);
  assert.doesNotMatch(docs, /\]\((?:\.\/|\.\.\/)/u);
  assert.match(docs, /## What it does/u);
  assert.match(docs, /## When to reach for it/u);
  assert.match(docs, /## Where it fits/u);
});


test("closed Issue evidence reconciliation is narrow and restarts fresh target verification", () => {
  const verify = readVerifyTargetContract();
  const verifyMetadata = read("skills/engineering/verify-target-before-push/agents/openai.yaml");
  const verifyDocs = read("docs/engineering/verify-target-before-push.md");
  const matt = readAskMattContract();
  const mattDocs = read("docs/engineering/ask-matt.md");

  assert.match(verify, /after.*freeze.*member.*before.*ordinary completion-evidence rejection.*one.*closed affected Issue/isu);
  assert.match(verify, /sole immutable completion note.*otherwise valid.*exactly one non-passing command.*candidate.*reachable.*`V`.*not reachable.*`B`.*worktree.*absent/isu);
  assert.match(verify, /later valid completion.*invalidating evidence.*open Issue.*registered worktree.*coverage.*review.*additional historical failure.*ineligible/isu);
  assert.match(verify, /clean temporary worktrees.*exact.*baseline.*candidate.*command.*exit code.*failure count.*ordered failure identities.*source locators.*assertion or error identities/isu);
  assert.match(verify, /identical diagnostic fingerprint.*no additional candidate failure/isu);
  assert.match(verify, /exactly one closed remedy Issue.*explicitly own.*complete correction.*valid passing completion.*both candidates.*reachable.*`V`/isu);
  assert.match(verify, /original.*completion notes.*Issue states.*immutable/isu);
  assert.match(verify, /`closed_issue_evidence_reconciliation:v1`.*reuse one exact matching.*without.*duplicate/isu);
  assert.match(verify, /present.*complete reconciliation packet.*complete tracker comment draft.*human confirms that exact packet once/isu);
  assert.match(verify, /call the Skill tool with `record-closed-issue-reconciliation`.*without.*manual slash command/isu);
  assert.match(verify, /exact.*read-back.*discard.*stopped gate.*fresh.*Entry.*re-freeze/isu);
  assert.match(verify, /reconciliation record.*affected.*remedy.*candidates.*reachable.*exact diagnostic.*current target/isu);
  assert.match(verify, /collect.*every exact command.*deduplicate.*repository-required full suite.*duplicate.*run.*once/isu);
  assert.match(verify, /local-ahead.*push_ready.*already-pushed.*read-only/isu);
  assert.match(verify, /malformed.*duplicate.*edited.*conflicting.*drifting.*unavailable.*partial.*ambiguous.*stops without writing/isu);
  assert.match(verify, /reconciliation.*never.*reopen.*edit.*completion.*attest-target-contribution.*readiness/isu);

  assert.match(verifyMetadata, /closed Issue evidence reconciliation.*exact human confirmation.*fresh.*Entry/isu);
  assert.match(verifyDocs, /Closed Issue evidence reconciliation.*one historical.*complete.*draft.*exact human confirmation.*fresh.*Entry/isu);
  assert.match(verifyDocs, /both.*candidate.*reachable.*full suite.*once.*local-ahead.*already-pushed/isu);
  assert.match(matt, /closed historical completion-evidence failure.*complete reconciliation.*human confirmation.*record-closed-issue-reconciliation.*fresh.*Entry/isu);
  assert.match(matt, /no separate manual.*reconciliation command/iu);
  assert.match(mattDocs, /closed historical.*complete reconciliation draft.*confirmation.*fresh.*Entry/isu);
  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.match(read(path), /verify-target-before-push.*closed-Issue.*recovery/iu);
  }

  const fingerprint = Object.freeze({
    command: "node --test --test-name-pattern=router tests/ron-workflow/skill-contracts.test.mjs",
    exitCode: 1,
    failureCount: 1,
    failures: [{ identity: "router exposes the Issue worktree flow", source: "skill-contracts.test.mjs:1168", error: "ERR_ASSERTION" }],
  });
  const affected = Object.freeze({
    state: "CLOSED",
    target: "features/ron",
    baseline: "baseline-13",
    candidate: "candidate-13",
    candidateReachableFromTarget: true,
    candidateReachableFromBaseline: false,
    worktreeRegistered: false,
    completions: [{ id: "completion-13", otherwiseValid: true, nonPassingCommands: [fingerprint] }],
    laterValidCompletion: false,
    otherInvalidatingEvidence: false,
    coverageFailure: false,
    reviewFailure: false,
  });
  const remedy = Object.freeze({
    id: "14",
    state: "CLOSED",
    target: "features/ron",
    completion: "completion-14",
    candidate: "candidate-14",
    ownsCompleteCorrection: true,
    completionPassing: true,
    candidateReachable: true,
  });

  const requireEligible = (candidate) => {
    assert.equal(candidate.state, "CLOSED", "affected Issue must be closed");
    assert.equal(candidate.completions.length, 1, "affected Issue needs one immutable completion");
    const [completion] = candidate.completions;
    assert.equal(completion.otherwiseValid, true, "completion must be otherwise valid");
    assert.equal(completion.nonPassingCommands.length, 1, "completion needs exactly one non-passing command");
    assert.equal(candidate.candidateReachableFromTarget, true, "affected candidate must be reachable from target");
    assert.equal(candidate.candidateReachableFromBaseline, false, "affected candidate must not be reachable from baseline");
    assert.equal(candidate.worktreeRegistered, false, "affected worktree must be absent");
    assert.equal(candidate.laterValidCompletion, false, "later valid completion makes reconciliation ineligible");
    assert.equal(candidate.otherInvalidatingEvidence, false, "other invalidating evidence makes reconciliation ineligible");
    assert.equal(candidate.coverageFailure, false, "coverage failure is not reconcilable");
    assert.equal(candidate.reviewFailure, false, "review failure is not reconcilable");
    return completion;
  };
  const sameFingerprint = (left, right) => assert.deepEqual(right, left, "diagnostic fingerprints must be identical");
  const requireRemedy = (candidate, remedies) => {
    assert.equal(remedies.length, 1, "exactly one remedy Issue is required");
    const [exactRemedy] = remedies;
    assert.equal(exactRemedy.state, "CLOSED", "remedy Issue must be closed");
    assert.equal(exactRemedy.target, candidate.target, "remedy must use the same target");
    assert.equal(exactRemedy.ownsCompleteCorrection, true, "remedy must own the complete correction");
    assert.equal(exactRemedy.completionPassing, true, "remedy completion must pass");
    assert.equal(exactRemedy.candidateReachable, true, "remedy candidate must be reachable");
    return exactRemedy;
  };
  const reconcile = ({ candidate = affected, baselineDiagnostic = fingerprint, candidateDiagnostic = fingerprint, remedies = [remedy], records = [], draft = "exact-draft", confirmedDraft = "exact-draft", readBack = "exact-draft" } = {}) => {
    const completion = requireEligible(candidate);
    assert.deepEqual(completion.nonPassingCommands[0], candidateDiagnostic, "candidate has an additional failure");
    sameFingerprint(baselineDiagnostic, candidateDiagnostic);
    const exactRemedy = requireRemedy(candidate, remedies);
    assert.equal(confirmedDraft, draft, "human must confirm the exact packet");
    assert.ok(records.length <= 1, "duplicate reconciliation records stop");
    if (records.length === 1) assert.equal(records[0], draft, "conflicting reconciliation record stops");
    assert.equal(readBack, draft, "exact reconciliation read-back is required");
    return { restart: "Entry", affectedCandidate: candidate.candidate, remedyCandidate: exactRemedy.candidate };
  };
  assert.deepEqual(reconcile(), { restart: "Entry", affectedCandidate: "candidate-13", remedyCandidate: "candidate-14" });
  assert.throws(() => reconcile({ candidate: { ...affected, state: "OPEN" } }), /must be closed/u);
  assert.throws(() => reconcile({ candidate: { ...affected, candidateReachableFromBaseline: true } }), /must not be reachable from baseline/u);
  assert.throws(() => reconcile({ candidate: { ...affected, laterValidCompletion: true } }), /later valid completion/u);
  assert.throws(() => reconcile({ candidate: { ...affected, worktreeRegistered: true } }), /worktree must be absent/u);
  assert.throws(() => reconcile({ candidate: { ...affected, reviewFailure: true } }), /review failure/u);
  assert.throws(() => reconcile({ candidateDiagnostic: { ...fingerprint, failureCount: 2 } }), /additional failure/u);
  assert.throws(() => reconcile({ remedies: [remedy, { ...remedy, id: "15" }] }), /exactly one remedy/u);
  assert.throws(() => reconcile({ records: ["exact-draft", "exact-draft"] }), /duplicate/u);
  assert.throws(() => reconcile({ confirmedDraft: "different" }), /exact packet/u);

  const runFreshAggregate = ({ mode, memberCommands, fullSuiteCommand }) => {
    assert.match(mode, /^(?:local-ahead|already-pushed)$/u);
    const commands = [...new Set(memberCommands.flat())];
    const focused = commands.filter((command) => command !== fullSuiteCommand);
    const executed = [...focused, fullSuiteCommand];
    assert.equal(executed.filter((command) => command === fullSuiteCommand).length, 1, "full suite runs exactly once");
    return { result: mode === "local-ahead" ? "push_ready:v1" : "range_verified:v1", focused, executed };
  };
  const memberCommands = [["test:13", "test:shared", "test:full"], ["test:14", "test:shared", "test:full"]];
  const local = runFreshAggregate({ mode: "local-ahead", memberCommands, fullSuiteCommand: "test:full" });
  assert.deepEqual(local, { result: "push_ready:v1", focused: ["test:13", "test:shared", "test:14"], executed: ["test:13", "test:shared", "test:14", "test:full"] });
  const pushed = runFreshAggregate({ mode: "already-pushed", memberCommands, fullSuiteCommand: "test:full" });
  assert.equal(pushed.result, "range_verified:v1");
});


test("historical command placeholder reconciliation is exact and fresh-entry only", () => {
  const verify = readVerifyTargetContract();
  const verifyMetadata = read("skills/engineering/verify-target-before-push/agents/openai.yaml");
  const verifyDocs = read("docs/engineering/verify-target-before-push.md");
  const helper = read("skills/engineering/record-closed-issue-reconciliation/SKILL.md");
  const helperMetadata = read("skills/engineering/record-closed-issue-reconciliation/agents/openai.yaml");
  const helperDocs = read("docs/engineering/record-closed-issue-reconciliation.md");
  const matt = readAskMattContract();
  const mattDocs = read("docs/engineering/ask-matt.md");

  assert.match(verify, /exactly one.*unambiguous.*historical placeholder.*otherwise valid.*immutable completion.*repository-required full-suite command/isu);
  assert.match(verify, /literal repository-root command.*prose.*summar(?:y|ies).*multiple placeholders.*multiple possible commands.*inferred expansions.*ineligible/isu);
  assert.match(verify, /later descendant Issue.*candidate.*descend.*affected candidate.*valid.*completion.*exact literal command.*pass/isu);
  assert.match(verify, /freshly frozen target.*same command.*pass.*coincidental current pass.*non-descendant.*different command.*unavailable.*ambiguity.*stop/isu);
  assert.match(verify, /affected.*descendant.*Issue.*completion.*candidate.*target.*ancestry.*identit/isu);
  assert.match(verify, /affected candidate.*reachable.*`V`.*not.*`B`.*descendant.*candidate.*reachable.*`V`/isu);
  assert.match(verify, /complete command representation recovery packet.*record draft.*human confirms.*exact packet/isu);
  assert.match(verify, /`closed_issue_command_representation_reconciliation:v1`.*reuse.*exact matching.*without.*duplicate/isu);
  assert.match(verify, /record read-back.*selected-range membership eligibility only.*original completion.*invalid.*not `implementation_complete`/isu);
  assert.match(verify, /discard.*stopped gate.*fresh.*Entry.*mapped literal command.*aggregate command set.*deduplicate.*full suite.*once/isu);
  assert.match(verify, /both.*local-ahead.*already-pushed.*same.*recovery/isu);
  assert.match(verify, /never.*edit.*history.*guess.*reopen.*attest-target-contribution.*repair.*push.*deploy/isu);

  assert.match(helper, /active `\/verify-target-before-push`.*either.*failed-command diagnostic packet.*command representation packet/isu);
  assert.match(helper, /command representation.*sole.*unambiguous placeholder.*unique repository-required full-suite command.*later descendant.*passing completion.*freshly frozen target.*same command.*pass/isu);
  assert.match(helper, /before mutation.*affected.*descendant.*completion.*candidate.*target.*ancestry.*command.*draft.*drift.*stops without writing/isu);
  assert.match(helper, /active verifier-owned.*freshly frozen target result.*never.*rerun the mapped command.*exact-target verification/isu);
  assert.match(helper, /closed_issue_command_representation_reconciliation:v1\s+affected:\s+issue: <affected Issue ID>\s+completion: <immutable completion-note identity>\s+target: <Issue target branch>\s+baseline: <full execution baseline SHA>\s+candidate: <full affected candidate SHA>\s+placeholder: <exact historical placeholder>\s+mapped_command: <exact repository-required full-suite command>\s+descendant:\s+issue: <descendant Issue ID>\s+completion: <immutable descendant completion-note identity>\s+candidate: <full descendant candidate SHA>\s+authorized_by: human\s+statement: authorized for selected-range membership eligibility only; original completion remains invalid/isu);
  assert.match(helper, /record contains only.*affected.*placeholder.*mapped_command.*descendant.*authorized_by.*statement/isu);
  assert.match(helper, /reuse.*exact matching.*command representation.*record.*without.*duplicate/isu);
  assert.match(helper, /malformed.*duplicate.*edited.*partial.*stale.*drifting.*conflicting.*unreadable.*ambiguous.*stops/isu);
  assert.match(helper, /never.*edit.*history.*retroactively.*complete.*reopen.*push.*deploy/isu);

  assert.match(verifyMetadata, /historical command placeholder.*exact human confirmation.*fresh.*Entry/isu);
  assert.match(helperMetadata, /failed-command.*command representation.*exact human confirmation/isu);
  assert.match(verifyDocs, /command representation.*one unambiguous placeholder.*descendant.*exact literal.*frozen target.*fresh.*Entry/isu);
  assert.match(plainMarkdown(helperDocs), /failed-command diagnostic.*command representation.*same model-invoked helper/isu);
  assert.match(matt, /historical command placeholder.*descendant.*exact full-suite command.*freshly frozen target pass.*current-only pass.*does not qualify.*human confirmation.*record-closed-issue-reconciliation.*fresh.*Entry/isu);
  assert.match(mattDocs, /historical command placeholder.*descendant.*exact full-suite command.*confirmation.*fresh.*Entry/isu);
  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.match(read(path), /record-closed-issue-reconciliation.*failed-command.*command-representation/iu);
    assert.match(read(path), /verify-target-before-push.*command-placeholder/iu);
  }

  const fullSuiteCommand = "node --test tests/ron-workflow/*.test.mjs";
  const placeholder = "<repository-required full-suite command>";
  const affected = Object.freeze({
    issue: "13",
    state: "CLOSED",
    target: "features/ron",
    baseline: "baseline-13",
    candidate: "candidate-13",
    completion: "completion-13",
    completionOtherwiseValid: true,
    nonExecutableEntries: [placeholder],
    candidateReachableFromTarget: true,
    candidateReachableFromBaseline: false,
    worktreeRegistered: false,
    worktreeExists: false,
    laterValidCompletion: false,
    otherInvalidatingEvidence: false,
  });
  const descendant = Object.freeze({
    issue: "14",
    state: "CLOSED",
    target: "features/ron",
    completion: "completion-14",
    candidate: "candidate-14",
    descendsFromAffected: true,
    candidateReachable: true,
    recordedCommands: [fullSuiteCommand],
    commandResults: [{ command: fullSuiteCommand, result: "pass" }],
  });

  const reconcile = ({
    candidate = affected,
    commandChoices = [fullSuiteCommand],
    descendants = [descendant],
    frozenTargetResult = { command: fullSuiteCommand, result: "pass" },
    records = [],
    draft = "exact-command-representation-draft",
    confirmedDraft = "exact-command-representation-draft",
    readBack = "exact-command-representation-draft",
  } = {}) => {
    assert.equal(candidate.state, "CLOSED", "affected Issue must be closed");
    assert.equal(candidate.completionOtherwiseValid, true, "completion must be otherwise valid");
    assert.equal(candidate.nonExecutableEntries.length, 1, "exactly one placeholder is required");
    assert.equal(candidate.nonExecutableEntries[0], placeholder, "entry must be one unambiguous placeholder");
    assert.equal(candidate.candidateReachableFromTarget, true, "affected candidate must be reachable from target");
    assert.equal(candidate.candidateReachableFromBaseline, false, "affected candidate must not be reachable from baseline");
    assert.equal(candidate.worktreeRegistered, false, "affected worktree must not be registered");
    assert.equal(candidate.worktreeExists, false, "affected worktree path must be absent");
    assert.equal(candidate.laterValidCompletion, false, "later valid completion makes recovery ineligible");
    assert.equal(candidate.otherInvalidatingEvidence, false, "other invalidating evidence makes recovery ineligible");
    assert.equal(commandChoices.length, 1, "repository full-suite command must be unique");
    const [mappedCommand] = commandChoices;
    assert.equal(descendants.length, 1, "exactly one descendant command proof is required");
    const [exactDescendant] = descendants;
    assert.equal(exactDescendant.state, "CLOSED", "descendant Issue must be closed");
    assert.equal(exactDescendant.target, candidate.target, "descendant target must match");
    assert.equal(exactDescendant.descendsFromAffected, true, "descendant candidate must descend from affected candidate");
    assert.equal(exactDescendant.candidateReachable, true, "descendant candidate must be reachable from target");
    assert.equal(exactDescendant.recordedCommands.includes(mappedCommand), true, "descendant must record the exact mapped command");
    assert.equal(exactDescendant.commandResults.find(({ command }) => command === mappedCommand)?.result, "pass", "descendant command must pass");
    assert.deepEqual(frozenTargetResult, { command: mappedCommand, result: "pass" }, "frozen target must pass the same command");
    assert.equal(confirmedDraft, draft, "human must confirm the exact packet");
    assert.ok(records.length <= 1, "duplicate command representation records stop");
    if (records.length === 1) assert.equal(records[0], draft, "conflicting command representation record stops");
    assert.equal(readBack, draft, "exact command representation read-back is required");
    return { restart: "Entry", mappedCommand, completionState: "invalid" };
  };

  assert.deepEqual(reconcile(), { restart: "Entry", mappedCommand: fullSuiteCommand, completionState: "invalid" });
  assert.deepEqual(reconcile({ records: ["exact-command-representation-draft"] }), { restart: "Entry", mappedCommand: fullSuiteCommand, completionState: "invalid" });
  assert.throws(() => reconcile({ candidate: { ...affected, nonExecutableEntries: [placeholder, "<other>"] } }), /exactly one placeholder/u);
  assert.throws(() => reconcile({ candidate: { ...affected, nonExecutableEntries: ["full suite passed"] } }), /unambiguous placeholder/u);
  assert.throws(() => reconcile({ candidate: { ...affected, nonExecutableEntries: ["run the full test suite"] } }), /unambiguous placeholder/u);
  assert.throws(() => reconcile({ candidate: { ...affected, candidateReachableFromTarget: false } }), /reachable from target/u);
  assert.throws(() => reconcile({ candidate: { ...affected, candidateReachableFromBaseline: true } }), /not be reachable from baseline/u);
  assert.throws(() => reconcile({ candidate: { ...affected, worktreeRegistered: true } }), /must not be registered/u);
  assert.throws(() => reconcile({ commandChoices: [fullSuiteCommand, "npm test"] }), /must be unique/u);
  assert.throws(() => reconcile({ descendants: [] }), /exactly one descendant/u);
  assert.throws(() => reconcile({ descendants: [descendant, { ...descendant, issue: "15" }] }), /exactly one descendant/u);
  assert.throws(() => reconcile({ descendants: [{ ...descendant, descendsFromAffected: false }] }), /must descend/u);
  assert.throws(() => reconcile({ descendants: [{ ...descendant, candidateReachable: false }] }), /reachable from target/u);
  assert.throws(() => reconcile({ descendants: [{ ...descendant, recordedCommands: ["npm test"] }] }), /exact mapped command/u);
  assert.throws(() => reconcile({ descendants: [{ ...descendant, commandResults: [{ command: fullSuiteCommand, result: "fail" }] }] }), /must pass/u);
  assert.throws(() => reconcile({ frozenTargetResult: { command: fullSuiteCommand, result: "fail" } }), /frozen target/u);
  assert.throws(() => reconcile({ records: ["exact-command-representation-draft", "exact-command-representation-draft"] }), /duplicate/u);
  assert.throws(() => reconcile({ confirmedDraft: "different" }), /exact packet/u);
  assert.throws(() => reconcile({ readBack: "drifted" }), /exact command representation read-back/u);

  const runFreshGate = ({ mode, mappedCommand = fullSuiteCommand, memberCommands = [["test:13"], [fullSuiteCommand]] }) => {
    assert.match(mode, /^(?:local-ahead|already-pushed)$/u);
    const commands = [...new Set(memberCommands.flat())];
    assert.equal(commands.includes(mappedCommand), true, "mapped literal command must enter the aggregate command set");
    const executed = [...commands.filter((command) => command !== fullSuiteCommand), fullSuiteCommand];
    assert.equal(executed.filter((command) => command === fullSuiteCommand).length, 1, "repository full suite runs exactly once");
    return { restart: "Entry", result: mode === "local-ahead" ? "push_ready:v1" : "range_verified:v1", executed };
  };
  assert.deepEqual(runFreshGate({ mode: "local-ahead" }), { restart: "Entry", result: "push_ready:v1", executed: ["test:13", fullSuiteCommand] });
  assert.equal(runFreshGate({ mode: "already-pushed" }).result, "range_verified:v1");
  assert.throws(() => runFreshGate({ mode: "local-ahead", memberCommands: [["test:13"]] }), /must enter the aggregate command set/u);
});


test("target coverage recovery is confirmation-gated and restarts aggregate verification", () => {
  const verify = readVerifyTargetContract();
  const verifyMetadata = read("skills/engineering/verify-target-before-push/agents/openai.yaml");
  const verifyDocs = read("docs/engineering/verify-target-before-push.md");
  const matt = readAskMattContract();
  const mattDocs = read("docs/engineering/ask-matt.md");

  assert.match(verify, /^description:.*confirmation-gated.*recovery.*without pushing/mu);
  assert.match(verify, /frozen selected-range coverage check.*uncovered material commits.*only.*recovery/isu);
  assert.match(verify, /active skill behavior.*runtime or source.*tests.*configuration.*dependencies.*migrations.*security.*data.*public APIs.*mixed commit.*partial-path.*owner ambiguity.*ineligible/isu);
  assert.match(verify, /non-coverage.*review.*test.*cleanliness.*ref.*tracker.*execution.*closeout.*no tracker mutation/isu);
  assert.match(verify, /exact matching.*direct_target_contribution:v1.*reuse.*without invoking.*attest-target-contribution/isu);
  assert.match(verify, /present.*exact owner.*target.*classification.*full commit SHAs.*per-commit purposes.*complete tracker comment draft/isu);
  assert.match(verify, /No write.*until.*human confirms.*exact draft once/isu);
  assert.match(verify, /call the Skill tool with `attest-target-contribution`.*without.*manual slash command/isu);
  assert.doesNotMatch(verify, /invoke.*`\/attest-target-contribution` skill/isu);
  assert.match(verify, /owner.*target.*commit.*diff.*eligibility.*ref drift.*before mutation.*stops without writing/isu);
  assert.match(verify, /malformed.*duplicate.*conflicting.*mismatched.*unavailable.*partially written.*stops/isu);
  assert.match(verify, /exact record read-back.*discard.*failed gate.*automatically.*fresh.*Entry/isu);
  assert.match(verify, /start a fresh `\/verify-target-before-push` from Entry/iu);
  assert.match(verify, /re-freeze.*refs.*identities.*rebuild.*members.*direct contributions/isu);
  assert.match(verify, /validate.*exact tracker location.*owner scope.*target.*full SHAs.*Git ancestry.*current diff.*strict eligibility/isu);
  assert.match(verify, /fourth selected-range coverage source/iu);
  assert.match(verify, /owning Tracker Specs or Issues.*aggregate Spec review/isu);
  assert.match(verify, /both evidence modes.*Standards.*focused.*full-suite.*cleanliness.*ref-stability.*result[- ]separation/isu);
  assert.match(verify, /only.*completely passing.*local-ahead.*fresh gate.*`push_ready`/isu);
  assert.match(verify, /neither.*helper.*recovery.*push/isu);
  assert.match(verify, /never.*generic attestation framework/isu);

  assert.match(verifyMetadata, /eligible.*coverage recovery.*exact human confirmation.*fresh.*Entry/isu);
  assert.match(verifyDocs, /uncovered.*eligible.*complete.*draft.*one exact human confirmation.*helper.*fresh.*Entry/isu);
  assert.match(verifyDocs, /active.*source.*tests.*configuration.*mixed.*ineligible/isu);
  assert.match(verifyDocs, /helper.*never pushes/iu);
  assert.match(verifyDocs, /only.*fresh.*local-ahead.*push_ready/isu);
  assert.match(matt, /coverage failure.*eligible direct target contribution.*complete.*draft.*human confirmation.*attest-target-contribution.*fresh.*Entry/isu);
  assert.match(matt, /invokes `\/attest-target-contribution`/iu);
  assert.match(matt, /no separate manual.*attestation command/iu);
  assert.match(mattDocs, /coverage failure.*eligible.*complete.*draft.*confirmation.*fresh.*Entry/isu);
  assert.match(read("CONTEXT.md"), /Direct target contribution recovery.*confirmation-gated.*fresh target verification.*Entry/isu);
  assert.match(read("docs/adr/0041-preserve-direct-target-contributions-through-explicit-evidence.md"), /confirmation.*helper.*fresh verification from Entry/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.match(read(path), /attest-target-contribution.*authority evidence.*eligible direct target contribution/iu);
    assert.match(read(path), /verify-target-before-push.*local-ahead.*already-pushed.*recovery/iu);
  }
});


test("workflowArtifacts classify required Issue-owned documentation without bypassing evidence", () => {
  const execute = readExecuteIssueContract();
  const review = read("skills/engineering/code-review/SKILL.md");
  const close = [
    read("skills/engineering/close-issue/SKILL.md"),
    read("skills/engineering/close-issue/references/completion-evidence.md"),
  ].join("\n");
  const verify = readVerifyTargetContract();
  const matt = readAskMattContract();

  assert.match(execute, /`workflowArtifacts`.*explicit empty list.*repository-relative.*path.*requirement source.*purpose/isu);
  assert.match(execute, /declared path.*Execution baseline.*candidate diff.*prospective.*code-review/isu);
  assert.match(execute, /first prospective completion.*repository.*tracker.*parent or linked Spec.*Issue target branch.*Spec and its exact child histories.*local-file tracker histories.*logical `workflow_artifacts_contract_adopted:v1`/isu);
  assert.match(execute, /Spec and its exact child histories.*local-file tracker histories.*freeze.*valid completion.*without `workflowArtifacts`.*`legacyCompletionFrontier`.*empty list.*Issue.*immutable completion-note identity.*durable local record locator.*SHA-256.*exact note body/isu);
  assert.match(execute, /Do not infer order across parent and child histories.*completion without `workflowArtifacts`.*legacy only.*exact identity.*body digest.*frozen frontier/isu);
  assert.match(execute, /Concurrent first `workflow_artifacts_contract_adopted:v1` completions.*payload-identical physical adoption records.*collapse.*idempotently.*logical record.*never append another.*exact payload.*visible/isu);
  assert.match(review, /prospective `workflowArtifacts` declaration.*Standards.*Spec/isu);
  assert.match(review, /repository- or skill-required.*non-contract.*extension.*public-contract.*routing.*Acceptance Criteria.*governance.*runtime.*ambiguous.*unowned/isu);
  for (const consumer of [close, verify]) {
    assert.match(consumer, /`workflowArtifacts`.*path.*requirement source.*purpose.*baseline.*candidate/isu);
    assert.match(consumer, /parent or linked Spec.*logical `workflow_artifacts_contract_adopted:v1`.*repository.*tracker.*Spec.*Issue target branch.*`legacyCompletionFrontier`.*empty list.*Issue.*immutable completion-note identity.*durable local record locator.*SHA-256.*exact note body/isu);
    assert.match(consumer, /Do not compare order across parent and child histories.*completion without `workflowArtifacts`.*legacy only.*exact identity.*body digest.*frozen frontier.*otherwise.*stop/isu);
    assert.match(consumer, /scope with no adoption record.*legacy.*original contract/isu);
    assert.match(consumer, /malformed.*mismatched.*unreadable.*payload-conflicting.*plausibly bound.*repository.*tracker.*Spec.*stop.*well-formed record.*another exact scope.*does not classify/isu);
    assert.match(consumer, /plausible binding.*record kind.*physical parent or linked-Spec tracker location.*before validating payload scope fields.*Never filter out.*malformed record.*repository.*tracker.*Spec.*target field.*required to prove/isu);
    assert.match(consumer, /scope classification only.*never.*contribution coverage.*verification authority/isu);
    assert.match(consumer, /Spec-scoped adoption record.*compatibility evidence only.*grants no.*implementation.*review.*coverage.*verification.*close.*push.*deployment authority/isu);
  }
  assert.match(verify, /declared workflow artifact.*Standards review.*Spec review.*selected-range coverage.*focused verification.*full suite.*cleanliness.*ref-stability/isu);
  assert.match(matt, /completion note.*`workflowArtifacts`.*scope classification.*coverage.*verification/isu);

  for (const name of ["execute-issue", "code-review", "close-issue", "verify-target-before-push"]) {
    assert.match(read(`skills/engineering/${name}/SKILL.md`), /workflowArtifacts|completion evidence|completion-evidence/u, `${name} entry must expose artifact evidence`);
    assert.match(read(`docs/engineering/${name}.md`), /workflowArtifacts/u, `${name} docs omit workflowArtifacts`);
  }
  for (const name of ["execute-issue", "close-issue", "verify-target-before-push"]) {
    // Adoption authority is checked on the owning contract above, not duplicated in the picker prompt.
    assert.match(read(`docs/engineering/${name}.md`), /workflow_artifacts_contract_adopted:v1/u, `${name} docs omit adoption evidence`);
  }
  assert.match(read("docs/engineering/ask-matt.md"), /workflowArtifacts/u);
  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.match(read(path), /execute-issue.*workflowArtifacts/iu);
    assert.match(read(path), /code-review.*workflow artifact/iu);
    assert.match(read(path), /close-issue.*workflowArtifacts/iu);
    assert.match(read(path), /verify-target-before-push.*workflowArtifacts/iu);
  }

  const changedArtifacts = new Map([
    ["superpowers/docs/plans/issue.md", {
      requirementSource: "AGENTS.md High-risk writing-plans",
      purpose: "Preserve resumable public-contract delivery decisions",
      effect: "required-non-contract",
      ambiguous: false,
    }],
    ["evidence/run-log.txt", {
      requirementSource: "execute-issue verification record",
      purpose: "Retain the exact required verification log",
      effect: "required-non-contract",
      ambiguous: false,
    }],
    ["docs/public-api.md", {
      requirementSource: "Issue #20",
      purpose: "Change the public API contract",
      effect: "public-contract",
      ambiguous: false,
    }],
    ["notes/unclear.md", {
      requirementSource: "unknown",
      purpose: "Unclear ownership",
      effect: "required-non-contract",
      ambiguous: true,
    }],
  ]);
  const adoptionScope = {
    repository: "ron03wlb/skills",
    tracker: "github:ron03wlb/skills",
    spec: 19,
    targetBranch: "features/ron",
  };
  const legacyCompletion = {
    issue: 18,
    evidenceId: "github-comment:123",
    bodySha256: "a".repeat(64),
  };
  const matchingAdoption = {
    kind: "workflow_artifacts_contract_adopted:v1",
    ...adoptionScope,
    legacyCompletionFrontier: [legacyCompletion],
  };
  const locatedInScope = (payload) => ({
    location: { tracker: adoptionScope.tracker, spec: adoptionScope.spec },
    payload,
  });
  const locatedElsewhere = (payload) => ({
    location: { tracker: adoptionScope.tracker, spec: 99 },
    payload,
  });
  const validateWorkflowArtifacts = (completion, { adoptionRecords = [] } = {}) => {
    const plausiblyBoundRecords = adoptionRecords
      .filter(({ location, payload }) =>
        payload.kind === "workflow_artifacts_contract_adopted:v1"
        && location.tracker === adoptionScope.tracker
        && location.spec === adoptionScope.spec)
      .map(({ payload }) => payload);
    for (const record of plausiblyBoundRecords) {
      assert.deepEqual(
        Object.keys(record).sort(),
        ["kind", "legacyCompletionFrontier", "repository", "spec", "targetBranch", "tracker"],
        "malformed workflow artifact adoption record",
      );
      assert.equal(record.targetBranch, adoptionScope.targetBranch, "mismatched workflow artifact adoption scope");
      assert.ok(Array.isArray(record.legacyCompletionFrontier), "unreadable legacy completion frontier");
      const seenLegacyEvidence = new Set();
      for (const legacy of record.legacyCompletionFrontier) {
        assert.deepEqual(Object.keys(legacy).sort(), ["bodySha256", "evidenceId", "issue"], "malformed legacy completion frontier entry");
        assert.match(legacy.bodySha256, /^[a-f0-9]{64}$/u, "invalid legacy completion body digest");
        const identity = `${legacy.issue}:${legacy.evidenceId}`;
        assert.equal(seenLegacyEvidence.has(identity), false, "duplicate legacy completion frontier entry");
        seenLegacyEvidence.add(identity);
      }
    }
    const canonicalPayloads = new Set(plausiblyBoundRecords.map((record) => JSON.stringify({
      ...record,
      legacyCompletionFrontier: [...record.legacyCompletionFrontier].sort((a, b) => `${a.issue}:${a.evidenceId}`.localeCompare(`${b.issue}:${b.evidenceId}`)),
    })));
    assert.ok(canonicalPayloads.size <= 1, "conflicting workflow artifact adoption records");
    const adopted = plausiblyBoundRecords.length > 0;
    const listedLegacy = adopted && plausiblyBoundRecords[0].legacyCompletionFrontier.some((legacy) =>
      legacy.issue === completion.issue
      && legacy.evidenceId === completion.evidenceId
      && legacy.bodySha256 === completion.bodySha256);
    if (!Object.hasOwn(completion, "workflowArtifacts")) {
      assert.equal(adopted && !listedLegacy, false, "prospective completion note cannot omit workflowArtifacts");
      return { legacy: true, artifacts: [] };
    }
    assert.ok(Array.isArray(completion.workflowArtifacts), "workflowArtifacts must be an explicit list");
    const seen = new Set();
    for (const artifact of completion.workflowArtifacts) {
      assert.deepEqual(Object.keys(artifact).sort(), ["path", "purpose", "requirementSource"]);
      assert.match(artifact.path, /^(?![A-Za-z]:|\/|.*(?:^|\/)\.\.(?:\/|$)).+/u, "artifact path must be repository-relative");
      assert.equal(seen.has(artifact.path), false, `duplicate workflow artifact ${artifact.path}`);
      seen.add(artifact.path);
      const changed = changedArtifacts.get(artifact.path);
      assert.ok(changed, `declared path is not changed in the Issue contribution: ${artifact.path}`);
      assert.equal(artifact.requirementSource, changed.requirementSource, `false requirement source for ${artifact.path}`);
      assert.equal(artifact.purpose, changed.purpose, `false purpose for ${artifact.path}`);
      assert.equal(changed.effect, "required-non-contract", `ordinary material scope cannot be classified: ${artifact.path}`);
      assert.equal(changed.ambiguous, false, `ambiguous workflow artifact ${artifact.path}`);
    }
    return { legacy: false, artifacts: completion.workflowArtifacts };
  };

  assert.deepEqual(validateWorkflowArtifacts({ workflowArtifacts: [] }), { legacy: false, artifacts: [] });
  const validPlan = {
    path: "superpowers/docs/plans/issue.md",
    requirementSource: "AGENTS.md High-risk writing-plans",
    purpose: "Preserve resumable public-contract delivery decisions",
  };
  const validTextLog = {
    path: "evidence/run-log.txt",
    requirementSource: "execute-issue verification record",
    purpose: "Retain the exact required verification log",
  };
  assert.equal(validateWorkflowArtifacts({ workflowArtifacts: [validPlan, validTextLog] }).artifacts.length, 2);
  assert.deepEqual(validateWorkflowArtifacts({ verification: "legacy-pass" }), { legacy: true, artifacts: [] });
  assert.throws(
    () => validateWorkflowArtifacts({
      issue: 20,
      evidenceId: "github-comment:456",
      bodySha256: "b".repeat(64),
    }, { adoptionRecords: [locatedInScope(matchingAdoption)] }),
    /prospective completion note cannot omit workflowArtifacts/u,
  );
  assert.deepEqual(
    validateWorkflowArtifacts(
      {
        issue: 20,
        evidenceId: "github-comment:456",
        bodySha256: "b".repeat(64),
        workflowArtifacts: [],
      },
      { adoptionRecords: [locatedInScope(matchingAdoption), locatedInScope({ ...matchingAdoption })] },
    ),
    { legacy: false, artifacts: [] },
  );
  assert.throws(
    () => validateWorkflowArtifacts(
      { issue: 20, evidenceId: "github-comment:456", bodySha256: "b".repeat(64) },
      { adoptionRecords: [locatedInScope(matchingAdoption), locatedInScope({ ...matchingAdoption })] },
    ),
    /prospective completion note cannot omit workflowArtifacts/u,
  );
  assert.throws(
    () => validateWorkflowArtifacts(
      { issue: 20, evidenceId: "github-comment:456", bodySha256: "b".repeat(64) },
      { adoptionRecords: [
        locatedInScope(matchingAdoption),
        locatedInScope({ ...matchingAdoption, legacyCompletionFrontier: [] }),
      ] },
    ),
    /conflicting workflow artifact adoption records/u,
  );
  assert.deepEqual(
    validateWorkflowArtifacts({ ...legacyCompletion }, { adoptionRecords: [locatedInScope(matchingAdoption)] }),
    { legacy: true, artifacts: [] },
  );
  assert.deepEqual(
    validateWorkflowArtifacts({ issue: 20, evidenceId: "local:record-1", bodySha256: "c".repeat(64) }),
    { legacy: true, artifacts: [] },
  );
  assert.throws(
    () => validateWorkflowArtifacts(
      { issue: 20, evidenceId: "github-comment:456", bodySha256: "b".repeat(64) },
      { adoptionRecords: [locatedInScope({
        kind: "workflow_artifacts_contract_adopted:v1",
        repository: adoptionScope.repository,
        tracker: adoptionScope.tracker,
        spec: adoptionScope.spec,
        targetBranch: adoptionScope.targetBranch,
      })] },
    ),
    /malformed workflow artifact adoption record/u,
  );
  assert.throws(
    () => validateWorkflowArtifacts(
      { issue: 20, evidenceId: "github-comment:456", bodySha256: "b".repeat(64) },
      { adoptionRecords: [locatedInScope({ ...matchingAdoption, targetBranch: "other-target" })] },
    ),
    /mismatched workflow artifact adoption scope/u,
  );
  assert.throws(
    () => validateWorkflowArtifacts(
      { issue: 20, evidenceId: "github-comment:456", bodySha256: "b".repeat(64) },
      { adoptionRecords: [locatedInScope({
        kind: "workflow_artifacts_contract_adopted:v1",
        tracker: adoptionScope.tracker,
        spec: adoptionScope.spec,
        targetBranch: adoptionScope.targetBranch,
        legacyCompletionFrontier: [],
      })] },
    ),
    /malformed workflow artifact adoption record/u,
  );
  assert.deepEqual(
    validateWorkflowArtifacts(
      { issue: 20, evidenceId: "github-comment:456", bodySha256: "b".repeat(64) },
      { adoptionRecords: [locatedElsewhere(matchingAdoption)] },
    ),
    { legacy: true, artifacts: [] },
  );
  for (const path of ["C:/outside.md", "../outside.md", "/outside.md"]) {
    assert.throws(
      () => validateWorkflowArtifacts({ workflowArtifacts: [{ ...validPlan, path }] }),
      /repository-relative/u,
    );
  }
  assert.throws(
    () => validateWorkflowArtifacts({ workflowArtifacts: [{ ...validPlan, path: "missing.md" }] }),
    /not changed in the Issue contribution/u,
  );
  assert.throws(
    () => validateWorkflowArtifacts({ workflowArtifacts: [{ ...validPlan, requirementSource: "invented" }] }),
    /false requirement source/u,
  );
  assert.throws(
    () => validateWorkflowArtifacts({ workflowArtifacts: [{
      path: "docs/public-api.md",
      requirementSource: "Issue #20",
      purpose: "Change the public API contract",
    }] }),
    /ordinary material scope cannot be classified/u,
  );
  assert.throws(() => validateWorkflowArtifacts({ workflowArtifacts: [validPlan, validPlan] }), /duplicate workflow artifact/u);
  assert.throws(
    () => validateWorkflowArtifacts({ workflowArtifacts: [{
      path: "notes/unclear.md",
      requirementSource: "unknown",
      purpose: "Unclear ownership",
    }] }),
    /ambiguous workflow artifact/u,
  );
});


test("Issue delivery uses Matt specs and separate execution and closeout", () => {
  const execute = readExecuteIssueContract();
  const executeMetadata = read("skills/engineering/execute-issue/agents/openai.yaml");
  assert.doesNotMatch(execute, /^disable-model-invocation:\s*true$/mu);
  assert.doesNotMatch(executeMetadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(execute, /direct human invocation.*valid.*DAG Run Grant.*without.*per-Issue.*approval/isu);
  assert.match(execute, /coordinator.*read-back.*DAG Run Grant.*exact.*linked Spec.*Issue target branch.*classification.*scope.*Decomposition publication record/isu);
  assert.match(execute, /Single-Issue.*coordinator target.*exact bound Spec.*outsider.*stops? before.*worktree.*mutation/isu);
  assert.match(execute, /missing.*stale.*mismatch.*Grant.*stops? before.*worktree.*mutation/isu);
  assert.match(plainMarkdown(read("docs/engineering/execute-issue.md")), /Single-Issue.*exact bound Spec.*Multi-Issue.*exact mapping member/isu);
  assert.match(execute, /never creates.*DAG Run Grant/iu);
  assert.match(execute, /dedicated Git worktree/iu);
  assert.match(execute, /linked Spec/iu);
  assert.match(execute, /code-review/u);
  assert.match(execute, /Standards/u);
  assert.match(execute, /Spec/u);
  assert.match(execute, /10 repair waves for the same Issue operation across retries/iu);
  assert.match(execute, /Issue target branch.*only default merge destination/isu);
  assert.match(execute, /Any number of Issue worktrees may execute concurrently/iu);
  assert.match(execute, /target movement alone.*does not supersede.*`implementation_complete`/isu);
  assert.match(execute, /blocked state supersedes completion only when.*invalidates.*candidate.*implementation.*Standards.*Spec.*verification/isu);
  assert.match(execute, /dirty target.*partial close.*not.*conflict-resolution rerun.*cheap read-only.*identity.*evidence.*do not run.*baseline.*focused.*final.*full suite.*review.*commit.*tracker note.*`\/close-issue <Issue-ID>`/isu);
  assert.match(execute, /explicit conflict-resolution or technical-failure recovery.*same topic branch.*Issue worktree.*latest target.*new attempt baseline.*merge.*baseline.*topic branch.*without rebasing or resetting.*Acceptance Criteria.*unchanged.*new candidate.*contain.*baseline.*new `implementation_complete`.*current/isu);
  assert.doesNotMatch(execute, /any blocked exit.*supersedes older successful execution evidence/isu);
  assert.match(execute, /completion note/iu);
  assert.match(execute, /never invokes `close-issue`/iu);
  assert.match(execute, /Execution never integrates, removes a worktree, closes the Issue, pushes, or deploys/iu);
  assert.match(execute, /Subsequent `close-issue` entry uses direct human authority, a valid DAG Run Grant, or the same approved maintenance handoff/iu);
  assert.doesNotMatch(execute, /review_profile|focused review|full review/iu);

  const close = readCloseIssueContract();
  const closeLease = read("skills/engineering/close-issue/scripts/close-lease.mjs");
  const closeMetadata = read("skills/engineering/close-issue/agents/openai.yaml");
  assert.doesNotMatch(close, /^disable-model-invocation:\s*true$/mu);
  assert.doesNotMatch(closeMetadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(close, /direct human invocation.*valid.*DAG Run Grant.*without.*per-Issue.*approval/isu);
  assert.match(close, /never creates.*DAG Run Grant/iu);
  assert.match(close, /For coordinator entry.*Grant.*exact Spec.*Decomposition record.*Single target.*Executable child.*mapping.*parent-only target/isu);
  assert.match(close, /absent from.*mapping.*stop before mutation/isu);
  assert.match(plainMarkdown(read("docs/engineering/close-issue.md")), /Single-Issue.*bound Spec.*Multi-Issue child.*exact mapping member.*parent-only.*bound Spec/isu);
  assert.match(close, /`implementation_complete` note/iu);
  assert.match(close, /recorded Issue target branch.*never infer.*current checkout.*substitute/isu);
  assert.match(close, /sole owner.*repository close lease.*before.*target mutation writer.*direct human.*DAG/isu);
  assert.match(close, /scripts\/close-lease\.mjs/iu);
  assert.ok(
    closeLease.indexOf("store.acquireRepositoryCloseLease")
      < closeLease.indexOf("store.acquireTargetMutationWriter"),
    "close-issue lease boundary must acquire repository authority before target authority",
  );
  assert.ok(
    closeLease.lastIndexOf("targetWriter.release()")
      < closeLease.lastIndexOf("repositoryLease.release()"),
    "close-issue lease boundary must release target authority before repository authority",
  );
  assert.match(close, /callers.*cannot pre-acquire.*delegate.*either lease/isu);
  assert.match(close, /release.*target.*before.*repository.*required read-back/isu);
  assert.match(close, /same Git common dir.*different targets.*one.*different repositories.*concurrent/isu);
  assert.match(close, /target mutation writer.*planning producers.*exact target.*Issue execution.*planning.*unrelated targets.*never.*repository close lease/isu);
  assert.match(close, /healthy contention.*observe.*owner.*bounded.*retry.*without.*steal/isu);
  assert.match(close, /Unknown ownership.*stale-proof mismatch.*stops the affected closeout.*healthy acquisition race.*observation/isu);
  assert.doesNotMatch(close, /durable FIFO queue|waiter registry|queue-specific reclaim/iu);
  assert.match(close, /exactly three ordered.*merge.*remove.*close/isu);
  assert.match(close, /candidate.*already.*ancestor.*target.*merge.*satisfied/isu);
  assert.match(close, /merge unchanged `C` into the latest target/iu);
  assert.match(close, /Do not rebase, refresh, edit `C`/iu);
  assert.match(close, /target.*ancestor of `C`.*git merge --ff-only <C>.*diverged histories.*git merge --no-ff --no-edit <C>.*merge\.ff/isu);
  assert.match(close, /merge conflicts.*git merge --abort.*Issue worktree registered.*Issue open/isu);
  assert.match(close, /never.*append `implementation_blocked`.*invoke `execute-issue`/isu);
  assert.match(close, /target worktree is dirty.*stop before mutation.*never stash.*commit.*clean.*reset.*move/isu);
  assert.match(close, /human resolves dirt.*direct `\/close-issue <Issue-ID>`.*authorized coordinator resumes this owner after reconciliation.*without repeating execution review or a full suite/isu);
  assert.match(close, /Recheck Git ancestry, worktree registration and tracker state.*skip only satisfied actions/isu);
  assert.match(close, /Before any action.*already-closed Issue.*unreachable.*worktree\/directory.*contradictory.*stop/isu);
  assert.match(close, /git worktree remove/u);
  assert.match(close, /exact registered worktree.*path.*topic branch.*clean state.*`HEAD == C`/isu);
  assert.match(close, /If the Issue is open, close it/iu);
  assert.match(close, /read it back once/iu);
  assert.match(close, /retry skips completed actions.*resumes the next one/isu);
  assert.match(close, /Authorized execution recovery retains the topic\/worktree, latest target and original Acceptance Criteria.*Scope change.*planning/isu);
  assert.match(close, /Multi-Issue Spec.*Decomposition publication record.*every exact child is closed.*candidate.*reachable.*same target/isu);
  assert.match(close, /returns to `\/to-tickets <Parent-ID>` reconciliation/iu);
  assert.match(close, /parent closure never claims `push_ready`/iu);
  assert.doesNotMatch(close, /closeout receipt|dirty-target-preservation|preservation\.mjs|`PREPARED`|`VERIFIED`|`FAILED`/iu);
  const closeDocs = read("docs/engineering/close-issue.md");
  const executeDocs = read("docs/engineering/execute-issue.md");
  assert.match(executeDocs, /target is dirty.*partial.*only checks.*identities.*evidence.*does not repeat.*verification.*review.*commits.*tracker writes.*same authorized close owner.*human.*resolution.*`\/close-issue <Issue-ID>`.*coordinator reconciles/isu);
  assert.match(closeDocs, /three.*merge.*remove.*close/isu);
  assert.match(closeDocs, /Target dirt.*human preservation and resolution.*Direct entry.*retr.*`\/close-issue <Issue-ID>`.*authorized coordinator.*same close owner.*Neither repeats.*execution.*full suite/isu);
  assert.match(closeDocs, /repository close lease.*same Git common dir.*repository.*target.*order.*reverse/isu);
  assert.match(close, /repository close lease.*target mutation writer.*order/isu);
  assert.doesNotMatch(closeDocs, /preservation receipt|closeout receipt|integration receipt/iu);
  assert.match(close, /Cleanup is satisfied only when both registration and directory are absent/iu);
  const alreadyClosed = close.match(/If it is already closed,[^\n]+/u)?.[0] ?? "";
  assert.match(alreadyClosed, /same candidate.*reachable.*worktree.*absent/iu);
  assert.match(close, /never repairs product code/iu);

  assert.equal(existsSync("skills/engineering/close-issue/scripts/preservation.mjs"), false);
  assert.equal(existsSync("tests/ron-workflow/close-issue-preservation.test.mjs"), false);

  const verify = readVerifyTargetContract();
  assert.match(verify, /two evidence modes.*local-ahead.*already-pushed/isu);
  assert.match(verify, /local-ahead.*unique configured upstream tracking tip.*`B\.\.V`.*non-empty.*guess/isu);
  assert.match(verify, /already-pushed.*explicit merge request.*pull request.*exact base\/head range.*never guess/isu);
  assert.match(verify, /clean verification worktree.*exact `V`/isu);
  assert.match(verify, /open and closed Issues.*Execution completion note.*read each.*once.*without pre-filtering by Issue target/isu);
  assert.match(verify, /candidate `C`.*reachable from `V`.*not.*`B`.*member/isu);
  assert.match(verify, /reachable member.*Issue.*open.*stops/isu);
  assert.match(verify, /For every member.*closed tracker state/isu);
  assert.match(verify, /For every member.*topic branch.*worktree.*Planning Seal.*explicit `manualAttestations` list.*empty list.*Standards.*Spec review identities.*clean results/isu);
  assert.match(verify, /completion note.*exact Issue identity.*verification identity.*commands.*passing results/isu);
  assert.match(verify, /review and verification.*candidate identity.*exact `C`/isu);
  assert.match(verify, /open unreachable.*concurrent.*outside.*closed unreachable.*contradictory/isu);
  assert.match(verify, /later state supersedes.*only.*invalidates.*candidate.*implementation.*Standards.*Spec.*verification/isu);
  assert.match(verify, /completion notes.*sole Issue-to-commit mapping authority/isu);
  assert.match(verify, /every material commit.*`B\.\.V`.*member.*baseline.*candidate.*Planning Seal.*merge topology/isu);
  assert.match(verify, /overlap.*valid.*no unique owner/isu);
  assert.match(verify, /code-review.*Standards.*Spec axis.*every member Issue.*parent.*linked Spec/isu);
  assert.match(verify, /focused verification commands.*deduplicate.*full suite exactly once.*exact `V`/isu);
  assert.match(verify, /Successor verification evidence.*path-specific.*later member candidate.*descends.*earlier candidate/isu);
  assert.match(verify, /partial.*non-path-specific.*stops/isu);
  assert.match(verify, /ambiguous.*stops/isu);
  assert.match(verify, /result.*superseded command.*exact successor proof/isu);
  assert.match(verify, /gate, not a repair loop/iu);
  assert.match(verify, /local-ahead.*push_ready:v1.*`B`.*`V`.*member Issue.*candidate.*commands/isu);
  assert.match(verify, /already-pushed.*Range verification result.*never.*push_ready/isu);
  assert.match(verify, /target movement.*invalidates.*aggregate evidence.*never `execute-issue`/isu);
  assert.match(verify, /never repairs product code.*closes or reopens Issues.*changes other tracker state.*pushes.*remote-merges.*deploys/isu);
  assert.match(verify, /Do not use.*closeout receipt.*integration candidate.*commit-message Issue.*merge-message parsing.*manually repeated Issue list/isu);
  assert.doesNotMatch(verify, /matching read-back `VERIFIED`|candidate `I`|union of .*closeout receipt|RECONCILED/iu);
  const verifyMetadata = read("skills/engineering/verify-target-before-push/agents/openai.yaml");
  assert.match(verifyMetadata, /local-ahead.*already-pushed.*completion-note.*range/isu);
  assert.match(verifyMetadata, /successor verification evidence/iu);
  const verifyDocs = read("docs/engineering/verify-target-before-push.md");
  assert.match(verifyDocs, /two evidence modes.*local-ahead.*unique upstream.*already-pushed.*explicit.*range/isu);
  assert.match(verifyDocs, /completion notes.*reachability.*coverage.*aggregate/isu);
  assert.match(verifyDocs, /Successor verification evidence.*retire.*path-specific.*fail closed/isu);
  assert.match(verifyDocs, /push_ready.*local-ahead.*Range verification result.*already-pushed/isu);
  assert.match(read("CONTEXT.md"), /Successor verification evidence.*later member.*path-specific.*never waives/isu);
  assert.match(read("docs/adr/0038-separate-execution-closeout-and-push-verification.md"), /Successor verification evidence.*partial ownership.*stops the gate/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.match(read(path), /verify-target-before-push.*local-ahead.*already-pushed.*completion-note/iu);
  }

  for (const name of ["execute-issue", "close-issue"]) {
    const skill = read(`skills/engineering/${name}/SKILL.md`);
    const metadata = read(`skills/engineering/${name}/agents/openai.yaml`);
    const page = read(`docs/engineering/${name}.md`);
    assert.doesNotMatch(skill, /^disable-model-invocation:\s*true$/mu);
    assert.doesNotMatch(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
    assert.match(skill, /^description:.*Use when.*DAG Run Grant/mu);
    assert.match(page, /authorized coordinator.*valid DAG Run Grant/isu);
    assert.doesNotMatch(skill, /Canonical Wiki|\/wiki|wiki_|setup-ron|ron-workflow\.md|workflow-[a-z-]+:v\d|lifecycle authorization|payload hash/iu);
    assert.doesNotMatch(skill, /GitHub Issue|GitHub comment/u);
  }

  {
    const name = "verify-target-before-push";
    const skill = read(`skills/engineering/${name}/SKILL.md`);
    const metadata = read(`skills/engineering/${name}/agents/openai.yaml`);
    const page = read(`docs/engineering/${name}.md`);
    assert.match(skill, /^disable-model-invocation:\s*true$/mu);
    assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
    assert.doesNotMatch(skill, /^description:\s*Use when\b/mu);
    assert.match(plainMarkdown(page), /agent won't reach for it on its own/iu);
    assert.doesNotMatch(plainMarkdown(page), /agent reaches for it automatically/iu);
    assert.doesNotMatch(skill, /Canonical Wiki|\/wiki|wiki_|setup-ron|ron-workflow\.md|workflow-[a-z-]+:v\d|lifecycle authorization|payload hash/iu);
    assert.doesNotMatch(skill, /GitHub Issue|GitHub comment/u);
  }

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    const readme = read(path);
    const userHeading = path === "README.md" ? "\n**User-invoked**\n" : "\n## User-invoked\n";
    const modelHeading = path === "README.md" ? "\n**Model-invoked**\n" : "\n## Model-invoked\n";
    const userStart = readme.indexOf(userHeading) + userHeading.length;
    const modelStart = readme.indexOf(modelHeading, userStart);
    const userInvoked = readme.slice(userStart, modelStart);
    const modelInvoked = readme.slice(modelStart + modelHeading.length);
    for (const name of ["execute-issue", "close-issue", "attest-target-contribution"]) {
      assert.doesNotMatch(userInvoked, new RegExp(`\\[${name}\\]`, "u"), `${path} must not list ${name} as user-invoked`);
      assert.match(modelInvoked, new RegExp(`\\[${name}\\]`, "u"), `${path} must list ${name} as model-invoked`);
    }
    for (const name of ["verify-target-before-push", "push-target"]) {
      assert.match(userInvoked, new RegExp(`\\[${name}\\]`, "u"), `${path} must list ${name} as user-invoked`);
      assert.doesNotMatch(modelInvoked, new RegExp(`\\[${name}\\]`, "u"), `${path} must not list ${name} as model-invoked`);
    }
  }

  const historicalBanner = read("research/matt-first-issue-delivery-workflow-spec.md")
    .split("\n")
    .slice(0, 4)
    .join("\n");
  assert.match(historicalBanner, /ADR-0022/u);
  assert.match(historicalBanner, /defaults to `\/implement`/iu);
  assert.match(historicalBanner, /explicitly.*`\/execute-issue`.*`\/close-issue`/isu);
  assert.match(historicalBanner, /without lifecycle authorization/iu);
  assert.doesNotMatch(historicalBanner, /uses one lifecycle authorization/iu);
});

test("Issue closeout is direct, ordered, retryable, and conflict-safe", () => {
  const { repo, git, isAncestor } = createGitFixture("skills-direct-close-fixture-");

  const nextAction = ({ candidate, worktreeRegistered, issueState }) => {
    const reachable = isAncestor(candidate, git("rev-parse", "target"));
    if (issueState === "CLOSED" && (!reachable || worktreeRegistered)) throw new Error("contradictory close state");
    if (!reachable) {
      assert.equal(issueState, "OPEN", "only an open Issue may still need merge");
      assert.equal(worktreeRegistered, true, "an unmerged candidate keeps its Issue worktree");
      assert.equal(git("status", "--porcelain=v1"), "", "target dirt stops before merge");
      return "merge";
    }
    assert.equal(git("status", "--porcelain=v1"), "", "target dirt stops the next ordered action");
    if (worktreeRegistered) return "remove-worktree";
    if (issueState === "OPEN") return "close-issue";
    return "done";
  };

  const mergeCandidate = (state) => {
    assert.equal(nextAction(state), "merge");
    const targetBefore = git("rev-parse", "target");
    try {
      if (isAncestor(targetBefore, state.candidate)) git("merge", "--ff-only", state.candidate);
      else git("merge", "--no-ff", "--no-edit", state.candidate);
    } catch (error) {
      git("merge", "--abort");
      assert.equal(git("rev-parse", "target"), targetBefore, "conflict abort restores target HEAD");
      assert.equal(git("status", "--porcelain=v1"), "", "conflict abort restores a clean target");
      throw error;
    }
    assert.equal(isAncestor(state.candidate, git("rev-parse", "target")), true);
    assert.equal(git("status", "--porcelain=v1"), "");
    return git("rev-parse", "target");
  };

  try {
    writeFileSync(join(repo, "base.txt"), "base\n");
    git("add", "base.txt");
    git("commit", "-m", "base");
    const baseline = git("rev-parse", "HEAD");

    git("checkout", "-b", "issue-a", baseline);
    writeFileSync(join(repo, "a.txt"), "A\n");
    git("add", "a.txt");
    git("commit", "-m", "issue A");
    const candidateA = git("rev-parse", "HEAD");

    git("checkout", "-b", "issue-b", baseline);
    writeFileSync(join(repo, "b.txt"), "B\n");
    git("add", "b.txt");
    git("commit", "-m", "issue B");
    const candidateB = git("rev-parse", "HEAD");

    git("checkout", "-b", "issue-conflict", baseline);
    writeFileSync(join(repo, "base.txt"), "issue change\n");
    git("add", "base.txt");
    git("commit", "-m", "conflicting issue");
    const conflictingCandidate = git("rev-parse", "HEAD");

    git("checkout", "target");
    git("config", "merge.ff", "false");
    const issueA = { candidate: candidateA, worktreeRegistered: true, issueState: "OPEN" };
    writeFileSync(join(repo, "dirty-before.txt"), "local dirt\n");
    assert.throws(() => nextAction(issueA), /target dirt stops before merge/u);
    assert.equal(git("rev-parse", "target"), baseline);
    rmSync(join(repo, "dirty-before.txt"), { force: true });

    assert.equal(mergeCandidate(issueA), candidateA, "first close fast-forwards directly to its candidate");
    assert.equal(nextAction(issueA), "remove-worktree");
    issueA.worktreeRegistered = false;
    assert.equal(nextAction(issueA), "close-issue");
    issueA.issueState = "CLOSED";
    assert.equal(nextAction(issueA), "done");

    writeFileSync(join(repo, "base.txt"), "target change\n");
    git("add", "base.txt");
    git("commit", "-m", "target conflict");
    const targetBeforeConflict = git("rev-parse", "target");
    const conflict = { candidate: conflictingCandidate, worktreeRegistered: true, issueState: "OPEN" };
    assert.throws(() => mergeCandidate(conflict));
    assert.equal(git("rev-parse", "target"), targetBeforeConflict);
    assert.equal(conflict.worktreeRegistered, true);
    assert.equal(conflict.issueState, "OPEN");

    const issueB = { candidate: candidateB, worktreeRegistered: true, issueState: "OPEN" };
    const mergedB = mergeCandidate(issueB);
    assert.equal(git("rev-list", "--parents", "-n", "1", mergedB).split(/\s+/u).length, 3);
    assert.equal(isAncestor(targetBeforeConflict, mergedB), true);
    assert.equal(isAncestor(candidateB, mergedB), true);

    writeFileSync(join(repo, "dirty-after.txt"), "post-merge dirt\n");
    assert.throws(() => nextAction(issueB), /target dirt stops the next ordered action/u);
    assert.equal(issueB.worktreeRegistered, true);
    assert.equal(issueB.issueState, "OPEN");
    rmSync(join(repo, "dirty-after.txt"), { force: true });

    assert.equal(nextAction(issueB), "remove-worktree");
    issueB.worktreeRegistered = false;
    assert.equal(nextAction(issueB), "close-issue");
    issueB.issueState = "CLOSED";
    assert.equal(nextAction(issueB), "done");
    assert.throws(
      () => nextAction({ candidate: candidateB, worktreeRegistered: true, issueState: "CLOSED" }),
      /contradictory close state/u,
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("installed route derives push_ready from the frozen reachable closed-member range", () => {
  const { repo, git, isAncestor } = createGitFixture("skills-target-range-fixture-");
  const commits = (range) => {
    const output = git("rev-list", "--reverse", range);
    return output === "" ? [] : output.split(/\s+/u);
  };

  const selectRange = ({ mode, targetRef = "target", upstreamTips = [], source, base, head }) => {
    if (mode === "local-ahead") {
      assert.equal(upstreamTips.length, 1, "local-ahead requires one unique upstream tracking tip");
      const selected = { mode, source: targetRef, baseline: upstreamTips[0], head: git("rev-parse", targetRef), targetRef };
      assert.equal(isAncestor(selected.baseline, selected.head), true, "upstream must be an ancestor of local HEAD");
      assert.ok(commits(`${selected.baseline}..${selected.head}`).length > 0, "local-ahead range must be non-empty");
      return selected;
    }
    assert.equal(mode, "already-pushed");
    assert.match(source ?? "", /^(?:merge-request|pull-request|exact-range)$/u, "already-pushed evidence must be explicit");
    assert.ok(base && head, "already-pushed evidence requires exact base and head");
    assert.equal(isAncestor(base, head), true, "explicit base must be an ancestor of head");
    return { mode, source, baseline: base, head };
  };

  const currentCompletion = (issue) => {
    const completionIndex = issue.execution.findLastIndex(({ kind }) => kind === "implementation_complete");
    assert.notEqual(completionIndex, -1, `${issue.id}: missing completion note`);
    const completion = issue.execution[completionIndex];
    const invalidating = issue.execution.slice(completionIndex + 1).find(({ invalidatesCandidate }) => invalidatesCandidate === true);
    assert.equal(invalidating, undefined, `${issue.id}: candidate-invalidating state supersedes completion`);
    for (const field of [
      "issue",
      "target",
      "topicBranch",
      "worktree",
      "baseline",
      "candidate",
      "planningSeal",
      "operationIdentity",
      "manualAttestations",
      "standardsReview",
      "specReview",
      "verification",
    ]) assert.ok(completion[field], `${issue.id}: missing ${field}`);
    assert.equal(completion.issue, issue.id, `${issue.id}: mismatched Issue identity`);
    assertWorkflowOperationIdentity(completion.operationIdentity, {
      repositoryId: "github:ron03wlb/skills",
      specId: "aggregate-spec",
      approvedPublicationIdentity: `sha256:${"7".repeat(64)}`,
      producer: "execute-issue",
      stage: "implementation",
      issueId: issue.id,
    });
    for (const axis of ["standardsReview", "specReview"]) {
      assert.equal(completion[axis].candidate, completion.candidate, `${issue.id}: mismatched ${axis} candidate`);
      assert.equal(completion[axis].result, "clean", `${issue.id}: ${axis} is not clean`);
    }
    assert.ok(Array.isArray(completion.manualAttestations), `${issue.id}: missing manual attestation list`);
    const attestationIdentities = new Set();
    for (const attestation of completion.manualAttestations) {
      assert.equal(typeof attestation, "object", `${issue.id}: invalid manual attestation`);
      assert.match(attestation.kind ?? "", /^manual_prerequisite_complete:v[12]$/u, `${issue.id}: invalid manual attestation kind`);
      assert.equal(typeof attestation.identity, "string", `${issue.id}: missing manual attestation identity`);
      assert.equal(attestationIdentities.has(attestation.identity), false, `${issue.id}: duplicate manual attestation identity`);
      attestationIdentities.add(attestation.identity);
      assert.equal(attestation.issue, issue.id, `${issue.id}: mismatched manual attestation Issue`);
      assert.equal(typeof attestation.artifact, "string", `${issue.id}: invalid manual attestation artifact`);
      if (attestation.kind === "manual_prerequisite_complete:v1") {
        assert.equal(attestation.generated, false, `${issue.id}: legacy v1 cannot authorize generated content`);
        continue;
      }
      assert.match(attestation.outcome ?? "", /^(?:APPLIED|NO_OP)$/u, `${issue.id}: invalid v2 outcome`);
      assert.equal(isAncestor(attestation.candidate, completion.candidate), true, `${issue.id}: Prerequisite candidate is outside final ancestry`);
      assert.equal(git("rev-parse", `${attestation.candidate}:${attestation.artifact}`), attestation.blob, `${issue.id}: mismatched v2 blob`);
    }
    assert.equal(completion.verification.candidate, completion.candidate, `${issue.id}: mismatched verification candidate`);
    assert.ok(Array.isArray(completion.verification.commands) && completion.verification.commands.length > 0, `${issue.id}: missing verification commands`);
    assert.ok(Array.isArray(completion.verification.results), `${issue.id}: missing verification results`);
    assert.deepEqual(
      completion.verification.results.map(({ command }) => command),
      completion.verification.commands,
      `${issue.id}: mismatched verification results`,
    );
    assert.ok(completion.verification.results.every(({ result }) => result === "pass"), `${issue.id}: verification result is not passing`);
    return completion;
  };

  const freezeMembers = ({ issues, range }) => issues.flatMap((issue) => {
    const completion = currentCompletion(issue);
    const inHead = isAncestor(completion.candidate, range.head);
    const inBaseline = isAncestor(completion.candidate, range.baseline);
    if (!inHead) {
      assert.equal(issue.state, "OPEN", `${issue.id}: closed candidate is unreachable`);
      return [];
    }
    if (inBaseline) return [];
    assert.equal(issue.state, "CLOSED", `${issue.id}: reachable member is still open`);
    return [{ issue: issue.id, ...completion }];
  });

  const proveCoverage = ({ range, members }) => {
    const contributionSets = members.map((member) => new Set(commits(`${member.baseline}..${member.candidate}`)));
    const referenced = new Set(members.map(({ planningSeal }) => planningSeal));
    for (const commit of commits(`${range.baseline}..${range.head}`)) {
      if (referenced.has(commit) || contributionSets.some((set) => set.has(commit))) continue;
      const parents = git("rev-list", "--parents", "-n", "1", commit).split(/\s+/u).slice(1);
      assert.ok(parents.length > 1 && parents.every((parent) => isAncestor(parent, range.head)), `unexplained material commit ${commit}`);
    }
    return contributionSets;
  };

  const commandFacts = new Map();
  const collectFocusedEvidence = ({ members, issues, successorInspections = [] }) => {
    const commands = [...new Set(members.flatMap(({ verification }) => verification.commands))];
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    const supersededCommands = new Set();
    const successorDispositions = successorInspections.map(({ command }) => {
      assert.equal(commands.includes(command), true, `unknown focused command ${command}`);
      assert.equal(supersededCommands.has(command), false, `duplicate successor disposition ${command}`);
      supersededCommands.add(command);
      const commandFact = commandFacts.get(command);
      assert.notEqual(commandFact?.kind, "non-path", `non-path-specific command cannot be superseded: ${command}`);
      assert.equal(commandFact?.kind, "path", `missing or ambiguous path extraction for ${command}`);
      const { requiredPaths } = commandFact;
      assert.ok(requiredPaths.length > 0, `missing or ambiguous path extraction for ${command}`);
      assert.equal(new Set(requiredPaths).size, requiredPaths.length, `ambiguous path extraction for ${command}`);

      const origins = members.filter(({ verification }) => verification.commands.includes(command));
      const successors = members.flatMap((member) => {
        if (!origins.every((origin) => origin.candidate !== member.candidate && isAncestor(origin.candidate, member.candidate))) return [];
        const issue = issueById.get(member.issue);
        const retirement = issue?.retirements?.find(({ paths }) => requiredPaths.every((path) => paths.includes(path)));
        return retirement ? [{ member, retirement }] : [];
      });
      assert.equal(successors.length, 1, `missing or ambiguous explicit successor retirement for ${command}`);

      const [{ member: successor, retirement }] = successors;
      assert.match(retirement.criterion ?? "", /^AC-\d+$/u, `missing retirement Acceptance Criteria for ${command}`);
      const proof = successor.verification.successorEvidence;
      assert.ok(proof, `missing successor proof for ${command}`);
      assert.ok(Array.isArray(proof.absentPaths) && requiredPaths.every((path) => proof.absentPaths.includes(path)), `missing absence proof for ${command}`);
      assert.ok(requiredPaths.every((path) => !existsSync(join(repo, path))), `retired path still exists at V for ${command}`);
      assert.ok(Array.isArray(proof.currentBehaviorCommands) && proof.currentBehaviorCommands.length > 0, `missing current-behavior proof for ${command}`);
      const currentBehaviorResults = proof.currentBehaviorCommands.map((currentCommand) => {
        const result = successor.verification.results.find(({ command: candidate }) => candidate === currentCommand);
        assert.equal(result?.result, "pass", `current-behavior command is not passing: ${currentCommand}`);
        return result;
      });
      return {
        origins: origins.map(({ issue, candidate }) => ({ issue, candidate })),
        command,
        retiredPaths: requiredPaths,
        successor: { issue: successor.issue, candidate: successor.candidate },
        acceptanceCriteria: retirement.criterion,
        absenceProof: proof.absentPaths,
        currentBehaviorCommands: currentBehaviorResults.map(({ command: currentCommand }) => currentCommand),
      };
    });
    for (const { currentBehaviorCommands } of successorDispositions) {
      assert.ok(currentBehaviorCommands.every((command) => !supersededCommands.has(command)), "current-behavior command must remain applicable");
    }
    return {
      commands: commands.filter((command) => !supersededCommands.has(command)),
      successorDispositions,
    };
  };

  let fullSuiteRuns = 0;
  const runGate = ({ range, issues, successorInspections = [], standardsClean = true, specClean = true, focusedClean = true, fullClean = true, worktreeClean = true }) => {
    const members = freezeMembers({ issues, range });
    assert.ok(members.length > 0, "target verification set must not be empty");
    const contributionSets = proveCoverage({ range, members });
    assert.equal(standardsClean, true, "aggregate Standards review failed");
    assert.equal(specClean, true, "aggregate Spec review failed");
    const focusedEvidence = collectFocusedEvidence({ members, issues, successorInspections });
    const results = focusedEvidence.commands.map((command) => ({ command, result: focusedClean ? "pass" : "fail" }));
    assert.ok(results.every(({ result }) => result === "pass"), "focused verification failed");
    assert.equal(worktreeClean, true, "verification worktree is dirty");
    fullSuiteRuns += 1;
    assert.equal(fullClean, true, "full suite failed");
    const successorDispositions = focusedEvidence.successorDispositions.map((disposition) => ({
      ...disposition,
      currentBehaviorResults: disposition.currentBehaviorCommands.map((command) => results.find(({ command: candidate }) => candidate === command)),
    }));
    const result = {
      mode: range.mode,
      source: range.source,
      baseline: range.baseline,
      head: range.head,
      members: members.map(({ issue, candidate }) => ({ issue, candidate })),
      commands: focusedEvidence.commands,
      results,
      successorDispositions,
    };
    if (range.mode === "already-pushed") return { schema: "range_verified:v1", ...result };
    const ready = createPushReadyReceipt({
      target: range.targetRef,
      baseline: range.baseline,
      head: range.head,
      members: result.members,
      coverage: [...new Set(contributionSets.flatMap((commits) => [...commits]))]
        .map((commit) => ({ commit, source: "member contribution" })),
      commands: result.commands,
      results: result.results,
      successorDispositions: result.successorDispositions,
    });
    git("notes", "--ref=refs/notes/matt-push-ready", "add", "-m", JSON.stringify(ready), range.head);
    return JSON.parse(git("notes", "--ref=refs/notes/matt-push-ready", "show", range.head));
  };

  try {
    writeFileSync(join(repo, "base.txt"), "base\n");
    git("add", "base.txt");
    git("commit", "-m", "base");
    const baseline = git("rev-parse", "HEAD");

    writeFileSync(join(repo, "plan.md"), "sealed plan\n");
    git("add", "plan.md");
    git("commit", "-m", "planning seal");
    const planningSeal = git("rev-parse", "HEAD");

    const retiredScript = "retired-preservation.mjs";
    const retiredTest = "retired-preservation.test.mjs";
    const activeTest = "active-contract.test.mjs";
    const retiredScriptCommand = `node --check ${retiredScript}`;
    const retiredTestCommand = `node --check ${retiredTest}`;
    const mixedRetirementCommand = `node --test ${retiredTest} ${activeTest}`;
    const ambiguousPathCommand = "node --check $TARGET";
    const emptyPathCommand = "node --check $EMPTY_PATH";
    for (const command of ["test:shared", "test:a", "test:b"]) commandFacts.set(command, { kind: "non-path" });
    commandFacts.set(retiredScriptCommand, { kind: "path", requiredPaths: [retiredScript] });
    commandFacts.set(retiredTestCommand, { kind: "path", requiredPaths: [retiredTest] });
    commandFacts.set(mixedRetirementCommand, { kind: "path", requiredPaths: [retiredTest, activeTest] });
    commandFacts.set(ambiguousPathCommand, { kind: "ambiguous" });
    commandFacts.set(emptyPathCommand, { kind: "path", requiredPaths: [] });
    git("checkout", "-b", "issue-a", planningSeal);
    writeFileSync(join(repo, "prerequisite-a.sql"), "SELECT 'APPLIED';\n");
    git("add", "prerequisite-a.sql");
    git("commit", "-m", "prerequisite A");
    const prerequisiteCandidateA = git("rev-parse", "HEAD");
    const prerequisiteBlobA = git("rev-parse", `${prerequisiteCandidateA}:prerequisite-a.sql`);
    writeFileSync(join(repo, "a.txt"), "A\n");
    writeFileSync(join(repo, retiredScript), "export const preserved = true;\n");
    writeFileSync(join(repo, retiredTest), "export const covered = true;\n");
    writeFileSync(join(repo, activeTest), "export const active = true;\n");
    git("add", "a.txt", retiredScript, retiredTest, activeTest);
    git("commit", "-m", "issue A");
    const candidateA = git("rev-parse", "HEAD");

    git("checkout", "-b", "issue-b", candidateA);
    writeFileSync(join(repo, "b.txt"), "B\n");
    rmSync(join(repo, retiredScript));
    rmSync(join(repo, retiredTest));
    git("add", "-A");
    git("commit", "-m", "issue B");
    const candidateB = git("rev-parse", "HEAD");
    git("checkout", "target");
    git("merge", "--ff-only", candidateB);
    const verifiedHead = git("rev-parse", "target");

    git("checkout", "-b", "open-outside", baseline);
    writeFileSync(join(repo, "open.txt"), "concurrent\n");
    git("add", "open.txt");
    git("commit", "-m", "open outside range");
    const openCandidate = git("rev-parse", "HEAD");

    git("checkout", "-b", "closed-outside", baseline);
    writeFileSync(join(repo, "closed.txt"), "missing\n");
    git("add", "closed.txt");
    git("commit", "-m", "closed outside range");
    const closedCandidate = git("rev-parse", "HEAD");
    git("checkout", "target");

    const completion = ({ candidate, issue, baseline: issueBaseline = baseline, commands, manualAttestations = [], successorEvidence }) => ({
      kind: "implementation_complete",
      issue,
      target: "target",
      topicBranch: `issue-${issue.toLowerCase()}`,
      worktree: `C:/tmp/issue-${issue.toLowerCase()}`,
      baseline: issueBaseline,
      candidate,
      planningSeal,
      operationIdentity: deriveExecuteIssueOperationIdentity({
        repositoryId: "github:ron03wlb/skills",
        specId: "aggregate-spec",
        approvedPublicationIdentity: `sha256:${"7".repeat(64)}`,
        issueId: issue,
      }),
      manualAttestations,
      standardsReview: { candidate, result: "clean" },
      specReview: { candidate, result: "clean" },
      verification: {
        candidate,
        commands,
        results: commands.map((command) => ({ command, result: "pass" })),
        ...(successorEvidence ? { successorEvidence } : {}),
      },
    });
    const successA = completion({
      candidate: candidateA,
      issue: "A",
      baseline: planningSeal,
      commands: ["test:shared", "test:a", retiredScriptCommand, retiredTestCommand, mixedRetirementCommand, ambiguousPathCommand, emptyPathCommand],
      manualAttestations: [{
        kind: "manual_prerequisite_complete:v2",
        identity: "attestation-A-v2",
        issue: "A",
        candidate: prerequisiteCandidateA,
        blob: prerequisiteBlobA,
        artifact: "prerequisite-a.sql",
        outcome: "APPLIED",
      }],
    });
    const successB = completion({
      candidate: candidateB,
      issue: "B",
      baseline: planningSeal,
      commands: ["test:shared", "test:b"],
      manualAttestations: [{
        kind: "manual_prerequisite_complete:v1",
        identity: "attestation-B-v1",
        issue: "B",
        artifact: "legacy-b.sql",
        generated: false,
      }],
      successorEvidence: { absentPaths: [retiredScript, retiredTest], currentBehaviorCommands: ["test:b"] },
    });
    const successOpen = completion({ candidate: openCandidate, issue: "OPEN-OUTSIDE", commands: ["test:open"] });
    const successClosed = completion({ candidate: closedCandidate, issue: "CLOSED-OUTSIDE", commands: ["test:closed"] });
    const completeIssues = [
      { id: "A", state: "CLOSED", execution: [successA] },
      { id: "B", state: "CLOSED", retirements: [{ criterion: "AC-6", paths: [retiredScript, retiredTest] }], execution: [successB] },
      { id: "OPEN-OUTSIDE", state: "OPEN", execution: [successOpen] },
    ];
    assert.throws(
      () => currentCompletion({
        id: "A",
        execution: [{ ...successA, manualAttestations: [{ ...successA.manualAttestations[0], blob: planningSeal }] }],
      }),
      /mismatched v2 blob/u,
    );
    assert.throws(
      () => currentCompletion({
        id: "LEGACY-GENERATED",
        execution: [completion({
          candidate: candidateB,
          issue: "LEGACY-GENERATED",
          commands: ["test:legacy"],
          manualAttestations: [{
            kind: "manual_prerequisite_complete:v1",
            identity: "attestation-generated-v1",
            issue: "LEGACY-GENERATED",
            artifact: "generated.sql",
            generated: true,
          }],
        })],
      }),
      /legacy v1 cannot authorize generated content/u,
    );
    const replaceSuccessorEvidence = (successorEvidence) => completeIssues.map((issue) => issue.id === "B"
      ? { ...issue, execution: [{ ...successB, verification: { ...successB.verification, successorEvidence } }] }
      : issue);

    assert.throws(() => selectRange({ mode: "local-ahead", upstreamTips: [] }), /unique upstream/u);
    assert.throws(() => selectRange({ mode: "local-ahead", upstreamTips: [baseline, planningSeal] }), /unique upstream/u);
    assert.throws(() => selectRange({ mode: "local-ahead", upstreamTips: [verifiedHead] }), /non-empty/u);
    assert.throws(() => selectRange({ mode: "already-pushed", base: baseline, head: verifiedHead }), /must be explicit/u);

    for (const source of ["merge-request", "pull-request", "exact-range"]) {
      const selected = selectRange({ mode: "already-pushed", source, base: baseline, head: verifiedHead });
      assert.equal(selected.head, verifiedHead);
    }

    const successorInspections = [
      { command: retiredScriptCommand },
      { command: retiredTestCommand },
    ];
    const explicitRange = selectRange({ mode: "already-pushed", source: "exact-range", base: baseline, head: verifiedHead });
    const rangeResult = runGate({ range: explicitRange, issues: completeIssues, successorInspections });
    assert.equal(rangeResult.schema, "range_verified:v1");
    assert.deepEqual(rangeResult.commands, ["test:shared", "test:a", mixedRetirementCommand, ambiguousPathCommand, emptyPathCommand, "test:b"]);
    assert.deepEqual(rangeResult.results, rangeResult.commands.map((command) => ({ command, result: "pass" })));
    assert.equal(rangeResult.successorDispositions.length, 2);
    assert.deepEqual(
      rangeResult.successorDispositions[0],
      {
        origins: [{ issue: "A", candidate: candidateA }],
        command: retiredScriptCommand,
        retiredPaths: [retiredScript],
        successor: { issue: "B", candidate: candidateB },
        acceptanceCriteria: "AC-6",
        absenceProof: [retiredScript, retiredTest],
        currentBehaviorCommands: ["test:b"],
        currentBehaviorResults: [{ command: "test:b", result: "pass" }],
      },
    );
    assert.equal(git("notes", "--ref=refs/notes/matt-push-ready", "list"), "", "already-pushed mode must not write push_ready");
    assert.equal(fullSuiteRuns, 1, "one invocation runs the full suite once");

    const localRange = selectRange({ mode: "local-ahead", upstreamTips: [baseline] });
    const members = freezeMembers({ issues: completeIssues, range: localRange });
    assert.deepEqual(members.map(({ issue }) => issue), ["A", "B"], "open unreachable candidate stays outside the frozen range");
    const [contributionA, contributionB] = proveCoverage({ range: localRange, members });
    assert.ok([...contributionA].some((commit) => contributionB.has(commit)), "overlapping contributions are valid");

    assert.throws(
      () => freezeMembers({ issues: [{ id: "A", state: "OPEN", execution: [{ ...successA, target: "another-target" }] }], range: localRange }),
      /reachable member is still open/u,
    );
    assert.throws(
      () => freezeMembers({ issues: [...completeIssues, { id: "CLOSED-OUTSIDE", state: "CLOSED", execution: [successClosed] }], range: localRange }),
      /closed candidate is unreachable/u,
    );
    assert.throws(
      () => freezeMembers({ issues: [{ id: "A", state: "CLOSED", execution: [successA, { kind: "implementation_blocked", invalidatesCandidate: true }] }], range: localRange }),
      /candidate-invalidating state/u,
    );
    assert.throws(
      () => freezeMembers({ issues: [{ id: "A", state: "CLOSED", execution: [{ ...successA, baseline: undefined }] }], range: localRange }),
      /missing baseline/u,
    );
    for (const field of ["issue", "worktree", "planningSeal", "manualAttestations", "standardsReview", "specReview", "verification"]) {
      assert.throws(
        () => freezeMembers({ issues: [{ id: "A", state: "CLOSED", execution: [{ ...successA, [field]: undefined }] }], range: localRange }),
        new RegExp(`missing ${field}`, "u"),
      );
    }
    assert.throws(
      () => freezeMembers({
        issues: [{ id: "A", state: "CLOSED", execution: [{ ...successA, standardsReview: { candidate: candidateB, result: "clean" } }] }],
        range: localRange,
      }),
      /mismatched standardsReview candidate/u,
    );
    assert.throws(
      () => freezeMembers({ issues: [{ id: "A", state: "CLOSED", execution: [{ ...successA, issue: "OTHER" }] }], range: localRange }),
      /mismatched Issue identity/u,
    );
    assert.throws(
      () => freezeMembers({
        issues: [{ id: "A", state: "CLOSED", execution: [{ ...successA, verification: { ...successA.verification, candidate: candidateB } }] }],
        range: localRange,
      }),
      /mismatched verification candidate/u,
    );
    assert.doesNotThrow(() => freezeMembers({ issues: [{ id: "A", state: "CLOSED", execution: [successA, { kind: "aggregate_blocked", invalidatesCandidate: false }] }], range: localRange }));

    assert.throws(() => runGate({ range: localRange, issues: completeIssues, standardsClean: false }), /Standards review failed/u);
    assert.throws(() => runGate({ range: localRange, issues: completeIssues, specClean: false }), /Spec review failed/u);
    assert.throws(() => runGate({ range: localRange, issues: completeIssues, focusedClean: false }), /focused verification failed/u);
    assert.throws(() => runGate({ range: localRange, issues: completeIssues, fullClean: false }), /full suite failed/u);
    assert.throws(() => runGate({ range: localRange, issues: completeIssues, worktreeClean: false }), /worktree is dirty/u);
    assert.throws(
      () => runGate({ range: localRange, issues: completeIssues, successorInspections: [{ command: ambiguousPathCommand }] }),
      /missing or ambiguous path extraction/u,
    );
    assert.throws(
      () => runGate({ range: localRange, issues: completeIssues, successorInspections: [{ command: emptyPathCommand }] }),
      /missing or ambiguous path extraction/u,
    );
    assert.throws(
      () => runGate({ range: localRange, issues: completeIssues, successorInspections: [{ command: mixedRetirementCommand }] }),
      /missing or ambiguous explicit successor retirement/u,
    );
    assert.throws(
      () => collectFocusedEvidence({
        members: freezeMembers({ issues: completeIssues, range: localRange }).map((member) => member.issue === "B"
          ? { ...member, candidate: planningSeal, verification: { ...member.verification, candidate: planningSeal } }
          : member),
        issues: completeIssues,
        successorInspections: [{ command: retiredScriptCommand }],
      }),
      /missing or ambiguous explicit successor retirement/u,
    );
    assert.throws(
      () => runGate({ range: localRange, issues: completeIssues, successorInspections: [{ command: "test:a" }] }),
      /non-path-specific command cannot be superseded/u,
    );
    assert.throws(
      () => runGate({
        range: localRange,
        issues: replaceSuccessorEvidence(undefined),
        successorInspections: [{ command: retiredScriptCommand }],
      }),
      /missing successor proof/u,
    );
    assert.throws(
      () => runGate({
        range: localRange,
        issues: replaceSuccessorEvidence({ ...successB.verification.successorEvidence, absentPaths: [] }),
        successorInspections: [{ command: retiredScriptCommand }],
      }),
      /missing absence proof/u,
    );
    assert.throws(
      () => runGate({
        range: localRange,
        issues: replaceSuccessorEvidence({ ...successB.verification.successorEvidence, currentBehaviorCommands: [] }),
        successorInspections: [{ command: retiredScriptCommand }],
      }),
      /missing current-behavior proof/u,
    );

    git("checkout", "-b", "unexplained", verifiedHead);
    writeFileSync(join(repo, "unexplained.txt"), "not covered\n");
    git("add", "unexplained.txt");
    git("commit", "-m", "unexplained material commit");
    const unexplainedHead = git("rev-parse", "HEAD");
    const unexplainedRange = selectRange({ mode: "already-pushed", source: "exact-range", base: baseline, head: unexplainedHead });
    assert.throws(() => runGate({ range: unexplainedRange, issues: completeIssues }), /unexplained material commit/u);
    git("checkout", "target");

    const ready = runGate({ range: localRange, issues: completeIssues, successorInspections });
    assert.equal(ready.schema, "push_ready:v1");
    assert.equal(ready.head, verifiedHead);
    assert.deepEqual(ready.members.map(({ issue }) => issue), ["A", "B"]);
    assert.deepEqual(ready.commands, ["test:shared", "test:a", mixedRetirementCommand, ambiguousPathCommand, emptyPathCommand, "test:b"]);
    assert.deepEqual(ready.results, ready.commands.map((command) => ({ command, result: "pass" })));
    assert.deepEqual(ready.successorDispositions.map(({ command }) => command), [retiredScriptCommand, retiredTestCommand]);
    writeFileSync(join(repo, "drift.txt"), "target moved\n");
    git("add", "drift.txt");
    git("commit", "-m", "target drift");
    assert.notEqual(git("rev-parse", "target"), ready.head, "target movement invalidates push readiness");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("installed route consumes push_ready through one exact non-force push", () => {
  const publicSkill = read("skills/engineering/push-target/SKILL.md");
  const skill = `${publicSkill}\n${read("skills/engineering/push-target/references/push-delivery-interfaces.md")}`;
  const metadata = read("skills/engineering/push-target/agents/openai.yaml");
  const docs = read("docs/engineering/push-target.md");

  assert.match(skill, /^disable-model-invocation:\s*true$/mu);
  assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(metadata, /explicitly named target branch.*current local-ahead push_ready/isu);
  assert.doesNotMatch(metadata, /features\/ron/iu);
  assert.doesNotMatch(skill, /^description:\s*Use when\b/mu);
  assert.match(skill, /named existing local target branch.*exact local `HEAD`.*refs\/notes\/matt-push-ready.*exactly one.*push_ready:v1/isu);
  assert.match(skill, /mode.*local-ahead.*target.*baseline.*verified target SHA.*member.*evidence.*current.*HEAD/isu);
  assert.match(skill, /missing.*duplicate.*malformed.*stale.*mismatched.*already-pushed.*ambiguous.*stops? before.*remote mutation/isu);
  assert.match(skill, /unique configured upstream.*fetch.*immediately before.*receipt baseline.*fetched upstream tip.*local target `HEAD`.*receipt target SHA/isu);
  assert.match(skill, /fetch URL.*push URL.*same.*single endpoint/isu);
  assert.match(skill, /fetch.*--no-tags.*exact.*upstream ref.*remote-tracking ref/isu);
  assert.match(skill, /baseline.*ancestor.*`V`.*non-empty/isu);
  assert.match(skill, /ref drift.*receipt drift.*stops? before push/isu);
  assert.match(skill, /one ordinary non-force push.*exact verified local target.*configured upstream ref/isu);
  assert.match(skill, /git push --no-follow-tags <frozen-push-url> refs\/heads\/<target>:<upstream-ref>/u);
  assert.match(skill, /frozen push URL.*remote alias.*push\.followTags/isu);
  assert.match(skill, /read.*remote ref.*exact receipt target SHA.*success/isu);
  assert.match(skill, /rejection.*transport failure.*remote mismatch.*post-push ambiguity.*unresolved delivery.*never.*retry/isu);
  assert.match(skill, /never.*pull.*merge.*rebase.*force-push.*receipt rewrite.*automatic reverification.*deploy/isu);
  assert.match(skill, /never changes product files.*commits.*branches.*worktrees.*Issues.*labels.*completion notes.*verification evidence/isu);
  assert.match(plainMarkdown(docs), /agent won't reach for it on its own/iu);
  assert.match(docs, /push_ready.*fetch.*ordinary non-force push.*remote read-back/isu);
  assert.match(docs, /## What it does.*## When to reach for it.*## Where it fits/isu);

  for (const name of ["execute-issue", "close-issue", "verify-target-before-push"]) {
    assert.match(read(`skills/engineering/${name}/SKILL.md`), /never[^.]*push/isu, `${name} must remain non-pushing`);
  }
  for (const path of ["skills/engineering/ask-matt/SKILL.md", "docs/engineering/ask-matt.md"]) {
    assert.match(read(path), /verify-target-before-push.*push_ready.*push-target.*ordinary non-force push.*reads?.*remote ref.*back/isu);
  }

  const { repo, rawGit, git, isAncestor } = createGitFixture("skills-push-target-fixture-");
  const remote = mkdtempSync(join(tmpdir(), "skills-push-target-remote-"));
  execFileSync("git", ["init", "--bare", remote], { encoding: "utf8" });

  const selectReceipt = ({ receipts, target, currentHead }) => {
    assert.equal(receipts.length, 1, "exactly one push_ready receipt is required");
    const [receipt] = receipts;
    assert.equal(receipt?.schema, "push_ready:v1", "receipt schema is malformed");
    assert.equal(receipt.mode, "local-ahead", "only local-ahead receipts are pushable");
    assert.equal(receipt.target, target, "receipt target mismatch");
    assert.match(receipt.baseline, /^[0-9a-f]{40}$/u, "receipt baseline is malformed");
    assert.match(receipt.head, /^[0-9a-f]{40}$/u, "receipt verified target SHA is malformed");
    assert.equal(receipt.head, currentHead, "receipt is stale for current target HEAD");
    assert.ok(
      Array.isArray(receipt.members)
        && receipt.members.length > 0
        && receipt.members.every((member) => member
          && (typeof member.issue === "string" || Number.isInteger(member.issue))
          && /^[0-9a-f]{40}$/u.test(member.candidate)),
      "receipt member structure is malformed",
    );
    assert.ok(
      Array.isArray(receipt.reconciliationRecords)
        && receipt.reconciliationRecords.every((identity) => typeof identity === "string" && identity.length > 0),
      "receipt reconciliation identities are malformed",
    );
    assert.ok(
      Array.isArray(receipt.directTargetContributions)
        && receipt.directTargetContributions.every((identity) => typeof identity === "string" && identity.length > 0),
      "receipt Direct target contribution identities are malformed",
    );
    assert.ok(
      Array.isArray(receipt.coverage)
        && receipt.coverage.length > 0
        && receipt.coverage.every((entry) => entry
          && /^[0-9a-f]{40}$/u.test(entry.commit)
          && typeof entry.source === "string"
          && entry.source.length > 0),
      "receipt coverage evidence is malformed",
    );
    assert.equal(receipt.standards, "clean", "receipt Standards evidence is not clean");
    assert.equal(receipt.spec, "clean", "receipt Spec evidence is not clean");
    assert.ok(
      Array.isArray(receipt.commands)
        && receipt.commands.length > 0
        && receipt.commands.every((command) => typeof command === "string" && command.length > 0)
        && new Set(receipt.commands).size === receipt.commands.length,
      "receipt commands are malformed",
    );
    assert.ok(
      Array.isArray(receipt.results)
        && receipt.results.length === receipt.commands.length
        && receipt.results.every(({ command, result }, index) => command === receipt.commands[index] && result === "pass"),
      "receipt results are not exact passing command evidence",
    );
    assert.ok(
      Array.isArray(receipt.successorDispositions)
        && receipt.successorDispositions.every((disposition) => disposition
          && typeof disposition.command === "string"
          && Array.isArray(disposition.origins)
          && disposition.origins.length > 0
          && disposition.origins.every((origin) => origin
            && (typeof origin.issue === "string" || Number.isInteger(origin.issue))
            && /^[0-9a-f]{40}$/u.test(origin.candidate))
          && Array.isArray(disposition.retiredPaths)
          && disposition.retiredPaths.length > 0
          && disposition.successor
          && (typeof disposition.successor.issue === "string" || Number.isInteger(disposition.successor.issue))
          && /^[0-9a-f]{40}$/u.test(disposition.successor.candidate)
          && typeof disposition.acceptanceCriteria === "string"
          && Array.isArray(disposition.absenceProof)
          && Array.isArray(disposition.currentBehaviorCommands)
          && disposition.currentBehaviorCommands.length > 0
          && Array.isArray(disposition.currentBehaviorResults)
          && disposition.currentBehaviorResults.length === disposition.currentBehaviorCommands.length
          && disposition.currentBehaviorResults.every(({ command, result }, index) => command === disposition.currentBehaviorCommands[index] && result === "pass")),
      "receipt Successor verification evidence is malformed",
    );
    assert.equal(receipt.worktree, "clean", "receipt worktree evidence is not clean");
    return receipt;
  };

  const gitValues = (...args) => {
    try {
      const output = git(...args);
      return output === "" ? [] : output.split(/\r?\n/u);
    } catch {
      return [];
    }
  };

  const configuredUpstreams = () => {
    const remoteNames = gitValues("config", "--get-all", "branch.target.remote");
    const remoteRefs = gitValues("config", "--get-all", "branch.target.merge");
    return remoteNames.flatMap((remoteName) => remoteRefs.flatMap((remoteRef) => {
      if (remoteName === "." || !remoteRef.startsWith("refs/heads/")) return [];
      const fetchUrls = gitValues("remote", "get-url", "--all", remoteName);
      const pushUrls = gitValues("remote", "get-url", "--push", "--all", remoteName);
      return fetchUrls.flatMap((fetchUrl) => pushUrls.map((pushUrl) => ({
        remote: remoteName,
        remoteRef,
        fetchUrl,
        pushUrl,
        trackingRef: `refs/remotes/${remoteName}/${remoteRef.replace(/^refs\/heads\//u, "")}`,
      })));
    }));
  };

  const validateFetchedGate = ({ receipt, frozenReceiptText, currentReceiptText, frozenUpstreams, currentUpstreams, fetchedTip, targetHead }) => {
    assert.equal(currentReceiptText, frozenReceiptText, "receipt drift after fetch");
    assert.deepEqual(currentUpstreams, frozenUpstreams, "upstream or ref drift after fetch");
    assert.equal(fetchedTip, receipt.baseline, "upstream drift or already-pushed receipt");
    assert.equal(targetHead, receipt.head, "local target drift");
    assert.equal(isAncestor(receipt.baseline, receipt.head), true, "receipt baseline is not an ancestor");
    assert.notEqual(receipt.baseline, receipt.head, "receipt range is empty");
  };

  const validatePostPush = ({ receipt, frozenReceiptText, currentReceiptText, frozenUpstreams, currentUpstreams, targetHead, remoteHeads }) => {
    assert.equal(currentReceiptText, frozenReceiptText, "post-push receipt drift is ambiguous");
    assert.deepEqual(currentUpstreams, frozenUpstreams, "post-push upstream or ref drift is ambiguous");
    assert.equal(targetHead, receipt.head, "post-push local target drift is ambiguous");
    assert.equal(remoteHeads.length, 1, "remote read-back is missing or ambiguous");
    assert.equal(remoteHeads[0], receipt.head, "remote read-back mismatch leaves unresolved delivery");
  };

  const deliver = ({
    performPush,
    readReceiptText,
    readUpstreams = configuredUpstreams,
    readRemoteHeads,
  } = {}) => {
    const target = "target";
    const currentHead = git("rev-parse", target);
    const frozenReceiptText = readReceiptText?.() ?? git("notes", "--ref=refs/notes/matt-push-ready", "show", currentHead);
    let parsedReceipt;
    try {
      parsedReceipt = JSON.parse(frozenReceiptText);
    } catch {
      throw new Error("receipt is malformed");
    }
    const receipt = selectReceipt({
      receipts: Array.isArray(parsedReceipt) ? parsedReceipt : [parsedReceipt],
      target,
      currentHead,
    });
    const frozenUpstreams = readUpstreams();
    assert.equal(frozenUpstreams.length, 1, "target must have one unique configured upstream");
    const [upstream] = frozenUpstreams;
    assert.equal(upstream.fetchUrl, upstream.pushUrl, "fetch and push URL must be the same single endpoint");
    git("fetch", "--no-tags", upstream.fetchUrl, `${upstream.remoteRef}:${upstream.trackingRef}`);
    validateFetchedGate({
      receipt,
      frozenReceiptText,
      currentReceiptText: readReceiptText?.() ?? git("notes", "--ref=refs/notes/matt-push-ready", "show", currentHead),
      frozenUpstreams,
      currentUpstreams: readUpstreams(),
      fetchedTip: git("rev-parse", upstream.trackingRef),
      targetHead: git("rev-parse", target),
    });
    try {
      if (performPush) performPush();
      else rawGit("push", "--no-follow-tags", upstream.pushUrl, `refs/heads/${target}:${upstream.remoteRef}`);
    } catch {
      throw new Error("unresolved delivery after one rejected or failed push");
    }
    const remoteOutput = git("ls-remote", "--refs", upstream.pushUrl, upstream.remoteRef);
    validatePostPush({
      receipt,
      frozenReceiptText,
      currentReceiptText: readReceiptText?.() ?? git("notes", "--ref=refs/notes/matt-push-ready", "show", currentHead),
      frozenUpstreams,
      currentUpstreams: readUpstreams(),
      targetHead: git("rev-parse", target),
      remoteHeads: readRemoteHeads?.() ?? (remoteOutput === "" ? [] : remoteOutput.split(/\r?\n/u).map((line) => line.split(/\s+/u)[0])),
    });
    return receipt.head;
  };

  try {
    writeFileSync(join(repo, "base.txt"), "base\n");
    git("add", "base.txt");
    git("commit", "-m", "base");
    const baseline = git("rev-parse", "HEAD");
    git("remote", "add", "origin", remote);
    git("push", "-u", "origin", "target");

    writeFileSync(join(repo, "verified.txt"), "verified\n");
    git("add", "verified.txt");
    git("commit", "-m", "verified target");
    const head = git("rev-parse", "HEAD");
    const unrelated = git("commit-tree", git("rev-parse", "HEAD^{tree}"), "-m", "unrelated baseline");
    const receipt = createPushReadyReceipt({
      target: "target",
      baseline,
      head,
      members: [{ issue: "30", candidate: head }],
      coverage: [{ commit: head, source: "Issue 30" }],
      commands: ["node --test tests/ron-workflow/*.test.mjs"],
      results: [{ command: "node --test tests/ron-workflow/*.test.mjs", result: "pass" }],
    });
    git("notes", "--ref=refs/notes/matt-push-ready", "add", "-m", JSON.stringify(receipt), head);
    git("tag", "-a", "remote-only", baseline, "-m", "remote-only tag");
    rawGit("push", "origin", "refs/tags/remote-only:refs/tags/remote-only");
    git("tag", "-d", "remote-only");
    git("tag", "-a", "local-only", head, "-m", "local-only tag");
    git("config", "push.followTags", "true");
    rawGit("push", "origin", `${baseline}:refs/heads/other`);
    const upstreams = configuredUpstreams();

    assert.throws(() => selectReceipt({ receipts: [], target: "target", currentHead: head }), /exactly one/u);
    assert.throws(() => selectReceipt({ receipts: [receipt, receipt], target: "target", currentHead: head }), /exactly one/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, schema: "range_verified:v1" }], target: "target", currentHead: head }), /schema is malformed/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, mode: "already-pushed" }], target: "target", currentHead: head }), /local-ahead/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, target: "other" }], target: "target", currentHead: head }), /target mismatch/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, head: baseline }], target: "target", currentHead: head }), /stale/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, members: [null] }], target: "target", currentHead: head }), /member structure/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, reconciliationRecords: [null] }], target: "target", currentHead: head }), /reconciliation identities/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, directTargetContributions: [null] }], target: "target", currentHead: head }), /Direct target contribution identities/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, coverage: [null] }], target: "target", currentHead: head }), /coverage evidence/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, results: [] }], target: "target", currentHead: head }), /exact passing command evidence/u);
    assert.throws(
      () => selectReceipt({ receipts: [{ ...receipt, results: [{ command: "another command", result: "pass" }] }], target: "target", currentHead: head }),
      /exact passing command evidence/u,
    );
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, successorDispositions: null }], target: "target", currentHead: head }), /Successor verification evidence/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, successorDispositions: [{ command: "incomplete" }] }], target: "target", currentHead: head }), /Successor verification evidence/u);
    assert.throws(() => deliver({ readReceiptText: () => "not-json" }), /receipt is malformed/u);
    assert.throws(() => deliver({ readReceiptText: () => JSON.stringify([receipt, receipt]) }), /exactly one/u);
    assert.throws(() => deliver({ readUpstreams: () => [] }), /unique configured upstream/u);
    assert.throws(() => deliver({ readUpstreams: () => [...upstreams, ...upstreams] }), /unique configured upstream/u);
    assert.ok(upstreams[0].fetchUrl.length > 0 && upstreams[0].pushUrl.length > 0, "upstream URL identities must be frozen");
    assert.throws(
      () => deliver({
        readUpstreams: () => [{ ...upstreams[0], pushUrl: `${upstreams[0].pushUrl}-split` }],
        performPush: () => {},
        readRemoteHeads: () => [head],
      }),
      /fetch and push URL.*same.*endpoint/u,
    );
    git("config", "--add", "branch.target.remote", "origin");
    assert.equal(configuredUpstreams().length, 2, "multi-valued branch config must remain ambiguous");
    assert.throws(() => deliver(), /unique configured upstream/u);
    git("config", "--replace-all", "branch.target.remote", "origin");
    const receiptText = JSON.stringify(receipt);
    const fetchedGate = {
      receipt,
      frozenReceiptText: receiptText,
      currentReceiptText: receiptText,
      frozenUpstreams: upstreams,
      currentUpstreams: upstreams,
      fetchedTip: baseline,
      targetHead: head,
    };
    assert.throws(() => validateFetchedGate({ ...fetchedGate, fetchedTip: head }), /upstream drift/u);
    assert.throws(() => validateFetchedGate({ ...fetchedGate, targetHead: baseline }), /local target drift/u);
    assert.throws(
      () => validateFetchedGate({ ...fetchedGate, receipt: { ...receipt, baseline: unrelated }, fetchedTip: unrelated }),
      /not an ancestor/u,
    );
    assert.throws(
      () => validateFetchedGate({ ...fetchedGate, receipt: { ...receipt, baseline: head }, fetchedTip: head }),
      /range is empty/u,
    );
    assert.throws(
      () => validateFetchedGate({ ...fetchedGate, currentReceiptText: JSON.stringify({ ...receipt, commands: ["drifted"] }) }),
      /receipt drift after fetch/u,
    );
    assert.throws(
      () => validateFetchedGate({ ...fetchedGate, currentUpstreams: [{ ...upstreams[0], remoteRef: "refs/heads/drifted" }] }),
      /upstream or ref drift after fetch/u,
    );
    assert.throws(
      () => validateFetchedGate({ ...fetchedGate, currentUpstreams: [{ ...upstreams[0], fetchUrl: "drifted" }] }),
      /upstream or ref drift after fetch/u,
    );

    let rejectionAttempts = 0;
    assert.throws(
      () => deliver({ performPush: () => { rejectionAttempts += 1; throw new Error("rejected"); } }),
      /unresolved delivery/u,
    );
    assert.equal(rejectionAttempts, 1, "push rejection must not be retried");

    let mismatchAttempts = 0;
    assert.throws(
      () => deliver({ performPush: () => { mismatchAttempts += 1; }, readRemoteHeads: () => [baseline] }),
      /remote read-back mismatch/u,
    );
    assert.equal(mismatchAttempts, 1, "remote mismatch must not trigger another push");
    const postPushGate = {
      receipt,
      frozenReceiptText: receiptText,
      currentReceiptText: receiptText,
      frozenUpstreams: upstreams,
      currentUpstreams: upstreams,
      targetHead: head,
      remoteHeads: [head],
    };
    assert.throws(() => validatePostPush({ ...postPushGate, remoteHeads: [] }), /missing or ambiguous/u);
    assert.throws(() => validatePostPush({ ...postPushGate, remoteHeads: [head, head] }), /missing or ambiguous/u);
    assert.throws(
      () => validatePostPush({ ...postPushGate, targetHead: baseline }),
      /post-push local target drift/u,
    );
    assert.throws(
      () => validatePostPush({ ...postPushGate, currentReceiptText: JSON.stringify({ ...receipt, commands: ["drifted"] }) }),
      /post-push receipt drift/u,
    );
    assert.throws(
      () => validatePostPush({ ...postPushGate, currentUpstreams: [{ ...upstreams[0], remoteRef: "refs/heads/drifted" }] }),
      /post-push upstream or ref drift/u,
    );
    assert.throws(
      () => validatePostPush({ ...postPushGate, currentUpstreams: [{ ...upstreams[0], pushUrl: "drifted" }] }),
      /post-push upstream or ref drift/u,
    );

    const before = {
      branch: git("branch", "--show-current"),
      note: git("notes", "--ref=refs/notes/matt-push-ready", "show", head),
      status: git("status", "--porcelain=v1"),
      localTags: git("tag", "--list"),
      remoteOnlyTag: git("ls-remote", "--refs", "origin", "refs/tags/remote-only"),
      unrelatedRemoteBranch: git("ls-remote", "--refs", "origin", "refs/heads/other"),
    };
    assert.equal(deliver(), head);
    assert.equal(git("ls-remote", "--refs", "origin", "refs/heads/target").split(/\s+/u)[0], head);
    assert.deepEqual(
      {
        branch: git("branch", "--show-current"),
        note: git("notes", "--ref=refs/notes/matt-push-ready", "show", head),
        status: git("status", "--porcelain=v1"),
        localTags: git("tag", "--list"),
        remoteOnlyTag: git("ls-remote", "--refs", "origin", "refs/tags/remote-only"),
        unrelatedRemoteBranch: git("ls-remote", "--refs", "origin", "refs/heads/other"),
      },
      before,
      "delivery must preserve local branch, receipt, files, and clean state",
    );
    assert.equal(git("ls-remote", "--refs", "origin", "refs/tags/local-only"), "", "push must not follow local tags");

    let alreadyPushedAttempts = 0;
    assert.throws(
      () => deliver({ performPush: () => { alreadyPushedAttempts += 1; } }),
      /already-pushed/u,
    );
    assert.equal(alreadyPushedAttempts, 0, "already-pushed evidence stops before another push");
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  }
});

test("setup-ron is retired and remove-ron is a narrow user-invoked cleanup", () => {
  assert.equal(existsSync("skills/engineering/setup-ron"), false);
  assert.equal(existsSync("docs/engineering/setup-ron.md"), false);

  const skill = read("skills/engineering/remove-ron/SKILL.md");
  const metadata = read("skills/engineering/remove-ron/agents/openai.yaml");
  assert.match(skill, /disable-model-invocation: true/u);
  assert.match(metadata, /allow_implicit_invocation: false/u);
  assert.match(skill, /docs\/agents\/ron-workflow\.md/u);
  assert.match(skill, /\.git\/ron-workflow/u);
  for (const term of ["workflow-local-lifecycle-authorization:v1", "workflow-authorization:v1", "workflow-clean-path-delegation:v1", "drafts/", "executions/", "ownership/", "git worktree list --porcelain"]) {
    assert.match(skill, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.match(skill, /inactive only when every check.*negative/isu);
  assert.match(skill, /unknown file.*ambiguous.*stop/isu);
  assert.match(skill, /dirty overlap.*stop/isu);
  assert.match(skill, /ambiguous ownership.*stop/isu);
  assert.match(skill, /local cleanup commit/iu);
  for (const term of ["Wiki", "Issues", "branches", "worktrees", "installed skills"]) {
    assert.match(skill, new RegExp(`does not delete[^.]*${term}`, "isu"));
  }
  assert.match(skill, /no push, remote merge, or deploy/iu);
});

test("retired Ron skills and contract scripts are gone", () => {
  assert.equal(existsSync("scripts/ron-workflow/ron-wiki.mjs"), false);
  for (const name of ["ask-ron", "to-spec-ron", "to-tickets-ron"]) {
    assert.equal(existsSync(`skills/engineering/${name}/SKILL.md`), false);
    assert.equal(existsSync(`docs/engineering/${name}.md`), false);
  }
  for (const path of [
    "skills/engineering/to-spec-ron/scripts/ron-command-file.mjs",
    "skills/engineering/to-spec-ron/scripts/ron-contracts.mjs",
    "skills/engineering/to-tickets-ron/scripts/ron-command-file.mjs",
    "skills/engineering/execute-issue/scripts/ron-command-file.mjs",
    "skills/engineering/close-issue/scripts/ron-command-file.mjs",
  ]) assert.equal(existsSync(path), false, `stale Ron executable ${path}`);
  assert.equal(existsSync("skills/engineering/wiki/scripts/wiki-validate.mjs"), true);
  assert.doesNotMatch(read("skills/engineering/execute-issue/SKILL.md"), /scripts\/ron-workflow|ron-command-file/u);
  assert.doesNotMatch(read("skills/engineering/close-issue/SKILL.md"), /scripts\/ron-workflow|ron-command-file/u);
});

test("GitLab tracker guidance uses current machine-readable glab output", () => {
  const gitlab = read("skills/engineering/setup-matt-pocock-skills/issue-tracker-gitlab.md");

  assert.match(gitlab, /glab issue view <number> --comments.*--output json/u);
  assert.match(gitlab, /glab issue list --output json/u);
  assert.match(gitlab, /glab mr list --output json/u);
  assert.match(gitlab, /Frontier query.*glab issue list --output json/u);
  assert.doesNotMatch(gitlab, /-[FO] json/u);
  assert.match(gitlab, /glab api projects\/:id\/issues\/:iid\/notes/u);
  assert.doesNotMatch(gitlab, /envelope-verify|tracker_adapter: gitlab/u);
});

test("installed route diagnostics expose owning seams without setup authority", () => {
  const setup = read("skills/engineering/setup-matt-pocock-skills/SKILL.md");
  const diagnosticsPath = "skills/engineering/setup-matt-pocock-skills/installed-workflow-diagnostics.md";
  const setupDocs = read("docs/engineering/setup-matt-pocock-skills.md");
  const setupMetadata = read("skills/engineering/setup-matt-pocock-skills/agents/openai.yaml");

  assert.equal(existsSync(diagnosticsPath), true, "setup must ship its installed-workflow diagnostic contract");
  const diagnostics = read(diagnosticsPath);
  assert.match(setup, /installed workflow.*diagnostic.*installed-workflow-diagnostics\.md/isu);
  assert.match(diagnostics, /read-only.*diagnostic.*never authorizes.*publication.*execution.*integration.*verification.*push/isu);
  for (const seam of [
    "configured tracker",
    "triage labels",
    "operation-scoped producer store",
    "producer handoff",
    "target reader",
    "shared target writer",
    "deterministic operation identity",
    "repository close lease",
    "per-Run execution capacity",
    "public skill surfaces",
  ]) {
    assert.match(diagnostics, new RegExp(seam, "iu"), `missing installed ${seam} diagnostic`);
  }
  assert.match(diagnostics, /owning source.*observed evidence.*smallest human action/isu);
  assert.match(diagnostics, /triage labels.*tracker.*read-only.*label.*list.*every configured.*exists/isu);
  assert.match(read("skills/engineering/setup-matt-pocock-skills/issue-tracker-github.md"), /gh label list --json name/iu);
  assert.match(read("skills/engineering/setup-matt-pocock-skills/issue-tracker-gitlab.md"), /glab label list --output json/iu);
  assert.match(read("skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md"), /no separate label registry.*non-empty.*unique.*Status/isu);
  assert.match(setupDocs, /installed workflow diagnostics/iu);
  assert.match(setupDocs, /read-only/iu);
  assert.match(setupDocs, /deterministic operation identity.*repository close lease.*per-Run execution capacity/isu);
  assert.match(setupDocs, /missing or unknown seam.*owning source/isu);
  assert.match(setupMetadata, /short_description: "[^"]*diagnos[^"]*workflow[^"]*"/iu);

  assert.match(read("skills/engineering/to-spec/SKILL.md"), /references\/spec-publication-interfaces\.md/u);
  assert.match(read("skills/engineering/to-tickets/SKILL.md"), /references\/decomposition-publication-interfaces\.md/u);
  assert.match(read("skills/personal/run-issue-workflow/SKILL.md"), /run-authority-adapters\.mjs.*run-workflow\.mjs/isu);
  assert.match(read("skills/engineering/verify-target-before-push/SKILL.md"), /references\/aggregate-verification-interfaces\.md/u);
  assert.match(read("skills/engineering/push-target/SKILL.md"), /references\/push-delivery-interfaces\.md/u);
  assert.match(read("skills/engineering/ask-matt/SKILL.md"), /grill-with-docs.*to-spec.*to-tickets.*run-issue-workflow.*verify-target-before-push.*push-target/isu);
});

test("installed route keeps payload and recovery detail behind one cross-seam consumer fixture", () => {
  const verify = read("skills/engineering/verify-target-before-push/SKILL.md");
  const aggregateInterfaces = read("skills/engineering/verify-target-before-push/references/aggregate-verification-interfaces.md");
  const recoveryPath = "skills/engineering/verify-target-before-push/references/aggregate-recovery-interfaces.md";
  const push = read("skills/engineering/push-target/SKILL.md");
  const pushInterfaces = read("skills/engineering/push-target/references/push-delivery-interfaces.md");
  const coreTests = read("tests/ron-workflow/run-issue-workflow-core.test.mjs");
  const endToEndTests = read("tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs");
  const installedScenario = endToEndTests.slice(
    endToEndTests.indexOf('test("installed route'),
    endToEndTests.indexOf('test("installed route proves real close leaf concurrency'),
  );

  assert.equal(existsSync(recoveryPath), true, "aggregate recovery must have one owner-local reference");
  const recoveryInterfaces = read(recoveryPath);
  assert.doesNotMatch(verify, /In clean temporary worktrees at the exact affected execution baseline/iu);
  assert.match(recoveryInterfaces, /In clean temporary worktrees at the exact affected execution baseline/iu);
  assert.doesNotMatch(verify, /For every member require the completion note's exact Issue identity/iu);
  assert.match(aggregateInterfaces, /For every member require the completion note's exact Issue identity/iu);
  assert.doesNotMatch(push, /member Issue and candidate identities.*Successor verification evidence/isu);
  assert.match(pushInterfaces, /member Issue and candidate identities.*Successor verification evidence/isu);

  assert.doesNotMatch(coreTests, /test\("installed route keeps concurrent Spec operations/iu);
  for (const requiredSeam of ["createWorkflowControlStore", "runToSpec", "runReadyHandoffFromProducer", "producerHandoffAdapter", "Promise.all"]) {
    assert.match(installedScenario, new RegExp(requiredSeam.replace(".", "\\."), "u"), `installed scenario omits ${requiredSeam}`);
  }
  assert.match(installedScenario, /reasonCode: "TARGET_MOVED"[^]*targetReconfirmed/iu);
  assert.doesNotMatch(installedScenario, /runReadyHandoff:\s*readyHandoffFor/iu);
});

test("installed route proof uses real close leaves and filesystem stores across repositories", () => {
  const endToEndTests = read("tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs");
  const start = endToEndTests.indexOf(
    'test("installed route proves real close leaf concurrency and same-command resume recovery"',
  );
  const end = endToEndTests.indexOf('test("end-to-end closeout contention', start);

  assert.notEqual(start, -1, "the installed real-close scenario must exist");
  assert.ok(end > start, "the installed real-close scenario must have one bounded fixture");
  const scenario = endToEndTests.slice(start, end);
  for (const requiredSeam of [
    "createStoreFixture",
    "symlinkSync",
    "realpathSync",
    "pathToFileURL",
    "createInstalledRunStore",
    "createInstalledWorkflowRuntime",
    "acquireInstalledCloseIssueLeases",
    "Promise.all",
    "maxParallel",
    "repository_close_lease_wait_coordinator_lost",
    "retryCount",
    "operationId",
  ]) {
    assert.match(scenario, new RegExp(requiredSeam, "u"), `installed real-close proof omits ${requiredSeam}`);
  }
  assert.match(scenario, /different targets.*same Git common directory/isu);
  assert.match(scenario, /different Git common directories.*overlap/isu);
  assert.match(scenario, /same command.*fresh evidence/isu);
  assert.doesNotMatch(scenario, /\.acquireRepositoryCloseLease\(/u);
});

test("router exposes the Issue worktree flow and independent controls", () => {
  const matt = readAskMattContract();
  assert.match(matt, /`\/wiki`/u);
  assert.match(matt, /`\/remove-ron`/u);
  assert.match(matt, /`\/pre-execute-issue/u);
  assert.match(matt, /`\/execute-issue`/u);
  assert.match(matt, /`\/close-issue`/u);
  assert.match(matt, /`\/verify-target-before-push/iu);
  assert.match(matt, /`\/push-target/iu);
  assert.match(matt, /`\/grilling`/u);
  assert.match(matt, /`\/explain-decision`/u);
  assert.match(matt, /Single-Issue Tracker Spec.*`\/run-issue-workflow`.*Multi-Issue Tracker Spec.*`\/to-tickets`.*Standalone Spec.*`\/implement`/isu);
  assert.match(matt, /Issue worktrees may run concurrently/iu);
  assert.match(matt, /close-issue.*exact candidate.*recorded Issue target branch.*removes.*closes/isu);
  assert.match(matt, /Planning lanes and Issue worktrees may run concurrently.*only.*Planning Seal write.*closeout.*target mutation writer/isu);
  assert.match(matt, /Published Tracker Specs route.*authorized coordinator.*direct human invocation.*individual.*leaves.*DAG Run Grant/isu);
  assert.match(matt, /coordinator.*does not create.*broaden.*leaf.*authority/isu);
  assert.match(matt, /Multi-Issue parent.*every exact child.*closed.*reachable/isu);
  assert.match(matt, /Before push.*verify-target-before-push.*local-ahead.*completion notes.*already-pushed.*explicit.*range.*aggregate review.*verification once/isu);
  assert.match(matt, /push_ready.*push-target.*unique configured upstream.*ordinary non-force push.*reads?.*remote ref.*back/isu);
  assert.match(matt, /to-spec.*sole authority.*Single-Issue.*Multi-Issue/isu);
  assert.doesNotMatch(matt, /ask-ron|to-spec-ron|to-tickets-ron/u);

  const mattDocs = read("docs/engineering/ask-matt.md");
  assert.match(mattDocs, /Planning lanes and Issue worktrees may run concurrently.*only.*Planning Seal writes.*closeout.*target mutation writer/isu);
  assert.match(mattDocs, /Published Tracker Specs route.*authorized coordinator.*individual.*leaves.*direct human invocation.*DAG Run Grant/isu);
  assert.match(mattDocs, /same command.*Multi-Issue parent.*every exact child.*closed.*reachable/isu);
  assert.match(mattDocs, /verify-target-before-push.*local-ahead.*completion-note.*already-pushed.*explicit.*range.*aggregate/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    const readme = read(path);
    assert.match(readme, /execute-issue.*preserving completion across recorded-target movement/iu);
    assert.match(readme, /close-issue.*three idempotent actions.*recorded target.*Multi-Issue parent/iu);
  }

  const context = read("CONTEXT.md");
  assert.match(context, /Target mutation serialization.*only one planning or delivery operation.*one target branch.*other targets remain concurrent/isu);
  assert.match(context, /Target integration serialization.*close-issue.*one integration writer.*Issue target branch.*human.*authorized .*DAG Run/isu);
  assert.doesNotMatch(context, /checks once|parallel target writers/iu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.doesNotMatch(read(path), /run-issue-workflow/iu, `${path} must not promote the personal coordinator`);
  }
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  assert.equal(plugin.skills.some((path) => /run-issue-workflow/iu.test(path)), false, "plugin must not package the personal coordinator");

  for (const name of [
    "ask-matt",
    "wiki",
    "remove-ron",
    "pre-execute-issue",
    "execute-issue",
    "close-issue",
    "verify-target-before-push",
    "push-target",
  ]) {
    const page = read(`docs/engineering/${name}.md`);
    assert.doesNotMatch(page, /\]\((?:\.\/|\.\.\/)/u);
    assert.match(page, /## What it does/u);
    assert.match(page, /## When to reach for it/u);
    assert.match(page, /## Where it fits/u);
    assert.match(page, /https:\/\/aihero\.dev\/skills-ask-matt/u);
  }
});

test("Codex-native workflow coordinator is explicit personal only", () => {
  const skillPath = "skills/personal/run-issue-workflow/SKILL.md";
  const metadataPath = "skills/personal/run-issue-workflow/agents/openai.yaml";
  const runtimePath = "skills/personal/run-issue-workflow/scripts/run-workflow.mjs";
  const authorityAdaptersPath = "skills/personal/run-issue-workflow/scripts/run-authority-adapters.mjs";
  const corePath = "skills/personal/run-issue-workflow/scripts/run-core.mjs";
  const coordinatorPath = "skills/personal/run-issue-workflow/scripts/run-coordinator.mjs";
  const operatorPath = "skills/personal/run-issue-workflow/OPERATOR.md";
  assert.equal(existsSync(skillPath), true);
  assert.equal(existsSync(metadataPath), true);
  assert.equal(existsSync(runtimePath), true);
  assert.equal(existsSync(authorityAdaptersPath), true);
  assert.equal(existsSync(corePath), true);
  assert.equal(existsSync(coordinatorPath), true);
  assert.equal(existsSync(operatorPath), true);

  const skill = readRunIssueWorkflowContract();
  const skillEntry = read(skillPath);
  const lifecycle = read("skills/personal/run-issue-workflow/references/coordinator-lifecycle.md");
  const metadata = read(metadataPath);
  const runtime = read(runtimePath);
  const authorityAdapters = read(authorityAdaptersPath);
  const core = read(corePath);
  const coordinator = read(coordinatorPath);
  const operator = read(operatorPath);
  const journal = read("skills/personal/run-issue-workflow/scripts/run-journal.mjs");
  const executionBudget = read("skills/personal/run-issue-workflow/scripts/issue-execution-budget.mjs");
  const storeSource = read("skills/personal/run-issue-workflow/scripts/run-store.mjs");
  const leaseHealth = read("skills/personal/run-issue-workflow/scripts/lease-health.mjs");
  const hostEvidence = read("docs/agents/codex-host-driver-evidence.md");
  assert.match(skill, /^disable-model-invocation:\s*true$/mu);
  assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(skill, /READY.*INCOMPLETE.*UNKNOWN/isu);
  assert.match(skill, /Pause.*Resume.*Stop/isu);
  assert.match(read("skills/personal/README.md"), /\[run-issue-workflow\]\(\.\/run-issue-workflow\/SKILL\.md\).*producer handoff.*READY.*concurrent.*bounded.*writer.*panel/isu);
  assert.match(skill, /`\/run-issue-workflow <Spec-ID>`.*exact Spec.*no-argument.*one unique non-terminal Run.*otherwise.*no workflow action/isu);
  assert.match(skill, /immutable Run identity.*exact Spec.*target.*classification.*approved scope.*decomposition identity/isu);
  assert.match(skill, /DAG Run Grant.*`max_parallel`.*default three/isu);
  assert.match(skill, /repository-owned.*`run-authority-adapters\.mjs`.*owning sources.*checkpoint.*handoff.*tracker.*Decomposition.*target.*shared writer.*callers.*never.*invent `handoff\.read`/isu);
  assert.match(skill, /Fresh Single-Issue.*`to-spec`.*publication.*handoff.*Fresh Multi-Issue.*`to-tickets`.*upstream publication.*upstream handoff.*operation receipt.*`decomposition:v1`.*digest.*mapping.*blocker edges.*frozen.*profile-v1.*record identities/isu);
  assert.match(skill, /`READY` requires.*Spec.*target.*Planning Seal.*classification.*approved-scope identity.*producer.*handoff.*transaction.*tracker.*identities.*known target state.*decomposition identity.*current Multi-Issue.*operation.*tracker read-back/isu);
  assert.match(skill, /current Single-Issue handoff.*exact transaction identity.*publication read-back/isu);
  assert.match(skill, /`INCOMPLETE` requires.*exact consistent.*transaction.*profile.*Planning Seal.*classification.*approved-scope identity.*baseline.*transaction identity.*first unsatisfied stage.*current producer.*never owns target dirt.*frozen.*initially-clean state.*plan path.*generated-content identity.*exact `\/<producer> <Spec-ID>` retry command.*next owner.*retry predicates.*before any Run mutation/isu);
  assert.match(skill, /`UNKNOWN` covers.*missing.*unreadable.*malformed.*contradictory.*multiple.*stale.*drifted.*legacy plan-only.*dirty-target-without-owner.*identity-ambiguous.*stable reason code.*exact observed checkpoint and handoff producer.*Spec.*target.*Planning Seal.*classification.*scope.*record.*decomposition.*no-automatic-transition.*recovery predicates/isu);
  assert.match(skill, /both `READY` and actionable `INCOMPLETE`.*live selected reconciliation.*mismatch.*`UNKNOWN`.*conflicting field.*observed handoff value.*expected selected value.*never return a retry command for stale producer authority/isu);
  assert.match(skill, /does not revalidate.*producer generation.*generated-content hashes.*whole-commit.*v1 record semantics.*producer review.*tests.*aggregate coverage.*retry correctness/isu);
  assert.match(skill, /before `onSelected`.*non-`READY`.*read-only cleanup preview.*cannot apply cleanup.*engine or target writer.*Grant.*panel.*task.*leaf.*tracker or Git/isu);
  assert.match(core, /RUN_READY_FACT_SCHEMA.*run-ready-handoff-facts:v1.*RUN_READY_RESULT_SCHEMA.*run-ready-handoff:v1.*reduceRunReadyHandoff/isu);
  assert.match(runtime, /authoritySources.*createRunAuthorityAdapters.*createCoordinator.*authorityAdapters\.handoff/isu);
  assert.match(authorityAdapters, /sources\.tracker.*sources\.reconciliation.*sources\.target.*sources\.checkpoint.*sources\.handoff.*sources\.writer.*observeTargetMutationWriter.*RUN_READY_FACT_SCHEMA/isu);
  assert.match(authorityAdapters, /provesInactiveWriter.*closeWriterReclaimable.*targetState: current\.authorityReadBack\.target\.state.*targetOwnership: current\.authorityReadBack\.target\.ownership/isu);
  assert.match(coordinator, /handoff\.read\(\{.*tracker: trackerResult\.snapshot.*current.*reduceRunReadyHandoff\(runReadyFacts\).*planningSeal.*state !== "READY".*runReadyStop.*onSelected/isu);
  assert.match(coordinator, /\["READY", "INCOMPLETE"\]\.includes.*selected_authority_conflict.*retryCommand: null.*selectedAuthorityConflict.*field: mismatch.*observed.*expected/isu);
  assert.match(core, /targetOwnership.*EXACT_PRODUCER/isu);
  assert.match(core, /currentProfile.*checkpoint\.profileVersion.*v2.*frozenProfile.*checkpoint\.planPath.*checkpoint\.generatedContentIdentity/isu);
  assert.match(core, /handoffPlanningSeal.*handoffApprovedScopeHash.*handoffUpstreamPublicationIdentity.*handoffUpstreamHandoffIdentity.*handoffDecompositionDigest/isu);
  assert.match(core, /operationReceipt.*transactionIdentity.*stageReceipts.*decompositionReadBack.*readyStateReadBack.*decompositionMapping.*blockerEdges/isu);
  assert.match(core, /currentProfile.*classification === "SINGLE".*publicationReadBack.*handoff\.transactionIdentity.*handoff\.publicationIdentity.*handoff\.trackerIdentity/isu);
  assert.match(lifecycle, /saved Git project.*executable Issue.*sidebar-visible child Codex task.*`worktree` environment.*recorded target branch/isu);
  assert.match(lifecycle, /`execute-issue` verifies and adopts that same worktree.*prerequisite lane is adopted instead/isu);
  assert.match(skill, /Never create a duplicate live lane/iu);
  assert.match(skill, /`execute-issue` owns its dedicated Issue worktree/iu);
  assert.match(skill, /`implementation_complete` triggers serialized `close-issue`/iu);
  assert.match(skillEntry, /Release dependants only after the candidate is reachable from the Issue target branch.*exact worktree is absent.*Issue is closed/isu);
  assert.match(lifecycle, /reacquire.*candidate reachability from the Issue target branch.*Only candidate reachability from the Issue target branch.*release dependants/isu);
  assert.match(skill, /node success.*release dependants/iu);
  assert.match(skill, /All-child node success triggers.*parent-only close/iu);
  assert.match(skill, /close_parent.*evidence-bound parent-only `close-issue` leaf.*real leaf owns.*repository-then-target lease order/isu);
  assert.match(skill, /close_issue.*current target state and exact HEAD.*exact tracker identity.*candidate commit.*completion evidence ID\/body hash.*registered worktree identity/isu);
  assert.match(skill, /close_parent.*current target state and exact HEAD.*exact parent tracker state and identity.*every child's exact close authority evidence/isu);
  assert.match(skill, /published blocker edges alone.*ready frontier.*never infer.*path.*symbol.*module/isu);
  assert.match(skill, /at most three dispatch attempts.*Technical.*failed integration bypass blind dispatch retries.*isolated diagnosis.*Scope conflicts.*authority mismatch.*contradictory evidence/isu);
  assert.match(skill, /accepted retry follow-up.*same Run, Issue, and next attempt.*without sending the prompt again/isu);
  assert.match(skill, /5, 15, and 30 second.*tracker.*probe.*retry budget/isu);
  assert.match(skill, /restart.*selector-known Run identity and node set.*preserve.*affected nodes.*anonymous outage/isu);
  assert.match(skill, /`Selector\.open\(\)`.*Unable to establish loopback connection.*`gradle-loopback-safe`.*one.*process-local.*cycle/isu);
  assert.match(skill, /On every entry.*reacquire/isu);
  assert.match(skill, /stale engine writer.*exact reconciled `INACTIVE` owner evidence.*active operation.*fenced and stop/isu);
  assert.match(skill, /accepted `close-issue` follow-up.*task history.*already in flight.*never send the same close request again/isu);
  assert.match(skill, /manual `implementation_complete`.*no journaled task reference.*adopt one uniquely matching.*Zero or multiple.*structured diagnosis.*never creates or guesses/isu);
  assert.match(skill, /real `close-issue` leaf alone acquires the repository close lease and then the target mutation writer.*coordinator only observes.*never acquires, releases, reclaims, or delegates/isu);
  assert.match(skill, /healthy repository close-lease contention.*`WAITING_FOR_REPOSITORY_CLOSE_LEASE`.*every currently legal Issue dispatch.*repository-close-wait\.started.*repository-close-wait\.settled.*execution slot or retry/isu);
  assert.match(skill, /tracker identity\/state.*target HEAD\/state.*candidate commit\/reachability.*completion evidence ID\/body SHA-256\/state.*registered worktree identity\/state.*control revision/isu);
  assert.match(skill, /healthy target-writer contention retains.*`WAITING_FOR_TARGET_WRITER`.*`target-writer-wait\.\*`/isu);
  assert.match(skill, /cumulative six-hour execution budget.*implementation retry.*conflict repair.*verification.*independent review.*retry.*task replacement.*transport restart.*explicit re-entry.*Verified healthy dependency or writer waiting is excluded/isu);
  assert.match(skill, /At the cumulative six-hour boundary.*`execution\.exhausted`.*`execution_timeout`.*stop scheduling new execution, repair, retry, or close.*original task.*worktree.*candidate.*receipts.*late native outcomes.*Do not force-kill/isu);
  assert.match(lifecycle, /`execution\.started`.*`execution\.observed`.*monotonic clock.*native `durationMs`.*`execution\.uncertain`.*never remove proved elapsed/isu);
  assert.match(lifecycle, /`ISSUE_EXECUTION_LIMIT_MS`.*six hours.*smaller.*15-second.*remaining budget.*`execution\.exhausted`.*Other independent nodes retain their legal actions/isu);
  assert.match(operator, /cumulative six-hour execution budget.*healthy dependency and writer waits are excluded.*beyond twelve hours.*`execution_timeout`.*does not force-kill.*claim cancellation/isu);
  assert.match(journal, /ISSUE_EXECUTION_LIMIT_MS\s*=\s*6 \* 60 \* 60 \* 1000.*execution\.started.*execution\.observed.*execution\.uncertain.*execution\.exhausted/isu);
  for (const evidence of [/monotonicNow/u, /nativeDurationMs/u, /MONOTONIC_OR_NATIVE_ELAPSED_UNAVAILABLE/u,
    /recordExhaustion/u, /remainingMs/u]) assert.match(executionBudget, evidence);
  assert.match(core, /executionTimeout: "execution_timeout".*executionBudget.*EXHAUSTED.*do not authorize execution, repair, retry, or close dispatch/isu);
  assert.match(storeSource, /BOUNDED_OBSERVATION_RECOVERY_DELAYS_MS.*5000, 15000, 30000.*createBoundedObservationFault/isu);
  assert.match(leaseHealth, /sameLeaseOwner.*OWNER_CHANGED.*HEARTBEAT_AGE_OR_CLOCK_UNKNOWN.*PROCESS_CONFIRMED_ABSENT.*PROCESS_LIVENESS_UNKNOWN.*EXACT_OWNER_GENERATION_HEALTHY/isu);
  assert.match(lifecycle, /beyond twelve hours.*5\/15\/30-second.*`OWNER_HEALTH_UNKNOWN`.*`UNKNOWN` is not `INACTIVE`.*never permits release, reclaim, cancellation, or duplicate close dispatch/isu);
  assert.match(hostEvidence, /Issue 87.*six hours.*15 seconds.*twelve virtual hours.*no real Windows six-hour execution or twelve-hour contention soak/isu);
  assert.match(skill, /unknown repository-close or target-writer ownership.*coordinator loss.*changed immutable authority.*Recoverable blocker.*smallest human action.*same `\/run-issue-workflow` retry/isu);
  assert.match(core, /REPOSITORY_CLOSE_WAIT_TIMEOUT_MS\s*=\s*30_000/iu);
  assert.match(core, /WAITING_FOR_REPOSITORY_CLOSE_LEASE/iu);
  assert.match(core, /wait_repository_close_lease/iu);
  assert.match(core, /WAITING_FOR_TARGET_WRITER.*wait_target_writer.*TARGET_WRITER_WAIT_TIMEOUT_MS/isu);
  assert.match(core, /createRecoverableOperatorPacket.*Recoverable blocker.*owningSource.*observedEvidence.*smallestHumanAction.*preservedStages.*retryCommand/isu);
  assert.match(coordinator, /repository-close-wait\.started.*repository-close-wait\.settled.*target-writer-wait\.started.*target-writer-wait\.settled/isu);
  assert.doesNotMatch(coordinator, /acquireRepositoryCloseLease|acquireTargetMutationWriter|reclaimTargetMutationWriter/iu);
  for (const outcome of ["OWNER_CHANGED", "OWNER_HEALTH_UNKNOWN", "CONTROL_CHANGED", "COORDINATOR_INACTIVE", "EVIDENCE_CHANGED"]) {
    assert.match(coordinator, new RegExp(`outcome: "${outcome}"`, "u"));
  }
  for (const evidence of [
    /tracker evidence/iu,
    /registered worktree evidence from Git/iu,
    /`implementation_complete`/u,
    /Codex task lifecycle/iu,
    /append-only run journal/iu,
  ]) assert.match(skill, evidence);
  assert.match(skill, /Re-entry.*without duplicate/isu);
  assert.match(skill, /`run-workflow\.mjs`.*single composition.*first valid.*status projection.*opens.*panel.*without a second Start/isu);
  assert.match(skill, /Pause.*Resume.*Stop.*same active engine writer.*Refresh.*read-only/isu);
  assert.match(skill, /paused coordinator.*same bridge active.*Resume.*Stop.*same panel/isu);
  assert.match(skill, /exact explicit.*unique no-argument selection.*reconciled identity validation.*cleanup preview.*applies.*terminal-Run sweep.*selected Run.*protected from deletion.*Zero or ambiguous.*only.*preview.*no cleanup mutation.*cleanupPreview: true.*without deletion/isu);
  assert.match(skill, /bridge.*closes.*status.*journal.*cleanup preview.*cleanup result.*inspectable/isu);
  assert.match(lifecycle, /panel-open failure.*continues through available text controls.*same writer.*without that control capability.*panel_unavailable.*before task action/isu);
  assert.match(skillEntry, /Explicit Spec or batch selection includes matching completed Runs.*original Grants.*cached `SUCCEEDED`.*no execution, verification or close replay/isu);
  const recovery = read("skills/personal/run-issue-workflow/references/recovery.md");
  const diagnosis = read("docs/agents/references/workflow-stop-diagnosis.md");
  assert.match(diagnosis, /Skill-caused stop.*exact `SKILL.md`.*quote.*instruction.*referenced rule.*observed condition.*interpretation/isu);
  assert.match(diagnosis, /existing authorization.*Changed scope, missing authority, uncertain ownership and concrete host restrictions.*Spec-writing request.*planning\/publication authority only/isu);
  for (const reader of [recovery, read("skills/engineering/execute-issue/SKILL.md"), read("skills/engineering/close-issue/SKILL.md")]) {
    assert.match(reader, /docs\/agents\/references\/workflow-stop-diagnosis\.md/u);
    assert.doesNotMatch(reader, /\.\.\/.*run-issue-workflow\/references\/recovery\.md/u);
  }
  assert.match(recovery, /pending owning results settle.*live native Promise.*driver.*elapsed time.*cannot.*failed delivery/isu);
  assert.match(operator, /GRILL.*Spec.*`\/to-tickets`.*`\/run-issue-workflow <main Issue>`/isu);
  assert.match(operator, /Single-Issue.*Multi-Issue.*no-argument.*unique non-terminal Run/isu);
  assert.match(operator, /Fresh Single-Issue.*`to-spec`.*Fresh Multi-Issue.*`to-tickets`.*upstream publication.*operation receipt.*Decomposition.*digest.*mapping.*blocker edges.*frozen.*profile-v1.*`READY`.*`INCOMPLETE`.*exact `\/to-spec <Spec-ID>` or `\/to-tickets <Spec-ID>`.*`UNKNOWN`.*stable diagnosis/isu);
  assert.match(operator, /Neither state applies cleanup.*writer.*Grant.*panel.*task or leaf.*cleanup preview.*read-only/isu);
  assert.match(operator, /Pause.*Resume.*Stop.*Refresh/isu);
  assert.match(operator, /healthy repository close-lease contention.*`WAITING_FOR_REPOSITORY_CLOSE_LEASE`.*healthy target-writer contention.*`WAITING_FOR_TARGET_WRITER`.*Issue execution.*`max_parallel`.*no Issue execution slot or retry.*reacquires/isu);
  assert.match(operator, /real `close-issue` leaf alone acquires the repository close lease and then the target mutation writer/isu);
  assert.match(operator, /Unknown owner.*coordinator loss.*changed immutable authority.*owning source.*smallest human action.*same `\/run-issue-workflow`/isu);
  assert.match(read("CONTEXT.md"), /DAG run state.*`RECONCILING`.*`RUNNING`.*`WAITING_FOR_REPOSITORY_CLOSE_LEASE`.*`WAITING_FOR_TARGET_WRITER`.*`PAUSING`.*`PAUSED`.*`BLOCKED`.*`STOPPING`.*`STOPPED`.*`SUCCEEDED`/isu);
  assert.match(read("CONTEXT.md"), /real `close-issue` leaf alone acquires the repository close lease and then.*Target mutation serialization.*coordinator observes both.*never acquires, releases, reclaims, or delegates/isu);
  assert.match(read("docs/adr/0040-run-tracker-specs-as-codex-native-dags.md"), /events\.jsonl.*repository-close or target-writer wait starts and settlements/isu);
  assert.match(operator, /exact Run.*identity is reconciled.*retention sweep.*selected Run is protected.*Zero or ambiguous no-argument.*only previews.*cleanupPreview: true.*without deletion/isu);
  assert.match(operator, /status-succeeded\.json.*status-diagnosed\.json/isu);
  for (const name of ["status-succeeded", "status-diagnosed", "status-waiting"]) {
    assert.equal(existsSync(`skills/personal/run-issue-workflow/examples/${name}.json`), true);
  }
  assert.doesNotMatch(skill, /Orca|Codex App Server|push the target|deploy the target|edit shared skills/iu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    assert.doesNotMatch(read(path), /run-issue-workflow/iu);
  }
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  assert.equal(plugin.skills.some((path) => /run-issue-workflow/iu.test(path)), false);
  const packageManifest = JSON.parse(read("package.json"));
  assert.deepEqual(packageManifest.dependencies ?? {}, {});
});

test("changed delivery documentation remains structurally valid", () => {
  for (const path of [
    "README.md",
    "skills/engineering/README.md",
    "skills/engineering/to-spec/SKILL.md",
    "skills/engineering/to-tickets/SKILL.md",
    "skills/engineering/to-tickets/references/decomposition-contract.md",
    "docs/engineering/to-spec.md",
    "docs/engineering/to-tickets.md",
    "skills/engineering/ask-matt/SKILL.md",
    "skills/engineering/ask-matt/references/workflow-routes.md",
    "skills/engineering/wiki/SKILL.md",
    "skills/engineering/remove-ron/SKILL.md",
    "skills/engineering/pre-execute-issue/SKILL.md",
    "skills/engineering/execute-issue/SKILL.md",
    "skills/engineering/execute-issue/references/manual-prerequisites.md",
    "skills/engineering/execute-issue/references/completion-evidence.md",
    "skills/engineering/close-issue/SKILL.md",
    "skills/engineering/verify-target-before-push/SKILL.md",
    "skills/engineering/push-target/SKILL.md",
    "docs/engineering/implement.md",
    "docs/engineering/pre-execute-issue.md",
    "docs/engineering/execute-issue.md",
    "docs/engineering/close-issue.md",
    "docs/engineering/verify-target-before-push.md",
    "docs/engineering/push-target.md",
    "docs/adr/0021-focus-ron-on-local-issue-delivery.md",
    "docs/adr/0022-use-issue-native-execution-and-closeout.md",
    "docs/adr/0023-integrate-issues-independently-and-verify-before-push.md",
    "skills/personal/run-issue-workflow/SKILL.md",
    "skills/personal/run-issue-workflow/references/run-ready-handoff.md",
    "skills/personal/run-issue-workflow/references/coordinator-lifecycle.md",
    "skills/personal/run-issue-workflow/references/recovery.md",
  ]) {
    for (const match of read(path).matchAll(/\]\(([^)]+)\)/gu)) {
      const destination = match[1].replace(/^<|>$/gu, "");
      if (destination.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(destination)) continue;
      const localPath = destination.split("#", 1)[0];
      assert.equal(existsSync(resolve(dirname(path), localPath)), true, `${path} has a broken link to ${destination}`);
    }
  }
});

test("current packaging validation is Codex-native", () => {
  const policyPaths = [
    "AGENTS.md",
    ".agents/adr/0002-ship-as-a-claude-code-plugin.md",
    "research/ron-canonical-wiki-docs-as-code-spec.md",
    "research/matt-first-issue-delivery-workflow-spec.md",
    "superpowers/docs/plans/2026-07-26-173202-01-plan-canonical-wiki-v1.md",
  ];
  for (const path of policyPaths) {
    assert.doesNotMatch(read(path), /claude plugin validate|strict Claude plugin/iu, `${path} still requires Claude CLI validation`);
  }
  assert.match(read("CLAUDE.md"), /node --test tests\/ron-workflow\/skill-contracts\.test\.mjs/u);
  assert.match(read("CLAUDE.md"), /codex exec --ignore-user-config --ephemeral --sandbox read-only/u);
});


test("task prompts stay compact while their owners retain detailed authority", () => {
  for (const path of [
    "skills/engineering/code-review", "skills/engineering/execute-issue",
    "skills/engineering/close-issue", "skills/personal/run-issue-workflow",
  ]) {
    const name = path.split("/").at(-1);
    const prompt = read(`${path}/agents/openai.yaml`).match(/default_prompt: "([^\n]+)"/u)?.[1];
    assert.ok(prompt?.includes(`$${name}`), `${name} prompt must invoke its owner`);
    assert.ok(prompt.split(/\s+/u).length <= 40, `${name} picker prompt repeats the workflow`);
    assert.doesNotMatch(prompt, /workflowArtifacts|legacyCompletionFrontier|contract_adopted|operationIdentity/u);
  }
});

test("planning isolation belongs to accepted document writes, not tracker-only publication", () => {
  const spec = readToSpecContract();
  const interfaces = read("skills/engineering/to-spec/references/spec-publication-interfaces.md");
  assert.match(spec, /tracker-only publication.*empty list.*no planning worktree or lane handoff/isu);
  assert.match(spec, /readPlanningBaseline.*scripts\/planning-entry\.mjs/isu);
  assert.match(interfaces, /adapter\.readCurrent.*must not echo request fields/isu);
  assert.match(interfaces, /adapter\.readLane.*Git registration.*isolation.*ownership.*accepted content/isu);
  assert.match(read("skills/engineering/to-tickets/SKILL.md"), /requires no planning worktree/iu);
  assert.match(read("skills/engineering/execute-issue/SKILL.md"), /retry never resets the budget/iu);
});
