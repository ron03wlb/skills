// The delivered Run entry.
//
// `/run-issue-workflow <Spec-ID>` is the sole Start and re-entry authority. This module is the one entry
// the coordinator invokes so a Start is deterministic instead of improvised per session: it reduces the
// immediate-upstream handoff, records the one read-back DAG Run Grant — carrying the human's single
// approval of the declared Run operations the planning handoff left unapproved, and no approvals member
// at all when the handoff already approved every one of them — and composes the round its execution
// material consumes.
//
// The composition is the native one (AC-1). The entry emits the round read `native-round-loop.mjs`
// consumes, plans its first round through that loop's own planner, and hands back the ports the loop
// needs. Authorized actions are materialized through `native-lane-runner.mjs` (the loop's planner calls
// it), lanes are observed through `native-lane-evidence.mjs` from the native subagent run record, the
// tracker completion note and Git, and the producer's `ready_state.read_back` projection is carried only
// as the one-shot projection the loop records as superseded — the release frontier is re-derived from
// the published blocker edges and the three conditions on every round. Nothing on this path reads a
// pi-workflow host run or imports the bundle: the `pi-workflow` materialization stays in the repository
// as one optional materialization of the same facts, and the default path requires nothing from it.
//
// The Grant also binds the exact package version its host runs from. This entry selects that version from
// the installation cache that owns it and hands the same cache and version to its own composition, so a
// Run never starts against an installation its own evidence cannot resolve, and its maintenance path
// reads back the package the Run actually started from.
//
// It never dispatches a lane, creates a worker, applies cleanup, acquires the target writer, rewrites the
// journal, or mutates the tracker. Its only write is the one Grant the selected Run authorizes; the loop
// writes the dispatch reservations and close-lane intents it owns through the append port below.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createGitHubWorkflowSources } from "./github-workflow-sources.mjs";
import { createGitLabWorkflowSources } from "./gitlab-workflow-sources.mjs";
import {
  configurationMatchesOrigin,
  validateConfiguration,
} from "./gitlab-producer-transport.mjs";
import { createRunAuthorityAdapters, deriveRunOperationIdentity, reduceRunReadyHandoff } from "./delivery-authority.mjs";
import { LANE_TOOL_CEILING } from "./issue-lane.mjs";
import { SUBAGENT_RUN_STATES, readNativeLaneEvidence, readSubagentRunRecord } from "./native-lane-evidence.mjs";
import { createNativeLaneGit } from "./native-lane-runner.mjs";
import { planNativeRound } from "./native-round-loop.mjs";
import { hostActionIdentity } from "./pi-workflow-host.mjs";
import { createRunStore } from "./run-store.mjs";
import { selectWorkflowVersion } from "./workflow-installation.mjs";
import { runWorkflowCommand } from "./workflow-command.mjs";

export const RUN_ENTRY_SCHEMA = "pi-workflow-run-entry:v1";
export const RUN_ENTRY_MAX_PARALLEL = 3;
export const NATIVE_ROUND_READ_SCHEMA = "native-round-read:v1";
export const NATIVE_RUN_COMPOSITION_SCHEMA = "native-run-composition:v1";
export const COMPLETION_NOTE_KIND = "implementation_complete";
export const TRACKER_SELECTION_SCHEMA = "tracker-run-selection:v1";
export const GITLAB_BINDING_PATH = "docs/agents/gitlab-producer.json";
// The exact repair a GitLab origin without a binding receives. It is the producer owner's configure
// action, presented inside setup's one approved plan — never a hand-written binding, and never a silent
// fall back to the GitHub composition.
export const MISSING_GITLAB_BINDING_REPAIR =
  `${GITLAB_BINDING_PATH} is missing for the GitLab origin. Run the installed gitlab-producer-entry.mjs configure <repository> — the GitLab producer owner, which /setup-matt-pocock-skills presents inside its one approved plan — then retry. The Run never falls back to a GitHub composition.`;
