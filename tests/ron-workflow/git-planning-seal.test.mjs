import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGitPlanningSeal } from "../../skills/personal/run-issue-workflow/scripts/git-planning-seal.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { digest } from "../../skills/personal/run-issue-workflow/scripts/gitlab-producer-transport.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "planning-seal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = join(root, "target"), worktree = join(root, "lane");
  mkdirSync(repository);
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
  git(repository, "init", "-b", "target");
  git(repository, "config", "user.name", "Fixture"); git(repository, "config", "user.email", "fixture@example.invalid");
  git(repository, "config", "core.autocrlf", "false");
  writeFileSync(join(repository, "CONTEXT.md"), "Old decision\n");
  writeFileSync(join(repository, "other.txt"), "Unrelated original\n");
  git(repository, "add", "."); git(repository, "commit", "-m", "baseline");
  const baseline = git(repository, "rev-parse", "HEAD");
  git(repository, "worktree", "add", "-b", "planning", worktree, baseline);
  writeFileSync(join(worktree, "CONTEXT.md"), "Accepted decision\n");
  mkdirSync(join(worktree, "docs")); writeFileSync(join(worktree, "docs/decision.md"), "Accepted detail\n");
  const authority = { path: join(root, "handoff.md"), contentIdentity: digest("Human accepted both documents\n") };
  writeFileSync(authority.path, "Human accepted both documents\n");
  const acceptedChanges = ["CONTEXT.md", "docs/decision.md"].map(path => ({ path, contentIdentity: digest(readFileSync(join(worktree, path))) }));
  const options = { repository, repositoryId: "gitlab:fixture/project", specId: "https://fixture/project/-/issues/142", target: "target", gitCommonDir: join(repository, ".git") };
  const owner = createGitPlanningSeal(options);
  const registration = { taskId: "task-142", worktree, baseline, acceptedChanges, authority };
  const lane = owner.register(registration);
  const request = { baseline, trackerVersion: "native-version", relevantFacts: {}, acceptedChanges, lane };
  const revalidate = async () => ({ disposition: "COMPATIBLE", baseline: git(repository, "rev-parse", "HEAD") });
  return { root, repository, worktree, git, baseline, owner, options, registration, request, revalidate };
}

