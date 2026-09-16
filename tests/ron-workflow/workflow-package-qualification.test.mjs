import assert from "node:assert/strict";
import test from "node:test";

import {
  readWorkflowCapability,
  readWorkflowQualificationIdentity,
  runWorkflowRepairQualification,
  unavailableQualificationObjectives,
  workflowFixtureRevision,
  workflowQualificationFailureSignatures,
  workflowQualificationStages,
} from "../../skills/personal/run-issue-workflow/scripts/workflow-repair-qualification.mjs";

const packageVersionId = "a".repeat(64);

test("the package-owned qualification retains three identical WSL component-fixture observations", {
  timeout: 180000,
}, async () => {
  const result = await runWorkflowRepairQualification({ packageVersionId });
  assert.equal(result.schema, "workflow-repair-qualification:v1");
  assert.deepEqual(Object.keys(result.boundInputs).sort(), [
    "capabilityIdentity",
    "fixtureDigest",
    "fixtureRevision",
    "packageVersionId",
    "runtime",
  ]);
  assert.equal(result.boundInputs.packageVersionId, packageVersionId);
  assert.equal(result.boundInputs.fixtureRevision, workflowFixtureRevision);
  assert.match(result.boundInputs.fixtureDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(
    result.boundInputs.runtime,
    `${process.platform}-${process.arch}`,
  );
  assert.match(result.boundInputs.capabilityIdentity, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.observations.length, 3);
  assert.deepEqual(
    result.observations.map(({ run }) => run),
    [1, 2, 3],
  );
  assert.ok(
    result.observations.every(
      ({ durationMs, observedAt }) =>
        durationMs >= 0 && Number.isFinite(Date.parse(observedAt)),
    ),
  );
  const stages = result.observations.flatMap(({ stages: run }) => run);
  assert.equal(stages.length, 9);
  assert.deepEqual(
    [...new Set(stages.map(({ stage }) => stage))].sort(),
    [...workflowQualificationStages].sort(),
  );
  assert.ok(
    stages.every(
      (stage) =>
        stage.result === "PASS" &&
        stage.failureSignature ===
          workflowQualificationFailureSignatures[stage.stage],
    ),
  );
  const bindings = new Set(
    stages.map((stage) =>
      JSON.stringify([
        stage.packageVersionId,
        stage.fixtureRevision,
        stage.fixtureDigest,
        stage.runtime,
        stage.capabilityIdentity,
      ]),
    ),
  );
  assert.equal(
    bindings.size,
    1,
    "every retained stage result is bound to the same installed identity",
  );
  assert.ok(
    stages.every(
      (stage) =>
        stage.packageVersionId === result.boundInputs.packageVersionId &&
        stage.fixtureRevision === result.boundInputs.fixtureRevision &&
        stage.fixtureDigest === result.boundInputs.fixtureDigest &&
        stage.runtime === result.boundInputs.runtime &&
        stage.capabilityIdentity === result.boundInputs.capabilityIdentity,
    ),
  );
});

test("the WSL capability descriptor is complete and separately hashed", () => {
  const capability = readWorkflowCapability();
  assert.deepEqual(Object.keys(capability).sort(), [
    "arch",
    "kernelRelease",
    "node",
    "platform",
    "wslDistro",
  ]);
  assert.equal(capability.platform, "linux");
  assert.ok(capability.arch.length > 0);
  assert.ok(capability.node.length > 0);
  assert.match(capability.kernelRelease, /WSL/iu);
  assert.ok(capability.wslDistro.length > 0);
});

test("an unreadable kernel release or a non-Linux platform stays UNKNOWN without readiness", async () => {
  const capability = {
    platform: "linux",
    arch: "x64",
    node: "v24.0.0",
    kernelRelease: "6.6.0-microsoft-standard-WSL2",
    wslDistro: "Ubuntu",
  };
  const nonLinux = await readWorkflowQualificationIdentity({
    packageVersionId,
    readCapability: () => ({
      ...capability,
      platform: "win32",
      kernelRelease: null,
      wslDistro: null,
    }),
  });
  assert.deepEqual(nonLinux, {
    state: "UNKNOWN",
    reason: "WSL qualification requires a Linux runtime",
  });
  assert.equal(
    nonLinux.boundInputs,
    undefined,
    "an UNKNOWN capability can never be reused",
  );
  const unreadable = await readWorkflowQualificationIdentity({
    packageVersionId,
    readCapability: () => ({ ...capability, kernelRelease: null }),
  });
  assert.equal(unreadable.state, "UNKNOWN");
  assert.match(unreadable.reason, /kernel release is unreadable/u);
  const unmarked = await readWorkflowQualificationIdentity({
    packageVersionId,
    readCapability: () => ({ ...capability, wslDistro: null }),
  });
  assert.equal(unmarked.state, "UNKNOWN");
  assert.match(unmarked.reason, /distro marker/u);
  const unclean = await readWorkflowQualificationIdentity({
    packageVersionId,
    readCapability: () => capability,
    probePosixCleanup: async () => {
      throw new Error("cleanup unavailable");
    },
  });
  assert.equal(unclean.state, "UNKNOWN");
  assert.match(unclean.reason, /cleanup could not be proven/u);
});

test("every objective this WSL component fixture cannot exercise is reported unavailable", () => {
  const objectives = Object.entries(unavailableQualificationObjectives);
  assert.equal(objectives.length, 5);
  for (const [objective, evidence] of objectives) {
    assert.ok(objective.length > 0);
    assert.deepEqual(Object.keys(evidence).sort(), ["reason", "state"]);
    assert.equal(evidence.state, "unavailable");
    assert.ok(
      evidence.reason.length > 20,
      `${objective} must state why it is unavailable`,
    );
  }
});
