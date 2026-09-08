---
name: close-issue
description: Close one completed Issue or Multi-Issue Spec against its recorded local target. Use when a human invokes closeout directly or a valid DAG Run Grant authorizes the next close action.
---

# Close Issue

Close one completed Executable Issue through three ordered actions, or a Multi-Issue parent through parent-only closeout. Never repairs product code, invokes `execute-issue`, reruns Issue review or aggregate verification, pushes, or deploys.

## 1. Bind entry and owners

Read the Issue, parent/linked Spec, ordered history, blockers, recorded Issue target branch, and Git worktree registrations. Resolve identities from tracker and Git evidence; never infer a target from the current checkout or substitute another target. Read [operation identity](references/operation-identity.md) for the deterministic operation identity; `close-issue` is its closeout operation owner. Derive canonical common directory and owner-local [lease boundary](scripts/close-lease.mjs). The close owner is sole owner of the repository close lease before the target mutation writer for direct human and DAG entry; callers cannot pre-acquire or delegate either lease. Release the target writer before the repository lease after required read-back or a verified pre-mutation stop.

Entry is direct human invocation or a valid DAG Run Grant; `close-issue` never creates a DAG Run Grant. A coordinator proceeds without separate per-Issue approval. Approved bootstrap consumes only the continuing [human maintenance handoff](../../../docs/agents/references/approved-pre-run-workflow-maintenance.md). For coordinator entry, read back the Grant binding the exact Spec, Issue target, classification, scope, and—when Multi—the exact Decomposition record. A Single target is that Spec; an Executable child must occur in the mapping; when an Executable Issue is absent from the mapping, stop before mutation; a parent-only target is the bound Spec. Missing, stale, or mismatched Grant evidence stops before mutation. It never grants push, deploy, prerequisites, scope expansion, or ambiguity repair.

Read [close coordination](references/close-coordination.md) before any lease acquisition. It owns shared-lease scope, contention, reclaim, release, fencing, and their stop conditions.

## 2. Choose the exact close path

For an Executable Issue, read its latest valid `implementation_complete` note, require the current `operationIdentity` to bind repository, Spec, approved publication, `execute-issue`, `implementation`, and Issue, then read [completion evidence](references/completion-evidence.md). Require closed blockers, local candidate `C`, recorded target/worktree/topic/baseline, clean Standards and Spec, passing final verification, and a clean exact Issue worktree at `C`; an absent worktree is satisfied only when `C` is target-reachable. A dirty target stops without stash, reset, clean, or attribution. An already-closed Issue with unreachable `C` or a registered exact worktree is contradictory and stops.

For the exactly three ordered executable actions, read [executable closeout](references/executable-closeout.md). It owns all action-specific merge, conflict restoration/result, integration-check, worktree, tracker, retry, and recovery conditions. Perform only its idempotent order: merge exact `C` into the latest target without rebasing, refreshing, or editing; remove the exact clean registered Issue worktree; close and read back the Issue. Derive current progress from Git ancestry, worktree registration, and tracker state before every action; skip only already-satisfied actions.

For a Multi-Issue parent, read [parent closeout](references/parent-closeout.md). It owns its decomposition/child reachability proof. A parent never has an implementation candidate or Issue worktree; after its exact prerequisites read back, close and read back only the parent.

## 3. Disposition

Closeout results are Git ancestry, physical worktree absence and tracker read-back. A conflict, unexpected target movement, ambiguous tracker/Git result or semantic scope uncertainty preserves the lane and uses [workflow stop diagnosis](../../../docs/agents/references/workflow-stop-diagnosis.md). Completion remains valid unless evidence invalidates its candidate, review or verification; target movement, partial progress or aggregate-gate failure never reopens execution. This skill authorizes only local closeout.