// The one convention this composition reads a lane's native identity with: the runner pins the launch
// envelope to the task reference the journal recorded for the lane, so that recorded lane reference *is*
// the lane's native subagent run identity. The port is injectable, so a harness whose native run ids are
// chosen elsewhere supplies its own reader instead of being guessed at.
export const NATIVE_LANE_RUN_IDENTITY_RULE = "a recorded lane's native run identity is the lane reference the journal recorded for it";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const requireText = (value, label) => {
  if (!isText(value)) throw new TypeError(`${label} is required`);
  return value;
};
const requireFunction = (value, label) => {
  if (typeof value !== "function") throw new TypeError(`${label} must be a port`);
  return value;
};

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

const trackerSelectionConflict = (message) => Object.assign(new Error(message), { code: "WORKFLOW_TRACKER_SELECTION" });
const gitHubOrigin = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+)$/u;

// AC-1: one exact, fail-closed composition selection from the repository's own configured tracker
// evidence. A present, origin-matching GitLab binding selects the GitLab composition; a GitLab origin
// without that binding stops with the exact missing-binding repair instead of falling back to GitHub; a
// binding that does not match the origin, or contradictory evidence, stops with the observed values. The
// GitHub selection is the unchanged `resolveCheckout` answer for a github.com origin with no GitLab
// binding, so no existing GitHub Run changes behavior.
export function resolveTrackerSelection({ cwd = process.cwd() } = {}) {
  const repository = realpathSync(cwd);
  const origin = git(repository, "remote", "get-url", "origin").replace(/\.git$/u, "");
  const gitCommonDir = realpathSync(resolve(repository, git(repository, "rev-parse", "--git-common-dir")));
  const bindingPath = join(repository, GITLAB_BINDING_PATH);
  let binding = null;
  if (existsSync(bindingPath)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(bindingPath, "utf8"));
      binding = validateConfiguration(parsed);
    } catch (error) {
      throw trackerSelectionConflict(`Tracker evidence is unreadable: ${bindingPath} is not a valid GitLab producer binding (${error.message}). Repair that binding through its owning producer entry instead of falling back to another composition.`);
    }
  }
  const gitHub = origin.match(gitHubOrigin);
  if (gitHub !== null) {
    if (binding !== null) {
      throw trackerSelectionConflict(`Contradictory tracker evidence: the origin ${origin} is a GitHub repository while ${GITLAB_BINDING_PATH} binds the GitLab project ${binding.baseUrl}/${binding.project}. Remove the binding or point the origin at it; no composition is selected.`);
    }
    return Object.freeze({ schema: TRACKER_SELECTION_SCHEMA, repository, gitCommonDir, origin, bindingPath, tracker: "github",
      repositoryName: gitHub[1], configuration: null });
  }
  if (binding === null) {
    throw trackerSelectionConflict(`Tracker evidence is incomplete: the origin ${origin} is not a GitHub repository and ${MISSING_GITLAB_BINDING_REPAIR}`);
  }
  if (!configurationMatchesOrigin({ configuration: binding, origin })) {
    throw trackerSelectionConflict(`Contradictory tracker evidence: the origin ${origin} does not match the configured GitLab project ${binding.baseUrl}/${binding.project} in ${GITLAB_BINDING_PATH}. Rebind the project through its owning producer entry; no composition is selected.`);
  }
  return Object.freeze({ schema: TRACKER_SELECTION_SCHEMA, repository, gitCommonDir, origin, bindingPath, tracker: "gitlab",
    repositoryName: null, configuration: binding });
}

// The selected composition's owner. A Run binds exactly one of them, and the selection above is the
// only thing that chooses: a GitLab binding never reaches the GitHub composition and vice versa.
export const trackerSourceFactory = (tracker) => (tracker === "gitlab" ? createGitLabWorkflowSources : createGitHubWorkflowSources);

// ---------------------------------------------------------------------------------------------
// AC-1 — the composed native read, plan and journal ports
// ---------------------------------------------------------------------------------------------

