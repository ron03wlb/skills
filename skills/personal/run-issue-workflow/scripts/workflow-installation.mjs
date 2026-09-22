import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { validateWorkflowVersion } from "./delivery-authority.mjs";
import { runWorkflowCommand } from "./workflow-command.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const skillPath = "skills/personal/run-issue-workflow";
const versionFields = ["id", "sourceCommit", "sourceRepository", "protocolVersion"];
const sameVersion = (left, right) => versionFields.every((field) => left?.[field] === right?.[field]);
const directoryLink = (target, path) => symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Installation metadata at ${path} is not valid JSON: ${error.message}`, { cause: error });
  }
};
const sharedReferences = [
  "docs/agents/run-preparation.md",
  "docs/agents/references/approved-pre-run-workflow-maintenance.md",
  "docs/agents/references/tracker-only-completion.md",
  "docs/agents/references/workflow-stop-diagnosis.md",
];
const safePath = (path) => typeof path === "string"
  && (path.startsWith("skills/") || sharedReferences.includes(path))
  && !path.split(/[\\/]/u).some((part) => ["", ".", ".."].includes(part));

function validateCatalog(catalog) {
  if (catalog?.schema !== "codex-workflow-installation:v1" || !Array.isArray(catalog.versions))
    throw new Error("Unknown installation metadata");
  for (const version of catalog.versions) validateWorkflowVersion(version);
  if (new Set(catalog.versions.map(({ id }) => id)).size !== catalog.versions.length
    || (catalog.current === null
      ? catalog.versions.length !== 0
      : !catalog.versions.some(({ id }) => id === catalog.current))) {
    throw new Error("Ambiguous installation version catalog");
  }
}

export function verifyWorkflowPackage(root, version) {
  if (lstatSync(root).isSymbolicLink()) throw new Error("Package directory is a link");
  const manifestBytes = readFileSync(join(root, ".workflow-version.json"));
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes);
  } catch (error) {
    throw new Error(`Package version manifest is not valid JSON: ${error.message}`, { cause: error });
  }
  if (manifest.schema !== "codex-workflow-version:v1" || !sameVersion(manifest.version, version))
    throw new Error("Package version identity differs from its trusted installation");
  if (version.protocolVersion !== 1 || !Array.isArray(manifest.files) || manifest.files.length === 0)
    throw new Error("Package version is incompatible");
  const seen = new Set();
  for (const file of manifest.files) {
    if (!safePath(file.path) || seen.has(file.path)) throw new Error("Invalid package path");
    seen.add(file.path);
    const path = join(root, file.path);
    const within = relative(realpathSync(root), realpathSync(path));
    if (!lstatSync(path).isFile() || !within || isAbsolute(within) || within === ".."
      || within.startsWith(`..${sep}`) || sha256(readFileSync(path)) !== file.sha256) {
      throw new Error(`Package content changed: ${file.path}`);
    }
  }
  if (sha256(JSON.stringify({ sourceCommit: version.sourceCommit, files: manifest.files })) !== version.id)
    throw new Error("Package content manifest changed");
  return { root, manifestSha256: `sha256:${sha256(manifestBytes)}` };
}

export function selectWorkflowVersion({ cacheDirectory, recordedVersion }) {
  let version = recordedVersion ?? null;
  try {
    if (!recordedVersion && existsSync(join(cacheDirectory, "installation-pending.json")))
      throw new Error("Installation recovery is pending; inspect installation-pending.json before selecting a version for a new Run");
    const catalog = readJson(join(cacheDirectory, "installation.json"));
    validateCatalog(catalog);
    version ??= catalog.versions.find(({ id }) => id === catalog.current);
    if (!version || !catalog.versions.some((known) => sameVersion(known, version)))
      throw new Error("Recorded workflow version is not in the trusted installation");
    if (!/^[a-f0-9]{64}$/u.test(version.id)) throw new Error("Invalid workflow version identity");
    return { state: "AVAILABLE", version, ...verifyWorkflowPackage(join(cacheDirectory, "versions", version.id), version) };
  } catch (error) {
    return {
      state: "UNAVAILABLE",
      version,
      reason: error.message,
      recovery: "Restore this exact trusted package or use the already-approved maintenance scope to install a reviewed compatible version; preserve the Run and original Start. Run preparation owns the pre-Run handoff.",
    };
  }
}

const capabilityDescriptorFields = ["arch", "kernelRelease", "node", "platform", "posixCleanup", "wslDistro"];
const sortedKeys = (value) => value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : [];
const provenCapability = (capability) => JSON.stringify(sortedKeys(capability)) === JSON.stringify(capabilityDescriptorFields)
  && capability.posixCleanup === true
  && ["platform", "arch", "node"].every((field) => typeof capability[field] === "string" && capability[field].length > 0);
const capabilityBlocker = ({ entryPath, reason, state }) => {
  const owner = `${entryPath} --capability-identity`;
  const action = `Run ${owner} on the selected substrate, repair the capability its owning source reports as unproven, and re-read the installed evidence.`;
  return Object.assign(new Error(`installed workflow capability probe is unproven; ${owner} owns it: ${reason}; smallest human action: ${action}`), {
    code: "installed_workflow_capability_unproven",
    state,
    surface: "installed workflow capability probe",
    owner,
    reason,
    action,
  });
};

export function managedWorkflowEntryPaths(cacheDirectory) {
  const toolHome = dirname(resolve(cacheDirectory));
  const home = dirname(toolHome);
  return [".codex", ".agents", ".claude"].map((directory) => join(home, directory, "skills", "run-issue-workflow"));
}

export function readWorkflowInstallationEvidence({
  cacheDirectory,
  skillDirectories,
  expectedSourceCommit,
  commandRunner = runWorkflowCommand,
}) {
  const selected = selectWorkflowVersion({ cacheDirectory });
  if (selected.state !== "AVAILABLE") throw new Error(`Current workflow package is unavailable: ${selected.reason}`);
  if (selected.version.sourceCommit !== expectedSourceCommit)
    throw new Error("Current workflow package candidate differs from the reviewed source commit");
  const paths = managedWorkflowEntryPaths(cacheDirectory);
  const pathKey = (path) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  const supplied = Array.isArray(skillDirectories) ? new Set(skillDirectories.map(pathKey)) : new Set();
  if (supplied.size !== paths.length || paths.some((path) => !supplied.has(pathKey(path))))
    throw new TypeError("Evidence requires the complete managed workflow entry set derived from the trusted cache location");
  const expectedTarget = join(selected.root, skillPath);
  const entries = paths.map((path) => {
    const item = lstatSync(path, { throwIfNoEntry: false });
    const target = item?.isSymbolicLink() ? resolve(dirname(path), readlinkSync(path)) : null;
    if (!item?.isSymbolicLink() || target !== expectedTarget || realpathSync.native(path) !== realpathSync.native(expectedTarget))
      throw new Error(`Current managed entry does not select the reviewed workflow package: ${path}`);
    return { path, target, packageVersionId: selected.version.id };
  });
  const entryPath = realpathSync.native(join(expectedTarget, "scripts", "installed-entry.mjs"));
  let identity;
  try {
    identity = JSON.parse(commandRunner(process.execPath, [entryPath, "--capability-identity", selected.version.id], {
      encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 60000, windowsHide: true,
    }));
  } catch (error) {
    const reason = error.stderr?.toString().trim() || error.message;
    throw capabilityBlocker({ entryPath, state: "UNKNOWN", reason: `the package-owned capability probe did not pass: ${reason}` });
  }
  if (identity?.state !== "READY")
    throw capabilityBlocker({ entryPath, state: "UNKNOWN", reason: identity?.reason ?? "the package-owned capability probe reported no proven capability" });
  if (identity.packageVersionId !== selected.version.id || identity.manifestSha256 !== selected.manifestSha256)
    throw capabilityBlocker({ entryPath, state: "UNPROVEN", reason: "the capability identity is not bound to the selected package manifest" });
  if (!provenCapability(identity.capability))
    throw capabilityBlocker({ entryPath, state: "UNPROVEN", reason: "the package-owned capability probe returned no complete proven capability descriptor" });
  return {
    schema: "codex-workflow-effective-evidence:v4",
    candidate: selected.version.sourceCommit,
    packageVersion: selected.version,
    manifestSha256: selected.manifestSha256,
    entries,
    capability: identity.capability,
    capabilityIdentity: identity.capabilityIdentity,
  };
}

const targetOf = (path) => {
  const item = lstatSync(path, { throwIfNoEntry: false });
  if (item === undefined) return null;
  if (!item.isSymbolicLink()) throw new Error(`Unknown installed skill; preserve it: ${path}`);
  return resolve(dirname(path), readlinkSync(path));
};

const normalizeInstallEntries = (options) => {
  const raw = options.skillDirectories ?? (options.skillDirectory === undefined ? null : [options.skillDirectory]);
  if (!Array.isArray(raw) || raw.length === 0 || raw.some((path) => typeof path !== "string" || path.length === 0))
    throw new TypeError("Install requires at least one public workflow entry");
  const paths = raw.map((path) => resolve(path));
  if (new Set(paths).size !== paths.length) throw new TypeError("Install workflow entries must be unique");
  const replacements = options.replaceLinkTargets ?? {};
  return paths.map((path, index) => {
    let replaceTarget = null;
    if (Array.isArray(replacements)) replaceTarget = replacements[index] ?? null;
    else if (replacements instanceof Map) replaceTarget = replacements.get(path) ?? replacements.get(raw[index]) ?? null;
    else if (replacements && typeof replacements === "object") replaceTarget = replacements[path] ?? replacements[raw[index]] ?? null;
    if (paths.length === 1 && replaceTarget === null) replaceTarget = options.replaceLinkTarget ?? null;
    return { path, replaceTarget: replaceTarget === null ? null : resolve(replaceTarget) };
  });
};

const pendingIdentity = (pending) => sha256(JSON.stringify({
  schema: pending.schema,
  sourceRepository: pending.sourceRepository,
  sourceCommit: pending.sourceCommit,
  cacheDirectory: pending.cacheDirectory,
  version: pending.version,
  previousCurrent: pending.previousCurrent,
  entries: pending.entries,
}));

const validatePending = (pending) => {
  if (pending?.schema !== "workflow-installation-pending:v2" || !Array.isArray(pending.entries) || pending.entries.length === 0)
    throw new Error("Installation pending intent has an unsupported shape");
  validateWorkflowVersion(pending.version);
  if (pending.intentId !== pendingIdentity({ ...pending, intentId: undefined }))
    throw new Error("Installation pending intent identity changed");
};

const publishJson = (path, value) => {
  const temporary = `${path}.${randomUUID()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600, flush: true });
  renameSync(temporary, path);
};