test("exact accepted seal preserves unrelated target/lane dirt and retries one commit after restart", async t => {
  const f = fixture(t);
  writeFileSync(join(f.repository, "other.txt"), "Unrelated human edit\n");
  writeFileSync(join(f.repository, "untracked.txt"), "Keep me\n");
  writeFileSync(join(f.worktree, "scratch.txt"), "Unaccepted draft\n");
  const before = f.git(f.worktree, "status", "--porcelain");
  const receipt = await f.owner.write(f);
  assert.equal(receipt.state, "written");
  assert.equal(f.git(f.repository, "rev-parse", "HEAD^"), f.baseline);
  assert.equal(f.git(f.repository, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"), "CONTEXT.md\ndocs/decision.md");
  assert.equal(readFileSync(join(f.repository, "other.txt"), "utf8"), "Unrelated human edit\n");
  assert.equal(readFileSync(join(f.repository, "untracked.txt"), "utf8"), "Keep me\n");
  assert.equal(f.git(f.worktree, "status", "--porcelain"), before);
  const owner = createGitPlanningSeal(f.options);
  assert.deepEqual(await owner.write({ ...f, revalidate: () => { throw new Error("Retry must read existing seal"); } }), receipt);
  assert.equal(f.git(f.repository, "rev-list", "--count", `${f.baseline}..HEAD`), "1");
  // The completed handoff owner may dispose its planning lane later. Durable seal reads remain valid.
  f.git(f.repository, "worktree", "remove", "--force", f.worktree);
  rmSync(f.registration.authority.path);
  assert.deepEqual(createGitPlanningSeal(f.options).read(receipt), receipt);
  assert.deepEqual(await createGitPlanningSeal(f.options).write(f), receipt);
});

test("compatible unrelated target movement seals on latest parent; overlapping preimage drift stops", async t => {
  const f = fixture(t);
  writeFileSync(join(f.repository, "other.txt"), "Unrelated committed movement\n");
  f.git(f.repository, "add", "other.txt"); f.git(f.repository, "commit", "-m", "unrelated");
  const latest = f.git(f.repository, "rev-parse", "HEAD");
  await f.owner.write(f);
  assert.equal(f.git(f.repository, "rev-parse", "HEAD^"), latest);
  const other = fixture(t);
  writeFileSync(join(other.repository, "CONTEXT.md"), "Another accepted decision\n");
  other.git(other.repository, "add", "CONTEXT.md"); other.git(other.repository, "commit", "-m", "competing decision");
  const current = other.git(other.repository, "rev-parse", "HEAD");
  await assert.rejects(() => other.owner.write(other), /preimage changed.*CONTEXT/u);
  assert.equal(other.git(other.repository, "rev-parse", "HEAD"), current);
});

test("shared delivery writer contention stops before any seal intent and releases for the same retry", async t => {
  const f = fixture(t);
  const store = createRunStore({ gitCommonDir: f.options.gitCommonDir });
  const competing = store.acquireCloseWriter({ target: "target", runId: "delivery-142" });
  try { await assert.rejects(() => f.owner.write(f), /TARGET_CLOSE_WRITER_LOCKED/u); }
  finally { competing.release(); }
  assert.equal(existsSync(join(f.options.gitCommonDir, "matt-workflow-control/planning-seals/intents")), false);
  await f.owner.write(f);
  assert.equal(store.observeTargetMutationWriter({ target: "target" }).state, "ABSENT");
});

test("unapplied candidate survives overlapping dirt and is reused after the owner resolves it", async t => {
  const f = fixture(t);
  f.git(f.repository, "config", "merge.autoStash", "true");
  writeFileSync(join(f.repository, "CONTEXT.md"), "Keep conflicting local edit\n");
  await assert.rejects(() => f.owner.write(f));
  assert.equal(readFileSync(join(f.repository, "CONTEXT.md"), "utf8"), "Keep conflicting local edit\n");
  const directory = join(f.options.gitCommonDir, "matt-workflow-control/planning-seals/intents");
  const [name] = readdirSync(directory);
  const intent = JSON.parse(readFileSync(join(directory, name), "utf8"));
  assert.equal(f.git(f.repository, "rev-parse", "HEAD"), f.baseline);
  assert.equal(f.git(f.repository, "rev-parse", `refs/workflow/planning-seals/${intent.operationId}`), intent.commit);
  // This fixture models the human resolving their exact conflicting edit.
  writeFileSync(join(f.repository, "CONTEXT.md"), "Old decision\n");
  const receipt = await createGitPlanningSeal(f.options).write(f);
  assert.equal(receipt.planningSeal, intent.commit);
  assert.equal(readdirSync(directory).length, 1);
});

test("ignored target files are preserved when they overlap an accepted new document", async t => {
  const f = fixture(t);
  writeFileSync(join(f.options.gitCommonDir, "info/exclude"), "docs/decision.md\n");
  mkdirSync(join(f.repository, "docs"));
  writeFileSync(join(f.repository, "docs/decision.md"), "Ignored human draft\n");
  await assert.rejects(() => f.owner.write(f));
  assert.equal(f.git(f.repository, "rev-parse", "HEAD"), f.baseline);
  assert.equal(readFileSync(join(f.repository, "docs/decision.md"), "utf8"), "Ignored human draft\n");
});

test("altered accepted content, handoff, native lane or staged target work fail without rewriting them", async t => {
  for (const variant of ["content", "handoff", "lane", "index", "facts"]) {
    const f = fixture(t);
    if (variant === "content") writeFileSync(join(f.worktree, "CONTEXT.md"), "Unaccepted edit\n");
    if (variant === "handoff") writeFileSync(f.registration.authority.path, "Changed authority\n");
    if (variant === "lane") f.request.lane.taskId = "foreign-task";
    if (variant === "index") { writeFileSync(join(f.repository, "other.txt"), "Staged owner edit\n"); f.git(f.repository, "add", "other.txt"); }
    if (variant === "facts") f.revalidate = async () => ({ disposition: "DRIFTED", owningSource: "CONTEXT.md" });
    const status = f.git(f.repository, "status", "--porcelain");
    await assert.rejects(() => f.owner.write(f));
    assert.equal(f.git(f.repository, "rev-parse", "HEAD"), f.baseline);
    assert.equal(f.git(f.repository, "status", "--porcelain"), status);
  }
});

test("unsafe paths and foreign repositories cannot register and committed document drift invalidates receipt", async t => {
  const f = fixture(t);
  for (const path of ["../CONTEXT.md", "docs/../../outside.md", "src/code.java", "docs\\decision.md"]) {
    assert.throws(() => f.owner.register({ ...f.registration, acceptedChanges: [{ path, contentIdentity: digest("text") }] }), /paths/u);
  }
  assert.throws(() => f.owner.register({ ...f.registration, worktree: f.repository }), /isolated/u);
  const receipt = await f.owner.write(f);
  writeFileSync(join(f.repository, "CONTEXT.md"), "Later changed contract\n");
  f.git(f.repository, "add", "CONTEXT.md"); f.git(f.repository, "commit", "-m", "changed");
  assert.throws(() => f.owner.read(receipt), /drifted/u);
});

test("Unicode and spaced documentation paths preserve accepted bytes with Git newline filtering", async t => {
  const f = fixture(t);
  f.git(f.repository, "config", "core.autocrlf", "true");
  const path = "docs/決策 detail.md";
  const bytes = Buffer.from("已接受的契約\r\n保留原始換行\r\n", "utf8");
  writeFileSync(join(f.worktree, path), bytes);
  f.registration.acceptedChanges.push({ path, contentIdentity: digest(bytes) });
  f.request.lane = f.owner.register(f.registration);
  f.request.acceptedChanges = f.registration.acceptedChanges;
  const receipt = await f.owner.write(f);
  assert.equal(f.git(f.repository, "show", `${receipt.planningSeal}:${path}`), "已接受的契約\n保留原始換行");
  assert.deepEqual(readFileSync(join(f.worktree, path)), bytes);
  assert.equal(readFileSync(join(f.repository, path), "utf8").replaceAll("\r\n", "\n"), bytes.toString().replaceAll("\r\n", "\n"));
});
