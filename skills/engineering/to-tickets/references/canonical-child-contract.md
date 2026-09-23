# Canonical child contract

Read this reference only while drafting or validating an executable child. It owns the shared child body; provider adapters may wrap it but never fork its semantics.

<child-contract>

## Parent

<Multi-Issue Spec reference.>

## Decomposition key

`<Spec-ID>/<NN>`

## Approved publication identity

Bind this child's completion `approvedPublicationIdentity` to exactly one identity the completed producer transaction already bound for the parent Spec, and derive the `execute-issue` operation identity from that exact value:

- the parent Spec's approved-scope hash;
- the approved-scope identity that transaction derived and bound in its own checkpoint bindings, which the parent `decomposition:v1` record carries beside that hash;
- the current `spec_publication` record identity;
- the parent `decomposition:v1` record identity.

The Run admits these values and no other. A bound value that none of those authorities carries, or an operation key that is not the honest derivation from the value bound here, is refused as outside proven authority.

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

- `<stable Issue reference>`
- `<stable Issue reference>`

Render one stable Issue reference per bullet in canonical tracker-identity order. With no blocker, render exactly:

None.

## Planning baseline

- Commit: <full local target-branch commit SHA>
- Seal: <created, successor, or reused>

## Target

<Original local target branch.>

</child-contract>
