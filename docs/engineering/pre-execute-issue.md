Quickstart:

```bash
npx skills add mattpocock/skills --skill=pre-execute-issue
```

```bash
npx skills update pre-execute-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/pre-execute-issue)

## What it does

`pre-execute-issue` inspects one published Tracker Spec or child Issue for a repository-declared prerequisite, prepares only the declared artifact when required, and hands the manual action back to the human.

It never makes prerequisite preparation mandatory. No resolver declaration ends as `NOT_REQUIRED`; a required prerequisite reaches `READY` only through a repository validation pass, a clean artifact-only commit, a human-owned manual action, and one read-only target verification.

## When to reach for it

You invoke this by typing `/pre-execute-issue <Issue-ID>` — the agent won't reach for it on its own.

Reach for it after an Issue is published when its repository may require SQL or another manually applied artifact before implementation. You may also go directly to [execute-issue](https://aihero.dev/skills-execute-issue), which performs the same read-only discovery and stops safely if current prerequisite evidence is required.

## Prerequisites

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the Issue tracker. A repository that opts in must name one repository-owned resolver command in its existing instructions; repositories without a declaration need no setup and keep the ordinary execution route.

## Prerequisite inspection

The resolver owns three operations: read-only `discover`, artifact-writing `prepare`, and read-only `verify`. Generic skills consume the required semantics but leave transport, field names, validation, and target policy with the repository. Missing or contradictory declared behavior fails closed instead of becoming a guessed universal configuration.

Only `REQUIRED` creates or reuses the Issue worktree. A validated artifact is committed alone before an append-only `WAITING_MANUAL` receipt; after the human acts, one target check can append `READY`. Protected artifact, resolver, policy, target, or ancestry drift makes that evidence stale.

## The manual boundary

The skill never executes SQL, changes a database or external environment, stores credentials, polls, or performs the manual action. Verification checks only the declared outcome, and failure preserves `WAITING_MANUAL` rather than manufacturing a failure receipt or replaying the action.

## It's working if

- Undeclared prerequisites stop as `NOT_REQUIRED` without a worktree or tracker receipt.
- Required preparation leaves one clean Issue worktree and an artifact-only checkpoint.
- `WAITING_MANUAL` and `READY` are each appended and read back once.
- The same worktree and prerequisite ancestry continue into `execute-issue`.

## Where it fits

`pre-execute-issue` is an optional user-invoked control between a published [to-spec](https://aihero.dev/skills-to-spec) or [to-tickets](https://aihero.dev/skills-to-tickets) Issue and [execute-issue](https://aihero.dev/skills-execute-issue). It prepares prerequisite evidence only; implementation and review remain with `execute-issue`. See [ask-matt](https://aihero.dev/skills-ask-matt) for the whole route.
