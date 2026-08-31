Quickstart:

```bash
npx skills add mattpocock/skills --skill=record-closed-issue-reconciliation
```

```bash
npx skills update record-closed-issue-reconciliation
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/record-closed-issue-reconciliation)

## What it does

`record-closed-issue-reconciliation` appends or reuses one immutable tracker record after a closed Issue's historical failure and one exact remedy Issue have been proved against identical baseline and candidate diagnostics.

It records narrow human authority for fresh exact-target verification. It never repairs the original completion, waives the failed command, or grants push readiness.

## When to reach for it

The agent reaches for it automatically only from an active [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) recovery after showing the complete draft and receiving one exact human confirmation. Do not invoke it manually; a standalone invocation stops without writing.

Reach for [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) when a frozen target range contains the one eligible historical case. Ordinary product fixes still use [execute-issue](https://aihero.dev/skills-execute-issue).

## Prerequisites

The repository needs a configured Issue tracker. An active `verify-target-before-push` recovery must supply the exact affected and remedy identities, identical diagnostic fingerprint, complete tracker comment draft, and evidence that the human confirmed that exact packet.

## One immutable record

The leading idea is **reconciliation**, not retroactive completion. The helper revalidates the closed affected Issue, its sole historical failure, the exact remedy Issue, both candidates, and matching diagnostics immediately before mutation. It reuses one exact `closed_issue_evidence_reconciliation:v1` record or appends it on the affected closed Issue and reads it back once.

Malformed, duplicate, edited, conflicting, drifting, unavailable, partial, ambiguous, multiple-failure, multiple-fingerprint, or multiple-remedy evidence stops without repair. The record never contains aggregate range refs, current verification output, worktree paths, logs, hashes, or readiness.

## It's working if

- The original completion and both Issue states remain unchanged.
- One exact affected-Issue record binds the affected evidence, one diagnostic fingerprint, one remedy, and human exact-target-verification authority.
- The active verifier discards its stopped gate and starts fresh only after exact read-back.

## Where it fits

This is a model-invoked evidence helper inside [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push), parallel to but distinct from [attest-target-contribution](https://aihero.dev/skills-attest-target-contribution). The attestation helper owns uncovered-commit coverage authority; this helper owns one historical completion-evidence reconciliation. See [ask-matt](https://aihero.dev/skills-ask-matt) for the public flow.
