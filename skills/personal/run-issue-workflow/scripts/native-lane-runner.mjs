// Native lane runner.
//
// ADR-0080 keeps the authority layer and replaces only the execution material: one authorized reducer
// action becomes exactly one native lane, a `worker` child that follows one contract skill inside its
// own managed worktree. This module owns the three things that materialization must get right, and it
// owns nothing else — the reducer still decides every action, the journal still owns grants, budgets
// and outcomes, and the leaf skill still owns the worktree, verification, review and closure.
//
//   * Reserve and identify (AC-1). Exactly one lane exists per Issue attempt. The dispatch reservation
//     is appended to the authority journal *before* the launch envelope exists, so a lost launch
//     response is read back through `native-lane-evidence.mjs` instead of producing a second worker for
//     the same Issue.
//   * Pin the candidate (AC-2). Settling a lane creates the recorded topic branch at the lane's
//     reported commit while the object still exists, and falls back to re-applying the preserved patch
//     when pi-subagents' own cleanup already removed the worktree and its branch. Cleanup is allowed
//     only after the durable ref is read back.
//   * Refuse ambiguity (AC-4). A second lane for one Issue, an unresolved creation intent, unknown
//     ownership, a lane whose tools or prompt would widen the declared ceiling, or an action with no
//     worker lane stops without mutating the journal or the repository, naming the owning source.
//
// Which action consumes a dispatch attempt, and which does not, is the published delivery contract's
// rule rather than this module's invention: `dispatch_issue` consumes one attempt and therefore carries
// the reservation, `recover_issue`/`repair_issue`/`upgrade_issue` run in the Issue's already recorded
// lane, and a close lane owns close authority instead of a dispatch attempt. A lane this runner creates
// is identified by `hostActionIdentity` for the authorized action, which is what the journal records; a
// read-back decision reuses the lane the authority plan already recorded. Replay accounting therefore
// stays the round loop's (`assertReissueOrder`) and never becomes this materialization's decision.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { requireIsoInstant } from "./delivery-authority.mjs";
import {
  LANE_STOP_CODES,
  LANE_WORKTREE_POLICY,
  assertLanePromptScope,
  assertLaneTools,
  laneTaskRef,
  planIssueLane,
} from "./issue-lane.mjs";
import { parseHostDispatchId } from "./pi-workflow-host.mjs";
import { createRunStore } from "./run-store.mjs";

export const NATIVE_LANE_RUN_SCHEMA = "native-lane-run:v1";
export const NATIVE_LANE_SETTLEMENT_SCHEMA = "native-lane-settlement:v1";
export const NATIVE_LANE_STOP_CODES = Object.freeze({
  noWorkerLane: "lane_action_has_no_worker_lane",
  worktreePolicyUnavailable: "lane_worktree_policy_unavailable",
  identityMismatch: "lane_identity_mismatch",
  ownershipUnproven: "lane_ownership_unproven",
  candidateUnreported: "lane_candidate_unreported",
  candidateMismatch: "lane_candidate_mismatch",
  candidateNotDurable: "lane_candidate_not_durable",
});
// The one action that consumes a dispatch attempt, the actions that run inside the Issue's already
// recorded lane, and the actions that own close authority instead of a dispatch attempt.
export const DISPATCH_ACTION = "dispatch_issue";
export const SAME_LANE_ACTIONS = Object.freeze(["recover_issue", "repair_issue", "upgrade_issue"]);
export const CLOSE_LANE_ACTIONS = Object.freeze(["close_issue", "close_parent"]);
export const RESERVATION_RULES = Object.freeze({
  dispatch: "dispatch_reserved",
  sameLane: "same_lane_no_reservation",
  close: "close_authority_no_reservation",
});
const LANE_ACTIONS = Object.freeze([DISPATCH_ACTION, ...SAME_LANE_ACTIONS, ...CLOSE_LANE_ACTIONS]);
const DEFAULT_RESTORE_MESSAGE = "native lane: restore preserved candidate";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const requireText = (value, label) => {
  if (!isText(value)) throw new TypeError(`${label} is required`);
  return value;
};
const stop = (code, evidence) => Object.freeze({ code, evidence: [...evidence] });
const laneStop = (code, evidence, laneRef = null) => Object.freeze({
  decision: "STOP",
  laneRef,
  lane: null,
  reservation: null,
  reservations: Object.freeze([]),
  launch: null,
  stop: stop(code, evidence),
});

