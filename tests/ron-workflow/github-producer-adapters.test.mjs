import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGitHubProducerAdapters } from "../../skills/personal/run-issue-workflow/scripts/github-producer-adapters.mjs";
import { createOperationEnvelopeStore } from "../../skills/personal/run-issue-workflow/scripts/operation-envelope-store.mjs";
import { configureGitHubProducer, inspectGitHubProducer, invokeGitHubProducer } from "../../skills/personal/run-issue-workflow/scripts/github-producer-entry.mjs";
import { createGhTransport, proveGhCapability } from "../../skills/personal/run-issue-workflow/scripts/github-producer-transport.mjs";
import { bodyDigest, readWorkflowRecords } from "../../skills/personal/run-issue-workflow/scripts/github-workflow-records.mjs";

const REPOSITORY = "ron03wlb/skills";
// `gh api --paginate --slurp --include` renders one HTTP envelope per page, separated by a newline and a comma.
const ghPage = (status, requestId, body) =>
  `HTTP/2.0 ${status}\nx-github-request-id: ${requestId}\ncontent-type: application/json; charset=utf-8\n\n${JSON.stringify(body)}`;
const ghPages = (...pages) => `[${pages.join("\n,")}]`;
const publication = { title: "Account display", body: "# Settled Spec\n\n完整帳號 `00123`\n", classification: "SINGLE" };
const recordOf = body => JSON.parse(body.match(/^```workflow-record\n([\s\S]+)\n```$/u)[1]);

