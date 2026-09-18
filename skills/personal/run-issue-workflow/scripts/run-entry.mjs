// The delivered Run entry.
//
// `/run-issue-workflow <Spec-ID>` is the sole Start and re-entry authority. This module is the one entry
// the coordinator invokes so a Start is deterministic instead of improvised per session: it reduces the
// immediate-upstream handoff, records the one read-back DAG Run Grant — carrying the human's single
// approval of the declared Run operations the planning handoff left unapproved, and no approvals member
// at all when the handoff already approved every one of them — and emits the one round input the delivery
// host is launched with.
//
// The Grant also binds the exact package version its host runs from. This entry selects that version from
// the installation cache that owns it and hands the same cache and version to its own composition, so a
// Run never starts against an installation its own evidence cannot resolve, and its maintenance path
// reads back the package the Run actually started from.
//
// It never dispatches a lane, creates a worker, applies cleanup, acquires a lease, rewrites the journal,
// or mutates the tracker. Its only write is the one Grant the selected Run authorizes.
import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createGitHubWorkflowSources } from "./github-workflow-sources.mjs";
import { createRunAuthorityAdapters, deriveRunOperationIdentity, reduceRunReadyHandoff } from "./delivery-authority.mjs";
import { createRunStore } from "./run-store.mjs";
import { planHostRound } from "./pi-workflow-host.mjs";
import { selectWorkflowVersion } from "./workflow-installation.mjs";
import { runWorkflowCommand } from "./workflow-command.mjs";
import { createHostTaskReader, observedLanesFor } from "../workflows/deliver-tracker-spec/helpers/host-runs.mjs";

export const RUN_ENTRY_SCHEMA = "pi-workflow-run-entry:v1";
export const RUN_ENTRY_STAGE_ID = "delivery";
export const RUN_ENTRY_MAX_PARALLEL = 3;

