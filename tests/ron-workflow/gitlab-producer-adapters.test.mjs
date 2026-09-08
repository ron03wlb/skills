import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGitLabProducerAdapters } from "../../skills/personal/run-issue-workflow/scripts/gitlab-producer-adapters.mjs";
import { configureGitLabProducer, inspectGitLabProducer, invokeGitLabProducer } from "../../skills/personal/run-issue-workflow/scripts/gitlab-producer-entry.mjs";
import { createGlabTransport, digest } from "../../skills/personal/run-issue-workflow/scripts/gitlab-producer-transport.mjs";
import { mutateOnce } from "../../skills/personal/run-issue-workflow/scripts/gitlab-producer-mutations.mjs";

const publication = { title: "Account display", body: "# Settled Spec\n\n完整帳號 `00123`\n", classification: "SINGLE" };
function fixture(t, project = "group/sub/project") {
  const repository = mkdtempSync(join(tmpdir(), "gitlab-producer-test-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "target"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repository, "source.txt"), "source\n"); git("add", "source.txt"); git("commit", "-m", "fixture");
  const configuration = { schema: "gitlab-producer:v1", baseUrl: "https://gitlab.example", project };
  const projectUrl = `${configuration.baseUrl}/${project}`;
  git("remote", "add", "origin", `${projectUrl}.git`);
  const issues = new Map(); const notes = new Map(); const calls = []; let sequence = 1;
  const issue = (iid, description = "Original draft") => ({ id: 1000 + iid, iid, project_id: 31, issue_type: "issue",
    web_url: `${projectUrl}/-/issues/${iid}`, title: publication.title, description, labels: ["existing-label"], state: "opened",
    updated_at: "2026-09-01T00:00:00Z", author: { id: 7 } });
  issues.set(169, issue(169)); issues.set(170, issue(170));
  const failures = { afterWrite: null, beforeWrite: null, beforePut: null, afterPut: null, afterNote: null };
  const transport = async request => {
    const { method = "GET", path, body } = request; calls.push(structuredClone(request));
    if (path === `projects/${encodeURIComponent(project)}`) return { id: 31, path_with_namespace: project, web_url: projectUrl };
    if (path === "user") return { id: 7 };
    if (path === "projects/31/members/all/7") return { id: 7, access_level: 40 };
    if (method !== "GET" && failures.rejectionMethod === method) {
      failures.rejectionMethod = null;
      throw Object.assign(new Error("Rejected fixture request"), { code: "GITLAB_PRODUCER_TRANSPORT", httpStatus: 415,
        outcome: "REJECTED", requestId: "fixture-rejection" });
    }
    if (method !== "GET" && failures.beforeWrite === method) { failures.beforeWrite = null; throw new Error("timeout before delivery"); }
    const url = new URL(path, "https://fixture/");
    const route = url.pathname;
    let result;
    if (route === "/projects/31/labels") result = [{ name: "ready-for-agent" }, { name: "existing-label" }];
    else if (route === "/projects/31/issues") {
      if (method === "POST") { const created = { ...issue(++sequence), title: body.title, description: body.description }; issues.set(created.iid, created); result = created; }
      else result = [...issues.values()].filter(row => row.description.includes(url.searchParams.get("search") ?? ""));
    } else {
      const match = route.match(/^\/projects\/31\/issues\/(\d+)(?:\/notes(?:\/(\d+))?)?$/u);
      if (!match) throw new Error(`Unexpected fixture request ${method} ${path}`);
      const iid = Number(match[1]); const current = issues.get(iid);
      if (route.includes("/notes")) {
        const rows = notes.get(iid) ?? []; notes.set(iid, rows);
        if (method === "POST") {
          const note = { id: ++sequence + 4000, noteable_iid: iid, noteable_type: "Issue", system: false, author: { id: 7 }, body: body.body };
          rows.push(note); result = note;
          failures.afterNote?.(note);
        } else result = match[2] ? rows.find(row => row.id === Number(match[2])) : rows;
      } else if (method === "PUT") {
        failures.beforePut?.(current);
        Object.assign(current, { title: body.title, description: body.description, labels: [...new Set([...current.labels, body.add_labels])], updated_at: `2026-09-02T00:00:${++sequence}Z` });
        failures.afterPut?.(current); result = current;
      } else result = current;
    }
    if (Array.isArray(result)) {
      const page = Number(url.searchParams.get("page") ?? 1); result = result.slice((page - 1) * 100, page * 100);
    }
    if (method !== "GET" && failures.afterWrite === method) { failures.afterWrite = null; throw new Error("lost response after application"); }
    return structuredClone(result);
  };
  const options = { repository, configuration, transport, specId: 169, target: "target", publication };
  return { repository, configuration, git, issues, notes, calls, failures, options, transport,
    writes: () => calls.filter(call => call.method && call.method !== "GET") };
}
async function prepared(f, overrides = {}) {
  const adapter = await createGitLabProducerAdapters({ ...f.options, ...overrides });
  const current = await adapter.tracker.read();
  const baseline = f.git("rev-parse", "HEAD");
  const relevantFacts = { "source.txt": `git-blob:${f.git("rev-parse", "HEAD:source.txt")}` };
  assert.equal((await adapter.planning.readBaseline({ baseline, trackerVersion: current.version, relevantFacts, acceptedChanges: [] })).disposition, "COMPATIBLE");
  const identity = adapter.checkpoint.identity({ baseline, relevantFacts });
  await adapter.checkpoint.create(identity);
  await adapter.checkpoint.advance({ identity, stage: "planning_seal.read_back", receipt: adapter.planningSeal.read({ identity }) });
  return { adapter, identity, expectedVersion: current.version, expectedLabels: current.labels };
}
async function complete(f, context) {
  const { adapter, identity } = context;
  const receipt = await adapter.tracker.publish(context);
  await adapter.checkpoint.advance({ identity, stage: "publication.read_back", receipt });
  const handoff = await adapter.handoff.append({ identity });
  return adapter.checkpoint.advance({ identity, stage: "handoff.completed", receipt: handoff });
}

test("revision completes exact v2 evidence and restart retry makes no duplicate writes", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  const tx = await complete(f, ctx);
  assert.equal(tx.state, "COMPLETED");
  assert.deepEqual(tx.progress.map(row => row.stage), ["planning_seal.read_back", "publication.read_back", "handoff.completed"]);
  assert.equal(f.writes().length, 3);
  assert.deepEqual(f.issues.get(169).labels, ["existing-label", "ready-for-agent"]);
  const adapter = await createGitLabProducerAdapters(f.options);
  await complete(f, { ...ctx, adapter });
  assert.equal(f.writes().length, 3);
  assert.match(tx.progress[2].receipt.handoffIdentity, /issues\/169#note_\d+$/u);
  assert.equal(f.git("status", "--porcelain"), "");
});

test("title-only revision has a distinct operation and remains idempotent after restart", async t => {
  const f = fixture(t); const first = await prepared(f); await complete(f, first);
  const revised = { ...publication, title: "Approved revised title" };
  const second = await prepared(f, { publication: revised });
  assert.notEqual(first.identity.operationId, second.identity.operationId);
  assert.equal((await complete(f, second)).state, "COMPLETED");
  const adapter = await createGitLabProducerAdapters({ ...f.options, publication: revised });
  await complete(f, { ...second, adapter });
  assert.equal(f.issues.get(169).title, revised.title);
  assert.equal(f.writes().filter(call => call.method === "PUT").length, 2);
  assert.equal(f.writes().length, 6);
});

test("missing existing labels block publication and uncertain retries", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  f.failures.afterPut = current => { current.labels = ["ready-for-agent"]; };
  await assert.rejects(() => complete(f, ctx), /labels/u);
  const adapter = await createGitLabProducerAdapters(f.options);
  await assert.rejects(() => complete(f, { ...ctx, adapter }), /labels/u);
  assert.equal(f.writes().length, 1);
  assert.equal(f.notes.get(169).length, 0);
  assert.equal(adapter.checkpoint.read(ctx.identity).progress.length, 1);
});

test("primary reserves once, reuses the same native Issue after publication and across restart", async t => {
  const f = fixture(t);
  let adapter = await createGitLabProducerAdapters({ ...f.options, specId: undefined });
  const reserved = await adapter.tracker.reserve({ proposedSpecIdentity: "accepted-draft-A" });
  assert.equal((await adapter.tracker.reserve({ proposedSpecIdentity: "accepted-draft-A" })).nativeIssueId, reserved.nativeIssueId);
  await assert.rejects(() => adapter.tracker.reserve({ proposedSpecIdentity: "different-draft" }), /must not replace/u);
  const ctx = await prepared(f, { specId: reserved.trackerIdentity });
  await complete(f, ctx);
  adapter = await createGitLabProducerAdapters({ ...f.options, specId: undefined });
  const again = await adapter.tracker.reserve({ proposedSpecIdentity: "accepted-draft-A" });
  assert.equal(again.nativeIssueId, reserved.nativeIssueId);
  assert.equal(f.writes().filter(call => call.path === "projects/31/issues").length, 1);
});

test("lost response after PUT or note POST is reconciled without duplication", async t => {
  for (const method of ["PUT", "POST"]) {
    const f = fixture(t); const ctx = await prepared(f); f.failures.afterWrite = method;
    await complete(f, ctx);
    assert.equal(f.writes().length, 3);
  }
});

test("undelivered write remains unknown after restart rather than being repeated", async t => {
  const f = fixture(t); const ctx = await prepared(f); f.failures.beforeWrite = "PUT";
  await assert.rejects(() => ctx.adapter.tracker.publish(ctx), { code: "GITLAB_PRODUCER_UNKNOWN" });
  const adapter = await createGitLabProducerAdapters(f.options);
  await assert.rejects(() => adapter.tracker.publish(ctx), { code: "GITLAB_PRODUCER_UNKNOWN" });
  assert.equal(f.writes().length, 1);
});

test("stale versions and foreign projects fail before mutation", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  f.issues.get(169).description = "Another editor's change";
  await assert.rejects(() => ctx.adapter.tracker.publish(ctx), /version/u);
  assert.equal(f.writes().length, 0);
  await assert.rejects(() => createGitLabProducerAdapters({ ...f.options, configuration: { ...f.configuration, project: "other/project" } }), /origin/u);
  await assert.rejects(() => createGitLabProducerAdapters({ ...f.options, specId: "https://foreign/issues/169" }), /locator/u);
});