function fixture(t, repoName = REPOSITORY) {
  const repository = mkdtempSync(join(tmpdir(), "github-producer-test-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "target"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repository, "source.txt"), "source\n"); git("add", "source.txt"); git("commit", "-m", "fixture");
  git("remote", "add", "origin", `https://github.com/${repoName}.git`);
  const configuration = { schema: "github-producer:v1", repository: repoName };

  let nextNumber = 171;
  let nextComment = 0;
  const issues = new Map();
  const comments = new Map();
  const calls = [];
  const labels = [{ name: "ready-for-agent" }, { name: "existing-label" }];
  const issue = (number, body = "Original draft") => ({
    node_id: `I_${number}`, id: 1000 + number, number, title: publication.title, body,
    labels: [{ name: "existing-label" }], state: "open", updated_at: "2026-09-01T00:00:00Z",
    html_url: `https://github.com/${repoName}/issues/${number}`,
  });
  issues.set(169, issue(169)); issues.set(170, issue(170));
  const newComment = body => ({ node_id: `IC_${++nextComment}`, id: 5000 + nextComment, body, author_association: "OWNER", user: { login: "ron03wlb" }, created_at: "2026-09-01T00:00:00Z" });
  const failures = { rejectionMethod: null, beforeWrite: null, afterWrite: null };
  const transport = async request => {
    calls.push(structuredClone(request));
    if (request.graphql) {
      const found = [...issues.values()].find(row => row.node_id === request.graphql.variables?.id);
      return { node: found ? { id: found.node_id, number: found.number, repository: { nameWithOwner: repoName } } : null };
    }
    const { method = "GET", path, body } = request;
    const route = new URL(path, "https://fixture/").pathname;
    if (method !== "GET" && failures.rejectionMethod === method) {
      failures.rejectionMethod = null;
      throw Object.assign(new Error("Rejected fixture request"), { code: "GITHUB_PRODUCER_TRANSPORT", httpStatus: 422, outcome: "REJECTED", requestId: "fixture-rejection" });
    }
    if (method !== "GET" && failures.beforeWrite === method) { failures.beforeWrite = null; throw new Error("timeout before delivery"); }
    let result;
    if (route === `/repos/${repoName}`) result = [{ full_name: repoName, node_id: "R_1", html_url: `https://github.com/${repoName}` }];
    else if (route === "/user") result = [{ id: 7, login: "ron03wlb" }];
    else if (route === `/repos/${repoName}/labels`) result = labels;
    else if (route === `/repos/${repoName}/issues`) {
      if (method === "POST") { const created = { ...issue(nextNumber++), title: body.title, body: body.body }; issues.set(created.number, created); result = created; }
      else result = [...issues.values()];
    } else {
      const match = route.match(new RegExp(`^/repos/${repoName}/issues/(\\d+)(/comments)?$`, "u"));
      if (!match) throw new Error(`Unexpected fixture request ${method} ${path}`);
      const number = Number(match[1]); const current = issues.get(number);
      if (match[2]) {
        const rows = comments.get(number) ?? []; comments.set(number, rows);
        if (method === "POST") { const created = newComment(body.body); rows.push(created); result = created; }
        else result = rows;
      } else if (method === "PATCH") {
        Object.assign(current, { title: body.title, body: body.body, labels: body.labels.map(name => ({ name })), updated_at: `2026-09-02T00:00:${String(number).padStart(2, "0")}Z` });
        result = current;
      } else result = current;
    }
    if (method !== "GET" && failures.afterWrite === method) { failures.afterWrite = null; throw new Error("lost response after application"); }
    if (method === "GET") return Array.isArray(result) ? structuredClone(result) : [structuredClone(result)];
    return structuredClone(result);
  };
  const execute = (_command, args) => {
    if (args[0] === "api" && args[1] === "--paginate" && args[2] === "--slurp") return JSON.stringify([{ full_name: repoName }]);
    if (args[0] === "api" && args[1] === "user") return JSON.stringify({ id: 7, login: "ron03wlb" });
    throw new Error(`Unexpected probe invocation ${args.join(" ")}`);
  };
  const options = { repository, configuration, transport, execute, specId: 169, target: "target", publication };
  return { repository, configuration, git, issues, comments, labels, calls, failures, options, transport, execute,
    writes: () => calls.filter(call => call.method && call.method !== "GET") };
}
async function prepared(f, overrides = {}) {
  const adapter = await createGitHubProducerAdapters({ ...f.options, ...overrides });
  const current = await adapter.tracker.read();
  const baseline = f.git("rev-parse", "HEAD");
  const relevantFacts = { "source.txt": `git-blob:${f.git("rev-parse", "HEAD:source.txt")}` };
  assert.equal((await adapter.planning.readBaseline({ baseline, trackerVersion: current.version, relevantFacts, acceptedChanges: [] })).disposition, "COMPATIBLE");
  const identity = adapter.checkpoint.identity({ baseline, relevantFacts });
  await adapter.checkpoint.create(identity);
  const envelope = createOperationEnvelopeStore({ gitCommonDir: f.git("rev-parse", "--absolute-git-dir") }).read(identity);
  assert.equal(envelope.intent.body, (overrides.publication ?? publication).body, "checkpoint creation persists the canonical body before publication");
  assert.equal(envelope.intent.bodyDigest, bodyDigest((overrides.publication ?? publication).body));
  await adapter.checkpoint.advance({ identity, stage: "planning_seal.read_back", receipt: adapter.planningSeal.read({ identity }) });
  return { adapter, identity, expectedVersion: current.version, expectedLabels: current.labels };
}
async function complete(ctx) {
  const { adapter, identity } = ctx;
  const receipt = await adapter.tracker.publish(ctx);
  await adapter.checkpoint.advance({ identity, stage: "publication.read_back", receipt });
  const handoff = await adapter.handoff.append({ identity });
  return adapter.checkpoint.advance({ identity, stage: "handoff.completed", receipt: handoff });
}

test("publication completes exact v2 evidence and a restart retry makes no duplicate writes", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  const tx = await complete(ctx);
  assert.equal(tx.state, "COMPLETED");
  assert.deepEqual(tx.progress.map(row => row.stage), ["planning_seal.read_back", "publication.read_back", "handoff.completed"]);
  assert.equal(f.writes().length, 3);
  assert.deepEqual(f.issues.get(169).labels.map(label => label.name), ["existing-label", "ready-for-agent"]);
  const restart = await createGitHubProducerAdapters(f.options);
  await complete({ ...ctx, adapter: restart });
  assert.equal(f.writes().length, 3);
  assert.match(tx.progress[2].receipt.handoffIdentity, /^IC_\d+$/u);
  assert.equal(f.git("status", "--porcelain"), "");
  const publicationRecord = recordOf(f.comments.get(169)[0].body);
  assert.equal(publicationRecord.kind, "spec_publication");
  assert.equal(publicationRecord.capability.state, "PROVEN");
  assert.equal(publicationRecord.capability.repository, REPOSITORY);
  const handoffRecord = recordOf(f.comments.get(169)[1].body);
  assert.equal(handoffRecord.kind, "producer_handoff");
  assert.deepEqual(handoffRecord.recordIdentities, [tx.progress[1].receipt.publicationIdentity]);
});

test("a title-only revision has a distinct operation and remains idempotent after restart", async t => {
  const f = fixture(t); const first = await prepared(f); await complete(first);
  const revised = { ...publication, title: "Approved revised title" };
  const second = await prepared(f, { publication: revised });
  assert.notEqual(first.identity.operationId, second.identity.operationId);
  assert.equal((await complete(second)).state, "COMPLETED");
  const restart = await createGitHubProducerAdapters({ ...f.options, publication: revised });
  await complete({ ...second, adapter: restart });
  assert.equal(f.issues.get(169).title, revised.title);
  assert.equal(f.writes().filter(call => call.method === "PATCH").length, 2);
  assert.equal(f.writes().length, 6);
});

test("primary mode creates exactly one draft Spec and reuses it for the same proposed identity", async t => {
  const f = fixture(t);
  const adapter = await createGitHubProducerAdapters({ ...f.options, specId: undefined });
  const reserved = await adapter.tracker.reserve({ mode: "primary", proposedSpecIdentity: "proposed-spec-1" });
  assert.equal(f.writes().length, 1);
  assert.equal(f.issues.size, 3);
  assert.match(reserved.trackerIdentity, /^I_\d+$/u);
  assert.match(reserved.body, /github-spec-reservation:/u);
  assert.equal(reserved.issue.state, "open");
  const restart = await createGitHubProducerAdapters({ ...f.options, specId: undefined });
  const reused = await restart.tracker.reserve({ mode: "primary", proposedSpecIdentity: "proposed-spec-1" });
  assert.equal(reused.trackerIdentity, reserved.trackerIdentity);
  assert.equal(f.writes().length, 1);
  assert.equal(f.issues.size, 3);
});

test("a lost reservation response is resolved by read-back instead of a second Issue", async t => {
  const f = fixture(t);
  const adapter = await createGitHubProducerAdapters({ ...f.options, specId: undefined });
  f.failures.afterWrite = "POST";
  const reserved = await adapter.tracker.reserve({ mode: "primary", proposedSpecIdentity: "proposed-spec-lost" });
  assert.equal(f.issues.size, 3);
  assert.equal(f.writes().length, 1);
  assert.match(reserved.trackerIdentity, /^I_\d+$/u);
});

test("revision mode reads the selected existing Issue without reserving a replacement", async t => {
  const f = fixture(t);
  const adapter = await createGitHubProducerAdapters(f.options);
  const current = await adapter.tracker.reserve({ mode: "revision" });
  assert.equal(current.trackerIdentity, "I_169");
  assert.equal(f.writes().length, 0);
});

test("a node-id locator resolves the immutable Issue identity in the configured repository", async t => {
  const f = fixture(t);
  const adapter = await createGitHubProducerAdapters({ ...f.options, specId: "I_170" });
  const current = await adapter.tracker.read();
  assert.equal(current.trackerIdentity, "I_170");
  assert.equal(current.nativeIssueNumber, 170);
});

test("the produced records read back unchanged through the installed Run reader", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  const tx = await complete(ctx);
  const read = readWorkflowRecords(f.comments.get(169));
  assert.equal(read.length, 2);
  const pubEntry = read.find(entry => entry.record.kind === "spec_publication");
  const handoffEntry = read.find(entry => entry.record.kind === "producer_handoff");
  assert.equal(pubEntry.record.authority.approvedScopeHash, bodyDigest("# Settled Spec\n\n完整帳號 `00123`\n"));
  assert.equal(pubEntry.record.authority.specId, "I_169");
  assert.equal(pubEntry.record.repositoryId, `github:${REPOSITORY}`);
  assert.equal(handoffEntry.record.producerCommand, "to-spec");
  assert.equal(handoffEntry.record.approvedScopeHash, pubEntry.record.authority.approvedScopeHash);
  assert.equal(handoffEntry.record.publicationIdentity, pubEntry.identity);
  assert.deepEqual(handoffEntry.record.recordIdentities, [pubEntry.identity]);
  assert.equal(tx.progress[1].receipt.publicationIdentity, pubEntry.identity);
  assert.equal(tx.progress[2].receipt.handoffIdentity, handoffEntry.identity);
});

