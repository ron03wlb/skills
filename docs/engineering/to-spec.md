## What it does

`to-spec` synthesizes settled conversation and repository evidence into an execution-ready Tracker [Spec](https://www.aihero.dev/ai-coding-dictionary/spec), seals approved planning artifacts, and publishes it through a retry-safe Workflow checkpoint with one immutable downstream handoff.

It does not restart the interview or leave an operational plan as unexplained target dirt. It is also the sole delivery-shape authority: downstream skills consume its Single-Issue or Multi-Issue classification instead of deciding again.

## When to reach for it

You invoke this by typing `/to-spec` — the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

Reach for it after behavior and domain language are settled. Use [grill-with-docs](https://aihero.dev/skills-grill-with-docs) first when material decisions remain; use [to-tickets](https://aihero.dev/skills-to-tickets) only when the published Spec says Multi-Issue.

## Prerequisites

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker and triage labels. The repository must expose the target branch, the visible Planning handoff for accepted glossary or ADR work, and its configured Workflow checkpoint transaction and shared Target mutation writer seams.

## One checkpointed contract

A Single-Issue Spec carries at most three non-authoritative User Outcomes, stable `AC-n` Acceptance Criteria, non-exhaustive expected touchpoints, a mapped Implementation Plan, verification, exclusions, and `/run-issue-workflow <Spec-ID>`. A Multi-Issue parent keeps only the aggregate constraints and `/to-tickets <Spec-ID>` handoff. Classification follows executable outcomes and blocking edges, not file count or apparent size.

A retry-safe Workflow checkpoint gives the operational plan one durable owner before publication, so a retry cannot silently duplicate or reattribute producer work. Its immutable `handoff.completed` records the exact published route without granting Run, implementation, push, or deployment authority.

## It's working if

- The published Planning Seal, checkpoint evidence, and immutable handoff agree.
- A Single-Issue Spec ends in `/run-issue-workflow <Spec-ID>`; a Multi-Issue parent ends in `/to-tickets <Spec-ID>`.
- A failure reports the full SHA and exact partial state. A retry reads the prior partial-state report; missing or conflicting evidence stops while unrelated work remains untouched.

## Where it fits

`to-spec` follows [grill-with-docs](https://aihero.dev/skills-grill-with-docs). It routes a Single-Issue Tracker Spec to the repository's Run coordinator and a Multi-Issue Tracker Spec to [to-tickets](https://aihero.dev/skills-to-tickets); approved Standalone Specs use [implement](https://aihero.dev/skills-implement). See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
