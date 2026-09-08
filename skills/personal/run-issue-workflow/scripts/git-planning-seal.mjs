import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createRunStore } from "./run-store.mjs";
import { conflict, digest } from "./gitlab-producer-transport.mjs";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sha = value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value ?? "");
const hash = value => /^sha256:[a-f0-9]{64}$/u.test(value ?? "");
const text = (value, name) => { if (typeof value !== "string" || !value.trim()) throw conflict(`${name} is required`); return value; };
const documentPath = path => {
  if (typeof path !== "string" || !/^(?:CONTEXT\.md|docs\/.+\.(?:md|html))$/u.test(path)
    || /[\\:\x00-\x1f]/u.test(path) || path.split("/").some(part => ["", ".", "..", ".git"].includes(part))) {
    throw conflict("Planning changes must name normalized glossary or documentation paths");
  }
  return path;
};
const git = (repository, args, options = {}) => execFileSync("git", ["-C", repository, ...args], {
  encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024, ...options,
}).trim();
const commonDir = repository => realpathSync.native(resolve(repository, git(repository, ["rev-parse", "--git-common-dir"])));
const samePath = (left, right) => relative(realpathSync.native(left), realpathSync.native(right)) === "";
const containedFile = (root, path) => {
  const absolute = join(root, documentPath(path));
  const rel = relative(realpathSync.native(root), realpathSync.native(absolute));
  if (!rel || isAbsolute(rel) || rel.split(/[\\/]/u).includes("..") || !lstatSync(absolute).isFile()) throw conflict(`Unsafe planning file: ${path}`);
  // Reject symlinked parent directories as well as linked files.
  for (let current = absolute; current !== root; current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw conflict(`Linked planning path: ${path}`);
  }
  return absolute;
};
const laneBlobs = (record, write = false) => {
  const paths = record.changes.map(change => containedFile(record.worktree, change.path).replaceAll("\\", "/"));
  const blobs = git(record.worktree, ["hash-object", ...(write ? ["-w"] : []), "--stdin-paths"], { input: paths.join("\n") + "\n" }).split(/\r?\n/u);
  if (blobs.length !== paths.length || !blobs.every(sha)) throw conflict("Planning blob read-back is incomplete");
  return new Map(record.changes.map((change, index) => [change.path, blobs[index]]));
};
const saveNew = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", flush: true });
};

