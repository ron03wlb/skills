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
    || (event.stage === "CLOSE_INELIGIBLE") !== (event.blockingPredicate !== null)) {
    throw new TypeError("Delivery progress identity, stage, disposition, or time is malformed");
  }
  return event;
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
