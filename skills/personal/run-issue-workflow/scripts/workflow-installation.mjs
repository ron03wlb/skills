import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync,
  realpathSync, renameSync, rmSync, rmdirSync, symlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { validateWorkflowVersion } from "./run-journal.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const skillPath = "skills/personal/run-issue-workflow";
const versionFields = ["id", "sourceCommit", "sourceRepository", "protocolVersion"];
const sameVersion = (left, right) => versionFields.every((field) => left?.[field] === right?.[field]);
const directoryLink = (target, path) => symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sharedReferences = ["docs/agents/run-preparation.md", "docs/agents/references/approved-pre-run-workflow-maintenance.md"];
const safePath = (path) => typeof path === "string" && (path.startsWith("skills/") || sharedReferences.includes(path))
  && !path.split(/[\\/]/u).some((part) => ["", ".", ".."].includes(part));

function validateCatalog(catalog) {
  if (catalog?.schema !== "codex-workflow-installation:v1" || !Array.isArray(catalog.versions)) throw new Error("Unknown installation metadata");
  for (const version of catalog.versions) validateWorkflowVersion(version);
  if (new Set(catalog.versions.map(({ id }) => id)).size !== catalog.versions.length
    || (catalog.current === null ? catalog.versions.length !== 0 : !catalog.versions.some(({ id }) => id === catalog.current))) {
    throw new Error("Ambiguous installation version catalog");
  }
}

function verifyPackage(root, version) {
  if (lstatSync(root).isSymbolicLink()) throw new Error("Package directory is a link");
  const manifest = readJson(join(root, ".workflow-version.json"));
  if (manifest.schema !== "codex-workflow-version:v1" || !sameVersion(manifest.version, version)) {
    throw new Error("Package version identity differs from its trusted installation");
  }
  if (version.protocolVersion !== 1 || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Package version is incompatible");
  }
  const seen = new Set();
  for (const file of manifest.files) {
    if (!safePath(file.path) || seen.has(file.path)) throw new Error("Invalid package path");
    seen.add(file.path);
    const path = join(root, file.path);
    const within = relative(realpathSync(root), realpathSync(path));
    if (!lstatSync(path).isFile() || !within || isAbsolute(within) || within === ".." || within.startsWith(".." + sep)
      || sha256(readFileSync(path)) !== file.sha256) throw new Error(`Package content changed: ${file.path}`);
  }
  if (sha256(JSON.stringify({ sourceCommit: version.sourceCommit, files: manifest.files })) !== version.id) {
    throw new Error("Package content manifest changed");
  }
  return root;
}

export function selectWorkflowVersion({ cacheDirectory, recordedVersion }) {
  let version = recordedVersion ?? null;
  try {
    if (!recordedVersion && existsSync(join(cacheDirectory, "installation-pending.json"))) {
      throw new Error("Installation recovery is pending; inspect installation-pending.json before selecting a version for a new Run");
    }
    const catalog = readJson(join(cacheDirectory, "installation.json"));
    validateCatalog(catalog);
    version ??= catalog.versions.find(({ id }) => id === catalog.current);
    if (!version || !catalog.versions.some((known) => sameVersion(known, version))) {
      throw new Error("Recorded workflow version is not in the trusted installation");
    }
    if (!/^[a-f0-9]{64}$/u.test(version.id)) throw new Error("Invalid workflow version identity");
    const root = verifyPackage(join(cacheDirectory, "versions", version.id), version);
    return { state: "AVAILABLE", version, root };
  } catch (error) {
    return { state: "UNAVAILABLE", version, reason: error.message,
      recovery: "Restore this exact trusted package or use the already-approved maintenance scope to install a reviewed compatible version; preserve the Run and original Start. Run preparation owns the pre-Run handoff." };
  }
}

