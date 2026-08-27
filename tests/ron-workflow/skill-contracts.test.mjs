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
  const ticketsPublish = tickets.indexOf("Publish executable Issues", ticketsSeal);
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
  const localIssueTemplate = tickets.match(/<local-issue-template>(.*?)<\/local-issue-template>/su)?.[1] ?? "";
  const issueTemplate = tickets.match(/<issue-template>(.*?)<\/issue-template>/su)?.[1] ?? "";
  for (const [name, template] of [["local", localIssueTemplate], ["tracker", issueTemplate]]) {
    assert.match(template, /Planning baseline.*Commit:.*Seal: <created, successor, or reused>/su, `${name} Issue template has an incomplete Planning baseline`);
    assert.match(template, /Acceptance Criteria.*Implementation Plan.*Verification.*Blocked by/su, `${name} Issue is not directly executable`);
    assert.match(template, /Covers: AC-/u, `${name} Issue omits inline AC mapping`);
  }
  assert.match(localIssueTemplate, /# <NN> - <Issue title>/u);
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


test("prerequisite preparation is optional, gated, and recoverable", () => {
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

  assert.match(preExecute, /exact.*Issue.*published.*before.*worktree.*product implementation/isu);
  assert.match(preExecute, /repository instructions.*exact.*resolver.*`discover`.*`prepare`.*`verify`/isu);
  assert.match(preExecute, /no.*declaration.*`NOT_REQUIRED`.*no worktree/isu);
  assert.match(preExecute, /declared.*missing.*unreadable.*ambiguous.*unparseable.*inconsistent.*`BLOCKED`.*no worktree/isu);
  assert.match(preExecute, /repository owns.*transport.*field.*policy.*validation.*target/isu);

  assert.match(preExecute, /only `REQUIRED`.*create or reuse.*Issue worktree.*topic branch/isu);
  assert.match(preExecute, /`prepare`.*only.*declared.*Prerequisite artifact/isu);
  assert.match(preExecute, /five.*repair waves.*initial generation.*no-edit retr.*tool failures.*do not count/isu);
  assert.match(preExecute, /syntax.*static validation.*pass.*commit.*artifact alone.*worktree.*clean.*`WAITING_MANUAL`/isu);
  assert.match(preExecute, /product implementation.*stop.*planning.*`execute-issue`/isu);

  assert.match(preExecute, /append-only.*`WAITING_MANUAL`.*read.*back once/isu);
  assert.match(preExecute, /Issue.*prerequisite commit.*artifact paths.*SHA-256.*resolver.*policy.*non-sensitive.*target.*ancestry/isu);
  assert.match(preExecute, /`NOT_REQUIRED`.*`REQUIRED`.*`BLOCKED`.*transient.*no.*receipt/isu);
  assert.match(preExecute, /never.*credentials.*manual.*action.*poll/isu);

  assert.match(preExecute, /current `WAITING_MANUAL`.*`verify` exactly once.*read-only.*declared outcome.*non-sensitive target/isu);
  assert.match(preExecute, /success.*append.*read.*back.*`READY`.*failure.*preserve.*`WAITING_MANUAL`.*transient `BLOCKED`/isu);
  assert.match(preExecute, /current `READY`.*match.*report `READY`.*stop/isu);
  assert.match(preExecute, /tracker write or read-back failure.*transient `BLOCKED`.*never.*`WAITING_MANUAL`.*`READY`/isu);
  assert.match(preExecute, /later implementation commits.*prerequisite commit.*ancestor.*protected.*match/isu);
  assert.match(preExecute, /artifact.*resolver.*policy.*manual target.*ancestry.*drift.*stale/isu);

  assert.match(execute, /Entry.*read-only.*`discover`/isu);
  assert.match(execute, /after.*exact.*Issue.*published.*before.*worktree.*product implementation/isu);
  assert.match(execute, /no.*resolver declaration.*`NOT_REQUIRED`.*ordinary.*execution/isu);
  assert.match(execute, /current.*`READY`.*same Issue worktree.*topic branch.*candidate ancestry/isu);
  assert.match(execute, /`REQUIRED`.*missing or stale.*`implementation_blocked`.*invoke `\/pre-execute-issue/isu);
  assert.match(execute, /resolver.*`BLOCKED`.*`implementation_blocked`/isu);
  assert.match(execute, /never invokes `pre-execute-issue`.*never.*`prepare`.*manual prerequisite action/isu);
  assert.match(execute, /Late prerequisite discovery.*before.*prerequisite-dependent verification.*unchanged.*Acceptance Criteria.*schema outcome.*same worktree.*changed.*behavior.*acceptance.*target.*exclusions.*ownership.*planning/isu);

  for (const path of [
    "docs/engineering/pre-execute-issue.md",
    "docs/engineering/execute-issue.md",
    "docs/engineering/ask-matt.md",
  ]) assert.doesNotMatch(read(path), /\]\((?:\.\/|\.\.\/)/u, `${path} has a relative published link`);
  assert.match(matt, /published.*Issue.*`\/pre-execute-issue.*optional.*`\/execute-issue`/isu);
  assert.match(mattDocs, /pre-execute-issue.*optional.*execute-issue/isu);
  assert.match(executeDocs, /read-only prerequisite discovery.*`NOT_REQUIRED`.*`READY`.*pre-execute-issue/isu);
});


test("one-time prerequisite resolver adoption is explicit and no-op without a concrete need", () => {
  const setup = read("skills/engineering/setup-pre-execute-issue/SKILL.md");
  const metadata = read("skills/engineering/setup-pre-execute-issue/agents/openai.yaml");
  const docs = read("docs/engineering/setup-pre-execute-issue.md");
  const matt = read("skills/engineering/ask-matt/SKILL.md");
  const mattDocs = read("docs/engineering/ask-matt.md");

  assert.match(setup, /^disable-model-invocation:\s*true$/mu);
  assert.match(metadata, /^\s*allow_implicit_invocation:\s*false$/mu);
  assert.match(docs, /agent won't reach for it on its own/iu);
  assert.match(setup, /before writing.*inspect.*repository instructions.*code.*tests.*concrete manual prerequisite/isu);
  assert.match(setup, /no concrete manual prerequisite.*setup.*unnecessary.*repository unchanged.*no resolver declaration.*placeholder.*TODO/isu);

  assert.match(setup, /only.*minimum.*existing `AGENTS\.md` or `CLAUDE\.md`.*prerequisite policy.*repository-owned resolver implementation.*test fixture/isu);
  assert.match(setup, /one exact.*command.*`discover`.*`prepare`.*`verify`.*machine-readable/isu);
  assert.match(setup, /`discover`.*`NOT_REQUIRED`.*`REQUIRED`.*`BLOCKED`.*protected evidence/isu);
  assert.match(setup, /`prepare`.*only.*declared.*Prerequisite artifact/isu);
  assert.match(setup, /`verify`.*read-only.*declared outcome.*non-sensitive target/isu);
  assert.match(setup, /repository owns.*transport.*field.*policy.*validation.*target semantics.*safe extensions/isu);
  assert.match(setup, /never.*universal resolver.*configuration schema/isu);

  assert.match(setup, /before writing.*capture.*intended adoption path.*staged.*unstaged.*untracked/isu);
  assert.match(setup, /complete prospective adoption.*temporary.*syntax.*static.*fixture validation.*before.*active declaration/isu);
  assert.match(setup, /validated.*one change set.*same validation.*post-apply/isu);
  assert.match(setup, /failure.*no active declaration.*partial resolver.*placeholder.*TODO.*restore only.*setup-owned preimages/isu);
  assert.match(setup, /preserve.*unrelated staged.*unstaged.*untracked.*never.*stash.*reset.*clean/isu);

  assert.match(setup, /never.*execut(?:e|es) SQL.*mutat(?:e|es).*database.*external environment.*stor(?:e|es) credentials/isu);
  assert.match(setup, /never.*chang(?:e|es).*Issue.*Prerequisite receipt/isu);
  assert.match(setup, /never invoke.*`pre-execute-issue`.*`execute-issue`.*runtime skill/isu);
  assert.match(setup, /never.*rerun `ask-matt`.*act as a router/isu);
  assert.match(setup, /never.*push.*integrate.*deploy/isu);
  assert.match(setup, /implementing.*generic skill.*never.*adopt.*consumer repository/isu);

  assert.doesNotMatch(docs, /\]\((?:\.\/|\.\.\/)/u);
  assert.match(docs, /concrete manual prerequisite.*no change.*run-once.*not.*runtime/isu);
  assert.match(matt, /`\/setup-pre-execute-issue`.*concrete manual prerequisite.*run-once.*not.*runtime/isu);
  assert.match(mattDocs, /setup-pre-execute-issue.*concrete manual prerequisite.*run-once.*not.*runtime/isu);
});


test("Issue delivery uses Matt specs and separate execution and closeout", () => {
  const execute = read("skills/engineering/execute-issue/SKILL.md");
  assert.match(execute, /dedicated Git worktree/iu);
  assert.match(execute, /linked Spec/iu);
  assert.match(execute, /code-review/u);
  assert.match(execute, /Standards/u);
  assert.match(execute, /Spec/u);
  assert.match(execute, /10 repair waves per invocation/iu);
  assert.match(execute, /any blocked exit.*Entry.*implementation.*verification.*review.*`implementation_blocked`.*read.*back.*supersedes/isu);
  assert.match(execute, /completion note/iu);
  assert.match(execute, /never invokes `close-issue`/iu);
  assert.doesNotMatch(execute, /review_profile|focused review|full review/iu);

  const close = read("skills/engineering/close-issue/SKILL.md");
  assert.match(close, /completion note/iu);
  assert.match(close, /latest terminal execution state.*`E`.*no later blocked state/isu);
  assert.match(close, /original target branch/iu);
  assert.match(close, /capture.*target.*`T`.*reviewed candidate.*`C`/isu);
  assert.match(close, /isolated temporary integration worktree/iu);
  assert.match(close, /`T`.*ancestor of `C`.*`I = C`/isu);
  assert.match(close, /`C`.*ancestor of `T`.*two-parent.*tree.*`T`.*parents.*`T`.*`C`/isu);
  assert.match(close, /no-fast-forward merge.*`I`/isu);
  assert.match(close, /conflict.*before.*real target.*receipt.*Issue closure/isu);
  assert.match(close, /never invokes `execute-issue`.*never reruns.*Standards.*Spec.*full verification/isu);
  assert.match(close, /git merge --ff-only/u);
  assert.match(close, /target `HEAD == I`.*`C`.*ancestor/isu);
  assert.match(close, /git worktree remove/u);
  assert.match(close, /Close the Issue/iu);
  assert.match(close, /read it back once/iu);
  assert.match(close, /original target worktree does not need to be clean/iu);
  assert.match(close, /staged, unstaged, and untracked/iu);
  assert.match(close, /same-path and ancestor\/descendant path-prefix collisions/iu);
  assert.match(close, /Any collision stops with the Issue open/iu);
  assert.match(close, /both endpoints of candidate and dirty renames/iu);
  assert.match(close, /NUL-safe Git output.*case semantics/isu);
  assert.match(close, /scripts\/preservation\.mjs inspect <input-json-path> <output-json-path>/iu);
  assert.match(close, /Never precompute or pass dirty paths.*candidate paths.*fingerprints.*case semantics.*collision results.*hook evidence/isu);
  assert.match(close, /exits zero.*complete expected `closeout-preservation-inspection:v1` result is `SAFE`/isu);
  assert.match(close, /classified `COLLISION` or `BLOCKED`.*non-zero.*missing output.*stale output.*malformed JSON.*schema mismatch.*stops without inference/isu);
  assert.match(close, /unique strict-UTF-8 JSON input and output paths/iu);
  assert.match(close, /<output-json-path>\.tmp-\*/u);
  assert.match(close, /Stdout and a reusable repository-local result file are not evidence transports/iu);
  assert.match(close, /dirty-target-preservation:v1/u);
  assert.match(close, /phase `PREPARED`.*`T`.*`C`.*`I`.*digest.*counts.*hook/isu);
  assert.match(close, /receipt.*execution-state identity `E`/isu);
  assert.match(close, /Read back and verify those exact fields before continuing/iu);
  assert.match(close, /`VERIFIED`.*target-after.*`I`.*candidate reachable.*read back/isu);
  assert.match(close, /never automatically stash, commit, clean, reset/iu);
  assert.match(close, /target.*digest.*hook.*drift.*`FAILED`.*stop/isu);
  assert.match(close, /never publish paths or file contents/iu);
  assert.match(close, /`FAILED`.*stops.*explicit recovery.*new.*execution or an integration-repair Issue/isu);
  assert.doesNotMatch(close, /RECONCILED|preservation equality is not proven/iu);
  assert.match(close, /both gates.*latest execution state identity `E`.*every blocker still closed/isu);
  const closeDocs = read("docs/engineering/close-issue.md");
  assert.match(closeDocs, /target may keep unrelated staged, unstaged, and untracked work/iu);
  assert.match(closeDocs, /private read-only module inside `close-issue`, not another workflow step/iu);
  assert.match(close, /already absent worktree means cleanup is complete/iu);
  const alreadyClosed = close.match(/If the Issue is already closed,[^\n]+/u)?.[0] ?? "";
  assert.match(alreadyClosed, /candidate.*integration candidate.*ancestors.*current target.*worktree.*absent/iu);
  assert.match(close, /read back.*closed state.*without.*clos(?:e|ing).*again/isu);
  assert.match(close, /never repairs product code/iu);

  const preservation = read("skills/engineering/close-issue/scripts/preservation.mjs");
  assert.match(preservation, /closeout-preservation-inspection-input:v1/u);
  assert.match(preservation, /closeout-preservation-inspection:v1/u);
  assert.match(preservation, /GIT_OPTIONAL_LOCKS.*"0"/su);
  assert.match(preservation, /core\.fsmonitor=false/su);
  assert.match(preservation, /status.*--porcelain=v2.*-z.*--untracked-files=all.*--ignore-submodules=none/su);
  assert.match(preservation, /ls-files.*--stage.*-z/su);
  assert.match(preservation, /diff.*--name-status.*-z.*--find-renames.*--find-copies/su);
  assert.match(preservation, /config.*core\.ignorecase/su);
  assert.match(preservation, /filesystemIsCaseInsensitive.*\.git.*\.GIT/su);
  assert.match(preservation, /submoduleWorktreeFingerprint/u);
  assert.match(preservation, /firstSnapshot.*secondSnapshot.*changed during inspection/su);
  assert.match(preservation, /hooks\/post-merge/u);
  assert.match(preservation, /linkSync\(temporaryPath, finalPath\).*unlinkSync\(temporaryPath\)/su);
  assert.match(preservation, /output JSON path must not already exist/u);
  assert.doesNotMatch(preservation, /process\.stdout\.write|\bgh\b|\bglab\b|dirty-target-preservation/u);

  const verify = read("skills/engineering/verify-target-before-push/SKILL.md");
  assert.match(verify, /capture.*verification baseline.*exact target `HEAD`/isu);
  assert.match(verify, /closed Issues.*execution\/completion history.*original target/isu);
  assert.match(verify, /union.*execution\/completion history.*closeout receipt.*missing completion note.*missing receipt/isu);
  assert.match(verify, /latest terminal execution state.*no superseding blocked state.*identity.*closeout receipt/isu);
  assert.match(verify, /missing.*receipt.*candidate.*not reachable.*stop/isu);
  assert.doesNotMatch(verify, /RECONCILED/iu);
  assert.match(verify, /code-review.*Standards.*Spec axis.*member Issue.*linked Specs/isu);
  assert.match(verify, /aggregate.*member/isu);
  assert.match(verify, /union-focused.*full verification/isu);
  assert.match(verify, /clean verification worktree/iu);
  assert.match(verify, /push_ready:v1.*exact target `HEAD`.*member Issue.*candidate.*integration/isu);
  assert.match(verify, /target movement.*invalidates/iu);
  assert.match(verify, /never closes Issues.*changes product code.*pushes.*deploys/isu);
  assert.match(verify, /integration-repair Issue.*explicit.*reopen/isu);

  for (const name of ["execute-issue", "close-issue", "verify-target-before-push"]) {
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
    for (const name of ["execute-issue", "close-issue", "verify-target-before-push"]) {
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

test("Issue integration preserves dirty target state and composes candidates in arbitrary close order", () => {
  const { repo, rawGit, git, isAncestor } = createGitFixture("skills-integration-fixture-");
  const planIntegration = (target, candidate) => {
    if (isAncestor(target, candidate)) return { kind: "reuse", integration: candidate };
    if (isAncestor(candidate, target)) {
      const tree = git("rev-parse", `${target}^{tree}`);
      const integration = git("commit-tree", tree, "-p", target, "-p", candidate, "-m", "integrate contained candidate");
      return { kind: "contained-merge", integration };
    }
    return { kind: "merge" };
  };

  try {
    writeFileSync(join(repo, "base.txt"), "base\n");
    writeFileSync(join(repo, "tracked-local.txt"), "tracked baseline\n");
    git("add", "base.txt", "tracked-local.txt");
    git("commit", "-m", "base");
    const baseline = git("rev-parse", "HEAD");

    git("checkout", "-b", "issue-a");
    writeFileSync(join(repo, "a.txt"), "A\n");
    git("add", "a.txt");
    git("commit", "-m", "issue A");
    const candidateA = git("rev-parse", "HEAD");
    git("checkout", "target");
    assert.equal(isAncestor(baseline, candidateA), true);
    assert.deepEqual(planIntegration(baseline, candidateA), { kind: "reuse", integration: candidateA });
    git("merge", "--ff-only", candidateA);
    assert.equal(git("rev-parse", "HEAD"), candidateA, "direct close should fast-forward to the reviewed candidate");

    git("checkout", "-b", "issue-conflict", baseline);
    writeFileSync(join(repo, "base.txt"), "issue change\n");
    git("add", "base.txt");
    git("commit", "-m", "conflicting issue");
    const conflictingCandidate = git("rev-parse", "HEAD");
    git("checkout", "target");
    writeFileSync(join(repo, "base.txt"), "target change\n");
    git("add", "base.txt");
    git("commit", "-m", "target conflict");
    const targetBeforeB = git("rev-parse", "HEAD");
    const contained = planIntegration(targetBeforeB, candidateA);
    assert.equal(contained.kind, "contained-merge");
    assert.deepEqual(git("rev-list", "--parents", "-n", "1", contained.integration).split(/\s+/u), [contained.integration, targetBeforeB, candidateA]);
    assert.equal(git("rev-parse", `${contained.integration}^{tree}`), git("rev-parse", `${targetBeforeB}^{tree}`));
    git("checkout", "-b", "integrate-conflict", targetBeforeB);
    assert.throws(() => git("merge", "--no-ff", "-m", "must conflict", conflictingCandidate));
    git("merge", "--abort");
    git("checkout", "target");
    assert.equal(git("rev-parse", "HEAD"), targetBeforeB, "a conflict must not advance the real target");
    assert.equal(isAncestor(conflictingCandidate, targetBeforeB), false);

    git("checkout", "-b", "issue-b", baseline);
    writeFileSync(join(repo, "b.txt"), "B\n");
    git("add", "b.txt");
    git("commit", "-m", "issue B");
    const candidateB = git("rev-parse", "HEAD");
    assert.deepEqual(planIntegration(targetBeforeB, candidateB), { kind: "merge" });
    git("checkout", "-b", "integrate-b", targetBeforeB);
    git("merge", "--no-ff", "-m", "integrate issue B", candidateB);
    const integrationB = git("rev-parse", "HEAD");
    assert.equal(git("rev-list", "--parents", "-n", "1", integrationB).split(/\s+/u).length, 3);
    assert.equal(isAncestor(targetBeforeB, integrationB), true);
    assert.equal(isAncestor(candidateB, integrationB), true);

    git("checkout", "target");
    writeFileSync(join(repo, "tracked-local.txt"), "unstaged local edit\n");
    writeFileSync(join(repo, "staged-local.txt"), "staged local work\n");
    git("add", "staged-local.txt");
    writeFileSync(join(repo, "untracked-local.txt"), "untracked local work\n");
    const snapshot = () => ({
      status: rawGit("status", "--porcelain=v1", "-z"),
      tracked: readFileSync(join(repo, "tracked-local.txt"), "utf8"),
      staged: readFileSync(join(repo, "staged-local.txt"), "utf8"),
      stagedIndex: git("ls-files", "--stage", "staged-local.txt"),
      untracked: readFileSync(join(repo, "untracked-local.txt"), "utf8"),
    });
    const dirtyBefore = snapshot();
    assert.match(dirtyBefore.status, / M tracked-local\.txt\0/u);
    assert.match(dirtyBefore.status, /A  staged-local\.txt\0/u);
    assert.match(dirtyBefore.status, /\?\? untracked-local\.txt\0/u);
    git("merge", "--ff-only", integrationB);
    const aggregate = git("rev-parse", "HEAD");
    assert.deepEqual(snapshot(), dirtyBefore, "fast-forward integration must preserve unrelated target dirt exactly");
    assert.equal(isAncestor(candidateA, aggregate), true);
    assert.equal(isAncestor(candidateB, aggregate), true);

    const executionState = { id: "issue-b-success", kind: "implementation_complete", candidate: candidateB };
    const closeReceipt = {
      schema: "dirty-target-preservation:v1",
      phase: "VERIFIED",
      executionStateId: executionState.id,
      targetBefore: targetBeforeB,
      candidate: candidateB,
      integration: integrationB,
      targetAfter: aggregate,
      candidateReachable: isAncestor(candidateB, aggregate),
      dirtySnapshot: dirtyBefore,
    };
    const receiptReadBack = JSON.parse(JSON.stringify(closeReceipt));
    assert.deepEqual(receiptReadBack, closeReceipt);
    assert.equal(receiptReadBack.executionStateId, executionState.id);
    assert.equal(receiptReadBack.candidateReachable, true);

    const closeAndReadBack = ({ tracker, issueWorktree }) => {
      assert.equal(tracker.state, "OPEN");
      assert.equal(tracker.latestExecutionStateId, receiptReadBack.executionStateId, "execution state drift stops closure");
      assert.equal(tracker.blockersClosed, true, "blocker drift stops closure");
      assert.equal(receiptReadBack.phase, "VERIFIED");
      assert.equal(receiptReadBack.targetAfter, git("rev-parse", "target"));
      assert.equal(issueWorktree.registered && issueWorktree.clean, true, "only the exact clean Issue worktree may be removed");
      issueWorktree.registered = false;
      tracker.state = "CLOSED";
      return JSON.parse(JSON.stringify({ state: tracker.state, worktreeRegistered: issueWorktree.registered }));
    };
    const blockerDrift = { state: "OPEN", latestExecutionStateId: executionState.id, blockersClosed: false };
    const blockerWorktree = { registered: true, clean: true };
    assert.throws(() => closeAndReadBack({ tracker: blockerDrift, issueWorktree: blockerWorktree }), /blocker drift/u);
    assert.deepEqual({ state: blockerDrift.state, registered: blockerWorktree.registered }, { state: "OPEN", registered: true });
    const executionDrift = { state: "OPEN", latestExecutionStateId: "issue-b-blocked", blockersClosed: true };
    const executionWorktree = { registered: true, clean: true };
    assert.throws(() => closeAndReadBack({ tracker: executionDrift, issueWorktree: executionWorktree }), /execution state drift/u);
    assert.deepEqual({ state: executionDrift.state, registered: executionWorktree.registered }, { state: "OPEN", registered: true });
    const tracker = { state: "OPEN", latestExecutionStateId: executionState.id, blockersClosed: true };
    const issueWorktree = { registered: true, clean: true };
    assert.deepEqual(closeAndReadBack({ tracker, issueWorktree }), { state: "CLOSED", worktreeRegistered: false });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("aggregate pre-push gate fails closed and binds readiness to exact target HEAD", () => {
  const { repo, git, isAncestor } = createGitFixture("skills-push-gate-fixture-");

  try {
    writeFileSync(join(repo, "base.txt"), "base\n");
    git("add", "base.txt");
    git("commit", "-m", "base");
    const baseline = git("rev-parse", "HEAD");

    git("checkout", "-b", "issue-a");
    writeFileSync(join(repo, "a.txt"), "A\n");
    git("add", "a.txt");
    git("commit", "-m", "issue A");
    const candidateA = git("rev-parse", "HEAD");
    git("checkout", "target");
    git("merge", "--ff-only", candidateA);
    git("checkout", "-b", "issue-b", baseline);
    writeFileSync(join(repo, "b.txt"), "B\n");
    git("add", "b.txt");
    git("commit", "-m", "issue B");
    const candidateB = git("rev-parse", "HEAD");
    git("checkout", "-b", "integrate-b", candidateA);
    git("merge", "--no-ff", "-m", "integrate issue B", candidateB);
    const integrationB = git("rev-parse", "HEAD");
    git("checkout", "target");
    git("merge", "--ff-only", integrationB);
    const verifiedHead = git("rev-parse", "HEAD");
    git("checkout", "-b", "issue-omitted", baseline);
    writeFileSync(join(repo, "omitted.txt"), "not integrated\n");
    git("add", "omitted.txt");
    git("commit", "-m", "omitted issue");
    const omittedCandidate = git("rev-parse", "HEAD");
    git("checkout", "target");

    const successA = { id: "A-success", kind: "implementation_complete", target: "target", candidate: candidateA, commands: ["test:a"] };
    const successB = { id: "B-success", kind: "implementation_complete", target: "target", candidate: candidateB, commands: ["test:b"] };
    const successOmitted = { id: "O-success", kind: "implementation_complete", target: "target", candidate: omittedCandidate, commands: ["test:o"] };
    const receiptA = { phase: "VERIFIED", target: "target", executionStateId: successA.id, candidate: candidateA, integration: candidateA };
    const receiptB = { phase: "VERIFIED", target: "target", executionStateId: successB.id, candidate: candidateB, integration: integrationB };
    const receiptOmitted = { phase: "VERIFIED", target: "target", executionStateId: successOmitted.id, candidate: omittedCandidate, integration: omittedCandidate };
    const completeIssues = [
      { id: "A", execution: [successA], receipts: [receiptA] },
      { id: "B", execution: [successB], receipts: [receiptB] },
    ];

    const runGate = ({ issues, reviewClean = true, verificationClean = true }) => {
      const currentHead = git("rev-parse", "target");
      assert.equal(currentHead, verifiedHead, "target movement invalidates verification evidence");
      const relevant = issues.filter((issue) =>
        issue.execution.some((state) => state.target === "target") ||
        issue.receipts.some((receipt) => receipt.target === "target"));
      assert.ok(relevant.length > 0, "the target must have a non-empty closed-Issue set");
      const members = relevant.map((issue) => {
        const latest = issue.execution.at(-1);
        assert.equal(latest?.kind, "implementation_complete", `${issue.id}: missing completion or superseding blocked state`);
        const receipt = issue.receipts.find((item) => item.target === "target");
        assert.ok(receipt, `${issue.id}: missing closeout receipt`);
        assert.equal(receipt.executionStateId, latest.id, `${issue.id}: execution-state mismatch`);
        assert.equal(receipt.candidate, latest.candidate, `${issue.id}: candidate mismatch`);
        assert.equal(receipt.phase, "VERIFIED");
        assert.equal(isAncestor(receipt.candidate, currentHead), true, `${issue.id}: omitted candidate`);
        assert.equal(isAncestor(receipt.integration, currentHead), true, `${issue.id}: omitted integration`);
        return { issue: issue.id, candidate: receipt.candidate, integration: receipt.integration, executionStateId: latest.id };
      });
      assert.equal(reviewClean, true, "aggregate review failed");
      assert.equal(verificationClean, true, "aggregate verification failed");
      const commands = [...new Set(relevant.flatMap((issue) => issue.execution.at(-1).commands))];
      const receipt = {
        schema: "push_ready:v1",
        target: "target",
        baseline,
        head: currentHead,
        members,
        standards: "clean",
        spec: "clean",
        commands: commands.map((command) => ({ command, result: "passed" })),
      };
      git("notes", "--ref=refs/notes/matt-push-ready", "add", "-m", JSON.stringify(receipt), currentHead);
      return JSON.parse(git("notes", "--ref=refs/notes/matt-push-ready", "show", currentHead));
    };

    assert.throws(() => runGate({ issues: [{ ...completeIssues[0], receipts: [] }] }), /missing closeout receipt/u);
    assert.throws(() => runGate({ issues: [{ ...completeIssues[0], execution: [] }] }), /missing completion/u);
    const blockedA = JSON.parse(JSON.stringify({ id: "A-blocked", kind: "implementation_blocked", target: "target", reason: "verification failed" }));
    assert.throws(() => runGate({ issues: [{ ...completeIssues[0], execution: [successA, blockedA] }] }), /superseding blocked state/u);
    assert.throws(() => runGate({ issues: [...completeIssues, { id: "O", execution: [successOmitted], receipts: [receiptOmitted] }] }), /omitted candidate/u);
    assert.throws(() => runGate({ issues: completeIssues, reviewClean: false }), /aggregate review failed/u);
    assert.throws(() => runGate({ issues: completeIssues, verificationClean: false }), /aggregate verification failed/u);
    assert.equal(git("notes", "--ref=refs/notes/matt-push-ready", "list"), "");

    const ready = runGate({ issues: completeIssues });
    assert.equal(ready.head, verifiedHead);
    assert.deepEqual(ready.members.map(({ issue }) => issue), ["A", "B"]);
    assert.deepEqual(ready.commands, [
      { command: "test:a", result: "passed" },
      { command: "test:b", result: "passed" },
    ]);
    writeFileSync(join(repo, "drift.txt"), "target moved\n");
    git("add", "drift.txt");
    git("commit", "-m", "target drift");
    assert.notEqual(git("rev-parse", "target"), ready.head, "a stale receipt must not authorize the moved target");
    assert.throws(() => runGate({ issues: completeIssues }), /target movement invalidates/u);
  } finally {
    rmSync(repo, { recursive: true, force: true });
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
  assert.match(matt, /`\/setup-pre-execute-issue/u);
  assert.match(matt, /`\/pre-execute-issue/u);
  assert.match(matt, /`\/execute-issue`/u);
  assert.match(matt, /`\/close-issue`/u);
  assert.match(matt, /`\/verify-target-before-push/iu);
  assert.match(matt, /`\/grilling`/u);
  assert.match(matt, /`\/explain-decision`/u);
  assert.match(matt, /Tracker Spec.*`\/execute-issue`.*Standalone Spec.*`\/implement`/isu);
  assert.match(matt, /Issue worktrees may run concurrently/iu);
  assert.match(matt, /close-issue.*exact candidate.*current local target.*close/isu);
  assert.match(matt, /Before push.*verify-target-before-push.*exact aggregate target/isu);
  assert.match(matt, /to-spec.*sole authority.*Single-Issue.*Multi-Issue/isu);
  assert.doesNotMatch(matt, /ask-ron|to-spec-ron|to-tickets-ron/u);

  const context = read("CONTEXT.md");
  assert.match(context, /Manual integration serialization.*one integration into the same target branch.*other target branches.*concurrently/isu);
  assert.doesNotMatch(context, /checks once|parallel target writers/iu);

  for (const name of [
    "ask-matt",
    "wiki",
    "remove-ron",
    "setup-pre-execute-issue",
    "pre-execute-issue",
    "execute-issue",
    "close-issue",
    "verify-target-before-push",
  ]) {
    const page = read(`docs/engineering/${name}.md`);
    assert.doesNotMatch(page, /\]\((?:\.\/|\.\.\/)/u);
    assert.match(page, /## What it does/u);
    assert.match(page, /## When to reach for it/u);
    assert.match(page, /## Where it fits/u);
    assert.match(page, /https:\/\/aihero\.dev\/skills-ask-matt/u);
  }
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
    "skills/engineering/setup-pre-execute-issue/SKILL.md",
    "skills/engineering/pre-execute-issue/SKILL.md",
    "skills/engineering/execute-issue/SKILL.md",
    "skills/engineering/close-issue/SKILL.md",
    "skills/engineering/verify-target-before-push/SKILL.md",
    "docs/engineering/implement.md",
    "docs/engineering/setup-pre-execute-issue.md",
    "docs/engineering/pre-execute-issue.md",
    "docs/engineering/execute-issue.md",
    "docs/engineering/close-issue.md",
    "docs/engineering/verify-target-before-push.md",
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
