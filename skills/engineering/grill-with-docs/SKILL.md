---
name: grill-with-docs
description: Settle one codebase-backed design through boundary-first questions and scoped glossary or ADR writes.
disable-model-invocation: true
---

# Grill with Docs

Bind one proposed Tracker Spec, target, starting baseline, and owning Codex task before the interview. Read-only exploration and tracker-only settled scope need no worktree. Before the first accepted glossary or ADR write, create or reuse one **Spec workflow lane**: one Codex task owns one proposed Tracker Spec, one target, and one isolated planning worktree. A mismatched task, Spec, target, worktree, or baseline is a Recoverable blocker; name the lane registry, observed evidence, smallest human action, and preserved stages, then retry the same `/grill-with-docs` command.

Two lanes may grill against the same target without a shared planning checkout, global workflow lock, or cross-lane state mutation. Keep accepted document edits inside the lane; the target checkout and every other lane remain untouched.

Load "grilling" and "domain-modeling" as separate named skills: use the generic Skill tool when available; otherwise use the host-supported mechanism to read and follow each required `SKILL.md`. Keep the selected source and invocation restrictions, passing the same settled scope and, when writing accepted decisions, the same lane identity to each. This invocation delegates evidence-backed reversible design choices and their qualifying document writes within the agreed goal; an explicit read-only or review request narrows that scope.

Pass a **boundary-first decision aperture** to both skills. A design choice reaches the human frontier when evidence cannot settle it and it would change a table creation, split, merge, ownership, aggregate, system-of-record, destructive lifecycle, or migration boundary, or set a major module, system, external-contract, trust, or authorization direction. Scope or operation permissions and costly or irreversible commitments always remain human decisions. Within those settled boundaries, resolve ordinary business and implementation details from explicit decisions and project contracts, then source conventions, then suitable established practice. Multiple plausible answers alone do not create a human question. Record the selected default, basis, practical reversal, and any verification assumption for the handoff.

Apply `grilling`'s SQL gate: derive columns, types, indexes, queries, bindings, and validation details from evidence, then present one coherent exact SQL change set for prior approval instead of asking about each constituent choice. Split approval only when effects or permissions are independent, and prepare approved SQL before dependent implementation. Group independent human questions; retain any pacing limit the user explicitly requests.

`domain-modeling` records each accepted glossary or ADR change in the isolated planning worktree as it settles. Accepted includes inherited decisions, explicit human decisions, and choices made under the scoped delegation; record their actual basis and source without labeling delegated choices human-confirmed. Unaccepted proposals stay in the conversation. Use project document conventions; record durable rationale in ADRs and carry precise behavior, numeric defaults, exclusions, and verification needs in the settled scope for `to-spec`.

At the end, create an exact handoff packet containing the task identity, proposed Spec, target, current baseline, an explicit empty change list for tracker-only work or the owned worktree and every accepted glossary or ADR path or hunk with its content identity. Tell the human to run `/to-spec` with that handoff packet. Keep the lane registered through publication. The owning task may dispose of only its exact clean planning worktree after successful `to-spec` handoff read-back; a partial publication, uncommitted accepted decision, identity mismatch, or failed read-back preserves it for the same-command retry.

Include each decision's basis and source, remaining verification assumptions, exact non-ADR requirements, and any SQL approval and prerequisite ordering in that existing packet. Finish without a second confirmation of already settled choices. The packet grants no implementation, SQL execution, or automatic publication authority.