// Every authority-journal append the lane runner performs goes through the single journal writer.
export function recordLaneReservation({ gitCommonDir, runId, event } = {}) {
  requireText(gitCommonDir, "reservation journal common directory");
  requireText(runId, "reservation journal Run id");
  if (!isRecord(event) || !isText(event.type)) throw new TypeError("A lane reservation needs its event type");
  const store = createRunStore({ gitCommonDir });
  const writer = store.acquireWriter(runId);
  try {
    return writer.append(event);
  } finally {
    writer.release();
  }
}

// One lane brief from `planHostActions`, or the same facts asserted directly. An action with no worker
// lane is not this runner's to materialize: its own owner materializes it, and guessing here would put
// authority in the execution material.
const laneBrief = (materialization) => {
  if (!isRecord(materialization)) throw new TypeError("A lane runner needs one authorized materialization");
  if (materialization.kind !== "agent") {
    return {
      stop: stop(NATIVE_LANE_STOP_CODES.noWorkerLane, [
        `Reducer action ${String(materialization.actionType)} is materialized by ${String(materialization.execution ?? "its own owner")}, not by a worker lane.`,
        `Materialization ${String(materialization.id)} declares kind ${String(materialization.kind)}.`,
      ]),
    };
  }
  const actionType = requireText(materialization.actionType, "Lane action type");
  if (!LANE_ACTIONS.includes(actionType)) {
    return {
      stop: stop(NATIVE_LANE_STOP_CODES.noWorkerLane, [
        `Reducer action ${actionType} has no declared worker lane.`,
        `Materialization ${String(materialization.id)} is not one of ${LANE_ACTIONS.join(", ")}.`,
      ]),
    };
  }
  const laneRef = requireText(materialization.id, "Lane reference");
  if (!Array.isArray(materialization.tools) || !materialization.tools.every(isText)) {
    throw new TypeError("A lane brief needs one tool list");
  }
  if (materialization.worktreePolicy !== LANE_WORKTREE_POLICY) {
    return {
      stop: stop(NATIVE_LANE_STOP_CODES.worktreePolicyUnavailable, [
        `Lane ${laneRef} declares worktree policy ${String(materialization.worktreePolicy)}; one Issue lane requires ${LANE_WORKTREE_POLICY}.`,
        "A lane that shares the checkout would break one writer per Issue worktree.",
      ]),
    };
  }
  return {
    lane: Object.freeze({
      laneRef,
      actionType,
      issueId: requireText(materialization.issueId, "Lane Issue"),
      skill: requireText(materialization.skill, "Lane skill"),
      agent: requireText(materialization.agent, "Lane agent"),
      tools: Object.freeze([...materialization.tools]),
      prompt: requireText(materialization.prompt, "Lane prompt"),
      worktreePolicy: materialization.worktreePolicy,
      requestIdentity: materialization.requestIdentity ?? null,
      attempt: Number.isInteger(materialization.attempt) ? materialization.attempt : null,
    }),
  };
};

// The recorded lane identity is the one the dispatch reservation authorizes, so it must name its own
// Issue and attempt. A lane whose identity does not is an ownership the planner must not guess at.
const assertLaneIdentity = (lane, attempt) => {
  if (lane.attempt !== null && lane.attempt !== attempt) {
    return stop(NATIVE_LANE_STOP_CODES.identityMismatch, [
      `Lane ${lane.laneRef} names dispatch attempt ${lane.attempt}, not the planned attempt ${attempt}.`,
    ]);
  }
  if (lane.actionType !== DISPATCH_ACTION) return null;
  const dispatch = parseHostDispatchId(lane.laneRef);
  if (dispatch === null || dispatch.issueId !== lane.issueId || dispatch.attempt !== attempt) {
    return stop(NATIVE_LANE_STOP_CODES.identityMismatch, [
      `Lane ${lane.laneRef} does not name Issue ${lane.issueId} attempt ${attempt} in the recorded dispatch grammar.`,
      "The recorded reservation identity is the lane's owner; a lane is never attributed by title, path or order.",
    ]);
  }
  return null;
};

