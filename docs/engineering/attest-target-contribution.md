Quickstart:

```bash
npx skills add mattpocock/skills --skill=attest-target-contribution
```

```bash
npx skills update attest-target-contribution
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/attest-target-contribution)

## What it does

`attest-target-contribution` appends or reuses one exact tracker record for eligible direct target contributions after a coverage failure and one exact human confirmation.

The record proves only authority, scope, target, and commit identity. It never replaces Issue delivery or claims review, verification, push readiness, or push authority.

## When to reach for it

Type `/attest-target-contribution`, or the agent reaches for it automatically when a task fits. In the normal flow, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) invokes it after showing you the complete draft and receiving one exact confirmation; you do not need to remember or type a separate command.

A standalone invocation without that active, confirmed recovery packet stops without writing.

## One bounded attestation

The leading idea is **attestation**, not verification. Only explicit human-directed, non-product workflow or governance maintenance outside an Executable Issue by design is eligible. Active behavior, source, tests, configuration, dependencies, migrations, security, data, public APIs, mixed commits, partial paths, and ambiguous ownership stay on the normal Issue route.

The helper groups contributions only when owner, target, and classification match. It reuses one exact record or appends the minimal `direct_target_contribution:v1` schema, reads it back once, and stops on drift, contradiction, duplication, or persistence ambiguity.

## It's working if

- The tracker record contains only the confirmed owner, target, fixed classification, full commit SHAs, purposes, human attestation, and target-range-only statement.
- The active verification workflow discards its failed gate and starts fresh after exact read-back.
- No Issue state, Git, product, review, readiness, push, remote merge, or deployment state changes.

## Where it fits

This is a model-invoked authority helper inside the recovery path of [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push). Normal product or active workflow changes still use [execute-issue](https://aihero.dev/skills-execute-issue) and [close-issue](https://aihero.dev/skills-close-issue); see [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