test("source drift blocks publication; unrelated target movement preserves the seal", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  writeFileSync(join(f.repository, "other.txt"), "unrelated\n"); f.git("add", "other.txt"); f.git("commit", "-m", "unrelated");
  assert.equal(ctx.adapter.planningSeal.read(ctx).planningSeal, ctx.identity.baseline);
  writeFileSync(join(f.repository, "source.txt"), "changed\n"); f.git("add", "source.txt"); f.git("commit", "-m", "relevant change");
  await assert.rejects(() => ctx.adapter.tracker.publish(ctx), /source changed/u);
  assert.equal(f.writes().length, 0);
});

test("duplicate or edited native records cannot produce a completed handoff", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  const receipt = await ctx.adapter.tracker.publish(ctx);
  await ctx.adapter.checkpoint.advance({ identity: ctx.identity, stage: "publication.read_back", receipt });
  const rows = f.notes.get(169); rows.push({ ...rows[0], id: rows[0].id + 100 });
  await assert.rejects(() => ctx.adapter.handoff.append(ctx), /Multiple records/u);
  rows.pop(); rows[0].body = rows[0].body.replace('"version": "sha256:', '"version": "changed:');
  await assert.rejects(() => ctx.adapter.handoff.append(ctx), /checkpoint is incomplete/u);
});

