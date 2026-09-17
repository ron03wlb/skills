// The delivered Run entry.
//
// `/run-issue-workflow <Spec-ID>` is the sole Start and re-entry authority. This module is the one entry
// the coordinator invokes so a Start is deterministic instead of improvised per session: it reduces the
// immediate-upstream handoff, records exactly one read-back DAG Run Grant — carrying the human's single
// approval of the declared Run operations the planning handoff left unapproved — and emits the one round
// input the delivery host is launched with.
//
// It never dispatches a lane, creates a worker, applies cleanup, acquires a lease, rewrites the journal,
// or mutates the tracker. Its only write is the one Grant the selected Run authorizes.
import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createGitHubWorkflowSources } from "./github-workflow-sources.mjs";
import { createRunAuthorityAdapters, reduceRunReadyHandoff } from "./delivery-authority.mjs";
import { createRunStore } from "./run-store.mjs";
import { planHostRound } from "./pi-workflow-host.mjs";
import { selectWorkflowVersion } from "./workflow-installation.mjs";
import { createHostTaskReader, observedLanesFor } from "../workflows/deliver-tracker-spec/helpers/host-runs.mjs";

export const RUN_ENTRY_SCHEMA = "pi-workflow-run-entry:v1";
export const RUN_ENTRY_STAGE_ID = "delivery";
export const RUN_ENTRY_MAX_PARALLEL = 3;

const git = (repository, ...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();

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
export async function startRun({ cwd = process.cwd(), specId, approval = null, cacheDirectory, homeDir = homedir() } = {}) {
  if (typeof specId !== "string" || specId === "") throw new TypeError("A Run entry needs one Spec id");
  const { repository, repositoryName, gitCommonDir } = resolveCheckout(cwd);
  const store = createRunStore({ gitCommonDir });
  let taskReader = null;
  const tasks = { read: (taskRef, options) => (taskReader === null ? null : taskReader.read(taskRef, options)) };
  const sources = createGitHubWorkflowSources({ repository, repositoryName, store, tasks });
  const adapters = createRunAuthorityAdapters({ sources: sources.sources, store, tasks });

  const request = { specId };
  const tracker = await sources.sources.tracker.read(request);
  taskReader = createHostTaskReader({
    cwd: repository,
    specId: tracker.spec.node_id,
    target: tracker.authority.target,
    stageId: RUN_ENTRY_STAGE_ID,
  });

  // Re-entry reuses the exact existing Grant: the human's one approval is already recorded, so the
  // confirming read-back must never append a second one.
  const runId = (await adapters.reconcile({ request, tracker, journal: [] })).runIdentity.runId;
  let journal = store.listRunIds().includes(runId) ? store.readEvents(runId) : [];
  let current = await adapters.reconcile({ request: { specId, runIdentity: { ...tracker.authority, runId } }, tracker, journal });
  let ready = reduceRunReadyHandoff(await adapters.handoff.read({ request, tracker, current }));
  const result = {
    schema: RUN_ENTRY_SCHEMA,
    specId: tracker.spec.node_id,
    target: tracker.authority.target,
    runId,
    reusedGrant: journal.some(({ type }) => type === "grant.recorded"),
    ready: { state: ready.state, reasonCode: ready.reasonCode, nextOwner: ready.nextOwner },
  };

  if (ready.state !== "READY" && ready.reasonCode === "run_preparation_pending" && !result.reusedGrant) {
    const preparation = (await adapters.handoff.read({ request, tracker, current })).preparation;
    result.questions = preparation.questions;
    if (approval === null) {
      return { ...result, outcome: "APPROVAL_REQUIRED" };
    }
    const version = selectWorkflowVersion({ cacheDirectory });
    if (version.state !== "AVAILABLE") throw new Error(`Workflow version is ${version.state}: ${version.reason}`);
    const writer = store.acquireWriter(runId);
    try {
      writer.append({
        type: "grant.recorded",
        at: new Date().toISOString(),
        runIdentity: current.runIdentity,
        maxParallel: RUN_ENTRY_MAX_PARALLEL,
        workflowVersion: version.version,
        approvals: preparation.questions.map((question) => ({ ...question, authority: approval })),
      });
    } finally {
      writer.release();
    }
    journal = store.readEvents(runId);
    current = await adapters.reconcile({ request: { specId, runIdentity: current.runIdentity }, tracker, journal });
    ready = reduceRunReadyHandoff(await adapters.handoff.read({ request, tracker, current }));
    result.recordedGrant = { approvedActions: preparation.questions.map(({ action }) => action) };
    result.ready = { state: ready.state, reasonCode: ready.reasonCode, nextOwner: ready.nextOwner };
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
