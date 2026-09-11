---
name: grilling
description: Stress-test a plan, decision, or idea; resolve delegated choices from evidence and ask only for reserved or costly decisions. Use when the user wants to grill their thinking.
---

Resolve unresolved material decisions within the agreed scope. A decision is material when its answer could change product behavior, scope, authority, or material risk. Map relevant decisions and evidence prerequisites as a **design tree**; hypothetical branches unrelated to the agreed scope stay outside it.

A **decision aperture** is a caller- or user-supplied boundary over that tree naming which unresolved choices must reach the human. It filters the human frontier, not the design work: resolve in-scope reversible choices outside the aperture from evidence and carry them as delegated defaults. Without a supplied aperture, unresolved goal or business meaning remains in the human frontier. New major direction or architecture, table DDL, migration costs, scope or operation permission, and costly or irreversible commitments always require the missing human decision.

## Decision boundaries

Use explicit user decisions and applicable project contracts first, then consistent source conventions, then a suitable established practice. Read the evidence yourself and check that a precedent fits this project's constraints. Conflicting sources require identifying the governing contract; current code alone cannot override an accepted ADR or user requirement.

- **Resolve directly:** within the agreed goal and delegated planning scope, choose the simplest evidence-backed option with low-cost reversal and no migration cost. Retain an existing design that satisfies accepted requirements. A rejected alternative that would change a reserved boundary or incur migration costs does not open a question; ask only when the selected in-scope proposal needs that decision or the user explicitly requests the comparison. Check required behavior, important failure cases and practical reversal; carry a concise source, rationale and any remaining verification assumption. Multiple plausible options or an unfamiliar detail alone do not create a question. Investigate missing facts first; an ordinary reversible default can retain a testable assumption.
- **Ask for the missing decision:** a proposal creates or changes a reserved boundary; the overall goal remains ambiguous; it exceeds agreed scope or operation permissions; or it entails data repair, irreversible effects, external coordination or substantial cost. Evidence supports the recommendation, but convention or model confidence cannot approve a new reserved choice. Reuse approval already covering that exact scope.
- **Migration costs are reserved:** ask before committing to a choice that requires moving existing data or state, adapting existing consumers, or transitioning an operational workflow, including compatibility, backfill, rollout or rollback work. Name the concrete transition and its cost, even when small or the code can be reverted. Ordinary implementation effort with no such transition is not a migration cost.

For each human decision, present the concrete proposal, feasible alternatives and their trade-offs, affected behavior and migration cost, your recommendation with evidence and reasons, and the relevant reversal or verification uncertainty. Derive details before asking so the human chooses a coherent outcome rather than individual implementation ingredients.

## SQL boundary

Table DDL (including columns, types, constraints and indexes), data corrections, destructive or costly SQL effects, and SQL with migration costs require prior approval for the exact change set. Derive constituent details from evidence, then present one coherent exact SQL change set for prior approval instead of asking about each constituent choice. Split approval only when effects or permissions are independent. Write and validate the approved SQL artifact before dependent application implementation; independent work may continue.

Routine reversible application queries and bindings within settled behavior follow the direct-resolution branch when they introduce none of those effects. SQL syntax, a local file or a read-only SELECT alone does not decide the branch: adding an index is still DDL, and a query change requiring consumer migration is still reserved. Reuse exact prior approval. Artifact preparation requires existing writing authority and grants no database execution authority; read-only inspection alone needs no adjustment approval.

An explicit design request delegates in-scope reversible design choices unless the user reserves them for review; a read-only request creates no file-writing authority. The caller may grant scoped document writes, as `grill-with-docs` does. Record the basis as inherited, human-confirmed, or delegated with its source; delegated choices are not individual human approvals. A costly proposal remains proposed until its missing decision is answered. Silence is not agreement or approval.

Carry accepted decisions forward on continuation and re-entry. Reopen a decision only when new evidence invalidates its basis; identify that evidence and the affected decision before asking again. Existing approvals apply only to their settled scope and supply no authority for new scope.

## Resolve the frontier

Work the tree in **rounds**. The **frontier** contains decisions whose prerequisites are already settled. Resolve delegated choices outside the decision aperture immediately; the **human frontier** is the ready subset that still requires the human. Group its independent questions into one concise numbered round. Keep delegated defaults in a compact summary, without confirmation prompts or an ADR per routine choice. Honor an explicit user or caller pacing limit. A question that depends on an unanswered question belongs to a later round. Continue independent evidence gathering and authorized work while an answer is pending.

Use available tools for facts; delegate independent research when authorized and useful. A running exploration is an unsettled prerequisite, so only its dependent decisions wait. An empty ready frontier with unresolved evidence or human decisions is not completion.

For a requirement that will enter an Issue Run, include the actual operation permissions and declared Manual prerequisites in the design tree. Read existing approvals and prepare concrete installation/task/message/local-close/tracker operations plus read-only host capability evidence before asking once for missing scope. For SQL, settle environment, effect, rights, operator, content identity, recovery and APPLIED/NO_OP validation before Run-ready; no SQL is N/A and adds no question. Follow [Run preparation](../../../docs/agents/run-preparation.md) for the producer handoff. Reuse settled approvals in later leaves and re-entry; only a concrete new scope or irreversible capability opens another decision.

When no unresolved material decisions or evidence prerequisites remain, deliver one settled summary with decision bases, assumptions, and verification needs. No blanket final confirmation is required for decisions already settled by evidence and scoped delegation or explicit approval. Preserve an explicit user-requested review and the caller's handoff boundary; continue follow-up work only where it is already authorized. A completed design supplies no new execution, publication, database, or deployment authority and does not replace Manual prerequisites.
