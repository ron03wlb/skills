import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8").replace(/\r\n?/gu, "\n");

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

const createPushReadyReceipt = ({ target, baseline, head, members, coverage, commands, results, successorDispositions = [] }) => ({
  schema: "push_ready:v1",
  mode: "local-ahead",
  target,
  baseline,
  head,
  members,
  coverage,
  standards: "clean",
  spec: "clean",
  commands,
  results,
  successorDispositions,
  worktree: "clean",
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

  assert.match(skill, /committed candidate.*git diff <fixed-point>\.\.\.HEAD/isu);
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
test("planning artifacts are sealed before tracker work becomes executable", () => {
  const spec = read("skills/engineering/to-spec/SKILL.md");
  const tickets = read("skills/engineering/to-tickets/SKILL.md");
  const implement = read("skills/engineering/implement/SKILL.md");
  const execute = read("skills/engineering/execute-issue/SKILL.md");
  const context = read("CONTEXT.md");
  const specDocs = read("docs/engineering/to-spec.md");
  const ticketsDocs = read("docs/engineering/to-tickets.md");
  const matt = read("skills/engineering/ask-matt/SKILL.md");
  const mattDocs = read("docs/engineering/ask-matt.md");
  const deliveryAdr = read("docs/adr/0022-use-issue-native-execution-and-closeout.md");
  const successorAdrPath = "docs/adr/0023-integrate-issues-independently-and-verify-before-push.md";
  assert.equal(existsSync(successorAdrPath), true, "delivery routing needs a successor ADR");
  const successorAdr = read(successorAdrPath);
  assert.match(deliveryAdr, /^status: superseded by ADR-0038$/mu, "ADR-0022 must defer to the current delivery workflow");
  assert.match(successorAdr, /^status: superseded by ADR-0038$/mu, "ADR-0023 must defer to the current delivery workflow");

  const specSeal = spec.indexOf("Planning Seal");
  const specPublish = spec.indexOf("Publish the Spec", specSeal);
  assert.equal(specSeal !== -1 && specPublish > specSeal, true, "to-spec must seal planning artifacts before publish");
  const specRetryRecovery = spec.indexOf("Before classifying the current delta on a retry");
  const specNoDeltaSelection = spec.indexOf("If there is no relevant planning-artifact delta");
  assert.equal(specRetryRecovery !== -1 && specRetryRecovery < specNoDeltaSelection, true, "to-spec must recover a partial-publication seal before no-delta selection");
  assert.match(spec, /partial-publication state.*verified Planning Seal.*reuse it.*never replace.*current target `HEAD`/isu);
  assert.match(spec, /no relevant planning-artifact delta.*do not create an empty commit/isu);
  assert.match(spec, /exact approved paths or hunks.*preserv(?:e|ing) unrelated/isu);
  assert.match(spec, /cannot be isolated from unrelated work.*stop/isu);
  assert.doesNotMatch(spec, /delta contains unrelated work.*stop/isu);
  assert.match(spec, /existing Spec.*revision.*update the same tracker Spec.*do not create a duplicate/isu);
  assert.match(spec, /create or update.*label.*read-back.*full SHA.*partial state.*do not amend, reset, or roll back/isu);
  assert.match(specDocs, /failure.*full SHA.*retry.*prior partial-state report.*missing or conflicting evidence stops/isu);
  assert.match(spec, /read only the matching template.*references\/single-issue-template\.md.*references\/multi-issue-template\.md.*Do not load the unused/isu);
  const singleTemplate = read("skills/engineering/to-spec/references/single-issue-template.md");
  const multiTemplate = read("skills/engineering/to-spec/references/multi-issue-template.md");
  assert.match(singleTemplate, /Planning baseline.*Mode: <primary or revision>.*Commit:.*Seal:/su, "Single-Issue template omits revision lineage");
  assert.match(singleTemplate, /Shape: Single-Issue.*User Outcomes.*Acceptance Criteria.*Implementation Plan.*Verification.*`\/execute-issue <Spec-ID>`/su);
  assert.match(multiTemplate, /Shape: Multi-Issue.*Overall Outcome.*Cross-Issue Constraints.*Decomposition Rationale.*`\/to-tickets <Spec-ID>`/su);
  assert.doesNotMatch(multiTemplate, /## Acceptance Criteria|## Implementation Plan|## Verification/u);
  assert.doesNotMatch(singleTemplate + multiTemplate, /extremely extensive|## User Stories|## Implementation Decisions/iu);
  assert.match(spec, /sole authority.*Single-Issue.*Multi-Issue/isu);
  assert.match(spec, /repository evidence.*automatic.*one blocking question.*recommendation/isu);
  assert.match(spec, /User Outcomes.*at most three/isu);
  assert.match(spec, /every Acceptance Criterion.*Implementation Plan step.*Verification.*every Implementation Plan step.*Acceptance Criterion/isu);
  assert.match(spec, /Single-Issue.*`\/execute-issue <Spec-ID>`.*Multi-Issue.*`\/to-tickets <Spec-ID>`/isu);
  for (const [name, skill] of [["to-spec", spec], ["to-tickets", tickets]]) {
    assert.match(skill, /otherwise stop.*tell the human to invoke `\/setup-matt-pocock-skills`/isu, `${name} must not invoke a user-invoked setup skill`);
  }

  const ticketsSeal = tickets.indexOf("Planning Seal");
  const ticketsPublish = tickets.indexOf("Publish Executable Issues", ticketsSeal);
  assert.equal(ticketsSeal !== -1 && ticketsPublish > ticketsSeal, true, "to-tickets must validate or advance the seal before publish");
  assert.match(tickets, /no relevant planning-artifact delta.*reuse/isu);
  assert.match(tickets, /in-Spec.*successor Planning Seal/isu);
  assert.match(tickets, /public behavior, acceptance, target, or exclusion.*stop.*tell the human to invoke `\/to-spec`/isu);
  assert.match(tickets, /do not modify.*parent/isu);
  const inheritedSealCheck = tickets.indexOf("Validate the inherited Planning Seal");
  const successorSeal = tickets.indexOf("successor Planning Seal");
  assert.equal(inheritedSealCheck !== -1 && inheritedSealCheck < successorSeal, true, "to-tickets must validate inherited lineage before a successor");
  assert.match(tickets, /inherited Planning Seal.*exist locally.*ancestor of the target.*before.*successor/isu);
  const retryRecovery = tickets.indexOf("Before classifying the current delta on a retry");
  const noDeltaSelection = tickets.indexOf("If there is no relevant planning-artifact delta");
  assert.equal(retryRecovery !== -1 && retryRecovery < noDeltaSelection, true, "to-tickets must recover a partial-publication seal before no-delta selection");
  assert.match(tickets, /partial-publication state.*verified Planning Seal.*reuse it.*never fall back to the inherited seal/isu);
  assert.match(tickets, /report its full SHA with the partial state/isu);
  const childContract = tickets.match(/<child-contract>(.*?)<\/child-contract>/su)?.[1] ?? "";
  assert.match(childContract, /Parent.*Decomposition key.*What to build/su, "canonical child contract omits stable identity");
  assert.match(childContract, /Planning baseline.*Commit:.*Seal: <created, successor, or reused>/su, "canonical child contract has an incomplete Planning baseline");
  assert.match(childContract, /Acceptance Criteria.*Implementation Plan.*Verification.*Blocked by/su, "canonical child contract is not directly executable");
  assert.match(childContract, /Covers: AC-/u, "canonical child contract omits inline AC mapping");
  assert.doesNotMatch(tickets, /<local-issue-template>|<issue-template>/u, "tracker adapters must not fork the canonical child contract");
  assert.match(tickets, /Read each published Issue back.*Planning baseline.*blocking/isu);
  assert.match(tickets, /consume.*classification.*never reclassif.*Multi-Issue/isu);
  assert.match(tickets, /`\/execute-issue <Issue-ID>`.*only for the dependency-ready frontier/isu);
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
  assert.match(implement, /Tracker Spec.*`\/execute-issue`/isu);
  assert.match(successorAdr, /supersedes:.*0022/iu);
  assert.match(successorAdr, /integration candidate.*push_ready/isu);
  for (const [path, content] of [
    ["skills/engineering/ask-matt/SKILL.md", matt],
    ["docs/engineering/ask-matt.md", mattDocs],
  ]) {
    assert.match(content, /to-spec.*sole.*Single-Issue.*Multi-Issue/isu, path + " duplicates or hides delivery classification");
    assert.match(content, /Tracker Spec.*`\/execute-issue`.*Standalone Spec.*`\/implement`/isu, path + " routes execution incorrectly");
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

test("to-tickets reconciles one Issue decomposition before tracker mutation", () => {
  const tickets = read("skills/engineering/to-tickets/SKILL.md");

  assert.match(tickets, /immutable `<Spec-ID>\/<NN>` Decomposition key.*titles are never identity/isu);
  const discovery = tickets.indexOf("Discover every tracker-supported identity source");
  const mutation = tickets.indexOf("Publish missing children");
  assert.equal(discovery !== -1 && mutation > discovery, true, "identity discovery must finish before publication mutation");
  assert.match(tickets, /## 3\. Reconcile and Publish Executable Issues/u);
  assert.match(tickets, /zero matches.*create exactly one.*one matching Issue.*reuse.*more than one.*stop without mutation/isu);
  assert.match(tickets, /body.*parent.*target.*Planning Seal.*executable contract.*native parent.*blocking relation.*all.*agree/isu);
  assert.match(tickets, /conflict.*stop without mutation.*never automatically repair/isu);
  assert.match(tickets, /owned blocker graph.*acyclic.*before any mutation/isu);
  assert.match(tickets, /External blocker.*readable.*never creates, edits, closes, or assumes ownership/isu);
  assert.match(tickets, /one canonical child contract.*Local tracker.*real issue tracker.*native parent.*blocking/isu);
  assert.match(tickets, /native relationship write or read-back failure.*bind.*exact child identity.*Decomposition key.*expected absent relationship.*failed read-back/isu);
  assert.match(tickets, /prior partial-publication state.*exact child.*key.*expected relation.*Complete.*only an absent native relationship.*conflicting relation.*stops without mutation/isu);
});

test("to-tickets publishes one recoverable decomposition record and the exact ready frontier", () => {
  const tickets = read("skills/engineering/to-tickets/SKILL.md");

  const allEvidence = tickets.indexOf("After every expected child and blocker edge passes read-back");
  const recordPublication = tickets.indexOf("Reconcile the parent publication record");
  assert.equal(allEvidence !== -1 && recordPublication > allEvidence, true, "the parent record must follow complete child and edge read-back");
  assert.match(tickets, /decomposition:v1.*parent.*Planning Seal.*target.*key-to-Issue mapping.*blocker edges/isu);
  assert.match(tickets, /no current record.*write exactly one.*one matching record.*reuse.*conflicting or multiple records.*stop without mutation/isu);
  assert.match(tickets, /record.*completeness.*never.*child identity/isu);
  assert.match(tickets, /failure before or during record publication.*recoverable partial publication by key.*retry.*verified successor Planning Seal.*never.*inherited seal/isu);
  assert.match(tickets, /bootstrap rerun.*reuse.*matching children.*publish only the missing parent record/isu);
  assert.match(tickets, /open child.*every owned and External blocker.*closed.*dependency-ready frontier/isu);
  assert.match(tickets, /blocked or closed children.*neither `ready-for-agent`.*nor.*`\/execute-issue <Issue-ID>`/isu);
  assert.match(tickets, /remove a stale ready label from every open blocked or closed child/iu);
  assert.match(tickets, /read.*record back.*before.*ready-for-agent.*execution command/isu);
  assert.match(tickets, /runtime-neutral handoff.*manual.*authorized.*DAG.*coordinator/isu);
  assert.match(tickets, /never schedules.*tasks.*Codex.*Orca.*titles.*inferred blockers.*global queue/isu);
});

test("re-entrant to-tickets behavior stays synchronized across promoted surfaces", () => {
  const skill = read("skills/engineering/to-tickets/SKILL.md");
  const docs = read("docs/engineering/to-tickets.md");
  const metadata = read("skills/engineering/to-tickets/agents/openai.yaml");
  const router = read("skills/engineering/ask-matt/SKILL.md");
  const routerDocs = read("docs/engineering/ask-matt.md");

  assert.match(skill, /^description: Reconcile one Issue decomposition.*Decomposition publication record.*ready frontier\.$/mu);
  assert.match(metadata, /short_description: "Reconcile one Issue decomposition"/u);
  assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(docs, /re-entrant.*Decomposition key.*Decomposition publication record.*dependency-ready frontier/isu);
  assert.doesNotMatch(docs, /zero matches|one exact match|Publish missing children/iu);
  assert.match(router, /Multi-Issue Tracker Spec.*to-tickets.*reconcile.*Issue decomposition.*Decomposition publication record.*dependency-ready/isu);
  assert.match(routerDocs, /Multi-Issue Tracker Spec.*to-tickets.*reconcile.*Issue decomposition.*Decomposition publication record.*ready/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    const entry = read(path).match(/^- \*\*\[to-tickets\][^\n]*/mu)?.[0] ?? "";
    assert.match(entry, /reconcile.*Issue decomposition.*Decomposition publication record.*ready frontier/iu, `${path} has a stale to-tickets description`);
  }
});


test("manual prerequisite attestation is one-step and sufficient", () => {
  const preExecute = read("skills/engineering/pre-execute-issue/SKILL.md");
  const preExecuteMetadata = read("skills/engineering/pre-execute-issue/agents/openai.yaml");
  const preExecuteDocs = read("docs/engineering/pre-execute-issue.md");
  const execute = read("skills/engineering/execute-issue/SKILL.md");
  const executeDocs = read("docs/engineering/execute-issue.md");
  const matt = read("skills/engineering/ask-matt/SKILL.md");
  const mattDocs = read("docs/engineering/ask-matt.md");

  assert.match(preExecute, /^disable-model-invocation:\s*true$/mu);
  assert.match(preExecuteMetadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(preExecuteDocs, /agent won't reach for it on its own/iu);

  assert.match(preExecute, /Require only.*exact Issue ID.*exact repository-relative artifact path/isu);
  assert.match(preExecute, /human explicitly says.*already executed or applied/isu);
  assert.match(preExecute, /manual_prerequisite_complete:v1.*issue:.*artifact:.*attested_by: human.*statement: executed/isu);
  assert.match(preExecute, /same Issue.*normalized artifact path.*without writing a duplicate/isu);
  assert.match(preExecute, /Do not require.*resolver.*setup step.*target environment.*database identity.*credentials.*artifact hash.*worktree.*artifact-only commit.*postflight.*DB access.*external verification.*`WAITING_MANUAL`.*`READY`.*second invocation/isu);
  assert.match(preExecute, /Tracker write or read-back failure.*unresolved persistence.*never claim/isu);
  assert.match(preExecute, /Never execute or replay the artifact/iu);
  assert.match(preExecute, /Never create or modify a worktree.*mutate an external environment/isu);

  assert.match(execute, /No declared Manual prerequisite.*ordinary Issue execution/isu);
  assert.match(execute, /manual_prerequisite_complete:v1.*same Issue.*normalized repository-relative path.*sufficient/isu);
  assert.match(execute, /missing.*exact command `\/pre-execute-issue <Issue-ID> <artifact-path>`/isu);
  assert.match(execute, /later matching attestation.*resolves.*prerequisite-only blocked state.*resume.*existing Issue lane/isu);
  assert.match(execute, /Late prerequisite discovery.*exact artifact path.*matching attestation.*resume the same worktree and candidate lane/isu);
  assert.doesNotMatch(execute, /`discover`|`prepare`|`verify`|`NOT_REQUIRED`|`REQUIRED`/u);

  for (const path of [
    "docs/engineering/pre-execute-issue.md",
    "docs/engineering/execute-issue.md",
    "docs/engineering/ask-matt.md",
  ]) assert.doesNotMatch(read(path), /\]\((?:\.\/|\.\.\/)/u, `${path} has a relative published link`);
  assert.match(matt, /published.*Issue.*`\/pre-execute-issue.*artifact-path.*once.*attestation.*`\/execute-issue`/isu);
  assert.match(mattDocs, /pre-execute-issue.*names one artifact.*records that attestation once.*execute-issue/isu);
  assert.match(executeDocs, /one human attestation.*exact executed artifact.*pre-execute-issue/isu);
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
  assert.match(docs, /agent reaches for it automatically/iu);
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
  assert.match(docs, /agent reaches for it automatically/iu);
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
  const verify = read("skills/engineering/verify-target-before-push/SKILL.md");
  const verifyMetadata = read("skills/engineering/verify-target-before-push/agents/openai.yaml");
  const verifyDocs = read("docs/engineering/verify-target-before-push.md");
  const matt = read("skills/engineering/ask-matt/SKILL.md");
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
  assert.match(verify, /invoke.*`\/record-closed-issue-reconciliation`.*without.*manual slash command/isu);
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


test("target coverage recovery is confirmation-gated and restarts aggregate verification", () => {
  const verify = read("skills/engineering/verify-target-before-push/SKILL.md");
  const verifyMetadata = read("skills/engineering/verify-target-before-push/agents/openai.yaml");
  const verifyDocs = read("docs/engineering/verify-target-before-push.md");
  const matt = read("skills/engineering/ask-matt/SKILL.md");
  const mattDocs = read("docs/engineering/ask-matt.md");

  assert.match(verify, /^description:.*confirmation-gated.*recovery.*without pushing/mu);
  assert.match(verify, /frozen selected-range coverage check.*uncovered material commits.*only.*recovery/isu);
  assert.match(verify, /active skill behavior.*runtime or source.*tests.*configuration.*dependencies.*migrations.*security.*data.*public APIs.*mixed commit.*partial-path.*owner ambiguity.*ineligible/isu);
  assert.match(verify, /non-coverage.*review.*test.*cleanliness.*ref.*tracker.*execution.*closeout.*no tracker mutation/isu);
  assert.match(verify, /exact matching.*direct_target_contribution:v1.*reuse.*without invoking.*attest-target-contribution/isu);
  assert.match(verify, /present.*exact owner.*target.*classification.*full commit SHAs.*per-commit purposes.*complete tracker comment draft/isu);
  assert.match(verify, /No write.*until.*human confirms.*exact draft once/isu);
  assert.match(verify, /invoke.*attest-target-contribution.*without.*manual slash command/isu);
  assert.match(verify, /invoke.*`\/attest-target-contribution` skill/isu);
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
  const execute = read("skills/engineering/execute-issue/SKILL.md");
  const review = read("skills/engineering/code-review/SKILL.md");
  const close = read("skills/engineering/close-issue/SKILL.md");
  const verify = read("skills/engineering/verify-target-before-push/SKILL.md");
  const matt = read("skills/engineering/ask-matt/SKILL.md");

  assert.match(execute, /`workflowArtifacts`.*explicit empty list.*repository-relative.*path.*requirement source.*purpose/isu);
  assert.match(execute, /declared path.*Execution baseline.*candidate diff.*prospective.*code-review/isu);
  assert.match(execute, /first prospective completion.*repository.*tracker.*parent or linked Spec.*Issue target branch.*Spec and its exact child histories.*local-file tracker histories.*logical `workflow_artifacts_contract_adopted:v1`/isu);
  assert.match(execute, /Spec and its exact child histories.*local-file tracker histories.*freeze.*valid completion.*without `workflowArtifacts`.*`legacyCompletionFrontier`.*empty list.*Issue.*immutable completion-note identity.*durable local record locator.*SHA-256.*exact note body/isu);
  assert.match(execute, /Do not infer order across parent and child histories.*completion without `workflowArtifacts`.*legacy only.*exact identity.*body digest.*frozen frontier/isu);
  assert.match(execute, /Concurrent first completions.*payload-identical physical adoption records.*collapse.*idempotently.*logical record.*never append another.*exact payload.*visible/isu);
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
    assert.match(read(`skills/engineering/${name}/agents/openai.yaml`), /workflowArtifacts/u, `${name} metadata omits workflowArtifacts`);
    assert.match(read(`docs/engineering/${name}.md`), /workflowArtifacts/u, `${name} docs omit workflowArtifacts`);
  }
  for (const name of ["execute-issue", "close-issue", "verify-target-before-push"]) {
    assert.match(read(`skills/engineering/${name}/agents/openai.yaml`), /workflow_artifacts_contract_adopted:v1/u, `${name} metadata omits adoption evidence`);
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
  const execute = read("skills/engineering/execute-issue/SKILL.md");
  const executeMetadata = read("skills/engineering/execute-issue/agents/openai.yaml");
  assert.doesNotMatch(execute, /^disable-model-invocation:\s*true$/mu);
  assert.doesNotMatch(executeMetadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(execute, /direct human invocation.*valid.*DAG Run Grant.*without.*per-Issue.*approval/isu);
  assert.match(execute, /coordinator.*read-back.*DAG Run Grant.*exact.*linked Spec.*Issue target branch.*classification.*scope.*Decomposition publication record/isu);
  assert.match(execute, /Single-Issue.*coordinator target.*exact bound Spec.*outsider.*stops? before.*worktree.*mutation/isu);
  assert.match(execute, /missing.*stale.*mismatch.*Grant.*stops? before.*worktree.*mutation/isu);
  assert.match(read("docs/engineering/execute-issue.md"), /Single-Issue.*exact bound Spec.*Multi-Issue.*exact mapping member/isu);
  assert.match(execute, /never creates.*DAG Run Grant/iu);
  assert.match(execute, /dedicated Git worktree/iu);
  assert.match(execute, /linked Spec/iu);
  assert.match(execute, /code-review/u);
  assert.match(execute, /Standards/u);
  assert.match(execute, /Spec/u);
  assert.match(execute, /10 repair waves per invocation/iu);
  assert.match(execute, /Issue target branch.*only default merge destination/isu);
  assert.match(execute, /Any number of Issue worktrees may execute concurrently/iu);
  assert.match(execute, /target movement alone.*does not supersede.*`implementation_complete`/isu);
  assert.match(execute, /blocked state supersedes completion only when.*invalidates.*candidate.*implementation.*Standards.*Spec.*verification/isu);
  assert.match(execute, /dirty target.*partial close.*not.*conflict-resolution rerun.*cheap read-only.*identity.*evidence.*do not run.*baseline.*focused.*final.*full suite.*review.*commit.*tracker note.*`\/close-issue <Issue-ID>`/isu);
  assert.match(execute, /explicit conflict-resolution rerun.*same topic branch.*Issue worktree.*latest target.*new attempt baseline.*merge.*baseline.*topic branch.*without rebasing or resetting.*Acceptance Criteria.*unchanged.*new candidate.*contain.*baseline.*new `implementation_complete`.*current/isu);
  assert.doesNotMatch(execute, /any blocked exit.*supersedes older successful execution evidence/isu);
  assert.match(execute, /completion note/iu);
  assert.match(execute, /never invokes `close-issue`/iu);
  assert.match(execute, /Execution never[^.\n]+; the human or (?:a )?coordinator holding.*valid.*DAG Run Grant separately invokes `\/close-issue`/iu);
  assert.doesNotMatch(execute, /review_profile|focused review|full review/iu);

  const close = read("skills/engineering/close-issue/SKILL.md");
  const closeMetadata = read("skills/engineering/close-issue/agents/openai.yaml");
  assert.doesNotMatch(close, /^disable-model-invocation:\s*true$/mu);
  assert.doesNotMatch(closeMetadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(close, /direct human invocation.*valid.*DAG Run Grant.*without.*per-Issue.*approval/isu);
  assert.match(close, /never creates.*DAG Run Grant/iu);
  assert.match(close, /coordinator.*Single-Issue.*target.*bound Spec.*Multi-Issue.*Executable Issue.*exact Issue.*mapping.*parent-only.*target.*bound Spec/isu);
  assert.match(close, /absent from.*mapping.*stop before mutation/isu);
  assert.match(read("docs/engineering/close-issue.md"), /Single-Issue.*bound Spec.*Multi-Issue child.*exact mapping member.*parent-only.*bound Spec/isu);
  assert.match(close, /`implementation_complete` note/iu);
  assert.match(close, /recorded Issue target branch.*never infer.*current checkout.*substitute/isu);
  assert.match(close, /one `close-issue` writer per Issue target branch.*human.*authorized coordinator/isu);
  assert.match(close, /exactly three ordered.*merge.*remove.*close/isu);
  assert.match(close, /candidate.*already.*ancestor.*target.*merge.*satisfied/isu);
  assert.match(close, /merge exact `C`.*latest target.*without rebasing.*refreshing.*editing/isu);
  assert.match(close, /target.*ancestor of `C`.*git merge --ff-only <C>.*diverged histories.*git merge --no-ff --no-edit <C>.*merge\.ff/isu);
  assert.match(close, /merge conflicts.*git merge --abort.*Issue worktree registered.*Issue open/isu);
  assert.match(close, /never.*append `implementation_blocked`.*invoke `execute-issue`/isu);
  assert.match(close, /target worktree is dirty.*stop before mutation.*never stash.*commit.*clean.*reset.*move/isu);
  assert.match(close, /dirty.*human.*preserve.*resolve.*retry.*`\/close-issue <Issue-ID>`.*never needs.*execution review.*full suite/isu);
  assert.match(close, /derive current progress.*Git ancestry.*worktree registration.*tracker state/isu);
  assert.match(close, /Before any action.*Issue.*already closed.*worktree.*registered.*contradictory.*stop/isu);
  assert.match(close, /git worktree remove/u);
  assert.match(close, /exact registered Issue worktree.*path.*topic branch.*clean state.*`HEAD == C`/isu);
  assert.match(close, /If the Issue is open, close it/iu);
  assert.match(close, /read it back once/iu);
  assert.match(close, /retry skips completed actions.*resumes the next one/isu);
  assert.match(close, /human may explicitly rerun `execute-issue`.*same topic branch.*Issue worktree.*latest target.*original Acceptance Criteria.*Scope change.*planning/isu);
  assert.match(close, /Multi-Issue Spec.*Decomposition publication record.*every exact child is closed.*candidate.*reachable.*same target/isu);
  assert.match(close, /returns to `\/to-tickets <Parent-ID>` reconciliation/iu);
  assert.match(close, /parent closure never claims `push_ready`/iu);
  assert.doesNotMatch(close, /closeout receipt|dirty-target-preservation|preservation\.mjs|`PREPARED`|`VERIFIED`|`FAILED`/iu);
  const closeDocs = read("docs/engineering/close-issue.md");
  const executeDocs = read("docs/engineering/execute-issue.md");
  assert.match(executeDocs, /target is dirty.*partial.*only checks.*identities.*evidence.*does not rerun.*baseline.*focused.*final.*full suite.*review.*commits.*tracker writes.*`\/close-issue <Issue-ID>`/isu);
  assert.match(closeDocs, /three.*merge.*remove.*close/isu);
  assert.match(closeDocs, /dirty target.*make.*target.*clean.*retr(?:y|ies).*`\/close-issue <Issue-ID>`.*does not rerun.*execution.*full suite/isu);
  assert.doesNotMatch(closeDocs, /preservation|closeout receipt|integration receipt/iu);
  assert.match(close, /If the worktree is already absent, this action is satisfied/iu);
  const alreadyClosed = close.match(/If it is already closed,[^\n]+/u)?.[0] ?? "";
  assert.match(alreadyClosed, /same candidate.*reachable.*worktree.*absent/iu);
  assert.match(close, /never repairs product code/iu);

  assert.equal(existsSync("skills/engineering/close-issue/scripts/preservation.mjs"), false);
  assert.equal(existsSync("tests/ron-workflow/close-issue-preservation.test.mjs"), false);

  const verify = read("skills/engineering/verify-target-before-push/SKILL.md");
  assert.match(verify, /two evidence modes.*local-ahead.*already-pushed/isu);
  assert.match(verify, /local-ahead.*unique configured upstream tracking tip.*`B\.\.V`.*non-empty.*guess/isu);
  assert.match(verify, /already-pushed.*explicit merge request.*pull request.*exact base\/head range.*never guess/isu);
  assert.match(verify, /clean verification worktree.*exact `V`/isu);
  assert.match(verify, /open and closed Issues.*Execution completion note.*read each.*once.*without pre-filtering by Issue target/isu);
  assert.match(verify, /candidate `C`.*reachable from `V`.*not.*`B`.*member/isu);
  assert.match(verify, /reachable member.*Issue.*open.*stops/isu);
  assert.match(verify, /For every member.*closed tracker state/isu);
  assert.match(verify, /For every member.*topic branch.*worktree.*Planning Seal.*`manualAttestations` artifact paths.*empty list.*Standards.*Spec review identities.*clean results/isu);
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
    assert.match(page, /agent won't reach for it on its own/iu);
    assert.doesNotMatch(page, /agent reaches for it automatically/iu);
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

test("aggregate target verification selects exact ranges and covers completion-note contributions", () => {
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
      "manualAttestations",
      "standardsReview",
      "specReview",
      "verification",
    ]) assert.ok(completion[field], `${issue.id}: missing ${field}`);
    assert.equal(completion.issue, issue.id, `${issue.id}: mismatched Issue identity`);
    for (const axis of ["standardsReview", "specReview"]) {
      assert.equal(completion[axis].candidate, completion.candidate, `${issue.id}: mismatched ${axis} candidate`);
      assert.equal(completion[axis].result, "clean", `${issue.id}: ${axis} is not clean`);
    }
    assert.ok(Array.isArray(completion.manualAttestations), `${issue.id}: missing manual attestation list`);
    assert.equal(new Set(completion.manualAttestations).size, completion.manualAttestations.length, `${issue.id}: duplicate manual attestation`);
    assert.ok(completion.manualAttestations.every((path) => typeof path === "string" && path.length > 0), `${issue.id}: invalid manual attestation path`);
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
      manualAttestations: ["sql/a.sql"],
    });
    const successB = completion({
      candidate: candidateB,
      issue: "B",
      baseline: planningSeal,
      commands: ["test:shared", "test:b"],
      manualAttestations: [],
      successorEvidence: { absentPaths: [retiredScript, retiredTest], currentBehaviorCommands: ["test:b"] },
    });
    const successOpen = completion({ candidate: openCandidate, issue: "OPEN-OUTSIDE", commands: ["test:open"] });
    const successClosed = completion({ candidate: closedCandidate, issue: "CLOSED-OUTSIDE", commands: ["test:closed"] });
    const completeIssues = [
      { id: "A", state: "CLOSED", execution: [successA] },
      { id: "B", state: "CLOSED", retirements: [{ criterion: "AC-6", paths: [retiredScript, retiredTest] }], execution: [successB] },
      { id: "OPEN-OUTSIDE", state: "OPEN", execution: [successOpen] },
    ];
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

test("push-target consumes one current receipt for one exact non-force push", () => {
  const skill = read("skills/engineering/push-target/SKILL.md");
  const metadata = read("skills/engineering/push-target/agents/openai.yaml");
  const docs = read("docs/engineering/push-target.md");

  assert.match(skill, /^disable-model-invocation:\s*true$/mu);
  assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.doesNotMatch(skill, /^description:\s*Use when\b/mu);
  assert.match(skill, /named existing local target branch.*exact local `HEAD`.*refs\/notes\/matt-push-ready.*exactly one.*push_ready:v1/isu);
  assert.match(skill, /mode.*local-ahead.*target.*baseline.*verified target SHA.*member.*evidence.*current.*HEAD/isu);
  assert.match(skill, /missing.*duplicate.*malformed.*stale.*mismatched.*already-pushed.*ambiguous.*stops? before.*remote mutation/isu);
  assert.match(skill, /unique configured upstream.*fetch.*immediately before.*receipt baseline.*fetched upstream tip.*local target `HEAD`.*receipt target SHA/isu);
  assert.match(skill, /baseline.*ancestor.*`V`.*non-empty/isu);
  assert.match(skill, /ref drift.*receipt drift.*stops? before push/isu);
  assert.match(skill, /one ordinary non-force push.*exact verified local target.*configured upstream ref/isu);
  assert.match(skill, /read.*remote ref.*exact receipt target SHA.*success/isu);
  assert.match(skill, /rejection.*transport failure.*remote mismatch.*post-push ambiguity.*unresolved delivery.*never.*retry/isu);
  assert.match(skill, /never.*pull.*merge.*rebase.*force-push.*receipt rewrite.*automatic reverification.*deploy/isu);
  assert.match(skill, /never changes product files.*commits.*branches.*worktrees.*Issues.*labels.*completion notes.*verification evidence/isu);
  assert.match(docs, /agent won't reach for it on its own/iu);
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
    assert.ok(Array.isArray(receipt.members) && receipt.members.length > 0, "receipt member structure is malformed");
    assert.ok(Array.isArray(receipt.coverage) && receipt.coverage.length > 0, "receipt coverage evidence is malformed");
    assert.equal(receipt.standards, "clean", "receipt Standards evidence is not clean");
    assert.equal(receipt.spec, "clean", "receipt Spec evidence is not clean");
    assert.ok(Array.isArray(receipt.commands) && receipt.commands.length > 0, "receipt commands are malformed");
    assert.ok(Array.isArray(receipt.results) && receipt.results.every(({ result }) => result === "pass"), "receipt results are not passing");
    assert.equal(receipt.worktree, "clean", "receipt worktree evidence is not clean");
    return receipt;
  };

  const configuredUpstreams = () => {
    const remoteName = git("config", "--get", "branch.target.remote");
    const remoteRef = git("config", "--get", "branch.target.merge");
    if (!remoteName || !remoteRef) return [];
    return [{
      remote: remoteName,
      remoteRef,
      trackingRef: `refs/remotes/${remoteName}/${remoteRef.replace(/^refs\/heads\//u, "")}`,
    }];
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
    readFetchedTip,
    readPostFetchReceiptText,
    readPostFetchUpstreams,
    readPostFetchTargetHead,
    readRemoteHeads,
    readPostPushReceiptText,
    readPostPushUpstreams,
    readPostPushTargetHead,
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
    git("fetch", upstream.remote);
    validateFetchedGate({
      receipt,
      frozenReceiptText,
      currentReceiptText: readPostFetchReceiptText?.() ?? (readReceiptText?.() ?? git("notes", "--ref=refs/notes/matt-push-ready", "show", currentHead)),
      frozenUpstreams,
      currentUpstreams: readPostFetchUpstreams?.() ?? readUpstreams(),
      fetchedTip: readFetchedTip?.() ?? git("rev-parse", upstream.trackingRef),
      targetHead: readPostFetchTargetHead?.() ?? git("rev-parse", target),
    });
    try {
      if (performPush) performPush();
      else rawGit("push", upstream.remote, `refs/heads/${target}:${upstream.remoteRef}`);
    } catch {
      throw new Error("unresolved delivery after one rejected or failed push");
    }
    const remoteOutput = git("ls-remote", "--refs", upstream.remote, upstream.remoteRef);
    validatePostPush({
      receipt,
      frozenReceiptText,
      currentReceiptText: readPostPushReceiptText?.() ?? (readReceiptText?.() ?? git("notes", "--ref=refs/notes/matt-push-ready", "show", currentHead)),
      frozenUpstreams,
      currentUpstreams: readPostPushUpstreams?.() ?? readUpstreams(),
      targetHead: readPostPushTargetHead?.() ?? git("rev-parse", target),
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
    const upstreams = configuredUpstreams();

    assert.throws(() => selectReceipt({ receipts: [], target: "target", currentHead: head }), /exactly one/u);
    assert.throws(() => selectReceipt({ receipts: [receipt, receipt], target: "target", currentHead: head }), /exactly one/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, schema: "range_verified:v1" }], target: "target", currentHead: head }), /schema is malformed/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, mode: "already-pushed" }], target: "target", currentHead: head }), /local-ahead/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, target: "other" }], target: "target", currentHead: head }), /target mismatch/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, head: baseline }], target: "target", currentHead: head }), /stale/u);
    assert.throws(() => selectReceipt({ receipts: [{ ...receipt, results: [{ result: "fail" }] }], target: "target", currentHead: head }), /not passing/u);
    assert.throws(() => deliver({ readReceiptText: () => "not-json" }), /receipt is malformed/u);
    assert.throws(() => deliver({ readReceiptText: () => JSON.stringify([receipt, receipt]) }), /exactly one/u);
    assert.throws(() => deliver({ readUpstreams: () => [] }), /unique configured upstream/u);
    assert.throws(() => deliver({ readUpstreams: () => [...upstreams, ...upstreams] }), /unique configured upstream/u);
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

    const before = {
      branch: git("branch", "--show-current"),
      note: git("notes", "--ref=refs/notes/matt-push-ready", "show", head),
      status: git("status", "--porcelain=v1"),
    };
    assert.equal(deliver(), head);
    assert.equal(git("ls-remote", "--refs", "origin", "refs/heads/target").split(/\s+/u)[0], head);
    assert.deepEqual(
      {
        branch: git("branch", "--show-current"),
        note: git("notes", "--ref=refs/notes/matt-push-ready", "show", head),
        status: git("status", "--porcelain=v1"),
      },
      before,
      "delivery must preserve local branch, receipt, files, and clean state",
    );

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

