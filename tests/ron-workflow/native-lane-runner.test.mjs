// The native lane runner turns one authorized reducer action into exactly one lane. These tests cover
// the three things the materialization must get right: the dispatch reservation is durable before the
// launch envelope exists (AC-1), the candidate is pinned to the recorded topic branch before cleanup
// (AC-2), and every ambiguity stops without mutating the journal or the repository (AC-4).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LANE_STOP_CODES, LANE_TOOL_CEILING } from "../../skills/personal/run-issue-workflow/scripts/issue-lane.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import {
  NATIVE_LANE_RUN_SCHEMA,
  NATIVE_LANE_SETTLEMENT_SCHEMA,
  NATIVE_LANE_STOP_CODES,
  RESERVATION_RULES,
  candidateDurability,
  createNativeLaneGit,
  dispatchNativeLane,
  settleNativeLane,
} from "../../skills/personal/run-issue-workflow/scripts/native-lane-runner.mjs";

const runId = "workflow-op-v1-dag";
const issueId = "I_116";
const target = "features/ron";
const laneRef = "dispatch_I_116_1";
const at = "2026-09-18T02:00:00.000Z";
const agentCeiling = ["read", "grep", "find", "ls", "bash", "edit", "write"];

const materialization = (overrides = {}) => ({
  id: laneRef,
  kind: "agent",
  actionType: "dispatch_issue",
  issueId,
  skill: "execute-issue",
  agent: "worker",
  tools: [...LANE_TOOL_CEILING],
  worktreePolicy: "on",
  prompt: `Invoke $execute-issue for Issue ${issueId} in its dedicated worktree.`,
  requestIdentity: "sha256:abc",
  attempt: 1,
  ...overrides,
});

const recordedLane = (overrides = {}) => ({
  runId,
  issueId,
  laneRef,
  attempt: 1,
  state: "ACTIVE",
  ...overrides,
});

const dispatch = ({ observed = [], creationIntents = [], appends, ...overrides } = {}) => dispatchNativeLane({
  materialization: materialization(),
  runId,
  attempt: 1,
  observed,
  creationIntents,
  agentCeiling,
  at,
  append: appends === undefined ? () => { throw new Error("unexpected journal append"); } : (event) => {
    appends.push(event);
    return { ...event, schema: "pi-workflow-journal-event:v1", sequence: appends.length };
  },
  ...overrides,
});

test("a dispatch journals its reservation before the launch envelope exists", () => {
  const appends = [];
  const result = dispatch({ appends });
  assert.equal(result.schema, NATIVE_LANE_RUN_SCHEMA);
  assert.equal(result.decision, "CREATE");
  assert.equal(result.laneRef, laneRef);
  assert.equal(result.reservationRule, RESERVATION_RULES.dispatch);
  assert.deepEqual(appends.map((event) => event.type), ["dispatch.recorded"]);
  assert.deepEqual(appends[0], {
    type: "dispatch.recorded",
    at,
    issueId,
    attempt: 1,
    taskRef: { hostId: "pi-subagents", threadId: laneRef },
  });
  assert.equal(result.reservation, result.reservations[0]);
  assert.deepEqual(result.launch.taskRef, { hostId: "pi-subagents", threadId: laneRef });
  assert.equal(result.launch.agent, "worker");
  assert.equal(result.launch.skill, "execute-issue");
  assert.equal(result.launch.worktreePolicy, "on");
  assert.equal(result.launch.reservedAt, at);
  assert.deepEqual(result.launch.tools, [...LANE_TOOL_CEILING]);
  assert.equal(result.stop, null);
});

test("a lost launch response reads the lane back and never creates a second one", () => {
  const appends = [];
  const first = dispatch({ appends });
  assert.equal(first.decision, "CREATE");
  // The launch response is lost. The authority journal already owns the attempt, and the native read
  // proves the lane is live, so the next round observes that exact lane and dispatches nothing.
  const second = dispatch({ appends, observed: [recordedLane()] });
  assert.equal(second.decision, "OBSERVE");
  assert.equal(second.laneRef, laneRef);
  assert.equal(second.launch, null);
  assert.deepEqual(second.reservations, []);
  assert.equal(appends.filter((event) => event.type === "dispatch.recorded").length, 1);
});

