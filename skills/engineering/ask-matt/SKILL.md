---
name: ask-matt
description: Route your situation to the appropriate skill or flow.
disable-model-invocation: true
---

# Ask Matt

Route the situation; do not perform the work.

## Build flow

This is the existing Spec/Run flow; its sole-producer and coordinator rules do not govern the independent GitLab batch trial below. Keep existing work on its recorded route.

1. Use `/grill-with-docs` for codebase design and accepted glossary/ADR decisions. Without a codebase, use `/grill-me`. Use `/publish-decision` only for a documentation-only ADR or glossary Tracker record.
2. Use `/to-spec` for every delivery Spec in this existing flow. It is the sole authority for Single-Issue and Multi-Issue classification, creates or reuses a Planning Seal, and publishes the next command.
3. Follow the published route: a Single-Issue Tracker Spec uses `/run-issue-workflow` as `/run-issue-workflow <Spec-ID>`; a Multi-Issue Tracker Spec uses `/to-tickets` as `/to-tickets <Spec-ID>`, then `/run-issue-workflow <Spec-ID>`; an approved Standalone Spec or explicit direct current-branch task uses `/implement`.
4. `/execute-issue <Issue-ID>` is the direct-human or authorized-coordinator leaf. Repository-backed Issues use a worktree and candidate; an explicit tracker-only single-note Issue does not. Planning prepares declared SQL prerequisites through `pre-execute-issue`; direct `/pre-execute-issue <Issue-ID>` ends after attestation read-back.
5. `/close-issue <Issue-ID>` validates and closes completion. Repository-backed closeout integrates and cleans its candidate; tracker-only closeout has no repository mutation. Close a Multi-Issue parent only after every child is closed and reachable.
6. Before push, use `/verify-target-before-push <target>`: local-ahead derives members from completion notes, while already-pushed work needs an explicit range. Both run aggregate review and verification once. A passing local-ahead `push_ready` receipt routes to `/push-target <target>` for one ordinary non-force push and reads the remote ref back.

Read [workflow route details](references/workflow-routes.md) only when selecting a coordinator, compatibility, prerequisite, closeout, aggregate-recovery, GitLab-adapter, or push branch. It owns those authority and recovery distinctions. `run-issue-workflow` owns Start/re-entry and its delivery host; a Spec-writing request ends at planning/publication.

Use `/tdd` for test-first behavior and `/code-review` for a fixed-point diff. Material security, data, concurrency, migration, contract, or cross-module risk requires `code-review` before integration.

## Independent GitLab batch trial

For a human-chosen new GitLab batch on Pi/macOS/Linux/WSL, recommend in-progress [gitlab-batch](../../in-progress/gitlab-batch/SKILL.md): plan, confirmed publish/start, one Orca worktree, bounded segments, whole-batch review and confirmed local integration. Single-Issue: no parent; multi-Issue: parent entry. Its extension's `/gitlab-batch-next <root-issue-ref>` switches sessions in the same terminal.

Explicit-resource trial only: no promoted packaging, old-framework calls, migration, replacement installer or push. Its instructions own loading and real-platform smoke limits; existing Specs/Runs keep their recorded owners.

## Other starting points

- Vague need → `/clarify-needs`; raw request → `/triage`; unknown-cause failure → `/diagnosing-bugs`.
- New software project → personal `/start-project`; unsettled large effort → `/wayfinder`. A clear map records `/grill-with-docs <map URL>`, `/to-spec <map URL>`, or stop; only `to-spec` classifies delivery and maps never start leaves.
- Runnable design question → `/prototype`; source comparison → `/research`; architecture → `/improve-codebase-architecture`; changed domain concepts → `/domain-modeling`; module/public-interface design → `/codebase-design`.
- Human-only dashboard, credential, migration, or cutover → `/wizard`; daily reflection → `/daily-journal`; Codex interruption → personal `/workflow-retro`.

## Independent controls

`/wiki`, `/remove-ron`, `/confirm-understanding`, `/explain-decision`, `/grilling`, `/to-questionnaire`, `/wait-what`, `/handoff`, `/teach`, `/writing-for-agents`, and `/resolving-merge-conflicts` keep their own narrow purposes and create no delivery authority. `/skill-gardener` audits the skill catalog without changing it. Use `/setup-matt-pocock-skills` when tracker, labels, or domain-doc layout is unconfigured.