test("a lost publication-comment response is resolved by read-back and never repeats the write", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  f.failures.afterWrite = "POST";
  const receipt = await ctx.adapter.tracker.publish(ctx);
  assert.equal(receipt.publicationIdentity.startsWith("IC_"), true);
  assert.equal(f.writes().filter(call => call.method === "PATCH").length, 1);
  assert.equal(f.writes().filter(call => call.method === "POST" && call.path.endsWith("/comments")).length, 1);
});

test("a missing configured ready label blocks publication before any write", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  f.labels.length = 0;
  await assert.rejects(() => ctx.adapter.tracker.publish(ctx), /ready label/u);
  assert.equal(f.writes().length, 0);
});

test("an undelivered write remains unknown after restart rather than being repeated", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  f.failures.beforeWrite = "PATCH";
  await assert.rejects(() => ctx.adapter.tracker.publish(ctx), { code: "GITHUB_PRODUCER_UNKNOWN" });
  const restart = await createGitHubProducerAdapters(f.options);
  await assert.rejects(() => restart.tracker.publish(ctx), { code: "GITHUB_PRODUCER_UNKNOWN" });
  assert.equal(f.writes().length, 1);
});

test("a recorded terminal rejection permits one explicit, exactly bound retry", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  f.failures.rejectionMethod = "PATCH";
  await assert.rejects(() => ctx.adapter.tracker.publish(ctx), { code: "GITHUB_PRODUCER_REJECTED", httpStatus: 422 });
  assert.equal(f.writes().length, 1);
  const receipt = await ctx.adapter.tracker.publish({ ...ctx, retryRejected: true });
  assert.equal(receipt.publicationIdentity.startsWith("IC_"), true);
  assert.equal(f.writes().filter(call => call.method === "PATCH").length, 2);
});

