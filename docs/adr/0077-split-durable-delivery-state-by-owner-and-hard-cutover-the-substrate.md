---
status: accepted
---

# Split durable delivery state by owner and hard-cutover the substrate

Delivery facts keep exactly one owner each. Authority facts — grants, control revisions, dispatch-attempt references, **Issue execution budget** evidence, bounded-remediation records, closeout-wait observations, and pause or stop transitions — stay in the append-only `${git-common-dir}/matt-workflow-control/runs/<run-id>/` journal. Scheduling facts — task attempts, worker artifacts, and run lifecycle — move to the `pi-workflow` run record under the project workflow root. Neither record duplicates the other's facts, and host run retention stays independent of the authority journal's audit retention.

The cutover is serialized rather than gradual: every non-terminal **DAG Run** reaches terminal state on the retired Codex-native host before any Run starts on the **Delivery workflow host**. The two substrates never schedule one repository concurrently, and no in-flight Run is abandoned, migrated mid-Run, or re-granted on the new substrate.

Basis: human decision B2 in the `grill-with-docs` session of 2026-09-15 (Pi session `01a0a417-5fc9-7443-9212-f2084dbbe124`). B2 was preferred over keeping both substrates available indefinitely because a dual-scheduling window would let two owners dispatch the same Issue, and over the single-record alternative because `pi-workflow` retention would then own audit deletion and the record would be project-root-relative rather than shared across Issue worktrees.

Reversal or validation: prove that no repository has a non-terminal Run on both substrates at once, that authority-journal reads stay correct after the Codex host boundary is retired, and that the journal survives Issue-worktree removal and is reachable from every worker working directory.
