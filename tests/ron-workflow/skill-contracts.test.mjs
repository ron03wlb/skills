import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8").replace(/\r\n?/gu, "\n");

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
  const execute = read("skills/engineering/execute-issue/SKILL.md");
  const context = read("CONTEXT.md");
  const specDocs = read("docs/engineering/to-spec.md");
  const ticketsDocs = read("docs/engineering/to-tickets.md");
  const matt = read("skills/engineering/ask-matt/SKILL.md");
  const mattDocs = read("docs/engineering/ask-matt.md");
  const deliveryAdr = read("docs/adr/0022-use-issue-native-execution-and-closeout.md");

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
  const specTemplate = spec.match(/<spec-template>(.*?)<\/spec-template>/su)?.[1] ?? "";
  assert.match(specTemplate, /Planning baseline.*Mode: <primary or revision>.*Commit:.*Seal:/su, "Spec template omits revision lineage");

  const ticketsSeal = tickets.indexOf("Planning Seal");
  const ticketsPublish = tickets.indexOf("Publish the tickets", ticketsSeal);
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
  const localTicketTemplate = tickets.match(/<local-ticket-template>(.*?)<\/local-ticket-template>/su)?.[1] ?? "";
  const issueTemplate = tickets.match(/<issue-template>(.*?)<\/issue-template>/su)?.[1] ?? "";
  for (const [name, template] of [["local", localTicketTemplate], ["tracker", issueTemplate]]) {
    assert.match(template, /Planning baseline.*Commit:.*Seal: <created, successor, or reused>/su, `${name} ticket template has an incomplete Planning baseline`);
  }
  assert.match(tickets, /Read each published ticket back.*Planning baseline.*blocking/isu);
  const realTrackerPublish = tickets.indexOf("- **A real issue tracker");
  const ticketReadBack = tickets.indexOf("Read each published ticket back");
  assert.equal(ticketReadBack > realTrackerPublish, true, "to-tickets must read back after selecting the publication mode");

  assert.match(execute, /Planning Seal.*ancestor of the execution baseline/isu);
  assert.match(execute, /seal-currency check.*not scope authority/isu);
  assert.match(execute, /never creates or repairs a Planning Seal/iu);
  assert.match(execute, /stop.*tell the human to invoke `\/to-spec` or `\/to-tickets`/isu);
  assert.match(context, /new seal commit.*only approved.*no relevant planning-artifact delta.*reuse/isu);

  const prerequisites = specDocs.match(/## Prerequisites\s+(.*?)\n## /su)?.[1] ?? "";
  assert.match(prerequisites, /setup-matt-pocock-skills/u, "to-spec docs have an empty Prerequisites section");
  const ticketsWhen = ticketsDocs.match(/## When to reach for it\s+(.*?)\n## /su)?.[1] ?? "";
  assert.match(ticketsWhen, /approved plan or conversation.*directly/isu, "to-tickets docs make to-spec mandatory");
  assert.doesNotMatch(ticketsWhen, /produce one first/iu, "to-tickets docs contradict the no-linked-Spec path");
  const directTicketRoute = /approved plan or conversation may skip `\/to-spec` and invoke `\/to-tickets` directly/iu;
  for (const [path, content] of [
    ["skills/engineering/ask-matt/SKILL.md", matt],
    ["docs/engineering/ask-matt.md", mattDocs],
    ["docs/adr/0022-use-issue-native-execution-and-closeout.md", deliveryAdr],
  ]) assert.match(content, directTicketRoute, `${path} omits the direct ticket route`);
  for (const [path, content] of [
    ["skills/engineering/ask-matt/SKILL.md", matt],
    ["docs/engineering/ask-matt.md", mattDocs],
  ]) assert.match(content, /grill-with-docs.*planning-artifact delta.*to-spec/isu, path + " lets a small grilled build bypass to-spec");

  for (const [path, page] of [["to-spec", specDocs], ["to-tickets", ticketsDocs], ["ask-matt", mattDocs]]) {
    const whatItDoes = page.match(/## What it does\s+(.*?)\n## /su)?.[1] ?? "";
    const paragraphs = whatItDoes.trim().split(/\n\s*\n/u).filter(Boolean);
    assert.equal(paragraphs.length <= 2, true, `${path} docs exceed two What-it-does paragraphs`);
  }


  const fixedHeadings = new Set(["What it does", "When to reach for it", "Prerequisites", "It's working if", "Where it fits"]);
  const ticketMiddleHeadings = [...ticketsDocs.matchAll(/^## (.+)$/gmu)]
    .map((match) => match[1])
    .filter((heading) => !fixedHeadings.has(heading));
  assert.equal(ticketMiddleHeadings.length <= 3, true, "to-tickets docs exceed three free-form middle sections");
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


test("Issue delivery uses Matt specs and separate execution and closeout", () => {
  const execute = read("skills/engineering/execute-issue/SKILL.md");
  assert.match(execute, /dedicated Git worktree/iu);
  assert.match(execute, /linked Spec/iu);
  assert.match(execute, /code-review/u);
  assert.match(execute, /Standards/u);
  assert.match(execute, /Spec/u);
  assert.match(execute, /10 repair waves per invocation/iu);
  assert.match(execute, /completion note/iu);
  assert.match(execute, /never invokes `close-issue`/iu);
  assert.doesNotMatch(execute, /review_profile|focused review|full review/iu);

  const close = read("skills/engineering/close-issue/SKILL.md");
  assert.match(close, /completion note/iu);
  assert.match(close, /original target branch/iu);
  assert.match(close, /fast-forward/iu);
  assert.match(close, /git worktree remove/u);
  assert.match(close, /Close the Issue/iu);
  assert.match(close, /read it back once/iu);
  assert.match(close, /without rebasing/iu);
  assert.match(close, /original target worktree does not need to be clean/iu);
  assert.match(close, /staged, unstaged, and untracked/iu);
  assert.match(close, /same path or an ancestor\/descendant path-prefix pair/iu);
  assert.match(close, /Any collision stops with the Issue open/iu);
  assert.match(close, /For candidate and dirty renames, include both source and destination/iu);
  assert.match(close, /Parse.*NUL-safely.*case semantics/isu);
  assert.match(close, /worktree content fingerprints.*index entries/isu);
  assert.match(close, /dirty-target-preservation:v1/u);
  assert.match(close, /phase `PREPARED`.*target-before SHA.*candidate SHA.*digest.*counts/isu);
  assert.match(close, /Read back and verify those exact fields before continuing/iu);
  assert.match(close, /update.*`VERIFIED`.*read back.*(?:failure|mismatch).*stops before cleanup/isu);
  assert.match(close, /target `HEAD` or digest moved.*stop this invocation.*Do not refresh the candidate, replace the receipt baseline/isu);
  assert.doesNotMatch(close, /target `HEAD` moved.*return to candidate refresh/isu);
  assert.match(close, /git merge --ff-only/u);
  assert.match(close, /never automatically stash, commit, clean, reset/iu);
  assert.match(close, /digest mismatch.*do not attempt automatic repair or rollback/isu);
  const prepared = close.indexOf("receipt in phase `PREPARED`");
  const preparedReadBack = close.indexOf("Read back and verify those exact fields", prepared);
  const finalPreflight = close.indexOf("Re-read the target `HEAD` and recompute the dirty snapshot immediately before the fast-forward", preparedReadBack);
  const fastForward = close.indexOf("run `git merge --ff-only`");
  const postFastForward = close.indexOf("After the fast-forward, recompute the canonical dirty snapshot", fastForward);
  const verified = close.indexOf("update the receipt to `VERIFIED`", fastForward);
  const verifiedReadBack = close.indexOf("then read back and verify those exact fields", verified);
  const cleanupHeadCheck = close.indexOf("Immediately re-read the target `HEAD`", verifiedReadBack);
  const cleanupAction = close.indexOf("Remove that worktree with `git worktree remove`", cleanupHeadCheck);
  const closureReceiptGate = close.indexOf("Require the same `VERIFIED` receipt", cleanupAction);
  const closureHeadCheck = close.indexOf("immediately re-read the target `HEAD`", closureReceiptGate);
  const closureAction = close.indexOf("Close the Issue through the configured tracker", closureHeadCheck);
  const orderedProof = [prepared, preparedReadBack, finalPreflight, fastForward, postFastForward, verified, verifiedReadBack, cleanupHeadCheck, cleanupAction, closureReceiptGate, closureHeadCheck, closureAction];
  assert.equal(orderedProof.every((position, index) => position !== -1 && (index === 0 || orderedProof[index - 1] < position)), true);
  assert.match(close, /tracker failure.*mismatch.*stops before integration/isu);
  assert.match(close, /never publish paths or file contents/iu);
  const verifiedProof = close.match(/After the fast-forward,[^\n]+/u)?.[0] ?? "";
  assert.match(verifiedProof, /digest.*match.*`VERIFIED`.*target-after equal to the candidate.*same digest.*read back/iu);
  assert.match(close, /`PREPARED` with target still equal to target-before.*matching digest.*fast-forward/isu);
  assert.match(close, /`PREPARED` with target already equal to the candidate.*matching digest.*`VERIFIED`.*cleanup/isu);
  assert.match(close, /`VERIFIED` with target equal to the candidate.*cleanup and closure.*without re-baselining/isu);
  assert.match(close, /missing, `FAILED`, mismatched, unreadable, or third-SHA receipt.*ambiguous and stops/isu);
  const cleanupGate = close.match(/Require the matching `VERIFIED` receipt before cleanup\.[^\n]+/u)?.[0] ?? "";
  const closureGate = close.match(/Require the same `VERIFIED` receipt[^\n]+/u)?.[0] ?? "";
  assert.match(cleanupGate, /re-read.*target `HEAD`.*receipt candidate.*before.*worktree/iu);
  assert.match(closureGate, /re-read.*target `HEAD`.*receipt candidate.*before.*clos/iu);
  assert.match(close, /target drift after verification.*stops.*without.*changing.*`VERIFIED`.*re-baselining/isu);
  assert.match(read("docs/engineering/close-issue.md"), /target may keep unrelated staged, unstaged, and untracked work/iu);
  assert.match(close, /update and read back the completion note/iu);
  assert.match(close, /already absent worktree means cleanup is complete/iu);
  const alreadyClosed = close.match(/If the Issue is already closed,[^\n]+/u)?.[0] ?? "";
  assert.match(alreadyClosed, /target `HEAD`.*recorded candidate.*worktree.*absent/iu);
  assert.match(alreadyClosed, /matching.*`VERIFIED` receipt/iu);
  assert.match(close, /read back.*closed state.*without.*clos(?:e|ing).*again/isu);
  assert.match(close, /never repairs product code/iu);

  for (const name of ["execute-issue", "close-issue"]) {
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
    for (const name of ["execute-issue", "close-issue"]) {
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
  assert.match(matt, /`\/execute-issue`/u);
  assert.match(matt, /`\/close-issue`/u);
  assert.match(matt, /default.*`\/implement`/isu);
  assert.match(matt, /Issue worktrees may run concurrently/iu);
  assert.match(matt, /proves unrelated target dirt.*read-back receipt/iu);
  assert.match(matt, /one integration into the same target branch/iu);
  assert.match(matt, /explicitly.*`\/execute-issue`.*`\/close-issue`/isu);
  assert.doesNotMatch(matt, /ask-ron|to-spec-ron|to-tickets-ron/u);

  const context = read("CONTEXT.md");
  assert.match(context, /Manual integration serialization.*one integration into the same target branch.*other target branches.*concurrently/isu);
  assert.doesNotMatch(context, /checks once|parallel target writers/iu);

  for (const name of [
    "ask-matt",
    "wiki",
    "remove-ron",
    "execute-issue",
    "close-issue",
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
    "skills/engineering/execute-issue/SKILL.md",
    "skills/engineering/close-issue/SKILL.md",
    "docs/adr/0021-focus-ron-on-local-issue-delivery.md",
    "docs/adr/0022-use-issue-native-execution-and-closeout.md",
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