const creationIntentFor = ({ creationIntents, issueId, observedLaneRefs }) => {
  if (!Array.isArray(creationIntents) || creationIntents.length === 0) return { intent: null, stop: null };
  const reserved = creationIntents.filter((intent) => isRecord(intent) && intent.issueId === issueId && intent.state !== "RESOLVED");
  // A reservation this read proved to be an observed lane is the read-back resolution of that same
  // lane, not a second one.
  const unresolved = reserved.filter((intent) => !observedLaneRefs.has(intent.laneRef));
  if (unresolved.length === 0) return { intent: null, stop: null };
  if (unresolved.length > 1) {
    return {
      intent: null,
      stop: stop(LANE_STOP_CODES.creationIntentUnresolved, [
        ...unresolved.map((intent) => `Lane ${String(intent.laneRef)} is recorded for Issue ${issueId} without a proven native run record.`),
        "More than one unresolved creation intent for one Issue is an ambiguity a human resolves.",
      ]),
    };
  }
  const [intent] = unresolved;
  if (observedLaneRefs.size > 0) {
    // An unresolved reservation beside an observed lane for the same Issue contradicts itself: either
    // the reservation names a lane that was never materialized, or the observed lane is unaccounted.
    return {
      intent: null,
      stop: stop(LANE_STOP_CODES.creationIntentUnresolved, [
        `Issue ${issueId} records an unresolved creation intent for lane ${String(intent.laneRef)} beside observed lane ${[...observedLaneRefs].join(", ")}.`,
        "The journaled reservation is the owning source; the lane is read back or repaired, never duplicated.",
      ]),
    };
  }
  return { intent, stop: null };
};

// The lane states that prove the lane exists and owns its Issue. UNKNOWN is excluded: an unproven owner
// is not a lane to run work in.
const PROVEN_LANE_STATES = Object.freeze(["ACTIVE", "RESUMABLE", "INACTIVE"]);

// The Issue's own recorded lane, proven by native evidence. An action that runs inside that lane while
// no lane is proven is unknown ownership, which stops without mutation instead of launching a worker
// whose worktree, branch and candidate nobody can name.
const recordedLaneFor = ({ observed, issueId }) => {
  const lanes = observed.filter((lane) => isRecord(lane) && lane.issueId === issueId);
  if (lanes.length === 0) {
    return {
      stop: stop(NATIVE_LANE_STOP_CODES.ownershipUnproven, [
        `Issue ${issueId} has no proven recorded lane, so the action has no lane to run in.`,
        "The recorded dispatch reservation is the owning source of the lane identity.",
      ]),
    };
  }
  if (lanes.length > 1) {
    return {
      stop: stop(LANE_STOP_CODES.ambiguousLane, lanes.map((lane) => `${String(lane.laneRef)} is an observed lane for Issue ${issueId}`)),
    };
  }
  const [lane] = lanes;
  if (!PROVEN_LANE_STATES.includes(lane.state)) {
    return {
      stop: stop(LANE_STOP_CODES.livenessUnknown, [
        `Lane ${String(lane.laneRef)} liveness is UNKNOWN; an unknown owner is not a lane to run in.`,
      ]),
    };
  }
  return { lane };
};

