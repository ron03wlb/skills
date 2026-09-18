// The setup binding action and the documentation surfaces (Issue 126, AC-6 and AC-7).
//
// AC-6: for a GitLab tracker the approved plan carries exactly one binding action, it runs through the
// installed producer owner's `configure`, it is read back through that owner's `inspect`, read-only
// diagnostics keep their prohibition on both, an SSH remote asks the human for the HTTPS origin and the
// complete project path, and an absent or foreign installed entry is package-installation repair.
//
// AC-7: no promoted surface still states that GitLab lacks an automatic Run composition, and the
// `support.automaticRunHost` declaration matches the shipped capability.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { configureGitLabProducer, inspectGitLabProducer } from "../../skills/personal/run-issue-workflow/scripts/gitlab-producer-entry.mjs";
import { inspectGitLabToTickets } from "../../skills/personal/run-issue-workflow/scripts/gitlab-to-tickets-entry.mjs";

const read = (path) => readFileSync(path, "utf8");
const setupSkillPath = "skills/engineering/setup-matt-pocock-skills/SKILL.md";
const diagnosticsPath = "skills/engineering/setup-matt-pocock-skills/installed-workflow-diagnostics.md";
const setupDocsPath = "docs/engineering/setup-matt-pocock-skills.md";

const section = (text, heading, next = null) => {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing heading ${heading}`);
  const rest = text.slice(start);
  const end = next === null ? rest.length : rest.indexOf(next, heading.length);
  return rest.slice(0, end === -1 ? rest.length : end);
};

// Every surface AC-7 names, plus the two sibling references and the promoted skill docs that carried the
// same claim.
const GITLAB_RUN_SURFACES = [
  "skills/personal/run-issue-workflow/references/gitlab-producer-adapters.md",
  "skills/personal/run-issue-workflow/references/gitlab-to-tickets-adapters.md",
  "skills/engineering/setup-matt-pocock-skills/installed-workflow-diagnostics.md",
  "skills/engineering/setup-matt-pocock-skills/issue-tracker-gitlab.md",
  "docs/engineering/setup-matt-pocock-skills.md",
  "skills/engineering/ask-matt/SKILL.md",
  "docs/engineering/ask-matt.md",
  "skills/engineering/to-spec/references/spec-publication-interfaces.md",
  "skills/engineering/to-tickets/references/decomposition-publication-interfaces.md",
  "docs/engineering/to-spec.md",
  "skills/personal/run-issue-workflow/SKILL.md",
  "skills/personal/run-issue-workflow/OPERATOR.md",
  "skills/personal/run-issue-workflow/references/delivery-host.md",
];
// A claim that GitLab has no automatic Run composition. The GitHub statements are untouched: they say
// that a *producer* is not a Run host, which stays true.
const NO_RUN_CLAIM = /(?:no|not)\s+(?:an?\s+)?automatic\s+(?:GitLab\s+)?run(?:\s+composition|\s+host|\s+support)|automatic\s+(?:GitLab\s+)?run\s+(?:host|composition|hosting|support)\s+remains?\s+a\s+separate\s+capability|neither binding configures an automatic/iu;

test("AC-6: the approved plan lists the GitLab binding action before any write and only through its owner", () => {
  const skill = read(setupSkillPath);
  const plan = section(skill, "### 3. Present one bounded plan and take one acceptance", "### 4. Write, and sequence the owners");
  const owners = section(skill, "### 4. Write, and sequence the owners", "### 5. Done");
  const preflight = section(skill, "### 1. Explore and preflight", "### 2. Present findings and ask");
  const sections = section(skill, "### 2. Present findings and ask", "### 3. Present one bounded plan");

  // The binding is a plan action, its owner is named, and it is ordered before the plan's writes.
  assert.match(sections, /\*\*Section D: Tracker project binding\.\*\*/u, "the binding is a settled plan section");
  assert.match(plan, /GitLab project binding action is listed before every write/u);
  assert.match(plan, /gitlab-producer-entry\.mjs/u, "the owning source is named");
  const bindingParagraph = plan.slice(plan.indexOf("A GitLab project binding action is listed before every write"));
  for (const required of ["configure <repository>", "inspect <repository>", "repositoryId", "gitlab:<host>/<project>"]) {
    assert.equal(bindingParagraph.includes(required), true, `the plan action must name ${required}`);
  }
  // The plan presents the binding action before the files setup itself writes.
  assert.ok(bindingParagraph.indexOf("before every write") < plan.indexOf("Then show:"),
    "the binding action is presented before the configuration files setup writes");

  // `configure` and `inspect` are the only binding calls, and a read-only diagnostic performs neither.
  assert.match(owners, /`configure` is the only call that creates or reuses the binding and `inspect` is the only call that reads it back/u);
  assert.match(owners, /read-only diagnostics keep their prohibition on both/u);
  assert.match(owners, /`invoke` is never a binding call/u);
  assert.match(read(diagnosticsPath), /Never call `configure` or `invoke` during diagnostics/u);

  // An SSH remote needs the human's explicit values, passed to the owner.
  assert.match(plan, /For an SSH remote it asks the human for the HTTPS origin and the complete project path/u);
  assert.match(plan, /passes those two values to the owner rather than writing the file itself/u);

  // An absent or foreign installed entry is installation repair, never a hand-written binding.
  assert.match(plan, /A missing or foreign installed entry is package-installation repair, not a binding setup writes by hand/u);
  assert.match(preflight, /docs\/agents\/gitlab-producer\.json/u, "preflight reads the configured binding");
  assert.match(preflight, /fails closed on it/u);
  assert.equal(/docs\/agents\/gitlab-producer\.json[\s\S]{0,400}write the binding by hand/u.test(skill), false);

  // The owner itself carries the two explicit values an SSH remote needs, and its own repair message
  // names that entry rather than asking for a hand-written file.
  const entry = read("skills/personal/run-issue-workflow/scripts/gitlab-producer-entry.mjs");
  assert.match(entry, /--base-url <origin>/u);
  assert.match(entry, /--project <path>/u);
  assert.match(entry, /configure needs both --base-url and --project, or neither/u);
  assert.match(read("skills/personal/run-issue-workflow/scripts/gitlab-producer-transport.mjs"),
    /gitlab-producer-entry\.mjs configure <repository> --base-url <origin> --project <path>/u);
});

test("AC-6: the owner writes the binding from the human's explicit values and touches no tracker object", async (t) => {
  const repository = mkdtempSync(join(tmpdir(), "gitlab-binding-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-b", "main");
  // An SSH remote: the owner demands an explicit binding, and only the human's values can supply it.
  git("remote", "add", "origin", "git@gitlab.example:group/sub/project.git");
  const calls = [];
  const transport = async ({ method = "GET", path }) => {
    calls.push({ method, path });
    if (method !== "GET") throw new Error(`The binding write must touch no tracker object (${method} ${path})`);
    if (path === `projects/${encodeURIComponent("group/sub/project")}`) {
      return { id: 31, path_with_namespace: "group/sub/project", web_url: "https://gitlab.example/group/sub/project" };
    }
    if (path === "user") return { id: 7 };
    throw new Error(`Unexpected fixture request ${path}`);
  };
  const result = await configureGitLabProducer({
    repository,
    configuration: { schema: "gitlab-producer:v1", baseUrl: "https://gitlab.example", project: "group/sub/project" },
    transport,
  });
  assert.equal(result.state, "CONFIGURED");
  assert.equal(result.repositoryId, "gitlab:gitlab.example/group/sub/project");
  assert.deepEqual(JSON.parse(read(join(repository, "docs/agents/gitlab-producer.json"))),
    { schema: "gitlab-producer:v1", baseUrl: "https://gitlab.example", project: "group/sub/project" });
  assert.deepEqual(calls.filter((call) => call.method !== "GET"), []);
  // The owner validates what the human supplies; setup writes the file for nobody.
  await assert.rejects(() => configureGitLabProducer({
    repository,
    configuration: { schema: "gitlab-producer:v1", baseUrl: "https://gitlab.example", project: "../escape" },
    transport,
  }), /Invalid GitLab project path/u);
});

test("AC-7: no promoted surface still claims GitLab has no automatic Run composition", () => {
  for (const path of GITLAB_RUN_SURFACES) {
    const text = read(path);
    const claim = text.match(NO_RUN_CLAIM);
    assert.equal(claim, null, `${path} still claims ${claim?.[0] ?? ""}`);
  }
  // The surfaces that must now tell the truth about the composed path say so.
  for (const path of [
    "skills/personal/run-issue-workflow/references/gitlab-producer-adapters.md",
    "skills/personal/run-issue-workflow/references/gitlab-to-tickets-adapters.md",
    "skills/engineering/setup-matt-pocock-skills/installed-workflow-diagnostics.md",
    setupDocsPath,
    "skills/engineering/ask-matt/SKILL.md",
    "skills/personal/run-issue-workflow/SKILL.md",
    "skills/personal/run-issue-workflow/OPERATOR.md",
    "skills/personal/run-issue-workflow/references/delivery-host.md",
  ]) {
    const text = read(path);
    assert.match(text, /GitLab/u, `${path} must name the configured GitLab path`);
    assert.match(text, /Tracker Run sources|GitLab tracker sources|GitLab composition|GitLab Run composition/u,
      `${path} must state the GitLab Run composition`);
  }
  // The diagnostics table keeps the read-only contract on both GitLab producer rows.
  const diagnostics = read(diagnosticsPath);
  const gitlabRows = diagnostics.split("\n").filter((line) => line.startsWith("| Concrete GitLab"));
  assert.equal(gitlabRows.length, 2);
  for (const row of gitlabRows) {
    assert.match(row, /Never call `(?:configure|invoke)/u, "a diagnostics row must keep the no-mutation rule");
    assert.equal(/not automatic Run composition/u.test(row), false);
  }
  assert.match(diagnostics, /GitLab \*\*Tracker Run sources\*\* composition makes the repository Run-ready/u);
});

