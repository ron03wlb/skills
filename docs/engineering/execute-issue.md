Quickstart:

```bash
npx skills add mattpocock/skills --skill=execute-issue
```

```bash
npx skills update execute-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/execute-issue)

## What it does

`execute-issue` implements exactly one authorized Ron Leaf or Standalone Issue through the contract's feedback loop, fixed-candidate review, ordered local implementation commits, and durable completion evidence.

Code behavior uses TDD. A bounded [wiki](https://aihero.dev/skills-wiki) Bootstrap or repair Standalone uses page/source/link/build validation instead, while Leaves remain unable to mutate Wiki. Execution stops at `implemented_on_lane`.

Wiki-optional delivery runs the same authorization, implementation, non-Wiki review, and evidence path without requiring a Wiki baseline or claiming Wiki validation.

## When to reach for it

Type `/execute-issue`, or the agent reaches for it automatically when one exact Issue already has a valid `execute` Grant. Reach for it only after a hash-verified execution contract exists; use [to-tickets-ron](https://aihero.dev/skills-to-tickets-ron) first when it does not.

## Prerequisites

The repository needs a full [setup-ron](https://aihero.dev/skills-setup-ron) configuration, a readable GitHub tracker, one current Change Spec, and a dependency-ready Executable Issue.

## Bounded execution

The Issue Context Packet carries only current pointers, hashes, ownership, seams, commands, and stop conditions. Small work stays inline; a subagent is used only when isolation or independent work pays for its coordination cost.

Each coherent vertical slice may become a local checkpoint commit after its relevant seam passes; this needs no per-commit approval and never widens the Issue-owned scope. Review covers the complete ordered commit chain at Lane HEAD.

The `execute` Grant authorizes up to ten material review-repair waves without another routine approval. Every repair stays inside the unchanged contract, creates a new checkpoint commit and candidate, and re-runs affected review axes. A scope, acceptance, public-seam, target, or exclusion change still stops for a superseding contract and Grant, as does a persistent finding after wave ten.

## Where it fits

This is the implementation step between [to-tickets-ron](https://aihero.dev/skills-to-tickets-ron) and [close-issue](https://aihero.dev/skills-close-issue). It reuses [tdd](https://aihero.dev/skills-tdd) discipline while enforcing Ron authority and Lane proof states. See [ask-ron](https://aihero.dev/skills-ask-ron) and the upstream [ask-matt](https://aihero.dev/skills-ask-matt) map.
