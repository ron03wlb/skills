// The setup bootstrap re-derived on the substrate ADR-0080 selects (Issue #122, Decomposition key
// `114/06` of Spec #114). The retired `pi-workflow` prerequisite set — the launched bundle root, the
// installed `@earendil-works/pi-coding-agent` resolution, the lane worker agent at the harness
// pi-agent directory, the target repository ignoring the run work area, and the
// `gh api --paginate --slurp` capability — probed green while Run #108 implemented, verified and
// committed Issue #109's candidate and the lane still never settled. These tests pin the three
// published criteria: every re-derived criterion names its prerequisite and no criterion is reused
// whose prerequisite set cannot detect the failure class (AC-1), one bounded plan, one acceptance and
// owner sequencing are preserved (AC-2), and an unproven required capability returns the attributable
// not-ready verdict instead of `READY` (AC-3).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LANE_SETTLEMENT_DIAGNOSTIC_STATES,
  LANE_SETTLEMENT_SURFACE,
  LANE_SETTLEMENT_VERDICTS,
  requireLaneSettlement,
} from "../../skills/personal/run-issue-workflow/scripts/lane-settlement-capability.mjs";

const read = (path) => readFileSync(path, "utf8");
const setupSkillPath = "skills/engineering/setup-matt-pocock-skills/SKILL.md";
const diagnosticsPath = "skills/engineering/setup-matt-pocock-skills/installed-workflow-diagnostics.md";
const setupDocsPath = "docs/engineering/setup-matt-pocock-skills.md";

const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}`);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const rest = text.slice(start + 1);
  const end = rest.indexOf("\n## ", 1);
  return end === -1 ? rest : rest.slice(0, end);
};

test("AC-1: every re-derived criterion names the prerequisite it depends on and no retired probe is reused", () => {
  const diagnostics = read(diagnosticsPath);
  const criteria = section(diagnostics, "Re-derived bootstrap criteria");
  const former = section(diagnostics, "Former prerequisites, re-derived");

  // Each criterion row names the prerequisite it depends on, the owning source that proves or repairs
  // it, and the read-only proof. A row without one of those is not a re-derived criterion.
  assert.match(criteria, /Prerequisite it depends on.*Owning source that proves or repairs it.*Read-only proof/isu);
  for (const id of ["R-1", "R-2", "R-3", "R-4", "R-5"]) {
    const row = criteria.split("\n").find((line) => line.startsWith(`| ${id} |`));
    assert.ok(row, `missing re-derived criterion ${id}`);
    const cells = row.split("|");
    assert.equal(cells.length, 7, `${id} must fill every criterion column`);
    for (const column of cells.slice(2, 6)) {
      assert.ok(column.trim().length > 0, `${id} leaves a criterion column empty`);
    }
  }

  // The re-derivation rule itself: a prerequisite whose probe cannot detect the failure class is not
  // carried forward.
  assert.match(criteria, /prerequisite is kept only while its own probe can detect the failure class the criterion names.*retired or replaced/isu);

  // Every former prerequisite is re-derived with a verdict rather than reused silently.
  for (const [name, verdict] of [
    ["delivered bundle root that contains its own module graph", "Retired"],
    ["@earendil-works/pi-coding-agent` resolution from the installed `pi-workflow` package", "Retired"],
    ["lane worker agent at the harness pi-agent directory", "Re-derived"],
    ["target repository ignoring `pi-workflow`'s run area", "Replaced"],
    ["gh api --paginate --slurp` support", "Kept"],
  ]) {
    const row = former.split("\n").find((line) => line.includes(name));
    assert.ok(row, `former prerequisite not re-derived: ${name}`);
    assert.match(row, new RegExp(`\\|\\s*${verdict}`, "u"), `${name} is not marked ${verdict}`);
  }

  // The retired probes are named once, as retired, and never as a required observation again: the
  // bundle-root validation and the pi-workflow-specific lane agent roots both probed green over the
  // measured failure class.
  const requiredObservations = section(diagnostics, "Required observations");
  assert.doesNotMatch(diagnostics, /validate the delivery host bundle/iu);
  for (const retired of [/bundle root/iu, /@earendil-works/iu, /pi-agent directory/iu]) {
    assert.doesNotMatch(criteria, retired, "a re-derived criterion still uses a retired prerequisite");
    assert.doesNotMatch(requiredObservations, retired, "a required observation still uses a retired prerequisite");
  }

  // The two re-derived surface rows: the retained bundle-free installed-entry proof, and the lane
  // worker agent judged at the root the selected substrate itself declares.
  assert.match(requiredObservations, /Installed host entry and retained version \|[\s\S]*?never a readiness prerequisite/iu);
  assert.match(requiredObservations, /Lane worker agent \|[\s\S]*?substrate's own read-back[\s\S]*?`MISSING`[\s\S]*?`UNKNOWN`/iu);
  assert.match(requiredObservations, /Lane worker agent \|[\s\S]*?agents\/worker\.md/u);

  // `gh api --paginate --slurp` survives, with the owning source that proves it.
  assert.match(criteria, /github-producer-transport\.mjs/u);
  assert.match(diagnostics, /`gh api --paginate --slurp` support \| Kept/u);

  // The published criteria each name their prerequisite, not only the internal table.
  const workingIf = section(read(setupDocsPath), "It's working if");
  const criteriaBullets = workingIf.split("\n").filter((line) => line.startsWith("- "));
  assert.ok(criteriaBullets.length >= 6, "the published criteria list is missing");
  for (const bullet of criteriaBullets) {
    assert.match(bullet, /\*\*prerequisite\*\*: .+/u, `published criterion omits its prerequisite: ${bullet.slice(0, 80)}`);
  }
});

