import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  linkSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const INPUT_SCHEMA = "closeout-preservation-inspection-input:v1";
const OUTPUT_SCHEMA = "closeout-preservation-inspection:v1";
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function invalid(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decode(buffer, label) {
  try {
    return UTF8.decode(buffer);
  } catch {
    invalid(`${label} must be valid UTF-8`);
  }
}

function gitBuffer(worktree, ...args) {
  return execFileSync("git", ["-c", "core.fsmonitor=false", "-C", worktree, ...args], {
    encoding: "buffer",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: 64 * 1024 * 1024,
  });
}

function gitText(worktree, ...args) {
  return decode(gitBuffer(worktree, ...args), "Git output").trim();
}

function optionalGitText(worktree, ...args) {
  try {
    return gitText(worktree, ...args);
  } catch (error) {
    if (error.status === 1) return "";
    throw error;
  }
}

function nulFields(buffer, label) {
  if (buffer.length === 0) return [];
  if (buffer.at(-1) !== 0) invalid(`${label} is not NUL-terminated`);
  const fields = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    fields.push(decode(buffer.subarray(start, index), label));
    start = index + 1;
  }
  return fields;
}

function parseStatus(worktree) {
  const fields = nulFields(
    gitBuffer(worktree, "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignore-submodules=none"),
    "Git status",
  );
  const entries = [];
  const counts = { staged: 0, unstaged: 0, untracked: 0 };
  let unmerged = false;

  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    if (record.startsWith("? ")) {
      entries.push({ kind: "untracked", path: record.slice(2) });
      counts.untracked += 1;
      continue;
    }
    if (record.startsWith("! ")) continue;

    const ordinary = record.match(/^1 (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) ([\s\S]*)$/u);
    if (ordinary) {
      const [, xy, submodule, headMode, indexMode, worktreeMode, headOid, indexOid, path] = ordinary;
      entries.push({ kind: "tracked", path, xy, submodule, headMode, indexMode, worktreeMode, headOid, indexOid });
      if (xy[0] !== ".") counts.staged += 1;
      if (xy[1] !== ".") counts.unstaged += 1;
      continue;
    }

    const renamed = record.match(/^2 (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) ([\s\S]*)$/u);
    if (renamed) {
      const [, xy, submodule, headMode, indexMode, worktreeMode, headOid, indexOid, score, path] = renamed;
      const originalPath = fields[index + 1];
      if (originalPath === undefined) invalid("Git rename status is missing its source path");
      index += 1;
      entries.push({ kind: "renamed", path, originalPath, xy, submodule, headMode, indexMode, worktreeMode, headOid, indexOid, score });
      if (xy[0] !== ".") counts.staged += 1;
      if (xy[1] !== ".") counts.unstaged += 1;
      continue;
    }

    const conflict = record.match(/^u (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) ([\s\S]*)$/u);
    if (conflict) {
      const [, xy, submodule, stage1Mode, stage2Mode, stage3Mode, worktreeMode, stage1Oid, stage2Oid, stage3Oid, path] = conflict;
      entries.push({
        kind: "unmerged",
        path,
        xy,
        submodule,
        headMode: null,
        indexMode: null,
        worktreeMode,
        headOid: null,
        indexOid: null,
        conflict: { stage1Mode, stage2Mode, stage3Mode, stage1Oid, stage2Oid, stage3Oid },
      });
      if (xy[0] !== ".") counts.staged += 1;
      if (xy[1] !== ".") counts.unstaged += 1;
      unmerged = true;
      continue;
    }
    invalid(`unsupported Git status record: ${record.slice(0, 2)}`);
  }
  return { entries, counts, unmerged };
}

function parseIndex(worktree) {
  const fields = nulFields(gitBuffer(worktree, "ls-files", "--stage", "-z"), "Git index");
  const index = new Map();
  for (const field of fields) {
    const match = field.match(/^(\S+) (\S+) ([0-3])\t([\s\S]*)$/u);
    if (!match) invalid("unsupported Git index record");
    const [, mode, oid, stage, path] = match;
    const values = index.get(path) ?? [];
    values.push({ mode, oid, stage: Number(stage) });
    index.set(path, values);
  }
  return index;
}