// The caller supplies publication policy. This owner supplies independently read Git/lane evidence.
export function createGitPlanningSeal({ repository, repositoryId, specId, target, gitCommonDir }) {
  repository = realpathSync.native(repository);
  gitCommonDir = realpathSync.native(gitCommonDir);
  const bound = { repositoryId, specId, target };
  for (const [name, value] of Object.entries(bound)) text(value, name);
  git(repository, ["check-ref-format", `refs/heads/${target}`]);
  if (!samePath(commonDir(repository), gitCommonDir)) throw conflict("Planning repository identity differs");
  const root = join(gitCommonDir, "matt-workflow-control", "planning-seals");
  const head = () => git(repository, ["rev-parse", `refs/heads/${target}^{commit}`]);
  const ancestor = (older, newer = head()) => git(repository, ["merge-base", "--is-ancestor", older, newer]);
  const trees = new Map(); // Immutable commit objects only; current refs and lane bytes are always reread.
  const treeEntry = (commit, path) => {
    if (!trees.has(commit)) trees.set(commit, new Map(git(repository, ["ls-tree", "-r", "-z", commit, "--", "CONTEXT.md", "docs/"])
      .split("\0").filter(Boolean).map(row => { const offset = row.indexOf("\t"); return [row.slice(offset + 1), row.slice(0, offset)]; })));
    const row = trees.get(commit).get(path);
    if (row === undefined) return null;
    const match = row.match(/^(100644|100755) blob ([a-f0-9]{40,64})$/u);
    if (!match) throw conflict(`Planning source is not a regular file: ${path}`);
    return { mode: match[1], blob: match[2] };
  };
  const registeredPath = id => {
    if (!hash(id)) throw conflict("Planning registration identity is required");
    return join(root, "lanes", `${id.slice(7)}.json`);
  };
  const validateLane = record => {
    if (record.schema !== "git-planning-lane:v1" || !same(record.binding, bound) || !sha(record.baseline)) throw conflict("Planning lane binding differs");
    const worktree = realpathSync.native(record.worktree);
    if (samePath(worktree, repository)) throw conflict("An isolated planning worktree is required");
    if (!samePath(commonDir(worktree), gitCommonDir)) throw conflict(`Planning common directory differs: ${commonDir(worktree)} versus ${gitCommonDir}`);
    if (!samePath(git(worktree, ["rev-parse", "--show-toplevel"]), worktree)) throw conflict("Planning path must be the native worktree root");
    const entries = git(repository, ["worktree", "list", "--porcelain", "-z"]).split("\0");
    if (!entries.some(entry => entry.startsWith("worktree ") && existsSync(entry.slice(9)) && samePath(entry.slice(9), worktree))
      || git(worktree, ["rev-parse", "HEAD"]) !== record.baseline) throw conflict("Planning lane HEAD or native registration changed");
    if (digest(readFileSync(record.authority.path)) !== record.authority.contentIdentity) throw conflict("Planning handoff content changed");
    for (const change of record.changes) {
      if (!hash(change.contentIdentity) || digest(readFileSync(containedFile(worktree, change.path))) !== change.contentIdentity) throw conflict(`Accepted planning content changed: ${change.path}`);
      if (!same(treeEntry(record.baseline, change.path), change.base)) throw conflict(`Planning preimage differs: ${change.path}`);
    }
    return record;
  };
  const loadLane = (lane, live = true) => {
    const record = JSON.parse(readFileSync(registeredPath(lane?.registrationId), "utf8"));
    if (digest(JSON.stringify(record)) !== lane.registrationId || record.taskId !== lane.taskId
      || record.worktree !== lane.worktree) throw conflict("Planning registration or ownership differs");
    if (record.schema !== "git-planning-lane:v1" || !same(record.binding, bound) || !sha(record.baseline)
      || !record.changes?.length || record.changes.some(change => !sha(change.blob) || !hash(change.contentIdentity))) throw conflict("Planning registration content differs");
    return live ? validateLane(record) : record;
  };
  const register = request => {
    const { taskId, baseline, authority } = request;
    text(taskId, "planning taskId");
    if (!sha(baseline) || !hash(authority?.contentIdentity)) throw conflict("Exact baseline and handoff identity are required");
    ancestor(baseline);
    const worktree = realpathSync.native(request.worktree);
    if (!Array.isArray(request.acceptedChanges) || !request.acceptedChanges.length) throw conflict("Registration requires an explicit accepted delta");
    const seen = new Set();
    const changes = request.acceptedChanges.map(({ path, contentIdentity }) => {
      documentPath(path);
      if (seen.has(path) || !hash(contentIdentity)) throw conflict("Duplicate or malformed accepted content");
      seen.add(path);
      return { path, contentIdentity, base: treeEntry(baseline, path) };
    });
    const record = validateLane({ schema: "git-planning-lane:v1", binding: bound, taskId, worktree, baseline,
      authority: { path: realpathSync.native(authority.path), contentIdentity: authority.contentIdentity }, changes });
    const blobs = laneBlobs(record);
    for (const change of record.changes) change.blob = blobs.get(change.path);
    validateLane(record);
    const registrationId = digest(JSON.stringify(record));
    const path = registeredPath(registrationId);
    if (existsSync(path)) {
      if (!same(JSON.parse(readFileSync(path, "utf8")), record)) throw conflict("Existing planning registration differs");
    } else saveNew(path, record);
    return { registrationId, taskId, worktree };
  };
  const readLane = lane => {
    const record = loadLane(lane);
    return { ...record.binding, taskId: record.taskId, worktree: record.worktree, baseline: record.baseline,
      registered: true, isolated: true, acceptedChanges: record.changes.map(({ path, contentIdentity }) => ({ path, contentIdentity })) };
  };
  const intentPath = operationId => {
    if (!/^planning-[a-f0-9]{64}$/u.test(operationId ?? "")) throw conflict("Invalid Planning Seal operation identity");
    return join(root, "intents", `${operationId}.json`);
  };
  const operationFor = (lane, validation) => `planning-${digest(JSON.stringify({ binding: bound, lane,
    trackerVersion: validation.trackerVersion, relevantFacts: validation.relevantFacts })).slice(7)}`;
  const checkCandidate = (intent, live = false) => {
    if (intent.schema !== "git-planning-seal:v1" || !same(intent.binding, bound) || !sha(intent.parent) || !sha(intent.commit)) throw conflict("Planning Seal intent differs");
    if (!intent.validation || operationFor(intent.lane, intent.validation) !== intent.operationId) throw conflict("Planning Seal intent identity differs");
    const record = loadLane(intent.lane, live);
    if (git(repository, ["rev-parse", `${intent.commit}^`]) !== intent.parent
      || git(repository, ["rev-list", "--parents", "-n", "1", intent.commit]).split(" ").length !== 2) throw conflict("Planning Seal parent differs");
    const paths = git(repository, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", intent.commit]).split("\0").filter(Boolean).sort();
    if (!same(paths, record.changes.map(change => change.path).sort())) throw conflict("Planning Seal diff differs from accepted paths");
    const blobs = live ? laneBlobs(record) : null;
    for (const change of record.changes) {
      if (blobs && blobs.get(change.path) !== change.blob) throw conflict(`Planning filters or accepted content changed: ${change.path}`);
      const expected = { mode: change.base?.mode ?? "100644", blob: change.blob };
      if (!same(treeEntry(intent.commit, change.path), expected)) throw conflict(`Sealed content differs: ${change.path}`);
    }
    return record;
  };
  const read = ({ operationId }) => {
    const intent = JSON.parse(readFileSync(intentPath(operationId), "utf8"));
    if (intent.operationId !== operationId) throw conflict("Planning Seal operation differs");
    const record = checkCandidate(intent);
    const currentHead = head();
    ancestor(intent.commit, currentHead);
    for (const change of record.changes) {
      if (!same(treeEntry(currentHead, change.path), treeEntry(intent.commit, change.path))) throw conflict(`Sealed target content drifted: ${change.path}`);
    }
    return { target, planningSeal: intent.commit, state: "written", operationId };
  };
  const targetCheckout = () => {
    if (git(repository, ["symbolic-ref", "HEAD"]) !== `refs/heads/${target}`) throw conflict("Planning writer must run in the recorded target checkout");
    for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"]) {
      if (existsSync(resolve(repository, git(repository, ["rev-parse", "--git-path", name])))) throw conflict("Target has an unfinished Git operation");
    }
    if (git(repository, ["diff", "--cached", "--name-only"])) throw conflict("Target has staged work; preserve it and retry after its owner resolves the index");
  };
  const write = async ({ request, revalidate }) => {
    const record = loadLane(request.lane, false);
    if (request.baseline !== record.baseline || !same(request.acceptedChanges,
      record.changes.map(({ path, contentIdentity }) => ({ path, contentIdentity })))) throw conflict("Seal request differs from registered lane");
    const operationId = operationFor(request.lane, request);
    const store = createRunStore({ gitCommonDir });
    const lease = store.acquireTargetMutationWriter({ target, operationId });
    try {
      const path = intentPath(operationId);
      let intent = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
      if (intent) {
        if (intent.operationId !== operationId || !same(intent.lane, request.lane)) throw conflict("Stored Planning Seal request differs");
        checkCandidate(intent);
        if (git(repository, ["rev-list", "--count", `${head()}..${intent.commit}`]) === "0") return read({ operationId });
      }
      validateLane(record);
      const current = await revalidate();
      if (current.disposition !== "COMPATIBLE") throw conflict(`Relevant planning source drifted: ${current.owningSource}`);
      targetCheckout();
      lease.assertCurrent();
      const parent = head();
      if (parent !== current.baseline || (intent && intent.parent !== parent)) throw conflict("Target moved during Planning Seal; preserve the candidate and revalidate");
      for (const change of record.changes) {
        if (!same(treeEntry(parent, change.path), change.base)) throw conflict(`Accepted document preimage changed on target: ${change.path}`);
      }
      if (!intent) {
        mkdirSync(root, { recursive: true });
        const index = join(root, `index-${randomUUID()}`);
        const env = { ...process.env, GIT_INDEX_FILE: index };
        try {
          git(repository, ["read-tree", parent], { env });
          const blobs = laneBlobs(record, true);
          git(repository, ["update-index", "-z", "--index-info"], { env,
            input: record.changes.map(change => `${change.base?.mode ?? "100644"} ${blobs.get(change.path)}\t${change.path}\0`).join("") });
          const tree = git(repository, ["write-tree"], { env });
          if (tree === git(repository, ["rev-parse", `${parent}^{tree}`])) throw conflict("Accepted delta is empty; reuse baseline without creating a seal");
          const commit = git(repository, ["commit-tree", tree, "-p", parent], { input: `docs: seal accepted planning decisions\n\nSpec: ${specId}\nPlanning-operation: ${operationId}\n` });
          intent = { schema: "git-planning-seal:v1", binding: bound, operationId, lane: request.lane,
            validation: { trackerVersion: request.trackerVersion, relevantFacts: request.relevantFacts }, parent, commit };
          checkCandidate(intent, true);
          saveNew(path, intent);
        } finally { if (existsSync(index)) rmSync(index); }
      }
      checkCandidate(intent, true);
      targetCheckout();
      lease.assertCurrent();
      const candidateRef = `refs/workflow/planning-seals/${operationId}`;
      const existingRef = git(repository, ["for-each-ref", "--format=%(objectname)", candidateRef]);
      if (existingRef && existingRef !== intent.commit) throw conflict("Planning candidate ref differs; preserve its owner evidence");
      if (!existingRef) git(repository, ["update-ref", candidateRef, intent.commit, "0".repeat(intent.commit.length)]);
      // Native fast-forward refuses overlapping dirt; no stash, reset, or broad staging.
      git(repository, ["merge", "--ff-only", "--no-edit", "--no-autostash", "--no-overwrite-ignore", intent.commit]);
      lease.assertCurrent();
      checkCandidate(intent, true);
      return read({ operationId });
    } finally { lease.release(); }
  };
  return { register, readLane, write, read };
}
