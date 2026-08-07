Quickstart:

```bash
npx skills add mattpocock/skills --skill=to-spec-ron
```

```bash
npx skills update to-spec-ron
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-spec-ron)

## What it does

`to-spec-ron` synthesizes an already-resolved discussion into one hash-verified Change Spec comment on a GitHub Issue.

It creates or reuses the Issue only when the spec is complete. Until then it keeps a private, non-authoritative Working Spec under Git metadata. Every normal, Bootstrap, and Wiki-repair Change Spec uses the same deterministic publisher.

## When to reach for it

You invoke this by typing `/to-spec-ron` — the agent won't reach for it on its own. Use it after grilling has settled behavior, test seams, Wiki impact, and exclusions. For the upstream flow without Issue-bound hashes and authorization lineage, use [to-spec](https://aihero.dev/skills-to-spec).

## Prerequisites

Run [setup-ron](https://aihero.dev/skills-setup-ron) first. Full completion requires a working GitHub Issue adapter and a readable `docs/agents/ron-workflow.md`.

## Append-only contract

The Change Spec is a historical contract, not execution authority. With a ready baseline it records `inherit`, `add`, `change`, or `remove` for relevant Wiki claims. With a missing baseline, Wiki-optional delivery records semantic impact with no Wiki operation, context, or dispositions. Corrections create new comments that supersede older ones; editing the old comment invalidates dependent contracts and Grants.

The published state is `specified`. Authorization and execution readiness are separate later gates.

## Where it fits

This is the contract step after [grill-with-docs](https://aihero.dev/skills-grill-with-docs) and before [to-tickets-ron](https://aihero.dev/skills-to-tickets-ron). See [ask-ron](https://aihero.dev/skills-ask-ron) for the governed route and [ask-matt](https://aihero.dev/skills-ask-matt) for the upstream map.
