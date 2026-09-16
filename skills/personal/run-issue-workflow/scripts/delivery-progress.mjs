import { createHash } from "node:crypto";
import {
  DELIVERY_PROGRESS_EVENT,
  DELIVERY_PROGRESS_FIELDS,
  DELIVERY_STAGES,
  isCanonicalInstant,
  validateDeliveryProgress,
} from "./delivery-authority.mjs";

export { DELIVERY_PROGRESS_EVENT, DELIVERY_STAGES, validateDeliveryProgress };

const pickEvent = event =>
  Object.fromEntries(DELIVERY_PROGRESS_FIELDS.map(field => [field, event[field]]));

const semanticStages = new Set(DELIVERY_STAGES.filter(stage => stage !== "PROGRESS_DIAGNOSED"));
const healthyContention = new Set(["repository_close_lease_contended", "target_writer_contended"]);
const digest = value => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

export function diagnoseDeliveryStall({ events, issueId, operationId, now, noProgressLimitMs = 300_000 }) {
  if (!isCanonicalInstant(now) || !Number.isSafeInteger(noProgressLimitMs) || noProgressLimitMs < 1) {
    throw new TypeError("Delivery diagnosis requires a canonical clock and positive threshold");
  }
  const selected = events.filter(event => event.type === DELIVERY_PROGRESS_EVENT
    && event.issueId === issueId && event.operationId === operationId)
    .map(event => validateDeliveryProgress(pickEvent(event)));
  const publication = selected.findLast(event => event.stage === "COMPLETION_PUBLISHED");
  const orphanTerminal = !publication ? selected.findLast(event => event.stage === "NATIVE_TERMINAL_OBSERVED") : null;
  if (!publication && !orphanTerminal) return null;
  const current = selected.filter(event => semanticStages.has(event.stage)
    && Date.parse(event.sourceAt) >= Date.parse((publication ?? orphanTerminal).sourceAt));
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
  if (!publication) unresolved = { anchor: orphanTerminal, predicate: "completion_publication_unresolved", owner: "evidence-producer" };
  else if (!terminal) unresolved = { anchor: publication, predicate: "native_terminal_unobserved", owner: "native-task-owner" };
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
    .map(event => validateDeliveryProgress(pickEvent(event)));
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
