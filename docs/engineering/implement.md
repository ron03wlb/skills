## What it does

`implement` builds an approved Standalone Spec or explicit direct task on the current branch, using test-driven slices, required verification, and review before a scoped commit.

It does not execute Tracker Specs. Tracker-backed work, including local tracker files, follows the published [to-spec](https://aihero.dev/skills-to-spec) route.

## When to reach for it

You invoke this by typing `/implement` — the agent won't reach for it on its own.

Reach for it when you intentionally want direct current-branch work and no tracker integration lifecycle. Use [to-spec](https://aihero.dev/skills-to-spec) when the scope needs a Tracker Spec or its published route.

## Pre-agreed seams

`implement` uses [tdd](https://aihero.dev/skills-tdd) at the already selected public seams, runs focused checks throughout and the required full suite at the end, then invokes [code-review](https://aihero.dev/skills-code-review) against its fixed baseline.

It creates no Issue worktree, integration receipt, tracker closure, push, or deployment state.

## It's working if

- The approved direct task is implemented on the current branch through test-driven slices.
- Focused checks, the required full suite, and review pass before one scoped commit is created.
- No Issue worktree, tracker mutation, push, or deployment appears in the result.

## Where it fits

`implement` is the direct-branch executor for Standalone Specs. Tracker Specs instead follow the command published by [to-spec](https://aihero.dev/skills-to-spec); their exact Issue leaves still use [execute-issue](https://aihero.dev/skills-execute-issue) and [close-issue](https://aihero.dev/skills-close-issue). See [ask-matt](https://aihero.dev/skills-ask-matt) for routing.
