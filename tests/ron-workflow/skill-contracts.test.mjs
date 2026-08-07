import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("promoted skills, docs, READMEs, and plugin manifest stay in parity", () => {
  const manifest = JSON.parse(read(".claude-plugin/plugin.json")).skills.sort();
  const expected = [];

  for (const bucket of ["engineering", "productivity"]) {
    const bucketReadme = read(`skills/${bucket}/README.md`);
    for (const name of readdirSync(`skills/${bucket}`)) {
      const skillPath = `skills/${bucket}/${name}/SKILL.md`;
      if (!existsSync(skillPath)) continue;
      expected.push(`./skills/${bucket}/${name}`);
      assert.equal(
        existsSync(`docs/${bucket}/${name}.md`),
        true,
        `missing docs for ${name}`,
      );
      assert.match(
        read("README.md"),
        new RegExp(
          `\\]\\(\\./skills/${bucket}/${name}/SKILL\\.md\\)`,
          "u",
        ),
      );
      assert.match(
        bucketReadme,
        new RegExp(`\\]\\(\\./${name}/SKILL\\.md\\)`, "u"),
      );
      assert.equal(
        existsSync(`skills/${bucket}/${name}/agents/openai.yaml`),
        true,
        `missing OpenAI metadata for ${name}`,
      );
    }
  }

  assert.deepEqual(manifest, expected.sort());

  const promotedNames = new Set(
    manifest.map((path) => path.split("/").at(-1)),
  );
  for (const bucket of ["engineering", "productivity"]) {
    for (const name of readdirSync(`docs/${bucket}`)) {
      if (!name.endsWith(".md")) continue;
      for (const match of read(`docs/${bucket}/${name}`).matchAll(
        /https:\/\/aihero\.dev\/skills-([a-z0-9-]+)/gu,
      )) {
        assert.equal(
          promotedNames.has(match[1]),
          true,
          `docs/${bucket}/${name} links to unknown skill ${match[1]}`,
        );
      }
    }
  }
});

test("Wiki is one user-invoked state-aware control", () => {
  const skill = read("skills/engineering/wiki/SKILL.md");
  const metadata = read("skills/engineering/wiki/agents/openai.yaml");
  assert.match(skill, /disable-model-invocation: true/u);
  assert.match(metadata, /allow_implicit_invocation: false/u);
  assert.doesNotMatch(skill, /TODO/u);
  for (const term of [
    "config-validate",
    "status",
    "workflow-wiki-bootstrap-preview:v1",
    "workflow-wiki-sync-preview:v1",
    "change-spec-create",
    "execution-contract-create",
    "grant-derive",
    "execute-issue",
    "close-issue",
  ]) {
    assert.equal(skill.includes(term), true, `Wiki skill omits ${term}`);
  }
});

test("existing Ron skills consume the new shared contracts without stale gates", () => {
  const setup = read("skills/engineering/setup-ron/SKILL.md");
  assert.match(setup, /config-validate/u);
  assert.match(setup, /one local setup commit/u);
  assert.doesNotMatch(setup, /reviewed_baseline/u);
  assert.doesNotMatch(setup, /Setup never creates.*commits/u);

  const toSpec = read("skills/engineering/to-spec-ron/SKILL.md");
  assert.match(toSpec, /change-spec-create/u);
  assert.match(toSpec, /inherit/u);

  const toTickets = read("skills/engineering/to-tickets-ron/SKILL.md");
  assert.match(toTickets, /execution-contract-create/u);
  assert.match(toTickets, /wiki_baseline_requirement/u);
  assert.match(toTickets, /max_material_repair_waves: 10/u);
  assert.match(toTickets, /local_checkpoint_commits: allowed_after_verified_slice/u);
  assert.doesNotMatch(toTickets, /one final local commit/u);

  const execute = read("skills/engineering/execute-issue/SKILL.md");
  assert.match(execute, /missing-with-bootstrap-preview/u);
  assert.match(execute, /delegation policy must be `denied`/u);
  assert.match(execute, /without another human approval/u);
  assert.match(execute, /local checkpoint commit/u);
  assert.match(execute, /implementation_commits:/u);
  assert.doesNotMatch(execute, /Only a new bounded Repair Grant/u);
  assert.doesNotMatch(execute, /create one final local implementation commit/u);
  assert.doesNotMatch(
    execute,
    /approved Wiki baseline exists, or `wiki_impact: none`/u,
  );

  const close = read("skills/engineering/close-issue/SKILL.md");
  assert.match(close, /workflow-wiki-reconciliation-ledger:v1/u);
  assert.match(close, /closeout-preview-create/u);
  assert.match(close, /closeout-grant-derive/u);
  assert.match(close, /non-delegating siblings/u);
  assert.match(close, /Parent child-contract aggregate hash/u);
  assert.match(close, /`target_refresh` is always `denied`/u);
  assert.match(close, /Any confirmed finding ends the clean path/u);
  assert.match(close, /ordered implementation commits/u);
  assert.doesNotMatch(close, /always present one exact Closeout Preview/u);

  const wiki = read("skills/engineering/wiki/SKILL.md");
  assert.match(wiki, /delegation-envelope-create/u);
  assert.match(wiki, /`target_refresh: denied`/u);

  const protocol = read("docs/agents/codex-subagent-protocol.md");
  assert.match(protocol, /八個 Ron skills/u);
  assert.match(protocol, /bounded human repair Grant/u);
  assert.match(protocol, /不得由derived Issue Grant再委派/u);
  assert.match(protocol, /`target_refresh`固定為`denied`/u);
  assert.doesNotMatch(protocol, /成功路徑只要求使用者回答一次/u);
  assert.doesNotMatch(protocol, /七個 Ron skills/u);

  assert.doesNotMatch(
    read("research/ron-canonical-wiki-docs-as-code-spec.md"),
    /未提交實作/u,
  );
  assert.doesNotMatch(
    read("research/matt-first-issue-delivery-workflow-spec.md"),
    /implementation is not installed, staged, committed/u,
  );
  assert.doesNotMatch(
    read("research/ron-canonical-wiki-docs-as-code-spec.md"),
    /bounded repair.*已完成並提交/u,
  );
});

