// Direct local entry for a complete replacement scope.  It never reads or edits a tracker Spec.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createRunStore } from "./run-store.mjs";
import {
  createSpecRevisionLedger,
  deriveBaseScopeIdentity,
  validateRevisionRequest,
} from "./delivery-authority.mjs";

export const REVISE_RUN_RECEIPT_SCHEMA = "revise-run-receipt:v1";
const isText = (value) => typeof value === "string" && value.length > 0;
const requireText = (value, label) => {
  if (!isText(value)) throw new TypeError(`${label} is required`);
  return value;
};
const parseJson = (path) => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { throw new Error(`Revision manifest ${path} is unreadable: ${error.message}`); }
};
const commonDirFor = (cwd) => resolve(cwd, execFileSync("git", ["-C", cwd, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim());

const latestDispatchByIssue = (events) => {
  const result = new Map();
  for (const event of events) if (event.type === "dispatch.recorded" && isText(event.issueId) && isText(event.taskRef?.threadId)) {
    const prior = result.get(event.issueId);
    if (prior === undefined || event.attempt >= prior.attempt) result.set(event.issueId, event);
  }
  return result;
};

// The manifest provides the entire immutable child contract snapshot.  The predecessor journal provides
// only its existing Grant, which binds the revision's parent target and gives the first local head its
// base identity.  This makes revision authority independent of a later mutable tracker-body read.
export function reviseRun({ gitCommonDir, predecessorRunId, manifest, createdAt = new Date().toISOString(), activationAt = createdAt } = {}) {
  requireText(gitCommonDir, "gitCommonDir");
  requireText(predecessorRunId, "predecessorRunId");
  const request = validateRevisionRequest(manifest);
  if (request.predecessorRunId !== predecessorRunId) throw new Error("Revision manifest predecessorRunId differs from the selected predecessor Run");
  const store = createRunStore({ gitCommonDir });
  const events = store.readEvents(predecessorRunId);
  const grant = events.findLast((event) => event.type === "grant.recorded");
  if (!grant) throw new Error("Predecessor Run has no readable Grant");
  const runIdentity = grant.runIdentity;
  if (runIdentity.runId !== predecessorRunId || runIdentity.specId !== request.specId || runIdentity.target !== request.target) {
    throw new Error("Revision manifest differs from the immutable predecessor Run Grant");
  }
  const parent = request.scopeSnapshot.parent;
  if (parent.specId !== runIdentity.specId || parent.target !== runIdentity.target
    || parent.approvedScopeHash !== runIdentity.approvedScopeHash
    || parent.decompositionIdentity !== runIdentity.decompositionIdentity
    || parent.classification !== runIdentity.classification) {
    throw new Error("Revision scope parent differs from the predecessor Run Grant");
  }
  const ledger = createSpecRevisionLedger({ gitCommonDir });
  const activation = ledger.activate({ request, baseRevisionIdentity: deriveBaseScopeIdentity(runIdentity), createdAt, activationAt });
  // The predecessor's append-only journal receives the binding that tells its reducer which nodes it
  // must stop dispatching. The local ledger remains authoritative if this append cannot be made; no
  // successor can be materialized until this record is present and every active lane has acknowledged.
  let journalEvent = events.find((event) => event.type === "revision.activated" && event.revisionIdentity === activation.revision.revisionIdentity);
  if (!journalEvent) {
    const writer = store.acquireWriter(predecessorRunId);
    try {
      journalEvent = writer.append({ type: "revision.activated", at: activationAt,
        revisionIdentity: activation.revision.revisionIdentity,
        impactClosureIssueIds: activation.revision.impactClosureIssueIds });
    } finally { writer.release(); }
  }
  const dispatches = latestDispatchByIssue(events);
  const pauseRequiredLanes = activation.revision.impactClosureIssueIds.flatMap((issueId) => {
    const dispatch = dispatches.get(issueId);
    return dispatch === undefined ? [] : [{ issueId, laneRef: dispatch.taskRef.threadId, attempt: dispatch.attempt }];
  });
  const unaffectedIssueIds = request.scopeSnapshot.children.map(({ issueId }) => issueId)
    .filter((issueId) => !activation.revision.impactClosureIssueIds.includes(issueId));
  return Object.freeze({
    schema: REVISE_RUN_RECEIPT_SCHEMA,
    revisionIdentity: activation.revision.revisionIdentity,
    activationIdentity: activation.activation.activationIdentity,
    predecessorRunId,
    activatedJournalSequence: journalEvent.sequence,
    affectedIssueIds: Object.freeze([...activation.revision.impactClosureIssueIds]),
    unaffectedIssueIds: Object.freeze(unaffectedIssueIds),
    pauseRequiredLanes: Object.freeze(pauseRequiredLanes),
    successorConditions: Object.freeze([
      "every affected queued node has revision.scope_detached",
      "every affected active lane has revision.lane_paused with its exact generation and retained evidence",
      "the local revision activation remains the current ledger head",
      "the predecessor Grant and authority journal remain readable",
    ]),
    reused: activation.reused,
  });
}

const flags = (argv) => {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) throw new Error(`Unknown positional argument ${argv[index]}`);
    values[argv[index].slice(2)] = argv[++index] ?? true;
  }
  return values;
};
export function runReviseRunCli(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  const values = flags(argv);
  const manifestPath = requireText(values.manifest, "--manifest");
  const predecessorRunId = requireText(values.run, "--run");
  const root = values.cwd ?? cwd;
  const result = reviseRun({ gitCommonDir: commonDirFor(root), predecessorRunId,
    manifest: parseJson(resolve(root, manifestPath)), createdAt: values.at ?? new Date().toISOString(), activationAt: values["activation-at"] ?? values.at ?? new Date().toISOString() });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runReviseRunCli(); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