test("a reservation whose lane cannot be proven stops without a second lane", () => {
  const appends = [];
  const result = dispatch({
    appends,
    creationIntents: [{ laneRef, issueId, attempt: 1, state: "RESERVED", evidence: ["reserved"] }],
  });
  assert.equal(result.decision, "STOP");
  assert.equal(result.stop.code, LANE_STOP_CODES.creationIntentUnresolved);
  assert.equal(result.laneRef, laneRef);
  assert.deepEqual(appends, []);
  assert.equal(result.launch, null);
});

test("an unrecorded reservation fails closed instead of releasing a launch", () => {
  assert.throws(
    () => dispatch({ appends: undefined, materialization: materialization() }),
    /unexpected journal append/u,
  );
  // A journal writer that refuses the reservation must not produce a launch envelope at all.
  const launched = [];
  assert.throws(
    () => dispatch({
      observed: [],
      append: () => {
        throw new Error("journal writer refused");
      },
    }),
    /dispatch reservation for Issue I_116 attempt 1 was not recorded: journal writer refused/u,
  );
  assert.deepEqual(launched, []);
});

test("two lanes for one Issue stop without mutating anything", () => {
  const appends = [];
  const result = dispatch({
    appends,
    observed: [recordedLane(), recordedLane({ laneRef: "dispatch_I_116_1_other" })],
  });
  assert.equal(result.decision, "STOP");
  assert.equal(result.stop.code, LANE_STOP_CODES.ambiguousLane);
  assert.match(result.stop.evidence[0], /dispatch_I_116_1 is an observed lane for Issue I_116/u);
  assert.deepEqual(appends, []);
  assert.equal(result.launch, null);
});

test("an unresolved creation intent beside another observed lane stops without mutation", () => {
  const appends = [];
  const result = dispatch({
    appends,
    observed: [recordedLane()],
    creationIntents: [{ laneRef: "dispatch_I_116_2", issueId, attempt: 2, state: "RESERVED", evidence: ["reserved"] }],
  });
  assert.equal(result.decision, "STOP");
  assert.equal(result.stop.code, LANE_STOP_CODES.creationIntentUnresolved);
  assert.match(result.stop.evidence[0], /unresolved creation intent for lane dispatch_I_116_2 beside observed lane dispatch_I_116_1/u);
  assert.deepEqual(appends, []);
});

test("a reservation the read-back proved to be the observed lane is not a second one", () => {
  const appends = [];
  const result = dispatch({
    appends,
    observed: [recordedLane()],
    creationIntents: [{ laneRef, issueId, attempt: 1, state: "RESERVED", evidence: ["reserved"] }],
  });
  assert.equal(result.decision, "OBSERVE");
  assert.deepEqual(appends, []);
});

test("a transient retry resumes the recorded lane and accounts the attempt", () => {
  const appends = [];
  const result = dispatch({
    appends,
    attempt: 2,
    materialization: materialization({ id: "dispatch_I_116_2", attempt: 2 }),
    observed: [recordedLane({ state: "RESUMABLE" })],
  });
  assert.equal(result.decision, "RESUME");
  assert.equal(result.laneRef, laneRef);
  assert.deepEqual(appends.map((event) => event.type), ["retry.recorded", "dispatch.recorded"]);
  assert.equal(appends[0].replacement, null);
  assert.equal(appends[0].priorTaskRef.threadId, laneRef);
  assert.equal(appends[1].attempt, 2);
  assert.equal(appends[1].taskRef.threadId, laneRef);
});

test("an inactive lane is replaced only through a journaled supersession link", () => {
  const appends = [];
  const result = dispatch({
    appends,
    attempt: 2,
    materialization: materialization({ id: "dispatch_I_116_2", attempt: 2 }),
    observed: [recordedLane({ state: "INACTIVE", inactiveEvidence: ["Subagent run run_lane_1 settled failed"] })],
  });
  assert.equal(result.decision, "REPLACE");
  assert.equal(result.laneRef, "dispatch_I_116_2");
  assert.deepEqual(appends.map((event) => event.type), ["retry.recorded", "dispatch.recorded"]);
  assert.equal(appends[0].reason, "prior_lane_inactive");
  assert.equal(appends[1].taskRef.threadId, "dispatch_I_116_2");
  assert.equal(appends[1].attempt, 2);
});