test("Ron supports Wiki-optional semantic delivery without weakening ready Wiki", () => {
  const ask = read("skills/engineering/ask-ron/SKILL.md");
  assert.match(ask, /Wiki-optional delivery/u);
  assert.match(ask, /baseline is `missing`.*grill-with-docs/u);
  assert.doesNotMatch(ask, /baseline is `missing`: type/u);

  const toSpec = read("skills/engineering/to-spec-ron/SKILL.md");
  assert.match(
    toSpec,
    /wiki_impact: semantic[\s\S]*wiki_operation: none[\s\S]*wiki_baseline_requirement: not-applicable/u,
  );

  const toTickets = read("skills/engineering/to-tickets-ron/SKILL.md");
  assert.match(toTickets, /preserve Wiki-optional delivery/u);

  const execute = read("skills/engineering/execute-issue/SKILL.md");
  assert.match(execute, /semantic \+ none \+ not-applicable/u);

  const close = read("skills/engineering/close-issue/SKILL.md");
  assert.match(close, /ledger: null/u);
  assert.match(close, /protocol: null/u);

  for (const name of [
    "ask-ron",
    "setup-ron",
    "to-spec-ron",
    "to-tickets-ron",
    "execute-issue",
    "close-issue",
  ]) {
    assert.match(
      read(`docs/engineering/${name}.md`),
      /Wiki-optional delivery/u,
      `docs/engineering/${name}.md omits Wiki-optional delivery`,
    );
  }
});

test("routers and human docs expose Wiki without repo-relative published links", () => {
  assert.match(read("skills/engineering/ask-ron/SKILL.md"), /\/wiki/u);
  assert.match(read("skills/engineering/ask-matt/SKILL.md"), /state-aware `\/wiki`/u);

  for (const name of [
    "ask-matt",
    "ask-ron",
    "setup-ron",
    "wiki",
    "to-spec-ron",
    "to-tickets-ron",
    "execute-issue",
    "close-issue",
  ]) {
    const page = read(`docs/engineering/${name}.md`);
    assert.doesNotMatch(page, /\]\((?:\.\/|\.\.\/)/u);
    assert.match(page, /## What it does/u);
    assert.match(page, /## When to reach for it/u);
    assert.match(page, /## Where it fits/u);
  }
});

test("Wiki specs and changed documentation remain structurally valid", () => {
  const canonicalPath = "research/ron-canonical-wiki-docs-as-code-spec.md";
  const workflowPath = "research/matt-first-issue-delivery-workflow-spec.md";
  const canonical = read(canonicalPath);

  const configMatch = canonical.match(
    /<!-- ron-workflow-config:v1:begin -->\n```json\n([\s\S]*?)\n```\n<!-- ron-workflow-config:v1:end -->/u,
  );
  assert.notEqual(configMatch, null, "missing exact Ron config example");
  assert.doesNotThrow(() => JSON.parse(configMatch[1]));

  for (const path of [canonicalPath, workflowPath]) {
    const content = read(path);
    assert.equal(
      (content.match(/^```/gmu) ?? []).length % 2,
      0,
      `${path} has unbalanced fences`,
    );
    const acceptance = content.split("## Acceptance scenarios\n", 2)[1];
    assert.notEqual(acceptance, undefined, `${path} lacks acceptance scenarios`);
    const numbers = [...acceptance.matchAll(/^(\d+)\. /gmu)].map((match) =>
      Number(match[1]),
    );
    assert.deepEqual(
      numbers,
      Array.from({ length: numbers.length }, (_, index) => index + 1),
      `${path} has non-sequential acceptance numbering`,
    );
  }

  for (const path of [
    "README.md",
    "skills/engineering/README.md",
    "skills/engineering/ask-matt/SKILL.md",
    "skills/engineering/ask-ron/SKILL.md",
    "skills/engineering/setup-ron/SKILL.md",
    "skills/engineering/wiki/SKILL.md",
    "skills/engineering/to-spec-ron/SKILL.md",
    "skills/engineering/to-tickets-ron/SKILL.md",
    "skills/engineering/execute-issue/SKILL.md",
    "skills/engineering/close-issue/SKILL.md",
    canonicalPath,
    workflowPath,
    "docs/adr/0018-delegate-only-the-bounded-clean-path.md",
  ]) {
    for (const match of read(path).matchAll(/\]\(([^)]+)\)/gu)) {
      const destination = match[1].replace(/^<|>$/gu, "");
      if (
        destination.startsWith("#") ||
        /^[a-z][a-z0-9+.-]*:/iu.test(destination)
      ) {
        continue;
      }
      const localPath = destination.split("#", 1)[0];
      assert.equal(
        existsSync(resolve(dirname(path), localPath)),
        true,
        `${path} has a broken link to ${destination}`,
      );
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
    assert.doesNotMatch(
      read(path),
      /claude plugin validate|strict Claude plugin/iu,
      `${path} still requires Claude CLI validation`,
    );
  }
  assert.match(
    read("AGENTS.md"),
    /node --test tests\/ron-workflow\/skill-contracts\.test\.mjs/u,
  );
  assert.match(
    read("AGENTS.md"),
    /codex exec --ignore-user-config --ephemeral --sandbox read-only/u,
  );
});
