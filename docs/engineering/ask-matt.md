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

[pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) is optional after an Issue is published. The human names one artifact they already executed; the skill records that attestation once, and `execute-issue` accepts it without resolver setup or target verification.

[prepare-prerequisite-artifact](https://aihero.dev/skills-prepare-prerequisite-artifact) is model-invoked and not a public starting route. From an exact active prerequisite-preparation handoff, it uses the repository adapter to build one validated, independently reviewed, fail-closed Operator SQL candidate without executing it or touching an external environment.

Each new execution completion note declares `workflowArtifacts` as exact required non-contract paths with requirement sources and purposes, or an explicit empty list. The field classifies scope without supplying coverage or verification authority. Each completed Issue is then locally integrated and closed through [close-issue](https://aihero.dev/skills-close-issue). Independent Issue worktrees may execute concurrently; one writer per recorded target performs the three idempotent close actions, and advancing that target does not invalidate other completions. The same command closes a Multi-Issue parent only after every exact child is closed and reachable. Before push, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) uses local-ahead completion-note reachability; already-pushed work requires an explicit merge request, pull request, or exact range. Both modes run the aggregate gate once. Across execution and target verification, only an exact-evidence **Confirmed code review finding** blocks; a **Code review advisory** remains visible without repair or waiver authority. A Confirmed aggregate finding points to a new human-created **Aggregate repair Issue** on the same target, and verification never creates or executes it, repairs product code, reopens an earlier Issue, or edits a completion note. After a coverage failure containing only eligible direct target contributions, it shows the complete exact record draft, obtains one human confirmation, invokes [attest-target-contribution](https://aihero.dev/skills-attest-target-contribution), and starts fresh from Entry. For one eligible closed historical completion-evidence failure, it proves one exact remedy, shows the complete reconciliation draft, obtains exact human confirmation, invokes [record-closed-issue-reconciliation](https://aihero.dev/skills-record-closed-issue-reconciliation), and likewise starts fresh from Entry. Neither helper pushes, and neither recovery has a separate manual command.

The manual leaf route remains available command by command. A separately installed authorized coordinator may instead use one valid **DAG Run Grant** to invoke the same `execute-issue` and `close-issue` leaves without per-Issue approval. Each leaf revalidates that authority and keeps every existing worktree, review, merge, tracker, prerequisite, push, deploy, and scope boundary; the Codex-only coordinator is not promoted or packaged here.

Material security, data, concurrency, migration, contract, or cross-module risk requires [code-review](https://aihero.dev/skills-code-review) before integration.

The independent [wiki](https://aihero.dev/skills-wiki) and [remove-ron](https://aihero.dev/skills-remove-ron) controls remain outside Issue delivery. Use [explain-decision](https://aihero.dev/skills-explain-decision) for a read-only option comparison and [grilling](https://aihero.dev/skills-grilling) to pressure-test a plan without creating docs.

## Where it fits

`ask-matt` is a reach-for-it-anytime router, not a chain step. Its most common neighbours are [grill-with-docs](https://aihero.dev/skills-grill-with-docs), [to-spec](https://aihero.dev/skills-to-spec), and [execute-issue](https://aihero.dev/skills-execute-issue); [ask-matt](https://aihero.dev/skills-ask-matt) remains the map of record.