test("a lane whose action has no worker lane stops and names its owner", () => {
  const appends = [];
  const result = dispatch({
    appends,
    materialization: { id: "wait_target_writer_I_116_x", kind: "host", actionType: "wait_target_writer", execution: "wait" },
  });
  assert.equal(result.decision, "STOP");
  assert.equal(result.stop.code, NATIVE_LANE_STOP_CODES.noWorkerLane);
  assert.match(result.stop.evidence[0], /wait_target_writer is materialized by wait, not by a worker lane/u);
  assert.deepEqual(appends, []);
});

test("a lane that would share the checkout or widen the tool ceiling stops", () => {
  const appends = [];
  const shared = dispatch({ appends, materialization: materialization({ worktreePolicy: "never" }) });
  assert.equal(shared.stop.code, NATIVE_LANE_STOP_CODES.worktreePolicyUnavailable);
  const widened = dispatch({ appends, materialization: materialization({ tools: ["read", "webfetch"] }) });
  assert.equal(widened.stop.code, LANE_STOP_CODES.toolOutsideCeiling);
  const outsideAgent = dispatch({ appends, materialization: materialization({ tools: [...LANE_TOOL_CEILING] }), agentCeiling: ["read", "grep"] });
  assert.equal(outsideAgent.stop.code, LANE_STOP_CODES.toolOutsideAgent);
  assert.deepEqual(appends, []);
});

test("a lane prompt that names another contract skill stops", () => {
  const appends = [];
  const widened = dispatch({ appends, materialization: materialization({ prompt: "Use $execute-issue, and also $close-issue." }) });
  assert.equal(widened.stop.code, LANE_STOP_CODES.promptWidensAuthority);
  const missing = dispatch({ appends, materialization: materialization({ prompt: "Implement the Issue." }) });
  assert.equal(missing.stop.code, LANE_STOP_CODES.promptMissingSkill);
  // A skill outside the declared contract scope is not a lane at all, so the guard refuses it instead
  // of launching a worker whose own skill cannot be resolved.
  assert.throws(
    () => dispatch({ appends, materialization: materialization({ skill: "not-a-contract-skill" }) }),
    /Unsupported lane skill not-a-contract-skill/u,
  );
  assert.deepEqual(appends, []);
});

test("a dispatch lane whose identity does not name its Issue and attempt stops", () => {
  const appends = [];
  const result = dispatch({ appends, materialization: materialization({ id: "dispatch_I_116_3", attempt: 1 }) });
  assert.equal(result.stop.code, NATIVE_LANE_STOP_CODES.identityMismatch);
  assert.deepEqual(appends, []);
});

test("an action that runs in the Issue's recorded lane carries no dispatch reservation", () => {
  const appends = [];
  const result = dispatch({
    appends,
    materialization: materialization({
      id: `repair_I_116_${"c".repeat(12)}`,
      actionType: "repair_issue",
      prompt: `Use $execute-issue to repair Issue ${issueId} in its original worktree.`,
    }),
    observed: [recordedLane()],
  });
  assert.equal(result.decision, "LAUNCH");
  assert.equal(result.reservationRule, RESERVATION_RULES.sameLane);
  assert.equal(result.laneRef, laneRef);
  assert.deepEqual(result.reservations, []);
  assert.equal(result.launch.taskRef.threadId, laneRef);
  assert.deepEqual(appends, []);
});

test("an action with no proven recorded lane stops as unknown ownership", () => {
  const appends = [];
  const result = dispatch({
    appends,
    materialization: materialization({
      id: `recover_I_116_${"d".repeat(12)}`,
      actionType: "recover_issue",
      prompt: `Use $execute-issue to recover Issue ${issueId} from its recorded failure.`,
    }),
  });
  assert.equal(result.stop.code, NATIVE_LANE_STOP_CODES.ownershipUnproven);
  assert.match(result.stop.evidence[0], /Issue I_116 has no proven recorded lane/u);
  const unproven = dispatch({
    appends,
    materialization: materialization({
      id: `recover_I_116_${"d".repeat(12)}`,
      actionType: "recover_issue",
      prompt: `Use $execute-issue to recover Issue ${issueId} from its recorded failure.`,
    }),
    observed: [recordedLane({ state: "UNKNOWN" })],
  });
  assert.equal(unproven.stop.code, LANE_STOP_CODES.livenessUnknown);
  assert.deepEqual(appends, []);
});