test("checkpoint rejects foreign bindings and fabricated receipts", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  await assert.rejects(() => ctx.adapter.checkpoint.advance({ identity: ctx.identity, stage: "publication.read_back", receipt: { publicationIdentity: "fake" } }), /read-back/u);
  await assert.rejects(() => ctx.adapter.tracker.publish({ ...ctx, identity: { ...ctx.identity, specId: "foreign" } }), /binding/u);
  assert.equal(f.writes().length, 0);
});

test("same module isolates operations across Specs and repositories", async t => {
  const f = fixture(t); const a = await prepared(f); const b = await prepared(f, { specId: 170 });
  await complete(f, a); await complete(f, b);
  assert.notEqual(a.identity.operationId, b.identity.operationId);
  const other = fixture(t, "second/repo"); const c = await prepared(other); await complete(other, c);
  assert.notEqual(c.identity.repositoryId, a.identity.repositoryId);
});

test("configure preserves existing bindings and inspect performs only reads without state creation", async t => {
  const f = fixture(t);
  assert.equal((await inspectGitLabProducer(f.options)).state, "MISSING");
  const result = await configureGitLabProducer(f.options);
  const contents = readFileSync(result.path, "utf8");
  assert.equal((await inspectGitLabProducer(f.options)).state, "PRESENT");
  await configureGitLabProducer(f.options); assert.equal(readFileSync(result.path, "utf8"), contents);
  assert.equal(existsSync(join(f.repository, ".git/matt-workflow-control")), false);
  assert.equal(f.writes().length, 0);
  const current = await invokeGitLabProducer({ ...f.options, input: { action: "read", specId: 169, target: "target", publication } });
  assert.equal(current.trackerIdentity, f.issues.get(169).web_url);
  await assert.rejects(() => invokeGitLabProducer({ ...f.options, input: { action: "delete" } }), /Unknown/u);
});

