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
   - Multi-Issue Tracker Spec → `/to-tickets <Spec-ID>` to reconcile one stable decomposition and publish its completeness record, then `/execute-issue <Issue-ID>` for each dependency-ready child.
   - Repository adoption is separate: use `/setup-pre-execute-issue` once only when a consumer repository has a concrete Manual prerequisite. It is run-once setup, not a runtime step; without that concrete need it makes no change.
4. After the exact Issue is published, `/pre-execute-issue <Issue-ID>` is optional before `/execute-issue`; direct execution performs the same read-only discovery and stops if current prerequisite evidence is required.
5. After each clean execution, the human uses `/close-issue` with that Issue ID to integrate its exact candidate into the current local target and close it. Issue worktrees may run concurrently; one human serializes integration writes to the same target branch.
6. Before push, the human invokes `/verify-target-before-push <target>` once on the exact aggregate target. Push remains separate.

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