test("AC-2: one bounded plan, one explicit acceptance and owner sequencing are preserved", () => {
  const skill = read(setupSkillPath);
  const docs = read(setupDocsPath);

  for (const [surface, text] of [["setup SKILL.md", skill], ["setup docs", docs]]) {
    assert.match(text, /one bounded plan/iu, `${surface} does not present one bounded plan`);
    assert.match(text, /no mutation of any kind before one explicit human acceptance|no mutation before one explicit human acceptance/iu,
      `${surface} does not gate mutation behind one explicit acceptance`);
    assert.match(text, /dependency order.*receipt/isu, `${surface} does not sequence owners and read their receipts`);
    assert.match(text, /never reproduc\w*\s+(?:a|their)\s+package building, installation, binding, tracker mutation, recovery or receipt logic/isu,
      `${surface} does not preserve the one-owner-per-seam boundary`);
    assert.match(text, /fresh acceptance|new acceptance/iu, `${surface} does not require a fresh acceptance for a changed plan`);
    assert.match(text, /never re-asked|already accepted is never re-asked/iu, `${surface} re-asks an unchanged accepted operation`);
  }

  // One plan and one acceptance happen once, before the writes: the plan section precedes the write
  // section, and the write section is the one that sequences the owners.
  const planHeading = skill.indexOf("### 3. Present one bounded plan and take one acceptance");
  const writeHeading = skill.indexOf("### 4. Write, and sequence the owners");
  const doneHeading = skill.indexOf("### 5. Done");
  assert.equal(planHeading !== -1 && writeHeading > planHeading && doneHeading > writeHeading, true,
    "setup must present and accept the plan once, then write, then report");
  assert.equal(skill.indexOf("perform no mutation of any kind before that one explicit acceptance") < writeHeading, true,
    "the acceptance gate must precede every write");
  assert.match(skill.slice(writeHeading, doneHeading), /never reproduces their package building, installation, binding, tracker mutation, recovery or receipt logic/iu);
});

test("AC-3: an unproven required capability returns the attributable not-ready verdict", () => {
  const diagnostics = read(diagnosticsPath);
  const reduction = section(diagnostics, "Truthful readiness reduction");

  assert.match(reduction, /reduces readiness from the seam verdicts; it never upgrades one/iu);
  assert.match(reduction, /`READY` requires every required seam.*to read `PRESENT`/isu);
  assert.match(reduction, /not-ready verdict with exactly one attributable blocker per unproven prerequisite: the owning source, the observed evidence, and the smallest human action/isu);
  assert.match(reduction, /lane settlement, which reads `PRESENT` only from its owning probe's `PROVEN` verdict/iu);
  // The boundary: setup reads another owner's verdict and never re-derives or repairs it.
  assert.match(reduction, /does not create, install, bind, repair or re-derive a verdict another owner holds/iu);
  assert.match(reduction, /re-reads its authority at its own boundary/iu);
  assert.match(read(setupDocsPath), /not-ready verdict with one attributable blocker per unproven prerequisite/iu);

  // The contract's vocabulary is the owning probe's vocabulary: `PRESENT` is only the probe's
  // `PROVEN`, and the withheld verdicts are the probe's own non-ready states.
  assert.equal(LANE_SETTLEMENT_DIAGNOSTIC_STATES.PROVEN, "PRESENT");
  assert.deepEqual(Object.keys(LANE_SETTLEMENT_DIAGNOSTIC_STATES), LANE_SETTLEMENT_VERDICTS);
  assert.equal(LANE_SETTLEMENT_DIAGNOSTIC_STATES.PROVEN !== LANE_SETTLEMENT_DIAGNOSTIC_STATES.MISSING_CAPABILITY, true);
  assert.match(section(diagnostics, "Required observations"), /lane-settlement-capability\.mjs[\s\S]*?`READY` only while this seam is `PRESENT`/iu);

  // The measured failure class — a mutation-capable lane whose work finished with no settled terminal
  // outcome, exactly as Run #108 recorded it — is one attributable blocker, not a plan that completes.
  const substrate = "pi-subagents";
  assert.throws(
    () => requireLaneSettlement({
      substrate,
      lanes: [{
        laneRef: "dispatch_I_109_1",
        capability: "mutate",
        worktree: "managed",
        work: "finished",
        settlement: "absent",
        recorded: ["candidate c3bb89f committed", "tasks/task-2/result.json absent"],
      }],
    }),
    (error) => error.code === "lane_settlement_missing_capability"
      && error.state === "MISSING_CAPABILITY"
      && error.surface === LANE_SETTLEMENT_SURFACE
      && error.owner === substrate
      && typeof error.action === "string" && error.action.length > 0
      && typeof error.reason === "string" && error.reason.length > 0,
    "an unproven lane settlement must return one attributable blocker",
  );
});