test("JSON bodies use stdin and provider failures do not leak secrets", async () => {
  let invocation;
  const configuration = { schema: "gitlab-producer:v1", baseUrl: "http://gitlab.example", project: "group/project" };
  const transport = createGlabTransport({ repository: ".", configuration, execute: (...args) => { invocation = args; return "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{}"; } });
  const body = { description: "中文\n`$(secret)`\n\"quoted\"" };
  await transport({ method: "PUT", path: "projects/31/issues/169", body });
  assert.deepEqual(JSON.parse(invocation[2].input), body);
  assert.equal(invocation[1].includes(body.description), false);
  assert.ok(invocation[1].includes("Content-Type: application/json"));
  assert.equal(invocation[2].env.GITLAB_API_PROTOCOL, "http");
  const failing = createGlabTransport({ repository: ".", configuration, execute: () => { throw new Error("secret-token"); } });
  await assert.rejects(() => failing({ path: "user" }), error => !error.message.includes("secret-token"));
});

test("unregistered document writes and quick actions stop without creating producer state", async t => {
  const f = fixture(t); const adapter = await createGitLabProducerAdapters(f.options); const current = await adapter.tracker.read();
  await assert.rejects(() => adapter.planning.readBaseline({ baseline: f.git("rev-parse", "HEAD"), trackerVersion: current.version, relevantFacts: {}, acceptedChanges: [{ path: "CONTEXT.md" }] }), /planning lane/u);
  await assert.rejects(() => createGitLabProducerAdapters({ ...f.options, publication: { ...publication, body: "# Spec\n/close" } }), /quick actions/u);
  assert.equal(f.writes().length, 0);
});

