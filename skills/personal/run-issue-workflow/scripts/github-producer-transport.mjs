import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, realpathSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const digest = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const conflict = message => Object.assign(new Error(message), { code: "GITHUB_PRODUCER_CONFLICT" });
export const uncertain = () => Object.assign(new Error("Mutation outcome is unresolved; preserve the intent and read the exact owner result before any retry."), { code: "GITHUB_PRODUCER_UNKNOWN" });
// One exact attributable missing capability: the surface that is unproven and the owner that must repair it.
export const missingCapability = ({ surface, owner, reason }) => Object.assign(
  new Error(`Required GitHub publish capability is unproven (${surface}); ${owner} must repair it: ${reason}`),
  { code: "GITHUB_PRODUCER_MISSING_CAPABILITY", state: "MISSING_CAPABILITY", surface, owner, reason });
export const gitRead = (repository, ...args) => execFileSync("git", ["-C", repository, ...args], {
  encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
}).trim();

export function validateConfiguration(configuration) {
  if (configuration?.schema !== "github-producer:v1"
    || Object.keys(configuration).some(key => !["schema", "repository"].includes(key))
    || typeof configuration.repository !== "string"
    || !/^[\w.-]+\/[\w.-]+$/u.test(configuration.repository)
    || configuration.repository.split("/").some(part => [".", ".."].includes(part))) throw conflict("Invalid GitHub producer configuration");
  return configuration;
}

export function configurationFromRemote(repository) {
  const remote = gitRead(repository, "remote", "get-url", "origin").replace(/\.git$/u, "");
  const match = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+)$/u);
  if (!match) throw conflict("Origin is not a github.com repository; explicitly supply the configuration file.");
  return validateConfiguration({ schema: "github-producer:v1", repository: match[1] });
}

const executeGh = (command, args, options) => new Promise((resolveResult, reject) => {
  const child = execFile(command, args, options, (error, stdout) => {
    if (error) { error.stdout = stdout; reject(error); } else resolveResult(stdout);
  });
  child.stdin.on("error", () => {}); // The process callback owns broken-pipe/exit outcomes.
  child.stdin.end(options.input);
});
export const isRejectedStatus = status => [400, 401, 403, 404, 405, 406, 411, 413, 414, 415, 422].includes(status);
const isSuccessStatus = status => status !== null && status >= 200 && status < 300;
function responseEnvelope(output) {
  const match = String(output ?? "").match(/^HTTP\/\S+ (\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/u);
  if (!match) return { httpStatus: null, requestId: null, body: null };
  const requestId = match[2].match(/^x-github-request-id:\s*([A-Za-z0-9:_-]{1,128})\s*$/imu)?.[1] ?? null;
  return { httpStatus: Number(match[1]), requestId, body: match[3] };
}

// The exact length of one JSON value, so a packed page body is never guessed from its own text.
function jsonValueLength(text) {
  let depth = 0; let quoted = false; let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "[" || character === "{") depth += 1;
    else if (character === "]" || character === "}") { depth -= 1; if (depth === 0) return index + 1; }
  }
  return -1;
}

// `gh api <path> --paginate --slurp --include` packs one `HTTP/…` envelope per page inside the slurp array,
// separated by a newline and a comma:
//   [HTTP/2.0 200 OK\n<headers>\n\n[<page one>]\n,HTTP/2.0 200 OK\n<headers>\n\n[<page two>]]
// Every page therefore carries its own attributable status, including pages whose body is not an array.
function paginatedResponse(output) {
  const text = String(output ?? "").trimEnd();
  if (!text.startsWith("[HTTP/") || !text.endsWith("]")) return null;
  const pages = []; const rows = [];
  let rest = text.slice(1, -1);
  while (rest.length > 0) {
    const envelope = responseEnvelope(rest);
    if (envelope.httpStatus === null || envelope.body === null) return null;
    const length = jsonValueLength(envelope.body);
    if (length < 1) return null;
    pages.push({ httpStatus: envelope.httpStatus, requestId: envelope.requestId });
    rows.push(JSON.parse(envelope.body.slice(0, length)));
    const remainder = envelope.body.slice(length);
    if (remainder === "") break;
    const separator = remainder.match(/^\r?\n?,/u);
    if (!separator) return null;
    rest = remainder.slice(separator[0].length);
  }
  return pages.length ? { pages, rows } : null;
}