// One authorized reducer action becomes exactly one lane, or one fail-closed stop.
export function dispatchNativeLane({
  materialization,
  runId,
  attempt,
  observed = [],
  creationIntents = [],
  agentCeiling,
  at,
  append = null,
  gitCommonDir,
} = {}) {
  requireText(runId, "A lane runner needs the logical DAG Run id");
  if (!Number.isInteger(attempt) || attempt < 1) throw new TypeError("A lane runner needs one positive planned attempt");
  if (!Array.isArray(observed)) throw new TypeError("Observed lanes must be an array");
  requireIsoInstant(at, "Lane reservation timestamp");
  const brief = laneBrief(materialization);
  if (brief.stop) return laneStop(brief.stop.code, brief.stop.evidence);
  const { lane } = brief;
  const identityStop = assertLaneIdentity(lane, attempt);
  if (identityStop) return laneStop(identityStop.code, identityStop.evidence, lane.laneRef);
  const toolStop = assertLaneTools({ tools: lane.tools, agentCeiling });
  if (toolStop) return laneStop(toolStop.code, toolStop.evidence, lane.laneRef);
  const promptStop = assertLanePromptScope({ prompt: lane.prompt, skill: lane.skill });
  if (promptStop) return laneStop(promptStop.code, promptStop.evidence, lane.laneRef);

  const observedLaneRefs = new Set(observed.filter(isRecord).map((entry) => entry.laneRef));

  if (lane.actionType !== DISPATCH_ACTION) {
    const sameLane = SAME_LANE_ACTIONS.includes(lane.actionType) ? recordedLaneFor({ observed, issueId: lane.issueId }) : null;
    if (sameLane?.stop) return laneStop(sameLane.stop.code, sameLane.stop.evidence, lane.laneRef);
    // A lane that does not consume a dispatch attempt carries no reservation: `recover_issue`,
    // `repair_issue` and `upgrade_issue` run in the Issue's recorded lane, and a close lane owns close
    // authority. The action's own authority event covers it, so this runner appends nothing.
    const laneRef = sameLane?.lane?.laneRef ?? lane.laneRef;
    return Object.freeze({
      schema: NATIVE_LANE_RUN_SCHEMA,
      runId,
      issueId: lane.issueId,
      attempt,
      decision: "LAUNCH",
      laneRef,
      lane,
      reservationRule: sameLane === null ? RESERVATION_RULES.close : RESERVATION_RULES.sameLane,
      reservation: null,
      reservations: Object.freeze([]),
      supersession: null,
      launch: Object.freeze({
        taskRef: laneTaskRef(laneRef),
        agent: lane.agent,
        skill: lane.skill,
        tools: [...lane.tools],
        worktreePolicy: lane.worktreePolicy,
        prompt: lane.prompt,
        requestIdentity: lane.requestIdentity,
        attempt,
      }),
      stop: null,
    });
  }

  const intent = creationIntentFor({ creationIntents, issueId: lane.issueId, observedLaneRefs });
  if (intent.stop) return laneStop(intent.stop.code, intent.stop.evidence, lane.laneRef);

  const decision = planIssueLane({
    runId,
    issueId: lane.issueId,
    attempt,
    observed,
    creationIntent: intent.intent,
    // The replacement ref is the exact lane this runner will launch, so the journal's authorized task
    // reference and the created lane can never differ.
    nextLaneRef: lane.laneRef,
    at,
  });
  if (decision.decision === "STOP") return laneStop(decision.stop.code, decision.stop.evidence, lane.laneRef);

  const reservations = [];
  const release = (event) => {
    if (append === null) return recordLaneReservation({ gitCommonDir, runId, event });
    return append(event);
  };
  const dispatchRecord = (taskRef, dispatchAttempt) => ({
    type: "dispatch.recorded",
    at,
    issueId: lane.issueId,
    attempt: dispatchAttempt,
    taskRef,
  });
  try {
    if (decision.decision === "CREATE") {
      reservations.push(release(dispatchRecord(laneTaskRef(lane.laneRef), attempt)));
    } else if (decision.decision === "RESUME") {
      reservations.push(release(decision.retry));
      reservations.push(release(decision.dispatch));
    } else if (decision.decision === "REPLACE") {
      reservations.push(release(decision.supersession));
      reservations.push(release(dispatchRecord(decision.supersession.replacement.nextTaskRef, attempt)));
    }
  } catch (error) {
    // The reservation failed, so there is no lane to launch against and no envelope to return.
    throw new Error(`The dispatch reservation for Issue ${lane.issueId} attempt ${attempt} was not recorded: ${error.message}`, { cause: error });
  }

  // The read-back decisions reuse the lane the planner recorded; the creating decisions own the lane
  // whose identity the authorized action itself declares.
  const laneRef = ["REUSE", "OBSERVE", "RESUME"].includes(decision.decision)
    ? decision.laneRef
    : lane.laneRef;
  const readBack = ["REUSE", "OBSERVE"].includes(decision.decision);
  return Object.freeze({
    schema: NATIVE_LANE_RUN_SCHEMA,
    runId,
    issueId: lane.issueId,
    attempt,
    decision: decision.decision,
    laneRef,
    lane,
    reservationRule: RESERVATION_RULES.dispatch,
    reservation: reservations.length === 0 ? null : reservations[0],
    reservations: Object.freeze(reservations),
    supersession: decision.supersession ?? null,
    // The reservation is durable before this envelope exists, which is what makes a lost launch
    // response readable instead of repeatable.
    launch: readBack ? null : Object.freeze({
      taskRef: laneTaskRef(laneRef),
      agent: lane.agent,
      skill: lane.skill,
      tools: [...lane.tools],
      worktreePolicy: lane.worktreePolicy,
      prompt: lane.prompt,
      requestIdentity: lane.requestIdentity,
      reservedAt: at,
      attempt,
    }),
    stop: null,
  });
}

