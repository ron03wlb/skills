// Readiness surface: the selected delivery substrate must settle a mutation-capable lane.
//
// ADR-0080 makes lane settlement a required public surface of readiness, beside the prerequisites
// ADR-0079 already names: a Run whose Issue lanes are materialized on a substrate that cannot record a
// terminal outcome for a mutation-capable, worktree-isolated lane can never complete, whatever the Spec
// says. This module owns that one surface and its read-only probe.
//
// The failure class is measured, not argued. `@agwab/pi-workflow@0.13.8` ran a mutation-capable lane to
// completion — the Issue was implemented and reviewed and its candidate committed (`c3bb89f`, Run #108)
// — while the lane never settled, so the Run stayed `suspended_waiting_children` and no close request
// could ever be serialized (`docs/agents/pi-workflow-fit-evidence.md`, AC-2). A read-only lane settles
// on a different code path, so a probe set that only ever observed a read-only lane reports green over
// exactly this class.
//
// The probe reads the lane evidence the selected substrate itself recorded and decides the verdict. It
// never launches, retries, replaces, settles or kills a lane, and it grants no delivery, close,
// integration or dispatch authority.
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const freeze = (value) => Object.freeze(value);

export const LANE_SETTLEMENT_SCHEMA = "lane-settlement-capability:v1";
// The one surface this probe owns. Readiness names it in full when it withholds `READY`.
export const LANE_SETTLEMENT_SURFACE = "mutation-capable lane settlement";
// `PROVEN` is the only verdict readiness may claim `READY` from. `MISSING_CAPABILITY` is the measured
// failure class: a mutation-capable lane finished its work and the substrate still recorded no terminal
// outcome for it. `UNPROVEN` is an unproven surface, and `UNKNOWN` fails closed on unreadable evidence.
export const LANE_SETTLEMENT_VERDICTS = Object.freeze(["PROVEN", "MISSING_CAPABILITY", "UNPROVEN", "UNKNOWN"]);
export const LANE_SETTLEMENT_STOP_CODES = Object.freeze({
  missingCapability: "lane_settlement_missing_capability",
  unproven: "lane_settlement_unproven",
  unknown: "lane_settlement_unknown",
});
// The probe's verdict as the readiness seam row reports it, so a not-ready verdict is one row with the
// owning source and the smallest human action rather than prose a report has to reinterpret.
export const LANE_SETTLEMENT_DIAGNOSTIC_STATES = Object.freeze({ PROVEN: "PRESENT", MISSING_CAPABILITY: "MISSING", UNPROVEN: "MISSING", UNKNOWN: "UNKNOWN" });
// The lane shapes that make one lane evidence for this surface. Only a mutation-capable lane in its own
// managed worktree is on the delivery path, and only its own settlement proves the capability.
export const LANE_SETTLEMENT_EVIDENCE = Object.freeze({ capability: "mutate", worktree: "managed" });
export const LANE_CAPABILITIES = Object.freeze(["read-only", "mutate"]);
export const LANE_WORKTREES = Object.freeze(["managed", "shared"]);
export const LANE_WORK_STATES = Object.freeze(["none", "in-progress", "finished"]);
export const LANE_SETTLEMENT_STATES = Object.freeze(["settled", "absent"]);

// The smallest human action at the owning source. Dispatch stays blocked until it happens: a plan that
// cannot complete is not a readiness report.
const smallestAction = (substrate) => `Install or select a ${substrate} release that settles a mutation-capable managed-worktree lane, `
  + "then re-read its lane record before dispatching any lane.";

// One lane observation, as the selected substrate recorded it. A lane whose values this probe cannot read
// is reported unreadable rather than assumed settled.
const readLane = (entry, index) => {
  if (!isRecord(entry)) throw new TypeError(`Observed lane ${index} must be an object`);
  if (!isText(entry.laneRef)) throw new TypeError(`Observed lane ${index} must name its lane`);
  if (entry.recorded !== undefined && (!Array.isArray(entry.recorded) || !entry.recorded.every(isText))) {
    throw new TypeError(`Observed lane ${index} must record its own facts as text`);
  }
  const readable = LANE_CAPABILITIES.includes(entry.capability) && LANE_WORKTREES.includes(entry.worktree)
    && LANE_WORK_STATES.includes(entry.work) && LANE_SETTLEMENT_STATES.includes(entry.settlement);
  return {
    laneRef: entry.laneRef,
    readable,
    mutates: entry.capability === LANE_SETTLEMENT_EVIDENCE.capability,
    managed: entry.worktree === LANE_SETTLEMENT_EVIDENCE.worktree,
    work: entry.work,
    settlement: entry.settlement,
    recorded: entry.recorded ?? [],
  };
};

const blockerFor = ({ state, surface, owner, reason, action }) => freeze({
  code: state === "MISSING_CAPABILITY" ? LANE_SETTLEMENT_STOP_CODES.missingCapability
    : state === "UNKNOWN" ? LANE_SETTLEMENT_STOP_CODES.unknown : LANE_SETTLEMENT_STOP_CODES.unproven,
  surface, owner, reason, action,
});

