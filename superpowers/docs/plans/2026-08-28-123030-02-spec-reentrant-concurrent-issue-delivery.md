## Planning baseline

- Mode: primary
- Commit: f7c8a85ef8f3ad9aa7c0ff6a7f500497e5601446
- Seal: created

## Delivery classification

- Shape: Multi-Issue
- Template: `references/multi-issue-template.md`
- Rationale: stable decomposition publication, concurrent execution with minimal closeout, and aggregate target-range verification are independently executable outcomes with blocking edges and distinct review boundaries. Combining them into one Issue candidate would make the publisher consume its own unfinished record format and couple per-Issue integration authority to aggregate push verification.

## Problem Statement

Issue delivery currently has three connected failure modes. `/to-tickets` is shaped as one-shot publication, so a retry after partial tracker success can duplicate children and leaves no durable proof that the intended child set and blockers are complete. Concurrent `execute-issue` candidates can be forced back through execution when their shared target advances, while `close-issue` protects a dirty target through an isolated integration candidate, a preservation module, and sticky receipts that create recovery loops. Finally, target verification depends on those closeout receipts and cannot honestly distinguish local unpushed work from an already-pushed merge-request or explicit comparison range.

## Overall Outcome

Create one re-entrant Issue delivery lifecycle. `/to-tickets` reconciles a stable child decomposition and publishes a minimal parent completeness record. Each executable Issue keeps one dedicated branch and worktree, remains valid when its target branch advances, and closes through three observable ordered outcomes: direct merge into a clean target, clean Issue-worktree removal, and tracker closure. `/close-issue` also closes a Multi-Issue parent explicitly after validating its published child set. `/verify-target-before-push` then maps exact candidate contributions to Issues and performs aggregate review and verification on either a local unpushed range or an explicit already-pushed comparison without using closeout receipts or commit-message identity.

## Cross-Issue Constraints

- `/to-tickets #6` is re-entrant. Every child owns one immutable `#6/<NN>` decomposition key; tracker Issue IDs remain the public `/execute-issue <Issue-ID>` and `/close-issue <Issue-ID>` inputs, and titles are never identity.
- Reconciliation creates a missing key, reuses exactly one matching child, and stops without repair or mutation on duplicate keys or conflicting parent, target, Planning Seal, executable contract, body, or tracker-native relationship evidence. Every available tracker-supported identity source is validated automatically, and matching evidence requires no per-child authorization.
- Owned blockers form an acyclic graph. A readable external Issue may gate a child, but `/to-tickets` never creates, edits, closes, or assumes ownership of it. One canonical child contract defines semantics; tracker adapters only render local title, body, filename, and native relationship syntax.
- `/to-tickets` writes and reads back one minimal versioned decomposition publication record only after every child and blocking edge matches. The record binds parent, Planning Seal, target, key-to-Issue mapping, and blocker edges; it proves completeness but never replaces child-owned keys as identity. Failure before record read-back is recoverable partial publication by key.
- This Spec bootstraps the new publisher: its initial three child bodies carry stable keys from this parent contract, and after the first child is delivered `/to-tickets #6` is rerun before parent closeout so the implemented publisher can reconcile the same children and write the current decomposition publication record.
- Every executable Issue records the target branch from which its dedicated branch and worktree are created. Any number of `execute-issue` attempts may run concurrently, while one human serializes `close-issue` writers per target branch. Target movement alone starts no new attempt and never supersedes a valid completion note.
- One explicit `execute-issue` attempt captures the exact current target as its review baseline. Its read-back completion note is the sole Issue-to-commit mapping authority and binds exact Issue, baseline, reviewed candidate, target, branch/worktree, Planning Seal, review, and verification identities; commit-message text and merge messages are ignored.
- An executable `/close-issue <Issue-ID>` requires both target and Issue worktrees to be clean and the latest completion-note candidate to equal the Issue worktree `HEAD`. It then owns exactly three ordered outcomes: merge that unchanged candidate directly into the latest target, remove the exact clean Issue worktree, and close/read back the Issue.
- Direct integration fast-forwards when possible and creates an ordinary merge commit only for diverged histories. It never rebases, squashes, refreshes the candidate, creates an isolated integration candidate or history-only marker, writes a custom closeout receipt, invokes a preservation module, or performs aggregate verification.
- After merge or retry, candidate reachability and a clean target worktree are required before Issue-worktree removal. Hook-created or other target dirt stops the ordered flow until the human restores cleanliness, then resumes through `close-issue` without candidate invalidation or execution rerun.
- Closeout retry derives progress from candidate ancestry, worktree registration, and tracker state. It skips only a satisfied ordered prefix; missing identity, dirty state, or contradictory and out-of-order state stops without stash, cleanup, reopening, reconstruction, deletion, or automatic repair.
- A merge conflict is aborted with the target restored clean and the Issue branch, worktree, and tracker Issue retained. `close-issue` never repairs or invokes execution. The human may explicitly start a new `execute-issue` attempt in the same branch and worktree from the latest target when resolution stays within the original Acceptance Criteria; the new read-back completion note becomes current. A behavior, acceptance, target, exclusion, or ownership change returns to planning.
- `/close-issue <Parent-ID>` dispatches a Multi-Issue Spec to a parent-only path with no merge or worktree operation. It requires the matching non-stale decomposition publication record and proves every exact child is closed and its current candidate is reachable from the same target before closing and reading back only the parent. Missing or conflicting record evidence returns to `/to-tickets <Parent-ID>`; visible children grant no legacy bypass.
- Closing the final child never closes its parent implicitly. Parent closure never claims aggregate `push_ready`, and `close-issue` never pushes, remote-merges, deploys, reruns Standards/Spec review, or executes the full suite.
- `/verify-target-before-push` keeps one public name and freezes exact baseline `B` and target `V`. Default local-ahead mode requires a non-empty range from the target's unique configured upstream tracking tip to local `HEAD`; already-pushed work requires an explicit merge request, pull request, or exact base/head range and never uses a guessed baseline.
- Completion-note candidates reachable from `V` but not `B` are members and require closed Issues. Open unreachable candidates remain concurrent work outside the selected range; closed unreachable candidates and reachable open members are contradictory delivery evidence that stops before review.
- Every material selected-range commit must be covered by at least one member baseline-to-candidate contribution, a referenced Planning Seal or prerequisite, or necessary merge topology. Valid contribution ranges may overlap and require no unique owner; commit-message Issue numbers, merge-message parsing, closeout receipts, and manually repeated Issue lists are never mapping authority.
- Both verification modes run aggregate Standards, every member Issue and linked or parent Spec, deduplicated focused verification from completion notes, and the repository-required full suite once on exact `V`. Only local-ahead mode may write and read back `push_ready`; explicit already-pushed mode returns only a range or merge-request verification result. Neither mode pushes or changes product code or tracker state.
- The intended operator flow is `/to-tickets <Parent-ID>`, dependency-ready `/execute-issue <Child-ID>` and `/close-issue <Child-ID>` pairs, explicit `/close-issue <Parent-ID>`, then `/verify-target-before-push <target-or-explicit-range>` when aggregate verification is requested.

