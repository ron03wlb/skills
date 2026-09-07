## What it does

`to-spec` turns settled scope, using an isolated planning lane only for accepted glossary or ADR writes, into an execution-ready Tracker [Spec](https://www.aihero.dev/ai-coding-dictionary/spec), then publishes one immutable downstream handoff.

It does not restart the interview, commit an operational plan, or create prospective contribution evidence for ordinary publication. It revalidates relevant source facts against the latest target and uses a minimal operation-scoped transaction so concurrent lanes do not share a planning checkout or block one another. Its concrete producer adapter derives the deterministic versioned operation identity from immutable repository, Spec, approved-publication, producer, and stage inputs; primary reservation temporarily uses only the proposed-Spec identity, then binds the reserved tracker identity before publication. The generic checkpoint store persists opaque IDs and never interprets producer semantics.

## When to reach for it

You invoke this by typing `/to-spec` — the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

Reach for it in the same task after [grill-with-docs](https://aihero.dev/skills-grill-with-docs) has settled one proposed Spec and target. Use [to-tickets](https://aihero.dev/skills-to-tickets) only when the published Spec says Multi-Issue.

## Prerequisites

- Tracker-only publication: settled scope, source identities, the existing tracker identity/version for a revision, and an explicit empty accepted-change list; no planning worktree or lane handoff.
- Actual glossary or ADR writes: the exact registered isolated lane and shared target writer.

The owner-local planning adapter enforces this distinction before publication. The tracker adapter uses the verified publication mode; unsupported atomic compare-and-set is never assumed.

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) configures the tracker and triage labels, and only diagnoses the separately installed publication adapters and Workflow checkpoint store. Missing adapters require their owning package's installation or binding entry. The document-write branch additionally consumes the shared Target mutation writer and active task's exact worktree handoff.

GitLab tracker-only publication has a reusable producer binding for primary reservation and revision of an existing Spec. It verifies project identity, source baseline, Issue versions and native note receipts, and reuses the existing checkpoint store. Its explicit repository configuration is separate from read-only setup diagnostics. It does not supply an automatic GitLab Run host or a writer for accepted glossary/ADR changes.

## One optimistic publication

Before publication or a Planning Seal write, `to-spec` re-reads only relevant glossary, ADR, and source facts. Compatible target movement binds the latest baseline. Relevant semantic drift returns the changed fact, the owning source, the smallest human action, preserved progress, and the same `/to-spec` retry after renewed confirmation.

Only accepted glossary or ADR changes enter a scoped Planning Seal write. Ordinary tracker publication uses a current transaction with Planning Seal, publication, and `handoff.completed` read-back; it creates no target operational-plan file or commit. Existing valid incomplete legacy and profile-v1 operations keep their frozen exact-resume behavior.


The installed Codex GitHub path records publication and handoff fields in structured comments, preserving the native comment identities and exact body digests. The producer still owns approval and checkpoint completion; installation or a readable comment alone never starts a Run.

Planning now prepares the exact operation inventory and read-only host capability evidence before one request for missing permission. Existing approvals carry forward. Declared SQL is handed to [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) before Run-ready, with its environment, committed content and human APPLIED/NO_OP outcome bound; no SQL is N/A. GitHub publication is described truthfully as immediate pre-read, write and exact post-read, rather than unsupported atomic CAS.

## It's working if

- Two tasks can plan and publish different Specs against one target without sharing a planning checkout.
- The published Planning Seal, operation-scoped transaction, tracker publication, and immutable handoff agree.
- A Single-Issue Spec ends in `/run-issue-workflow <Spec-ID>`; a Multi-Issue parent ends in `/to-tickets <Spec-ID>`.
- A recoverable failure names the owning source and same command to retry while any owned planning worktree remains intact.

## Where it fits

`to-spec` follows [grill-with-docs](https://aihero.dev/skills-grill-with-docs). It routes a Single-Issue Tracker Spec to the repository's Run coordinator and a Multi-Issue Tracker Spec to [to-tickets](https://aihero.dev/skills-to-tickets); approved Standalone Specs use [implement](https://aihero.dev/skills-implement). See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