// One recorded lane per dispatch reservation. `native-lane-runner.mjs` journals the reservation before
// the launch envelope exists, and both name the lane by the same task reference, so the composition
// reads exactly one native run record per lane and never enumerates a directory or a home tree.
export function recordedLanesFromJournal({ journal } = {}) {
  if (!Array.isArray(journal)) throw new TypeError("Recorded lanes need the authority journal");
  const lanes = [];
  for (const event of journal) {
    if (event?.type !== "dispatch.recorded") continue;
    const laneRef = event.taskRef?.threadId;
    if (!isText(event.issueId) || !isText(laneRef)) continue;
    if (!Number.isInteger(event.attempt) || event.attempt < 1) continue;
    lanes.push(Object.freeze({
      laneRef,
      issueId: event.issueId,
      attempt: event.attempt,
      runId: laneRef,
      worktree: null,
      topic: null,
    }));
  }
  return Object.freeze(lanes);
}

// The native subagent run-record reader. It resolves the one documented pointer for the lane it is given
// (`<agent root>/subagent-runs/<runId>.json`) and nothing else: a lane this reader cannot read reports its
// own path, and no source is searched for.
export function createNativeRunReader({ homeDir = homedir(), runsRoot = null, readRecord = readSubagentRunRecord } = {}) {
  requireFunction(readRecord, "Native run record reader");
  return ({ runId }) => readRecord({
    runId: requireText(runId, "Native lane run identity"),
    ...(runsRoot === null ? { homeDir } : { runsRoot }),
  });
}

// Native lane liveness -> the task state the reconciliation reads. Only the lane's own run record is
// evidence: a lane that was never materialized reads as no task, so the reducer re-issues the recorded
// attempt instead of treating a lost launch as a live lane; a lane that finished its work leaves the
// recorded request readable; and an unreadable or unrecognised record reads UNKNOWN, which the
// reconciliation refuses rather than retrying blindly.
const TASK_STATE_BY_LANE_STATE = Object.freeze({
  ACTIVE: "RUNNING",
  RESUMABLE: "RESUMABLE",
  INACTIVE: "RESUMABLE",
});

export function laneTaskStateFor({ taskRef, journal, readRecordedLanes, readSubagentRun } = {}) {
  const laneRef = taskRef?.threadId;
  if (!isText(laneRef)) return null;
  const lane = readRecordedLanes({ journal }).find((candidate) => candidate.laneRef === laneRef);
  if (lane === undefined) return null;
  const run = readSubagentRun({ runId: lane.runId, laneRef: lane.laneRef, issueId: lane.issueId, attempt: lane.attempt });
  if (!isRecord(run) || !SUBAGENT_RUN_STATES.includes(run.state)) {
    return Object.freeze({ state: "UNKNOWN", laneRef, evidence: [`The native run record for lane ${laneRef} is not one readable native run read.`] });
  }
  if (run.state === "ABSENT") return null;
  if (run.state !== "PRESENT") {
    return Object.freeze({ state: "UNKNOWN", laneRef, nativeRunId: run.runId ?? null, evidence: [...(run.evidence ?? [])] });
  }
  const state = TASK_STATE_BY_LANE_STATE[run.laneState];
  if (state === undefined) {
    return Object.freeze({ state: "UNKNOWN", laneRef, nativeRunId: run.runId ?? null, status: run.status ?? null, evidence: [...(run.evidence ?? [])] });
  }
  return Object.freeze({
    state,
    laneRef,
    nativeRunId: run.runId ?? null,
    status: run.status ?? null,
    settled: run.settled === true,
    terminal: run.terminal === true,
    evidence: [`Lane ${laneRef} native run ${run.runId ?? laneRef} records status ${run.status ?? "unknown"}, so its task state reads ${state}.`],
  });
}

// The lane-task adapter `createGitHubWorkflowSources` and the reconciliation read. It is the same
// closed-over lane list the round read uses, so the reducer's node facts and the lane planner's evidence
// can never disagree about one lane.
export function createNativeLaneTaskReader({ readJournal, readRecordedLanes, readSubagentRun } = {}) {
  requireFunction(readJournal, "Lane task reader journal port");
  requireFunction(readRecordedLanes, "Lane task reader recorded-lane port");
  requireFunction(readSubagentRun, "Lane task reader native run port");
  return Object.freeze({
    read: (taskRef) => laneTaskStateFor({
      taskRef,
      journal: readJournal(),
      readRecordedLanes,
      readSubagentRun,
    }),
  });
}