function parseCandidatePaths(worktree, targetBefore, integrationCandidate) {
  const fields = nulFields(
    gitBuffer(worktree, "diff", "--no-ext-diff", "--no-textconv", "--name-status", "-z", "--find-renames", "--find-copies", targetBefore, integrationCandidate, "--"),
    "Git candidate delta",
  );
  const paths = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index];
    index += 1;
    if (!/^[A-Z][0-9]*$/u.test(status)) invalid("unsupported Git candidate status");
    if (/^[RC]/u.test(status)) {
      if (fields[index] === undefined || fields[index + 1] === undefined) invalid("Git candidate rename is incomplete");
      paths.push(fields[index], fields[index + 1]);
      index += 2;
    } else {
      if (fields[index] === undefined) invalid("Git candidate status is missing its path");
      paths.push(fields[index]);
      index += 1;
    }
  }
  return paths;
}

function normalizeGitPath(path) {
  return process.platform === "win32" ? path.replaceAll("\\", "/") : path;
}

function comparisonPath(path, caseInsensitive) {
  const normalized = normalizeGitPath(path);
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function isPathInside(root, candidatePath) {
  const path = relative(root, candidatePath);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

function tryLstat(path, options) {
  try {
    return lstatSync(path, options);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

function sameFilesystemEntry(left, right) {
  const leftStat = lstatSync(left, { bigint: true });
  const rightStat = tryLstat(right, { bigint: true });
  if (rightStat === null) return false;
  return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
}

function filesystemIsCaseInsensitive(worktree) {
  return sameFilesystemEntry(resolve(worktree, ".git"), resolve(worktree, ".GIT"));
}

function caseSemantics(worktree) {
  const ignoreCase = optionalGitText(worktree, "config", "--get", "--bool", "core.ignorecase");
  return ignoreCase === "true" || process.platform === "win32" || filesystemIsCaseInsensitive(worktree);
}

function submoduleWorktreeFingerprint(path, visited) {
  const worktree = realpathSync(path);
  if (visited.has(worktree)) invalid("nested submodule cycle detected");
  visited.add(worktree);
  try {
    const observedTarget = gitText(worktree, "rev-parse", "HEAD");
    const status = parseStatus(worktree);
    const dirty = dirtyEvidence(worktree, status, caseSemantics(worktree), visited);
    return sha256(JSON.stringify({ observedTarget, unmerged: status.unmerged, dirty: dirty.sha256, counts: dirty.counts }));
  } finally {
    visited.delete(worktree);
  }
}

function filesystemFingerprint(worktree, path, entry, visited) {
  const candidate = resolve(worktree, normalizeGitPath(path));
  if (!isPathInside(worktree, candidate)) invalid("Git path escapes the target worktree");
  const stat = tryLstat(candidate);
  if (stat === null) return { type: "absent", mode: null, sha256: "absent" };
  const mode = (stat.mode & 0o777777).toString(8).padStart(6, "0");
  if (stat.isSymbolicLink()) return { type: "symlink", mode, sha256: sha256(Buffer.from(readlinkSync(candidate), "utf8")) };
  if (stat.isFile()) return { type: "file", mode, sha256: sha256(readFileSync(candidate)) };
  if (stat.isDirectory() && entry.submodule?.startsWith("S")) {
    return { type: "submodule", mode, sha256: submoduleWorktreeFingerprint(candidate, visited) };
  }
  if (stat.isDirectory()) return { type: "directory", mode, sha256: "directory" };
  return { type: "other", mode, sha256: "other" };
}

function dirtyEvidence(worktree, status, caseInsensitive, visited = new Set([worktree])) {
  const index = parseIndex(worktree);
  const records = [];
  const collisionPaths = new Set();
  for (const entry of status.entries) {
    const endpoints = entry.originalPath === undefined
      ? [{ role: "path", path: entry.path }]
      : [{ role: "destination", path: entry.path }, { role: "source", path: entry.originalPath }];
    for (const endpoint of endpoints) {
      const normalized = normalizeGitPath(endpoint.path);
      const compared = comparisonPath(normalized, caseInsensitive);
      collisionPaths.add(compared);
      records.push({
        path: normalized,
        comparisonPath: compared,
        role: endpoint.role,
        kind: entry.kind,
        xy: entry.xy ?? "??",
        submodule: entry.submodule ?? null,
        headMode: entry.headMode ?? null,
        indexMode: entry.indexMode ?? null,
        worktreeMode: entry.worktreeMode ?? null,
        headOid: entry.headOid ?? null,
        indexOid: entry.indexOid ?? null,
        conflict: entry.conflict ?? null,
        filesystem: filesystemFingerprint(worktree, endpoint.path, entry, visited),
        indexEntries: index.get(endpoint.path) ?? [],
      });
    }
  }
  records.sort((left, right) => {
    const leftText = JSON.stringify(left);
    const rightText = JSON.stringify(right);
    return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
  });
  return { sha256: sha256(JSON.stringify(records)), counts: status.counts, collisionPaths };
}

function hookEvidence(worktree, caseInsensitive) {
  const configured = gitText(worktree, "rev-parse", "--git-path", "hooks/post-merge");
  const hookPath = isAbsolute(configured) ? configured : resolve(worktree, configured);
  const normalized = comparisonPath(resolve(hookPath), caseInsensitive);
  const stat = tryLstat(hookPath);
  const present = stat !== null;
  let contentSha256 = "absent";
  let linkTargetSha256 = "not-symlink";
  let type = "absent";
  let mode = null;
  if (present) {
    mode = (stat.mode & 0o777777).toString(8).padStart(6, "0");
    type = stat.isSymbolicLink() ? "symlink" : stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other";
    if (stat.isSymbolicLink()) linkTargetSha256 = sha256(Buffer.from(readlinkSync(hookPath), "utf8"));
    if (stat.isFile() || stat.isSymbolicLink()) contentSha256 = sha256(readFileSync(hookPath));
  }
  const resolutionSha256 = sha256(normalized);
  return {
    present,
    resolutionSha256,
    contentSha256,
    fingerprintSha256: sha256(JSON.stringify({ resolutionSha256, present, type, mode, linkTargetSha256, contentSha256 })),
  };
}

function preservationSnapshot(worktree) {
  const observedTarget = gitText(worktree, "rev-parse", "HEAD");
  const caseInsensitive = caseSemantics(worktree);
  const status = parseStatus(worktree);
  const dirty = dirtyEvidence(worktree, status, caseInsensitive);
  const hook = hookEvidence(worktree, caseInsensitive);
  return { observedTarget, caseInsensitive, unmerged: status.unmerged, dirty, hook };
}

function stableSnapshotIdentity(snapshot) {
  return sha256(JSON.stringify({
    observedTarget: snapshot.observedTarget,
    caseInsensitive: snapshot.caseInsensitive,
    unmerged: snapshot.unmerged,
    dirty: snapshot.dirty.sha256,
    counts: snapshot.dirty.counts,
    collisionPaths: [...snapshot.dirty.collisionPaths].sort(),
    hook: snapshot.hook,
  }));
}

function pathsCollide(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function collisionOutcome(dirtyPaths, candidatePaths) {
  let count = 0;
  for (const dirtyPath of dirtyPaths) {
    for (const candidatePath of candidatePaths) if (pathsCollide(dirtyPath, candidatePath)) count += 1;
  }
  return { present: count > 0, count };
}

function isAncestor(worktree, ancestor, descendant) {
  try {
    gitBuffer(worktree, "merge-base", "--is-ancestor", ancestor, descendant);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

function inspect(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) invalid("input must be an object");
  const expectedKeys = ["expectedTarget", "integrationCandidate", "schema", "targetBefore", "worktree"];
  const actualKeys = Object.keys(input).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) invalid("input fields do not match the expected schema");
  if (input.schema !== INPUT_SCHEMA) invalid("input schema is invalid");
  if (typeof input.worktree !== "string" || input.worktree.length === 0) invalid("worktree must be a non-empty string");
  for (const name of ["expectedTarget", "targetBefore", "integrationCandidate"]) {
    if (typeof input[name] !== "string" || !/^[0-9a-f]{40}$/iu.test(input[name])) invalid(`${name} must be a full commit SHA`);
  }
  if (![input.targetBefore, input.integrationCandidate].includes(input.expectedTarget)) {
    invalid("expectedTarget must be targetBefore or integrationCandidate");
  }

  const worktree = realpathSync(input.worktree);
  const repositoryRoot = realpathSync(gitText(worktree, "rev-parse", "--show-toplevel"));
  const worktreeIdentity = statSync(worktree, { bigint: true });
  const repositoryIdentity = statSync(repositoryRoot, { bigint: true });
  if (worktreeIdentity.dev !== repositoryIdentity.dev || worktreeIdentity.ino !== repositoryIdentity.ino) {
    invalid("worktree must be the repository root");
  }
  gitText(worktree, "rev-parse", "--verify", `${input.targetBefore}^{commit}`);
  gitText(worktree, "rev-parse", "--verify", `${input.integrationCandidate}^{commit}`);

  const firstSnapshot = preservationSnapshot(worktree);
  const candidatePaths = parseCandidatePaths(worktree, input.targetBefore, input.integrationCandidate)
    .map((path) => comparisonPath(path, firstSnapshot.caseInsensitive));
  const secondSnapshot = preservationSnapshot(worktree);
  if (stableSnapshotIdentity(firstSnapshot) !== stableSnapshotIdentity(secondSnapshot)) {
    invalid("preservation state changed during inspection");
  }
  const { observedTarget, dirty, hook, unmerged } = secondSnapshot;
  const collision = collisionOutcome(dirty.collisionPaths, candidatePaths);

  let statusName = "SAFE";
  let reasonCode = "SAFE";
  if (observedTarget !== input.expectedTarget) {
    statusName = "BLOCKED";
    reasonCode = "TARGET_IDENTITY_MISMATCH";
  } else if (unmerged) {
    statusName = "BLOCKED";
    reasonCode = "UNMERGED_TARGET_STATE";
  } else {
    if (!isAncestor(worktree, input.targetBefore, input.integrationCandidate)) {
      statusName = "BLOCKED";
      reasonCode = "INTEGRATION_ANCESTRY_INVALID";
    }
    if (statusName === "SAFE" && collision.present) {
      statusName = "COLLISION";
      reasonCode = "DIRTY_CANDIDATE_PATH_COLLISION";
    }
  }

  return {
    schema: OUTPUT_SCHEMA,
    status: statusName,
    reasonCode,
    observedTarget,
    dirty: { sha256: dirty.sha256, counts: dirty.counts },
    hook,
    collision,
  };
}

function readInput(path) {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) invalid("input JSON must be UTF-8 without BOM");
  return JSON.parse(decode(bytes, "input JSON"));
}

function publish(outputPath, result) {
  const finalPath = resolve(outputPath);
  if (tryLstat(finalPath) !== null) invalid("output JSON path must not already exist");
  const temporaryPath = `${finalPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(result)}\n`, { encoding: "utf8", flag: "wx" });
    linkSync(temporaryPath, finalPath);
    unlinkSync(temporaryPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] !== "inspect") invalid("unsupported preservation command");
    if (!process.argv[3] || !process.argv[4]) invalid("input and output JSON paths are required");
    if (resolve(process.argv[3]) === resolve(process.argv[4])) invalid("input and output JSON paths must differ");
    if (tryLstat(resolve(process.argv[4])) !== null) invalid("output JSON path must not already exist");
    const result = inspect(readInput(process.argv[3]));
    publish(process.argv[4], result);
    process.exitCode = result.status === "SAFE" ? 0 : result.status === "COLLISION" ? 3 : 4;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