test("a close lane carries close authority instead of a dispatch attempt", () => {
  const appends = [];
  const result = dispatch({
    appends,
    materialization: materialization({
      id: `close_${issueId}`,
      actionType: "close_issue",
      skill: "close-issue",
      prompt: `Use $close-issue to close Issue ${issueId} against its recorded local target.`,
    }),
  });
  assert.equal(result.decision, "LAUNCH");
  assert.equal(result.reservationRule, RESERVATION_RULES.close);
  assert.equal(result.laneRef, `close_${issueId}`);
  assert.deepEqual(result.reservations, []);
  assert.equal(result.launch.skill, "close-issue");
  assert.deepEqual(appends, []);
});

test("a reservation is accepted and read back by the single authority journal writer", () => {
  const gitCommonDir = mkdtempSync(join(tmpdir(), "native-lane-journal-"));
  const journalRunId = "run_lane_1";
  try {
    const store = createRunStore({ gitCommonDir });
    const writer = store.acquireWriter(journalRunId);
    try {
      writer.append({
        type: "grant.recorded",
        at,
        runIdentity: {
          runId: journalRunId,
          specId: "I_spec",
          approvedScopeHash: `sha256:${"a".repeat(64)}`,
          target,
          classification: "MULTI",
          decompositionIdentity: "decomposition-1",
        },
        maxParallel: 3,
        workflowVersion: {
          id: "a".repeat(64),
          sourceCommit: "b".repeat(40),
          sourceRepository: "github:ron03wlb/skills",
          protocolVersion: 1,
        },
      });
    } finally {
      writer.release();
    }
    const result = dispatchNativeLane({
      materialization: materialization(),
      runId: journalRunId,
      attempt: 1,
      observed: [],
      agentCeiling,
      at,
      gitCommonDir,
    });
    assert.equal(result.decision, "CREATE");
    // The reservation is a real authority-journal event, not this module's own shape.
    assert.equal(result.reservation.schema, "dag-run-event:v1");
    assert.equal(result.reservation.sequence, 2);
    const events = createRunStore({ gitCommonDir }).readEvents(journalRunId);
    assert.deepEqual(events.map((event) => [event.type, event.sequence]), [["grant.recorded", 1], ["dispatch.recorded", 2]]);
    assert.deepEqual(events[1].taskRef, { hostId: "pi-subagents", threadId: laneRef });
    assert.equal(events[1].attempt, 1);
  } finally {
    rmSync(gitCommonDir, { recursive: true, force: true });
  }
});

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "native-lane-test",
  GIT_AUTHOR_EMAIL: "native-lane@invalid",
  GIT_COMMITTER_NAME: "native-lane-test",
  GIT_COMMITTER_EMAIL: "native-lane@invalid",
};

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], {
  encoding: "utf8",
  env: gitEnv,
  // A deliberately failing probe is an expected outcome in these tests, so its stderr stays out of the
  // test output instead of looking like a failure.
  stdio: ["ignore", "pipe", "ignore"],
}).trim();
const gitOrNull = (cwd, args) => {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
};

// A real repository with one real native-style lane: a managed worktree on its own transient branch
// that commits a candidate, exactly as a mutation-capable pi-subagents lane does.
const laneRepository = () => {
  const repository = mkdtempSync(join(tmpdir(), "native-lane-repo-"));
  git(repository, ["init", "--initial-branch=main"]);
  writeFileSync(join(repository, "README.md"), "base\n");
  git(repository, ["add", "-A"]);
  git(repository, ["commit", "-m", "base"]);
  const base = git(repository, ["rev-parse", "HEAD"]);
  const worktree = join(mkdtempSync(join(tmpdir(), "native-lane-wt-")), "lane");
  git(repository, ["worktree", "add", "-b", "pi-subagents/worker-lane", worktree, base]);
  writeFileSync(join(worktree, "candidate.txt"), "native lane candidate\n");
  git(worktree, ["add", "-A"]);
  git(worktree, ["commit", "-m", "lane candidate"]);
  const candidate = git(worktree, ["rev-parse", "HEAD"]);
  // pi-subagents' own cleanup removes the worktree and its transient branch; the lane runner's job is
  // to have pinned the candidate somewhere durable first.
  const cleanupLane = () => {
    git(repository, ["worktree", "remove", "--force", worktree]);
    git(repository, ["branch", "-D", "pi-subagents/worker-lane"]);
  };
  return {
    repository,
    worktree,
    base,
    candidate,
    cleanupLane,
    cleanup: () => rmSync(repository, { recursive: true, force: true }),
  };
};