// The close lane's own liveness. A close lane consumes no dispatch reservation, so the only durable facts
// about it are the invocation the loop recorded before the lane existed and the lane's own deterministic
// identity. `request.actionType` is the close action being asked about — `close_issue` for a child and
// `close_parent` for a Multi-Issue parent — and the lane reference is derived from it through the host's
// own grammar, so the probe and the minted lane can never name two different lanes. The probe answers
// ACTIVE while that lane's native run is still live, ABSENT when the native read proves it gone, and
// UNKNOWN — which stops the round instead of putting a second close owner on one Issue — when the read
// proves neither.
export function closeLaneLivenessFor({ request, readSubagentRun } = {}) {
  const issueId = request?.issueId;
  let laneRef;
  try {
    laneRef = hostActionIdentity({ type: request?.actionType, issueId });
  } catch (error) {
    return Object.freeze({ state: "UNKNOWN", evidence: [`The close lane reference for Issue ${String(issueId)} is not derivable: ${error.message}`] });
  }
  let run;
  try {
    run = readSubagentRun({ runId: laneRef, laneRef, issueId, attempt: 1 });
  } catch (error) {
    return Object.freeze({ state: "UNKNOWN", evidence: [`The native run record for close lane ${laneRef} could not be read: ${error.message}`] });
  }
  if (!isRecord(run) || !SUBAGENT_RUN_STATES.includes(run.state) || run.state === "UNREADABLE") {
    return Object.freeze({ state: "UNKNOWN", evidence: [`The native run record for close lane ${laneRef} is unreadable.`] });
  }
  if (run.state === "PRESENT" && run.terminal !== true) {
    return Object.freeze({
      state: "ACTIVE",
      evidence: [`Close lane ${laneRef} still owns its recorded invocation: its native run ${run.runId ?? laneRef} records status ${run.status ?? "unknown"}.`],
    });
  }
  return Object.freeze({
    state: "ABSENT",
    evidence: [run.state === "ABSENT"
      ? `No native run record exists for close lane ${laneRef}, so no close lane owns the recorded invocation.`
      : `Close lane ${laneRef} reached a terminal native status ${run.status ?? "unknown"}, so it no longer owns the recorded invocation.`],
  });
}

// One fresh tracker read per Issue the recorded lanes name, so the synchronous native evidence reader
// reads the tracker notes it needs without an asynchronous port inside it.
const readNativeIssueReads = async ({ lanes, sources }) => {
  const reads = new Map();
  for (const issueId of new Set(lanes.map((lane) => lane.issueId))) {
    const issue = await sources.readIssue(issueId);
    const completion = (issue.records ?? []).toReversed().find(({ record }) => (
      record?.kind === COMPLETION_NOTE_KIND && record.issueId === issueId
    )) ?? null;
    reads.set(issueId, Object.freeze({
      state: isText(issue.state) ? issue.state.toUpperCase() : null,
      completion: completion === null ? null : Object.freeze({ identity: completion.identity, record: completion.record }),
    }));
  }
  return reads;
};

