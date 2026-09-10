import {
  ISSUE_EXECUTION_LIMIT_MS,
  summarizeIssueExecutionBudget,
} from "./run-journal.mjs";

const isTaskRef = value => value && typeof value.threadId === "string" && value.threadId.length > 0
  && typeof value.hostId === "string" && value.hostId.length > 0;

const nativeDurationMs = task => {
  const duration = task?.snapshot?.turns?.[0]?.durationMs;
  return Number.isSafeInteger(duration) && duration >= 0 ? duration : null;
};

export function createIssueExecutionBudgetController({ store, tasks, now, monotonicNow }) {
  if (typeof store?.readEvents !== "function" || typeof tasks?.read !== "function") {
    throw new TypeError("Issue execution budget requires journal and task readers");
  }
  if (typeof now !== "function" || typeof monotonicNow !== "function") {
    throw new TypeError("Issue execution budget requires wall and monotonic clocks");
  }
  const anchors = new Map();

  const start = ({ writer, runId, issueId, phase, phaseIdentity, taskRef, monotonicStartedAt = null }) => {
    const journal = store.readEvents(runId);
    const existing = journal.find(event => event.type === "execution.started" && event.issueId === issueId
      && event.phaseIdentity === phaseIdentity);
    if (existing) return existing;
    if (!isTaskRef(taskRef)) throw new TypeError("Issue execution start requires one exact task reference");
    const event = writer.append({ type: "execution.started", at: now(), issueId, phase, phaseIdentity, taskRef });
    if (Number.isFinite(monotonicStartedAt)) anchors.set(event.sequence, {
      at: monotonicStartedAt,
      elapsedMs: 0,
    });
    return event;
  };

  const markUncertain = ({ writer, issueId, started, journal }) => {
    const latestEvidence = journal.findLast(event => ["execution.observed", "execution.uncertain"].includes(event.type)
      && event.startSequence === started.sequence);
    if (latestEvidence?.type === "execution.uncertain") return;
    writer.append({
      type: "execution.uncertain",
      at: now(),
      issueId,
      startSequence: started.sequence,
      reason: "MONOTONIC_OR_NATIVE_ELAPSED_UNAVAILABLE",
    });
  };

  const recordExhaustion = ({ writer, runId, issueId }) => {
    const journal = store.readEvents(runId);
    const summary = summarizeIssueExecutionBudget(journal, issueId);
    if (summary.consumedMs >= ISSUE_EXECUTION_LIMIT_MS
      && !journal.some(event => event.type === "execution.exhausted" && event.issueId === issueId)) {
      writer.append({ type: "execution.exhausted", at: now(), issueId, consumedMs: summary.consumedMs });
    }
  };

  const sync = async ({ writer, runId, issueIds, nodes = [] }) => {
    const nodesByIssue = new Map(nodes.map(node => [node.issueId, node]));
    for (const issueId of issueIds) {
      let journal = store.readEvents(runId);
      const summary = summarizeIssueExecutionBudget(journal, issueId);
      if (summary.state === "EXHAUSTED") {
        recordExhaustion({ writer, runId, issueId });
        continue;
      }
      if (summary.activeStartSequence === null) continue;
      const started = journal.find(event => event.type === "execution.started"
        && event.sequence === summary.activeStartSequence);
      const prior = journal.findLast(event => event.type === "execution.observed"
        && event.startSequence === started.sequence);
      let task;
      const anchor = anchors.get(started.sequence);
      const reconciledTaskState = nodesByIssue.get(issueId)?.taskState;
      if (anchor && reconciledTaskState && reconciledTaskState !== "EXECUTING") {
        task = { state: "RESUMABLE" };
      } else {
        try {
          task = await tasks.read(started.taskRef, { runId });
        } catch {
          markUncertain({ writer, issueId, started, journal });
          continue;
        }
      }
      const native = nativeDurationMs(task);
      let elapsedMs;
      let state;
      let source;
      if (["RUNNING", "ACTIVE", "EXECUTING", "RESUMABLE", "SETTLED", "INACTIVE"].includes(task.state)
        && native !== null) {
        elapsedMs = Math.max(prior?.elapsedMs ?? 0, native);
        state = ["RESUMABLE", "SETTLED", "INACTIVE"].includes(task.state) ? "SETTLED" : "ACTIVE";
        source = "NATIVE";
      } else if (anchor && ["RUNNING", "ACTIVE", "EXECUTING", "RESUMABLE", "SETTLED", "INACTIVE"].includes(task.state)) {
        elapsedMs = Math.max(prior?.elapsedMs ?? 0, anchor.elapsedMs + Math.max(0, Math.floor(monotonicNow() - anchor.at)));
        state = ["RESUMABLE", "SETTLED", "INACTIVE"].includes(task.state) ? "SETTLED" : "ACTIVE";
        source = "MONOTONIC";
      } else {
        markUncertain({ writer, issueId, started, journal });
        continue;
      }
      if (prior?.state !== state || prior?.elapsedMs !== elapsedMs) {
        writer.append({ type: "execution.observed", at: now(), issueId, startSequence: started.sequence,
          elapsedMs, state, source });
      }
      if (state === "SETTLED") anchors.delete(started.sequence);
      recordExhaustion({ writer, runId, issueId });
    }
  };

  const remainingMs = ({ runId, issueIds }) => {
    const journal = store.readEvents(runId);
    const remaining = issueIds.map(issueId => summarizeIssueExecutionBudget(journal, issueId))
      .filter(summary => summary.state === "ACTIVE")
      .map(summary => Math.max(0, summary.limitMs - summary.consumedMs));
    return remaining.length === 0 ? null : Math.min(...remaining);
  };

  return Object.freeze({ start, sync, remainingMs });
}