test("a real mutation-capable lane's candidate stays reachable after worktree cleanup", () => {
  const fixture = laneRepository();
  try {
    const settlement = settleNativeLane({
      laneRef,
      topic: "issue/116-native-lane-runner",
      worktree: fixture.worktree,
      git: createNativeLaneGit(),
      repository: fixture.repository,
    });
    assert.equal(settlement.schema, NATIVE_LANE_SETTLEMENT_SCHEMA);
    assert.equal(settlement.decision, "SETTLED");
    assert.equal(settlement.candidate.commit, fixture.candidate);
    assert.equal(settlement.candidate.source, "native_worktree");
    assert.equal(settlement.pinned, true);
    assert.equal(settlement.cleanup.allowed, true);
    assert.equal(settlement.cleanup.durableRef, "refs/heads/issue/116-native-lane-runner");
    assert.equal(git(fixture.repository, ["rev-parse", "issue/116-native-lane-runner^{commit}"]), fixture.candidate);

    fixture.cleanupLane();
    assert.equal(existsSync(fixture.worktree), false);
    assert.equal(gitOrNull(fixture.repository, ["rev-parse", "--verify", "pi-subagents/worker-lane^{commit}"]), null);
    // The settled lane can still be closed from its recorded topic branch.
    assert.equal(git(fixture.repository, ["rev-parse", "issue/116-native-lane-runner^{commit}"]), fixture.candidate);
    assert.equal(git(fixture.repository, ["show", "issue/116-native-lane-runner:candidate.txt"]), "native lane candidate");
  } finally {
    fixture.cleanup();
  }
});

test("a lane whose cleanup already ran is restored from its preserved patch", () => {
  const fixture = laneRepository();
  const patchPath = join(fixture.repository, "preserved.patch");
  try {
    writeFileSync(patchPath, execFileSync("git", [
      "-C", fixture.repository, "diff", "--binary", fixture.base, fixture.candidate,
    ], { encoding: "utf8", env: gitEnv, stdio: ["ignore", "pipe", "ignore"] }));
    const candidateTree = git(fixture.repository, ["rev-parse", `${fixture.candidate}^{tree}`]);
    fixture.cleanupLane();
    // Nothing but the preserved patch survives: the commit is pruned, so re-applying is the only way
    // to reach a candidate again.
    git(fixture.repository, ["reflog", "expire", "--expire=now", "--all"]);
    git(fixture.repository, ["gc", "--prune=now", "--quiet"]);
    assert.equal(gitOrNull(fixture.repository, ["rev-parse", "--verify", `${fixture.candidate}^{commit}`]), null);

    const settlement = settleNativeLane({
      laneRef,
      topic: "issue/116-native-lane-runner",
      worktree: fixture.worktree,
      git: createNativeLaneGit(),
      repository: fixture.repository,
      preserve: { patchPath, baseCommit: fixture.base },
    });
    assert.equal(settlement.decision, "SETTLED");
    assert.equal(settlement.candidate.source, "preserved_patch");
    assert.notEqual(settlement.candidate.commit, fixture.candidate);
    assert.equal(settlement.cleanup.allowed, true);
    // The reconstructed candidate is the lane's work: same tree, reachable from the recorded branch.
    assert.equal(
      git(fixture.repository, ["rev-parse", "issue/116-native-lane-runner^{tree}"]),
      candidateTree,
    );
    assert.equal(git(fixture.repository, ["show", "issue/116-native-lane-runner:candidate.txt"]), "native lane candidate");
  } finally {
    fixture.cleanup();
  }
});

