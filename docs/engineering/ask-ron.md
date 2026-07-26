Quickstart:

```bash
npx skills add mattpocock/skills --skill=ask-ron
```

```bash
npx skills update ask-ron
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/ask-ron)

## What it does

`ask-ron` identifies the next safe step in the Ron Issue delivery workflow.

It is read-only. It distinguishes specification, authorization, readiness, implementation, Leaf closure, Parent closeout, and publication instead of collapsing them into one “done” state.

## When to reach for it

You invoke this by typing `/ask-ron` — the agent won't reach for it on its own. Use it when you know the current work state but do not remember which Ron skill or gate comes next.

## The route it protects

The common path configures and initializes repository knowledge before keeping Matt's idea work and adding durable delivery controls:

`setup-ron → wiki → grill-with-docs → to-spec-ron → to-tickets-ron → execute-issue → close-issue`

Each Leaf completes before the next begins. Parent closeout automatically reuses [wiki](https://aihero.dev/skills-wiki) reconciliation. A valid bounded clean path continues without routine approval; only findings, ambiguity, expanded scope, or missing capability return to you.

## Where it fits

This is the router over the Ron workflow. Use [ask-matt](https://aihero.dev/skills-ask-matt) for the upstream skill map, and [setup-ron](https://aihero.dev/skills-setup-ron) when the repository has not yet declared its tracker, Wiki, target, and Lane contract.