// The composed native path for one logical DAG Run: the fresh round read the native round loop consumes,
// the single journal writer it appends through, and the identities its lane planning needs. The launch
// port is not here — only the coordinator can materialize a worker, and this entry never dispatches.
export function createNativeRunComposition({
  repository,
  repositoryId: selectedRepositoryId,
  specId,
  runId,
  store,
  sources,
  adapters,
  homeDir = homedir(),
  // The producer's `ready_state.read_back` projection as this Run's own read-back produced it. It is a
  // one-shot projection bound to its publication, so it is carried as that read and never as authority:
  // the loop records it as superseded and re-derives the release frontier from its own fresh reads.
  readReadyState = () => null,
  laneGit = createNativeLaneGit(),
  readSubagentRun = createNativeRunReader({ homeDir }),
  readRecordedLanes = ({ journal }) => recordedLanesFromJournal({ journal }),
  agentCeiling = LANE_TOOL_CEILING,
  now = () => new Date().toISOString(),
} = {}) {
  const repositoryPath = requireText(repository, "The composition needs the project checkout");
  // The repository identity is the selected owning source's own identity — `github:<owner>/<repo>` or
  // `gitlab:<host>/<project>` — so the Run identity and the Run's tracker evidence cannot disagree.
  const repositoryId = requireText(selectedRepositoryId, "The composition needs the selected repository identity");
  requireText(specId, "The composition needs the selected Spec id");
  requireText(runId, "The composition needs the logical DAG Run id");
  if (!isRecord(store) || typeof store.readEvents !== "function" || typeof store.acquireWriter !== "function") {
    throw new TypeError("The composition needs the Run store");
  }
  if (!isRecord(sources) || !isRecord(adapters)) throw new TypeError("The composition needs the owning sources and authority adapters");
  if (typeof sources.readIssue !== "function") throw new TypeError("The composition needs the owning source's Issue read for the tracker completion note");
  requireFunction(readRecordedLanes, "Recorded-lane port");
  requireFunction(readSubagentRun, "Native run read port");
  requireFunction(readReadyState, "Ready-state projection port");
  if (!isRecord(laneGit)) throw new TypeError("The composition needs one Git reader for lane evidence");
  if (!Array.isArray(agentCeiling) || !agentCeiling.every(isText)) throw new TypeError("The composition needs the agent tool ceiling");

  const readJournal = () => store.readEvents(runId);

  // One round read: this round's journal, this round's tracker and Git facts, and this round's native lane
  // evidence. Nothing is remembered between rounds, so a restart resumes at the next legal action.
  const readRound = async ({ at = now() } = {}) => {
    requireText(at, "A round read needs its timestamp");
    const tracker = await sources.sources.tracker.read({ specId });
    const journal = readJournal();
    const current = await adapters.reconcile({
      request: { specId, runIdentity: { ...tracker.authority, runId } },
      tracker,
      journal,
    });
    if (current.runIdentity.runId !== runId) throw new Error("Run identity differs from the selected authority");
    const facts = { ...current.facts, journal };
    const lanes = readRecordedLanes({ journal, facts });
    const nativeIssues = await readNativeIssueReads({ lanes, sources });
    const laneEvidence = readNativeLaneEvidence({
      lanes,
      readRun: (lane) => readSubagentRun(lane),
      readIssue: ({ issueId }) => nativeIssues.get(issueId) ?? Object.freeze({ state: null, completion: null }),
      git: laneGit,
      repository: repositoryPath,
      target: current.runIdentity.target,
    });
    return Object.freeze({
      schema: NATIVE_ROUND_READ_SCHEMA,
      readAt: at,
      journal,
      facts,
      laneEvidence,
      readyState: readReadyState(),
      closeLane: (request) => closeLaneLivenessFor({ request, readSubagentRun }),
    });
  };

  // The loop's single journal writer. A coordinator step appends its complete authorized event set
  // under one ownership interval, so no lane action can leave the step before every reservation and
  // close intent from that round is durable.
  const appendAll = (events) => {
    if (!Array.isArray(events)) throw new TypeError("Native Run journal append needs an event list");
    const writer = store.acquireWriter(runId);
    try {
      return events.map((event) => writer.append(event));
    } finally {
      writer.release();
    }
  };
  const append = (event) => appendAll([event])[0];

  return Object.freeze({
    schema: NATIVE_RUN_COMPOSITION_SCHEMA,
    specId,
    runId,
    repositoryId,
    agentCeiling: Object.freeze([...agentCeiling]),
    laneIdentityRule: NATIVE_LANE_RUN_IDENTITY_RULE,
    taskReader: createNativeLaneTaskReader({ readJournal, readRecordedLanes, readSubagentRun }),
    readRound,
    append,
    appendAll,
    // The loop's third port. A worker launch is the coordinator's alone, so the composition names its
    // owner instead of pretending to have one.
    launchOwner: "coordinator",
  });
}

