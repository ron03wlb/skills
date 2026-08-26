Quickstart:

```bash
npx skills add mattpocock/skills --skill=to-tickets
```

```bash
npx skills update to-tickets
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-tickets)

## What it does

`to-tickets` decomposes one approved Multi-Issue Spec into independently executable child Issues, each with Acceptance Criteria, a mapped Implementation Plan, verification, blockers, target, and Planning baseline.

Its defining idea is the **tracer bullet**: each child is a narrow, verifiable vertical outcome. It consumes `to-spec` classification and never reclassifies the parent.

## When to reach for it

You invoke this by typing `/to-tickets <Spec-ID>` — the agent won't reach for it on its own.

Reach for it only when [to-spec](https://aihero.dev/skills-to-spec) published a Multi-Issue next command. A Single-Issue Spec goes directly to [execute-issue](https://aihero.dev/skills-execute-issue).

## Prerequisites

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker and labels. The parent Spec needs a valid Planning Seal and explicit Multi-Issue classification.

## Independent children

Every child is self-contained and depends only on its parent constraints and explicit blockers; it does not need to know whether sibling Issues execute concurrently. Inline `Covers: AC-n` references keep plan and verification traceable without a separate matrix or parser.

The skill publishes blockers first and emits `/execute-issue <Issue-ID>` only for the dependency-ready frontier. A wide mechanical refactor that cannot stay green as vertical slices uses expand-contract instead.

Exact in-Spec planning refinements may create one successor Planning Seal. Changes to behavior, acceptance, target, or exclusions return to `to-spec`; child publication never silently expands or edits the parent.

## It's working if

- Every child can be executed and verified without consulting sibling execution state.
- Blocked children receive no execution command.
- Published bodies, blocking relations, Planning baseline, and ready state pass read-back.

## Where it fits

`to-tickets` follows [to-spec](https://aihero.dev/skills-to-spec) and hands each ready child to [execute-issue](https://aihero.dev/skills-execute-issue), followed by [close-issue](https://aihero.dev/skills-close-issue). See [ask-matt](https://aihero.dev/skills-ask-matt) for the whole flow.
