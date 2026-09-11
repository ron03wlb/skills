import assert from "node:assert/strict";
import test from "node:test";

import {
  appendDeliveryProgress,
  summarizeDeliveryProgress,
  validateDeliveryProgress,
} from "../../skills/personal/run-issue-workflow/scripts/delivery-progress.mjs";
import { acquireCloseIssueLeases } from "../../skills/engineering/close-issue/scripts/close-lease.mjs";

const issueId = "I_issue";
const operationId = `workflow-op-v1-${"a".repeat(64)}`;
const instant = seconds => `2026-09-11T00:00:${String(seconds).padStart(2, "0")}.000Z`;
const progress = (stage, disposition, sourceAt, overrides = {}) => ({
  type: "delivery.observed",
  at: instant(59),
  issueId,
  operationId,
  stage,
  disposition,
  sourceAt,
  owner: "exact-owner",
  evidenceIdentity: `sha256:${"b".repeat(64)}`,
  requestIdentity: null,
  blockingPredicate: null,
  ...overrides,
});

test("delivery progression keeps distinct owner stages and separate recognition and acceptance metrics", () => {
  const events = [
    progress("COMPLETION_PUBLISHED", "OBSERVED", instant(0)),
    progress("NATIVE_TERMINAL_OBSERVED", "OBSERVED", instant(20)),
    progress("EVIDENCE_VALIDATED", "OBSERVED", instant(25)),
    progress("CLOSE_ELIGIBLE", "ELIGIBLE", instant(30)),
    progress("CLOSE_DISPATCH_INTENT", "INTENT_RECORDED", instant(35), { requestIdentity: "close:1" }),
    progress("NATIVE_CLOSE_ACCEPTED", "ACCEPTED", instant(50), { requestIdentity: "close:1" }),
    progress("REPOSITORY_CLOSE_ACQUIRED", "ACQUIRED", instant(51), { requestIdentity: "close:1" }),
    progress("TARGET_WRITER_ACQUIRED", "ACQUIRED", instant(52), { requestIdentity: "close:1" }),
    progress("CLOSE_COMPLETED", "COMPLETED", instant(55), { requestIdentity: "close:1" }),
  ];
  const summary = summarizeDeliveryProgress(events, issueId, operationId);
  assert.equal(summary.stages.length, 9);
  assert.deepEqual(summary.stages.map(item => item.stage), events.map(item => item.stage));
  assert.equal(summary.publicationToTerminalRecognitionMs, 20_000);
  assert.equal(summary.continuouslyEligibleToNativeCloseAcceptanceMs, 20_000);
  assert.equal(summary.eligibilityInterrupted, false);
  assert.equal(summarizeDeliveryProgress(events.map((event, index) => ({ ...event,
    schema: "workflow-event:v1", sequence: index + 1 })), issueId, operationId).stages.length, 9);
});

test("an exact ineligibility owner interrupts only the eligibility-to-acceptance metric", () => {
  const events = [
    progress("COMPLETION_PUBLISHED", "OBSERVED", instant(0)),
    progress("NATIVE_TERMINAL_OBSERVED", "OBSERVED", instant(10)),
    progress("CLOSE_ELIGIBLE", "ELIGIBLE", instant(20)),
    progress("CLOSE_INELIGIBLE", "BLOCKED", instant(30), {
      owner: "lease-owner",
      blockingPredicate: "repository_close_lease_contended",
    }),
    progress("NATIVE_CLOSE_ACCEPTED", "ACCEPTED", instant(50), { requestIdentity: "close:1" }),
  ];
  const summary = summarizeDeliveryProgress(events, issueId, operationId);
  assert.equal(summary.publicationToTerminalRecognitionMs, 10_000);
  assert.equal(summary.continuouslyEligibleToNativeCloseAcceptanceMs, null);
  assert.equal(summary.eligibilityInterrupted, true);
  assert.equal(summary.stages[3].owner, "lease-owner");
  assert.equal(summary.stages[3].blockingPredicate, "repository_close_lease_contended");
});

