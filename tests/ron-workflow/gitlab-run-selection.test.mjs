// Exact, fail-closed tracker selection (Issue 126, AC-1).
//
// The Start entry selects exactly one owning-source composition from the repository's own configured
// tracker evidence. A present, origin-matching GitLab binding selects the GitLab composition; a GitLab
// origin without that binding stops with the exact missing-binding repair instead of falling back to
// GitHub; a binding that does not match the origin, or contradictory evidence, stops with the observed
// values. The GitHub selection path and its Run behavior are unchanged.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGitHubWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-sources.mjs";
import { createGitLabWorkflowSources } from "../../skills/personal/run-issue-workflow/scripts/gitlab-workflow-sources.mjs";
import {
  GITLAB_BINDING_PATH,
  MISSING_GITLAB_BINDING_REPAIR,
  resolveCheckout,
  resolveTrackerSelection,
  startRun,
  trackerSourceFactory,
} from "../../skills/personal/run-issue-workflow/scripts/run-entry.mjs";

const GITHUB_ORIGIN = "https://github.com/example/repo.git";
const BASE_URL = "https://gitlab.example";
const HOST = "gitlab.example";
const PROJECT = "group/sub/project";

const repositoryWith = (t, { origin, binding = null, bindingText = null }) => {
  const repository = mkdtempSync(join(tmpdir(), "tracker-selection-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("remote", "add", "origin", origin);
  writeFileSync(join(repository, "README.md"), "baseline\n");
  git("add", "-A");
  git("commit", "-m", "baseline");
  if (binding !== null || bindingText !== null) {
    mkdirSync(join(repository, "docs/agents"), { recursive: true });
    writeFileSync(join(repository, GITLAB_BINDING_PATH),
      bindingText ?? `${JSON.stringify(binding, null, 2)}\n`);
  }
  return repository;
};
const binding = (overrides = {}) => ({ schema: "gitlab-producer:v1", baseUrl: BASE_URL, project: PROJECT, ...overrides });

test("a github.com origin with no GitLab binding keeps the exact GitHub selection", async (t) => {
  const repository = repositoryWith(t, { origin: GITHUB_ORIGIN });
  const selected = resolveTrackerSelection({ cwd: repository });
  assert.equal(selected.tracker, "github");
  assert.equal(selected.repositoryName, "example/repo");
  assert.equal(selected.configuration, null);
  assert.equal(selected.schema, "tracker-run-selection:v1");
  // The unchanged GitHub path: the same checkout read returns the same answer.
  assert.deepEqual(
    { repositoryName: resolveCheckout(repository).repositoryName, gitCommonDir: resolveCheckout(repository).gitCommonDir },
    { repositoryName: selected.repositoryName, gitCommonDir: selected.gitCommonDir },
  );
  assert.equal(trackerSourceFactory("github"), createGitHubWorkflowSources);
});

test("a present, origin-matching GitLab binding selects the GitLab composition", async (t) => {
  for (const origin of [`${BASE_URL}/${PROJECT}.git`, `git@${HOST}:${PROJECT}`, `ssh://git@${HOST}/${PROJECT}`]) {
    const repository = repositoryWith(t, { origin, binding: binding() });
    const selected = resolveTrackerSelection({ cwd: repository });
    assert.equal(selected.tracker, "gitlab", `origin ${origin} must select the GitLab composition`);
    assert.deepEqual(selected.configuration, binding());
    assert.equal(selected.repositoryName, null);
    assert.equal(selected.origin, origin.replace(/\.git$/u, ""));
    assert.equal(selected.bindingPath, join(repository, GITLAB_BINDING_PATH));
  }
  assert.equal(trackerSourceFactory("gitlab"), createGitLabWorkflowSources);
  assert.notEqual(trackerSourceFactory("gitlab"), trackerSourceFactory("github"));
});

test("a GitLab origin without the binding stops with the exact missing-binding repair", async (t) => {
  const repository = repositoryWith(t, { origin: `${BASE_URL}/${PROJECT}.git` });
  assert.throws(() => resolveTrackerSelection({ cwd: repository }), (error) => {
    assert.equal(error.code, "WORKFLOW_TRACKER_SELECTION");
    assert.match(error.message, new RegExp(GITLAB_BINDING_PATH.replace(/[/.]/gu, "\\$&"), "u"));
    assert.match(error.message, /is missing/u);
    assert.match(error.message, /gitlab-producer-entry\.mjs configure/u);
    assert.match(error.message, /never falls back to a GitHub composition/u);
    assert.equal(error.message.includes(MISSING_GITLAB_BINDING_REPAIR), true);
    assert.equal(error.message.includes(`https://github.com/`), false);
    return true;
  });
  // End to end: the same stop happens before any tracker read or Grant, so no Run starts on a guess.
  await assert.rejects(
    () => startRun({ cwd: repository, specId: "1", cacheDirectory: join(repository, ".cache") }),
    (error) => {
      assert.equal(error.code, "WORKFLOW_TRACKER_SELECTION");
      assert.match(error.message, /is missing/u);
      return true;
    },
  );
});

test("a binding that does not match the origin stops with the observed values", async (t) => {
  const repository = repositoryWith(t, {
    origin: "https://gitlab.example/other/project.git",
    binding: binding(),
  });
  assert.throws(() => resolveTrackerSelection({ cwd: repository }), (error) => {
    assert.equal(error.code, "WORKFLOW_TRACKER_SELECTION");
    assert.match(error.message, /Contradictory tracker evidence/u);
    assert.equal(error.message.includes("https://gitlab.example/other/project"), true, "the observed origin is reported");
    assert.equal(error.message.includes(`${BASE_URL}/${PROJECT}`), true, "the configured project is reported");
    return true;
  });
});

test("contradictory tracker evidence stops with the observed values", async (t) => {
  const repository = repositoryWith(t, { origin: GITHUB_ORIGIN, binding: binding() });
  assert.throws(() => resolveTrackerSelection({ cwd: repository }), (error) => {
    assert.equal(error.code, "WORKFLOW_TRACKER_SELECTION");
    assert.match(error.message, /Contradictory tracker evidence/u);
    assert.equal(error.message.includes("https://github.com/example/repo"), true);
    assert.equal(error.message.includes(`${BASE_URL}/${PROJECT}`), true);
    return true;
  });
});

test("an unreadable or foreign binding stops instead of falling back", async (t) => {
  const unreadable = repositoryWith(t, { origin: `${BASE_URL}/${PROJECT}.git`, bindingText: "{ not json" });
  assert.throws(() => resolveTrackerSelection({ cwd: unreadable }), (error) => {
    assert.equal(error.code, "WORKFLOW_TRACKER_SELECTION");
    assert.match(error.message, /not a valid GitLab producer binding/u);
    return true;
  });
  const foreign = repositoryWith(t, {
    origin: `${BASE_URL}/${PROJECT}.git`,
    binding: { schema: "github-producer:v1", repository: "example/repo" },
  });
  assert.throws(() => resolveTrackerSelection({ cwd: foreign }), (error) => {
    assert.equal(error.code, "WORKFLOW_TRACKER_SELECTION");
    assert.match(error.message, /not a valid GitLab producer binding/u);
    return true;
  });
});
