## What it does

`attest-target-contribution` appends or reuses one exact tracker record through two caller routes: confirmation-gated recovery and a producer-owned prospective checkpoint. The latter is limited to the exact Workflow plan checkpoint created by the active `to-spec` or `to-tickets` operation and needs no second human confirmation.

Both routes write the unchanged `direct_target_contribution:v1` schema. The record proves only authority, scope, target, and commit identity; it never replaces producer publication or Issue delivery and never claims review, verification, Run readiness, push readiness, or push authority.

## When to reach for it

Type `/attest-target-contribution`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) reaches for it automatically when a task fits. In the recovery flow, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) invokes it after showing you the complete draft and receiving one exact confirmation. An active `to-spec` or `to-tickets` operation may instead invoke it for its own transaction-bound Workflow plan checkpoint without another confirmation.

A standalone invocation without one of those active caller packets stops without writing.

## Prerequisites

The repository needs a configured Issue tracker. For recovery, an active [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) flow supplies the exact packet with the complete draft the human confirmed. Alternatively, a currently active, explicitly invoked `to-spec` or `to-tickets` operation supplies its exact prospective packet, including the matching Workflow checkpoint transaction, checkpoint commit, baseline, purpose, and expected read-back. This helper writes only the matching tracker comment.

## One bounded attestation

The leading idea is **attestation**, not verification. Confirmation-gated recovery remains limited to explicit human-directed, non-product workflow or governance maintenance outside an Executable Issue by design. The prospective route accepts only the exact generated Workflow plan checkpoint owned by the matching active producer transaction. Active behavior, source, tests, configuration, dependencies, migrations, security, data, public APIs, mixed commits, unrelated paths, partial paths, and ambiguous ownership remain ineligible.

The helper reads the owner's complete ordered history, reuses one exact record, and permits later records only for immutable disjoint checkpoint commit sets. Duplicate membership, partial overlap, conflicting purpose, mixed recovery/prospective grouping, edited history, multiple plausible records, or persistence ambiguity stops. An appended record is read back once and its immutable tracker identity returns to the active caller.

## It's working if

- The tracker record contains only the owner, target, fixed classification, full commit SHAs, purposes, human attestation, and target-range-only statement.
- Recovery remains human-confirmed and restarts fresh verification; a prospective producer receives only the immutable record identity for its own next stage.
- The helper creates no commit or transaction, resumes no producer, publishes no tracker contract, and changes no Issue state, product, review, readiness, Run, push, remote merge, or deployment state.

## Where it fits

This is a [model](https://www.aihero.dev/ai-coding-dictionary/model)-invoked authority helper inside the recovery path of [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) and the Workflow plan checkpoint path owned by `to-spec` and `to-tickets`. Normal product or active workflow changes still use [execute-issue](https://aihero.dev/skills-execute-issue) and [close-issue](https://aihero.dev/skills-close-issue); see [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
