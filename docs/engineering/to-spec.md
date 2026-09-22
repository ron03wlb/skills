## What it does

`to-spec` turns settled scope, using an isolated planning lane only for accepted glossary or ADR writes, into an execution-ready Tracker [Spec](https://www.aihero.dev/ai-coding-dictionary/spec), then publishes one immutable downstream handoff. A document-writing lane carries a stable opaque task identity and allocation issued by the planning adapter, never supplied by a human or interpreted as an Issue ID.

It does not restart the interview, commit an operational plan, or create prospective contribution evidence for ordinary publication. It revalidates relevant source facts against the latest target and uses a minimal operation-scoped transaction so concurrent lanes do not share a planning checkout or block one another. Its concrete producer adapter derives the deterministic versioned operation identity from immutable repository, Spec, approved-publication, producer, and stage inputs; only `to-spec` primary mode reserves a Tracker Spec, temporarily using the proposed-Spec identity before binding the reserved tracker identity for publication. The generic checkpoint store persists opaque IDs and never interprets producer semantics.

## When to reach for it

You invoke this by typing `/to-spec` — the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

Reach for it after [grill-with-docs](https://aihero.dev/skills-grill-with-docs) has settled one proposed Spec and target, or from a cleared [wayfinder](https://aihero.dev/skills-wayfinder) map whose delivery route says `/to-spec <map URL>`. Use [to-tickets](https://aihero.dev/skills-to-tickets) only when the published Spec says Multi-Issue.

## Prerequisites

- Tracker-only publication: a Planning handoff packet or a cleared Wayfinder map with settled scope, reachable decision sources, repository and target branch in Delivery context, the existing tracker identity/version for a revision, and an explicit empty accepted-change list; no planning worktree or lane handoff.
- Actual glossary or ADR writes: the exact registered isolated lane, its adapter-issued opaque task identity and allocation, and shared target writer, disposed by `to-spec` once the handoff reads back. A map that needs this branch returns to [grill-with-docs](https://aihero.dev/skills-grill-with-docs); a missing or mismatched allocation stops before publication and preserves the handoff for retry.

The owner-local planning adapter enforces this distinction before publication. The tracker adapter uses the verified publication mode; unsupported atomic compare-and-set is never assumed.

[setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) configures the tracker and triage labels, and only diagnoses the separately installed publication adapters and Workflow checkpoint store. Missing adapters require their owning package's installation or binding entry. The document-write branch additionally consumes the shared Target mutation writer and active adapter-issued lane handoff.

GitLab publication has a reusable producer binding for primary reservation and revision of an existing Spec. Its installed document writer registers the exact accepted handoff, checks original document content against the current target, and retains one candidate for interruption recovery. It shares the delivery writer lock, preserves unrelated work, and stops on overlapping edits. Tracker-only publication still creates no seal commit. Repository configuration remains separate from read-only setup diagnostics, and for a GitLab tracker the approved setup plan binds the project through its producer owner. With that binding present, the Run entry requires no separate GitLab capability: it composes the GitLab tracker sources for the configured project.

For GitLab publication failures, the installed producer binding distinguishes a recorded HTTP rejection from an unresolved write. Only an explicitly requested retry of an exact rejected operation may send another request. Legacy requests without recorded outcomes retain their evidence and require the publication owner to resolve the missing provider result.

## One optimistic publication

Inherited, human-confirmed, and delegated choices retain their actual bases and sources. A choice covered by the recorded delegation needs no individual or blanket reconfirmation. Exact non-ADR behavior, numeric defaults, exclusions, and verification assumptions carry into the Spec; a missing basis or changed scope returns only the affected decision to planning.

Before publication or a Planning Seal write, `to-spec` re-reads only relevant glossary, ADR, and source facts. Compatible target movement binds the latest baseline. Relevant semantic drift returns the changed fact, the owning source, the smallest human action, preserved progress, and the same `/to-spec` retry after renewed confirmation.

Only accepted glossary or ADR changes enter a scoped Planning Seal write. Ordinary tracker publication uses a current transaction with Planning Seal, publication, and `handoff.completed` read-back; it creates no target operational-plan file or commit. A Single-Issue whose complete accepted outcome is one non-empty Planning Seal documentation diff may explicitly declare that Seal, its sole parent, and every changed path as a documentation-only Seal candidate; a revision re-reads that existing evidence and creates no empty Seal. Existing valid incomplete legacy and profile-v1 operations keep their frozen exact-resume behavior.


The installed Codex GitHub path records publication and handoff fields in structured comments, preserving the native comment identities and exact body digests. The producer still owns approval and checkpoint completion; installation or a readable comment alone never starts a Run.

Planning now prepares the exact operation inventory and read-only host capability evidence before one request for missing permission. Existing approvals carry forward. Declared SQL is handed to [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) before Run-ready, with its environment, committed content and human APPLIED/NO_OP outcome bound; no SQL is N/A. GitHub publication is described truthfully as immediate pre-read, write and exact post-read, rather than unsupported atomic CAS.

The Spec preserves the shared SQL decision boundary: routine reversible queries and bindings are delegated; table DDL, data corrections, destructive or costly effects, and any migration cost require the missing exact approval. It carries approved SQL preparation and validation before dependent application implementation, while independent work stays eligible. Artifact preparation grants no database execution permission.

## It's working if

- Two adapter-issued task identities can plan and publish different Specs against one target without sharing a planning checkout.
- Accepted document writes verify the same opaque adapter allocation end to end; a human is never asked for it, and tracker reservation begins only in `to-spec`.
- The published Planning Seal, operation-scoped transaction, tracker publication, and immutable handoff agree.
- A Single-Issue Spec ends in `/run-issue-workflow <Spec-ID>`; a Multi-Issue parent ends in `/to-tickets <Spec-ID>`.
- A recoverable failure names the owning source and same command to retry while any owned planning worktree remains intact.
- A successful publication leaves no registered planning worktree behind; a failed one keeps it.

## Where it fits

`to-spec` follows [grill-with-docs](https://aihero.dev/skills-grill-with-docs), or a delivery-ready [wayfinder](https://aihero.dev/skills-wayfinder) map. It routes a Single-Issue Tracker Spec to the repository's Run coordinator and a Multi-Issue Tracker Spec to [to-tickets](https://aihero.dev/skills-to-tickets); approved Standalone Specs use [implement](https://aihero.dev/skills-implement). See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