// The candidate durability guard. A settled lane's candidate must be reachable from the recorded topic
// branch before any worktree cleanup can remove the worktree and its own transient branch.
export function candidateDurability({ git, branch, candidate, repository, worktree } = {}) {
  requireText(branch, "Candidate durability needs the recorded topic branch");
  requireText(candidate, "Candidate durability needs one candidate commit");
  if (!isRecord(git) || typeof git.revParse !== "function" || typeof git.isAncestor !== "function") {
    throw new TypeError("Candidate durability needs one Git reader");
  }
  const ref = branch.startsWith("refs/") ? branch : `refs/heads/${branch}`;
  const head = git.revParse({ ref, cwd: repository });
  if (head === null) {
    return Object.freeze({
      proven: false,
      ref,
      head: null,
      evidence: Object.freeze([
        `The recorded topic branch ${branch} resolves from no ref in the repository.`,
        ...(worktree === undefined ? [] : [`The cleanup owner may not remove ${worktree} until this ref exists.`]),
      ]),
    });
  }
  const reaches = head === candidate || git.isAncestor({ ancestor: candidate, descendant: head, cwd: repository });
  return Object.freeze({
    proven: reaches,
    ref,
    head,
    evidence: Object.freeze(reaches
      ? [`Candidate ${candidate} is reachable from the recorded topic branch ${branch} at ${head}.`]
      : [`Candidate ${candidate} is not reachable from the recorded topic branch ${branch} at ${head}.`]),
  });
}

