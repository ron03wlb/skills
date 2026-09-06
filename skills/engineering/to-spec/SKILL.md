---
name: to-spec
description: Publish one settled Spec with relevant baseline revalidation and an exact Run handoff; isolate accepted planning-document writes.
disable-model-invocation: true
---

# To Spec

Synthesize what is already settled; do not restart the interview. Use repository evidence and domain vocabulary, respect relevant ADRs, and use existing verification seams.

The configured issue tracker, triage labels, current Workflow checkpoint profiles, concrete publication adapters must already exist; otherwise stop and tell the human to invoke `/setup-matt-pocock-skills` or the repository's explicitly documented workflow setup. Accepted glossary or ADR writes additionally require the shared Target mutation writer. Never repair these authority seams here.

## 1. Consume the planning lane handoff

Consume the settled scope, repository and proposed or existing Tracker Spec identity, target, baseline, source facts, and an explicit accepted glossary or ADR change list. A tracker-only publication with an empty list needs no planning worktree or lane handoff. Revision mode must read the existing tracker identity and version; missing scope or conflicting source, version, or identity stops before mutation.

For accepted document writes, require the active settled-context task's **Spec workflow lane** handoff: one Codex task, one proposed Tracker Spec, one target, baseline, isolated planning worktree, and accepted glossary or ADR exact path or hunk with its content identity. Verify its registration and ownership. A missing required handoff is a Recoverable blocker; any mismatched bound identity or ownership claim is a Hard gate before mutation.

Read the referenced Spec, comments, partial-publication report, and matching producer transaction. Use `revision` for an existing Spec or `primary` for a new draft, preserving its exact identity through the transaction below.

Before Run-ready, follow [Run preparation](../../../docs/agents/run-preparation.md): reuse approvals, probe capabilities, and ask once for missing scope. Carry the inventory in publication/handoff. After publishing Issue identities, call the Skill tool with "pre-execute-issue" for SQL prerequisites before ready-state read-back; reuse its attested lane. No SQL is N/A. Preparation grants no SQL or deployment authority.

## 2. Draft the classified contract

`to-spec` is the sole authority for classifying a Tracker Spec:

- **Single-Issue**: one cohesive outcome fits one Issue worktree, execution context, reviewed candidate, and closeout.
- **Multi-Issue**: there are independently executable outcomes or blocking edges, or the work cannot safely fit one execution, review, and closeout cycle.

Size and risk alone never decide. Classify automatically from the settled requirements and repository evidence. Only material ambiguity that could change the route permits one blocking question with a recommendation; never default from uncertainty.

User Outcomes, at most three, provide context, never done authority.

- A **Single-Issue** Spec is the executable authority. Stable `AC-n` Acceptance Criteria are its sole done authority. Expected paths and symbols are source-grounded starting points, not an allowlist. Every Acceptance Criterion must be covered by at least one Implementation Plan step and one Verification item; every Implementation Plan step must cover at least one Acceptance Criterion. Use inline `Covers: AC-n`, compare the defined and covered ID sets before publication, and stop on missing, unexpected, or orphan mappings without creating a matrix or parser.
- A **Multi-Issue** parent is decomposition authority only. Keep the overall outcome, cross-Issue constraints, decomposition rationale, exclusions, and `/to-tickets` handoff. Do not put child Acceptance Criteria, Implementation Plans, touchpoints, or verification commands in the parent; `/to-tickets` gives each child its mapped executable contract.

The next command is authoritative: Single-Issue ends only with `/run-issue-workflow <Spec-ID>`; Multi-Issue ends only with `/to-tickets <Spec-ID>`. No Tracker Spec receives `/execute-issue` as its `to-spec` next command.

After classification, read only the matching template: `references/single-issue-template.md` or `references/multi-issue-template.md`. Do not load the unused shape's template. Generate the canonical tracker body in memory. Ordinary publication creates no target operational-plan file or commit and no prospective `direct_target_contribution:v1` record.

## 3. Revalidate the Planning baseline and select the Planning Seal

Immediately before publication or an accepted-decision Planning Seal write, call the planning adapter using `readPlanningBaseline` from `scripts/planning-entry.mjs` to re-read only the relevant glossary, ADR, and source facts against the latest target ref. Compare those facts with the settled source baseline and accepted content; do not rerun unrelated planning, review, generation, or repository-wide diagnostics.