test("CLI inspect executes through the installed directory junction without external writes", t => {
  const repository = mkdtempSync(join(tmpdir(), "gitlab-producer-entry-test-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  const scripts = fileURLToPath(new URL("../../skills/personal/run-issue-workflow/scripts", import.meta.url));
  const linked = join(repository, "installed-scripts");
  symlinkSync(scripts, linked, process.platform === "win32" ? "junction" : "dir");
  const output = execFileSync(process.execPath, [join(linked, "gitlab-producer-entry.mjs"), "inspect", repository], { encoding: "utf8", windowsHide: true });
  assert.equal(JSON.parse(output).state, "MISSING");
  assert.equal(existsSync(join(repository, ".git")), false);
});

test("publication retries a rejected PUT or receipt POST only with explicit exact authority", async t => {
  for (const method of ["PUT", "POST"]) {
    const f = fixture(t), ctx = await prepared(f);
    f.failures.rejectionMethod = method;
    await assert.rejects(() => ctx.adapter.tracker.publish(ctx), { code: "GITLAB_PRODUCER_REJECTED" });
    assert.equal(ctx.adapter.tracker.readMutation(ctx).state, method === "PUT" ? "REJECTED" : "ACKNOWLEDGED");
    const before = f.writes().length;
    await assert.rejects(() => ctx.adapter.tracker.publish(ctx), { code: "GITLAB_PRODUCER_REJECTED" });
    assert.equal(f.writes().length, before);
    const adapter = await createGitLabProducerAdapters(f.options);
    assert.equal((await complete(f, { ...ctx, adapter, retryRejected: true })).state, "COMPLETED");
    assert.equal(f.writes().length, 4);
  }
});

test("primary reservation and handoff retain their exact identity after a rejected POST", async t => {
  const f = fixture(t);
  const adapter = await createGitLabProducerAdapters({ ...f.options, specId: undefined });
  f.failures.rejectionMethod = "POST";
  await assert.rejects(() => adapter.tracker.reserve({ proposedSpecIdentity: "rejected-primary" }), { code: "GITLAB_PRODUCER_REJECTED" });
  const reserved = await adapter.tracker.reserve({ proposedSpecIdentity: "rejected-primary", retryRejected: true });
  const ctx = await prepared(f, { specId: reserved.trackerIdentity });
  const receipt = await ctx.adapter.tracker.publish(ctx);
  await ctx.adapter.checkpoint.advance({ identity: ctx.identity, stage: "publication.read_back", receipt });
  f.failures.rejectionMethod = "POST";
  await assert.rejects(() => ctx.adapter.handoff.append(ctx), { code: "GITLAB_PRODUCER_REJECTED" });
  const before = f.writes().length;
  await assert.rejects(() => ctx.adapter.handoff.append(ctx), { code: "GITLAB_PRODUCER_REJECTED" });
  assert.equal(f.writes().length, before);
  const handoff = await ctx.adapter.handoff.append({ ...ctx, retryRejected: true });
  assert.equal((await ctx.adapter.checkpoint.advance({ identity: ctx.identity, stage: "handoff.completed", receipt: handoff })).state, "COMPLETED");
  assert.equal(f.notes.get(Number(reserved.issue.iid)).length, 2);
});

test("GitLab final LF removal completes without changing approved identity or duplicating writes", async t => {
  const f = fixture(t), ctx = await prepared(f);
  f.failures.afterPut = current => { current.description = current.description.slice(0, -1); };
  assert.equal((await complete(f, ctx)).state, "COMPLETED");
  const native = await ctx.adapter.tracker.read();
  assert.equal(native.body, publication.body.slice(0, -1));
  const receipt = await ctx.adapter.tracker.readPublication(ctx.identity);
  assert.equal(receipt.version, native.version);
  const record = JSON.parse(f.notes.get(169)[0].body.match(/^```workflow-record\n([\s\S]+)\n```$/u)[1]);
  assert.equal(record.authority.approvedScopeHash, digest(publication.body));
  const adapter = await createGitLabProducerAdapters(f.options);
  assert.equal(adapter.checkpoint.identity({ baseline: ctx.identity.baseline, relevantFacts: ctx.identity.bindings.relevantFacts }).operationId, ctx.identity.operationId);
  await complete(f, { ...ctx, adapter });
  assert.equal(f.writes().length, 3);
});

test("acknowledged pre-fix LF mismatch resumes its original intent without another PUT", async t => {
  const f = fixture(t), ctx = await prepared(f);
  const labels = [...ctx.expectedLabels, "ready-for-agent"].sort();
  // Reproduce the old reader failing after the native PUT was acknowledged.
  await assert.rejects(() => mutateOnce({ gitCommonDir: join(f.repository, ".git"), repositoryId: ctx.identity.repositoryId }, {
    key: `${ctx.identity.operationId}:issue-body`,
    payload: { body: publication.body, title: publication.title, labels, expectedVersion: ctx.expectedVersion, trackerIdentity: ctx.identity.specId },
    observe: async () => null,
    write: async () => {
      await f.transport({ method: "PUT", path: "projects/31/issues/169", body: { title: publication.title, description: publication.body, add_labels: "ready-for-agent" } });
      f.issues.get(169).description = publication.body.slice(0, -1);
    },
  }), { code: "GITLAB_PRODUCER_UNKNOWN" });
  const mutation = ctx.adapter.tracker.readMutation(ctx);
  assert.equal(mutation.state, "ACKNOWLEDGED");
  assert.equal(mutation.attempt, 1);
  const adapter = await createGitLabProducerAdapters(f.options);
  assert.equal((await complete(f, { ...ctx, adapter })).state, "COMPLETED");
  assert.deepEqual(adapter.tracker.readMutation(ctx), mutation);
  assert.equal(f.writes().filter(call => call.method === "PUT").length, 1);
  assert.equal(f.writes().length, 3);
});

test("final LF tolerance does not accept other body or native state changes", async t => {
  for (const alter of [
    current => { current.description = ` ${current.description}`; },
    current => { current.description = current.description.replace("\n\n", "\n"); },
    current => { current.description = current.description.slice(0, -2); },
    current => { current.description += "\n"; },
    current => { current.description = current.description.slice(0, -1); current.title += " changed"; },
    current => { current.description = current.description.slice(0, -1); current.state = "closed"; },
  ]) {
    const f = fixture(t), ctx = await prepared(f);
    f.failures.afterPut = alter;
    await assert.rejects(() => complete(f, ctx), { code: "GITLAB_PRODUCER_CONFLICT" });
    const adapter = await createGitLabProducerAdapters(f.options);
    await assert.rejects(() => complete(f, { ...ctx, adapter }), { code: "GITLAB_PRODUCER_CONFLICT" });
    assert.equal(f.writes().length, 1);
    assert.equal(adapter.checkpoint.read(ctx.identity).progress.length, 1);
  }
});

test("entry registers accepted documents, writes a seal and completes the same Spec with native read-back", async t => {
  const f = fixture(t);
  await configureGitLabProducer(f.options);
  const worktree = `${f.repository}-planning`;
  t.after(() => rmSync(worktree, { recursive: true, force: true }));
  const baseline = f.git("rev-parse", "HEAD");
  f.git("worktree", "add", "-b", "planning", worktree, baseline);
  writeFileSync(join(worktree, "CONTEXT.md"), "Accepted glossary\n");
  const authority = { path: join(f.repository, "handoff.md"), contentIdentity: digest("Explicit accepted glossary\n") };
  writeFileSync(authority.path, "Explicit accepted glossary\n");
  const acceptedChanges = [{ path: "CONTEXT.md", contentIdentity: digest(readFileSync(join(worktree, "CONTEXT.md"))) }];
  const invoke = (action, request) => invokeGitLabProducer({ ...f.options, input: { action, request, specId: 169, target: "target", publication } });
  const current = await invoke("read");
  const lane = await invoke("lane-register", { taskId: "accepted-task", worktree, baseline, acceptedChanges, authority });
  const request = { baseline, trackerVersion: current.version, relevantFacts: {}, acceptedChanges, lane };
  assert.equal((await invoke("baseline", request)).requiresPlanningLane, true);
  const seal = await invoke("seal-write", request);
  const identity = await invoke("identity", { baseline: seal.planningSeal, relevantFacts: seal.relevantFacts, sealOperationId: seal.operationId });
  await invoke("checkpoint-create", identity);
  await invoke("checkpoint-advance", { identity, stage: "planning_seal.read_back", receipt: await invoke("seal", { identity }) });
  const adapter = await createGitLabProducerAdapters(f.options);
  assert.equal((await complete(f, { adapter, identity, expectedVersion: current.version, expectedLabels: current.labels })).state, "COMPLETED");
  assert.equal(f.issues.get(169).description, publication.body);
  assert.equal(f.writes().length, 3);
  assert.equal(f.git("rev-list", "--count", `${baseline}..HEAD`), "1");
  assert.equal((await invoke("seal-write", request)).planningSeal, seal.planningSeal);
});
