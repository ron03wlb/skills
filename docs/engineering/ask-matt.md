## What it does

`ask-matt` is the concise router over this skill set. It tells you which flow and next command fit; it does no planning, implementation, integration, or push itself.

The router does not re-decide delivery shape. [to-spec](https://aihero.dev/skills-to-spec) is the sole authority for Single-Issue versus Multi-Issue Tracker [Specs](https://www.aihero.dev/ai-coding-dictionary/spec), so every downstream skill consumes one published route.

## When to reach for it

You invoke this by typing `/ask-matt` — the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

Reach for it when you do not know where to enter or resume a flow. If you already know the exact skill, invoke it directly.

## The delivery route

Codebase-backed ideas normally move from [grill-with-docs](https://aihero.dev/skills-grill-with-docs), which gives one task an isolated planning worktree for one proposed Spec and target, to [to-spec](https://aihero.dev/skills-to-spec). `to-spec` revalidates relevant facts against the latest target, commits or reuses the Planning Seal, and publishes one immutable handoff through its minimal operation-scoped transaction:

- Single-Issue Tracker Spec → `/run-issue-workflow <Spec-ID>`.
- Multi-Issue Tracker Spec → [to-tickets](https://aihero.dev/skills-to-tickets) to consume the completed `to-spec` handoff, use its minimal operation-scoped transaction, publish the Decomposition publication record and composite handoff, then `/run-issue-workflow <Spec-ID>`.
- Standalone Spec or explicit direct current-branch work → [implement](https://aihero.dev/skills-implement).

A Single-Issue Tracker Spec uses `/run-issue-workflow`; a Multi-Issue Tracker Spec uses `/to-tickets`; a Standalone Spec uses `/implement`. `execute-issue` remains the exact Issue leaf for a direct human invocation or an authorized coordinator, not the command published by `to-spec`.

Fresh `to-spec` and `to-tickets` operations create no target operational-plan checkpoint or prospective contribution record. Frozen legacy and profile-v1 producer operations retain exact resume behavior and may invoke [model](https://www.aihero.dev/ai-coding-dictionary/model)-invoked [attest-target-contribution](https://aihero.dev/skills-attest-target-contribution) only at their existing checkpoint stage; the helper needs no second confirmation and returns only the immutable record identity.

[execute-issue](https://aihero.dev/skills-execute-issue) automatically invokes [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) in the same authorized lane when one exact declared or unchanged-scope late prerequisite lacks a matching attestation. The prerequisite flow creates or reuses the Issue worktree, invokes `prepare-prerequisite-artifact` when needed, presents the committed Operator SQL, and returns one content-bound v2 identity for `APPLIED` or `NO_OP` after fresh checks. Direct `/pre-execute-issue <Issue-ID>` remains available but stops after read-back and never resumes implementation by itself.

[prepare-prerequisite-artifact](https://aihero.dev/skills-prepare-prerequisite-artifact) is model-invoked and not a public starting route. From an exact active prerequisite-preparation handoff, it uses the repository adapter to build one validated, independently reviewed, fail-closed Operator SQL candidate without executing it or touching an external [environment](https://www.aihero.dev/ai-coding-dictionary/environment).

Each new execution completion note records exact required non-contract `workflowArtifacts` with sources and purposes, or an empty list; this classifies scope without supplying coverage or verification authority. Each completed Issue is then locally integrated and closed through [close-issue](https://aihero.dev/skills-close-issue). The close leaf acquires one repository close lease before its exact target mutation writer, so one closeout runs per Git common dir while Issue worktrees and unrelated planning remain concurrent. Advancing the target does not invalidate other completions. The same command closes a Multi-Issue parent only after every exact child is closed and reachable. Before push, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) uses local-ahead completion-note reachability; already-pushed work requires an explicit merge request, pull request, or exact range. Both modes run the aggregate gate once. Across execution and target verification, only an exact-evidence **Confirmed code review finding** blocks; a **Code review advisory** remains visible without repair or waiver authority. A Confirmed aggregate finding points to a new human-created **Aggregate repair Issue** on the same target, and verification never creates or executes it, repairs product code, reopens an earlier Issue, or edits a completion note. After a coverage failure containing only eligible direct target contributions, it shows the complete exact record draft, obtains one human confirmation, invokes [attest-target-contribution](https://aihero.dev/skills-attest-target-contribution), and starts fresh from Entry. For one eligible closed historical completion-evidence failure, it proves one exact remedy, shows the complete reconciliation draft, obtains exact human confirmation, invokes [record-closed-issue-reconciliation](https://aihero.dev/skills-record-closed-issue-reconciliation), and likewise starts fresh from Entry. For one eligible historical command placeholder, it proves a descendant Issue recorded the exact full-suite command passing, reruns that command on the frozen target, obtains exact confirmation through the same helper, and starts fresh from Entry with the literal command in the aggregate set. Neither helper pushes, and no recovery adds a separate manual command. After a passing local-ahead gate writes current `push_ready`, the human invokes [push-target](https://aihero.dev/skills-push-target); it fetches the unique configured upstream, performs one ordinary non-force push of the exact verified target, and reads the exact remote ref back before reporting delivery.

Planning lanes and Issue worktrees may run concurrently. Only accepted Planning Seal writes and closeout hold the target mutation writer; closeout additionally holds the repository close lease, while ordinary lane work and tracker publication hold neither.

Published Tracker Specs route through the separately installed authorized coordinator, while the individual `execute-issue` and `close-issue` leaves remain available to direct human invocation. The coordinator may use one valid **DAG Run Grant** to invoke those leaves without per-Issue approval. Each leaf revalidates that authority and keeps every existing worktree, review, merge, tracker, prerequisite, push, deploy, and scope boundary; the Codex-only coordinator is not promoted or packaged here.

Material security, data, concurrency, migration, contract, or cross-module risk requires [code-review](https://aihero.dev/skills-code-review) before integration.

The independent [wiki](https://aihero.dev/skills-wiki) and [remove-ron](https://aihero.dev/skills-remove-ron) controls remain outside Issue delivery. Use [confirm-understanding](https://aihero.dev/skills-confirm-understanding) to calibrate a mental model against named evidence, [explain-decision](https://aihero.dev/skills-explain-decision) for a read-only option comparison, and [grilling](https://aihero.dev/skills-grilling) to pressure-test a plan without creating docs. Use [to-questionnaire](https://aihero.dev/skills-to-questionnaire) when another person holds the missing knowledge, [wait-what](https://aihero.dev/skills-wait-what) when the last message did not land, and [writing-for-agents](https://aihero.dev/skills-writing-for-agents) when editing skills or other documents consumed by agents.

## It's working if

- You get one route for the exact work in front of you, with the reason its authority and lifecycle fit.
- Tracker work stays on the published Spec and Issue path, while standalone work stays on the direct `implement` path.
- Helpers and closeout steps appear only where their prerequisites and authority are already established.

## Other routes and phase boundaries

For a personal daily reflection, use `/daily-journal`; it keeps reflection voice-first and adds compact English practice after completion.

Use [to-questionnaire](https://aihero.dev/skills-to-questionnaire) when another person holds the missing decision, [wizard](https://aihero.dev/skills-wizard) for human-only dashboard or credential steps, and [wait-what](https://aihero.dev/skills-wait-what) when the last explanation needs a clearer second pass. [writing-for-agents](https://aihero.dev/skills-writing-for-agents) is the reference for skills and other agent-facing documents.

At a phase boundary, choose whether to continue, clear, create a [handoff](https://aihero.dev/skills-handoff), delegate a bounded subtask, or compact. Do not switch context strategies mid-phase unless the remaining work can be split cleanly.

## Where it fits

`ask-matt` is a reach-for-it-anytime router, not a chain step. Its most common neighbours are [grill-with-docs](https://aihero.dev/skills-grill-with-docs), [to-spec](https://aihero.dev/skills-to-spec), and [execute-issue](https://aihero.dev/skills-execute-issue); [ask-matt](https://aihero.dev/skills-ask-matt) remains the map of record.