test("AC-7: the support.automaticRunHost declaration matches the shipped capability", async (t) => {
  // The two GitLab bindings declare the capability a configured GitLab tracker now has; the GitHub
  // producer bindings keep their own unchanged declaration.
  assert.match(read("skills/personal/run-issue-workflow/scripts/gitlab-producer-entry.mjs"), /automaticRunHost: true/u);
  assert.match(read("skills/personal/run-issue-workflow/scripts/gitlab-to-tickets-entry.mjs"), /automaticRunHost: true/u);
  assert.match(read("skills/personal/run-issue-workflow/scripts/github-producer-entry.mjs"), /automaticRunHost: false/u);
  assert.match(read("skills/personal/run-issue-workflow/scripts/github-to-tickets-entry.mjs"), /automaticRunHost: false/u);

  // The live read-back reports the same declaration for a repository whose binding is present.
  const repository = mkdtempSync(join(tmpdir(), "gitlab-run-docs-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  mkdirSync(join(repository, "docs/agents"), { recursive: true });
  writeFileSync(join(repository, "docs/agents/gitlab-producer.json"),
    `${JSON.stringify({ schema: "gitlab-producer:v1", baseUrl: "https://gitlab.example", project: "group/sub/project" }, null, 2)}\n`);
  writeFileSync(join(repository, "docs/agents/issue-tracker.md"), "Blocking representation: body\n");
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-b", "main");
  git("remote", "add", "origin", "https://gitlab.example/group/sub/project.git");
  const transport = async ({ path }) => {
    if (path === `projects/${encodeURIComponent("group/sub/project")}`) {
      return { id: 31, path_with_namespace: "group/sub/project", web_url: "https://gitlab.example/group/sub/project" };
    }
    if (path === "user") return { id: 7 };
    throw new Error(`Unexpected fixture request ${path}`);
  };
  const spec = await inspectGitLabProducer({ repository, transport });
  const decomposition = await inspectGitLabToTickets({ repository, transport });
  assert.equal(spec.state, "PRESENT");
  assert.equal(decomposition.state, "PRESENT");
  assert.equal(spec.support.automaticRunHost, true);
  assert.equal(decomposition.support.automaticRunHost, true);
  assert.equal(spec.repositoryId, "gitlab:gitlab.example/group/sub/project");
  assert.equal(decomposition.repositoryId, spec.repositoryId);
  // The binding the Run entry selects its composition from is the same file this read-back reports.
  assert.equal(spec.configuration, join(repository, "docs/agents/gitlab-producer.json"));
});
