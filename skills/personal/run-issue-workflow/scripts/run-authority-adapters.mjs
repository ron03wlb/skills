import { RUN_READY_FACT_SCHEMA } from "./run-core.mjs";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const requireMethod = (owner, name, label) => {
  if (typeof owner?.[name] !== "function") {
    throw new TypeError(`${label} owning source requires ${name}()`);
  }
};

export function createRunAuthorityAdapters({ sources, store, tasks }) {
  if (!isRecord(sources)) throw new TypeError("Run authority owning sources are required");
  requireMethod(sources.tracker, "read", "Tracker");
  requireMethod(sources.reconciliation, "read", "Reconciliation");
  requireMethod(sources.target, "read", "Target");
  requireMethod(sources.checkpoint, "read", "Checkpoint");
  requireMethod(sources.handoff, "read", "Handoff");
  requireMethod(sources.writer, "readHealth", "Target-writer");
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
          owner: writerOwner,
        });
    if (writerHealth !== null && !["HEALTHY", "INACTIVE", "UNKNOWN"].includes(writerHealth)) {
      throw new TypeError("Target-writer owning source must return HEALTHY, INACTIVE, or UNKNOWN");
    }

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
          closeWriterRunId: writerObservation.state === "ABSENT" ? null : writerOwner?.operationId ?? "UNKNOWN",
          closeWriterState: writerObservation.state === "ABSENT"
            ? "ABSENT"
            : writerObservation.state === "UNKNOWN" ? "UNKNOWN" : "ACTIVE",
          closeWriterHealth: writerHealth,
          closeWriterOwner: writerOwner,
        },
      },
    };
  };

  const handoff = {
    async read({ request, tracker: trackerSnapshot, current }) {
      const base = current.runReadyAuthority;
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
      return {
        ...base,
        schema: RUN_READY_FACT_SCHEMA,
        targetState: base.targetState,
        targetOwnership: base.targetOwnership,
        checkpoint,
        handoff: handoffReadBack,
      };
    },
  };

  return Object.freeze({
    tracker,
    selector,
    reconcile,
    handoff,
  });
}
