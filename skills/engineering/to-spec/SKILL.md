---
name: to-spec
description: Publish one settled Spec with relevant baseline revalidation and an exact Run handoff; isolate accepted planning-document writes.
disable-model-invocation: true
---

# To Spec

Publish one settled scope; do not restart discovery. Use repository evidence, established domain vocabulary, and the highest practical verification seam.

The configured tracker and triage labels must exist; otherwise stop and tell the human to invoke `/setup-matt-pocock-skills`. Checkpoint profiles and concrete adapters require package installation. For GitLab publication, read [the producer binding](../../personal/run-issue-workflow/references/gitlab-producer-adapters.md), including its registered-document writer when the handoff has accepted changes. Setup cannot repair these seams. Accepted glossary or ADR writes require the shared Target mutation writer.

## 1. Consume the planning lane handoff

Consume the settled scope, repository, proposed or existing Tracker Spec identity, target, baseline, relevant source facts, and explicit accepted glossary or ADR changes. A tracker-only publication with an empty list needs no planning worktree or lane handoff. Revision mode calls `tracker.read` for the existing Spec and version token; missing or conflicting source, version, or identity stops before mutation.

Retain the handoff's inherited, human-confirmed, or delegated basis and source for each decision. A choice within the recorded delegation is settled without individual or blanket reconfirmation; a missing basis or changed scope returns only the affected decision to planning. Preserve exact non-ADR behavior, numeric defaults, exclusions, and verification assumptions in the Spec. Carry prior SQL approval and preparation-before-dependent-implementation ordering; design or artifact approval never becomes database execution authority.

For accepted document writes, require the active settled-context **Spec workflow lane**: one Codex task, proposed Tracker Spec, target, baseline, isolated planning worktree, and accepted glossary or ADR path or hunk with its content identity. Verify registration and ownership. A missing handoff is a Recoverable blocker; a mismatched bound identity or ownership claim is a Hard gate. Read the referenced Spec, comments, partial-publication report, and matching producer transaction.

Only before Run-ready, follow [Run preparation](../../../docs/agents/run-preparation.md): reuse approvals, probe capabilities, and ask once for missing scope. Carry its inventory into publication/handoff. After Issue identities publish, invoke `pre-execute-issue` only for declared SQL prerequisites; no SQL is N/A. Preparation grants neither SQL nor deployment authority.

## 2. Select the classified contract

`to-spec` is sole authority for **Single-Issue** and **Multi-Issue** classification. A Single-Issue outcome fits one worktree, reviewed candidate, and closeout. A Multi-Issue outcome has independent executable outcomes or blocker edges. Size and risk alone never decide. Resolve automatically from repository evidence and settled requirements; only material route ambiguity permits one blocking question with a recommendation.

User Outcomes (at most three) are context, never done authority. A Single-Issue Spec owns stable `AC-n` criteria: every Acceptance Criterion maps to an Implementation Plan step and Verification item, and every Implementation Plan step covers an Acceptance Criterion. Use inline `Covers: AC-n`; stop on missing, unexpected, or orphan mappings. A Multi-Issue parent owns only outcome, cross-Issue constraints, decomposition rationale, exclusions, and the `/to-tickets` handoff—never child acceptance, plan, touchpoints, or verification.

Single ends only with `/run-issue-workflow <Spec-ID>`; Multi ends only with `/to-tickets <Spec-ID>`. No Spec receives `/execute-issue` here. Read only the matching template: [`single-issue-template`](references/single-issue-template.md) or [`multi-issue-template`](references/multi-issue-template.md). Do not load the unused template. Generate the canonical body in memory. Ordinary publication creates no target operational-plan file or commit, or prospective `direct_target_contribution:v1` record.

## 3. Revalidate the Planning baseline and select the Planning Seal

Before the first `readPlanningBaseline`, read [spec publication interfaces](references/spec-publication-interfaces.md). In primary mode its tracker owner calls `tracker.reserve`, reads the draft tracker identity and version token, and must retry that reservation; revision mode calls `tracker.read` for the existing Spec and version token. Bind tracker identity to transaction and publication. Revision mode updates the same existing Spec; neither mode creates a replacement Spec. Then call `readPlanningBaseline` from `scripts/planning-entry.mjs` immediately before publication or an accepted-decision seal write to re-read only relevant glossary, ADR, and source facts at the latest target. Compatible target movement binds that latest baseline. Relevant semantic drift is a Recoverable blocker naming the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-spec` retry; never merge changed decisions silently. Missing, ambiguous, unreadable, or conflicting target or lane identity is a Hard gate.

With no accepted delta, reuse the latest baseline as Planning Seal and create no empty commit. With one exact accepted delta, acquire the shared writer, re-read target and relevant facts, materialize only that accepted content as one scoped seal, and read target, commit diff, and lane content identities back. Healthy contention is bounded without lease stealing; timeout, unknown ownership, or drift is a Recoverable blocker. Preserve unrelated work. Reuse a prior Planning Seal receipt only after its read-back and relevant current facts agree.

## 4. Start or resume the Spec producer transaction

The already-read [spec publication interfaces](references/spec-publication-interfaces.md) exclusively own current planning, checkpoint, tracker, and handoff adapter contracts; execute their ordered read-back stages and never reconstruct another adapter's result. The reference also owns the frozen `transaction-v1`/`to-spec@v1` compatibility path. One exact existing valid incomplete `transaction-v1`/`to-spec@v1` frozen transaction has an exact resume at its first unsatisfied stage; no migration, regeneration, rewrite, overwrite, or recreation. Only one exact matching transaction may resume at the first unsatisfied stage; a mismatch stops without duplicate attribution of unrelated state. The current profile is `to-spec@v2`; target dirt is preserved, and only identity conflicts that can misdirect mutation are Hard gates.

## 5. Publish and complete the handoff

Publish only the tracker identity and version token bound by transaction. Primary mode populates its reserved draft; revision mode updates the same existing Spec. Neither creates a replacement Spec. Use CAS only when actually proven; otherwise perform exact read/write/read-back without claiming CAS. Read back body, classification, Planning Seal/state, latest baseline, target, selected template, label, tracker identity/version, publication identity, approved scope, and next command. For Single verify all `AC-n` mappings; for Multi verify cross-Issue constraints and rationale while child executable sections remain absent. Then append/read back `publication.read_back`; append one immutable `handoff.completed` binding producer, Spec, target, Planning Seal, transaction identity, publication identity, classification, and approved-scope identity; read it back and advance the handoff.

## 6. Stop safely

A Hard gate protects target or durable attribution: wrong target, duplicate/misattributed publication, conflicting lane/tracker identity, or ambiguous durable state. A Recoverable blocker identifies its readable owner, evidence, smallest human action, preserved stages, and same retry. An advisory remains visible but never changes authority. On partial failure report the exact identities and first unsatisfied stage; preserve an owned planning worktree until successful handoff read-back. This skill authorizes publication only—not execution, integration, push, deployment, rollback, or another lane's mutation.
