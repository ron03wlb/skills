# Single-Issue Spec template

## Planning baseline

- Mode: <primary or revision>
- Commit: <full local target-branch commit SHA>
- Seal: <created, successor, or reused>

## Documentation-only Seal candidate

`N/A`, or all of the following exact declarations:

- Planning Seal candidate: `<full Seal SHA>`
- Review baseline: `<the Seal's sole parent SHA>`
- Exact declared documentation paths: `<non-empty repository-relative list>`
- Scope confirmation: `<the Seal diff contains only these documentation paths; runtime, schema, API, deployment, Manual prerequisites, and any other execution change are out of scope>`

This is the only exception to an execution-baseline-to-candidate diff. It is available only when the non-empty Planning Seal itself delivered the complete accepted outcome; it never authorizes an empty commit or an inferred documentation-only scope.

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

## Run preparation

<Actual installation, task/message, local merge/cleanup and tracker operations; prior approval references and any concrete missing approval. Record read-only host capability results and truthful publication semantics.>

## Manual prerequisites

<N/A, or the exact artifact, opaque environment identity, authorized scope/rights, application owner, recovery and APPLIED/NO_OP verification. The producer completes the candidate and human attestation before related ready-state and Run handoff.>

## Out of Scope

- <Explicit exclusion.>

## Next command

`/run-issue-workflow <Spec-ID>`
