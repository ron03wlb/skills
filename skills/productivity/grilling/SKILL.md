---
name: grilling
description: Stress-test a plan, decision, or idea; resolve reversible choices from evidence and ask about costly commitments or unclear intent. Use when the user wants to grill their thinking.
---

Resolve unresolved material decisions within the agreed scope. A decision is material when its answer could change product behavior, scope, authority, or material risk. Map relevant decisions and evidence prerequisites as a **design tree**; hypothetical branches unrelated to the agreed scope stay outside it.

## Decision boundaries

Use explicit user decisions and applicable project contracts first, then consistent source conventions, then a suitable established practice. Read the evidence yourself. Conflicting sources require identifying the governing contract; current code alone cannot override an accepted ADR or user requirement.

- **Resolve directly:** within the agreed goal and delegated planning scope, choose the simplest evidence-backed option whose consequences can be reversed at low cost. Record the choice, source or assumption, rationale, and practical reversal. A convention can settle a design choice; it cannot supply an unknown business goal or new operation permission.
- **Ask for the missing decision:** the goal or business meaning remains ambiguous after investigation; the proposal exceeds agreed scope or operation permissions; or reversal entails irreversible effects, data repair, external coordination, or substantial cost. Judge consequences, not whether a code edit can be reverted. Prepare the concrete choice, affected behavior, trade-off, and recommendation before asking. Reuse approval already covering that exact scope.
- **SQL adjustments always use the costly-change branch:** creating or changing SQL, including schema, migrations, data corrections, indexes, stored procedures, and embedded application queries, needs prior approval for the exact adjustment even when the file is local or the query is read-only. Inspect existing SQL and describe the proposed change and effects before asking; approving the proposal precedes editing its SQL artifact. Preparing an approved artifact does not authorize database execution. Prioritize its preparation and validation before dependent application implementation; independent work may continue. Read-only inspection alone is not a SQL adjustment.

An explicit design request delegates in-scope reversible design choices unless the user reserves them for review; a read-only request creates no file-writing authority. The caller may grant scoped document writes, as `grill-with-docs` does. Record the basis as inherited, human-confirmed, or delegated with its source; delegated choices are not individual human approvals. A costly proposal remains proposed until its missing decision is answered. Silence is not agreement or approval.

Carry accepted decisions forward on continuation and re-entry. Reopen a decision only when new evidence invalidates its basis; identify that evidence and the affected decision before asking again. Existing approvals apply only to their settled scope and supply no authority for new scope.

## Resolve the frontier

Work the tree in **rounds**. The **frontier** contains decisions whose prerequisites are already settled. Resolve delegated choices immediately; group independent questions that still need the human into one concise numbered round with a recommendation for each. Honor an explicit user or caller pacing limit. A question that depends on an unanswered question belongs to a later round. Continue independent evidence gathering and authorized work while an answer is pending.

Use available tools for facts; delegate independent research when authorized and useful. A running exploration is an unsettled prerequisite, so only its dependent decisions wait. An empty ready frontier with unresolved evidence or human decisions is not completion.

For a requirement that will enter an Issue Run, include the actual operation permissions and declared Manual prerequisites in the design tree. Read existing approvals and prepare concrete installation/task/message/local-close/tracker operations plus read-only host capability evidence before asking once for missing scope. For SQL, settle environment, effect, rights, operator, content identity, recovery and APPLIED/NO_OP validation before Run-ready; no SQL is N/A and adds no question. Follow [Run preparation](../../../docs/agents/run-preparation.md) for the producer handoff. Reuse settled approvals in later leaves and re-entry; only a concrete new scope or irreversible capability opens another decision.

When no unresolved material decisions or evidence prerequisites remain, deliver one settled summary with decision bases, assumptions, and verification needs. No blanket final confirmation is required for decisions already settled by evidence and scoped delegation or explicit approval. Preserve an explicit user-requested review and the caller's handoff boundary; continue follow-up work only where it is already authorized. A completed design supplies no new execution, publication, database, or deployment authority and does not replace Manual prerequisites.