test("a genuine eligibility recovery starts a new continuous acceptance interval without poll duplicates", () => {
  const journal = [];
  const writer = { append(event) { const stored = { ...event, schema: "workflow-event:v1",
    sequence: journal.length + 1 }; journal.push(stored); return stored; } };
  const firstEligible = progress("CLOSE_ELIGIBLE", "ELIGIBLE", instant(10));
  const blocked = progress("CLOSE_INELIGIBLE", "BLOCKED", instant(20), {
    owner: "lease-owner", blockingPredicate: "repository_close_lease_contended",
  });
  const recovered = progress("CLOSE_ELIGIBLE", "ELIGIBLE", instant(40));
  for (const event of [firstEligible, { ...firstEligible, sourceAt: instant(11) }, blocked,
    { ...blocked, sourceAt: instant(21) }, recovered,
    progress("NATIVE_CLOSE_ACCEPTED", "ACCEPTED", instant(50), { requestIdentity: "close:1" })]) {
    appendDeliveryProgress({ writer, journal, event });
  }
  assert.deepEqual(journal.map(item => item.stage), ["CLOSE_ELIGIBLE", "CLOSE_INELIGIBLE",
    "CLOSE_ELIGIBLE", "NATIVE_CLOSE_ACCEPTED"]);
  const summary = summarizeDeliveryProgress(journal, issueId, operationId);
  assert.equal(summary.continuouslyEligibleToNativeCloseAcceptanceMs, 10_000);
  assert.equal(summary.eligibilityInterrupted, true);
});

test("delivery observations reject malformed blocking ownership and deduplicate exact source evidence", () => {
  assert.throws(() => validateDeliveryProgress(progress("CLOSE_INELIGIBLE", "BLOCKED", instant(10))),
    /malformed/iu);
  assert.throws(() => validateDeliveryProgress(progress("CLOSE_ELIGIBLE", "ELIGIBLE", instant(10), {
    blockingPredicate: "invented_blocker",
  })), /malformed/iu);
  assert.throws(() => validateDeliveryProgress(progress("CLOSE_COMPLETED", "OBSERVED", instant(10))), /malformed/iu);
  const journal = [];
  const writer = { append(event) { const stored = { ...event, sequence: journal.length + 1 }; journal.push(stored); return stored; } };
  const event = progress("COMPLETION_PUBLISHED", "OBSERVED", instant(0));
  assert.equal(appendDeliveryProgress({ writer, journal, event }).sequence, 1);
  assert.equal(appendDeliveryProgress({ writer, journal, event }).sequence, 1);
  assert.equal(journal.length, 1);
});

test("a later completion flow does not reuse an older native settlement or close acceptance metric", () => {
  const events = [
    progress("COMPLETION_PUBLISHED", "OBSERVED", instant(0), { evidenceIdentity: "completion:1" }),
    progress("NATIVE_TERMINAL_OBSERVED", "OBSERVED", instant(5), { evidenceIdentity: "terminal:1" }),
    progress("CLOSE_ELIGIBLE", "ELIGIBLE", instant(10), { evidenceIdentity: "completion:1" }),
    progress("NATIVE_CLOSE_ACCEPTED", "ACCEPTED", instant(20), { requestIdentity: "close:1" }),
    progress("COMPLETION_PUBLISHED", "OBSERVED", instant(30), { evidenceIdentity: "completion:2" }),
    progress("NATIVE_TERMINAL_OBSERVED", "OBSERVED", instant(35), { evidenceIdentity: "terminal:2" }),
    progress("CLOSE_ELIGIBLE", "ELIGIBLE", instant(40), { evidenceIdentity: "completion:2" }),
    progress("NATIVE_CLOSE_ACCEPTED", "ACCEPTED", instant(55), { requestIdentity: "close:2" }),
  ];
  const summary = summarizeDeliveryProgress(events, issueId, operationId);
  assert.equal(summary.publicationToTerminalRecognitionMs, 5_000);
  assert.equal(summary.continuouslyEligibleToNativeCloseAcceptanceMs, 15_000);
});

test("the close owner exposes lease acquisition and completion timestamps while both leases remain current", () => {
  const calls = [];
  const lease = name => ({
    assertCurrent() { calls.push(`assert:${name}`); },
    release() { calls.push(`release:${name}`); },
  });
  const store = {
    gitCommonDir: "C:/repo/.git",
    acquireRepositoryCloseLease() { calls.push("acquire:repository"); return lease("repository"); },
    acquireTargetMutationWriter() { calls.push("acquire:target"); return lease("target"); },
  };
  const leases = acquireCloseIssueLeases({
    store,
    target: "features/ron",
    repositoryId: "github:example/repo",
    specId: "I_spec",
    approvedPublicationIdentity: `sha256:${"c".repeat(64)}`,
    issueId,
  });
  const acquired = leases.deliveryProgress();
  assert.match(acquired.repositoryCloseAcquiredAt, /Z$/u);
  assert.match(acquired.targetWriterAcquiredAt, /Z$/u);
  assert.equal(acquired.closeCompletedAt, null);
  const completed = leases.markCompleted();
  assert.match(completed.closeCompletedAt, /Z$/u);
  assert.deepEqual(calls.slice(0, 4), ["acquire:repository", "acquire:target", "assert:repository", "assert:target"]);
  leases.release();
  assert.deepEqual(calls.slice(-2), ["release:target", "release:repository"]);
});
