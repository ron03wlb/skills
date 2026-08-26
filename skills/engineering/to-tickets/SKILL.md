---
name: to-tickets
description: Decompose an approved Multi-Issue Spec into dependency-aware executable child Issues and publish only ready-frontier commands.
disable-model-invocation: true
---

# To Tickets

Consume one `/to-spec` classification; never reclassify delivery shape. A Single-Issue Spec is already executable, so stop and return `/execute-issue <Spec-ID>`. For a Multi-Issue Spec, read its full body and comments and decompose only its approved scope.

The configured issue tracker and triage labels must already exist; otherwise run `/setup-matt-pocock-skills`.

## 1. Draft independent children

Create narrow vertical slices whose behavior is independently verifiable. Give every child its own stable `AC-n` Acceptance Criteria, source-grounded Implementation Plan, Verification, blockers, target, and Planning baseline. Expected paths and symbols are non-exhaustive. Every criterion must be covered by a plan step and verification item, and every step must cover a criterion through inline `Covers: AC-n` references.

The parent keeps only the overall outcome, cross-Issue constraints, and decomposition rationale. A child does not need to know whether siblings execute concurrently; it depends only on explicit blockers and shared parent constraints.

Prefer tracer-bullet vertical slices. For one wide mechanical refactor that cannot stay green per slice, use expand-contract: expand, independently green migration batches, then contract after all migrations.

## 2. Validate or advance the Planning Seal

Validate the inherited Planning Seal before any successor Planning Seal: require its commit to exist locally and be an ancestor of the target `HEAD`. Missing or unreachable lineage stops and returns to `/to-spec`.

Before classifying the current delta on a retry, read prior partial-publication state. If it records a verified Planning Seal, require that full SHA to exist locally and be an ancestor of target `HEAD`, reuse it, and never fall back to the inherited seal. Conflicting or missing evidence stops.

- If there is no relevant planning-artifact delta and no recovered successor, reuse the inherited seal.
- Exact approved in-Spec glossary or ADR refinement may create at most one successor Planning Seal containing only that isolated delta. Preserve unrelated staged, unstaged, and untracked work.
- New public behavior, acceptance, target, or exclusion is a Spec revision: stop, tell the human to invoke `/to-spec`, and do not modify or silently expand the parent.

Verify the selected full SHA, ancestry, exact owned diff, and unrelated-state preservation. If publication later fails, retain the seal and report its full SHA with the partial state; do not amend, reset, or roll it back.

## 3. Publish the tickets as executable Issues

Publish blockers before dependants:

- **Local tracker:** one file per child under `.scratch/<feature>/issues/`, ordered blockers-first.
- **A real issue tracker:** one child Issue per slice, using native parent/blocking relations when available and `ready-for-agent` only when the Issue itself is agent-ready.

Read each published ticket back once and require its body, Acceptance Criteria mapping, Planning baseline, blocking relations, target, and ready state to match. A mismatch is a partial publication: report created identifiers and stop without modifying the parent or unrelated Issues.

Output `/execute-issue <Issue-ID>` only for the dependency-ready frontier. Never output execution commands for blocked children.

<local-ticket-template>

# <NN> - <Ticket title>

## What to build

<One independently verifiable outcome.>

## Acceptance Criteria

- **AC-1 - <name>:** <Observable condition.>

## Implementation Plan

### Step 1: <outcome>

<Source-grounded work.> **Covers: AC-1.**

## Verification

- <Observable check.> **Covers: AC-1.**

## Blocked by

<Issue references or None.>

## Planning baseline

- Commit: <full local target-branch commit SHA>
- Seal: <created, successor, or reused>

## Target

<Original local target branch.>

</local-ticket-template>

<issue-template>

## Parent

<Multi-Issue Spec reference.>

## What to build

<One independently verifiable outcome.>

## Acceptance Criteria

- **AC-1 - <name>:** <Observable condition.>

## Implementation Plan

### Step 1: <outcome>

<Source-grounded work.> **Covers: AC-1.**

## Verification

- <Observable check.> **Covers: AC-1.**

## Blocked by

<Issue references or None.>

## Planning baseline

- Commit: <full local target-branch commit SHA>
- Seal: <created, successor, or reused>

## Target

<Original local target branch.>

</issue-template>
