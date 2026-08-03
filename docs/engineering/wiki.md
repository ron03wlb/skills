Quickstart:

```bash
npx skills add mattpocock/skills --skill=wiki
```

```bash
npx skills update wiki
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/wiki)

## What it does

`wiki` initializes, resumes, inspects, or synchronizes the repository-local Canonical Wiki from verified Ron workflow state.

It is state-aware: the same `/wiki` command creates the first complete baseline when one is missing and later changes only affected topics. It keeps one bounded human root through closeout so execution and closeout receive separate non-delegating Grants. It never patches accepted Wiki content outside the existing Issue, Grant, review, and closeout flow.

## When to reach for it

You invoke this by typing `/wiki` — the agent won't reach for it on its own. Run it once after [setup-ron](https://aihero.dev/skills-setup-ron) when the baseline is missing, or later when you explicitly want a Wiki audit or bounded repair. Type `/wiki status` for a read-only state check.

## Prerequisites

The repository needs a valid `docs/agents/ron-workflow.md`, a readable configured tracker, and deterministic validation capabilities. Missing or ambiguous proof stops as `not-configured` or `not-verifiable`; it is never treated as a pass.

## One command, one authority path

Initialization creates one complete reviewed baseline through a Bootstrap Standalone Issue. Ready-state synchronization reuses the active change-owning Issue, or creates one bounded Wiki-repair Standalone only when no Issue owns clean proven drift.

Normal Parent or Standalone [close-issue](https://aihero.dev/skills-close-issue) runs the same reconciliation, so you do not need to remember `/wiki` after every change. Clean results stay compact; findings return only the problem and trade-offs that need a decision.

The authority stays bound to one fixed target identity. If that target moves, `/wiki` stops and asks for a new decision instead of refreshing the Grant automatically.

## It's working if

- the first `/wiki` ends with one complete `ready` baseline, never a partial target Wiki;
- later runs touch only ledger-derived topics and support files;
- unsupported sources, conflicting intent, or findings stop instead of silently rewriting the Wiki;
- no push, deployment, publication, or engine authority is implied.

## Where it fits

This is the Canonical Wiki control between run-once [setup-ron](https://aihero.dev/skills-setup-ron) and the normal Ron planning/closeout flow. See [ask-ron](https://aihero.dev/skills-ask-ron) for the governed route and [ask-matt](https://aihero.dev/skills-ask-matt) for the upstream map.
