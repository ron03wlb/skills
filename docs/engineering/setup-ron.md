Quickstart:

```bash
npx skills add mattpocock/skills --skill=setup-ron
```

```bash
npx skills update setup-ron
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/setup-ron)

## What it does

`setup-ron` configures one repository for the Ron Issue delivery workflow: durable tracker capabilities, Wiki baseline, domain docs, target branch, and Execution Lane conventions.

It does not assume that a GitHub remote or a Wiki is sufficient. It probes the required capabilities, presents one consolidated proposal, and reports degraded mode instead of claiming guarantees the repository cannot support.

## When to reach for it

You invoke this by typing `/setup-ron` — the agent won't reach for it on its own. Run it once before the first Ron workflow, or again when the tracker, Wiki, target branch, or Lane convention changes.

## Prerequisites

Run it inside a Git repository. Ron v1 full mode needs a GitHub repository whose Issues and comments can be read back; repositories on other trackers can be documented only as degraded or unsupported.

## One repository contract

The lasting output is `docs/agents/ron-workflow.md`, plus shared tracker and domain files where needed. The setup is idempotent: rerunning it updates the one contract instead of creating parallel Ron-specific configuration.

## Where it fits

This is the run-once entry to `setup-ron → grill-with-docs → to-spec-ron → to-tickets-ron → execute-issue → close-issue`. Use [setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) for the upstream Matt flow without Ron authorization and closeout gates. See [ask-ron](https://aihero.dev/skills-ask-ron) for the governed route and [ask-matt](https://aihero.dev/skills-ask-matt) for the complete upstream map.
