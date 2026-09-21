import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
  managedWorkflowEntryPaths,
  verifyWorkflowPackage,
  withWorkflowInstallationLock,
} from "./workflow-installation.mjs";

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const pathExists = (path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined;
const skillPath = "skills/personal/run-issue-workflow";
const isVersionId = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const parseJson = (bytes, path) => {
  try { return JSON.parse(bytes); }
  catch (error) { throw new Error(`Maintenance cannot read ${path}: ${error.message}`, { cause: error }); }
};
const readJson = (path) => parseJson(readFileSync(path, "utf8"), path);
const linkTarget = (path) => {
  const item = lstatSync(path, { throwIfNoEntry: false });
  if (item === undefined) return null;
  if (!item.isSymbolicLink()) throw new Error(`Maintenance refuses non-link entry ${path}`);
  return resolve(dirname(path), readlinkSync(path));
};
const versionFromTarget = (cacheDirectory, target) => {
  if (target === null) return null;
  const prefix = `${join(resolve(cacheDirectory), "versions")}/`;
  const normalized = target.replaceAll("\\", "/");
  const normalizedPrefix = prefix.replaceAll("\\", "/");
  if (!normalized.startsWith(normalizedPrefix)) return null;
  const [id, ...tail] = normalized.slice(normalizedPrefix.length).split("/");
  return isVersionId(id) && tail.join("/") === skillPath ? id : null;
};
const walk = (root, visit) => {
  if (!existsSync(root)) return;
  const pending = [root];
  while (pending.length > 0) {
    const path = pending.pop();
    const item = lstatSync(path);
    if (item.isDirectory() && !item.isSymbolicLink()) {
      for (const name of readdirSync(path).sort().toReversed()) pending.push(join(path, name));
    } else visit(path, item);
  }
};
const collectVersionReferences = (roots) => {
  const references = new Map();
  const add = (id, source) => {
    if (!isVersionId(id)) return;
    if (!references.has(id)) references.set(id, []);
    references.get(id).push(source);
  };
  for (const root of roots.map((path) => resolve(path))) {
    walk(root, (path, item) => {
      if (!item.isFile() || !/\.(?:json|jsonl)$/u.test(path)) return;
      let text;
      try { text = readFileSync(path, "utf8"); } catch { return; }
      for (const match of text.matchAll(/"(?:packageVersionId|id)"\s*:\s*"([a-f0-9]{64})"/gu)) add(match[1], path);
      for (const match of text.matchAll(/"workflowVersion"\s*:\s*\{[^{}]*"id"\s*:\s*"([a-f0-9]{64})"/gu)) add(match[1], path);
    });
  }
  return references;
};
const digestPath = (root) => {
  if (!existsSync(root)) return null;
  const rows = [];
  walk(root, (path, item) => {
    const name = path.slice(resolve(root).length + 1).replaceAll("\\", "/");
    if (item.isSymbolicLink()) rows.push([name, "link", readlinkSync(path)]);
    else if (item.isFile()) rows.push([name, "file", sha256(readFileSync(path))]);
  });
  return sha256(JSON.stringify(rows));
};
const descriptorForPath = (path, cacheDirectory) => {
  const target = linkTarget(path);
  return { path, target, versionId: versionFromTarget(cacheDirectory, target) };
};
const backupLinks = (root, cacheDirectory) => {
  const links = [];
  walk(root, (path, item) => {
    if (item.isSymbolicLink()) links.push(descriptorForPath(path, cacheDirectory));
  });
  return links.sort((a, b) => a.path.localeCompare(b.path));
};
const discoveryBackupLinks = (skillDirectories, cacheDirectory) => {
  const links = [];
  for (const entry of skillDirectories) {
    const prefix = `${basename(entry)}.before-`;
    if (!existsSync(dirname(entry))) continue;
    for (const name of readdirSync(dirname(entry)).filter((candidate) => candidate.startsWith(prefix)).sort()) {
      const path = join(dirname(entry), name);
      links.push(descriptorForPath(path, cacheDirectory));
    }
  }
  return links;
};
const optionalRunState = (path) => {
  const runPath = join(path, "run.json");
  if (!existsSync(runPath)) return { eligible: false, reason: "run.json is absent" };
  const record = readJson(runPath);
  const status = String(record.status ?? record.state ?? "").toLowerCase();
  const terminal = ["complete", "completed", "failed", "cancelled", "stopped", "interrupted"].includes(status);
  if (!terminal) return { eligible: false, reason: `status ${status || "unknown"} is not terminal` };
  const text = JSON.stringify(record);
  if (/"(?:active|running|queued|pending)"/u.test(text)) return { eligible: false, reason: "record still names active or pending work" };
  if (/"worktreePath"\s*:\s*"[^"]+"/u.test(text)) return { eligible: false, reason: "record still names a worktree" };
  return { eligible: true, reason: "terminal with no active child or worktree reference", digest: sha256(readFileSync(runPath)) };
};

function buildPreview({
  cacheDirectory,
  skillDirectories = managedWorkflowEntryPaths(cacheDirectory),
  journalRoots = [],
  activeReferenceRoots = [],
  optionalRunsRoot = null,
} = {}) {
  cacheDirectory = resolve(cacheDirectory);
  skillDirectories = skillDirectories.map((path) => resolve(path)).sort();
  optionalRunsRoot = optionalRunsRoot === null ? null : resolve(optionalRunsRoot);
  const catalogPath = join(cacheDirectory, "installation.json");
  const catalogBytes = readFileSync(catalogPath);
  let catalog;
  try {
    catalog = JSON.parse(catalogBytes);
  } catch (error) {
    throw new Error(`Maintenance cannot parse ${catalogPath}: ${error.message}`, { cause: error });
  }
  if (catalog?.schema !== "codex-workflow-installation:v1" || !Array.isArray(catalog.versions)
    || !catalog.versions.some(({ id }) => id === catalog.current)) throw new Error("Maintenance requires one valid current installation catalog");
  const entries = skillDirectories.map((path) => descriptorForPath(path, cacheDirectory));
  if (entries.some(({ versionId }) => versionId !== catalog.current))
    throw new Error("Maintenance refuses a public entry that does not resolve to catalog current");
  const pendingPath = join(cacheDirectory, "installation-pending.json");
  const pendingBytes = existsSync(pendingPath) ? readFileSync(pendingPath) : null;
  let pending = null;
  if (pendingBytes !== null) {
    try {
      pending = JSON.parse(pendingBytes);
    } catch (error) {
      throw new Error(`Maintenance cannot parse ${pendingPath}: ${error.message}`, { cause: error });
    }
  }
  const refs = collectVersionReferences([...journalRoots, ...activeReferenceRoots]);
  const reasons = new Map();
  const keep = (id, reason) => {
    if (!isVersionId(id)) return;
    if (!reasons.has(id)) reasons.set(id, []);
    reasons.get(id).push(reason);
  };
  keep(catalog.current, "catalog current");
  for (const [id, paths] of refs) for (const path of paths) keep(id, `record reference: ${path}`);
  const currentIndex = catalog.versions.findIndex(({ id }) => id === catalog.current);
  for (const version of catalog.versions.slice(0, currentIndex).slice(-2)) keep(version.id, "recent rollback version");
  if (pending) {
    keep(pending.version?.id, "pending installation version");
    keep(pending.previousCurrent, "pending installation previous current");
  }
  const backupsRoot = join(cacheDirectory, "backups");
  const cacheBackups = backupLinks(backupsRoot, cacheDirectory);
  const discoveryBackups = discoveryBackupLinks(skillDirectories, cacheDirectory);
  const protectedBackupVersionIds = new Set(reasons.keys());
  const preserveCacheBackups = cacheBackups.filter(({ versionId }) => versionId !== null && protectedBackupVersionIds.has(versionId));
  const allBackupLinks = [...cacheBackups, ...discoveryBackups];
  const preserveForeignBackupLinks = allBackupLinks
    .filter(({ versionId }) => versionId === null)
    .map((entry) => ({ ...entry, reason: "foreign or unrecognized backup target" }));
  const removeBackupLinks = allBackupLinks.filter(({ versionId }) => (
    versionId !== null && !protectedBackupVersionIds.has(versionId)
  ));
  const removeVersions = catalog.versions.filter(({ id }) => !reasons.has(id)).map(({ id }) => ({
    id,
    path: join(cacheDirectory, "versions", id),
    manifestSha256: verifyWorkflowPackage(join(cacheDirectory, "versions", id), catalog.versions.find((version) => version.id === id)).manifestSha256,
  }));
  const optionalRuns = [];
  if (optionalRunsRoot !== null && existsSync(optionalRunsRoot)) {
    for (const name of readdirSync(optionalRunsRoot).sort()) {
      const path = join(optionalRunsRoot, name);
      if (!lstatSync(path).isDirectory()) continue;
      optionalRuns.push({ id: name, path, ...optionalRunState(path) });
    }
  }
  const observed = {
    catalogSha256: sha256(catalogBytes),
    pendingSha256: pendingBytes === null ? null : sha256(pendingBytes),
    entries,
    cacheBackups,
    discoveryBackups,
    qualification: existsSync(join(cacheDirectory, "qualification")),
    qualificationDigest: digestPath(join(cacheDirectory, "qualification")),
    optionalRuns,
  };
  const plan = {
    schema: "workflow-installation-maintenance-preview:v1",
    cacheDirectory,
    skillDirectories,
    journalRoots: journalRoots.map((path) => resolve(path)).sort(),
    activeReferenceRoots: activeReferenceRoots.map((path) => resolve(path)).sort(),
    optionalRunsRoot,
    observed,
    keep: [...reasons].sort(([left], [right]) => left.localeCompare(right)).map(([id, why]) => ({ id, reasons: [...new Set(why)].sort() })),
    removeVersions,
    preserveCacheBackups,
    preserveForeignBackupLinks,
    removeBackupLinks,
    removeOptionalRuns: optionalRuns.filter(({ eligible }) => eligible).map(({ id, path, digest }) => ({ id, path, digest })),
  };
  return { ...plan, previewId: sha256(JSON.stringify(plan)) };
}

export function previewInstallationMaintenance(options = {}) {
  const preview = buildPreview(options);
  const directory = join(preview.cacheDirectory, "maintenance", "previews");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${preview.previewId.slice("sha256:".length)}.json`);
  if (existsSync(path)) {
    const existing = readJson(path);
    if (JSON.stringify(existing) !== JSON.stringify(preview)) throw new Error("Maintenance preview identity collision");
  } else writeFileSync(path, `${JSON.stringify(preview, null, 2)}\n`, { flag: "wx", mode: 0o600, flush: true });
  return { ...preview, path };
}

const maintenanceIdentity = (pending) => sha256(JSON.stringify({ ...pending, intentId: undefined }));
const publishJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600, flush: true });
  renameSync(temporary, path);
};
const writePending = (path, pending) => {
  const next = { ...pending, intentId: maintenanceIdentity(pending) };
  publishJson(path, next);
  return next;
};
const validatePending = (pending, pendingPath) => {
  if (pending?.schema !== "workflow-installation-maintenance-pending:v1"
    || !/^sha256:[a-f0-9]{64}$/u.test(pending.previewId ?? "")
    || !Array.isArray(pending.items)
    || pending.intentId !== maintenanceIdentity({ ...pending, intentId: undefined })) {
    throw new Error(`Maintenance pending intent at ${pendingPath} changed; preserve it and its quarantine`);
  }
  for (const item of pending.items) {
    if (typeof item.source !== "string" || typeof item.quarantine !== "string"
      || dirname(item.source) !== dirname(item.quarantine)
      || !basename(item.quarantine).startsWith(".workflow-maintenance-quarantine-")) {
      throw new Error(`Maintenance pending item changed; preserve ${pendingPath} and its quarantine`);
    }
  }
  return pending;
};
const assertItem = (item, path) => {
  if (item.kind === "backup") {
    if (linkTarget(path) !== item.target) throw new Error(`backup target differs at ${path}`);
    return;
  }
  if (item.kind === "version") {
    const version = readJson(join(path, ".workflow-version.json")).version;
    const proof = verifyWorkflowPackage(path, version);
    if (version.id !== item.id || proof.manifestSha256 !== item.digest) throw new Error(`version identity differs at ${path}`);
    return;
  }
  if (item.kind === "optional-run") {
    const observed = optionalRunState(path);
    if (!observed.eligible || observed.digest !== item.digest) throw new Error(`optional run differs at ${path}`);
    return;
  }
  if (item.kind === "qualification" && digestPath(path) === item.digest) return;
  throw new Error(`maintenance item differs at ${path}`);
};
const receiptPathFor = (cacheDirectory, previewId) => join(
  cacheDirectory,
  "maintenance",
  "receipts",
  `${previewId.slice("sha256:".length)}.json`,
);
const readReceipt = (cacheDirectory, previewId) => {
  const path = receiptPathFor(cacheDirectory, previewId);
  if (!existsSync(path)) return null;
  const receipt = readJson(path);
  if (receipt.previewId !== previewId) throw new Error(`Maintenance receipt identity differs at ${path}`);
  return { ...receipt, path };
};
const buildReceipt = (pending, catalog) => {
  const selected = catalog.versions.find(({ id }) => id === catalog.current);
  const readBack = verifyWorkflowPackage(join(pending.cacheDirectory, "versions", catalog.current), selected);
  for (const entry of pending.skillDirectories) {
    if (versionFromTarget(pending.cacheDirectory, linkTarget(entry)) !== catalog.current)
      throw new Error(`Maintenance public entry read-back differs: ${entry}`);
  }
  return {
    schema: "workflow-installation-maintenance-receipt:v1",
    previewId: pending.previewId,
    appliedAt: pending.startedAt,
    removedBackupLinks: pending.items.filter(({ kind }) => kind === "backup").map(({ source: path, target, versionId }) => ({ path, target, versionId })),
    deletedVersionIds: pending.items.filter(({ kind }) => kind === "version").map(({ id }) => id),
    deletedOptionalRuns: pending.items.filter(({ kind }) => kind === "optional-run").map(({ id, source: path, digest }) => ({ id, path, digest })),
    retiredQualificationRemoved: pending.items.some(({ kind }) => kind === "qualification"),
    readBack: { current: catalog.current, manifestSha256: readBack.manifestSha256, entries: pending.skillDirectories },
    recovery: { transactionId: pending.transactionId, catalogSha256: pending.committedCatalogSha256 },
  };
};
const publishReceipt = (pending, catalog, onPhase) => {
  const prior = readReceipt(pending.cacheDirectory, pending.previewId);
  if (prior !== null) return prior;
  onPhase("before_receipt", pending);
  const receipt = buildReceipt(pending, catalog);
  const path = receiptPathFor(pending.cacheDirectory, pending.previewId);
  publishJson(path, receipt);
  onPhase("after_receipt", pending);
  return { ...receipt, path };
};
const assertCommittedItems = (pending, { allowPurged }) => {
  for (const item of pending.items) {
    if (pathExists(item.source)) {
      throw new Error(`Maintenance committed-state drift: removed source reappeared at ${item.source}; preserve the pending intent and every quarantine path`);
    }
    if (!pathExists(item.quarantine)) {
      if (allowPurged) continue;
      throw new Error(`Maintenance committed-state drift: quarantine is absent at ${item.quarantine}; preserve the pending intent and every quarantine path`);
    }
    try { assertItem(item, item.quarantine); }
    catch (error) {
      throw new Error(`Maintenance committed-state quarantine drift; preserve the pending intent and ${item.quarantine}: ${error.message}`);
    }
  }
};
const purgeQuarantine = (pending, pendingPath, receipt, onPhase) => {
  const retained = [];
  for (let index = 0; index < pending.items.length; index += 1) {
    const item = pending.items[index];
    if (pathExists(item.source)) {
      throw new Error(`Maintenance purge refuses a reappeared source at ${item.source}; preserve ${pendingPath} and every quarantine path`);
    }
    if (!pathExists(item.quarantine)) continue;
    try {
      assertItem(item, item.quarantine);
      onPhase(`during_purge:${index + 1}`, pending);
      rmSync(item.quarantine, { recursive: true });
    } catch (error) {
      retained.push({ path: item.quarantine, reason: error.message });
    }
  }
  if (retained.length > 0) return { ...receipt, retainedQuarantine: retained, recoveryPending: pendingPath };
  rmSync(pendingPath, { force: true });
  return receipt;
};
const recoverMaintenance = ({ pendingPath, onPhase }) => {
  if (!existsSync(pendingPath)) return null;
  let pending = validatePending(readJson(pendingPath), pendingPath);
  const catalogPath = join(pending.cacheDirectory, "installation.json");
  const catalogBytes = readFileSync(catalogPath);
  const catalogDigest = sha256(catalogBytes);
  if (catalogDigest === pending.originalCatalogSha256) {
    for (const item of pending.items.toReversed()) {
      const sourceExists = pathExists(item.source);
      const quarantineExists = pathExists(item.quarantine);
      if (sourceExists && quarantineExists) throw new Error(`Maintenance recovery path drift: both ${item.source} and ${item.quarantine} exist`);
      if (!sourceExists && !quarantineExists) throw new Error(`Maintenance recovery lost both ${item.source} and ${item.quarantine}`);
      if (quarantineExists) {
        try { assertItem(item, item.quarantine); }
        catch (error) {
          throw new Error(`Maintenance recovery quarantine drift; preserve ${pendingPath} and ${item.quarantine}: ${error.message}`);
        }
        renameSync(item.quarantine, item.source);
      }
      try { assertItem(item, item.source); }
      catch (error) {
        throw new Error(`Maintenance recovery source drift; preserve ${pendingPath} and every quarantine path: ${error.message}`);
      }
    }
    pending = writePending(pendingPath, { ...pending, phase: "restored" });
    onPhase("after_restore", pending);
    rmSync(pendingPath);
    return null;
  }
  if (catalogDigest !== pending.committedCatalogSha256) {
    throw new Error(`Maintenance recovery catalog drift; preserve ${pendingPath} and every quarantine path`);
  }
  const priorReceipt = readReceipt(pending.cacheDirectory, pending.previewId);
  assertCommittedItems(pending, { allowPurged: priorReceipt !== null });
  const catalog = parseJson(catalogBytes, catalogPath);
  const receipt = priorReceipt ?? publishReceipt(pending, catalog, onPhase);
  pending = writePending(pendingPath, { ...pending, phase: "receipt_written" });
  return purgeQuarantine(pending, pendingPath, receipt, onPhase);
};
const transactionItems = (preview, transactionId) => {
  const raw = [
    ...preview.removeBackupLinks.map((item) => ({ kind: "backup", source: item.path, target: item.target, versionId: item.versionId })),
    ...preview.removeVersions.map((item) => ({ kind: "version", source: item.path, id: item.id, digest: item.manifestSha256 })),
    ...(preview.observed.qualification ? [{
      kind: "qualification",
      source: join(preview.cacheDirectory, "qualification"),
      digest: preview.observed.qualificationDigest,
    }] : []),
    ...preview.removeOptionalRuns.map((item) => ({ kind: "optional-run", source: item.path, id: item.id, digest: item.digest })),
  ];
  return raw.map((item, index) => ({
    ...item,
    quarantine: join(dirname(item.source), `.workflow-maintenance-quarantine-${transactionId}-${String(index + 1).padStart(3, "0")}`),
    state: "planned",
  }));
};

function applyUnlocked({ cacheDirectory, previewId, onPhase }) {
  const pendingPath = join(cacheDirectory, "maintenance", "pending.json");
  const recovered = recoverMaintenance({ pendingPath, onPhase });
  if (recovered !== null) {
    if (recovered.previewId === previewId) return { ...recovered, reused: true };
    if (recovered.retainedQuarantine) throw new Error(`Maintenance quarantine remains for ${recovered.previewId}; retry that preview before starting another transaction`);
  }
  const priorReceipt = readReceipt(cacheDirectory, previewId);
  if (priorReceipt !== null) return { ...priorReceipt, reused: true };

  const previewPath = join(cacheDirectory, "maintenance", "previews", `${previewId.slice("sha256:".length)}.json`);
  const preview = readJson(previewPath);
  const { previewId: storedPreviewId, ...storedPlan } = preview;
  if (storedPreviewId !== previewId || sha256(JSON.stringify(storedPlan)) !== previewId)
    throw new Error("Maintenance preview content no longer matches its identity");
  const fresh = buildPreview({
    cacheDirectory,
    skillDirectories: preview.skillDirectories,
    journalRoots: preview.journalRoots,
    activeReferenceRoots: preview.activeReferenceRoots,
    optionalRunsRoot: preview.optionalRunsRoot,
  });
  if (fresh.previewId !== previewId) throw new Error(`Maintenance preview drifted: expected ${previewId}, observed ${fresh.previewId}`);

  const catalogPath = join(cacheDirectory, "installation.json");
  const catalogBytes = readFileSync(catalogPath);
  const catalog = parseJson(catalogBytes, catalogPath);
  const removedIds = new Set(preview.removeVersions.map(({ id }) => id));
  const committedCatalog = { ...catalog, versions: catalog.versions.filter(({ id }) => !removedIds.has(id)) };
  const committedBytes = `${JSON.stringify(committedCatalog, null, 2)}\n`;
  const transactionId = randomUUID();
  let pending = writePending(pendingPath, {
    schema: "workflow-installation-maintenance-pending:v1",
    transactionId,
    previewId,
    cacheDirectory,
    skillDirectories: preview.skillDirectories,
    startedAt: new Date().toISOString(),
    phase: "pending",
    originalCatalogSha256: sha256(catalogBytes),
    committedCatalogSha256: sha256(committedBytes),
    items: transactionItems(preview, transactionId),
  });
  onPhase("after_pending_intent", pending);

  for (let index = 0; index < pending.items.length; index += 1) {
    const item = pending.items[index];
    if (pathExists(item.quarantine)) throw new Error(`Maintenance quarantine already exists: ${item.quarantine}`);
    assertItem(item, item.source);
    renameSync(item.source, item.quarantine);
    onPhase(`after_quarantine:${index + 1}`, pending);
    const items = pending.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, state: "quarantined" } : entry);
    pending = writePending(pendingPath, { ...pending, phase: "quarantining", items });
  }

  onPhase("before_catalog_commit", pending);
  const catalogTemporary = join(cacheDirectory, "maintenance", `.catalog-${transactionId}.json`);
  writeFileSync(catalogTemporary, committedBytes, { flag: "wx", mode: 0o600, flush: true });
  renameSync(catalogTemporary, catalogPath);
  onPhase("after_catalog_commit", pending);
  pending = writePending(pendingPath, { ...pending, phase: "catalog_committed" });
  assertCommittedItems(pending, { allowPurged: false });
  const receipt = publishReceipt(pending, committedCatalog, onPhase);
  pending = writePending(pendingPath, { ...pending, phase: "receipt_written" });
  return purgeQuarantine(pending, pendingPath, receipt, onPhase);
}

export function applyInstallationMaintenance({ cacheDirectory, previewId, onPhase = () => {} } = {}) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(previewId ?? "")) throw new TypeError("Maintenance apply requires one preview identity");
  if (typeof onPhase !== "function") throw new TypeError("Maintenance phase observer must be a function");
  cacheDirectory = resolve(cacheDirectory);
  return withWorkflowInstallationLock(cacheDirectory, () => applyUnlocked({ cacheDirectory, previewId, onPhase }));
}
