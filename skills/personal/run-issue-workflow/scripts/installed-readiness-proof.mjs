// Installed readiness proof: the repeatable read that records the verdict for the selected installed
// package version and every required seam's own state.
//
// Readiness itself is owned by `workflow-installation.mjs` and stated in OPERATOR.md: an installation
// receipt is complete only when it re-reads the selected package manifest, binds its source commit and
// manifest SHA-256, proves every managed entry the current environment resolves points at that exact
// package directory, and invokes the one kept package-owned capability probe
// (`--qualification-identity`) through that selected `installed-entry.mjs`. This module adds no readiness
// prerequisite and reproduces none of those owners' logic: it calls the same owner and reports the four
// required seams that owner's own evidence proves — the selected package version, its manifest
// integrity, the environment-resolved managed entries and the proven capability — with the owning source
// of each, then reduces exactly one verdict from those states [ADR-0078, ADR-0079].
//
// Every run re-reads the trusted installation and nothing is remembered between runs, so an unchanged
// installation returns the same report byte for byte. A seam reads `PRESENT` only when the owner's own
// read proved it, `MISSING` only when the owner proved it does not hold, and `UNKNOWN` when the stopped
// read proved nothing either way; a read that stopped returns `NOT_READY` with exactly one blocker naming
// the owning source and the smallest human action there. The proof is a read: it writes no retained
// sample, never invokes the retired live qualification, and grants no install, close, integration,
// verification, push, deployment or aggregate authority. The recorded runs for the version this
// environment resolves are in `docs/agents/installed-readiness-evidence.md`.

import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readWorkflowInstallationEvidence,
  selectWorkflowVersion,
} from "./workflow-installation.mjs";

export const INSTALLED_READINESS_PROOF_SCHEMA = "installed-readiness-proof:v1";
// The required seams, in the order the owner's own read proves them, and each one's owning source.
export const INSTALLED_READINESS_SEAMS = Object.freeze([
  "selected-package-version",
  "package-manifest-integrity",
  "environment-resolved-managed-entries",
  "installed-capability-probe",
]);
export const INSTALLED_READINESS_SEAM_STATES = Object.freeze([
  "PRESENT",
  "MISSING",
  "UNKNOWN",
]);
export const INSTALLED_READINESS_VERDICTS = Object.freeze(["READY", "NOT_READY"]);
// The proof's own blocker codes. The capability probe's blocker carries the owning source's own code and
// owner, which travel through unchanged instead of being renamed here.
export const INSTALLED_READINESS_BLOCKER_CODES = Object.freeze({
  version: "installed_package_version_unproven",
  entries: "installed_managed_entries_unproven",
  receipt: "installed_readiness_receipt_incomplete",
  capability: "installed_workflow_capability_unproven",
});

const INSTALLATION_OWNER =
  "skills/personal/run-issue-workflow/scripts/workflow-installation.mjs";
const manifestIdentityPattern = /^sha256:[a-f0-9]{64}$/u;
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;

// The environment's public entry set, derived exactly as the installation owner derives it from the
// trusted cache location. The owner re-derives the same set itself and rejects a subset, a superset and
// any entry whose link target or real path resolves elsewhere, so this only declares which environment
// this read covers; the boundary verdict stays the owner's own.
const managedEntryPaths = (cacheDirectory) => {
  const codexHome = dirname(resolve(cacheDirectory));
  return [
    join(codexHome, "skills", "run-issue-workflow"),
    join(dirname(codexHome), ".agents", "skills", "run-issue-workflow"),
  ];
};

const seamRow = ({ seam, owner, state, observed }) => {
  // One report vocabulary: a seam row can only name a required seam, a known state and its owner.
  if (!INSTALLED_READINESS_SEAMS.includes(seam))
    throw new TypeError(`Unsupported installed readiness seam ${seam}`);
  if (!INSTALLED_READINESS_SEAM_STATES.includes(state))
    throw new TypeError(`Unsupported installed readiness seam state ${state}`);
  if (!isText(owner))
    throw new TypeError(
      "Installed readiness seam row needs the source that owns it",
    );
  return Object.freeze({ seam, owner, state, observed: Object.freeze(observed) });
};