const executableArgs = (command, args, repository, input) => ({ command, args, options: {
  cwd: repository, input: input === undefined ? undefined : JSON.stringify(input), encoding: "utf8",
  windowsHide: true, maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
} });

// The one transport over the configured `gh`. Reads use the required `--paginate --slurp` capability, carry
// `--include` so every read outcome is attributable, and are still flattened to a single array; writes carry
// `--include` so a terminal HTTP rejection is observed.
export function createGhTransport({ repository, execute = executeGh }) {
  return async request => {
    if (request?.graphql) return graphql(execute, repository, request.graphql);
    const { method = "GET", path, body } = request ?? {};
    if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("..") || /[\s\\]/u.test(path)) throw conflict("Unsupported GitHub API path");
    const args = ["api", path];
    if (method === "GET") args.push("--paginate", "--slurp", "--include");
    else args.push("--method", method, "--include");
    if (body !== undefined) args.push("--input", "-", "--header", "Content-Type: application/json");
    let envelope = { httpStatus: null, requestId: null };
    try {
      const exec = executableArgs("gh", args, repository, body);
      const output = await execute(exec.command, exec.args, exec.options);
      if (method === "GET") {
        const response = paginatedResponse(output);
        if (!response) throw new Error("Unexpected GitHub response");
        const failed = response.pages.find(page => !isSuccessStatus(page.httpStatus)) ?? null;
        envelope = failed ?? response.pages[response.pages.length - 1];
        if (failed) throw new Error("Unexpected HTTP response");
        return response.rows.flat();
      }
      envelope = responseEnvelope(output);
      if (!isSuccessStatus(envelope.httpStatus)) throw new Error("Unexpected HTTP response");
      return JSON.parse(envelope.body);
    } catch (error) {
      // A rejected read reports the same page envelopes on stdout; the last page is the one that failed.
      if (error.stdout !== undefined) {
        const observed = method === "GET" ? paginatedResponse(error.stdout)?.pages.at(-1) ?? null : responseEnvelope(error.stdout);
        if (observed) envelope = observed;
      }
      // Provider stderr can contain credentials or request content. Keep it out of receipts and logs.
      throw Object.assign(new Error(`GitHub ${method} request failed${envelope.httpStatus === null ? " without a verified HTTP result" : ` (HTTP ${envelope.httpStatus})`}.`),
        { code: "GITHUB_PRODUCER_TRANSPORT", httpStatus: envelope.httpStatus, requestId: envelope.requestId,
          outcome: isRejectedStatus(envelope.httpStatus) ? "REJECTED" : "UNRESOLVED" });
    }
  };
}

async function graphql(execute, repository, { query, variables = {} }) {
  const args = ["api", "graphql"];
  for (const [key, value] of Object.entries(variables)) args.push("-f", `${key}=${value}`);
  args.push("-f", `query=${query}`);
  const exec = executableArgs("gh", args, repository, undefined);
  try {
    const response = JSON.parse(await execute(exec.command, exec.args, exec.options));
    if (response.errors) throw conflict("GitHub GraphQL query was rejected");
    return response.data;
  } catch (error) {
    if (error.code === "GITHUB_PRODUCER_CONFLICT") throw error;
    throw conflict("GitHub GraphQL query failed");
  }
}

