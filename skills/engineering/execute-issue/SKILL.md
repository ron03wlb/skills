---
name: execute-issue
description: Execute and verify one dependency-ready tracker Issue in its published repository-backed or tracker-only mode. Use when a human invokes the Issue directly or a valid DAG Run Grant authorizes its coordinator lane.
---

# Execute Issue

Execute one dependency-ready Tracker Spec or child Issue in its published mode. Repository-backed work uses a dedicated Git worktree and owns implementation and Matt `code-review`; tracker-only work follows its shared contract. Stop at verified completion; never invokes `close-issue`.

## 1. Enter the exact Issue

Read the Issue, parent or linked Spec, comments, repository instructions, Acceptance Criteria, Implementation Plan, blockers, target, exclusions, and ordered execution history. Consume its published classification without reclassifying it. Unresolved blockers or material ambiguity stop before writing.

Entry authority is direct human invocation or a valid DAG Run Grant. Direct approved bootstrap reads the continuing [pre-Run maintenance handoff](../../../docs/agents/references/approved-pre-run-workflow-maintenance.md) only for that branch. A coordinator holding that read-back DAG Run Grant may enter without per-Issue approval, but requires it bind the exact linked Spec, Issue target branch, classification, approved scope, Decomposition publication record, mapped Multi-Issue child, and closed blockers. A Single-Issue coordinator target is the exact bound Spec; an outsider stops before worktree creation or mutation. A missing, stale, or mismatched Grant likewise stops before mutation. `execute-issue` never creates or renews a DAG Run Grant, and a Grant never expands prerequisite, scope, integration, close, push, or deploy authority.

Read [`references/operation-identity.md`](references/operation-identity.md) for every fresh or retried lane; it derives the deterministic operation identity and keeps `execute-issue` as implementation receipt owner. Caller task and Run correlation never grant authority. If historical completion is field-less, or the first prospective repository-backed completion needs its adoption frontier, also read [legacy operation identity](references/legacy-operation-identity.md); ordinary current re-entry does not load that branch.

When the published Single-Issue Spec declares tracker-only, single-note, no-candidate completion, read [tracker-only completion](../../../docs/agents/references/tracker-only-completion.md). On an exact match, follow it instead of the remaining repository-backed sections; otherwise stop.

If the latest valid `implementation_complete` still binds this Issue, require its current operation identity, recorded worktree/branch, baseline, and unchanged clean reviewed candidate to agree; a field-less record follows [legacy operation identity](references/legacy-operation-identity.md). Report and stop. Target movement alone does not supersede completion; only evidence invalidating implementation, review, or verification can.

A dirty target stop or partial close is not a conflict-resolution rerun. When completion remains valid, perform only cheap read-only identity/evidence checks and return remaining progress to the same close owner; do not rerun verification/review or create a commit/note. Human-owned target dirt needs human resolution: direct entry retries `/close-issue <Issue-ID>` and coordinator entry reconciles.

An explicit human or evidence-bound coordinator recovery request is the completion-preserving exception. Read [technical recovery](references/technical-recovery.md) before diagnosis, ownership transfer, conflict retry, or source edits; it owns the existing lane, budget, baseline, candidate, scope-stop, and replacement-completion rules.

For a real blocked exit, append and read back one `implementation_blocked` with reason, cumulative repair-wave count, and available target, worktree, baseline, and candidate identities. Explain the gate using [workflow stop diagnosis](../../../docs/agents/references/workflow-stop-diagnosis.md). Tracker ambiguity never claims supersession or completion.

Capture the exact local Issue target branch and `HEAD` as execution baseline before prerequisite handoff; that recorded Issue target branch is the only default merge destination. Record one topic branch and Issue worktree, reusing an exact `pre-execute-issue` lane or adopting a coordinator worktree only after exact creation-intent, common-directory, ancestry, cleanliness, and task-identity proof. Preserve unrelated work. Any number of Issue worktrees may execute concurrently. Require the Planning Seal locally, ancestral to the baseline, and current for Issue-owned planning delta. Missing, stale, unreachable, or ambiguous planning evidence stops for `/to-spec` or `/to-tickets`; `execute-issue` never repairs a Seal. Older Issues use `not-applicable` only when no planning artifact needs sealing.

Declared documentation-only candidate: read [Seal rules](references/documentation-only-seal-candidate.md); stop on failure.