const blockerFor = ({ code, seam, state, owner, reason, action }) =>
  Object.freeze({
    code,
    seam,
    state,
    owner,
    reason: isText(reason) ? reason : String(reason),
    action,
  });

const reportFor = ({
  cacheDirectory,
  expectedSourceCommit,
  seams,
  evidence,
  blocker,
}) => {
  const verdict = seams.every(({ state }) => state === "PRESENT")
    ? "READY"
    : "NOT_READY";
  if (!INSTALLED_READINESS_VERDICTS.includes(verdict))
    throw new TypeError(`Unsupported installed readiness verdict ${verdict}`);
  // One verdict, one receipt and no blocker, or a stopped read with one attributable blocker: a report
  // that claimed either half without the other could not be trusted as evidence.
  if (
    (verdict === "READY") !== (blocker === null) ||
    (verdict === "READY") !== (evidence !== null)
  )
    throw new TypeError(
      "Installed readiness proof requires one verdict with its receipt and no blocker, or a stopped read with one blocker",
    );
  if (
    blocker !== null &&
    !seams.some(
      ({ seam, state }) => seam === blocker.seam && state !== "PRESENT",
    )
  )
    throw new TypeError(
      "Installed readiness proof blocker must name a seam that did not read PRESENT",
    );
  return Object.freeze({
    schema: INSTALLED_READINESS_PROOF_SCHEMA,
    cacheDirectory,
    expectedSourceCommit,
    seams: Object.freeze(seams),
    verdict,
    evidence,
    blocker,
  });
};

// The smallest human action at the installation owner: its own documented install surface
// (OPERATOR.md), followed by the re-read that produced this report.
const installAction = (expectedSourceCommit) =>
  `Install the reviewed package version for ${expectedSourceCommit} with the installation owner's own ` +
  `command (scripts/install-workflow.mjs <trusted-source-repository> <exact-commit> <cache-directory> ` +
  `<public-skill-directory>), then re-read the installed evidence.`;

// The installed entry the owner invokes its capability probe through, read back from the receipt's own
// entry target rather than re-derived from the installation layout.
const probePathOf = (evidence) => {
  const targets = new Set(
    (Array.isArray(evidence?.entries) ? evidence.entries : []).map(
      (entry) => entry?.target,
    ),
  );
  return targets.size === 1
    ? join([...targets][0], "scripts", "installed-entry.mjs")
    : null;
};

// The capability seam's owning source. A path is suffixed with the flag it is invoked with; the stop's
// own owner string already carries the flag, so it is kept verbatim and never suffixed again.
const probeOwner = (entryPath) =>
  entryPath === null
    ? "installed-entry.mjs --qualification-identity (not invoked; the read stopped before the probe)"
    : `${entryPath} --qualification-identity`;

