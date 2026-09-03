---
name: execute-issue
description: Implement and verify one dependency-ready tracker Issue in its recorded-target worktree. Use when a human invokes the Issue directly or a valid DAG Run Grant authorizes its coordinator lane.
---

# Execute Issue

Implement exactly one dependency-ready Tracker Spec or child Issue in a dedicated Git worktree. This skill owns implementation and Matt `code-review`; it stops at a trustworthy completion note and never invokes `close-issue`.

## 1. Enter the exact Issue

Read the Issue, parent or linked Spec, comments, repository instructions, Acceptance Criteria, Implementation Plan, blockers, target, exclusions, and ordered execution history. Consume its published classification without reclassifying it. Unresolved blockers or material ambiguity stop before writing.

Entry authority is direct human invocation or a valid DAG Run Grant. A coordinator holding that Grant may invoke the Issue without separate per-Issue approval; `execute-issue` never creates or renews the Grant. For coordinator entry, require the read-back DAG Run Grant to bind the exact linked Spec, Issue target branch, published classification, approved scope, and, for Multi-Issue, the Decomposition publication record, exact mapped Issue, and closed blockers. A Single-Issue coordinator target must be the exact bound Spec; an outsider stops before worktree creation or mutation. A missing, stale, or mismatched Grant stops before worktree creation or mutation. The Grant adds no prerequisite-execution, scope-change, ambiguity-repair, integration, close, push, or deploy authority.

Read [`references/operation-identity.md`](references/operation-identity.md) for every fresh or retried lane, derive the deterministic operation identity, and keep `execute-issue` as implementation receipt owner. Caller task and Run correlation never grant authority.

If the latest valid `implementation_complete` still binds this Issue, its current operation identity or exact frozen legacy membership, recorded worktrees and branches, baseline, and unchanged clean reviewed candidate must agree. Report it and stop. Target movement alone does not supersede `implementation_complete`. A later blocked state supersedes completion only when its evidence invalidates that candidate's implementation, Standards or Spec review, or verification.

A dirty target stop or partial close is not a conflict-resolution rerun. When completion remains valid, perform only cheap read-only identity and evidence checks. Do not run baseline, focused, final, or full suite verification; do not rerun review, create a commit, or write a tracker note. Tell the human to preserve and resolve the target work, then invoke `/close-issue <Issue-ID>` again.

An explicit conflict-resolution rerun is the only completion-preserving exception. After `/close-issue` reports a merge conflict, the human may explicitly invoke `execute-issue` again in the same topic branch and Issue worktree, capture the latest target as the new attempt baseline, merge that exact baseline into the topic branch without rebasing or resetting, and resolve the conflict only while the original Acceptance Criteria, target, exclusions, and ownership remain unchanged. Require the new candidate to contain the new baseline. A Scope change returns to planning; a successful rerun writes a new `implementation_complete` note that becomes current.

For a real blocked exit, append and read back one `implementation_blocked` with reason and available target, worktree, baseline, and candidate identities. Tracker ambiguity never claims supersession or completion.

Capture the exact local Issue target branch and current `HEAD` as execution baseline before prerequisite handoff. That recorded Issue target branch is the only default merge destination. Record one topic branch and Issue worktree; reuse an exact lane returned by `pre-execute-issue`. Preserve unrelated work and do not repeatedly reconfirm unchanged identities. Any number of Issue worktrees may execute concurrently against the same recorded target. Require the Planning Seal to exist locally and be an ancestor of the execution baseline, plus a seal-currency check that is not scope authority and finds no uncommitted Issue-owned planning delta. Missing, stale, unreachable, or ambiguous planning evidence makes execution stop and tell the human to invoke `/to-spec` or `/to-tickets`. `execute-issue` never creates or repairs a Planning Seal. Older Issues use `not-applicable` only when no relevant planning artifact needs sealing.

Read [Manual prerequisites](references/manual-prerequisites.md) only when the published Issue declares one exact human-applied artifact or implementation discovers one unchanged-scope Late prerequisite. That reference solely governs attestation and `pre-execute-issue` handoff behavior.

## 2. Implement and verify

Trace real behavior and the highest practical verification seam. Use TDD when a focused behavioral test captures the change. Commit coherent verified slices.

Expected paths and symbols are non-exhaustive. Include Necessary discovery when source proves it is required by an existing plan step and unchanged Acceptance Criterion. Record a Material plan deviation with covered `AC-n` when implementation changes but behavior does not. Any behavior, Acceptance Criteria, target, exclusion, independent outcome, or ownership change is a Scope change and stops for planning.

Prepare prospective `workflowArtifacts` before review: use an explicit empty list or entries with one unique repository-relative `path`, truthful requirement source (`requirementSource`), and concise `purpose` for each required non-contract plan or log. For every declared path, verify its Execution baseline-to-candidate diff ownership, then pass the prospective declaration to `code-review`. Runtime, public-contract, routing, Acceptance Criteria, governance, arbitrary, ambiguous, falsely sourced, or unowned documentation stays ordinary material scope. It supplies classification only, never mapping, coverage, review, verification, or an exemption.

Run affected verification after every slice or repair. Before review, run required focused checks, configured typechecking, and repository full suite; record exact commands and results. Late prerequisite discovery follows its reference before prerequisite-dependent verification.

## 3. Review and repair

Commit the candidate and invoke Matt `code-review` against the recorded baseline and Issue or Spec. Keep Standards and Spec separate. Require both axes to contain no Confirmed code review finding before treating them as clean. Every Code review advisory remains visible; collectively, advisories do not fail execution, trigger repair, consume a repair wave, or create durable waiver state.

Confirm findings against source, tests, standards, and Spec. Repair every in-scope Confirmed finding, run affected verification, commit, and rerun both axes. Allow at most 10 repair waves per invocation; a wave begins only when code repair starts. Tool failures, duplicates, and smells, preferences, or suggestions that lack exact governing evidence remain advisories and do not count; when exact evidence proves a violation, the observation is a Confirmed code review finding. If wave 10 is unclean, preserve the candidate, publish the blocked state, and leave the Issue open.

## 4. Complete

Rerun final verification. Require clean Standards and Spec, a clean Issue worktree at the reviewed candidate, and every consumed v2 Prerequisite candidate still reachable with matching blob and path. Then read [implementation completion evidence](references/completion-evidence.md) only when adopting compatibility records or writing `implementation_complete`; it solely owns both payloads.

Write and read back exactly one completion note, then stop. Execution never integrates, removes a worktree, closes the Issue, pushes, or deploys. A human or coordinator with the same valid Grant separately invokes `/close-issue`.
