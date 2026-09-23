---
name: to-spec
description: Publish one settled Spec with relevant baseline revalidation and an exact Run handoff; isolate accepted planning-document writes.
disable-model-invocation: true
---

# To Spec

Require configured tracker/triage labels and installed adapters; otherwise stop and tell the human to invoke `/setup-matt-pocock-skills`. GitLab publication reads [the producer binding](../../personal/run-issue-workflow/references/gitlab-producer-adapters.md). Accepted glossary or ADR writes require the shared Target mutation writer.

## 1. Consume a settled planning source

Consume either a Planning handoff packet or a cleared `wayfinder:map`. Both sources must provide settled scope, repository, proposed or existing Tracker Spec identity, target, relevant source facts, decision bases, and exact non-ADR behavior, exclusions, and verification assumptions. A tracker-only publication with an empty list of accepted changes needs no planning worktree or lane handoff. Missing or conflicting source, version, or identity stops before mutation.

A cleared map is a valid direct source only when every child decision is closed, **Not yet specified** is empty, **Delivery context** names the repository and target branch, each decision remains reachable through its resolution, and its **Delivery route** selects Tracker delivery with `/to-spec <map URL>`. A map with remaining fog or impact returns to Wayfinder; a missing reserved design decision, target, or accepted glossary/ADR change returns to `/grill-with-docs` for its Planning handoff packet. Never infer either branch, repair the map, or create a planning lane from a direct map.

Retain the handoff's inherited, human-confirmed, or delegated basis and source per decision. A choice within the recorded delegation needs no individual or blanket reconfirmation; a missing basis or changed scope returns only the affected decision to planning. Preserve exact non-ADR behavior, numeric defaults, exclusions, and verification assumptions in the Spec. Carry prior SQL approval and preparation-before-dependent-implementation ordering; design or artifact approval never becomes database execution authority.

For accepted document writes, require the active **Spec workflow lane**: one adapter-issued opaque `taskId` and allocation ID (never human input, not a Tracker ID, compared only for equality), proposed Tracker Spec, target, baseline, isolated planning worktree, and accepted glossary or ADR path or hunk with its content identity. Verify registration and ownership; a missing or mismatched allocation, bound identity, or ownership claim is a Hard gate, and a missing handoff is a Recoverable blocker. Read the referenced Spec, comments, partial-publication report, and producer transaction.

Before Run-ready, follow [Run preparation](../../../docs/agents/run-preparation.md): reuse approvals, probe capabilities, and ask once for missing scope; carry that inventory into publication/handoff. After Issue identities publish, invoke `pre-execute-issue` only for declared SQL prerequisites; no SQL is N/A. Preparation grants neither SQL nor deployment authority.

## 2. Select the classified contract

`to-spec` is sole authority for **Single-Issue** and **Multi-Issue** classification. A Single-Issue outcome fits one worktree, reviewed candidate, and closeout. A Multi-Issue outcome has independent executable outcomes or blocker edges. Size and risk alone never decide. From repository evidence and settled requirements, resolve automatically; only material route ambiguity permits one blocking question with a recommendation.

User Outcomes (at most three) are context, never done authority. A Single-Issue Spec owns stable `AC-n` criteria: every Acceptance Criterion maps to an Implementation Plan step and Verification item, and every Implementation Plan step covers an Acceptance Criterion. Use inline `Covers: AC-n`; stop on missing, unexpected, or orphan mappings. A Multi-Issue parent owns only outcome, cross-Issue constraints, decomposition rationale, exclusions, and the `/to-tickets` handoff—never child acceptance, plan, touchpoints, or verification.

Single ends only with `/run-issue-workflow <Spec-ID>`; Multi ends only with `/to-tickets <Spec-ID>`. No Spec receives `/execute-issue` here. Read only the matching template: [`single-issue-template`](references/single-issue-template.md) or [`multi-issue-template`](references/multi-issue-template.md). Do not load the unused template. Generate the canonical body in memory. Ordinary publication creates no target operational-plan file or commit, or prospective `direct_target_contribution:v1` record.

## 3. Revalidate the Planning baseline and select the Planning Seal

Before the first `readPlanningBaseline`, read [spec publication interfaces](references/spec-publication-interfaces.md). It owns reservation, revision, checkpoint, CAS, adapter receipt, and tracker-version detail; bind only its read-back identity to this transaction and publication. Then call `readPlanningBaseline` from `scripts/planning-entry.mjs` immediately before publication or a Seal write to re-read only relevant glossary, ADR, and source facts at the latest target. Compatible target movement binds the latest baseline; relevant semantic drift is a Recoverable blocker naming the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-spec` retry, while missing, ambiguous, unreadable, or conflicting target/lane identity is a Hard gate.

With no accepted delta, reuse the latest baseline as Planning Seal and create no empty commit. With one exact accepted delta, acquire the shared writer, re-read target and relevant facts, materialize only that accepted content as one scoped seal, and read target, commit diff, and lane content identities back. A Single-Issue whose entire accepted outcome is that non-empty Planning Seal's exact documentation diff may declare the Seal as a **documentation-only Seal candidate** in its canonical body. The declaration names the full Seal SHA, its sole parent, and every repository-relative documentation path; it also states that runtime, schema, API, deployment, Manual prerequisites, and other execution change are out of scope. A revision may add it only after re-reading the existing Seal and its exact parent-to-Seal diff; it writes no new empty Seal. Never infer this exception from file extension, Issue title, or a docs-only plan. Healthy contention is bounded without lease stealing; timeout, unknown ownership, or drift is a Recoverable blocker. Preserve unrelated work and reuse a prior Planning Seal receipt only after read-back and current facts agree.

## 4. Start or resume the Spec producer transaction

[Spec publication interfaces](references/spec-publication-interfaces.md) own current planning, checkpoint, tracker, handoff, and frozen-resume contracts. Execute their ordered read-backs without reconstructing another adapter result. Only one exact matching transaction may resume at its first unsatisfied stage; a mismatch stops without duplicate attribution of unrelated state, and an identity conflict that could misdirect mutation is a Hard gate. Target dirt stays preserved.

## 5. Publish and complete the handoff

Publish only the tracker identity bound by transaction; primary populates its reserved draft and revision updates the same Spec. The interface owns mutation mechanics and receipt fields. Read back the canonical body, classification, Planning Seal, target, template, publication identity, approved scope, and next command; verify Single AC mappings or Multi parent-only content. Append and read back `publication.read_back`, then immutable `handoff.completed`; dispose an accepted-document lane only after that handoff read-back.

## 6. Stop safely

A Hard gate stops wrong target, duplicate or misattributed publication before corrupting durable state. A Recoverable blocker names owner, evidence, preserved stages, and retry. An advisory remains visible and never blocks. On partial failure report exact identities and first unsatisfied stage; preserve the owned worktree until handoff read-back. This skill authorizes publication only.