const authorizedActionsFor = (plan) => Object.freeze([...new Set([
  ...plan.lanes.map((lane) => lane.id),
  ...plan.readBacks.map((item) => item.id),
])]);

// The plan the coordinator materializes: the native round plan's disposition, its legal action set, the
// lanes and read-backs this round owns, and any fail-closed stop.
const planSummary = (plan) => Object.freeze({
  runId: plan.runId,
  disposition: plan.disposition,
  controlRevision: plan.controlRevision,
  maxParallel: plan.maxParallel,
  legalActions: [...plan.legalActions],
  // The three-condition release re-derivation this round made, and what it did with the producer's
  // one-shot projection: recorded as superseded, never consulted.
  frontier: plan.frontier === null ? null : Object.freeze({
    target: plan.frontier.target,
    ready: [...plan.frontier.ready],
    gated: [...plan.frontier.gated],
    unproven: [...plan.frontier.unproven],
  }),
  readyState: Object.freeze({
    consulted: plan.readyState.consulted,
    projection: plan.readyState.projection,
  }),
  authorizedActions: authorizedActionsFor(plan),
  lanes: plan.lanes.map((lane) => Object.freeze({
    id: lane.id,
    actionType: lane.actionType,
    issueId: lane.issueId,
    skill: lane.skill,
    agent: lane.agent,
    tools: Object.freeze([...(lane.tools ?? [])]),
    worktreePolicy: lane.worktreePolicy,
    attempt: lane.attempt,
    decision: lane.decision,
    laneRef: lane.laneRef,
    closeInvocation: lane.closeInvocation,
    launch: lane.launch === null || lane.launch === undefined ? null : Object.freeze({ ...lane.launch }),
  })),
  readBacks: plan.readBacks.map((item) => Object.freeze({
    id: item.id,
    actionType: item.actionType,
    issueId: item.issueId,
    laneRef: item.laneRef,
    requestIdentity: item.requestIdentity ?? null,
    decision: item.decision,
  })),
  waits: plan.waits.map((item) => Object.freeze({ ...item })),
  hostOperations: plan.hostOperations.map((item) => Object.freeze({ ...item })),
  reservations: plan.reservations.map((event) => Object.freeze({ ...event })),
  closeIntents: plan.closeIntents.map((event) => Object.freeze({ ...event })),
  deferred: plan.deferred.map((item) => Object.freeze({ id: item.id, reason: item.reason })),
  stop: plan.stop ?? null,
});

