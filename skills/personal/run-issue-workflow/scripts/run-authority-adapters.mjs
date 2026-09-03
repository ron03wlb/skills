import { reduceRunReadyHandoff, RUN_READY_FACT_SCHEMA } from "./run-core.mjs";
import { isExactStaleOwnerProof } from "./run-stale-proof.mjs";
import { deriveRunOperationIdentity } from "./workflow-operation-identity.mjs";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const gitObjectPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

const requireMethod = (owner, name, label) => {
  if (typeof owner?.[name] !== "function") {
    throw new TypeError(`${label} owning source requires ${name}()`);
  }
};

const provesInactiveWriter = ({ proof, owner, runId, health }) => health === "INACTIVE"
  && isExactStaleOwnerProof(proof)
  && owner?.operationId === runId
  && proof.previousCoordinatorInstanceId === owner.coordinatorInstanceId
  && proof.previousGeneration === owner.generation
  && proof.abandonedOperationIds.length === 0;

export function createRunAuthorityAdapters({ sources, store, tasks }) {
  if (!isRecord(sources)) throw new TypeError("Run authority owning sources are required");
  requireMethod(sources.tracker, "read", "Tracker");
  requireMethod(sources.repository, "readIdentity", "Repository identity");
  requireMethod(sources.reconciliation, "read", "Reconciliation");
  requireMethod(sources.target, "read", "Target");
  requireMethod(sources.checkpoint, "read", "Checkpoint");
  requireMethod(sources.handoff, "read", "Handoff");
  requireMethod(sources.writer, "readHealth", "Target-writer");
  requireMethod(store, "observeRepositoryCloseLease", "Run store");
  requireMethod(store, "observeTargetMutationWriter", "Run store");

  const tracker = {
    read: (request) => sources.tracker.read(request),
  };
  const selector = typeof sources.selector?.listNonTerminalRuns === "function"
    ? { listNonTerminalRuns: (request) => sources.selector.listNonTerminalRuns(request) }
    : undefined;

  const reconcile = async ({ request, tracker: trackerSnapshot, journal, tasks: taskAdapter = tasks }) => {
    const current = await sources.reconciliation.read({
      request,
      tracker: trackerSnapshot,
      journal,
      tasks: taskAdapter,
    });
    if (!isRecord(current?.runIdentity) || !isRecord(current?.facts?.run)) {
      throw new TypeError("Reconciliation owning source must return one normalized Run identity and fact set");
    }
    const target = await sources.target.read({
      request,
      tracker: trackerSnapshot,
      journal,
      current,
    });
    if (!isRecord(target) || !["CLEAN", "DIRTY", "UNKNOWN"].includes(target.state)) {
      throw new TypeError("Target owning source must return CLEAN, DIRTY, or UNKNOWN");
    }
    if (target.ownership !== undefined
      && !["NONE", "EXACT_PRODUCER", "UNOWNED", "UNKNOWN"].includes(target.ownership)) {
      throw new TypeError("Target owning source returned an unsupported ownership state");
    }
    const closeoutRelevant = current.facts.nodes?.some(({ completionState }) => completionState === "COMPLETE") ?? false;
    if (closeoutRelevant && !gitObjectPattern.test(target.head)) {
      throw new TypeError("Target owning source must return the current Git head for closeout");
    }

    const repositoryCloseLeaseObservation = store.observeRepositoryCloseLease();
    const repositoryCloseLeaseOwner = repositoryCloseLeaseObservation.owner;
    const repositoryCloseLeaseHealth = repositoryCloseLeaseObservation.state === "ABSENT"
      ? null
      : repositoryCloseLeaseObservation.state === "UNKNOWN"
        ? "UNKNOWN"
        : await sources.writer.readHealth({
          request,
          tracker: trackerSnapshot,
          current,
          leaseKind: "repository-close",
          owner: repositoryCloseLeaseOwner,
        });
    if (repositoryCloseLeaseHealth !== null
      && !["HEALTHY", "INACTIVE", "UNKNOWN"].includes(repositoryCloseLeaseHealth)) {
      throw new TypeError("Repository close-lease owning source must return HEALTHY, INACTIVE, or UNKNOWN");
    }

    const writerObservation = store.observeTargetMutationWriter({ target: current.runIdentity.target });
    const writerOwner = writerObservation.owner;
    const writerHealth = writerObservation.state === "ABSENT"
      ? null
      : writerObservation.state === "UNKNOWN"
        ? "UNKNOWN"
        : await sources.writer.readHealth({
          request,
          tracker: trackerSnapshot,
          current,
          leaseKind: "target-mutation",
          owner: writerOwner,
        });
    if (writerHealth !== null && !["HEALTHY", "INACTIVE", "UNKNOWN"].includes(writerHealth)) {
      throw new TypeError("Target-writer owning source must return HEALTHY, INACTIVE, or UNKNOWN");
    }
    const writerReclaimable = writerObservation.state === "PRESENT" && provesInactiveWriter({
      proof: current.closeWriterReclaimProof,
      owner: writerOwner,
      runId: current.runIdentity.runId,
      health: writerHealth,
    });

    const runReadyAuthority = current.runReadyAuthority ?? current.runReadyHandoff;
    if (!isRecord(runReadyAuthority?.authority)) {
      throw new TypeError("Reconciliation owning source must expose selected Run-ready authority");
    }
    return {
      ...current,
      runReadyAuthority,
      authorityReadBack: {
        target,
      },
      facts: {
        ...current.facts,
        run: {
          ...current.facts.run,
          targetState: target.state,
          targetHead: gitObjectPattern.test(target.head) ? target.head : current.facts.run.targetHead ?? null,
          repositoryCloseLeaseOperationId: repositoryCloseLeaseObservation.state === "ABSENT"
            ? null
            : repositoryCloseLeaseOwner?.operationId ?? "UNKNOWN",
          repositoryCloseLeaseState: repositoryCloseLeaseObservation.state === "ABSENT"
            ? "ABSENT"
            : repositoryCloseLeaseObservation.state === "UNKNOWN" ? "UNKNOWN" : "ACTIVE",
          repositoryCloseLeaseHealth,
          repositoryCloseLeaseOwner,
          closeWriterRunId: writerObservation.state === "ABSENT" ? null : writerOwner?.operationId ?? "UNKNOWN",
          closeWriterState: writerObservation.state === "ABSENT"
            ? "ABSENT"
            : writerObservation.state === "UNKNOWN" ? "UNKNOWN" : "ACTIVE",
          closeWriterHealth: writerHealth,
          closeWriterOwner: writerOwner,
          closeWriterReclaimable: writerReclaimable,
        },
      },
    };
  };

  const handoff = {
    async read({ request, tracker: trackerSnapshot, current }) {
      const base = current.runReadyAuthority;
      const repositoryId = await sources.repository.readIdentity({
        request,
        tracker: trackerSnapshot,
        current,
        authority: base.authority,
      });
      const checkpoint = await sources.checkpoint.read({
        request,
        tracker: trackerSnapshot,
        current,
        authority: base.authority,
      });
      const handoffReadBack = await sources.handoff.read({
        request,
        tracker: trackerSnapshot,
        current,
        authority: base.authority,
        checkpoint,
      });
      let facts = {
        ...base,
        schema: RUN_READY_FACT_SCHEMA,
        operationIdentity: null,
        targetState: current.authorityReadBack.target.state,
        targetOwnership: current.authorityReadBack.target.ownership ?? base.targetOwnership,
        checkpoint,
        handoff: handoffReadBack,
      };
      if (reduceRunReadyHandoff(facts).state === "READY") {
        try {
          facts = {
            ...facts,
            operationIdentity: deriveRunOperationIdentity({
              repositoryId,
              specId: base.authority.specId,
              approvedPublicationIdentity: base.authority.approvedScopeHash,
            }),
          };
        } catch (error) {
          facts = {
            ...facts,
            evidence: [
              ...(Array.isArray(facts.evidence) ? facts.evidence : []),
              `Run operation identity evidence is invalid: ${error.message}`,
            ],
          };
        }
      }
      return facts;
    },
  };

  return Object.freeze({
    tracker,
    selector,
    reconcile,
    handoff,
  });
}
