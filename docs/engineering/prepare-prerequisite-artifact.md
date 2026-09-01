Quickstart:

```bash
npx skills add mattpocock/skills --skill=prepare-prerequisite-artifact
```

```bash
npx skills update prepare-prerequisite-artifact
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/prepare-prerequisite-artifact)

## What it does

`prepare-prerequisite-artifact` builds one fail-closed Operator SQL candidate for an exact declared Issue prerequisite. It consumes an already-installed repository adapter, validates and independently reviews the artifact, and returns its candidate commit, Git blob, and path.

It never touches the database or executes the SQL. Missing adapter evidence, unsafe recovery, uncertain state, or a failing validation or confirmed review finding stops before the artifact is presented as ready.

## When to reach for it

Type `/prepare-prerequisite-artifact`, or the agent reaches for it automatically when an active prerequisite-preparation handoff fits. Without that exact handoff it stops; this model-invoked helper is not a public starting route for prerequisite work.

Reach for this helper when that handoff already binds one exact Issue, worktree, approved scope, artifact path, and repository-owned adapter. A human starts and finishes the surrounding prerequisite flow through [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue).

## Prerequisites

The repository must already provide and document an adapter with read-only `discover`, artifact-writing `prepare`, and read-only `validate` operations. The active handoff must name the exact declared artifact; this helper does not install adapters, infer a database dialect, or create infrastructure.

## One Operator SQL

The artifact has three ordered sections: fail-closed preflight, persistent exact backup with inert recovery, then the authorized mutation and postconditions. Every uncertain or partial state aborts. Only a fully validated `APPLIED` or proven `NO_OP` path counts as a successful script outcome when a human later runs it. A later authorized operation may reuse the same logical backup name only after human cleanup and fresh pre-mutation proof.

Deterministic validation and independent Standards and Spec review share ten material repair waves. Advisories stay visible without blocking; a confirmed violation or validation failure must be repaired before the candidate is ready.

## It's working if

- Only the declared artifact changes and the Issue worktree is clean after its commit.
- The returned commit, Git blob, and path identify the exact reviewed content.
- No SQL, database, tracker, integration, push, deployment, recovery, or cleanup action occurs.

## Where it fits

This is a model-invoked internal helper between [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) preparation and later [execute-issue](https://aihero.dev/skills-execute-issue) continuation. See [ask-matt](https://aihero.dev/skills-ask-matt) for the public delivery route.