test("stale versions, foreign repositories and foreign locators fail before mutation", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  f.issues.get(169).body = "Another editor's change";
  await assert.rejects(() => ctx.adapter.tracker.publish(ctx), /version/u);
  assert.equal(f.writes().length, 0);
  await assert.rejects(() => createGitHubProducerAdapters({ ...f.options, configuration: { ...f.configuration, repository: "other/project" } }), /origin/u);
  await assert.rejects(() => createGitHubProducerAdapters({ ...f.options, specId: "https://foreign/repo/issues/169" }), /locator/u);
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
  const rows = f.comments.get(169); rows.push({ ...rows[0], node_id: "IC_duplicate", id: 999999 });
  await assert.rejects(() => ctx.adapter.handoff.append(ctx), /Multiple records/u);
  rows.pop();
  rows[0].body = rows[0].body.replace('"version": "sha256:', '"version": "changed:');
  await assert.rejects(() => ctx.adapter.handoff.append(ctx), /Publication checkpoint is incomplete/u);
});

test("checkpoint rejects foreign bindings and fabricated receipts", async t => {
  const f = fixture(t); const ctx = await prepared(f);
  await assert.rejects(() => ctx.adapter.checkpoint.advance({ identity: ctx.identity, stage: "publication.read_back", receipt: { publicationIdentity: "fake" } }), /read-back/u);
  await assert.rejects(() => ctx.adapter.tracker.publish({ ...ctx, identity: { ...ctx.identity, specId: "foreign" } }), /binding/u);
  assert.equal(f.writes().length, 0);
});

test("DECISION_ONLY publication terminates after tracker read-back without ready label or Run handoff", async t => {
  const f = fixture(t);
  const decision = { ...publication, classification: "DECISION_ONLY" };
  const ctx = await prepared(f, { publication: decision });
  const receipt = await ctx.adapter.tracker.publish(ctx);
  const transaction = await ctx.adapter.checkpoint.advance({ identity: ctx.identity, stage: "publication.read_back", receipt });
  assert.equal(ctx.identity.profileVersion, "v3");
  assert.equal(transaction.state, "COMPLETED");
  assert.deepEqual(f.issues.get(169).labels.map(({ name }) => name), ["existing-label"]);
  assert.equal(f.comments.get(169).length, 1);
  await assert.rejects(() => ctx.adapter.handoff.append({ identity: ctx.identity }), /terminal/u);
});

test("one module isolates operations across Specs and repositories", async t => {
  const f = fixture(t); const a = await prepared(f); const b = await prepared(f, { specId: 170 });
  await complete(a); await complete(b);
  assert.notEqual(a.identity.operationId, b.identity.operationId);
  const other = fixture(t, "second/repo"); const c = await prepared(other); await complete(c);
  assert.notEqual(c.identity.repositoryId, a.identity.repositoryId);
});

