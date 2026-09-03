## What it does

`to-spec` turns the settled work in one isolated planning lane into an execution-ready Tracker [Spec](https://www.aihero.dev/ai-coding-dictionary/spec), then publishes one immutable downstream handoff.

It does not restart the interview, commit an operational plan, or create prospective contribution evidence for ordinary publication. It revalidates the lane against the latest target and uses a minimal operation-scoped transaction so concurrent lanes do not share a planning checkout or block one another. Fresh publication uses a deterministic versioned operation identity derived from immutable repository, Spec, approved-publication, producer, and stage inputs; primary reservation temporarily uses only the proposed-Spec identity, then binds the reserved tracker identity before publication.

## When to reach for it

You invoke this by typing `/to-spec` — the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

Reach for it in the same task after [grill-with-docs](https://aihero.dev/skills-grill-with-docs) has settled one proposed Spec and target. Use [to-tickets](https://aihero.dev/skills-to-tickets) only when the published Spec says Multi-Issue.

## Prerequisites

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker, triage labels, publication adapters, Workflow checkpoint store, and shared Target mutation writer. The active task must own the isolated planning worktree and its exact handoff.

## One optimistic publication

Before publication or a Planning Seal write, `to-spec` re-reads only relevant glossary, ADR, and source facts. Compatible target movement binds the latest baseline. Relevant semantic drift returns the changed fact, the owning source, the smallest human action, preserved progress, and the same `/to-spec` retry after renewed confirmation.

Only accepted glossary or ADR changes enter a scoped Planning Seal write. Ordinary tracker publication uses a current transaction with Planning Seal, publication, and `handoff.completed` read-back; it creates no target operational-plan file or commit. Existing valid incomplete legacy and profile-v1 operations keep their frozen exact-resume behavior.

## It's working if

- Two tasks can plan and publish different Specs against one target without sharing a planning checkout.
- The published Planning Seal, operation-scoped transaction, tracker publication, and immutable handoff agree.
- A Single-Issue Spec ends in `/run-issue-workflow <Spec-ID>`; a Multi-Issue parent ends in `/to-tickets <Spec-ID>`.
- A recoverable failure names the owning source and same command to retry while the task's planning worktree remains intact.

## Where it fits

`to-spec` follows [grill-with-docs](https://aihero.dev/skills-grill-with-docs). It routes a Single-Issue Tracker Spec to the repository's Run coordinator and a Multi-Issue Tracker Spec to [to-tickets](https://aihero.dev/skills-to-tickets); approved Standalone Specs use [implement](https://aihero.dev/skills-implement). See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