test("a lane that reports no candidate keeps cleanup disallowed", () => {
  const settlement = settleNativeLane({
    laneRef,
    topic: "issue/116-native-lane-runner",
    worktree: "/nonexistent/lane/worktree",
    git: createNativeLaneGit(),
    repository: "/nonexistent/repository",
  });
  assert.equal(settlement.decision, "STOP");
  assert.equal(settlement.stop.code, NATIVE_LANE_STOP_CODES.candidateUnreported);
  assert.equal(settlement.pinned, false);
  assert.equal(settlement.cleanup.allowed, false);
  assert.match(settlement.stop.evidence[0], /reports no candidate commit from its worktree \/nonexistent\/lane\/worktree/u);
});

test("a candidate the native completion evidence contradicts is never pinned", () => {
  const pinned = [];
  const candidate = "e".repeat(40);
  const settlement = settleNativeLane({
    laneRef,
    topic: "issue/116-native-lane-runner",
    worktree: "/lane/worktree",
    expectedCandidate: "f".repeat(40),
    git: {
      revParse: ({ ref }) => (ref === "HEAD" ? candidate : ref === "refs/heads/issue/116-native-lane-runner" ? pinned[0] ?? null : null),
      isAncestor: () => true,
      pin: ({ commit }) => pinned.push(commit),
    },
    repository: "/repository",
  });
  assert.equal(settlement.stop.code, NATIVE_LANE_STOP_CODES.candidateMismatch);
  assert.equal(settlement.cleanup.allowed, false);
  assert.deepEqual(pinned, []);
});

test("a candidate that cannot be read back from the recorded branch keeps cleanup disallowed", () => {
  const candidate = "e".repeat(40);
  const settlement = settleNativeLane({
    laneRef,
    topic: "issue/116-native-lane-runner",
    worktree: "/lane/worktree",
    git: {
      revParse: ({ ref }) => (ref === "HEAD" ? candidate : null),
      isAncestor: () => false,
      pin: () => null,
    },
    repository: "/repository",
  });
  assert.equal(settlement.stop.code, NATIVE_LANE_STOP_CODES.candidateNotDurable);
  assert.equal(settlement.pinned, false);
  assert.equal(settlement.cleanup.allowed, false);
  assert.match(settlement.stop.evidence[1], /resolves from no ref in the repository/u);
});

test("the durability guard names the branch a close owner must find", () => {
  const missing = candidateDurability({
    git: { revParse: () => null, isAncestor: () => false },
    branch: "issue/116-native-lane-runner",
    candidate: "e".repeat(40),
    repository: "/repository",
    worktree: "/lane/worktree",
  });
  assert.equal(missing.proven, false);
  assert.equal(missing.ref, "refs/heads/issue/116-native-lane-runner");
  assert.deepEqual(missing.evidence, [
    "The recorded topic branch issue/116-native-lane-runner resolves from no ref in the repository.",
    "The cleanup owner may not remove /lane/worktree until this ref exists.",
  ]);
  const reachable = candidateDurability({
    git: { revParse: () => "b".repeat(40), isAncestor: ({ ancestor, descendant }) => ancestor === "e".repeat(40) && descendant === "b".repeat(40) },
    branch: "issue/116-native-lane-runner",
    candidate: "e".repeat(40),
    repository: "/repository",
  });
  assert.equal(reachable.proven, true);
  assert.match(reachable.evidence[0], /is reachable from the recorded topic branch/u);
});

test("a lane runner refuses a malformed round", () => {
  assert.throws(() => dispatch({ at: "not-an-instant" }), /Lane reservation timestamp/u);
  assert.throws(() => dispatch({ attempt: 0 }), /positive planned attempt/u);
  assert.throws(() => dispatchNativeLane({ materialization: materialization(), runId, attempt: 1, at }), /agent ceiling/u);
  assert.throws(() => settleNativeLane({ laneRef, git: {} }), /topic branch/u);
  assert.throws(() => settleNativeLane({ laneRef: "", topic: "issue/116", git: {} }), /lane reference/u);
  // A settlement whose Git reader cannot resolve the lane's worktree pins nothing and keeps cleanup
  // disallowed instead of reporting a candidate it never read.
  const unreadable = settleNativeLane({ laneRef, topic: "issue/116-native-lane-runner", worktree: "/lane/worktree", git: {}, repository: "/repository" });
  assert.equal(unreadable.decision, "STOP");
  assert.equal(unreadable.stop.code, NATIVE_LANE_STOP_CODES.candidateUnreported);
  assert.equal(unreadable.cleanup.allowed, false);
});
