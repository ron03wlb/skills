Quickstart:

```bash
npx skills add mattpocock/skills --skill=to-spec
```

```bash
npx skills update to-spec
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-spec)

## What it does

`to-spec` synthesizes settled conversation and repository evidence into an execution-ready Tracker Spec, seals approved planning artifacts, and publishes the exact next command.

It does not restart the interview. It is also the sole delivery-shape authority: downstream skills never independently decide whether the Spec is Single-Issue or Multi-Issue.

## When to reach for it

You invoke this by typing `/to-spec` — the agent won't reach for it on its own.

Reach for it after behavior and domain language are settled. Use [grill-with-docs](https://aihero.dev/skills-grill-with-docs) first when material decisions remain; use [to-tickets](https://aihero.dev/skills-to-tickets) only when the published Spec says Multi-Issue.

## Prerequisites

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker and triage labels. The repository must also expose the target branch and any approved glossary or ADR delta that belongs in the Planning Seal.

## One executable contract

A Single-Issue Spec carries at most three non-authoritative User Outcomes, stable `AC-n` Acceptance Criteria, non-exhaustive expected touchpoints, a mapped Implementation Plan, verification, exclusions, and `/execute-issue <Spec-ID>`. Every criterion is covered by a step and verification item; every step covers a criterion.

A Multi-Issue parent keeps only the overall outcome, cross-Issue constraints, decomposition rationale, exclusions, and `/to-tickets <Spec-ID>` handoff. It does not duplicate child Acceptance Criteria, plans, touchpoints, or verification; `to-tickets` creates those executable authorities. Classification follows executable outcomes and blocking edges, not file count or apparent size. Only material routing ambiguity permits one blocking question with a recommendation.

The Planning Seal commits only owned planning artifacts or reuses the current target when no relevant delta exists. Existing Specs are revised in place. Publication or read-back failure reports the full SHA. A retry verifies the prior partial-state report; missing or conflicting evidence stops instead of selecting a new seal.

## It's working if

- A Single-Issue Spec contains mapped Acceptance Criteria; a Multi-Issue parent contains only cross-Issue decomposition authority. Both end in one copy-ready next command.
- Expected paths guide discovery without becoming an allowlist.
- The published mode, classification, Planning Seal, label, and command all survive read-back.

## Where it fits

`to-spec` follows [grill-with-docs](https://aihero.dev/skills-grill-with-docs) and routes either directly to [execute-issue](https://aihero.dev/skills-execute-issue) or through [to-tickets](https://aihero.dev/skills-to-tickets). Approved Standalone Specs use [implement](https://aihero.dev/skills-implement). See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
