Quickstart:

```bash
npx skills add mattpocock/skills --skill=to-tickets
```

```bash
npx skills update to-tickets
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-tickets)

## What it does

`to-tickets` is re-entrant: it reconciles one Issue decomposition for an approved Multi-Issue Spec. Every child owns an immutable Decomposition key plus Acceptance Criteria, a mapped Implementation Plan, verification, blockers, target, and Planning baseline.

Its defining idea is the **tracer bullet**: each child is a narrow, verifiable vertical outcome. After every child and blocker passes read-back, the skill publishes one Decomposition publication record and emits commands only for the dependency-ready frontier; it never reclassifies the parent.

## When to reach for it

You invoke this by typing `/to-tickets <Spec-ID>` — the agent won't reach for it on its own.

Reach for it only when [to-spec](https://aihero.dev/skills-to-spec) published a Multi-Issue next command. A Single-Issue Spec goes directly to [execute-issue](https://aihero.dev/skills-execute-issue).

## Prerequisites

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker and labels. The parent Spec needs a valid Planning Seal and explicit Multi-Issue classification.

## Stable reconciliation

Every child is self-contained and depends only on its parent constraints and explicit blockers; it does not need to know whether sibling Issues execute concurrently. Inline `Covers: AC-n` references keep plan and verification traceable without a separate matrix or parser.

Decomposition keys make retries stable: exact tracker evidence is reused, while duplicate or conflicting identity sources fail closed. Owned blockers must be acyclic, and readable External blockers affect readiness while remaining read-only.

A complete, read-back Issue decomposition gains one Decomposition publication record and an exact dependency-ready frontier. A wide mechanical refactor that cannot stay green as vertical slices uses expand-contract instead.

Exact in-Spec planning refinements may create one successor Planning Seal. Changes to behavior, acceptance, target, or exclusions return to `to-spec`; child publication never silently expands or edits the parent.

## It's working if

- A retry reuses matching child keys instead of creating duplicates.
- The Decomposition publication record binds the exact key mapping and blocker edges only after complete read-back.
- Blocked or closed children receive neither a ready label nor an execution command.

## Where it fits

`to-tickets` follows [to-spec](https://aihero.dev/skills-to-spec) and hands each ready child to [execute-issue](https://aihero.dev/skills-execute-issue), followed by [close-issue](https://aihero.dev/skills-close-issue). See [ask-matt](https://aihero.dev/skills-ask-matt) for the whole flow.
