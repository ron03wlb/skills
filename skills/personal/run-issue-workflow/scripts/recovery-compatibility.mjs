import { validateJournal } from "./run-journal.mjs";
import { recoveryDigest } from "./recovery-evidence.mjs";

// Isolated technical recovery compatibility is decided by authority code. The Codex host boundary
// only supplies the journal and original task intents and transports the returned decision.
export function assessRecoveryCompatibility({ journal, taskIntents }) {
  try {
    validateJournal(journal);
    const grant = journal.find((event) => event.type === "grant.recorded");
    if (!grant) throw new Error("Recorded Grant is missing");
    for (const intent of taskIntents) {
      if (
        intent.runId !== grant.runIdentity.runId ||
        typeof intent.issueId !== "string" ||
        typeof intent.prompt !== "string"
      )
        throw new Error("Original native task intent is malformed or foreign");
    }
    // The current reducers retain legacy dispatch/conflict records and require explicit ownership
    // transfers for new recovery. Parsing the exact journal exercises both semantic contracts.
    return {
      compatible: true,
      contract: "isolated-technical-recovery:v1",
      journalIdentity: recoveryDigest(journal),
      taskIntentIdentity: recoveryDigest(taskIntents),
      preserves: [
        "original-grant",
        "operation",
        "legacy-receipts",
        "task-intents",
        "cumulative-budget",
        "exclusive-writer",
      ],
    };
  } catch (error) {
    return {
      compatible: false,
      reason: error.message,
      nextOwner: "workflow-maintenance",
    };
  }
}
