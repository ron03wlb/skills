// Lane settlement is a required readiness surface: a substrate that cannot settle a mutation-capable
// managed-worktree lane cannot complete a Run, and a probe set that never observed one reports green over
// that class. These tests pin the withheld `READY`, the detection of the measured failure class, and the
// single attributable blocker naming its owning source.
import assert from "node:assert/strict";
import test from "node:test";

import {
  LANE_SETTLEMENT_DIAGNOSTIC_STATES,
  LANE_SETTLEMENT_SCHEMA,
  LANE_SETTLEMENT_STOP_CODES,
  LANE_SETTLEMENT_SURFACE,
  assessLaneSettlement,
  requireLaneSettlement,
} from "../../skills/personal/run-issue-workflow/scripts/lane-settlement-capability.mjs";

const substrate = "pi-subagents@0.68.0";

// The lane as its own owner recorded it. `capability`, `worktree`, `work` and `settlement` are exactly
// the four facts the probe reads; `recorded` is the substrate's own evidence, quoted in the verdict.
const lane = (overrides = {}) => ({
  laneRef: "dispatch_I_child_1",
  capability: "mutate",
  worktree: "managed",
  work: "finished",
  settlement: "settled",
  ...overrides,
});

const assess = (lanes) => assessLaneSettlement({ substrate, lanes });

// The measured Run #108 lane: the Issue was implemented and reviewed and its candidate committed while
// the lane never settled — no terminal record, the Run left `suspended_waiting_children`.
const measuredUnsettled = lane({
  laneRef: "dispatch_I_109_1",
  settlement: "absent",
  recorded: [
    "candidate c3bb89f committed on topic branch issue/109-github-to-spec",
    "final envelope written to tasks/task-2/output.log",
    "tasks/task-2/result.json absent",
  ],
});
const readOnlySettled = lane({ laneRef: "read-only-1", capability: "read-only", settlement: "settled" });

test("readiness is withheld for every verdict but a proven lane settlement", () => {
  const proven = assess([lane()]);
  assert.equal(proven.schema, LANE_SETTLEMENT_SCHEMA);
  assert.equal(proven.surface, LANE_SETTLEMENT_SURFACE);
  assert.equal(proven.state, "PROVEN");
  assert.equal(proven.diagnosticState, "PRESENT");
  assert.equal(proven.ready, true);
  assert.equal(proven.blocker, null);
  assert.deepEqual(proven.evidence.settled, ["dispatch_I_child_1"]);
  assert.equal(requireLaneSettlement({ substrate, lanes: [lane()] }).ready, true);

  const withheld = [
    ["MISSING_CAPABILITY", "MISSING", assess([measuredUnsettled])],
    ["UNPROVEN", "MISSING", assess([lane({ settlement: "absent", work: "in-progress" })])],
    ["UNKNOWN", "UNKNOWN", assess([lane({ settlement: "unknown" })])],
  ];
  for (const [state, diagnosticState, verdict] of withheld) {
    assert.equal(verdict.state, state);
    assert.equal(verdict.ready, false, `${state} must never return READY`);
    // The seam row a readiness report prints, in the diagnostics contract's own vocabulary.
    assert.equal(verdict.diagnosticState, diagnosticState);
    assert.equal(LANE_SETTLEMENT_DIAGNOSTIC_STATES[state], diagnosticState);
    assert.notEqual(verdict.blocker, null, `${state} must carry the attributable blocker`);
    assert.equal(verdict.blocker.surface, LANE_SETTLEMENT_SURFACE);
    assert.equal(verdict.blocker.owner, substrate);
    assert.throws(() => requireLaneSettlement({ substrate, lanes: [measuredUnsettled] }), /capability is unproven/u);
  }
});

