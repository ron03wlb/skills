import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGlabTransport, digest } from "../../skills/personal/run-issue-workflow/scripts/gitlab-producer-transport.mjs";
import { mutateOnce, readMutation } from "../../skills/personal/run-issue-workflow/scripts/gitlab-producer-mutations.mjs";

test("real glab sends JSON to the configured origin and retains only sanitized HTTP failures", async t => {
  const observed = [];
  let status = 200;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    observed.push({ method: request.method, path: request.url, contentType: request.headers["content-type"], body });
    response.writeHead(status, { "Content-Type": "application/json", "X-Request-Id": "fixture-request-1" });
    response.end(status === 200 ? '{"ok":true}' : '{"message":"sensitive-response"}');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const saved = process.env.GITLAB_TOKEN;
  process.env.GITLAB_TOKEN = "fixture-only";
  t.after(() => { if (saved === undefined) delete process.env.GITLAB_TOKEN; else process.env.GITLAB_TOKEN = saved; });
  const transport = createGlabTransport({ repository: process.cwd(), configuration: { schema: "gitlab-producer:v1",
    baseUrl: `http://127.0.0.1:${server.address().port}`, project: "fixture/project" } });
  const body = { title: "繁體中文", description: "line one\n`$(literal)`\n\"quoted\"" };
  for (const method of ["PUT", "POST"]) {
    assert.deepEqual(await transport({ method, path: "projects/31/issues/169", body }), { ok: true });
    assert.deepEqual(observed.at(-1), { method, path: "/api/v4/projects/31/issues/169", contentType: "application/json", body: JSON.stringify(body) });
  }
  for (status of [400, 403, 415, 422, 500]) {
    await assert.rejects(() => transport({ method: "PUT", path: "projects/31/issues/169", body }), error => {
      assert.equal(error.httpStatus, status);
      assert.equal(error.outcome, status === 500 ? "UNRESOLVED" : "REJECTED");
      assert.equal(error.requestId, "fixture-request-1");
      assert.equal(JSON.stringify(error).includes("sensitive-response"), false);
      assert.equal(error.message.includes("sensitive-response"), false);
      return true;
    });
  }
});

function fixture(t) {
  const gitCommonDir = mkdtempSync(join(tmpdir(), "gitlab-mutation-test-"));
  t.after(() => rmSync(gitCommonDir, { recursive: true, force: true }));
  const connection = { gitCommonDir, repositoryId: "gitlab:fixture/project" };
  const key = "exact-operation:issue-body", payload = { title: "secret-content-not-for-journal" };
  let applied = false, writes = 0;
  const request = { key, payload, observe: async () => applied ? { exact: true } : null,
    write: async () => { writes++; applied = true; } };
  const fail = (httpStatus, outcome) => { request.write = async () => { writes++; throw Object.assign(new Error("sensitive-provider-error"),
    { code: "GITLAB_PRODUCER_TRANSPORT", httpStatus, outcome, requestId: "request-1" }); }; };
  const succeed = () => { request.write = async () => { writes++; applied = true; }; };
  return { connection, request, fail, succeed, writes: () => writes };
}

test("rejected mutation requires explicit exact retry and preserves original evidence", async t => {
  const f = fixture(t); f.fail(415, "REJECTED");
  await assert.rejects(() => mutateOnce(f.connection, f.request), { code: "GITLAB_PRODUCER_REJECTED" });
  assert.equal(readMutation(f.connection, f.request).state, "REJECTED");
  f.succeed();
  await assert.rejects(() => mutateOnce(f.connection, f.request), { code: "GITLAB_PRODUCER_REJECTED" });
  await assert.rejects(() => mutateOnce(f.connection, { ...f.request, payload: { title: "changed" }, retryRejected: true }), /intent differs/u);
  assert.equal(f.writes(), 1);
  await mutateOnce(f.connection, { ...f.request, retryRejected: true });
  await mutateOnce(f.connection, { ...f.request, retryRejected: true });
  assert.equal(f.writes(), 2);
  const readback = readMutation(f.connection, f.request);
  assert.equal(readback.attempt, 2);
  assert.equal(readback.state, "ACKNOWLEDGED");
  const root = join(f.connection.gitCommonDir, "matt-workflow-control/gitlab-producer-intents");
  const contents = readdirSync(root, { recursive: true }).filter(path => path.endsWith(".json")).map(path => readFileSync(join(root, path), "utf8")).join("\n");
  assert.ok(contents.includes('"httpStatus":415'));
  assert.equal(contents.includes("sensitive-provider-error"), false);
  assert.equal(contents.includes(f.request.payload.title), false);
});

test("timeouts, 5xx and a second uncertain attempt cannot be retried", async t => {
  for (const httpStatus of [null, 500]) {
    const f = fixture(t); f.fail(httpStatus, "UNRESOLVED");
    await assert.rejects(() => mutateOnce(f.connection, f.request), { code: "GITLAB_PRODUCER_UNKNOWN" });
    await assert.rejects(() => mutateOnce(f.connection, { ...f.request, retryRejected: true }), { code: "GITLAB_PRODUCER_UNKNOWN" });
    assert.equal(f.writes(), 1);
  }
  const f = fixture(t); f.fail(400, "REJECTED");
  await assert.rejects(() => mutateOnce(f.connection, f.request), { code: "GITLAB_PRODUCER_REJECTED" });
  f.fail(null, "UNRESOLVED");
  await assert.rejects(() => mutateOnce(f.connection, { ...f.request, retryRejected: true }), { code: "GITLAB_PRODUCER_UNKNOWN" });
  await assert.rejects(() => mutateOnce(f.connection, { ...f.request, retryRejected: true }), { code: "GITLAB_PRODUCER_UNKNOWN" });
  assert.equal(f.writes(), 2);
});

test("legacy unresolved intent is inspected without mutation and never interpreted as rejection", async t => {
  const f = fixture(t);
  const root = join(f.connection.gitCommonDir, "matt-workflow-control/gitlab-producer-intents");
  mkdirSync(root, { recursive: true });
  const path = join(root, `${digest(`${f.connection.repositoryId}:${f.request.key}`).slice(7)}.json`);
  const original = JSON.stringify({ schema: "gitlab-producer-intent:v1", key: f.request.key, fingerprint: digest(JSON.stringify(f.request.payload)) });
  writeFileSync(path, original);
  assert.equal(readMutation(f.connection, f.request).state, "UNRESOLVED");
  await assert.rejects(() => mutateOnce(f.connection, { ...f.request, retryRejected: true }), { code: "GITLAB_PRODUCER_UNKNOWN" });
  assert.equal(f.writes(), 0);
  assert.equal(readFileSync(path, "utf8"), original);
  assert.equal(readdirSync(root).length, 1);
});

test("concurrent explicit retries claim only one attempt", async t => {
  const f = fixture(t); f.fail(400, "REJECTED");
  await assert.rejects(() => mutateOnce(f.connection, f.request), { code: "GITLAB_PRODUCER_REJECTED" });
  f.succeed();
  const results = await Promise.allSettled([1, 2].map(() => mutateOnce(f.connection, { ...f.request, retryRejected: true })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(f.writes(), 2);
});
