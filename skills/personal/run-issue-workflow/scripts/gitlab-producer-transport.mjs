import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, realpathSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const digest = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const conflict = message => Object.assign(new Error(message), { code: "GITLAB_PRODUCER_CONFLICT" });
export const uncertain = () => Object.assign(new Error("Mutation outcome is unresolved; preserve the intent and read the exact owner result before any retry."), { code: "GITLAB_PRODUCER_UNKNOWN" });
export const gitRead = (repository, ...args) => execFileSync("git", ["-C", repository, ...args], {
  encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
}).trim();

export function validateConfiguration(configuration) {
  if (configuration?.schema !== "gitlab-producer:v1"
    || Object.keys(configuration).some(key => !["schema", "baseUrl", "project"].includes(key))) throw conflict("Invalid GitLab producer configuration");
  const url = new URL(configuration.baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || url.pathname !== "/" || configuration.baseUrl !== url.origin) throw conflict("baseUrl must be a credential-free GitLab origin");
  if (!/^[\w.-]+(?:\/[\w.-]+)+$/u.test(configuration.project)
    || configuration.project.split("/").some(part => [".", ".."].includes(part))) throw conflict("Invalid GitLab project path");
  return configuration;
}

export function configurationFromRemote(repository) {
  const remote = gitRead(repository, "remote", "get-url", "origin");
  if (!/^https?:\/\//u.test(remote)) throw conflict("For SSH remotes, explicitly supply the GitLab HTTPS baseUrl and project in the configuration file.");
  const url = new URL(remote);
  if (url.username || url.password || url.search || url.hash) throw conflict("Origin contains credentials or unsupported URL components");
  return validateConfiguration({ schema: "gitlab-producer:v1", baseUrl: url.origin, project: url.pathname.slice(1).replace(/\.git$/u, "") });
}

const executeGlab = (command, args, options) => new Promise((resolveResult, reject) => {
  const child = execFile(command, args, options, (error, stdout) => {
    if (error) { error.stdout = stdout; reject(error); } else resolveResult(stdout);
  });
  child.stdin.on("error", () => {}); // The process callback owns broken-pipe/exit outcomes.
  child.stdin.end(options.input);
});
export const isRejectedStatus = status => [400, 401, 403, 404, 405, 406, 411, 413, 414, 415, 422].includes(status);
function responseEnvelope(output) {
  const match = String(output ?? "").match(/^HTTP\/\S+ (\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/u);
  if (!match) return { httpStatus: null, requestId: null, body: null };
  const requestId = match[2].match(/^x-request-id:\s*([a-zA-Z0-9_.-]{1,128})\s*$/imu)?.[1] ?? null;
  return { httpStatus: Number(match[1]), requestId, body: match[3] };
}
export function createGlabTransport({ repository, configuration, execute = executeGlab }) {
  validateConfiguration(configuration);
  return async ({ method = "GET", path, body }) => {
    if (!/^(?:projects\/|user$)/u.test(path) || path.includes("..")) throw conflict("Unsupported GitLab API path");
    // The absolute endpoint binds protocol/port too; glab's host config can otherwise override them.
    const args = ["api", "--hostname", new URL(configuration.baseUrl).hostname, "--method", method,
      `${configuration.baseUrl}/api/v4/${path}`, "--include"];
    if (body !== undefined) args.push("--input", "-", "--header", "Content-Type: application/json");
    let envelope = { httpStatus: null, requestId: null };
    try {
      const output = await execute("glab", args, {
        cwd: repository, input: body === undefined ? undefined : JSON.stringify(body), encoding: "utf8",
        windowsHide: true, maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, GITLAB_API_PROTOCOL: new URL(configuration.baseUrl).protocol.slice(0, -1) },
      });
      envelope = responseEnvelope(output);
      if (envelope.httpStatus === null || envelope.httpStatus < 200 || envelope.httpStatus >= 300) throw new Error("Unexpected HTTP response");
      return JSON.parse(envelope.body);
    } catch (error) {
      if (error.stdout !== undefined) envelope = responseEnvelope(error.stdout);
      // Provider stderr can contain credentials or request content. Keep it out of receipts and logs.
      throw Object.assign(new Error(`GitLab ${method} request failed${envelope.httpStatus === null ? " without a verified HTTP result" : ` (HTTP ${envelope.httpStatus})`}.`),
        { code: "GITLAB_PRODUCER_TRANSPORT", httpStatus: envelope.httpStatus, requestId: envelope.requestId,
          outcome: isRejectedStatus(envelope.httpStatus) ? "REJECTED" : "UNRESOLVED" });
    }
  };
}

export async function connectGitLabProducer({ repository, configuration, transport }) {
  repository = realpathSync.native(repository);
  validateConfiguration(configuration);
  const { baseUrl, project } = configuration;
  const origin = gitRead(repository, "remote", "get-url", "origin").replace(/\.git$/u, "");
  const host = new URL(baseUrl).hostname;
  if (![`${baseUrl}/${project}`, `git@${host}:${project}`, `ssh://git@${host}/${project}`].includes(origin)) throw conflict("Configured project does not match checkout origin");
  const request = transport ?? createGlabTransport({ repository, configuration });
  const remote = await request({ path: `projects/${encodeURIComponent(project)}` });
  if (!Number.isSafeInteger(remote.id) || remote.id < 1 || remote.path_with_namespace !== project || remote.web_url !== `${baseUrl}/${project}`) throw conflict("GitLab project identity differs");
  const user = await request({ path: "user" });
  if (!Number.isSafeInteger(user.id) || user.id < 1) throw conflict("GitLab authenticated identity is unreadable");
  const prefix = `projects/${remote.id}`;
  const api = (path, method = "GET", body) => request({ path: `${prefix}${path}`, method, ...(body === undefined ? {} : { body }) });
  const list = async path => {
    const rows = [];
    for (let page = 1; ; page += 1) {
      const items = await api(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      if (!Array.isArray(items)) throw conflict("GitLab list response is not an array");
      rows.push(...items);
      if (items.length < 100) return rows;
      if (page >= 10000) throw conflict("GitLab pagination exceeded the bounded read");
    }
  };
  const assertAuthor = async authorId => {
    if (!Number.isSafeInteger(authorId) || authorId < 1) throw conflict("Record author identity is missing");
    const member = await api(`/members/all/${authorId}`);
    if (member.id !== authorId || member.access_level < 30) throw conflict("Record author is not a project Developer or higher");
  };
  const gitCommonDir = realpathSync.native(resolve(repository, gitRead(repository, "rev-parse", "--git-common-dir")));
  return { repository, configuration, repositoryId: `gitlab:${new URL(baseUrl).host}/${project}`, projectId: remote.id,
    projectUrl: remote.web_url, userId: user.id, gitCommonDir, api, list, assertAuthor };
}

// One local owner at a time; a crashed lock is reported, never reclaimed automatically.
export async function withProducerLock(connection, scope, action) {
  const root = join(connection.gitCommonDir, "matt-workflow-control", "gitlab-producer-locks");
  mkdirSync(root, { recursive: true });
  const path = join(root, digest(`${connection.repositoryId}:${scope}`).slice(7));
  try { mkdirSync(path); } catch (error) {
    if (error.code === "EEXIST") throw conflict("GitLab producer is occupied or has an unresolved crashed owner");
    throw error;
  }
  try { return await action(); } finally { rmdirSync(path); }
}