test("configure preserves existing bindings and inspect performs only reads without state creation", async t => {
  const f = fixture(t);
  assert.equal((await inspectGitHubProducer(f.options)).state, "MISSING");
  const result = await configureGitHubProducer(f.options);
  const contents = readFileSync(result.path, "utf8");
  assert.equal((await inspectGitHubProducer(f.options)).state, "PRESENT");
  await configureGitHubProducer(f.options); assert.equal(readFileSync(result.path, "utf8"), contents);
  assert.equal(existsSync(join(f.repository, ".git/matt-workflow-control")), false);
  assert.equal(f.writes().length, 0);
  const current = await invokeGitHubProducer({ ...f.options, input: { action: "read", specId: 169, target: "target", publication } });
  assert.equal(current.trackerIdentity, "I_169");
  await assert.rejects(() => invokeGitHubProducer({ ...f.options, input: { action: "delete" } }), /Unknown/u);
});

test("missing gh --paginate --slurp capability fails closed before any mutation", async t => {
  const f = fixture(t);
  const broken = (_command, args) => {
    if (args.includes("--slurp") || args.includes("--paginate")) {
      const error = new Error("unknown flag: --slurp");
      error.stderr = "unknown flag: --slurp";
      throw error;
    }
    return JSON.stringify({ id: 7, login: "ron03wlb" });
  };
  await assert.rejects(
    () => createGitHubProducerAdapters({ ...f.options, capability: undefined, execute: broken, specId: undefined }),
    error => error.code === "GITHUB_PRODUCER_MISSING_CAPABILITY" && error.surface === "gh api --paginate --slurp" && error.owner === "setup-matt-pocock-skills",
  );
  assert.equal(f.writes().length, 0);
});

test("an unauthenticated gh identity is reported as the exact missing capability", async t => {
  const f = fixture(t);
  const noUser = (_command, args) => {
    if (args[0] === "api" && args[1] === "user") throw new Error("gh: authentication required");
    return JSON.stringify([{ full_name: REPOSITORY }]);
  };
  await assert.rejects(
    () => proveGhCapability({ repository: f.repository, repositoryName: REPOSITORY, execute: noUser }),
    error => error.code === "GITHUB_PRODUCER_MISSING_CAPABILITY" && error.surface === "authenticated gh identity",
  );
});

test("the live read-only capability probe proves the required CLI surface and identity", async t => {
  let ghAvailable = true; let remote = "";
  try { execFileSync("gh", ["--version"], { stdio: "ignore" }); } catch { ghAvailable = false; }
  try { remote = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }); } catch { ghAvailable = false; }
  const match = remote.trim().match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/u);
  if (!ghAvailable || !match) { t.skip("gh or a github.com origin is unavailable"); return; }
  const observation = await proveGhCapability({ repository: process.cwd(), repositoryName: match[1] });
  assert.equal(observation.state, "PROVEN");
  assert.equal(observation.paginateSlurp, true);
  assert.equal(observation.repository, match[1]);
});

test("reads use --paginate --slurp --include and flatten pages; writes send JSON over stdin without leaking stderr", async () => {
  let read = null;
  const reader = createGhTransport({ repository: process.cwd(), execute: async (_command, args, options) => { read = { args, options }; return ghPages(ghPage("200 OK", "READ-1", [{ node_id: "I_1" }]), ghPage("200 OK", "READ-2", [{ node_id: "I_2" }])); } });
  const rows = await reader({ path: `repos/${REPOSITORY}/issues?state=all` });
  assert.deepEqual(rows.map(row => row.node_id), ["I_1", "I_2"]);
  assert.deepEqual(read.args, ["api", `repos/${REPOSITORY}/issues?state=all`, "--paginate", "--slurp", "--include"]);

  let write = null;
  const writer = createGhTransport({ repository: process.cwd(), execute: async (_command, args, options) => {
    write = { args, options };
    throw Object.assign(new Error("boom"), { stdout: "HTTP/2.0 422 Unprocessable Entity\r\nx-github-request-id: 56E1:22C974:1\r\n\r\n{\"message\":\"invalid\"}", stderr: "secret-token" });
  } });
  await assert.rejects(() => writer({ method: "POST", path: `repos/${REPOSITORY}/issues`, body: { title: "x" } }),
    error => error.code === "GITHUB_PRODUCER_TRANSPORT" && error.httpStatus === 422 && error.outcome === "REJECTED" && error.requestId === "56E1:22C974:1" && !/secret-token/u.test(error.message));
  assert.deepEqual(write.args.slice(0, 4), ["api", `repos/${REPOSITORY}/issues`, "--method", "POST"]);
  assert.ok(write.args.includes("--input"));
  assert.equal(write.options.input, JSON.stringify({ title: "x" }));
});

