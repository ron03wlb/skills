Quickstart:

```bash
npx skills add mattpocock/skills --skill=to-spec
```

```bash
npx skills update to-spec
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-spec)

## What it does

`to-spec` synthesizes settled conversation and repository evidence into an execution-ready Tracker Spec, seals approved planning artifacts, and publishes it through a retry-safe Workflow checkpoint with one immutable downstream handoff.

It does not restart the interview or leave an operational plan as unexplained target dirt. It is also the sole delivery-shape authority: downstream skills consume its Single-Issue or Multi-Issue classification instead of deciding again.

## When to reach for it

You invoke this by typing `/to-spec` — the agent won't reach for it on its own.

Reach for it after behavior and domain language are settled. Use [grill-with-docs](https://aihero.dev/skills-grill-with-docs) first when material decisions remain; use [to-tickets](https://aihero.dev/skills-to-tickets) only when the published Spec says Multi-Issue.

## Prerequisites

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker and triage labels. The repository must expose the target branch, the visible Planning handoff for accepted glossary or ADR work, and its configured Workflow checkpoint transaction and shared Target mutation writer seams.

## One checkpointed contract

A Single-Issue Spec carries at most three non-authoritative User Outcomes, stable `AC-n` Acceptance Criteria, non-exhaustive expected touchpoints, a mapped Implementation Plan, verification, exclusions, and `/run-issue-workflow <Spec-ID>`. A Multi-Issue parent keeps only the aggregate constraints and `/to-tickets <Spec-ID>` handoff. Classification follows executable outcomes and blocking edges, not file count or apparent size.

After validating the visible Planning handoff, `to-spec` creates or reuses the Planning Seal, then starts a clean-target Workflow checkpoint transaction before writing the durable operational plan. The producer commits only that plan under the shared target writer, obtains the exact `direct_target_contribution:v1` identity through model-invoked [attest-target-contribution](https://aihero.dev/skills-attest-target-contribution), publishes the body and label in the required order, and finishes with an immutable `handoff.completed`. An exact retry resumes the first unproved stage without regenerating a plan, commit, evidence record, tracker identity, or confirmation.

Primary publication obtains one tracker identity before prospective evidence and completes its canonical body and label only afterward. Revision mode obtains the new evidence before updating the existing Spec. Any identity conflict, dirty target, partial read-back, or writer failure preserves exact state, reports the full SHA, and stops instead of repairing or duplicating it. On retry, the prior partial-state report is read first; missing or conflicting evidence stops.

## It's working if

- The Planning Seal, checkpoint transaction, plan commit, attestation, publication, and `handoff.completed` form one exact ordered chain.
- A Single-Issue Spec ends in `/run-issue-workflow <Spec-ID>`; a Multi-Issue parent ends in `/to-tickets <Spec-ID>`.
- A retry reports and resumes one first unsatisfied stage while unrelated work remains untouched.

## Where it fits

`to-spec` follows [grill-with-docs](https://aihero.dev/skills-grill-with-docs). It routes a Single-Issue Tracker Spec to the repository's Run coordinator and a Multi-Issue Tracker Spec to [to-tickets](https://aihero.dev/skills-to-tickets); approved Standalone Specs use [implement](https://aihero.dev/skills-implement). See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