// Settles one lane: resolve the candidate from its native worktree before cleanup, pin the recorded
// topic branch at it, read the ref back, and only then allow cleanup. When pi-subagents' own cleanup
// already removed the worktree and its branch, the preserved patch is re-applied instead of declaring
// the lane lost.
export function settleNativeLane({
  laneRef,
  topic,
  worktree = null,
  run = null,
  expectedCandidate = null,
  git,
  repository,
  preserve = null,
} = {}) {
  requireText(laneRef, "Lane settlement needs the lane reference");
  requireText(topic, "Lane settlement needs the recorded topic branch");
  if (!isRecord(git)) throw new TypeError("Lane settlement needs one Git reader");
  const branch = topic.startsWith("refs/") ? topic : `refs/heads/${topic}`;
  const base = { schema: NATIVE_LANE_SETTLEMENT_SCHEMA, laneRef, topic, ref: branch, run };
  const settled = (decision, fields) => Object.freeze({
    ...base,
    ...fields,
    decision,
    // Cleanup is allowed only by a settlement that proved the durable ref.
    cleanup: Object.freeze({ allowed: decision === "SETTLED", worktree, branch, ...(fields.cleanup ?? {}) }),
  });

  let candidate = null;
  let source = null;
  if (isText(worktree) && typeof git.revParse === "function") {
    const head = git.revParse({ ref: "HEAD", cwd: worktree });
    if (head !== null) {
      candidate = head;
      source = "native_worktree";
    }
  }
  if (candidate === null && isRecord(preserve) && isText(preserve.patchPath)) {
    if (typeof git.restoreFromPreservedPatch !== "function") {
      throw new TypeError("Re-applying a preserved candidate needs one Git patch restorer");
    }
    const restored = git.restoreFromPreservedPatch({
      patchPath: preserve.patchPath,
      baseCommit: isText(preserve.baseCommit) ? preserve.baseCommit : null,
      ref: branch,
      message: isText(preserve.message) ? preserve.message : DEFAULT_RESTORE_MESSAGE,
      cwd: repository,
    });
    candidate = isText(restored) ? restored : null;
    source = "preserved_patch";
  }
  if (candidate === null) {
    return settled("STOP", {
      candidate: null,
      durability: null,
      pinned: false,
      cleanup: { allowed: false, evidence: ["No candidate commit could be resolved, so nothing may be cleaned up."] },
      stop: stop(NATIVE_LANE_STOP_CODES.candidateUnreported, [
        `Lane ${laneRef} reports no candidate commit from ${isText(worktree) ? `its worktree ${worktree}` : "a recorded worktree"}${isRecord(preserve) ? " or its preserved patch" : ", and no preserved patch was offered"}.`,
        "Cleanup stays disallowed because no candidate commit can be pinned.",
      ]),
    });
  }
  const reported = isText(expectedCandidate) ? expectedCandidate : null;
  if (reported !== null && reported !== candidate) {
    return settled("STOP", {
      candidate: Object.freeze({ commit: candidate, source }),
      durability: null,
      pinned: false,
      cleanup: { allowed: false, evidence: ["The two native sources name different candidates, so nothing may be cleaned up."] },
      stop: stop(NATIVE_LANE_STOP_CODES.candidateMismatch, [
        `Lane ${laneRef} reports candidate ${candidate} while its native completion evidence names ${reported}.`,
        "The two native sources agree on no candidate, so nothing is pinned.",
      ]),
    });
  }
  if (typeof git.pin !== "function") throw new TypeError("Lane settlement needs one Git pin writer");
  git.pin({ ref: branch, commit: candidate, cwd: repository });
  const durability = candidateDurability({ git, branch: topic, candidate, repository, worktree: worktree ?? undefined });
  if (!durability.proven) {
    return settled("STOP", {
      candidate: Object.freeze({ commit: candidate, source }),
      durability,
      pinned: false,
      cleanup: { allowed: false, evidence: [...durability.evidence] },
      stop: stop(NATIVE_LANE_STOP_CODES.candidateNotDurable, [
        `Lane ${laneRef} could not pin candidate ${candidate} to ${branch}.`,
        ...durability.evidence,
      ]),
    });
  }
  return settled("SETTLED", {
    candidate: Object.freeze({ commit: candidate, source }),
    durability,
    pinned: true,
    // The recorded topic branch, not the transient worktree or the harness branch, is what a later
    // close reads the candidate from.
    cleanup: { durableRef: branch, evidence: [...durability.evidence] },
    stop: null,
  });
}

const runGit = (cwd, args, exec) => {
  try {
    const stdout = exec("git", ["-C", cwd, ...args], { encoding: "utf8" });
    return { status: 0, stdout: String(stdout) };
  } catch (error) {
    return { status: typeof error?.status === "number" ? error.status : 1, stdout: String(error?.stdout ?? "") };
  }
};

