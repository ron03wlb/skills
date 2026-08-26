---
name: to-spec
description: Turn the settled conversation into an execution-ready Spec, seal approved planning artifacts, classify its delivery shape, and publish it.
disable-model-invocation: true
---

# To Spec

Synthesize what is already settled; do not restart the interview. Use repository evidence and domain vocabulary, respect relevant ADRs, and prefer existing high-level verification seams.

The configured issue tracker and triage labels must already exist; otherwise run `/setup-matt-pocock-skills`.

## 1. Resolve the publication

Read any referenced Spec body and comments. An existing Spec uses `revision` mode: update the same tracker Spec and do not create a duplicate. Otherwise use `primary` mode and create one Spec.

`to-spec` is the sole authority for classifying a Tracker Spec:

- **Single-Issue**: one cohesive outcome fits one Issue worktree, execution context, reviewed candidate, and closeout.
- **Multi-Issue**: there are independently executable outcomes or blocking edges, or the work cannot safely fit one execution/review/closeout cycle.

File count, module count, risk, or apparent size alone never decides. Classify automatically from the settled requirements and repository evidence. Only material ambiguity that could change the route permits one blocking question with a recommendation; never default from uncertainty.

## 2. Draft the classified contract

Use exactly one shape-specific template below. User Outcomes are optional actor/value context, at most three, and never define done.

- A **Single-Issue** Spec is the executable authority. Stable `AC-n` Acceptance Criteria are its sole done authority. Expected paths and symbols are source-grounded starting points, not an allowlist. Every Acceptance Criterion must be covered by at least one Implementation Plan step and one Verification item; every Implementation Plan step must cover at least one Acceptance Criterion. Use inline `Covers: AC-n`, compare the defined and covered ID sets before publication, and stop on missing, unexpected, or orphan mappings without creating a matrix or parser.
- A **Multi-Issue** parent is decomposition authority only. Keep the overall outcome, cross-Issue constraints, decomposition rationale, exclusions, and `/to-tickets` handoff. Do not put child Acceptance Criteria, Implementation Plans, touchpoints, or verification commands in the parent; `/to-tickets` gives each child its own mapped executable contract.

The next command is authoritative: Single-Issue ends with `/execute-issue <Spec-ID>`; Multi-Issue ends with `/to-tickets <Spec-ID>`.

## 3. Select the Planning Seal

Select the local target-branch commit that seals approved glossary and ADR changes before tracker work becomes executable. This invocation authorizes at most one scoped local planning commit, not implementation, push, merge, cleanup, or unrelated paths.

Before classifying the current delta on a retry, read any prior partial-publication state. If tracker read-back or the exact partial-state report records a verified Planning Seal, require that full SHA to exist locally and be an ancestor of current target `HEAD`, then reuse it. Missing or conflicting evidence stops; never replace it with current target `HEAD`.

- If there is no relevant planning-artifact delta and no recovered seal, reuse current target `HEAD` and do not create an empty commit.
- If exact approved paths or hunks contain the owned delta, commit only those changes while preserving unrelated staged, unstaged, and untracked work. If owned hunks cannot be isolated from unrelated work, stop.
- Ambiguous ownership, scope, or target identity stops before commit or publication.

Verify the full SHA, owned diff, and unchanged unrelated snapshot. Record `created`, `successor`, or `reused`. A later tracker or read-back failure retains the verified seal and reports its full SHA and exact partial state; do not amend, reset, or roll it back.

## 4. Publish the Spec

Publish the Spec only after the Planning Seal succeeds. In `primary` mode create the tracker record, then populate it with its real Spec ID and exact next command. In `revision` mode update the same record. Apply `ready-for-agent`, read the body and label back once, and require mode, full seal SHA/state, classification, selected template, and next command to match. For Single-Issue verify every `AC-n` mapping; for Multi-Issue verify cross-Issue constraints and decomposition rationale exist and child-level executable sections remain absent.

If tracker create or update, label application, or read-back fails, report the selected seal's full SHA with the exact partial state; do not amend, reset, or roll back that seal.

<single-issue-template>

## Planning baseline

- Mode: <primary or revision>
- Commit: <full local target-branch commit SHA>
- Seal: <created, successor, or reused>

## Delivery classification

- Shape: Single-Issue
- Rationale: <why this fits one execution cycle>

## Problem Statement

<The observable problem and why it matters.>

## Proposed Outcome

<The settled behavior and boundaries.>

## User Outcomes

<Zero to three concise actor/value outcomes.>

## Acceptance Criteria

- **AC-1 - <name>:** <Objectively verifiable condition.>

## Implementation Plan

Expected touchpoints are non-exhaustive:

- `<path or symbol>`

### Step 1: <outcome>

<Source-grounded work.> **Covers: AC-1.**

## Verification

- <Observable check and command where known.> **Covers: AC-1.**

## Out of Scope

- <Explicit exclusion.>

## Next command

`/execute-issue <Spec-ID>`

</single-issue-template>

<multi-issue-template>

## Planning baseline

- Mode: <primary or revision>
- Commit: <full local target-branch commit SHA>
- Seal: <created, successor, or reused>

## Delivery classification

- Shape: Multi-Issue
- Rationale: <why independently executable children or blocking edges are required>

## Problem Statement

<The observable problem and why it matters.>

## Overall Outcome

<The settled aggregate result without child-level done criteria.>

## Cross-Issue Constraints

- <Boundary or invariant every child decomposition must preserve.>

## Decomposition Rationale

<Independent outcomes, blockers, and why one execution cycle is unsafe or insufficient.>

## Out of Scope

- <Explicit exclusion.>

## Next command

`/to-tickets <Spec-ID>`

</multi-issue-template>