const verdictFor = ({ substrate, state, reason, evidence }) => {
  const surface = LANE_SETTLEMENT_SURFACE;
  const owner = substrate;
  const action = smallestAction(substrate);
  if (!LANE_SETTLEMENT_VERDICTS.includes(state)) throw new TypeError(`Unsupported lane settlement verdict ${state}`);
  return freeze({
    schema: LANE_SETTLEMENT_SCHEMA,
    surface,
    substrate,
    owner,
    action,
    state,
    // AC-1: readiness may claim `READY` only from this member, and only a settled mutation-capable
    // managed-worktree lane sets it.
    ready: state === "PROVEN",
    diagnosticState: LANE_SETTLEMENT_DIAGNOSTIC_STATES[state],
    evidence: freeze({
      settled: freeze([...evidence.settled]),
      unfinished: freeze([...evidence.unfinished]),
      inFlight: freeze([...evidence.inFlight]),
      unreadable: freeze([...evidence.unreadable]),
    }),
    reason,
    blocker: state === "PROVEN" ? null : blockerFor({ state, surface, owner, reason, action }),
  });
};

// One exact attributable verdict for the selected substrate, computed only from the lane evidence the
// substrate itself recorded. `lanes` is that read-only observation: each lane names its own capability,
// worktree isolation, work state and settlement state, exactly as its owner recorded them.
export function assessLaneSettlement({ substrate, lanes } = {}) {
  if (!isText(substrate)) throw new TypeError("Lane settlement readiness needs the selected delivery substrate");
  if (!Array.isArray(lanes)) throw new TypeError("Lane settlement readiness needs the observed lane list");
  const observed = lanes.map(readLane);
  const unreadable = observed.filter((lane) => !lane.readable).map((lane) => lane.laneRef);
  // A read-only lane and a lane outside its own managed worktree are not this surface's evidence: their
  // settlement never proves that a mutation-capable lane settles, which is the class that was missed.
  const evidence = observed.filter((lane) => lane.readable && lane.mutates && lane.managed);
  const settled = evidence.filter((lane) => lane.settlement === "settled").map((lane) => lane.laneRef);
  const unfinished = evidence.filter((lane) => lane.settlement === "absent" && lane.work === "finished");
  const inFlight = evidence.filter((lane) => lane.settlement === "absent" && lane.work !== "finished").map((lane) => lane.laneRef);
  const facts = unfinished.flatMap((lane) => lane.recorded.map((fact) => `${lane.laneRef}: ${fact}`));

  // Unreadable evidence is checked first: a record this probe cannot read could be hiding the very
  // failure class, so it can never be read as a settled lane.
  if (unreadable.length > 0) {
    return verdictFor({ substrate, state: "UNKNOWN", evidence: { settled, unfinished: unfinished.map((lane) => lane.laneRef), inFlight, unreadable },
      reason: `The selected substrate's lane record is unreadable for ${unreadable.join(", ")}, so lane settlement cannot be proven.` });
  }
  if (unfinished.length > 0) {
    return verdictFor({ substrate, state: "MISSING_CAPABILITY", evidence: { settled, unfinished: unfinished.map((lane) => lane.laneRef), inFlight, unreadable },
      reason: `Mutation-capable managed-worktree lane ${unfinished.map((lane) => lane.laneRef).join(", ")} finished its recorded work with no settled terminal outcome`
        + `${facts.length === 0 ? "" : ` (${facts.join("; ")})`}, so the substrate cannot settle a mutation-capable lane.` });
  }
  if (settled.length > 0) {
    return verdictFor({ substrate, state: "PROVEN", evidence: { settled, unfinished: [], inFlight, unreadable },
      reason: `Mutation-capable managed-worktree lane ${settled.join(", ")} reached a settled terminal outcome.` });
  }
  return verdictFor({ substrate, state: "UNPROVEN", evidence: { settled, unfinished: [], inFlight, unreadable },
    reason: evidence.length === 0
      ? "No mutation-capable managed-worktree lane was observed, and a read-only lane never proves this surface."
      : `No mutation-capable managed-worktree lane has settled yet (${inFlight.join(", ")} still in flight).` });
}

// The gate a readiness report calls before it claims `READY`. Anything but a proven surface throws the
// one attributable blocker, so an unproven capability can never be reported as a plan that will complete.
export function requireLaneSettlement(input) {
  const verdict = assessLaneSettlement(input);
  if (verdict.ready) return verdict;
  const { surface, owner, reason, action, state, blocker } = verdict;
  throw Object.assign(
    new Error(`Required delivery-substrate capability is unproven (${surface}); ${owner} must repair it: ${reason}; smallest human action: ${action}`),
    { code: blocker.code, state, surface, owner, reason, action, verdict },
  );
}