test("router exposes the Issue worktree flow and independent controls", () => {
  const matt = read("skills/engineering/ask-matt/SKILL.md");
  assert.match(matt, /`\/wiki`/u);
  assert.match(matt, /`\/remove-ron`/u);
  assert.match(matt, /`\/pre-execute-issue/u);
  assert.match(matt, /`\/execute-issue`/u);
  assert.match(matt, /`\/close-issue`/u);
  assert.match(matt, /`\/verify-target-before-push/iu);
  assert.match(matt, /`\/push-target/iu);
  assert.match(matt, /`\/grilling`/u);
  assert.match(matt, /`\/explain-decision`/u);
  assert.match(matt, /Tracker Spec.*`\/execute-issue`.*Standalone Spec.*`\/implement`/isu);
  assert.match(matt, /Issue worktrees may run concurrently/iu);
  assert.match(matt, /close-issue.*exact candidate.*recorded Issue target branch.*removes.*closes/isu);
  assert.match(matt, /serializes close writers per target/iu);
  assert.match(matt, /manual leaf route.*authorized coordinator route.*DAG Run Grant/isu);
  assert.match(matt, /coordinator.*does not create.*broaden.*leaf.*authority/isu);
  assert.match(matt, /Multi-Issue parent.*every exact child.*closed.*reachable/isu);
  assert.match(matt, /Before push.*verify-target-before-push.*local-ahead.*completion notes.*already-pushed.*explicit.*range.*aggregate review.*verification once/isu);
  assert.match(matt, /push_ready.*push-target.*unique configured upstream.*ordinary non-force push.*reads?.*remote ref.*back/isu);
  assert.match(matt, /to-spec.*sole authority.*Single-Issue.*Multi-Issue/isu);
  assert.doesNotMatch(matt, /ask-ron|to-spec-ron|to-tickets-ron/u);

  const mattDocs = read("docs/engineering/ask-matt.md");
  assert.match(mattDocs, /one writer per recorded target.*three idempotent close actions/isu);
  assert.match(mattDocs, /manual leaf route.*authorized coordinator.*DAG Run Grant/isu);
  assert.match(mattDocs, /same command.*Multi-Issue parent.*every exact child.*closed.*reachable/isu);
  assert.match(mattDocs, /verify-target-before-push.*local-ahead.*completion-note.*already-pushed.*explicit.*range.*aggregate/isu);

  for (const path of ["README.md", "skills/engineering/README.md"]) {
    const readme = read(path);
    assert.match(readme, /execute-issue.*preserving completion across recorded-target movement/iu);
    assert.match(readme, /close-issue.*three idempotent actions.*recorded target.*Multi-Issue parent/iu);
  }

  const context = read("CONTEXT.md");
  assert.match(context, /Target integration serialization.*one `close-issue` writer.*same .*Issue target branch.*human.*authorized .*DAG Run.*other targets.*concurrently/isu);
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
  const operatorPath = "skills/personal/run-issue-workflow/OPERATOR.md";
  assert.equal(existsSync(skillPath), true);
  assert.equal(existsSync(metadataPath), true);
  assert.equal(existsSync(runtimePath), true);
  assert.equal(existsSync(operatorPath), true);

  const skill = read(skillPath);
  const metadata = read(metadataPath);
  const operator = read(operatorPath);
  assert.match(skill, /^disable-model-invocation:\s*true$/mu);
  assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(metadata, /automatic.*panel.*Pause.*Resume.*Stop/isu);
  assert.match(read("skills/personal/README.md"), /\[run-issue-workflow\]\(\.\/run-issue-workflow\/SKILL\.md\).*automatic.*panel/isu);
  assert.match(skill, /`\/run-issue-workflow <Spec-ID>`.*exact Spec.*no-argument.*one unique non-terminal Run.*otherwise.*no workflow action/isu);
  assert.match(skill, /immutable Run identity.*exact Spec.*target.*classification.*approved scope.*decomposition identity/isu);
  assert.match(skill, /DAG Run Grant.*`max_parallel`.*default three/isu);
  assert.match(skill, /saved project.*`local` environment/isu);
  assert.match(skill, /Every executable Issue maps to one sidebar-visible child Codex task/iu);
  assert.match(skill, /Never create a duplicate live lane/iu);
  assert.match(skill, /`execute-issue` owns its dedicated Issue worktree/iu);
  assert.match(skill, /`implementation_complete` triggers serialized `close-issue`/iu);
  assert.match(skill, /node success.*release dependants/iu);
  assert.match(skill, /All-child node success triggers.*parent-only close/iu);
  assert.match(skill, /close_parent.*same target close-writer acquire-or-exact-reclaim seam.*Release only after the parent leaf settles/isu);
  assert.match(skill, /published blocker edges alone.*ready frontier.*never infer.*path.*symbol.*module/isu);
  assert.match(skill, /at most three dispatch attempts.*semantic.*contradictory.*bypass.*retry/isu);
  assert.match(skill, /accepted retry follow-up.*same Run, Issue, and next attempt.*without sending the prompt again/isu);
  assert.match(skill, /5, 15, and 30 second.*tracker.*probe.*retry budget/isu);
  assert.match(skill, /restart.*selector-known Run identity and node set.*preserve.*affected nodes.*anonymous outage/isu);
  assert.match(skill, /`Selector\.open\(\)`.*Unable to establish loopback connection.*`gradle-loopback-safe`.*one.*process-local.*cycle/isu);
  assert.match(skill, /On every entry.*reacquire/isu);
  assert.match(skill, /stale engine writer.*exact reconciled `INACTIVE` owner evidence.*active operation.*fenced and stop/isu);
  assert.match(skill, /accepted `close-issue` follow-up.*task history.*already in flight.*never send the same close request again/isu);
  assert.match(skill, /manual `implementation_complete`.*no journaled task reference.*adopt one uniquely matching.*Zero or multiple.*structured diagnosis.*never creates or guesses/isu);
  assert.match(skill, /coordinator loss retains durable close-writer ownership.*stale-owner evidence.*release still waits for task settlement/isu);
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
  assert.match(skill, /panel-open failure.*panel_unavailable/isu);
  assert.match(operator, /GRILL.*Spec.*`\/to-tickets`.*`\/run-issue-workflow <main Issue>`/isu);
  assert.match(operator, /Single-Issue.*Multi-Issue.*no-argument.*unique non-terminal Run/isu);
  assert.match(operator, /Pause.*Resume.*Stop.*Refresh/isu);
  assert.match(operator, /exact Run.*identity is reconciled.*retention sweep.*selected Run is protected.*Zero or ambiguous no-argument.*only previews.*cleanupPreview: true.*without deletion/isu);
  assert.match(operator, /status-succeeded\.json.*status-diagnosed\.json/isu);
  for (const name of ["status-succeeded", "status-diagnosed"]) {
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
    "docs/engineering/to-spec.md",
    "docs/engineering/to-tickets.md",
    "skills/engineering/ask-matt/SKILL.md",
    "skills/engineering/wiki/SKILL.md",
    "skills/engineering/remove-ron/SKILL.md",
    "skills/engineering/pre-execute-issue/SKILL.md",
    "skills/engineering/execute-issue/SKILL.md",
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
