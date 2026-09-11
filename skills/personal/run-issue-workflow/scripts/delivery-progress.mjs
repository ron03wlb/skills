import { createHash } from "node:crypto";

export const DELIVERY_PROGRESS_EVENT = "delivery.observed";
export const DELIVERY_STAGES = Object.freeze([
  "COMPLETION_PUBLISHED",
  "NATIVE_TERMINAL_OBSERVED",
  "EVIDENCE_VALIDATED",
  "CLOSE_ELIGIBLE",
  "CLOSE_INELIGIBLE",
  "CLOSE_DISPATCH_INTENT",
  "NATIVE_CLOSE_ACCEPTED",
  "REPOSITORY_CLOSE_ACQUIRED",
  "TARGET_WRITER_ACQUIRED",
  "CLOSE_COMPLETED",
  "PROGRESS_DIAGNOSED",
]);

const fields = new Set([
  "type", "at", "issueId", "operationId", "stage", "disposition", "sourceAt",
  "owner", "evidenceIdentity", "requestIdentity", "blockingPredicate",
]);
const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const operation = /^workflow-op-v1-[a-f0-9]{64}$/u;
const stageDispositions = Object.freeze({
  COMPLETION_PUBLISHED: "OBSERVED",
  NATIVE_TERMINAL_OBSERVED: "OBSERVED",
  EVIDENCE_VALIDATED: "OBSERVED",
  CLOSE_ELIGIBLE: "ELIGIBLE",
  CLOSE_INELIGIBLE: "BLOCKED",
  CLOSE_DISPATCH_INTENT: "INTENT_RECORDED",
  NATIVE_CLOSE_ACCEPTED: "ACCEPTED",
  REPOSITORY_CLOSE_ACQUIRED: "ACQUIRED",
  TARGET_WRITER_ACQUIRED: "ACQUIRED",
  CLOSE_COMPLETED: "COMPLETED",
  PROGRESS_DIAGNOSED: "DIAGNOSED",
});
const text = value => typeof value === "string" && value.length > 0 && value.length <= 1024;
const time = value => instant.test(value) && new Date(value).toISOString() === value;

export function validateDeliveryProgress(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)
    || Object.keys(event).some(field => !fields.has(field))
    || [...fields].some(field => !Object.hasOwn(event, field))) throw new TypeError("Delivery progress fields are malformed");
  if (event.type !== DELIVERY_PROGRESS_EVENT || !text(event.issueId) || !operation.test(event.operationId)
    || !DELIVERY_STAGES.includes(event.stage) || event.disposition !== stageDispositions[event.stage]
    || !time(event.at) || !time(event.sourceAt) || !text(event.owner)
    || event.evidenceIdentity !== null && !text(event.evidenceIdentity)
    || event.requestIdentity !== null && !text(event.requestIdentity)
    || event.blockingPredicate !== null && !text(event.blockingPredicate)
    || ["CLOSE_INELIGIBLE", "PROGRESS_DIAGNOSED"].includes(event.stage) !== (event.blockingPredicate !== null)) {
    throw new TypeError("Delivery progress identity, stage, disposition, or time is malformed");
  }
  return event;
}

const semanticStages = new Set(DELIVERY_STAGES.filter(stage => stage !== "PROGRESS_DIAGNOSED"));
const healthyContention = new Set(["repository_close_lease_contended", "target_writer_contended"]);
const digest = value => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

