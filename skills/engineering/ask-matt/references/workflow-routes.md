# Workflow route details

Read this reference only after `ask-matt` has identified a delivery, recovery, or authority branch that needs more than the entry's route table. This file explains route boundaries; it grants no workflow authority and performs no routed work.

## Planning and publication

`/grill-with-docs` binds one proposed Spec and target to the current task's isolated planning worktree, records accepted vocabulary or ADRs there, and hands the same task to `/to-spec`. `to-spec` revalidates relevant Planning facts, creates or reuses the Planning Seal, publishes through its minimal operation-scoped transaction, and remains the sole classification authority.

For a Multi-Issue Tracker Spec, `to-tickets` consumes the completed `to-spec` handoff, runs its minimal operation-scoped transaction, publishes the Decomposition publication record and composite handoff, and returns `/run-issue-workflow <Spec-ID>`. Fresh `to-spec` and `to-tickets` operations create no target operational-plan checkpoint or prospective contribution record. Frozen legacy and profile-v1 producer operations keep their exact resume behavior and may invoke model-invoked `attest-target-contribution` only at their existing checkpoint stage; that helper needs no second confirmation and returns only the immutable record identity.

Published Tracker Specs route through the separately installed authorized coordinator, while direct human invocation of individual `execute-issue` and `close-issue` leaves remains available. The coordinator may use one valid DAG Run Grant, but it does not create or broaden leaf authority. Each leaf revalidates the Grant and keeps its implementation, closeout, tracker, worktree, push, deploy, prerequisite, and scope boundaries. The Codex-only coordinator is neither promoted nor packaged by this shared skill set.

## Prerequisites and execution

After a published Issue exists, `execute-issue` automatically invokes `pre-execute-issue` in the same authorized lane for one exact declared or unchanged-scope late prerequisite without a matching attestation. It creates or reuses the Issue worktree, invokes `prepare-prerequisite-artifact` to prepare Operator SQL when needed, presents it for human execution, and returns the content-bound v2 identity after fresh checks. Direct `/pre-execute-issue <Issue-ID>` stops after attestation read-back and never resumes implementation by itself. `prepare-prerequisite-artifact` is model-invoked, not a public route, accepts only an active prerequisite-preparation handoff, and never executes or attests external work.

Each clean completion note records required non-contract `workflowArtifacts` with source and purpose, or an empty list. Scope classification grants no coverage or verification authority. Expected plan paths are not an allowlist: execution follows necessary dependencies while unchanged Acceptance Criteria remain authoritative.

## Closeout and concurrency

`close-issue` alone acquires the repository close lease before the target mutation writer. It merges the exact candidate into the recorded Issue target branch, removes the clean worktree, closes the Issue, and resumes partial retries from observable state. Planning lanes and Issue worktrees may run concurrently; only a Planning Seal write and closeout hold the target mutation writer. The repository lease permits one closeout per Git common dir. A Multi-Issue parent closes only after every exact child is closed and reachable.

## Aggregate verification and push

For already-pushed work, the human gives `verify-target-before-push` an explicit merge request, pull request, or exact range. Across execution and aggregate review, only an exact-evidence **Confirmed code review finding** blocks; a **Code review advisory** stays visible without repair or waiver authority. A Confirmed aggregate finding defaults to a new human-created **Aggregate repair Issue** on the same target. Verification never creates or executes it, repairs product code, reopens an Issue, or edits a completion note.

If a frozen coverage failure finds eligible direct target contributions, show the complete exact record draft and obtain one human confirmation; then the workflow invokes `/attest-target-contribution`, discards the failed gate, and restarts Entry.

If frozen member derivation finds one eligible closed historical completion-evidence failure, prove one exact remedy, show the complete reconciliation draft, obtain human confirmation, invoke `/record-closed-issue-reconciliation`, and start fresh from Entry. If it finds one eligible historical command placeholder, prove the descendant Issue's exact full-suite command and a freshly frozen target pass; a current-only pass does not qualify. Then obtain human confirmation, invoke `/record-closed-issue-reconciliation`, and start fresh from Entry. No separate manual attestation command is required. No separate manual reconciliation command is required.

After current local-ahead `push_ready`, `push-target` fetches the unique configured upstream, rejects drift, performs one ordinary non-force push of the exact verified target, and reads the remote ref back. It never pulls, merges, rebases, force-pushes, retries, deploys, or pushes another ref.