const readBackEntry = (path, expectedTarget) => {
  const observed = targetOf(path);
  if (observed !== expectedTarget || realpathSync.native(path) !== realpathSync.native(expectedTarget))
    throw new Error(`Installed entry read-back differs: ${path}`);
  return observed;
};

const restoreEntries = ({ entries, nextTarget }) => {
  const restored = [];
  const failures = [];
  for (const entry of entries.toReversed()) {
    try {
      const observed = targetOf(entry.path);
      if (observed !== null && observed !== nextTarget && observed !== entry.previousTarget)
        throw new Error(`entry now points to ${observed}`);
      if (observed !== null && observed !== entry.previousTarget) rmSync(entry.path);
      if (entry.previousTarget !== null && targetOf(entry.path) === null) directoryLink(entry.previousTarget, entry.path);
      if (targetOf(entry.path) !== entry.previousTarget) throw new Error("rollback read-back differs");
      restored.push(entry.path);
    } catch (error) {
      failures.push(`${entry.path}: ${error.message}`);
    }
  }
  return { restored, failures };
};

function recoverInstallation({ pending, recoveryPath, requested, catalog }) {
  validatePending(pending);
  const requestedPaths = requested.map(({ path }) => path);
  if (pending.sourceRepository !== requested.sourceRepository || pending.sourceCommit !== requested.sourceCommit
    || pending.cacheDirectory !== requested.cacheDirectory
    || JSON.stringify(pending.entries.map(({ path }) => path)) !== JSON.stringify(requestedPaths)) {
    throw new Error(`Installation recovery identity differs. Preserve ${recoveryPath} and retry the same exact installation.`);
  }
  if (![pending.previousCurrent, pending.version.id].includes(catalog.current))
    throw new Error(`Installation recovery catalog drift: ${catalog.current}`);
  const root = join(requested.cacheDirectory, "versions", pending.version.id);
  const nextTarget = join(root, skillPath);
  verifyWorkflowPackage(root, pending.version);
  for (const entry of pending.entries) {
    const observed = targetOf(entry.path);
    if (![null, entry.previousTarget, nextTarget].includes(observed))
      throw new Error(`Installation recovery public link ${entry.path} now points to ${observed}`);
    if (entry.previousTarget !== null) {
      if (targetOf(entry.backup) !== entry.previousTarget)
        throw new Error(`Installation recovery backup ${entry.backup} no longer preserves ${entry.previousTarget}`);
    } else if (entry.backup !== null) throw new Error("Installation recovery has an unexpected backup");
  }
  try {
    for (const entry of pending.entries) {
      const observed = targetOf(entry.path);
      if (observed !== nextTarget) {
        if (observed !== null) rmSync(entry.path);
        directoryLink(nextTarget, entry.path);
      }
      readBackEntry(entry.path, nextTarget);
    }
    const versions = catalog.versions.some((known) => sameVersion(known, pending.version))
      ? catalog.versions : [...catalog.versions, pending.version];
    publishJson(join(requested.cacheDirectory, "installation.json"), { ...catalog, current: pending.version.id, versions });
    for (const entry of pending.entries) readBackEntry(entry.path, nextTarget);
    verifyWorkflowPackage(root, pending.version);
    rmSync(recoveryPath);
    return {
      version: pending.version,
      root,
      skillDirectories: requestedPaths,
      skillDirectory: requestedPaths[0],
      cacheDirectory: requested.cacheDirectory,
      backups: pending.entries.map(({ backup }) => backup).filter(Boolean),
      backup: pending.entries.find(({ backup }) => backup !== null)?.backup ?? null,
      recovered: true,
    };
  } catch (error) {
    const rollback = restoreEntries({ entries: pending.entries, nextTarget });
    error.recovery = { recoveryPath, rollback, action: "Preserve the pending intent and backups, then retry the same exact installation." };
    error.message += `; installation recovery: ${JSON.stringify(error.recovery)}`;
    throw error;
  }
}

