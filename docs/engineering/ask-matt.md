Quickstart:

```bash
npx skills add mattpocock/skills --skill=ask-matt
```

```bash
npx skills update ask-matt
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/ask-matt)

## What it does

`ask-matt` is the concise router over this skill set. It tells you which flow and next command fit; it does no planning, implementation, integration, or push itself.

The router does not re-decide delivery shape. [to-spec](https://aihero.dev/skills-to-spec) is the sole authority for Single-Issue versus Multi-Issue Tracker Specs, so every downstream skill consumes one published route.

## When to reach for it

You invoke this by typing `/ask-matt` — the agent won't reach for it on its own.

Reach for it when you do not know where to enter or resume a flow. If you already know the exact skill, invoke it directly.

## The delivery route

Codebase-backed ideas normally move from [grill-with-docs](https://aihero.dev/skills-grill-with-docs) to [to-spec](https://aihero.dev/skills-to-spec), which commits or reuses the Planning Seal and publishes one route:

- Single-Issue Tracker Spec → [execute-issue](https://aihero.dev/skills-execute-issue).
- Multi-Issue Tracker Spec → [to-tickets](https://aihero.dev/skills-to-tickets) to reconcile one Issue decomposition and publish its Decomposition publication record, then `execute-issue` for each ready child.
- Standalone Spec or explicit direct current-branch work → [implement](https://aihero.dev/skills-implement).

A Tracker Spec uses `/execute-issue`; a Standalone Spec uses `/implement`.

[setup-pre-execute-issue](https://aihero.dev/skills-setup-pre-execute-issue) is explicit repository adoption used once only when a consumer repository has a concrete manual prerequisite. It is run-once setup, not a runtime step; without that concrete need it makes no change.

[pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) is optional after an Issue is published. It may prepare and verify a repository-declared manual prerequisite before `execute-issue`; direct execution remains valid because it runs the same read-only discovery and stops when current `READY` evidence is required.

Each completed Issue is locally integrated and closed through [close-issue](https://aihero.dev/skills-close-issue). Independent Issue worktrees may execute concurrently; one writer per recorded target performs the three idempotent close actions, and advancing that target does not invalidate other completions. The same command closes a Multi-Issue parent only after every exact child is closed and reachable. Before push, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) proves the exact aggregate target contains every relevant closed candidate and is review/test clean. It does not push.

Material security, data, concurrency, migration, contract, or cross-module risk requires [code-review](https://aihero.dev/skills-code-review) before integration.

The independent [wiki](https://aihero.dev/skills-wiki) and [remove-ron](https://aihero.dev/skills-remove-ron) controls remain outside Issue delivery. Use [explain-decision](https://aihero.dev/skills-explain-decision) for a read-only option comparison and [grilling](https://aihero.dev/skills-grilling) to pressure-test a plan without creating docs.

## Where it fits

`ask-matt` is a reach-for-it-anytime router, not a chain step. Its most common neighbours are [grill-with-docs](https://aihero.dev/skills-grill-with-docs), [to-spec](https://aihero.dev/skills-to-spec), and [execute-issue](https://aihero.dev/skills-execute-issue); [ask-matt](https://aihero.dev/skills-ask-matt) remains the map of record.