Read [Manual prerequisites](references/manual-prerequisites.md) only for one declared human-applied artifact or unchanged-scope Late prerequisite; it owns attestation and `pre-execute-issue` handoff behavior.

Matt/Ron owners, runtime, references, and `docs/` stay in the selected immutable package. Higher-priority generic host skills use catalog sources, never replace packaged owners.

## 2. Implement and verify

Trace real behavior and the highest verification seam. Use TDD when a focused test captures the change. Commit coherent verified slices.

Expected paths and symbols are hints. Include Necessary discovery only when source proves an existing plan step and unchanged `AC-n` require it. Record a Material plan deviation with covered `AC-n` for behavior-neutral implementation changes. Any behavior, Acceptance Criteria, target, exclusion, independent outcome, or ownership change is a Scope change and stops for planning.

Prepare prospective `workflowArtifacts` before review: use an explicit empty list or one unique repository-relative `path`, truthful requirement source (`requirementSource`), and concise `purpose` per required non-contract artifact. For every declared path, verify Execution baseline-to-candidate diff ownership, then pass the prospective declaration to `code-review`. Runtime, public-contract, routing, Acceptance Criteria, governance, arbitrary, ambiguous, falsely sourced, or unowned documentation stays ordinary material scope; classification grants no exemption.

Run affected verification after each changed slice or repair. Before review, require passing focused checks, configured typechecking and the repository full suite for the committed candidate. Reuse successful results through `scripts/verification-cache.mjs` only with exact candidate, command, relevant configuration, runtime/permission profile and freshly read necessary external inputs. A new candidate or integration combination needs its own result. After these checks pass, repeat or broaden only for relevant mutation, failure, unresolved concern or an explicit repository requirement. Record exact commands/results; late prerequisites follow their reference before dependent checks.

## 3. Review and repair

Commit the candidate and invoke Matt `code-review` against the recorded baseline and Issue or Spec. A validated documentation-only Seal candidate uses its reference-defined review basis without a second commit. Keep Standards and Spec separate. Require both axes to contain no Confirmed code review finding before treating them as clean. Every Code review advisory remains visible; collectively, advisories do not fail execution, trigger repair, consume a repair wave, or create durable waiver state.

Confirm findings against source, tests, standards, and Spec. Repair every in-scope Confirmed finding, run affected verification, commit, and rerun both axes. Allow at most 10 repair waves for the same Issue operation across retries; a wave begins only when code repair starts. Before repair, append its cumulative count to the existing Issue progress evidence and read it back; resume that count after interruption or conflict repair. A retry never resets the budget. If earlier repair activity has no uniquely provable count, preserve the candidate and report the evidence gap instead of assuming zero. Tool failures, duplicates, and smells, preferences, or suggestions that lack exact governing evidence remain advisories and do not count; when exact evidence proves a violation, the observation is a Confirmed code review finding. If wave 10 is unclean, preserve the candidate, publish the blocked state, and leave the Issue open.

For a task created under a versioned Run model policy, read [repair progress and the complete-wave yield](references/model-repair-yield.md) before its first repair or repair re-entry. That branch records cumulative progress before changes and may yield when the same Confirmed finding survives two consecutive complete waves. Preserve the task, candidate and original ten-wave budget. Other tasks keep the existing repair loop.

## 4. Complete

Freshly validate final verification inputs; reuse a passing result only through [the execution-owned verification cache](scripts/verification-cache.mjs) when exact candidate, command, relevant configuration, environment and freshly read required external inputs are unchanged. Otherwise run the required checks. Never reuse unknown external validity, a failed result or an uncommitted candidate. Require clean Standards and Spec, a clean Issue worktree at the reviewed candidate, and every consumed Manual prerequisite attestation to pass the reference's completion-time fresh read-back. Then read [implementation completion evidence](references/completion-evidence.md) only when adopting workflow-artifact compatibility or writing `implementation_complete`; it solely owns those payloads.

Write and read back exactly one repository-backed completion note under [implementation completion evidence](references/completion-evidence.md), then stop. Execution never integrates, removes a worktree, closes the Issue, pushes, or deploys. Subsequent `close-issue` entry uses direct human authority, a valid DAG Run Grant, or the same approved maintenance handoff described in Run preparation.
