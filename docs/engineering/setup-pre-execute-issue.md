Quickstart:

```bash
npx skills add mattpocock/skills --skill=setup-pre-execute-issue
```

```bash
npx skills update setup-pre-execute-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/setup-pre-execute-issue)

## What it does

`setup-pre-execute-issue` adopts a repository-owned prerequisite resolver only when a consumer repository has a concrete manual prerequisite. Without that evidence it makes no change.

It is a run-once setup, not a runtime step. The consumer repository keeps ownership of resolver transport, fields, policy, validation, and target semantics.

## When to reach for it

You invoke this by typing `/setup-pre-execute-issue` — the agent won't reach for it on its own.

Reach for it once when a repository needs to prepare, manually apply, and later verify an Issue prerequisite. Runtime handling belongs to [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) and [execute-issue](https://aihero.dev/skills-execute-issue).

## Prerequisites

The consumer repository needs evidence of one concrete manual prerequisite and existing instructions in `AGENTS.md` or `CLAUDE.md`. Without that evidence, setup reports that it is unnecessary and leaves the repository unchanged.

## One complete adoption

The setup surface is deliberately narrow: the minimum existing routing instruction, prerequisite policy, repository-owned resolver, and fixture. Together they expose exact machine-readable `discover`, `prepare`, and `verify` operations; the skill does not install a universal resolver or configuration schema.

## Complete or unchanged

Safe repository-local syntax, static, and fixture validation must pass for the complete prospective adoption before its declaration becomes active. Failure leaves no active declaration, partial resolver, placeholder, or TODO and preserves unrelated staged, unstaged, and untracked work.

The workflow never performs the manual action, executes SQL, contacts its target, changes Issue receipts, invokes runtime skills, pushes, integrates, or deploys.

## It's working if

- A repository without a concrete prerequisite stays byte-for-byte unchanged.
- A repository that adopts the contract has one declared resolver and a passing fixture for all three operations.
- Runtime preparation and verification remain separate user-invoked work.

## Where it fits

`setup-pre-execute-issue` is a run-once repository setup, not an Issue delivery step. Its runtime neighbours are [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) and [execute-issue](https://aihero.dev/skills-execute-issue); see [ask-matt](https://aihero.dev/skills-ask-matt) for the whole skill map.
