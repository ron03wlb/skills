---
name: ask-matt
description: Ask which skill or flow fits your situation. A concise router over the skills in this repo.
disable-model-invocation: true
---

# Ask Matt

Route the user's situation; do not perform the routed work.

## Build flow

1. Use `/grill-with-docs` to settle a codebase-backed idea with an isolated planning lane for accepted glossary or ADR writes; without a codebase, use `/grill-me`.
2. Use `/to-spec` with that settled scope; tracker-only publication needs no worktree, while accepted document writes reuse the same lane. It revalidates or writes the Planning Seal, is the sole authority that classifies a Tracker Spec as Single-Issue or Multi-Issue, and publishes the exact next command.
3. Follow that command: a Single-Issue Tracker Spec uses `/run-issue-workflow`; invoke it as `/run-issue-workflow <Spec-ID>`. A Multi-Issue Tracker Spec uses `/to-tickets`; invoke it as `/to-tickets <Spec-ID>` and then `/run-issue-workflow <Spec-ID>`. An approved Standalone Spec or explicit direct current-branch task uses `/implement`.
4. `/execute-issue <Issue-ID>` is the exact implementation leaf for direct human invocation or an authorized coordinator. It automatically invokes `pre-execute-issue` in the same lane when one exact declared Manual prerequisite lacks a valid attestation. Direct `/pre-execute-issue <Issue-ID>` stops after attestation read-back.
5. `/close-issue <Issue-ID>` integrates the exact candidate into the recorded Issue target branch, removes its clean worktree, and closes it. Issue worktrees may run concurrently; target mutation stays serialized. Use the same command for a Multi-Issue parent only after every exact child is closed and reachable.
6. Before push, invoke `/verify-target-before-push <target>`. Local-ahead derives members from completion notes; already-pushed work uses an explicit range. Both run aggregate review and verification once. A passing local-ahead run writes `push_ready`; then `/push-target <target>` performs one ordinary non-force push and reads the remote ref back.

The public Issue leaves are `/execute-issue` and `/close-issue`; the model-only prerequisite helper is not a public route.

Read [workflow route details](references/workflow-routes.md) only when selecting among published coordinator, compatibility, prerequisite, closeout, aggregate-recovery, or push branches. That reference owns their authority and recovery distinctions.

Use `/tdd` directly for one test-first behavior and `/code-review` for a fixed-point diff. Material security, data, concurrency, migration, contract, or cross-module risk requires `code-review` before integration.

## Other starting points

- A new software project without a governing Spec → personal `/start-project` for discovery; it hands off through `/grill-with-docs` when a Planning handoff packet is still missing, then `/to-spec`.
- A personal daily reflection → `/daily-journal`; it keeps reflection voice-first and adds compact English practice after completion.
- Raw request → `/triage`; failure whose cause is unknown → `/diagnosing-bugs`.
- Unsettled large effort → `/wayfinder`; runnable design question → `/prototype`; source comparison requiring a cited repository note → `/research`.
- Architecture → `/improve-codebase-architecture`; changed domain concepts → `/domain-modeling`; module/public-interface design → `/codebase-design`. Existing-term lookups and routine fixes stay inline.
- A human-only dashboard, credential, migration, or cutover step → `/wizard`.

## Independent controls

- `/wiki` manages repository Wiki work; `/remove-ron` removes only the retired repository-local Ron footprint.
- `/confirm-understanding` calibrates a mental model; `/explain-decision` compares one live choice; `/grilling` pressure-tests a plan without changing workflow state.
- `/to-questionnaire`, `/wait-what`, `/handoff`, `/teach`, handle their named collaboration need. `/writing-for-agents` handles substantive instruction, structure, or routing changes; simple wording edits stay inline. `/resolving-merge-conflicts` handles an in-progress merge or rebase conflict.

Use `/setup-matt-pocock-skills` when tracker, labels, or domain-doc layout is not configured.