export function diagnoseDeliveryStall({ events, issueId, operationId, now, noProgressLimitMs = 300_000 }) {
  if (!time(now) || !Number.isSafeInteger(noProgressLimitMs) || noProgressLimitMs < 1) {
    throw new TypeError("Delivery diagnosis requires a canonical clock and positive threshold");
  }
  const selected = events.filter(event => event.type === DELIVERY_PROGRESS_EVENT
    && event.issueId === issueId && event.operationId === operationId)
    .map(event => validateDeliveryProgress(Object.fromEntries([...fields].map(field => [field, event[field]]))));
  const publication = selected.findLast(event => event.stage === "COMPLETION_PUBLISHED");
  if (!publication) return null;
  const current = selected.filter(event => semanticStages.has(event.stage)
    && Date.parse(event.sourceAt) >= Date.parse(publication.sourceAt));
  const latest = stage => current.findLast(event => event.stage === stage);
  const terminal = latest("NATIVE_TERMINAL_OBSERVED");
  const evidence = latest("EVIDENCE_VALIDATED");
  const eligibility = current.filter(event => ["CLOSE_ELIGIBLE", "CLOSE_INELIGIBLE"].includes(event.stage)).at(-1);
  const dispatch = latest("CLOSE_DISPATCH_INTENT");
  const accepted = latest("NATIVE_CLOSE_ACCEPTED");
  const repositoryLease = latest("REPOSITORY_CLOSE_ACQUIRED");
  const targetWriter = latest("TARGET_WRITER_ACQUIRED");
  const completed = latest("CLOSE_COMPLETED");
  let unresolved;
  if (!terminal) unresolved = { anchor: publication, predicate: "native_terminal_unobserved", owner: "native-task-owner" };
  else if (!evidence) unresolved = { anchor: terminal, predicate: "evidence_validation_unresolved", owner: "evidence-producer" };
  else if (eligibility?.stage === "CLOSE_INELIGIBLE") {
    if (healthyContention.has(eligibility.blockingPredicate)) return null;
    unresolved = { anchor: eligibility, predicate: eligibility.blockingPredicate, owner: eligibility.owner };
  } else if (!eligibility) unresolved = { anchor: evidence, predicate: "close_eligibility_unresolved", owner: "coordinator-reducer" };
  else if (!dispatch) unresolved = { anchor: eligibility, predicate: "close_dispatch_not_started", owner: "coordinator" };
  else if (!accepted) unresolved = { anchor: dispatch, predicate: "native_close_acceptance_unresolved", owner: "original-acceptance-owner" };
  else if (!repositoryLease) unresolved = { anchor: accepted, predicate: "repository_close_lease_unobserved", owner: "close-issue" };
  else if (!targetWriter) unresolved = { anchor: repositoryLease, predicate: "target_writer_unobserved", owner: "close-issue" };
  else if (!completed) unresolved = { anchor: targetWriter, predicate: "close_completion_unresolved", owner: "original-close-owner" };
  else return null;
  if (Date.parse(now) - Date.parse(unresolved.anchor.sourceAt) < noProgressLimitMs) return null;
  const fingerprint = digest({ issueId, operationId, anchorStage: unresolved.anchor.stage,
    anchorEvidenceIdentity: unresolved.anchor.evidenceIdentity, anchorRequestIdentity: unresolved.anchor.requestIdentity,
    blockingPredicate: unresolved.predicate, owner: unresolved.owner });
  return validateDeliveryProgress({ type: DELIVERY_PROGRESS_EVENT, at: now, issueId, operationId,
    stage: "PROGRESS_DIAGNOSED", disposition: "DIAGNOSED", sourceAt: now, owner: unresolved.owner,
    evidenceIdentity: fingerprint, requestIdentity: unresolved.anchor.requestIdentity,
    blockingPredicate: unresolved.predicate });
}

const elapsed = (from, to) => from && to ? Math.max(0, Date.parse(to.sourceAt) - Date.parse(from.sourceAt)) : null;

export function summarizeDeliveryProgress(events, issueId, operationId) {
  const selected = events.filter(event => event.type === DELIVERY_PROGRESS_EVENT
    && event.issueId === issueId && event.operationId === operationId)
    .map(event => validateDeliveryProgress(Object.fromEntries([...fields].map(field => [field, event[field]]))));
  const publication = selected.findLast(event => event.stage === "COMPLETION_PUBLISHED");
  const afterPublication = event => !publication || Date.parse(event.sourceAt) >= Date.parse(publication.sourceAt);
  const terminal = selected.find(event => event.stage === "NATIVE_TERMINAL_OBSERVED" && afterPublication(event));
  const accepted = selected.findLast(event => event.stage === "NATIVE_CLOSE_ACCEPTED" && afterPublication(event));
  const eligibility = selected.filter(event => event.stage === "CLOSE_ELIGIBLE"
    && afterPublication(event) && (!accepted || Date.parse(event.sourceAt) <= Date.parse(accepted.sourceAt)));
  const eligible = eligibility.at(-1);
  const interruptions = selected.filter(event => event.stage === "CLOSE_INELIGIBLE"
    && afterPublication(event) && (!accepted || Date.parse(event.sourceAt) <= Date.parse(accepted.sourceAt)));
  const interruptedEligibility = eligible && accepted && interruptions.some(event =>
    Date.parse(event.sourceAt) >= Date.parse(eligible.sourceAt));
  return Object.freeze({
    stages: selected,
    publicationToTerminalRecognitionMs: elapsed(publication, terminal),
    continuouslyEligibleToNativeCloseAcceptanceMs: interruptedEligibility ? null : elapsed(eligible, accepted),
    eligibilityInterrupted: interruptions.length > 0,
  });
}

export function appendDeliveryProgress({ writer, journal, event }) {
  validateDeliveryProgress(event);
  const sameOperation = journal.filter(item => item.type === DELIVERY_PROGRESS_EVENT && item.issueId === event.issueId
    && item.operationId === event.operationId);
  const eligibilityTransition = ["CLOSE_ELIGIBLE", "CLOSE_INELIGIBLE"].includes(event.stage);
  if (eligibilityTransition) {
    const previous = sameOperation.filter(item =>
      ["CLOSE_ELIGIBLE", "CLOSE_INELIGIBLE"].includes(item.stage)).at(-1);
    if (previous?.stage === event.stage && previous.evidenceIdentity === event.evidenceIdentity
      && previous.requestIdentity === event.requestIdentity
      && previous.blockingPredicate === event.blockingPredicate) return previous;
    return writer.append(event);
  }
  const duplicate = sameOperation.find(item => item.stage === event.stage
    && item.evidenceIdentity === event.evidenceIdentity && item.requestIdentity === event.requestIdentity
    && item.blockingPredicate === event.blockingPredicate);
  if (duplicate) return duplicate;
  return writer.append(event);
}