// One Start. Returns the round read, the planned round and the native loop's ports when the Run reduces
// to READY, and a diagnosis otherwise; it never returns a round for a state the Run authority refuses.
export async function startRun({
  cwd = process.cwd(),
  specId,
  approval = null,
  cacheDirectory = installationCacheDirectoryFor(),
  homeDir = homedir(),
  commandRunner = runWorkflowCommand,
  // The selected owning source's own transport, injectable for the same reason `commandRunner` is: a
  // caller proves which installed producer owner the composition read the configured project through.
  transport = null,
  // The owning-source composition is injectable so a caller can prove which installation this Start
  // bound its sources to; production selects the composition from the repository's own configured
  // tracker evidence, and one Run binds exactly one of them.
  createSources = null,
  // The native composition's own ports are injectable for the same reason: a caller proves which lane
  // list and which native run records the Start read, and a harness that chooses its own native run ids
  // supplies its own reader.
  readSubagentRun = null,
  readRecordedLanes = null,
  laneGit = null,
  agentCeiling = LANE_TOOL_CEILING,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof specId !== "string" || specId === "") throw new TypeError("A Run entry needs one Spec id");
  const trackerSelection = resolveTrackerSelection({ cwd });
  const { repository, gitCommonDir } = trackerSelection;
  const selectedCreateSources = createSources ?? trackerSourceFactory(trackerSelection.tracker);
  const store = createRunStore({ gitCommonDir });
  const selection = selectWorkflowVersion({ cacheDirectory });
  const selectedVersion = selection.state === "AVAILABLE" ? selection.version : undefined;
  // The lane-task adapter the reconciliation reads is the native one, and it is built from the same
  // recorded lanes the round read uses. It is late-bound because the sources that consume it are
  // constructed before the Run identity — and therefore the composition — is known.
  let taskReader = null;
  const tasks = { read: (taskRef, options) => (taskReader === null ? null : taskReader.read(taskRef, options)) };
  // The composition reads the same trusted cache and package version back for its own maintenance
  // evidence, so selection and delivery can never name two different installations.
  const sources = await selectedCreateSources({
    repository,
    repositoryName: trackerSelection.repositoryName,
    configuration: trackerSelection.configuration,
    store,
    tasks,
    workflowVersion: selectedVersion,
    installationCacheDirectory: cacheDirectory,
    commandRunner,
    ...(transport === null ? {} : { transport }),
  });
  const adapters = createRunAuthorityAdapters({ sources: sources.sources, store, tasks });

  const request = { specId };
  const tracker = await sources.sources.tracker.read(request);
  const repositoryId = await sources.sources.repository.readIdentity({ request });
  // The Run identity is derived from the selected authority before any read, so lane evidence can be
  // scoped to this Run and never borrow a lane materialized for another Run of the same Spec.
  const runId = deriveRunOperationIdentity({
    repositoryId,
    specId: tracker.spec.node_id,
    approvedPublicationIdentity: tracker.authority.approvedScopeHash,
  }).key;
  // The Run's own handoff read-back owns the producer's one-shot ready-state projection; the composition
  // reads it per round so every round carries the same read instead of a remembered one.
  let handoffFacts = null;
  const composition = createNativeRunComposition({
    repository,
    repositoryId,
    specId: tracker.spec.node_id,
    runId,
    store,
    sources,
    adapters,
    homeDir,
    readReadyState: () => handoffFacts?.checkpoint?.stageReceipts?.readyStateReadBack ?? null,
    agentCeiling,
    now,
    ...(laneGit === null ? {} : { laneGit }),
    ...(readSubagentRun === null ? {} : { readSubagentRun }),
    ...(readRecordedLanes === null ? {} : { readRecordedLanes }),
  });
  taskReader = composition.taskReader;

  // Re-entry reuses the exact existing Grant: the human's one approval is already recorded, so the
  // confirming read-back must never append a second one.
  let journal = store.listRunIds().includes(runId) ? store.readEvents(runId) : [];
  let current = await adapters.reconcile({ request: { specId, runIdentity: { ...tracker.authority, runId } }, tracker, journal });
  if (current.runIdentity.runId !== runId) throw new Error("Run identity differs from the selected authority");
  handoffFacts = await adapters.handoff.read({ request, tracker, current });
  let ready = reduceRunReadyHandoff(handoffFacts);
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
    const preparation = approvalGap ? handoffFacts.preparation : null;
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
      handoffFacts = await adapters.handoff.read({ request, tracker, current });
      ready = reduceRunReadyHandoff(handoffFacts);
      result.recordedGrant = { approvedActions: questions.map(({ action }) => action) };
      result.ready = { state: ready.state, reasonCode: ready.reasonCode, nextOwner: ready.nextOwner };
    }
  }

  if (ready.state !== "READY") {
    return { ...result, outcome: "NOT_READY", diagnosis: ready };
  }

  // AC-1: the default path composes the native round loop. The round read is the exact input
  // `native-round-loop.mjs` consumes, its first round is planned by that loop's own planner, and the
  // ports below let the coordinator run the loop and materialize through the native lane runner.
  const at = now();
  const round = await composition.readRound({ at });
  if (round.laneEvidence.unattributed.length > 0) {
    // A materialized lane this composition cannot attribute to its Issue and attempt is an ambiguity a
    // human resolves; dispatching past it could put two lanes on one Issue.
    return {
      ...result,
      outcome: "LANE_EVIDENCE_UNATTRIBUTED",
      diagnosis: { reasonCode: "lane_evidence_unattributed", evidence: [...round.laneEvidence.unattributed] },
    };
  }
  const plan = planNativeRound({
    round,
    at,
    agentCeiling: composition.agentCeiling,
    repositoryId: composition.repositoryId,
    approvedPublicationIdentity: tracker.authority.approvedScopeHash,
  });
  const coordinatorPlan = Object.freeze({
    ...plan,
    authorizedActions: authorizedActionsFor(plan),
  });
  return {
    ...result,
    outcome: "READY",
    plan: coordinatorPlan,
    observedLanes: round.laneEvidence.lanes.length,
    round,
    nativeLoop: {
      schema: NATIVE_RUN_COMPOSITION_SCHEMA,
      readRound: composition.readRound,
      append: composition.append,
      appendAll: composition.appendAll,
      repositoryId: composition.repositoryId,
      approvedPublicationIdentity: tracker.authority.approvedScopeHash,
      agentCeiling: composition.agentCeiling,
      laneIdentityRule: composition.laneIdentityRule,
      launchOwner: composition.launchOwner,
    },
  };
}