function preparePackage({ sourceRepository, sourceCommit, cacheDirectory }) {
  const git = (...args) => runWorkflowCommand("git", ["-C", sourceRepository, ...args]);
  if (!/^[a-f0-9]{40,64}$/u.test(sourceCommit ?? "") || git("rev-parse", `${sourceCommit}^{commit}`) !== sourceCommit)
    throw new Error("Install requires one exact trusted source commit");
  const tree = runWorkflowCommand("git", ["-C", sourceRepository, "ls-tree", "-rz", "--full-tree", sourceCommit, "--", "skills", ...sharedReferences]);
  const files = tree.split("\0").filter(Boolean).map((line) => {
    const match = line.match(/^(100644|100755) blob [a-f0-9]+\t(.+)$/u);
    if (!match || !safePath(match[2])) throw new Error("Workflow package contains an unsupported path or link");
    return { path: match[2], mode: match[1] };
  });
  for (const required of [
    `${skillPath}/SKILL.md`, `${skillPath}/scripts/installed-entry.mjs`, `${skillPath}/deliver-tracker-spec.json`,
    `${skillPath}/workflows/deliver-tracker-spec/helpers/controller.mjs`, `${skillPath}/scripts/pi-workflow-host.mjs`,
  ]) if (!files.some(({ path }) => path === required)) throw new Error(`Workflow package lacks ${required}`);
  const versionsDirectory = join(cacheDirectory, "versions");
  mkdirSync(versionsDirectory, { recursive: true });
  const staging = join(cacheDirectory, `prepare-${randomUUID()}`);
  mkdirSync(staging);
  try {
    const archive = runWorkflowCommand("git", ["-C", sourceRepository, "-c", "core.autocrlf=false", "archive", sourceCommit, "skills", ...sharedReferences.filter((path) => files.some((file) => file.path === path))], { maxBuffer: 32 * 1024 * 1024, encoding: null });
    runWorkflowCommand("tar", ["-x", "-C", staging], { input: archive });
    for (const file of files) file.sha256 = sha256(readFileSync(join(staging, file.path)));
    const id = sha256(JSON.stringify({ sourceCommit, files }));
    const version = { id, sourceCommit, sourceRepository, protocolVersion: 1 };
    const root = join(versionsDirectory, id);
    const existed = existsSync(root);
    writeFileSync(join(staging, ".workflow-version.json"), `${JSON.stringify({ schema: "codex-workflow-version:v1", version, files })}\n`);
    if (existed) verifyWorkflowPackage(root, version);
    else renameSync(staging, root);
    return { version, root, created: !existed };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function installUnlocked(options) {
  const sourceRepository = realpathSync(options.sourceRepository);
  const cacheDirectory = resolve(options.cacheDirectory);
  const entries = normalizeInstallEntries(options);
  const requested = Object.assign(entries, { sourceRepository, sourceCommit: options.sourceCommit, cacheDirectory });
  const catalogPath = join(cacheDirectory, "installation.json");
  const recoveryPath = join(cacheDirectory, "installation-pending.json");
  if ((existsSync(cacheDirectory) && lstatSync(cacheDirectory).isSymbolicLink())
    || (existsSync(catalogPath) && !lstatSync(catalogPath).isFile()))
    throw new Error("Unknown linked installation metadata; preserve it");
  if (existsSync(cacheDirectory) && !existsSync(catalogPath) && !existsSync(recoveryPath)
    && readdirSync(cacheDirectory).some((name) => !name.startsWith("prepare-") && name !== "versions"))
    throw new Error("Unknown installation directory; preserve its contents");
  mkdirSync(cacheDirectory, { recursive: true });
  const catalog = existsSync(catalogPath) ? readJson(catalogPath)
    : { schema: "codex-workflow-installation:v1", current: null, versions: [] };
  validateCatalog(catalog);
  if (existsSync(recoveryPath)) return recoverInstallation({ pending: readJson(recoveryPath), recoveryPath, requested, catalog });

  const previous = entries.map((entry) => ({ ...entry, previousTarget: targetOf(entry.path) }));
  for (const entry of previous) {
    const managed = catalog.versions.some(({ id }) => entry.previousTarget === join(cacheDirectory, "versions", id, skillPath));
    if (entry.previousTarget !== null && !managed && entry.previousTarget !== entry.replaceTarget)
      throw new Error(`Unknown installed skill link; explicit replacement is required: ${entry.path}`);
  }
  const { version, root, created: createdRoot } = preparePackage({ sourceRepository, sourceCommit: options.sourceCommit, cacheDirectory });
  const nextTarget = join(root, skillPath);
  if (previous.every(({ previousTarget }) => previousTarget === nextTarget) && catalog.current === version.id) {
    for (const entry of previous) readBackEntry(entry.path, nextTarget);
    return { version, root, skillDirectories: previous.map(({ path }) => path), skillDirectory: previous[0].path, cacheDirectory, backups: [], backup: null, reused: true };
  }

  const transactionId = randomUUID();
  const backupRoot = join(cacheDirectory, "backups", transactionId);
  const pendingEntries = previous.map((entry, index) => ({
    path: entry.path,
    previousTarget: entry.previousTarget,
    backup: entry.previousTarget === null ? null : join(backupRoot, `${String(index + 1).padStart(2, "0")}-${sha256(entry.path).slice(0, 16)}`),
  }));
  const pendingDraft = {
    schema: "workflow-installation-pending:v2",
    sourceRepository,
    sourceCommit: options.sourceCommit,
    cacheDirectory,
    version,
    previousCurrent: catalog.current,
    entries: pendingEntries,
    ...(pendingEntries.length === 1 ? {
      skillDirectory: pendingEntries[0].path,
      previousTarget: pendingEntries[0].previousTarget,
      backup: pendingEntries[0].backup,
      root,
    } : {}),
  };
  const pending = { ...pendingDraft, intentId: pendingIdentity(pendingDraft) };
  const pendingPreparation = join(cacheDirectory, `installation-pending.${transactionId}`);
  let pendingWritten = false;
  try {
    writeFileSync(pendingPreparation, `${JSON.stringify(pending, null, 2)}\n`, { flag: "wx", mode: 0o600, flush: true });
    linkSync(pendingPreparation, recoveryPath);
    pendingWritten = true;
    mkdirSync(backupRoot, { recursive: true });
    for (const entry of pendingEntries) {
      mkdirSync(dirname(entry.path), { recursive: true });
      if (entry.backup !== null) {
        directoryLink(entry.previousTarget, entry.backup);
        if (targetOf(entry.backup) !== entry.previousTarget) throw new Error(`Backup read-back differs: ${entry.backup}`);
      }
    }
    for (const entry of pendingEntries) {
      if (entry.previousTarget !== null) rmSync(entry.path);
      directoryLink(nextTarget, entry.path);
      readBackEntry(entry.path, nextTarget);
    }
    const versions = catalog.versions.some((known) => sameVersion(known, version)) ? catalog.versions : [...catalog.versions, version];
    publishJson(catalogPath, { ...catalog, current: version.id, versions });
    for (const entry of pendingEntries) readBackEntry(entry.path, nextTarget);
    verifyWorkflowPackage(root, version);
    rmSync(recoveryPath);
    return {
      version,
      root,
      skillDirectories: pendingEntries.map(({ path }) => path),
      skillDirectory: pendingEntries[0].path,
      cacheDirectory,
      backups: pendingEntries.map(({ backup }) => backup).filter(Boolean),
      backup: pendingEntries.find(({ backup }) => backup !== null)?.backup ?? null,
    };
  } catch (error) {
    const rollback = restoreEntries({ entries: pendingEntries, nextTarget });
    error.recovery = {
      recoveryPath,
      backups: pendingEntries.map(({ backup }) => backup).filter(Boolean),
      backup: pendingEntries.find(({ backup }) => backup !== null)?.backup ?? null,
      rollback,
      restoredPreviousEntry: pendingEntries.length === 1 && rollback.failures.length === 0 && pendingEntries[0].previousTarget !== null,
      action: "Inspect the preserved intent and external backups, then retry the same exact installation.",
    };
    error.message += `; installation recovery: ${JSON.stringify(error.recovery)}`;
    throw error;
  } finally {
    rmSync(pendingPreparation, { force: true });
    if (!pendingWritten && !existsSync(recoveryPath) && createdRoot) {
      rmSync(root, { recursive: true, force: true });
      const versionsDirectory = join(cacheDirectory, "versions");
      if (existsSync(versionsDirectory) && readdirSync(versionsDirectory).length === 0) rmdirSync(versionsDirectory);
    }
    if (!pendingWritten && existsSync(backupRoot) && readdirSync(backupRoot).length === 0) rmdirSync(backupRoot);
  }
}

export function withWorkflowInstallationLock(cacheDirectory, operation) {
  if (typeof operation !== "function") throw new TypeError("Installation lock needs one operation");
  const lock = `${resolve(cacheDirectory)}.install-lock`;
  mkdirSync(dirname(lock), { recursive: true });
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error(`Installation lock is preserved: ${lock}. Prove no active installer or maintenance transaction owns this exact lock, then preserve and move it aside and retry the same exact install or maintenance command. Catalog, pending intents, quarantine, and public entries have not been changed by this attempt.`);
    throw error;
  }
  try {
    return operation();
  } finally {
    rmSync(lock, { recursive: true });
  }
}

export function installWorkflow(options) {
  return withWorkflowInstallationLock(options.cacheDirectory, () => installUnlocked(options));
}