function recoverInstallation({ recoveryPath, sourceRepository, sourceCommit, cacheDirectory, skillDirectory, catalog }) {
  const pending = readJson(recoveryPath);
  validateWorkflowVersion(pending.version);
  const { version, previousTarget, backup, previousCurrent } = pending;
  const root = join(cacheDirectory, "versions", version.id);
  const nextTarget = join(root, skillPath);
  const linkTarget = (path) => {
    try {
      if (!lstatSync(path).isSymbolicLink()) throw new Error(`Expected a preserved symbolic link: ${path}`);
      return resolve(dirname(path), readlinkSync(path));
    } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  const fail = (reason) => { throw new Error(`Installation recovery: ${reason}. Preserve ${recoveryPath}; restore the named original evidence and retry the same exact installation.`); };
  if (pending.skillDirectory !== skillDirectory || pending.root !== root
    || version.sourceCommit !== sourceCommit || version.sourceRepository !== sourceRepository
    || !(previousCurrent === null || /^[a-f0-9]{64}$/u.test(previousCurrent))) {
    fail(`retry source ${version.sourceRepository} at ${version.sourceCommit} for ${pending.skillDirectory}; requested identity differs`);
  }
  if (![previousCurrent, version.id].includes(catalog.current)) fail(`catalog current ${catalog.current} differs from the recorded installation`);
  const observed = linkTarget(skillDirectory);
  if (![null, previousTarget, nextTarget].includes(observed)) fail(`public link ${skillDirectory} now points to ${observed}`);
  let backupTarget = null;
  if (previousTarget !== null) {
    if (typeof backup !== "string" || !backup.startsWith(`${skillDirectory}.before-`)
      || !/^[a-f0-9-]{36}$/u.test(backup.slice(`${skillDirectory}.before-`.length))) fail("backup locator differs");
    backupTarget = linkTarget(backup);
    if (backupTarget !== previousTarget && !(backupTarget === null && observed === previousTarget)) fail(`backup ${backup} does not preserve ${previousTarget}`);
  } else if (backup !== null) fail("unexpected backup for an initially absent entry");
  verifyPackage(root, version);
  if (observed !== nextTarget) {
    if (observed !== null) {
      // Keep both the original backup and any restored link; never overwrite a concurrent entry.
      renameSync(skillDirectory, backupTarget === null ? backup : `${skillDirectory}.before-${randomUUID()}`);
    }
    directoryLink(nextTarget, skillDirectory);
  }
  const versions = catalog.versions.some((known) => sameVersion(known, version)) ? catalog.versions : [...catalog.versions, version];
  const temporaryCatalog = join(cacheDirectory, `installation.json.${randomUUID()}`);
  writeFileSync(temporaryCatalog, `${JSON.stringify({ ...catalog, current: version.id, versions })}\n`, { mode: 0o600 });
  renameSync(temporaryCatalog, join(cacheDirectory, "installation.json"));
  if (realpathSync(skillDirectory) !== realpathSync(nextTarget)) fail("public entry read-back differs");
  verifyPackage(root, version);
  rmSync(recoveryPath);
  return { version, root, skillDirectory, cacheDirectory, backup, recovered: true };
}

function installUnlocked({ sourceRepository, sourceCommit, cacheDirectory, skillDirectory, replaceLinkTarget }) {
  sourceRepository = realpathSync(sourceRepository);
  cacheDirectory = resolve(cacheDirectory);
  skillDirectory = resolve(skillDirectory);
  const git = (...args) => execFileSync("git", ["-C", sourceRepository, ...args], { encoding: "utf8" }).trim();
  if (!/^[a-f0-9]{40,64}$/u.test(sourceCommit ?? "") || git("rev-parse", `${sourceCommit}^{commit}`) !== sourceCommit) {
    throw new Error("Install requires one exact trusted source commit");
  }
  const catalogPath = join(cacheDirectory, "installation.json");
  const recoveryPath = join(cacheDirectory, "installation-pending.json");
  if (existsSync(cacheDirectory) && lstatSync(cacheDirectory).isSymbolicLink()
    || existsSync(catalogPath) && !lstatSync(catalogPath).isFile()) throw new Error("Unknown linked installation metadata; preserve it");
  if (existsSync(cacheDirectory) && !existsSync(catalogPath) && !existsSync(recoveryPath) && readdirSync(cacheDirectory).length > 0) {
    throw new Error("Unknown installation directory; preserve its contents");
  }
  const catalog = existsSync(catalogPath) ? readJson(catalogPath)
    : { schema: "codex-workflow-installation:v1", current: null, versions: [] };
  validateCatalog(catalog);
  if (existsSync(recoveryPath)) return recoverInstallation({ recoveryPath, sourceRepository, sourceCommit, cacheDirectory, skillDirectory, catalog });
  let previousTarget = null;
  try {
    if (!lstatSync(skillDirectory).isSymbolicLink()) throw new Error("Unknown installed skill; preserve it");
    previousTarget = resolve(dirname(skillDirectory), readlinkSync(skillDirectory));
    const managed = catalog.versions.some(({ id }) => previousTarget === join(cacheDirectory, "versions", id, skillPath));
    if (!managed && previousTarget !== replaceLinkTarget) throw new Error("Unknown installed skill link; explicit replacement is required");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const tree = execFileSync("git", ["-C", sourceRepository, "ls-tree", "-rz", "--full-tree", sourceCommit, "--", "skills", ...sharedReferences], { encoding: "utf8" });
  const files = tree.split("\0").filter(Boolean).map((line) => {
    const match = line.match(/^(100644|100755) blob [a-f0-9]+\t(.+)$/u);
    if (!match || !safePath(match[2])) throw new Error("Workflow package contains an unsupported path or link");
    return { path: match[2], mode: match[1] };
  });
  for (const required of [`${skillPath}/SKILL.md`, `${skillPath}/scripts/installed-entry.mjs`,
    `${skillPath}/scripts/codex-host-driver.js`, `${skillPath}/references/codex-host-driver.md`]) {
    if (!files.some(({ path }) => path === required)) throw new Error(`Workflow package lacks ${required}`);
  }
  const versionsDirectory = join(cacheDirectory, "versions");
  const createdVersionsDirectory = !existsSync(versionsDirectory);
  const staging = join(cacheDirectory, `prepare-${randomUUID()}`);
  const pendingPreparation = join(cacheDirectory, `installation-pending.${randomUUID()}`);
  let backup = null;
  let createdRoot = null;
  let pendingWritten = false;
  try {
    mkdirSync(versionsDirectory, { recursive: true });
    mkdirSync(staging);
    const archive = execFileSync("git", ["-C", sourceRepository, "-c", "core.autocrlf=false", "archive", sourceCommit, "skills", ...sharedReferences.filter(path => files.some(file => file.path === path))], { maxBuffer: 32 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", staging], { input: archive });
    for (const file of files) file.sha256 = sha256(readFileSync(join(staging, file.path)));
    const id = sha256(JSON.stringify({ sourceCommit, files }));
    const version = { id, sourceCommit, sourceRepository, protocolVersion: 1 };
    const root = join(cacheDirectory, "versions", id);
    writeFileSync(join(staging, ".workflow-version.json"), `${JSON.stringify({ schema: "codex-workflow-version:v1", version, files })}\n`);
    if (existsSync(root)) verifyPackage(root, version);
    else { renameSync(staging, root); createdRoot = root; }
    mkdirSync(dirname(skillDirectory), { recursive: true });
    if (previousTarget !== null && resolve(dirname(skillDirectory), readlinkSync(skillDirectory)) !== previousTarget) {
      throw new Error("Installed link changed during installation");
    }
    if (previousTarget === join(root, skillPath) && catalog.current === id) {
      verifyPackage(root, version);
      return { version, root, skillDirectory, cacheDirectory, backup: null, reused: true };
    }
    backup = previousTarget === null ? null : `${skillDirectory}.before-${randomUUID()}`;
    writeFileSync(pendingPreparation, `${JSON.stringify({ skillDirectory, previousTarget, backup, previousCurrent: catalog.current, version, root })}\n`, { flag: "wx", mode: 0o600 });
    linkSync(pendingPreparation, recoveryPath); // Publish a complete intent exclusively.
    pendingWritten = true;
    if (previousTarget !== null) {
      renameSync(skillDirectory, backup);
    }
    const versions = catalog.versions.some((known) => sameVersion(known, version))
      ? catalog.versions : [...catalog.versions, version];
    const temporaryCatalog = `${catalogPath}.${randomUUID()}`;
    writeFileSync(temporaryCatalog, `${JSON.stringify({ ...catalog, current: id, versions })}\n`, { mode: 0o600 });
    renameSync(temporaryCatalog, catalogPath);
    // Creating the new link exclusively cannot overwrite an installation that appeared meanwhile.
    directoryLink(join(root, skillPath), skillDirectory);
    verifyPackage(root, version);
    if (realpathSync(skillDirectory) !== realpathSync(join(root, skillPath))) throw new Error("Installed entry read-back differs");
    rmSync(recoveryPath);
    return { version, root, skillDirectory, cacheDirectory, backup };
  } catch (error) {
    let restoredPreviousEntry = false;
    if (backup && existsSync(backup)) {
      try { directoryLink(previousTarget, skillDirectory); restoredPreviousEntry = true; }
      catch (restoreError) { if (restoreError.code !== "EEXIST") error.restoreFailure = restoreError.message; }
    }
    error.recovery = { recoveryPath, backup, restoredPreviousEntry, action: "Inspect these preserved paths and the public link before retrying; never overwrite an unknown entry." };
    error.message += `; installation recovery: ${JSON.stringify(error.recovery)}`;
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(pendingPreparation, { force: true });
    // Before durable intent, only this invocation's unpublished preparation can be removed.
    if (!pendingWritten && !existsSync(recoveryPath)) {
      if (createdRoot) rmSync(createdRoot, { recursive: true });
      if (createdVersionsDirectory && existsSync(versionsDirectory) && readdirSync(versionsDirectory).length === 0) rmdirSync(versionsDirectory);
    }
  }
}

export function installWorkflow(options) {
  const lock = `${resolve(options.cacheDirectory)}.install-lock`;
  mkdirSync(dirname(lock), { recursive: true });
  try { mkdirSync(lock); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`Installation lock is preserved: ${lock}. Prove no active installer owns this exact lock, then preserve and move it aside and retry the same exact install command. Package, pending intent, and public entry have not been changed by this attempt.`);
    throw error;
  }
  try { return installUnlocked(options); }
  finally { rmSync(lock, { recursive: true }); }
}