// Read the installed version's own readiness evidence and reduce one report: every required seam's state
// with its owning source, the owner's receipt when it returned one, and exactly one verdict.
export function readInstalledReadinessProof({
  cacheDirectory,
  expectedSourceCommit,
  readEvidence = readWorkflowInstallationEvidence,
  selectVersion = selectWorkflowVersion,
} = {}) {
  if (!isText(cacheDirectory))
    throw new TypeError(
      "Installed readiness proof needs the trusted installation cache directory",
    );
  if (!isText(expectedSourceCommit))
    throw new TypeError(
      "Installed readiness proof needs the reviewed source commit it binds the selected version to",
    );
  const resolvedCache = resolve(cacheDirectory);
  const entryPaths = managedEntryPaths(resolvedCache);
  // The owner's own selection surface: it returns the version and manifest it verified, or the reason and
  // recovery it owns. The composed read below re-derives both with identical inputs.
  const selected = selectVersion({ cacheDirectory: resolvedCache });
  const selectedVersion = isRecord(selected?.version) ? selected.version : null;
  const selectedRoot = isText(selected?.root) ? selected.root : null;
  const selectedManifest = isText(selected?.manifestSha256)
    ? selected.manifestSha256
    : null;
  const versionBound =
    selected?.state === "AVAILABLE" &&
    selectedVersion !== null &&
    selectedVersion.sourceCommit === expectedSourceCommit;
  let evidence = null;
  let stop = null;
  try {
    evidence = readEvidence({
      cacheDirectory: resolvedCache,
      skillDirectories: entryPaths,
      expectedSourceCommit,
    });
  } catch (error) {
    stop = error;
  }
  // The owner's capability blocker is the one stop that names its own owning source and smallest human
  // action, so it is recognized by that attribution rather than by matching its prose.
  const capabilityStop = isText(stop?.owner) && isText(stop?.action);
  const probeEntryPath = probePathOf(evidence);
  const versionProven =
    versionBound &&
    (evidence === null ||
      (evidence.candidate === expectedSourceCommit &&
        evidence.packageVersion?.id === selectedVersion?.id));
  const manifestProven =
    selectedManifest !== null &&
    (evidence === null || evidence.manifestSha256 === selectedManifest);
  const entriesProven =
    evidence !== null && Array.isArray(evidence.entries) &&
    evidence.entries.length === entryPaths.length;
  const capabilityProven =
    evidence !== null && isRecord(evidence.capability);

  const seams = [
    seamRow({
      seam: INSTALLED_READINESS_SEAMS[0],
      owner: `${INSTALLATION_OWNER}#selectWorkflowVersion`,
      state: versionProven
        ? "PRESENT"
        : selected?.state === "AVAILABLE"
          ? "MISSING"
          : "UNKNOWN",
      observed: {
        version: selectedVersion,
        packageRoot: selectedRoot,
        expectedSourceCommit,
        packageVersionId: evidence?.packageVersion?.id ?? null,
      },
    }),
    seamRow({
      seam: INSTALLED_READINESS_SEAMS[1],
      owner: `${INSTALLATION_OWNER}#verifyPackage`,
      state: manifestProven ? "PRESENT" : "UNKNOWN",
      observed: {
        manifestSha256: selectedManifest ?? evidence?.manifestSha256 ?? null,
        packageVersionId: selectedVersion?.id ?? null,
      },
    }),
    seamRow({
      seam: INSTALLED_READINESS_SEAMS[2],
      owner: `${INSTALLATION_OWNER}#readWorkflowInstallationEvidence`,
      // Only the returned receipt proves the entry read-back; a stop that is not the capability probe's
      // own blocker, after a bound version, is the owner's remaining post-selection stop: the entry
      // read-back it could not prove.
      state: entriesProven
        ? "PRESENT"
        : capabilityStop || !versionBound
          ? "UNKNOWN"
          : "MISSING",
      observed: {
        expectedPaths: entryPaths,
        entries: evidence?.entries ?? null,
      },
    }),
    seamRow({
      seam: INSTALLED_READINESS_SEAMS[3],
      owner:
        probeEntryPath !== null
          ? probeOwner(probeEntryPath)
          : capabilityStop
            ? stop.owner
            : probeOwner(null),
      state: capabilityProven
        ? "PRESENT"
        : capabilityStop && stop.state === "UNPROVEN"
          ? "MISSING"
          : "UNKNOWN",
      observed: {
        entryPath: probeEntryPath,
        capability: evidence?.capability ?? null,
      },
    }),
  ];

  const blocker = (() => {
    if (evidence !== null) {
      const unproven = seams.find(({ state }) => state !== "PRESENT");
      if (unproven === undefined) return null;
      return blockerFor({
        code: INSTALLED_READINESS_BLOCKER_CODES.receipt,
        seam: unproven.seam,
        state: unproven.state,
        owner: INSTALLATION_OWNER,
        reason: `The installation owner's own receipt did not report the ${unproven.seam} seam`,
        action: installAction(expectedSourceCommit),
      });
    }
    if (capabilityStop)
      return blockerFor({
        code: stop.code ?? INSTALLED_READINESS_BLOCKER_CODES.capability,
        seam: INSTALLED_READINESS_SEAMS[3],
        state: seams[3].state,
        owner: stop.owner,
        reason: isText(stop.reason) ? stop.reason : stop.message,
        action: stop.action,
      });
    if (selected?.state !== "AVAILABLE")
      return blockerFor({
        code: INSTALLED_READINESS_BLOCKER_CODES.version,
        seam: INSTALLED_READINESS_SEAMS[0],
        state: seams[0].state,
        owner: INSTALLATION_OWNER,
        reason: isText(selected?.reason)
          ? selected.reason
          : "The trusted installation yielded no version to read readiness from",
        action: isText(selected?.recovery)
          ? selected.recovery
          : installAction(expectedSourceCommit),
      });
    if (!versionBound)
      return blockerFor({
        code: INSTALLED_READINESS_BLOCKER_CODES.version,
        seam: INSTALLED_READINESS_SEAMS[0],
        state: seams[0].state,
        owner: INSTALLATION_OWNER,
        reason: isText(stop?.message)
          ? stop.message
          : `The installed package version ${selectedVersion?.sourceCommit} is not the reviewed source commit ${expectedSourceCommit}`,
        action: installAction(expectedSourceCommit),
      });
    return blockerFor({
      code: INSTALLED_READINESS_BLOCKER_CODES.entries,
      seam: INSTALLED_READINESS_SEAMS[2],
      state: seams[2].state,
      owner: INSTALLATION_OWNER,
      reason: isText(stop?.message)
        ? stop.message
        : "The managed entry read-back did not resolve the complete entry set",
      action: installAction(expectedSourceCommit),
    });
  })();

  return reportFor({
    cacheDirectory: resolvedCache,
    expectedSourceCommit,
    seams,
    evidence,
    blocker,
  });
}

