Quickstart:

```bash
npx skills add mattpocock/skills --skill=remove-ron
```

```bash
npx skills update remove-ron
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/remove-ron)

## What it does

`remove-ron` removes only the retired repository-local Ron setup footprint: `docs/agents/ron-workflow.md`, clearly bounded Ron-only instruction text, and proven-inactive `.git/ron-workflow/` metadata. It checks open lifecycle authorization, drafts, execution/ownership markers, and referenced worktrees before cleanup.

## When to reach for it

You invoke this by typing `/remove-ron` — the agent won't reach for it on its own. Use it when a consumer repository should stop carrying the old Ron setup; active execution, dirty overlap, or ambiguous instruction ownership stops cleanup.

## Prerequisites

Run [setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) first so the repository has a configured, readable tracker. Cleanup stops if that tracker configuration or its current state cannot be verified.

## What it preserves

The skill preserves the Wiki, tracker Issues/comments, branches, worktrees, installed skills, product files, and shared tracker/domain configuration. It stages only exact cleanup paths and creates one local commit only when tracked files changed.

## Where it fits

This is a standalone migration/cleanup control exposed by [ask-matt](https://aihero.dev/skills-ask-matt). It removes retired Ron setup only and never pushes, remotely merges, or deploys.