- Compatible target movement binds the latest baseline for this lane and continues.
- Relevant semantic drift returns a Recoverable blocker containing the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-spec` retry after renewed human confirmation. Preserve the lane and do not merge the changed decision silently.
- A missing, ambiguous, unreadable, or conflicting target or required lane identity is a Hard gate.

If there is no accepted glossary or ADR delta, reuse the latest baseline as the Planning Seal and create no empty commit. If there is one exact accepted delta, acquire the shared Target mutation writer, re-read the target ref and relevant facts, and materialize only those accepted paths or hunks as one scoped Planning Seal. Read the target ref, commit diff, and lane content identities back before releasing the writer. If the writer is healthy but occupied, wait only within its configured bound; timeout, unknown ownership, or content drift returns a Recoverable blocker without lease stealing. Preserve unrelated staged, unstaged, untracked, target, and lane work.

Record the Planning Seal as `created`, `successor`, or `reused`. A publication retry re-reads its prior `planning_seal.read_back` receipt and current relevant facts. Missing or conflicting read-back is a Hard gate; compatible later movement keeps the exact receipt valid and binds the latest observed baseline without rewriting it.

## 4. Start or resume the Spec producer transaction

Before mutation, read [`references/spec-publication-interfaces.md`](references/spec-publication-interfaces.md) and use only its planning, checkpoint, tracker, and handoff adapters.

Resolve the tracker identity before transaction creation. In primary mode, call `deriveSpecReservationOperationIdentity` for the canonical repository and immutable proposed-Spec identity, call `tracker.reserve`, read one draft tracker identity and version token back, and reuse that same reservation on retry. In revision mode, require `tracker.read` of the existing Spec and its version token. Bind the read-back tracker identity to every later Spec-bound transaction and publication operation; caller correlation values never define authority.

First search the exact operation for an existing valid incomplete transaction-v1 or `to-spec@v1` receipt. That compatibility branch has frozen exact resume behavior: continue its existing plan, checkpoint commit, attestation, publication, and handoff stages at the first unsatisfied stage. Do not migrate, copy, rewrite, delete, or recreate it, and never use its behavior to shape a fresh operation.

A fresh ordinary publication uses `to-spec@v2`. Call `bindProducerCheckpointOperationIdentity` and `createProducerOperationCheckpoint` to bind one exact operation-scoped transaction and owner-derived receipt to repository, Spec, approved publication identity or hash, producer `to-spec`, stage `publication`, tracker identity, profile `v2`, target, latest baseline, Planning Seal, classification, and approved-scope identity. Its ordered stages are `planning_seal.read_back`, `publication.read_back`, and `handoff.completed`. Advance the first stage only after the Planning Seal adapter's exact receipt reads back.

The current profile has no target operational-plan stages. Preserve target dirt; only a ref, required lane, or adapter identity conflict that risks the wrong mutation is a Hard gate.

Only one exact matching transaction may resume at its first unsatisfied stage; re-read completed receipts and bound identities. A missing transaction with observed downstream mutation, duplicate operation, mismatched receipt, out-of-order stage, or ambiguous adapter result stops without duplicate publication or attribution of unrelated work.

## 5. Publish and complete the handoff

Publish only the tracker identity and version token already bound to the transaction. Primary mode populates its reserved draft; revision mode updates the same existing Spec. Neither mode creates a replacement Spec to recover a partial publication.

Use the probed publication mode: atomic compare-and-set only when supported; otherwise exact pre-read/write/read-back without an atomicity claim. Read back the exact body, classification, full Planning Seal SHA/state, latest observed baseline, target, selected template, `ready-for-agent` label, tracker identity, version token, publication identity, approved-scope identity, and next command. For Single-Issue verify every `AC-n` mapping; for Multi-Issue verify cross-Issue constraints and decomposition rationale exist and child-level executable sections remain absent. Only then append the exact `publication.read_back` receipt.

Append or reuse one immutable `handoff.completed` receipt binding the producer, Spec and tracker identity, target, Planning Seal, transaction identity, publication identity, classification, and approved-scope identity. Read back the handoff; advance the final stage with its immutable identity. A Single-Issue Spec ends only with `/run-issue-workflow <Spec-ID>`; a Multi-Issue Spec ends only with `/to-tickets <Spec-ID>`.

## 6. Disposition and recovery

A **Hard gate** protects mutation identity: wrong target, duplicate or misattributed publication, conflicting lane or tracker identity, or ambiguous durable state. Stop before the next mutation and report the exact conflict.

A **Recoverable blocker** names the owning source, observed evidence, smallest human action, preserved stages, and the same `/to-spec` retry. Use it for relevant semantic drift, unavailable human confirmation, bounded writer timeout, or a readable owning source that needs repair. Recovery re-enters this skill and resumes at the first exact unsatisfied stage; there is no generic repair, resume, or force command.

An **advisory** cannot affect authority or behavior. Keep it visible; it never blocks or becomes a waiver.

On partial failure, report existing identities, immutable receipts, and the first unsatisfied stage. Preserve any owned planning worktree until successful handoff read-back. This skill authorizes publication only, not execution, integration, push, deploy, rollback, or another lane's mutation.