// The measured publish capability (Constraint 10): the exact CLI flag support the reads depend on and an
// authenticated identity for the configured repository. Proven before any mutation, never assumed.
export const GITHUB_PUBLISH_CAPABILITY_SURFACE = "gh api --paginate --slurp";
export const GITHUB_PUBLISH_CAPABILITY_OWNER = "setup-matt-pocock-skills";
export async function proveGhCapability({ repository, repositoryName, execute = executeGh }) {
  let probe;
  try {
    const exec = executableArgs("gh", ["api", "--paginate", "--slurp", `repos/${repositoryName}`], repository, undefined);
    probe = JSON.parse(await execute(exec.command, exec.args, exec.options));
  } catch (error) {
    const text = `${error.message ?? ""} ${error.stderr ?? ""} ${error.stdout ?? ""}`;
    throw missingCapability({ surface: GITHUB_PUBLISH_CAPABILITY_SURFACE, owner: GITHUB_PUBLISH_CAPABILITY_OWNER,
      reason: /unknown flag|unknown shorthand|--slurp|--paginate/iu.test(text)
        ? "The configured gh does not support --paginate --slurp."
        : "The configured gh could not read the repository through --paginate --slurp." });
  }
  if (!Array.isArray(probe) || probe.flat()[0]?.full_name !== repositoryName) throw missingCapability({
    surface: GITHUB_PUBLISH_CAPABILITY_SURFACE, owner: GITHUB_PUBLISH_CAPABILITY_OWNER,
    reason: "The --paginate --slurp probe did not return the configured repository." });
  let user;
  try {
    const exec = executableArgs("gh", ["api", "user"], repository, undefined);
    user = JSON.parse(await execute(exec.command, exec.args, exec.options));
  } catch {
    throw missingCapability({ surface: "authenticated gh identity", owner: GITHUB_PUBLISH_CAPABILITY_OWNER,
      reason: "No authenticated GitHub identity is available for the configured repository." });
  }
  if (!Number.isSafeInteger(user?.id) || user.id < 1 || typeof user.login !== "string" || !user.login) throw missingCapability({
    surface: "authenticated gh identity", owner: GITHUB_PUBLISH_CAPABILITY_OWNER,
    reason: "The authenticated GitHub identity is unreadable." });
  return { state: "PROVEN", surface: GITHUB_PUBLISH_CAPABILITY_SURFACE, repository: repositoryName,
    paginateSlurp: true, authenticatedIdentity: user.login };
}

export async function connectGitHubProducer({ repository, configuration, transport }) {
  repository = realpathSync.native(repository);
  validateConfiguration(configuration);
  const { repository: repositoryName } = configuration;
  const origin = gitRead(repository, "remote", "get-url", "origin").replace(/\.git$/u, "");
  if (![`https://github.com/${repositoryName}`, `git@github.com:${repositoryName}`, `ssh://git@github.com/${repositoryName}`].includes(origin)) throw conflict("Configured repository does not match checkout origin");
  const request = transport ?? createGhTransport({ repository });
  const remote = (await request({ path: `repos/${repositoryName}` }))[0];
  if (remote?.full_name !== repositoryName || typeof remote.node_id !== "string" || remote.html_url !== `https://github.com/${repositoryName}`) throw conflict("GitHub repository identity differs");
  const user = (await request({ path: "user" }))[0];
  if (!Number.isSafeInteger(user?.id) || user.id < 1 || typeof user.login !== "string") throw conflict("GitHub authenticated identity is unreadable");
  const list = async path => {
    const rows = await request({ path });
    if (!Array.isArray(rows)) throw conflict("GitHub list response is not an array");
    return rows;
  };
  const api = (path, method = "GET", body) => request({ path, method, ...(body === undefined ? {} : { body }) });
  const node = async nodeId => {
    if (typeof nodeId !== "string" || !/^I_[A-Za-z0-9_-]+$/u.test(nodeId)) throw conflict("Spec node identity is malformed");
    const data = await request({ graphql: { query: "query($id: ID!) { node(id: $id) { ... on Issue { id number repository { nameWithOwner } } } }", variables: { id: nodeId } } });
    const found = data?.node;
    if (!found || found.repository?.nameWithOwner !== repositoryName || !Number.isSafeInteger(found.number)) throw conflict("Issue node is outside the configured repository");
    return { nodeId: found.id, number: found.number };
  };
  const gitCommonDir = realpathSync.native(resolve(repository, gitRead(repository, "rev-parse", "--git-common-dir")));
  return { repository, configuration, repositoryName, repositoryId: `github:${repositoryName}`, repositoryNodeId: remote.node_id,
    repositoryUrl: remote.html_url, userId: user.id, userLogin: user.login, gitCommonDir, api, list, node };
}

// One local owner at a time; a crashed lock is reported, never reclaimed automatically.
export async function withProducerLock(connection, scope, action) {
  const root = join(connection.gitCommonDir, "matt-workflow-control", "github-producer-locks");
  mkdirSync(root, { recursive: true });
  const path = join(root, digest(`${connection.repositoryId}:${scope}`).slice(7));
  try { mkdirSync(path); } catch (error) {
    if (error.code === "EEXIST") throw conflict("GitHub producer is occupied or has an unresolved crashed owner");
    throw error;
  }
  try { return await action(); } finally { rmdirSync(path); }
}