const usage =
  "Usage: installed-readiness-proof.mjs --cache-directory <trusted-installation-cache> --expected-source-commit <reviewed-source-commit> [--json]";

const parseArguments = (argv) => {
  const options = {
    cacheDirectory: null,
    expectedSourceCommit: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (
      argument === "--cache-directory" ||
      argument === "--expected-source-commit"
    ) {
      const value = argv[index + 1];
      if (!isText(value) || value.startsWith("--")) throw new Error(usage);
      options[argument === "--cache-directory" ? "cacheDirectory" : "expectedSourceCommit"] =
        value;
      index += 1;
      continue;
    }
    throw new Error(usage);
  }
  if (options.cacheDirectory === null || options.expectedSourceCommit === null)
    throw new Error(usage);
  return options;
};

const renderReport = (report) =>
  [
    `installed readiness proof (${report.schema})`,
    `cache directory: ${report.cacheDirectory}`,
    `expected source commit: ${report.expectedSourceCommit}`,
    ...report.seams.map(
      ({ seam, state, owner }) => `seam ${seam}: ${state} (owner ${owner})`,
    ),
    `verdict: ${report.verdict}`,
  ].join("\n");

const renderBlocker = (blocker) =>
  `blocker ${blocker.code} at ${blocker.seam} (owner ${blocker.owner}): ${blocker.reason} ` +
  `Smallest human action: ${blocker.action}`;

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let options = null;
  try {
    options = parseArguments(process.argv.slice(2));
    const report = readInstalledReadinessProof(options);
    process.stdout.write(
      `${options.json ? JSON.stringify(report, null, 2) : renderReport(report)}\n`,
    );
    if (report.verdict !== "READY") {
      process.stderr.write(`${renderBlocker(report.blocker)}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    // A usage error is not a readiness verdict; it is the one invocation the proof could not read.
    process.exitCode = error.message === usage ? 2 : 1;
  }
}
