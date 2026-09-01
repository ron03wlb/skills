---
name: ask-matt
description: Ask which skill or flow fits your situation. A concise router over the skills in this repo.
disable-model-invocation: true
---

# Ask Matt

Route the user's situation; do not perform the routed work.

## Build flow

1. Use `/grill-with-docs` to settle a codebase-backed idea and record durable vocabulary or ADRs. Without a codebase, use `/grill-me`.
2. Use `/to-spec` to synthesize the settled context and create or reuse its Planning Seal. `to-spec` is the sole authority that classifies a Tracker Spec as Single-Issue or Multi-Issue.
3. Follow the published command:
   - Single-Issue Tracker Spec → `/execute-issue <Spec-ID>`.
   - Multi-Issue Tracker Spec → `/to-tickets <Spec-ID>` to reconcile one Issue decomposition and publish its Decomposition publication record, then `/execute-issue <Issue-ID>` for each dependency-ready child.
4. After the exact Issue is published, `execute-issue` automatically invokes `pre-execute-issue` in the same authorized lane when one exact declared or unchanged-scope late prerequisite lacks a matching attestation. It creates or reuses the Issue worktree, invokes `prepare-prerequisite-artifact` when needed, presents the committed Operator SQL for human execution, and returns the content-bound v2 identity to the original lane after fresh checks. Direct `/pre-execute-issue <Issue-ID>` remains available but stops after attestation read-back and never resumes implementation by itself.
5. After each clean execution, its completion note declares `workflowArtifacts` as exact required non-contract paths with requirement sources and purposes, or an explicit empty list. This is scope classification only and never contribution coverage or verification authority. The human then uses `/close-issue` with that Issue ID. It merges the exact candidate into the recorded Issue target branch, removes the clean worktree, and closes the Issue; retries resume from observable Git, worktree, and tracker state. Issue worktrees may run concurrently while planning producers and closeout share one target mutation writer per target. Use the same command on a Multi-Issue parent only after every exact child is closed and reachable.
6. Before push, the human invokes `/verify-target-before-push <target>` in local-ahead mode to derive members from completion notes. For already-pushed work, the human supplies an explicit merge request, pull request, or exact range. Both modes run aggregate review and verification once; only local-ahead may emit push readiness. Across execution and aggregate review, only an exact-evidence **Confirmed code review finding** blocks; a **Code review advisory** remains visible without repair or waiver authority. A Confirmed aggregate finding defaults to a new human-created **Aggregate repair Issue** on the same target, while verification never creates or executes it, repairs product code, reopens an earlier Issue, or edits a completion note. If and only if a frozen coverage failure finds eligible direct target contributions, the workflow shows the complete exact record draft and waits for one human confirmation, invokes `/attest-target-contribution`, then discards the failed gate and starts fresh from Entry. If frozen member derivation instead finds one eligible closed historical completion-evidence failure, it proves one exact remedy, shows the complete reconciliation draft, waits for exact human confirmation, invokes `/record-closed-issue-reconciliation`, and starts fresh from Entry. If it finds one eligible historical command placeholder, it proves the descendant Issue's exact full-suite command and a freshly frozen target pass; a current-only pass does not qualify. It then obtains exact human confirmation, invokes the same `/record-closed-issue-reconciliation` helper, and starts fresh from Entry with the mapped command in the aggregate set. No separate manual attestation command is required. No separate manual reconciliation command is required. Push remains separate.
7. After a passing local-ahead `/verify-target-before-push` writes current `push_ready`, the human invokes `/push-target <target>`. It fetches the unique configured upstream, rejects any drift, performs one ordinary non-force push of the exact verified target, and reads the exact remote ref back. It never pulls, merges, rebases, force-pushes, retries, deploys, or pushes another ref.

This manual leaf route remains the default public flow. A separately installed authorized coordinator route may use one valid **DAG Run Grant** to invoke the same `execute-issue` and `close-issue` leaves without per-Issue approval. The coordinator does not create or broaden leaf authority: each leaf revalidates the Grant and keeps its existing implementation, closeout, tracker, worktree, push, deploy, prerequisite, and scope boundaries. The Codex-only coordinator is neither promoted nor packaged by this shared skill set.

`prepare-prerequisite-artifact` is model-invoked and not a public route. It accepts only an active prerequisite-preparation handoff that already binds one exact Issue artifact and repository adapter, builds a fail-closed Operator SQL candidate, and returns content identity without external execution or attestation.

A Tracker Spec, including a local-file tracker record, uses `/execute-issue`; an approved Standalone Spec or explicit direct current-branch task uses `/implement`. Expected plan paths are not an allowlist: execution follows necessary dependencies while unchanged Acceptance Criteria remain authoritative.

Use `/tdd` directly for one test-first behavior and `/code-review` for a fixed-point diff. Material security, data, concurrency, migration, contract, or cross-module risk requires `code-review` before integration even when review was not explicitly requested.

## Other starting points

- Raw incoming bugs or requests → `/triage`; a hard reproduced failure → `/diagnosing-bugs`.
- A huge effort whose route is still unknown → `/wayfinder`, then return to `/to-spec` after decisions settle.
- A runnable design question → `/prototype`; source research → `/research`.
- Architecture health → `/improve-codebase-architecture`; terminology → `/domain-modeling`; module seams → `/codebase-design`.

## Independent controls

- `/wiki` edits and reviews the repository Wiki independently of Issue delivery.
- `/remove-ron` removes only the retired repository-local Ron footprint.
- `/confirm-understanding` calibrates a mental model against named evidence.
- `/explain-decision` compares one live choice without changing workflow state; `/grilling` pressure-tests a plan or decision without writing docs.
- `/handoff` moves context to a fresh session; `/teach` runs a stateful learning workspace; `/writing-great-skills` is the skill-authoring reference.
- `/resolving-merge-conflicts` handles an already in-progress merge or rebase conflict.

Use `/setup-matt-pocock-skills` once when tracker, labels, or domain-doc layout is not configured.
