---
name: ask-matt
description: Route your situation to the appropriate skill or flow.
disable-model-invocation: true
---

# Ask Matt

Route the situation; do not perform the work.

## Build flow

1. Use `/grill-with-docs` for codebase design: reserve direction, architecture, DDL and migration costs; delegate routine details; adapter-allocate lanes. Without a codebase, use `/grill-me`.
2. Use `/to-spec`; tracker-only publication needs no worktree, while accepted document writes reuse the same registered lane and installed writer. It revalidates or writes the Planning Seal, is the sole authority that classifies a Tracker Spec as Single-Issue or Multi-Issue, and publishes the exact next command.
3. Follow that command: a Single-Issue Tracker Spec uses `/run-issue-workflow`; invoke it as `/run-issue-workflow <Spec-ID>`. A Multi-Issue Tracker Spec uses `/to-tickets`; invoke it as `/to-tickets <Spec-ID>` and then `/run-issue-workflow <Spec-ID>`. An approved Standalone Spec or explicit direct current-branch task uses `/implement`.
4. `/execute-issue <Issue-ID>` is the exact leaf for direct human or authorized-coordinator entry. An explicit tracker-only, single-note, no-candidate Issue skips worktree and candidate; others are repository-backed. Planning prepares known permissions and SQL prerequisites; `pre-execute-issue` returns its attestation and lane. Execution invokes it only for direct entry or newly discovered prerequisites. Direct `/pre-execute-issue <Issue-ID>` stops after attestation read-back.
5. `/close-issue <Issue-ID>` validates completion and closes it. Repository-backed closeout integrates and cleans the candidate; tracker-only closeout performs no repository mutation. Worktrees may run concurrently; target mutation stays serialized. Use it for a Multi-Issue parent after every child is closed and reachable.
6. Before push, invoke `/verify-target-before-push <target>`. Local-ahead derives members from completion notes; already-pushed work uses an explicit range. Both run aggregate review and verification once. A passing local-ahead run writes `push_ready`; then `/push-target <target>` performs one ordinary non-force push and reads the remote ref back.

`/run-issue-workflow` uses a stateless native step, preserves each Run’s Grant/package, and proves minimal runtime/cleanup capability before Start. Spec/batch re-entry reconstructs owning records, reconciles completed members without replay, and keeps Pause/Resume/Stop through revisioned domain settlement. It carries approved pre-Run maintenance through [its owner](../../../docs/agents/references/approved-pre-run-workflow-maintenance.md) without repeated leaf commands. Policy-bound Runs follow [model routing](../../personal/run-issue-workflow/references/model-routing.md). A Spec-writing request ends at planning/publication; consumer configuration stays static.

Read [workflow route details](references/workflow-routes.md) only when selecting among published coordinator, compatibility, prerequisite, closeout, aggregate-recovery, or push branches. That reference owns their authority and recovery distinctions.

Use `/tdd` directly for one test-first behavior and `/code-review` for a fixed-point diff. Material security, data, concurrency, migration, contract, or cross-module risk requires `code-review` before integration.

## Other starting points

- Vague needs or a solution-first idea → `/clarify-needs` for a user-confirmed goal, first-principles proposal comparison, and a Needs Summary; it converges when evidence is sufficient and preserves existing follow-up authorization.
- A new software project without a governing Spec → personal `/start-project` for discovery; it hands off through `/grill-with-docs` when a Planning handoff packet is still missing, then `/to-spec`.
- A personal daily reflection → `/daily-journal`; it keeps reflection voice-first and adds compact English practice after completion.
- Codex interruptions → personal `/workflow-retro`.
- Raw request → `/triage`; failure whose cause is unknown → `/diagnosing-bugs`.
- Unsettled large effort → `/wayfinder`; runnable design question → `/prototype`; source comparison requiring a cited repository note → `/research`.
- Architecture → `/improve-codebase-architecture`; changed domain concepts → `/domain-modeling`; module/public-interface design → `/codebase-design`. Existing-term lookups and routine fixes stay inline.
- A human-only dashboard, credential, migration, or cutover step → `/wizard`.

## Independent controls

- `/wiki` manages repository Wiki work; `/remove-ron` removes only the retired repository-local Ron footprint.
- `/confirm-understanding` calibrates a mental model against specified evidence; `/explain-decision` compares one live choice; `/grilling` pressure-tests unresolved material decisions within the agreed scope. `/clarify-needs` settles vague needs through first-principles comparison. These conversations create no new execution authority.
- `/to-questionnaire`, `/wait-what`, `/handoff`, and `/teach` handle collaboration. `/skill-gardener` audits the skill catalog without changing it; `/writing-for-agents` handles approved instruction, structure, or routing changes. Simple wording edits stay inline. `/resolving-merge-conflicts` handles an in-progress merge or rebase conflict.

Use `/setup-matt-pocock-skills` when tracker, labels, or domain-doc layout is not configured.

For missing GitLab publication adapters, distinguish the installed [Spec binding](../../personal/run-issue-workflow/references/gitlab-producer-adapters.md) from the [Decomposition binding](../../personal/run-issue-workflow/references/gitlab-to-tickets-adapters.md). Setup inspects them and, in its one approved plan, binds the project; the GitLab Run composition stays the Run entry's.
