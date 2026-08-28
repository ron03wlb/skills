Quickstart:

```bash
npx skills add mattpocock/skills --skill=pre-execute-issue
```

```bash
npx skills update pre-execute-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/pre-execute-issue)

## What it does

`pre-execute-issue` records that a human already executed or applied one exact repository artifact for a published Issue.

The human statement is sufficient workflow authority. The skill does not prepare the artifact, inspect a database, verify an environment, or require a second invocation.

## When to reach for it

You invoke this by typing `/pre-execute-issue <Issue-ID> <artifact-path>` — the agent won't reach for it on its own.

Reach for it after you complete a manual SQL migration or another Issue prerequisite and want [execute-issue](https://aihero.dev/skills-execute-issue) to continue.

## One attestation

The skill writes one compact `manual_prerequisite_complete:v1` Issue comment containing the Issue ID and normalized artifact path, then reads it back once. An exact existing comment is reused without duplication.

The comment records your authority to continue; it deliberately does not claim that an agent proved the external target outcome. You never need to provide credentials, target details, hashes, postflight output, or resolver configuration.

## It's working if

- One invocation records or reuses the exact Issue-and-artifact attestation.
- No worktree, artifact, database, or external environment is changed.
- The next command is `/execute-issue <Issue-ID>`.

## Where it fits

`pre-execute-issue` is an optional human handoff between a published [to-spec](https://aihero.dev/skills-to-spec) or [to-tickets](https://aihero.dev/skills-to-tickets) Issue and [execute-issue](https://aihero.dev/skills-execute-issue). See [ask-matt](https://aihero.dev/skills-ask-matt) for the whole route.