## Decomposition Rationale

1. The first executable Issue owns re-entrant `/to-tickets` reconciliation, immutable decomposition keys, tracker-supported identity validation, blocker graph handling, canonical child rendering, partial-publication recovery, and the parent decomposition publication record.
2. The second executable Issue owns the completion-note and execution-attempt semantics plus both executable and parent `/close-issue` paths. It is blocked by the first because parent closeout consumes the new decomposition record, and it keeps per-Issue execution, direct integration, cleanup, and tracker closure in one coherent lifecycle boundary.
3. The third executable Issue owns both `/verify-target-before-push` evidence modes, candidate-to-Issue coverage, aggregate Standards and multi-Spec review, deduplicated focused checks, full-suite verification, and result-type separation. It is blocked by the second because it consumes the finalized completion-note authority and observable close state rather than the retired closeout receipts.

The three outcomes must remain separate so each can be implemented, reviewed, and closed in one dedicated Issue worktree while preserving the dependency chain from stable publication, through trustworthy local integration, to aggregate range verification.

## Out of Scope

- Publishing child Issues, implementing any child outcome, or closing any Issue during this `/to-spec` invocation.
- Revising, reopening, or closing existing Specs or Issues, including #2 and #5.
- Supporting dirty target integration, automatic stash/clean/reset, a preservation snapshot or module, closeout success/failure receipts, isolated integration candidates, history-only markers, queues, daemons, or lock services.
- Automatic conflict resolution, automatic `execute-issue` reruns, second Issue branches or worktrees, implicit parent closure, or automatic Issue reopening.
- Requiring Issue IDs in commit messages, discovering ownership from commit or merge text, guessing a post-push baseline, or accepting unexplained material commits.
- Creating a dependency engine, generic receipt framework, tracker-independent database, aggregate repair loop, or new public closeout or verification command.
- Push, remote merge, deployment, production verification, branch deletion, or unrelated worktree and file cleanup.
- Modifying the pre-existing unrelated working-tree edit in ADR-0022 or any unrelated dirty and untracked file.

## Next command

`/to-tickets #6`