test("the measured failure class is detected instead of probed green over", () => {
  // The false-green view: the only lane the earlier probe set exercised was read-only, and it settled.
  const falseGreen = assess([readOnlySettled]);
  assert.equal(falseGreen.ready, false, "a read-only lane never proves a mutation-capable lane settles");
  assert.equal(falseGreen.state, "UNPROVEN");
  assert.match(falseGreen.reason, /read-only lane never proves this surface/u);

  // The same read-only settlement plus the measured mutation-capable lane: now the class is detected.
  const detected = assess([readOnlySettled, measuredUnsettled]);
  assert.equal(detected.state, "MISSING_CAPABILITY");
  assert.equal(detected.ready, false);
  assert.deepEqual(detected.evidence.settled, [], "a read-only settlement is not this surface's evidence");
  assert.deepEqual(detected.evidence.unfinished, ["dispatch_I_109_1"]);
  assert.match(detected.reason, /dispatch_I_109_1 finished its recorded work with no settled terminal outcome/u);
  assert.match(detected.reason, /candidate c3bb89f committed/u);
});

test("the blocker is one attributable capability naming its owning source and smallest human action", () => {
  const lanes = [measuredUnsettled, lane({ laneRef: "dispatch_I_child_2", settlement: "absent" })];
  const verdict = assess(lanes);
  assert.equal(verdict.state, "MISSING_CAPABILITY");
  // One blocker for the whole surface, never one per lane.
  assert.equal(Array.isArray(verdict.blocker), false);
  assert.deepEqual(verdict.blocker, {
    code: LANE_SETTLEMENT_STOP_CODES.missingCapability,
    surface: LANE_SETTLEMENT_SURFACE,
    owner: substrate,
    reason: verdict.reason,
    action: `Install or select a ${substrate} release that settles a mutation-capable managed-worktree lane, `
      + "then re-read its lane record before dispatching any lane.",
  });

  let thrown = null;
  try {
    requireLaneSettlement({ substrate, lanes });
  } catch (error) {
    thrown = error;
  }
  for (const field of ["surface", "owner", "reason", "action", "code", "state"]) {
    assert.equal(thrown?.[field], field === "code" ? LANE_SETTLEMENT_STOP_CODES.missingCapability : verdict[field]);
  }
});

test("a lane that is still working is unproven, not a missing capability", () => {
  const verdict = assess([lane({ settlement: "absent", work: "in-progress" }), lane({ laneRef: "lane-2", settlement: "absent", work: "none" })]);
  assert.equal(verdict.state, "UNPROVEN");
  assert.equal(verdict.ready, false);
  assert.equal(verdict.blocker.code, LANE_SETTLEMENT_STOP_CODES.unproven);
  assert.deepEqual(verdict.evidence.inFlight, ["dispatch_I_child_1", "lane-2"]);
  assert.match(verdict.reason, /has settled yet/u);
});

test("unreadable lane evidence fails closed even beside a settled lane", () => {
  const verdict = assess([lane(), lane({ laneRef: "lane-2", settlement: "unknown" })]);
  assert.equal(verdict.state, "UNKNOWN");
  assert.equal(verdict.ready, false);
  assert.equal(verdict.blocker.code, LANE_SETTLEMENT_STOP_CODES.unknown);
  assert.deepEqual(verdict.evidence.unreadable, ["lane-2"]);
  assert.match(verdict.reason, /unreadable for lane-2/u);
});

test("only a mutation-capable lane in its own managed worktree is evidence", () => {
  for (const notEvidence of [readOnlySettled, lane({ capability: "mutate", worktree: "shared" })]) {
    const verdict = assess([notEvidence]);
    assert.equal(verdict.state, "UNPROVEN", `${notEvidence.worktree} ${notEvidence.capability} must not prove the surface`);
    assert.deepEqual(verdict.evidence.settled, []);
  }
  // A settled managed lane proves the surface even while another lane of the same substrate is in flight.
  const mixed = assess([lane(), lane({ laneRef: "lane-2", settlement: "absent", work: "in-progress" })]);
  assert.equal(mixed.state, "PROVEN");
  assert.equal(mixed.ready, true);
});

test("malformed input is refused instead of guessed", () => {
  assert.throws(() => assessLaneSettlement({}), /selected delivery substrate/u);
  assert.throws(() => assessLaneSettlement({ substrate, lanes: null }), /observed lane list/u);
  assert.throws(() => assessLaneSettlement({ substrate, lanes: [{ capability: "mutate" }] }), /must name its lane/u);
  assert.throws(() => assessLaneSettlement({ substrate, lanes: [lane({ recorded: [1] })] }), /record its own facts as text/u);
});