const gitRead = (cwd, args, exec) => {
  const result = runGit(cwd, args, exec);
  return result.status === 0 ? result.stdout.trim() : null;
};

// The real Git adapter for the ports above. Reads stay read-only; the only writes are the recorded
// topic branch and, on the fallback path, the restored commit in a temporary detached worktree.
export function createNativeLaneGit({ exec = execFileSync, temporaryRoot = tmpdir() } = {}) {
  if (typeof exec !== "function") throw new TypeError("The native lane Git adapter needs one exec function");
  const revParse = ({ ref, cwd }) => {
    requireText(cwd, "Git read needs one working directory");
    const head = gitRead(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], exec);
    return isText(head) ? head : null;
  };
  return Object.freeze({
    revParse,
    isAncestor: ({ ancestor, descendant, cwd }) => {
      requireText(cwd, "Git ancestry read needs one working directory");
      // Both objects must resolve first: an unresolvable object is not a "not an ancestor" answer, and
      // reporting it as false would let an unproven candidate look merely unreachable.
      if (revParse({ ref: ancestor, cwd }) === null) throw new TypeError(`Git object ${ancestor} does not resolve`);
      if (revParse({ ref: descendant, cwd }) === null) throw new TypeError(`Git object ${descendant} does not resolve`);
      const result = runGit(cwd, ["merge-base", "--is-ancestor", ancestor, descendant], exec);
      if (result.status === 1) return false;
      if (result.status !== 0) throw new TypeError(`Git ancestry check between ${ancestor} and ${descendant} failed`);
      return true;
    },
    pin: ({ ref, commit, cwd }) => {
      requireText(cwd, "Git pin needs one working directory");
      const result = runGit(cwd, ["update-ref", ref, commit], exec);
      if (result.status !== 0) throw new TypeError(`Git could not pin ${commit} to ${ref}`);
      return ref;
    },
    // Re-applies the patch pi-subagents preserved for a lane whose worktree cleanup already ran. The
    // reconstructed candidate is a new commit, so the settlement reports its source truthfully.
    restoreFromPreservedPatch: ({ patchPath, baseCommit, ref, message, cwd }) => {
      requireText(cwd, "Git restore needs one working directory");
      requireText(ref, "Git restore needs one target ref");
      const base = isText(baseCommit) ? baseCommit : revParse({ ref: "HEAD", cwd });
      if (base === null) throw new TypeError("Git restore needs a preserved base commit");
      const directory = mkdtempSync(join(temporaryRoot, "native-lane-restore-"));
      try {
        const added = runGit(cwd, ["worktree", "add", "--detach", directory, base], exec);
        if (added.status !== 0) throw new TypeError(`Git could not create the restore worktree at ${base}`);
        const applied = runGit(directory, ["apply", "--binary", patchPath], exec);
        if (applied.status !== 0) throw new TypeError(`Git could not re-apply the preserved patch ${patchPath}`);
        const staged = runGit(directory, ["add", "-A"], exec);
        if (staged.status !== 0) throw new TypeError("Git could not stage the restored candidate");
        const committed = runGit(directory, [
          "-c", "user.name=native-lane",
          "-c", "user.email=native-lane@invalid",
          "commit", "--no-gpg-sign", "-m", message,
        ], exec);
        if (committed.status !== 0) throw new TypeError("Git could not commit the restored candidate");
        // The restored commit is resolved inside the restore worktree: `HEAD` in the repository itself is
        // the checkout's own head and would pin the base tree instead of the lane's work.
        const restored = revParse({ ref: "HEAD", cwd: directory });
        if (restored === null) throw new TypeError("Git could not resolve the restored candidate");
        const pin = runGit(cwd, ["update-ref", ref, restored], exec);
        if (pin.status !== 0) throw new TypeError(`Git could not pin the restored candidate to ${ref}`);
        return revParse({ ref, cwd });
      } finally {
        runGit(cwd, ["worktree", "remove", "--force", directory], exec);
        rmSync(directory, { recursive: true, force: true });
      }
    },
  });
}
