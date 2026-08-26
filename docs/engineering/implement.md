Quickstart:

```bash
npx skills add mattpocock/skills --skill=implement
```

```bash
npx skills update implement
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/implement)

## What it does

`implement` builds an approved Standalone Spec or explicit direct task on the current branch, using test-driven slices, required verification, and review before a scoped commit.

It does not execute Tracker Specs. Tracker-backed work, including local tracker files, follows the published route through [execute-issue](https://aihero.dev/skills-execute-issue).

## When to reach for it

You invoke this by typing `/implement` — the agent won't reach for it on its own.

Reach for it when you intentionally want direct current-branch work and no tracker integration lifecycle. Use [to-spec](https://aihero.dev/skills-to-spec) when the scope still needs publication or [execute-issue](https://aihero.dev/skills-execute-issue) for a Tracker Spec.

## Pre-agreed seams

`implement` uses [tdd](https://aihero.dev/skills-tdd) at the already selected public seams, runs focused checks throughout and the required full suite at the end, then invokes [code-review](https://aihero.dev/skills-code-review) against its fixed baseline.

It creates no Issue worktree, integration receipt, tracker closure, push, or deployment state.

## Where it fits

`implement` is the direct-branch executor for Standalone Specs. Tracker Specs instead use [execute-issue](https://aihero.dev/skills-execute-issue) and [close-issue](https://aihero.dev/skills-close-issue). See [ask-matt](https://aihero.dev/skills-ask-matt) for routing.
