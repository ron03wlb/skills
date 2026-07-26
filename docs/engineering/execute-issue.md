Quickstart:

```bash
npx skills add mattpocock/skills --skill=execute-issue
```

```bash
npx skills update execute-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/execute-issue)

## What it does

`execute-issue` implements exactly one authorized Ron Leaf or Standalone Issue through TDD, fixed-candidate review, one final local commit, and durable completion evidence.

It stops at `implemented_on_lane`. The `execute` capability does not close the Issue, merge the target, push, deploy, or perform live operations.

## When to reach for it

Type `/execute-issue`, or the agent reaches for it automatically when one exact Issue already has a valid `execute` Grant. Reach for it only after a hash-verified execution contract exists; use [to-tickets-ron](https://aihero.dev/skills-to-tickets-ron) first when it does not.

## Prerequisites

The repository needs a full [setup-ron](https://aihero.dev/skills-setup-ron) configuration, a readable GitHub tracker, one current Change Spec, and a dependency-ready Executable Issue.

## Bounded execution

The Issue Context Packet carries only current pointers, hashes, ownership, seams, commands, and stop conditions. Small work stays inline; a subagent is used only when isolation or independent work pays for its coordination cost.

Every repair creates a new candidate and invalidates stale review evidence. A third material repair wave is refused.

## Where it fits

This is the implementation step between [to-tickets-ron](https://aihero.dev/skills-to-tickets-ron) and [close-issue](https://aihero.dev/skills-close-issue). It reuses [tdd](https://aihero.dev/skills-tdd) discipline while enforcing Ron authority and Lane proof states. See [ask-ron](https://aihero.dev/skills-ask-ron) and the upstream [ask-matt](https://aihero.dev/skills-ask-matt) map.
