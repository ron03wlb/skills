Quickstart:

```bash
npx skills add mattpocock/skills --skill=to-tickets-ron
```

```bash
npx skills update to-tickets-ron
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-tickets-ron)

## What it does

`to-tickets-ron` turns one verified Change Spec into dependency-ordered Executable Issues.

It keeps Matt's tracer-bullet slicing, then binds each Leaf to its own outcome, behavioral seam, target, Wiki operation/baseline requirement, Lane, ownership, review profile, evidence state, and optional Grant. Parent authority never cascades.

Wiki-optional delivery preserves semantic intent while keeping Wiki Preview/disposition hashes, owned paths, and review not applicable; it never forces baseline bootstrap before ticket execution.

## When to reach for it

You invoke this by typing `/to-tickets-ron` — the agent won't reach for it on its own. Use it when a current `workflow-change-spec:v1` comment exists and the work needs executable slicing. For ordinary tracker tickets without Ron authorization contracts, use [to-tickets](https://aihero.dev/skills-to-tickets).

## Prerequisites

Run [setup-ron](https://aihero.dev/skills-setup-ron), then publish the Change Spec with [to-spec-ron](https://aihero.dev/skills-to-spec-ron).

## One Lane, one Issue at a time

Related Leaves may reuse one clean Lane worktree, but every Leaf keeps a distinct contract, Grant, ordered commit chain, review, evidence record, and closure. Each Grant permits checkpoint commits after verified slices and up to ten in-scope review-repair waves without per-step approval. Contracts come from the same deterministic builder used by [wiki](https://aihero.dev/skills-wiki). One batch `同意` can record exact per-Leaf `execute` and `close_leaf` Grants without turning them into inherited Parent authority.

## Where it fits

This is the slicing and authorization-preparation step before [execute-issue](https://aihero.dev/skills-execute-issue). See [ask-ron](https://aihero.dev/skills-ask-ron) for the Ron route and [ask-matt](https://aihero.dev/skills-ask-matt) for the upstream map.