const git = (repository, ...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();

// An installed package lives at <cache>/versions/<version-id>/skills/personal/run-issue-workflow, the
// same layout installed-entry.mjs reads its own cache from, so the entry resolves the installation it was
// launched from instead of trusting an unset or ambient cache path. Version selection then has the one
// cache directory the Run's Grant and its composition must agree on.
export function installationCacheDirectoryFor(entryUrl = import.meta.url) {
  const packageRoot = resolve(dirname(fileURLToPath(entryUrl)), "../../../..");
  return resolve(packageRoot, "../..");
}

export function resolveCheckout(cwd) {
  const repository = realpathSync(cwd);
  const remote = git(repository, "remote", "get-url", "origin").replace(/\.git$/u, "");
  const match = remote.match(/github\.com[/:]([\w.-]+\/[\w.-]+)$/u);
  if (!match) throw new Error(`Cannot derive the configured repository from ${remote}`);
  const gitCommonDir = realpathSync(resolve(repository, git(repository, "rev-parse", "--git-common-dir")));
  return { repository, repositoryName: match[1], gitCommonDir };
}

// One Start. Returns the round input when the Run reduces to READY, and a diagnosis otherwise; it never
// returns a round for a state the Run authority refuses.
export async function startRun({
  cwd = process.cwd(),
  specId,
  approval = null,
  cacheDirectory = installationCacheDirectoryFor(),
  homeDir = homedir(),
  commandRunner = runWorkflowCommand,
  // The owning-source composition is injectable so a caller can prove which installation this Start
  // bound its sources to; production always composes the GitHub sources.
  createSources = createGitHubWorkflowSources,
} = {}) {
  if (typeof specId !== "string" || specId === "") throw new TypeError("A Run entry needs one Spec id");
  const { repository, repositoryName, gitCommonDir } = resolveCheckout(cwd);
  const store = createRunStore({ gitCommonDir });
  const selection = selectWorkflowVersion({ cacheDirectory });
  const selectedVersion = selection.state === "AVAILABLE" ? selection.version : undefined;
  let taskReader = null;
  const tasks = { read: (taskRef, options) => (taskReader === null ? null : taskReader.read(taskRef, options)) };
  // The composition reads the same trusted cache and package version back for its own maintenance
  // evidence, so selection and delivery can never name two different installations.
  const sources = createSources({
    repository,
    repositoryName,
    store,
    tasks,
    workflowVersion: selectedVersion,
    installationCacheDirectory: cacheDirectory,
    commandRunner,
  });
  const adapters = createRunAuthorityAdapters({ sources: sources.sources, store, tasks });

  const request = { specId };
  const tracker = await sources.sources.tracker.read(request);
  // The Run identity is derived from the selected authority before any read, so lane evidence can be
  // scoped to this Run and never borrow a lane materialized for another Run of the same Spec.
  const runId = deriveRunOperationIdentity({
    repositoryId: `github:${repositoryName}`,
    specId: tracker.spec.node_id,
    approvedPublicationIdentity: tracker.authority.approvedScopeHash,
  }).key;
  taskReader = createHostTaskReader({
    cwd: repository,
    specId: tracker.spec.node_id,
    target: tracker.authority.target,
    stageId: RUN_ENTRY_STAGE_ID,
    runId,
  });

  // Re-entry reuses the exact existing Grant: the human's one approval is already recorded, so the
  // confirming read-back must never append a second one.
  let journal = store.listRunIds().includes(runId) ? store.readEvents(runId) : [];
  let current = await adapters.reconcile({ request: { specId, runIdentity: { ...tracker.authority, runId } }, tracker, journal });
  if (current.runIdentity.runId !== runId) throw new Error("Run identity differs from the selected authority");
  let ready = reduceRunReadyHandoff(await adapters.handoff.read({ request, tracker, current }));
  const result = {
    schema: RUN_ENTRY_SCHEMA,
    specId: tracker.spec.node_id,
    target: tracker.authority.target,
    runId,
    reusedGrant: journal.some(({ type }) => type === "grant.recorded"),
    ready: { state: ready.state, reasonCode: ready.reasonCode, nextOwner: ready.nextOwner },
  };

  if (!result.reusedGrant) {
    // A fresh Run records its one Grant here: what the Run is authorized to do and the exact package its
    // host runs from. The planning handoff's own approvals are already subtracted by the preparation
    // reduction, so a handoff that approved every declared operation is never asked again and its Grant
    // carries no approvals member rather than an empty one.
    const approvalGap = ready.state !== "READY" && ready.reasonCode === "run_preparation_pending";
    const preparation = approvalGap
      ? (await adapters.handoff.read({ request, tracker, current })).preparation
      : null;
    const questions = Array.isArray(preparation?.questions) ? preparation.questions : [];
    if (questions.length > 0) result.questions = questions;
    if (approvalGap && questions.length > 0 && approval === null) {
      return { ...result, outcome: "APPROVAL_REQUIRED" };
    }
    // Only a READY Run, or the human's approval of the questions this entry owns, authorizes the one
    // Grant. Every other non-READY answer — a producer's retry, an ambiguous target, a planning-owned
    // Manual prerequisite — stays that owner's, so nothing is written.
    if (ready.state === "READY" || (approvalGap && questions.length > 0)) {
      if (selection.state !== "AVAILABLE") throw new Error(`Workflow version is ${selection.state}: ${selection.reason}`);
      const writer = store.acquireWriter(runId);
      try {
        writer.append({
          type: "grant.recorded",
          at: new Date().toISOString(),
          runIdentity: current.runIdentity,
          maxParallel: RUN_ENTRY_MAX_PARALLEL,
          workflowVersion: selectedVersion,
          ...(questions.length === 0
            ? {}
            : { approvals: questions.map((question) => ({ ...question, authority: approval })) }),
        });
      } finally {
        writer.release();
      }
      journal = store.readEvents(runId);
      current = await adapters.reconcile({ request: { specId, runIdentity: current.runIdentity }, tracker, journal });
      ready = reduceRunReadyHandoff(await adapters.handoff.read({ request, tracker, current }));
      result.recordedGrant = { approvedActions: questions.map(({ action }) => action) };
      result.ready = { state: ready.state, reasonCode: ready.reasonCode, nextOwner: ready.nextOwner };
    }
  }

  if (ready.state !== "READY") {
    return { ...result, outcome: "NOT_READY", diagnosis: ready };
  }

  const evidence = taskReader.evidence;
  if (evidence.unattributed.length > 0) {
    // A materialized lane this reader cannot attribute to its Issue and attempt is an ambiguity a human
    // resolves; dispatching past it could put two lanes on one Issue.
    return {
      ...result,
      outcome: "LANE_EVIDENCE_UNATTRIBUTED",
      diagnosis: { reasonCode: "lane_evidence_unattributed", evidence: [...evidence.unattributed] },
    };
  }
  const facts = { ...current.facts, journal };
  const plan = planHostRound({ facts });
  const round = {
    facts,
    cwd: repository,
    homeDir,
    gitCommonDir,
    at: new Date().toISOString(),
    stageId: RUN_ENTRY_STAGE_ID,
    lanes: { observed: observedLanesFor(evidence, { runId }), creationIntents: [] },
    blockedHostRun: null,
    recorded: [],
  };
  return {
    ...result,
    outcome: "READY",
    plan: {
      disposition: plan.disposition,
      controlRevision: plan.controlRevision,
      authorizedActions: [...plan.authorizedActions],
      stop: plan.stop ?? null,
    },
    observedLanes: round.lanes.observed.length,
    round,
  };
}

const runCli = async (argv) => {
  const [specId, ...rest] = argv;
  let approval = null;
  let outPath = null;
  let cwd = process.cwd();
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--approve") approval = rest[index + 1] ?? null;
    else if (rest[index] === "--out") outPath = rest[index + 1] ?? null;
    else if (rest[index] === "--cwd") cwd = rest[index + 1] ?? cwd;
  }
  const result = await startRun({ specId, approval, cwd });
  if (outPath !== null && result.outcome === "READY") {
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(result.round)}\n`);
    process.stdout.write(`${JSON.stringify({ ...result, round: undefined, roundPath: resolve(outPath) }, null, 2)}\n`);
    return result;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const result = await runCli(process.argv.slice(2));
    if (result.outcome !== "READY") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
