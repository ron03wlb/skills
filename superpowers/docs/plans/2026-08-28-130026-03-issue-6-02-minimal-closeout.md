## Parent

#6

## Decomposition key

`#6/02`

## What to build

Make execution evidence remain valid across ordinary target movement and reduce `/close-issue` to direct, observable, retryable integration for executable Issues plus explicit validation-only closure for Multi-Issue parents.

Expected touchpoints below are source-grounded starting points, not an allowlist.

## Acceptance Criteria

- **AC-1 - Current execution authority:** Each explicit `execute-issue` attempt captures the exact current target as its baseline. The latest read-back terminal note is the sole Issue-to-commit authority and binds the exact Issue, parent Spec, target, branch and worktree, baseline, candidate, Planning Seal, review, and verification identities. Ordinary target movement starts no attempt and never supersedes valid completion; commit and merge messages are ignored.
- **AC-2 - Direct executable closeout:** `/close-issue <Issue-ID>` requires clean target and Issue worktrees, a current `implementation_complete` note with no later blocked state, closed blockers, and candidate equal to Issue-worktree `HEAD`. It merges that unchanged candidate directly into the latest target, fast-forwards when possible, creates an ordinary merge commit only for diverged histories, proves candidate reachability, removes the exact clean Issue worktree, and closes and reads back the Issue in that order.
- **AC-3 - Observable retry and dirty stop:** Retry derives progress only from candidate ancestry, worktree registration, and tracker state and skips only a satisfied ordered prefix. Missing identity, dirty state, or contradictory or out-of-order state stops without stash, cleanup, reopening, reconstruction, deletion, or repair. Target dirt observed before or after merge stops the next ordered action; after the human restores cleanliness, rerunning `/close-issue` resumes without candidate invalidation or `/execute-issue` rerun.
- **AC-4 - Conflict ownership:** A merge conflict is aborted with the target restored clean and the Issue branch, worktree, and tracker Issue retained. `/close-issue` never repairs or invokes execution. The human may explicitly rerun `execute-issue` in the same branch and worktree from the latest target only when resolution remains within the original Acceptance Criteria; the new completion note becomes current. Scope changes return to planning.
- **AC-5 - Explicit parent closure:** `/close-issue <Parent-ID>` detects a Multi-Issue Spec and performs no Git integration or worktree operation. It requires the matching non-stale decomposition publication record, every exact child closed, and every current child candidate reachable from the same target before closing and reading back only the parent. Missing or conflicting record evidence returns to `/to-tickets <Parent-ID>`; the final child never closes the parent implicitly.
- **AC-6 - Retired closeout machinery and parity:** Closeout no longer creates an isolated integration candidate, history-only marker, preservation module, or custom closeout receipts and never performs aggregate verification. Retire the obsolete preservation script and dedicated tests, and synchronize the changed `execute-issue` and `close-issue` contracts across metadata, human docs, router, README descriptions where affected, and contract tests in English.

## Implementation Plan

### Step 1: Make completion notes the sole current authority

Update `skills/engineering/execute-issue/SKILL.md` and its synchronized docs and metadata to record one explicit attempt baseline, preserve valid completion across target movement, bind every required identity in the latest terminal note, and allow a conflict-resolution rerun only within unchanged Acceptance Criteria. **Covers: AC-1, AC-4, AC-6.**

### Step 2: Replace closeout with two small dispatch paths

Rewrite `skills/engineering/close-issue/SKILL.md` around executable and Multi-Issue parent entry paths. For executable Issues, specify the three ordered outcomes, direct fast-forward or ordinary merge, clean-state gates, ancestry/worktree/tracker retry inference, dirty-target pause, and conflict abort. For parents, consume the decomposition publication record and perform validation-only tracker closure. **Covers: AC-2, AC-3, AC-4, AC-5.**

### Step 3: Remove obsolete preservation machinery and synchronize surfaces

Remove `skills/engineering/close-issue/scripts/preservation.mjs` and `tests/ron-workflow/close-issue-preservation.test.mjs`. Re-sync `docs/engineering/execute-issue.md`, `docs/engineering/close-issue.md`, both skills' `agents/openai.yaml`, `skills/engineering/ask-matt/SKILL.md`, `docs/engineering/ask-matt.md`, and affected README descriptions. **Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6.**

### Step 4: Lock direct integration and parent closure with tests

Replace preservation-receipt and isolated-integration assertions in `tests/ron-workflow/skill-contracts.test.mjs` with contract and Git-fixture coverage for fast-forward, diverged merge, target dirt before and after merge, ordered retry, conflict abort, explicit same-worktree execution rerun, contradictory state, and parent closeout evidence. **Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6.**

## Verification

- `node --test tests/ron-workflow/skill-contracts.test.mjs` passes the execution-authority, direct integration, ordered retry, conflict, dirty-target, and parent-closeout cases. **Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6.**
- `node --test tests/ron-workflow/*.test.mjs` passes the repository's complete Node test suite after the obsolete preservation test is removed. **Covers: AC-2, AC-3, AC-4, AC-5, AC-6.**
- `node --check tests/ron-workflow/skill-contracts.test.mjs` passes, the retired preservation script and test are absent, and `git diff --check` reports no candidate whitespace errors. **Covers: AC-6.**

## Exclusions

- Re-entrant child reconciliation and decomposition record publication owned by #7.
- Aggregate range membership, review, full-suite orchestration, and `push_ready` owned by `#6/03`.
- Automatic conflict resolution, stash, clean, reset, rebase, squash, push, remote merge, deployment, implicit parent closure, or automatic Issue reopening.

## Blocked by

#7

## Planning baseline

- Commit: f7c8a85ef8f3ad9aa7c0ff6a7f500497e5601446
- Seal: reused

## Target

features/ron