export const RUN_ENTRY_COMPACT_BYTE_LIMIT = 16 * 1024;
export const RUN_ENTRY_ARTIFACT_BYTE_LIMIT = 512 * 1024;
export const RUN_ENTRY_FULL_BYTE_LIMIT = 256 * 1024;

const runCli = async (argv) => {
  const [specId, ...rest] = argv;
  let approval = null;
  let artifactPath = null;
  let cwd = process.cwd();
  let full = false;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--approve") approval = rest[++index] ?? null;
    else if (["--out", "--artifact"].includes(rest[index])) artifactPath = rest[++index] ?? null;
    else if (rest[index] === "--cwd") cwd = rest[++index] ?? cwd;
    else if (rest[index] === "--full") full = true;
  }
  const result = await startRun({ specId, approval, cwd });
  const resultRecord = /** @type {Record<string, any>} */ (result);
  const safeRunId = String(resultRecord.runId ?? resultRecord.plan?.runId ?? resultRecord.operationId ?? specId ?? "unbound").replaceAll(/[^a-zA-Z0-9._-]/gu, "_");
  artifactPath ??= resolve(cwd, ".git", "run-issue-workflow", "artifacts", `${safeRunId}.json`);
  const artifact = {
    schema: "run-issue-workflow-round-artifact:v1",
    result: { ...result, round: undefined, nativeLoop: undefined },
    round: resultRecord.round ?? null,
    plan: resultRecord.plan ?? null,
  };
  const artifactBytes = `${JSON.stringify(artifact)}\n`;
  if (Buffer.byteLength(artifactBytes) > RUN_ENTRY_ARTIFACT_BYTE_LIMIT)
    throw new Error(`Run entry artifact exceeds ${RUN_ENTRY_ARTIFACT_BYTE_LIMIT} bytes`);
  mkdirSync(dirname(resolve(artifactPath)), { recursive: true });
  writeFileSync(resolve(artifactPath), artifactBytes, { mode: 0o600 });
  const artifactSha256 = `sha256:${createHash("sha256").update(artifactBytes).digest("hex")}`;
  const summary = {
    schema: "run-issue-workflow-step-summary:v1",
    outcome: result.outcome,
    runId: resultRecord.plan?.runId ?? null,
    plan: resultRecord.plan === undefined ? null : planSummary(resultRecord.plan),
    stop: resultRecord.plan?.stop ?? resultRecord.diagnosis ?? null,
    artifactRefs: { round: resolve(artifactPath), sha256: artifactSha256 },
  };
  const output = `${JSON.stringify(full ? artifact : summary, null, 2)}\n`;
  const limit = full ? RUN_ENTRY_FULL_BYTE_LIMIT : RUN_ENTRY_COMPACT_BYTE_LIMIT;
  if (Buffer.byteLength(output) > limit) throw new Error(`Run entry ${full ? "full" : "compact"} output exceeds ${limit} bytes`);
  process.stdout.write(output);
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
