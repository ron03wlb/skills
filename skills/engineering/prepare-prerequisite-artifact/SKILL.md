---
name: prepare-prerequisite-artifact
description: Prepare one adapter-bound, fail-closed Operator SQL candidate. Use when an active prerequisite-preparation handoff names one exact Issue artifact that must be safe before human execution.
---

# Prepare Prerequisite Artifact

Turn one exact declared Manual prerequisite into a clean committed **Prerequisite candidate**. Consume repository-owned evidence, never an external environment.

## Accept one exact handoff

Require an active prerequisite-preparation handoff that binds:

- the exact Issue and linked Spec;
- the Issue target branch, Issue worktree, and topic branch;
- the unchanged approved scope and Acceptance Criteria; and
- one declared normalized repository-relative artifact path.

Read the current Issue, Spec, repository instructions, target, worktree, and artifact state. Recheck the unchanged Issue, target, worktree, scope, and artifact before every material edit and before the candidate commit. Missing, stale, conflicting, or extra authority stops without writing.

The repository-owned adapter is repository code, not a skill and not a human command. Locate it only through repository instructions and require these operations:

- read-only `discover`, returning the database product and version, target environment, authoritative inputs, diagnostics, pass conditions, database-native assertions, locking and transaction strategy, and recovery evidence;
- artifact-writing `prepare`, permitted to create or repair only the declared artifact; and
- read-only `validate`, deterministically checking the exact artifact against the discovered evidence.

Missing, broken, incomplete, ambiguous, or contradictory adapter evidence stops without runtime setup, infrastructure creation, dialect guessing, a universal schema, parser, migration runner, or edits outside the declared artifact. Do not ask the adapter or human to bridge a contract the repository does not prove.

Capture the worktree state before preparation. Only the exact declared artifact may be created or repaired. Pre-existing unrelated staged, unstaged, or untracked work stops preparation and is preserved; never stash, reset, delete, move, or clean it. After every adapter operation, prove no other path changed.

## Require one fail-closed Operator SQL

The primary Operator SQL has exactly three ordered sections:

1. a read-only, database-native fail-closed preflight;
2. a persistent exact backup with validated recovery statements present but commented and inert; and
3. only then the authorized mutation or insertion plus applicable postconditions.

The preflight has exactly three state outcomes. An absent backup plus the repository-defined pre-mutation state permits the first backup and mutation. An integrity-valid existing backup plus complete postconditions returns `NO_OP` without another write. Every partial, contradictory, or unproved state aborts; it never treats an already-started or partially-applied operation as fresh.

Every precondition, backup-integrity check, and postcondition uses database-native fail-closed assertions for the discovered database product and version. A mismatch terminates the SQL with an error. A diagnostic `SELECT` is supplemental and is not an operator-judgment gate.

After creating and validating the persistent backup, revalidate and lock the exact target state immediately before mutation. Transaction-capable DML uses an explicit transaction, commits only after every postcondition passes, and on any error rolls back the mutation while retaining the backup. DDL or another transformation without an equivalent safe transaction and truthful recovery boundary stops and returns to planning or a human decision.

Recovery statements stay commented and inert. UPDATE or DELETE recovery restores exact backed-up rows; INSERT recovery removes only stable keys created by this operation. DDL or transformation without truthful recovery stops. Recovery never runs automatically, and broad predicates, inferred keys, or fabricated rollback are invalid.

Successful completion emits exactly one terminal outcome: `APPLIED` after a committed mutation, or `NO_OP` after an integrity-valid backup and complete postconditions prove no write is needed. An SQL error, missing outcome, or any other value is unsuccessful. The primary SQL never deletes or overwrites the backup, and no cleanup SQL is generated, retained in the primary artifact, or invoked.

## Share one validation and review budget

After every material artifact edit, run adapter `validate` and independent Standards and Spec review. Keep both review axes separate and classify observations from exact evidence. A **Confirmed code review finding** or deterministic validation failure requires an in-scope repair; **Code review advisories** remain visible and non-blocking.

Validation repairs and confirmed review repairs share one maximum of ten material repair waves. A wave counts only when an artifact edit begins. Tool failures, duplicate observations, Code review advisories, and retries with no artifact edit do not consume a wave. Rerun `validate` and both review axes after every repair. If wave ten still has a deterministic failure or Confirmed code review finding, stop without claiming the artifact is ready.

## Commit and return the content identity

After final deterministic validation passes and both review axes contain no Confirmed code review finding, verify that only the declared artifact differs, commit only that artifact on the exact Issue topic branch, and require the Issue worktree to be clean at `HEAD`.

Return the full candidate commit, the exact Git blob from that commit, and the normalized repository-relative path. The candidate commit and blob bind the generated content without a duplicate SHA-256 record. Return any visible Code review advisories without turning them into waiver state.

Never execute SQL, connect to or mutate a database, attest an outcome, run recovery or cleanup, integrate a target, close an Issue, push, deploy, or change tracker state. Consumer adapters and product-specific SQL remain outside this shared skill.
