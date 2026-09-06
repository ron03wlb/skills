## What it does

`to-tickets` consumes the completed `to-spec` handoff for an approved Multi-Issue [Spec](https://www.aihero.dev/ai-coding-dictionary/spec), opens one minimal operation-scoped transaction, and reconciles every child through an immutable Decomposition key. Each child keeps its Acceptance Criteria, mapped Implementation Plan, verification, blockers, target, and Planning baseline.

Its defining idea is the **tracer bullet**: each child is a narrow, verifiable vertical outcome. After every child, blocker, Decomposition publication record, and ready state passes read-back, the skill appends one composite `handoff.completed` and ends at `/run-issue-workflow <Spec-ID>`; it never reclassifies the parent or emits child execution commands. Its concrete producer adapter binds a deterministic versioned operation identity derived from immutable repository, Spec, approved-publication, producer, and stage inputs; duplicate invocation resumes that exact transaction while the generic checkpoint store keeps the identity opaque.

## When to reach for it

You invoke this by typing `/to-tickets <Spec-ID>` — the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

Reach for it only when [to-spec](https://aihero.dev/skills-to-spec) published a Multi-Issue next command and completed handoff. A Single-Issue Spec goes directly to the published `/run-issue-workflow <Spec-ID>` route.

## Prerequisites

- Fresh decomposition: tracker writes need no planning worktree; upstream publication, version, scope, and seal still require exact read-back.
- Accepted glossary or ADR writes: return to `to-spec` before changing those documents.

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker, labels, current Workflow checkpoint profiles, and concrete producer adapters. The parent Spec needs a valid Planning Seal, explicit Multi-Issue classification, approved-scope identity, and exact completed `to-spec` publication and handoff. A frozen legacy/profile-v1 retry also needs its existing shared Target mutation writer.

## Stable reconciliation

Every child is self-contained and depends only on its parent constraints and explicit blockers; it does not need to know whether sibling Issues execute concurrently. Inline `Covers: AC-n` references keep plan and verification traceable without a separate matrix or parser.

Decomposition keys make retries stable: exact tracker evidence is reused, while duplicate or conflicting identity sources fail closed. Owned blockers must be acyclic, and readable External blockers affect readiness while remaining read-only.

A fresh operation reads the upstream publication and handoff once, then binds them with the parent, target, Planning Seal, classification, and approved scope in a minimal `to-tickets@v2` transaction. Its only stages are Decomposition publication, ready-state, and final-handoff read-back. It creates no target operational-plan file or commit and no prospective `direct_target_contribution:v1` record. Existing valid incomplete legacy and profile-v1 operations retain frozen exact-resume behavior.

A complete, read-back Issue decomposition gains one Decomposition publication record, an exact dependency-ready frontier, and one composite handoff binding the upstream publication and handoff, current operation receipt, plus the publication identity and digest. A wide mechanical refactor that cannot stay green as vertical slices uses expand-contract instead.

`to-tickets` consumes the published Planning Seal without rerunning upstream planning or creating a successor. Changes to behavior, acceptance, target, or exclusions return to `to-spec`; child publication never silently expands or edits the parent.

For GitLab, setup records `Blocking representation: body` for new configuration unless an operator has manually proven and declared `native`. Every child always carries the canonical `## Blocked by` section and `decomposition:v1` keeps the same logical directed edges.

| Configuration or state | Portable guarantee |
| --- | --- |
| `body` | The body graph is authoritative; no native blocking relation is published. |
| `native` | The same body graph remains authoritative, and native mode verifies matching native evidence. |
| Missing setting | The representation is `UNKNOWN` and requires an explicit repair before publication. HTTP 400 never picks a mode. |
| Prior partial native failure | Verified recovery may use configured body only when evidence is consistent; otherwise publication fails closed. |


## It's working if

- A retry reuses matching child keys instead of creating duplicates.
- The Decomposition publication record binds the exact key mapping and blocker edges only after complete read-back, and the composite handoff follows ready-state read-back.
- Blocked or closed children receive no ready label, and the only emitted next command is `/run-issue-workflow <Spec-ID>`.

## Where it fits

`to-tickets` follows [to-spec](https://aihero.dev/skills-to-spec) and hands one composite Multi-Issue result to the repository's Run coordinator. The coordinator separately invokes [execute-issue](https://aihero.dev/skills-execute-issue) and [close-issue](https://aihero.dev/skills-close-issue) under its own valid DAG Run Grant; direct human leaf invocation remains available. See [ask-matt](https://aihero.dev/skills-ask-matt) for the whole flow.