test("a read of an absent parent reports its exact 404 and matches the bytes gh returns on this host", async () => {
  // The exact stdout gh produced for `gh api repos/ron03wlb/skills/issues/116/parent --paginate --slurp --include`.
  const absentParent = '[HTTP/2.0 404 Not Found\nAccess-Control-Allow-Origin: *\nContent-Type: application/json; charset=utf-8\nX-Github-Request-Id: 443B:29A405:E24272:1137798:6AACAB5F\n\n{"message":"No parent issue found","documentation_url":"https://docs.github.com/rest/issues/sub-issues#get-parent-issue","status":"404"}]';
  const reader = createGhTransport({ repository: process.cwd(), execute: async () => {
    throw Object.assign(new Error("gh: No parent issue found (HTTP 404)"), { stdout: absentParent, stderr: "gh: No parent issue found (HTTP 404)\n" });
  } });
  await assert.rejects(() => reader({ path: `repos/${REPOSITORY}/issues/116/parent` }),
    error => error.code === "GITHUB_PRODUCER_TRANSPORT" && error.httpStatus === 404 && error.outcome === "REJECTED"
      && error.requestId === "443B:29A405:E24272:1137798:6AACAB5F" && error.message === "GitHub GET request failed (HTTP 404).");

  const laterPage = createGhTransport({ repository: process.cwd(), execute: async () => {
    throw Object.assign(new Error("gh: Server Error (HTTP 500)"), {
      stdout: ghPages(ghPage("200 OK", "PAGE-1", [{ node_id: "I_1" }]), ghPage("500 Internal Server Error", "PAGE-2", { message: "Server Error" })) });
  } });
  await assert.rejects(() => laterPage({ path: `repos/${REPOSITORY}/issues?state=all` }),
    error => error.httpStatus === 500 && error.outcome === "UNRESOLVED" && error.requestId === "PAGE-2",
    "the failing page, never the last successful one, owns the reported outcome");
});

test("a read without a verified HTTP result stays unresolved and unrecorded", async () => {
  const reader = createGhTransport({ repository: process.cwd(), execute: async () => {
    throw Object.assign(new Error("dial tcp: i/o timeout"), { stderr: "gh: dial tcp: i/o timeout\n" });
  } });
  await assert.rejects(() => reader({ path: `repos/${REPOSITORY}/issues/116/parent` }),
    error => error.code === "GITHUB_PRODUCER_TRANSPORT" && error.httpStatus === null && error.outcome === "UNRESOLVED"
      && error.requestId === null && error.message === "GitHub GET request failed without a verified HTTP result.");

  const truncated = createGhTransport({ repository: process.cwd(), execute: async () => {
    throw Object.assign(new Error("gh: unexpected EOF"), { stdout: '[HTTP/2.0 404 Not Found\nContent-Type: application/json\n\n{"message":"No parent' });
  } });
  await assert.rejects(() => truncated({ path: `repos/${REPOSITORY}/issues/116/parent` }),
    error => error.httpStatus === null && error.outcome === "UNRESOLVED",
    "an unreadable read outcome is never read as a 404");
});

test("a live read-only GET reports an attributable rejection instead of an unverified result", async t => {
  let ghAvailable = true; let remote = "";
  try { execFileSync("gh", ["--version"], { stdio: "ignore" }); } catch { ghAvailable = false; }
  try { remote = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }); } catch { ghAvailable = false; }
  const match = remote.trim().match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/u);
  if (!ghAvailable || !match) { t.skip("gh or a github.com origin is unavailable"); return; }
  const reader = createGhTransport({ repository: process.cwd() });
  const rows = await reader({ path: `repos/${match[1]}/issues?state=all&per_page=100` });
  assert.ok(rows.length > 100, "a live read passes the one-page cap by flattening every page into one array");
  await assert.rejects(() => reader({ path: `repos/${match[1]}/issues/999999999` }),
    error => error.code === "GITHUB_PRODUCER_TRANSPORT" && error.httpStatus === 404 && error.outcome === "REJECTED"
      && /^[A-Za-z0-9:_-]+$/u.test(error.requestId));
});
